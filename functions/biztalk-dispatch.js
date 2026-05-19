"use strict";

const DEFAULT_TIMEOUT_MS = 15000;

function normalizeServiceUrl(value) {
  return typeof value === "string" ? value.trim().replace(/\/+$/, "") : "";
}

async function parseResponseBody(response) {
  const contentType = typeof response.headers.get === "function"
    ? response.headers.get("content-type") || ""
    : "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text ? { raw: text } : null;
}

async function dispatchBiztalkService(config, path, payload) {
  const serviceUrl = normalizeServiceUrl(config?.url);
  const authToken = typeof config?.token === "string" ? config.token.trim() : "";
  const route = typeof path === "string" && path.startsWith("/") ? path : `/${path || ""}`;

  if (!serviceUrl) {
    throw new Error("BizTalk dispatch URL is not configured.");
  }
  if (!authToken) {
    throw new Error("BizTalk dispatch token is not configured.");
  }

  const response = await fetch(`${serviceUrl}${route}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${authToken}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload ?? {}),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  const responseBody = await parseResponseBody(response);
  if (!response.ok) {
    const detail =
      responseBody && typeof responseBody === "object"
        ? JSON.stringify(responseBody)
        : String(responseBody || "empty response");
    throw new Error(`BizTalk dispatch failed (${response.status}): ${detail}`);
  }

  return responseBody;
}

module.exports = {
  dispatchBiztalkService,
};
