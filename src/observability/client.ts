import { httpsCallable } from "firebase/functions"
import { functions, isFirebaseConfigured } from "@/redesign/app/lib/firebase"
import type { TelemetryCollectorPayload, TelemetryEventPayload } from "@/observability/types"

const SESSION_STORAGE_KEY = "mysc-observability-session-id"
const LOCAL_STORAGE_KEY = "mysc-observability-anonymous-id"

let userRole: string | null = null
let collectorDisabled = false

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const random = crypto.getRandomValues(new Uint32Array(4)).join("-")
    return `${prefix}_${Date.now()}_${random}`
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function safeStorageGet(storage: Storage | undefined, key: string) {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function safeStorageSet(storage: Storage | undefined, key: string, value: string) {
  try {
    storage?.setItem(key, value)
  } catch {
    // Storage may be unavailable in private browsing or embedded webviews.
  }
}

export function getTelemetrySessionId() {
  const existing = safeStorageGet(globalThis.sessionStorage, SESSION_STORAGE_KEY)
  if (existing) return existing
  const next = createId("sess")
  safeStorageSet(globalThis.sessionStorage, SESSION_STORAGE_KEY, next)
  return next
}

export function getTelemetryAnonymousId() {
  const existing = safeStorageGet(globalThis.localStorage, LOCAL_STORAGE_KEY)
  if (existing) return existing
  const next = createId("anon")
  safeStorageSet(globalThis.localStorage, LOCAL_STORAGE_KEY, next)
  return next
}

export function setTelemetryUserContext(role: string | null | undefined) {
  userRole = role ?? null
}

export function sanitizeTelemetryMetadata(input: Record<string, unknown> = {}) {
  return Object.fromEntries(
    Object.entries(input)
      .slice(0, 20)
      .map(([key, value]) => {
        const safeKey = key.slice(0, 80)
        if (typeof value === "string") return [safeKey, value.slice(0, 300)]
        if (typeof value === "number" || typeof value === "boolean" || value === null) {
          return [safeKey, value]
        }
        return [safeKey, String(value).slice(0, 300)]
      }),
  )
}

function currentRoute() {
  if (typeof window === "undefined") return "/"
  return `${window.location.pathname}${window.location.search}`
}

function buildCollectorPayload(event: TelemetryEventPayload): TelemetryCollectorPayload {
  return {
    ...event,
    schemaVersion: 1,
    route: event.route ?? currentRoute(),
    role: userRole,
    sessionId: getTelemetrySessionId(),
    anonymousId: getTelemetryAnonymousId(),
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    viewport: {
      width: typeof window === "undefined" ? 0 : window.innerWidth,
      height: typeof window === "undefined" ? 0 : window.innerHeight,
    },
    referrer: typeof document === "undefined" ? null : document.referrer || null,
    release: import.meta.env.VITE_APP_RELEASE || import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA || null,
    metadata: sanitizeTelemetryMetadata(event.metadata),
  }
}

export async function recordTelemetryEvent(event: TelemetryEventPayload) {
  if (!isFirebaseConfigured || !functions || collectorDisabled) return

  try {
    const callable = httpsCallable<TelemetryCollectorPayload, { ok: boolean; eventId: string }>(
      functions,
      "recordTelemetryEvent",
    )
    await callable(buildCollectorPayload(event))
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[observability] telemetry event was not recorded", error)
    }
  }
}

export function disableTelemetryForSession() {
  collectorDisabled = true
}

