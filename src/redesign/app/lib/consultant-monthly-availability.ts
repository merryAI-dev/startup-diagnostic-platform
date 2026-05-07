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

export function buildDefaultConsultantAvailability(dayNumbers: number[]): ConsultantAvailability[] {
  return uniqueNumbers(dayNumbers).map((dayOfWeek) => ({
    dayOfWeek,
    slots: TIME_SLOTS.map((slot) => ({
      start: slot.start,
      end: slot.end,
      available: false,
    })),
  }))
}

export function normalizeConsultantAvailabilityForDays(
  input: ConsultantAvailability[] | undefined,
  dayNumbers: number[],
): ConsultantAvailability[] {
  const base = buildDefaultConsultantAvailability(dayNumbers)
  if (!input || input.length === 0) return base

  return base.map((baseDay) => {
    const found = input.find((item) => item.dayOfWeek === baseDay.dayOfWeek)
    if (!found) return baseDay
    return {
      ...baseDay,
      slots: baseDay.slots.map((baseSlot) => {
        const existing = found.slots.find(
          (slot) => slot.start === baseSlot.start && slot.end === baseSlot.end,
        )
        return existing ?? baseSlot
      }),
    }
  })
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
  return normalizeConsultantAvailabilityForDays(normalizedMap[monthKey], dayNumbers)
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

export function countAvailableSlots(availability: ConsultantAvailability[]): number {
  return availability.reduce((sum, day) => {
    return sum + day.slots.filter((slot) => slot.available).length
  }, 0)
}
