#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIRESTORE_PAGE_SIZE = 200;
const AUTH_PAGE_SIZE = 1000;
const SAMPLE_LIMIT_DEFAULT = 20;
const TOKEN_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

function parseArgs(argv) {
  const options = {
    help: false,
    sample: SAMPLE_LIMIT_DEFAULT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

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
  console.log("Report consultant document reference usage");
  console.log("");
  console.log("Usage:");
  console.log("  node scripts/report-consultant-reference-usage.mjs [--sample N]");
  console.log("");
  console.log("Options:");
  console.log(`  --sample N  Print up to N sample rows per section (default ${SAMPLE_LIMIT_DEFAULT})`);
  console.log("  --help      Show this help");
  console.log("");
  console.log("Service account env (one of the following is required):");
  console.log("  FIREBASE_SERVICE_ACCOUNT_PATH");
  console.log("  FIREBASE_SERVICE_ACCOUNT_JSON");
  console.log("  GOOGLE_APPLICATION_CREDENTIALS");
  console.log("");
  console.log("Also required:");
  console.log("  VITE_FIREBASE_PROJECT_ID (or project_id inside the service account JSON)");
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

async function listAllAuthUsers(projectId, getAccessToken) {
  const users = [];
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
    (json?.users ?? []).forEach((user) => {
      const uid = typeof user.localId === "string" ? user.localId.trim() : "";
      if (!uid) return;
      users.push({
        uid,
        email: typeof user.email === "string" ? user.email.trim() : "",
      });
    });

    nextPageToken = json?.nextPageToken ?? null;
    if (!nextPageToken) break;
  }

  return users;
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function collectReferencesByConsultantId(applications, reports) {
  const refs = new Map();

  const pushRef = (consultantId, entry) => {
    const normalized = typeof consultantId === "string" ? consultantId.trim() : "";
    if (!normalized) return;
    const list = refs.get(normalized) ?? [];
    list.push(entry);
    refs.set(normalized, list);
  };

  applications.forEach((doc) => {
    pushRef(doc.fields.consultantId, {
      source: "officeHourApplications",
      path: doc.path,
      status: doc.fields.status ?? null,
      consultant: doc.fields.consultant ?? null,
    });
  });

  reports.forEach((doc) => {
    pushRef(doc.fields.consultantId, {
      source: "reports",
      path: doc.path,
      status: null,
      consultant: doc.fields.consultantName ?? null,
    });
  });

  return refs;
}

function buildDuplicateGroups(consultants) {
  const byEmail = new Map();

  consultants.forEach((consultantDoc) => {
    const emails = [
      normalizeEmail(consultantDoc.fields.email),
      normalizeEmail(consultantDoc.fields.secondaryEmail),
    ].filter(Boolean);

    Array.from(new Set(emails)).forEach((email) => {
      const list = byEmail.get(email) ?? [];
      list.push(consultantDoc);
      byEmail.set(email, list);
    });
  });

  return Array.from(byEmail.entries())
    .filter(([, docs]) => docs.length > 1)
    .map(([email, docs]) => ({ email, docs }));
}

function buildReport({ authUsers, consultants, applications, reports }) {
  const authByUid = new Map(authUsers.map((user) => [user.uid, user]));
  const refsByConsultantId = collectReferencesByConsultantId(applications, reports);
  const duplicateGroups = buildDuplicateGroups(consultants);

  const duplicateReferenceGroups = duplicateGroups.map((group) => {
    const docs = group.docs.map((consultantDoc) => {
      const references = refsByConsultantId.get(consultantDoc.id) ?? [];
      return {
        consultantDocId: consultantDoc.id,
        consultantPath: consultantDoc.path,
        email: consultantDoc.fields.email ?? "",
        secondaryEmail: consultantDoc.fields.secondaryEmail ?? "",
        authExists: authByUid.has(consultantDoc.id),
        referenceCount: references.length,
        references,
      };
    });

    return {
      email: group.email,
      docs,
    };
  });

  const unreferencedOrphanDocs = consultants
    .filter((consultantDoc) => !authByUid.has(consultantDoc.id))
    .filter((consultantDoc) => (refsByConsultantId.get(consultantDoc.id) ?? []).length === 0)
    .map((consultantDoc) => ({
      consultantDocId: consultantDoc.id,
      consultantPath: consultantDoc.path,
      email: consultantDoc.fields.email ?? "",
      secondaryEmail: consultantDoc.fields.secondaryEmail ?? "",
    }));

  const referencedOrphanDocs = consultants
    .filter((consultantDoc) => !authByUid.has(consultantDoc.id))
    .map((consultantDoc) => ({
      consultantDocId: consultantDoc.id,
      consultantPath: consultantDoc.path,
      email: consultantDoc.fields.email ?? "",
      secondaryEmail: consultantDoc.fields.secondaryEmail ?? "",
      references: refsByConsultantId.get(consultantDoc.id) ?? [],
    }))
    .filter((item) => item.references.length > 0);

  return {
    counts: {
      authUsers: authUsers.length,
      consultants: consultants.length,
      applications: applications.length,
      reports: reports.length,
    },
    duplicateReferenceGroups,
    unreferencedOrphanDocs,
    referencedOrphanDocs,
  };
}

function printReport(report, sampleLimit) {
  console.log("[1/3] Scan counts");
  console.log(`- auth users: ${report.counts.authUsers}`);
  console.log(`- consultants: ${report.counts.consultants}`);
  console.log(`- officeHourApplications: ${report.counts.applications}`);
  console.log(`- reports: ${report.counts.reports}`);
  console.log("");

  console.log("[2/3] Duplicate consultant groups with references");
  report.duplicateReferenceGroups.slice(0, sampleLimit).forEach((group) => {
    console.log(`- ${group.email}`);
    group.docs.forEach((doc) => {
      console.log(
        `  ${doc.consultantPath} auth=${doc.authExists ? "yes" : "no"} refs=${doc.referenceCount}`
      );
      doc.references.slice(0, sampleLimit).forEach((ref) => {
        console.log(`    ${ref.source}: ${ref.path} status=${ref.status || "-"} consultant=${ref.consultant || "-"}`);
      });
    });
  });

  console.log("");
  console.log("[3/3] Orphan consultant docs by reference safety");
  console.log(`- unreferenced orphan consultant docs: ${report.unreferencedOrphanDocs.length}`);
  report.unreferencedOrphanDocs.slice(0, sampleLimit).forEach((item) => {
    console.log(`  ${item.consultantPath} email=${item.email || "-"} secondary=${item.secondaryEmail || "-"}`);
  });
  console.log(`- referenced orphan consultant docs: ${report.referencedOrphanDocs.length}`);
  report.referencedOrphanDocs.slice(0, sampleLimit).forEach((item) => {
    console.log(
      `  ${item.consultantPath} email=${item.email || "-"} refs=${item.references.length}`
    );
    item.references.slice(0, sampleLimit).forEach((ref) => {
      console.log(`    ${ref.source}: ${ref.path} status=${ref.status || "-"} consultant=${ref.consultant || "-"}`);
    });
  });
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
    throw new Error("Missing VITE_FIREBASE_PROJECT_ID and service account project_id");
  }

  const getAccessToken = createAccessTokenProvider(serviceAccount);

  console.log(`Project: ${projectId}`);
  const [authUsers, consultants, applications, reports] = await Promise.all([
    listAllAuthUsers(projectId, getAccessToken),
    listTopLevelDocuments(projectId, "consultants", getAccessToken),
    listTopLevelDocuments(projectId, "officeHourApplications", getAccessToken),
    listTopLevelDocuments(projectId, "reports", getAccessToken),
  ]);

  const report = buildReport({ authUsers, consultants, applications, reports });
  printReport(report, options.sample);
}

main().catch((error) => {
  console.error("Consultant reference usage report failed:", error?.message ?? error);
  process.exit(1);
});
