import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import admin from "firebase-admin";

function parseArgs() {
  const args = {};
  for (const token of process.argv.slice(2)) {
    const [key, rawValue] = token.split("=", 2);
    if (!rawValue) continue;
    const normalizedKey = key.replace(/^--/, "");
    args[normalizedKey] = rawValue;
  }
  return args;
}

const { serviceAccount, projectId, email, role = "admin" } = parseArgs();

if (!projectId || !email) {
  console.error(
    "Usage: node scripts/create-admin-profile.mjs --projectId=your-project --email=admin@example.com [--serviceAccount=./sa.json] [--role=admin]"
  );
  process.exit(1);
}

async function findDefaultServiceAccount() {
  const entries = await readdir(process.cwd(), { withFileTypes: true });
  const candidate = entries.find(
    (entry) =>
      entry.isFile() &&
      (entry.name.toLowerCase().startsWith("mysc-bmp-") ||
        entry.name.toLowerCase().startsWith("startup-acceleration"))
      && entry.name.toLowerCase().endsWith(".json")
  );
  if (!candidate) return null;
  return resolve(process.cwd(), candidate.name);
}

async function resolveServiceAccountPath(specified) {
  if (specified) {
    return resolve(process.cwd(), specified);
  }

  const fallback = await findDefaultServiceAccount();
  if (!fallback) {
    throw new Error(
      "서비스 계정 키 파일을 찾을 수 없습니다. --serviceAccount=./경로/파일.json을 지정하거나 이름이 'mysc-bmp-*.json'인 파일을 repo 루트에 두세요."
    );
  }
  return fallback;
}

async function main() {
  const accountPath = await resolveServiceAccountPath(serviceAccount);
  const accountJson = JSON.parse(await readFile(accountPath, "utf8"));

  admin.initializeApp({
    credential: admin.credential.cert(accountJson),
    projectId,
  });

  const auth = admin.auth();
  const firestore = admin.firestore();

  const firebaseUser = await auth.getUserByEmail(email);
  const uid = firebaseUser.uid;

  const profileRef = firestore.collection("profiles").doc(uid);
  await profileRef.set(
    {
      role,
      requestedRole: role,
      active: true,
      email: firebaseUser.email ?? null,
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      approvedByUid: uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log(`Admin profile created for ${email} (uid=${uid})`);
}

main().catch((error) => {
  console.error("Failed to create admin profile:", error);
  process.exitCode = 1;
});
