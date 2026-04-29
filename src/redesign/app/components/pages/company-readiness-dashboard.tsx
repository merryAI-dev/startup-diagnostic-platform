import { useCallback, useEffect, useMemo, useState } from "react"
import { collection, doc, getDoc, getDocs } from "firebase/firestore"
import { AlertCircle, CheckCircle2, Download, FileText, RefreshCw, Search } from "lucide-react"
import { Badge } from "@/redesign/app/components/ui/badge"
import { Button } from "@/redesign/app/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/redesign/app/components/ui/card"
import { Input } from "@/redesign/app/components/ui/input"
import { Progress } from "@/redesign/app/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/redesign/app/components/ui/table"
import { cn } from "@/redesign/app/components/ui/utils"
import { db } from "@/firebase/client"
import type { CompanyInfoRecord } from "@/types/company"
import type { SelfAssessmentSections } from "@/types/selfAssessment"
import type { CompanyAnalysisReportForm } from "@/types/companyAnalysisReport"
import {
  getAnalysisReportReadiness,
  getCompanyInfoReadiness,
  getNextReadinessAction,
  getOverallReadinessPercent,
  getSelfAssessmentReadiness,
  type ReadinessCheck,
} from "@/redesign/app/lib/company-readiness"

type CompanyDoc = {
  id: string
  name?: string | null
  ownerUid?: string | null
  programs?: string[]
  createdAt?: unknown
  updatedAt?: unknown
  active?: boolean
}

type ProgramDoc = {
  id: string
  name?: string | null
}

type SelfAssessmentDoc = {
  sections?: SelfAssessmentSections | null
  metadata?: {
    saveType?: string | null
    updatedAt?: unknown
  }
}

type ReadinessRow = {
  id: string
  name: string
  hasOwner: boolean
  active: boolean
  programs: string[]
  programNames: string[]
  signup: ReadinessCheck
  companyInfo: ReadinessCheck
  selfAssessment: ReadinessCheck
  analysisReport: ReadinessCheck
  overallPercent: number
  lastUpdated: Date | null
  nextAction: string
}

const statusClassName: Record<ReadinessCheck["status"], string> = {
  done: "border-emerald-200 bg-emerald-50 text-emerald-700",
  partial: "border-amber-200 bg-amber-50 text-amber-700",
  missing: "border-rose-200 bg-rose-50 text-rose-700",
}

const statusDotClassName: Record<ReadinessCheck["status"], string> = {
  done: "bg-emerald-500",
  partial: "bg-amber-500",
  missing: "bg-rose-500",
}

function normalizeUnknownDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof value === "object" && value !== null) {
    const maybeTimestamp = value as {
      toDate?: () => Date
      seconds?: number
      nanoseconds?: number
    }
    if (typeof maybeTimestamp.toDate === "function") {
      try {
        const parsed = maybeTimestamp.toDate()
        return Number.isNaN(parsed.getTime()) ? null : parsed
      } catch {
        return null
      }
    }
    if (typeof maybeTimestamp.seconds === "number") {
      const parsed = new Date(
        maybeTimestamp.seconds * 1000 + Math.floor((maybeTimestamp.nanoseconds ?? 0) / 1_000_000),
      )
      return Number.isNaN(parsed.getTime()) ? null : parsed
    }
  }
  return null
}

function formatDateTime(value: Date | null) {
  if (!value) return "-"
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value)
}

function getLatestDate(values: unknown[]) {
  const dates = values
    .map(normalizeUnknownDate)
    .filter((value): value is Date => value instanceof Date)
    .sort((a, b) => b.getTime() - a.getTime())
  return dates[0] ?? null
}

function StatusBadge({ check }: { check: ReadinessCheck }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5", statusClassName[check.status])}>
      <span className={cn("h-1.5 w-1.5 rounded-full", statusDotClassName[check.status])} />
      {check.label}
    </Badge>
  )
}

function CheckCell({ check }: { check: ReadinessCheck }) {
  return (
    <div className="space-y-1.5">
      <StatusBadge check={check} />
      <div className="text-xs text-slate-500">
        {check.done}/{check.total}
      </div>
    </div>
  )
}

function makeCsv(rows: ReadinessRow[]) {
  const headers = [
    "기업명",
    "회원가입",
    "참여사업",
    "기업정보",
    "자가진단",
    "현황분석보고서",
    "전체진행률",
    "다음액션",
    "마지막수정",
  ]
  const body = rows.map((row) => [
    row.name,
    row.signup.label,
    row.programNames.join(" / "),
    row.companyInfo.label,
    row.selfAssessment.label,
    row.analysisReport.label,
    `${row.overallPercent}%`,
    row.nextAction,
    formatDateTime(row.lastUpdated),
  ])
  return [headers, ...body]
    .map((line) =>
      line
        .map((cell) => {
          const value = String(cell ?? "")
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
        })
        .join(","),
    )
    .join("\n")
}

export function CompanyReadinessDashboard() {
  const [rows, setRows] = useState<ReadinessRow[]>([])
  const [programs, setPrograms] = useState<ProgramDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [programFilter, setProgramFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState<"all" | "needs-action" | "complete">("all")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [companySnapshot, programSnapshot] = await Promise.all([
        getDocs(collection(db, "companies")),
        getDocs(collection(db, "programs")),
      ])

      const nextPrograms = programSnapshot.docs
        .map((programDoc) => {
          const data = programDoc.data() as { name?: string | null }
          return { id: programDoc.id, name: data.name?.trim() || programDoc.id }
        })
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "ko-KR"))
      const programNameById = new Map(
        nextPrograms.map((program) => [program.id, program.name ?? program.id]),
      )

      const nextRows = await Promise.all(
        companySnapshot.docs.map(async (companyDoc): Promise<ReadinessRow> => {
          const data = { id: companyDoc.id, ...companyDoc.data() } as CompanyDoc
          const [infoSnap, selfAssessmentSnap, analysisReportSnap] = await Promise.all([
            getDoc(doc(db, "companies", companyDoc.id, "companyInfo", "info")),
            getDoc(doc(db, "companies", companyDoc.id, "selfAssessment", "info")),
            getDoc(doc(db, "companies", companyDoc.id, "analysisReport", "current")),
          ])

          const info = infoSnap.exists() ? (infoSnap.data() as Partial<CompanyInfoRecord>) : null
          const selfAssessment = selfAssessmentSnap.exists()
            ? (selfAssessmentSnap.data() as SelfAssessmentDoc)
            : null
          const analysisReport = analysisReportSnap.exists()
            ? (analysisReportSnap.data() as Partial<CompanyAnalysisReportForm>)
            : null
          const hasOwner = typeof data.ownerUid === "string" && data.ownerUid.trim().length > 0
          const companyInfo = getCompanyInfoReadiness(info)
          const assessment = getSelfAssessmentReadiness(
            selfAssessment?.sections,
            selfAssessment?.metadata?.saveType,
          )
          const report = getAnalysisReportReadiness(analysisReport)
          const signup = {
            status: hasOwner ? "done" : "missing",
            label: hasOwner ? "가입" : "미연결",
            done: hasOwner ? 1 : 0,
            total: 1,
          } satisfies ReadinessCheck
          const programIds = Array.isArray(data.programs)
            ? data.programs.filter((value): value is string => typeof value === "string")
            : []

          return {
            id: companyDoc.id,
            name: info?.basic?.companyInfo?.trim() || data.name?.trim() || companyDoc.id,
            hasOwner,
            active: data.active !== false,
            programs: programIds,
            programNames: programIds.map(
              (programId) => programNameById.get(programId) ?? programId,
            ),
            signup,
            companyInfo,
            selfAssessment: assessment,
            analysisReport: report,
            overallPercent: getOverallReadinessPercent([signup, companyInfo, assessment, report]),
            lastUpdated: getLatestDate([
              data.updatedAt,
              data.createdAt,
              info?.metadata?.updatedAt,
              info?.metadata?.createdAt,
              selfAssessment?.metadata?.updatedAt,
              analysisReport?.createdAt,
            ]),
            nextAction: getNextReadinessAction({
              hasOwner,
              companyInfo,
              selfAssessment: assessment,
              analysisReport: report,
            }),
          }
        }),
      )

      setPrograms(nextPrograms)
      setRows(nextRows.sort((a, b) => a.name.localeCompare(b.name, "ko-KR")))
    } catch (loadError) {
      console.error("Failed to load company readiness dashboard", loadError)
      setError(loadError instanceof Error ? loadError.message : "데이터를 불러오지 못했습니다")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (normalizedQuery) {
        const haystack = [row.name, row.id, ...row.programNames].join(" ").toLowerCase()
        if (!haystack.includes(normalizedQuery)) return false
      }
      if (programFilter !== "all" && !row.programs.includes(programFilter)) return false
      if (statusFilter === "needs-action" && row.overallPercent >= 100) return false
      if (statusFilter === "complete" && row.overallPercent < 100) return false
      return true
    })
  }, [programFilter, query, rows, statusFilter])

  const summary = useMemo(() => {
    const total = filteredRows.length
    const complete = filteredRows.filter((row) => row.overallPercent >= 100).length
    const needAction = total - complete
    const companyInfoDone = filteredRows.filter((row) => row.companyInfo.status === "done").length
    const assessmentDone = filteredRows.filter((row) => row.selfAssessment.status === "done").length
    const reportDone = filteredRows.filter((row) => row.analysisReport.status === "done").length
    const average =
      total > 0
        ? Math.round(filteredRows.reduce((sum, row) => sum + row.overallPercent, 0) / total)
        : 0
    return { total, complete, needAction, companyInfoDone, assessmentDone, reportDone, average }
  }, [filteredRows])

  const downloadCsv = () => {
    const blob = new Blob([`\uFEFF${makeCsv(filteredRows)}`], {
      type: "text/csv;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `ema-station-readiness-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-slate-500">EMA Station</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            기업 작성 현황 대시보드
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Firestore의 기업 문서와 하위 작성 문서를 읽어 기업 회원가입, 기업정보, 자가진단,
            현황분석 보고서 작성 여부를 한 화면에서 점검합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadCsv} disabled={filteredRows.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            CSV
          </Button>
          <Button onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            새로고침
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Card className="rounded-lg bg-white">
          <CardHeader className="px-4 pt-4">
            <CardTitle className="text-xs font-medium text-slate-500">기업 수</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 px-4 pb-4">
            <div className="text-2xl font-semibold text-slate-950">{summary.total}</div>
            <div className="text-xs text-slate-500">기업정보 완료 {summary.companyInfoDone}</div>
          </CardContent>
        </Card>
        <Card className="rounded-lg bg-white">
          <CardHeader className="px-4 pt-4">
            <CardTitle className="text-xs font-medium text-slate-500">평균 진행률</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-4">
            <div className="text-2xl font-semibold text-slate-950">{summary.average}%</div>
            <Progress value={summary.average} />
          </CardContent>
        </Card>
        <Card className="rounded-lg bg-white">
          <CardHeader className="px-4 pt-4">
            <CardTitle className="text-xs font-medium text-slate-500">완료</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex items-center gap-2 text-2xl font-semibold text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              {summary.complete}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-lg bg-white">
          <CardHeader className="px-4 pt-4">
            <CardTitle className="text-xs font-medium text-slate-500">조치 필요</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex items-center gap-2 text-2xl font-semibold text-rose-700">
              <AlertCircle className="h-5 w-5" />
              {summary.needAction}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-lg bg-white">
          <CardHeader className="px-4 pt-4">
            <CardTitle className="text-xs font-medium text-slate-500">자가진단 완료</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-semibold text-slate-950">{summary.assessmentDone}</div>
          </CardContent>
        </Card>
        <Card className="rounded-lg bg-white">
          <CardHeader className="px-4 pt-4">
            <CardTitle className="text-xs font-medium text-slate-500">보고서 작성</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-semibold text-slate-950">{summary.reportDone}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="기업명, ID, 사업명 검색"
            className="pl-9"
          />
        </div>
        <select
          value={programFilter}
          onChange={(event) => setProgramFilter(event.target.value)}
          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
        >
          <option value="all">전체 사업</option>
          {programs.map((program) => (
            <option key={program.id} value={program.id}>
              {program.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
        >
          <option value="all">전체 상태</option>
          <option value="needs-action">조치 필요</option>
          <option value="complete">완료</option>
        </select>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {error ? (
          <div className="flex h-full items-center justify-center p-8 text-sm text-rose-600">
            {error}
          </div>
        ) : loading ? (
          <div className="flex h-full items-center justify-center p-8 text-sm text-slate-500">
            기업 작성 현황을 불러오는 중입니다.
          </div>
        ) : (
          <div className="h-full overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50">
                <TableRow>
                  <TableHead className="w-[260px] px-4">기업</TableHead>
                  <TableHead>참여사업</TableHead>
                  <TableHead>회원가입</TableHead>
                  <TableHead>기업정보</TableHead>
                  <TableHead>자가진단</TableHead>
                  <TableHead>현황분석</TableHead>
                  <TableHead className="w-[150px]">진행률</TableHead>
                  <TableHead>다음 액션</TableHead>
                  <TableHead>수정</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="px-4">
                      <div className="font-medium text-slate-950">{row.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{row.id}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-[260px] flex-wrap gap-1.5">
                        {row.programNames.length > 0 ? (
                          row.programNames.slice(0, 3).map((programName) => (
                            <Badge key={programName} variant="secondary" className="bg-slate-100">
                              {programName}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400">미지정</span>
                        )}
                        {row.programNames.length > 3 && (
                          <span className="text-xs text-slate-500">
                            +{row.programNames.length - 3}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge check={row.signup} />
                    </TableCell>
                    <TableCell>
                      <CheckCell check={row.companyInfo} />
                    </TableCell>
                    <TableCell>
                      <CheckCell check={row.selfAssessment} />
                    </TableCell>
                    <TableCell>
                      <CheckCell check={row.analysisReport} />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-slate-900">
                          {row.overallPercent}%
                        </div>
                        <Progress value={row.overallPercent} />
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <FileText className="h-4 w-4 text-slate-400" />
                        <span className="truncate">{row.nextAction}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {formatDateTime(row.lastUpdated)}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center text-sm text-slate-500">
                      조건에 맞는 기업이 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
