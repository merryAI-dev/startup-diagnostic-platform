import type { Application } from "@/redesign/app/lib/types"
import { endOfLocalDateKey, parseLocalDateTimeKey } from "@/redesign/app/lib/date-keys"

export function getApplicationSessionTransitionTime(app: Application): Date | null {
  if (app.scheduledDate && app.scheduledTime) {
    return parseLocalDateTimeKey(app.scheduledDate, app.scheduledTime)
  }

  if (app.scheduledDate) {
    const fallback = endOfLocalDateKey(app.scheduledDate)
    if (fallback) {
      return fallback
    }
  }

  return null
}

export function hasApplicationSessionStarted(app: Application, now = new Date()) {
  const transitionTime = getApplicationSessionTransitionTime(app)
  return Boolean(transitionTime && now >= transitionTime)
}

export function canWriteApplicationReport(app: Application, now = new Date()) {
  if (!app.scheduledDate || app.status === "cancelled") return false

  if (app.type === "irregular") {
    return hasApplicationSessionStarted(app, now)
  }

  return app.status === "completed"
}
