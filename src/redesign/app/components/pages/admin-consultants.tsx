import { useEffect, useMemo, useState } from "react"
import { Check, Clock3, Mail, Pencil, Phone, UserCog } from "lucide-react"
import { Agenda, Consultant, ConsultantAvailability } from "@/redesign/app/lib/types"
import { Badge } from "@/redesign/app/components/ui/badge"
import { Button } from "@/redesign/app/components/ui/button"
import { Checkbox } from "@/redesign/app/components/ui/checkbox"
import { Card, CardContent } from "@/redesign/app/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/redesign/app/components/ui/dialog"
import { Input } from "@/redesign/app/components/ui/input"
import { Label } from "@/redesign/app/components/ui/label"
import { PaginationControls } from "@/redesign/app/components/ui/pagination-controls"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/redesign/app/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/redesign/app/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/redesign/app/components/ui/toggle-group"
import { cn } from "@/redesign/app/components/ui/utils"
import {
  buildDefaultConsultantAvailability,
  getConsultantScheduleDayNumbers,
  getMonthlyAvailabilityForMonth,
} from "@/redesign/app/lib/consultant-monthly-availability"
import * as regularOfficeHourPolicy from "@/redesign/app/lib/regular-office-hour-policy"

interface AdminConsultantsProps {
  consultants: Consultant[]
  agendas: Agenda[]
  onUpdateConsultant: (id: string, data: Partial<Consultant>) => Promise<void> | void
}

const PAGE_SIZE = 8

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-")
  return `${year}년 ${Number(month)}월`
}

export function AdminConsultants({
  consultants,
  agendas,
  onUpdateConsultant,
}: AdminConsultantsProps) {
  const pageTitleClassName = "text-2xl font-semibold text-slate-900"
  const pageDescriptionClassName = "mt-1 text-sm text-slate-500"
  const [selectedConsultantId, setSelectedConsultantId] = useState<string | null>(null)
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false)
  const [isAgendaMapDialogOpen, setIsAgendaMapDialogOpen] = useState(false)
  const [draftAgendaIds, setDraftAgendaIds] = useState<string[] | null>(null)
  const [agendaSearch, setAgendaSearch] = useState("")
  const [selectedAvailableAgendaIds, setSelectedAvailableAgendaIds] = useState<string[]>([])
  const [selectedAssignedAgendaIds, setSelectedAssignedAgendaIds] = useState<string[]>([])
  const [draftScheduleAvailability, setDraftScheduleAvailability] = useState<
    ConsultantAvailability[] | null
  >(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [agendaFilter, setAgendaFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [meetingLinkDrafts, setMeetingLinkDrafts] = useState<Record<string, string>>({})
  const [editingMeetingLinkIds, setEditingMeetingLinkIds] = useState<string[]>([])
  const [savingMeetingLinkIds, setSavingMeetingLinkIds] = useState<string[]>([])
  const [selectedScheduleMonthKey, setSelectedScheduleMonthKey] = useState("")

  const selectedConsultant = useMemo(
    () => consultants.find((consultant) => consultant.id === selectedConsultantId) ?? null,
    [consultants, selectedConsultantId],
  )

  const consultantStats = useMemo(() => {
    const total = consultants.length
    const active = consultants.filter((item) => item.status === "active").length
    const withLink = consultants.filter((item) => item.fixedMeetingLink).length
    const mapped = consultants.filter((item) => (item.agendaIds ?? []).length > 0).length
    return { total, active, withLink, mapped }
  }, [consultants])

  const filteredConsultants = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    return consultants.filter((consultant) => {
      const matchesQuery =
        !normalizedQuery ||
        consultant.name.toLowerCase().includes(normalizedQuery) ||
        consultant.email.toLowerCase().includes(normalizedQuery) ||
        (consultant.organization ?? "").toLowerCase().includes(normalizedQuery)
      const matchesAgenda =
        agendaFilter === "all" || (consultant.agendaIds ?? []).includes(agendaFilter)
      return matchesQuery && matchesAgenda
    })
  }, [consultants, searchQuery, agendaFilter])
  const paginatedConsultants = useMemo(() => {
    const startIndex = (page - 1) * PAGE_SIZE
    return filteredConsultants.slice(startIndex, startIndex + PAGE_SIZE)
  }, [filteredConsultants, page])
  const scheduleTargetMonthKey = useMemo(
    () => regularOfficeHourPolicy.getNextMonthKey(new Date()),
    [],
  )
  const scheduleMonthOptions = useMemo(() => {
    const keys = new Set<string>([
      ...(selectedConsultant ? Object.keys(selectedConsultant.monthlyAvailability ?? {}) : []),
      scheduleTargetMonthKey,
    ].filter(Boolean))
    return Array.from(keys).sort((a, b) => b.localeCompare(a))
  }, [scheduleTargetMonthKey, selectedConsultant])
  const isScheduleEditable = useMemo(
    () =>
      Boolean(
        selectedScheduleMonthKey &&
          selectedScheduleMonthKey === scheduleTargetMonthKey &&
          regularOfficeHourPolicy.canConsultantEditMonthlyAvailability(
            selectedScheduleMonthKey,
            new Date(),
          ),
      ),
    [scheduleTargetMonthKey, selectedScheduleMonthKey],
  )
  const selectedScheduleDayNumbers = useMemo(
    () =>
      getConsultantScheduleDayNumbers({
        agendaIds: selectedConsultant?.agendaIds,
        agendas,
        scope: selectedConsultant?.scope,
      }),
    [agendas, selectedConsultant?.agendaIds, selectedConsultant?.scope],
  )
  const scheduleDays = useMemo(
    () =>
      selectedScheduleDayNumbers.map((value) => ({
        value,
        label: value === 2 ? "화" : value === 3 ? "수" : "목",
      })),
    [selectedScheduleDayNumbers],
  )

  const normalizedSelectedAvailability = useMemo(
    () =>
      selectedScheduleMonthKey
        ? getMonthlyAvailabilityForMonth(
            selectedConsultant?.monthlyAvailability,
            selectedScheduleMonthKey,
            selectedScheduleDayNumbers,
          )
        : buildDefaultConsultantAvailability(selectedScheduleDayNumbers),
    [selectedScheduleMonthKey, selectedConsultant?.monthlyAvailability, selectedScheduleDayNumbers],
  )
  const normalizedSelectedAgendaIds = useMemo(
    () => Array.from(new Set(selectedConsultant?.agendaIds ?? [])).sort(),
    [selectedConsultant?.agendaIds],
  )
  const agendaIdsForDialog = draftAgendaIds ?? normalizedSelectedAgendaIds
  const sortedAgendas = useMemo(
    () => [...agendas].sort((a, b) => a.name.localeCompare(b.name, "ko-KR")),
    [agendas],
  )
  const agendaSearchQuery = agendaSearch.trim().toLowerCase()
  const availableAgendas = useMemo(() => {
    const selectedIds = new Set(agendaIdsForDialog)
    return sortedAgendas.filter((agenda) => {
      if (selectedIds.has(agenda.id)) return false
      if (!agendaSearchQuery) return true
      return agenda.name.toLowerCase().includes(agendaSearchQuery)
    })
  }, [agendaIdsForDialog, agendaSearchQuery, sortedAgendas])
  const assignedAgendas = useMemo(
    () =>
      agendaIdsForDialog
        .map((agendaId) => agendas.find((agenda) => agenda.id === agendaId))
        .filter((agenda): agenda is Agenda => Boolean(agenda)),
    [agendaIdsForDialog, agendas],
  )
  const isAllAvailableAgendasSelected =
    availableAgendas.length > 0 && selectedAvailableAgendaIds.length === availableAgendas.length
  const isSomeAvailableAgendasSelected =
    selectedAvailableAgendaIds.length > 0 && selectedAvailableAgendaIds.length < availableAgendas.length
  const isAllAssignedAgendasSelected =
    assignedAgendas.length > 0 && selectedAssignedAgendaIds.length === assignedAgendas.length
  const isSomeAssignedAgendasSelected =
    selectedAssignedAgendaIds.length > 0 && selectedAssignedAgendaIds.length < assignedAgendas.length
  const isAgendaDirty =
    JSON.stringify(Array.from(new Set(agendaIdsForDialog)).sort()) !==
    JSON.stringify(normalizedSelectedAgendaIds)
  const scheduleAvailability = draftScheduleAvailability ?? normalizedSelectedAvailability
  const isScheduleDirty =
    JSON.stringify(scheduleAvailability) !== JSON.stringify(normalizedSelectedAvailability)

  useEffect(() => {
    setDraftScheduleAvailability(normalizedSelectedAvailability)
  }, [normalizedSelectedAvailability, selectedConsultant?.id, selectedScheduleMonthKey])

  useEffect(() => {
    setPage(1)
  }, [searchQuery, agendaFilter, consultants.length])

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredConsultants.length / PAGE_SIZE))
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [filteredConsultants.length, page])

  useEffect(() => {
    setMeetingLinkDrafts((prev) => {
      const next: Record<string, string> = {}
      consultants.forEach((consultant) => {
        next[consultant.id] = editingMeetingLinkIds.includes(consultant.id)
          ? prev[consultant.id] ?? consultant.fixedMeetingLink ?? ""
          : consultant.fixedMeetingLink ?? ""
      })
      return next
    })
  }, [consultants, editingMeetingLinkIds])

  useEffect(() => {
    if (!scheduleMonthOptions.includes(selectedScheduleMonthKey)) {
      setSelectedScheduleMonthKey(scheduleMonthOptions[0] ?? scheduleTargetMonthKey)
    }
  }, [scheduleMonthOptions, scheduleTargetMonthKey, selectedScheduleMonthKey])

  function toggleSlot(dayOfWeek: number, slotStart: string) {
    setDraftScheduleAvailability((prev) => {
      const base = prev ?? normalizedSelectedAvailability
      return base.map((day) => {
        if (day.dayOfWeek !== dayOfWeek) return day
        return {
          ...day,
          slots: day.slots.map((slot) =>
            slot.start === slotStart ? { ...slot, available: !slot.available } : slot,
          ),
        }
      })
    })
  }

  function handleSaveSchedule() {
    if (!selectedConsultant || !selectedScheduleMonthKey) return
    onUpdateConsultant(selectedConsultant.id, {
      monthlyAvailability: {
        ...(selectedConsultant.monthlyAvailability ?? {}),
        [selectedScheduleMonthKey]: scheduleAvailability,
      },
      monthlyAvailabilityMeta: {
        [selectedScheduleMonthKey]: {
          status: "submitted",
        },
      },
    })
    setIsScheduleDialogOpen(false)
    setDraftScheduleAvailability(null)
  }

  function toggleConsultantAgenda(agendaId: string, checked: boolean) {
    setDraftAgendaIds((prev) => {
      const base = prev ?? normalizedSelectedAgendaIds
      return checked ? [...new Set([...base, agendaId])] : base.filter((id) => id !== agendaId)
    })
  }

  function handleSaveAgendaMapping() {
    if (!selectedConsultant) return
    onUpdateConsultant(selectedConsultant.id, {
      agendaIds: Array.from(new Set(agendaIdsForDialog)).sort(),
    })
    setIsAgendaMapDialogOpen(false)
    setDraftAgendaIds(null)
  }

  function addSelectedAgendas() {
    if (selectedAvailableAgendaIds.length === 0) return
    setDraftAgendaIds((prev) => {
      const base = prev ?? normalizedSelectedAgendaIds
      return [...base, ...selectedAvailableAgendaIds.filter((agendaId) => !base.includes(agendaId))]
    })
    setSelectedAvailableAgendaIds([])
  }

  function removeSelectedAgendas() {
    if (selectedAssignedAgendaIds.length === 0) return
    setDraftAgendaIds((prev) => {
      const base = prev ?? normalizedSelectedAgendaIds
      const removalSet = new Set(selectedAssignedAgendaIds)
      return base.filter((agendaId) => !removalSet.has(agendaId))
    })
    setSelectedAssignedAgendaIds([])
  }

  async function commitMeetingLink(consultant: Consultant) {
    const nextValue = (meetingLinkDrafts[consultant.id] ?? "").trim()
    const currentValue = consultant.fixedMeetingLink?.trim() ?? ""
    if (nextValue === currentValue) return

    setSavingMeetingLinkIds((prev) => [...prev, consultant.id])
    try {
      await Promise.resolve(
        onUpdateConsultant(consultant.id, {
          fixedMeetingLink: nextValue,
        }),
      )
    } finally {
      setSavingMeetingLinkIds((prev) => prev.filter((id) => id !== consultant.id))
    }
  }

  function startMeetingLinkEdit(consultant: Consultant) {
    setMeetingLinkDrafts((prev) => ({
      ...prev,
      [consultant.id]: consultant.fixedMeetingLink ?? "",
    }))
    setEditingMeetingLinkIds((prev) =>
      prev.includes(consultant.id) ? prev : [...prev, consultant.id],
    )
  }

  async function finishMeetingLinkEdit(consultant: Consultant) {
    await commitMeetingLink(consultant)
    setEditingMeetingLinkIds((prev) => prev.filter((id) => id !== consultant.id))
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <div className="shrink-0 border-b border-slate-200/80 bg-white/80 px-8 py-4 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-[1600px]">
          <h1 className={pageTitleClassName}>컨설턴트 관리</h1>
          <p className={pageDescriptionClassName}>
            컨설턴트 프로필과 다음 달 정기 오피스아워 가능 시간을 관리합니다
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-5 px-8 py-6">
          <Card className="shrink-0">
            <CardContent className="p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="이름, 이메일, 소속 검색"
                    className="w-full md:w-64"
                  />
                  <Select value={agendaFilter} onValueChange={setAgendaFilter}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="아젠다 필터" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 아젠다</SelectItem>
                      {agendas.map((agenda) => (
                        <SelectItem key={agenda.id} value={agenda.id}>
                          {agenda.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-sm text-muted-foreground">
                  {filteredConsultants.length}명 / 전체 {consultants.length}명
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="shrink-0 flex flex-wrap gap-3">
            <Card className="w-[160px] sm:w-[176px]">
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">전체 컨설턴트</div>
                <div className="mt-1 text-xl font-bold">{consultantStats.total}</div>
              </CardContent>
            </Card>
            <Card className="w-[160px] sm:w-[176px]">
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">활성 컨설턴트</div>
                <div className="mt-1 text-xl font-bold text-emerald-600">
                  {consultantStats.active}
                </div>
              </CardContent>
            </Card>
            <Card className="w-[160px] sm:w-[176px]">
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">화상링크 등록</div>
                <div className="mt-1 text-xl font-bold">{consultantStats.withLink}</div>
              </CardContent>
            </Card>
            <Card className="w-[160px] sm:w-[176px]">
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">아젠다 매칭 완료</div>
                <div className="mt-1 text-xl font-bold text-blue-600">{consultantStats.mapped}</div>
              </CardContent>
            </Card>
          </div>

          <Card className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <CardContent className="min-h-0 flex-1 p-0">
              <div className="min-h-0 h-full overflow-auto">
                <Table className="min-w-[1240px]">
                  <TableHeader className="[&_tr]:sticky [&_tr]:top-0 [&_tr]:z-10 [&_tr]:bg-white">
                    <TableRow className="hover:bg-white">
                      <TableHead className="bg-white">컨설턴트</TableHead>
                      <TableHead className="bg-white">연락처</TableHead>
                      <TableHead className="bg-white">화상링크</TableHead>
                      <TableHead className="w-[148px] bg-white">구분</TableHead>
                      <TableHead className="bg-white">상태</TableHead>
                      <TableHead className="bg-white">아젠다</TableHead>
                      <TableHead className="bg-white text-right">관리</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredConsultants.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="h-24 text-center text-sm text-muted-foreground"
                        >
                          검색 결과가 없습니다.
                        </TableCell>
                      </TableRow>
                    )}
                    {paginatedConsultants.map((consultant) => {
                      const isEditingMeetingLink = editingMeetingLinkIds.includes(consultant.id)
                      const isSavingMeetingLink = savingMeetingLinkIds.includes(consultant.id)
                      const agendaLabels = (consultant.agendaIds ?? [])
                        .map((agendaId) => agendas.find((item) => item.id === agendaId)?.name)
                        .filter(Boolean) as string[]
                      const visibleAgendaLabels = agendaLabels.slice(0, 2)
                      const extraAgendaCount = agendaLabels.length - visibleAgendaLabels.length

                      return (
                        <TableRow key={consultant.id}>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{consultant.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {consultant.organization || "소속 미입력"}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground space-y-1">
                            <div className="flex items-center gap-2">
                              <Mail className="w-3.5 h-3.5" />
                              <span>{consultant.email}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Phone className="w-3.5 h-3.5" />
                              <span>{consultant.phone || "-"}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex min-w-[320px] items-center gap-2">
                              {isEditingMeetingLink ? (
                                <Input
                                  value={
                                    meetingLinkDrafts[consultant.id] ??
                                    consultant.fixedMeetingLink ??
                                    ""
                                  }
                                  onChange={(event) =>
                                    setMeetingLinkDrafts((prev) => ({
                                      ...prev,
                                      [consultant.id]: event.target.value,
                                    }))
                                  }
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault()
                                      void finishMeetingLinkEdit(consultant)
                                    }
                                  }}
                                  placeholder="https://zoom.us/j/..."
                                  disabled={isSavingMeetingLink}
                                  className="h-9"
                                />
                              ) : (
                                <span
                                  className="flex-1 truncate px-1 text-sm text-slate-600"
                                  title={consultant.fixedMeetingLink || "미입력"}
                                >
                                  {consultant.fixedMeetingLink || "미입력"}
                                </span>
                              )}
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 shrink-0"
                                disabled={isSavingMeetingLink}
                                loading={isSavingMeetingLink}
                                onClick={() => {
                                  if (isEditingMeetingLink) {
                                    void finishMeetingLinkEdit(consultant)
                                    return
                                  }
                                  startMeetingLinkEdit(consultant)
                                }}
                                aria-label={isEditingMeetingLink ? "화상링크 저장" : "화상링크 편집"}
                              >
                                {isEditingMeetingLink ? (
                                  <Check className="h-4 w-4" />
                                ) : (
                                  <Pencil className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <ToggleGroup
                              type="single"
                              value={consultant.scope}
                              variant="default"
                              size="sm"
                              className="grid w-[124px] grid-cols-2 overflow-hidden rounded-full border border-slate-200 bg-white p-0.5 shadow-none"
                              onValueChange={(value) => {
                                if (value !== "internal" && value !== "external") return
                                void Promise.resolve(
                                  onUpdateConsultant(consultant.id, {
                                    scope: value,
                                  }),
                                )
                              }}
                            >
                              <ToggleGroupItem
                                value="internal"
                                className="h-7 min-w-0 rounded-full border-0 px-0 text-[12px] font-medium text-slate-500 shadow-none first:rounded-full last:rounded-full hover:bg-slate-50 data-[state=on]:bg-amber-50 data-[state=on]:text-amber-700"
                              >
                                내부
                              </ToggleGroupItem>
                              <ToggleGroupItem
                                value="external"
                                className="h-7 min-w-0 rounded-full border-0 px-0 text-[12px] font-medium text-slate-500 shadow-none first:rounded-full last:rounded-full hover:bg-slate-50 data-[state=on]:bg-sky-50 data-[state=on]:text-sky-700"
                              >
                                외부
                              </ToggleGroupItem>
                            </ToggleGroup>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={
                                consultant.status === "active"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-slate-100 text-slate-600"
                              }
                            >
                              {consultant.status === "active" ? "활성" : "비활성"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1.5">
                              {visibleAgendaLabels.length > 0 ? (
                                <>
                                  {visibleAgendaLabels.map((label) => (
                                    <Badge
                                      key={label}
                                      variant="outline"
                                      className="border-slate-200 bg-slate-900/5 text-slate-900 font-medium"
                                    >
                                      {label}
                                    </Badge>
                                  ))}
                                  {extraAgendaCount > 0 && (
                                    <Badge
                                      variant="outline"
                                      className="border-slate-200 text-slate-500"
                                    >
                                      +{extraAgendaCount}
                                    </Badge>
                                  )}
                                </>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  연결된 아젠다가 없습니다.
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Dialog
                                open={
                                  isAgendaMapDialogOpen && selectedConsultantId === consultant.id
                                }
                                onOpenChange={(open) => {
                                  setIsAgendaMapDialogOpen(open)
                                  if (open) {
                                    setSelectedConsultantId(consultant.id)
                                    setDraftAgendaIds(
                                      Array.from(new Set(consultant.agendaIds ?? [])).sort(),
                                    )
                                    setAgendaSearch("")
                                    setSelectedAvailableAgendaIds([])
                                    setSelectedAssignedAgendaIds([])
                                  } else {
                                    setDraftAgendaIds(null)
                                    setAgendaSearch("")
                                    setSelectedAvailableAgendaIds([])
                                    setSelectedAssignedAgendaIds([])
                                  }
                                }}
                              >
                                <DialogTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedConsultantId(consultant.id)
                                      setDraftAgendaIds(
                                        Array.from(new Set(consultant.agendaIds ?? [])).sort(),
                                      )
                                      setAgendaSearch("")
                                      setSelectedAvailableAgendaIds([])
                                      setSelectedAssignedAgendaIds([])
                                    }}
                                  >
                                    아젠다 매칭
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-h-[90vh] w-[94vw] overflow-hidden sm:max-w-[980px]">
                                  <DialogHeader>
                                    <DialogTitle>{consultant.name} 아젠다 매칭</DialogTitle>
                                    <DialogDescription>
                                      이 컨설턴트가 담당 가능한 아젠다를 검색해서 추가하거나 제거합니다.
                                    </DialogDescription>
                                  </DialogHeader>

                                  <div className="space-y-4">
                                    <div className="space-y-2">
                                      <Input
                                        value={agendaSearch}
                                        onChange={(event) => setAgendaSearch(event.target.value)}
                                        placeholder="아젠다명을 입력하세요"
                                      />
                                    </div>

                                    <div className="grid justify-center grid-cols-[minmax(0,420px)_72px_minmax(0,420px)] gap-4">
                                      <div className="min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/60">
                                        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                                          <div className="text-sm font-semibold text-slate-900">
                                            선택 가능 아젠다
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <label className="flex items-center gap-2 whitespace-nowrap rounded-md px-2 py-1 text-xs text-slate-600">
                                              <Checkbox
                                                checked={
                                                  isAllAvailableAgendasSelected
                                                    ? true
                                                    : isSomeAvailableAgendasSelected
                                                      ? "indeterminate"
                                                      : false
                                                }
                                                onCheckedChange={(checked) => {
                                                  if (checked) {
                                                    setSelectedAvailableAgendaIds(
                                                      availableAgendas.map((agenda) => agenda.id),
                                                    )
                                                    return
                                                  }
                                                  setSelectedAvailableAgendaIds([])
                                                }}
                                                disabled={availableAgendas.length === 0}
                                                className="border-slate-300 data-[state=checked]:border-slate-700 data-[state=checked]:bg-slate-700"
                                              />
                                              전체 선택
                                            </label>
                                            <Badge
                                              variant="outline"
                                              className="border-slate-200 bg-white text-slate-600"
                                            >
                                              {availableAgendas.length}개
                                            </Badge>
                                          </div>
                                        </div>
                                        <div className="h-[320px] overflow-y-auto bg-white">
                                          {availableAgendas.length === 0 ? (
                                            <div className="flex h-full items-center justify-center p-4 text-center text-sm text-slate-500">
                                              추가 가능한 아젠다가 없습니다.
                                            </div>
                                          ) : (
                                            availableAgendas.map((agenda) => {
                                              const checked = selectedAvailableAgendaIds.includes(agenda.id)
                                              return (
                                                <label
                                                  key={agenda.id}
                                                  className="flex cursor-pointer items-center gap-3 border-b border-slate-200/70 px-4 py-2.5 hover:bg-slate-50/80"
                                                >
                                                  <Checkbox
                                                    checked={checked}
                                                    onCheckedChange={(nextChecked) => {
                                                      setSelectedAvailableAgendaIds((prev) => {
                                                        if (nextChecked) {
                                                          return [...prev, agenda.id]
                                                        }
                                                        return prev.filter((id) => id !== agenda.id)
                                                      })
                                                    }}
                                                    className="rounded-[4px] border-slate-300 data-[state=checked]:border-slate-700 data-[state=checked]:bg-slate-700 focus-visible:ring-slate-200"
                                                  />
                                                  <div className="flex min-w-0 flex-1 items-center gap-2">
                                                    <span className="truncate text-sm font-medium text-slate-700">
                                                      {agenda.name}
                                                    </span>
                                                    <Badge
                                                      variant="outline"
                                                      className={
                                                        agenda.scope === "internal"
                                                          ? "h-5 shrink-0 border-amber-200 bg-amber-50 px-1.5 text-[11px] text-amber-700"
                                                          : "h-5 shrink-0 border-rose-200 bg-rose-50 px-1.5 text-[11px] text-rose-700"
                                                      }
                                                    >
                                                      {agenda.scope === "internal" ? "내부" : "외부"}
                                                    </Badge>
                                                  </div>
                                                </label>
                                              )
                                            })
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex flex-row items-center justify-center gap-2 md:flex-col">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          className="h-10 min-w-12 rounded-full border-slate-200 bg-white px-4 text-slate-700 hover:bg-slate-50"
                                          disabled={selectedAvailableAgendaIds.length === 0}
                                          onClick={addSelectedAgendas}
                                        >
                                          →
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          className="h-10 min-w-12 rounded-full border-slate-200 bg-white px-4 text-slate-700 hover:bg-slate-50"
                                          disabled={selectedAssignedAgendaIds.length === 0}
                                          onClick={removeSelectedAgendas}
                                        >
                                          ←
                                        </Button>
                                      </div>

                                      <div className="min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/60">
                                        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                                          <div className="text-sm font-semibold text-slate-900">
                                            선택된 아젠다
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <label className="flex items-center gap-2 whitespace-nowrap rounded-md px-2 py-1 text-xs text-slate-600">
                                              <Checkbox
                                                checked={
                                                  isAllAssignedAgendasSelected
                                                    ? true
                                                    : isSomeAssignedAgendasSelected
                                                      ? "indeterminate"
                                                      : false
                                                }
                                                onCheckedChange={(checked) => {
                                                  if (checked) {
                                                    setSelectedAssignedAgendaIds(
                                                      assignedAgendas.map((agenda) => agenda.id),
                                                    )
                                                    return
                                                  }
                                                  setSelectedAssignedAgendaIds([])
                                                }}
                                                disabled={assignedAgendas.length === 0}
                                                className="border-slate-300 data-[state=checked]:border-slate-700 data-[state=checked]:bg-slate-700"
                                              />
                                              전체 선택
                                            </label>
                                            <Badge
                                              variant="outline"
                                              className="border-slate-200 bg-white text-slate-600"
                                            >
                                              {assignedAgendas.length}개
                                            </Badge>
                                          </div>
                                        </div>
                                        <div className="h-[320px] overflow-y-auto bg-white">
                                          {assignedAgendas.length === 0 ? (
                                            <div className="flex h-full items-center justify-center p-4 text-center text-sm text-slate-500">
                                              선택된 아젠다가 없습니다.
                                            </div>
                                          ) : (
                                            assignedAgendas.map((agenda) => {
                                              const checked = selectedAssignedAgendaIds.includes(agenda.id)
                                              return (
                                                <label
                                                  key={agenda.id}
                                                  className="flex cursor-pointer items-center gap-3 border-b border-slate-200/70 px-4 py-2.5 hover:bg-slate-50/80"
                                                >
                                                  <Checkbox
                                                    checked={checked}
                                                    onCheckedChange={(nextChecked) => {
                                                      setSelectedAssignedAgendaIds((prev) => {
                                                        if (nextChecked) {
                                                          return [...prev, agenda.id]
                                                        }
                                                        return prev.filter((id) => id !== agenda.id)
                                                      })
                                                    }}
                                                    className="rounded-[4px] border-slate-300 data-[state=checked]:border-slate-700 data-[state=checked]:bg-slate-700 focus-visible:ring-slate-200"
                                                  />
                                                  <div className="flex min-w-0 flex-1 items-center gap-2">
                                                    <span className="truncate text-sm font-medium text-slate-700">
                                                      {agenda.name}
                                                    </span>
                                                    <Badge
                                                      variant="outline"
                                                      className={
                                                        agenda.scope === "internal"
                                                          ? "h-5 shrink-0 border-amber-200 bg-amber-50 px-1.5 text-[11px] text-amber-700"
                                                          : "h-5 shrink-0 border-rose-200 bg-rose-50 px-1.5 text-[11px] text-rose-700"
                                                      }
                                                    >
                                                      {agenda.scope === "internal" ? "내부" : "외부"}
                                                    </Badge>
                                                  </div>
                                                </label>
                                              )
                                            })
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="mt-4 flex justify-end gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() => {
                                        setIsAgendaMapDialogOpen(false)
                                        setDraftAgendaIds(null)
                                        setAgendaSearch("")
                                        setSelectedAvailableAgendaIds([])
                                        setSelectedAssignedAgendaIds([])
                                      }}
                                    >
                                      취소
                                    </Button>
                                    <Button
                                      type="button"
                                      onClick={handleSaveAgendaMapping}
                                      disabled={!isAgendaDirty}
                                    >
                                      저장
                                    </Button>
                                  </div>
                                </DialogContent>
                              </Dialog>

                              <Dialog
                                open={
                                  isScheduleDialogOpen && selectedConsultantId === consultant.id
                                }
                                onOpenChange={(open) => {
                                  setIsScheduleDialogOpen(open)
                                  if (open) {
                                    setSelectedConsultantId(consultant.id)
                                    setSelectedScheduleMonthKey(scheduleTargetMonthKey)
                                    setDraftScheduleAvailability(
                                      getMonthlyAvailabilityForMonth(
                                        consultant.monthlyAvailability,
                                        scheduleTargetMonthKey,
                                        getConsultantScheduleDayNumbers({
                                          agendaIds: consultant.agendaIds,
                                          agendas,
                                          scope: consultant.scope,
                                        }),
                                      ),
                                    )
                                  } else {
                                    setDraftScheduleAvailability(null)
                                  }
                                }}
                              >
                                <DialogTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedConsultantId(consultant.id)
                                      setSelectedScheduleMonthKey(scheduleTargetMonthKey)
                                      setDraftScheduleAvailability(
                                        getMonthlyAvailabilityForMonth(
                                          consultant.monthlyAvailability,
                                          scheduleTargetMonthKey,
                                          getConsultantScheduleDayNumbers({
                                            agendaIds: consultant.agendaIds,
                                            agendas,
                                            scope: consultant.scope,
                                          }),
                                        ),
                                      )
                                    }}
                                  >
                                    <Clock3 className="w-4 h-4 mr-2" />
                                    가능 시간 관리
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-3xl">
                                  <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2">
                                      <UserCog className="w-4 h-4" />
                                      {consultant.name} 컨설턴트 가능 시간
                                    </DialogTitle>
                                    <DialogDescription>
                                      {scheduleTargetMonthKey} 정기 오피스아워 가능 시간을 설정합니다.
                                    </DialogDescription>
                                  </DialogHeader>

                                  <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
                                    <div className="w-full max-w-[220px]">
                                      <Label className="mb-2 block">조회 월</Label>
                                      <Select
                                        value={selectedScheduleMonthKey}
                                        onValueChange={setSelectedScheduleMonthKey}
                                      >
                                        <SelectTrigger>
                                          <SelectValue placeholder="월 선택" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {scheduleMonthOptions.map((monthKey) => (
                                            <SelectItem key={monthKey} value={monthKey}>
                                              {formatMonthLabel(monthKey)}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    {!isScheduleEditable && selectedScheduleMonthKey === scheduleTargetMonthKey && (
                                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                        컨설턴트 가능 시간은 매월 3주차에 다음 달 일정만 수정할 수 있습니다.
                                      </div>
                                    )}
                                    {scheduleAvailability.map((day) => {
                                      const dayInfo = scheduleDays.find(
                                        (item) => item.value === day.dayOfWeek,
                                      )
                                      return (
                                        <div
                                          key={day.dayOfWeek}
                                          className={cn(
                                            "rounded-lg border p-4",
                                            isScheduleEditable
                                              ? "border-slate-200 bg-white"
                                              : "border-slate-200 bg-slate-50",
                                          )}
                                        >
                                          <div className="mb-3 flex items-center justify-between gap-2">
                                            <div className="text-sm font-semibold">
                                              {dayInfo?.label || "-"}요일
                                            </div>
                                            {!isScheduleEditable ? (
                                              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500">
                                                읽기 전용
                                              </span>
                                            ) : null}
                                          </div>
                                          <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
                                            {day.slots.map((slot) => (
                                              <button
                                                key={`${day.dayOfWeek}-${slot.start}`}
                                                type="button"
                                                aria-pressed={slot.available}
                                                title={
                                                  !isScheduleEditable
                                                    ? slot.available
                                                      ? "가능 일정 (조회 전용)"
                                                      : "불가 일정 (조회 전용)"
                                                    : slot.available
                                                      ? "가능 일정"
                                                      : "불가 일정"
                                                }
                                                onClick={() =>
                                                  toggleSlot(day.dayOfWeek, slot.start)
                                                }
                                                disabled={!isScheduleEditable}
                                                className={cn(
                                                  "rounded-lg border px-2 py-2 text-xs transition",
                                                  !isScheduleEditable &&
                                                    "cursor-not-allowed border-slate-200 text-slate-400 shadow-none",
                                                  isScheduleEditable && slot.available
                                                    ? "border-slate-900 bg-slate-900 text-white"
                                                    : isScheduleEditable
                                                      ? "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
                                                      : slot.available
                                                        ? "bg-slate-300/80"
                                                        : "bg-slate-100",
                                                )}
                                              >
                                                {slot.start}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      )
                                    })}
                                    <div className="flex flex-wrap items-center justify-end gap-4 text-xs text-slate-700">
                                      <span className="inline-flex items-center gap-2">
                                        <span className="h-3.5 w-3.5 rounded border border-slate-900 bg-slate-900" />
                                        가능 일정
                                      </span>
                                      <span className="inline-flex items-center gap-2">
                                        <span className="h-3.5 w-3.5 rounded border border-slate-300 bg-white" />
                                        불가 일정
                                      </span>
                                      {!isScheduleEditable ? (
                                        <span className="inline-flex items-center gap-2 text-slate-500">
                                          <span className="h-3.5 w-3.5 rounded border border-slate-200 bg-slate-100" />
                                          조회 전용
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div className="mt-4 flex justify-end gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() => {
                                        setIsScheduleDialogOpen(false)
                                        setDraftScheduleAvailability(null)
                                      }}
                                    >
                                      취소
                                    </Button>
                                    <Button
                                      type="button"
                                      onClick={handleSaveSchedule}
                                      disabled={!isScheduleEditable || !isScheduleDirty}
                                    >
                                      저장
                                    </Button>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
            <div className="shrink-0 border-t bg-white px-4 py-3">
              <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
                <div className="text-center text-sm text-muted-foreground sm:text-left">
                  {filteredConsultants.length === 0
                    ? "0명"
                    : `${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, filteredConsultants.length)} / ${filteredConsultants.length}명`}
                </div>
                <PaginationControls
                  page={page}
                  pageSize={PAGE_SIZE}
                  totalItems={filteredConsultants.length}
                  onPageChange={setPage}
                  className="w-full justify-center"
                  alwaysShow
                />
                <div className="hidden sm:block" aria-hidden="true" />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
