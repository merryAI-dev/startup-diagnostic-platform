#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  collection,
  deleteField,
  doc,
  getDocs,
  getFirestore,
  limit,
  query,
  serverTimestamp,
  startAfter,
  where,
  writeBatch,
} from "firebase/firestore";

const COLLECTION_APPLICATIONS = "officeHourApplications";
const BATCH_COMMIT_SIZE = 400;
const READ_PAGE_SIZE = 500;

function parseArgs(argv) {
  const result = {
    commit: false,
    limit: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--commit") {
      result.commit = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }
    if (arg === "--limit") {
      const next = argv[index + 1];
      const parsed = Number(next);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error("--limit requires a positive integer");
      }
      result.limit = parsed;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return result;
}

function printUsage() {
  console.log("Backfill pendingConsultantIds for officeHourApplications");
  console.log("");
  console.log("Usage:");
  console.log("  node scripts/backfill-pending-consultant-ids.mjs [--limit N] [--commit]");
  console.log("");
  console.log("Options:");
  console.log("  --limit N   Process only first N pending/review records");
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
  if (!fs.existsSync(envFilePath)) return {};
  const raw = fs.readFileSync(envFilePath, "utf8");
  const env = {};

  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) return;
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

function parseRegularSlotId(slotId) {
  const normalized = normalizeString(slotId);
  if (!normalized.startsWith("regular_")) {
    return null;
  }

  const [type, programId, consultantId, dateKey, timeToken] = normalized.split("_");
  if (!type || !programId || !consultantId || !dateKey || !timeToken) {
    return null;
  }

  return { consultantId };
}

async function fetchPendingLikeApplications(db) {
  const docs = [];
  let cursor = null;

  while (true) {
    const constraints = [
      where("status", "in", ["pending", "review"]),
      limit(READ_PAGE_SIZE),
    ];
    if (cursor) constraints.push(startAfter(cursor));

    const snap = await getDocs(query(collection(db, COLLECTION_APPLICATIONS), ...constraints));
    if (snap.empty) break;

    docs.push(...snap.docs);
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < READ_PAGE_SIZE) break;
  }

  return docs;
}

function getExplicitPendingIds(data) {
  return Array.isArray(data?.pendingConsultantIds)
    ? Array.from(
        new Set(
          data.pendingConsultantIds
            .map((value) => normalizeString(value))
            .filter(Boolean)
        )
      )
    : [];
}

function deriveLegacyPendingIds(data) {
  const reservedConsultantId = normalizeString(data?.reservedConsultantId);
  if (reservedConsultantId) {
    return [reservedConsultantId];
  }

  const slotInfo = parseRegularSlotId(data?.officeHourSlotId);
  const consultantId = normalizeString(slotInfo?.consultantId);
  return consultantId ? [consultantId] : [];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const currentFilePath = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(currentFilePath), "..");
  const envFromFile = loadEnvFile(path.join(projectRoot, ".env"));
  const env = { ...envFromFile, ...process.env };

  const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };

  const requiredConfigKeys = [
    "apiKey",
    "authDomain",
    "projectId",
    "storageBucket",
    "messagingSenderId",
    "appId",
  ];

  const missingConfig = requiredConfigKeys.filter((key) => !firebaseConfig[key]);
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

  console.log("[2/4] Loading pending/review applications ...");
  const applicationDocs = await fetchPendingLikeApplications(db);
  const limitedDocs = options.limit ? applicationDocs.slice(0, options.limit) : applicationDocs;

  const fillTargets = [];
  const cleanupTargets = [];
  const unresolvedIds = [];

  for (const applicationDoc of limitedDocs) {
    const data = applicationDoc.data() || {};
    const explicitPendingIds = getExplicitPendingIds(data);
    const hasLegacyFields =
      normalizeString(data.reservedConsultantId) !== "" ||
      normalizeString(data.officeHourSlotId) !== "";

    if (explicitPendingIds.length > 0) {
      if (hasLegacyFields) {
        cleanupTargets.push({
          applicationId: applicationDoc.id,
          pendingConsultantIds: explicitPendingIds,
        });
      }
      continue;
    }

    const derivedPendingIds = deriveLegacyPendingIds(data);
    if (derivedPendingIds.length === 0) {
      unresolvedIds.push(applicationDoc.id);
      continue;
    }

    fillTargets.push({
      applicationId: applicationDoc.id,
      pendingConsultantIds: derivedPendingIds,
    });
  }

  console.log(
    `Found ${applicationDocs.length} pending/review docs, ${fillTargets.length} backfill targets, ${cleanupTargets.length} cleanup targets, ${unresolvedIds.length} unresolved`
  );

  if (unresolvedIds.length > 0) {
    console.log("[3/4] Unresolved application IDs:");
    unresolvedIds.forEach((applicationId) => console.log(`  - ${applicationId}`));
  }

  if (!options.commit) {
    console.log("[4/4] Dry run complete. Re-run with --commit to apply updates.");
    return;
  }

  const operations = [...fillTargets, ...cleanupTargets];
  console.log(`[4/4] Applying ${operations.length} updates ...`);

  for (let index = 0; index < operations.length; index += BATCH_COMMIT_SIZE) {
    const batch = writeBatch(db);
    operations.slice(index, index + BATCH_COMMIT_SIZE).forEach((operation) => {
      batch.update(doc(db, COLLECTION_APPLICATIONS, operation.applicationId), {
        pendingConsultantIds: operation.pendingConsultantIds,
        reservedConsultantId: deleteField(),
        officeHourSlotId: deleteField(),
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  }

  console.log("Backfill complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
