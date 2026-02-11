import { type FormEvent, useEffect, useMemo, useState } from "react"
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Plus,
  Target,
  Users,
  X,
  XCircle,
} from "lucide-react"
import { Agenda, Application, Program } from "../../lib/types"
import { StatusChip } from "../status-chip"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Progress } from "../ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table"
import { Textarea } from "../ui/textarea"

interface AdminProgramsProps {
  programs: Program[]
  applications: Application[]
  agendas: Agenda[]
  onAddProgram: (data: Omit<Program, "id">) => void
  onUpdateProgram: (id: string, data: Partial<Program>) => void
  viewMode?: "management" | "list"
  onNavigate?: (page: string) => void
}

type ProgramFormState = {
  name: string
  description: string
  internalTicketLimit: string
  externalTicketLimit: string
  targetHours: string
  periodStart: string
  periodEnd: string
  agendaIds: string[]
}

type ProgramStats = {
  program: Program
  totalSessions: number
  completedSessions: number
  pendingSessions: number
  confirmedSessions: number
  cancelledSessions: number
  uniqueCompanies: number
  achievementRate: number
}

function createDefaultProgramForm(): ProgramFormState {
  return {
    name: "",
    description: "",
    internalTicketLimit: "0",
    externalTicketLimit: "0",
    targetHours: "0",
    periodStart: "",
    periodEnd: "",
    agendaIds: [],
  }
}

function numberFromInput(value: string) {
  const parsed = Number(value.replace(/[^\d]/g, ""))
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return parsed
}

function prettyDateRange(start?: string, end?: string) {
  if (!start || !end) return "기간 미설정"
  return `${start} ~ ${end}`
}

function getProgressRate(completed: number, target: number) {
  if (target <= 0) return 0
  const ratio = Math.round((completed / target) * 100)
  return Math.min(100, Math.max(0, ratio))
}

function getTimeValue(value?: Date | string) {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

function formatDateLabel(value?: Date | string) {
  if (!value) return "-"
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString("ko-KR")
}

function formatScheduleLabel(date?: string, time?: string) {
  if (!date) return "-"
  if (!time) return date
  return `${date} ${time}`
}

function toProgramForm(program: Program | null): ProgramFormState {
  if (!program) return createDefaultProgramForm()
  return {
    name: program.name,
    description: program.description,
    internalTicketLimit: String(program.internalTicketLimit ?? 0),
    externalTicketLimit: String(program.externalTicketLimit ?? 0),
    targetHours: String(program.targetHours),
    periodStart: program.periodStart ?? "",
    periodEnd: program.periodEnd ?? "",
    agendaIds: [...(program.agendaIds ?? [])],
  }
}

export function AdminPrograms({
  programs,
  applications,
  agendas,
  onAddProgram,
  onUpdateProgram,
  viewMode = "management",
  onNavigate,
}: AdminProgramsProps) {
  const isManagementMode = viewMode === "management"

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [form, setForm] = useState<ProgramFormState>(() => createDefaultProgramForm())
  const [detailForm, setDetailForm] = useState<ProgramFormState>(() =>
    createDefaultProgramForm()
  )
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null)
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null)
  const [agendaSelectValue, setAgendaSelectValue] = useState("")
  const [detailAgendaSelectValue, setDetailAgendaSelectValue] = useState("")

  const applicationsByProgram = useMemo(() => {
    const grouped = new Map<string, Application[]>()

    applications.forEach((application) => {
      if (!application.programId) return
      const bucket = grouped.get(application.programId) ?? []
      bucket.push(application)
      grouped.set(application.programId, bucket)
    })

    return grouped
  }, [applications])

  const programStats = useMemo<ProgramStats[]>(() => {
    return programs.map((program) => {
      const programApplications = applicationsByProgram.get(program.id) ?? []
      const companySet = new Set(
        programApplications.map((app) => app.companyName?.trim() || "미지정 회사")
      )

      const completedSessions = programApplications.filter(
        (app) => app.status === "completed"
      ).length
      const pendingSessions = programApplications.filter(
        (app) => app.status === "pending" || app.status === "review"
      ).length
      const confirmedSessions = programApplications.filter(
        (app) => app.status === "confirmed"
      ).length
      const cancelledSessions = programApplications.filter(
        (app) => app.status === "cancelled"
      ).length

      return {
        program,
        totalSessions: programApplications.length,
        completedSessions,
        pendingSessions,
        confirmedSessions,
        cancelledSessions,
        uniqueCompanies: companySet.size,
        achievementRate: getProgressRate(program.completedHours, program.targetHours),
      }
    })
  }, [applicationsByProgram, programs])

  const summaryStats = useMemo(() => {
    const totalPrograms = programs.length
    const totalTargetHours = programs.reduce((sum, program) => sum + (program.targetHours || 0), 0)
    const totalCompletedHours = programs.reduce((sum, program) => sum + (program.completedHours || 0), 0)
    const avgAchievement =
      totalPrograms === 0
        ? 0
        : Math.round(
          programs.reduce((sum, program) => sum + getProgressRate(program.completedHours, program.targetHours), 0)
          / totalPrograms
        )
    return {
      totalPrograms,
      totalTargetHours,
      totalCompletedHours,
      avgAchievement,
    }
  }, [programs])

  const selectedProgram = useMemo(
    () => programs.find((program) => program.id === selectedProgramId) ?? null,
    [programs, selectedProgramId]
  )

  const selectedStats = useMemo(
    () => programStats.find((item) => item.program.id === selectedProgramId) ?? null,
    [programStats, selectedProgramId]
  )

  const selectedApplications = useMemo(() => {
    if (!selectedProgram) return []

    const items = applicationsByProgram.get(selectedProgram.id) ?? []
    return [...items].sort((a, b) => getTimeValue(b.createdAt) - getTimeValue(a.createdAt))
  }, [applicationsByProgram, selectedProgram])

  const editingProgram = useMemo(
    () => programs.find((program) => program.id === editingProgramId) ?? null,
    [editingProgramId, programs]
  )

  useEffect(() => {
    if (programs.length === 0) {
      setSelectedProgramId(null)
      return
    }

    const exists = selectedProgramId
      ? programs.some((program) => program.id === selectedProgramId)
      : false

    if (!exists) {
      setSelectedProgramId(programs[0]?.id ?? null)
    }
  }, [programs, selectedProgramId])

  useEffect(() => {
    if (!editingProgram) {
      setDetailForm(createDefaultProgramForm())
      return
    }
    const nextForm = toProgramForm(editingProgram)
    setDetailForm(nextForm)
  }, [editingProgram])

  function handleSubmitProgram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = form.name.trim()
    if (!name) return

    const targetHours = numberFromInput(form.targetHours)
    const internalTicketLimit = numberFromInput(form.internalTicketLimit)
    const externalTicketLimit = numberFromInput(form.externalTicketLimit)
    const randomHue = Math.floor(Math.random() * 360)

    onAddProgram({
      name,
      description: form.description.trim() || `${name} 사업`,
      color: `hsl(${randomHue} 60% 45%)`,
      targetHours,
      completedHours: 0,
      maxApplications: internalTicketLimit + externalTicketLimit,
      usedApplications: 0,
      internalTicketLimit,
      externalTicketLimit,
      periodStart: form.periodStart || undefined,
      periodEnd: form.periodEnd || undefined,
      weekdays: ["TUE", "THU"],
      agendaIds: form.agendaIds,
    })

    setForm(createDefaultProgramForm())
    setAgendaSelectValue("")
    setIsAddDialogOpen(false)
  }

  function handleSaveProgramDetail() {
    if (!editingProgram) return

    const name = detailForm.name.trim()
    if (!name) return

    const targetHours = numberFromInput(detailForm.targetHours)
    const internalTicketLimit = numberFromInput(detailForm.internalTicketLimit)
    const externalTicketLimit = numberFromInput(detailForm.externalTicketLimit)
    const maxApplications = internalTicketLimit + externalTicketLimit

    onUpdateProgram(editingProgram.id, {
      name,
      description: detailForm.description.trim() || `${name} 사업`,
      targetHours,
      internalTicketLimit,
      externalTicketLimit,
      maxApplications,
      usedApplications: Math.min(editingProgram.usedApplications, maxApplications),
      periodStart: detailForm.periodStart || undefined,
      periodEnd: detailForm.periodEnd || undefined,
      agendaIds: detailForm.agendaIds,
    })

    setIsEditDialogOpen(false)
    setEditingProgramId(null)
    setDetailAgendaSelectValue("")
  }

  function openEditDialog(programId: string) {
    setEditingProgramId(programId)
    setIsEditDialogOpen(true)
    setDetailAgendaSelectValue("")
  }

  function addAgendaToForm(agendaId: string) {
    if (!agendaId) return
    setForm((prev) => {
      if (prev.agendaIds.includes(agendaId)) return prev
      return {
        ...prev,
        agendaIds: [...prev.agendaIds, agendaId],
      }
    })
    setAgendaSelectValue("")
  }

  function removeAgendaFromForm(agendaId: string) {
    setForm((prev) => {
      return {
        ...prev,
        agendaIds: prev.agendaIds.filter((id) => id !== agendaId),
      }
    })
  }

  function addAgendaToDetailForm(agendaId: string) {
    if (!agendaId) return
    setDetailForm((prev) => {
      if (prev.agendaIds.includes(agendaId)) return prev
      return {
        ...prev,
        agendaIds: [...prev.agendaIds, agendaId],
      }
    })
    setDetailAgendaSelectValue("")
  }

  function removeAgendaFromDetailForm(agendaId: string) {
    setDetailForm((prev) => {
      return {
        ...prev,
        agendaIds: prev.agendaIds.filter((id) => id !== agendaId),
      }
    })
  }

  const pageTitle = isManagementMode ? "사업 관리" : "사업별 프로그램"
  const pageDescription = isManagementMode
    ? "사업 목록을 관리하고, 상세보기에서 사업 정보를 수정할 수 있습니다."
    : "사업명, 시수 진행률, 신청 횟수를 확인하고 사업을 클릭해 신청내역과 상세 통계를 볼 수 있습니다."

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{pageTitle}</h1>
          <p className="text-sm text-muted-foreground mt-1">{pageDescription}</p>
        </div>

        {isManagementMode && (
          <div className="flex items-center gap-2">
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              사업 생성
            </Button>
          </div>
        )}
      </div>

      {isManagementMode ? (
        <Card>
          <CardHeader>
            <CardTitle>사업 목록</CardTitle>
            <CardDescription>
              상세보기를 누르면 수정 모달이 열리고, 상단 버튼에서 새 사업을 만들 수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>사업명</TableHead>
                  <TableHead>기간</TableHead>
                  <TableHead>시수 진행률</TableHead>
                  <TableHead>신청 횟수</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {programStats.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                      등록된 사업이 없습니다.
                    </TableCell>
                  </TableRow>
                )}

                {programStats.map((item) => (
                  <TableRow key={item.program.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: item.program.color }}
                        />
                        <span className="font-medium">{item.program.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {prettyDateRange(item.program.periodStart, item.program.periodEnd)}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 min-w-40">
                        <div className="text-xs text-muted-foreground">
                          {item.program.completedHours}h / {item.program.targetHours}h
                        </div>
                        <Progress value={item.achievementRate} className="h-1.5" />
                        <div className="text-xs font-medium">{item.achievementRate}%</div>
                      </div>
                    </TableCell>
                    <TableCell>{item.totalSessions}건</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(item.program.id)}
                      >
                        상세보기
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">전체 요약</CardTitle>
              <CardDescription>
                전체 사업 수와 시수 진행 상황을 빠르게 확인합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    전체 사업 수
                  </div>
                  <p className="text-2xl font-semibold text-slate-900 mt-3">
                    {summaryStats.totalPrograms}개
                  </p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
                  <div className="flex items-center gap-2 text-xs text-amber-700">
                    <Target className="w-3.5 h-3.5" />
                    목표 시수 (전체)
                  </div>
                  <p className="text-2xl font-semibold text-amber-900 mt-3">
                    {summaryStats.totalTargetHours}h
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
                  <div className="flex items-center gap-2 text-xs text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    완료 시수
                  </div>
                  <p className="text-2xl font-semibold text-emerald-900 mt-3">
                    {summaryStats.totalCompletedHours}h
                  </p>
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-5">
                  <div className="flex items-center gap-2 text-xs text-blue-700">
                    <Clock3 className="w-3.5 h-3.5" />
                    평균 달성률
                  </div>
                  <p className="text-2xl font-semibold text-blue-900 mt-3">
                    {summaryStats.avgAchievement}%
                  </p>
                  <Progress value={summaryStats.avgAchievement} className="h-2 mt-3" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>사업별 요약</CardTitle>
              <CardDescription>
                사업별 진행률과 신청 현황을 카드로 확인하세요.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {programStats.length === 0 ? (
                <div className="h-24 text-center text-sm text-muted-foreground flex items-center justify-center">
                  등록된 사업이 없습니다.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {programStats.map((item) => {
                    const isSelected = selectedProgramId === item.program.id
                    return (
                      <button
                        key={item.program.id}
                        type="button"
                        onClick={() => setSelectedProgramId(item.program.id)}
                        className={`text-left rounded-xl border p-4 transition-shadow ${
                          isSelected ? "ring-2 ring-blue-200 shadow-md" : "hover:shadow-md"
                        }`}
                        style={{
                          borderColor: item.program.color,
                          background: `linear-gradient(135deg, ${item.program.color}14 0%, #ffffff 55%)`,
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: item.program.color }}
                              />
                              <span className="font-semibold text-slate-900">
                                {item.program.name}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {prettyDateRange(item.program.periodStart, item.program.periodEnd)}
                            </p>
                          </div>
                          <Badge variant="outline">{item.totalSessions}건</Badge>
                        </div>

                        <div className="mt-4 space-y-2">
                          <div className="text-xs text-muted-foreground">
                            {item.program.completedHours}h / {item.program.targetHours}h
                          </div>
                          <Progress value={item.achievementRate} className="h-2" />
                          <div className="text-sm font-semibold text-slate-900">
                            달성률 {item.achievementRate}%
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                          <div className="rounded-lg bg-white/70 border px-2 py-1 text-center">
                            완료 {item.completedSessions}건
                          </div>
                          <div className="rounded-lg bg-white/70 border px-2 py-1 text-center">
                            진행중 {item.pendingSessions + item.confirmedSessions}건
                          </div>
                          <div className="rounded-lg bg-white/70 border px-2 py-1 text-center">
                            취소 {item.cancelledSessions}건
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {selectedProgram && selectedStats && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: selectedProgram.color }}
                    />
                    {selectedProgram.name} 상세 통계
                  </CardTitle>
                  <CardDescription>
                    선택한 사업의 운영 상태와 신청 현황을 확인할 수 있습니다.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" />
                        신청 횟수
                      </div>
                      <div className="text-lg font-semibold mt-1">{selectedStats.totalSessions}건</div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        완료
                      </div>
                      <div className="text-lg font-semibold mt-1 text-emerald-600">
                        {selectedStats.completedSessions}건
                      </div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock3 className="w-3 h-3 text-amber-600" />
                        진행중
                      </div>
                      <div className="text-lg font-semibold mt-1 text-amber-600">
                        {selectedStats.pendingSessions + selectedStats.confirmedSessions}건
                      </div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <XCircle className="w-3 h-3 text-rose-600" />
                        취소
                      </div>
                      <div className="text-lg font-semibold mt-1 text-rose-600">
                        {selectedStats.cancelledSessions}건
                      </div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        참여 기업
                      </div>
                      <div className="text-lg font-semibold mt-1">{selectedStats.uniqueCompanies}개사</div>
                    </div>
                  </div>

                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="text-sm font-medium flex items-center gap-1">
                      <Target className="w-4 h-4" />
                      시수 진행률
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {selectedProgram.completedHours}h / {selectedProgram.targetHours}h ({selectedStats.achievementRate}%)
                    </div>
                    <Progress value={selectedStats.achievementRate} className="h-2" />
                    <p className="text-xs text-muted-foreground">
                      기간: {prettyDateRange(selectedProgram.periodStart, selectedProgram.periodEnd)}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-medium mb-2">연결 아젠다</div>
                      <div className="flex flex-wrap gap-1.5">
                        {(selectedProgram.agendaIds ?? []).length > 0 ? (
                          (selectedProgram.agendaIds ?? []).map((agendaId) => {
                            const agenda = agendas.find((item) => item.id === agendaId)
                            if (!agenda) return null
                            return (
                              <Badge key={agendaId} variant="outline">
                                {agenda.name}
                              </Badge>
                            )
                          })
                        ) : (
                          <span className="text-xs text-muted-foreground">선택된 아젠다가 없습니다.</span>
                        )}
                      </div>
                    </div>

                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle>{selectedProgram.name} 신청 내역</CardTitle>
                    <CardDescription className="mt-1">
                      선택한 사업의 신청 기록을 최신순으로 확인할 수 있습니다.
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!onNavigate}
                    onClick={() => onNavigate?.("admin-applications")}
                  >
                    신청 관리로 이동
                  </Button>
                </CardHeader>

                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>신청일</TableHead>
                        <TableHead>상태</TableHead>
                        <TableHead>기업명</TableHead>
                        <TableHead>주제</TableHead>
                        <TableHead>컨설턴트</TableHead>
                        <TableHead>예정 일정</TableHead>
                        <TableHead>신청자</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedApplications.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="h-24 text-center text-sm text-muted-foreground"
                          >
                            신청 내역이 없습니다.
                          </TableCell>
                        </TableRow>
                      )}

                      {selectedApplications.map((application) => (
                        <TableRow key={application.id}>
                          <TableCell>{formatDateLabel(application.createdAt)}</TableCell>
                          <TableCell>
                            <StatusChip status={application.status} size="sm" />
                          </TableCell>
                          <TableCell>{application.companyName ?? "-"}</TableCell>
                          <TableCell>{application.agenda || application.officeHourTitle}</TableCell>
                          <TableCell>{application.consultant}</TableCell>
                          <TableCell>
                            {formatScheduleLabel(
                              application.scheduledDate,
                              application.scheduledTime
                            )}
                          </TableCell>
                          <TableCell>{application.applicantName ?? "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto p-8 sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              사업 생성
            </DialogTitle>
            <DialogDescription>
              입력 여백을 넉넉하게 구성했습니다. 기본 정보를 입력하면 사업이 생성됩니다.
            </DialogDescription>
          </DialogHeader>

          <form className="mt-2 space-y-6" onSubmit={handleSubmitProgram}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>사업명</Label>
                <Input
                  value={form.name}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="예: 2026 상반기 농식품 프로그램"
                  required
                />
              </div>

              <div className="space-y-2 md:col-span-1">
                <Label>사업 설명</Label>
                <Textarea
                  rows={3}
                  value={form.description}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                  placeholder="사업 목적 및 운영 메모"
                />
              </div>

              <div className="space-y-2">
                <Label>기간 시작</Label>
                <Input
                  type="date"
                  value={form.periodStart}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, periodStart: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>기간 종료</Label>
                <Input
                  type="date"
                  value={form.periodEnd}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, periodEnd: event.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  요일은 화/목 고정입니다.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label>내부 티켓 수</Label>
                <Input
                  inputMode="numeric"
                  value={form.internalTicketLimit}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      internalTicketLimit: event.target.value.replace(/[^\d]/g, ""),
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>외부 티켓 수</Label>
                <Input
                  inputMode="numeric"
                  value={form.externalTicketLimit}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      externalTicketLimit: event.target.value.replace(/[^\d]/g, ""),
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>목표 시수(h)</Label>
                <Input
                  inputMode="numeric"
                  value={form.targetHours}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      targetHours: event.target.value.replace(/[^\d]/g, ""),
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>연결 아젠다 (다중)</Label>
                <div className="flex items-center gap-2">
                  <Select value={agendaSelectValue} onValueChange={setAgendaSelectValue}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="아젠다 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {agendas.map((agenda) => (
                        <SelectItem key={agenda.id} value={agenda.id}>
                          {agenda.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!agendaSelectValue}
                    onClick={() => addAgendaToForm(agendaSelectValue)}
                  >
                    추가
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {form.agendaIds.length > 0 ? (
                    form.agendaIds.map((agendaId) => {
                      const agenda = agendas.find((item) => item.id === agendaId)
                      if (!agenda) return null
                      return (
                        <Badge key={agendaId} variant="outline" className="gap-1">
                          <span>{agenda.name}</span>
                          <button
                            type="button"
                            onClick={() => removeAgendaFromForm(agendaId)}
                            className="rounded hover:bg-slate-200/70"
                            aria-label={`${agenda.name} 제거`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      )
                    })
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      선택된 아젠다가 없습니다.
                    </span>
                  )}
                </div>
              </div>

            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                취소
              </Button>
              <Button type="submit">
                <Plus className="w-4 h-4 mr-2" />
                사업 생성
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open)
          if (!open) {
            setEditingProgramId(null)
          }
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto p-8 sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>사업 상세보기 / 수정</DialogTitle>
            <DialogDescription>
              입력 여백과 폭을 늘려 수정하기 편하게 조정했습니다.
            </DialogDescription>
          </DialogHeader>

          {editingProgram ? (
            <div className="space-y-6 mt-2">
              <div className="rounded-lg border p-4 bg-slate-50/60">
                <div className="text-sm font-medium">{editingProgram.name}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  기간: {prettyDateRange(editingProgram.periodStart, editingProgram.periodEnd)}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>사업명</Label>
                  <Input
                    value={detailForm.name}
                    onChange={(event) =>
                      setDetailForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>사업 설명</Label>
                  <Textarea
                    rows={3}
                    value={detailForm.description}
                    onChange={(event) =>
                      setDetailForm((prev) => ({ ...prev, description: event.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>기간 시작</Label>
                  <Input
                    type="date"
                    value={detailForm.periodStart}
                    onChange={(event) =>
                      setDetailForm((prev) => ({ ...prev, periodStart: event.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>기간 종료</Label>
                  <Input
                    type="date"
                    value={detailForm.periodEnd}
                    onChange={(event) =>
                      setDetailForm((prev) => ({ ...prev, periodEnd: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label>내부 티켓 수</Label>
                  <Input
                    inputMode="numeric"
                    value={detailForm.internalTicketLimit}
                    onChange={(event) =>
                      setDetailForm((prev) => ({
                        ...prev,
                        internalTicketLimit: event.target.value.replace(/[^\d]/g, ""),
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>외부 티켓 수</Label>
                  <Input
                    inputMode="numeric"
                    value={detailForm.externalTicketLimit}
                    onChange={(event) =>
                      setDetailForm((prev) => ({
                        ...prev,
                        externalTicketLimit: event.target.value.replace(/[^\d]/g, ""),
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>목표 시수(h)</Label>
                  <Input
                    inputMode="numeric"
                    value={detailForm.targetHours}
                    onChange={(event) =>
                      setDetailForm((prev) => ({
                        ...prev,
                        targetHours: event.target.value.replace(/[^\d]/g, ""),
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>연결 아젠다 (다중)</Label>
                  <div className="flex items-center gap-2">
                    <Select
                      value={detailAgendaSelectValue}
                      onValueChange={setDetailAgendaSelectValue}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="아젠다 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {agendas.map((agenda) => (
                          <SelectItem key={agenda.id} value={agenda.id}>
                            {agenda.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!detailAgendaSelectValue}
                      onClick={() => addAgendaToDetailForm(detailAgendaSelectValue)}
                    >
                      추가
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {detailForm.agendaIds.length > 0 ? (
                      detailForm.agendaIds.map((agendaId) => {
                        const agenda = agendas.find((item) => item.id === agendaId)
                        if (!agenda) return null
                        return (
                          <Badge key={agendaId} variant="outline" className="gap-1">
                            <span>{agenda.name}</span>
                            <button
                              type="button"
                              onClick={() => removeAgendaFromDetailForm(agendaId)}
                              className="rounded hover:bg-slate-200/70"
                              aria-label={`${agenda.name} 제거`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        )
                      })
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        선택된 아젠다가 없습니다.
                      </span>
                    )}
                  </div>
                </div>

              </div>

              <div className="flex justify-end items-center gap-2 pt-2">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsEditDialogOpen(false)
                      setEditingProgramId(null)
                    }}
                  >
                    닫기
                  </Button>
                  <Button type="button" onClick={handleSaveProgramDetail}>
                    저장
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-2">사업 정보를 불러오는 중입니다.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
