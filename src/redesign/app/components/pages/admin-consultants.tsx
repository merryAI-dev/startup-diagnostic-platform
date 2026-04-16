import { useEffect, useMemo, useState } from "react"
import { Check, Clock3, Mail, Pencil, Phone, UserCog } from "lucide-react"
import { Agenda, Consultant, ConsultantAvailability } from "@/redesign/app/lib/types"
import { Badge } from "@/redesign/app/components/ui/badge"
import { Button } from "@/redesign/app/components/ui/button"
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
import { cn } from "@/redesign/app/components/ui/utils"

interface AdminConsultantsProps {
  consultants: Consultant[]
  agendas: Agenda[]
  onUpdateConsultant: (id: string, data: Partial<Consultant>) => Promise<void> | void
}

const SCHEDULE_DAYS = [
  { value: 2, label: "화" },
  { value: 4, label: "목" },
] as const

const TIME_SLOTS = Array.from({ length: 9 }, (_, index) => {
  const startHour = 9 + index
  const endHour = startHour + 1
  return {
    start: `${String(startHour).padStart(2, "0")}:00`,
    end: `${String(endHour).padStart(2, "0")}:00`,
  }
})

const PAGE_SIZE = 8

function buildDefaultAvailability(): ConsultantAvailability[] {
  return SCHEDULE_DAYS.map((day) => ({
    dayOfWeek: day.value,
    slots: TIME_SLOTS.map((slot) => ({
      start: slot.start,
      end: slot.end,
      available: false,
    })),
  }))
}

function normalizeAvailability(
  input: ConsultantAvailability[] | undefined,
): ConsultantAvailability[] {
  const base = buildDefaultAvailability()
  if (!input || input.length === 0) return base
  return base.map((baseDay) => {
    const found = input.find((item) => item.dayOfWeek === baseDay.dayOfWeek)
    if (!found) return baseDay
    return {
      ...baseDay,
      slots: baseDay.slots.map((baseSlot) => {
        const existing = found.slots.find(
          (slot) => slot.start === baseSlot.start && slot.end === baseSlot.end,
        )
        return existing ?? baseSlot
      }),
    }
  })
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
  const [draftScheduleAvailability, setDraftScheduleAvailability] = useState<
    ConsultantAvailability[] | null
  >(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [agendaFilter, setAgendaFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [meetingLinkDrafts, setMeetingLinkDrafts] = useState<Record<string, string>>({})
  const [editingMeetingLinkIds, setEditingMeetingLinkIds] = useState<string[]>([])
  const [savingMeetingLinkIds, setSavingMeetingLinkIds] = useState<string[]>([])

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
        !normalizedQuery || consultant.name.toLowerCase().includes(normalizedQuery)
      const matchesAgenda =
        agendaFilter === "all" || (consultant.agendaIds ?? []).includes(agendaFilter)
      return matchesQuery && matchesAgenda
    })
  }, [consultants, searchQuery, agendaFilter])
  const paginatedConsultants = useMemo(() => {
    const startIndex = (page - 1) * PAGE_SIZE
    return filteredConsultants.slice(startIndex, startIndex + PAGE_SIZE)
  }, [filteredConsultants, page])

  const normalizedSelectedAvailability = useMemo(
    () => normalizeAvailability(selectedConsultant?.availability),
    [selectedConsultant?.availability],
  )
  const normalizedSelectedAgendaIds = useMemo(
    () => Array.from(new Set(selectedConsultant?.agendaIds ?? [])).sort(),
    [selectedConsultant?.agendaIds],
  )
  const agendaIdsForDialog = draftAgendaIds ?? normalizedSelectedAgendaIds
  const isAgendaDirty =
    JSON.stringify(Array.from(new Set(agendaIdsForDialog)).sort()) !==
    JSON.stringify(normalizedSelectedAgendaIds)
  const scheduleAvailability = draftScheduleAvailability ?? normalizedSelectedAvailability
  const isScheduleDirty =
    JSON.stringify(scheduleAvailability) !== JSON.stringify(normalizedSelectedAvailability)

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
    if (!selectedConsultant) return
    onUpdateConsultant(selectedConsultant.id, {
      availability: scheduleAvailability,
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
        <div className="mx-auto w-full max-w-7xl">
          <h1 className={pageTitleClassName}>컨설턴트 관리</h1>
          <p className={pageDescriptionClassName}>
            컨설턴트 프로필과 정기 오피스아워(화/목, 09:00~18:00) 가능 시간을 관리합니다
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-5 px-8 py-6">
          <Card className="shrink-0">
            <CardContent className="p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="컨설턴트 이름 검색"
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
                <Table className="min-w-[1120px]">
                  <TableHeader className="[&_tr]:sticky [&_tr]:top-0 [&_tr]:z-10 [&_tr]:bg-white">
                    <TableRow className="hover:bg-white">
                      <TableHead className="bg-white">컨설턴트</TableHead>
                      <TableHead className="bg-white">연락처</TableHead>
                      <TableHead className="bg-white">화상링크</TableHead>
                      <TableHead className="bg-white">상태</TableHead>
                      <TableHead className="bg-white">아젠다</TableHead>
                      <TableHead className="bg-white text-right">관리</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredConsultants.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
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
                                  } else {
                                    setDraftAgendaIds(null)
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
                                    }}
                                  >
                                    아젠다 매칭
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl">
                                  <DialogHeader>
                                    <DialogTitle>{consultant.name} 아젠다 매칭</DialogTitle>
                                    <DialogDescription>
                                      이 컨설턴트가 담당 가능한 아젠다를 선택하세요. 선택 결과는
                                      사업 관리 화면의 컨설턴트 선택에 반영됩니다.
                                    </DialogDescription>
                                  </DialogHeader>

                                  <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                                    {agendas.length === 0 ? (
                                      <p className="text-sm text-muted-foreground">
                                        등록된 아젠다가 없습니다. 상단에서 먼저 아젠다를
                                        추가해주세요.
                                      </p>
                                    ) : (
                                      agendas.map((agenda) => {
                                        const checked = agendaIdsForDialog.includes(agenda.id)
                                        return (
                                          <button
                                            key={agenda.id}
                                            type="button"
                                            aria-pressed={checked}
                                            onClick={() =>
                                              toggleConsultantAgenda(agenda.id, !checked)
                                            }
                                            className={cn(
                                              "w-full rounded-lg border px-3 py-2 text-left text-sm transition",
                                              checked
                                                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                                            )}
                                          >
                                            <div className="flex items-center justify-between gap-3">
                                              <span className="inline-flex min-w-0 items-center gap-2">
                                                <span
                                                  className={cn(
                                                    "inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[4px] border",
                                                    checked
                                                      ? "border-emerald-500 bg-emerald-500"
                                                      : "border-slate-300 bg-white",
                                                  )}
                                                >
                                                  <Check
                                                    className={cn(
                                                      "h-3 w-3 transition-opacity",
                                                      checked
                                                        ? "opacity-100 text-white"
                                                        : "opacity-0 text-transparent",
                                                    )}
                                                  />
                                                </span>
                                                <span className="truncate">{agenda.name}</span>
                                              </span>
                                              <span className="text-xs opacity-90">
                                                {agenda.scope === "internal" ? "내부" : "외부"}
                                              </span>
                                            </div>
                                          </button>
                                        )
                                      })
                                    )}
                                  </div>
                                  <div className="mt-4 flex justify-end gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() => {
                                        setIsAgendaMapDialogOpen(false)
                                        setDraftAgendaIds(null)
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
                                    setDraftScheduleAvailability(
                                      normalizeAvailability(consultant.availability),
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
                                      setDraftScheduleAvailability(
                                        normalizeAvailability(consultant.availability),
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
                                      요일은 화/목 고정이며 09:00부터 18:00까지 1시간 단위로
                                      설정합니다.
                                    </DialogDescription>
                                  </DialogHeader>

                                  <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
                                    {scheduleAvailability.map((day) => {
                                      const dayInfo = SCHEDULE_DAYS.find(
                                        (item) => item.value === day.dayOfWeek,
                                      )
                                      return (
                                        <div key={day.dayOfWeek} className="border rounded-lg p-4">
                                          <div className="text-sm font-semibold mb-3">
                                            {dayInfo?.label || "-"}요일
                                          </div>
                                          <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                                            {day.slots.map((slot) => (
                                              <button
                                                key={`${day.dayOfWeek}-${slot.start}`}
                                                type="button"
                                                aria-pressed={slot.available}
                                                title={slot.available ? "가능 일정" : "불가 일정"}
                                                onClick={() =>
                                                  toggleSlot(day.dayOfWeek, slot.start)
                                                }
                                                className={cn(
                                                  "rounded-lg border px-2 py-2 text-xs transition",
                                                  slot.available
                                                    ? "border-slate-900 bg-slate-900 text-white"
                                                    : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50",
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
                                      disabled={!isScheduleDirty}
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
