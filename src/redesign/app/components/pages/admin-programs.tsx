import { type FormEvent, useEffect, useMemo, useState } from "react"
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Eye,
  Loader2,
  Plus,
  Search,
  Target,
  Users,
  X,
  XCircle,
} from "lucide-react"
import { Agenda, Application, Program, ProgramKpiDefinition } from "@/redesign/app/lib/types"
import { getCompletedHoursByProgram } from "@/redesign/app/lib/program-metrics"
import { getCompanyIdsByProgram } from "@/lib/company-program-membership"
import { StatusChip } from "@/redesign/app/components/status-chip"
import { Badge } from "@/redesign/app/components/ui/badge"
import { Button } from "@/redesign/app/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/redesign/app/components/ui/card"
import { Checkbox } from "@/redesign/app/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/redesign/app/components/ui/dialog"
import { Input } from "@/redesign/app/components/ui/input"
import { Label } from "@/redesign/app/components/ui/label"
import { Progress } from "@/redesign/app/components/ui/progress"
import { Switch } from "@/redesign/app/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/redesign/app/components/ui/table"
import { Textarea } from "@/redesign/app/components/ui/textarea"
import { PaginationControls } from "@/redesign/app/components/ui/pagination-controls"

interface AdminProgramsProps {
  programs: Program[]
  applications: Application[]
  agendas: Agenda[]
  companies: { id: string; name: string; programs?: string[]; ownerUid?: string | null }[]
  onAddProgram: (data: Omit<Program, "id">) => void
  onUpdateProgram: (id: string, data: Partial<Program>) => Promise<boolean> | boolean
  onUpdateProgramCompanies: (id: string, companyIds: string[]) => Promise<boolean> | boolean
  viewMode?: "management" | "list"
  onNavigate?: (page: string) => void
}

type ProgramFormState = {
  name: string
  description: string
  internalTicketLimit: string
  externalTicketLimit: string
  companyLimit: string
  targetHours: string
  periodStart: string
  periodEnd: string
}

type ProgramStats = {
  program: Program
  completedHours: number
  totalSessions: number
  completedSessions: number
  pendingSessions: number
  confirmedSessions: number
  cancelledSessions: number
  uniqueCompanies: number
  achievementRate: number
}

type ProgramKpiDraft = ProgramKpiDefinition & {
  active: boolean
}

const PAGE_SIZE = 10

function createDefaultProgramForm(): ProgramFormState {
  return {
    name: "",
    description: "",
    internalTicketLimit: "0",
    externalTicketLimit: "0",
    companyLimit: "0",
    targetHours: "0",
    periodStart: "",
    periodEnd: "",
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

function buildLegacyProgramKpiDefinitionId(programId: string, label: string, index: number) {
  const normalizedLabel = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return normalizedLabel ? `${programId}__${normalizedLabel}` : `${programId}__kpi_${index + 1}`
}

function createProgramKpiDefinitionId(programId: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${programId}__kpi_${crypto.randomUUID()}`
  }

  return `${programId}__kpi_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function sanitizeProgramKpiDrafts(
  metrics: ProgramKpiDraft[],
): ProgramKpiDefinition[] {
  const seenIds = new Set<string>()

  return metrics
    .map((metric) => {
      const label = metric.label.trim()
      const rawId = metric.id.trim()
      return {
        id: rawId,
        label,
        description: metric.description.trim(),
        active: metric.active !== false,
      }
    })
    .filter((metric) => metric.label)
    .filter((metric) => {
      if (seenIds.has(metric.id)) return false
      seenIds.add(metric.id)
      return true
    })
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
    companyLimit: String(program.companyLimit ?? 0),
    targetHours: String(program.targetHours),
    periodStart: program.periodStart ?? "",
    periodEnd: program.periodEnd ?? "",
  }
}

export function AdminPrograms({
  programs,
  applications,
  agendas,
  companies,
  onAddProgram,
  onUpdateProgram,
  onUpdateProgramCompanies,
  viewMode = "management",
  onNavigate,
}: AdminProgramsProps) {
  const isManagementMode = viewMode === "management"

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [form, setForm] = useState<ProgramFormState>(() => createDefaultProgramForm())
  const [detailForm, setDetailForm] = useState<ProgramFormState>(() => createDefaultProgramForm())
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null)
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null)
  const [editingCompanyIds, setEditingCompanyIds] = useState<string[]>([])
  const [companySearch, setCompanySearch] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [companyUpdateSaving, setCompanyUpdateSaving] = useState(false)
  const [selectedAvailableIds, setSelectedAvailableIds] = useState<string[]>([])
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([])
  const [programKpiDrafts, setProgramKpiDrafts] = useState<Record<string, ProgramKpiDraft[]>>({})
  const [page, setPage] = useState(1)
  const [programDetailSaving, setProgramDetailSaving] = useState(false)

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

  const companyIdsByProgram = useMemo(() => {
    const map = new Map<string, string[]>()

    programs.forEach((program) => {
      map.set(program.id, getCompanyIdsByProgram(companies, program.id))
    })

    return map
  }, [companies, programs])

  const completedHoursByProgram = useMemo(
    () => getCompletedHoursByProgram(applications),
    [applications],
  )

  const programStats = useMemo<ProgramStats[]>(() => {
    return programs.map((program) => {
      const programApplications = applicationsByProgram.get(program.id) ?? []
      const completedHours = completedHoursByProgram.get(program.id) ?? 0
      const companySet = new Set(
        programApplications.map((app) => app.companyName?.trim() || "미지정 회사"),
      )

      const completedSessions = programApplications.filter(
        (app) => app.status === "completed",
      ).length
      const pendingSessions = programApplications.filter(
        (app) => app.status === "pending" || app.status === "review",
      ).length
      const confirmedSessions = programApplications.filter(
        (app) => app.status === "confirmed",
      ).length
      const cancelledSessions = programApplications.filter(
        (app) => app.status === "cancelled",
      ).length

      const mappedCompanyIds = companyIdsByProgram.get(program.id) ?? []
      const mappedCompanies =
        mappedCompanyIds.length > 0 ? mappedCompanyIds.length : companySet.size
      return {
        program,
        completedHours,
        totalSessions: programApplications.length,
        completedSessions,
        pendingSessions,
        confirmedSessions,
        cancelledSessions,
        uniqueCompanies: mappedCompanies,
        achievementRate: getProgressRate(completedHours, program.targetHours),
      }
    })
  }, [applicationsByProgram, companyIdsByProgram, completedHoursByProgram, programs])

  const summaryStats = useMemo(() => {
    const totalPrograms = programs.length
    const totalTargetHours = programs.reduce((sum, program) => sum + (program.targetHours || 0), 0)
    const totalCompletedHours = programStats.reduce((sum, item) => sum + item.completedHours, 0)
    const avgAchievement =
      totalPrograms === 0
        ? 0
        : Math.round(
            programStats.reduce((sum, item) => sum + item.achievementRate, 0) / totalPrograms,
          )
    return {
      totalPrograms,
      totalTargetHours,
      totalCompletedHours,
      avgAchievement,
    }
  }, [programStats, programs])

  const selectedProgram = useMemo(
    () => programs.find((program) => program.id === selectedProgramId) ?? null,
    [programs, selectedProgramId],
  )

  const selectedStats = useMemo(
    () => programStats.find((item) => item.program.id === selectedProgramId) ?? null,
    [programStats, selectedProgramId],
  )

  const selectedApplications = useMemo(() => {
    if (!selectedProgram) return []

    const items = applicationsByProgram.get(selectedProgram.id) ?? []
    return [...items].sort((a, b) => getTimeValue(b.createdAt) - getTimeValue(a.createdAt))
  }, [applicationsByProgram, selectedProgram])

  const filteredProgramStats = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    if (!normalizedQuery) return programStats

    return programStats.filter((item) => item.program.name.toLowerCase().includes(normalizedQuery))
  }, [programStats, searchQuery])

  const paginatedProgramStats = useMemo(() => {
    const startIndex = (page - 1) * PAGE_SIZE
    return filteredProgramStats.slice(startIndex, startIndex + PAGE_SIZE)
  }, [filteredProgramStats, page])

  const editingProgram = useMemo(
    () => programs.find((program) => program.id === editingProgramId) ?? null,
    [editingProgramId, programs],
  )
  const sortedCompanies = useMemo(
    () => [...companies].sort((a, b) => a.name.localeCompare(b.name)),
    [companies],
  )
  const companyById = useMemo(
    () => new Map(sortedCompanies.map((company) => [company.id, company])),
    [sortedCompanies],
  )
  const companySearchQuery = companySearch.trim().toLowerCase()
  const editingProgramCompanyIds = useMemo(() => {
    if (!editingProgram) return []
    return companyIdsByProgram.get(editingProgram.id) ?? []
  }, [companyIdsByProgram, editingProgram])
  const selectedCompanies = useMemo(() => {
    if (!editingProgram) return []
    return editingCompanyIds.map((id) => companyById.get(id) || { id, name: "회사명 미입력" })
  }, [companyById, editingCompanyIds, editingProgram])
  const editingCompanyLimit = numberFromInput(detailForm.companyLimit)
  const availableCompanies = useMemo(() => {
    if (!editingProgram) return []
    const currentIds = new Set(editingCompanyIds)
    return sortedCompanies.filter((company) => {
      if (currentIds.has(company.id)) return false
      if (!companySearchQuery) return true
      return company.name.toLowerCase().includes(companySearchQuery)
    })
  }, [companySearchQuery, editingCompanyIds, editingProgram, sortedCompanies])

  useEffect(() => {
    const next = Object.fromEntries(
      programs.map((program) => [
        program.id,
        (program.kpiDefinitions ?? []).map((definition, index) => ({
          ...definition,
          id:
            definition.id?.trim() ||
            buildLegacyProgramKpiDefinitionId(program.id, definition.label ?? "", index),
          active: definition.active !== false,
        })),
      ]),
    )
    setProgramKpiDrafts(next)
  }, [programs])

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
      setEditingCompanyIds([])
      setSelectedAvailableIds([])
      setSelectedCompanyIds([])
      return
    }
    const nextForm = toProgramForm(editingProgram)
    setDetailForm(nextForm)
    setEditingCompanyIds(editingProgramCompanyIds)
    setSelectedAvailableIds([])
    setSelectedCompanyIds([])
  }, [editingProgram, editingProgramCompanyIds])

  async function updateEditingProgramCompanies(nextCompanyIds: string[]) {
    if (!editingProgram) return
    setCompanyUpdateSaving(true)
    try {
      const ok = await Promise.resolve(onUpdateProgramCompanies(editingProgram.id, nextCompanyIds))
      if (ok === false) return
      setEditingCompanyIds(nextCompanyIds)
      setSelectedAvailableIds([])
      setSelectedCompanyIds([])
    } finally {
      setCompanyUpdateSaving(false)
    }
  }

  useEffect(() => {
    setPage(1)
  }, [programs.length, searchQuery])

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredProgramStats.length / PAGE_SIZE))
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [filteredProgramStats.length, page])

  const selectedProgramKpis = useMemo(
    () => (selectedProgram ? (programKpiDrafts[selectedProgram.id] ?? []) : []),
    [programKpiDrafts, selectedProgram],
  )

  const editingProgramKpis = useMemo(
    () => (editingProgram ? (programKpiDrafts[editingProgram.id] ?? []) : []),
    [editingProgram, programKpiDrafts],
  )

  function updateProgramKpiDraft(
    programId: string,
    metricId: string,
    patch: Partial<ProgramKpiDraft>,
  ) {
    setProgramKpiDrafts((prev) => ({
      ...prev,
      [programId]: (prev[programId] ?? []).map((metric) =>
        metric.id === metricId ? { ...metric, ...patch } : metric,
      ),
    }))
  }

  function addProgramKpiDraft(programId: string) {
    setProgramKpiDrafts((prev) => {
      const current = prev[programId] ?? []
      const nextMetric: ProgramKpiDraft = {
        id: createProgramKpiDefinitionId(programId),
        label: "",
        description: "",
        active: true,
      }

      return {
        ...prev,
        [programId]: [...current, nextMetric],
      }
    })
  }

  function removeProgramKpiDraft(programId: string, metricId: string) {
    setProgramKpiDrafts((prev) => ({
      ...prev,
      [programId]: (prev[programId] ?? []).map((metric) =>
        metric.id === metricId ? { ...metric, active: false } : metric,
      ),
    }))
  }

  function restoreProgramKpiDraft(programId: string, metricId: string) {
    setProgramKpiDrafts((prev) => ({
      ...prev,
      [programId]: (prev[programId] ?? []).map((metric) =>
        metric.id === metricId ? { ...metric, active: true } : metric,
      ),
    }))
  }

  function renderProgramKpiDrafts(programId: string, metrics: ProgramKpiDraft[]) {
    return (
      <div>
        {metrics.length === 0 ? (
          <div className="max-w-3xl rounded-md border border-dashed bg-slate-50 px-3 py-4 text-sm text-muted-foreground">
            아직 설정된 KPI가 없습니다.
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <div className="max-w-3xl space-y-1.5 pr-3">
              {metrics.map((metric, index) => (
                <div
                  key={metric.id}
                  className={
                    metric.active === false
                      ? "rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2"
                      : "rounded-lg border border-slate-200 bg-white px-3 py-2"
                  }
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        metric.active === false
                          ? "h-7 shrink-0 border-slate-200 bg-white px-2 text-[11px] text-slate-400"
                          : "h-7 shrink-0 border-slate-200 bg-slate-50 px-2 text-[11px] text-slate-600"
                      }
                    >
                      KPI {index + 1}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <Label htmlFor={`${programId}-${metric.id}-label`} className="sr-only">
                        KPI 이름
                      </Label>
                      <Input
                        id={`${programId}-${metric.id}-label`}
                        value={metric.label}
                        onChange={(event) =>
                          updateProgramKpiDraft(programId, metric.id, {
                            label: event.target.value,
                          })
                        }
                        placeholder="예: 투자 유치 건수"
                        className={metric.active === false ? "h-8 border-slate-200 bg-white/70 text-slate-400" : "h-8"}
                        disabled={programDetailSaving || metric.active === false}
                      />
                    </div>
                    <div className="flex shrink-0 items-center gap-2 pl-1">
                      <span
                        className={
                          metric.active === false
                            ? "w-10 text-right text-xs font-medium text-slate-400"
                            : "w-10 text-right text-xs font-medium text-slate-600"
                        }
                      >
                        {metric.active === false ? "비활성" : "활성"}
                      </span>
                      <Switch
                        checked={metric.active !== false}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            restoreProgramKpiDraft(programId, metric.id)
                            return
                          }
                          removeProgramKpiDraft(programId, metric.id)
                        }}
                        aria-label={`KPI ${index + 1} ${metric.active === false ? "활성화" : "비활성화"}`}
                        disabled={programDetailSaving}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  function handleSubmitProgram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = form.name.trim()
    if (!name) return

    const targetHours = numberFromInput(form.targetHours)
    const internalTicketLimit = numberFromInput(form.internalTicketLimit)
    const externalTicketLimit = numberFromInput(form.externalTicketLimit)
    const companyLimit = numberFromInput(form.companyLimit)
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
      companyLimit,
      companyIds: [],
      periodStart: form.periodStart || undefined,
      periodEnd: form.periodEnd || undefined,
      weekdays: ["TUE", "THU"],
    })

    setForm(createDefaultProgramForm())
    setIsAddDialogOpen(false)
  }

  async function handleSaveProgramDetail() {
    if (!editingProgram) return

    const name = detailForm.name.trim()
    if (!name) return

    const targetHours = numberFromInput(detailForm.targetHours)
    const internalTicketLimit = numberFromInput(detailForm.internalTicketLimit)
    const externalTicketLimit = numberFromInput(detailForm.externalTicketLimit)
    const companyLimit = numberFromInput(detailForm.companyLimit)
    const maxApplications = internalTicketLimit + externalTicketLimit

    setProgramDetailSaving(true)
    try {
      const ok = await Promise.resolve(
        onUpdateProgram(editingProgram.id, {
          name,
          description: detailForm.description.trim() || `${name} 사업`,
          targetHours,
          internalTicketLimit,
          externalTicketLimit,
          maxApplications,
          usedApplications: Math.min(editingProgram.usedApplications, maxApplications),
          companyLimit,
          periodStart: detailForm.periodStart || undefined,
          periodEnd: detailForm.periodEnd || undefined,
          kpiDefinitions: sanitizeProgramKpiDrafts(programKpiDrafts[editingProgram.id] ?? []),
        }),
      )

      if (ok === false) {
        return
      }

      setIsEditDialogOpen(false)
      setEditingProgramId(null)
    } finally {
      setProgramDetailSaving(false)
    }
  }

  function openEditDialog(programId: string) {
    setEditingProgramId(programId)
    setIsEditDialogOpen(true)
  }

  async function removeCompanyFromProgram(companyId: string) {
    if (!editingProgram) return
    const currentIds = editingCompanyIds
    const nextCompanyIds = currentIds.filter((id) => id !== companyId)
    await updateEditingProgramCompanies(nextCompanyIds)
  }

  async function addSelectedCompanies() {
    if (!editingProgram) return
    if (selectedAvailableIds.length === 0) return
    const currentIds = editingCompanyIds
    const nextCompanyIds = Array.from(new Set([...currentIds, ...selectedAvailableIds]))
    await updateEditingProgramCompanies(nextCompanyIds)
  }

  async function removeSelectedCompanies() {
    if (!editingProgram) return
    if (selectedCompanyIds.length === 0) return
    const currentIds = editingCompanyIds
    const removalSet = new Set(selectedCompanyIds)
    const nextCompanyIds = currentIds.filter((id) => !removalSet.has(id))
    await updateEditingProgramCompanies(nextCompanyIds)
  }

  const pageTitle = isManagementMode ? "사업 관리" : "사업별 프로그램"
  const pageDescription = isManagementMode
    ? "사업 목록을 관리하고, 상세보기에서 사업 정보를 수정할 수 있습니다."
    : "사업명, 시수 진행률, 신청 횟수를 확인하고 사업을 클릭해 신청내역과 상세 통계를 볼 수 있습니다."
  const pageTitleClassName = "text-2xl font-semibold text-slate-900"
  const pageDescriptionClassName = "mt-1 text-sm text-slate-500"

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <div className="shrink-0 border-b bg-white px-6 py-5">
        <div className="mx-auto flex w-full max-w-[1600px] items-start justify-between gap-4">
          <div>
            <h1 className={pageTitleClassName}>{pageTitle}</h1>
            <p className={pageDescriptionClassName}>{pageDescription}</p>
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
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-6 pb-6 pt-5">
        <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col">
          {isManagementMode ? (
            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
              <CardHeader className="shrink-0 border-b bg-white">
                <div className="relative w-full sm:w-[320px]">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="사업명으로 검색"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="pl-9"
                  />
                </div>
              </CardHeader>
              <div className="min-h-0 flex-1 overflow-auto">
                <Table>
                  <TableHeader className="[&_tr]:sticky [&_tr]:top-0 [&_tr]:z-10 [&_tr]:bg-white">
                    <TableRow className="hover:bg-white">
                      <TableHead className="bg-white">사업명</TableHead>
                      <TableHead className="bg-white">기간</TableHead>
                      <TableHead className="bg-white">시수 진행률</TableHead>
                      <TableHead className="bg-white">신청 횟수</TableHead>
                      <TableHead className="bg-white text-right">작업</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProgramStats.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="h-24 text-center text-sm text-muted-foreground"
                        >
                          {searchQuery.trim() ? "검색 결과가 없습니다." : "등록된 사업이 없습니다."}
                        </TableCell>
                      </TableRow>
                    )}

                    {paginatedProgramStats.map((item) => (
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
                              {item.completedHours}h / {item.program.targetHours}h
                            </div>
                            <Progress
                              value={item.achievementRate}
                              className="h-1.5 bg-slate-100"
                              indicatorClassName="bg-slate-500"
                            />
                            <div className="text-xs font-medium">{item.achievementRate}%</div>
                          </div>
                        </TableCell>
                        <TableCell>{item.totalSessions}건</TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                            onClick={() => openEditDialog(item.program.id)}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            상세보기
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="shrink-0 border-t bg-white px-4 py-3">
                <PaginationControls
                  page={page}
                  pageSize={PAGE_SIZE}
                  totalItems={filteredProgramStats.length}
                  onPageChange={setPage}
                  alwaysShow
                />
              </div>
            </Card>
          ) : (
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1 pb-6">
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
                  <CardDescription>사업별 진행률과 신청 현황을 카드로 확인하세요.</CardDescription>
                </CardHeader>
                <CardContent>
                  {programStats.length === 0 ? (
                    <div className="flex h-24 items-center justify-center text-center text-sm text-muted-foreground">
                      등록된 사업이 없습니다.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {programStats.map((item) => {
                        const isSelected = selectedProgramId === item.program.id
                        const pendingCount = item.pendingSessions + item.confirmedSessions
                        const statusChips = [
                          {
                            label: `완료 ${item.completedSessions}건`,
                            variant: "border-slate-200 text-slate-700",
                          },
                          {
                            label: `진행중 ${pendingCount}건`,
                            variant: "border-amber-200 bg-amber-50/80 text-amber-700",
                          },
                          {
                            label: `취소 ${item.cancelledSessions}건`,
                            variant: "border-rose-200 bg-rose-50/80 text-rose-600",
                          },
                        ]
                        return (
                          <button
                            key={item.program.id}
                            type="button"
                            onClick={() => setSelectedProgramId(item.program.id)}
                            className={`text-left rounded-xl border px-4 py-3 transition-shadow ${
                              isSelected ? "ring-2 ring-blue-200 shadow-md" : "hover:shadow-md"
                            }`}
                            style={{
                              borderColor: item.program.color,
                              background: `linear-gradient(135deg, ${item.program.color}14 0%, #ffffff 55%)`,
                            }}
                          >
                            <div className="flex flex-col gap-2">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="inline-block h-2.5 w-2.5 rounded-full"
                                      style={{ backgroundColor: item.program.color }}
                                    />
                                    <span className="text-sm font-semibold text-slate-900 truncate">
                                      {item.program.name}
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                    {prettyDateRange(
                                      item.program.periodStart,
                                      item.program.periodEnd,
                                    )}
                                  </p>
                                </div>
                                <Badge variant="outline" className="shrink-0 whitespace-nowrap">
                                  {item.totalSessions}건
                                </Badge>
                              </div>

                              <div className="flex flex-wrap gap-2 text-xs font-medium">
                                {statusChips.map((chip) => (
                                  <span
                                    key={chip.label}
                                    className={`rounded-full border px-2 py-1 whitespace-nowrap bg-white/80 text-[0.65rem] font-medium ${chip.variant}`}
                                  >
                                    {chip.label}
                                  </span>
                                ))}
                              </div>

                              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                                <span className="truncate">
                                  {item.completedHours}h / {item.program.targetHours}h
                                </span>
                                <span className="text-sm font-semibold text-slate-900 whitespace-nowrap">
                                  달성률 {item.achievementRate}%
                                </span>
                              </div>

                              <Progress value={item.achievementRate} className="h-1.5" />
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
                          <div className="text-lg font-semibold mt-1">
                            {selectedStats.totalSessions}건
                          </div>
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
                          <div className="text-lg font-semibold mt-1">
                            {selectedStats.uniqueCompanies}개사
                            {selectedProgram.companyLimit && selectedProgram.companyLimit > 0
                              ? ` / ${selectedProgram.companyLimit}개`
                              : ""}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border p-4 space-y-2">
                        <div className="text-sm font-medium flex items-center gap-1">
                          <Target className="w-4 h-4" />
                          시수 진행률
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {selectedStats.completedHours}h / {selectedProgram.targetHours}h (
                          {selectedStats.achievementRate}%)
                        </div>
                        <Progress value={selectedStats.achievementRate} className="h-2" />
                        <p className="text-xs text-muted-foreground">
                          기간:{" "}
                          {prettyDateRange(selectedProgram.periodStart, selectedProgram.periodEnd)}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm font-medium mb-2">적용 아젠다 (활성)</div>
                          <div className="flex flex-wrap gap-1.5">
                            {agendas.filter((agenda) => agenda.active !== false).length > 0 ? (
                              agendas
                                .filter((agenda) => agenda.active !== false)
                                .map((agenda) => (
                                  <Badge key={agenda.id} variant="outline">
                                    {agenda.name}
                                  </Badge>
                                ))
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                활성 아젠다가 없습니다.
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-medium text-slate-900">정량 KPI</div>
                              <Badge
                                variant="outline"
                                className="border-slate-200 bg-white text-slate-600"
                              >
                                {selectedProgramKpis.length}개
                              </Badge>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => addProgramKpiDraft(selectedProgram.id)}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            추가
                          </Button>
                        </div>

                        <div className="mt-4">
                          {renderProgramKpiDrafts(selectedProgram.id, selectedProgramKpis)}
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

                    <CardContent className="p-0 overflow-auto max-h-[48vh]">
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
                              <TableCell>
                                {application.agenda || application.officeHourTitle}
                              </TableCell>
                              <TableCell>{application.consultant}</TableCell>
                              <TableCell>
                                {formatScheduleLabel(
                                  application.scheduledDate,
                                  application.scheduledTime,
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
            </div>
          )}
        </div>
      </div>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden p-0 sm:max-w-5xl">
          <DialogHeader className="shrink-0 border-b px-8 py-6 pr-14">
            <DialogTitle>사업 생성</DialogTitle>
          </DialogHeader>

          <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmitProgram}>
            <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
              <div className="space-y-6">
                <section className="rounded-2xl border border-slate-200 bg-white shadow-xs">
                  <div className="border-b border-slate-200 px-6 py-4">
                    <div className="text-sm font-semibold text-slate-900">기본 정보</div>
                    <p className="mt-1 text-xs text-slate-500">
                      사업명, 설명, 운영 기간을 입력합니다.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-6 px-6 py-5 md:grid-cols-2">
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

                    <div className="space-y-2">
                      <Label>사업 설명</Label>
                      <Textarea
                        rows={4}
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
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white shadow-xs">
                  <div className="border-b border-slate-200 px-6 py-4">
                    <div className="text-sm font-semibold text-slate-900">운영 설정</div>
                    <p className="mt-1 text-xs text-slate-500">
                      티켓 수, 참여기업 정원, 목표 시수를 설정합니다.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-6 px-6 py-5 md:grid-cols-2 xl:grid-cols-4">
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
                      <Label>참여 기업 수</Label>
                      <Input
                        inputMode="numeric"
                        value={form.companyLimit}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            companyLimit: event.target.value.replace(/[^\d]/g, ""),
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
                </section>
              </div>
            </div>

            <div className="shrink-0 border-t px-8 py-4">
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  취소
                </Button>
                <Button type="submit">생성하기</Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          if (!open && programDetailSaving) {
            return
          }
          setIsEditDialogOpen(open)
          if (!open) {
            setEditingProgramId(null)
          }
        }}
      >
        <DialogContent
          className="flex max-h-[92vh] flex-col overflow-hidden p-0 sm:max-w-5xl"
          onEscapeKeyDown={(event) => {
            if (programDetailSaving) {
              event.preventDefault()
            }
          }}
          onPointerDownOutside={(event) => {
            if (programDetailSaving) {
              event.preventDefault()
            }
          }}
          onInteractOutside={(event) => {
            if (programDetailSaving) {
              event.preventDefault()
            }
          }}
        >
          <DialogHeader className="shrink-0 border-b px-8 py-6 pr-14">
            <DialogTitle>사업 상세보기 / 수정</DialogTitle>
          </DialogHeader>

          {editingProgram ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
                <div className="space-y-6">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                      <div className="text-[11px] font-medium text-slate-500">사업명</div>
                      <div className="mt-1 truncate text-sm font-semibold text-slate-900">
                        {editingProgram.name}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                      <div className="text-[11px] font-medium text-slate-500">운영 기간</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">
                        {prettyDateRange(editingProgram.periodStart, editingProgram.periodEnd)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
                      <div className="text-[11px] font-medium text-emerald-700">참여 기업</div>
                      <div className="mt-1 text-sm font-semibold text-emerald-900">
                        {selectedCompanies.length}개
                        {editingCompanyLimit > 0 ? ` / ${editingCompanyLimit}개` : ""}
                      </div>
                    </div>
                    <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3">
                      <div className="text-[11px] font-medium text-blue-700">목표 시수</div>
                      <div className="mt-1 text-sm font-semibold text-blue-900">
                        {numberFromInput(detailForm.targetHours)}h
                      </div>
                    </div>
                  </div>

                  <section className="rounded-2xl border border-slate-200 bg-white shadow-xs">
                    <div className="border-b border-slate-200 px-6 py-4">
                      <div className="text-sm font-semibold text-slate-900">기본 정보</div>
                      <p className="mt-1 text-xs text-slate-500">
                        사업명과 설명, 운영 기간을 함께 관리합니다.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-6 px-6 py-5 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>사업명</Label>
                      <Input
                        value={detailForm.name}
                        onChange={(event) =>
                          setDetailForm((prev) => ({ ...prev, name: event.target.value }))
                        }
                        required
                        disabled={programDetailSaving}
                      />
                      </div>

                      <div className="space-y-2">
                        <Label>사업 설명</Label>
                      <Textarea
                        rows={4}
                        value={detailForm.description}
                        onChange={(event) =>
                          setDetailForm((prev) => ({ ...prev, description: event.target.value }))
                        }
                        disabled={programDetailSaving}
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
                        disabled={programDetailSaving}
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
                        disabled={programDetailSaving}
                      />
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-slate-200 bg-white shadow-xs">
                    <div className="border-b border-slate-200 px-6 py-4">
                      <div className="text-sm font-semibold text-slate-900">운영 설정</div>
                      <p className="mt-1 text-xs text-slate-500">
                        티켓 수, 참여기업 정원, 목표 시수를 설정합니다.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-6 px-6 py-5 md:grid-cols-2 xl:grid-cols-4">
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
                          disabled={programDetailSaving}
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
                          disabled={programDetailSaving}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>참여 기업 수</Label>
                        <Input
                          inputMode="numeric"
                          value={detailForm.companyLimit}
                          onChange={(event) =>
                            setDetailForm((prev) => ({
                              ...prev,
                              companyLimit: event.target.value.replace(/[^\d]/g, ""),
                            }))
                          }
                          disabled={programDetailSaving}
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
                          disabled={programDetailSaving}
                        />
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-slate-200 bg-white shadow-xs">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        정량 KPI
                        <Badge
                          variant="outline"
                          className="border-slate-200 bg-white text-slate-600"
                        >
                          {editingProgramKpis.length}개
                        </Badge>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addProgramKpiDraft(editingProgram.id)}
                        disabled={programDetailSaving}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        추가
                      </Button>
                    </div>
                    <div className="px-6 py-5">
                      {renderProgramKpiDrafts(editingProgram.id, editingProgramKpis)}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-slate-200 bg-white shadow-xs">
                    <div className="border-b border-slate-200 px-6 py-4">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                          <Users className="h-4 w-4 text-slate-500" />
                          참여 기업 관리
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          검색 후 선택한 기업을 현재 사업에 배정하거나 제외합니다.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-5 px-6 py-5">
                      <div className="space-y-2">
                        <Label>참여 기업 검색</Label>
                        <Input
                          value={companySearch}
                          onChange={(event) => setCompanySearch(event.target.value)}
                          placeholder="회사명을 입력하세요"
                          disabled={programDetailSaving}
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                        <div className="min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/60">
                          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">
                                선택 가능 기업
                              </div>
                              <p className="mt-0.5 text-xs text-slate-500">
                                아직 이 사업에 배정되지 않은 기업입니다.
                              </p>
                            </div>
                            <Badge
                              variant="outline"
                              className="border-slate-200 bg-white text-slate-600"
                            >
                              {availableCompanies.length}개
                            </Badge>
                          </div>
                          <div className="h-[360px] overflow-y-auto bg-white">
                            {availableCompanies.length === 0 ? (
                              <div className="flex h-full items-center justify-center p-4 text-center text-sm text-slate-500">
                                추가 가능한 기업이 없습니다.
                              </div>
                            ) : (
                              availableCompanies.map((company) => {
                                const checked = selectedAvailableIds.includes(company.id)
                                return (
                                  <label
                                    key={company.id}
                                    className="flex cursor-pointer items-center gap-3 border-b border-slate-200/70 px-4 py-3 hover:bg-slate-50/80"
                                  >
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={(nextChecked) => {
                                        setSelectedAvailableIds((prev) => {
                                          if (nextChecked) {
                                            return [...prev, company.id]
                                          }
                                          return prev.filter((id) => id !== company.id)
                                        })
                                      }}
                                      className="rounded-full border-slate-300 data-[state=checked]:border-slate-700 data-[state=checked]:bg-slate-700 focus-visible:ring-slate-200"
                                      disabled={programDetailSaving || companyUpdateSaving}
                                    />
                                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
                                      {company.name}
                                    </span>
                                  </label>
                                )
                              })
                            )}
                          </div>
                        </div>

                        <div className="flex flex-row items-center justify-center gap-2 xl:flex-col">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-10 min-w-12 rounded-full border-slate-200 bg-white px-4 text-slate-700 hover:bg-slate-50"
                            disabled={
                              programDetailSaving ||
                              companyUpdateSaving ||
                              selectedAvailableIds.length === 0 ||
                              (editingCompanyLimit > 0 &&
                                selectedCompanies.length >= editingCompanyLimit)
                            }
                            onClick={addSelectedCompanies}
                          >
                            →
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-10 min-w-12 rounded-full border-slate-200 bg-white px-4 text-slate-700 hover:bg-slate-50"
                            disabled={programDetailSaving || companyUpdateSaving || selectedCompanyIds.length === 0}
                            onClick={removeSelectedCompanies}
                          >
                            ←
                          </Button>
                        </div>

                        <div className="min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/60">
                          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">
                                참여 중 기업
                              </div>
                              <p className="mt-0.5 text-xs text-slate-500">
                                현재 사업에 연결된 기업입니다.
                              </p>
                            </div>
                            <Badge
                              variant="outline"
                              className="border-slate-200 bg-white text-slate-600"
                            >
                              {selectedCompanies.length}개
                            </Badge>
                          </div>
                          <div className="h-[360px] overflow-y-auto bg-white">
                            {selectedCompanies.length === 0 ? (
                              <div className="flex h-full items-center justify-center p-4 text-center text-sm text-slate-500">
                                아직 참여 기업이 없습니다.
                              </div>
                            ) : (
                              selectedCompanies.map((company) => {
                                const checked = selectedCompanyIds.includes(company.id)
                                return (
                                  <label
                                    key={company.id}
                                    className="flex cursor-pointer items-center gap-3 border-b border-slate-200/70 px-4 py-3 hover:bg-slate-50/80"
                                  >
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={(nextChecked) => {
                                        setSelectedCompanyIds((prev) => {
                                          if (nextChecked) {
                                            return [...prev, company.id]
                                          }
                                          return prev.filter((id) => id !== company.id)
                                        })
                                      }}
                                      className="rounded-full border-slate-300 data-[state=checked]:border-slate-700 data-[state=checked]:bg-slate-700 focus-visible:ring-slate-200"
                                      disabled={programDetailSaving || companyUpdateSaving}
                                    />
                                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
                                      {company.name}
                                    </span>
                                    <button
                                      type="button"
                                      disabled={programDetailSaving || companyUpdateSaving}
                                      onClick={() => void removeCompanyFromProgram(company.id)}
                                      className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                                      aria-label={`${company.name} 제거`}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </label>
                                )
                              })
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </div>

              <div className="shrink-0 border-t px-8 py-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-h-[20px] text-sm text-slate-500">
                    {programDetailSaving ? "저장 중입니다. 완료될 때까지 창이 유지됩니다." : "\u00A0"}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsEditDialogOpen(false)
                        setEditingProgramId(null)
                      }}
                      disabled={programDetailSaving}
                    >
                      닫기
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void handleSaveProgramDetail()}
                      disabled={programDetailSaving}
                    >
                      {programDetailSaving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      저장
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="px-8 py-6">
              <p className="text-sm text-muted-foreground">사업 정보를 불러오는 중입니다.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
