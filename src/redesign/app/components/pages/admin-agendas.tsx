import { useEffect, useMemo, useState } from "react"
import { Plus, Tags } from "lucide-react"
import { Agenda } from "../../lib/types"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { Textarea } from "../ui/textarea"

interface AdminAgendasProps {
  agendas: Agenda[]
  onAddAgenda: (data: Omit<Agenda, "id">) => void
  onToggleActive: (agendaId: string, active: boolean) => void
  onUpdateAgenda: (agendaId: string, data: Partial<Agenda>) => void
}

function scopeLabel(scope: Agenda["scope"]) {
  return scope === "internal" ? "내부" : "외부"
}

export function AdminAgendas({
  agendas,
  onAddAgenda,
  onToggleActive,
  onUpdateAgenda,
}: AdminAgendasProps) {
  const [name, setName] = useState("")
  const [scope, setScope] = useState<Agenda["scope"]>("internal")
  const [description, setDescription] = useState("")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [selectedAgendaId, setSelectedAgendaId] = useState<string | null>(null)
  const [isEditingDetail, setIsEditingDetail] = useState(false)
  const [detailName, setDetailName] = useState("")
  const [detailScope, setDetailScope] = useState<Agenda["scope"]>("internal")
  const [detailDescription, setDetailDescription] = useState("")

  const sortedAgendas = useMemo(() => {
    return [...agendas].sort((a, b) => a.name.localeCompare(b.name))
  }, [agendas])

  const selectedAgenda = useMemo(
    () => agendas.find((agenda) => agenda.id === selectedAgendaId) ?? null,
    [agendas, selectedAgendaId],
  )

  useEffect(() => {
    if (!selectedAgenda) {
      setIsEditingDetail(false)
      return
    }

    setDetailName(selectedAgenda.name)
    setDetailScope(selectedAgenda.scope)
    setDetailDescription(selectedAgenda.description ?? "")
    setIsEditingDetail(false)
  }, [selectedAgenda])

  const activeCount = agendas.filter((agenda) => agenda.active !== false).length

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
    setIsEditingDetail(false)
  }

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">아젠다 관리</h1>
          <p className="text-sm text-muted-foreground mt-1">
            정기/비정기 신청에서 사용할 아젠다 항목을 관리합니다
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
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
            <form className="grid grid-cols-1 md:grid-cols-4 gap-4" onSubmit={handleSubmit}>
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
              <div className="md:col-span-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  취소
                </Button>
                <Button type="submit">
                  <Plus className="w-4 h-4 mr-2" />
                  아젠다 추가
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">전체 아젠다</div>
            <div className="text-2xl font-bold mt-1">{agendas.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">활성 아젠다</div>
            <div className="text-2xl font-bold mt-1 text-emerald-600">{activeCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">비활성 아젠다</div>
            <div className="text-2xl font-bold mt-1 text-slate-500">
              {agendas.length - activeCount}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tags className="w-4 h-4" />
            아젠다 목록
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">구분</TableHead>
                <TableHead>아젠다 명</TableHead>
                <TableHead className="w-28">상태</TableHead>
                <TableHead className="w-44 text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedAgendas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-sm text-muted-foreground">
                    등록된 아젠다가 없습니다.
                  </TableCell>
                </TableRow>
              )}
              {sortedAgendas.map((agenda) => {
                const active = agenda.active !== false
                return (
                  <TableRow key={agenda.id}>
                    <TableCell>
                      <Badge variant={agenda.scope === "internal" ? "secondary" : "outline"}>
                        {scopeLabel(agenda.scope)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{agenda.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant={active ? "secondary" : "outline"}
                        className={
                          active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : ""
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
                          onClick={() => setSelectedAgendaId(agenda.id)}
                        >
                          상세보기
                        </Button>
                        <Button
                          size="sm"
                          variant={active ? "outline" : "secondary"}
                          onClick={() => onToggleActive(agenda.id, !active)}
                        >
                          {active ? "비활성화" : "활성화"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={selectedAgenda !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedAgendaId(null)
            setIsEditingDetail(false)
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <DialogTitle>아젠다 상세</DialogTitle>
                <DialogDescription>아젠다 세부 정보와 활성 상태를 확인합니다.</DialogDescription>
              </div>
              {selectedAgenda && (
                <div className="flex items-center gap-2">
                  {isEditingDetail ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDetailName(selectedAgenda.name)
                          setDetailScope(selectedAgenda.scope)
                          setDetailDescription(selectedAgenda.description ?? "")
                          setIsEditingDetail(false)
                        }}
                      >
                        취소
                      </Button>
                      <Button type="button" size="sm" onClick={handleSaveAgendaDetail}>
                        저장
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setIsEditingDetail(true)}
                    >
                      편집
                    </Button>
                  )}
                </div>
              )}
            </div>
          </DialogHeader>

          {selectedAgenda && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-3">
                {isEditingDetail ? (
                  <>
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
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="text-lg font-semibold">{selectedAgenda.name}</div>
                      <Badge
                        variant={selectedAgenda.scope === "internal" ? "secondary" : "outline"}
                      >
                        {scopeLabel(selectedAgenda.scope)}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {selectedAgenda.description?.trim() || "설명이 없습니다."}
                    </div>
                  </>
                )}
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

              <div className="flex justify-end">
                <Button
                  variant={selectedAgenda.active !== false ? "outline" : "default"}
                  disabled={isEditingDetail}
                  onClick={() => onToggleActive(selectedAgenda.id, selectedAgenda.active === false)}
                >
                  {selectedAgenda.active !== false ? "비활성화" : "활성화"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
