import { useEffect, useMemo, useState } from "react";
import { Plus, Send, Edit, Trash2, Copy, Mail, MessageSquare } from "lucide-react";
import { Button } from "@/redesign/app/components/ui/button";
import { Input } from "@/redesign/app/components/ui/input";
import { Label } from "@/redesign/app/components/ui/label";
import { Textarea } from "@/redesign/app/components/ui/textarea";
import { Badge } from "@/redesign/app/components/ui/badge";
import { MessageTemplate, Application } from "@/redesign/app/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/redesign/app/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/redesign/app/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/redesign/app/components/ui/tabs";
import { Checkbox } from "@/redesign/app/components/ui/checkbox";
import { toast } from "sonner";
import {
  buildStageEmailPreview,
  parseRecipientList,
} from "@/redesign/app/lib/stage-email-templates";

const variableLabelMap: Record<string, string> = {
  companyName: "기업명",
  officeHourTypeLabel: "오피스아워 구분",
  programName: "사업명",
  agendaName: "아젠다명",
  scheduledDateTimeLabel: "진행 일정",
  locationTypeLabel: "장소 유형",
  detailLink: "상세 링크",
  officeHourId: "오피스아워 ID",
  arrangedScheduleId: "매칭 일정 ID",
}

function getVariableLabel(variable: string) {
  return variableLabelMap[variable] ?? variable
}

interface AdminCommunicationProps {
  templates: MessageTemplate[];
  applications: Application[];
  programNameById: Map<string, string>;
  onAddTemplate: (data: Omit<MessageTemplate, "id" | "createdAt" | "updatedAt">) => void;
  onUpdateTemplate: (id: string, data: Partial<MessageTemplate>) => void;
  onDeleteTemplate: (id: string) => void;
  onSendBulkMessage: (applicationIds: string[], templateId: string) => void;
  onSendStageTestEmail: (payload: {
    fromEmail: string;
    replyTo?: string | null;
    recipients: string[];
    subject: string;
    text: string;
    html?: string;
  }) => Promise<{
    sentCount: number;
  }>;
  onSendStageSlackDmTest: (payload: {
    userId: string;
    text: string;
  }) => Promise<{
    channel: string | null;
    ts: string | null;
  }>;
  onSendStageSlackChannelAvailabilityTest: (payload: {
    channelId: string;
    monthKey: string;
  }) => Promise<{
    channel: string | null;
    ts: string | null;
    monthKey: string;
    missingCount: number;
    missingConsultants: Array<{
      id: string;
      name: string;
      email: string;
    }>;
    skippedMissingScopeCount: number;
  }>;
}

export function AdminCommunication({
  templates,
  applications,
  programNameById,
  onAddTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onSendBulkMessage,
  onSendStageTestEmail,
  onSendStageSlackDmTest,
  onSendStageSlackChannelAvailabilityTest,
}: AdminCommunicationProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isBulkSendDialogOpen, setIsBulkSendDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
  const [selectedApplicationIds, setSelectedApplicationIds] = useState<string[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [previewTemplate, setPreviewTemplate] = useState<MessageTemplate | null>(null);
  const [selectedStageTemplateId, setSelectedStageTemplateId] = useState<string>("");
  const [selectedStageApplicationId, setSelectedStageApplicationId] = useState<string>("");
  const [stageRecipientsText, setStageRecipientsText] = useState("");
  const [stageFromEmail, setStageFromEmail] = useState("");
  const [stageReplyTo, setStageReplyTo] = useState("");
  const [isStageSending, setIsStageSending] = useState(false);
  const [stageSlackUserId, setStageSlackUserId] = useState("");
  const [stageSlackMessage, setStageSlackMessage] = useState(
    "오피스아워 일지 작성 Slack DM 타겟팅 테스트입니다."
  );
  const [isStageSlackSending, setIsStageSlackSending] = useState(false);
  const [stageSlackChannelId, setStageSlackChannelId] = useState("");
  const [stageSlackMonthKey, setStageSlackMonthKey] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [isStageSlackChannelSending, setIsStageSlackChannelSending] = useState(false);

  const availableApplications = useMemo(
    () => applications.filter((app) => app.status !== "cancelled" && app.status !== "completed"),
    [applications],
  );

  useEffect(() => {
    const firstTemplate = templates[0];
    if (!selectedStageTemplateId && firstTemplate) {
      setSelectedStageTemplateId(firstTemplate.id);
    }
  }, [selectedStageTemplateId, templates]);

  useEffect(() => {
    const firstApplication = availableApplications[0];
    if (!selectedStageApplicationId && firstApplication) {
      setSelectedStageApplicationId(firstApplication.id);
    }
  }, [availableApplications, selectedStageApplicationId]);

  const selectedStageTemplate = useMemo(
    () => templates.find((template) => template.id === selectedStageTemplateId) ?? null,
    [selectedStageTemplateId, templates],
  );
  const selectedStageApplication = useMemo(
    () => availableApplications.find((application) => application.id === selectedStageApplicationId) ?? null,
    [availableApplications, selectedStageApplicationId],
  );
  const stagePreview = useMemo(() => {
    if (!selectedStageTemplate || !selectedStageApplication) {
      return null;
    }

    return buildStageEmailPreview(
      selectedStageTemplate,
      selectedStageApplication,
      selectedStageApplication.programId
        ? (programNameById.get(selectedStageApplication.programId) ?? null)
        : null,
    );
  }, [programNameById, selectedStageApplication, selectedStageTemplate]);

  const handleCreateTemplate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const newTemplate: Omit<MessageTemplate, "id" | "createdAt" | "updatedAt"> = {
      title: formData.get("title") as string,
      category: formData.get("category") as MessageTemplate["category"],
      subject: formData.get("subject") as string,
      content: formData.get("content") as string,
      variables: (formData.get("variables") as string)
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v),
    };

    onAddTemplate(newTemplate);
    setIsCreateDialogOpen(false);
    toast.success("템플릿이 생성되었습니다");
  };

  const handleUpdateTemplate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedTemplate) return;

    const formData = new FormData(e.currentTarget);

    onUpdateTemplate(selectedTemplate.id, {
      title: formData.get("title") as string,
      category: formData.get("category") as MessageTemplate["category"],
      subject: formData.get("subject") as string,
      content: formData.get("content") as string,
      variables: (formData.get("variables") as string)
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v),
    });

    setIsEditDialogOpen(false);
    toast.success("템플릿이 수정되었습니다");
  };

  const handleDeleteTemplate = (id: string) => {
    if (confirm("정말 이 템플릿을 삭제하시겠습니까?")) {
      onDeleteTemplate(id);
      toast.success("템플릿이 삭제되었습니다");
    }
  };

  const handleDuplicateTemplate = (template: MessageTemplate) => {
    onAddTemplate({
      title: `${template.title} (복사본)`,
      category: template.category,
      subject: template.subject,
      content: template.content,
      variables: template.variables,
    });
    toast.success("템플릿이 복사되었습니다");
  };

  const handleBulkSend = () => {
    if (selectedApplicationIds.length === 0) {
      toast.error("메시지를 보낼 신청을 선택해주세요");
      return;
    }
    if (!selectedTemplateId) {
      toast.error("사용할 템플릿을 선택해주세요");
      return;
    }

    onSendBulkMessage(selectedApplicationIds, selectedTemplateId);
    setIsBulkSendDialogOpen(false);
    setSelectedApplicationIds([]);
    setSelectedTemplateId("");
    toast.success(`${selectedApplicationIds.length}건의 메시지가 전송되었습니다`);
  };

  const handleStageEmailFillApplicant = () => {
    if (!selectedStageApplication?.applicantEmail) {
      toast.error("선택한 신청에 신청자 이메일이 없습니다");
      return;
    }
    setStageRecipientsText(selectedStageApplication.applicantEmail);
  };

  const handleStageEmailSend = async () => {
    if (!stagePreview || !selectedStageApplication) {
      toast.error("미리보기 대상 신청과 템플릿을 선택해주세요");
      return;
    }

    const recipients = parseRecipientList(stageRecipientsText);
    if (recipients.length === 0) {
      toast.error("받는 사람 이메일을 1개 이상 입력해주세요");
      return;
    }
    if (!stageFromEmail.trim()) {
      toast.error("발신 이메일을 입력해주세요");
      return;
    }

    setIsStageSending(true);
    try {
      const result = await onSendStageTestEmail({
        fromEmail: stageFromEmail.trim(),
        replyTo: stageReplyTo.trim() || null,
        recipients,
        subject: stagePreview.subject,
        text: stagePreview.text,
        html: stagePreview.html,
      });
      toast.success(`${result.sentCount}건의 stage 이메일을 발송했습니다`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "stage 이메일 발송에 실패했습니다");
    } finally {
      setIsStageSending(false);
    }
  };

  const handleStageSlackDmSend = async () => {
    if (!stageSlackUserId.trim()) {
      toast.error("Slack User ID를 입력해주세요");
      return;
    }
    if (!stageSlackMessage.trim()) {
      toast.error("보낼 메시지를 입력해주세요");
      return;
    }

    setIsStageSlackSending(true);
    try {
      const result = await onSendStageSlackDmTest({
        userId: stageSlackUserId.trim(),
        text: stageSlackMessage.trim(),
      });
      toast.success(`Slack DM 전송 완료${result.channel ? ` (${result.channel})` : ""}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Slack DM 테스트 발송에 실패했습니다");
    } finally {
      setIsStageSlackSending(false);
    }
  };

  const handleStageSlackChannelSend = async () => {
    if (!stageSlackChannelId.trim()) {
      toast.error("Slack Channel ID를 입력해주세요");
      return;
    }
    if (!/^\d{4}-\d{2}$/u.test(stageSlackMonthKey.trim())) {
      toast.error("YYYY-MM 형식의 월을 입력해주세요");
      return;
    }

    setIsStageSlackChannelSending(true);
    try {
      const result = await onSendStageSlackChannelAvailabilityTest({
        channelId: stageSlackChannelId.trim(),
        monthKey: stageSlackMonthKey.trim(),
      });
      toast.success(
        `Slack 채널 알림 전송 완료 (${result.monthKey}, ${result.missingCount}명)`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Slack 채널 테스트 발송에 실패했습니다");
    } finally {
      setIsStageSlackChannelSending(false);
    }
  };

  const toggleApplicationSelection = (id: string) => {
    setSelectedApplicationIds((prev) =>
      prev.includes(id) ? prev.filter((appId) => appId !== id) : [...prev, id]
    );
  };

  const getCategoryBadgeColor = (category: MessageTemplate["category"]) => {
    switch (category) {
      case "confirmation":
        return "bg-blue-100 text-blue-700";
      case "review":
        return "bg-yellow-100 text-yellow-700";
      case "reminder":
        return "bg-purple-100 text-purple-700";
      case "followup":
        return "bg-green-100 text-green-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getCategoryLabel = (category: MessageTemplate["category"]) => {
    switch (category) {
      case "confirmation":
        return "확인";
      case "review":
        return "검토";
      case "reminder":
        return "리마인더";
      case "followup":
        return "팔로우업";
      default:
        return "일반";
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">커뮤니케이션 센터</h1>
            <p className="text-sm text-muted-foreground mt-1">
              메시지 템플릿을 관리하고 일괄 메시지를 전송합니다
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-muted-foreground mb-1">전체 템플릿</div>
          <div className="text-2xl font-bold">{templates.length}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-muted-foreground mb-1">확인 템플릿</div>
          <div className="text-2xl font-bold text-blue-600">
            {templates.filter((t) => t.category === "confirmation").length}
          </div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-muted-foreground mb-1">리마인더 템플릿</div>
          <div className="text-2xl font-bold text-purple-600">
            {templates.filter((t) => t.category === "reminder").length}
          </div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-muted-foreground mb-1">팔로우업 템플릿</div>
          <div className="text-2xl font-bold text-green-600">
            {templates.filter((t) => t.category === "followup").length}
          </div>
        </div>
      </div>

      <Tabs defaultValue="templates" className="w-full space-y-6">
        <TabsList>
          <TabsTrigger value="templates">템플릿 관리</TabsTrigger>
          <TabsTrigger value="bulk">일괄 메시지 전송</TabsTrigger>
          <TabsTrigger value="stage-email">stage 이메일 테스트</TabsTrigger>
          <TabsTrigger value="stage-slack">stage Slack DM 테스트</TabsTrigger>
          <TabsTrigger value="stage-slack-channel">stage Slack 채널 테스트</TabsTrigger>
        </TabsList>

        {/* Templates Tab */}
        <TabsContent value="templates" className="w-full space-y-4">
          <div className="flex justify-end">
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  새 템플릿
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>새 메시지 템플릿</DialogTitle>
                  <DialogDescription>
                    재사용 가능한 메시지 템플릿을 생성합니다
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateTemplate} className="space-y-4">
                  <div>
                    <Label htmlFor="title">템플릿 제목</Label>
                    <Input id="title" name="title" required />
                  </div>
                  <div>
                    <Label htmlFor="category">카테고리</Label>
                    <Select name="category" required>
                      <SelectTrigger>
                        <SelectValue placeholder="카테고리 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="confirmation">확인</SelectItem>
                        <SelectItem value="review">검토</SelectItem>
                        <SelectItem value="reminder">리마인더</SelectItem>
                        <SelectItem value="followup">팔로우업</SelectItem>
                        <SelectItem value="general">일반</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="subject">제목</Label>
                    <Input id="subject" name="subject" required />
                  </div>
                  <div>
                    <Label htmlFor="content">내용</Label>
                    <Textarea
                      id="content"
                      name="content"
                      rows={8}
                      placeholder="{{변수명}}을 사용하여 동적 콘텐츠를 삽입할 수 있습니다"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="variables">변수 (쉼표로 구분)</Label>
                    <Input
                      id="variables"
                      name="variables"
                      placeholder="예: applicantName, sessionDate, consultantName"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      템플릿 내용에서 사용할 변수를 입력하세요
                    </p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsCreateDialogOpen(false)}
                    >
                      취소
                    </Button>
                    <Button type="submit">생성</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {templates.map((template) => (
              <div key={template.id} className="bg-white rounded-lg border p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-gray-900">{template.title}</h3>
                      <Badge
                        variant="secondary"
                        className={getCategoryBadgeColor(template.category)}
                      >
                        {getCategoryLabel(template.category)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-1">
                      <strong>제목:</strong> {template.subject}
                    </p>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {template.content}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPreviewTemplate(template);
                      }}
                    >
                      <MessageSquare className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDuplicateTemplate(template)}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedTemplate(template);
                        setIsEditDialogOpen(true);
                      }}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteTemplate(template.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {template.variables.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground">사용 변수:</span>
                    {template.variables.map((variable, idx) => (
                      <Badge
                        key={idx}
                        variant="outline"
                        className="whitespace-nowrap text-xs"
                        title={variable}
                      >
                        {getVariableLabel(variable)}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Bulk Send Tab */}
        <TabsContent value="bulk" className="w-full space-y-4">
          <div className="space-y-6">
            <div className="rounded-lg border bg-white p-6">
              <h3 className="font-semibold mb-2">템플릿 선택</h3>
              <p className="text-sm text-muted-foreground mb-4">
                먼저 템플릿을 고르고, 아래에서 발송 대상을 선택하세요
              </p>
              <div className="grid gap-4 2xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
                <div>
                  <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                    <SelectTrigger>
                      <SelectValue placeholder="사용할 템플릿을 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.title} ({getCategoryLabel(template.category)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedTemplateId ? (
                  <div className="rounded-lg border bg-gray-50 p-4">
                    {(() => {
                      const template = templates.find((t) => t.id === selectedTemplateId);
                      return template ? (
                        <div>
                          <p className="text-sm font-medium mb-1">미리보기</p>
                          <p className="text-sm text-muted-foreground mb-2">
                            <strong>제목:</strong> {template.subject}
                          </p>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                            {template.content}
                          </p>
                        </div>
                      ) : null;
                    })()}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed bg-gray-50 p-4 text-sm text-muted-foreground">
                    템플릿을 선택하면 제목과 본문 미리보기가 표시됩니다.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border bg-white p-6">
              <h3 className="font-semibold mb-2">신청 선택</h3>
              <p className="text-sm text-muted-foreground mb-4">
                메시지를 보낼 신청을 선택하세요
              </p>

              <div className="space-y-2 max-h-[36rem] overflow-y-auto pr-1">
                {availableApplications.map((app) => (
                  <div
                    key={app.id}
                    className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-gray-50"
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={selectedApplicationIds.includes(app.id)}
                      onCheckedChange={() => toggleApplicationSelection(app.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm">{app.officeHourTitle}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        <span className="break-words">
                          {app.companyName ?? app.applicantName ?? "기업 미지정"}
                        </span>
                        {" · "}
                        <span className="break-words">{app.consultant || "담당자 미지정"}</span>
                        {" · "}
                        <span className="break-words">{app.agenda || "아젠다 미지정"}</span>
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {app.status}
                    </Badge>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-col gap-3 rounded-lg bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-blue-900">
                  {selectedApplicationIds.length > 0
                    ? `${selectedApplicationIds.length}개의 신청이 선택되었습니다`
                    : "선택된 신청이 없습니다"}
                </p>
                <Button
                  onClick={handleBulkSend}
                  disabled={selectedApplicationIds.length === 0 || !selectedTemplateId}
                  className="w-full sm:w-auto"
                >
                  <Send className="w-4 h-4 mr-2" />
                  선택한 {selectedApplicationIds.length}건에 메시지 전송
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="stage-email" className="w-full space-y-4">
          <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
            <div className="space-y-4 rounded-lg border bg-white p-6">
              <div>
                <h3 className="font-semibold text-slate-900">발송 대상 데이터</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  선택한 신청 정보로 placeholder가 자동 치환됩니다
                </p>
              </div>

              <div>
                <Label>템플릿</Label>
                <Select value={selectedStageTemplateId} onValueChange={setSelectedStageTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="템플릿을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>신청</Label>
                <Select value={selectedStageApplicationId} onValueChange={setSelectedStageApplicationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="신청을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableApplications.map((application) => (
                      <SelectItem key={application.id} value={application.id}>
                        {application.companyName ?? application.applicantName ?? "기업 미지정"} · {application.officeHourTitle}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="stage-from-email">발신 이메일</Label>
                <Input
                  id="stage-from-email"
                  placeholder="no-reply@mail.mysc.co.kr"
                  value={stageFromEmail}
                  onChange={(event) => setStageFromEmail(event.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="stage-reply-to">답장 받을 이메일</Label>
                <Input
                  id="stage-reply-to"
                  placeholder="support@mysc.co.kr"
                  value={stageReplyTo}
                  onChange={(event) => setStageReplyTo(event.target.value)}
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label htmlFor="stage-recipients">받는 사람</Label>
                  <Button type="button" variant="outline" size="sm" onClick={handleStageEmailFillApplicant}>
                    신청자 이메일 채우기
                  </Button>
                </div>
                <Textarea
                  id="stage-recipients"
                  rows={5}
                  placeholder={"test1@example.com\ntest2@example.com"}
                  value={stageRecipientsText}
                  onChange={(event) => setStageRecipientsText(event.target.value)}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  쉼표 또는 줄바꿈으로 여러 명을 입력할 수 있으며, 실제 발송은 수신자별 별도 전송으로 처리됩니다.
                </p>
              </div>

              {stagePreview && (
                <div className="rounded-lg border bg-slate-50 p-4">
                  <p className="mb-3 text-sm font-medium text-slate-900">치환 변수</p>
                  <div className="space-y-2 text-xs text-slate-600">
                    {Object.entries(stagePreview.variables).map(([key, value]) => (
                      <div
                        key={key}
                        className="grid grid-cols-[140px_minmax(0,1fr)] items-start gap-3"
                      >
                        <span
                          className="whitespace-nowrap text-slate-500"
                          title={`{{${key}}}`}
                        >
                          {getVariableLabel(key)}
                        </span>
                        <span className="break-all text-right">{value || "-"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4 rounded-lg border bg-white p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-slate-900">메일 미리보기</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    현재 선택값 기준 최종 발송 제목/본문입니다
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={handleStageEmailSend}
                  disabled={!stagePreview || isStageSending}
                >
                  <Mail className="mr-2 h-4 w-4" />
                  {isStageSending ? "발송 중..." : "stage 이메일 발송"}
                </Button>
              </div>

              <div className="rounded-lg border bg-slate-50 p-4">
                <p className="mb-1 text-xs font-medium text-slate-500">제목</p>
                <p className="text-sm font-medium text-slate-900">
                  {stagePreview?.subject ?? "템플릿과 신청을 선택해주세요"}
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <p className="mb-3 text-xs font-medium text-slate-500">본문</p>
                <div className="whitespace-pre-wrap text-sm leading-7 text-slate-800">
                  {stagePreview?.text ?? "미리보기 없음"}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="stage-slack" className="w-full space-y-4">
          <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
            <div className="space-y-4 rounded-lg border bg-white p-6">
              <div>
                <h3 className="font-semibold text-slate-900">Slack DM 대상</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  같은 워크스페이스 사용자의 Slack User ID로 직접 DM을 보냅니다
                </p>
              </div>

              <div>
                <Label htmlFor="stage-slack-user-id">Slack User ID</Label>
                <Input
                  id="stage-slack-user-id"
                  placeholder="U0ABVB219AB"
                  value={stageSlackUserId}
                  onChange={(event) => setStageSlackUserId(event.target.value)}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  프로필 메뉴의 Copy member ID로 확인한 U... 값을 입력하세요.
                </p>
              </div>

              <div>
                <Label htmlFor="stage-slack-message">메시지</Label>
                <Textarea
                  id="stage-slack-message"
                  rows={8}
                  placeholder="Slack DM 테스트 메시지"
                  value={stageSlackMessage}
                  onChange={(event) => setStageSlackMessage(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-4 rounded-lg border bg-white p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-slate-900">발송 미리보기</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Slack DM 타겟팅이 되는지 최소 구성으로 확인합니다
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={handleStageSlackDmSend}
                  disabled={!stageSlackUserId.trim() || !stageSlackMessage.trim() || isStageSlackSending}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  {isStageSlackSending ? "발송 중..." : "stage Slack DM 발송"}
                </Button>
              </div>

              <div className="rounded-lg border bg-slate-50 p-4">
                <p className="mb-1 text-xs font-medium text-slate-500">대상</p>
                <p className="text-sm font-medium text-slate-900">
                  {stageSlackUserId.trim() || "Slack User ID를 입력해주세요"}
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <p className="mb-3 text-xs font-medium text-slate-500">본문</p>
                <div className="whitespace-pre-wrap text-sm leading-7 text-slate-800">
                  {stageSlackMessage.trim() || "메시지를 입력해주세요"}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="stage-slack-channel" className="w-full space-y-4">
          <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
            <div className="space-y-4 rounded-lg border bg-white p-6">
              <div>
                <h3 className="font-semibold text-slate-900">Slack 채널 대상</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  해당 월에 가능시간을 제출하지 않은 활성 내부 컨설턴트의 이메일 목록을 채널로 보냅니다
                </p>
              </div>

              <div>
                <Label htmlFor="stage-slack-channel-id">Slack Channel ID</Label>
                <Input
                  id="stage-slack-channel-id"
                  placeholder="C0123456789"
                  value={stageSlackChannelId}
                  onChange={(event) => setStageSlackChannelId(event.target.value)}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  채널 상세 정보의 Copy channel ID로 확인한 C... 또는 G... 값을 입력하세요.
                </p>
              </div>

              <div>
                <Label htmlFor="stage-slack-month-key">대상 월</Label>
                <Input
                  id="stage-slack-month-key"
                  placeholder="2026-05"
                  value={stageSlackMonthKey}
                  onChange={(event) => setStageSlackMonthKey(event.target.value)}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  `monthlyAvailabilityMeta` 기준으로 미제출자를 계산합니다.
                </p>
              </div>
            </div>

            <div className="space-y-4 rounded-lg border bg-white p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-slate-900">발송 미리보기</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Firestore에서 계산한 결과를 그대로 Slack 채널에 보냅니다
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={handleStageSlackChannelSend}
                  disabled={
                    !stageSlackChannelId.trim() ||
                    !stageSlackMonthKey.trim() ||
                    isStageSlackChannelSending
                  }
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  {isStageSlackChannelSending ? "발송 중..." : "stage Slack 채널 발송"}
                </Button>
              </div>

              <div className="rounded-lg border bg-slate-50 p-4">
                <p className="mb-1 text-xs font-medium text-slate-500">대상 채널</p>
                <p className="text-sm font-medium text-slate-900">
                  {stageSlackChannelId.trim() || "Slack Channel ID를 입력해주세요"}
                </p>
              </div>

              <div className="rounded-lg border bg-slate-50 p-4">
                <p className="mb-1 text-xs font-medium text-slate-500">대상 월</p>
                <p className="text-sm font-medium text-slate-900">
                  {stageSlackMonthKey.trim() || "YYYY-MM 형식으로 입력해주세요"}
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <p className="mb-3 text-xs font-medium text-slate-500">전송 내용</p>
                <div className="whitespace-pre-wrap text-sm leading-7 text-slate-800">
                  {`[stage] ${stageSlackMonthKey.trim() || "YYYY-MM"} 가능시간 미제출 내부 컨설턴트 집계 결과를 채널로 전송합니다.`}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Template Dialog */}
      {selectedTemplate && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>템플릿 수정</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpdateTemplate} className="space-y-4">
              <div>
                <Label htmlFor="edit-title">템플릿 제목</Label>
                <Input
                  id="edit-title"
                  name="title"
                  defaultValue={selectedTemplate.title}
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-category">카테고리</Label>
                <Select name="category" defaultValue={selectedTemplate.category}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confirmation">확인</SelectItem>
                    <SelectItem value="review">검토</SelectItem>
                    <SelectItem value="reminder">리마인더</SelectItem>
                    <SelectItem value="followup">팔로우업</SelectItem>
                    <SelectItem value="general">일반</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-subject">제목</Label>
                <Input
                  id="edit-subject"
                  name="subject"
                  defaultValue={selectedTemplate.subject}
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-content">내용</Label>
                <Textarea
                  id="edit-content"
                  name="content"
                  rows={8}
                  defaultValue={selectedTemplate.content}
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-variables">변수 (쉼표로 구분)</Label>
                <Input
                  id="edit-variables"
                  name="variables"
                  defaultValue={selectedTemplate.variables.join(", ")}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  취소
                </Button>
                <Button type="submit">저장</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Preview Dialog */}
      {previewTemplate && (
        <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{previewTemplate.title}</DialogTitle>
              <DialogDescription>
                <Badge className={getCategoryBadgeColor(previewTemplate.category)}>
                  {getCategoryLabel(previewTemplate.category)}
                </Badge>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>제목</Label>
                <p className="text-sm mt-1">{previewTemplate.subject}</p>
              </div>
              <div>
                <Label>내용</Label>
                <p className="text-sm mt-1 whitespace-pre-wrap">{previewTemplate.content}</p>
              </div>
              {previewTemplate.variables.length > 0 && (
                <div>
                  <Label>사용 변수</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {previewTemplate.variables.map((variable, idx) => (
                      <Badge
                        key={idx}
                        variant="outline"
                        className="whitespace-nowrap"
                        title={variable}
                      >
                        {getVariableLabel(variable)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
