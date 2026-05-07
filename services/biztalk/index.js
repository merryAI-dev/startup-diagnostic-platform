"use strict";

const http = require("node:http");

const PORT = Number(process.env.PORT || 8080);
const PROJECT_ID = normalizeString(process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT);
const INTERNAL_SHARED_TOKEN = normalizeString(process.env.INTERNAL_SHARED_TOKEN);
const BIZTALK_TOKEN_URL =
  normalizeString(process.env.BIZTALK_TOKEN_URL) || "https://www.biztalk-api.com/v2/auth/getToken";
const BIZTALK_MESSAGE_URL = normalizeString(process.env.BIZTALK_MESSAGE_URL);
const BIZTALK_BS_ID = normalizeString(process.env.BIZTALK_BS_ID);
const BIZTALK_BS_PW = normalizeString(process.env.BIZTALK_BS_PW);
const BIZTALK_SENDER_KEY = normalizeString(process.env.BIZTALK_SENDER_KEY);
const BIZTALK_DEFAULT_TMPLT_CODE = normalizeString(process.env.BIZTALK_DEFAULT_TMPLT_CODE);
const BIZTALK_ALIMTALK_RESULT_PATH = "/v2/kko/getResultAll";
const OUTBOUND_IP_ECHO_URL =
  normalizeString(process.env.OUTBOUND_IP_ECHO_URL) || "https://api.ipify.org?format=json";
const UPSTREAM_TIMEOUT_MS = Number(process.env.BIZTALK_UPSTREAM_TIMEOUT_MS || 100000);
const REAL_SEND_MODE = normalizeString(process.env.BIZTALK_REAL_SEND_MODE) || "allowlist_only";
const STAGE_CALLER_PROJECT_ID = normalizeString(process.env.STAGE_CALLER_PROJECT_ID) || "startup-diagnosis-platform";
const LIVE_CALLER_PROJECT_ID = normalizeString(process.env.LIVE_CALLER_PROJECT_ID) || "startup-acceleration-platform";
const TEST_RECIPIENT_ALLOWLIST = new Set(parsePhoneNumberList(process.env.BIZTALK_TEST_RECIPIENT_ALLOWLIST));
const STATIC_HEADERS = parseStaticHeaders(process.env.BIZTALK_STATIC_HEADERS_JSON);
const TOKEN_REFRESH_SKEW_MS = 10 * 60 * 1000;
const DEFAULT_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

let tokenCache = {
  token: "",
  expireDateRaw: "",
  expiresAtMs: 0,
};

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8"));
    });
    request.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }

      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolve(parsed);
      } catch (error) {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function parseStaticHeaders(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return {};
  }

  let parsed;
  try {
    parsed = JSON.parse(normalized);
  } catch (error) {
    throw new Error("BIZTALK_STATIC_HEADERS_JSON must be valid JSON.");
  }

  if (!isPlainObject(parsed)) {
    throw new Error("BIZTALK_STATIC_HEADERS_JSON must be a JSON object.");
  }

  return sanitizeStringRecord(parsed);
}

function sanitizeStringRecord(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [normalizeString(key), normalizeString(item)])
      .filter(([key, item]) => Boolean(key) && Boolean(item))
  );
}

function normalizePhoneNumber(value) {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

function normalizeMessageText(value) {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim() : "";
}

function normalizeTitleText(value) {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim() : "";
}

function parsePhoneNumberList(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return [];
  }

  return Array.from(
    new Set(
      normalized
        .split(",")
        .map((item) => normalizePhoneNumber(item))
        .filter(Boolean)
    )
  );
}

function normalizePhoneNumberArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => normalizePhoneNumber(item))
        .filter(Boolean)
    )
  );
}

function normalizeButtonList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isPlainObject(item)) {
        return null;
      }

      const name = normalizeString(item.name);
      const type = normalizeString(item.type);
      if (!name || !type) {
        return null;
      }

      const normalized = {
        name,
        type,
      };

      [
        "url_mobile",
        "url_pc",
        "scheme_android",
        "scheme_ios",
        "chat_extra",
        "chat_event",
        "plugin_id",
      ].forEach((key) => {
        const value = normalizeString(item[key]);
        if (value) {
          normalized[key] = value;
        }
      });

      return normalized;
    })
    .filter(Boolean);
}

function normalizeAttach(value) {
  if (!isPlainObject(value)) {
    return null;
  }

  const button = normalizeButtonList(value.button);
  if (button.length === 0) {
    return null;
  }

  return { button };
}

function normalizeResponseCode(value) {
  return typeof value === "string" ? value.trim() : "";
}

function redactHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey.includes("authorization")
        || normalizedKey.includes("token")
        || normalizedKey.includes("secret")
        || normalizedKey.includes("key")
      ) {
        return [key, "***"];
      }

      return [key, value];
    })
  );
}

function isAuthorized(request) {
  const header = normalizeString(request.headers.authorization);
  if (!INTERNAL_SHARED_TOKEN) {
    return false;
  }

  return header === `Bearer ${INTERNAL_SHARED_TOKEN}`;
}

function shouldAllowRealSend(body) {
  const callerProjectId = normalizeString(body?.callerProjectId);
  const recipients = normalizePhoneNumberArray(body?.recipients);

  if (REAL_SEND_MODE === "disabled") {
    return {
      allowed: false,
      reason: "Real send is disabled by service policy.",
      callerProjectId,
      recipients,
    };
  }

  if (REAL_SEND_MODE === "live_only") {
    if (callerProjectId !== LIVE_CALLER_PROJECT_ID) {
      return {
        allowed: false,
        reason: "Real send is allowed only for the live caller project.",
        callerProjectId,
        recipients,
      };
    }
    return {
      allowed: true,
      callerProjectId,
      recipients,
    };
  }

  if (REAL_SEND_MODE === "allowlist_only") {
    if (recipients.length === 0) {
      return {
        allowed: false,
        reason: "Recipients are required when allowlist_only mode is active.",
        callerProjectId,
        recipients,
      };
    }

    const disallowedRecipients = recipients.filter((item) => !TEST_RECIPIENT_ALLOWLIST.has(item));
    if (disallowedRecipients.length > 0) {
      return {
        allowed: false,
        reason: "One or more recipients are not in the BizTalk test allowlist.",
        callerProjectId,
        recipients,
        disallowedRecipients,
      };
    }

    return {
      allowed: true,
      callerProjectId,
      recipients,
    };
  }

  if (REAL_SEND_MODE === "stage_and_live") {
    const allowedProjects = new Set([STAGE_CALLER_PROJECT_ID, LIVE_CALLER_PROJECT_ID].filter(Boolean));
    if (!allowedProjects.has(callerProjectId)) {
      return {
        allowed: false,
        reason: "Caller project is not permitted for real send.",
        callerProjectId,
        recipients,
      };
    }
    return {
      allowed: true,
      callerProjectId,
      recipients,
    };
  }

  return {
    allowed: false,
    reason: `Unsupported BIZTALK_REAL_SEND_MODE: ${REAL_SEND_MODE}`,
    callerProjectId,
    recipients,
  };
}

function buildTargetUrl(baseUrl, query) {
  const url = new URL(baseUrl);
  Object.entries(sanitizeStringRecord(query)).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}

function buildBiztalkAlimtalkResultUrl() {
  if (!BIZTALK_MESSAGE_URL) {
    return "";
  }

  const url = new URL(BIZTALK_MESSAGE_URL);
  url.pathname = BIZTALK_ALIMTALK_RESULT_PATH;
  url.search = "";
  return url.toString();
}

function parseBiztalkExpireDate(value) {
  const raw = normalizeString(value);
  if (!/^\d{14}$/.test(raw)) {
    return null;
  }

  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(4, 6));
  const day = Number(raw.slice(6, 8));
  const hour = Number(raw.slice(8, 10));
  const minute = Number(raw.slice(10, 12));
  const second = Number(raw.slice(12, 14));
  const parsed = new Date(year, month - 1, day, hour, minute, second);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isCachedTokenUsable(nowMs = Date.now()) {
  return Boolean(tokenCache.token) && tokenCache.expiresAtMs - TOKEN_REFRESH_SKEW_MS > nowMs;
}

function maskToken(token) {
  const normalized = normalizeString(token);
  if (normalized.length <= 8) {
    return normalized ? "***" : "";
  }
  return `***${normalized.slice(-8)}`;
}

async function parseUpstreamResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text ? { raw: text } : null;
}

async function requestBiztalkToken() {
  if (!BIZTALK_BS_ID || !BIZTALK_BS_PW) {
    throw new Error("BIZTALK_BS_ID or BIZTALK_BS_PW is not configured.");
  }

  const upstream = await fetch(BIZTALK_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      bsid: BIZTALK_BS_ID,
      passwd: BIZTALK_BS_PW,
    }),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  const responseBody = await parseUpstreamResponse(upstream);

  if (!upstream.ok) {
    throw new Error(
      `BizTalk token request failed (${upstream.status}): ${JSON.stringify(responseBody || {})}`
    );
  }

  const responseCode = normalizeResponseCode(responseBody?.responseCode);
  const token = normalizeString(responseBody?.token);
  if (responseCode !== "1000" || !token) {
    throw new Error(`BizTalk token response was invalid: ${JSON.stringify(responseBody || {})}`);
  }

  const expireDateRaw = normalizeString(responseBody?.expireDate);
  const expiresAt = parseBiztalkExpireDate(expireDateRaw);
  tokenCache = {
    token,
    expireDateRaw,
    expiresAtMs: expiresAt ? expiresAt.getTime() : Date.now() + DEFAULT_TOKEN_TTL_MS,
  };

  return {
    token,
    responseCode,
    expireDate: expireDateRaw || null,
  };
}

async function getBiztalkToken(forceRefresh = false) {
  if (!forceRefresh && isCachedTokenUsable()) {
    return {
      token: tokenCache.token,
      responseCode: "1000",
      expireDate: tokenCache.expireDateRaw || null,
      cached: true,
    };
  }

  const freshToken = await requestBiztalkToken();
  return {
    ...freshToken,
    cached: false,
  };
}

function buildBiztalkMessagePayload(body) {
  const recipient = normalizePhoneNumber(body?.recipient || body?.recipients?.[0]);
  const message = normalizeMessageText(body?.message);
  const title = normalizeTitleText(body?.title);
  const senderKey = normalizeString(body?.senderKey) || BIZTALK_SENDER_KEY;
  const tmpltCode = normalizeString(body?.tmpltCode) || BIZTALK_DEFAULT_TMPLT_CODE;
  const msgIdx = normalizeString(body?.msgIdx) || `msg-${Date.now()}`;
  const countryCode = normalizeString(body?.countryCode) || "82";
  const resMethod = normalizeString(body?.resMethod) || "PUSH";
  const attach = normalizeAttach(body?.attach);

  if (!recipient) {
    throw new Error("recipient is required.");
  }
  if (!message) {
    throw new Error("message is required.");
  }
  if (!senderKey) {
    throw new Error("senderKey is required.");
  }
  if (!tmpltCode) {
    throw new Error("tmpltCode is required.");
  }

  return {
    msgIdx,
    countryCode,
    resMethod,
    senderKey,
    tmpltCode,
    message,
    recipient,
    ...(title ? { title } : {}),
    ...(attach ? { attach } : {}),
  };
}

async function handleHealth(response) {
  json(response, 200, {
    ok: true,
    projectId: PROJECT_ID || null,
    configured: {
      internalSharedToken: Boolean(INTERNAL_SHARED_TOKEN),
      biztalkTokenUrl: Boolean(BIZTALK_TOKEN_URL),
      biztalkBsId: Boolean(BIZTALK_BS_ID),
      biztalkBsPw: Boolean(BIZTALK_BS_PW),
      biztalkMessageUrl: Boolean(BIZTALK_MESSAGE_URL),
      biztalkSenderKey: Boolean(BIZTALK_SENDER_KEY),
      biztalkDefaultTemplateCode: Boolean(BIZTALK_DEFAULT_TMPLT_CODE),
      staticHeaders: Object.keys(STATIC_HEADERS).length,
      realSendMode: REAL_SEND_MODE,
      allowlistSize: TEST_RECIPIENT_ALLOWLIST.size,
      tokenCached: isCachedTokenUsable(),
    },
  });
}

async function handleOutboundIpProbe(response) {
  const upstream = await fetch(OUTBOUND_IP_ECHO_URL, {
    signal: AbortSignal.timeout(Math.min(UPSTREAM_TIMEOUT_MS, 100000)),
  });
  const data = await parseUpstreamResponse(upstream);

  if (!upstream.ok) {
    json(response, 502, {
      ok: false,
      echoUrl: OUTBOUND_IP_ECHO_URL,
      upstreamStatus: upstream.status,
      upstreamBody: data,
    });
    return;
  }

  json(response, 200, {
    ok: true,
    echoUrl: OUTBOUND_IP_ECHO_URL,
    observed: data,
  });
}

async function handleAuthTokenProbe(response) {
  const tokenInfo = await getBiztalkToken(false);
  json(response, 200, {
    ok: true,
    responseCode: tokenInfo.responseCode,
    expireDate: tokenInfo.expireDate,
    cached: tokenInfo.cached,
    token: maskToken(tokenInfo.token),
  });
}

async function handleRawDispatch(request, response) {
  if (!BIZTALK_MESSAGE_URL) {
    json(response, 503, {
      ok: false,
      error: "BIZTALK_MESSAGE_URL is not configured.",
    });
    return;
  }

  const body = await readRequestBody(request);
  const dryRun = body?.dryRun === true;
  const payload = body?.payload ?? {};
  const upstreamMethod = normalizeString(body?.method || "POST").toUpperCase();
  const realSendDecision = shouldAllowRealSend(body);
  const headers = {
    "content-type": "application/json; charset=utf-8",
    ...STATIC_HEADERS,
    ...sanitizeStringRecord(body?.headers),
  };
  const targetUrl = buildTargetUrl(BIZTALK_MESSAGE_URL, body?.query);
  if (!["GET", "POST"].includes(upstreamMethod)) {
    json(response, 400, {
      ok: false,
      error: "Only GET and POST upstream methods are supported.",
    });
    return;
  }

  if (dryRun) {
    json(response, 200, {
      ok: true,
      dryRun: true,
      method: upstreamMethod,
      targetUrl,
      headers: redactHeaders(headers),
      payload,
    });
    return;
  }

  if (!realSendDecision.allowed) {
    json(response, 403, {
      ok: false,
      dryRun: false,
      policy: {
        realSendMode: REAL_SEND_MODE,
        reason: realSendDecision.reason,
        callerProjectId: realSendDecision.callerProjectId,
        recipients: realSendDecision.recipients,
        ...(Array.isArray(realSendDecision.disallowedRecipients)
          ? { disallowedRecipients: realSendDecision.disallowedRecipients }
          : {}),
      },
    });
    return;
  }

  const upstream = await fetch(targetUrl, {
    method: upstreamMethod,
    headers,
    ...(upstreamMethod === "POST" ? { body: JSON.stringify(payload) } : {}),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  const upstreamBody = await parseUpstreamResponse(upstream);

  if (!upstream.ok) {
    json(response, 502, {
      ok: false,
      targetUrl,
      upstreamStatus: upstream.status,
      upstreamBody,
    });
    return;
  }

  json(response, 200, {
    ok: true,
    targetUrl,
    upstreamStatus: upstream.status,
    upstreamBody,
  });
}

async function handleAlimtalkDispatch(request, response) {
  if (!BIZTALK_MESSAGE_URL) {
    json(response, 503, {
      ok: false,
      error: "BIZTALK_MESSAGE_URL is not configured.",
    });
    return;
  }

  const body = await readRequestBody(request);
  const dryRun = body?.dryRun === true;
  const payload = buildBiztalkMessagePayload(body);
  const realSendDecision = shouldAllowRealSend({
    ...body,
    recipients: [payload.recipient],
  });

  if (dryRun) {
    json(response, 200, {
      ok: true,
      dryRun: true,
      targetUrl: BIZTALK_MESSAGE_URL,
      headers: redactHeaders({
        "content-type": "application/json; charset=utf-8",
        "bt-token": "TOKEN_WILL_BE_REQUESTED_FROM_BIZTALK",
        ...STATIC_HEADERS,
      }),
      payload,
    });
    return;
  }

  if (!realSendDecision.allowed) {
    json(response, 403, {
      ok: false,
      dryRun: false,
      policy: {
        realSendMode: REAL_SEND_MODE,
        reason: realSendDecision.reason,
        callerProjectId: realSendDecision.callerProjectId,
        recipients: realSendDecision.recipients,
        ...(Array.isArray(realSendDecision.disallowedRecipients)
          ? { disallowedRecipients: realSendDecision.disallowedRecipients }
          : {}),
      },
    });
    return;
  }

  let tokenInfo = await getBiztalkToken(false);
  let upstream = await fetch(BIZTALK_MESSAGE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "bt-token": tokenInfo.token,
      ...STATIC_HEADERS,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  let upstreamBody = await parseUpstreamResponse(upstream);

  // Retry once after forced token refresh if BizTalk rejected the token.
  if (!upstream.ok && String(JSON.stringify(upstreamBody || {})).toLowerCase().includes("token")) {
    tokenInfo = await getBiztalkToken(true);
    upstream = await fetch(BIZTALK_MESSAGE_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "bt-token": tokenInfo.token,
        ...STATIC_HEADERS,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    upstreamBody = await parseUpstreamResponse(upstream);
  }

  if (!upstream.ok) {
    json(response, 502, {
      ok: false,
      targetUrl: BIZTALK_MESSAGE_URL,
      upstreamStatus: upstream.status,
      upstreamBody,
      tokenExpireDate: tokenInfo.expireDate || null,
    });
    return;
  }

  json(response, 200, {
    ok: true,
    targetUrl: BIZTALK_MESSAGE_URL,
    upstreamStatus: upstream.status,
    upstreamBody,
    tokenExpireDate: tokenInfo.expireDate || null,
  });
}

async function handleAlimtalkResultQuery(request, response) {
  const resultUrl = buildBiztalkAlimtalkResultUrl();
  if (!resultUrl) {
    json(response, 503, {
      ok: false,
      error: "BIZTALK_MESSAGE_URL is not configured.",
    });
    return;
  }

  const body = await readRequestBody(request);
  const dryRun = body?.dryRun === true;
  const upstreamMethod = normalizeString(body?.method || "POST").toUpperCase();
  const payload = isPlainObject(body?.payload) ? body.payload : {};
  const query = sanitizeStringRecord(body?.query);

  if (!["GET", "POST"].includes(upstreamMethod)) {
    json(response, 400, {
      ok: false,
      error: "Only GET and POST upstream methods are supported.",
    });
    return;
  }

  const targetUrl = buildTargetUrl(resultUrl, query);
  if (dryRun) {
    json(response, 200, {
      ok: true,
      dryRun: true,
      method: upstreamMethod,
      targetUrl,
      headers: redactHeaders({
        "content-type": "application/json; charset=utf-8",
        "bt-token": "TOKEN_WILL_BE_REQUESTED_FROM_BIZTALK",
        ...STATIC_HEADERS,
      }),
      payload,
    });
    return;
  }

  let tokenInfo = await getBiztalkToken(false);
  let upstream = await fetch(targetUrl, {
    method: upstreamMethod,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "bt-token": tokenInfo.token,
      ...STATIC_HEADERS,
    },
    ...(upstreamMethod === "POST" ? { body: JSON.stringify(payload) } : {}),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  let upstreamBody = await parseUpstreamResponse(upstream);

  if (!upstream.ok && String(JSON.stringify(upstreamBody || {})).toLowerCase().includes("token")) {
    tokenInfo = await getBiztalkToken(true);
    upstream = await fetch(targetUrl, {
      method: upstreamMethod,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "bt-token": tokenInfo.token,
        ...STATIC_HEADERS,
      },
      ...(upstreamMethod === "POST" ? { body: JSON.stringify(payload) } : {}),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    upstreamBody = await parseUpstreamResponse(upstream);
  }

  if (!upstream.ok) {
    json(response, 502, {
      ok: false,
      targetUrl,
      upstreamStatus: upstream.status,
      upstreamBody,
      tokenExpireDate: tokenInfo.expireDate || null,
    });
    return;
  }

  json(response, 200, {
    ok: true,
    targetUrl,
    upstreamStatus: upstream.status,
    upstreamBody,
    tokenExpireDate: tokenInfo.expireDate || null,
  });
}

async function handleRequest(request, response) {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (request.method === "GET" && url.pathname === "/health") {
      await handleHealth(response);
      return;
    }

    if (request.method !== "POST") {
      json(response, 404, {
        ok: false,
        error: "Not found.",
      });
      return;
    }

    if (!isAuthorized(request)) {
      json(response, 401, {
        ok: false,
        error: "Unauthorized.",
      });
      return;
    }

    if (url.pathname === "/health") {
      await handleHealth(response);
      return;
    }

    if (url.pathname === "/probe/outbound-ip") {
      await handleOutboundIpProbe(response);
      return;
    }

    if (url.pathname === "/probe/auth-token") {
      await handleAuthTokenProbe(response);
      return;
    }

    if (url.pathname === "/dispatch/raw") {
      await handleRawDispatch(request, response);
      return;
    }

    if (url.pathname === "/dispatch/alimtalk") {
      await handleAlimtalkDispatch(request, response);
      return;
    }

    if (url.pathname === "/results/alimtalk") {
      await handleAlimtalkResultQuery(request, response);
      return;
    }

    json(response, 404, {
      ok: false,
      error: "Not found.",
    });
  } catch (error) {
    console.error("biztalk service request failed", {
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : null,
    });

    json(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

function createServer() {
  return http.createServer(handleRequest);
}

if (require.main === module) {
  createServer().listen(PORT, () => {
    console.log(`BizTalk dispatch service listening on ${PORT}`);
  });
}

module.exports = {
  createServer,
  handleRequest,
};
