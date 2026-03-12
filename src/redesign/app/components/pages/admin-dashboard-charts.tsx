import { useMemo, useState } from "react"
import { BarChart3, CheckCircle2, Clock3, Search, Target } from "lucide-react"
import { Application, Program, User } from "@/redesign/app/lib/types"
import { getCompletedHoursByProgram } from "@/redesign/app/lib/program-metrics"
import { Card, CardContent, CardHeader, CardTitle } from "@/redesign/app/components/ui/card"
import { Input } from "@/redesign/app/components/ui/input"
import { Progress } from "@/redesign/app/components/ui/progress"

interface AdminDashboardChartsProps {
  applications: Application[]
  programs: Program[]
  currentUser: User
}

type ProgramDashboardItem = {
  program: Program
  targetHours: number
  completedHours: number
  achievementRate: number
  totalApplications: number
  waitingCount: number
  inProgressCount: number
  completedCount: number
  otherCount: number
}

function getRate(value: number, total: number) {
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)))
}

function getSegmentWidth(value: number, total: number) {
  if (total <= 0) return 0
  return (value / total) * 100
}

export function AdminDashboardCharts({
  applications,
  programs,
  currentUser,
}: AdminDashboardChartsProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const isAdminUser = currentUser.role === "admin"
  const completedHoursByProgram = useMemo(
    () => getCompletedHoursByProgram(applications),
    [applications],
  )

  const programStats = useMemo<ProgramDashboardItem[]>(() => {
    return programs.map((program) => {
      const programApplications = applications.filter((app) => app.programId === program.id)
      const completedHours = completedHoursByProgram.get(program.id) ?? 0
      const waitingCount = programApplications.filter(
        (app) => app.status === "pending" || app.status === "review",
      ).length
      const inProgressCount = programApplications.filter((app) => app.status === "confirmed").length
      const completedCount = programApplications.filter((app) => app.status === "completed").length
      const otherCount = programApplications.filter(
        (app) => app.status === "rejected" || app.status === "cancelled",
      ).length

      return {
        program,
        targetHours: program.targetHours ?? 0,
        completedHours,
        achievementRate: getRate(completedHours, program.targetHours ?? 0),
        totalApplications: programApplications.length,
        waitingCount,
        inProgressCount,
        completedCount,
        otherCount,
      }
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

  const summary = useMemo(() => {
    const totalTargetHours = programStats.reduce((sum, item) => sum + item.targetHours, 0)
    const totalCompletedHours = programStats.reduce((sum, item) => sum + item.completedHours, 0)
    const totalApplications = programStats.reduce((sum, item) => sum + item.totalApplications, 0)
    const waitingCount = programStats.reduce((sum, item) => sum + item.waitingCount, 0)
    const inProgressCount = programStats.reduce((sum, item) => sum + item.inProgressCount, 0)
    const completedCount = programStats.reduce((sum, item) => sum + item.completedCount, 0)
    const otherCount = programStats.reduce((sum, item) => sum + item.otherCount, 0)

    return {
      totalPrograms: programStats.length,
      totalTargetHours,
      totalCompletedHours,
      achievementRate: getRate(totalCompletedHours, totalTargetHours),
      totalApplications,
      waitingCount,
      inProgressCount,
      completedCount,
      otherCount,
    }
  }, [programStats])

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <div className="shrink-0 border-b border-slate-200/80 bg-white/80 px-8 py-4 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">관리자 대시보드</h1>
            <p className="mt-1 text-sm text-slate-500">
              {isAdminUser
                ? "사업별 목표 시수와 완료 시수, 신청 상태 비율만 빠르게 확인하도록 정리했습니다."
                : "담당 사업의 목표 시수와 신청 상태를 확인합니다."}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              달성률은 시수 기준, 상태 비율은 신청 건수 기준입니다.
            </p>
          </div>
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="사업명으로 검색"
              className="bg-white pl-9"
            />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-8 py-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="bg-white">
            <CardContent className="p-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-slate-500">전체 사업</span>
                <BarChart3 className="h-4 w-4 text-sky-500" />
              </div>
              <div className="text-3xl font-semibold text-slate-900">{summary.totalPrograms}개</div>
              <p className="mt-1 text-xs text-slate-400">
                검색 결과 {filteredProgramStats.length}개 표시
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="p-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-slate-500">전체 목표 시수</span>
                <Target className="h-4 w-4 text-indigo-500" />
              </div>
              <div className="text-3xl font-semibold text-slate-900">
                {summary.totalTargetHours}h
              </div>
              <p className="mt-1 text-xs text-slate-400">완료 {summary.totalCompletedHours}h</p>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="p-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-slate-500">전체 달성률</span>
                <Clock3 className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="text-3xl font-semibold text-emerald-600">
                {summary.achievementRate}%
              </div>
              <p className="mt-1 text-xs text-slate-400">목표 대비 완료 시수 기준</p>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="p-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-slate-500">전체 완료 신청</span>
                <CheckCircle2 className="h-4 w-4 text-amber-500" />
              </div>
              <div className="text-3xl font-semibold text-slate-900">
                {summary.completedCount}건
              </div>
              <p className="mt-1 text-xs text-slate-400">
                전체 신청 {summary.totalApplications}건 중{" "}
                {getRate(summary.completedCount, summary.totalApplications)}%
              </p>
            </CardContent>
          </Card>
        </div>

          <Card className="bg-white">
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-base font-semibold text-slate-900">
              전체 신청 상태 비율
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="flex h-full w-full">
                <div
                  className="h-full bg-amber-400"
                  style={{
                    width: `${getSegmentWidth(summary.waitingCount, summary.totalApplications)}%`,
                  }}
                />
                <div
                  className="h-full bg-sky-500"
                  style={{
                    width: `${getSegmentWidth(summary.inProgressCount, summary.totalApplications)}%`,
                  }}
                />
                <div
                  className="h-full bg-emerald-500"
                  style={{
                    width: `${getSegmentWidth(summary.completedCount, summary.totalApplications)}%`,
                  }}
                />
                <div
                  className="h-full bg-slate-300"
                  style={{
                    width: `${getSegmentWidth(summary.otherCount, summary.totalApplications)}%`,
                  }}
                />
              </div>
            </div>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
              <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                <div className="text-xs text-amber-700">대기</div>
                <div className="mt-1 text-lg font-semibold text-amber-900">
                  {summary.waitingCount}건
                </div>
                <div className="text-xs text-amber-700">
                  {getRate(summary.waitingCount, summary.totalApplications)}%
                </div>
              </div>
              <div className="rounded-lg border border-sky-100 bg-sky-50 p-3">
                <div className="text-xs text-sky-700">진행</div>
                <div className="mt-1 text-lg font-semibold text-sky-900">
                  {summary.inProgressCount}건
                </div>
                <div className="text-xs text-sky-700">
                  {getRate(summary.inProgressCount, summary.totalApplications)}%
                </div>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                <div className="text-xs text-emerald-700">완료</div>
                <div className="mt-1 text-lg font-semibold text-emerald-900">
                  {summary.completedCount}건
                </div>
                <div className="text-xs text-emerald-700">
                  {getRate(summary.completedCount, summary.totalApplications)}%
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs text-slate-600">기타</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {summary.otherCount}건
                </div>
                <div className="text-xs text-slate-600">
                  {getRate(summary.otherCount, summary.totalApplications)}%
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

          <div className="grid gap-4 lg:grid-cols-2">
          {filteredProgramStats.map((item) => (
            <Card key={item.program.id} className="bg-white">
              <CardHeader className="border-b pb-4">
                <CardTitle className="flex items-center gap-3 text-base font-semibold text-slate-900">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: item.program.color }}
                  />
                  {item.program.name}
                </CardTitle>
                <p className="text-sm text-slate-500">{item.program.description}</p>
              </CardHeader>
              <CardContent className="space-y-5 pt-5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border bg-slate-50 p-3">
                    <div className="text-[11px] text-slate-500">목표</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      {item.targetHours}h
                    </div>
                  </div>
                  <div className="rounded-lg border bg-slate-50 p-3">
                    <div className="text-[11px] text-slate-500">완료</div>
                    <div className="mt-1 text-lg font-semibold text-emerald-600">
                      {item.completedHours}h
                    </div>
                  </div>
                  <div className="rounded-lg border bg-slate-50 p-3">
                    <div className="text-[11px] text-slate-500">달성률</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      {item.achievementRate}%
                    </div>
                  </div>
                  <div className="rounded-lg border bg-slate-50 p-3">
                    <div className="text-[11px] text-slate-500">신청</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      {item.totalApplications}건
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>시수 진행</span>
                    <span>
                      {item.completedHours}h / {item.targetHours}h
                    </span>
                  </div>
                  <Progress value={item.achievementRate} className="h-2 bg-slate-100" />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-900">신청 상태 비율</span>
                    <span className="text-xs text-slate-500">총 {item.totalApplications}건</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className="flex h-full w-full">
                      <div
                        className="h-full bg-amber-400"
                        style={{
                          width: `${getSegmentWidth(item.waitingCount, item.totalApplications)}%`,
                        }}
                      />
                      <div
                        className="h-full bg-sky-500"
                        style={{
                          width: `${getSegmentWidth(item.inProgressCount, item.totalApplications)}%`,
                        }}
                      />
                      <div
                        className="h-full bg-emerald-500"
                        style={{
                          width: `${getSegmentWidth(item.completedCount, item.totalApplications)}%`,
                        }}
                      />
                      <div
                        className="h-full bg-slate-300"
                        style={{
                          width: `${getSegmentWidth(item.otherCount, item.totalApplications)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div className="rounded-md bg-amber-50 p-2 text-center text-amber-800">
                      대기 {item.waitingCount}건
                    </div>
                    <div className="rounded-md bg-sky-50 p-2 text-center text-sky-800">
                      진행 {item.inProgressCount}건
                    </div>
                    <div className="rounded-md bg-emerald-50 p-2 text-center text-emerald-800">
                      완료 {item.completedCount}건
                    </div>
                    <div className="rounded-md bg-slate-100 p-2 text-center text-slate-700">
                      기타 {item.otherCount}건
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

          {filteredProgramStats.length === 0 && (
            <Card className="bg-white">
              <CardContent className="flex min-h-[160px] items-center justify-center p-6 text-sm text-slate-500">
                검색 조건에 맞는 사업이 없습니다.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
