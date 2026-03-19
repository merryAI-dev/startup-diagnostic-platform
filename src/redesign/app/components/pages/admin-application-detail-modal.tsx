import { format } from "date-fns";
import { ko } from "date-fns/locale";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { Calendar, Check, CheckCircle2, Clock, FileText, MapPin, User, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SELF_ASSESSMENT_SECTIONS } from "@/data/selfAssessment";
import { db } from "@/firebase/client";
import type { CompanyInfoRecord } from "@/types/company";
import type { SelfAssessmentSections } from "@/types/selfAssessment";
import { Application, ApplicationStatus } from "@/redesign/app/lib/types";
import { StatusChip } from "@/redesign/app/components/status-chip";
import { Badge } from "@/redesign/app/components/ui/badge";
import { Button } from "@/redesign/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/redesign/app/components/ui/dialog";
import { Input } from "@/redesign/app/components/ui/input";
import { Label } from "@/redesign/app/components/ui/label";
import { Separator } from "@/redesign/app/components/ui/separator";
import { Textarea } from "@/redesign/app/components/ui/textarea";

interface AdminApplicationDetailModalProps {
  application: Application;
  onClose: () => void;
  onUpdateStatus: (id: string, status: ApplicationStatus) => void;
  onUpdateApplication: (id: string, data: Partial<Application>) => void;
  onConfirmApplication?: (id: string) => void;
  onRejectApplication?: (id: string, reason: string) => void;
  onRequestApplication?: (id: string) => void;
  readOnly?: boolean;
  allowStatusActions?: boolean;
  currentConsultantName?: string | null;
}

export function AdminApplicationDetailModal({
  application,
  onClose,
  onUpdateStatus,
  onUpdateApplication,
  onConfirmApplication,
  onRejectApplication,
  onRequestApplication,
  readOnly = false,
  allowStatusActions = false,
  currentConsultantName,
}: AdminApplicationDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedConsultant, setEditedConsultant] = useState(application.consultant);
  const [editedDate, setEditedDate] = useState(application.scheduledDate || "");
  const [editedTime, setEditedTime] = useState(application.scheduledTime || "");
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<"confirm" | "reject">("confirm");
  const [rejectReason, setRejectReason] = useState("");
  const [isActionPending, setIsActionPending] = useState(false);
  const [activeCompanyTab, setActiveCompanyTab] = useState<"info" | "assessment" | "report">(
    "info"
  );
  const [activeSectionFilter, setActiveSectionFilter] = useState<string>("문제");
  const [companySummary, setCompanySummary] = useState<{ id: string; name: string | null } | null>(null);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfoRecord | null>(null);
  const [selfAssessment, setSelfAssessment] = useState<SelfAssessmentSections>({});
  const [loadingCompany, setLoadingCompany] = useState(false);
  const [reportForm, setReportForm] = useState({
    companyName: "",
    createdAt: "",
    summaryCapability: "",
    summaryMarket: "",
    improvements: "",
    acPriority1: "",
    acPriority2: "",
    acPriority3: "",
    milestone56: "",
    milestone78: "",
    milestone910: "",
  });
  const sessionEndTime = useMemo(() => {
    const durationHours = application.duration ?? 1;
    if (application.scheduledDate && application.scheduledTime) {
      const start = new Date(`${application.scheduledDate}T${application.scheduledTime}`);
      if (!Number.isNaN(start.getTime())) {
        return new Date(start.getTime() + durationHours * 60 * 60 * 1000);
      }
    }
    if (application.scheduledDate) {
      const fallback = new Date(`${application.scheduledDate}T23:59`);
      if (!Number.isNaN(fallback.getTime())) {
        return fallback;
      }
    }
    return null;
  }, [
    application.duration,
    application.scheduledDate,
    application.scheduledTime,
  ]);
  const isSessionEnded = Boolean(sessionEndTime && new Date() >= sessionEndTime);
  const isPendingLike =
    application.status === "pending" || application.status === "review";
  const attachmentItems = useMemo(() => {
    const names = application.attachments ?? [];
    const urls = application.attachmentUrls ?? [];
    const items: Array<{ id: string; name: string; url?: string }> = urls.map((url, idx) => ({
      id: `url-${idx}`,
      name: names[idx] || `첨부 파일 ${idx + 1}`,
      url,
    }));
    if (names.length > urls.length) {
      names.slice(urls.length).forEach((name, idx) => {
        items.push({
          id: `name-${idx}`,
          name,
          url: undefined,
        });
      });
    }
    return items;
  }, [application.attachments, application.attachmentUrls]);

  const handleSaveEdit = () => {
    onUpdateApplication(application.id, {
      consultant: editedConsultant,
      scheduledDate: editedDate,
      scheduledTime: editedTime,
    });
    setIsEditing(false);
    toast.success("신청 정보가 업데이트되었습니다");
  };

  const handleStatusChange = (newStatus: ApplicationStatus) => {
    if (
      isSessionEnded
      && newStatus !== "rejected"
    ) {
      toast.error("진행 시간이 지난 신청은 거절됨 외 상태로 변경할 수 없습니다");
      return;
    }
    onUpdateStatus(application.id, newStatus);
    toast.success(`상태가 '${getStatusLabel(newStatus)}'로 변경되었습니다`);
  };

  const handleOpenAction = (type: "confirm" | "reject") => {
    setActionType(type);
    setRejectReason("");
    setActionDialogOpen(true);
  };

  const handleConfirmAction = async () => {
    if (isActionPending) return;
    setIsActionPending(true);
    try {
      if (actionType === "reject") {
        const trimmed = rejectReason.trim();
        if (!trimmed) {
          toast.error("거절 사유를 입력해주세요");
          return;
        }
        if (onRejectApplication) {
          await onRejectApplication(application.id, trimmed);
        } else {
          onUpdateApplication(application.id, { rejectionReason: trimmed });
          onUpdateStatus(application.id, "rejected");
          toast.success("거절 처리되었습니다");
        }
      } else {
        if (isSessionEnded) {
          toast.error("진행 시간이 지나 수락/확정할 수 없습니다");
          return;
        }
        const isUnassigned = !application.consultantId
          && (!application.consultant || application.consultant === "담당자 배정 중");
        if (isPendingLike
          && isUnassigned
          && onRequestApplication) {
          await onRequestApplication(application.id);
        } else {
          if (onConfirmApplication) {
            await onConfirmApplication(application.id);
          } else {
            onUpdateStatus(application.id, "confirmed");
          }
        }
        toast.success("확정 처리되었습니다");
      }
      setActionDialogOpen(false);
      setRejectReason("");
    } catch (error) {
      console.error("Failed to update application status:", error);
    } finally {
      setIsActionPending(false);
    }
  };

  const getStatusLabel = (status: ApplicationStatus) => {
    const labels = {
      pending: "수락 대기",
      review: "수락 대기",
      confirmed: "확정",
      rejected: "거절됨",
      cancelled: "취소",
      completed: "완료",
    };
    return labels[status];
  };

  useEffect(() => {
    let mounted = true;

    async function loadCompanyDetails() {
      setLoadingCompany(true);
      setCompanyInfo(null);
      setSelfAssessment({});
      setCompanySummary(null);

      try {
        let resolvedCompanyId: string | null = null;
        let resolvedCompanyName: string | null = null;

        if (application.companyId) {
          const companySnap = await getDoc(doc(db, "companies", application.companyId));
          if (companySnap.exists()) {
            const data = companySnap.data() as { name?: string | null };
            resolvedCompanyId = companySnap.id;
            resolvedCompanyName = data.name ?? application.companyName ?? null;
          }
        }

        if (!resolvedCompanyId && application.createdByUid) {
          const profileSnap = await getDoc(doc(db, "profiles", application.createdByUid));
          const profileData = profileSnap.exists()
            ? (profileSnap.data() as { companyId?: string | null })
            : null;
          if (profileData?.companyId) {
            const companySnap = await getDoc(doc(db, "companies", profileData.companyId));
            if (companySnap.exists()) {
              const data = companySnap.data() as { name?: string | null };
              resolvedCompanyId = companySnap.id;
              resolvedCompanyName = data.name ?? application.companyName ?? null;
            }
          }
        }

        if (!resolvedCompanyId && application.createdByUid) {
          const ownerQuery = query(
            collection(db, "companies"),
            where("ownerUid", "==", application.createdByUid),
            limit(1)
          );
          const ownerSnap = await getDocs(ownerQuery);
          const ownerDoc = ownerSnap.docs[0];
          if (ownerDoc) {
            const data = ownerDoc.data() as { name?: string | null };
            resolvedCompanyId = ownerDoc.id;
            resolvedCompanyName = data.name ?? null;
          }
        }

        if (!resolvedCompanyId && application.companyName) {
          const nameQuery = query(
            collection(db, "companies"),
            where("name", "==", application.companyName),
            limit(1)
          );
          const nameSnap = await getDocs(nameQuery);
          const nameDoc = nameSnap.docs[0];
          if (nameDoc) {
            const data = nameDoc.data() as { name?: string | null };
            resolvedCompanyId = nameDoc.id;
            resolvedCompanyName = data.name ?? application.companyName ?? null;
          }
        }

        if (!resolvedCompanyId) return;

        if (mounted) {
          setCompanySummary({
            id: resolvedCompanyId,
            name: resolvedCompanyName ?? application.companyName ?? null,
          });
        }

        const [infoSnap, assessmentSnap] = await Promise.all([
          getDoc(doc(db, "companies", resolvedCompanyId, "companyInfo", "info")),
          getDoc(doc(db, "companies", resolvedCompanyId, "selfAssessment", "info")),
        ]);
        if (!mounted) return;

        setCompanyInfo(infoSnap.exists() ? (infoSnap.data() as CompanyInfoRecord) : null);
        const assessmentData = assessmentSnap.exists()
          ? (assessmentSnap.data() as { sections?: SelfAssessmentSections })
          : null;
        setSelfAssessment(assessmentData?.sections ?? {});
      } catch (error) {
        console.warn("Failed to load company info:", error);
      } finally {
        if (mounted) {
          setLoadingCompany(false);
        }
      }
    }

    loadCompanyDetails();

    return () => {
      mounted = false;
    };
  }, [application.companyId, application.createdByUid, application.companyName]);

  useEffect(() => {
    const nextCompanyName =
      companyInfo?.basic?.companyInfo ?? companySummary?.name ?? application.companyName ?? "";
    setReportForm((prev) => ({
      ...prev,
      companyName: nextCompanyName,
      createdAt: prev.createdAt || new Date().toLocaleString("ko-KR"),
    }));
  }, [companyInfo, companySummary, application.companyName]);

  const formatValue = (value?: string | number | null) => {
    if (value === null || value === undefined || value === "") return "-";
    if (typeof value === "number") return value.toLocaleString();
    return value;
  };

  const formatScore = (value: number) => {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
  };

  const investmentRows = useMemo(() => {
    return companyInfo?.investments ?? [];
  }, [companyInfo]);

  const assessmentSummary = useMemo(() => {
    let totalScore = 0;
    const sectionScores: Record<string, number> = {};
    const sectionTotals: Record<string, number> = {};
    const grouped = SELF_ASSESSMENT_SECTIONS.map((section) => {
      let sectionScore = 0;
      const questions = section.subsections.flatMap((subsection) =>
        subsection.questions.map((question) => {
          const answer =
            selfAssessment?.[section.storageKey]?.[subsection.storageKey]?.[
            question.storageKey
            ];
          const answerValue =
            answer?.answer === true
              ? "예"
              : answer?.answer === false
                ? "아니오"
                : "미선택";
          const score = answer?.answer === true ? question.weight : 0;
          sectionScore += score;
          return {
            sectionTitle: section.title,
            subsectionTitle: subsection.title,
            questionText: question.text,
            answerLabel: answerValue,
            reason: answer?.reason ?? "",
            score,
          };
        })
      );
      sectionScores[section.storageKey] = sectionScore;
      sectionTotals[section.storageKey] = section.totalScore;
      totalScore += sectionScore;
      return {
        sectionTitle: section.title,
        sectionKey: section.storageKey,
        sectionScore,
        sectionTotal: section.totalScore,
        questions,
      };
    });

    return { totalScore, sectionScores, sectionTotals, grouped };
  }, [selfAssessment]);

  useEffect(() => {
    if (assessmentSummary.grouped.length === 0) return;
    const titles = assessmentSummary.grouped.map((section) => section.sectionTitle);
    if (!titles.includes(activeSectionFilter)) {
      setActiveSectionFilter(titles[0] ?? "문제");
    }
  }, [assessmentSummary, activeSectionFilter]);

  const radarData = useMemo(() => {
    const size = 220;
    const center = size / 2;
    const radius = size / 2 - 16;
    const axes = assessmentSummary.grouped.map((section, index) => {
      const angle =
        (Math.PI * 2 * index) / assessmentSummary.grouped.length - Math.PI / 2;
      const total =
        assessmentSummary.sectionTotals[section.sectionKey] ?? section.sectionTotal;
      const score =
        assessmentSummary.sectionScores[section.sectionKey] ?? section.sectionScore;
      const ratio = total > 0 ? score / total : 0;
      const x = center + Math.cos(angle) * radius * ratio;
      const y = center + Math.sin(angle) * radius * ratio;
      const labelX = center + Math.cos(angle) * (radius + 14);
      const labelY = center + Math.sin(angle) * (radius + 14);
      return { angle, x, y, label: section.sectionTitle, labelX, labelY };
    });
    const points = axes.map((axis) => `${axis.x},${axis.y}`).join(" ");

    return { size, center, radius, axes, points };
  }, [assessmentSummary]);

  return (
    <>
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="w-[90vw] !max-w-none sm:!max-w-none max-h-[92vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="space-y-2">
              <DialogTitle>{application.officeHourTitle}</DialogTitle>
              <div className="flex items-center gap-2">
                <StatusChip status={application.status} />
                <Badge variant="outline">
                  {application.type === "regular" ? "정기" : "비정기"}
                </Badge>
              </div>
            </div>
          </DialogHeader>

        <div className="grid flex-1 min-h-0 gap-8 py-4 lg:grid-cols-[560px_minmax(0,1fr)]">
          <div className="min-h-0 overflow-y-auto lg:pr-4 space-y-6">
            {/* Status Management */}
            {(allowStatusActions || !readOnly) && (
              <>
                <div className="space-y-3">
                  <Label>상태 관리</Label>
                  <div className="flex gap-2 flex-wrap">
                    {isPendingLike && !isSessionEnded && (
                      <Button
                        data-testid="application-accept"
                        size="sm"
                        variant="default"
                        onClick={() => handleOpenAction("confirm")}
                        className="transition-colors hover:bg-primary/80 hover:text-primary-foreground"
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        수락
                      </Button>
                    )}
                    {isPendingLike && (
                      <Button
                        data-testid="application-reject"
                        size="sm"
                        variant="destructive"
                        onClick={() => handleOpenAction("reject")}
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        최종 거절
                      </Button>
                    )}
                    {application.status === "rejected" && !isSessionEnded && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleStatusChange("pending")}
                      >
                        수락 대기로 변경
                      </Button>
                    )}
                    {application.status === "confirmed" && !isSessionEnded && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleStatusChange("pending")}
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        수락 대기로 변경
                      </Button>
                    )}
                  </div>
                  {isSessionEnded && (
                    <p className="text-xs text-rose-600">
                      진행 시간이 지난 신청은 거절 처리만 가능합니다.
                    </p>
                  )}
                </div>

                <Separator />
              </>
            )}

            {/* Edit Mode Toggle */}
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">신청 정보</h3>
              {!readOnly && (
                !isEditing ? (
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                    수정
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                      취소
                    </Button>
                    <Button size="sm" onClick={handleSaveEdit}>
                      저장
                    </Button>
                  </div>
                )
              )}
            </div>

            {/* Application Details */}
            <div className="space-y-4">
              {isEditing && !readOnly ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="consultant">담당 컨설턴트</Label>
                    <Input
                      id="consultant"
                      value={editedConsultant}
                      onChange={(e) => setEditedConsultant(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="date">일정 날짜</Label>
                      <Input
                        id="date"
                        type="date"
                        value={editedDate}
                        onChange={(e) => setEditedDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="time">시간</Label>
                      <Input
                        id="time"
                        type="time"
                        value={editedTime}
                        onChange={(e) => setEditedTime(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">담당 컨설턴트</p>
                      <p className="text-sm font-medium">{application.consultant}</p>
                    </div>
                  </div>

                  {application.scheduledDate && (
                    <>
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Calendar className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">일정 날짜</p>
                          <p className="text-sm font-medium">
                            {format(new Date(application.scheduledDate), "yyyy년 M월 d일 (E)", {
                              locale: ko,
                            })}
                          </p>
                        </div>
                      </div>

                      {application.scheduledTime && (
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-primary/10 rounded-lg">
                            <Clock className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">시간</p>
                            <p className="text-sm font-medium">{application.scheduledTime}</p>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {application.periodFrom && (
                    <div className="flex items-start gap-3 col-span-2">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Calendar className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">희망 기간</p>
                        <p className="text-sm font-medium">
                          {format(new Date(application.periodFrom), "M월 d일", { locale: ko })} ~{" "}
                          {format(new Date(application.periodTo!), "M월 d일", { locale: ko })}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <MapPin className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">진행 방식</p>
                      <p className="text-sm font-medium">
                        {application.sessionFormat === "online" ? "온라인" : "오프라인"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Request Details */}
            <div className="space-y-4">
              <h3 className="font-semibold">신청 내용</h3>

              <div className="space-y-2">
                <Label>안건</Label>
                <div className="p-3 bg-accent rounded-lg">
                  <p className="text-sm">{application.agenda}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>요청 내용</Label>
                <div className="p-3 bg-accent rounded-lg">
                  <p className="text-sm whitespace-pre-wrap">{application.requestContent}</p>
                </div>
              </div>

              {attachmentItems.length > 0 && (
                <div className="space-y-2">
                  <Label>첨부 파일</Label>
                  <div className="space-y-2">
                    {attachmentItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 p-2 bg-accent rounded-lg"
                      >
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        {item.url ? (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                            className="text-sm text-primary underline underline-offset-2 break-all"
                          >
                            {item.name}
                          </a>
                        ) : (
                          <span className="text-sm">{item.name}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {application.projectName && (
                <div className="space-y-2">
                  <Label>프로젝트명</Label>
                  <div className="p-3 bg-accent rounded-lg">
                    <p className="text-sm">{application.projectName}</p>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Metadata */}
            <div className="space-y-2">
              <h3 className="font-semibold">신청 정보</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">신청일:</span>{" "}
                  <span className="font-medium">
                    {format(new Date(application.createdAt), "yyyy년 M월 d일 HH:mm", { locale: ko })}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">최종 수정:</span>{" "}
                  <span className="font-medium">
                    {format(new Date(application.updatedAt), "yyyy년 M월 d일 HH:mm", { locale: ko })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto lg:border-l lg:border-slate-200 lg:pl-4">
            <div className="rounded-2xl border border-slate-200 bg-white flex flex-col min-h-0">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-slate-700">
                    {companySummary?.name ?? application.companyName ?? "기업 정보"}
                  </div>
                  {companySummary?.id ? (
                    <div className="text-xs text-slate-400">{companySummary.id}</div>
                  ) : null}
                </div>
                {loadingCompany ? (
                  <span className="text-xs text-slate-400">불러오는 중...</span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 px-4">
                <button
                  type="button"
                  onClick={() => setActiveCompanyTab("info")}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${activeCompanyTab === "info"
                    ? "border-slate-900 text-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                    }`}
                >
                  기업 정보
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCompanyTab("assessment")}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${activeCompanyTab === "assessment"
                    ? "border-slate-900 text-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                    }`}
                >
                  현황 진단
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCompanyTab("report")}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${activeCompanyTab === "report"
                    ? "border-slate-900 text-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                    }`}
                >
                  분석 보고서
                </button>
              </div>

              <div className="flex-1 min-h-0 px-4 py-4 overflow-y-auto">
                {!companySummary ? (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-500">
                    기업 정보를 찾을 수 없습니다. 신청자 정보와 기업 정보를 확인해주세요.
                  </div>
                ) : activeCompanyTab === "info" ? (
                  !companyInfo ? (
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-500">
                      기업 정보가 없습니다.
                    </div>
                  ) : (
                    <div className="space-y-4 text-sm text-slate-700">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <div className="text-xs text-slate-400">회사명</div>
                          <div className="font-semibold">
                            {formatValue(companyInfo.basic?.companyInfo)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">대표자</div>
                          <div className="font-semibold">
                            {formatValue(companyInfo.basic?.ceo?.name)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">대표 이메일</div>
                          <div className="font-semibold">
                            {formatValue(companyInfo.basic?.ceo?.email)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">대표 전화번호</div>
                          <div className="font-semibold">
                            {formatValue(companyInfo.basic?.ceo?.phone)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">법인 설립일</div>
                          <div className="font-semibold">
                            {formatValue(companyInfo.basic?.foundedAt)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">사업자등록번호</div>
                          <div className="font-semibold">
                            {formatValue(companyInfo.basic?.businessNumber)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">주업태</div>
                          <div className="font-semibold">
                            {formatValue(companyInfo.basic?.primaryBusiness)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">주업종</div>
                          <div className="font-semibold">
                            {formatValue(companyInfo.basic?.primaryIndustry)}
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <div className="text-xs text-slate-400">본점 소재지</div>
                          <div className="font-semibold">
                            {formatValue(companyInfo.locations?.headOffice)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">지점/연구소 소재지</div>
                          <div className="font-semibold">
                            {formatValue(companyInfo.locations?.branchOrLab)}
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <div className="text-xs text-slate-400">정규직</div>
                          <div className="font-semibold">
                            {formatValue(companyInfo.workforce?.fullTime)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">계약직</div>
                          <div className="font-semibold">
                            {formatValue(companyInfo.workforce?.contract)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">매출액(2025)</div>
                          <div className="font-semibold">
                            {formatValue(companyInfo.finance?.revenue?.y2025)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">매출액(2026)</div>
                          <div className="font-semibold">
                            {formatValue(companyInfo.finance?.revenue?.y2026)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">자본총계</div>
                          <div className="font-semibold">
                            {formatValue(companyInfo.finance?.capitalTotal)}
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <div className="text-xs text-slate-400">인증/지정여부</div>
                          <div className="font-semibold">
                            {formatValue(companyInfo.certifications?.designation)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">TIPS/LIPS</div>
                          <div className="font-semibold">
                            {formatValue(companyInfo.certifications?.tipsLipsHistory)}
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <div className="text-xs text-slate-400">2026년 희망 투자액</div>
                          <div className="font-semibold">
                            {formatValue(companyInfo.fundingPlan?.desiredAmount2026)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">투자전 희망 기업가치</div>
                          <div className="font-semibold">
                            {formatValue(companyInfo.fundingPlan?.preValue)}
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-slate-400">투자 이력</div>
                        {investmentRows.length === 0 ? (
                          <div className="mt-2 text-sm text-slate-500">
                            입력된 투자 이력이 없습니다.
                          </div>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {investmentRows.map((row, index) => (
                              <div
                                key={`${row.stage}-${index}`}
                                className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600"
                              >
                                <div className="font-semibold text-slate-700">
                                  {row.stage || "단계 미입력"}
                                </div>
                                <div className="mt-1 grid gap-1 sm:grid-cols-3">
                                  <span>일시: {formatValue(row.date)}</span>
                                  <span>금액: {formatValue(row.postMoney)}</span>
                                  <span>주요주주: {formatValue(row.majorShareholder)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                ) : activeCompanyTab === "assessment" ? (
                  <div className="flex min-h-0 flex-1 flex-col">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-700">대분류 점수</div>
                      <div className="rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm">
                        총점 {formatScore(assessmentSummary.totalScore)}/100점
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {assessmentSummary.grouped.map((section) => (
                        <button
                          key={`summary-${section.sectionTitle}`}
                          type="button"
                          onClick={() => setActiveSectionFilter(section.sectionTitle)}
                          className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${activeSectionFilter === section.sectionTitle
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                        >
                          {section.sectionTitle} {formatScore(section.sectionScore)}/{formatScore(section.sectionTotal)}점
                        </button>
                      ))}
                    </div>
                    {(() => {
                      const filtered = assessmentSummary.grouped.filter(
                        (section) => section.sectionTitle === activeSectionFilter
                      );
                      if (filtered.length === 1) {
                        const section = filtered[0];
                        if (!section) return null;
                        return (
                          <div className="mt-4 min-h-0 flex-1 overflow-hidden">
                            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden flex h-full flex-col">
                              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                                <div className="text-sm font-semibold text-slate-800">
                                  {section.sectionTitle}
                                </div>
                                <div className="text-xs font-semibold text-slate-600">
                                  {formatScore(section.sectionScore)}/{formatScore(section.sectionTotal)}점
                                </div>
                              </div>
                              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                                {section.questions.map((item, index) => (
                                  <div
                                    key={`${section.sectionTitle}-${index}`}
                                    className="rounded-xl border border-slate-100 bg-white p-3"
                                  >
                                    <div className="text-xs text-slate-400">
                                      {item.subsectionTitle}
                                    </div>
                                    <div className="mt-1 text-sm font-semibold text-slate-800">
                                      {item.questionText}
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                      <span
                                        className={`rounded-full px-2 py-0.5 font-semibold ${item.answerLabel === "예"
                                          ? "bg-emerald-100 text-emerald-700"
                                          : item.answerLabel === "아니오"
                                            ? "bg-rose-100 text-rose-700"
                                            : "bg-slate-100 text-slate-500"
                                          }`}
                                      >
                                        {item.answerLabel}
                                      </span>
                                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                                        {formatScore(item.score)}점
                                      </span>
                                    </div>
                                    {item.reason ? (
                                      <div className="mt-2 text-xs text-slate-600">
                                        {item.reason}
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto">
                          {filtered.map((section) => (
                            <div
                              key={section.sectionTitle}
                              className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
                            >
                              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                                <div className="text-sm font-semibold text-slate-800">
                                  {section.sectionTitle}
                                </div>
                                <div className="text-xs font-semibold text-slate-600">
                                  {formatScore(section.sectionScore)}/{formatScore(section.sectionTotal)}점
                                </div>
                              </div>
                              <div className="space-y-3 p-4">
                                {section.questions.map((item, index) => (
                                  <div
                                    key={`${section.sectionTitle}-${index}`}
                                    className="rounded-xl border border-slate-100 bg-white p-3"
                                  >
                                    <div className="text-xs text-slate-400">
                                      {item.subsectionTitle}
                                    </div>
                                    <div className="mt-1 text-sm font-semibold text-slate-800">
                                      {item.questionText}
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                      <span
                                        className={`rounded-full px-2 py-0.5 font-semibold ${item.answerLabel === "예"
                                          ? "bg-emerald-100 text-emerald-700"
                                          : item.answerLabel === "아니오"
                                            ? "bg-rose-100 text-rose-700"
                                            : "bg-slate-100 text-slate-500"
                                          }`}
                                      >
                                        {item.answerLabel}
                                      </span>
                                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                                        {formatScore(item.score)}점
                                      </span>
                                    </div>
                                    {item.reason ? (
                                      <div className="mt-2 text-xs text-slate-600">
                                        {item.reason}
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="min-h-0 flex-1 overflow-y-auto space-y-6">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-sm font-semibold text-slate-800">
                        기업진단분석보고서
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        모달에서는 읽기 전용으로 표시됩니다.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="text-xs text-slate-500">
                        기업명
                        <input
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                          value={reportForm.companyName}
                          readOnly
                        />
                      </label>
                      <label className="text-xs text-slate-500">
                        작성일시
                        <input
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                          value={reportForm.createdAt}
                          readOnly
                        />
                      </label>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-sm font-semibold text-slate-700">현황 분석 점수</div>
                      <div className="mt-4 grid gap-4 lg:grid-cols-[240px_1fr]">
                        <div className="flex items-center justify-start pl-2">
                          <svg
                            width={radarData.size}
                            height={radarData.size}
                            viewBox={`-24 -24 ${radarData.size + 48} ${radarData.size + 48}`}
                          >
                            {[1, 0.75, 0.5, 0.25].map((ratio) => {
                              const points = radarData.axes
                                .map((axis) => {
                                  const x =
                                    radarData.center +
                                    Math.cos(axis.angle) * radarData.radius * ratio;
                                  const y =
                                    radarData.center +
                                    Math.sin(axis.angle) * radarData.radius * ratio;
                                  return `${x},${y}`;
                                })
                                .join(" ");
                              return (
                                <polygon
                                  key={ratio}
                                  points={points}
                                  fill="none"
                                  stroke="#e2e8f0"
                                  strokeWidth="1"
                                />
                              );
                            })}
                            {radarData.axes.map((axis, index) => (
                              <line
                                key={`axis-${index}`}
                                x1={radarData.center}
                                y1={radarData.center}
                                x2={radarData.center + Math.cos(axis.angle) * radarData.radius}
                                y2={radarData.center + Math.sin(axis.angle) * radarData.radius}
                                stroke="#e2e8f0"
                                strokeWidth="1"
                              />
                            ))}
                            <polygon
                              points={radarData.points}
                              fill="rgba(15, 118, 110, 0.18)"
                              stroke="#0f766e"
                              strokeWidth="2"
                            />
                            {radarData.axes.map((axis, index) => (
                              <circle
                                key={`point-${index}`}
                                cx={axis.x}
                                cy={axis.y}
                                r="3"
                                fill="#0f766e"
                              />
                            ))}
                            {radarData.axes.map((axis, index) => (
                              <text
                                key={`label-${index}`}
                                x={axis.labelX}
                                y={axis.labelY}
                                textAnchor={axis.labelX < radarData.center ? "end" : "start"}
                                dominantBaseline="middle"
                                fontSize="9"
                                fill="#475569"
                              >
                                {axis.label}
                              </text>
                            ))}
                          </svg>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {assessmentSummary.grouped.map((section) => (
                            <div
                              key={`score-${section.sectionTitle}`}
                              className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600"
                            >
                              <div className="font-semibold text-slate-700 whitespace-normal break-words text-[11px] leading-snug">
                                {section.sectionTitle}
                              </div>
                              <div className="mt-1 whitespace-normal break-words text-[11px] text-slate-600">
                                {formatScore(section.sectionScore)}/{formatScore(section.sectionTotal)}점
                              </div>
                            </div>
                          ))}
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                            <div className="font-semibold whitespace-normal break-words text-[11px] leading-snug">
                              총점
                            </div>
                            <div className="mt-1 whitespace-normal break-words text-[11px]">
                              {formatScore(assessmentSummary.totalScore)}/100점
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="text-xs text-slate-500">
                        기업상황요약 - 기업 역량
                        <textarea
                          rows={3}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                          value={reportForm.summaryCapability}
                          readOnly
                        />
                      </label>
                      <label className="text-xs text-slate-500">
                        기업상황요약 - 시장검증
                        <textarea
                          rows={3}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                          value={reportForm.summaryMarket}
                          readOnly
                        />
                      </label>
                    </div>

                    <label className="text-xs text-slate-500">
                      개선 필요사항 (항목별 요약)
                      <textarea
                        rows={4}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                        value={reportForm.improvements}
                        readOnly
                      />
                    </label>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-sm font-semibold text-slate-700">AC 프로그램 제안</div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <label className="text-xs text-slate-500">
                          1순위
                          <input
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                            value={reportForm.acPriority1}
                            readOnly
                          />
                        </label>
                        <label className="text-xs text-slate-500">
                          2순위
                          <input
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                            value={reportForm.acPriority2}
                            readOnly
                          />
                        </label>
                        <label className="text-xs text-slate-500">
                          3순위
                          <input
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                            value={reportForm.acPriority3}
                            readOnly
                          />
                        </label>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-sm font-semibold text-slate-700">
                        엑셀러레이팅 마일스톤 제안
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <label className="text-xs text-slate-500">
                          5~6월
                          <textarea
                            rows={3}
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                            value={reportForm.milestone56}
                            readOnly
                          />
                        </label>
                        <label className="text-xs text-slate-500">
                          7~8월
                          <textarea
                            rows={3}
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                            value={reportForm.milestone78}
                            readOnly
                          />
                        </label>
                        <label className="text-xs text-slate-500">
                          9~10월
                          <textarea
                            rows={3}
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                            value={reportForm.milestone910}
                            readOnly
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{actionType === "confirm" ? "확정 확인" : "최종 거절 확인"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {actionType === "confirm" ? (
              <div className="text-sm text-slate-600 space-y-2">
                <p>이 요청을 확정하면 아래 컨설턴트로 배정됩니다.</p>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                  {currentConsultantName ?? application.consultant ?? "현재 로그인한 컨설턴트"}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                  <p className="font-medium">최종 거절 전 확인</p>
                  <p className="mt-1">
                    동일 시간·동일 아젠다에 배정 가능한 다른 컨설턴트까지 모두 검토한 뒤 진행해주세요.
                  </p>
                  <p className="mt-1 text-amber-800">
                    최종 거절 처리 시 신청 기업에 즉시 결과가 안내됩니다.
                  </p>
                </div>
                <Label htmlFor="reject-reason">거절 사유</Label>
                <Textarea
                  id="reject-reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="최종 거절 사유를 입력해주세요"
                  className="min-h-[120px]"
                />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setActionDialogOpen(false);
                setRejectReason("");
              }}
            >
              취소
            </Button>
            <Button
              data-testid="application-action-confirm"
              onClick={handleConfirmAction}
              disabled={isActionPending || (actionType === "reject" && rejectReason.trim().length === 0)}
            >
              {isActionPending ? "처리 중..." : "확인"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
