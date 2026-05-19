#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  writeBatch,
} from "firebase/firestore";

const regularOfficeHourPolicy = createRequire(import.meta.url)(
  "../functions/regular-office-hour-policy.cjs",
);

const COLLECTION_CONSULTANTS = "consultants";
const BATCH_COMMIT_SIZE = 450;

function parseArgs(argv) {
  const options = {
    commit: false,
    help: false,
    limit: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--commit") {
      options.commit = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--limit") {
      const next = argv[index + 1];
      const parsed = Number(next);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error("--limit requires a positive integer");
      }
      options.limit = parsed;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printUsage() {
  console.log("Backfill legacy consultant monthlyAvailability to per-date schema");
  console.log("");
  console.log("Usage:");
  console.log("  node scripts/backfill-consultant-monthly-availability.mjs [--limit N] [--commit]");
  console.log("");
  console.log("Options:");
  console.log("  --limit N   Process only first N consultant docs");
  console.log("  --commit    Execute updates (default is dry-run)");
  console.log("  --help      Show this help");
  console.log("");
  console.log("Required env:");
  console.log("  VITE_FIREBASE_API_KEY");
  console.log("  VITE_FIREBASE_AUTH_DOMAIN");
  console.log("  VITE_FIREBASE_PROJECT_ID");
  console.log("  VITE_FIREBASE_STORAGE_BUCKET");
  console.log("  VITE_FIREBASE_MESSAGING_SENDER_ID");
  console.log("  VITE_FIREBASE_APP_ID");
  console.log("  MIGRATION_ADMIN_EMAIL");
  console.log("  MIGRATION_ADMIN_PASSWORD");
}

function loadEnvFile(envFilePath) {
  if (!fs.existsSync(envFilePath)) {
    return {};
  }
  const raw = fs.readFileSync(envFilePath, "utf8");
  const env = {};

  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) {
      return;
    }
    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  });

  return env;
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBoolean(value) {
  return value === true;
}

function normalizeTimeValue(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "";
  }
  const [hourRaw, minuteRaw] = normalized.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return normalized;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeWeekDay(value) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized >= 0 && normalized <= 6 ? normalized : null;
}

function buildDefaultSlots() {
  return Array.from({ length: 9 }, (_, index) => {
    const startHour = 9 + index;
    const endHour = startHour + 1;
    return {
      start: `${String(startHour).padStart(2, "0")}:00`,
      end: `${String(endHour).padStart(2, "0")}:00`,
    };
  });
}

function toDayEntry(entry) {
  const dateKey = normalizeString(entry?.dateKey);
  const dayOfWeek = normalizeWeekDay(entry?.dayOfWeek);
  const slots = Array.isArray(entry?.slots) ? entry.slots : [];
  const slotMap = new Map(
    slots
      .map((slot) => {
        const normalizedStart = normalizeTimeValue(slot?.start);
        if (!normalizedStart) {
          return null;
        }
        return [normalizedStart, {
          available: normalizeBoolean(slot?.available),
          end: normalizeTimeValue(slot?.end),
        }];
      })
      .filter((item) => item !== null),
  );

  const normalizedSlots = buildDefaultSlots().map((slot) => {
    const matched = slotMap.get(slot.start);
    const end = matched?.end || slot.end;
    return {
      start: slot.start,
      end,
      available: matched?.available || false,
    };
  });

  if (regularOfficeHourPolicy.isDateKey(dateKey)) {
    const parsed = regularOfficeHourPolicy.parseDateKey(dateKey);
    if (!parsed) {
      return null;
    }
    return {
      dayOfWeek: parsed.getDay(),
      dateKey,
      slots: normalizedSlots,
    };
  }

  if (dayOfWeek === null) {
    return null;
  }

  return {
    dayOfWeek,
    slots: normalizedSlots,
  };
}

function normalizeMonthEntryToDateKey(entry, dateKey) {
  const normalizedSlotMap = new Map();
  buildDefaultSlots().forEach((slot) => {
    const matched = entry.slots.find((item) => normalizeTimeValue(item.start) === slot.start);
    normalizedSlotMap.set(slot.start, {
      start: slot.start,
      end: matched?.end || slot.end,
      available: normalizeBoolean(matched?.available),
    });
  });

  return {
    dayOfWeek: regularOfficeHourPolicy.parseDateKey(dateKey)?.getDay() ?? 0,
    dateKey,
    slots: Array.from(normalizedSlotMap.values()),
  };
}

function normalizeMonthAvailabilityForBackfill(monthKey, raw, scopeDayNumbers) {
  const scopeDaySet = new Set(
    Array.isArray(scopeDayNumbers)
      ? scopeDayNumbers
          .map((day) => Number(day))
          .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      : []
  );
  const regularOfficeDateKeys = regularOfficeHourPolicy.getRegularOfficeHourDateKeysForDayNumbers(
    monthKey,
    Array.from(scopeDaySet),
  );

  if (!Array.isArray(raw)) {
    return {
      changed: true,
      next: regularOfficeDateKeys.map((dateKey) => {
        const parsed = regularOfficeHourPolicy.parseDateKey(dateKey);
        return {
          dayOfWeek: parsed ? parsed.getDay() : 0,
          dateKey,
          slots: buildDefaultSlots().map((slot) => ({
            start: slot.start,
            end: slot.end,
            available: false,
          })),
        };
      }),
      reason: "non-array",
    };
  }

  const normalizedDateSpecific = new Map();
  const legacyByWeekday = new Map();
  let hasNonScopeEntry = false;
  let hasLegacyWeekday = false;

  raw.forEach((item) => {
    const normalized = toDayEntry(item);
    if (!normalized) {
      hasNonScopeEntry = true;
      return;
    }
    if (normalized.dateKey) {
      if (!regularOfficeDateKeys.includes(normalized.dateKey)) {
        hasNonScopeEntry = true;
        return;
      }
      normalizedDateSpecific.set(normalized.dateKey, normalized);
      return;
    }
    if (!scopeDaySet.has(normalized.dayOfWeek)) {
      hasNonScopeEntry = true;
      return;
    }
    legacyByWeekday.set(normalized.dayOfWeek, normalized);
    hasLegacyWeekday = true;
  });

  const legacyDatesExpanded = new Map();
  regularOfficeDateKeys.forEach((dateKey) => {
    const parsed = regularOfficeHourPolicy.parseDateKey(dateKey);
    if (!parsed) {
      return;
    }
    const weekday = parsed.getDay();
    const exactDateEntry = normalizedDateSpecific.get(dateKey);
    const sourceEntry = exactDateEntry || (hasLegacyWeekday ? legacyByWeekday.get(weekday) : null);
    if (!sourceEntry) {
      legacyDatesExpanded.set(dateKey, {
        dayOfWeek: parsed.getDay(),
        dateKey,
        slots: buildDefaultSlots().map((slot) => ({
          start: slot.start,
          end: slot.end,
          available: false,
        })),
      });
      return;
    }
    legacyDatesExpanded.set(dateKey, normalizeMonthEntryToDateKey(sourceEntry, dateKey));
  });

  const nextArray = Array.from(legacyDatesExpanded.values()).sort((a, b) => {
    if (!a?.dateKey || !b?.dateKey) return 0;
    return a.dateKey.localeCompare(b.dateKey);
  });

  const needsUpdate = hasNonScopeEntry || JSON.stringify(raw) !== JSON.stringify(nextArray);
  return {
    changed: needsUpdate,
    next: nextArray,
    reason: needsUpdate ? "rebased" : "no-op",
  };
}

function getScopeDayNumbersByConsultant(consultantScope) {
  const normalizedScope =
    consultantScope === "external" ? "external" : consultantScope === "internal" ? "internal" : "all";

  if (normalizedScope === "external") {
    return regularOfficeHourPolicy.getScopeDayNumbers("external");
  }
  if (normalizedScope === "internal") {
    return regularOfficeHourPolicy.getScopeDayNumbers("internal");
  }
  return regularOfficeHourPolicy.getScopeDayNumbers();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const currentFilePath = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(currentFilePath), "..");
  const env = {
    ...loadEnvFile(path.join(projectRoot, ".env")),
    ...process.env,
  };
  const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
  const missingConfig = Object.entries(firebaseConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missingConfig.length > 0) {
    throw new Error(`Missing Firebase config keys: ${missingConfig.join(", ")}`);
  }

  const adminEmail = env.MIGRATION_ADMIN_EMAIL;
  const adminPassword = env.MIGRATION_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error("Missing MIGRATION_ADMIN_EMAIL or MIGRATION_ADMIN_PASSWORD in env");
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  console.log(`[1/4] Signing in as ${adminEmail} ...`);
  await signInWithEmailAndPassword(auth, adminEmail, adminPassword);

  console.log("[2/4] Loading consultants ...");
  const consultantCollection = collection(db, COLLECTION_CONSULTANTS);
  const consultantSnapshot = await getDocs(consultantCollection);
  const docs = options.limit
    ? consultantSnapshot.docs.slice(0, options.limit)
    : consultantSnapshot.docs;

  console.log(`[3/4] Inspecting ${docs.length} consultant documents ...`);
  const updates = [];
  const malformedRows = [];
  const noopRows = [];

  docs.forEach((snap) => {
    const data = snap.data() || {};
    const scopeDayNumbers = getScopeDayNumbersByConsultant(data?.scope);
    const original = data.monthlyAvailability ?? {};
    const next = {};
    if (!original || typeof original !== "object" || Array.isArray(original)) {
      if (original) {
        malformedRows.push({
          consultantId: snap.id,
          email: normalizeString(data.email),
          reason: "non-object-monthlyAvailability",
        });
      }
      return;
    }

    let changed = false;
    let hasLegacy = false;
    const monthEntries = Object.entries(original);

    monthEntries.forEach(([monthKey, monthValue]) => {
      if (!regularOfficeHourPolicy.isMonthKey(monthKey)) {
        return;
      }
      const result = normalizeMonthAvailabilityForBackfill(monthKey, monthValue, scopeDayNumbers);
      if (!result) {
        return;
      }

      next[monthKey] = result.next;
      if (result.changed) {
        changed = true;
      }
      hasLegacy = hasLegacy || result.changed;
    });

    if (changed) {
      updates.push({
        consultantId: snap.id,
        email: normalizeString(data.email) || "(no-email)",
        consultantName: normalizeString(data.name) || "(unknown)",
        before: original,
        after: next,
      });
    } else if (hasLegacy === false) {
      noopRows.push({
        consultantId: snap.id,
        email: normalizeString(data.email),
      });
    }
  });

  console.log(
    `Found ${docs.length} consultant docs, ${updates.length} backfill targets, ${malformedRows.length} malformed docs`
  );
  if (malformedRows.length > 0) {
    console.log("Malformed:");
    malformedRows.slice(0, 20).forEach((item) => {
      console.log(`  - ${item.consultantId} (${item.email}) ${item.reason}`);
    });
  }

  if (updates.length === 0) {
    console.log("No migration needed.");
    return;
  }

  if (!options.commit) {
    console.log("[dry-run] No writes executed. Add --commit to apply changes.");
    return;
  }

  console.log("[4/4] Applying updates ...");
  let batch = writeBatch(db);
  let pending = 0;
  const updatedConsultants = [];

  for (const update of updates) {
    const consultantRef = doc(db, COLLECTION_CONSULTANTS, update.consultantId);
    batch.set(consultantRef, { monthlyAvailability: update.after }, { merge: true });

    pending += 1;
    updatedConsultants.push(update.consultantId);
    if (pending >= BATCH_COMMIT_SIZE) {
      await batch.commit();
      batch = writeBatch(db);
      pending = 0;
    }
  }

  if (pending > 0) {
    await batch.commit();
  }

  console.log(`Committed ${updates.length} consultant updates.`);
  updatedConsultants.slice(0, 20).forEach((consultantId) => {
    console.log(`  - ${consultantId}`);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : `${error}`);
  process.exitCode = 1;
});
