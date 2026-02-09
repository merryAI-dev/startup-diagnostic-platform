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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { SessionFormat, FileItem } from "../../lib/types";
import { agendas } from "../../lib/data";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "../ui/utils";

interface IrregularApplicationWizardProps {
  onBack: () => void;
  onSubmit: (data: IrregularApplicationFormData) => void;
}

export interface IrregularApplicationFormData {
  projectName: string;
  isInternal: boolean;
  agendaId: string;
  periodFrom: Date;
  periodTo: Date;
  sessionFormat: SessionFormat;
  requestContent: string;
  files: FileItem[];
}

const steps = [
  "프로젝트 선택",
  "컨설팅 유형",
  "아젠다 선택",
  "희망 기간",
  "최종 확인",
];

export function IrregularApplicationWizard({
  onBack,
  onSubmit,
}: IrregularApplicationWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [projectName, setProjectName] = useState("MYSC EMA");
  const [isInternal, setIsInternal] = useState(true);
  const [selectedAgendaId, setSelectedAgendaId] = useState("");
  const [periodFrom, setPeriodFrom] = useState<Date | undefined>();
  const [periodTo, setPeriodTo] = useState<Date | undefined>();
  const [sessionFormat, setSessionFormat] = useState<SessionFormat>("online");
  const [requestContent, setRequestContent] = useState("");
  const [files, setFiles] = useState<FileItem[]>([]);

  const remainingInternalSessions = 3; // Mock data

  const isStepValid = () => {
    switch (currentStep) {
      case 1:
        return projectName.trim().length > 0;
      case 2:
        return true;
      case 3:
        return selectedAgendaId.length > 0;
      case 4:
        return periodFrom && periodTo && requestContent.trim().length > 0;
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
    if (!periodFrom || !periodTo) return;

    onSubmit({
      projectName,
      isInternal,
      agendaId: selectedAgendaId,
      periodFrom,
      periodTo,
      sessionFormat,
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
        <h1 className="mb-2">비정기 오피스아워 신청</h1>
        <p className="text-sm text-muted-foreground">
          맞춤형 일정으로 컨설팅을 요청하세요
        </p>
      </div>

      <Stepper steps={steps} currentStep={currentStep} />

      <Card>
        <CardContent className="p-8">
          {/* Step 1: Project Selection */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="mb-4">프로젝트를 선택하세요</h3>
                <Label htmlFor="project" className="mb-2 block">
                  프로젝트명
                </Label>
                <Select value={projectName} onValueChange={setProjectName}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MYSC EMA">MYSC EMA</SelectItem>
                    <SelectItem value="임팩트 프로젝트 A">
                      임팩트 프로젝트 A
                    </SelectItem>
                    <SelectItem value="소셜벤처 프로젝트 B">
                      소셜벤처 프로젝트 B
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Step 2: Consulting Type */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="mb-4">컨설팅 유형을 선택하세요</h3>
                <RadioGroup
                  value={isInternal ? "internal" : "external"}
                  onValueChange={(v) => setIsInternal(v === "internal")}
                >
                  <div className="space-y-3">
                    <div
                      className={cn(
                        "flex items-start space-x-3 p-4 rounded-lg border cursor-pointer transition-colors",
                        isInternal && "border-primary bg-primary/5"
                      )}
                    >
                      <RadioGroupItem value="internal" id="internal" />
                      <div className="flex-1">
                        <Label htmlFor="internal" className="cursor-pointer">
                          내부 컨설팅
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          프로그램 참여 기업 대상 (무료)
                        </p>
                        <p className="text-xs text-primary mt-2">
                          잔여 횟수: {remainingInternalSessions}회
                        </p>
                      </div>
                    </div>
                    <div
                      className={cn(
                        "flex items-start space-x-3 p-4 rounded-lg border cursor-pointer transition-colors",
                        !isInternal && "border-primary bg-primary/5"
                      )}
                    >
                      <RadioGroupItem value="external" id="external" />
                      <div className="flex-1">
                        <Label htmlFor="external" className="cursor-pointer">
                          외부 컨설팅
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          별도 비용 발생 (견적 협의)
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

          {/* Step 4: Period and Content */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <h3 className="mb-4">희망 기간을 선택하세요</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <Label className="mb-2 block">시작일</Label>
                    <Calendar
                      mode="single"
                      selected={periodFrom}
                      onSelect={setPeriodFrom}
                      disabled={(date) => date < new Date()}
                      className="rounded-md border"
                    />
                  </div>
                  <div>
                    <Label className="mb-2 block">종료일</Label>
                    <Calendar
                      mode="single"
                      selected={periodTo}
                      onSelect={setPeriodTo}
                      disabled={(date) =>
                        date < new Date() ||
                        (periodFrom ? date < periodFrom : false)
                      }
                      className="rounded-md border"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="mb-4">진행 형태를 선택하세요</h3>
                <RadioGroup
                  value={sessionFormat}
                  onValueChange={(v) => setSessionFormat(v as SessionFormat)}
                >
                  <div className="space-y-3">
                    <div
                      className={cn(
                        "flex items-start space-x-3 p-4 rounded-lg border cursor-pointer transition-colors",
                        sessionFormat === "online" && "border-primary bg-primary/5"
                      )}
                    >
                      <RadioGroupItem value="online" id="online" />
                      <div className="flex-1">
                        <Label htmlFor="online" className="cursor-pointer">
                          온라인 (화상 회의)
                        </Label>
                      </div>
                    </div>
                    <div
                      className={cn(
                        "flex items-start space-x-3 p-4 rounded-lg border cursor-pointer transition-colors",
                        sessionFormat === "offline" &&
                          "border-primary bg-primary/5"
                      )}
                    >
                      <RadioGroupItem value="offline" id="offline" />
                      <div className="flex-1">
                        <Label htmlFor="offline" className="cursor-pointer">
                          오프라인 (대면 미팅)
                        </Label>
                      </div>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              <div>
                <h3 className="mb-2">요청 내용을 작성하세요</h3>
                <Textarea
                  value={requestContent}
                  onChange={(e) => setRequestContent(e.target.value)}
                  placeholder="컨설팅이 필요한 배경, 당면 과제, 기대하는 결과 등을 자세히 작성해주세요."
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
                    제출 후 담당 컨설턴트가 배정되며, 희망 기간 내에서 일정이
                    조율됩니다.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-primary" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-muted-foreground">프로젝트</Label>
                    <p className="text-sm">{projectName}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-primary" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-muted-foreground">유형</Label>
                    <p className="text-sm">
                      {isInternal ? "내부 컨설팅" : "외부 컨설팅"}
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
                    <CalendarIcon className="w-3 h-3 text-primary" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-muted-foreground">희망 기간</Label>
                    <p className="text-sm">
                      {periodFrom &&
                        format(periodFrom, "M월 d일", { locale: ko })}{" "}
                      ~{" "}
                      {periodTo && format(periodTo, "M월 d일", { locale: ko })}
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
