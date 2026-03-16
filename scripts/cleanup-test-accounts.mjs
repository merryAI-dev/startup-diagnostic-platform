#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_EMAIL_PREFIX = "e2e-";
const SAMPLE_LIMIT_DEFAULT = 20;
const FIRESTORE_PAGE_SIZE = 200;
const AUTH_PAGE_SIZE = 1000;
const TOKEN_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const FIREBASE_TOOLS_CLIENT_ID = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const FIREBASE_TOOLS_CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi";

const SCANNED_COLLECTIONS = [
  "profiles",
  "users",
  "consultants",
  "signupRequests",
  "consents",
  "companies",
  "officeHourApplications",
  "officeHourSlots",
  "reports",
  "notifications",
];

const DELETE_COLLECTION_ORDER = [
  "notifications",
  "reports",
  "officeHourApplications",
  "consents",
  "signupRequests",
  "consultants",
  "users",
  "profiles",
  "companies",
];

const ACTIVE_APPLICATION_STATUSES = new Set(["pending", "review", "confirmed", "completed"]);

function parseArgs(argv) {
  const options = {
    commit: false,
    help: false,
    sample: SAMPLE_LIMIT_DEFAULT,
    emailPrefix: DEFAULT_EMAIL_PREFIX,
    emails: [],
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

    if (arg === "--sample") {
      const next = argv[index + 1];
      const parsed = Number(next);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error("--sample requires a non-negative integer");
      }
      options.sample = parsed;
      index += 1;
      continue;
    }

    if (arg === "--email-prefix") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("--email-prefix requires a value");
      }
      options.emailPrefix = next.trim();
      index += 1;
      continue;
    }

    if (arg === "--emails") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("--emails requires a comma-separated value");
      }
      options.emails = next
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printUsage() {
  console.log("Cleanup preview test accounts from Firebase Auth and linked Firestore data");
  console.log("");
  console.log("Usage:");
  console.log("  node scripts/cleanup-test-accounts.mjs [--email-prefix e2e-] [--emails a@b.com,c@d.com] [--sample N] [--commit]");
  console.log("");
  console.log("Options:");
  console.log(`  --email-prefix value  Select Auth users whose email starts with this prefix (default ${DEFAULT_EMAIL_PREFIX})`);
  console.log("  --emails a,b,c        Select exact Auth user emails in addition to the prefix filter");
  console.log(`  --sample N            Print up to N sample paths per target type (default ${SAMPLE_LIMIT_DEFAULT})`);
  console.log("  --commit              Execute Firestore/Auth deletes (default is dry-run)");
  console.log("  --help                Show this help");
  console.log("");
  console.log("Required service account env (one of):");
  console.log("  FIREBASE_SERVICE_ACCOUNT_PATH");
  console.log("  FIREBASE_SERVICE_ACCOUNT_JSON");
  console.log("  GOOGLE_APPLICATION_CREDENTIALS");
  console.log("");
  console.log("Also required:");
  console.log("  VITE_FIREBASE_PROJECT_ID (or project_id inside the service account JSON)");
  console.log("");
  console.log("Notes:");
  console.log("  - This script bypasses Firestore security rules.");
  console.log("  - Dry-run is the default. Review output first, then rerun with --commit.");
  console.log("  - Company documents are deleted recursively, including subcollections.");
  console.log("  - Deleted test applications release their linked officeHourSlots back to open when safe.");
  console.log("  - If service account env is absent, the script falls back to the current 'firebase login' token.");
  console.log("  - If you already deleted Auth accounts manually, use cleanup-orphaned-auth-data.mjs for leftovers.");
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, "utf8");
  const result = {};

  raw.split(/\r?\n/u).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) return;
    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  });

  return result;
}

function loadProjectEnv(projectRoot) {
  return {
    ...parseEnvFile(path.join(projectRoot, ".env")),
    ...parseEnvFile(path.join(projectRoot, ".env.local")),
    ...process.env,
  };
}

function normalizePrivateKey(value) {
  if (typeof value !== "string" || value.trim().length === 0) return "";
  return value.replace(/\\n/g, "\n");
}

function loadServiceAccount(env) {
  const inlineJson = env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inlineJson) {
    const parsed = JSON.parse(inlineJson);
    return {
      ...parsed,
      private_key: normalizePrivateKey(parsed.private_key),
    };
  }

  const filePath =
    env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!filePath) {
    throw new Error(
      "Missing FIREBASE_SERVICE_ACCOUNT_PATH, FIREBASE_SERVICE_ACCOUNT_JSON, or GOOGLE_APPLICATION_CREDENTIALS",
    );
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  return {
    ...parsed,
    private_key: normalizePrivateKey(parsed.private_key),
  };
}

function loadFirebaseToolsTokens() {
  const configPath = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
  if (!fs.existsSync(configPath)) return null;

  const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const tokens = parsed?.tokens;
  if (!tokens?.access_token && !tokens?.refresh_token) {
    return null;
  }

  return {
    accessToken: typeof tokens.access_token === "string" ? tokens.access_token : null,
    refreshToken: typeof tokens.refresh_token === "string" ? tokens.refresh_token : null,
    expiresAt: Number(tokens.expires_at ?? 0),
  };
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createJwtAssertion(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: TOKEN_SCOPE,
      aud: serviceAccount.token_uri || "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsigned)
    .sign(serviceAccount.private_key, "base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return `${unsigned}.${signature}`;
}

function createAccessTokenProvider(serviceAccount) {
  let cache = {
    accessToken: null,
    expiresAt: 0,
  };

  return async function getAccessToken(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cache.accessToken && cache.expiresAt - 60_000 > now) {
      return cache.accessToken;
    }

    const assertion = createJwtAssertion(serviceAccount);
    const response = await fetch(serviceAccount.token_uri || "https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to obtain access token (${response.status}): ${text}`);
    }

    const json = await response.json();
    cache = {
      accessToken: json.access_token,
      expiresAt: now + Number(json.expires_in ?? 3600) * 1000,
    };
    return cache.accessToken;
  };
}

function createFirebaseToolsAccessTokenProvider(firebaseToolsTokens) {
  let cache = {
    accessToken: firebaseToolsTokens.accessToken,
    expiresAt: firebaseToolsTokens.expiresAt || 0,
  };

  return async function getAccessToken(forceRefresh = false) {
    const now = Date.now();
    if (
      !forceRefresh &&
      cache.accessToken &&
      cache.expiresAt - 60_000 > now
    ) {
      return cache.accessToken;
    }

    if (!firebaseToolsTokens.refreshToken) {
      if (cache.accessToken) {
        return cache.accessToken;
      }
      throw new Error("firebase login token is missing or expired. Run 'firebase login' again.");
    }

    const response = await fetch("https://www.googleapis.com/oauth2/v3/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        refresh_token: firebaseToolsTokens.refreshToken,
        client_id: FIREBASE_TOOLS_CLIENT_ID,
        client_secret: FIREBASE_TOOLS_CLIENT_SECRET,
        grant_type: "refresh_token",
        scope: TOKEN_SCOPE,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to refresh firebase login token (${response.status}): ${text}`);
    }

    const json = await response.json();
    cache = {
      accessToken: json.access_token,
      expiresAt: now + Number(json.expires_in ?? 3600) * 1000,
    };
    return cache.accessToken;
  };
}

async function fetchJson(url, getAccessToken, init = {}, allowNotFound = false) {
  const token = await getAccessToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (allowNotFound && response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google API request failed (${response.status}): ${text}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function decodeValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("referenceValue" in value) return value.referenceValue;
  if ("arrayValue" in value) {
    return (value.arrayValue?.values ?? []).map((item) => decodeValue(item));
  }
  if ("mapValue" in value) {
    return decodeFields(value.mapValue?.fields ?? {});
  }
  return null;
}

function decodeFields(fields = {}) {
  const result = {};
  for (const [key, value] of Object.entries(fields)) {
    result[key] = decodeValue(value);
  }
  return result;
}

function decodeDocument(document) {
  return {
    name: document.name,
    id: document.name.split("/").pop(),
    path: document.name.split("/documents/")[1] ?? document.name,
    fields: decodeFields(document.fields ?? {}),
  };
}

async function listTopLevelDocuments(projectId, collectionId, getAccessToken) {
  const rootPath = `projects/${projectId}/databases/(default)/documents`;
  const baseUrl = `https://firestore.googleapis.com/v1/${rootPath}/${collectionId}`;
  const items = [];
  let pageToken = null;

  while (true) {
    const url = new URL(baseUrl);
    url.searchParams.set("pageSize", String(FIRESTORE_PAGE_SIZE));
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const json = await fetchJson(url.toString(), getAccessToken, {}, true);
    if (!json) return items;

    items.push(...(json.documents ?? []).map((item) => decodeDocument(item)));
    pageToken = json.nextPageToken ?? null;
    if (!pageToken) break;
  }

  return items;
}

async function listCollectionIds(documentName, getAccessToken) {
  const url = `https://firestore.googleapis.com/v1/${documentName}:listCollectionIds`;
  let pageToken = null;
  const collectionIds = [];

  while (true) {
    const json = await fetchJson(
      url,
      getAccessToken,
      {
        method: "POST",
        body: JSON.stringify({
          pageSize: FIRESTORE_PAGE_SIZE,
          ...(pageToken ? { pageToken } : {}),
        }),
      },
      true,
    );
    if (!json) return collectionIds;

    collectionIds.push(...(json.collectionIds ?? []));
    pageToken = json.nextPageToken ?? null;
    if (!pageToken) break;
  }

  return collectionIds;
}

async function listChildDocuments(documentName, collectionId, getAccessToken) {
  const baseUrl = `https://firestore.googleapis.com/v1/${documentName}/${collectionId}`;
  const items = [];
  let pageToken = null;

  while (true) {
    const url = new URL(baseUrl);
    url.searchParams.set("pageSize", String(FIRESTORE_PAGE_SIZE));
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const json = await fetchJson(url.toString(), getAccessToken, {}, true);
    if (!json) return items;

    items.push(...(json.documents ?? []).map((item) => decodeDocument(item)));
    pageToken = json.nextPageToken ?? null;
    if (!pageToken) break;
  }

  return items;
}

async function deleteDocument(documentName, getAccessToken) {
  const url = `https://firestore.googleapis.com/v1/${documentName}`;
  await fetchJson(url, getAccessToken, { method: "DELETE" }, true);
}

async function recursiveDeleteDocument(documentName, getAccessToken, counters) {
  const collectionIds = await listCollectionIds(documentName, getAccessToken);

  for (const collectionId of collectionIds) {
    const childDocs = await listChildDocuments(documentName, collectionId, getAccessToken);
    for (const childDoc of childDocs) {
      await recursiveDeleteDocument(childDoc.name, getAccessToken, counters);
    }
  }

  await deleteDocument(documentName, getAccessToken);
  counters.deletedDocuments += 1;
}

function encodeFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => encodeFirestoreValue(item)),
      },
    };
  }
  if (typeof value === "object") {
    const fields = {};
    Object.entries(value).forEach(([key, entryValue]) => {
      fields[key] = encodeFirestoreValue(entryValue);
    });
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

async function patchDocument(documentName, getAccessToken, fields) {
  const url = new URL(`https://firestore.googleapis.com/v1/${documentName}`);
  Object.keys(fields).forEach((fieldPath) => {
    url.searchParams.append("updateMask.fieldPaths", fieldPath);
  });

  const body = {
    fields: Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, encodeFirestoreValue(value)]),
    ),
  };

  await fetchJson(url.toString(), getAccessToken, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

async function listAllAuthUsers(projectId, getAccessToken) {
  const users = [];
  let nextPageToken = null;

  while (true) {
    const url = new URL(
      `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchGet`,
    );
    url.searchParams.set("maxResults", String(AUTH_PAGE_SIZE));
    if (nextPageToken) {
      url.searchParams.set("nextPageToken", nextPageToken);
    }

    const json = await fetchJson(url.toString(), getAccessToken);
    (json.users ?? []).forEach((user) => {
      const uid = typeof user.localId === "string" ? user.localId.trim() : "";
      const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
      if (!uid || !email) return;
      users.push({
        uid,
        email,
        disabled: Boolean(user.disabled),
      });
    });

    nextPageToken = json.nextPageToken ?? null;
    if (!nextPageToken) break;
  }

  return users;
}

async function deleteAuthUser(projectId, uid, getAccessToken) {
  const url = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:delete`;
  await fetchJson(url, getAccessToken, {
    method: "POST",
    body: JSON.stringify({ localId: uid }),
  });
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStatus(value) {
  return normalizeString(value).toLowerCase();
}

function selectTargetUsers(allUsers, options) {
  const exactEmails = new Set(options.emails);
  const prefix = options.emailPrefix.trim().toLowerCase();

  return allUsers.filter((user) => {
    if (exactEmails.has(user.email)) return true;
    return prefix.length > 0 && user.email.startsWith(prefix);
  });
}

function buildDeletionPlan(topLevelDocs, targetUsers) {
  const targetUids = new Set(targetUsers.map((user) => user.uid));
  const targetEmails = new Set(targetUsers.map((user) => user.email));
  const companyIds = new Set();

  (topLevelDocs.profiles ?? []).forEach((doc) => {
    if (!targetUids.has(doc.id)) return;
    const companyId = normalizeString(doc.fields.companyId);
    if (companyId) companyIds.add(companyId);
  });

  (topLevelDocs.signupRequests ?? []).forEach((doc) => {
    if (!targetUids.has(doc.id)) return;
    const companyId = normalizeString(doc.fields.companyId);
    if (companyId) companyIds.add(companyId);
  });

  (topLevelDocs.companies ?? []).forEach((doc) => {
    const ownerUid = normalizeString(doc.fields.ownerUid);
    if (targetUids.has(ownerUid)) {
      companyIds.add(doc.id);
    }
  });

  const selected = {
    profiles: (topLevelDocs.profiles ?? []).filter((doc) => targetUids.has(doc.id)),
    users: (topLevelDocs.users ?? []).filter((doc) => targetUids.has(doc.id)),
    consultants: (topLevelDocs.consultants ?? []).filter((doc) => targetUids.has(doc.id)),
    signupRequests: (topLevelDocs.signupRequests ?? []).filter((doc) => targetUids.has(doc.id)),
    consents: (topLevelDocs.consents ?? []).filter((doc) =>
      targetUids.has(normalizeString(doc.fields.userId)),
    ),
    companies: (topLevelDocs.companies ?? []).filter((doc) => {
      const ownerUid = normalizeString(doc.fields.ownerUid);
      return companyIds.has(doc.id) || targetUids.has(ownerUid);
    }),
  };

  const officeHourApplications = (topLevelDocs.officeHourApplications ?? []).filter((doc) => {
    const companyId = normalizeString(doc.fields.companyId);
    const createdByUid = normalizeString(doc.fields.createdByUid);
    const consultantId = normalizeString(doc.fields.consultantId);
    return (
      companyIds.has(companyId) ||
      targetUids.has(createdByUid) ||
      targetUids.has(consultantId)
    );
  });

  selected.officeHourApplications = officeHourApplications;

  const applicationIds = new Set(officeHourApplications.map((doc) => doc.id));
  const targetSlotIds = new Set(
    officeHourApplications
      .map((doc) => normalizeString(doc.fields.officeHourSlotId))
      .filter(Boolean),
  );

  selected.reports = (topLevelDocs.reports ?? []).filter((doc) => {
    const consultantId = normalizeString(doc.fields.consultantId);
    const companyId = normalizeString(doc.fields.companyId);
    const applicationId = normalizeString(doc.fields.applicationId);
    return (
      targetUids.has(consultantId) ||
      companyIds.has(companyId) ||
      applicationIds.has(applicationId)
    );
  });

  selected.notifications = (topLevelDocs.notifications ?? []).filter((doc) =>
    targetUids.has(normalizeString(doc.fields.userId)),
  );

  const reopenableSlots = [];
  const protectedSlots = [];
  const allApplications = topLevelDocs.officeHourApplications ?? [];

  (topLevelDocs.officeHourSlots ?? []).forEach((slotDoc) => {
    if (!targetSlotIds.has(slotDoc.id)) return;

    const hasOtherActiveReference = allApplications.some((applicationDoc) => {
      if (applicationIds.has(applicationDoc.id)) return false;
      if (normalizeString(applicationDoc.fields.officeHourSlotId) !== slotDoc.id) return false;
      return ACTIVE_APPLICATION_STATUSES.has(normalizeStatus(applicationDoc.fields.status));
    });

    if (hasOtherActiveReference) {
      protectedSlots.push(slotDoc);
      return;
    }

    reopenableSlots.push(slotDoc);
  });

  return {
    targetUsers,
    targetUids,
    targetEmails,
    targetCompanyIds: companyIds,
    targets: selected,
    reopenableSlots,
    protectedSlots,
  };
}

function printPlanSummary(plan, topLevelDocs, sampleLimit) {
  console.log(`[1/4] Matching Auth users: ${plan.targetUsers.length}`);
  plan.targetUsers.slice(0, sampleLimit).forEach((user) => {
    console.log(`  ${user.uid} ${user.email}`);
  });

  console.log("[2/4] Firestore scan summary");
  SCANNED_COLLECTIONS.forEach((collectionId) => {
    const count = topLevelDocs[collectionId]?.length ?? 0;
    console.log(`- ${collectionId}: ${count}`);
  });

  console.log("[3/4] Deletion candidates");
  DELETE_COLLECTION_ORDER.forEach((target) => {
    const docs = plan.targets[target] ?? [];
    console.log(`- ${target}: ${docs.length}`);
    docs.slice(0, sampleLimit).forEach((doc) => {
      console.log(`  ${doc.path}`);
    });
  });
  console.log(`- officeHourSlots to reopen: ${plan.reopenableSlots.length}`);
  plan.reopenableSlots.slice(0, sampleLimit).forEach((doc) => {
    console.log(`  ${doc.path}`);
  });

  if (plan.protectedSlots.length > 0) {
    console.log(`- officeHourSlots kept booked due to other active applications: ${plan.protectedSlots.length}`);
    plan.protectedSlots.slice(0, sampleLimit).forEach((doc) => {
      console.log(`  ${doc.path}`);
    });
  }
}

async function executeDeletion(projectId, plan, getAccessToken) {
  const counters = {
    deletedDocuments: 0,
    reopenedSlots: 0,
    deletedAuthUsers: 0,
  };

  console.log("[4/4] Applying deletes ...");

  for (const target of DELETE_COLLECTION_ORDER) {
    const docs = plan.targets[target] ?? [];
    if (docs.length === 0) {
      console.log(`- ${target}: nothing to delete`);
      continue;
    }

    console.log(`- ${target}: deleting ${docs.length} root documents`);
    let processed = 0;

    for (const doc of docs) {
      await recursiveDeleteDocument(doc.name, getAccessToken, counters);
      processed += 1;
      if (processed % 10 === 0 || processed === docs.length) {
        console.log(`  ${target}: ${processed}/${docs.length}`);
      }
    }
  }

  if (plan.reopenableSlots.length > 0) {
    console.log(`- officeHourSlots: reopening ${plan.reopenableSlots.length}`);
    let processed = 0;
    for (const slotDoc of plan.reopenableSlots) {
      await patchDocument(slotDoc.name, getAccessToken, { status: "open" });
      counters.reopenedSlots += 1;
      processed += 1;
      if (processed % 10 === 0 || processed === plan.reopenableSlots.length) {
        console.log(`  officeHourSlots: ${processed}/${plan.reopenableSlots.length}`);
      }
    }
  }

  if (plan.targetUsers.length > 0) {
    console.log(`- auth: deleting ${plan.targetUsers.length} users`);
    let processed = 0;
    for (const user of plan.targetUsers) {
      await deleteAuthUser(projectId, user.uid, getAccessToken);
      counters.deletedAuthUsers += 1;
      processed += 1;
      if (processed % 10 === 0 || processed === plan.targetUsers.length) {
        console.log(`  auth: ${processed}/${plan.targetUsers.length}`);
      }
    }
  }

  console.log(`Deleted ${counters.deletedDocuments} Firestore documents.`);
  console.log(`Reopened ${counters.reopenedSlots} officeHourSlots.`);
  console.log(`Deleted ${counters.deletedAuthUsers} Firebase Auth users.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const currentFilePath = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(currentFilePath), "..");
  const env = loadProjectEnv(projectRoot);
  let serviceAccount = null;
  try {
    serviceAccount = loadServiceAccount(env);
  } catch {
    serviceAccount = null;
  }
  const firebaseToolsTokens = loadFirebaseToolsTokens();
  const projectId = env.VITE_FIREBASE_PROJECT_ID || serviceAccount?.project_id;

  if (!projectId) {
    throw new Error("Missing VITE_FIREBASE_PROJECT_ID and project_id in service account");
  }

  if (serviceAccount && (!serviceAccount.client_email || !serviceAccount.private_key)) {
    throw new Error("Service account JSON must include client_email and private_key");
  }

  const getAccessToken = serviceAccount
    ? createAccessTokenProvider(serviceAccount)
    : firebaseToolsTokens
      ? createFirebaseToolsAccessTokenProvider(firebaseToolsTokens)
      : null;

  if (!getAccessToken) {
    throw new Error(
      "Missing credentials. Set FIREBASE_SERVICE_ACCOUNT_PATH/JSON, GOOGLE_APPLICATION_CREDENTIALS, or run 'firebase login'.",
    );
  }

  console.log(`Project: ${projectId}`);
  console.log(`[0/4] Loading Firebase Auth users and Firestore collections ...`);

  const allAuthUsers = await listAllAuthUsers(projectId, getAccessToken);
  const targetUsers = selectTargetUsers(allAuthUsers, options);
  const topLevelDocs = {};

  for (const collectionId of SCANNED_COLLECTIONS) {
    topLevelDocs[collectionId] = await listTopLevelDocuments(projectId, collectionId, getAccessToken);
  }

  const plan = buildDeletionPlan(topLevelDocs, targetUsers);
  printPlanSummary(plan, topLevelDocs, options.sample);

  if (plan.targetUsers.length === 0) {
    console.log("");
    console.log("No matching Auth users found. Nothing to clean.");
    return;
  }

  if (!options.commit) {
    console.log("");
    console.log("Dry-run complete. Review the targets above, then rerun with --commit.");
    return;
  }

  await executeDeletion(projectId, plan, getAccessToken);
}

main().catch((error) => {
  console.error("Cleanup failed:", error?.message ?? error);
  process.exit(1);
});
