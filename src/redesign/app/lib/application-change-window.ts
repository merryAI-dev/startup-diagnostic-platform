import type { Application } from "@/redesign/app/lib/types"

export const APPLICATION_CHANGE_WINDOW_HOURS = 72
const APPLICATION_CHANGE_WINDOW_MS = APPLICATION_CHANGE_WINDOW_HOURS * 60 * 60 * 1000

function toDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof value === "object" && value !== null) {
    const maybeTimestamp = value as {
      toDate?: () => Date
      toMillis?: () => number
      seconds?: number
      nanoseconds?: number
    }
    if (typeof maybeTimestamp.toDate === "function") {
      const parsed = maybeTimestamp.toDate()
      return Number.isNaN(parsed.getTime()) ? null : parsed
    }
    if (typeof maybeTimestamp.toMillis === "function") {
      const parsed = new Date(maybeTimestamp.toMillis())
      return Number.isNaN(parsed.getTime()) ? null : parsed
    }
    if (typeof maybeTimestamp.seconds === "number") {
      const millis =
        maybeTimestamp.seconds * 1000 + Math.floor((maybeTimestamp.nanoseconds ?? 0) / 1_000_000)
      const parsed = new Date(millis)
      return Number.isNaN(parsed.getTime()) ? null : parsed
    }
  }
  return null
}

export function getApplicationChangeWindowDeadline(createdAt: unknown): Date | null {
  const createdAtDate = toDate(createdAt)
  if (!createdAtDate) return null
  return new Date(createdAtDate.getTime() + APPLICATION_CHANGE_WINDOW_MS)
}

export function getApplicationChangeWindowInfo(
  createdAt: unknown,
  now = new Date(),
): {
  createdAt: Date | null
  deadline: Date | null
  isOpen: boolean
} {
  const createdAtDate = toDate(createdAt)
  const deadline = getApplicationChangeWindowDeadline(createdAt)
  if (!createdAtDate || !deadline) {
    return {
      createdAt: createdAtDate,
      deadline,
      isOpen: false,
    }
  }

  return {
    createdAt: createdAtDate,
    deadline,
    isOpen: now.getTime() <= deadline.getTime(),
  }
}

export function isApplicationChangeWindowOpen(createdAt: unknown, now = new Date()): boolean {
  return getApplicationChangeWindowInfo(createdAt, now).isOpen
}

export function shouldShowApplicationChangeWindowBadge(application: Pick<Application, "status">): boolean {
  return application.status === "confirmed"
}
