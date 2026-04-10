import type { Application, Consultant } from "@/redesign/app/lib/types"
import { parseLocalDateKey } from "@/redesign/app/lib/date-keys"

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

export function isApplicantReservedStatus(status?: Application["status"]): boolean {
  const normalizedStatus = normalizeApplicationStatus(status)
  return normalizedStatus === "pending" || normalizedStatus === "confirmed"
}

export function isConsultantAvailableAt(
  consultant: Consultant,
  dateKey: string,
  time: string,
): boolean {
  if (!dateKey || !time) return false
  const targetDate = parseLocalDateKey(dateKey)
  if (!targetDate) return false
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

export function getPendingConsultantIds(application: Application): string[] {
  const explicitPendingIds = Array.isArray(application.pendingConsultantIds)
    ? application.pendingConsultantIds
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    : []
  return Array.from(new Set(explicitPendingIds))
}

export function isApplicationTargetingConsultant(
  application: Application,
  consultantId?: string | null,
): boolean {
  if (!consultantId) return false
  if (application.consultantId === consultantId) return true
  return getPendingConsultantIds(application).includes(consultantId)
}

export function getAssignableConsultantsAt(params: {
  consultants: Consultant[]
  applications: Application[]
  agendaId: string
  dateKey: string
  time: string
  slotConsultantId?: string
}): Consultant[] {
  const { consultants, applications, agendaId, dateKey, time, slotConsultantId } = params
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

      const pendingConsultantIds = getPendingConsultantIds(application)
      if (normalizedStatus === "pending" && pendingConsultantIds.length > 0) {
        return pendingConsultantIds.includes(consultant.id)
      }
      return application.consultantId === consultant.id
    })
  })
}

export function hasScheduledConsultantForPendingApplication(params: {
  application: Application
  consultants: Consultant[]
}): boolean {
  const { application, consultants } = params
  if (!application.agendaId || !application.scheduledDate || !application.scheduledTime) {
    return false
  }

  return consultants.some(
    (consultant) =>
      consultant.status === "active" &&
      (consultant.agendaIds ?? []).includes(application.agendaId!) &&
      isConsultantAvailableAt(consultant, application.scheduledDate!, application.scheduledTime!),
  )
}

export function hasApplicantConflictAt(params: {
  applications: Application[]
  dateKey: string
  time: string
  createdByUid?: string | null
  companyId?: string | null
  applicantEmail?: string | null
}): boolean {
  const { applications, dateKey, time, createdByUid, companyId, applicantEmail } = params
  const normalizedTime = normalizeTimeKey(time)
  const normalizedEmail = applicantEmail?.trim().toLowerCase() ?? ""

  return applications.some((application) => {
    if (!isApplicantReservedStatus(application.status)) return false
    if (!application.scheduledDate || application.scheduledDate !== dateKey) return false
    if (!application.scheduledTime) return false
    if (normalizeTimeKey(application.scheduledTime) !== normalizedTime) return false

    if (createdByUid && application.createdByUid === createdByUid) return true
    if (companyId && application.companyId === companyId) return true
    if (
      normalizedEmail &&
      typeof application.applicantEmail === "string" &&
      application.applicantEmail.trim().toLowerCase() === normalizedEmail
    ) {
      return true
    }

    return false
  })
}
