import { useMemo, useState } from "react";
import { ArrowLeft, Calendar as CalendarIcon, Check, AlertCircle } from "lucide-react";
import { Button } from "@/redesign/app/components/ui/button";
import { Card, CardContent } from "@/redesign/app/components/ui/card";
import { Stepper } from "@/redesign/app/components/stepper";
import { Label } from "@/redesign/app/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/redesign/app/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/redesign/app/components/ui/select";
import { Textarea } from "@/redesign/app/components/ui/textarea";
import { FileUpload } from "@/redesign/app/components/file-upload";
import { Calendar } from "@/redesign/app/components/ui/calendar";
import { Agenda, Application, Consultant, RegularOfficeHour, SessionFormat, FileItem } from "@/redesign/app/lib/types";
import { getTimeSlots } from "@/redesign/app/lib/data";
import { format, isBefore, parseISO, startOfDay } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/redesign/app/components/ui/utils";

interface RegularApplicationWizardProps {
  officeHour: RegularOfficeHour;
  officeHours: RegularOfficeHour[];
  applications: Application[];
  consultants: Consultant[];
  agendas: Agenda[];
  onBack: () => void;
  onSubmit: (data: ApplicationFormData) => void;
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

const steps = [
  "아젠다 선택",
  "날짜/시간 선택",
  "진행 형태",
  "요청 내용",
  "최종 확인",
];

export function RegularApplicationWizard({
  officeHour,
  officeHours,
  applications,
  consultants,
  agendas,
  onBack,
  onSubmit,
}: RegularApplicationWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState<string | undefined>();
  const [sessionFormat, setSessionFormat] = useState<SessionFormat>("online");
  const [selectedAgendaId, setSelectedAgendaId] = useState("");
  const [requestContent, setRequestContent] = useState("");
  const [files, setFiles] = useState<FileItem[]>([]);

  const blockedAgendaTimes = new Set<string>();
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
  const selectedAgenda = agendas.find((agenda) => agenda.id === selectedAgendaId);
  const agendaName = selectedAgenda?.name;
  const todayStart = startOfDay(new Date());
  const availableDateKeys = new Set(
    programOfficeHours
      .flatMap((item) => item.availableDates ?? [])
      .map((date) => format(parseISO(date), "yyyy-MM-dd"))
  );
  if (selectedAgenda && selectedDate) {
    const selectedDateKey = format(selectedDate, "yyyy-MM-dd");
    applications.forEach((application) => {
      if (application.type !== "regular") return;
      if (application.agendaId) {
        if (application.agendaId !== selectedAgenda.id) return;
      } else if (application.agenda !== selectedAgenda.name) {
        return;
      }
      if (
        application.status !== "pending"
        && application.status !== "review"
        && application.status !== "confirmed"
        && application.status !== "completed"
      ) {
        return;
      }
      if (application.scheduledDate !== selectedDateKey) return;
      if (application.scheduledTime) {
        blockedAgendaTimes.add(application.scheduledTime);
      }
    });
  }

  const timeSlots = selectedDate ? (() => {
    const selectedDateKey = format(selectedDate, "yyyy-MM-dd");
    const slotsForDate = programOfficeHours.flatMap((item) =>
      item.slots?.filter((slot) => slot.date === selectedDateKey) ?? []
    );
    const availabilityRequired = consultantPool.length > 0;
    const dayAvailabilityList = availabilityRequired
      ? consultantPool.map((consultant) =>
        consultant.availability.find((day) => day.dayOfWeek === selectedDate.getDay())
      )
      : [];

    if (slotsForDate.length > 0) {
      const byTime = new Map<string, { hasOpen: boolean; slotId?: string }>();
      slotsForDate.forEach((slot) => {
        const existing = byTime.get(slot.startTime);
        const isOpen = slot.status === "open";
        if (!existing) {
          byTime.set(slot.startTime, { hasOpen: isOpen, slotId: slot.id });
          return;
        }
        byTime.set(slot.startTime, {
          hasOpen: existing.hasOpen || isOpen,
          slotId: isOpen ? slot.id : existing.slotId ?? slot.id,
        });
      });

      return Array.from(byTime.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([time, meta]) => {
          const blockedByAgenda = blockedAgendaTimes.has(time);
          const consultantAvailable = availabilityRequired
            ? dayAvailabilityList.some((availability) =>
              availability?.slots.some(
                (slotAvailability) =>
                  slotAvailability.start === time && slotAvailability.available
              )
            )
            : true;
          const available = meta.hasOpen && !blockedByAgenda && consultantAvailable;
          return {
            time,
            available,
            reason: available
              ? undefined
              : blockedByAgenda
                ? "이미 예약된 시간입니다"
                : consultantAvailable
                  ? "예약 불가한 시간입니다"
                  : "컨설턴트 가능 시간이 아닙니다",
            slotId: meta.slotId,
          };
        });
    }

    return getTimeSlots(selectedDate.toISOString()).map((slot) => {
      const blockedByAgenda = blockedAgendaTimes.has(slot.time);
      const consultantAvailable = availabilityRequired
        ? consultantPool.some((consultant) =>
          consultant.availability
            .find((day) => day.dayOfWeek === selectedDate.getDay())
            ?.slots.some(
              (slotAvailability) =>
                slotAvailability.start === slot.time && slotAvailability.available
            )
        )
        : true;
      return {
        ...slot,
        available: slot.available && !blockedByAgenda && consultantAvailable,
        reason: blockedByAgenda
          ? "이미 예약된 시간입니다"
          : consultantAvailable
            ? slot.reason
            : "컨설턴트 가능 시간이 아닙니다",
        slotId: undefined,
      };
    });
  })() : [];

  const isStepValid = () => {
    switch (currentStep) {
      case 1:
        return linkedAgendas.length > 0 && selectedAgendaId;
      case 2:
        return selectedDate && selectedTime;
      case 3:
        return sessionFormat;
      case 4:
        return requestContent.trim().length > 0;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = () => {
    if (!selectedDate) return;
    
    onSubmit({
      officeHourId: officeHour.id,
      slotId: selectedSlotId,
      date: selectedDate,
      time: selectedTime,
      sessionFormat,
      agendaId: selectedAgendaId,
      requestContent,
      files,
    });
  };
  const linkedAgendas = agendas.filter((agenda) => {
    if (!(officeHour.agendaIds ?? []).includes(agenda.id)) return false;
    return (consultantsByAgendaId.get(agenda.id) ?? []).length > 0;
  });

  return (
    <div className="p-8 space-y-6">
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
                    disabled={linkedAgendas.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="아젠다를 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {linkedAgendas.map((agenda) => (
                        <SelectItem key={agenda.id} value={agenda.id}>
                          {agenda.name} · {agenda.scope === "internal" ? "내부" : "외부"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {linkedAgendas.length === 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                      연결된 아젠다가 없습니다. 관리자에게 사업의 아젠다 설정을 요청해주세요.
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
                <RadioGroup value={sessionFormat} onValueChange={(v) => setSessionFormat(v as SessionFormat)}>
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
                      sessionFormat === "offline" && "border-primary bg-primary/5"
                    )}>
                      <RadioGroupItem value="offline" id="offline" />
                      <div className="flex-1">
                        <Label htmlFor="offline" className="cursor-pointer">
                          오프라인 (대면 미팅)
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          주소: 서울시 종로구 청계천로 123 MYSC 오피스
                        </p>
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
                  요청 내용을 구체적으로 작성해 주세요.
                </p>
                <Textarea
                  value={requestContent}
                  onChange={(e) => setRequestContent(e.target.value)}
                  placeholder="예시:&#10;&#10;1. 기업/프로젝트 기본 정보&#10;2. 현재 상황 및 배경&#10;3. 당면한 문제/과제&#10;4. 요청 사항"
                  className="min-h-[200px]"
                />
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
                    <p className="text-sm whitespace-pre-wrap">
                      {requestContent}
                    </p>
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
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 1}
            >
              이전
            </Button>
            {currentStep < steps.length ? (
              <Button onClick={handleNext} disabled={!isStepValid()}>
                다음
              </Button>
            ) : (
              <Button onClick={handleSubmit}>신청 제출</Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
