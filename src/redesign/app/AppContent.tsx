import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { addDays, differenceInDays, isBefore, startOfDay } from "date-fns"
import { deleteField, serverTimestamp, where } from "firebase/firestore"
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage"
import { useAuth as useAppAuth } from "@/context/AuthContext"
import { signOutUser } from "@/firebase/auth"
import { AdminDashboard } from "@/components/dashboard/AdminDashboard"
import { CompanyDashboard } from "@/components/dashboard/CompanyDashboard"
import { ProtectedRoute } from "@/redesign/app/components/auth/protected-route"
import { Topbar } from "@/redesign/app/components/layout/topbar"
import { SidebarNav } from "@/redesign/app/components/layout/sidebar-nav"
import { DashboardCalendar } from "@/redesign/app/components/pages/dashboard-calendar"
import { RegularOfficeHoursCalendar } from "@/redesign/app/components/pages/regular-office-hours-calendar"
import { RegularOfficeHourDetail } from "@/redesign/app/components/pages/regular-office-hour-detail"
import {
  RegularApplicationWizard,
  ApplicationFormData,
} from "@/redesign/app/components/pages/regular-application-wizard"
import { IrregularOfficeHoursCalendar } from "@/redesign/app/components/pages/irregular-office-hours-calendar"
import {
  IrregularApplicationWizard,
  IrregularApplicationFormData,
} from "@/redesign/app/components/pages/irregular-application-wizard"
import { ApplicationHistoryCalendar } from "@/redesign/app/components/pages/application-history-calendar"
import { ApplicationDetail } from "@/redesign/app/components/pages/application-detail"
import { Settings } from "@/redesign/app/components/pages/settings"
import { AdminDashboardInteractive } from "@/redesign/app/components/pages/admin-dashboard-interactive"
import { AdminApplications } from "@/redesign/app/components/pages/admin-applications"
import { AdminAgendas } from "@/redesign/app/components/pages/admin-agendas"
import { AdminConsultants } from "@/redesign/app/components/pages/admin-consultants"
import { AdminUsers } from "@/redesign/app/components/pages/admin-users"
import { AdminCommunication } from "@/redesign/app/components/pages/admin-communication"
import { AdminPrograms } from "@/redesign/app/components/pages/admin-programs"
import { ConsultantsDirectory } from "@/redesign/app/components/pages/consultants-directory"
import {
  ConsultantProfileFormValues,
  ConsultantProfilePage,
} from "@/redesign/app/components/pages/consultant-profile-page"
import { PendingReportsDashboard } from "@/redesign/app/components/pages/pending-reports-dashboard"
import { OfficeHourReportForm } from "@/redesign/app/components/report/office-hour-report-form"
import { CompanyMetricsPage } from "@/redesign/app/components/pages/company-metrics-page"
import { CompanyNewsletter } from "@/redesign/app/components/pages/company-newsletter"
import { MessagesPage } from "@/redesign/app/components/pages/messages-page"
import { NotificationCenter } from "@/redesign/app/components/notifications/notification-center"
import { AIRecommendations } from "@/redesign/app/components/ai/ai-recommendations"
import { UnifiedCalendar } from "@/redesign/app/components/pages/unified-calendar"
import { GoalsKanban } from "@/redesign/app/components/pages/goals-kanban"
import { TeamCollaboration } from "@/redesign/app/components/pages/team-collaboration"
import {
  Application,
  Message,
  FileItem,
  ApplicationStatus,
  Consultant,
  MessageTemplate,
  UserWithPermissions,
  Program,
  OfficeHourReport,
  Notification,
  ChatRoom,
  ChatMessage,
  AIRecommendation,
  Goal,
  TeamMember,
  User,
  UserRole,
  Agenda,
  OfficeHourSlot,
  RegularOfficeHour,
  OfficeHourSlotStatus,
  PendingProfileApproval,
} from "@/redesign/app/lib/types"
import {
  regularOfficeHours as initialRegularOfficeHours,
  initialApplications,
  initialMessages,
  agendas as initialAgendas,
  initialConsultants,
  initialMessageTemplates,
  initialUsers,
  programs as initialPrograms,
} from "@/redesign/app/lib/data"
import {
  COLLECTIONS,
  isFirebaseConfigured,
  useFirestoreCollection,
  useFirestoreCRUD,
  useFirestoreDocument,
  useFirestoreDocumentOnce,
} from "@/redesign/app/hooks/use-firestore"
import {
  approvePendingUserViaFunction,
  cancelApplicationViaFunction,
  submitRegularApplicationViaFunction,
  transitionApplicationStatusViaFunction,
} from "@/redesign/app/lib/functions"
import {
  getAssignableConsultantsAt,
  hasScheduledConsultantForPendingApplication,
  hasApplicantConflictAt,
} from "@/redesign/app/lib/application-availability"
import {
  endOfLocalDateKey,
  formatLocalDateKey as formatSafeLocalDateKey,
  parseLocalDateKey as parseSafeLocalDateKey,
  parseLocalDateTimeKey,
} from "@/redesign/app/lib/date-keys"
import { firestoreService } from "@/redesign/app/lib/firestore-service"
import { storage as firebaseStorage } from "@/redesign/app/lib/firebase"
import {
  mockNotifications,
  mockChatRooms,
  mockChatMessages,
  mockAIRecommendations,
  mockGoals,
  mockTeamMembers,
} from "@/redesign/app/lib/advanced-mock-data"
import {
  type CompanyInfoForm,
  type CompanyInfoRecord,
  type InvestmentInput,
} from "@/types/company"
import type { SelfAssessmentSections } from "@/types/selfAssessment"
import type { ConsentSnapshot } from "@/types/auth"
import { isSelfAssessmentComplete } from "@/utils/selfAssessment"

type AppPage =
  | "dashboard"
  | "consultants"
  | "regular"
  | "irregular"
  | "history"
  | "settings"
  | "regular-detail"
  | "regular-wizard"
  | "irregular-wizard"
  | "application"
  | "admin-dashboard"
  | "admin-applications"
  | "admin-consultants"
  | "admin-users"
  | "admin-communication"
  | "admin-programs"
  | "admin-program-list"
  | "admin-agendas"
  | "pending-reports"
  | "company-metrics"
  | "company-newsletter"
  | "messages" // 새로 추가
  | "notifications" // 새로 추가
  | "ai-recommendations" // 새로 추가
  | "unified-calendar" // 새로 추가
  | "goals-kanban" // 새로 추가
  | "team-collaboration" // 새로 추가
  | "startup-diagnostic"
  | "company-info"
  | "consultant-profile"
  | "consultant-calendar"

type CompanyInfoDoc = Partial<CompanyInfoRecord>
type SelfAssessmentDoc = {
  sections?: SelfAssessmentSections | null
}

type RawProfileApprovalDoc = {
  id: string
  email?: string | null
  role?: string
  requestedRole?: string | null
  active?: boolean
  companyId?: string | null
  createdAt?: unknown
  activatedAt?: unknown
  approvedAt?: unknown
}

type SignupRequestDoc = {
  id: string
  uid?: string
  role?: string
  requestedRole?: string | null
  email?: string | null
  companyId?: string | null
  status?: string
  consents?: ConsentSnapshot | null
  consultantInfo?: Partial<ConsultantProfileFormValues> | null
  companyInfo?: Partial<CompanyInfoForm> | null
  programIds?: string[] | null
  investmentRows?: InvestmentInput[] | null
  createdAt?: unknown
  updatedAt?: unknown
}

const APPROVAL_ROLE_VALUES: PendingProfileApproval["role"][] = ["admin", "company", "consultant"]

const USER_ROLE_VALUES: UserRole[] = ["admin", "user", "consultant", "staff"]
const AUTO_REJECT_REASON = "진행 예정 시간이 지나 자동 거절되었습니다."
const AUTO_STATUS_TRANSITION_INTERVAL_MS = 60 * 60 * 1000

function toUserRole(value: unknown, fallback: UserRole = "user"): UserRole {
  if (typeof value !== "string") return fallback
  if (USER_ROLE_VALUES.includes(value as UserRole)) {
    return value as UserRole
  }
  return fallback
}

function toApprovalRole(
  value: unknown,
  fallback: PendingProfileApproval["role"] = "company",
): PendingProfileApproval["role"] {
  if (typeof value !== "string") return fallback
  if (APPROVAL_ROLE_VALUES.includes(value as PendingProfileApproval["role"])) {
    return value as PendingProfileApproval["role"]
  }
  return fallback
}

function normalizeDateValue(value: unknown): Date | string {
  if (!value) return new Date()
  if (value instanceof Date) return value
  if (typeof value === "string") return value
  if (typeof value === "number") return new Date(value)
  if (typeof value === "object" && value !== null) {
    const maybeTimestamp = value as {
      toDate?: () => Date
      toMillis?: () => number
      seconds?: number
      nanoseconds?: number
    }
    if (typeof maybeTimestamp.toDate === "function") {
      try {
        const parsedDate = maybeTimestamp.toDate.call(value)
        if (parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime())) {
          return parsedDate
        }
      } catch {
        // Ignore invalid timestamp-like objects and continue fallback checks.
      }
    }
    if (typeof maybeTimestamp.toMillis === "function") {
      try {
        const millis = maybeTimestamp.toMillis.call(value)
        if (Number.isFinite(millis)) {
          return new Date(millis)
        }
      } catch {
        // Ignore invalid timestamp-like objects and continue fallback checks.
      }
    }
    if (typeof maybeTimestamp.seconds === "number") {
      const nanos = typeof maybeTimestamp.nanoseconds === "number" ? maybeTimestamp.nanoseconds : 0
      return new Date(maybeTimestamp.seconds * 1000 + Math.floor(nanos / 1_000_000))
    }
  }
  return new Date()
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function buildDefaultConsultantAvailability(): Consultant["availability"] {
  const scheduleDays = [
    { value: 2, label: "화" },
    { value: 4, label: "목" },
  ] as const
  const timeSlots = Array.from({ length: 9 }, (_, index) => {
    const startHour = 9 + index
    const endHour = startHour + 1
    return {
      start: `${String(startHour).padStart(2, "0")}:00`,
      end: `${String(endHour).padStart(2, "0")}:00`,
    }
  })
  return scheduleDays.map((day) => ({
    dayOfWeek: day.value,
    slots: timeSlots.map((slot) => ({
      start: slot.start,
      end: slot.end,
      available: false,
    })),
  }))
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function parseDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year || 1970, (month || 1) - 1, day || 1)
}

function isDateKey(value?: string): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value)
}

function normalizeDateKey(value?: string): string | null {
  const raw = typeof value === "string" ? value : ""
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (isDateKey(trimmed)) return trimmed

  const normalized = raw.replace(/[./\s]+/g, "-").trim()
  const parts = normalized.split("-").filter(Boolean)
  if (parts.length !== 3) return null

  let [yearRaw, monthRaw, dayRaw] = parts
  if (!yearRaw || !monthRaw || !dayRaw) return null

  if (yearRaw.length === 2) {
    const yearNum = Number(yearRaw)
    if (Number.isNaN(yearNum)) return null
    yearRaw = String(yearNum <= 69 ? 2000 + yearNum : 1900 + yearNum)
  }

  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null
  }

  const normalizedDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  return isDateKey(normalizedDate) ? normalizedDate : null
}

function getTimeValue(value?: Date | string): number {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

function toNormalizedEmail(value?: string | null): string {
  return (value ?? "").trim().toLowerCase()
}

function normalizeConsultantDisplayName(value?: string | null): string {
  return (value ?? "")
    .replace(/\s*컨설턴트\s*$/u, "")
    .trim()
    .toLowerCase()
}

function buildAvailabilitySlotKey(dayOfWeek: number, timeKey: string): string {
  return `${dayOfWeek}:${normalizeTimeKey(timeKey)}`
}

function normalizeTimeKey(value?: string): string {
  if (!value) return ""
  const [hourRaw, minuteRaw] = value.trim().split(":")
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  if (Number.isNaN(hour) || Number.isNaN(minute)) return value.trim()
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

function isConsultantAvailableAt(consultant: Consultant, dateKey: string, time: string): boolean {
  if (!isDateKey(dateKey) || !time) return false
  const dayOfWeek = parseDateKey(dateKey).getDay()
  const dayAvailability = consultant.availability.find(
    (availability) => availability.dayOfWeek === dayOfWeek,
  )
  if (!dayAvailability) return false
  return dayAvailability.slots.some((slot) => slot.start === time && slot.available)
}

function parseExpertiseInput(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function getWeekdayNumbers(weekdays?: Program["weekdays"]): number[] {
  const source = weekdays && weekdays.length > 0 ? weekdays : ["TUE", "THU"]
  const numbers: number[] = []
  source.forEach((weekday) => {
    if (weekday === "TUE") numbers.push(2)
    if (weekday === "THU") numbers.push(4)
  })
  return numbers.length > 0 ? numbers : [2, 4]
}

function isProgramDateAllowed(program: Program | undefined, dateKey: string): boolean {
  if (!program || !isDateKey(dateKey)) return false
  const targetDate = parseDateKey(dateKey)
  return new Set(getWeekdayNumbers(program.weekdays)).has(targetDate.getDay())
}

function sortOfficeHourSlots(slots: OfficeHourSlot[]): OfficeHourSlot[] {
  return [...slots].sort((a, b) => {
    const dateComp = a.date.localeCompare(b.date)
    if (dateComp !== 0) return dateComp
    const startComp = a.startTime.localeCompare(b.startTime)
    if (startComp !== 0) return startComp
    return a.consultantName.localeCompare(b.consultantName)
  })
}

function buildRegularSlotId(
  programId: string,
  consultantId: string,
  dateKey: string,
  startTime: string,
): string {
  return ["regular", programId, consultantId, dateKey, normalizeTimeKey(startTime)]
    .join("_")
    .replace(/:/g, "-")
}

function buildManagedRegularSlots(
  programs: Program[],
  consultants: Consultant[],
  agendas: Agenda[],
  existingSlots: OfficeHourSlot[],
) {
  const activeAgendaIds = agendas
    .filter((agenda) => agenda.active !== false)
    .map((agenda) => agenda.id)
  const linkedConsultants = consultants.filter((consultant) => {
    if (consultant.status !== "active") return false
    const consultantAgendaIds = consultant.agendaIds ?? []
    return consultantAgendaIds.some((agendaId) => activeAgendaIds.includes(agendaId))
  })
  const existingSlotsById = new Map(existingSlots.map((slot) => [slot.id, slot]))
  const desiredSlots: OfficeHourSlot[] = []

  programs.forEach((program) => {
    const normalizedStart = normalizeDateKey(program.periodStart)
    const normalizedEnd = normalizeDateKey(program.periodEnd)
    if (!normalizedStart || !normalizedEnd) {
      return
    }

    const startDate = parseDateKey(normalizedStart)
    const endDate = parseDateKey(normalizedEnd)
    if (startDate.getTime() > endDate.getTime()) {
      return
    }

    const weekdays = new Set(getWeekdayNumbers(program.weekdays))
    const targetDates: string[] = []
    const cursor = new Date(startDate)
    while (cursor.getTime() <= endDate.getTime()) {
      if (weekdays.has(cursor.getDay())) {
        targetDates.push(formatDateKey(cursor))
      }
      cursor.setDate(cursor.getDate() + 1)
    }

    const baseTitle = `${program.name} 정기 오피스아워`
    const baseDescription = program.description?.trim() || `${program.name} 사업`

    linkedConsultants.forEach((consultant) => {
      targetDates.forEach((dateKey) => {
        const dayOfWeek = parseDateKey(dateKey).getDay()
        const dayAvailability = consultant.availability.find(
          (availability) => availability.dayOfWeek === dayOfWeek,
        )
        if (!dayAvailability) return
        dayAvailability.slots
          .filter((slot) => slot.available)
          .forEach((slot) => {
            const slotId = buildRegularSlotId(program.id, consultant.id, dateKey, slot.start)
            const existing = existingSlotsById.get(slotId)

            desiredSlots.push({
              id: slotId,
              type: "regular",
              programId: program.id,
              consultantId: consultant.id,
              consultantName: consultant.name,
              title: baseTitle,
              description: baseDescription,
              date: dateKey,
              startTime: slot.start,
              endTime: slot.end,
              agendaIds: consultant.agendaIds ?? [],
              status: existing?.status === "booked" ? "booked" : "open",
            })
          })
      })
    })
  })

  const managedProgramIds = new Set(programs.map((program) => program.id))
  const desiredSlotIds = new Set(desiredSlots.map((slot) => slot.id))
  const mergedMap = new Map(existingSlots.map((slot) => [slot.id, slot]))
  desiredSlots.forEach((slot) => {
    mergedMap.set(slot.id, slot)
  })

  const closedSlots: OfficeHourSlot[] = []
  existingSlots.forEach((slot) => {
    if (slot.type !== "regular" || !slot.programId || !managedProgramIds.has(slot.programId)) {
      return
    }
    if (desiredSlotIds.has(slot.id) || slot.status === "booked") {
      return
    }
    const closedSlot =
      slot.status === "closed"
        ? slot
        : {
            ...slot,
            status: "closed" as const,
          }
    mergedMap.set(slot.id, closedSlot)
    closedSlots.push(closedSlot)
  })

  return {
    desiredSlots: sortOfficeHourSlots(desiredSlots),
    closedSlots: sortOfficeHourSlots(closedSlots),
    mergedSlots: sortOfficeHourSlots(Array.from(mergedMap.values())),
  }
}

function groupSlotsToRegularOfficeHours(
  slots: OfficeHourSlot[],
  programs: Program[],
): RegularOfficeHour[] {
  const grouped = new Map<string, RegularOfficeHour>()
  const programsById = new Map(programs.map((program) => [program.id, program]))

  slots.forEach((slot) => {
    if (!isDateKey(slot.date)) return
    if (slot.programId && !isProgramDateAllowed(programsById.get(slot.programId), slot.date)) {
      return
    }
    const isOpenSlot = slot.status === "open"
    const month = slot.date.slice(0, 7)
    const groupKey = [slot.programId ?? "no-program", month].join(":")
    const slotTitle = typeof slot.title === "string" ? slot.title.trim() : ""
    const officeHourTitle =
      slotTitle.length > 0 ? slotTitle : `${month.replace("-", "년 ")}월 정기 오피스아워`
    const existing = grouped.get(groupKey)
    if (!existing) {
      grouped.set(groupKey, {
        id: groupKey,
        title: officeHourTitle,
        consultant: "담당자 배정 중",
        programId: slot.programId,
        month,
        availableDates: isOpenSlot ? [slot.date] : [],
        description: slot.description?.trim() || "정기 오피스아워",
        slots: [
          {
            id: slot.id,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            consultantId: slot.consultantId,
            consultantName: slot.consultantName,
            agendaIds: slot.agendaIds,
            status: slot.status,
          },
        ],
      })
      return
    }

    const nextDates = new Set(existing.availableDates)
    if (isOpenSlot) {
      nextDates.add(slot.date)
    }
    const nextSlots = [...(existing.slots ?? [])]
    nextSlots.push({
      id: slot.id,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      consultantId: slot.consultantId,
      consultantName: slot.consultantName,
      agendaIds: slot.agendaIds,
      status: slot.status,
    })

    grouped.set(groupKey, {
      ...existing,
      availableDates: Array.from(nextDates).sort(),
      slots: nextSlots.sort((a, b) => {
        const dateComp = a.date.localeCompare(b.date)
        if (dateComp !== 0) return dateComp
        return a.startTime.localeCompare(b.startTime)
      }),
    })
  })

  return Array.from(grouped.values()).sort((a, b) => {
    const monthComp = a.month.localeCompare(b.month)
    if (monthComp !== 0) return monthComp
    const titleComp = a.title.localeCompare(b.title)
    if (titleComp !== 0) return titleComp
    return a.consultant.localeCompare(b.consultant)
  })
}

function groupProgramsToRegularOfficeHours(programs: Program[]): RegularOfficeHour[] {
  const grouped = new Map<string, RegularOfficeHour>()

  const upsertGroup = (program: Program, dateKey: string) => {
    const month = dateKey.slice(0, 7)
    const groupKey = [program.id, "unassigned", month].join(":")
    const existing = grouped.get(groupKey)
    if (!existing) {
      grouped.set(groupKey, {
        id: groupKey,
        title: `${program.name} 정기 오피스아워`,
        consultant: "담당자 배정 중",
        programId: program.id,
        month,
        availableDates: [dateKey],
        description: program.description?.trim() || `${program.name} 사업`,
      })
      return
    }

    const nextDates = new Set(existing.availableDates)
    nextDates.add(dateKey)
    grouped.set(groupKey, {
      ...existing,
      availableDates: Array.from(nextDates).sort(),
    })
  }

  programs.forEach((program) => {
    const normalizedStart = normalizeDateKey(program.periodStart)
    const normalizedEnd = normalizeDateKey(program.periodEnd)
    if (!normalizedStart || !normalizedEnd) {
      return
    }
    const startDate = parseDateKey(normalizedStart)
    const endDate = parseDateKey(normalizedEnd)
    if (startDate.getTime() > endDate.getTime()) {
      return
    }

    const weekdays = new Set(getWeekdayNumbers(program.weekdays))
    const dateKeys: string[] = []
    const cursor = new Date(startDate)
    while (cursor.getTime() <= endDate.getTime()) {
      if (weekdays.has(cursor.getDay())) {
        dateKeys.push(formatDateKey(cursor))
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    if (dateKeys.length === 0) {
      dateKeys.push(normalizedStart)
    }

    dateKeys.forEach((dateKey) => {
      upsertGroup(program, dateKey)
    })
  })

  return Array.from(grouped.values()).sort((a, b) => {
    const monthComp = a.month.localeCompare(b.month)
    if (monthComp !== 0) return monthComp
    const titleComp = a.title.localeCompare(b.title)
    if (titleComp !== 0) return titleComp
    return a.consultant.localeCompare(b.consultant)
  })
}

function normalizeSlotDoc(slot: OfficeHourSlot): OfficeHourSlot {
  return {
    ...slot,
    status: slot.status ?? "open",
    createdAt: slot.createdAt ? normalizeDateValue(slot.createdAt) : undefined,
    updatedAt: slot.updatedAt ? normalizeDateValue(slot.updatedAt) : undefined,
  }
}

function normalizeApplicationStatus(status?: ApplicationStatus): ApplicationStatus {
  if (status === "review") return "pending"
  return status ?? "pending"
}

function normalizeApplicationDoc(
  application: Application,
  resolveCompanyName?: (value?: string | null) => string | null | undefined,
): Application {
  const resolvedCompanyName = resolveCompanyName?.(application.companyName)
  return {
    ...application,
    companyName: resolvedCompanyName ?? application.companyName,
    type: application.type ?? "regular",
    status: normalizeApplicationStatus(application.status),
    consultant: application.consultant ?? "담당자 배정 중",
    officeHourTitle: application.officeHourTitle ?? "오피스아워 신청",
    sessionFormat: application.sessionFormat ?? "online",
    agenda: application.agenda ?? "미지정",
    createdAt: normalizeDateValue(application.createdAt),
    updatedAt: normalizeDateValue(application.updatedAt),
    completedAt: application.completedAt ? normalizeDateValue(application.completedAt) : undefined,
  }
}

function normalizeReportDoc(report: OfficeHourReport): OfficeHourReport {
  const toDateValue = (value: unknown): Date => {
    const normalized = normalizeDateValue(value)
    return normalized instanceof Date ? normalized : new Date(normalized)
  }
  return {
    ...report,
    consultantName: report.consultantName ?? "컨설턴트",
    date: report.date ?? "",
    location: report.location ?? "",
    topic: report.topic ?? "",
    participants: report.participants ?? [],
    content: report.content ?? "",
    followUp: report.followUp ?? "",
    photos: report.photos ?? [],
    duration: report.duration ?? 0,
    satisfaction: report.satisfaction ?? 0,
    programId: report.programId ?? "",
    createdAt: report.createdAt ? toDateValue(report.createdAt) : new Date(),
    updatedAt: report.updatedAt ? toDateValue(report.updatedAt) : new Date(),
    completedAt: report.completedAt ? toDateValue(report.completedAt) : undefined,
  }
}

function omitId<T extends { id: string }>(item: T): Omit<T, "id"> {
  const { id: _ignored, ...rest } = item
  return Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined),
  ) as Omit<T, "id">
}

export function AppContent({ roleOverride }: { roleOverride?: UserRole }) {
  const { user: firebaseUser, profile, loading, refreshProfile } = useAppAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const routeSegment = location.pathname.split("/")[2] ?? ""
  const routePage = routeSegment as AppPage
  const isCompanyInfoRoute = routeSegment === "company-info"
  useEffect(() => {
    if (!isFirebaseConfigured) return
    console.log("[Firestore] active subscriptions:", firestoreService.getActiveSubscriptionCount())
  }, [routePage])
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  const resolvedRole: UserRole =
    roleOverride ??
    (profile?.role === "admin" ? "admin" : profile?.role === "consultant" ? "consultant" : "user")
  const isAdminLikeRole =
    resolvedRole === "admin" || resolvedRole === "consultant" || resolvedRole === "staff"
  const canAutoTransitionApplications = resolvedRole === "admin" || resolvedRole === "consultant"
  const isPage = useCallback((pages: AppPage[]) => pages.includes(routePage), [routePage])
  const needsApplications = isPage([
    "dashboard",
    "history",
    "application",
    "regular",
    "regular-detail",
    "regular-wizard",
    "irregular",
    "irregular-wizard",
    "unified-calendar",
    "consultant-calendar",
    "admin-dashboard",
    "admin-applications",
    "admin-communication",
    "admin-programs",
    "pending-reports",
  ])
  const needsUsers = resolvedRole === "admin" && isPage(["admin-users"])
  const needsRegularOfficeHours = isPage(["regular", "regular-detail", "regular-wizard"])
  const needsPrograms =
    needsApplications ||
    needsRegularOfficeHours ||
    isPage(["admin-program-list", "consultant-calendar"])
  const needsAgendas =
    needsApplications ||
    needsRegularOfficeHours ||
    isPage(["admin-agendas", "admin-consultants", "admin-programs"])
  const needsConsultants =
    resolvedRole === "consultant" ||
    isPage([
      "consultants",
      "regular-wizard",
      "application",
      "dashboard",
      "admin-consultants",
      "admin-users",
      "pending-reports",
    ])
  const needsOfficeHourSlots =
    needsRegularOfficeHours || isPage(["application", "pending-reports"])
  const needsCompanyLookup = resolvedRole === "admin" && needsApplications
  const needsCompanyDirectory =
    resolvedRole === "admin" && isPage(["admin-programs", "admin-program-list"])
  const needsCompanyOwnershipLookup =
    isFirebaseConfigured && resolvedRole === "user" && !!firebaseUser?.uid
  const { data: companyDocs } = useFirestoreCollection<{
    id: string
    name?: string | null
    programs?: string[]
  }>("companies", {
    enabled:
      isFirebaseConfigured &&
      !isCompanyInfoRoute &&
      (needsCompanyLookup || needsCompanyDirectory || needsUsers),
  })
  const { data: ownedCompanyDocs, loading: ownedCompanyDocsLoading } = useFirestoreCollection<{
    id: string
    ownerUid?: string | null
  }>("companies", {
    constraints: [where("ownerUid", "==", firebaseUser?.uid ?? "")],
    enabled: needsCompanyOwnershipLookup,
  })
  const { data: companyUserDocs } = useFirestoreCollection<User>(COLLECTIONS.USERS, {
    constraints: [where("role", "==", "user")],
    enabled: isFirebaseConfigured && !isCompanyInfoRoute && needsCompanyDirectory,
  })
  const companyNameById = useMemo(() => {
    const map = new Map<string, string>()
    companyDocs.forEach((doc) => {
      const name = typeof doc.name === "string" ? doc.name.trim() : ""
      if (name) {
        map.set(doc.id, name)
      }
    })
    return map
  }, [companyDocs])
  const [profileList, setProfileList] = useState<RawProfileApprovalDoc[]>([])
  const [users, setUsers] = useState<UserWithPermissions[]>(initialUsers)
  const liveCompanyIds = useMemo(() => {
    return new Set(
      profileList
        .filter((doc) => {
          const role = toApprovalRole(doc.role)
          return role === "company" && (doc.active === true || !!doc.approvedAt) && !!doc.companyId
        })
        .map((doc) => doc.companyId!)
        .filter((companyId) => companyId.trim().length > 0),
    )
  }, [profileList])
  const companyDirectory = useMemo(() => {
    if (isFirebaseConfigured) {
      const programsByCompanyId = new Map(
        companyUserDocs.map((doc) => [doc.id, doc.programs ?? []]),
      )
      const filteredCompanyDocs = needsCompanyDirectory
        ? companyDocs.filter((doc) => liveCompanyIds.has(doc.id))
        : companyDocs
      const filteredCompanyUserDocs = needsCompanyDirectory
        ? companyUserDocs.filter((doc) => liveCompanyIds.has(doc.id))
        : companyUserDocs
      if (filteredCompanyDocs.length > 0 || needsCompanyDirectory) {
        return filteredCompanyDocs.map((doc) => ({
          id: doc.id,
          name: doc.name?.trim() || companyNameById.get(doc.id) || "회사명 미입력",
          programs: doc.programs ?? programsByCompanyId.get(doc.id) ?? [],
        }))
      }
      return filteredCompanyUserDocs.map((doc) => ({
        id: doc.id,
        name: doc.companyName?.trim() || companyNameById.get(doc.id) || "회사명 미입력",
        programs: doc.programs ?? [],
      }))
    }
    return users
      .filter((u) => u.role === "user")
      .map((u) => ({
        id: u.id,
        name: u.companyName?.trim() || "회사명 미입력",
        programs: u.programs ?? [],
      }))
  }, [
    companyDocs,
    companyNameById,
    companyUserDocs,
    isFirebaseConfigured,
    liveCompanyIds,
    needsCompanyDirectory,
    users,
  ])
  const resolveCompanyName = useCallback(
    (value?: string | null) => {
      if (!value) return undefined
      const looksLikeId = (candidate: string) => /^[A-Za-z0-9]{12,}$/.test(candidate)
      if (companyNameById.has(value)) {
        return companyNameById.get(value)
      }
      const trimmed = value.trim()
      if (trimmed.startsWith("회사 ")) {
        const idCandidate = trimmed.slice(3).trim()
        if (companyNameById.has(idCandidate)) {
          return companyNameById.get(idCandidate)
        }
        if (looksLikeId(idCandidate)) {
          return "회사명 미입력"
        }
      }
      if (looksLikeId(trimmed)) {
        return "회사명 미입력"
      }
      return undefined
    },
    [companyNameById],
  )
  const companyRecordId = useMemo(() => {
    if (
      isFirebaseConfigured &&
      resolvedRole === "user" &&
      !profile?.companyId &&
      ownedCompanyDocsLoading
    ) {
      return null
    }
    const ownedId = ownedCompanyDocs[0]?.id ?? null
    return ownedId ?? profile?.companyId ?? firebaseUser?.uid ?? null
  }, [
    firebaseUser?.uid,
    isFirebaseConfigured,
    ownedCompanyDocs,
    ownedCompanyDocsLoading,
    profile?.companyId,
    resolvedRole,
  ])
  const { data: companyInfoDoc } = useFirestoreDocument<CompanyInfoDoc>(
    companyRecordId ? `companies/${companyRecordId}/companyInfo` : "",
    "info",
    {
      enabled: isFirebaseConfigured && resolvedRole === "user" && !!companyRecordId,
    },
  )
  const { data: companyMetaDoc, loading: companyMetaDocLoading } = useFirestoreDocument<{
    programTicketOverrides?: Record<string, { internal?: number; external?: number }>
    programs?: string[]
  }>("companies", companyRecordId ?? null, {
    enabled: isFirebaseConfigured && resolvedRole === "user" && !!companyRecordId,
  })
  const { data: selfAssessmentDoc } = useFirestoreDocument<SelfAssessmentDoc>(
    companyRecordId ? `companies/${companyRecordId}/selfAssessment` : "",
    "info",
    {
      enabled: isFirebaseConfigured && resolvedRole === "user" && !!companyRecordId,
    },
  )
  const fallbackUser = initialUsers.find((u) => u.role === resolvedRole) ?? initialUsers[0]!
  const user: User = useMemo(() => {
    const companyNameFromInfo =
      resolvedRole === "user" ? companyInfoDoc?.basic?.companyInfo?.trim() || null : null
    const resolvedCompanyName = resolveCompanyName(profile?.companyId ?? null)
    const resolvedProgramIds =
      resolvedRole === "user"
        ? Array.isArray(companyMetaDoc?.programs)
          ? companyMetaDoc.programs
          : (fallbackUser.programs ?? [])
        : (fallbackUser.programs ?? [])
    return {
      ...fallbackUser,
      id: firebaseUser?.uid ?? fallbackUser.id,
      email: firebaseUser?.email ?? fallbackUser.email,
      companyName:
        companyNameFromInfo ??
        resolvedCompanyName ??
        (profile?.companyId ? "회사명 미입력" : fallbackUser.companyName),
      role: resolvedRole,
      programName: fallbackUser.programName ?? "MYSC",
      programs: resolvedProgramIds,
    }
  }, [
    companyMetaDoc?.programs,
    companyInfoDoc?.basic?.companyInfo,
    fallbackUser,
    firebaseUser?.email,
    firebaseUser?.uid,
    profile?.companyId,
    resolvedRole,
    resolveCompanyName,
  ])

  const adminPages = useMemo<Set<AppPage>>(
    () =>
      new Set([
        "admin-dashboard",
        "admin-applications",
        "admin-programs",
        "admin-program-list",
        "admin-agendas",
        "admin-consultants",
        "admin-users",
        "admin-communication",
        "pending-reports",
        "startup-diagnostic",
      ]),
    [],
  )
  const userPages = useMemo<Set<AppPage>>(
    () =>
      new Set([
        "dashboard",
        "notifications",
        "messages",
        "unified-calendar",
        "goals-kanban",
        "ai-recommendations",
        "team-collaboration",
        "consultants",
        "regular",
        "regular-detail",
        "regular-wizard",
        "irregular",
        "irregular-wizard",
        "history",
        "application",
        "company-metrics",
        "company-newsletter",
        "settings",
        "company-info",
      ]),
    [],
  )
  const consultantPages = useMemo<Set<AppPage>>(
    () =>
      new Set([
        "admin-dashboard",
        "admin-applications",
        "pending-reports",
        "application",
        "consultant-calendar",
        "consultant-profile",
      ]),
    [],
  )

  const basePath = isAdminLikeRole ? "/admin" : "/company"
  const initialPage: AppPage =
    resolvedRole === "consultant"
      ? "consultant-calendar"
      : isAdminLikeRole
        ? "admin-dashboard"
        : "dashboard"
  const [currentPage, setCurrentPage] = useState<AppPage>(initialPage)
  const [applications, setApplications] = useState<Application[]>(() =>
    isFirebaseConfigured
      ? []
      : initialApplications.map((application) => normalizeApplicationDoc(application)),
  )
  const cancelledMigrationRan = useRef(false)
  const programAgendaCleanupRan = useRef(false)
  const [regularOfficeHourList, setRegularOfficeHourList] = useState<RegularOfficeHour[]>(() =>
    isFirebaseConfigured ? [] : initialRegularOfficeHours,
  )
  const [officeHourSlotList, setOfficeHourSlotList] = useState<OfficeHourSlot[]>([])
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [selectedOfficeHourId, setSelectedOfficeHourId] = useState<string | null>(null)
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null)
  const [consultants, setConsultants] = useState<Consultant[]>(() =>
    isFirebaseConfigured
      ? []
      : initialConsultants.map((consultant) => ({
          ...consultant,
          agendaIds: consultant.agendaIds ?? [],
        })),
  )
  const [agendaList, setAgendaList] = useState<Agenda[]>(() =>
    isFirebaseConfigured ? [] : initialAgendas,
  )
  const [templates, setTemplates] = useState<MessageTemplate[]>(initialMessageTemplates)
  const [programList, setProgramList] = useState<Program[]>(() =>
    isFirebaseConfigured ? [] : initialPrograms,
  )

  const [reports, setReports] = useState<OfficeHourReport[]>([])
  const [reportFormOpen, setReportFormOpen] = useState(false)
  const [reportFormApplication, setReportFormApplication] = useState<Application | null>(null)
  const [reportBeingEdited, setReportBeingEdited] = useState<OfficeHourReport | null>(null)
  const [reportFormIsManual, setReportFormIsManual] = useState(false)
  const [reportPopupDismissed, setReportPopupDismissed] = useState<Record<string, number>>({})
  const reportPopupOpenedRef = useRef(false)
  const reportPopupSessionKey = "office-hour-report-popup-shown"
  const submissionLocksRef = useRef<Set<string>>(new Set())

  // 새로운 기능을 위한 상태
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications)
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>(mockChatRooms)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(mockChatMessages)
  const [aiRecommendations, setAIRecommendations] =
    useState<AIRecommendation[]>(mockAIRecommendations)
  const [goals, setGoals] = useState<Goal[]>(mockGoals)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(mockTeamMembers)

  const { data: consultantDocs, loading: consultantDocsLoading } = useFirestoreCollection<Consultant>(COLLECTIONS.CONSULTANTS, {
    orderByField: "name",
    orderDirection: "asc",
    enabled: isFirebaseConfigured && !isCompanyInfoRoute && needsConsultants,
  })
  const { data: agendaDocs, loading: agendaDocsLoading } = useFirestoreCollection<Agenda>(COLLECTIONS.AGENDAS, {
    orderByField: "name",
    orderDirection: "asc",
    enabled: isFirebaseConfigured && !isCompanyInfoRoute && needsAgendas,
  })
  const { data: programDocs, loading: programDocsLoading } = useFirestoreCollection<Program>(COLLECTIONS.PROGRAMS, {
    orderByField: "name",
    orderDirection: "asc",
    enabled: isFirebaseConfigured && !isCompanyInfoRoute && needsPrograms,
  })
  const { data: officeHourSlotDocs, loading: officeHourSlotDocsLoading } = useFirestoreCollection<OfficeHourSlot>(
    COLLECTIONS.OFFICE_HOUR_SLOTS,
    {
      orderByField: "date",
      orderDirection: "asc",
      enabled: isFirebaseConfigured && !isCompanyInfoRoute && needsOfficeHourSlots,
    },
  )
  const { data: officeHourApplicationDocs, loading: officeHourApplicationDocsLoading } = useFirestoreCollection<Application>(
    COLLECTIONS.OFFICE_HOUR_APPLICATIONS,
    {
      orderByField: "createdAt",
      orderDirection: "desc",
      enabled: isFirebaseConfigured && !isCompanyInfoRoute && needsApplications,
    },
  )
  const { data: selectedApplicationDoc, loading: selectedApplicationDocLoading } = useFirestoreDocumentOnce<Application>(
    COLLECTIONS.OFFICE_HOUR_APPLICATIONS,
    currentPage === "application" ? selectedApplicationId : null,
    {
      enabled: isFirebaseConfigured && !isCompanyInfoRoute && needsApplications,
    },
  )
  const { data: reportDocs } = useFirestoreCollection<OfficeHourReport>(COLLECTIONS.REPORTS, {
    orderByField: "createdAt",
    orderDirection: "desc",
    enabled: isFirebaseConfigured && !isCompanyInfoRoute && needsApplications,
  })
  const { data: signupRequestDocs } = useFirestoreCollection<SignupRequestDoc>("signupRequests", {
    enabled:
      isFirebaseConfigured &&
      resolvedRole === "admin" &&
      !isCompanyInfoRoute &&
      isPage(["admin-users"]),
  })
  const { data: profileDocs, loading: profileDocsLoading } = useFirestoreCollection<RawProfileApprovalDoc>(
    "profiles",
    {
      enabled:
        isFirebaseConfigured &&
        resolvedRole === "admin" &&
        !isCompanyInfoRoute &&
        (needsUsers || needsCompanyDirectory),
    },
  )

  const consultantCrud = useFirestoreCRUD<Omit<Consultant, "id">>(COLLECTIONS.CONSULTANTS)
  const agendaCrud = useFirestoreCRUD<Omit<Agenda, "id">>(COLLECTIONS.AGENDAS)
  const programCrud = useFirestoreCRUD<Omit<Program, "id">>(COLLECTIONS.PROGRAMS)
  const officeHourSlotCrud = useFirestoreCRUD<Omit<OfficeHourSlot, "id">>(
    COLLECTIONS.OFFICE_HOUR_SLOTS,
  )
  const officeHourApplicationCrud = useFirestoreCRUD<Omit<Application, "id">>(
    COLLECTIONS.OFFICE_HOUR_APPLICATIONS,
  )
  const reportCrud = useFirestoreCRUD<Omit<OfficeHourReport, "id">>(COLLECTIONS.REPORTS)
  const profileCrud = useFirestoreCRUD<Record<string, unknown>>("profiles")

  const currentConsultant = useMemo(() => {
    if (resolvedRole !== "consultant") return null

    const uid = firebaseUser?.uid ?? ""
    if (!uid) return null
    return consultants.find((consultant) => consultant.id === uid) ?? null
  }, [consultants, firebaseUser?.uid, resolvedRole])

  const consultantIdCandidates = useMemo(() => {
    const ids = new Set<string>()
    if (currentConsultant?.id) {
      ids.add(currentConsultant.id)
    }
    if (firebaseUser?.uid) {
      ids.add(firebaseUser.uid)
    }
    return ids
  }, [currentConsultant?.id, firebaseUser?.uid])

  const consultantAgendaIds = useMemo(() => {
    if (resolvedRole !== "consultant") return new Set<string>()
    return new Set(currentConsultant?.agendaIds ?? [])
  }, [currentConsultant?.agendaIds, resolvedRole])

  const agendaNameById = useMemo(() => {
    const map = new Map<string, string>()
    agendaList.forEach((agenda) => {
      const name = agenda.name?.trim()
      if (name) {
        map.set(agenda.id, name)
      }
    })
    return map
  }, [agendaList])

  const consultantAgendaNames = useMemo(() => {
    if (resolvedRole !== "consultant") return new Set<string>()
    const names = agendaList
      .filter((agenda) => consultantAgendaIds.has(agenda.id))
      .map((agenda) => agenda.name)
    return new Set(names)
  }, [agendaList, consultantAgendaIds, resolvedRole])

  const liveApplications = useMemo(() => {
    if (!isFirebaseConfigured) {
      return applications
    }
    return officeHourApplicationDocs
      .map((application) => normalizeApplicationDoc(application, resolveCompanyName))
      .filter((application) => application.status !== "cancelled")
      .sort((a, b) => getTimeValue(b.createdAt) - getTimeValue(a.createdAt))
  }, [applications, isFirebaseConfigured, officeHourApplicationDocs, resolveCompanyName])

  const slotTitleById = useMemo(
    () => new Map(officeHourSlotList.map((slot) => [slot.id, slot.title])),
    [officeHourSlotList],
  )
  const slotProgramIdById = useMemo(
    () =>
      new Map(
        officeHourSlotList.flatMap((slot) =>
          slot.programId ? [[slot.id, slot.programId] as const] : [],
        ),
      ),
    [officeHourSlotList],
  )
  const officeHourById = useMemo(
    () => new Map(regularOfficeHourList.map((officeHour) => [officeHour.id, officeHour])),
    [regularOfficeHourList],
  )
  const programNameById = useMemo(
    () =>
      new Map(
        programList.flatMap((program) => {
          const name = program.name?.trim()
          return name ? [[program.id, name] as const] : []
        }),
      ),
    [programList],
  )

  const resolveApplicationRecord = useCallback((application: Application): Application => {
    const inferredProgramId = (() => {
      if (application.programId) return application.programId
      if (application.officeHourId && application.officeHourId.includes(":")) {
        return application.officeHourId.split(":")[0]
      }
      if (application.officeHourSlotId && slotProgramIdById.has(application.officeHourSlotId)) {
        return slotProgramIdById.get(application.officeHourSlotId)
      }
      return undefined
    })()

    const agendaName = application.agendaId ? agendaNameById.get(application.agendaId) : undefined
    const resolvedAgenda = agendaName ?? application.agenda ?? "미지정"

    let resolvedOfficeHourTitle = application.officeHourTitle
    if (application.officeHourSlotId && slotTitleById.has(application.officeHourSlotId)) {
      resolvedOfficeHourTitle = slotTitleById.get(application.officeHourSlotId)!
    } else if (application.officeHourId && officeHourById.has(application.officeHourId)) {
      resolvedOfficeHourTitle = officeHourById.get(application.officeHourId)!.title
    }

    if (application.type === "regular" && inferredProgramId) {
      const programName = programNameById.get(inferredProgramId)
      if (programName) {
        resolvedOfficeHourTitle = `${programName} 정기 오피스아워`
      }
    } else if (application.type === "irregular" && agendaName) {
      resolvedOfficeHourTitle = `비정기 오피스아워 - ${agendaName}`
    }

    if (
      application.programId === inferredProgramId &&
      resolvedAgenda === application.agenda &&
      resolvedOfficeHourTitle === application.officeHourTitle
    ) {
      return application
    }

    return {
      ...application,
      programId: application.programId ?? inferredProgramId,
      agenda: resolvedAgenda,
      officeHourTitle: resolvedOfficeHourTitle,
    }
  }, [agendaNameById, officeHourById, programNameById, slotProgramIdById, slotTitleById])

  const resolvedApplications = useMemo(() => {
    return liveApplications.map(resolveApplicationRecord)
  }, [liveApplications, resolveApplicationRecord])

  const resolvedRegularOfficeHourList = useMemo(() => {
    return regularOfficeHourList.map((officeHour) => {
      if (!officeHour.programId) return officeHour
      const programName = programNameById.get(officeHour.programId)
      if (!programName) return officeHour
      if (!officeHour.title.includes("정기 오피스아워")) return officeHour
      const nextTitle = `${programName} 정기 오피스아워`
      if (nextTitle === officeHour.title) return officeHour
      return {
        ...officeHour,
        title: nextTitle,
      }
    })
  }, [programNameById, regularOfficeHourList])

  const scopedApplications = useMemo(() => {
    if (resolvedRole === "user") {
      const uid = firebaseUser?.uid ?? user.id
      if (!uid) return []
      return resolvedApplications.filter((application) => {
        if (application.status === "cancelled") return false
        return Boolean(application.createdByUid) && application.createdByUid === uid
      })
    }
    if (resolvedRole !== "consultant") return resolvedApplications
    if (consultantAgendaIds.size === 0 && consultantAgendaNames.size === 0) {
      return []
    }
    return resolvedApplications.filter((application) => {
      if (application.consultantId) {
        return consultantIdCandidates.has(application.consultantId)
      }
      if (application.officeHourSlotId) {
        const reservedSlot = officeHourSlotList.find((slot) => slot.id === application.officeHourSlotId)
        if (reservedSlot?.consultantId) {
          if (consultantIdCandidates.has(reservedSlot.consultantId)) {
            return true
          }
        }
      }
      if (application.agendaId && consultantAgendaIds.has(application.agendaId)) {
        return true
      }
      if (application.agenda && consultantAgendaNames.has(application.agenda)) {
        return true
      }
      return false
    })
  }, [
    firebaseUser?.uid,
    resolvedApplications,
    resolvedRole,
    user.id,
    consultantIdCandidates,
    consultantAgendaIds,
    consultantAgendaNames,
    officeHourSlotList,
  ])

  const agendaScopeById = useMemo(
    () => new Map(agendaList.map((agenda) => [agenda.id, agenda.scope])),
    [agendaList],
  )
  const agendaScopeByName = useMemo(
    () => new Map(agendaList.map((agenda) => [agenda.name, agenda.scope])),
    [agendaList],
  )

  const companyProgramIds = useMemo(() => {
    if (resolvedRole !== "user") return new Set<string>()
    if (Array.isArray(companyMetaDoc?.programs)) {
      return new Set(companyMetaDoc.programs)
    }
    const ids = new Set<string>()
    const candidateIds = new Set(
      [companyRecordId, firebaseUser?.uid, profile?.companyId, user.id].filter(
        (value): value is string => Boolean(value),
      ),
    )
    if (candidateIds.size > 0) {
      programList.forEach((program) => {
        if (!program.companyIds || program.companyIds.length === 0) return
        const matched = program.companyIds.some((id) => candidateIds.has(id))
        if (matched) ids.add(program.id)
      })
    }
    if (ids.size > 0) return ids
    if (user.programs && user.programs.length > 0) {
      return new Set(user.programs)
    }
    if (user.programName) {
      programList.forEach((program) => {
        if (program.name === user.programName) {
          ids.add(program.id)
        }
      })
    }
    return ids
  }, [
    companyMetaDoc?.programs,
    companyRecordId,
    firebaseUser?.uid,
    profile?.companyId,
    programList,
    resolvedRole,
    user.id,
    user.programName,
    user.programs,
  ])

  const scopedRegularOfficeHourList = useMemo(() => {
    if (resolvedRole === "consultant") {
      return resolvedRegularOfficeHourList.filter((officeHour) => {
        return (
          (officeHour.consultantId && consultantIdCandidates.has(officeHour.consultantId)) ||
          Boolean(
            officeHour.slots?.some(
              (slot) => slot.consultantId && consultantIdCandidates.has(slot.consultantId),
            ),
          )
        )
      })
    }
    if (resolvedRole === "user") {
      return resolvedRegularOfficeHourList.filter((officeHour) => {
        if (!officeHour.programId) return false
        return companyProgramIds.has(officeHour.programId)
      })
    }
    return resolvedRegularOfficeHourList
  }, [
    companyProgramIds,
    consultantIdCandidates,
    resolvedRegularOfficeHourList,
    resolvedRole,
  ])
  const regularOfficeHoursLoading =
    isFirebaseConfigured &&
    resolvedRole === "user" &&
    needsRegularOfficeHours &&
    resolvedRegularOfficeHourList.length === 0 &&
    (
      programDocsLoading ||
      officeHourSlotDocsLoading
    )
  const applicationsLoading =
    isFirebaseConfigured &&
    needsApplications &&
    (
      officeHourApplicationDocsLoading ||
      (currentPage === "application" && !!selectedApplicationId && selectedApplicationDocLoading)
    )
  const regularWizardRealtimeLoading =
    isFirebaseConfigured &&
    currentPage === "regular-wizard" &&
    (
      officeHourApplicationDocsLoading ||
      officeHourSlotDocsLoading ||
      consultantDocsLoading ||
      agendaDocsLoading
    )
  const pendingWithoutAssignableConsultantIds = useMemo(() => {
    const ids = new Set<string>()

    resolvedApplications.forEach((application) => {
      if (normalizeApplicationStatus(application.status) !== "pending") return
      if (!application.agendaId || !application.scheduledDate || !application.scheduledTime) return
      if (
        application.consultantId ||
        (application.consultant && application.consultant !== "담당자 배정 중")
      ) {
        return
      }

      if (!hasScheduledConsultantForPendingApplication({ application, consultants })) {
        ids.add(application.id)
      }
    })

    return ids
  }, [consultants, resolvedApplications])

  const consultantProgramIds = useMemo(() => {
    if (resolvedRole !== "consultant") return new Set<string>()
    return new Set(programList.map((program) => program.id))
  }, [programList, resolvedRole])

  const scopedProgramList = useMemo(() => {
    if (resolvedRole === "consultant") {
      return programList.filter((program) => consultantProgramIds.has(program.id))
    }
    if (resolvedRole === "user") {
      return programList.filter((program) => companyProgramIds.has(program.id))
    }
    return programList
  }, [companyProgramIds, consultantProgramIds, programList, resolvedRole])

  const ticketStats = useMemo(() => {
    if (resolvedRole !== "user") {
      return {
        totalInternal: 0,
        totalExternal: 0,
        reservedInternal: 0,
        reservedExternal: 0,
        completedInternal: 0,
        completedExternal: 0,
        remainingInternal: 0,
        remainingExternal: 0,
      }
    }
    const overrides = companyMetaDoc?.programTicketOverrides ?? {}
    const totalInternal = scopedProgramList.reduce((sum, program) => {
      const override = overrides[program.id]?.internal
      const value = typeof override === "number" ? override : (program.internalTicketLimit ?? 0)
      return sum + value
    }, 0)
    const totalExternal = scopedProgramList.reduce((sum, program) => {
      const override = overrides[program.id]?.external
      const value = typeof override === "number" ? override : (program.externalTicketLimit ?? 0)
      return sum + value
    }, 0)
    let reservedInternal = 0
    let reservedExternal = 0
    let completedInternal = 0
    let completedExternal = 0

    const resolveScope = (app: Application) => {
      if (app.type === "irregular" && typeof app.isInternal === "boolean") {
        return app.isInternal ? "internal" : "external"
      }
      if (app.agendaId && agendaScopeById.has(app.agendaId)) {
        return agendaScopeById.get(app.agendaId) ?? null
      }
      if (app.agenda && agendaScopeByName.has(app.agenda)) {
        return agendaScopeByName.get(app.agenda) ?? null
      }
      return null
    }

    scopedApplications.forEach((app) => {
      const scope = resolveScope(app)
      if (!scope) return
      const normalizedStatus = normalizeApplicationStatus(app.status)
      const isReserved = normalizedStatus === "pending" || normalizedStatus === "confirmed"
      const isCompleted = normalizedStatus === "completed"
      if (!isReserved && !isCompleted) return
      if (scope === "internal") {
        if (isCompleted) completedInternal += 1
        else reservedInternal += 1
      } else {
        if (isCompleted) completedExternal += 1
        else reservedExternal += 1
      }
    })

    return {
      totalInternal,
      totalExternal,
      reservedInternal,
      reservedExternal,
      completedInternal,
      completedExternal,
      remainingInternal: Math.max(0, totalInternal - reservedInternal - completedInternal),
      remainingExternal: Math.max(0, totalExternal - reservedExternal - completedExternal),
    }
  }, [
    agendaScopeById,
    agendaScopeByName,
    companyMetaDoc?.programTicketOverrides,
    resolvedRole,
    scopedApplications,
    scopedProgramList,
  ])

  const scopedUser = useMemo<User>(() => {
    if (resolvedRole !== "consultant") return user
    return {
      ...user,
      programs: Array.from(consultantProgramIds),
    }
  }, [consultantProgramIds, resolvedRole, user])

  const pendingProfileApprovals = useMemo<PendingProfileApproval[]>(() => {
    if (!isFirebaseConfigured || resolvedRole !== "admin") {
      return []
    }
    return signupRequestDocs
      .filter((doc) => {
        const status = typeof doc.status === "string" ? doc.status : "pending"
        if (status === "approved" || status === "rejected") return false
        const matchedProfile = profileList.find((profileItem) => profileItem.id === doc.id)
        if (matchedProfile?.active === true || matchedProfile?.approvedAt) return false
        return true
      })
      .map((doc) => ({
        id: doc.id,
        email: doc.email ?? "",
        role: toApprovalRole(doc.role),
        requestedRole: doc.requestedRole == null ? null : toApprovalRole(doc.requestedRole),
        active: false,
        companyId: doc.companyId ?? null,
        createdAt: doc.createdAt ? normalizeDateValue(doc.createdAt) : undefined,
        activatedAt: undefined,
      }))
      .sort((a, b) => getTimeValue(b.createdAt) - getTimeValue(a.createdAt))
  }, [isFirebaseConfigured, profileList, resolvedRole, signupRequestDocs])

  useEffect(() => {
    if (!isFirebaseConfigured) return
    setConsultants(
      consultantDocs.map((doc) => ({
        ...doc,
        expertise: doc.expertise ?? [],
        agendaIds: doc.agendaIds ?? [],
        availability: doc.availability ?? [],
        status: doc.status ?? "active",
      })),
    )
  }, [consultantDocs])

  useEffect(() => {
    if (!isFirebaseConfigured) return
    setAgendaList(
      agendaDocs.map((doc) => ({
        ...doc,
        scope: doc.scope ?? "internal",
        active: doc.active ?? true,
      })),
    )
  }, [agendaDocs])

  useEffect(() => {
    if (!isFirebaseConfigured) return
    if (!needsUsers && !needsCompanyDirectory) return
    if (!profileDocsLoading) {
      setProfileList(profileDocs)
    }
  }, [
    isFirebaseConfigured,
    needsCompanyDirectory,
    needsUsers,
    profileDocs,
    profileDocsLoading,
  ])

  useEffect(() => {
    if (!isFirebaseConfigured) return
    if (!needsUsers) return
    setUsers(
      profileList
        .filter((doc) => doc.active === true || !!doc.approvedAt)
        .map((doc) => {
          const resolvedRole = toUserRole(doc.role === "company" ? "user" : doc.role, "user")
          const companyName =
            resolvedRole === "user"
              ? doc.companyId
                ? (companyNameById.get(doc.companyId) ?? "회사명 미입력")
                : "회사명 미입력"
              : ""
          const status = doc.active ? "active" : "inactive"
          return {
            id: doc.id,
            email: doc.email ?? "",
            companyName,
            programName: "MYSC",
            programs: [],
            role: resolvedRole,
            permissions: {
              canApplyRegular: resolvedRole === "user",
              canApplyIrregular: resolvedRole === "user",
              canViewAll: resolvedRole !== "user",
              canViewAllApplications: resolvedRole === "admin" || resolvedRole === "staff",
              canManageConsultants: resolvedRole === "admin",
              canManagePrograms: resolvedRole === "admin",
            },
            status,
            createdAt: doc.createdAt ? normalizeDateValue(doc.createdAt) : new Date(),
            lastLoginAt: doc.activatedAt ? normalizeDateValue(doc.activatedAt) : undefined,
          } satisfies UserWithPermissions
        }),
    )
  }, [companyNameById, isFirebaseConfigured, needsUsers, profileList])

  useEffect(() => {
    if (!isFirebaseConfigured) return
    setProgramList(
      programDocs.map((doc) => ({
        ...doc,
        description: doc.description ?? `${doc.name} 사업`,
        color: doc.color ?? "#334155",
        targetHours: doc.targetHours ?? 0,
        completedHours: doc.completedHours ?? 0,
        maxApplications:
          doc.maxApplications ?? (doc.internalTicketLimit ?? 0) + (doc.externalTicketLimit ?? 0),
        usedApplications: doc.usedApplications ?? 0,
        weekdays: doc.weekdays ?? ["TUE", "THU"],
        companyLimit: doc.companyLimit ?? 0,
        companyIds: doc.companyIds ?? [],
      })),
    )
  }, [programDocs])

  useEffect(() => {
    if (!isFirebaseConfigured || resolvedRole !== "admin") return
    if (programAgendaCleanupRan.current) return
    const targets = programDocs.filter((doc) => (doc as Record<string, any>).agendaIds != null)
    if (targets.length === 0) {
      programAgendaCleanupRan.current = true
      return
    }
    programAgendaCleanupRan.current = true
    const ops = targets.map((doc) => ({
      type: "update" as const,
      collection: COLLECTIONS.PROGRAMS,
      docId: doc.id,
      data: { agendaIds: deleteField() },
    }))
    void programCrud.batchUpdate(ops)
  }, [isFirebaseConfigured, programCrud, programDocs, resolvedRole])

  useEffect(() => {
    if (!isFirebaseConfigured) return
    const normalizedSlots = officeHourSlotDocs.map(normalizeSlotDoc)
    setOfficeHourSlotList(normalizedSlots)

    const slotGroups = groupSlotsToRegularOfficeHours(normalizedSlots, programList)
    const programGroups = groupProgramsToRegularOfficeHours(programList)
    const programIdsWithSlots = new Set(
      slotGroups.map((group) => group.programId).filter(Boolean) as string[],
    )
    const merged = [
      ...slotGroups,
      ...programGroups.filter((group) => !programIdsWithSlots.has(group.programId ?? "")),
    ]
    setRegularOfficeHourList(merged)
  }, [officeHourSlotDocs, programList])

  useEffect(() => {
    if (!isFirebaseConfigured || !needsApplications) return
    const normalized = officeHourApplicationDocs
      .map((application) => normalizeApplicationDoc(application, resolveCompanyName))
      .filter((application) => application.status !== "cancelled")
      .sort((a, b) => getTimeValue(b.createdAt) - getTimeValue(a.createdAt))
    setApplications(normalized)
  }, [officeHourApplicationDocs, resolveCompanyName, needsApplications])

  useEffect(() => {
    if (!isFirebaseConfigured || !needsApplications) return
    const normalized = reportDocs
      .map(normalizeReportDoc)
      .sort((a, b) => getTimeValue(b.createdAt) - getTimeValue(a.createdAt))
    setReports(normalized)
  }, [isFirebaseConfigured, reportDocs, needsApplications])

  useEffect(() => {
    if (!needsApplications) return
    if (cancelledMigrationRan.current) return
    cancelledMigrationRan.current = true
  }, [needsApplications])

  // Set initial page based on role
  const disabledPages = useMemo(() => {
    const set = new Set<AppPage>()
    if (!firebaseUser) {
      set.add("startup-diagnostic")
    }
    return set
  }, [firebaseUser])
  const companyInfoNeedsAttention = useMemo(
    () =>
      isFirebaseConfigured &&
      resolvedRole === "user" &&
      !!companyRecordId &&
      !isSelfAssessmentComplete(selfAssessmentDoc?.sections),
    [companyRecordId, resolvedRole, selfAssessmentDoc?.sections],
  )

  useEffect(() => {
    const segment = location.pathname.split("/")[2] ?? ""
    const requestedPage = segment as AppPage
    const allowedPages =
      resolvedRole === "consultant" ? consultantPages : isAdminLikeRole ? adminPages : userPages
    const nextPage = allowedPages.has(requestedPage) ? requestedPage : initialPage
    if (disabledPages.has(nextPage)) {
      setCurrentPage(initialPage)
      if (segment) {
        navigate(`${basePath}/${initialPage}`, { replace: true })
      }
      return
    }

    const pageId = new URLSearchParams(location.search).get("id")
    if (nextPage === "regular-detail" && pageId) {
      setSelectedOfficeHourId(pageId)
    }
    if (nextPage === "application" && pageId) {
      setSelectedApplicationId(pageId)
    }

    setCurrentPage(nextPage)
    if (!segment) {
      navigate(`${basePath}/${nextPage}`, { replace: true })
    }
  }, [
    basePath,
    adminPages,
    consultantPages,
    userPages,
    disabledPages,
    initialPage,
    location.pathname,
    location.search,
    navigate,
    isAdminLikeRole,
    resolvedRole,
  ])

  const getSessionEndTime = (app: Application) => {
    const durationHours = app.duration ?? 1
    const slot = app.officeHourSlotId
      ? officeHourSlotList.find((item) => item.id === app.officeHourSlotId)
      : undefined

    if (app.scheduledDate && app.scheduledTime) {
      const start = parseLocalDateTimeKey(app.scheduledDate, app.scheduledTime)
      if (start) {
        return new Date(start.getTime() + durationHours * 60 * 60 * 1000)
      }
    }

    if (slot) {
      const start = parseLocalDateTimeKey(slot.date, slot.startTime)
      if (start) {
        if (slot.endTime) {
          const end = parseLocalDateTimeKey(slot.date, slot.endTime)
          if (end) {
            return end
          }
        }
        return new Date(start.getTime() + durationHours * 60 * 60 * 1000)
      }
    }

    if (app.scheduledDate) {
      const fallback = endOfLocalDateKey(app.scheduledDate)
      if (fallback) {
        return fallback
      }
    }

    return null
  }

  const hasSessionEnded = (app: Application, now = new Date()) => {
    const endTime = getSessionEndTime(app)
    return Boolean(endTime && now >= endTime)
  }

  const rejectApplicationsAsExpired = async (targets: Application[], updatedAt = new Date()) => {
    const eligible = targets.filter(
      (app) => normalizeApplicationStatus(app.status) === "pending",
    )
    if (eligible.length === 0) return false
    if (isFirebaseConfigured) return false

    const rejectionById = new Map(
      eligible.map((app) => [
        app.id,
        {
          updatedAt,
          rejectionReason: app.rejectionReason?.trim() || AUTO_REJECT_REASON,
        },
      ]),
    )

    const nextApplications = applications.map((app) => {
      const meta = rejectionById.get(app.id)
      if (!meta) return app
      return {
        ...app,
        status: "rejected" as const,
        rejectionReason: meta.rejectionReason,
        updatedAt: meta.updatedAt,
      }
    })
    setApplications(nextApplications)

    const slotIdsToOpen = collectReleasableSlotIds(eligible, nextApplications)
    await releaseSlots(slotIdsToOpen)
    return true
  }

  const getReportDeadlineInfo = (app: Application) => {
    const endTime = getSessionEndTime(app)
    if (!endTime) return null
    const deadline = addDays(endTime, 3)
    const now = new Date()
    const daysLeft = differenceInDays(deadline, now)
    const overdueDays = Math.max(0, differenceInDays(now, deadline))
    return {
      deadline,
      daysLeft,
      isOverdue: now > deadline,
      overdueDays,
    }
  }

  const reportFormDeadlineInfo = useMemo(() => {
    if (!reportFormApplication || reportFormIsManual) return null
    return getReportDeadlineInfo(reportFormApplication)
  }, [reportFormApplication, reportFormIsManual, officeHourSlotList])

  // 자동 상태 전환:
  // 1) 진행 시간이 지난 pending는 rejected로 자동 전환
  // 2) 진행 시간이 지난 confirmed는 completed로 자동 전환
  useEffect(() => {
    if (!needsApplications || !canAutoTransitionApplications) return
    if (isFirebaseConfigured) return
    let isRunning = false
    const runAutoStatusTransitions = async () => {
      if (isRunning) return
      isRunning = true
      try {
        const now = new Date()
        const expiredPending = applications.filter(
          (app) => normalizeApplicationStatus(app.status) === "pending" && hasSessionEnded(app, now),
        )

        if (expiredPending.length > 0) {
          await rejectApplicationsAsExpired(expiredPending, now)
        }

        const completedCandidates = applications
          .filter((app) => app.status === "confirmed")
          .map((app) => ({ app, endTime: getSessionEndTime(app) }))
          .filter((item) => item.endTime && now >= item.endTime)

        if (completedCandidates.length === 0) return

        const updatesById = new Map<string, { completedAt: Date; updatedAt: Date }>()
        completedCandidates.forEach(({ app, endTime }) => {
          const completedAt = endTime ?? now
          updatesById.set(app.id, { completedAt, updatedAt: now })
        })

        setApplications((prev) =>
          prev.map((app) => {
            const meta = updatesById.get(app.id)
            if (!meta) return app
            return {
              ...app,
              status: "completed" as const,
              completedAt: meta.completedAt,
              updatedAt: meta.updatedAt,
            }
          }),
        )

        if (!isFirebaseConfigured) return

        const operations = Array.from(updatesById.entries()).map(([id, meta]) => ({
          type: "update" as const,
          collection: COLLECTIONS.OFFICE_HOUR_APPLICATIONS,
          docId: id,
          data: {
            status: "completed",
            completedAt: meta.completedAt,
            updatedAt: meta.updatedAt,
          },
        }))
        await officeHourApplicationCrud.batchUpdate(operations)
      } finally {
        isRunning = false
      }
    }

    runAutoStatusTransitions()
    const intervalId = window.setInterval(
      runAutoStatusTransitions,
      AUTO_STATUS_TRANSITION_INTERVAL_MS,
    )
    return () => {
      window.clearInterval(intervalId)
    }
  }, [
    applications,
    needsApplications,
    canAutoTransitionApplications,
    isFirebaseConfigured,
    officeHourApplicationCrud,
    officeHourSlotList,
    officeHourSlotCrud,
  ])

  const dismissReportPopup = (applicationId: string, dismissForMs: number) => {
    const until = Date.now() + dismissForMs
    setReportPopupDismissed((prev) => ({ ...prev, [applicationId]: until }))
  }

  // 세션 완료 후 보고서 작성 팝업
  useEffect(() => {
    if (
      !user ||
      user.role === "admin" ||
      (user.role !== "consultant" && user.role !== "staff") ||
      reportFormOpen ||
      reportPopupOpenedRef.current
    ) {
      return
    }
    if (sessionStorage.getItem(reportPopupSessionKey) === "true") {
      reportPopupOpenedRef.current = true
      return
    }

    const eligibleApps = scopedApplications.filter(
      (app) => (app.status === "confirmed" || app.status === "completed") && app.scheduledDate,
    )

    const reportedAppIds = new Set(reports.map((r) => r.applicationId))
    const now = new Date()

    const candidates = eligibleApps
      .filter((app) => !reportedAppIds.has(app.id))
      .filter((app) => {
        const dismissedUntil = reportPopupDismissed[app.id]
        if (!dismissedUntil) return true
        return Date.now() > dismissedUntil
      })
      .map((app) => ({ app, endTime: getSessionEndTime(app) }))
      .filter((item) => item.endTime && now >= item.endTime)
      .sort((a, b) => b.endTime!.getTime() - a.endTime!.getTime())

    const firstCandidate = candidates[0]
    if (firstCandidate) {
      setReportFormApplication(firstCandidate.app)
      setReportFormOpen(true)
      reportPopupOpenedRef.current = true
      sessionStorage.setItem(reportPopupSessionKey, "true")
    }
  }, [user, scopedApplications, reports, reportFormOpen, officeHourSlotList, reportPopupDismissed])

  useEffect(() => {
    reportPopupOpenedRef.current = false
  }, [user?.id])

  useEffect(() => {
    if (reportFormOpen) {
      reportPopupOpenedRef.current = true
      sessionStorage.setItem(reportPopupSessionKey, "true")
    }
  }, [reportFormOpen, reportPopupSessionKey])

  // 미작성 보고서 알림 생성/정리
  useEffect(() => {
    if (!user || (user.role !== "admin" && user.role !== "consultant" && user.role !== "staff")) {
      return
    }

    const reportedAppIds = new Set(reports.map((r) => r.applicationId))
    const now = new Date()

    const eligibleApps = scopedApplications.filter(
      (app) => (app.status === "confirmed" || app.status === "completed") && app.scheduledDate,
    )

    const pendingApps = eligibleApps
      .filter((app) => !reportedAppIds.has(app.id))
      .map((app) => ({ app, endTime: getSessionEndTime(app) }))
      .filter((item) => item.endTime && now >= item.endTime)
      .map((item) => item.app)

    setNotifications((prev) => {
      const pendingIds = new Set(pendingApps.map((app) => app.id))
      const pendingMap = new Map(pendingApps.map((app) => [app.id, app]))

      const updated = prev
        .filter((n) => n.type !== "report_reminder" || (n.relatedId && pendingIds.has(n.relatedId)))
        .map((n) => {
          if (n.type !== "report_reminder" || !n.relatedId) return n
          const app = pendingMap.get(n.relatedId)
          if (!app) return n
          const deadlineInfo = getReportDeadlineInfo(app)
          const sessionDate = app.scheduledDate
            ? (parseSafeLocalDateKey(app.scheduledDate)?.toLocaleDateString("ko-KR") ?? "알 수 없음")
            : "알 수 없음"
          const statusText = deadlineInfo
            ? deadlineInfo.isOverdue
              ? `기한 초과 ${deadlineInfo.overdueDays}일`
              : `D-${Math.max(0, deadlineInfo.daysLeft)}`
            : "작성 필요"
          const priority: Notification["priority"] = deadlineInfo?.isOverdue ? "high" : "medium"
          return {
            ...n,
            title: "오피스아워 일지 작성 필요",
            content: `${sessionDate} 진행 세션 보고서를 작성해주세요. (${statusText})`,
            priority,
          }
        })

      const existingIds = new Set(
        updated
          .filter((n) => n.type === "report_reminder" && n.relatedId)
          .map((n) => n.relatedId as string),
      )

      const newNotifications = pendingApps
        .filter((app) => !existingIds.has(app.id))
        .map((app) => {
          const deadlineInfo = getReportDeadlineInfo(app)
          const sessionDate = app.scheduledDate
            ? (parseSafeLocalDateKey(app.scheduledDate)?.toLocaleDateString("ko-KR") ?? "알 수 없음")
            : "알 수 없음"
          const statusText = deadlineInfo
            ? deadlineInfo.isOverdue
              ? `기한 초과 ${deadlineInfo.overdueDays}일`
              : `D-${Math.max(0, deadlineInfo.daysLeft)}`
            : "작성 필요"
          return {
            id: `report_${app.id}`,
            type: "report_reminder" as const,
            title: "오피스아워 일지 작성 필요",
            content: `${sessionDate} 진행 세션 보고서를 작성해주세요. (${statusText})`,
            link: "/pending-reports",
            isRead: false,
            createdAt: new Date(),
            userId: user.id,
            relatedId: app.id,
            priority: (deadlineInfo?.isOverdue ? "high" : "medium") as Notification["priority"],
          }
        })

      return [...updated, ...newNotifications].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      )
    })
  }, [user, scopedApplications, reports, officeHourSlotList])

  const openReportFormForApplication = (applicationId: string) => {
    if (applicationId === "irregular-manual") {
      const now = new Date()
      const today = formatSafeLocalDateKey(now)
      const manualApp: Application = {
        id: `manual-${Date.now()}`,
        type: "irregular",
        status: "completed",
        officeHourTitle: "비정기 오피스아워 (수동)",
        consultant: currentConsultant?.name ?? "컨설턴트",
        consultantId: currentConsultant?.id ?? "",
        sessionFormat: "online",
        agenda: "비정기 오피스아워",
        requestContent: "",
        scheduledDate: today,
        createdAt: now,
        updatedAt: now,
      }
      setReportFormApplication(manualApp)
      setReportFormOpen(true)
      setReportBeingEdited(null)
      setReportFormIsManual(true)
      return
    }

    const app = scopedApplications.find((value) => value.id === applicationId)
    if (!app) return

    setReportFormApplication(app)
    setReportFormOpen(true)
    setReportBeingEdited(null)
    setReportFormIsManual(false)
  }

  const handleNavigate = (page: AppPage, id?: string) => {
    if (disabledPages.has(page)) return

    if (page === "regular-detail") {
      setSelectedOfficeHourId(id ?? null)
    }
    if (page === "application") {
      setSelectedApplicationId(id ?? null)
    }

    setCurrentPage(page)
    navigate({
      pathname: `${basePath}/${page}`,
      search: id ? `?id=${encodeURIComponent(id)}` : "",
    })
  }
  const handleNavigateLoose = (page: string, id?: string) => handleNavigate(page as AppPage, id)

  const handleSelectOfficeHour = (id: string) => {
    handleNavigate("regular-detail", id)
  }

  const handleStartRegularApplication = () => {
    handleNavigate("regular-wizard")
  }

  const hasOtherActiveApplicationsForSlot = (
    slotId: string,
    applicationId: string,
    appList: Application[],
  ) => {
    return appList.some(
      (app) =>
        app.id !== applicationId &&
        app.officeHourSlotId === slotId &&
        app.status !== "cancelled" &&
        app.status !== "rejected",
    )
  }

  const getRelatedSlotIdsForApplication = (application: Application) => {
    const slotId = application.officeHourSlotId
    if (!slotId) return []
    const baseSlot = officeHourSlotList.find((slot) => slot.id === slotId)
    if (!baseSlot) return [slotId]
    if (baseSlot.consultantId) return [slotId]
    if (!baseSlot.programId || !baseSlot.date || !baseSlot.startTime) {
      return [slotId]
    }

    const matchedSlotIds = officeHourSlotList
      .filter(
        (slot) =>
          slot.type === "regular" &&
          slot.programId === baseSlot.programId &&
          slot.date === baseSlot.date &&
          slot.startTime === baseSlot.startTime,
      )
      .map((slot) => slot.id)

    return matchedSlotIds.length > 0 ? matchedSlotIds : [slotId]
  }

  const collectReleasableSlotIds = (changedApplications: Application[], appList: Application[]) => {
    const releasable = new Set<string>()

    changedApplications.forEach((application) => {
      getRelatedSlotIdsForApplication(application).forEach((slotId) => {
        if (!hasOtherActiveApplicationsForSlot(slotId, application.id, appList)) {
          releasable.add(slotId)
        }
      })
    })

    return releasable
  }

  const releaseSlots = async (slotIds: Set<string>) => {
    if (slotIds.size === 0) return
    if (isFirebaseConfigured) {
      const operations = Array.from(slotIds).map((slotId) => ({
        type: "update" as const,
        collection: COLLECTIONS.OFFICE_HOUR_SLOTS,
        docId: slotId,
        data: { status: "open" },
      }))
      const updated = await officeHourSlotCrud.batchUpdate(operations)
      if (!updated) {
        toast.error("슬롯 상태 업데이트에 실패했습니다")
      }
      return
    }
    slotIds.forEach((slotId) => applyLocalSlotStatus(slotId, "open"))
  }

  const applyLocalSlotStatus = (slotId: string, status: OfficeHourSlotStatus) => {
    setOfficeHourSlotList((prev) =>
      prev.map((slot) => (slot.id === slotId ? { ...slot, status } : slot)),
    )
    setRegularOfficeHourList((prev) =>
      prev.map((officeHour) => {
        if (!officeHour.slots?.some((slot) => slot.id === slotId)) {
          return officeHour
        }
        return {
          ...officeHour,
          slots: officeHour.slots.map((slot) => (slot.id === slotId ? { ...slot, status } : slot)),
        }
      }),
    )
  }

  const acquireSubmissionLock = (key: string) => {
    if (submissionLocksRef.current.has(key)) return false
    submissionLocksRef.current.add(key)
    return true
  }

  const releaseSubmissionLock = (key: string) => {
    submissionLocksRef.current.delete(key)
  }

  const sanitizeStorageFileName = (name: string) => name.replace(/[^\w.-]/g, "_")

  const uploadApplicationAttachments = async (files: FileItem[], folder: string) => {
    if (files.length === 0) {
      return []
    }
    if (!isFirebaseConfigured) {
      return []
    }
    if (!firebaseStorage) {
      throw new Error("Firebase Storage가 설정되지 않았습니다.")
    }
    const storageInstance = firebaseStorage
    const baseKey = `${folder}/${Date.now()}`
    return Promise.all(
      files.map(async (item, index) => {
        if (!item.file) {
          throw new Error("첨부 파일 원본을 찾을 수 없습니다.")
        }
        const fileName = sanitizeStorageFileName(item.name)
        const fileRef = ref(
          storageInstance,
          `office-hour-applications/${baseKey}-${index}-${fileName}`,
        )
        await uploadBytes(fileRef, item.file)
        return getDownloadURL(fileRef)
      }),
    )
  }

  const removeApplicationAttachmentsFromStorage = async (attachments?: string[]) => {
    if (!isFirebaseConfigured || !firebaseStorage || !attachments?.length) {
      return 0
    }
    const storageInstance = firebaseStorage
    const targets = attachments.filter(
      (item) =>
        typeof item === "string" &&
        (item.startsWith("http://") || item.startsWith("https://") || item.startsWith("gs://")),
    )
    if (targets.length === 0) return 0

    const results = await Promise.all(
      targets.map(async (fileUrl) => {
        try {
          await deleteObject(ref(storageInstance, fileUrl))
          return true
        } catch {
          return false
        }
      }),
    )
    return results.filter((ok) => !ok).length
  }

  const getFunctionErrorMessage = (error: unknown, fallback: string) => {
    if (error && typeof error === "object") {
      console.error("Function call failed:", error)
      const maybeFirebaseError = error as {
        message?: string
        code?: string
        details?: unknown
      }
      if (maybeFirebaseError.message) {
        const codeSuffix = maybeFirebaseError.code ? ` (${maybeFirebaseError.code})` : ""
        return `${maybeFirebaseError.message}${codeSuffix}`
      }
    }
    return error instanceof Error && error.message ? error.message : fallback
  }

  const handleSubmitRegularApplication = async (data: ApplicationFormData) => {
    const officeHour = resolvedRegularOfficeHourList.find((oh) => oh.id === data.officeHourId)
    if (!officeHour) return
    if (isBefore(startOfDay(data.date), startOfDay(new Date()))) {
      toast.error("오늘 이전 날짜는 신청할 수 없습니다")
      return
    }

    const scheduledDate = formatDateKey(data.date)
    const requesterId = firebaseUser?.uid ?? user.id
    const submissionKey = [
      "regular",
      requesterId,
      data.officeHourId,
      scheduledDate,
      data.time,
      data.agendaId,
    ].join(":")
    if (!acquireSubmissionLock(submissionKey)) {
      toast.error("동일 신청을 처리 중입니다. 잠시만 기다려주세요.")
      return
    }

    try {
      const selectedSlot = data.slotId
        ? officeHourSlotList.find((slot) => slot.id === data.slotId)
        : officeHour.slots?.find(
            (slot) =>
              slot.date === scheduledDate &&
              slot.startTime === data.time &&
              slot.status === "open" &&
              (!slot.agendaIds || slot.agendaIds.includes(data.agendaId)),
          )

      if (selectedSlot && selectedSlot.status !== "open") {
        toast.error("선택한 시간이 이미 마감되었습니다")
        return
      }

      const agenda = agendaList.find((a) => a.id === data.agendaId)
      if (!agenda) {
        toast.error("선택한 아젠다 정보를 찾지 못했습니다")
        return
      }
      if (resolvedRole === "user") {
        const scope = agenda.scope === "internal" ? "internal" : "external"
        const remaining =
          scope === "internal" ? ticketStats.remainingInternal : ticketStats.remainingExternal
        if (remaining <= 0) {
          toast.error(
            scope === "internal"
              ? "내부 티켓이 모두 소진되어 신청할 수 없습니다"
              : "외부 티켓이 모두 소진되어 신청할 수 없습니다",
          )
          return
        }
      }

      const applicantConflict = hasApplicantConflictAt({
        applications,
        dateKey: scheduledDate,
        time: data.time,
        createdByUid: requesterId,
        companyId: companyRecordId,
        applicantEmail: user.email,
      })
      if (applicantConflict) {
        toast.error("이미 같은 시간에 신청한 일정이 있어 중복 신청할 수 없습니다.")
        return
      }

      const linkedConsultants = consultants.filter(
        (consultant) =>
          consultant.status === "active" && (consultant.agendaIds ?? []).includes(data.agendaId),
      )
      if (linkedConsultants.length === 0) {
        toast.error("선택한 아젠다에 연결된 활성 컨설턴트가 없습니다")
        return
      }

      const assignableConsultants = getAssignableConsultantsAt({
        consultants: linkedConsultants,
        applications,
        officeHourSlots: officeHourSlotList,
        agendaId: data.agendaId,
        dateKey: scheduledDate,
        time: data.time,
        slotConsultantId: selectedSlot?.consultantId,
      })

      if (assignableConsultants.length === 0) {
        toast.error(
          "선택한 시간에 현재 배정 가능한 컨설턴트가 없어 신청할 수 없습니다. 다른 시간을 선택해 주세요.",
        )
        return
      }

      const attachmentNames = data.files.map((f) => f.name)
      let uploadedAttachmentUrls: string[] = []
      if (isFirebaseConfigured && !firebaseUser?.uid) {
        toast.error("로그인 정보를 확인한 뒤 다시 시도해주세요")
        return
      }
      if (isFirebaseConfigured && data.files.length > 0) {
        try {
          uploadedAttachmentUrls = await uploadApplicationAttachments(
            data.files,
            `regular/${firebaseUser?.uid ?? user.id}`,
          )
        } catch {
          toast.error("첨부 파일 업로드에 실패했습니다")
          return
        }
      }

      const newApplication: Application = {
        id: `app${Date.now()}`,
        type: "regular",
        status: "pending",
        officeHourId: data.officeHourId,
        officeHourSlotId: selectedSlot?.id ?? data.slotId,
        companyId: companyRecordId,
        programId: officeHour.programId,
        officeHourTitle: officeHour.title,
        agendaId: data.agendaId,
        companyName: user.companyName,
        consultant: "담당자 배정 중",
        sessionFormat: data.sessionFormat,
        agenda: agenda.name,
        requestContent: data.requestContent,
        attachments: attachmentNames,
        attachmentUrls: uploadedAttachmentUrls.length > 0 ? uploadedAttachmentUrls : undefined,
        applicantName: user.companyName,
        applicantEmail: user.email,
        createdByUid: requesterId,
        scheduledDate,
        scheduledTime: data.time,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      if (isFirebaseConfigured) {
        if (!firebaseUser?.uid) {
          toast.error("로그인 정보를 확인한 뒤 다시 시도해주세요")
          return
        }
        try {
          await submitRegularApplicationViaFunction({
            officeHourId: data.officeHourId,
            officeHourSlotId: selectedSlot?.id ?? data.slotId ?? null,
            officeHourTitle: officeHour.title,
            programId: officeHour.programId ?? null,
            agendaId: data.agendaId,
            scheduledDate,
            scheduledTime: data.time,
            sessionFormat: data.sessionFormat,
            requestContent: data.requestContent,
            attachmentNames,
            attachmentUrls: uploadedAttachmentUrls,
          })
        } catch (error) {
          await removeApplicationAttachmentsFromStorage(uploadedAttachmentUrls)
          const message =
            error instanceof Error && error.message
              ? error.message
              : "신청 저장에 실패했습니다"
          toast.error(message)
          return
        }
      } else {
        setApplications((prev) => [...prev, newApplication])
        if (newApplication.officeHourSlotId) {
          applyLocalSlotStatus(newApplication.officeHourSlotId, "booked")
        }
      }

      toast.success("신청이 제출되었습니다", {
        description: "검토 후 일정이 확정되면 알림을 보내드립니다.",
      })
      handleNavigate("dashboard")
    } finally {
      releaseSubmissionLock(submissionKey)
    }
  }

  const handleStartIrregularApplication = () => {
    handleNavigate("irregular-wizard")
  }

  const handleSubmitIrregularApplication = async (data: IrregularApplicationFormData) => {
    const requesterId = firebaseUser?.uid ?? user.id
    const periodFromKey = formatDateKey(data.periodFrom)
    const periodToKey = formatDateKey(data.periodTo)
    const submissionKey = [
      "irregular",
      requesterId,
      data.agendaId,
      periodFromKey,
      periodToKey,
      data.isInternal ? "internal" : "external",
      data.projectName.trim(),
    ].join(":")
    if (!acquireSubmissionLock(submissionKey)) {
      toast.error("동일 신청을 처리 중입니다. 잠시만 기다려주세요.")
      return
    }

    try {
      const agenda = agendaList.find((a) => a.id === data.agendaId)
      if (resolvedRole === "user") {
        const remaining = data.isInternal
          ? ticketStats.remainingInternal
          : ticketStats.remainingExternal
        if (remaining <= 0) {
          toast.error(
            data.isInternal
              ? "내부 티켓이 모두 소진되어 신청할 수 없습니다"
              : "외부 티켓이 모두 소진되어 신청할 수 없습니다",
          )
          return
        }
      }

      const attachmentNames = data.files.map((f) => f.name)
      let uploadedAttachmentUrls: string[] = []
      if (isFirebaseConfigured && !firebaseUser?.uid) {
        toast.error("로그인 정보를 확인한 뒤 다시 시도해주세요")
        return
      }
      if (isFirebaseConfigured && data.files.length > 0) {
        try {
          uploadedAttachmentUrls = await uploadApplicationAttachments(
            data.files,
            `irregular/${firebaseUser?.uid ?? user.id}`,
          )
        } catch {
          toast.error("첨부 파일 업로드에 실패했습니다")
          return
        }
      }

      const newApplication: Application = {
        id: `app${Date.now()}`,
        type: "irregular",
        status: "pending",
        companyId: companyRecordId,
        officeHourTitle: `비정기 오피스아워 - ${agenda?.name || ""}`,
        agendaId: data.agendaId,
        companyName: user.companyName,
        consultant: "담당자 배정 중",
        sessionFormat: data.sessionFormat,
        agenda: agenda?.name || "",
        requestContent: data.requestContent,
        attachments: attachmentNames,
        attachmentUrls: uploadedAttachmentUrls.length > 0 ? uploadedAttachmentUrls : undefined,
        applicantName: user.companyName,
        applicantEmail: user.email,
        createdByUid: requesterId,
        periodFrom: periodFromKey,
        periodTo: periodToKey,
        projectName: data.projectName,
        isInternal: data.isInternal,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      if (isFirebaseConfigured) {
        if (!firebaseUser?.uid) {
          toast.error("로그인 정보를 확인한 뒤 다시 시도해주세요")
          return
        }
        const payload = omitId(newApplication)
        const createdId = await officeHourApplicationCrud.create(payload)
        if (!createdId) {
          await removeApplicationAttachmentsFromStorage(uploadedAttachmentUrls)
          toast.error("신청 저장에 실패했습니다")
          return
        }
      } else {
        setApplications((prev) => [...prev, newApplication])
      }

      toast.success("신청이 제출되었습니다", {
        description: "담당 컨설턴트 배정 후 일정을 조율하겠습니다.",
      })
      handleNavigate("irregular")
    } finally {
      releaseSubmissionLock(submissionKey)
    }
  }

  const handleViewApplication = (id: string) => {
    handleNavigate("application", id)
  }

  const handleSendMessage = (applicationId: string, content: string, files: FileItem[]) => {
    const newMessage: Message = {
      id: `msg${Date.now()}`,
      applicationId,
      content,
      sender: "user",
      timestamp: new Date(),
      attachments: files.map((f) => f.name),
    }

    setMessages([...messages, newMessage])
    toast.success("메시지가 전송되었습니다")
  }

  const handleCancelApplication = async (id: string) => {
    const targetApplication = applications.find((app) => app.id === id)
    if (!targetApplication) return
    if (isFirebaseConfigured) {
      try {
        const result = await cancelApplicationViaFunction(id)
        if (result.outcome === "deleted") {
          const failedAttachmentDeletes = await removeApplicationAttachmentsFromStorage(
            targetApplication.attachmentUrls?.length
              ? targetApplication.attachmentUrls
              : targetApplication.attachments,
          )
          if (failedAttachmentDeletes > 0) {
            toast.error("첨부 파일 일부 삭제에 실패했습니다")
          }
          toast.success("신청이 삭제되었습니다")
          handleNavigate("dashboard")
          return
        }

        toast.error("진행 시간이 지나 취소할 수 없어 자동 거절 처리되었습니다")
      } catch (error) {
        toast.error(getFunctionErrorMessage(error, "신청 삭제에 실패했습니다"))
      }
      return
    }
    if (
      normalizeApplicationStatus(targetApplication.status) === "pending" &&
      hasSessionEnded(targetApplication)
    ) {
      await rejectApplicationsAsExpired([targetApplication])
      toast.error("진행 시간이 지나 취소할 수 없어 자동 거절 처리되었습니다")
      return
    }

    const nextApplications = applications.filter((app) => app.id !== id)

    if (isFirebaseConfigured) {
      const removed = await officeHourApplicationCrud.remove(id)
      if (!removed) {
        toast.error("신청 삭제에 실패했습니다")
        return
      }
      const failedAttachmentDeletes = await removeApplicationAttachmentsFromStorage(
        targetApplication.attachmentUrls?.length
          ? targetApplication.attachmentUrls
          : targetApplication.attachments,
      )
      if (failedAttachmentDeletes > 0) {
        toast.error("첨부 파일 일부 삭제에 실패했습니다")
      }
    }
    setApplications(nextApplications)

    const releasableSlotIds = collectReleasableSlotIds([targetApplication], nextApplications)
    await releaseSlots(releasableSlotIds)

    toast.success("신청이 삭제되었습니다")
    handleNavigate("dashboard")
  }

  const handleUpdateApplicationStatus = async (id: string, status: ApplicationStatus) => {
    const targetApplication = applications.find((app) => app.id === id)
    if (!targetApplication) return
    if (isFirebaseConfigured) {
      if (status === "pending") {
        try {
          await transitionApplicationStatusViaFunction({
            applicationId: id,
            action: "reopen",
          })
        } catch (error) {
          toast.error(getFunctionErrorMessage(error, "수락 대기 변경에 실패했습니다"))
          return
        }

        toast.success("상태가 수락 대기로 변경되었습니다.")
        return
      }

      toast.error("상태 변경은 서버 함수 경유로만 처리할 수 있습니다")
      return
    }
    const now = new Date()
    const expired = hasSessionEnded(targetApplication, now)

    if (expired) {
      const isPendingLike = normalizeApplicationStatus(targetApplication.status) === "pending"
      if (isPendingLike && status !== "rejected") {
        await rejectApplicationsAsExpired([targetApplication], now)
        toast.error("진행 시간이 지나 자동으로 거절 처리되었습니다")
        return
      }
    }

    const nextStatus = status
    const updatedAt = now
    const fallbackConsultantName =
      currentConsultant?.name ??
      firebaseUser?.displayName?.trim() ??
      (firebaseUser?.email ? firebaseUser.email.split("@")[0] : "")
    const fallbackConsultantId = currentConsultant?.id ?? firebaseUser?.uid ?? null
    const shouldAssignConsultant =
      status === "confirmed" &&
      resolvedRole === "consultant" &&
      fallbackConsultantId &&
      fallbackConsultantName
    const assignmentPatch = shouldAssignConsultant
      ? {
          consultant: fallbackConsultantName,
          consultantId: fallbackConsultantId,
        }
      : {}
    const shouldClearConsultant =
      nextStatus === "pending" || nextStatus === "cancelled" || nextStatus === "rejected"
    const clearAssignmentPatch = shouldClearConsultant
      ? {
          consultant: "담당자 배정 중",
          consultantId: "",
        }
      : {}
    const rejectionPatch = nextStatus === "rejected" ? {} : { rejectionReason: undefined }
    const rejectionPatchRemote = nextStatus === "rejected" ? {} : { rejectionReason: deleteField() }
    const nextApplications = applications.map((app) =>
      app.id === id
        ? {
            ...app,
            status: nextStatus,
            updatedAt,
            ...assignmentPatch,
            ...clearAssignmentPatch,
            ...rejectionPatch,
          }
        : app,
    )

    if (isFirebaseConfigured) {
      const payload: Record<string, any> = {
        status: nextStatus,
        updatedAt,
        ...assignmentPatch,
        ...clearAssignmentPatch,
        ...rejectionPatchRemote,
      }
      if (nextStatus === "completed") {
        payload.completedAt = new Date()
      }
      const updated = await officeHourApplicationCrud.update(id, payload)
      if (!updated) {
        toast.error("상태 저장에 실패했습니다")
        return
      }
    } else {
      setApplications(nextApplications)
    }

    const slotId = targetApplication.officeHourSlotId
    if (!slotId) return

    const shouldReleaseSlot =
      status === "cancelled" ||
      status === "rejected"
    if (shouldReleaseSlot) {
      const releasableSlotIds = collectReleasableSlotIds([targetApplication], nextApplications)
      await releaseSlots(releasableSlotIds)
      return
    }

    if (isFirebaseConfigured) {
      const slotUpdated = await officeHourSlotCrud.update(slotId, { status: "booked" })
      if (!slotUpdated) {
        toast.error("슬롯 상태 업데이트에 실패했습니다")
      }
    } else {
      applyLocalSlotStatus(slotId, "booked")
    }
  }

  const handleRequestApplication = async (id: string) => {
    if (resolvedRole !== "consultant") return
    if (!currentConsultant) {
      toast.error("컨설턴트 정보를 확인할 수 없습니다")
      return
    }
    const submissionKey = ["application-action", "claim", id].join(":")
    if (!acquireSubmissionLock(submissionKey)) {
      toast.error("이미 수락 요청을 처리 중입니다. 잠시만 기다려주세요.")
      return
    }

    try {
      const targetApplication = applications.find((app) => app.id === id)
      if (!targetApplication) return
      if (isFirebaseConfigured) {
        try {
          await transitionApplicationStatusViaFunction({
            applicationId: id,
            action: "claim",
          })
        } catch (error) {
          toast.error(getFunctionErrorMessage(error, "수락 요청 처리에 실패했습니다"))
          return
        }
        return
      }
      if (hasSessionEnded(targetApplication)) {
        await rejectApplicationsAsExpired([targetApplication])
        toast.error("진행 시간이 지나 수락할 수 없어 자동 거절 처리되었습니다")
        return
      }

    const isAcceptableStatus = normalizeApplicationStatus(targetApplication.status) === "pending"
    const isUnassigned =
      !targetApplication.consultantId &&
      (!targetApplication.consultant || targetApplication.consultant === "담당자 배정 중")
    if (!isAcceptableStatus || !isUnassigned) {
      toast.error("담당 수락할 수 있는 상태가 아닙니다")
      return
    }
    const agendaOk = targetApplication.agendaId
      ? consultantAgendaIds.has(targetApplication.agendaId)
      : consultantAgendaNames.has(targetApplication.agenda)
    if (!agendaOk) {
      toast.error("배정된 아젠다와 일치하지 않습니다")
      return
    }
    const reservedSlot = targetApplication.officeHourSlotId
      ? officeHourSlotList.find((slot) => slot.id === targetApplication.officeHourSlotId)
      : undefined
    if (
      reservedSlot?.consultantId &&
      reservedSlot.consultantId !== currentConsultant.id
    ) {
      toast.error("배정된 컨설턴트만 이 신청을 처리할 수 있습니다")
      return
    }

    const hasConflict =
      Boolean(targetApplication.scheduledDate && targetApplication.scheduledTime) &&
      applications.some((app) => {
        if (app.id === targetApplication.id) return false
        if (app.consultantId !== currentConsultant.id) return false
        if (app.status !== "confirmed" && app.status !== "completed") return false
        return (
          app.scheduledDate === targetApplication.scheduledDate &&
          app.scheduledTime === targetApplication.scheduledTime
        )
      })

    if (hasConflict) {
      toast.error("이미 동일한 시간에 확정된 일정이 있습니다")
      return
    }

    if (
      targetApplication.scheduledDate &&
      targetApplication.scheduledTime &&
      !isConsultantAvailableAt(
        currentConsultant,
        targetApplication.scheduledDate,
        targetApplication.scheduledTime,
      )
    ) {
      toast.error("컨설턴트 설정상 가능한 시간이 아닙니다")
      return
    }

    const updatedAt = new Date()
    const nextApplication = {
      ...targetApplication,
      status: "confirmed" as const,
      consultant: currentConsultant.name,
      consultantId: currentConsultant.id,
      updatedAt,
    }

    if (isFirebaseConfigured) {
      const updated = await officeHourApplicationCrud.update(id, {
        status: "confirmed",
        consultant: currentConsultant.name,
        consultantId: currentConsultant.id,
        updatedAt,
      })
      if (!updated) {
        toast.error("수락 요청 처리에 실패했습니다")
        return
      }
    } else {
      setApplications((prev) => prev.map((app) => (app.id === id ? nextApplication : app)))
    }

      toast.success("수락이 완료되어 확정되었습니다.")
    } finally {
      releaseSubmissionLock(submissionKey)
    }
  }

  const handleRejectApplication = async (id: string, reason: string) => {
    if (resolvedRole !== "consultant") return
    if (!currentConsultant) {
      toast.error("컨설턴트 정보를 확인할 수 없습니다")
      return
    }
    const submissionKey = ["application-action", "reject", id].join(":")
    if (!acquireSubmissionLock(submissionKey)) {
      toast.error("이미 거절 처리를 진행 중입니다. 잠시만 기다려주세요.")
      return
    }

    try {
      const targetApplication = applications.find((app) => app.id === id)
      if (!targetApplication) return
      const rejectionReason = reason.trim()
      if (!rejectionReason) {
        toast.error("거절 사유를 입력해주세요")
        return
      }
      if (isFirebaseConfigured) {
        try {
          await transitionApplicationStatusViaFunction({
            applicationId: id,
            action: "reject",
            rejectionReason,
          })
        } catch (error) {
          toast.error(getFunctionErrorMessage(error, "거절 처리에 실패했습니다"))
          return
        }
        return
      }

    const isAcceptableStatus = normalizeApplicationStatus(targetApplication.status) === "pending"
    const isUnassigned =
      !targetApplication.consultantId &&
      (!targetApplication.consultant || targetApplication.consultant === "담당자 배정 중")
    const isAssignedToCurrent = targetApplication.consultantId === currentConsultant.id
    const reservedSlot = targetApplication.officeHourSlotId
      ? officeHourSlotList.find((slot) => slot.id === targetApplication.officeHourSlotId)
      : undefined

    if (
      reservedSlot?.consultantId &&
      reservedSlot.consultantId !== currentConsultant.id
    ) {
      toast.error("배정된 컨설턴트만 이 신청을 처리할 수 있습니다")
      return
    }

    if (!isAcceptableStatus || !(isUnassigned || isAssignedToCurrent)) {
      toast.error("거절할 수 있는 상태가 아닙니다")
      return
    }

    const updatedAt = new Date()

    const nextApplication = {
      ...targetApplication,
      status: "rejected" as const,
      consultant: currentConsultant.name,
      consultantId: currentConsultant.id,
      rejectionReason,
      updatedAt,
    }
    const nextApplications = applications.map((app) => (app.id === id ? nextApplication : app))

    setApplications(nextApplications)
    if (isFirebaseConfigured) {
      const updated = await officeHourApplicationCrud.update(id, {
        status: "rejected",
        consultant: currentConsultant.name,
        consultantId: currentConsultant.id,
        rejectionReason,
        updatedAt,
      })
      if (!updated) {
        toast.error("거절 처리에 실패했습니다")
        return
      }
    }

    const releasableSlotIds = collectReleasableSlotIds([targetApplication], nextApplications)
    await releaseSlots(releasableSlotIds)

      toast.success("거절 처리되었습니다.")
    } finally {
      releaseSubmissionLock(submissionKey)
    }
  }

  const handleConfirmApplication = async (id: string) => {
    if (resolvedRole !== "consultant") return
    if (!currentConsultant) {
      toast.error("컨설턴트 정보를 확인할 수 없습니다")
      return
    }
    const submissionKey = ["application-action", "confirm", id].join(":")
    if (!acquireSubmissionLock(submissionKey)) {
      toast.error("이미 확정 처리를 진행 중입니다. 잠시만 기다려주세요.")
      return
    }

    try {
      const targetApplication = applications.find((app) => app.id === id)
      if (!targetApplication) return
      if (isFirebaseConfigured) {
        try {
          await transitionApplicationStatusViaFunction({
            applicationId: id,
            action: "confirm",
          })
        } catch (error) {
          toast.error(getFunctionErrorMessage(error, "확정 처리에 실패했습니다"))
          return
        }
        return
      }
      if (hasSessionEnded(targetApplication)) {
        await rejectApplicationsAsExpired([targetApplication])
        toast.error("진행 시간이 지나 확정할 수 없어 자동 거절 처리되었습니다")
        return
      }

    const isPending = normalizeApplicationStatus(targetApplication.status) === "pending"
    const isRequester = targetApplication.consultantId === currentConsultant.id
    const reservedSlot = targetApplication.officeHourSlotId
      ? officeHourSlotList.find((slot) => slot.id === targetApplication.officeHourSlotId)
      : undefined
    const isReservedToCurrent =
      !reservedSlot?.consultantId || reservedSlot.consultantId === currentConsultant.id
    if (!isPending || !isRequester || !isReservedToCurrent) {
      toast.error("확정할 수 있는 상태가 아닙니다")
      return
    }

    const hasConflict =
      Boolean(targetApplication.scheduledDate && targetApplication.scheduledTime) &&
      applications.some((app) => {
        if (app.id === targetApplication.id) return false
        if (app.consultantId !== currentConsultant.id) return false
        if (app.status !== "confirmed" && app.status !== "completed") return false
        return (
          app.scheduledDate === targetApplication.scheduledDate &&
          app.scheduledTime === targetApplication.scheduledTime
        )
      })

    if (hasConflict) {
      toast.error("이미 동일한 시간에 확정된 일정이 있습니다")
      return
    }

    if (
      targetApplication.scheduledDate &&
      targetApplication.scheduledTime &&
      !isConsultantAvailableAt(
        currentConsultant,
        targetApplication.scheduledDate,
        targetApplication.scheduledTime,
      )
    ) {
      toast.error("컨설턴트 설정상 가능한 시간이 아닙니다")
      return
    }

    const updatedAt = new Date()
    const assignmentPatch = {
      consultant: currentConsultant.name,
      consultantId: currentConsultant.id,
    }
    const nextApplication = {
      ...targetApplication,
      status: "confirmed" as const,
      updatedAt,
      ...assignmentPatch,
    }

    if (isFirebaseConfigured) {
      const updated = await officeHourApplicationCrud.update(id, {
        status: "confirmed",
        updatedAt,
        ...assignmentPatch,
      })
      if (!updated) {
        toast.error("확정 처리에 실패했습니다")
        return
      }
    } else {
      setApplications((prev) => prev.map((app) => (app.id === id ? nextApplication : app)))
    }

    if (targetApplication.officeHourSlotId) {
      if (isFirebaseConfigured) {
        const slotUpdated = await officeHourSlotCrud.update(targetApplication.officeHourSlotId, {
          status: "booked",
        })
        if (!slotUpdated) {
          toast.error("슬롯 상태 업데이트에 실패했습니다")
        }
      } else {
        applyLocalSlotStatus(targetApplication.officeHourSlotId, "booked")
      }
    }

      toast.success("일정이 확정되었습니다.")
    } finally {
      releaseSubmissionLock(submissionKey)
    }
  }

  const handleUpdateRejectionReason = async (id: string, reason: string) => {
    if (resolvedRole !== "consultant") return
    if (!currentConsultant) {
      toast.error("컨설턴트 정보를 확인할 수 없습니다")
      return
    }

    const targetApplication = applications.find((app) => app.id === id)
    if (!targetApplication) return

    const isRejected = targetApplication.status === "rejected"
    const isAssignedToCurrent = targetApplication.consultantId === currentConsultant.id
    if (!isRejected || !isAssignedToCurrent) {
      toast.error("거절 사유를 수정할 수 없습니다")
      return
    }

    const nextReason = reason.trim()
    if (!nextReason) {
      toast.error("거절 사유를 입력해주세요")
      return
    }

    const updatedAt = new Date()
    const nextApplications = applications.map((app) =>
      app.id === id ? { ...app, rejectionReason: nextReason, updatedAt } : app,
    )

    setApplications(nextApplications)
    if (isFirebaseConfigured) {
      const updated = await officeHourApplicationCrud.update(id, {
        rejectionReason: nextReason,
        updatedAt,
      })
      if (!updated) {
        toast.error("거절 사유 수정에 실패했습니다")
        return
      }
    }

    toast.success("거절 사유가 수정되었습니다")
  }

  const handleToggleMarketingConsent = async (checked: boolean) => {
    if (!firebaseUser?.uid) {
      toast.error("로그인 정보를 확인한 뒤 다시 시도해주세요")
      return
    }

    const nextMarketingConsent = {
      consented: checked,
      version: profile?.consents?.marketing?.version ?? "v1.0",
      method: "settings_toggle",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    }

    const updated = await profileCrud.update(firebaseUser.uid, {
      "consents.marketing.consented": nextMarketingConsent.consented,
      "consents.marketing.version": nextMarketingConsent.version,
      "consents.marketing.method": nextMarketingConsent.method,
      "consents.marketing.userAgent": nextMarketingConsent.userAgent,
      "consents.marketing.consentedAt": checked ? serverTimestamp() : deleteField(),
    })

    if (!updated) {
      toast.error("마케팅 수신 동의 저장에 실패했습니다")
      return
    }

    await refreshProfile()
    toast.success(checked ? "마케팅 수신 동의가 저장되었습니다." : "마케팅 수신 거부로 변경되었습니다.")
  }

  const handleUpdateApplication = async (id: string, data: Partial<Application>) => {
    const updatedAt = new Date()
    if (isFirebaseConfigured) {
      const updated = await officeHourApplicationCrud.update(id, {
        ...data,
        updatedAt,
      } as Partial<Omit<Application, "id">>)
      if (!updated) {
        toast.error("신청 정보 저장에 실패했습니다")
        return false
      }
    }

    setApplications((prev) =>
      prev.map((app) => (app.id === id ? { ...app, ...data, updatedAt } : app)),
    )
    return true
  }

  const handleUpdateApplicationByCompany = async (
    id: string,
    payload: {
      requestContent: string
      retainedAttachments: Array<{ name: string; url?: string }>
      newFiles: FileItem[]
    },
  ) => {
    const targetApplication = applications.find((app) => app.id === id)
    if (!targetApplication) {
      toast.error("신청 정보를 찾을 수 없습니다")
      return false
    }

    const isCompanyRole = resolvedRole === "user"
    if (!isCompanyRole) {
      toast.error("기업 계정만 신청을 수정할 수 있습니다")
      return false
    }

    const uid = firebaseUser?.uid ?? user.id
    const isOwnerByUid =
      Boolean(targetApplication.createdByUid && uid) && targetApplication.createdByUid === uid
    if (!isOwnerByUid) {
      toast.error("본인이 신청한 건만 수정할 수 있습니다")
      return false
    }

    const normalizedTargetStatus = normalizeApplicationStatus(targetApplication.status)
    if (
      (normalizedTargetStatus !== "pending" && normalizedTargetStatus !== "confirmed") ||
      hasSessionEnded(targetApplication)
    ) {
      toast.error("진행 시간이 지난 신청 또는 완료된 신청은 수정할 수 없습니다")
      return false
    }

    let uploadedUrls: string[] = []
    if (isFirebaseConfigured && payload.newFiles.length > 0) {
      if (!firebaseUser?.uid) {
        toast.error("로그인 정보를 확인한 뒤 다시 시도해주세요")
        return false
      }
      try {
        uploadedUrls = await uploadApplicationAttachments(
          payload.newFiles,
          `edit/${firebaseUser.uid}/${id}`,
        )
      } catch {
        toast.error("첨부 파일 업로드에 실패했습니다")
        return false
      }
    }

    const nextRequestContent = payload.requestContent.trim()
    if (!nextRequestContent) {
      toast.error("요청 내용을 입력해주세요")
      if (uploadedUrls.length > 0) {
        await removeApplicationAttachmentsFromStorage(uploadedUrls)
      }
      return false
    }

    const retainedUrls = payload.retainedAttachments
      .map((item) => item.url)
      .filter((value): value is string => Boolean(value))
    const retainedNames = payload.retainedAttachments.map((item) => item.name)
    const nextAttachmentNames = [...retainedNames, ...payload.newFiles.map((item) => item.name)]
    const nextAttachmentUrls = [...retainedUrls, ...uploadedUrls]
    const removedUrls = (targetApplication.attachmentUrls ?? []).filter(
      (url) => !retainedUrls.includes(url),
    )

    const updatedAt = new Date()
    const nextApplications = applications.map((app) =>
      app.id === id
        ? {
            ...app,
            requestContent: nextRequestContent,
            attachments: nextAttachmentNames,
            attachmentUrls: nextAttachmentUrls,
            updatedAt,
          }
        : app,
    )
    const remotePayload: Record<string, any> = {
      requestContent: nextRequestContent,
      attachments: nextAttachmentNames,
      attachmentUrls: nextAttachmentUrls,
      updatedAt,
    }

    if (isFirebaseConfigured) {
      const updated = await officeHourApplicationCrud.update(id, remotePayload)
      if (!updated) {
        if (uploadedUrls.length > 0) {
          await removeApplicationAttachmentsFromStorage(uploadedUrls)
        }
        return false
      }
    } else {
      setApplications(nextApplications)
    }

    if (removedUrls.length > 0) {
      const failedDeletes = await removeApplicationAttachmentsFromStorage(removedUrls)
      if (failedDeletes > 0) {
        toast.error("일부 기존 첨부 파일 삭제에 실패했습니다")
      }
    }

    toast.success("신청 내용이 수정되었습니다")
    return true
  }

  const saveConsultantToState = (nextConsultant: Consultant) => {
    setConsultants((prev) => {
      const existingIndex = prev.findIndex((consultant) => consultant.id === nextConsultant.id)

      if (existingIndex < 0) {
        return [...prev, nextConsultant]
      }

      const next = [...prev]
      next[existingIndex] = {
        ...next[existingIndex],
        ...nextConsultant,
      }
      return next
    })
  }

  const persistConsultant = async (nextConsultant: Consultant, existingConsultantId?: string) => {
    if (isFirebaseConfigured) {
      const payload = omitId(nextConsultant)
      if (existingConsultantId) {
        const ok = await consultantCrud.update(existingConsultantId, payload)
        if (!ok) return false
      } else {
        const ok = await consultantCrud.set(nextConsultant.id, payload, true)
        if (!ok) return false
      }
    }

    saveConsultantToState(nextConsultant)
    return true
  }

  const syncManagedRegularSlots = async (nextConsultants: Consultant[]) => {
    const { desiredSlots, closedSlots, mergedSlots } = buildManagedRegularSlots(
      programList,
      nextConsultants,
      agendaList,
      officeHourSlotList,
    )

    if (isFirebaseConfigured) {
      const operations = [
        ...desiredSlots.map((slot) => ({
          type: "set" as const,
          collection: COLLECTIONS.OFFICE_HOUR_SLOTS,
          docId: slot.id,
          data: omitId(slot),
        })),
        ...closedSlots.map((slot) => ({
          type: "update" as const,
          collection: COLLECTIONS.OFFICE_HOUR_SLOTS,
          docId: slot.id,
          data: { status: "closed" as const },
        })),
      ]

      if (operations.length > 0) {
        const synced = await officeHourSlotCrud.batchUpdate(operations)
        if (!synced) {
          toast.error("정기 오피스아워 슬롯 동기화에 실패했습니다")
          return false
        }
      }
    }

    setOfficeHourSlotList(mergedSlots)
    const slotGroups = groupSlotsToRegularOfficeHours(mergedSlots, programList)
    const programGroups = groupProgramsToRegularOfficeHours(programList)
    const programIdsWithSlots = new Set(
      slotGroups.map((group) => group.programId).filter(Boolean) as string[],
    )
    setRegularOfficeHourList([
      ...slotGroups,
      ...programGroups.filter((group) => !programIdsWithSlots.has(group.programId ?? "")),
    ])
    return true
  }

  const handleSaveConsultantProfile = async (values: ConsultantProfileFormValues) => {
    const name = values.name.trim()
    const email = values.email.trim()
    const authEmail = firebaseUser?.email?.trim() ?? ""

    if (!name || !email) {
      toast.error("이름과 이메일은 필수 입력입니다")
      return
    }
    if (
      !currentConsultant &&
      authEmail &&
      toNormalizedEmail(email) !== toNormalizedEmail(authEmail)
    ) {
      toast.error("최초 등록 시 이메일은 로그인 계정 이메일과 동일해야 합니다")
      return
    }

    const requestedSecondaryEmail = values.secondaryEmail.trim()
    const accessSafeSecondaryEmail =
      authEmail &&
      toNormalizedEmail(email) !== toNormalizedEmail(authEmail) &&
      toNormalizedEmail(requestedSecondaryEmail) !== toNormalizedEmail(authEmail)
        ? authEmail
        : requestedSecondaryEmail

    const consultantId = firebaseUser?.uid ?? currentConsultant?.id ?? `consultant-${Date.now()}`
    const nextConsultant: Consultant = {
      ...currentConsultant,
      id: consultantId,
      name,
      title: currentConsultant?.title ?? "컨설턴트",
      email,
      phone: values.phone.trim(),
      organization: values.organization.trim(),
      secondaryEmail: accessSafeSecondaryEmail,
      secondaryPhone: values.secondaryPhone.trim(),
      fixedMeetingLink: values.fixedMeetingLink.trim(),
      expertise: parseExpertiseInput(values.expertise),
      bio: values.bio.trim(),
      status: currentConsultant?.status ?? "active",
      agendaIds:
        (currentConsultant?.agendaIds?.length ?? 0) > 0 ? currentConsultant?.agendaIds : undefined,
      availability: currentConsultant?.availability ?? buildDefaultConsultantAvailability(),
    }

    if (isFirebaseConfigured) {
      const authUid = firebaseUser?.uid ?? ""
      const authEmail = firebaseUser?.email?.trim() ?? ""
      if (!authUid || !authEmail) {
        toast.error("로그인 정보를 확인한 뒤 다시 시도해주세요")
        return
      }
      const payload = omitId(nextConsultant)
      const updated = await consultantCrud.update(authUid, payload)
      if (!updated) {
        const authEmailKey = toNormalizedEmail(authEmail)
        const primaryEmailKey = toNormalizedEmail(payload.email)
        const createPayload: Omit<Consultant, "id"> = {
          ...payload,
          email: authEmail,
          ...(primaryEmailKey && primaryEmailKey !== authEmailKey
            ? { secondaryEmail: payload.email }
            : {}),
        }
        const created = await consultantCrud.set(authUid, createPayload, true)
        if (!created) {
          toast.error("내 정보 저장에 실패했습니다")
          return
        }
        saveConsultantToState({
          ...nextConsultant,
          id: authUid,
          email: authEmail,
          ...(primaryEmailKey && primaryEmailKey !== authEmailKey
            ? { secondaryEmail: payload.email }
            : {}),
        })
        toast.success("내 정보가 저장되었습니다")
        return
      }
      saveConsultantToState({ ...nextConsultant, id: authUid })
      toast.success("내 정보가 저장되었습니다")
      return
    }

    const ok = await persistConsultant(nextConsultant, currentConsultant?.id)
    if (!ok) {
      toast.error("내 정보 저장에 실패했습니다")
      return
    }
    toast.success("내 정보가 저장되었습니다")
  }

  const handleSaveConsultantSchedule = async (availability: Consultant["availability"]) => {
    const fallbackName =
      currentConsultant?.name ??
      firebaseUser?.displayName?.trim() ??
      firebaseUser?.email?.split("@")[0] ??
      "컨설턴트"
    const fallbackEmail = currentConsultant?.email ?? firebaseUser?.email ?? ""
    const consultantId = firebaseUser?.uid ?? currentConsultant?.id ?? `consultant-${Date.now()}`

    if (!fallbackEmail) {
      toast.error("계정 이메일 정보를 확인할 수 없습니다")
      return
    }

    const currentAvailableSlotKeys = new Set(
      (currentConsultant?.availability ?? [])
        .flatMap((day) =>
          day.slots
            .filter((slot) => slot.available)
            .map((slot) => buildAvailabilitySlotKey(day.dayOfWeek, slot.start)),
        ),
    )
    const nextAvailableSlotKeys = new Set(
      availability.flatMap((day) =>
        day.slots
          .filter((slot) => slot.available)
          .map((slot) => buildAvailabilitySlotKey(day.dayOfWeek, slot.start)),
      ),
    )
    const removedSlotKeys = new Set(
      Array.from(currentAvailableSlotKeys).filter((key) => !nextAvailableSlotKeys.has(key)),
    )

    if (removedSlotKeys.size > 0) {
      const currentConsultantNameKey = normalizeConsultantDisplayName(currentConsultant?.name ?? fallbackName)
      const hasConfirmedConflict = applications.some((application) => {
        if (normalizeApplicationStatus(application.status) !== "confirmed") return false
        if (!application.scheduledDate || !application.scheduledTime) return false

        const isAssignedToCurrent =
          (consultantId && application.consultantId === consultantId) ||
          (
            currentConsultantNameKey !== "" &&
            normalizeConsultantDisplayName(application.consultant) === currentConsultantNameKey
          )
        if (!isAssignedToCurrent) return false

        const start = parseLocalDateTimeKey(application.scheduledDate, application.scheduledTime)
        if (!start) return false
        const durationHours = application.duration ?? 1
        const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000)
        if (end <= new Date()) return false

        const slotKey = buildAvailabilitySlotKey(start.getDay(), application.scheduledTime)
        return removedSlotKeys.has(slotKey)
      })

      if (hasConfirmedConflict) {
        toast.error(
          "확정된 일정이 있는 시간입니다. 제거하려는 시간에 이미 확정된 오피스아워 일정이 있습니다. 일정 조정 또는 신청 관리 확인 후 다시 변경해주세요.",
        )
        return
      }
    }

    const nextConsultant: Consultant = {
      ...currentConsultant,
      id: consultantId,
      name: fallbackName,
      title: currentConsultant?.title ?? "컨설턴트",
      email: fallbackEmail,
      phone: currentConsultant?.phone,
      organization: currentConsultant?.organization,
      secondaryEmail: currentConsultant?.secondaryEmail,
      secondaryPhone: currentConsultant?.secondaryPhone,
      fixedMeetingLink: currentConsultant?.fixedMeetingLink,
      expertise: currentConsultant?.expertise ?? [],
      bio: currentConsultant?.bio ?? `${fallbackName} 컨설턴트`,
      status: currentConsultant?.status ?? "active",
      agendaIds:
        (currentConsultant?.agendaIds?.length ?? 0) > 0 ? currentConsultant?.agendaIds : undefined,
      availability,
    }

    if (isFirebaseConfigured) {
      const updated = await consultantCrud.update(consultantId, { availability })
      if (!updated) {
        const authUid = firebaseUser?.uid ?? ""
        const authEmail = firebaseUser?.email?.trim() ?? ""
        if (!authUid || !authEmail) {
          toast.error("로그인 정보를 확인한 뒤 다시 시도해주세요")
          return
        }
        const authEmailKey = toNormalizedEmail(authEmail)
        const fallbackEmailKey = toNormalizedEmail(fallbackEmail)
        const preservedSecondaryEmail =
          fallbackEmail && fallbackEmailKey !== authEmailKey
            ? fallbackEmail
            : currentConsultant?.secondaryEmail
        const createPayload: Omit<Consultant, "id"> = {
          ...omitId(nextConsultant),
          email: authEmail,
          ...(preservedSecondaryEmail ? { secondaryEmail: preservedSecondaryEmail } : {}),
        }
        const created = await consultantCrud.set(authUid, createPayload, true)
        if (!created) {
          toast.error("스케줄 저장에 실패했습니다")
          return
        }
        const syncedConsultant = {
          ...nextConsultant,
          id: authUid,
          email: authEmail,
          ...(preservedSecondaryEmail ? { secondaryEmail: preservedSecondaryEmail } : {}),
        }
        saveConsultantToState(syncedConsultant)
        const nextConsultants = consultants.some((consultant) => consultant.id === syncedConsultant.id)
          ? consultants.map((consultant) =>
              consultant.id === syncedConsultant.id ? syncedConsultant : consultant,
            )
          : [...consultants, syncedConsultant]
        const slotsSynced = await syncManagedRegularSlots(nextConsultants)
        if (!slotsSynced) return
        toast.success("내 스케줄이 저장되었습니다")
        return
      }
      saveConsultantToState(nextConsultant)
      const nextConsultants = consultants.some((consultant) => consultant.id === nextConsultant.id)
        ? consultants.map((consultant) =>
            consultant.id === nextConsultant.id ? nextConsultant : consultant,
          )
        : [...consultants, nextConsultant]
      const slotsSynced = await syncManagedRegularSlots(nextConsultants)
      if (!slotsSynced) return
      toast.success("내 스케줄이 저장되었습니다")
      return
    }

    const ok = await persistConsultant(nextConsultant, currentConsultant?.id)
    if (!ok) {
      toast.error("스케줄 저장에 실패했습니다")
      return
    }
    const nextConsultants = consultants.some((consultant) => consultant.id === nextConsultant.id)
      ? consultants.map((consultant) =>
          consultant.id === nextConsultant.id ? nextConsultant : consultant,
        )
      : [...consultants, nextConsultant]
    const slotsSynced = await syncManagedRegularSlots(nextConsultants)
    if (!slotsSynced) return
    toast.success("내 스케줄이 저장되었습니다")
  }

  const handleUpdateConsultant = async (id: string, data: Partial<Consultant>) => {
    const nextConsultantStatus = data.status
    const isMeetingLinkOnlyUpdate =
      data.fixedMeetingLink !== undefined &&
      data.status === undefined &&
      data.agendaIds === undefined &&
      data.availability === undefined &&
      Object.keys(data).length === 1
    setConsultants((prev) => prev.map((c) => (c.id === id ? { ...c, ...data } : c)))

    if (isFirebaseConfigured) {
      const ok = await consultantCrud.update(id, data as Partial<Omit<Consultant, "id">>)
      if (!ok) {
        toast.error("컨설턴트 정보를 저장하지 못했습니다")
        return
      }
    }

    if (nextConsultantStatus === "active" || nextConsultantStatus === "inactive") {
      const nextActive = nextConsultantStatus === "active"
      const matchedProfile = profileList.find((profileItem) => profileItem.id === id)
      if (matchedProfile) {
        if (isFirebaseConfigured) {
          const profileSaved = await profileCrud.update(matchedProfile.id, {
            active: nextActive,
          })
          if (!profileSaved) {
            toast.error("사용자 활성 상태 동기화에 실패했습니다")
            return
          }
        }
        setProfileList((prev) =>
          prev.map((item) =>
            item.id === matchedProfile.id ? { ...item, active: nextActive } : item,
          ),
        )
        setUsers((prev) =>
          prev.map((userItem) => {
            if (userItem.id !== matchedProfile.id) return userItem
            return {
              ...userItem,
              status: nextActive ? "active" : "inactive",
            }
          }),
        )
      }
    }

    if (
      nextConsultantStatus === "active" ||
      nextConsultantStatus === "inactive" ||
      data.agendaIds !== undefined ||
      data.availability !== undefined
    ) {
      const nextConsultants = consultants.map((consultant) =>
        consultant.id === id ? { ...consultant, ...data } : consultant,
      )
      const slotsSynced = await syncManagedRegularSlots(nextConsultants)
      if (!slotsSynced) return
    }

    toast.success(
      isMeetingLinkOnlyUpdate ? "화상링크가 저장되었습니다" : "컨설턴트 정보가 업데이트되었습니다",
    )
  }

  const handleAddAgenda = async (data: Omit<Agenda, "id">) => {
    if (isFirebaseConfigured) {
      const createdId = await agendaCrud.create(data)
      if (!createdId) {
        toast.error("아젠다 추가에 실패했습니다")
        return
      }
      setAgendaList((prev) => [...prev, { ...data, id: createdId }])
      toast.success("아젠다가 추가되었습니다")
      return
    }

    setAgendaList((prev) => [...prev, { ...data, id: `agenda-${Date.now()}` }])
    toast.success("아젠다가 추가되었습니다")
  }

  const handleUpdateAgenda = async (agendaId: string, data: Partial<Agenda>) => {
    const prevAgenda = agendaList.find((agenda) => agenda.id === agendaId)
    const nextName = typeof data.name === "string" ? data.name.trim() : ""
    const prevName = prevAgenda?.name ?? ""
    const shouldSyncName = nextName.length > 0 && prevName.length > 0 && nextName !== prevName

    if (shouldSyncName) {
      const nextApplications = applications.map((app) => {
        const matchesAgendaId = app.agendaId === agendaId
        const matchesAgendaName = !app.agendaId && app.agenda === prevName
        if (!matchesAgendaId && !matchesAgendaName) return app

        const nextOfficeHourTitle =
          app.type === "irregular" &&
          (app.officeHourTitle === `비정기 오피스아워 - ${prevName}` ||
            app.officeHourTitle.startsWith("비정기 오피스아워"))
            ? app.officeHourTitle.replace(prevName, nextName)
            : app.officeHourTitle

        return {
          ...app,
          agendaId,
          agenda: nextName,
          officeHourTitle: nextOfficeHourTitle,
        }
      })
      setApplications(nextApplications)

      if (isFirebaseConfigured) {
        const appById = new Map(applications.map((app) => [app.id, app]))
        const applicationUpdates = nextApplications
          .filter((app) => app.agendaId === agendaId || app.agenda === nextName)
          .filter((app) => {
            const prev = appById.get(app.id)
            return (
              prev?.agendaId !== app.agendaId ||
              prev?.agenda !== app.agenda ||
              prev?.officeHourTitle !== app.officeHourTitle
            )
          })
          .map((app) => ({
            type: "update" as const,
            collection: COLLECTIONS.OFFICE_HOUR_APPLICATIONS,
            docId: app.id,
            data: {
              agendaId: app.agendaId,
              agenda: app.agenda,
              officeHourTitle: app.officeHourTitle,
            },
          }))

        if (applicationUpdates.length > 0) {
          const okApps = await officeHourApplicationCrud.batchUpdate(applicationUpdates)
          if (!okApps) {
            toast.error("신청 내역의 아젠다 이름 업데이트에 실패했습니다")
          }
        }
      }
    }

    setAgendaList((prev) =>
      prev.map((agenda) => (agenda.id === agendaId ? { ...agenda, ...data } : agenda)),
    )
    if (isFirebaseConfigured) {
      const ok = await agendaCrud.update(agendaId, data as Partial<Omit<Agenda, "id">>)
      if (!ok) {
        toast.error("아젠다 정보 저장에 실패했습니다")
        return
      }
    }
    toast.success("아젠다 정보가 업데이트되었습니다")
  }

  const handleAddProgram = async (data: Omit<Program, "id">) => {
    const payload: Omit<Program, "id"> = {
      ...data,
    }
    if (isFirebaseConfigured) {
      const createdId = await programCrud.create(payload)
      if (!createdId) {
        toast.error("사업 생성에 실패했습니다")
        return
      }
      setProgramList((prev) => [...prev, { ...payload, id: createdId }])
      toast.success("사업이 생성되었습니다")
      return
    }

    setProgramList((prev) => [...prev, { ...payload, id: `program-${Date.now()}` }])
    toast.success("사업이 생성되었습니다")
  }

  const handleUpdateProgram = async (id: string, data: Partial<Program>) => {
    const prevProgram = programList.find((program) => program.id === id)
    const nextName = typeof data.name === "string" ? data.name.trim() : ""
    const prevName = prevProgram?.name ?? ""
    const shouldSyncTitles = nextName.length > 0 && prevName.length > 0 && nextName !== prevName

    const buildRegularOfficeHourTitle = (name: string) => `${name} 정기 오피스아워`
    const nextDefaultTitle = shouldSyncTitles ? buildRegularOfficeHourTitle(nextName) : ""
    const prevDefaultTitle = shouldSyncTitles ? buildRegularOfficeHourTitle(prevName) : ""

    const updateOfficeHourTitle = (title: string | undefined) => {
      if (!shouldSyncTitles || !title) return title ?? ""
      if (title === prevDefaultTitle) return nextDefaultTitle
      if (title.endsWith("정기 오피스아워") && title.includes(prevName)) {
        return title.replace(prevName, nextName)
      }
      return title
    }

    if (shouldSyncTitles) {
      const nextSlots = officeHourSlotList.map((slot) => {
        if (slot.programId !== id) return slot
        const nextTitle = updateOfficeHourTitle(slot.title)
        const nextDescription = slot.description?.startsWith(`${prevName} ·`)
          ? slot.description.replace(prevName, nextName)
          : slot.description
        if (nextTitle === slot.title && nextDescription === slot.description) return slot
        return {
          ...slot,
          title: nextTitle,
          description: nextDescription,
        }
      })
      setOfficeHourSlotList(nextSlots)

      const nextApplications = applications.map((app) => {
        if (app.programId !== id || app.type !== "regular") return app
        const nextTitle = updateOfficeHourTitle(app.officeHourTitle)
        if (nextTitle === app.officeHourTitle) return app
        return {
          ...app,
          officeHourTitle: nextTitle,
        }
      })
      setApplications(nextApplications)

      if (isFirebaseConfigured) {
        const slotById = new Map(officeHourSlotList.map((slot) => [slot.id, slot]))
        const slotUpdates = nextSlots
          .filter((slot) => slot.programId === id)
          .filter((slot) => {
            const prev = slotById.get(slot.id)
            return prev?.title !== slot.title || prev?.description !== slot.description
          })
          .map((slot) => {
            const data: Record<string, any> = { title: slot.title }
            if (slot.description !== undefined) {
              data.description = slot.description
            }
            return {
              type: "update" as const,
              collection: COLLECTIONS.OFFICE_HOUR_SLOTS,
              docId: slot.id,
              data,
            }
          })

        const appById = new Map(applications.map((app) => [app.id, app]))
        const applicationUpdates = nextApplications
          .filter((app) => app.programId === id && app.type === "regular")
          .filter((app) => {
            const prev = appById.get(app.id)
            return prev?.officeHourTitle !== app.officeHourTitle
          })
          .map((app) => ({
            type: "update" as const,
            collection: COLLECTIONS.OFFICE_HOUR_APPLICATIONS,
            docId: app.id,
            data: {
              officeHourTitle: app.officeHourTitle,
            },
          }))

        if (slotUpdates.length > 0) {
          const okSlots = await officeHourSlotCrud.batchUpdate(slotUpdates)
          if (!okSlots) {
            toast.error("오피스아워 슬롯 이름 업데이트에 실패했습니다")
          }
        }

        if (applicationUpdates.length > 0) {
          const okApps = await officeHourApplicationCrud.batchUpdate(applicationUpdates)
          if (!okApps) {
            toast.error("신청 내역의 오피스아워 이름 업데이트에 실패했습니다")
          }
        }
      }
    }

    setProgramList((prev) =>
      prev.map((program) => (program.id === id ? { ...program, ...data } : program)),
    )
    if (isFirebaseConfigured) {
      const ok = await programCrud.update(id, data as Partial<Omit<Program, "id">>)
      if (!ok) {
        toast.error("사업 정보 저장에 실패했습니다")
        return
      }
    }
    toast.success("사업 정보가 업데이트되었습니다")
  }

  const handleUpdateProgramCompanies = async (programId: string, companyIds: string[]) => {
    const targetProgram = programList.find((program) => program.id === programId)
    if (!targetProgram) {
      toast.error("사업 정보를 찾을 수 없습니다")
      return
    }
    const uniqueCompanyIds = Array.from(new Set(companyIds))
    const companyLimit = targetProgram.companyLimit ?? 0
    if (companyLimit > 0 && uniqueCompanyIds.length > companyLimit) {
      toast.error(`참여 기업 수는 최대 ${companyLimit}개까지 가능합니다`)
      return
    }

    setProgramList((prev) =>
      prev.map((program) =>
        program.id === programId ? { ...program, companyIds: uniqueCompanyIds } : program,
      ),
    )

    if (isFirebaseConfigured) {
      const ok = await programCrud.update(programId, {
        companyIds: uniqueCompanyIds,
      } as Partial<Omit<Program, "id">>)
      if (!ok) {
        toast.error("참여 기업 업데이트에 실패했습니다")
        return
      }

      const affectedCompanyIds = Array.from(
        new Set([...(targetProgram.companyIds ?? []), ...uniqueCompanyIds]),
      )
      if (affectedCompanyIds.length > 0) {
        const companyProgramsById = new Map(
          companyDirectory.map((company) => [company.id, company.programs ?? []] as const),
        )
        const syncResults = await Promise.all(
          affectedCompanyIds.map((companyId) => {
            const nextPrograms = new Set(companyProgramsById.get(companyId) ?? [])
            if (uniqueCompanyIds.includes(companyId)) {
              nextPrograms.add(programId)
            } else {
              nextPrograms.delete(programId)
            }
            return firestoreService.setDocument(
              "companies",
              companyId,
              {
                programs: Array.from(nextPrograms),
                updatedAt: new Date(),
              },
              true,
            )
          }),
        )
        if (syncResults.some((result) => !result)) {
          toast.error("회사 참여사업 동기화에 실패했습니다")
          return
        }
      }
    }

    toast.success("참여 기업 구성이 업데이트되었습니다")
  }

  const handleGenerateProgramSlots = async (programId: string) => {
    const targetProgram = programList.find((program) => program.id === programId)
    if (!targetProgram) {
      toast.error("사업 정보를 찾을 수 없습니다")
      return
    }
    if (!targetProgram.periodStart || !targetProgram.periodEnd) {
      toast.error("사업 기간을 먼저 설정해주세요")
      return
    }

    const activeAgendaIds = agendaList
      .filter((agenda) => agenda.active !== false)
      .map((agenda) => agenda.id)
    if (activeAgendaIds.length === 0) {
      toast.error("활성 아젠다가 없습니다")
      return
    }

    const linkedConsultants = consultants.filter((consultant) => {
      if (consultant.status !== "active") return false
      const consultantAgendaIds = consultant.agendaIds ?? []
      return consultantAgendaIds.some((agendaId) => activeAgendaIds.includes(agendaId))
    })
    if (linkedConsultants.length === 0) {
      toast.error("활성 상태의 연결 컨설턴트가 없습니다")
      return
    }

    const startDate = parseDateKey(targetProgram.periodStart)
    const endDate = parseDateKey(targetProgram.periodEnd)
    if (startDate.getTime() > endDate.getTime()) {
      toast.error("사업 기간이 올바르지 않습니다")
      return
    }

    const weekdays = new Set(getWeekdayNumbers(targetProgram.weekdays))
    const targetDates: string[] = []
    const cursor = new Date(startDate)
    while (cursor.getTime() <= endDate.getTime()) {
      if (weekdays.has(cursor.getDay())) {
        targetDates.push(formatDateKey(cursor))
      }
      cursor.setDate(cursor.getDate() + 1)
    }

    const existingSlotsById = new Map(officeHourSlotList.map((slot) => [slot.id, slot]))
    const generatedSlots: OfficeHourSlot[] = []

    const baseTitle = `${targetProgram.name} 정기 오피스아워`
    const baseDescription = targetProgram.description?.trim() || `${targetProgram.name} 사업`
    const timeKeysByDate = new Map<string, Set<string>>()

    linkedConsultants.forEach((consultant) => {
      targetDates.forEach((dateKey) => {
        const dayOfWeek = parseDateKey(dateKey).getDay()
        const dayAvailability = consultant.availability.find(
          (availability) => availability.dayOfWeek === dayOfWeek,
        )
        if (!dayAvailability) return
        dayAvailability.slots
          .filter((slot) => slot.available)
          .forEach((slot) => {
            const key = `${slot.start}-${slot.end}`
            const existing = timeKeysByDate.get(dateKey)
            if (existing) {
              existing.add(key)
            } else {
              timeKeysByDate.set(dateKey, new Set([key]))
            }
          })
      })
    })

    timeKeysByDate.forEach((timeKeys, dateKey) => {
      timeKeys.forEach((timeKey) => {
        const [startTime, endTime] = timeKey.split("-")
        if (!startTime || !endTime) return
        const slotId = `${programId}_${dateKey}_${startTime}`.replace(/:/g, "-")
        const existing = existingSlotsById.get(slotId)

        generatedSlots.push({
          id: slotId,
          type: "regular",
          programId,
          consultantName: "담당자 배정 중",
          title: baseTitle,
          description: baseDescription,
          date: dateKey,
          startTime,
          endTime,
          status: existing?.status ?? "open",
        })
      })
    })

    if (generatedSlots.length === 0) {
      toast.error("생성할 슬롯이 없습니다. 컨설턴트 가용시간을 확인해주세요")
      return
    }

    if (isFirebaseConfigured) {
      const operations = generatedSlots.map((slot) => ({
        type: "set" as const,
        collection: COLLECTIONS.OFFICE_HOUR_SLOTS,
        docId: slot.id,
        data: omitId(slot),
      }))
      const ok = await officeHourSlotCrud.batchUpdate(operations)
      if (!ok) {
        toast.error("슬롯 생성에 실패했습니다")
        return
      }
      toast.success(`${generatedSlots.length}개 슬롯을 생성/갱신했습니다`)
      return
    }

    const mergedSlotMap = new Map(officeHourSlotList.map((slot) => [slot.id, slot]))
    generatedSlots.forEach((slot) => {
      mergedSlotMap.set(slot.id, slot)
    })
    const mergedSlots = Array.from(mergedSlotMap.values()).sort((a, b) => {
      const dateComp = a.date.localeCompare(b.date)
      if (dateComp !== 0) return dateComp
      const startComp = a.startTime.localeCompare(b.startTime)
      if (startComp !== 0) return startComp
      return a.consultantName.localeCompare(b.consultantName)
    })

    setOfficeHourSlotList(mergedSlots)
    setRegularOfficeHourList(groupSlotsToRegularOfficeHours(mergedSlots, programList))
    toast.success(`${generatedSlots.length}개 슬롯을 생성했습니다`)
  }

  const handleAddUser = (data: Omit<UserWithPermissions, "id" | "createdAt">) => {
    const newUser: UserWithPermissions = {
      ...data,
      id: `u${Date.now()}`,
      createdAt: new Date(),
    }
    setUsers([...users, newUser])
    toast.success("사용자가 추가되었습니다")
  }

  const handleApprovePendingUser = async (pendingProfile: PendingProfileApproval) => {
    if (!isFirebaseConfigured) {
      toast.error("Firebase 연결 후 승인할 수 있습니다")
      return
    }
    let result: { role: PendingProfileApproval["role"]; companyId?: string | null }
    try {
      result = await approvePendingUserViaFunction(pendingProfile.id)
    } catch (error) {
      toast.error(getFunctionErrorMessage(error, "계정 승인에 실패했습니다"))
      return
    }

    toast.success("계정 승인이 완료되었습니다")
    setProfileList((prev) => {
      const nextProfile = {
        ...(prev.find((item) => item.id === pendingProfile.id) ?? { id: pendingProfile.id }),
        id: pendingProfile.id,
        email: pendingProfile.email || null,
        role: result.role,
        requestedRole: result.role,
        active: true,
        companyId: result.role === "company" ? result.companyId ?? pendingProfile.id : null,
        activatedAt: new Date(),
        approvedAt: new Date(),
      }
      const existingIndex = prev.findIndex((item) => item.id === pendingProfile.id)
      if (existingIndex < 0) {
        return [...prev, nextProfile]
      }
      const next = [...prev]
      next[existingIndex] = nextProfile
      return next
    })
  }

  const handleAddTemplate = (data: Omit<MessageTemplate, "id" | "createdAt" | "updatedAt">) => {
    const newTemplate: MessageTemplate = {
      ...data,
      id: `t${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    setTemplates([...templates, newTemplate])
  }

  const handleUpdateTemplate = (id: string, data: Partial<MessageTemplate>) => {
    setTemplates(templates.map((t) => (t.id === id ? { ...t, ...data, updatedAt: new Date() } : t)))
  }

  const handleDeleteTemplate = (id: string) => {
    setTemplates(templates.filter((t) => t.id !== id))
  }

  const handleSendBulkMessage = (applicationIds: string[], templateId: string) => {
    const template = templates.find((t) => t.id === templateId)
    if (!template) return

    applicationIds.forEach((appId) => {
      const newMessage: Message = {
        id: `msg${Date.now()}_${appId}`,
        applicationId: appId,
        content: template.content,
        sender: "consultant",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, newMessage])
    })
  }

  const selectedOfficeHour = scopedRegularOfficeHourList.find(
    (oh) => oh.id === selectedOfficeHourId,
  )

  const selectedApplication = useMemo(() => {
    const scopedMatch = scopedApplications.find((app) => app.id === selectedApplicationId)
    if (scopedMatch) return scopedMatch
    if (!selectedApplicationDoc) return undefined

    const resolvedDoc = resolveApplicationRecord(
      normalizeApplicationDoc(selectedApplicationDoc, resolveCompanyName),
    )

    if (resolvedRole === "user") {
      const uid = firebaseUser?.uid ?? user.id
      if (!uid || resolvedDoc.status === "cancelled") return undefined
      return resolvedDoc.createdByUid === uid ? resolvedDoc : undefined
    }
    if (resolvedRole !== "consultant") {
      return resolvedDoc
    }
    if (resolvedDoc.consultantId && consultantIdCandidates.has(resolvedDoc.consultantId)) {
      return resolvedDoc
    }
    if (resolvedDoc.officeHourSlotId) {
      const reservedSlot = officeHourSlotList.find((slot) => slot.id === resolvedDoc.officeHourSlotId)
      if (reservedSlot?.consultantId) {
        if (consultantIdCandidates.has(reservedSlot.consultantId)) {
          return resolvedDoc
        }
      }
    }
    if (resolvedDoc.agendaId && consultantAgendaIds.has(resolvedDoc.agendaId)) {
      return resolvedDoc
    }
    if (resolvedDoc.agenda && consultantAgendaNames.has(resolvedDoc.agenda)) {
      return resolvedDoc
    }
    return undefined
  }, [
    scopedApplications,
    selectedApplicationId,
    selectedApplicationDoc,
    resolveApplicationRecord,
    resolveCompanyName,
    resolvedRole,
    firebaseUser?.uid,
    user.id,
    consultantIdCandidates,
    officeHourSlotList,
    consultantAgendaIds,
    consultantAgendaNames,
  ])

  const applicationMessages = messages.filter((msg) => msg.applicationId === selectedApplicationId)

  if (!user) {
    return null
  }

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <Topbar
        user={scopedUser}
        displayName={
          resolvedRole === "consultant"
            ? (currentConsultant?.name ?? scopedUser.companyName)
            : resolvedRole === "admin" || resolvedRole === "staff"
              ? undefined
              : scopedUser.companyName
        }
        roleLabel={
          resolvedRole === "admin"
            ? "관리자"
            : resolvedRole === "consultant"
              ? "컨설턴트"
              : resolvedRole === "staff"
                ? "스태프"
                : "회사"
        }
        onNavigate={handleNavigateLoose}
        disabledPages={disabledPages}
        companyInfoNeedsAttention={companyInfoNeedsAttention}
        onLogout={async () => {
          await signOutUser()
          toast.success("로그아웃되었습니다")
        }}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <SidebarNav
          currentPage={currentPage}
          onNavigate={handleNavigateLoose}
          userRole={user.role}
          disabledPages={disabledPages}
        />
        <main
          className={`flex min-h-0 min-w-0 flex-1 flex-col bg-gray-50 ${
            currentPage === "admin-applications" ||
            currentPage === "admin-consultants" ||
            currentPage === "pending-reports"
              ? "overflow-hidden"
              : "overflow-y-auto"
          }`}
        >
          {currentPage === "dashboard" && (
            <DashboardCalendar
              applications={scopedApplications}
              applicationsWithoutAssignableConsultantIds={Array.from(
                pendingWithoutAssignableConsultantIds,
              )}
              user={user}
              programs={scopedProgramList}
              agendas={agendaList}
              ticketOverrides={companyMetaDoc?.programTicketOverrides}
              onCancelApplication={handleCancelApplication}
              onUpdateCompanyApplication={handleUpdateApplicationByCompany}
              onNavigate={handleNavigateLoose}
            />
          )}

          {currentPage === "regular" && (
            regularOfficeHoursLoading ? (
              <div className="flex min-h-0 flex-1 items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-3 text-sm text-slate-500">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700" />
                  <p>정기 오피스아워 일정을 불러오는 중입니다.</p>
                </div>
              </div>
            ) : (
              <RegularOfficeHoursCalendar
                officeHours={scopedRegularOfficeHourList}
                onSelectOfficeHour={handleSelectOfficeHour}
              />
            )
          )}

          {currentPage === "regular-detail" && selectedOfficeHour && (
            <RegularOfficeHourDetail
              officeHour={selectedOfficeHour}
              applications={scopedApplications}
              onBack={() => handleNavigate("regular")}
              onStartApplication={handleStartRegularApplication}
              onViewApplication={handleViewApplication}
            />
          )}

          {currentPage === "regular-wizard" && selectedOfficeHour && (
            <RegularApplicationWizard
              officeHour={selectedOfficeHour}
              officeHours={scopedRegularOfficeHourList}
              officeHourSlots={officeHourSlotList}
              applications={resolvedApplications}
              consultants={consultants}
              agendas={agendaList}
              isRealtimeDataLoading={regularWizardRealtimeLoading}
              allowedWeekdays={
                programList.find((program) => program.id === selectedOfficeHour.programId)?.weekdays
              }
              remainingInternalTickets={ticketStats.remainingInternal}
              remainingExternalTickets={ticketStats.remainingExternal}
              currentApplicant={{
                createdByUid: firebaseUser?.uid ?? user.id,
                companyId: companyRecordId,
                applicantEmail: user.email,
              }}
              onBack={() => handleNavigate("regular-detail", selectedOfficeHour.id)}
              onSubmit={handleSubmitRegularApplication}
            />
          )}

          {currentPage === "irregular" && (
            <IrregularOfficeHoursCalendar
              onNavigate={(page) => {
                if (page === "irregular-wizard") {
                  handleStartIrregularApplication()
                } else {
                  handleNavigateLoose(page)
                }
              }}
            />
          )}

          {currentPage === "irregular-wizard" && (
            <IrregularApplicationWizard
              agendas={agendaList}
              remainingInternalTickets={ticketStats.remainingInternal}
              remainingExternalTickets={ticketStats.remainingExternal}
              onBack={() => handleNavigate("irregular")}
              onSubmit={handleSubmitIrregularApplication}
            />
          )}

          {currentPage === "history" && (
            <ApplicationHistoryCalendar
              applications={scopedApplications}
              onNavigate={handleNavigateLoose}
            />
          )}

          {currentPage === "application" && selectedApplication && (
            <ApplicationDetail
              application={selectedApplication}
              showNoAssignableConsultantNotice={
                resolvedRole === "user" &&
                pendingWithoutAssignableConsultantIds.has(selectedApplication.id)
              }
              messages={applicationMessages}
              onBack={() =>
                handleNavigate(resolvedRole === "consultant" ? "consultant-calendar" : "dashboard")
              }
              onSendMessage={(content, files) =>
                handleSendMessage(selectedApplication.id, content, files)
              }
              onCancelApplication={() => handleCancelApplication(selectedApplication.id)}
              onRejectApplication={(reason) =>
                handleRejectApplication(selectedApplication.id, reason)
              }
              onUpdateRejectionReason={(reason) =>
                handleUpdateRejectionReason(selectedApplication.id, reason)
              }
              onUpdateCompanyApplication={(payload) =>
                handleUpdateApplicationByCompany(selectedApplication.id, payload)
              }
              currentUserRole={resolvedRole}
              currentConsultantId={currentConsultant?.id ?? null}
              currentConsultantName={currentConsultant?.name ?? null}
            />
          )}
          {currentPage === "application" && !selectedApplication && applicationsLoading && (
            <div className="flex min-h-0 flex-1 items-center justify-center bg-gray-50">
              <div className="flex flex-col items-center gap-3 text-sm text-slate-500">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700" />
                <p>신청 정보를 불러오는 중입니다.</p>
              </div>
            </div>
          )}
          {currentPage === "application" && !selectedApplication && !applicationsLoading && (
            <div className="p-10">
              <div className="rounded-2xl border border-slate-200 bg-white p-8">
                <h2 className="text-lg font-semibold text-slate-900">
                  신청 정보를 찾지 못했습니다
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  링크가 잘못되었거나 접근 권한이 없을 수 있습니다.
                </p>
                <button
                  type="button"
                  className="mt-5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => handleNavigate("dashboard")}
                >
                  대시보드로 돌아가기
                </button>
              </div>
            </div>
          )}

          {currentPage === "settings" && (
            <Settings
              user={user}
              marketingConsentEnabled={profile?.role === "company" ? Boolean(profile?.consents?.marketing?.consented) : undefined}
              marketingConsentSaving={profileCrud.saving}
              onToggleMarketingConsent={profile?.role === "company" ? handleToggleMarketingConsent : undefined}
            />
          )}

          {currentPage === "company-info" && firebaseUser && companyRecordId && (
            <CompanyDashboard
              onLogout={async () => {
                await signOutUser()
                toast.success("로그아웃되었습니다")
              }}
              companyId={companyRecordId}
              user={firebaseUser}
            />
          )}
          {currentPage === "company-info" && firebaseUser && !companyRecordId && (
            <div className="p-10">
              <div className="rounded-2xl border border-slate-200 bg-white p-8">
                <h2 className="text-lg font-semibold text-slate-900">
                  기업 정보를 준비하고 있습니다
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  연결된 기업 문서를 아직 찾지 못했습니다. 승인 정보 또는 계정 연결 상태를 확인해
                  주세요.
                </p>
              </div>
            </div>
          )}

          {currentPage === "consultants" && <ConsultantsDirectory consultants={consultants} />}

          {currentPage === "company-metrics" && (
            <CompanyMetricsPage currentUser={user} companyId={companyRecordId} />
          )}

          {currentPage === "company-newsletter" && <CompanyNewsletter currentUser={user} />}

          {currentPage === "messages" && (
            <MessagesPage
              currentUser={user}
              chatRooms={chatRooms}
              messages={chatMessages}
              onSendMessage={(roomId, content, attachments) => {
                const newMessage: ChatMessage = {
                  id: `msg_${Date.now()}`,
                  chatRoomId: roomId,
                  senderId: user.id,
                  senderName: user.companyName,
                  content,
                  attachments,
                  isRead: true,
                  createdAt: new Date(),
                }
                setChatMessages([...chatMessages, newMessage])

                // Update chat room's last message
                setChatRooms(
                  chatRooms.map((room) =>
                    room.id === roomId
                      ? { ...room, lastMessage: newMessage, updatedAt: new Date() }
                      : room,
                  ),
                )

                toast.success("메시지가 전송되었습니다")
              }}
            />
          )}

          {currentPage === "notifications" && (
            <NotificationCenter
              notifications={notifications}
              onMarkAsRead={(id) => {
                setNotifications(
                  notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
                )
              }}
              onMarkAllAsRead={() => {
                setNotifications(notifications.map((n) => ({ ...n, isRead: true })))
                toast.success("모든 알림을 읽음으로 표시했습니다")
              }}
              onDelete={(id) => {
                setNotifications(notifications.filter((n) => n.id !== id))
                toast.success("알림이 삭제되었습니다")
              }}
              onNavigate={(link) => {
                // Parse link and navigate to appropriate page
                if (link) {
                  window.location.hash = link
                }
              }}
            />
          )}

          {currentPage === "ai-recommendations" && (
            <AIRecommendations
              currentUser={user}
              recommendations={aiRecommendations}
              consultants={consultants}
              onApply={(id) => {
                setAIRecommendations(
                  aiRecommendations.map((r) => (r.id === id ? { ...r, isApplied: true } : r)),
                )
                toast.success("추천이 적용되었습니다")
              }}
              onDismiss={(id) => {
                setAIRecommendations(aiRecommendations.filter((r) => r.id !== id))
                toast.success("추천이 무시되었습니다")
              }}
            />
          )}

          {currentPage === "unified-calendar" && (
            <UnifiedCalendar
              currentUser={user}
              applications={resolvedApplications}
              programs={programList}
              agendas={agendaList}
              currentConsultantAgendaIds={currentConsultant?.agendaIds ?? []}
              currentConsultantAvailability={currentConsultant?.availability ?? []}
              currentConsultantId={currentConsultant?.id ?? null}
              currentConsultantName={currentConsultant?.name ?? null}
              onNavigateToApplication={(id) => {
                handleNavigate("application", id)
              }}
              onRequestApplication={handleRequestApplication}
              onRejectApplication={handleRejectApplication}
              onConfirmApplication={handleConfirmApplication}
              onUpdateStatus={handleUpdateApplicationStatus}
              onUpdateApplication={handleUpdateApplication}
            />
          )}

          {currentPage === "goals-kanban" && (
            <GoalsKanban
              currentUser={user}
              goals={goals}
              onCreateGoal={(data) => {
                const newGoal: Goal = {
                  ...data,
                  id: `goal_${Date.now()}`,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                }
                setGoals([...goals, newGoal])
                toast.success("목표가 생성되었습니다")
              }}
              onUpdateGoal={(id, updates) => {
                setGoals(
                  goals.map((g) => (g.id === id ? { ...g, ...updates, updatedAt: new Date() } : g)),
                )
                toast.success("목표가 업데이트되었습니다")
              }}
              onDeleteGoal={(id) => {
                setGoals(goals.filter((g) => g.id !== id))
                toast.success("목표가 삭제되었습니다")
              }}
            />
          )}

          {currentPage === "team-collaboration" && (
            <TeamCollaboration
              currentUser={user}
              teamMembers={teamMembers}
              onInviteMember={(email, role) => {
                const companyName = email.split("@")[0] ?? email
                const newMember: TeamMember = {
                  id: `tm_${Date.now()}`,
                  email,
                  companyName,
                  programName: user.programName ?? "MYSC",
                  programs: user.programs ?? [],
                  role: role as any,
                  position: "팀원",
                  department: "일반",
                  joinedAt: new Date(),
                  isActive: true,
                  permissions: {
                    canApplyRegular: true,
                    canApplyIrregular: false,
                    canViewAll: false,
                  },
                  createdAt: new Date(),
                  status: "active",
                }
                setTeamMembers([...teamMembers, newMember])
                toast.success(`${email}로 초대장이 전송되었습니다`)
              }}
              onUpdateMember={(id, updates) => {
                setTeamMembers(teamMembers.map((m) => (m.id === id ? { ...m, ...updates } : m)))
                toast.success("팀원 정보가 업데이트되었습니다")
              }}
              onRemoveMember={(id) => {
                setTeamMembers(teamMembers.filter((m) => m.id !== id))
                toast.success("팀원이 제거되었습니다")
              }}
            />
          )}

          {currentPage === "consultant-calendar" && (
            <ProtectedRoute allowedRoles={["consultant"]}>
              <UnifiedCalendar
                currentUser={scopedUser}
                applications={scopedApplications}
                programs={scopedProgramList}
                reports={reports}
                agendas={agendaList}
                currentConsultantAgendaIds={currentConsultant?.agendaIds ?? []}
                currentConsultantAvailability={currentConsultant?.availability ?? []}
                allowManualEventCreate={false}
                onCreateReport={openReportFormForApplication}
                onNavigateToApplication={(id) => {
                  handleNavigate("application", id)
                }}
                onRequestApplication={handleRequestApplication}
                onRejectApplication={handleRejectApplication}
                onConfirmApplication={handleConfirmApplication}
                onUpdateStatus={handleUpdateApplicationStatus}
                onUpdateApplication={handleUpdateApplication}
                currentConsultantId={currentConsultant?.id ?? null}
                currentConsultantName={currentConsultant?.name ?? null}
              />
            </ProtectedRoute>
          )}

          {currentPage === "consultant-profile" && (
            <ProtectedRoute allowedRoles={["consultant"]}>
              <ConsultantProfilePage
                consultant={currentConsultant}
                agendas={agendaList}
                defaultEmail={firebaseUser?.email}
                saving={consultantCrud.saving}
                scheduleSaving={consultantCrud.saving}
                onSaveSchedule={handleSaveConsultantSchedule}
                onSubmit={handleSaveConsultantProfile}
              />
            </ProtectedRoute>
          )}

          {/* Admin Pages with Protection */}
          {currentPage === "startup-diagnostic" && firebaseUser && (
            <AdminDashboard
              user={firebaseUser}
              onLogout={async () => {
                await signOutUser()
                toast.success("로그아웃되었습니다")
              }}
            />
          )}

          {currentPage === "admin-dashboard" && (
            <ProtectedRoute allowedRoles={["admin", "consultant", "staff"]}>
              <AdminDashboardInteractive
                applications={scopedApplications}
                programs={scopedProgramList}
                currentUser={scopedUser}
                onNavigate={handleNavigateLoose}
              />
            </ProtectedRoute>
          )}

          {currentPage === "admin-applications" && (
            <ProtectedRoute allowedRoles={["admin", "consultant", "staff"]}>
              <AdminApplications
                applications={scopedApplications}
                agendas={agendaList}
                programs={programList}
                onUpdateStatus={handleUpdateApplicationStatus}
                onUpdateApplication={handleUpdateApplication}
                onConfirmApplication={handleConfirmApplication}
                onRejectApplication={handleRejectApplication}
                onRequestApplication={handleRequestApplication}
                currentUserRole={resolvedRole}
                currentConsultantId={currentConsultant?.id ?? null}
                currentConsultantName={currentConsultant?.name ?? null}
                currentConsultantAgendaIds={currentConsultant?.agendaIds ?? []}
                currentConsultantAvailability={currentConsultant?.availability ?? []}
                officeHourSlots={officeHourSlotList}
              />
            </ProtectedRoute>
          )}

          {currentPage === "admin-consultants" && (
            <ProtectedRoute requiredRole="admin">
              <AdminConsultants
                consultants={consultants}
                agendas={agendaList}
                onUpdateConsultant={handleUpdateConsultant}
              />
            </ProtectedRoute>
          )}

          {currentPage === "admin-users" && (
            <ProtectedRoute requiredRole="admin">
              <AdminUsers
                users={users}
                consultants={consultants.map((consultant) => ({
                  id: consultant.id,
                  name: consultant.name,
                  email: consultant.email,
                }))}
                onAddUser={handleAddUser}
                pendingApprovals={pendingProfileApprovals}
                onApprovePendingUser={handleApprovePendingUser}
                approvalSaving={profileCrud.saving}
              />
            </ProtectedRoute>
          )}

          {currentPage === "admin-communication" && (
            <ProtectedRoute allowedRoles={["admin", "consultant", "staff"]}>
              <AdminCommunication
                templates={templates}
                applications={scopedApplications}
                onAddTemplate={handleAddTemplate}
                onUpdateTemplate={handleUpdateTemplate}
                onDeleteTemplate={handleDeleteTemplate}
                onSendBulkMessage={handleSendBulkMessage}
              />
            </ProtectedRoute>
          )}

          {currentPage === "admin-programs" && (
            <ProtectedRoute requiredRole="admin">
              <AdminPrograms
                programs={programList}
                applications={resolvedApplications}
                agendas={agendaList}
                companies={companyDirectory}
                onAddProgram={handleAddProgram}
                onUpdateProgram={handleUpdateProgram}
                onUpdateProgramCompanies={handleUpdateProgramCompanies}
                viewMode="list"
                onNavigate={handleNavigateLoose}
              />
            </ProtectedRoute>
          )}

          {currentPage === "admin-program-list" && (
            <ProtectedRoute requiredRole="admin">
              <AdminPrograms
                programs={programList}
                applications={resolvedApplications}
                agendas={agendaList}
                companies={companyDirectory}
                onAddProgram={handleAddProgram}
                onUpdateProgram={handleUpdateProgram}
                onUpdateProgramCompanies={handleUpdateProgramCompanies}
                viewMode="management"
                onNavigate={handleNavigateLoose}
              />
            </ProtectedRoute>
          )}

          {currentPage === "admin-agendas" && (
            <ProtectedRoute requiredRole="admin">
              <AdminAgendas
                agendas={agendaList}
                consultants={consultants}
                onAddAgenda={handleAddAgenda}
                onUpdateAgenda={handleUpdateAgenda}
              />
            </ProtectedRoute>
          )}

          {currentPage === "pending-reports" && (
            <ProtectedRoute allowedRoles={["admin", "consultant", "staff"]}>
              <PendingReportsDashboard
                applications={scopedApplications}
                reports={reports}
                programs={scopedProgramList}
                consultants={consultants}
                currentUser={scopedUser}
                currentConsultantName={currentConsultant?.name ?? null}
                onCreateReport={openReportFormForApplication}
                onEditReport={(report) => {
                  const app = scopedApplications.find((a) => a.id === report.applicationId)
                  if (!app && report.applicationId.startsWith("manual-")) {
                    const syntheticApp: Application = {
                      id: report.applicationId,
                      type: "irregular",
                      status: "completed",
                      officeHourTitle: report.topic?.trim() || "비정기 오피스아워 (수동)",
                      consultant: report.consultantName || currentConsultant?.name || "컨설턴트",
                      consultantId: report.consultantId || currentConsultant?.id || "",
                      sessionFormat: "online",
                      agenda: report.topic?.trim() || "비정기 오피스아워",
                      requestContent: "",
                      scheduledDate: report.date || formatSafeLocalDateKey(new Date()),
                      programId: report.programId,
                      createdAt: report.createdAt,
                      updatedAt: report.updatedAt,
                    }
                    setReportFormApplication(syntheticApp)
                    setReportFormOpen(true)
                    setReportBeingEdited(report)
                    setReportFormIsManual(true)
                    return
                  }
                  if (!app) {
                    toast.error("보고서에 연결된 신청 정보를 찾을 수 없습니다")
                    return
                  }
                  setReportFormApplication(app)
                  setReportFormOpen(true)
                  setReportBeingEdited(report)
                  setReportFormIsManual(false)
                }}
                onDeleteReport={async (report) => {
                  let removed = true
                  if (isFirebaseConfigured && report.id) {
                    removed = await reportCrud.remove(report.id)
                  }
                  if (!removed) {
                    toast.error("보고서 삭제에 실패했습니다")
                    return
                  }

                  const failedPhotoDeletes = await removeApplicationAttachmentsFromStorage(
                    report.photos,
                  )

                  setReports((prev) => prev.filter((item) => item.id !== report.id))
                  if (reportBeingEdited?.id === report.id) {
                    setReportFormOpen(false)
                    setReportFormApplication(null)
                    setReportBeingEdited(null)
                    setReportFormIsManual(false)
                  }
                  if (failedPhotoDeletes > 0) {
                    toast.error(
                      `보고서는 삭제됐지만 사진 ${failedPhotoDeletes}개 삭제에 실패했습니다.`,
                    )
                    return
                  }
                  toast.success("보고서가 삭제되었습니다")
                }}
              />
            </ProtectedRoute>
          )}

          {reportFormOpen && reportFormApplication && (
            <OfficeHourReportForm
              application={reportFormApplication}
              open={reportFormOpen}
              deadlineInfo={reportFormDeadlineInfo}
              onClose={() => {
                if (reportFormApplication && !reportBeingEdited && !reportFormIsManual) {
                  dismissReportPopup(reportFormApplication.id, 60 * 60 * 1000)
                }
                setReportFormOpen(false)
                setReportFormApplication(null)
                setReportBeingEdited(null)
                setReportFormIsManual(false)
              }}
              initialReport={reportBeingEdited}
              submitLabel={reportBeingEdited ? "보고서 저장" : "보고서 제출"}
              onSubmit={(reportData) => {
                const normalizedConsultantName = (() => {
                  const raw = reportData.consultantName?.trim()
                  if (raw && !raw.includes("담당자 배정 중")) return raw
                  return currentConsultant?.name?.trim() || reportData.consultantName || "컨설턴트"
                })()
                const normalizedReportData = {
                  ...reportData,
                  consultantId:
                    reportData.consultantId ||
                    reportBeingEdited?.consultantId ||
                    currentConsultant?.id ||
                    "",
                  consultantName: normalizedConsultantName,
                }
                if (reportBeingEdited) {
                  const updatedAt = new Date()
                  setReports((prev) =>
                    prev.map((report) =>
                      report.id === reportBeingEdited.id
                        ? {
                            ...report,
                            ...normalizedReportData,
                            updatedAt,
                          }
                        : report,
                    ),
                  )
                  if (isFirebaseConfigured) {
                    void reportCrud.update(reportBeingEdited.id, {
                      ...normalizedReportData,
                      updatedAt,
                    })
                  }
                } else {
                  const newReport: OfficeHourReport = {
                    ...normalizedReportData,
                    id: `rep${Date.now()}`,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    completedAt: new Date(),
                  }
                  if (isFirebaseConfigured) {
                    void reportCrud.create(omitId(newReport))
                  } else {
                    setReports([...reports, newReport])
                  }
                  if (!reportFormIsManual && reportFormApplication) {
                    setApplications(
                      applications.map((app) =>
                        app.id === reportFormApplication.id
                          ? { ...app, updatedAt: new Date() }
                          : app,
                      ),
                    )

                    setNotifications(
                      notifications.filter(
                        (n) =>
                          !(
                            n.type === "report_reminder" && n.relatedId === reportFormApplication.id
                          ),
                      ),
                    )
                    setReportPopupDismissed((prev) => {
                      const next = { ...prev }
                      delete next[reportFormApplication.id]
                      try {
                        sessionStorage.setItem("report-popup-dismissed", JSON.stringify(next))
                      } catch {
                        // ignore storage errors
                      }
                      return next
                    })
                  }
                }
                setReportFormApplication(null)
                setReportFormOpen(false)
                setReportBeingEdited(null)
                setReportFormIsManual(false)
                toast.success(
                  reportBeingEdited ? "보고서가 저장되었습니다" : "보고서가 제출되었습니다",
                )
              }}
            />
          )}
        </main>
      </div>
    </div>
  )
}
