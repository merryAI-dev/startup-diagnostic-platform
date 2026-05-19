#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  limit,
  query,
  serverTimestamp,
  startAfter,
  writeBatch,
} from "firebase/firestore";

const COLLECTION_AGENDAS = "agendas";
const COLLECTION_CONSULTANTS = "consultants";
const READ_PAGE_SIZE = 500;
const BATCH_COMMIT_SIZE = 400;

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
  console.log("Backfill agenda.priorityConsultantIds from consultant.agendaIds");
  console.log("");
  console.log("Usage:");
  console.log("  node scripts/backfill-agenda-priority-consultant-ids.mjs [--limit N] [--commit]");
  console.log("");
  console.log("Options:");
  console.log("  --limit N   Process only first N agendas that need updates");
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

async function fetchCollectionDocs(db, collectionName) {
  const docs = [];
  let cursor = null;

  while (true) {
    const constraints = [limit(READ_PAGE_SIZE)];
    if (cursor) constraints.push(startAfter(cursor));

    const snap = await getDocs(query(collection(db, collectionName), ...constraints));
    if (snap.empty) break;

    docs.push(...snap.docs);
    cursor = snap.docs[snap.docs.length - 1];

    if (snap.docs.length < READ_PAGE_SIZE) break;
  }

  return docs;
}

function normalizeString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => normalizeString(item))
        .filter(Boolean),
    ),
  );
}

function compareConsultantsByName(left, right) {
  const nameCompare = normalizeString(left?.name).localeCompare(normalizeString(right?.name), "ko-KR");
  if (nameCompare !== 0) return nameCompare;
  return normalizeString(left?.id).localeCompare(normalizeString(right?.id));
}

function buildNextPriorityConsultantIds(agendaId, currentPriorityIds, consultants) {
  const mappedConsultants = consultants.filter((consultant) => {
    return normalizeStringArray(consultant.agendaIds).includes(agendaId);
  });
  const mappedConsultantIds = new Set(mappedConsultants.map((consultant) => consultant.id));

  const preservedPriorityIds = currentPriorityIds.filter((consultantId) => mappedConsultantIds.has(consultantId));
  const appendedConsultants = mappedConsultants
    .filter((consultant) => !preservedPriorityIds.includes(consultant.id))
    .sort(compareConsultantsByName);

  return [
    ...preservedPriorityIds,
    ...appendedConsultants.map((consultant) => consultant.id),
  ];
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

  console.log(`[1/5] Signing in as ${adminEmail} ...`);
  await signInWithEmailAndPassword(auth, adminEmail, adminPassword);

  console.log("[2/5] Loading agendas and consultants ...");
  const [agendaDocs, consultantDocs] = await Promise.all([
    fetchCollectionDocs(db, COLLECTION_AGENDAS),
    fetchCollectionDocs(db, COLLECTION_CONSULTANTS),
  ]);

  const consultants = consultantDocs.map((snap) => ({ id: snap.id, ...snap.data() }));
  const updates = agendaDocs
    .map((snap) => {
      const data = snap.data();
      const currentPriorityIds = normalizeStringArray(data.priorityConsultantIds);
      const nextPriorityIds = buildNextPriorityConsultantIds(snap.id, currentPriorityIds, consultants);

      if (JSON.stringify(currentPriorityIds) === JSON.stringify(nextPriorityIds)) {
        return null;
      }

      return {
        id: snap.id,
        name: normalizeString(data.name),
        currentPriorityIds,
        nextPriorityIds,
      };
    })
    .filter(Boolean);

  const targetUpdates = options.limit ? updates.slice(0, options.limit) : updates;

  console.log(
    `Found ${agendaDocs.length} agendas, ${consultantDocs.length} consultants, ${updates.length} agendas need updates`
  );
  console.log(`[3/5] Previewing ${targetUpdates.length} target agendas ...`);

  const preview = Object.fromEntries(
    targetUpdates.map((item) => [
      item.id,
      {
        agendaName: item.name,
        currentPriorityConsultantIds: item.currentPriorityIds,
        nextPriorityConsultantIds: item.nextPriorityIds,
      },
    ])
  );
  console.log(JSON.stringify(preview, null, 2));

  if (!options.commit) {
    console.log("");
    console.log("Dry-run complete. Add --commit to apply updates.");
    return;
  }

  console.log("[4/5] Applying updates ...");
  let batch = writeBatch(db);
  let inBatch = 0;
  let totalUpdated = 0;

  for (const item of targetUpdates) {
    batch.update(doc(db, COLLECTION_AGENDAS, item.id), {
      priorityConsultantIds: item.nextPriorityIds,
      updatedAt: serverTimestamp(),
    });
    inBatch += 1;

    if (inBatch >= BATCH_COMMIT_SIZE) {
      await batch.commit();
      totalUpdated += inBatch;
      console.log(`- committed ${totalUpdated}/${targetUpdates.length}`);
      batch = writeBatch(db);
      inBatch = 0;
    }
  }

  if (inBatch > 0) {
    await batch.commit();
    totalUpdated += inBatch;
  }

  console.log(`[5/5] Done. Updated ${totalUpdated} agendas.`);
}

main().catch((error) => {
  console.error("Backfill failed:", error?.message ?? error);
  process.exit(1);
});
