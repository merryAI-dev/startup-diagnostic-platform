#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { collection, getDocs, getFirestore } from "firebase/firestore";

function parseArgs(argv) {
  const options = {
    collections: ["applications", "officeHourApplications"],
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--collections") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("--collections requires comma-separated collection names");
      }
      const parsed = next
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      if (parsed.length === 0) {
        throw new Error("--collections requires at least one collection name");
      }
      options.collections = parsed;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printUsage() {
  console.log("Report createdByUid coverage in Firestore collections");
  console.log("");
  console.log("Usage:");
  console.log("  node scripts/report-created-by-uid.mjs [--collections a,b,c]");
  console.log("");
  console.log("Default collections:");
  console.log("  applications, officeHourApplications");
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

function loadEnvFile(projectRoot) {
  const envPath = path.join(projectRoot, ".env");
  if (!fs.existsSync(envPath)) return {};
  const raw = fs.readFileSync(envPath, "utf8");
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const currentFilePath = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(currentFilePath), "..");
  const env = {
    ...loadEnvFile(projectRoot),
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

  console.log(`Signing in as ${adminEmail} ...`);
  await signInWithEmailAndPassword(auth, adminEmail, adminPassword);

  for (const collectionName of options.collections) {
    const snap = await getDocs(collection(db, collectionName));
    let withCreatedByUid = 0;
    let missingCreatedByUid = 0;

    snap.forEach((item) => {
      const value = item.data().createdByUid;
      if (typeof value === "string" && value.trim().length > 0) {
        withCreatedByUid += 1;
      } else {
        missingCreatedByUid += 1;
      }
    });

    console.log(
      `${collectionName}: total=${snap.size}, withCreatedByUid=${withCreatedByUid}, missingCreatedByUid=${missingCreatedByUid}`
    );
  }
}

main().catch((error) => {
  console.error("Report failed:", error?.message ?? error);
  process.exit(1);
});
