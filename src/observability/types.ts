export type TelemetryEventType =
  | "session_start"
  | "session_end"
  | "page_view"
  | "route_dwell"
  | "user_action"
  | "button_click"
  | "link_click"
  | "form_submit"
  | "client_error"
  | "promise_rejection"
  | "react_error"
  | "function_error"
  | "firestore_error"
  | "storage_error"
  | "auth_error"

export type TelemetrySeverity = "info" | "warning" | "error" | "fatal"

export type TelemetryEventPayload = {
  eventType: TelemetryEventType
  severity?: TelemetrySeverity
  route?: string
  pageTitle?: string | null
  action?: string | null
  elementLabel?: string | null
  elementRole?: string | null
  elementTestId?: string | null
  message?: string
  errorCode?: string | null
  stack?: string | null
  componentStack?: string | null
  functionName?: string | null
  durationMs?: number | null
  metadata?: Record<string, unknown>
}

export type TelemetryCollectorPayload = TelemetryEventPayload & {
  schemaVersion: 1
  sessionId: string
  anonymousId: string
  role?: string | null
  userAgent: string
  viewport: { width: number; height: number }
  referrer: string | null
  release: string | null
}

