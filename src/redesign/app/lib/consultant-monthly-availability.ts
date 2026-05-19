import type {
  Agenda,
  Consultant,
  ConsultantAvailability,
  ConsultantMonthlyAvailability,
} from "@/redesign/app/lib/types"
import * as regularOfficeHourPolicy from "@/redesign/app/lib/regular-office-hour-policy"

const TIME_SLOTS = Array.from({ length: 9 }, (_, index) => {
  const startHour = 9 + index
  const endHour = startHour + 1
  return {
    start: `${String(startHour).padStart(2, "0")}:00`,
    end: `${String(endHour).padStart(2, "0")}:00`,
  }
})

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b)
}

function normalizeTimeKey(value?: string): string {
  if (!value) return ""
  const [hourRaw, minuteRaw] = value.trim().split(":")
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  if (Number.isNaN(hour) || Number.isNaN(minute)) return value.trim()
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

export function getConsultantScheduleDayNumbers(params: {
  agendaIds?: string[]
  agendas?: Agenda[]
  scope?: "internal" | "external"
}): number[] {
  const { agendaIds = [], agendas = [], scope } = params
  if (scope) {
    return [...regularOfficeHourPolicy.getScopeDayNumbers(scope)]
  }
  if (agendaIds.length === 0 || agendas.length === 0) {
    return [...regularOfficeHourPolicy.ALL_DAY_NUMBERS]
  }

  const agendaMap = new Map(agendas.map((agenda) => [agenda.id, agenda]))
  const dayNumbers = agendaIds.flatMap((agendaId) => {
    const agenda = agendaMap.get(agendaId)
    return regularOfficeHourPolicy.getScopeDayNumbers(agenda?.scope)
  })

  const normalized = uniqueNumbers(dayNumbers)
  if (normalized.length > 0) {
    return normalized
  }
  return [...regularOfficeHourPolicy.ALL_DAY_NUMBERS]
}

export function buildDefaultConsultantAvailability(
  dayNumbers: number[],
  dateKeys?: string[],
): ConsultantAvailability[] {
  const normalizedDateKeys = Array.from(new Set(dateKeys ?? [])).sort((a, b) => a.localeCompare(b))
  if (normalizedDateKeys.length > 0) {
    return normalizedDateKeys.map((dateKey) => {
      const parsed = regularOfficeHourPolicy.parseDateKey(dateKey)
      return {
        dayOfWeek: parsed?.getDay() ?? 0,
        dateKey,
        slots: TIME_SLOTS.map((slot) => ({
          start: slot.start,
          end: slot.end,
          available: false,
        })),
      }
    })
  }

  return uniqueNumbers(dayNumbers).map((dayOfWeek) => ({
    dayOfWeek,
    slots: TIME_SLOTS.map((slot) => ({
      start: slot.start,
      end: slot.end,
      available: false,
    })),
  }))
}

function normalizeConsultantAvailabilityWithDefaults(
  input: ConsultantAvailability[] | undefined,
  defaults: ConsultantAvailability[],
  useDateKeyMatching: boolean,
): ConsultantAvailability[] {
  if (!input || input.length === 0) return defaults

  return defaults.map((defaultDay) => {
    const found = input.find((item) => {
      if (useDateKeyMatching && defaultDay.dateKey) {
        return item.dateKey === defaultDay.dateKey
      }
      return item.dayOfWeek === defaultDay.dayOfWeek
    })
    if (!found) return defaultDay

    return {
      ...defaultDay,
      slots: defaultDay.slots.map((baseSlot) => {
        const existing = found.slots.find(
          (slot) =>
            normalizeTimeKey(slot.start) === baseSlot.start &&
            normalizeTimeKey(slot.end) === baseSlot.end,
        )
        return existing
          ? {
              ...baseSlot,
              available: existing.available === true,
            }
          : baseSlot
      }),
    }
  })
}

export function normalizeConsultantAvailabilityForDays(
  input: ConsultantAvailability[] | undefined,
  dayNumbers: number[],
): ConsultantAvailability[] {
  const base = buildDefaultConsultantAvailability(dayNumbers)
  return normalizeConsultantAvailabilityWithDefaults(input, base, false)
}

export function normalizeMonthlyAvailabilityMap(
  value: ConsultantMonthlyAvailability | undefined,
): ConsultantMonthlyAvailability {
  if (!value || typeof value !== "object") {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value).filter(([monthKey]) => regularOfficeHourPolicy.isMonthKey(monthKey)),
  )
}

export function getMonthlyAvailabilityForMonth(
  monthlyAvailability: ConsultantMonthlyAvailability | undefined,
  monthKey: string,
  dayNumbers: number[],
): ConsultantAvailability[] {
  const normalizedMap = normalizeMonthlyAvailabilityMap(monthlyAvailability)
  const regularDateKeys = regularOfficeHourPolicy.getRegularOfficeHourDateKeysForDayNumbers(
    monthKey,
    dayNumbers,
  )
  const defaults = buildDefaultConsultantAvailability(dayNumbers, regularDateKeys)
  const monthAvailability = normalizedMap[monthKey]

  if (defaults.length === 0) {
    return normalizeConsultantAvailabilityForDays(monthAvailability, dayNumbers)
  }

  return normalizeConsultantAvailabilityWithDefaults(
    monthAvailability,
    defaults,
    true,
  )
}

export function getConsultantAvailabilityForDate(
  consultant: Pick<Consultant, "monthlyAvailability">,
  dateKey: string,
  dayNumbers: number[],
): ConsultantAvailability[] {
  const monthKey = regularOfficeHourPolicy.getMonthKeyFromDateKey(dateKey)
  if (!monthKey) {
    return buildDefaultConsultantAvailability(dayNumbers)
  }
  return getMonthlyAvailabilityForMonth(consultant.monthlyAvailability, monthKey, dayNumbers)
}

export function findConsultantAvailabilityEntryForDate(
  availability: ConsultantAvailability[],
  dateKey: string,
): ConsultantAvailability | null {
  const exactMatch = availability.find((item) => item.dateKey === dateKey)
  if (exactMatch) {
    return exactMatch
  }
  return null
}

export function countAvailableSlots(availability: ConsultantAvailability[]): number {
  return availability.reduce((sum, day) => {
    return sum + day.slots.filter((slot) => slot.available).length
  }, 0)
}
