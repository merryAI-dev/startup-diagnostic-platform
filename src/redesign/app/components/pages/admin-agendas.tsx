import { useEffect, useMemo, useState } from "react"
import { Plus, Tags } from "lucide-react"
import { Agenda, Consultant } from "@/redesign/app/lib/types"
import { Badge } from "@/redesign/app/components/ui/badge"
import { Button } from "@/redesign/app/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/redesign/app/components/ui/card"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/redesign/app/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/redesign/app/components/ui/table"
import { Textarea } from "@/redesign/app/components/ui/textarea"
import { PaginationControls } from "@/redesign/app/components/ui/pagination-controls"

interface AdminAgendasProps {
  agendas: Agenda[]
  consultants: Consultant[]
  onAddAgenda: (data: Omit<Agenda, "id">) => void
  onUpdateAgenda: (agendaId: string, data: Partial<Agenda>) => void
}

function scopeLabel(scope: Agenda["scope"]) {
  return scope === "internal" ? "내부" : "외부"
}

function scopeBadgeClassName(scope: Agenda["scope"]) {
  return scope === "internal"
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : "border-rose-200 bg-rose-50 text-rose-800"
}

function formatConsultantSummary(names: string[]) {
  if (names.length === 0) {
    return "미지정"
  }

  if (names.length <= 2) {
    return names.join(", ")
  }

  return `${names.slice(0, 2).join(", ")} 외 ${names.length - 2}명`
}

const PAGE_SIZE = 10

export function AdminAgendas({
  agendas,
  consultants,
  onAddAgenda,
  onUpdateAgenda,
}: AdminAgendasProps) {
  const pageTitleClassName = "text-2xl font-semibold text-slate-900"
  const pageDescriptionClassName = "mt-1 text-sm text-slate-500"
  const [name, setName] = useState("")
  const [scope, setScope] = useState<Agenda["scope"]>("internal")
  const [description, setDescription] = useState("")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [selectedAgendaId, setSelectedAgendaId] = useState<string | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [detailName, setDetailName] = useState("")
  const [detailScope, setDetailScope] = useState<Agenda["scope"]>("internal")
  const [detailDescription, setDetailDescription] = useState("")
  const [scopeFilter, setScopeFilter] = useState<"all" | Agenda["scope"]>("all")
  const [page, setPage] = useState(1)

  const filteredAgendas = useMemo(() => {
    if (scopeFilter === "all") {
      return agendas
    }

    return agendas.filter((agenda) => agenda.scope === scopeFilter)
  }, [agendas, scopeFilter])

  const sortedAgendas = useMemo(() => {
    return [...filteredAgendas].sort((a, b) => a.name.localeCompare(b.name))
  }, [filteredAgendas])

  const paginatedAgendas = useMemo(() => {
    const startIndex = (page - 1) * PAGE_SIZE
    return sortedAgendas.slice(startIndex, startIndex + PAGE_SIZE)
  }, [page, sortedAgendas])

  const selectedAgenda = useMemo(
    () => agendas.find((agenda) => agenda.id === selectedAgendaId) ?? null,
    [agendas, selectedAgendaId],
  )
  const consultantNamesByAgendaId = useMemo(() => {
    const next = new Map<string, string[]>()

    consultants.forEach((consultant) => {
      const name = consultant.name.trim()
      if (!name) return

      Array.from(new Set(consultant.agendaIds ?? [])).forEach((agendaId) => {
        const current = next.get(agendaId) ?? []
        current.push(name)
        next.set(agendaId, current)
      })
    })

    next.forEach((names, agendaId) => {
      next.set(
        agendaId,
        Array.from(new Set(names)).sort((left, right) => left.localeCompare(right, "ko")),
      )
    })

    return next
  }, [consultants])
  const selectedAgendaConsultantNames = useMemo(() => {
    if (!selectedAgenda) {
      return []
    }

    return consultantNamesByAgendaId.get(selectedAgenda.id) ?? []
  }, [consultantNamesByAgendaId, selectedAgenda])

  useEffect(() => {
    if (!selectedAgenda) {
      return
    }

    setDetailName(selectedAgenda.name)
    setDetailScope(selectedAgenda.scope)
    setDetailDescription(selectedAgenda.description ?? "")
  }, [selectedAgenda])

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return

    onAddAgenda({
      name: trimmedName,
      scope,
      description: description.trim(),
      active: true,
      category: scopeLabel(scope),
    })

    setName("")
    setScope("internal")
    setDescription("")
    setIsAddDialogOpen(false)
  }

  function handleSaveAgendaDetail() {
    if (!selectedAgenda) return
    const trimmedName = detailName.trim()
    if (!trimmedName) return

    onUpdateAgenda(selectedAgenda.id, {
      name: trimmedName,
      scope: detailScope,
      description: detailDescription.trim(),
      category: scopeLabel(detailScope),
    })
  }

  useEffect(() => {
    setPage(1)
  }, [agendas.length, scopeFilter])

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(sortedAgendas.length / PAGE_SIZE))
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, sortedAgendas.length])

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <div className="shrink-0 border-b bg-white px-6 py-5">
        <div className="mx-auto flex w-full max-w-7xl items-start justify-between gap-4">
          <div>
            <h1 className={pageTitleClassName}>아젠다 관리</h1>
            <p className={pageDescriptionClassName}>
              정기/비정기 신청에서 사용할 아젠다 항목을 관리합니다
            </p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                아젠다 추가
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>아젠다 추가</DialogTitle>
                <DialogDescription>
                  입력한 아젠다는 신청 화면에서 즉시 선택 가능합니다.
                </DialogDescription>
              </DialogHeader>
              <form className="grid grid-cols-1 gap-4 md:grid-cols-4" onSubmit={handleSubmit}>
                <div className="md:col-span-1">
                  <Label className="mb-2 block">구분</Label>
                  <Select value={scope} onValueChange={(value) => setScope(value as Agenda["scope"])}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internal">내부</SelectItem>
                      <SelectItem value="external">외부</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-3">
                  <Label className="mb-2 block">아젠다 명</Label>
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="예: 투자 유치"
                    required
                  />
                </div>
                <div className="md:col-span-4">
                  <Label className="mb-2 block">설명</Label>
                  <Textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="아젠다 설명을 입력하세요"
                    rows={3}
                  />
                </div>
                <div className="flex justify-end gap-2 md:col-span-4">
                  <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    취소
                  </Button>
                  <Button type="submit">
                    <Plus className="mr-2 h-4 w-4" />
                    아젠다 추가
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-6 pb-6 pt-5">
        <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col">
          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
            <CardHeader className="shrink-0 border-b bg-white">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Tags className="h-4 w-4" />
                  아젠다 목록
                </CardTitle>
                <div className="flex items-center gap-3">
                  <Label htmlFor="agenda-scope-filter" className="text-sm text-muted-foreground">
                    필터
                  </Label>
                  <Select
                    value={scopeFilter}
                    onValueChange={(value) => setScopeFilter(value as "all" | Agenda["scope"])}
                  >
                    <SelectTrigger id="agenda-scope-filter" className="w-32">
                      <SelectValue placeholder="구분 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체</SelectItem>
                      <SelectItem value="internal">내부</SelectItem>
                      <SelectItem value="external">외부</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Table className="min-w-[980px]">
                <TableHeader className="[&_tr]:sticky [&_tr]:top-0 [&_tr]:z-10 [&_tr]:bg-white">
                  <TableRow className="hover:bg-white">
                    <TableHead className="w-28 bg-white">구분</TableHead>
                    <TableHead className="bg-white">아젠다 명</TableHead>
                    <TableHead className="w-64 bg-white">담당 컨설턴트</TableHead>
                    <TableHead className="w-28 bg-white">상태</TableHead>
                    <TableHead className="w-44 bg-white text-right">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedAgendas.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                        등록된 아젠다가 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                  {paginatedAgendas.map((agenda) => {
                    const active = agenda.active !== false
                    const assignedConsultantNames = consultantNamesByAgendaId.get(agenda.id) ?? []
                    const assignedConsultantSummary = formatConsultantSummary(assignedConsultantNames)
                    return (
                      <TableRow key={agenda.id}>
                        <TableCell>
                          <Badge variant="outline" className={scopeBadgeClassName(agenda.scope)}>
                            {scopeLabel(agenda.scope)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{agenda.name}</TableCell>
                        <TableCell>
                          <div
                            className="max-w-[240px] truncate text-sm text-slate-600"
                            title={assignedConsultantNames.join(", ")}
                          >
                            {assignedConsultantSummary}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              active
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-100 text-slate-600"
                            }
                          >
                            {active ? "활성" : "비활성"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedAgendaId(agenda.id)
                                setIsDetailOpen(true)
                              }}
                            >
                              편집
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="shrink-0 border-t bg-white px-4 py-3">
              <PaginationControls
                page={page}
                pageSize={PAGE_SIZE}
                totalItems={sortedAgendas.length}
                onPageChange={setPage}
                alwaysShow
              />
            </div>
          </Card>
        </div>
      </div>

      <Dialog
        open={isDetailOpen}
        onOpenChange={(open) => {
          setIsDetailOpen(open)
          if (!open) {
            setSelectedAgendaId(null)
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>아젠다 상세</DialogTitle>
            <DialogDescription>아젠다 세부 정보와 활성 상태를 확인합니다.</DialogDescription>
          </DialogHeader>

          {selectedAgenda && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-3">
                <div>
                  <Label className="mb-2 block">구분</Label>
                  <Select
                    value={detailScope}
                    onValueChange={(value) => setDetailScope(value as Agenda["scope"])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internal">내부</SelectItem>
                      <SelectItem value="external">외부</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-2 block">아젠다 명</Label>
                  <Input
                    value={detailName}
                    onChange={(event) => setDetailName(event.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label className="mb-2 block">설명</Label>
                  <Textarea
                    rows={3}
                    value={detailDescription}
                    onChange={(event) => setDetailDescription(event.target.value)}
                  />
                </div>
                <div>
                  <Label className="mb-2 block">담당 컨설턴트</Label>
                  <div className="rounded-md border bg-slate-50 px-3 py-2">
                    {selectedAgendaConsultantNames.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedAgendaConsultantNames.map((consultantName) => (
                          <Badge
                            key={consultantName}
                            variant="outline"
                            className="border-slate-200 bg-white text-slate-700"
                          >
                            {consultantName}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm font-medium text-slate-700">미지정</p>
                    )}
                  </div>
                </div>
                <div>
                  <Badge
                    variant={selectedAgenda.active !== false ? "secondary" : "outline"}
                    className={
                      selectedAgenda.active !== false
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : ""
                    }
                  >
                    {selectedAgenda.active !== false ? "활성 아젠다" : "비활성 아젠다"}
                  </Badge>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsDetailOpen(false)
                  }}
                >
                  취소
                </Button>
                <Button type="button" onClick={handleSaveAgendaDetail}>
                  저장
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
