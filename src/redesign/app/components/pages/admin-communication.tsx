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
  buildStageEmailTemplatePreview,
  parseRecipientList,
} from "@/redesign/app/lib/stage-email-templates";

const variableLabelMap: Record<string, string> = {
  companyName: "기업명",
  consultantName: "컨설턴트명",
  officeHourTypeLabel: "오피스아워 구분",
  officeHourTitle: "오피스아워명",
  programName: "사업명",
  agendaName: "아젠다명",
  scheduledDateTimeLabel: "진행 일정",
  applicationScheduleLabel: "신청 일정",
  registrationWindowLabel: "입력 등록 기간",
  locationTypeLabel: "장소 유형",
  detailLink: "상세 링크",
  applicationLink: "신청 링크",
  inputLink: "입력 링크",
  meetingLink: "접속 링크",
  reportLink: "보고서 등록 링크",
  officeHourId: "오피스아워 ID",
  arrangedScheduleId: "매칭 일정 ID",
}

function getVariableLabel(variable: string) {
  return variableLabelMap[variable] ?? variable
}

const biztalkPlaceholderLabelMap: Record<string, string> = {
  companyName: "기업명",
  programName: "사업명",
  agendaName: "주제명",
  scheduledDateTimeLabel: "일시",
  locationTypeLabel: "장소유형",
  detailLink: "링크",
  officeHourTypeLabel: "오피스아워구분",
  officeHourId: "오피스아워ID",
  arrangedScheduleId: "매칭일정ID",
}

function resolveBiztalkTemplateCode(template: MessageTemplate | null) {
  return template?.biztalkTemplateCode?.trim() || ""
}

function convertTemplateContentToBiztalkPlaceholders(content: string) {
  return content.replace(/\{\{\s*([a-zA-Z0-9]+)\s*\}\}/g, (_match, key: string) => {
    const label = biztalkPlaceholderLabelMap[key]
    return label ? `#{${label}}` : _match
  })
}

function extractBiztalkPlaceholders(value: string) {
  const matches = value.match(/#\{[^}]+\}/g) ?? []
  return Array.from(new Set(matches))
}

function applyBiztalkPlaceholders(
  value: string,
  placeholderValues: Record<string, string>,
) {
  return value.replace(/#\{[^}]+\}/g, (placeholder) => {
    const replacement = placeholderValues[placeholder]
    return typeof replacement === "string" && replacement.length > 0 ? replacement : placeholder
  })
}

function createBiztalkMessageId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function extractStageEmailPlaceholders(value: string) {
  const matches = value.match(/\{\{\s*[a-zA-Z0-9]+\s*\}\}/g) ?? []
  return Array.from(new Set(matches))
}

function applyStageEmailPlaceholders(
  value: string,
  placeholderValues: Record<string, string>,
) {
  return value.replace(/\{\{\s*([a-zA-Z0-9]+)\s*\}\}/g, (match, key: string) => {
    const replacement = placeholderValues[key]
    return typeof replacement === "string" && replacement.length > 0 ? replacement : match
  })
}

function parseJsonObjectInput(value: string, fieldLabel: string) {
  const normalized = value.trim()
  if (!normalized) {
    return {}
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(normalized)
  } catch {
    throw new Error(`${fieldLabel} JSON 형식이 올바르지 않습니다.`)
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${fieldLabel}은 JSON 객체여야 합니다.`)
  }

  return parsed as Record<string, unknown>
}

const BIZTALK_TEMPLATE_PAYLOAD_METADATA: Record<
  string,
  {
    title?: string
    attach?: {
      button: Array<{
        name: string
        type: string
      }>
    }
  }
> = {
  officehour_001: {
    title: "#{주제명} 일정 확정",
    attach: {
      button: [{ name: "채널 추가", type: "AC" }],
    },
  },
  officehour_002: {
    title: "#{주제명} 일정 리마인드",
    attach: {
      button: [{ name: "채널 추가", type: "AC" }],
    },
  },
}

const STAGE_EMAIL_FROM_ADDRESS = "no-reply@test.mysc.co.kr"

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
  onSendBiztalkTestAlimtalk: (payload: {
    recipient: string;
    message: string;
    msgIdx?: string;
    title?: string;
    tmpltCode?: string;
    attach?: {
      button: Array<{
        name: string;
        type: string;
      }>;
    };
    dryRun?: boolean;
  }) => Promise<{
    ok: boolean;
    [key: string]: unknown;
  }>;
  onQueryBiztalkAlimtalkResults: (payload: {
    dryRun?: boolean;
    method?: "GET" | "POST";
    payload?: Record<string, unknown>;
    query?: Record<string, string>;
  }) => Promise<{
    ok: boolean;
    [key: string]: unknown;
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
  onSendBiztalkTestAlimtalk,
  onQueryBiztalkAlimtalkResults,
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
  const [selectedStageBiztalkTemplateId, setSelectedStageBiztalkTemplateId] = useState<string>("");
  const [selectedStageApplicationId, setSelectedStageApplicationId] = useState<string>("");
  const [stageRecipientsText, setStageRecipientsText] = useState("");
  const [stageReplyTo, setStageReplyTo] = useState("");
  const [stageEmailPlaceholderValues, setStageEmailPlaceholderValues] = useState<Record<string, string>>({});
  const [isStageSending, setIsStageSending] = useState(false);
  const [stageBiztalkRecipient, setStageBiztalkRecipient] = useState("");
  const [stageBiztalkMessage, setStageBiztalkMessage] = useState("");
  const [stageBiztalkPlaceholderValues, setStageBiztalkPlaceholderValues] = useState<Record<string, string>>({});
  const [isStageBiztalkSending, setIsStageBiztalkSending] = useState(false);
  const [stageBiztalkResultMethod, setStageBiztalkResultMethod] = useState<"GET" | "POST">("GET");
  const [stageBiztalkResultPayload, setStageBiztalkResultPayload] = useState("{}");
  const [stageBiztalkResultQuery, setStageBiztalkResultQuery] = useState("{}");
  const [stageBiztalkResultResponse, setStageBiztalkResultResponse] = useState("");
  const [isStageBiztalkResultLoading, setIsStageBiztalkResultLoading] = useState(false);
  const [stageSlackUserId, setStageSlackUserId] = useState("");
  const [stageSlackMessage, setStageSlackMessage] = useState(
    "오피스아워 일지 작성 Slack DM 타겟팅 테스트입니다."
  );
  const [isStageSlackSending, setIsStageSlackSending] = useState(false);
  const [stageSlackChannelId, setStageSlackChannelId] = useState("C0B1WE3PVFC");
  const [stageSlackMonthKey, setStageSlackMonthKey] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [isStageSlackChannelSending, setIsStageSlackChannelSending] = useState(false);

  const availableApplications = useMemo(
    () => applications.filter((app) => app.status !== "cancelled" && app.status !== "completed"),
    [applications],
  );
  const availableEmailTemplates = useMemo(
    () => templates.filter((template) => template.channel === "email"),
    [templates],
  );
  const availableBiztalkTemplates = useMemo(
    () =>
      templates.filter((template) => {
        const code = template.biztalkTemplateCode?.trim() || ""
        return code === "officehour_001" || code === "officehour_002"
      }),
    [templates],
  );

  useEffect(() => {
    const firstTemplate = availableEmailTemplates[0];
    const hasSelectedTemplate = availableEmailTemplates.some((template) => template.id === selectedStageTemplateId)
    if ((!selectedStageTemplateId || !hasSelectedTemplate) && firstTemplate) {
      setSelectedStageTemplateId(firstTemplate.id);
    }
  }, [availableEmailTemplates, selectedStageTemplateId]);

  useEffect(() => {
    const firstApplication = availableApplications[0];
    const hasSelectedApplication = availableApplications.some(
      (application) => application.id === selectedStageApplicationId,
    )
    if ((!selectedStageApplicationId || !hasSelectedApplication) && firstApplication) {
      setSelectedStageApplicationId(firstApplication.id);
    }
  }, [availableApplications, selectedStageApplicationId]);

  useEffect(() => {
    const firstBiztalkTemplate = availableBiztalkTemplates[0];
    if (!selectedStageBiztalkTemplateId && firstBiztalkTemplate) {
      setSelectedStageBiztalkTemplateId(firstBiztalkTemplate.id);
      setStageBiztalkMessage(convertTemplateContentToBiztalkPlaceholders(firstBiztalkTemplate.content));
      setStageBiztalkPlaceholderValues({});
    }
  }, [availableBiztalkTemplates, selectedStageBiztalkTemplateId]);

  const selectedStageTemplate = useMemo(
    () => availableEmailTemplates.find((template) => template.id === selectedStageTemplateId) ?? null,
    [availableEmailTemplates, selectedStageTemplateId],
  );
  const selectedStageApplication = useMemo(
    () => availableApplications.find((application) => application.id === selectedStageApplicationId) ?? null,
    [availableApplications, selectedStageApplicationId],
  );
  const selectedStageBiztalkTemplate = useMemo(
    () => availableBiztalkTemplates.find((template) => template.id === selectedStageBiztalkTemplateId) ?? null,
    [availableBiztalkTemplates, selectedStageBiztalkTemplateId],
  );
  const stagePreviewTemplate = useMemo(() => {
    if (!selectedStageTemplate) {
      return null;
    }

    return buildStageEmailTemplatePreview(selectedStageTemplate)
  }, [selectedStageTemplate]);
  const stageEmailDetectedPlaceholders = useMemo(
    () => Array.from(new Set([
      ...extractStageEmailPlaceholders(selectedStageTemplate?.subject ?? ""),
      ...extractStageEmailPlaceholders(selectedStageTemplate?.content ?? ""),
    ])),
    [selectedStageTemplate],
  )
  const stagePreview = useMemo(() => {
    if (!stagePreviewTemplate) {
      return null
    }

    return {
      ...stagePreviewTemplate,
      subject: applyStageEmailPlaceholders(stagePreviewTemplate.subject, stageEmailPlaceholderValues),
      text: applyStageEmailPlaceholders(stagePreviewTemplate.text, stageEmailPlaceholderValues),
      html: applyStageEmailPlaceholders(stagePreviewTemplate.html, stageEmailPlaceholderValues),
      variables: Object.fromEntries(
        stageEmailDetectedPlaceholders.map((placeholder) => {
          const key = placeholder.replace(/[{}]/g, "").trim()
          return [key, stageEmailPlaceholderValues[key] ?? placeholder]
        }),
      ),
    }
  }, [stageEmailDetectedPlaceholders, stageEmailPlaceholderValues, stagePreviewTemplate]);

  const selectedStageBiztalkTemplateCode = useMemo(
    () => resolveBiztalkTemplateCode(selectedStageBiztalkTemplate),
    [selectedStageBiztalkTemplate],
  );
  const selectedStageBiztalkPayloadMetadata = useMemo(
    () => BIZTALK_TEMPLATE_PAYLOAD_METADATA[selectedStageBiztalkTemplateCode] ?? null,
    [selectedStageBiztalkTemplateCode],
  );
  const stageBiztalkRawTitle = useMemo(
    () => selectedStageBiztalkPayloadMetadata?.title?.trim() || "",
    [selectedStageBiztalkPayloadMetadata],
  )
  const stageBiztalkTemplateDraft = useMemo(() => {
    if (!selectedStageBiztalkTemplate) {
      return ""
    }

    return convertTemplateContentToBiztalkPlaceholders(selectedStageBiztalkTemplate.content)
  }, [selectedStageBiztalkTemplate]);
  const stageBiztalkDetectedPlaceholders = useMemo(
    () => Array.from(new Set([
      ...extractBiztalkPlaceholders(stageBiztalkMessage),
      ...extractBiztalkPlaceholders(stageBiztalkRawTitle),
    ])),
    [stageBiztalkMessage, stageBiztalkRawTitle],
  )
  const stageBiztalkResolvedMessage = useMemo(
    () => applyBiztalkPlaceholders(stageBiztalkMessage.trim(), stageBiztalkPlaceholderValues),
    [stageBiztalkMessage, stageBiztalkPlaceholderValues],
  );
  const stageBiztalkResolvedTitle = useMemo(
    () => applyBiztalkPlaceholders(stageBiztalkRawTitle, stageBiztalkPlaceholderValues).trim(),
    [stageBiztalkPlaceholderValues, stageBiztalkRawTitle],
  )
  const stageBiztalkResolvedAttach = useMemo(
    () => selectedStageBiztalkPayloadMetadata?.attach,
    [selectedStageBiztalkPayloadMetadata],
  )

  const handleStageBiztalkTemplateChange = (templateId: string) => {
    setSelectedStageBiztalkTemplateId(templateId)
    const nextTemplate = availableBiztalkTemplates.find((template) => template.id === templateId) ?? null
    const nextDraft = nextTemplate ? convertTemplateContentToBiztalkPlaceholders(nextTemplate.content) : ""
    setStageBiztalkMessage(nextDraft)
    setStageBiztalkPlaceholderValues({})
  }

  const handleCreateTemplate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const newTemplate: Omit<MessageTemplate, "id" | "createdAt" | "updatedAt"> = {
      title: formData.get("title") as string,
      category: formData.get("category") as MessageTemplate["category"],
      subject: formData.get("subject") as string,
      content: formData.get("content") as string,
      biztalkTemplateCode: String(formData.get("biztalkTemplateCode") ?? "").trim(),
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
      biztalkTemplateCode: String(formData.get("biztalkTemplateCode") ?? "").trim(),
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
      biztalkTemplateCode: template.biztalkTemplateCode ?? "",
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

  const handleStageEmailSend = async () => {
    if (!stagePreview || !selectedStageTemplate) {
      toast.error("미리보기 대상 템플릿을 선택해주세요");
      return;
    }

    const recipients = parseRecipientList(stageRecipientsText);
    if (recipients.length === 0) {
      toast.error("받는 사람 이메일을 1개 이상 입력해주세요");
      return;
    }

    setIsStageSending(true);
    try {
      const result = await onSendStageTestEmail({
        fromEmail: STAGE_EMAIL_FROM_ADDRESS,
        replyTo: stageReplyTo.trim() || null,
        recipients,
        subject: stagePreview.subject,
        text: stagePreview.text,
        html: stagePreview.html,
      });
      toast.success(`${result.sentCount}건의 이메일 테스트를 발송했습니다`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "이메일 테스트 발송에 실패했습니다");
    } finally {
      setIsStageSending(false);
    }
  };

  const handleStageBiztalkSend = async () => {
    if (!selectedStageBiztalkTemplate) {
      toast.error("BizTalk 템플릿을 선택해주세요");
      return;
    }
    if (!selectedStageBiztalkTemplateCode.trim()) {
      toast.error("선택한 템플릿에 BizTalk 템플릿 코드가 없습니다");
      return;
    }
    if (!stageBiztalkRecipient.trim()) {
      toast.error("수신번호를 입력해주세요");
      return;
    }
    if (!stageBiztalkResolvedMessage.trim()) {
      toast.error("보낼 message 본문을 입력해주세요");
      return;
    }

    const msgIdx = createBiztalkMessageId()
    const resultQuery = { msgIdx }
    setStageBiztalkResultMethod("GET")
    setStageBiztalkResultQuery(JSON.stringify(resultQuery, null, 2))
    setStageBiztalkResultPayload("{}")
    setStageBiztalkResultResponse("")

    setIsStageBiztalkSending(true);
    try {
      const result = await onSendBiztalkTestAlimtalk({
        recipient: stageBiztalkRecipient.trim(),
        message: stageBiztalkResolvedMessage,
        msgIdx,
        ...(stageBiztalkResolvedTitle ? { title: stageBiztalkResolvedTitle } : {}),
        tmpltCode: selectedStageBiztalkTemplateCode.trim() || undefined,
        ...(stageBiztalkResolvedAttach ? { attach: stageBiztalkResolvedAttach } : {}),
        dryRun: false,
      });
      toast.success(`BizTalk 발송 요청 완료${result.ok ? "" : " (응답 확인 필요)"}`)
      setIsStageBiztalkResultLoading(true)

      let latestResult: Record<string, unknown> | null = null
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const queryResult = await onQueryBiztalkAlimtalkResults({
          method: "GET",
          query: resultQuery,
          payload: {},
        })
        latestResult = queryResult
        setStageBiztalkResultResponse(JSON.stringify(queryResult, null, 2))

        const responseItems = Array.isArray((queryResult as { upstreamBody?: { response?: unknown[] } }).upstreamBody?.response)
          ? ((queryResult as { upstreamBody?: { response?: Array<Record<string, unknown>> } }).upstreamBody?.response ?? [])
          : []
        const matchedResult = responseItems.find((item) => String(item.msgIdx || "") === msgIdx)
        if (matchedResult) {
          const resultCode = String(matchedResult.resultCode || "")
          if (resultCode === "1000") {
            toast.success("BizTalk 최종 발송 성공")
          } else {
            toast.error(`BizTalk 최종 결과 실패 (${resultCode || "unknown"})`)
          }
          return
        }

        await delay(1200)
      }

      if (latestResult) {
        setStageBiztalkResultResponse(JSON.stringify(latestResult, null, 2))
      }
      toast.message("BizTalk 결과가 아직 확정되지 않았습니다. 잠시 후 다시 확인해주세요.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "BizTalk 테스트 발송에 실패했습니다");
    } finally {
      setIsStageBiztalkSending(false);
      setIsStageBiztalkResultLoading(false)
    }
  };

  const handleStageBiztalkResultQuery = async () => {
    let payload: Record<string, unknown>
    let query: Record<string, string>

    try {
      payload = parseJsonObjectInput(stageBiztalkResultPayload, "결과조회 payload")
      const rawQuery = parseJsonObjectInput(stageBiztalkResultQuery, "결과조회 query")
      query = Object.fromEntries(
        Object.entries(rawQuery).map(([key, value]) => [key, typeof value === "string" ? value : String(value)])
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "결과조회 입력값이 올바르지 않습니다")
      return
    }

    setIsStageBiztalkResultLoading(true)
    try {
      const result = await onQueryBiztalkAlimtalkResults({
        method: stageBiztalkResultMethod,
        payload,
        query,
      })
      setStageBiztalkResultResponse(JSON.stringify(result, null, 2))
      toast.success("BizTalk 결과 조회를 완료했습니다")
    } catch (error) {
      const message = error instanceof Error ? error.message : "BizTalk 결과 조회에 실패했습니다"
      setStageBiztalkResultResponse(message)
      toast.error(message)
    } finally {
      setIsStageBiztalkResultLoading(false)
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
    <div className="mx-auto w-full max-w-[1600px] min-w-0 p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">커뮤니케이션 센터</h1>
            <p className="text-sm text-muted-foreground mt-1">
              stage 발송 경로와 외부 메시지 연동을 테스트합니다
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="stage-biztalk" className="w-full min-w-0 space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 p-2 md:grid-cols-2 xl:grid-cols-4">
          <TabsTrigger value="stage-email" className="h-10 w-full px-3 text-center">
            이메일 테스트
          </TabsTrigger>
          <TabsTrigger value="stage-biztalk" className="h-10 w-full px-3 text-center">
            stage BizTalk 테스트
          </TabsTrigger>
          <TabsTrigger value="stage-slack" className="h-10 w-full px-3 text-center">
            stage Slack DM 테스트
          </TabsTrigger>
          <TabsTrigger value="stage-slack-channel" className="h-10 w-full px-3 text-center">
            stage Slack 채널 테스트
          </TabsTrigger>
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
                    <Label htmlFor="biztalkTemplateCode">BizTalk 템플릿 코드</Label>
                    <Input
                      id="biztalkTemplateCode"
                      name="biztalkTemplateCode"
                      placeholder="예: officehour_001"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      예: `officehour_001` 일정 확정, `officehour_002` 일정 리마인드, `officehour_003` 컨설턴트 요청사항 전달
                    </p>
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
                    {resolveBiztalkTemplateCode(template) && (
                      <p className="text-xs text-muted-foreground mb-2">
                        <strong>BizTalk:</strong> {resolveBiztalkTemplateCode(template)}
                      </p>
                    )}
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

        <TabsContent value="stage-email" className="w-full min-w-0 space-y-4">
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
                    {availableEmailTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>발신 이메일</Label>
                <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-900">
                  {STAGE_EMAIL_FROM_ADDRESS}
                </div>
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
                <Label htmlFor="stage-recipients">받는 사람</Label>
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

              {stageEmailDetectedPlaceholders.length > 0 ? (
                <div className="rounded-lg border bg-slate-50 p-4">
                  <p className="mb-3 text-sm font-medium text-slate-900">placeholder 값 입력</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {stageEmailDetectedPlaceholders.map((placeholder) => {
                      const key = placeholder.replace(/[{}]/g, "").trim()
                      return (
                        <div key={placeholder}>
                          <Label htmlFor={`stage-email-placeholder-${key}`} className="text-xs text-slate-500">
                            {placeholder}
                          </Label>
                          <Input
                            id={`stage-email-placeholder-${key}`}
                            value={stageEmailPlaceholderValues[key] ?? ""}
                            onChange={(event) =>
                              setStageEmailPlaceholderValues((prev) => ({
                                ...prev,
                                [key]: event.target.value,
                              }))
                            }
                            placeholder={`${placeholder} 값 입력`}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}

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
                  {isStageSending ? "발송 중..." : "이메일 테스트 발송"}
                </Button>
              </div>

              <div className="rounded-lg border bg-slate-50 p-4">
                <p className="mb-1 text-xs font-medium text-slate-500">제목</p>
                <p className="text-sm font-medium text-slate-900">
                  {stagePreview?.subject ?? "템플릿을 선택해주세요"}
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

        <TabsContent value="stage-biztalk" className="w-full min-w-0 space-y-4">
          <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
            <div className="max-h-[calc(100vh-220px)] space-y-4 overflow-y-auto rounded-lg border bg-white p-6">
              <div>
                <h3 className="font-semibold text-slate-900">BizTalk 발송 설정</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  BizTalk 템플릿 목록에서 고른 템플릿명 기준으로 코드와 본문 초안이 함께 매핑됩니다
                </p>
              </div>

              <div>
                <Label>템플릿</Label>
                <Select value={selectedStageBiztalkTemplateId} onValueChange={handleStageBiztalkTemplateChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="템플릿을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBiztalkTemplates.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        등록된 BizTalk 템플릿이 없습니다
                      </div>
                    ) : null}
                    {availableBiztalkTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-2 text-xs text-muted-foreground">
                  `biztalkTemplateCode`가 등록된 템플릿만 노출합니다.
                </p>
              </div>

              <div>
                <Label htmlFor="stage-biztalk-recipient">수신번호</Label>
                <Input
                  id="stage-biztalk-recipient"
                  placeholder="01012345678"
                  value={stageBiztalkRecipient}
                  onChange={(event) => setStageBiztalkRecipient(event.target.value)}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  이 값은 요청 payload에 직접 들어갑니다. `allowlist_only` 정책이면 허용 번호여야 실제 발송됩니다.
                </p>
              </div>

              <div>
                <Label>템플릿 코드</Label>
                <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-900">
                  {selectedStageBiztalkTemplateCode || "매핑된 템플릿 코드 없음"}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  템플릿 선택값에 따라 자동으로 매핑됩니다.
                </p>
              </div>

              {stageBiztalkDetectedPlaceholders.length > 0 ? (
                <div>
                  <Label>placeholder 값 입력</Label>
                  <div className="mt-2 grid gap-3 md:grid-cols-2">
                    {stageBiztalkDetectedPlaceholders.map((placeholder) => (
                      <div key={placeholder}>
                        <Label htmlFor={`biztalk-placeholder-${placeholder}`} className="text-xs text-slate-500">
                          {placeholder}
                        </Label>
                        <Input
                          id={`biztalk-placeholder-${placeholder}`}
                          value={stageBiztalkPlaceholderValues[placeholder] ?? ""}
                          onChange={(event) =>
                            setStageBiztalkPlaceholderValues((prev) => ({
                              ...prev,
                              [placeholder]: event.target.value,
                            }))
                          }
                          placeholder={`${placeholder} 값 입력`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

            </div>

            <div className="space-y-4 rounded-lg border bg-white p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-slate-900">BizTalk 발송 미리보기</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    현재 선택값 기준으로 `message`에 들어갈 최종 본문입니다
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={handleStageBiztalkSend}
                  disabled={!stageBiztalkRecipient.trim() || !stageBiztalkResolvedMessage.trim() || isStageBiztalkSending}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  {isStageBiztalkSending ? "발송 중..." : "BizTalk 발송"}
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border bg-slate-50 p-4">
                  <p className="mb-1 text-xs font-medium text-slate-500">수신번호</p>
                  <p className="text-sm font-medium text-slate-900">
                    {stageBiztalkRecipient.trim() || "수신번호를 입력해주세요"}
                  </p>
                </div>
                <div className="rounded-lg border bg-slate-50 p-4">
                  <p className="mb-1 text-xs font-medium text-slate-500">템플릿 코드</p>
                  <p className="text-sm font-medium text-slate-900">
                    {selectedStageBiztalkTemplateCode || "매핑된 템플릿 코드 없음"}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border p-5">
                <p className="mb-3 text-xs font-medium text-slate-500">message 본문</p>
                <div className="whitespace-pre-wrap text-sm leading-7 text-slate-800">
                  {stageBiztalkResolvedMessage || "미리보기 없음"}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  템플릿 원문은 고정이며, placeholder 입력값에 따라 최종 발송 본문만 바뀝니다.
                </p>
              </div>

              <div className="rounded-lg border border-dashed p-5">
                <div>
                  <h4 className="font-semibold text-slate-900">BizTalk 결과 응답</h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    발송 직후 `/v2/kko/getResultAll` 결과를 자동 조회해 아래에 표시합니다.
                  </p>
                </div>

                <div className="mt-4 rounded-lg border bg-slate-50 p-4">
                  <p className="mb-2 text-xs font-medium text-slate-500">결과 조회 응답</p>
                  <pre className="whitespace-pre-wrap break-all text-xs leading-6 text-slate-800">
                    {stageBiztalkResultResponse
                      || (isStageBiztalkResultLoading ? "자동 조회 중..." : "아직 발송하지 않았습니다")}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="stage-slack" className="w-full min-w-0 space-y-4">
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

        <TabsContent value="stage-slack-channel" className="w-full min-w-0 space-y-4">
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
                <Label htmlFor="edit-biztalk-template-code">BizTalk 템플릿 코드</Label>
                <Input
                  id="edit-biztalk-template-code"
                  name="biztalkTemplateCode"
                  defaultValue={selectedTemplate.biztalkTemplateCode ?? ""}
                  placeholder="예: officehour_001"
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
