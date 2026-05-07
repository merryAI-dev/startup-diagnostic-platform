export const REGULAR_OFFICE_HOUR_WEEK_NUMBERS: number[]
export const CONSULTANT_SCHEDULE_OPEN_WEEK_NUMBER: number
export const COMPANY_APPLICATION_OPEN_WEEK_NUMBER: number
export const INTERNAL_DAY_NUMBERS: number[]
export const EXTERNAL_DAY_NUMBERS: number[]
export const ALL_DAY_NUMBERS: number[]
export const SEOUL_TIME_ZONE: string

export function isDateKey(value: unknown): boolean
export function isMonthKey(value: unknown): boolean
export function parseDateKey(value: string): Date | null
export function parseMonthKey(value: string): Date | null
export function formatDateKey(value: Date): string
export function formatMonthKey(value: Date): string
export function getMonthKeyFromDateKey(value: string): string
export function getOfficeHourWeekInfo(
  value: string | Date,
): {
  date: Date
  weekStart: Date
  weekThursday: Date
  monthKey: string
  weekOfMonth: number
} | null
export function getScopeDayNumbers(scope?: "internal" | "external"): number[]
export function isRegularOfficeHourDateForScope(
  dateKey: string,
  scope?: "internal" | "external",
): boolean
export function getRegularOfficeHourDateKeysForMonth(
  monthKey: string,
  scope?: "internal" | "external",
): string[]
export function getNextMonthKey(value: Date): string
export function canConsultantEditMonthlyAvailability(targetMonthKey: string, now: Date): boolean
export function canCompanyManageRegularApplication(targetMonthKey: string, now: Date): boolean
export function canCompanyApplyForRegularDate(dateKey: string, now: Date): boolean
