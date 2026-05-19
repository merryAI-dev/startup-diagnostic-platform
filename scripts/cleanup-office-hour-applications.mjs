#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const FIRESTORE_PAGE_SIZE = 200;
const TOKEN_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const FIREBASE_TOOLS_CLIENT_ID =
  "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const FIREBASE_TOOLS_CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi";
const DEFAULT_SAMPLE_LIMIT = 20;
const SAFE_STORAGE_PREFIX = "office-hour-applications/";

function parseArgs(argv) {
  const options = {
    commit: false,
    help: false,
    sample: DEFAULT_SAMPLE_LIMIT,
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

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printUsage() {
  console.log("Preview or delete officeHourApplications and linked Firebase Storage attachments");
  console.log("");
  console.log("Usage:");
  console.log("  node scripts/cleanup-office-hour-applications.mjs [--sample N] [--commit]");
  console.log("");
  console.log("Options:");
  console.log(`  --sample N    Print up to N sample documents/attachments (default ${DEFAULT_SAMPLE_LIMIT})`);
  console.log("  --commit      Execute Storage + Firestore deletes (default is dry-run)");
  console.log("  --help        Show this help");
  console.log("");
  console.log("Required service account env (one of):");
  console.log("  FIREBASE_SERVICE_ACCOUNT_PATH");
  console.log("  FIREBASE_SERVICE_ACCOUNT_JSON");
  console.log("  GOOGLE_APPLICATION_CREDENTIALS");
  console.log("");
  console.log("Fallback:");
  console.log("  If service account env is absent, the script falls back to the current 'firebase login' token.");
  console.log("");
  console.log("Safety:");
  console.log(`  - Only Storage objects under '${SAFE_STORAGE_PREFIX}' are delete candidates.`);
  console.log("  - Dry-run is the default. Review output first, then rerun with --commit.");
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
    if (!forceRefresh && cache.accessToken && cache.expiresAt - 60_000 > now) {
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

async function deleteDocument(documentName, getAccessToken) {
  const url = `https://firestore.googleapis.com/v1/${documentName}`;
  await fetchJson(url, getAccessToken, { method: "DELETE" }, true);
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? value.map((item) => normalizeString(item)).filter(Boolean) : [];
}

function extractStorageTarget(fileUrl) {
  const normalizedUrl = normalizeString(fileUrl);
  if (!normalizedUrl) return null;

  if (normalizedUrl.startsWith("gs://")) {
    const match = normalizedUrl.match(/^gs:\/\/([^/]+)\/(.+)$/u);
    if (!match) return null;
    const [, bucket, objectPath] = match;
    return {
      bucket,
      objectPath,
      deleteAllowed: objectPath.startsWith(SAFE_STORAGE_PREFIX),
    };
  }

  try {
    const parsed = new URL(normalizedUrl);
    if (parsed.hostname === "firebasestorage.googleapis.com") {
      const pathMatch = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/u);
      if (!pathMatch) return null;
      const bucket = decodeURIComponent(pathMatch[1] ?? "");
      const objectPath = decodeURIComponent(pathMatch[2] ?? "");
      return {
        bucket,
        objectPath,
        deleteAllowed: objectPath.startsWith(SAFE_STORAGE_PREFIX),
      };
    }

    if (parsed.hostname === "storage.googleapis.com") {
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts.length < 2) return null;
      const [bucket, ...objectParts] = parts;
      const objectPath = decodeURIComponent(objectParts.join("/"));
      return {
        bucket,
        objectPath,
        deleteAllowed: objectPath.startsWith(SAFE_STORAGE_PREFIX),
      };
    }
  } catch {
    return null;
  }

  return null;
}

function buildPlan(documents) {
  const statusCounts = new Map();
  const attachmentEntries = [];

  documents.forEach((doc) => {
    const status = normalizeString(doc.fields.status) || "(empty)";
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);

    const attachmentUrls = normalizeStringArray(doc.fields.attachmentUrls);
    attachmentUrls.forEach((url) => {
      attachmentEntries.push({
        applicationId: doc.id,
        applicationPath: doc.path,
        url,
        storageTarget: extractStorageTarget(url),
      });
    });
  });

  const uniqueStorageObjects = new Map();
  attachmentEntries.forEach((entry) => {
    if (!entry.storageTarget) return;
    const key = `${entry.storageTarget.bucket}/${entry.storageTarget.objectPath}`;
    if (!uniqueStorageObjects.has(key)) {
      uniqueStorageObjects.set(key, {
        bucket: entry.storageTarget.bucket,
        objectPath: entry.storageTarget.objectPath,
        deleteAllowed: entry.storageTarget.deleteAllowed,
        referencedBy: [entry.applicationId],
      });
      return;
    }

    const existing = uniqueStorageObjects.get(key);
    if (!existing.referencedBy.includes(entry.applicationId)) {
      existing.referencedBy.push(entry.applicationId);
    }
  });

  return {
    documents,
    statusCounts,
    attachmentEntries,
    uniqueStorageObjects: Array.from(uniqueStorageObjects.values()).sort((a, b) =>
      `${a.bucket}/${a.objectPath}`.localeCompare(`${b.bucket}/${b.objectPath}`),
    ),
  };
}

function printPlan(plan, sampleLimit) {
  console.log(`[1/3] officeHourApplications: ${plan.documents.length}`);
  plan.documents.slice(0, sampleLimit).forEach((doc) => {
    const companyName = normalizeString(doc.fields.companyName) || "-";
    const status = normalizeString(doc.fields.status) || "-";
    const scheduledDate = normalizeString(doc.fields.scheduledDate) || "-";
    const scheduledTime = normalizeString(doc.fields.scheduledTime) || "-";
    const agenda = normalizeString(doc.fields.agenda) || normalizeString(doc.fields.agendaId) || "-";
    const attachmentCount = normalizeStringArray(doc.fields.attachmentUrls).length;
    console.log(
      `  ${doc.path} | status=${status} | company=${companyName} | schedule=${scheduledDate} ${scheduledTime}` +
        ` | agenda=${agenda} | attachments=${attachmentCount}`,
    );
  });

  console.log("[2/3] Status summary");
  if (plan.statusCounts.size === 0) {
    console.log("  no documents");
  } else {
    Array.from(plan.statusCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([status, count]) => {
        console.log(`  ${status}: ${count}`);
      });
  }

  const safeStorageObjects = plan.uniqueStorageObjects.filter((item) => item.deleteAllowed);
  const unsafeStorageObjects = plan.uniqueStorageObjects.filter((item) => !item.deleteAllowed);

  console.log("[3/3] Attachment summary");
  console.log(`  attachmentUrls on documents: ${plan.attachmentEntries.length}`);
  console.log(`  unique Firebase Storage objects: ${plan.uniqueStorageObjects.length}`);
  console.log(`  safe delete candidates (${SAFE_STORAGE_PREFIX}): ${safeStorageObjects.length}`);
  console.log(`  skipped non-matching paths: ${unsafeStorageObjects.length}`);

  if (safeStorageObjects.length > 0) {
    console.log("  sample safe delete candidates:");
    safeStorageObjects.slice(0, sampleLimit).forEach((item) => {
      console.log(`    gs://${item.bucket}/${item.objectPath}`);
    });
  }

  if (unsafeStorageObjects.length > 0) {
    console.log("  sample skipped paths:");
    unsafeStorageObjects.slice(0, sampleLimit).forEach((item) => {
      console.log(`    gs://${item.bucket}/${item.objectPath}`);
    });
  }

  if (plan.attachmentEntries.length > 0) {
    console.log("  attachment-to-application mapping:");
    plan.attachmentEntries.slice(0, sampleLimit).forEach((entry) => {
      const storageLabel = entry.storageTarget
        ? `gs://${entry.storageTarget.bucket}/${entry.storageTarget.objectPath}`
        : entry.url;
      console.log(`    ${entry.applicationPath} -> ${storageLabel}`);
    });
  }
}

async function deleteStorageObject(bucket, objectPath, getAccessToken) {
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectPath)}`;
  await fetchJson(url, getAccessToken, { method: "DELETE" }, true);
}

async function executePlan(plan, getAccessToken) {
  const safeStorageObjects = plan.uniqueStorageObjects.filter((item) => item.deleteAllowed);
  let deletedStorageObjects = 0;
  let deletedDocuments = 0;

  console.log("Deleting Firebase Storage objects...");
  for (const item of safeStorageObjects) {
    await deleteStorageObject(item.bucket, item.objectPath, getAccessToken);
    deletedStorageObjects += 1;
    if (deletedStorageObjects % 20 === 0 || deletedStorageObjects === safeStorageObjects.length) {
      console.log(`  storage: ${deletedStorageObjects}/${safeStorageObjects.length}`);
    }
  }

  console.log("Deleting Firestore documents...");
  for (const doc of plan.documents) {
    await deleteDocument(doc.name, getAccessToken);
    deletedDocuments += 1;
    if (deletedDocuments % 20 === 0 || deletedDocuments === plan.documents.length) {
      console.log(`  firestore: ${deletedDocuments}/${plan.documents.length}`);
    }
  }

  return { deletedStorageObjects, deletedDocuments };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const projectRoot = process.cwd();
  const env = loadProjectEnv(projectRoot);

  let projectId = normalizeString(env.VITE_FIREBASE_PROJECT_ID);
  let getAccessToken;

  try {
    const serviceAccount = loadServiceAccount(env);
    if (!projectId) {
      projectId = normalizeString(serviceAccount.project_id);
    }
    getAccessToken = createAccessTokenProvider(serviceAccount);
  } catch {
    const firebaseToolsTokens = loadFirebaseToolsTokens();
    if (!firebaseToolsTokens) {
      throw new Error(
        "No service account env found and no firebase login token available. Configure credentials first.",
      );
    }
    getAccessToken = createFirebaseToolsAccessTokenProvider(firebaseToolsTokens);
  }

  if (!projectId) {
    throw new Error("Missing VITE_FIREBASE_PROJECT_ID and project_id could not be inferred.");
  }

  console.log(`Project: ${projectId}`);
  console.log(options.commit ? "Mode: COMMIT" : "Mode: DRY-RUN");

  const documents = await listTopLevelDocuments(projectId, "officeHourApplications", getAccessToken);
  const plan = buildPlan(documents);
  printPlan(plan, options.sample);

  if (!options.commit) {
    console.log("");
    console.log("Dry-run complete. Review the targets above, then rerun with --commit.");
    return;
  }

  console.log("");
  const result = await executePlan(plan, getAccessToken);
  console.log("Cleanup complete.");
  console.log(`- deleted Storage objects: ${result.deletedStorageObjects}`);
  console.log(`- deleted Firestore documents: ${result.deletedDocuments}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
