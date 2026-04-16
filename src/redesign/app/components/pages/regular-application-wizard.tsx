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
  RegularOfficeHour,
  SessionFormat,
  FileItem,
  ProgramWeekday,
} from "@/redesign/app/lib/types";
import { getTimeSlots } from "@/redesign/app/lib/time-slots";
import { formatLocalDateKey, parseLocalDateKey } from "@/redesign/app/lib/date-keys";
import {
  getAssignableConsultantsAt,
  hasApplicantConflictAt,
  normalizeApplicationStatus,
  normalizeTimeKey,
} from "@/redesign/app/lib/application-availability";
import { format, isBefore, startOfDay } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/redesign/app/components/ui/utils";

interface RegularApplicationWizardProps {
  officeHour: RegularOfficeHour;
  officeHours: RegularOfficeHour[];
  applications: Application[];
  consultants: Consultant[];
  agendas: Agenda[];
  isRealtimeDataLoading?: boolean;
  allowedWeekdays?: ProgramWeekday[];
  remainingInternalTickets: number;
  remainingExternalTickets: number;
  currentApplicant?: {
    createdByUid?: string | null;
    companyId?: string | null;
    applicantEmail?: string | null;
  };
  preselectedDateKey?: string;
  layout?: "page" | "sheet";
  onBack: () => void;
  onSubmit: (data: ApplicationFormData) => Promise<void> | void;
}

export interface ApplicationFormData {
  officeHourId: string;
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
  applications,
  consultants,
  agendas,
  isRealtimeDataLoading = false,
  allowedWeekdays = ["TUE", "THU"],
  remainingInternalTickets,
  remainingExternalTickets,
  currentApplicant,
  preselectedDateKey,
  layout = "page",
  onBack,
  onSubmit,
}: RegularApplicationWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => {
    const initialDate = preselectedDateKey ? parseLocalDateKey(preselectedDateKey) : null
    return initialDate ?? undefined
  });
  const [selectedTime, setSelectedTime] = useState("");
  const [sessionFormat, setSessionFormat] = useState<SessionFormat>("online");
  const [selectedOfficeHourId, setSelectedOfficeHourId] = useState(officeHour.id);
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
  const [showCompactReview, setShowCompactReview] = useState(false);

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
  const fixedDateOfficeHours = useMemo(() => {
    if (!preselectedDateKey) return [officeHour];
    const matched = officeHours.filter((item) => (item.availableDates ?? []).includes(preselectedDateKey));
    return matched.length > 0 ? matched : [officeHour];
  }, [officeHour, officeHours, preselectedDateKey]);
  const activeOfficeHour = useMemo(
    () =>
      fixedDateOfficeHours.find((item) => item.id === selectedOfficeHourId)
      ?? fixedDateOfficeHours[0]
      ?? officeHour,
    [fixedDateOfficeHours, officeHour, selectedOfficeHourId],
  );
  const programOfficeHours = activeOfficeHour.programId
    ? officeHours.filter((item) => item.programId === activeOfficeHour.programId)
    : [activeOfficeHour];
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
  const hasFixedDateSelection = Boolean(preselectedDateKey && selectedDate);
  const isSheetLayout = layout === "sheet";
  const availableDateKeys = useMemo(() => {
    const keys = new Set<string>();

    programOfficeHours.forEach((item) => {
      (item.availableDates ?? []).forEach((date) => {
        const parsedDate = parseLocalDateKey(date);
        if (!parsedDate) return;
        const normalizedDate = formatLocalDateKey(parsedDate);
        const dayOfWeek = parsedDate.getDay();
        if (!allowedWeekdayNumbers.has(dayOfWeek)) return;
        if (selectedAgendaId) {
          const hasAnyAssignableTime = getTimeSlots(normalizedDate).some(
            (timeSlot) =>
              !isPastScheduledStart(normalizedDate, timeSlot.time) &&
              getAssignableConsultantsAt({
                consultants,
                applications,
                agendaId: selectedAgendaId,
                dateKey: normalizedDate,
                time: timeSlot.time,
              }).length > 0,
          );
          if (!hasAnyAssignableTime) return;
        }
        if (isBefore(parsedDate, todayStart) && !hasFixedDateSelection) {
          return;
        }
        keys.add(normalizedDate);
      });
    });

    return keys;
  }, [
    allowedWeekdayNumbers,
    applications,
    consultants,
    programOfficeHours,
    selectedAgendaId,
    todayStart,
    hasFixedDateSelection,
  ]);
  const timeSlots = selectedDate ? (() => {
    const selectedDateKey = format(selectedDate, "yyyy-MM-dd");

    return getTimeSlots(selectedDateKey).map((slot) => {
      const assignableConsultants =
        selectedAgendaId.length > 0
          ? getAssignableConsultantsAt({
              consultants,
              applications,
              agendaId: selectedAgendaId,
              dateKey: selectedDateKey,
              time: slot.time,
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
      const available = consultantAssignable && futureSchedulable && !applicantConflict;
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
            : slot.reason,
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
          officeHourId: activeOfficeHour.id,
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
  const isScheduleDataLoading = isRealtimeDataLoading;

  useEffect(() => {
    if (isExternalAgendaSelected && sessionFormat !== "online") {
      setSessionFormat("online");
    }
  }, [isExternalAgendaSelected, sessionFormat]);

  useEffect(() => {
    const initialDate = preselectedDateKey ? parseLocalDateKey(preselectedDateKey) : null
    setSelectedDate(initialDate ?? undefined)
    setSelectedTime("")
    setSelectedOfficeHourId(officeHour.id)
    setShowCompactReview(false)
  }, [preselectedDateKey, officeHour.id])

  useEffect(() => {
    if (fixedDateOfficeHours.some((item) => item.id === selectedOfficeHourId)) return
    const fallbackOfficeHour = fixedDateOfficeHours[0]
    if (!fallbackOfficeHour) return
    setSelectedOfficeHourId(fallbackOfficeHour.id)
  }, [fixedDateOfficeHours, selectedOfficeHourId])

  useEffect(() => {
    setShowCompactReview(false)
  }, [selectedOfficeHourId, selectedAgendaId, selectedDate, selectedTime, sessionFormat, requestContent, files.length])

  useEffect(() => {
    if (!selectedDate) return;
    const selectedDateKey = formatLocalDateKey(selectedDate);
    if (preselectedDateKey && selectedDateKey === preselectedDateKey) {
      setSelectedTime((currentTime) => {
        if (!currentTime) return currentTime;
        const matchingTimeSlot = timeSlots.find((slot) => slot.time === currentTime);
        return matchingTimeSlot?.available ? currentTime : "";
      });
      return;
    }
    if (availableDateKeys.has(selectedDateKey)) return;
    setSelectedDate(undefined);
    setSelectedTime("");
  }, [availableDateKeys, preselectedDateKey, selectedDate, timeSlots]);

  const canSubmitCompact =
    Boolean(selectedAgendaId) &&
    Boolean(selectedDate) &&
    Boolean(selectedTime) &&
    Boolean(sessionFormat) &&
    isRequestSectionStepValid &&
    !isScheduleDataLoading;

  if (isSheetLayout) {
    return (
      <div className="animate-in fade-in slide-in-from-right-4 flex min-h-0 flex-1 flex-col duration-300">
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

        <div className="border-b border-slate-200 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Regular Office Hour
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">
            {showCompactReview ? "신청 내용 확인" : "바로 신청"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{activeOfficeHour.title}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {showCompactReview ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">사업</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{activeOfficeHour.title}</p>
                  </div>
                  <div className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-2 border-t border-slate-200 pt-3 text-[13px] leading-5">
                    <span className="font-medium text-slate-500">일정</span>
                    <span className="font-semibold text-slate-900">
                      {selectedDate ? format(selectedDate, "M월 d일 (E)", { locale: ko }) : "-"}
                      {selectedTime ? ` · ${selectedTime}` : ""}
                    </span>
                    <span className="font-medium text-slate-500">아젠다</span>
                    <span className="text-slate-800">{agendaName || "-"}</span>
                    <span className="font-medium text-slate-500">진행</span>
                    <span className="text-slate-800">
                      {sessionFormat === "online" ? "온라인" : "오프라인"}
                    </span>
                    <span className="font-medium text-slate-500">첨부</span>
                    <span className="text-slate-800">
                      {files.length > 0 ? `${files.length}개 파일` : "없음"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">요청 내용</p>
                <div className="mt-3 divide-y divide-slate-100 text-sm">
                  {requestSectionValidations.map(({ key, label, value }) => (
                    <div key={key} className="py-3 first:pt-0 last:pb-0">
                      <p className="text-xs font-semibold tracking-[0.04em] text-slate-500">{label}</p>
                      <p className="mt-1 whitespace-pre-wrap leading-6 text-slate-800">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <Label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  선택 날짜
                </Label>
                <p className="mt-2 text-base font-semibold text-slate-900">
                  {selectedDate
                    ? format(selectedDate, "yyyy년 M월 d일 (E)", { locale: ko })
                    : "캘린더에서 날짜를 선택해주세요"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  날짜를 바꾸려면 캘린더에서 다시 선택하세요.
                </p>
              </div>

              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">1. 사업 선택</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    같은 날짜에 가능한 사업이 여러 개면 먼저 신청할 사업을 고르세요.
                  </p>
                </div>
                <Select
                  value={selectedOfficeHourId}
                  onValueChange={(value) => {
                    setSelectedOfficeHourId(value)
                    setSelectedAgendaId("")
                    setSelectedTime("")
                  }}
                >
                  <SelectTrigger data-testid="regular-officehour-trigger">
                    <SelectValue placeholder="사업을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {fixedDateOfficeHours.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </section>

              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">2. 아젠다 선택</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    이 일정에서 상담받고 싶은 주제를 선택하세요.
                  </p>
                </div>
                <Select
                  value={selectedAgendaId}
                  onValueChange={(value) => {
                    setSelectedAgendaId(value);
                    setSelectedTime("");
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
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    활성 아젠다가 없습니다. 관리자에게 아젠다 활성화를 요청해주세요.
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">3. 가능 시간 선택</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    선택한 날짜와 아젠다 기준으로 가능한 시간만 보여줍니다.
                  </p>
                </div>
                {!selectedAgendaId ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    먼저 아젠다를 선택해주세요.
                  </div>
                ) : isScheduleDataLoading ? (
                  <div className="flex min-h-[180px] items-center justify-center rounded-2xl border bg-slate-50">
                    <div className="flex flex-col items-center gap-3 text-center text-sm text-slate-500">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700" />
                      <p>최신 가능 시간을 불러오는 중입니다.</p>
                    </div>
                  </div>
                ) : selectedDate ? (
                  <div className="grid grid-cols-2 gap-2">
                    {timeSlots.map((slot) => (
                      <button
                        key={slot.time}
                        data-testid={`regular-time-slot-${slot.time.replace(":", "-")}`}
                        disabled={!slot.available}
                        onClick={() => {
                          setSelectedTime(slot.time);
                        }}
                        className={cn(
                          "rounded-2xl border px-3 py-3 text-left text-sm transition-colors",
                          !slot.available && "cursor-not-allowed bg-slate-50 text-slate-400",
                          slot.available && selectedTime === slot.time && "border-slate-900 bg-slate-900 text-white",
                          slot.available && selectedTime !== slot.time && "bg-white hover:border-slate-400 hover:bg-slate-50"
                        )}
                        title={slot.reason}
                      >
                        <div className="font-semibold">{slot.time}</div>
                        <div className="mt-1 text-[11px] leading-4">
                          {slot.available ? "신청 가능" : slot.reason}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    캘린더에서 날짜를 먼저 선택해주세요.
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">4. 진행 형태</h3>
                </div>
                <RadioGroup
                  value={sessionFormat}
                  onValueChange={(v) => {
                    const nextFormat = v as SessionFormat;
                    if (isExternalAgendaSelected && nextFormat === "offline") return;
                    setSessionFormat(nextFormat);
                  }}
                >
                  <div className="grid grid-cols-1 gap-3">
                    <div className={cn(
                      "rounded-2xl border px-4 py-4 transition-colors",
                      sessionFormat === "online" && "border-slate-900 bg-slate-900 text-white"
                    )}>
                      <div className="flex items-start gap-3">
                        <RadioGroupItem value="online" id="online-sheet" />
                        <div>
                          <Label htmlFor="online-sheet" className="cursor-pointer">온라인</Label>
                          <p className={cn("mt-1 text-sm", sessionFormat === "online" ? "text-slate-200" : "text-slate-500")}>
                            확정 후 화상 회의 링크를 전송합니다.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className={cn(
                      "rounded-2xl border px-4 py-4 transition-colors",
                      sessionFormat === "offline" && "border-slate-900 bg-slate-900 text-white",
                      isExternalAgendaSelected && "cursor-not-allowed opacity-60"
                    )}>
                      <div className="flex items-start gap-3">
                        <RadioGroupItem value="offline" id="offline-sheet" disabled={isExternalAgendaSelected} />
                        <div>
                          <Label htmlFor="offline-sheet" className={cn("cursor-pointer", isExternalAgendaSelected && "cursor-not-allowed")}>
                            오프라인
                          </Label>
                          <p className={cn("mt-1 text-sm", sessionFormat === "offline" ? "text-slate-200" : "text-slate-500")}>
                            서울시 종로구 청계천로 123 MYSC 오피스
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </RadioGroup>
              </section>

              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">5. 요청 내용</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    수정 시에도 그대로 다시 사용할 수 있도록 구조화해서 입력합니다.
                  </p>
                </div>
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
                      className="min-h-[104px] rounded-2xl"
                    />
                    <p className={cn("text-xs", isValid ? "text-emerald-600" : "text-rose-600")}>
                      {length}/{REQUEST_SECTION_MIN_LENGTH}자
                    </p>
                  </div>
                ))}
                <div className="space-y-2">
                  <Label>파일 첨부</Label>
                  <FileUpload files={files} onFilesChange={setFiles} />
                </div>
              </section>
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 bg-white px-6 py-4">
          <div className="flex gap-3">
            {showCompactReview ? (
              <>
                <Button variant="outline" className="flex-1" onClick={() => setShowCompactReview(false)}>
                  수정하기
                </Button>
                <Button
                  data-testid="regular-wizard-submit"
                  className="flex-1"
                  onClick={handleSubmit}
                  disabled={!canSubmitCompact || isSubmitting}
                  loading={isSubmitting}
                >
                  제출하기
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" className="flex-1" onClick={onBack}>
                  닫기
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => setShowCompactReview(true)}
                  disabled={!canSubmitCompact}
                >
                  다음
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

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
        <p className="text-sm text-muted-foreground">{activeOfficeHour.title}</p>
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
            <div className="space-y-6 min-h-0">
              <div>
                <h3 className="mb-4">
                  {hasFixedDateSelection ? "선택한 날짜의 시간을 선택하세요" : "날짜와 시간을 선택하세요"}
                </h3>
                <div className="max-h-[min(720px,calc(100dvh-18rem))] overflow-y-auto pr-1">
                  <div className="grid items-start gap-6 lg:grid-cols-[minmax(320px,360px)_minmax(0,1fr)]">
                    {!hasFixedDateSelection && (
                      <div className="min-w-0">
                      <Label className="mb-3 block">신청 가능한 날짜</Label>
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(date) => {
                          setSelectedDate(date);
                          setSelectedTime("");
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
                    )}

                    <div className="min-w-0">
                      {hasFixedDateSelection && selectedDate && (
                        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                          <Label className="mb-1 block">선택한 날짜</Label>
                          <p className="text-sm text-slate-700">
                            {format(selectedDate, "yyyy년 M월 d일 (E)", { locale: ko })}
                          </p>
                        </div>
                      )}
                      <Label className="mb-3 block">시간 선택</Label>
                      {isScheduleDataLoading ? (
                        <div className="flex min-h-[320px] items-center justify-center rounded-md border bg-slate-50">
                          <div className="flex flex-col items-center gap-3 text-center text-sm text-slate-500">
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700" />
                            <p>최신 신청 현황과 가능 시간을 불러오는 중입니다.</p>
                          </div>
                        </div>
                      ) : selectedDate ? (
                        <div className="grid grid-cols-2 gap-2">
                          {timeSlots.map((slot) => (
                            <button
                              key={slot.time}
                              data-testid={`regular-time-slot-${slot.time.replace(":", "-")}`}
                              disabled={!slot.available}
                              onClick={() => {
                                setSelectedTime(slot.time);
                              }}
                              className={cn(
                                "rounded-lg border p-3 text-left text-sm transition-colors",
                                !slot.available &&
                                  "cursor-not-allowed bg-gray-50 opacity-50",
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
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {slot.reason}
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="flex min-h-[320px] items-center justify-center rounded-md border border-dashed bg-slate-50/80 px-4 text-center text-sm text-slate-500">
                          신청 가능한 날짜를 먼저 선택해주세요.
                        </div>
                      )}
                    </div>
                  </div>
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
                disabled={!isStepValid() || (currentStep === 2 && isScheduleDataLoading)}
              >
                다음
              </Button>
            ) : (
              <Button
                data-testid="regular-wizard-submit"
                onClick={handleSubmit}
                disabled={isSubmitting}
                loading={isSubmitting}
              >
                신청 제출
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
