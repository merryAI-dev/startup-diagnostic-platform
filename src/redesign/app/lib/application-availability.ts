import type { Application, Consultant, OfficeHourSlot } from "@/redesign/app/lib/types"

export function normalizeTimeKey(value?: string): string {
  if (!value) return ""
  const [hourRaw, minuteRaw] = value.trim().split(":")
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  if (Number.isNaN(hour) || Number.isNaN(minute)) return value.trim()
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

export function normalizeApplicationStatus(status?: Application["status"]): Application["status"] {
  return status === "review" ? "pending" : (status ?? "pending")
}

export function isConsultantAvailableAt(
  consultant: Consultant,
  dateKey: string,
  time: string,
): boolean {
  if (!dateKey || !time) return false
  const targetDate = new Date(dateKey)
  if (Number.isNaN(targetDate.getTime())) return false
  const dayOfWeek = targetDate.getDay()
  const dayAvailability = consultant.availability.find(
    (availability) => availability.dayOfWeek === dayOfWeek,
  )
  if (!dayAvailability) return false
  const normalizedTime = normalizeTimeKey(time)
  return dayAvailability.slots.some(
    (slot) => normalizeTimeKey(slot.start) === normalizedTime && slot.available,
  )
}

export function getReservedConsultantId(
  application: Application,
  officeHourSlots: OfficeHourSlot[],
): string | undefined {
  if (application.consultantId) return application.consultantId
  if (!application.officeHourSlotId) return undefined
  return officeHourSlots.find((slot) => slot.id === application.officeHourSlotId)?.consultantId
}

export function getAssignableConsultantsAt(params: {
  consultants: Consultant[]
  applications: Application[]
  officeHourSlots: OfficeHourSlot[]
  agendaId: string
  dateKey: string
  time: string
  slotConsultantId?: string
}): Consultant[] {
  const { consultants, applications, officeHourSlots, agendaId, dateKey, time, slotConsultantId } = params
  const normalizedTime = normalizeTimeKey(time)
  const linkedConsultants = consultants.filter(
    (consultant) =>
      consultant.status === "active" && (consultant.agendaIds ?? []).includes(agendaId),
  )

  return linkedConsultants.filter((consultant) => {
    if (slotConsultantId && consultant.id !== slotConsultantId) {
      return false
    }
    if (!isConsultantAvailableAt(consultant, dateKey, normalizedTime)) {
      return false
    }

    return !applications.some((application) => {
      const normalizedStatus = normalizeApplicationStatus(application.status)
      if (
        normalizedStatus !== "pending" &&
        normalizedStatus !== "confirmed" &&
        normalizedStatus !== "completed"
      ) {
        return false
      }
      if (!application.scheduledDate || !application.scheduledTime) return false
      if (application.scheduledDate !== dateKey) return false
      if (normalizeTimeKey(application.scheduledTime) !== normalizedTime) return false

      return getReservedConsultantId(application, officeHourSlots) === consultant.id
    })
  })
}
