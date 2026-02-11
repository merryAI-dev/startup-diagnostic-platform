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
  where,
  writeBatch,
} from "firebase/firestore";

const COLLECTION_APPLICATIONS = "officeHourApplications";
const COLLECTION_PROFILES = "profiles";
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
  console.log("Backfill createdByUid for officeHourApplications");
  console.log("");
  console.log("Usage:");
  console.log("  node scripts/backfill-office-hour-created-by-uid.mjs [--limit N] [--commit]");
  console.log("");
  console.log("Options:");
  console.log("  --limit N   Process only first N missing records");
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

function normalizeEmail(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

async function resolveProfileUidByEmail(db, email) {
  const candidates = Array.from(new Set([email, email.toLowerCase()]));

  for (const candidate of candidates) {
    if (!candidate) continue;
    const snap = await getDocs(
      query(
        collection(db, COLLECTION_PROFILES),
        where("email", "==", candidate),
        limit(2)
      )
    );

    if (snap.size === 1) {
      return { type: "resolved", uid: snap.docs[0].id };
    }
    if (snap.size > 1) {
      return { type: "ambiguous" };
    }
  }

  return { type: "not_found" };
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
    throw new Error(
      "Missing MIGRATION_ADMIN_EMAIL or MIGRATION_ADMIN_PASSWORD in env"
    );
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  console.log(`[1/5] Signing in as ${adminEmail} ...`);
  await signInWithEmailAndPassword(auth, adminEmail, adminPassword);

  console.log("[2/5] Loading application documents ...");
  const appDocs = await fetchCollectionDocs(db, COLLECTION_APPLICATIONS);

  const missingCreatedByUidDocs = appDocs.filter((snap) => {
    const data = snap.data();
    return !(typeof data.createdByUid === "string" && data.createdByUid.trim().length > 0);
  });

  const targetDocs = options.limit
    ? missingCreatedByUidDocs.slice(0, options.limit)
    : missingCreatedByUidDocs;

  console.log(
    `Found ${appDocs.length} total, ${missingCreatedByUidDocs.length} missing createdByUid`
  );
  console.log(`[3/5] Resolving uid by applicantEmail for ${targetDocs.length} records ...`);

  const resolved = [];
  const unresolvedMissingEmail = [];
  const unresolvedNotFound = [];
  const unresolvedAmbiguous = [];

  for (const appDoc of targetDocs) {
    const data = appDoc.data();
    const email = normalizeEmail(data.applicantEmail);
    if (!email) {
      unresolvedMissingEmail.push(appDoc.id);
      continue;
    }

    const result = await resolveProfileUidByEmail(db, email);
    if (result.type === "resolved") {
      resolved.push({
        applicationId: appDoc.id,
        uid: result.uid,
        email,
      });
      continue;
    }
    if (result.type === "ambiguous") {
      unresolvedAmbiguous.push({ applicationId: appDoc.id, email });
      continue;
    }
    unresolvedNotFound.push({ applicationId: appDoc.id, email });
  }

  console.log(`[4/5] Summary`);
  console.log(`- target: ${targetDocs.length}`);
  console.log(`- resolvable: ${resolved.length}`);
  console.log(`- missing email: ${unresolvedMissingEmail.length}`);
  console.log(`- profile not found: ${unresolvedNotFound.length}`);
  console.log(`- ambiguous profile: ${unresolvedAmbiguous.length}`);

  if (resolved.length > 0) {
    console.log("");
    console.log("Sample resolvable rows:");
    resolved.slice(0, 10).forEach((item) => {
      console.log(`- ${item.applicationId} <= ${item.uid} (${item.email})`);
    });
  }

  if (!options.commit) {
    console.log("");
    console.log("Dry-run complete. Add --commit to apply updates.");
    return;
  }

  console.log("[5/5] Applying updates ...");

  let batch = writeBatch(db);
  let inBatch = 0;
  let totalUpdated = 0;

  for (const item of resolved) {
    const ref = doc(db, COLLECTION_APPLICATIONS, item.applicationId);
    batch.update(ref, {
      createdByUid: item.uid,
      updatedAt: serverTimestamp(),
    });
    inBatch += 1;

    if (inBatch >= BATCH_COMMIT_SIZE) {
      await batch.commit();
      totalUpdated += inBatch;
      console.log(`- committed ${totalUpdated}/${resolved.length}`);
      batch = writeBatch(db);
      inBatch = 0;
    }
  }

  if (inBatch > 0) {
    await batch.commit();
    totalUpdated += inBatch;
  }

  console.log(`Done. Updated ${totalUpdated} documents.`);
}

main().catch((error) => {
  console.error("Migration failed:", error?.message ?? error);
  process.exit(1);
});
