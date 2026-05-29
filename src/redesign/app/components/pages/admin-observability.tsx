import { useCallback, useEffect, useMemo, useState } from "react"
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore"
import { Activity, AlertTriangle, Clock, MousePointerClick, RefreshCcw, Search } from "lucide-react"
import { db, isFirebaseConfigured } from "@/redesign/app/lib/firebase"

type TelemetryEvent = {
  id: string
  eventType?: string
  severity?: string
  sessionId?: string
  anonymousId?: string
  uid?: string | null
  role?: string | null
  route?: string
  action?: string | null
  elementLabel?: string | null
  functionName?: string | null
  errorCode?: string | null
  message?: string
  durationMs?: number | null
  stackHash?: string | null
  userAgent?: string
  createdAt?: { toDate?: () => Date } | Date | null
}

type TelemetrySession = {
  id: string
  sessionId?: string
  anonymousId?: string
  uid?: string | null
  role?: string | null
  firstRoute?: string
  lastRoute?: string
  durationMs?: number
  pageViewCount?: number
  routeDwellCount?: number
  totalRouteDwellMs?: number
  actionCount?: number
  buttonClickCount?: number
  linkClickCount?: number
  formSubmitCount?: number
  errorCount?: number
  fatalCount?: number
  lastSeenAt?: { toDate?: () => Date } | Date | null
}

type OfficeHourApplicationDoc = {
  id: string
  type?: string | null
  status?: string | null
  companyId?: string | null
  companyName?: string | null
  officeHourTitle?: string | null
  agenda?: string | null
  applicantEmail?: string | null
  createdByUid?: string | null
  createdAt?: { toDate?: () => Date } | Date | string | null
}

type GroupRow = {
  key: string
  label: string
  route: string
  count: number
  affectedUsers: number
  latestAt: Date | null
  sample: TelemetryEvent
}

type InteractionRow = {
  key: string
  label: string
  eventType: string
  route: string
  count: number
  latestAt: Date | null
  source: "telemetry" | "application"
}

type ProfileDoc = {
  id: string
  role?: string | null
  email?: string | null
  companyId?: string | null
  active?: boolean
}

type CompanyDoc = {
  id: string
  name?: string | null
  ownerUid?: string | null
}

type ConsultantDoc = {
  id: string
  name?: string | null
  email?: string | null
  organization?: string | null
}

type UserDisplay = {
  primary: string
  secondary: string
  role: string
}

const ROUTE_LABELS: Record<string, string> = {
  "/": "홈",
  "/login": "로그인",
  "/signup": "회원가입",
  "/signup-info": "회원가입 정보 입력",
  "/reset-password": "비밀번호 재설정",
  "/pending": "승인 대기",
  "/admin/admin-dashboard": "관리자 대시보드",
  "/admin/admin-applications": "신청 관리",
  "/admin/admin-communication": "커뮤니케이션",
  "/admin/admin-observability": "운영 로그",
  "/admin/admin-program-list": "사업 관리",
  "/admin/startup-diagnostic": "기업 관리",
  "/admin/admin-agendas": "아젠다 관리",
  "/admin/admin-consultants": "컨설턴트 관리",
  "/admin/admin-users": "사용자 관리",
  "/admin/pending-reports": "오피스아워 보고서",
  "/admin/consultant-calendar": "내 일정 캘린더",
  "/admin/consultant-profile": "내 정보 입력",
  "/admin/consultant-companies": "기업 등록",
  "/company/dashboard": "대시보드",
  "/company/notifications": "알림",
  "/company/messages": "메시지",
  "/company/unified-calendar": "통합 캘린더",
  "/company/goals-kanban": "목표 관리",
  "/company/ai-recommendations": "AI 추천",
  "/company/team-collaboration": "팀 협업",
  "/company/consultants": "컨설턴트",
  "/company/regular": "정기 오피스아워",
  "/company/regular-detail": "정기 오피스아워 상세",
  "/company/regular-wizard": "정기 오피스아워 신청",
  "/company/irregular": "비정기 오피스아워",
  "/company/irregular-wizard": "비정기 오피스아워 신청",
  "/company/history": "전체 내역",
  "/company/application": "신청 상세",
  "/company/company-metrics": "실적 관리",
  "/company/company-newsletter": "기업 리포트",
  "/company/company-info": "기업 정보 입력",
  "/company/settings": "설정",
}

function toDate(value: { toDate?: () => Date } | Date | string | null | undefined) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === "string") return new Date(value)
  if (typeof value.toDate === "function") return value.toDate()
  return null
}

function formatDate(value: Date | null) {
  if (!value) return "-"
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value)
}

function formatDuration(ms = 0) {
  if (!Number.isFinite(ms) || ms <= 0) return "0초"
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}초`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest ? `${minutes}분 ${rest}초` : `${minutes}분`
}

function shortId(value?: string | null) {
  if (!value) return "-"
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value
}

function normalizeRoute(route?: string | null) {
  const withoutQuery = (route || "/").split("?")[0] ?? "/"
  return withoutQuery.replace(/\/$/, "") || "/"
}

function routeLabel(route?: string | null) {
  const normalized = normalizeRoute(route)
  return ROUTE_LABELS[normalized] || normalized
}

function roleLabel(role?: string | null) {
  switch (role) {
    case "admin":
      return "관리자"
    case "staff":
      return "운영 스태프"
    case "consultant":
      return "컨설턴트"
    case "company":
    case "user":
      return "기업"
    default:
      return "역할 미확인"
  }
}

function eventLabel(eventType?: string) {
  switch (eventType) {
    case "function_error":
      return "서버 작업 실패"
    case "firestore_error":
      return "데이터 권한/조회 실패"
    case "auth_error":
      return "로그인/계정 오류"
    case "react_error":
      return "화면 렌더링 오류"
    case "promise_rejection":
      return "비동기 처리 오류"
    case "client_error":
      return "브라우저 오류"
    case "button_click":
      return "버튼 클릭"
    case "link_click":
      return "링크 클릭"
    case "form_submit":
      return "폼 제출"
    case "application_created":
      return "신청 완료"
    default:
      return eventType || "이벤트"
  }
}

function officeHourTypeLabel(type?: string | null) {
  switch (type) {
    case "regular":
      return "정기 오피스아워"
    case "irregular":
      return "비정기 오피스아워"
    case "mentoring":
      return "멘토링"
    default:
      return "오피스아워"
  }
}

function applicationRoute(type?: string | null) {
  return type === "irregular" ? "/company/irregular-wizard" : "/company/regular-wizard"
}

function isKnownTelemetrySelectorError(event: TelemetryEvent) {
  return (
    event.eventType === "client_error" &&
    (event.message || "").includes("Failed to execute 'closest'") &&
    (event.message || "").includes("data-observability-action")
  )
}

function groupEvents(events: TelemetryEvent[], predicate: (event: TelemetryEvent) => boolean) {
  const groups = new Map<string, GroupRow & { users: Set<string> }>()
  events.filter(predicate).forEach((event) => {
    const key =
      event.stackHash ||
      [event.eventType, event.functionName, event.errorCode, event.route, event.action, event.message]
        .filter(Boolean)
        .join("|")
    const existing =
      groups.get(key) ??
      ({
        key,
        label: event.action || event.functionName || event.errorCode || event.message || eventLabel(event.eventType),
        route: event.route || "-",
        count: 0,
        affectedUsers: 0,
        latestAt: null,
        sample: event,
        users: new Set<string>(),
      } as GroupRow & { users: Set<string> })
    existing.count += 1
    existing.users.add(event.uid || event.anonymousId || event.sessionId || "unknown")
    const createdAt = toDate(event.createdAt)
    if (!existing.latestAt || (createdAt && createdAt > existing.latestAt)) {
      existing.latestAt = createdAt
      existing.sample = event
    }
    groups.set(key, existing)
  })

  return Array.from(groups.values())
    .map(({ users, ...row }) => ({ ...row, affectedUsers: users.size }))
    .sort((a, b) => b.count - a.count)
}

export function AdminObservability() {
  const [events, setEvents] = useState<TelemetryEvent[]>([])
  const [sessions, setSessions] = useState<TelemetrySession[]>([])
  const [profiles, setProfiles] = useState<ProfileDoc[]>([])
  const [companies, setCompanies] = useState<CompanyDoc[]>([])
  const [consultants, setConsultants] = useState<ConsultantDoc[]>([])
  const [officeHourApplications, setOfficeHourApplications] = useState<OfficeHourApplicationDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userFilter, setUserFilter] = useState("")
  const [selectedGroup, setSelectedGroup] = useState<GroupRow | null>(null)

  const loadTelemetry = async () => {
    if (!isFirebaseConfigured || !db) {
      setError("Firebase가 설정되지 않아 운영 로그를 불러올 수 없습니다.")
      return
    }

    setLoading(true)
    setError(null)
    try {
      const [eventSnap, sessionSnap, profileSnap, companySnap, consultantSnap, applicationSnap] = await Promise.all([
        getDocs(query(collection(db, "telemetryEvents"), orderBy("createdAt", "desc"), limit(500))),
        getDocs(query(collection(db, "telemetrySessions"), orderBy("lastSeenAt", "desc"), limit(200))),
        getDocs(query(collection(db, "profiles"), limit(500))),
        getDocs(query(collection(db, "companies"), limit(500))),
        getDocs(query(collection(db, "consultants"), limit(500))),
        getDocs(query(collection(db, "officeHourApplications"), orderBy("createdAt", "desc"), limit(500))),
      ])
      setEvents(eventSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<TelemetryEvent, "id">) })))
      setSessions(
        sessionSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<TelemetrySession, "id">) })),
      )
      setProfiles(profileSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<ProfileDoc, "id">) })))
      setCompanies(companySnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<CompanyDoc, "id">) })))
      setConsultants(
        consultantSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<ConsultantDoc, "id">) })),
      )
      setOfficeHourApplications(
        applicationSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<OfficeHourApplicationDoc, "id">) })),
      )
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadTelemetry()
  }, [])

  const profileByUid = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles])
  const companyById = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies])
  const companyByOwnerUid = useMemo(
    () => new Map(companies.filter((company) => company.ownerUid).map((company) => [company.ownerUid as string, company])),
    [companies],
  )
  const consultantById = useMemo(
    () => new Map(consultants.map((consultant) => [consultant.id, consultant])),
    [consultants],
  )
  const consultantByEmail = useMemo(
    () =>
      new Map(
        consultants
          .filter((consultant) => consultant.email)
          .map((consultant) => [consultant.email!.toLowerCase(), consultant]),
      ),
    [consultants],
  )

  const resolveUserDisplay = useCallback(
    (uid?: string | null, anonymousId?: string | null, sessionId?: string | null, eventRole?: string | null): UserDisplay => {
      if (!uid) {
        return {
          primary: "로그인 전 방문자",
          secondary: `브라우저 익명 ID: ${shortId(anonymousId || sessionId)}`,
          role: "비로그인",
        }
      }

      const profile = profileByUid.get(uid)
      const role = profile?.role || eventRole
      const email = profile?.email || ""
      const consultant = consultantById.get(uid) || (email ? consultantByEmail.get(email.toLowerCase()) : null)
      const company = (profile?.companyId ? companyById.get(profile.companyId) : null) || companyByOwnerUid.get(uid)

      if (role === "consultant") {
        return {
          primary: consultant?.name || email || "컨설턴트 이름 미입력",
          secondary: [consultant?.organization, email, `UID: ${shortId(uid)}`].filter(Boolean).join(" · "),
          role: roleLabel(role),
        }
      }

      if (role === "company" || role === "user" || company) {
        return {
          primary: company?.name || email || "회사명 미입력",
          secondary: [email, `UID: ${shortId(uid)}`].filter(Boolean).join(" · "),
          role: roleLabel(role || "company"),
        }
      }

      return {
        primary: role === "admin" ? "관리자" : role === "staff" ? "운영 스태프" : email || "사용자 정보 미등록",
        secondary: [email, `UID: ${shortId(uid)}`].filter(Boolean).join(" · "),
        role: roleLabel(role),
      }
    },
    [companyById, companyByOwnerUid, consultantByEmail, consultantById, profileByUid],
  )

  const filteredEvents = useMemo(() => {
    const filter = userFilter.trim().toLowerCase()
    if (!filter) return events
    return events.filter((event) => {
      const user = resolveUserDisplay(event.uid, event.anonymousId, event.sessionId, event.role)
      return [event.uid, event.anonymousId, event.sessionId, user.primary, user.secondary, user.role].some((value) =>
        String(value ?? "").toLowerCase().includes(filter),
      )
    })
  }, [events, resolveUserDisplay, userFilter])

  const filteredSessions = useMemo(() => {
    const filter = userFilter.trim().toLowerCase()
    if (!filter) return sessions
    return sessions.filter((session) => {
      const user = resolveUserDisplay(session.uid, session.anonymousId, session.sessionId, session.role)
      return [session.uid, session.anonymousId, session.sessionId, user.primary, user.secondary, user.role].some((value) =>
        String(value ?? "").toLowerCase().includes(filter),
      )
    })
  }, [resolveUserDisplay, sessions, userFilter])

  const filteredApplications = useMemo(() => {
    const filter = userFilter.trim().toLowerCase()
    if (!filter) return officeHourApplications
    return officeHourApplications.filter((application) => {
      const company = application.companyId ? companyById.get(application.companyId) : null
      const user = resolveUserDisplay(application.createdByUid, null, null, "company")
      return [
        application.companyName,
        company?.name,
        application.applicantEmail,
        application.createdByUid,
        user.primary,
        user.secondary,
      ].some((value) => String(value ?? "").toLowerCase().includes(filter))
    })
  }, [companyById, officeHourApplications, resolveUserDisplay, userFilter])

  const ignoredTelemetrySelectorErrors = filteredEvents.filter(isKnownTelemetrySelectorError)
  const errorEvents = filteredEvents.filter(
    (event) => (event.severity === "error" || event.severity === "fatal") && !isKnownTelemetrySelectorError(event),
  )
  const pageViews = filteredEvents.filter((event) => event.eventType === "page_view")
  const interactions = filteredEvents.filter((event) =>
    ["button_click", "link_click", "form_submit"].includes(event.eventType || ""),
  )
  const routeDwellEvents = filteredEvents.filter((event) => event.eventType === "route_dwell")
  const totalDwellMs = routeDwellEvents.reduce((sum, event) => sum + (event.durationMs || 0), 0)
  const averageDwellMs = routeDwellEvents.length ? totalDwellMs / routeDwellEvents.length : 0
  const averageSessionMs = filteredSessions.length
    ? filteredSessions.reduce((sum, session) => sum + (session.durationMs || 0), 0) / filteredSessions.length
    : 0
  const errorGroups = groupEvents(errorEvents, () => true)
  const interactionGroups: InteractionRow[] = [
    ...groupEvents(interactions, () => true).map((group) => ({
      key: group.key,
      label: group.label,
      eventType: eventLabel(group.sample.eventType),
      route: group.route,
      count: group.count,
      latestAt: group.latestAt,
      source: "telemetry" as const,
    })),
    ...Array.from(
      filteredApplications.reduce((groups, application) => {
        const route = applicationRoute(application.type)
        const label = `${officeHourTypeLabel(application.type)} 신청 완료`
        const key = `application_created|${route}|${application.type || "unknown"}`
        const existing =
          groups.get(key) ??
          ({
            key,
            label,
            eventType: "신청 완료",
            route,
            count: 0,
            latestAt: null,
            source: "application" as const,
          } satisfies InteractionRow)
        existing.count += 1
        const createdAt = toDate(application.createdAt)
        if (!existing.latestAt || (createdAt && createdAt > existing.latestAt)) {
          existing.latestAt = createdAt
        }
        groups.set(key, existing)
        return groups
      }, new Map<string, InteractionRow>()),
    ).map(([, row]) => row),
  ].sort((a, b) => {
    const latestDiff = (b.latestAt?.getTime() ?? 0) - (a.latestAt?.getTime() ?? 0)
    return latestDiff || b.count - a.count
  })
  const rawGroupEvents = selectedGroup
    ? filteredEvents.filter((event) => {
        const groupKey =
          event.stackHash ||
          [event.eventType, event.functionName, event.errorCode, event.route, event.action, event.message]
            .filter(Boolean)
            .join("|")
        return groupKey === selectedGroup.key
      })
    : []

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">운영 로그</h1>
          <p className="mt-1 text-sm text-slate-600">
            웹뷰, 버튼 클릭, 체류시간, 유저별 에러 지점을 확인합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadTelemetry()}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <RefreshCcw className="h-4 w-4" />
          새로고침
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <Search className="h-4 w-4 text-slate-400" />
        <input
          value={userFilter}
          onChange={(event) => setUserFilter(event.target.value)}
          placeholder="회사명, 사람 이름, 이메일, UID, 브라우저 ID로 필터"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      <p className="-mt-4 text-xs text-slate-500">
        브라우저 익명 ID는 로그인 전/비로그인 방문 흐름을 이어 보기 위한 기기 단위 식별자입니다.
      </p>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {ignoredTelemetrySelectorErrors.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          해결된 관측 코드 오류 {ignoredTelemetrySelectorErrors.length.toLocaleString()}건은 유저 에러 지표에서 제외했습니다.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={Activity} label="웹뷰" value={pageViews.length.toLocaleString()} />
        <MetricCard
          icon={MousePointerClick}
          label="클릭/제출"
          value={(interactions.length + filteredApplications.length).toLocaleString()}
        />
        <MetricCard icon={Clock} label="평균 세션" value={formatDuration(averageSessionMs)} />
        <MetricCard icon={Clock} label="평균 화면 체류" value={formatDuration(averageDwellMs)} />
        <MetricCard icon={AlertTriangle} label="에러" value={errorEvents.length.toLocaleString()} tone="danger" />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-900">에러 그룹</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">유형</th>
                <th className="px-4 py-3">메시지/작업</th>
                <th className="px-4 py-3">경로</th>
                <th className="px-4 py-3">발생</th>
                <th className="px-4 py-3">영향 유저</th>
                <th className="px-4 py-3">최근</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {errorGroups.slice(0, 20).map((group) => (
                <tr
                  key={group.key}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => setSelectedGroup(group)}
                >
                  <td className="px-4 py-3 font-medium">{eventLabel(group.sample.eventType)}</td>
                  <td className="max-w-xs truncate px-4 py-3">{group.label}</td>
                  <td className="max-w-xs px-4 py-3">
                    <div className="font-medium text-slate-900">{routeLabel(group.route)}</div>
                    <div className="truncate text-xs text-slate-500">{group.route}</div>
                  </td>
                  <td className="px-4 py-3">{group.count}</td>
                  <td className="px-4 py-3">{group.affectedUsers}</td>
                  <td className="px-4 py-3">{formatDate(group.latestAt)}</td>
                </tr>
              ))}
              {errorGroups.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    기록된 에러가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-900">버튼/링크/폼 상호작용</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">액션</th>
                <th className="px-4 py-3">유형</th>
                <th className="px-4 py-3">경로</th>
                <th className="px-4 py-3">횟수</th>
                <th className="px-4 py-3">최근</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {interactionGroups.slice(0, 20).map((group) => (
                <tr key={group.key}>
                  <td className="max-w-sm truncate px-4 py-3 font-medium">{group.label}</td>
                  <td className="px-4 py-3">
                    <span>{group.eventType}</span>
                    {group.source === "application" && (
                      <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                        기존 신청
                      </span>
                    )}
                  </td>
                  <td className="max-w-xs px-4 py-3">
                    <div className="font-medium text-slate-900">{routeLabel(group.route)}</div>
                    <div className="truncate text-xs text-slate-500">{group.route}</div>
                  </td>
                  <td className="px-4 py-3">{group.count}</td>
                  <td className="px-4 py-3">{formatDate(group.latestAt)}</td>
                </tr>
              ))}
              {interactionGroups.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    기록된 클릭/제출 이벤트가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-900">유저/세션별 현황</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">사용자</th>
                <th className="px-4 py-3">브라우저 ID</th>
                <th className="px-4 py-3">역할</th>
                <th className="px-4 py-3">첫 화면</th>
                <th className="px-4 py-3">마지막 화면</th>
                <th className="px-4 py-3">체류</th>
                <th className="px-4 py-3">웹뷰</th>
                <th className="px-4 py-3">클릭</th>
                <th className="px-4 py-3">에러</th>
                <th className="px-4 py-3">최근</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSessions.slice(0, 50).map((session) => {
                const user = resolveUserDisplay(session.uid, session.anonymousId, session.sessionId, session.role)

                return (
                  <tr key={session.id}>
                    <td className="max-w-[260px] px-4 py-3">
                      <div className="font-medium text-slate-900">{user.primary}</div>
                      <div className="truncate text-xs text-slate-500">{user.secondary}</div>
                    </td>
                    <td className="max-w-[160px] truncate px-4 py-3 font-mono text-xs">
                      {shortId(session.anonymousId)}
                    </td>
                    <td className="px-4 py-3">{user.role}</td>
                    <td className="max-w-xs px-4 py-3">
                      <div className="font-medium text-slate-900">{routeLabel(session.firstRoute)}</div>
                      <div className="truncate text-xs text-slate-500">{session.firstRoute || "-"}</div>
                    </td>
                    <td className="max-w-xs px-4 py-3">
                      <div className="font-medium text-slate-900">{routeLabel(session.lastRoute)}</div>
                      <div className="truncate text-xs text-slate-500">{session.lastRoute || "-"}</div>
                    </td>
                    <td className="px-4 py-3">{formatDuration(session.durationMs || 0)}</td>
                    <td className="px-4 py-3">{session.pageViewCount || 0}</td>
                    <td className="px-4 py-3">
                      {(session.buttonClickCount || 0) + (session.linkClickCount || 0) + (session.formSubmitCount || 0)}
                    </td>
                    <td className="px-4 py-3">{session.errorCount || 0}</td>
                    <td className="px-4 py-3">{formatDate(toDate(session.lastSeenAt))}</td>
                  </tr>
                )
              })}
              {filteredSessions.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                    기록된 세션이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedGroup && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setSelectedGroup(null)}>
          <aside
            className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">원본 로그</h2>
                <p className="mt-1 text-sm text-slate-500">{selectedGroup.label}</p>
              </div>
              <button type="button" className="rounded-md border px-3 py-1 text-sm" onClick={() => setSelectedGroup(null)}>
                닫기
              </button>
            </div>
            <div className="mt-6 space-y-3">
              {rawGroupEvents.slice(0, 50).map((event) => {
                const user = resolveUserDisplay(event.uid, event.anonymousId, event.sessionId, event.role)

                return (
                  <pre
                    key={event.id}
                    className="overflow-x-auto rounded-md bg-slate-950 p-4 text-xs text-slate-100"
                  >
                    {JSON.stringify(
                      {
                        id: event.id,
                        type: event.eventType,
                        severity: event.severity,
                        user,
                        screen: routeLabel(event.route),
                        uid: event.uid,
                        anonymousId: event.anonymousId,
                        sessionId: event.sessionId,
                        route: event.route,
                        action: event.action,
                        functionName: event.functionName,
                        errorCode: event.errorCode,
                        message: event.message,
                        createdAt: formatDate(toDate(event.createdAt)),
                      },
                      null,
                      2,
                    )}
                  </pre>
                )
              })}
            </div>
          </aside>
        </div>
      )}

      {loading && <p className="text-sm text-slate-500">운영 로그를 불러오는 중입니다.</p>}
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof Activity
  label: string
  value: string
  tone?: "default" | "danger"
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Icon className={tone === "danger" ? "h-4 w-4 text-red-500" : "h-4 w-4 text-slate-400"} />
        {label}
      </div>
      <div className={tone === "danger" ? "mt-2 text-2xl font-semibold text-red-600" : "mt-2 text-2xl font-semibold text-slate-900"}>
        {value}
      </div>
    </div>
  )
}
