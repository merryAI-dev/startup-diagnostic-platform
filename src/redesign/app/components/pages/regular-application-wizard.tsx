import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Calendar as CalendarIcon, Check, AlertCircle } from "lucide-react";
import { Button } from "@/redesign/app/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/redesign/app/components/ui/alert-dialog";
import { Card, CardContent } from "@/redesign/app/components/ui/card";
import { Stepper } from "@/redesign/app/components/stepper";
import { Label } from "@/redesign/app/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/redesign/app/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/redesign/app/components/ui/select";
import { Textarea } from "@/redesign/app/components/ui/textarea";
import { FileUpload } from "@/redesign/app/components/file-upload";
import { Calendar } from "@/redesign/app/components/ui/calendar";
import {
  Agenda,
  Application,
  Consultant,
  OfficeHourSlot,
  RegularOfficeHour,
  SessionFormat,
  FileItem,
  ProgramWeekday,
} from "@/redesign/app/lib/types";
import { getTimeSlots } from "@/redesign/app/lib/data";
import {
  getAssignableConsultantsAt,
  hasApplicantConflictAt,
  normalizeApplicationStatus,
  normalizeTimeKey,
} from "@/redesign/app/lib/application-availability";
import { format, isBefore, parseISO, startOfDay } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/redesign/app/components/ui/utils";

interface RegularApplicationWizardProps {
  officeHour: RegularOfficeHour;
  officeHours: RegularOfficeHour[];
  officeHourSlots: OfficeHourSlot[];
  applications: Application[];
  consultants: Consultant[];
  agendas: Agenda[];
  allowedWeekdays?: ProgramWeekday[];
  remainingInternalTickets: number;
  remainingExternalTickets: number;
  currentApplicant?: {
    createdByUid?: string | null;
    companyId?: string | null;
    applicantEmail?: string | null;
  };
  onBack: () => void;
  onSubmit: (data: ApplicationFormData) => Promise<void> | void;
}

export interface ApplicationFormData {
  officeHourId: string;
  slotId?: string;
  date: Date;
  time: string;
  sessionFormat: SessionFormat;
  agendaId: string;
  requestContent: string;
  files: FileItem[];
}

type RequestSectionKey =
  | "currentSituation"
  | "keyChallenges"
  | "requestedSupport";

type RequestSections = Record<RequestSectionKey, string>;

const REQUEST_SECTION_MIN_LENGTH = 20;
const REQUEST_SECTION_META: Array<{ key: RequestSectionKey; label: string; placeholder: string }> = [
  {
    key: "currentSituation",
    label: "1. 현재 상황 및 배경",
    placeholder: "예: 지금까지의 진행 과정과 주요 이슈 발생 배경",
  },
  {
    key: "keyChallenges",
    label: "2. 당면한 문제/과제",
    placeholder: "예: 현재 가장 해결이 필요한 문제와 영향",
  },
  {
    key: "requestedSupport",
    label: "3. 요청 사항",
    placeholder: "예: 오피스아워에서 얻고 싶은 구체적인 도움/산출물",
  },
];

const steps = [
  "아젠다 선택",
  "날짜/시간 선택",
  "진행 형태",
  "요청 내용",
  "최종 확인",
];

function normalizeConsultantDisplayName(value?: string | null): string {
  return (value ?? "")
    .replace(/\s*컨설턴트\s*$/u, "")
    .trim()
    .toLowerCase();
}

function getCurrentLocalDateTimeKeys(now = new Date()) {
  const dateKey = format(now, "yyyy-MM-dd");
  const timeKey = format(now, "HH:mm");
  return { dateKey, timeKey };
}

function isPastScheduledStart(dateKey: string, timeKey: string, now = new Date()) {
  const normalizedTime = normalizeTimeKey(timeKey);
  if (!dateKey || !normalizedTime) return true;
  const { dateKey: todayKey, timeKey: currentTimeKey } = getCurrentLocalDateTimeKeys(now);
  if (dateKey < todayKey) return true;
  if (dateKey > todayKey) return false;
  return normalizedTime < currentTimeKey;
}

export function RegularApplicationWizard({
  officeHour,
  officeHours,
  officeHourSlots,
  applications,
  consultants,
  agendas,
  allowedWeekdays = ["TUE", "THU"],
  remainingInternalTickets,
  remainingExternalTickets,
  currentApplicant,
  onBack,
  onSubmit,
}: RegularApplicationWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState<string | undefined>();
  const [sessionFormat, setSessionFormat] = useState<SessionFormat>("online");
  const [selectedAgendaId, setSelectedAgendaId] = useState("");
  const [requestSections, setRequestSections] = useState<RequestSections>({
    currentSituation: "",
    keyChallenges: "",
    requestedSupport: "",
  });
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ticketAlertOpen, setTicketAlertOpen] = useState(false);
  const [ticketAlertMessage, setTicketAlertMessage] = useState("");

  const consultantsByAgendaId = useMemo(() => {
    const map = new Map<string, Consultant[]>();
    consultants.forEach((consultant) => {
      if (consultant.status !== "active") return;
      (consultant.agendaIds ?? []).forEach((agendaId) => {
        const existing = map.get(agendaId);
        if (existing) {
          existing.push(consultant);
        } else {
          map.set(agendaId, [consultant]);
        }
      });
    });
    return map;
  }, [consultants]);
  const consultantPool = selectedAgendaId
    ? consultantsByAgendaId.get(selectedAgendaId) ?? []
    : [];
  const programOfficeHours = officeHour.programId
    ? officeHours.filter((item) => item.programId === officeHour.programId)
    : [officeHour];
  const programOfficeHourSlots = useMemo(
    () =>
      officeHour.programId
        ? officeHourSlots.filter((slot) => slot.programId === officeHour.programId)
        : officeHourSlots,
    [officeHour.programId, officeHourSlots],
  );
  const selectedAgenda = agendas.find((agenda) => agenda.id === selectedAgendaId);
  const isExternalAgendaSelected = selectedAgenda?.scope === "external";
  const agendaName = selectedAgenda?.name;
  const requestSectionValidations = REQUEST_SECTION_META.map(({ key, label }) => {
    const value = requestSections[key].trim();
    return {
      key,
      label,
      value,
      length: value.length,
      isValid: value.length >= REQUEST_SECTION_MIN_LENGTH,
    };
  });
  const isRequestSectionStepValid = requestSectionValidations.every((item) => item.isValid);
  const requestContent = requestSectionValidations
    .map(({ label, value }) => `${label}\n${value}`)
    .join("\n\n");
  const todayStart = startOfDay(new Date());
  const allowedWeekdayNumbers = useMemo(() => {
    const source = allowedWeekdays.length > 0 ? allowedWeekdays : ["TUE", "THU"];
    return new Set(
      source.flatMap((weekday) => {
        if (weekday === "TUE") return [2];
        if (weekday === "THU") return [4];
        return [];
      })
    );
  }, [allowedWeekdays]);
  const availableDateKeys = useMemo(() => {
    const keys = new Set<string>();

    programOfficeHours.forEach((item) => {
      const slots = programOfficeHourSlots.filter((slot) => slot.date.startsWith(item.month));
      if (slots.length === 0) {
        (item.availableDates ?? []).forEach((date) => {
          const normalizedDate = format(parseISO(date), "yyyy-MM-dd");
          const dayOfWeek = parseISO(normalizedDate).getDay();
          if (!allowedWeekdayNumbers.has(dayOfWeek)) return;
          if (selectedAgendaId) {
            const hasAnyAssignableTime = getTimeSlots(parseISO(normalizedDate).toISOString()).some(
              (timeSlot) =>
                !isPastScheduledStart(normalizedDate, timeSlot.time) &&
                getAssignableConsultantsAt({
                  consultants,
                  applications,
                  officeHourSlots,
                  agendaId: selectedAgendaId,
                  dateKey: normalizedDate,
                  time: timeSlot.time,
                }).length > 0,
            );
            if (!hasAnyAssignableTime) return;
          }
          keys.add(normalizedDate);
        });
        return;
      }

      slots.forEach((slot) => {
        const dateKey = format(parseISO(slot.date), "yyyy-MM-dd");
        const dayOfWeek = parseISO(dateKey).getDay();
        const matchesAgenda =
          !selectedAgendaId || !slot.agendaIds || slot.agendaIds.includes(selectedAgendaId);
        if (!allowedWeekdayNumbers.has(dayOfWeek) || !matchesAgenda) {
          return;
        }
        if (slot.status !== "open") {
          return;
        }
        if (isPastScheduledStart(dateKey, slot.startTime)) {
          return;
        }
        if (
          selectedAgendaId &&
          getAssignableConsultantsAt({
            consultants,
            applications,
            officeHourSlots,
            agendaId: selectedAgendaId,
            dateKey,
            time: slot.startTime,
            slotConsultantId: slot.consultantId,
          }).length === 0
        ) {
          return;
        }
        keys.add(dateKey);
      });
    });

    return keys;
  }, [
    allowedWeekdayNumbers,
    applications,
    consultants,
    programOfficeHourSlots,
    programOfficeHours,
    selectedAgendaId,
  ]);
  const timeSlots = selectedDate ? (() => {
    const selectedDateKey = format(selectedDate, "yyyy-MM-dd");
    const slotsForDate = programOfficeHourSlots.filter((slot) => slot.date === selectedDateKey);
    const assignableConsultantIds = new Set(consultantPool.map((consultant) => consultant.id));
    const byTime = new Map<string, { hasOpen: boolean; slotId?: string; slotConsultantId?: string }>();
    if (slotsForDate.length > 0) {
      slotsForDate.forEach((slot) => {
        const matchesAgenda =
          !selectedAgendaId || !slot.agendaIds || slot.agendaIds.includes(selectedAgendaId);
        const matchesConsultant =
          !slot.consultantId || assignableConsultantIds.has(slot.consultantId);
        if (!matchesAgenda || !matchesConsultant) {
          return;
        }
        const existing = byTime.get(slot.startTime);
        const isOpen = slot.status === "open";
        if (!existing) {
          byTime.set(slot.startTime, {
            hasOpen: isOpen,
            slotId: slot.id,
            slotConsultantId: slot.consultantId,
          });
          return;
        }
        byTime.set(slot.startTime, {
          hasOpen: existing.hasOpen || isOpen,
          slotId: isOpen ? slot.id : existing.slotId ?? slot.id,
          slotConsultantId: isOpen ? slot.consultantId : existing.slotConsultantId,
        });
      });

    }

    return getTimeSlots(selectedDate.toISOString()).map((slot) => {
      const meta = byTime.get(slot.time);
      const assignableConsultants =
        selectedAgendaId.length > 0
          ? getAssignableConsultantsAt({
              consultants,
              applications,
              officeHourSlots,
              agendaId: selectedAgendaId,
              dateKey: selectedDateKey,
              time: slot.time,
              slotConsultantId: meta?.slotConsultantId,
            })
          : [];
      const applicantConflict = hasApplicantConflictAt({
        applications,
        dateKey: selectedDateKey,
        time: slot.time,
        createdByUid: currentApplicant?.createdByUid,
        companyId: currentApplicant?.companyId,
        applicantEmail: currentApplicant?.applicantEmail,
      });
      const consultantAssignable = assignableConsultants.length > 0;
      const futureSchedulable = !isPastScheduledStart(selectedDateKey, slot.time);
      const openBySlotState = meta ? meta.hasOpen : slot.available;
      const available = openBySlotState && consultantAssignable && futureSchedulable && !applicantConflict;
      return {
        ...slot,
        available,
        reason: available
          ? undefined
          : !futureSchedulable
            ? "이미 지난 시간은 신청할 수 없습니다"
          : applicantConflict
            ? "이미 같은 시간에 신청한 일정이 있어 선택할 수 없습니다"
          : !consultantAssignable
            ? "해당 시간에 배정 가능한 컨설턴트가 없습니다"
            : meta && !meta.hasOpen
              ? "예약 불가한 시간입니다"
              : slot.reason,
        slotId: meta?.slotId,
      };
    });
  })() : [];

  const isAgendaSelectable = (agenda: Agenda) => {
    if (agenda.scope === "internal") return remainingInternalTickets > 0;
    return remainingExternalTickets > 0;
  };

  const isStepValid = () => {
    switch (currentStep) {
      case 1:
        if (activeAgendas.length === 0 || !selectedAgendaId) return false;
        if (!selectedAgenda) return false;
        return isAgendaSelectable(selectedAgenda);
      case 2:
        return selectedDate && selectedTime;
      case 3:
        return sessionFormat;
      case 4:
        return isRequestSectionStepValid;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (currentStep === 1 && selectedAgenda) {
      if (!isAgendaSelectable(selectedAgenda)) {
        setTicketAlertMessage(
          selectedAgenda.scope === "internal"
            ? "내부 티켓이 모두 소진되어 내부 오피스아워를 신청할 수 없습니다."
            : "외부 티켓이 모두 소진되어 외부 오피스아워를 신청할 수 없습니다."
        );
        setTicketAlertOpen(true);
        return;
      }
    }
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    if (!selectedDate || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await Promise.resolve(
        onSubmit({
          officeHourId: officeHour.id,
          slotId: selectedSlotId,
          date: selectedDate,
          time: selectedTime,
          sessionFormat,
          agendaId: selectedAgendaId,
          requestContent,
          files,
        })
      );
    } finally {
      setIsSubmitting(false);
    }
  };
  const activeAgendas = agendas.filter((agenda) => agenda.active !== false);

  useEffect(() => {
    if (isExternalAgendaSelected && sessionFormat !== "online") {
      setSessionFormat("online");
    }
  }, [isExternalAgendaSelected, sessionFormat]);

  return (
    <div className="p-8 space-y-6">
      <AlertDialog open={ticketAlertOpen} onOpenChange={setTicketAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>티켓이 부족합니다</AlertDialogTitle>
            <AlertDialogDescription>
              {ticketAlertMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>확인</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div>
        <Button variant="ghost" onClick={onBack} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          취소
        </Button>
        <h1 className="mb-2">오피스아워 신청</h1>
        <p className="text-sm text-muted-foreground">{officeHour.title}</p>
      </div>

      <Stepper steps={steps} currentStep={currentStep} />

      <Card>
        <CardContent className="p-8">
          {/* Step 1: Agenda */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="mb-4">아젠다를 선택하세요</h3>
                <div className="space-y-3">
                  <Label>아젠다 선택</Label>
                  <Select
                    value={selectedAgendaId}
                    onValueChange={(value) => {
                      setSelectedAgendaId(value);
                      setSelectedDate(undefined);
                      setSelectedTime("");
                      setSelectedSlotId(undefined);
                    }}
                    disabled={activeAgendas.length === 0}
                  >
                    <SelectTrigger data-testid="regular-agenda-trigger">
                      <SelectValue placeholder="아젠다를 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeAgendas.map((agenda) => {
                        const disabled = !isAgendaSelectable(agenda);
                        return (
                          <SelectItem key={agenda.id} value={agenda.id} disabled={disabled}>
                            {agenda.name} · {agenda.scope === "internal" ? "내부" : "외부"}
                            {disabled ? " (티켓 소진)" : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {activeAgendas.length === 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                      활성 아젠다가 없습니다. 관리자에게 아젠다 활성화를 요청해주세요.
                    </div>
                  )}
                  {activeAgendas.length > 0
                    && remainingInternalTickets <= 0
                    && remainingExternalTickets <= 0 && (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        내부/외부 티켓이 모두 소진되어 신청할 수 없습니다.
                      </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Date and Time */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="mb-4">날짜와 시간을 선택하세요</h3>
                <div className="flex gap-8">
                  <div>
                    <Label className="mb-3 block">신청 가능한 날짜</Label>
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => {
                        setSelectedDate(date);
                        setSelectedTime("");
                        setSelectedSlotId(undefined);
                      }}
                      disabled={(date) => {
                        if (isBefore(date, todayStart)) return true;
                        if (!allowedWeekdayNumbers.has(date.getDay())) return true;
                        const dateKey = format(date, "yyyy-MM-dd");
                        return !availableDateKeys.has(dateKey);
                      }}
                      className="rounded-md border"
                    />
                  </div>

                  {selectedDate && (
                    <div className="flex-1">
                      <Label className="mb-3 block">시간 선택</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {timeSlots.map((slot) => (
                          <button
                            key={slot.time}
                            data-testid={`regular-time-slot-${slot.time.replace(":", "-")}`}
                            disabled={!slot.available}
                            onClick={() => {
                              setSelectedTime(slot.time);
                              setSelectedSlotId(slot.slotId);
                            }}
                            className={cn(
                              "p-3 rounded-lg border text-sm transition-colors text-left",
                              !slot.available &&
                                "opacity-50 cursor-not-allowed bg-gray-50",
                              slot.available &&
                                selectedTime === slot.time &&
                                "border-primary bg-primary text-primary-foreground",
                              slot.available &&
                                selectedTime !== slot.time &&
                                "hover:border-gray-400"
                            )}
                            title={slot.reason}
                          >
                            {slot.time}
                            {!slot.available && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {slot.reason}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Session Format */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="mb-4">진행 형태를 선택하세요</h3>
                <RadioGroup
                  value={sessionFormat}
                  onValueChange={(v) => {
                    const nextFormat = v as SessionFormat;
                    if (isExternalAgendaSelected && nextFormat === "offline") return;
                    setSessionFormat(nextFormat);
                  }}
                >
                  <div className="space-y-3">
                    <div className={cn(
                      "flex items-start space-x-3 p-4 rounded-lg border cursor-pointer transition-colors",
                      sessionFormat === "online" && "border-primary bg-primary/5"
                    )}>
                      <RadioGroupItem value="online" id="online" />
                      <div className="flex-1">
                        <Label htmlFor="online" className="cursor-pointer">
                          온라인 (화상 회의)
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Zoom 링크는 일정 확정 후 전송됩니다
                        </p>
                      </div>
                    </div>
                    <div className={cn(
                      "flex items-start space-x-3 p-4 rounded-lg border cursor-pointer transition-colors",
                      sessionFormat === "offline" && "border-primary bg-primary/5",
                      isExternalAgendaSelected && "opacity-60 cursor-not-allowed"
                    )}>
                      <RadioGroupItem
                        value="offline"
                        id="offline"
                        disabled={isExternalAgendaSelected}
                      />
                      <div className="flex-1">
                        <Label
                          htmlFor="offline"
                          className={cn(
                            "cursor-pointer",
                            isExternalAgendaSelected && "cursor-not-allowed"
                          )}
                        >
                          오프라인 (대면 미팅)
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          주소: 서울시 종로구 청계천로 123 MYSC 오피스
                        </p>
                        {isExternalAgendaSelected && (
                          <p className="text-xs text-rose-600 mt-1">
                            외부 아젠다는 온라인으로만 신청할 수 있습니다.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </RadioGroup>
              </div>
            </div>
          )}

          {/* Step 4: Request Content */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <h3 className="mb-2">요청 내용을 작성하세요</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  항목별로 최소 20자 이상 입력해야 다음 단계로 진행할 수 있습니다.
                </p>
                <div className="space-y-4">
                  {requestSectionValidations.map(({ key, label, length, isValid }) => (
                    <div key={key} className="space-y-2">
                      <Label>{label}</Label>
                      <Textarea
                        data-testid={`regular-request-${key}`}
                        value={requestSections[key]}
                        onChange={(e) =>
                          setRequestSections((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        placeholder={
                          REQUEST_SECTION_META.find((item) => item.key === key)?.placeholder ?? ""
                        }
                        className="min-h-[96px]"
                      />
                      <p
                        className={cn(
                          "text-xs",
                          isValid ? "text-emerald-600" : "text-rose-600"
                        )}
                      >
                        {length}/{REQUEST_SECTION_MIN_LENGTH}자
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mb-2">파일 첨부 (선택)</h3>
                <FileUpload files={files} onFilesChange={setFiles} />
              </div>
            </div>
          )}

          {/* Step 5: Confirmation */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg mb-6">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-900">
                  <p className="mb-1">신청 내용을 확인해주세요</p>
                  <p className="text-xs">
                    제출 후 검토를 거쳐 일정이 확정됩니다. 확정 시 알림을
                    보내드립니다.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CalendarIcon className="w-3 h-3 text-primary" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-muted-foreground">일정</Label>
                    <p className="text-sm">
                      {selectedDate && format(selectedDate, "yyyy년 M월 d일 (E)", { locale: ko })}{" "}
                      {selectedTime}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-primary" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-muted-foreground">진행 형태</Label>
                    <p className="text-sm">
                      {sessionFormat === "online" ? "온라인" : "오프라인"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-primary" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-muted-foreground">아젠다</Label>
                    <p className="text-sm">
                      {agendaName || "-"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-primary" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-muted-foreground">요청 내용</Label>
                    <div className="text-sm whitespace-pre-wrap space-y-2">
                      {requestSectionValidations.map(({ key, label, value }) => (
                        <p key={key}>
                          <span className="font-medium">{label}</span>
                          {"\n"}
                          {value}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>

                {files.length > 0 && (
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    <div className="flex-1">
                      <Label className="text-muted-foreground">첨부 파일</Label>
                      <p className="text-sm">{files.length}개 파일</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex justify-between mt-8 pt-6 border-t">
            <Button
              data-testid="regular-wizard-back"
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 1}
            >
              이전
            </Button>
            {currentStep < steps.length ? (
              <Button
                data-testid="regular-wizard-next"
                onClick={handleNext}
                disabled={!isStepValid()}
              >
                다음
              </Button>
            ) : (
              <Button
                data-testid="regular-wizard-submit"
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? "제출 중..." : "신청 제출"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
