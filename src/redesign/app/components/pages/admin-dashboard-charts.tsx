import { useEffect, useMemo, useState } from "react"
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Search,
  Target,
  Users,
  XCircle,
} from "lucide-react"
import { Application, Program, User } from "@/redesign/app/lib/types"
import { getCompletedHoursByProgram } from "@/redesign/app/lib/program-metrics"
import { Badge } from "@/redesign/app/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/redesign/app/components/ui/card"
import { Input } from "@/redesign/app/components/ui/input"
import { PaginationControls } from "@/redesign/app/components/ui/pagination-controls"
import { Progress } from "@/redesign/app/components/ui/progress"
import { cn } from "@/redesign/app/components/ui/utils"

interface AdminDashboardChartsProps {
  applications: Application[]
  programs: Program[]
  currentUser: User
}

const PAGE_SIZE = 10

type ProgramDashboardItem = {
  program: Program
  targetHours: number
  completedHours: number
  achievementRate: number
  totalApplications: number
  waitingCount: number
  inProgressCount: number
  completedCount: number
  cancelledCount: number
  uniqueCompanies: number
}

function getRate(value: number, total: number) {
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)))
}

function getSegmentWidth(value: number, total: number) {
  if (total <= 0) return 0
  return (value / total) * 100
}

function prettyDateRange(start?: string, end?: string) {
  if (!start || !end) return "기간 미설정"
  return `${start} ~ ${end}`
}

function formatApplicationBreakdown(
  waitingCount: number,
  inProgressCount: number,
  completedCount: number,
  cancelledCount: number,
) {
  const segments = [
    `대기 ${waitingCount}건`,
    `진행 ${inProgressCount}건`,
    `완료 ${completedCount}건`,
  ]

  if (cancelledCount > 0) {
    segments.push(`취소/거절 ${cancelledCount}건`)
  }

  return segments.join(" · ")
}

export function AdminDashboardCharts({
  applications,
  programs,
  currentUser,
}: AdminDashboardChartsProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [page, setPage] = useState(1)
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null)
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const isAdminUser = currentUser.role === "admin"

  const completedHoursByProgram = useMemo(
    () => getCompletedHoursByProgram(applications),
    [applications],
  )

  const programStats = useMemo<ProgramDashboardItem[]>(() => {
    return programs
      .map((program) => {
        const programApplications = applications.filter((app) => app.programId === program.id)
        const completedHours = completedHoursByProgram.get(program.id) ?? 0
        const waitingCount = programApplications.filter(
          (app) => app.status === "pending" || app.status === "review",
        ).length
        const inProgressCount = programApplications.filter((app) => app.status === "confirmed").length
        const completedCount = programApplications.filter((app) => app.status === "completed").length
        const cancelledCount = programApplications.filter(
          (app) => app.status === "rejected" || app.status === "cancelled",
        ).length
        const uniqueCompanies = new Set(
          programApplications
            .map((app) => app.companyName?.trim())
            .filter((value): value is string => Boolean(value)),
        ).size

        return {
          program,
          targetHours: program.targetHours ?? 0,
          completedHours,
          achievementRate: getRate(completedHours, program.targetHours ?? 0),
          totalApplications: programApplications.length,
          waitingCount,
          inProgressCount,
          completedCount,
          cancelledCount,
          uniqueCompanies,
        }
      })
      .sort((a, b) => {
        if (b.totalApplications !== a.totalApplications) {
          return b.totalApplications - a.totalApplications
        }
        return a.program.name.localeCompare(b.program.name)
      })
  }, [applications, completedHoursByProgram, programs])

  const filteredProgramStats = useMemo(() => {
    if (!normalizedQuery) return programStats
    return programStats.filter(({ program }) => {
      const name = program.name.toLowerCase()
      const description = program.description.toLowerCase()
      return name.includes(normalizedQuery) || description.includes(normalizedQuery)
    })
  }, [normalizedQuery, programStats])

  const paginatedProgramStats = useMemo(() => {
    const startIndex = (page - 1) * PAGE_SIZE
    return filteredProgramStats.slice(startIndex, startIndex + PAGE_SIZE)
  }, [filteredProgramStats, page])

  useEffect(() => {
    setPage(1)
  }, [normalizedQuery, filteredProgramStats.length])

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredProgramStats.length / PAGE_SIZE))
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [filteredProgramStats.length, page])

  useEffect(() => {
    if (filteredProgramStats.length === 0) {
      setSelectedProgramId(null)
      return
    }

    const exists = selectedProgramId
      ? filteredProgramStats.some((item) => item.program.id === selectedProgramId)
      : false

    if (!exists) {
      setSelectedProgramId(filteredProgramStats[0]?.program.id ?? null)
    }
  }, [filteredProgramStats, selectedProgramId])

  const selectedProgramStats = useMemo(
    () => filteredProgramStats.find((item) => item.program.id === selectedProgramId) ?? null,
    [filteredProgramStats, selectedProgramId],
  )

  const summary = useMemo(() => {
    const totalTargetHours = programStats.reduce((sum, item) => sum + item.targetHours, 0)
    const totalCompletedHours = programStats.reduce((sum, item) => sum + item.completedHours, 0)
    const totalApplications = programStats.reduce((sum, item) => sum + item.totalApplications, 0)
    const waitingCount = programStats.reduce((sum, item) => sum + item.waitingCount, 0)
    const inProgressCount = programStats.reduce((sum, item) => sum + item.inProgressCount, 0)
    const completedCount = programStats.reduce((sum, item) => sum + item.completedCount, 0)
    const cancelledCount = programStats.reduce((sum, item) => sum + item.cancelledCount, 0)

    return {
      totalPrograms: programStats.length,
      totalTargetHours,
      totalCompletedHours,
      achievementRate: getRate(totalCompletedHours, totalTargetHours),
      totalApplications,
      waitingCount,
      inProgressCount,
      completedCount,
      cancelledCount,
    }
  }, [programStats])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50">
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-5">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">관리자 대시보드</h1>
            <p className="mt-1 text-sm text-slate-500">
              {isAdminUser
                ? "사업 전체 현황을 한 화면에 모으고, 사업을 선택하면 상세 지표를 바로 확인할 수 있도록 정리했습니다."
                : "담당 사업의 핵심 지표를 빠르게 확인합니다."}
            </p>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto flex min-h-0 h-full w-full max-w-7xl flex-1 flex-col gap-4 px-6 py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-white">
              <CardContent className="p-3.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">전체 사업</span>
                  <BarChart3 className="h-4 w-4 text-sky-500" />
                </div>
                <div className="text-xl font-semibold text-slate-900">{summary.totalPrograms}개</div>
                <p className="mt-1 text-xs text-slate-400">
                  검색 결과 {filteredProgramStats.length}개
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardContent className="p-3.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">완료 시수</span>
                  <Target className="h-4 w-4 text-emerald-500" />
                </div>
                <div className="flex items-end justify-between gap-3">
                  <span className="text-xl font-semibold text-slate-900">{summary.totalCompletedHours}h</span>
                  <span className="text-[11px] text-slate-400">목표 {summary.totalTargetHours}h</span>
                </div>
                <Progress value={summary.achievementRate} className="mt-3 h-2" />
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardContent className="p-3.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">평균 달성률</span>
                  <Clock3 className="h-4 w-4 text-indigo-500" />
                </div>
                <div className="text-xl font-semibold text-indigo-600">
                  {summary.achievementRate}%
                </div>
                <Progress value={summary.achievementRate} className="mt-3 h-2" />
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardContent className="p-3.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">전체 신청</span>
                  <CheckCircle2 className="h-4 w-4 text-amber-500" />
                </div>
                <div className="text-xl font-semibold text-slate-900">{summary.totalApplications}건</div>
                <p className="mt-1 text-xs text-slate-400">
                  {formatApplicationBreakdown(
                    summary.waitingCount,
                    summary.inProgressCount,
                    summary.completedCount,
                    summary.cancelledCount,
                  )}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
            <Card className="flex min-h-0 h-full flex-col overflow-hidden bg-white">
              <CardHeader className="space-y-3 border-b pb-4">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base font-semibold text-slate-900">사업 현황</CardTitle>
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                    {filteredProgramStats.length}개
                  </Badge>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="사업명으로 검색"
                    className="border-slate-300 bg-white pl-9"
                  />
                </div>
              </CardHeader>
              <CardContent className="min-h-0 flex flex-1 flex-col p-0">
                {filteredProgramStats.length === 0 ? (
                  <div className="m-4 flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500">
                    검색 조건에 맞는 사업이 없습니다.
                  </div>
                ) : (
                  <>
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                      <div className="space-y-2">
                        {paginatedProgramStats.map((item) => {
                          const isSelected = item.program.id === selectedProgramId
                          return (
                            <button
                              key={item.program.id}
                              type="button"
                              onClick={() => setSelectedProgramId(item.program.id)}
                              className={cn(
                                "w-full rounded-xl border px-3 py-3 text-left transition-colors",
                                isSelected
                                  ? "border-sky-200 bg-sky-50 text-slate-900 shadow-sm ring-1 ring-sky-100"
                                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: item.program.color }}
                                />
                                <span className="truncate text-sm font-semibold">{item.program.name}</span>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">
                                {prettyDateRange(item.program.periodStart, item.program.periodEnd)}
                              </p>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div className="shrink-0 border-t bg-white px-3 py-3">
                      <PaginationControls
                        page={page}
                        totalItems={filteredProgramStats.length}
                        pageSize={PAGE_SIZE}
                        onPageChange={setPage}
                        alwaysShow
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="flex min-h-0 h-full flex-col overflow-hidden bg-white">
              <CardHeader className="border-b pb-4">
                <CardTitle className="text-base font-semibold text-slate-900">
                  {selectedProgramStats ? `${selectedProgramStats.program.name} 상세` : "사업 상세"}
                </CardTitle>
              </CardHeader>
              <CardContent className="min-h-0 flex flex-1 flex-col overflow-hidden p-4">
                {selectedProgramStats ? (
                  <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: selectedProgramStats.program.color }}
                        />
                        <div className="text-sm font-semibold text-slate-900">
                          {selectedProgramStats.program.name}
                        </div>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {selectedProgramStats.program.description || "설명 없음"}
                      </p>
                      <div className="mt-3 text-xs text-slate-500">
                        기간: {prettyDateRange(
                          selectedProgramStats.program.periodStart,
                          selectedProgramStats.program.periodEnd,
                        )}
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Target className="h-3.5 w-3.5" />
                          시수 진행
                        </div>
                        <div className="mt-2 text-xl font-semibold text-slate-900">
                          {selectedProgramStats.achievementRate}%
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {selectedProgramStats.completedHours}h / {selectedProgramStats.targetHours}h
                        </div>
                        <Progress value={selectedProgramStats.achievementRate} className="mt-3 h-2" />
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Users className="h-3.5 w-3.5" />
                          참여 기업
                        </div>
                        <div className="mt-2 text-xl font-semibold text-slate-900">
                          {selectedProgramStats.uniqueCompanies}개사
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          신청 기준 집계
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <CalendarDays className="h-3.5 w-3.5" />
                          전체 신청 수
                        </div>
                        <div className="mt-2 text-xl font-semibold text-slate-900">
                          {selectedProgramStats.totalApplications}건
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {formatApplicationBreakdown(
                            selectedProgramStats.waitingCount,
                            selectedProgramStats.inProgressCount,
                            selectedProgramStats.completedCount,
                            selectedProgramStats.cancelledCount,
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="text-sm font-semibold text-slate-900">신청 상태 비율</div>
                        <div className="text-xs text-slate-500">
                          총 {selectedProgramStats.totalApplications}건
                        </div>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                        <div className="flex h-full w-full">
                          <div
                            className="h-full bg-amber-400"
                            style={{
                              width: `${getSegmentWidth(
                                selectedProgramStats.waitingCount,
                                selectedProgramStats.totalApplications,
                              )}%`,
                            }}
                          />
                          <div
                            className="h-full bg-sky-500"
                            style={{
                              width: `${getSegmentWidth(
                                selectedProgramStats.inProgressCount,
                                selectedProgramStats.totalApplications,
                              )}%`,
                            }}
                          />
                          <div
                            className="h-full bg-emerald-500"
                            style={{
                              width: `${getSegmentWidth(
                                selectedProgramStats.completedCount,
                                selectedProgramStats.totalApplications,
                              )}%`,
                            }}
                          />
                          <div
                            className="h-full bg-slate-300"
                            style={{
                              width: `${getSegmentWidth(
                                selectedProgramStats.cancelledCount,
                                selectedProgramStats.totalApplications,
                              )}%`,
                            }}
                          />
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-lg bg-amber-50 p-3">
                          <div className="text-[11px] text-amber-700">대기</div>
                          <div className="mt-1 text-base font-semibold text-amber-900">
                            {selectedProgramStats.waitingCount}건
                          </div>
                        </div>
                        <div className="rounded-lg bg-sky-50 p-3">
                          <div className="text-[11px] text-sky-700">진행</div>
                          <div className="mt-1 text-base font-semibold text-sky-900">
                            {selectedProgramStats.inProgressCount}건
                          </div>
                        </div>
                        <div className="rounded-lg bg-emerald-50 p-3">
                          <div className="text-[11px] text-emerald-700">완료</div>
                          <div className="mt-1 text-base font-semibold text-emerald-900">
                            {selectedProgramStats.completedCount}건
                          </div>
                        </div>
                        <div className="rounded-lg bg-slate-100 p-3">
                          <div className="text-[11px] text-slate-600">취소/거절</div>
                          <div className="mt-1 text-base font-semibold text-slate-900">
                            {selectedProgramStats.cancelledCount}건
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500">
                    왼쪽에서 사업을 선택하면 상세 지표가 표시됩니다.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
