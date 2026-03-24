export function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function parseLocalDateKey(value?: string | null): Date | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value.trim())
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const parsed = new Date(year, month - 1, day)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const fallback = new Date(value)
  return Number.isNaN(fallback.getTime()) ? null : fallback
}

export function parseLocalDateTimeKey(
  dateKey?: string | null,
  timeKey?: string | null,
): Date | null {
  const date = parseLocalDateKey(dateKey)
  if (!date || !timeKey) return null

  const [hourRaw, minuteRaw] = timeKey.trim().split(":")
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hour,
    minute,
    0,
    0,
  )
}

export function endOfLocalDateKey(value?: string | null): Date | null {
  const date = parseLocalDateKey(value)
  if (!date) return null

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    0,
    0,
  )
}
