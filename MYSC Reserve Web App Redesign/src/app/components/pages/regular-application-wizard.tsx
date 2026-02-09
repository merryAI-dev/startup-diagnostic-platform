import { useState } from "react";
import { ArrowLeft, Calendar as CalendarIcon, Check, AlertCircle } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Stepper } from "../stepper";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { FileUpload } from "../file-upload";
import { Calendar } from "../ui/calendar";
import { RegularOfficeHour, SessionFormat, FileItem } from "../../lib/types";
import { agendas, getTimeSlots } from "../../lib/data";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "../ui/utils";

interface RegularApplicationWizardProps {
  officeHour: RegularOfficeHour;
  onBack: () => void;
  onSubmit: (data: ApplicationFormData) => void;
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

const steps = [
  "날짜/시간 선택",
  "진행 형태",
  "아젠다 선택",
  "요청 내용",
  "최종 확인",
];

export function RegularApplicationWizard({
  officeHour,
  onBack,
  onSubmit,
}: RegularApplicationWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState("");
  const [sessionFormat, setSessionFormat] = useState<SessionFormat>("online");
  const [selectedAgendaId, setSelectedAgendaId] = useState("");
  const [requestContent, setRequestContent] = useState("");
  const [files, setFiles] = useState<FileItem[]>([]);

  const availableDates = officeHour.availableDates.map((d) => new Date(d));
  const timeSlots = selectedDate ? getTimeSlots(selectedDate.toISOString()) : [];

  const isStepValid = () => {
    switch (currentStep) {
      case 1:
        return selectedDate && selectedTime;
      case 2:
        return sessionFormat;
      case 3:
        return selectedAgendaId;
      case 4:
        return requestContent.trim().length > 0;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (currentStep < 5) {
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
      date: selectedDate,
      time: selectedTime,
      sessionFormat,
      agendaId: selectedAgendaId,
      requestContent,
      files,
    });
  };

  const selectedAgenda = agendas.find((a) => a.id === selectedAgendaId);

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
          {/* Step 1: Date and Time */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="mb-4">날짜와 시간을 선택하세요</h3>
                <div className="flex gap-8">
                  <div>
                    <Label className="mb-3 block">신청 가능한 날짜</Label>
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      disabled={(date) =>
                        !availableDates.some(
                          (d) => d.toDateString() === date.toDateString()
                        )
                      }
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
                            onClick={() => setSelectedTime(slot.time)}
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

          {/* Step 2: Session Format */}
          {currentStep === 2 && (
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

          {/* Step 3: Agenda */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="mb-4">논의하실 아젠다를 선택하세요</h3>
                <div className="grid grid-cols-2 gap-3">
                  {agendas.map((agenda) => (
                    <button
                      key={agenda.id}
                      onClick={() => setSelectedAgendaId(agenda.id)}
                      className={cn(
                        "p-4 rounded-lg border text-left transition-colors",
                        selectedAgendaId === agenda.id
                          ? "border-primary bg-primary/5"
                          : "hover:border-gray-400"
                      )}
                    >
                      <div className="text-sm mb-1">{agenda.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {agenda.category}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Request Content */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <h3 className="mb-2">요청 내용을 작성하세요</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  컨설턴트가 사전에 검토할 수 있도록 자세히 작성해주세요
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
                    <p className="text-sm">{selectedAgenda?.name}</p>
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
            {currentStep < 5 ? (
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
