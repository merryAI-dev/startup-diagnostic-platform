export const SEOUL_TIME_ZONE = "Asia/Seoul"
export const REGULAR_OFFICE_HOUR_WEEK_NUMBERS = [2, 4]
export const CONSULTANT_SCHEDULE_OPEN_WEEK_NUMBER = 3
export const COMPANY_APPLICATION_OPEN_WEEK_NUMBER = 4
export const INTERNAL_DAY_NUMBERS = [2, 3]
export const EXTERNAL_DAY_NUMBERS = [4]
export const ALL_DAY_NUMBERS = [2, 3, 4]
const STAGE_PROJECT_ID = "startup-diagnosis-platform"
const PILOT_REGULAR_OFFICE_HOUR_MONTH_KEY = "2026-06"
const PILOT_CONSULTANT_REGISTRATION_START_DATE_KEY = "2026-05-20"
const PILOT_CONSULTANT_REGISTRATION_END_DATE_KEY = "2026-05-28"
const PILOT_COMPANY_APPLICATION_START_DATE_KEY = "2026-05-29"
const PILOT_COMPANY_APPLICATION_END_DATE_KEY = "2026-06-04"

function padNumber(value: number): string {
  return String(value).padStart(2, "0")
}

function normalizeDateKey(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeMonthKey(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

export function isDateKey(value: unknown): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizeDateKey(value))
}

export function isMonthKey(value: unknown): boolean {
  return /^\d{4}-\d{2}$/.test(normalizeMonthKey(value))
}

function buildSeoulMiddayDate(year: number, month: number, day: number): Date | null {
  const parsed = new Date(`${year}-${padNumber(month)}-${padNumber(day)}T12:00:00+09:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getSeoulDateParts(value: Date | string | number): { year: number; month: number; day: number } | null {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  const parts = formatter.formatToParts(date)
  const year = Number(parts.find((part) => part.type === "year")?.value)
  const month = Number(parts.find((part) => part.type === "month")?.value)
  const day = Number(parts.find((part) => part.type === "day")?.value)

  if (!year || !month || !day) {
    return null
  }

  return { year, month, day }
}

function getSeoulTodayDate(value: Date | string | number): Date | null {
  const parts = getSeoulDateParts(value)
  if (!parts) {
    return null
  }
  return buildSeoulMiddayDate(parts.year, parts.month, parts.day)
}

export function parseDateKey(dateKey: string): Date | null {
  if (!isDateKey(dateKey)) {
    return null
  }

  const [yearRaw, monthRaw, dayRaw] = dateKey.split("-")
  return buildSeoulMiddayDate(Number(yearRaw), Number(monthRaw), Number(dayRaw))
}

export function parseMonthKey(monthKey: string): Date | null {
  if (!isMonthKey(monthKey)) {
    return null
  }

  const [yearRaw, monthRaw] = monthKey.split("-")
  return buildSeoulMiddayDate(Number(yearRaw), Number(monthRaw), 1)
}

export function formatDateKey(date: Date): string {
  const parts = getSeoulDateParts(date)
  if (!parts) {
    return ""
  }
  return `${parts.year}-${padNumber(parts.month)}-${padNumber(parts.day)}`
}

export function formatMonthKey(date: Date): string {
  const parts = getSeoulDateParts(date)
  if (!parts) {
    return ""
  }
  return `${parts.year}-${padNumber(parts.month)}`
}

export function getMonthKeyFromDateKey(dateKey: string): string {
  const parsed = parseDateKey(dateKey)
  return parsed ? formatMonthKey(parsed) : ""
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date.getTime())
  next.setDate(next.getDate() + amount)
  return next
}

function addMonths(date: Date, amount: number): Date | null {
  const parts = getSeoulDateParts(date)
  if (!parts) {
    return null
  }
  return buildSeoulMiddayDate(parts.year, parts.month + amount, 1)
}

function getWeekStartMonday(date: Date): Date {
  const currentDay = date.getDay()
  const diff = currentDay === 0 ? -6 : 1 - currentDay
  return addDays(date, diff)
}

function getFirstThursdayOfMonth(monthStart: Date): Date {
  const currentDay = monthStart.getDay()
  const daysUntilThursday = (4 - currentDay + 7) % 7
  return addDays(monthStart, daysUntilThursday)
}

export function getOfficeHourWeekInfo(
  value: string | Date,
): {
  date: Date
  weekStart: Date
  weekThursday: Date
  monthKey: string
  weekOfMonth: number
} | null {
  const sourceDate =
    typeof value === "string"
      ? parseDateKey(value)
      : getSeoulTodayDate(value instanceof Date ? value : new Date(value))
  if (!sourceDate) {
    return null
  }

  const weekStart = getWeekStartMonday(sourceDate)
  const weekThursday = addDays(weekStart, 3)
  const monthKey = formatMonthKey(weekThursday)
  const monthStart = parseMonthKey(monthKey)
  if (!monthStart) {
    return null
  }

  const firstWeekThursday = getFirstThursdayOfMonth(monthStart)
  const weekOfMonth =
    Math.floor((weekThursday.getTime() - firstWeekThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1

  return {
    date: sourceDate,
    weekStart,
    weekThursday,
    monthKey,
    weekOfMonth,
  }
}

export function getScopeDayNumbers(scope?: "internal" | "external"): number[] {
  if (scope === "external") {
    return [...EXTERNAL_DAY_NUMBERS]
  }
  if (scope === "internal") {
    return [...INTERNAL_DAY_NUMBERS]
  }
  return [...ALL_DAY_NUMBERS]
}

export function isRegularOfficeHourDateForScope(
  dateKey: string,
  scope?: "internal" | "external",
): boolean {
  const parsed = parseDateKey(dateKey)
  if (!parsed) {
    return false
  }

  const weekInfo = getOfficeHourWeekInfo(parsed)
  if (!weekInfo) {
    return false
  }

  if (!REGULAR_OFFICE_HOUR_WEEK_NUMBERS.includes(weekInfo.weekOfMonth)) {
    return false
  }

  return getScopeDayNumbers(scope).includes(parsed.getDay())
}

export function getRegularOfficeHourDateKeysForMonth(
  monthKey: string,
  scope?: "internal" | "external",
): string[] {
  const monthStart = parseMonthKey(monthKey)
  if (!monthStart) {
    return []
  }

  const targetMonthKey = formatMonthKey(monthStart)
  const nextMonth = addMonths(monthStart, 1)
  if (!nextMonth) {
    return []
  }

  const dates: string[] = []
  let cursor = new Date(monthStart.getTime())
  while (cursor.getTime() < nextMonth.getTime()) {
    const dateKey = formatDateKey(cursor)
    const weekInfo = getOfficeHourWeekInfo(cursor)
    if (
      weekInfo &&
      weekInfo.monthKey === targetMonthKey &&
      isRegularOfficeHourDateForScope(dateKey, scope)
    ) {
      dates.push(dateKey)
    }
    cursor = addDays(cursor, 1)
  }

  return dates
}

export function getRegularOfficeHourDateKeysForDayNumbers(
  monthKey: string,
  dayNumbers: number[],
): string[] {
  const allowedDayNumbers = Array.from(new Set(dayNumbers)).sort((a, b) => a - b)
  if (allowedDayNumbers.length === 0) {
    return []
  }

  return getRegularOfficeHourDateKeysForMonth(monthKey).filter((dateKey) => {
    const parsed = parseDateKey(dateKey)
    return Boolean(parsed && allowedDayNumbers.includes(parsed.getDay()))
  })
}

export function getNextMonthKey(value: Date): string {
  const today = getSeoulTodayDate(value)
  if (!today) {
    return ""
  }
  const nextMonth = addMonths(today, 1)
  return nextMonth ? formatMonthKey(nextMonth) : ""
}

function isDateKeyInRange(dateKey: string, startDateKey: string, endDateKey: string): boolean {
  return isDateKey(dateKey) && dateKey >= startDateKey && dateKey <= endDateKey
}

type RegularOfficeHourWindowKind = "pilot" | "regular"

export type RegularOfficeHourWindow = {
  targetMonthKey: string
  startDateKey: string
  endDateKey: string
  startDate: Date | null
  endDate: Date | null
  kind: RegularOfficeHourWindowKind
}

function buildWindow(
  targetMonthKey: string,
  startDateKey: string,
  endDateKey: string,
  kind: RegularOfficeHourWindowKind,
): RegularOfficeHourWindow {
  return {
    targetMonthKey,
    startDateKey,
    endDateKey,
    startDate: parseDateKey(startDateKey),
    endDate: parseDateKey(endDateKey),
    kind,
  }
}

export function getCompanyApplicationWindow(now: Date): RegularOfficeHourWindow | null {
  const todayKey = formatDateKey(now)
  if (
    isDateKeyInRange(
      todayKey,
      PILOT_COMPANY_APPLICATION_START_DATE_KEY,
      PILOT_COMPANY_APPLICATION_END_DATE_KEY,
    )
  ) {
    return buildWindow(
      PILOT_REGULAR_OFFICE_HOUR_MONTH_KEY,
      PILOT_COMPANY_APPLICATION_START_DATE_KEY,
      PILOT_COMPANY_APPLICATION_END_DATE_KEY,
      "pilot",
    )
  }

  const targetMonthKey = getNextMonthKey(now)
  if (!canCompanyManageRegularApplication(targetMonthKey, now)) {
    return null
  }

  const weekInfo = getOfficeHourWeekInfo(now)
  if (!weekInfo) {
    return null
  }

  const startDateKey = formatDateKey(weekInfo.weekStart)
  const endDateKey = formatDateKey(addDays(weekInfo.weekStart, 6))
  return buildWindow(targetMonthKey, startDateKey, endDateKey, "regular")
}

export function shouldDispatchCompanyApplicationAlert(now: Date): boolean {
  const todayKey = formatDateKey(now)
  if (todayKey === PILOT_COMPANY_APPLICATION_START_DATE_KEY) {
    return true
  }

  if (getNextMonthKey(now) === PILOT_REGULAR_OFFICE_HOUR_MONTH_KEY) {
    return false
  }

  const weekInfo = getOfficeHourWeekInfo(now)
  return Boolean(
    weekInfo &&
      weekInfo.weekOfMonth === COMPANY_APPLICATION_OPEN_WEEK_NUMBER &&
      weekInfo.date.getDay() === 1,
  )
}

export function shouldDispatchConsultantScheduleRegistrationAlert(now: Date): boolean {
  if (getNextMonthKey(now) === PILOT_REGULAR_OFFICE_HOUR_MONTH_KEY) {
    return false
  }

  const weekInfo = getOfficeHourWeekInfo(now)
  return Boolean(
    weekInfo &&
      weekInfo.weekOfMonth === CONSULTANT_SCHEDULE_OPEN_WEEK_NUMBER &&
      weekInfo.date.getDay() === 1,
  )
}

function isRegularOfficeHourWindowOverrideEnabled(): boolean {
  if (import.meta.env.VITE_REGULAR_OFFICE_HOUR_TESTING === "true") {
    return true
  }

  return import.meta.env.VITE_FIREBASE_PROJECT_ID === STAGE_PROJECT_ID
}

export function canConsultantEditMonthlyAvailability(targetMonthKey: string, now: Date): boolean {
  if (!isMonthKey(targetMonthKey)) {
    return false
  }

  if (isRegularOfficeHourWindowOverrideEnabled()) {
    return targetMonthKey === getNextMonthKey(now)
  }

  const todayKey = formatDateKey(now)
  if (targetMonthKey === PILOT_REGULAR_OFFICE_HOUR_MONTH_KEY) {
    return isDateKeyInRange(
      todayKey,
      PILOT_CONSULTANT_REGISTRATION_START_DATE_KEY,
      PILOT_CONSULTANT_REGISTRATION_END_DATE_KEY,
    )
  }

  const weekInfo = getOfficeHourWeekInfo(now)
  if (!weekInfo) {
    return false
  }

  return (
    weekInfo.weekOfMonth === CONSULTANT_SCHEDULE_OPEN_WEEK_NUMBER &&
    targetMonthKey === getNextMonthKey(now)
  )
}

export function canCompanyManageRegularApplication(targetMonthKey: string, now: Date): boolean {
  if (!isMonthKey(targetMonthKey)) {
    return false
  }

  if (isRegularOfficeHourWindowOverrideEnabled()) {
    return targetMonthKey === getNextMonthKey(now)
  }

  const todayKey = formatDateKey(now)
  if (targetMonthKey === PILOT_REGULAR_OFFICE_HOUR_MONTH_KEY) {
    return isDateKeyInRange(
      todayKey,
      PILOT_COMPANY_APPLICATION_START_DATE_KEY,
      PILOT_COMPANY_APPLICATION_END_DATE_KEY,
    )
  }

  const weekInfo = getOfficeHourWeekInfo(now)
  if (!weekInfo) {
    return false
  }

  return (
    weekInfo.weekOfMonth === COMPANY_APPLICATION_OPEN_WEEK_NUMBER &&
    targetMonthKey === getNextMonthKey(now)
  )
}

export function canCompanyApplyForRegularDate(dateKey: string, now: Date): boolean {
  const monthKey = getMonthKeyFromDateKey(dateKey)
  if (!monthKey) {
    return false
  }
  return canCompanyManageRegularApplication(monthKey, now)
}
