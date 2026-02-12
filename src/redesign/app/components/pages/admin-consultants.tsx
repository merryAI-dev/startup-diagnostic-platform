import { useMemo, useState } from "react";
import { Building2, Clock3, Link2, Mail, Phone, Plus, UserCog } from "lucide-react";
import { Agenda, Consultant, ConsultantAvailability } from "@/redesign/app/lib/types";
import { Badge } from "@/redesign/app/components/ui/badge";
import { Button } from "@/redesign/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/redesign/app/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/redesign/app/components/ui/dialog";
import { Input } from "@/redesign/app/components/ui/input";
import { Label } from "@/redesign/app/components/ui/label";
import { Textarea } from "@/redesign/app/components/ui/textarea";
import { cn } from "@/redesign/app/components/ui/utils";

interface AdminConsultantsProps {
  consultants: Consultant[];
  agendas: Agenda[];
  onUpdateConsultant: (id: string, data: Partial<Consultant>) => void;
  onAddConsultant: (data: Omit<Consultant, "id">) => void;
}

const SCHEDULE_DAYS = [
  { value: 2, label: "화" },
  { value: 4, label: "목" },
] as const;

const TIME_SLOTS = Array.from({ length: 9 }, (_, index) => {
  const startHour = 9 + index;
  const endHour = startHour + 1;
  return {
    start: `${String(startHour).padStart(2, "0")}:00`,
    end: `${String(endHour).padStart(2, "0")}:00`,
  };
});

function buildDefaultAvailability(): ConsultantAvailability[] {
  return SCHEDULE_DAYS.map((day) => ({
    dayOfWeek: day.value,
    slots: TIME_SLOTS.map((slot) => ({
      start: slot.start,
      end: slot.end,
      available: false,
    })),
  }));
}

function normalizeAvailability(
  input: ConsultantAvailability[] | undefined
): ConsultantAvailability[] {
  const base = buildDefaultAvailability();
  if (!input || input.length === 0) return base;
  return base.map((baseDay) => {
    const found = input.find((item) => item.dayOfWeek === baseDay.dayOfWeek);
    if (!found) return baseDay;
    return {
      ...baseDay,
      slots: baseDay.slots.map((baseSlot) => {
        const existing = found.slots.find(
          (slot) => slot.start === baseSlot.start && slot.end === baseSlot.end
        );
        return existing ?? baseSlot;
      }),
    };
  });
}

export function AdminConsultants({
  consultants,
  agendas,
  onUpdateConsultant,
  onAddConsultant,
}: AdminConsultantsProps) {
  const scheduleRange = TIME_SLOTS.length > 0
    ? `${TIME_SLOTS[0]?.start} ~ ${TIME_SLOTS[TIME_SLOTS.length - 1]?.end}`
    : "일정 없음";
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedConsultantId, setSelectedConsultantId] = useState<string | null>(
    null
  );
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [isAgendaMapDialogOpen, setIsAgendaMapDialogOpen] = useState(false);

  const selectedConsultant = useMemo(
    () =>
      consultants.find((consultant) => consultant.id === selectedConsultantId) ??
      null,
    [consultants, selectedConsultantId]
  );

  const consultantStats = useMemo(() => {
    const total = consultants.length;
    const active = consultants.filter((item) => item.status === "active").length;
    const withLink = consultants.filter((item) => item.fixedMeetingLink).length;
    const withPhone = consultants.filter((item) => item.phone?.trim()).length;
    const mapped = consultants.filter(
      (item) => (item.agendaIds ?? []).length > 0
    ).length;
    return { total, active, withLink, withPhone, mapped };
  }, [consultants]);

  function toggleSlot(dayOfWeek: number, slotStart: string) {
    if (!selectedConsultant) return;
    const normalized = normalizeAvailability(selectedConsultant.availability);
    const nextAvailability = normalized.map((day) => {
      if (day.dayOfWeek !== dayOfWeek) return day;
      return {
        ...day,
        slots: day.slots.map((slot) =>
          slot.start === slotStart
            ? { ...slot, available: !slot.available }
            : slot
        ),
      };
    });

    onUpdateConsultant(selectedConsultant.id, { availability: nextAvailability });
  }

  function handleAddConsultant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    if (!name || !email) return;

    const phone = String(formData.get("phone") ?? "").trim();
    const organization = String(formData.get("organization") ?? "").trim();
    const secondaryEmail = String(formData.get("secondaryEmail") ?? "").trim();
    const secondaryPhone = String(formData.get("secondaryPhone") ?? "").trim();
    const fixedMeetingLink = String(formData.get("fixedMeetingLink") ?? "").trim();
    const bio = String(formData.get("bio") ?? "").trim();
    const expertiseRaw = String(formData.get("expertise") ?? "").trim();

    onAddConsultant({
      name,
      email,
      phone: phone || undefined,
      organization: organization || undefined,
      secondaryEmail: secondaryEmail || undefined,
      secondaryPhone: secondaryPhone || undefined,
      fixedMeetingLink: fixedMeetingLink || undefined,
      title: "컨설턴트",
      expertise: expertiseRaw
        ? expertiseRaw.split(",").map((item) => item.trim()).filter(Boolean)
        : [],
      bio: bio || `${name} 컨설턴트`,
      status: "active",
      agendaIds: [],
      availability: buildDefaultAvailability(),
    });

    event.currentTarget.reset();
    setIsAddDialogOpen(false);
  }

  function toggleConsultantAgenda(agendaId: string, checked: boolean) {
    if (!selectedConsultant) return;
    const currentAgendaIds = selectedConsultant.agendaIds ?? [];
    const nextAgendaIds = checked
      ? [...new Set([...currentAgendaIds, agendaId])]
      : currentAgendaIds.filter((id) => id !== agendaId);

    onUpdateConsultant(selectedConsultant.id, {
      agendaIds: nextAgendaIds,
    });
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">컨설턴트 계정 관리</h1>
          <p className="text-sm text-muted-foreground mt-1">
            컨설턴트 프로필과 정기 오피스아워(화/목, 09:00~18:00) 가능 시간을 관리합니다
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              컨설턴트 계정 추가
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>컨설턴트 계정 등록</DialogTitle>
              <DialogDescription>
                필수 정보 입력 후 등록하면 관리자 목록에 즉시 반영됩니다.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddConsultant} className="grid grid-cols-2 gap-4">
              <div>
                <Label className="mb-2 block" htmlFor="name">
                  컨설턴트명
                </Label>
                <Input id="name" name="name" placeholder="홍길동" required />
              </div>
              <div>
                <Label className="mb-2 block" htmlFor="organization">
                  소속
                </Label>
                <Input id="organization" name="organization" placeholder="MYSC" />
              </div>
              <div>
                <Label className="mb-2 block" htmlFor="email">
                  이메일
                </Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <div>
                <Label className="mb-2 block" htmlFor="phone">
                  전화번호
                </Label>
                <Input id="phone" name="phone" placeholder="010-0000-0000" />
              </div>
              <div>
                <Label className="mb-2 block" htmlFor="secondaryEmail">
                  보조 이메일
                </Label>
                <Input id="secondaryEmail" name="secondaryEmail" type="email" />
              </div>
              <div>
                <Label className="mb-2 block" htmlFor="secondaryPhone">
                  보조 전화번호
                </Label>
                <Input id="secondaryPhone" name="secondaryPhone" placeholder="010-0000-0000" />
              </div>
              <div className="col-span-2">
                <Label className="mb-2 block" htmlFor="fixedMeetingLink">
                  고정 화상회의 링크
                </Label>
                <Input
                  id="fixedMeetingLink"
                  name="fixedMeetingLink"
                  placeholder="https://zoom.us/j/..."
                />
              </div>
              <div className="col-span-2">
                <Label className="mb-2 block" htmlFor="expertise">
                  전문 분야 (쉼표 구분)
                </Label>
                <Input
                  id="expertise"
                  name="expertise"
                  placeholder="예: 투자유치, 임팩트측정, BM"
                />
              </div>
              <div className="col-span-2">
                <Label className="mb-2 block" htmlFor="bio">
                  메모
                </Label>
                <Textarea id="bio" name="bio" rows={3} placeholder="관리 메모" />
              </div>
              <div className="col-span-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddDialogOpen(false)}
                >
                  취소
                </Button>
                <Button type="submit">등록</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">전체 컨설턴트</div>
            <div className="text-2xl font-bold mt-1">{consultantStats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">활성 컨설턴트</div>
            <div className="text-2xl font-bold mt-1 text-emerald-600">
              {consultantStats.active}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">화상링크 등록</div>
            <div className="text-2xl font-bold mt-1">{consultantStats.withLink}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">전화번호 등록</div>
            <div className="text-2xl font-bold mt-1">{consultantStats.withPhone}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">아젠다 매핑 완료</div>
            <div className="text-2xl font-bold mt-1 text-blue-600">
              {consultantStats.mapped}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {consultants.map((consultant) => {
          const normalizedAvailability = normalizeAvailability(consultant.availability);
          const availableSlots = normalizedAvailability.reduce((sum, day) => {
            return sum + day.slots.filter((slot) => slot.available).length;
          }, 0);

          return (
            <Card key={consultant.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="text-base">{consultant.name}</div>
                    <div className="text-xs text-muted-foreground font-normal">
                      {consultant.organization || "소속 미입력"}
                    </div>
                  </div>
                  <Badge
                    variant={consultant.status === "active" ? "secondary" : "outline"}
                    className={
                      consultant.status === "active"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : ""
                    }
                  >
                    {consultant.status === "active" ? "활성" : "비활성"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="w-4 h-4" />
                    <span>{consultant.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="w-4 h-4" />
                    <span>{consultant.phone || "-"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Building2 className="w-4 h-4" />
                    <span>보조 이메일: {consultant.secondaryEmail || "-"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Building2 className="w-4 h-4" />
                    <span>보조 전화: {consultant.secondaryPhone || "-"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Link2 className="w-4 h-4" />
                    <span className="truncate">{consultant.fixedMeetingLink || "-"}</span>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  화/목 가능 시간: <span className="font-semibold text-foreground">{scheduleRange}</span>
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">매핑된 아젠다</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(consultant.agendaIds ?? []).length > 0 ? (
                      (consultant.agendaIds ?? []).map((agendaId) => {
                        const agenda = agendas.find((item) => item.id === agendaId);
                        if (!agenda) return null;
                        return (
                          <Badge
                            key={agendaId}
                            variant="outline"
                            className="border-slate-200 bg-slate-900/5 text-slate-900 font-medium"
                          >
                            {agenda.name}
                          </Badge>
                        );
                      })
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        연결된 아젠다가 없습니다.
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Dialog
                    open={isAgendaMapDialogOpen && selectedConsultantId === consultant.id}
                    onOpenChange={(open) => {
                      setIsAgendaMapDialogOpen(open);
                      if (open) {
                        setSelectedConsultantId(consultant.id);
                      }
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => setSelectedConsultantId(consultant.id)}
                      >
                        아젠다 매핑
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>{consultant.name} 아젠다 매핑</DialogTitle>
                        <DialogDescription>
                          이 컨설턴트가 담당 가능한 아젠다를 선택하세요. 선택 결과는 사업 관리 화면의 컨설턴트 선택에 반영됩니다.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                        {agendas.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            등록된 아젠다가 없습니다. 상단에서 먼저 아젠다를 추가해주세요.
                          </p>
                        ) : (
                          agendas.map((agenda) => {
                            const checked = (selectedConsultant?.agendaIds ?? []).includes(
                              agenda.id
                            );
                            return (
                              <button
                                key={agenda.id}
                                type="button"
                                onClick={() => toggleConsultantAgenda(agenda.id, !checked)}
                                className={cn(
                                  "w-full rounded-lg border px-3 py-2 text-left text-sm transition",
                                  checked
                                    ? "border-slate-900 bg-slate-900 text-white"
                                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                )}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <span>{agenda.name}</span>
                                  <span className="text-xs opacity-80">
                                    {agenda.scope === "internal" ? "내부" : "외부"}
                                  </span>
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Dialog
                    open={isScheduleDialogOpen && selectedConsultantId === consultant.id}
                    onOpenChange={(open) => {
                      setIsScheduleDialogOpen(open);
                      if (open) {
                        setSelectedConsultantId(consultant.id);
                      }
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => setSelectedConsultantId(consultant.id)}
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
                          요일은 화/목 고정이며 09:00부터 18:00까지 1시간 단위로 설정합니다.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
                        {normalizeAvailability(selectedConsultant?.availability).map((day) => {
                          const dayInfo = SCHEDULE_DAYS.find((item) => item.value === day.dayOfWeek);
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
                                    onClick={() => toggleSlot(day.dayOfWeek, slot.start)}
                                    className={cn(
                                      "rounded-lg border px-2 py-2 text-xs transition",
                                      slot.available
                                        ? "border-slate-900 bg-slate-900 text-white"
                                        : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                                    )}
                                  >
                                    {slot.start}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      onUpdateConsultant(consultant.id, {
                        status:
                          consultant.status === "active" ? "inactive" : "active",
                      })
                    }
                  >
                    {consultant.status === "active" ? "비활성화" : "활성화"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
