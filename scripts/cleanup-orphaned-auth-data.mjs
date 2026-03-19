#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_TARGETS = [
  "profiles",
  "users",
  "consultants",
  "signupRequests",
  "consents",
  "companies",
];

const SAMPLE_LIMIT_DEFAULT = 20;
const FIRESTORE_PAGE_SIZE = 200;
const AUTH_PAGE_SIZE = 1000;
const TOKEN_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

function parseArgs(argv) {
  const options = {
    commit: false,
    help: false,
    sample: SAMPLE_LIMIT_DEFAULT,
    targets: [...DEFAULT_TARGETS],
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

    if (arg === "--targets") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("--targets requires a comma-separated value");
      }
      const parsed = next
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const normalized = parsed.includes("all") ? [...DEFAULT_TARGETS] : parsed;
      const invalid = normalized.filter((item) => !DEFAULT_TARGETS.includes(item));
      if (invalid.length > 0) {
        throw new Error(`Unsupported targets: ${invalid.join(", ")}`);
      }
      options.targets = Array.from(new Set(normalized));
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printUsage() {
  console.log("Cleanup Firestore data orphaned from deleted Firebase Auth users");
  console.log("");
  console.log("Usage:");
  console.log("  node scripts/cleanup-orphaned-auth-data.mjs [--targets a,b,c] [--sample N] [--commit]");
  console.log("");
  console.log("Options:");
  console.log("  --targets a,b,c  Any of: profiles,users,consultants,signupRequests,consents,companies");
  console.log(`  --sample N       Print up to N sample document paths per target (default ${SAMPLE_LIMIT_DEFAULT})`);
  console.log("  --commit         Execute deletes (default is dry-run)");
  console.log("  --help           Show this help");
  console.log("");
  console.log("Service account env (one of the following is required):");
  console.log("  FIREBASE_SERVICE_ACCOUNT_PATH");
  console.log("  FIREBASE_SERVICE_ACCOUNT_JSON");
  console.log("  GOOGLE_APPLICATION_CREDENTIALS");
  console.log("");
  console.log("Also required:");
  console.log("  VITE_FIREBASE_PROJECT_ID (or project_id inside the service account JSON)");
  console.log("");
  console.log("Notes:");
  console.log("  - Deletes use Google API credentials and bypass Firestore security rules.");
  console.log("  - Dry-run is the default. Review output first, then rerun with --commit.");
  console.log("  - Company Firestore subcollections are deleted recursively.");
  console.log("  - Firebase Storage objects are not deleted by this script.");
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, "utf8");
  const result = {};

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
  if (typeof value !== "string" || value.trim().length === 0) {
    return "";
  }
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
    env.FIREBASE_SERVICE_ACCOUNT_PATH
    || env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!filePath) {
    throw new Error(
      "Missing FIREBASE_SERVICE_ACCOUNT_PATH, FIREBASE_SERVICE_ACCOUNT_JSON, or GOOGLE_APPLICATION_CREDENTIALS"
    );
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  return {
    ...parsed,
    private_key: normalizePrivateKey(parsed.private_key),
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
    })
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
    if (
      !forceRefresh
      && cache.accessToken
      && cache.expiresAt - 60_000 > now
    ) {
      return cache.accessToken;
    }

    const assertion = createJwtAssertion(serviceAccount);
    const response = await fetch(
      serviceAccount.token_uri || "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion,
        }),
      }
    );

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

  if (response.status === 401) {
    const refreshedToken = await getAccessToken(true);
    const retryResponse = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${refreshedToken}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });

    if (allowNotFound && retryResponse.status === 404) {
      return null;
    }

    if (!retryResponse.ok) {
      const text = await retryResponse.text();
      throw new Error(`Google API request failed (${retryResponse.status}): ${text}`);
    }

    if (retryResponse.status === 204) return null;
    const text = await retryResponse.text();
    return text ? JSON.parse(text) : null;
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
    createTime: document.createTime ?? null,
    updateTime: document.updateTime ?? null,
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
    if (!json) {
      return items;
    }
    const docs = (json?.documents ?? []).map((item) => decodeDocument(item));
    items.push(...docs);
    pageToken = json?.nextPageToken ?? null;

    if (!pageToken) {
      break;
    }
  }

  return items;
}

async function listCollectionIds(documentName, getAccessToken) {
  const url = `https://firestore.googleapis.com/v1/${documentName}:listCollectionIds`;
  let pageToken = null;
  const collectionIds = [];

  while (true) {
    const body = {
      pageSize: FIRESTORE_PAGE_SIZE,
      ...(pageToken ? { pageToken } : {}),
    };
    const json = await fetchJson(
      url,
      getAccessToken,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      true
    );
    if (!json) {
      return collectionIds;
    }
    collectionIds.push(...(json?.collectionIds ?? []));
    pageToken = json?.nextPageToken ?? null;

    if (!pageToken) {
      break;
    }
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
    if (!json) {
      return items;
    }
    const docs = (json?.documents ?? []).map((item) => decodeDocument(item));
    items.push(...docs);
    pageToken = json?.nextPageToken ?? null;

    if (!pageToken) {
      break;
    }
  }

  return items;
}

async function deleteDocument(documentName, getAccessToken) {
  const url = `https://firestore.googleapis.com/v1/${documentName}`;
  await fetchJson(
    url,
    getAccessToken,
    {
      method: "DELETE",
    },
    true
  );
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

async function listAllAuthUserIds(projectId, getAccessToken) {
  const userIds = new Set();
  let nextPageToken = null;

  while (true) {
    const url = new URL(
      `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchGet`
    );
    url.searchParams.set("maxResults", String(AUTH_PAGE_SIZE));
    if (nextPageToken) {
      url.searchParams.set("nextPageToken", nextPageToken);
    }

    const json = await fetchJson(url.toString(), getAccessToken);
    const users = json?.users ?? [];

    users.forEach((user) => {
      if (typeof user.localId === "string" && user.localId.trim().length > 0) {
        userIds.add(user.localId);
      }
    });

    nextPageToken = json?.nextPageToken ?? null;
    if (!nextPageToken) {
      break;
    }
  }

  return userIds;
}

function buildDeletionPlan(topLevelDocs, authUserIds, selectedTargets) {
  const docsByTarget = {};
  const activeProfileCompanyRefCount = new Map();
  const protectedCompanies = [];

  DEFAULT_TARGETS.forEach((target) => {
    docsByTarget[target] = [];
  });

  const profiles = topLevelDocs.profiles ?? [];
  profiles.forEach((doc) => {
    const hasAuth = authUserIds.has(doc.id);
    if (!hasAuth) return;
    const role = typeof doc.fields.role === "string" ? doc.fields.role.trim() : "";
    const requestedRole =
      typeof doc.fields.requestedRole === "string" ? doc.fields.requestedRole.trim() : "";
    const isCompanyProfile = role === "company" || requestedRole === "company";
    if (!isCompanyProfile) return;
    const companyId = typeof doc.fields.companyId === "string" ? doc.fields.companyId.trim() : "";
    if (!companyId) return;
    activeProfileCompanyRefCount.set(
      companyId,
      (activeProfileCompanyRefCount.get(companyId) ?? 0) + 1
    );
  });

  (topLevelDocs.profiles ?? []).forEach((doc) => {
    if (!authUserIds.has(doc.id)) {
      docsByTarget.profiles.push(doc);
    }
  });

  (topLevelDocs.users ?? []).forEach((doc) => {
    if (!authUserIds.has(doc.id)) {
      docsByTarget.users.push(doc);
    }
  });

  (topLevelDocs.consultants ?? []).forEach((doc) => {
    if (!authUserIds.has(doc.id)) {
      docsByTarget.consultants.push(doc);
    }
  });

  (topLevelDocs.signupRequests ?? []).forEach((doc) => {
    if (!authUserIds.has(doc.id)) {
      docsByTarget.signupRequests.push(doc);
    }
  });

  (topLevelDocs.consents ?? []).forEach((doc) => {
    const userId = typeof doc.fields.userId === "string" ? doc.fields.userId.trim() : "";
    if (userId && !authUserIds.has(userId)) {
      docsByTarget.consents.push(doc);
    }
  });

  (topLevelDocs.companies ?? []).forEach((doc) => {
    const ownerUid = typeof doc.fields.ownerUid === "string" ? doc.fields.ownerUid.trim() : "";
    if (!ownerUid || authUserIds.has(ownerUid)) {
      return;
    }

    const liveProfileRefs = activeProfileCompanyRefCount.get(doc.id) ?? 0;
    if (liveProfileRefs > 0) {
      protectedCompanies.push({
        path: doc.path,
        ownerUid,
        liveProfileRefs,
      });
      return;
    }

    docsByTarget.companies.push(doc);
  });

  return {
    targets: Object.fromEntries(
      Object.entries(docsByTarget).filter(([target]) => selectedTargets.includes(target))
    ),
    protectedCompanies,
  };
}

function printPlanSummary(plan, topLevelDocs, authUserIds, sampleLimit) {
  console.log(`[1/4] Firebase Auth users: ${authUserIds.size}`);
  console.log(`[2/4] Firestore scan summary`);
  DEFAULT_TARGETS.forEach((target) => {
    const count = topLevelDocs[target]?.length ?? 0;
    console.log(`- ${target}: ${count}`);
  });

  console.log("[3/4] Orphan candidates");
  Object.entries(plan.targets).forEach(([target, docs]) => {
    console.log(`- ${target}: ${docs.length}`);
    docs.slice(0, sampleLimit).forEach((doc) => {
      console.log(`  ${doc.path}`);
    });
  });

  if (plan.protectedCompanies.length > 0) {
    console.log("- companies protected by live profile references:");
    plan.protectedCompanies.slice(0, sampleLimit).forEach((item) => {
      console.log(`  ${item.path} (ownerUid=${item.ownerUid}, liveProfileRefs=${item.liveProfileRefs})`);
    });
  }
}

async function executeDeletion(plan, getAccessToken) {
  const counters = {
    deletedDocuments: 0,
  };

  console.log("[4/4] Applying deletes ...");

  for (const [target, docs] of Object.entries(plan.targets)) {
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

  console.log(`Deleted ${counters.deletedDocuments} Firestore documents in total.`);
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
  const serviceAccount = loadServiceAccount(env);
  const projectId = env.VITE_FIREBASE_PROJECT_ID || serviceAccount.project_id;

  if (!projectId) {
    throw new Error("Missing VITE_FIREBASE_PROJECT_ID and project_id in service account");
  }

  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("Service account JSON must include client_email and private_key");
  }

  const getAccessToken = createAccessTokenProvider(serviceAccount);

  console.log(`Project: ${projectId}`);
  console.log(`[0/4] Loading Firebase Auth users and Firestore collections ...`);

  const authUserIds = await listAllAuthUserIds(projectId, getAccessToken);

  const topLevelDocs = {};
  for (const target of DEFAULT_TARGETS) {
    topLevelDocs[target] = await listTopLevelDocuments(projectId, target, getAccessToken);
  }

  const plan = buildDeletionPlan(topLevelDocs, authUserIds, options.targets);
  printPlanSummary(plan, topLevelDocs, authUserIds, options.sample);

  if (!options.commit) {
    console.log("");
    console.log("Dry-run complete. Review the orphan candidates above, then rerun with --commit.");
    return;
  }

  await executeDeletion(plan, getAccessToken);
}

main().catch((error) => {
  console.error("Cleanup failed:", error?.message ?? error);
  process.exit(1);
});
