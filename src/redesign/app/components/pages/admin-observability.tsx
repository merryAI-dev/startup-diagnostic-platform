import { useEffect, useMemo, useState } from "react"
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

type GroupRow = {
  key: string
  label: string
  route: string
  count: number
  affectedUsers: number
  latestAt: Date | null
  sample: TelemetryEvent
}

function toDate(value: TelemetryEvent["createdAt"]) {
  if (!value) return null
  if (value instanceof Date) return value
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
    default:
      return eventType || "이벤트"
  }
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
      const [eventSnap, sessionSnap] = await Promise.all([
        getDocs(query(collection(db, "telemetryEvents"), orderBy("createdAt", "desc"), limit(500))),
        getDocs(query(collection(db, "telemetrySessions"), orderBy("lastSeenAt", "desc"), limit(200))),
      ])
      setEvents(eventSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<TelemetryEvent, "id">) })))
      setSessions(
        sessionSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<TelemetrySession, "id">) })),
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

  const filteredEvents = useMemo(() => {
    const filter = userFilter.trim().toLowerCase()
    if (!filter) return events
    return events.filter((event) =>
      [event.uid, event.anonymousId, event.sessionId].some((value) =>
        String(value ?? "").toLowerCase().includes(filter),
      ),
    )
  }, [events, userFilter])

  const filteredSessions = useMemo(() => {
    const filter = userFilter.trim().toLowerCase()
    if (!filter) return sessions
    return sessions.filter((session) =>
      [session.uid, session.anonymousId, session.sessionId].some((value) =>
        String(value ?? "").toLowerCase().includes(filter),
      ),
    )
  }, [sessions, userFilter])

  const errorEvents = filteredEvents.filter((event) => event.severity === "error" || event.severity === "fatal")
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
  const interactionGroups = groupEvents(interactions, () => true)
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
          placeholder="유저 ID, 익명 ID, 세션 ID로 필터"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={Activity} label="웹뷰" value={pageViews.length.toLocaleString()} />
        <MetricCard icon={MousePointerClick} label="클릭/제출" value={interactions.length.toLocaleString()} />
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
                  <td className="max-w-xs truncate px-4 py-3">{group.route}</td>
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
                  <td className="px-4 py-3">{eventLabel(group.sample.eventType)}</td>
                  <td className="max-w-xs truncate px-4 py-3">{group.route}</td>
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
                <th className="px-4 py-3">유저 ID</th>
                <th className="px-4 py-3">익명 ID</th>
                <th className="px-4 py-3">역할</th>
                <th className="px-4 py-3">첫 경로</th>
                <th className="px-4 py-3">마지막 경로</th>
                <th className="px-4 py-3">체류</th>
                <th className="px-4 py-3">웹뷰</th>
                <th className="px-4 py-3">클릭</th>
                <th className="px-4 py-3">에러</th>
                <th className="px-4 py-3">최근</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSessions.slice(0, 50).map((session) => (
                <tr key={session.id}>
                  <td className="max-w-[160px] truncate px-4 py-3 font-mono text-xs">{session.uid || "-"}</td>
                  <td className="max-w-[160px] truncate px-4 py-3 font-mono text-xs">
                    {session.anonymousId || "-"}
                  </td>
                  <td className="px-4 py-3">{session.role || "-"}</td>
                  <td className="max-w-xs truncate px-4 py-3">{session.firstRoute || "-"}</td>
                  <td className="max-w-xs truncate px-4 py-3">{session.lastRoute || "-"}</td>
                  <td className="px-4 py-3">{formatDuration(session.durationMs || 0)}</td>
                  <td className="px-4 py-3">{session.pageViewCount || 0}</td>
                  <td className="px-4 py-3">
                    {(session.buttonClickCount || 0) + (session.linkClickCount || 0) + (session.formSubmitCount || 0)}
                  </td>
                  <td className="px-4 py-3">{session.errorCount || 0}</td>
                  <td className="px-4 py-3">{formatDate(toDate(session.lastSeenAt))}</td>
                </tr>
              ))}
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
              {rawGroupEvents.slice(0, 50).map((event) => (
                <pre
                  key={event.id}
                  className="overflow-x-auto rounded-md bg-slate-950 p-4 text-xs text-slate-100"
                >
                  {JSON.stringify(
                    {
                      id: event.id,
                      type: event.eventType,
                      severity: event.severity,
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
              ))}
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

