import { useMemo, useState } from "react";
import { Application, Consultant, Program, OfficeHourReport, User } from "@/redesign/app/lib/types";
import { Button } from "@/redesign/app/components/ui/button";
import { Badge } from "@/redesign/app/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/redesign/app/components/ui/dialog";
import { Input } from "@/redesign/app/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/redesign/app/components/ui/table";
import { Textarea } from "@/redesign/app/components/ui/textarea";
import { AlertCircle, Clock, Calendar, FileText } from "lucide-react";
import { addDays, format, differenceInDays } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";

const parseLocalDate = (value?: string | null) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseReportContent = (raw?: string | null) => {
  const text = (raw ?? "").trim();
  if (!text) {
    return {
      companyStatus: "",
      advisoryContent: "",
    };
  }

  const companyStatusMatch = text.match(/\[기업의 현황\]\s*([\s\S]*?)(?:\n\s*\[자문내용\]|$)/u);
  const advisoryContentMatch = text.match(/\[자문내용\]\s*([\s\S]*)$/u);

  if (!companyStatusMatch && !advisoryContentMatch) {
    return {
      companyStatus: text,
      advisoryContent: "",
    };
  }

  return {
    companyStatus: companyStatusMatch?.[1]?.trim() ?? "",
    advisoryContent: advisoryContentMatch?.[1]?.trim() ?? "",
  };
};

interface PendingReportsDashboardProps {
  applications: Application[];
  reports: OfficeHourReport[];
  programs: Program[];
  consultants: Consultant[];
  currentUser: User;
  currentConsultantId?: string | null;
  currentConsultantName?: string | null;
  onCreateReport: (applicationId: string) => void;
  onEditReport: (report: OfficeHourReport) => void;
  onDeleteReport: (report: OfficeHourReport) => void;
}

interface PendingReportItem {
  application: Application;
  daysSinceSession: number;
  isOverdue: boolean;
  daysLeft: number;
  overdueDays: number;
  programName: string;
  programColor: string;
}

type ReportRow = {
  type: "pending" | "submitted";
  application: Application;
  programName: string;
  programColor: string;
  programId: string;
  consultantName: string;
  consultantEmail?: string;
  statusLabel: "작성" | "미작성";
  report: OfficeHourReport | null;
  dueLabel: string;
  dueOverdue: boolean;
};

type EmailDraft = {
  recipient: string;
  subject: string;
  body: string;
};

export function PendingReportsDashboard({
  applications,
  reports,
  programs,
  consultants,
  currentUser,
  currentConsultantId,
  currentConsultantName,
  onCreateReport,
  onEditReport,
  onDeleteReport,
}: PendingReportsDashboardProps) {
  const isConsultantUser = currentUser.role === "consultant";
  const isAdminUser = currentUser.role === "admin";
  const [selectedReportItem, setSelectedReportItem] = useState<{
    report: OfficeHourReport;
    application: Application;
    programName: string;
    programColor: string;
    programId: string;
  } | null>(null);
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);

  const normalizeConsultantName = (value?: string | null) =>
    (value ?? "").replace(/\s*컨설턴트\s*$/u, "").trim().toLowerCase();

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const resolveConsultantEmail = (application?: Application | null, report?: OfficeHourReport | null) => {
    const consultantId = report?.consultantId || application?.consultantId || "";
    const consultantName = report?.consultantName || application?.consultant || "";

    if (consultantId) {
      const byId = consultants.find((consultant) => consultant.id === consultantId);
      if (byId?.email) return byId.email;
    }

    const normalizedName = normalizeConsultantName(consultantName);
    if (!normalizedName) return "";

    const byName = consultants.find(
      (consultant) => normalizeConsultantName(consultant.name) === normalizedName
    );
    return byName?.email ?? "";
  };

  const handleSendReminderEmail = (row: ReportRow) => {
    const scheduledDate = row.application.scheduledDate
      ? format(
          parseLocalDate(row.application.scheduledDate) ?? new Date(row.application.scheduledDate),
          "yyyy년 M월 d일",
          { locale: ko }
        )
      : "일정 확인 필요";
    const companyName = row.application.companyName?.trim() || row.application.applicantName?.trim() || "기업";
    const subject = `[MYSC] 오피스아워 일지 작성 요청 - ${row.application.officeHourTitle}`;
    const body = [
      `${row.consultantName}님 안녕하세요.`,
      "",
      "아래 오피스아워 일정의 일지가 아직 작성되지 않아 확인 요청드립니다.",
      "",
      `- 사업: ${row.programName}`,
      `- 기업: ${companyName}`,
      `- 오피스아워: ${row.application.officeHourTitle}`,
      `- 진행일: ${scheduledDate}`,
      "",
      "로그인 후 오피스아워 일지 메뉴에서 작성 부탁드립니다.",
      "",
      "감사합니다.",
    ].join("\n");
    setEmailDraft({
      recipient: row.consultantEmail?.trim() ?? "",
      subject,
      body,
    });
  };

  const handleOpenGmail = () => {
    if (!emailDraft) return;
    const email = emailDraft.recipient.trim();
    if (!email) {
      toast.error("이메일을 입력해주세요.");
      return;
    }
    if (!isValidEmail(email)) {
      toast.error("올바른 이메일 형식이 아닙니다.");
      return;
    }

    const url =
      `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`
      + `&su=${encodeURIComponent(emailDraft.subject)}`
      + `&body=${encodeURIComponent(emailDraft.body)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleCopyEmailDraft = async () => {
    if (!emailDraft) return;
    const text = [
      `받는 사람: ${emailDraft.recipient}`,
      `제목: ${emailDraft.subject}`,
      "",
      emailDraft.body,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      toast.success("메일 초안을 복사했습니다.");
    } catch {
      toast.error("복사에 실패했습니다.");
    }
  };

  const isForCurrentConsultant = (application?: Application | null, report?: OfficeHourReport | null) => {
    if (!isConsultantUser) return true;
    if (currentConsultantId) {
      if (report?.consultantId) return report.consultantId === currentConsultantId;
      if (application?.consultantId) return application.consultantId === currentConsultantId;
    }
    const appName = normalizeConsultantName(application?.consultant);
    const reportName = normalizeConsultantName(report?.consultantName);
    const currentName = normalizeConsultantName(currentConsultantName);
    return Boolean(currentName) && (appName === currentName || reportName === currentName);
  };

  const getSessionEndTime = (app: Application) => {
    const durationHours = app.duration ?? 2;

    if (app.scheduledDate && app.scheduledTime) {
      const start = new Date(`${app.scheduledDate}T${app.scheduledTime}`);
      if (!Number.isNaN(start.getTime())) {
        return new Date(start.getTime() + durationHours * 60 * 60 * 1000);
      }
    }

    if (app.scheduledDate) {
      const fallback = (() => {
        const date = parseLocalDate(app.scheduledDate);
        return date ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59) : null;
      })();
      if (fallback && !Number.isNaN(fallback.getTime())) {
        return fallback;
      }
    }

    return null;
  };

  // 미작성 보고서 목록 계산
  const pendingReports = useMemo(() => {
    const eligibleApps = applications.filter(
      (app) =>
        (app.status === "confirmed" || app.status === "completed")
        && app.scheduledDate
    );

    const reportedAppIds = new Set(reports.map((r) => r.applicationId));
    const now = new Date();

    const pending: PendingReportItem[] = eligibleApps
      .filter((app) => !reportedAppIds.has(app.id))
      .filter((app) => isForCurrentConsultant(app, null))
      .map((app) => {
        const sessionEnd = getSessionEndTime(app);
        const effectiveEnd = sessionEnd ?? parseLocalDate(app.scheduledDate!) ?? new Date();
        const daysSince = differenceInDays(now, effectiveEnd);
        const deadline = addDays(effectiveEnd, 3);
        const daysLeft = Math.max(0, differenceInDays(deadline, now));
        const overdueDays = Math.max(0, differenceInDays(now, deadline));

        const program = programs.find((p) => p.id === app.programId);

        return {
          application: app,
          daysSinceSession: daysSince,
          isOverdue: now > deadline,
          daysLeft,
          overdueDays,
          programName: program?.name || "알 수 없음",
          programColor: program?.color || "#gray-500",
        };
      })
      .filter((item) => {
        const sessionEnd = getSessionEndTime(item.application);
        return sessionEnd ? now >= sessionEnd : true;
      })
      .sort((a, b) => b.daysSinceSession - a.daysSinceSession);

    // 권한에 따른 필터링
    if (isConsultantUser) {
      return pending;
    }

    if (currentUser.role !== "admin") {
      return pending.filter((p) =>
        currentUser.programs?.includes(p.application.programId || "")
      );
    }

    return pending;
  }, [applications, reports, programs, currentUser, isConsultantUser, currentConsultantId, currentConsultantName]);

  const irregularPendingReports = useMemo(() => {
    return pendingReports.filter((item) => item.application.type === "irregular");
  }, [pendingReports]);

  // 사업별 통계
  const statsByProgram = useMemo(() => {
    const stats: Record<
      string,
      { name: string; color: string; pending: number; overdue: number }
    > = {};

    pendingReports.forEach((item) => {
      const programId = item.application.programId || "unknown";
      if (!stats[programId]) {
        stats[programId] = {
          name: item.programName,
          color: item.programColor,
          pending: 0,
          overdue: 0,
        };
      }
      stats[programId].pending++;
      if (item.isOverdue) {
        stats[programId].overdue++;
      }
    });

    return Object.entries(stats).map(([id, data]) => ({ id, ...data }));
  }, [pendingReports]);

  const overdueCount = pendingReports.filter((p) => p.isOverdue).length;
  const submittedReports = useMemo(() => {
    const appMap = new Map(applications.map((app) => [app.id, app]));
    return reports
      .map((report) => {
        const application = appMap.get(report.applicationId);
        if (!application && report.applicationId.startsWith("manual-")) {
          const syntheticApp: Application = {
            id: report.applicationId,
            type: "irregular",
            status: "completed",
            officeHourTitle: report.topic?.trim() || "비정기 오피스아워 (수동)",
            consultant: report.consultantName || "컨설턴트",
            consultantId: report.consultantId,
            sessionFormat: "online",
            agenda: report.topic?.trim() || "비정기 오피스아워",
            requestContent: "",
            scheduledDate: report.date,
            programId: report.programId,
            createdAt: report.createdAt,
            updatedAt: report.updatedAt,
          };
          if (!isForCurrentConsultant(syntheticApp, report)) return null;
          const program = programs.find((p) => p.id === report.programId);
          return {
            report,
            application: syntheticApp,
            programName: program?.name || "비정기",
            programColor: program?.color || "#94a3b8",
            programId: report.programId || "manual",
          };
        }
        if (!application) return null;
        if (!isForCurrentConsultant(application, report)) return null;
        const program = programs.find((p) => p.id === (report.programId || application.programId));
        return {
          report,
          application,
          programName: program?.name || "알 수 없음",
          programColor: program?.color || "#94a3b8",
          programId: report.programId || application.programId || "unknown",
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => {
        const timeA = new Date(a.report.updatedAt ?? a.report.createdAt).getTime();
        const timeB = new Date(b.report.updatedAt ?? b.report.createdAt).getTime();
        return timeB - timeA;
      });
  }, [applications, programs, reports, isConsultantUser, currentConsultantId, currentConsultantName]);

  const reportRows = useMemo<ReportRow[]>(() => {
    const rows: ReportRow[] = pendingReports.map((item) => ({
      type: "pending" as const,
      application: item.application,
      programName: item.programName,
      programColor: item.programColor,
      programId: item.application.programId || "unknown",
      consultantName: item.application.consultant,
      consultantEmail: resolveConsultantEmail(item.application, null),
      statusLabel: "미작성",
      report: null,
      dueLabel: item.isOverdue ? `${item.overdueDays}일 초과` : `D-${item.daysLeft}`,
      dueOverdue: item.isOverdue,
    }));
    submittedReports.forEach((item) => {
      rows.push({
        type: "submitted" as const,
        application: item.application,
        programName: item.programName,
        programColor: item.programColor,
        programId: item.programId,
        consultantName: item.report.consultantName || item.application.consultant,
        consultantEmail: resolveConsultantEmail(item.application, item.report),
        statusLabel: "작성",
        report: item.report,
        dueLabel: "작성됨",
        dueOverdue: false,
      });
    });

    return rows;
  }, [pendingReports, submittedReports, consultants]);
  const selectedReportContent = useMemo(
    () => parseReportContent(selectedReportItem?.report.content),
    [selectedReportItem?.report.content]
  );

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-8 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              미작성 보고서 관리
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              세션 완료 후 3일 이내 보고서를 작성해주세요
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-lg border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">전체 미작성</span>
              <FileText className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {pendingReports.length}건
            </div>
          </div>

          <div className="bg-red-50 rounded-lg border border-red-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-red-700">기한 초과</span>
              <AlertCircle className="w-4 h-4 text-red-500" />
            </div>
            <div className="text-3xl font-bold text-red-600">
              {overdueCount}건
            </div>
            <p className="text-xs text-red-600 mt-1">3일 이상 지난 보고서</p>
          </div>

          <div className="bg-amber-50 rounded-lg border border-amber-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-amber-700">곧 마감</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-3xl font-bold text-amber-600">
              {pendingReports.filter((p) => !p.isOverdue && p.daysLeft <= 1).length}건
            </div>
            <p className="text-xs text-amber-600 mt-1">마감 1일 이내</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="grid grid-cols-3 gap-6 mb-6">
          {/* 사업별 통계 */}
          <div className="col-span-3 bg-white rounded-lg border p-6">
            <h3 className="font-semibold text-gray-900 mb-4">사업별 미작성 현황</h3>
            <div className="space-y-3">
              {statsByProgram.map((program) => (
                <div
                  key={program.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: program.color }}
                    />
                    <span className="font-medium text-gray-900">{program.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">
                      미작성 {program.pending}건
                    </span>
                    {program.overdue > 0 && (
                      <Badge variant="destructive">초과 {program.overdue}건</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* 오피스아워 보고서 현황 */}
        <div className="bg-white rounded-lg border mt-6">
          <div className="p-6 border-b space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">오피스아워 보고서 현황</h3>
              {!isAdminUser && (
                <Button
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => onCreateReport("irregular-manual")}
                >
                  비정기 오피스아워 작성
                </Button>
              )}
            </div>
          </div>
          <div className="divide-y">
            {reportRows.length === 0 ? (
              <div className="p-12 text-center">
                <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  보고서 데이터가 없습니다
                </p>
              </div>
            ) : (
              <div className="max-h-[560px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-white z-10">
                    <TableRow>
                      <TableHead>상태</TableHead>
                      <TableHead>사업</TableHead>
                      <TableHead>컨설턴트</TableHead>
                      <TableHead>오피스아워</TableHead>
                      <TableHead>기한</TableHead>
                      <TableHead>진행일</TableHead>
                      <TableHead>작성일</TableHead>
                      <TableHead className="text-right">관리</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportRows.map((row) => (
                      <TableRow key={`${row.type}-${row.application.id}`}>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {row.statusLabel}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: row.programColor }} />
                            <span className="text-sm">{row.programName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.consultantName}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="max-w-[220px] truncate">{row.application.officeHourTitle}</div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              row.dueOverdue
                                ? "bg-rose-100 text-rose-700"
                                : row.statusLabel === "작성"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-slate-100 text-slate-600"
                            }
                          >
                            {row.dueLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.application.scheduledDate
                            ? format(
                              parseLocalDate(row.application.scheduledDate)
                                ?? new Date(row.application.scheduledDate),
                              "yyyy.MM.dd",
                              { locale: ko }
                            )
                            : "-"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.report?.date
                            ? format(
                              parseLocalDate(row.report.date) ?? new Date(row.report.date),
                              "yyyy.MM.dd",
                              { locale: ko }
                            )
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.type === "submitted" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setSelectedReportItem({
                                  report: row.report!,
                                  application: row.application,
                                  programName: row.programName,
                                  programColor: row.programColor,
                                  programId: row.programId,
                                })
                              }
                            >
                              상세
                            </Button>
                          ) : isAdminUser ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSendReminderEmail(row)}
                            >
                              이메일 작성
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => onCreateReport(row.application.id)}
                            >
                              작성
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </div>
      <Dialog open={!!selectedReportItem} onOpenChange={(open) => {
        if (!open) setSelectedReportItem(null);
      }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto overflow-x-hidden">
          {selectedReportItem && (
            <div className="space-y-6">
              <DialogHeader>
                <DialogTitle>오피스아워 일지 상세</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">사업</div>
                  <div className="font-medium">{selectedReportItem.programName}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">컨설턴트</div>
                  <div className="font-medium">
                    {selectedReportItem.report.consultantName || selectedReportItem.application.consultant}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">오피스아워</div>
                  <div className="font-medium">{selectedReportItem.application.officeHourTitle}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">진행일</div>
                  <div className="font-medium">
                    {selectedReportItem.application.scheduledDate
                      ? format(
                        parseLocalDate(selectedReportItem.application.scheduledDate)
                          ?? new Date(selectedReportItem.application.scheduledDate),
                        "yyyy년 M월 d일",
                        { locale: ko }
                      )
                      : "-"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">작성일</div>
                  <div className="font-medium">
                    {selectedReportItem.report.date
                      ? format(
                        parseLocalDate(selectedReportItem.report.date)
                          ?? new Date(selectedReportItem.report.date),
                        "yyyy년 M월 d일",
                        { locale: ko }
                      )
                      : "-"}
                  </div>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">주제</div>
                <div className="rounded-lg border px-3 py-2 text-sm break-all">
                  {selectedReportItem.report.topic || "-"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">참여자</div>
                <div className="rounded-lg border px-3 py-2 text-sm break-all">
                  {(selectedReportItem.report.participants ?? []).join(", ") || "-"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">기업의 현황</div>
                <div className="rounded-lg border px-3 py-2 text-sm whitespace-pre-wrap break-all">
                  {selectedReportContent.companyStatus || "-"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">자문내용</div>
                <div className="rounded-lg border px-3 py-2 text-sm whitespace-pre-wrap break-all">
                  {selectedReportContent.advisoryContent || "-"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">팔로업</div>
                <div className="rounded-lg border px-3 py-2 text-sm whitespace-pre-wrap break-all">
                  {selectedReportItem.report.followUp || "-"}
                </div>
              </div>
              {selectedReportItem.report.photos?.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-2">사진</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {selectedReportItem.report.photos.map((url, idx) => (
                      <img
                        key={`${url}-${idx}`}
                        src={url}
                        alt="report"
                        className="rounded-lg border object-cover h-32 w-full"
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="destructive"
                  onClick={() => {
                    const confirmed = window.confirm(
                      "보고서를 삭제하시겠습니까? 첨부 사진도 Storage에서 함께 삭제됩니다."
                    );
                    if (!confirmed) return;
                    onDeleteReport(selectedReportItem.report);
                    setSelectedReportItem(null);
                  }}
                >
                  삭제
                </Button>
                <Button
                  onClick={() => {
                    onEditReport(selectedReportItem.report);
                    setSelectedReportItem(null);
                  }}
                >
                  수정
                </Button>
                <Button variant="outline" onClick={() => setSelectedReportItem(null)}>
                  닫기
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!emailDraft}
        onOpenChange={(open) => {
          if (!open) setEmailDraft(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>리마인드 메일 작성</DialogTitle>
            <DialogDescription>
              이메일을 확인하거나 수정한 뒤 Gmail에서 열거나 내용을 복사할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          {emailDraft ? (
            <div className="space-y-4">
              <label className="space-y-2 text-sm text-slate-700">
                <span className="font-medium">받는 사람</span>
                <Input
                  type="email"
                  value={emailDraft.recipient}
                  onChange={(event) =>
                    setEmailDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            recipient: event.target.value,
                          }
                        : prev
                    )
                  }
                />
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span className="font-medium">제목</span>
                <Input
                  value={emailDraft.subject}
                  onChange={(event) =>
                    setEmailDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            subject: event.target.value,
                          }
                        : prev
                    )
                  }
                />
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span className="font-medium">본문</span>
                <Textarea
                  className="min-h-[240px]"
                  value={emailDraft.body}
                  onChange={(event) =>
                    setEmailDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            body: event.target.value,
                          }
                        : prev
                    )
                  }
                />
              </label>
            </div>
          ) : null}
          <DialogFooter className="flex-wrap gap-2 sm:justify-end">
            <Button variant="outline" onClick={handleCopyEmailDraft}>
              복사
            </Button>
            <Button variant="outline" onClick={handleOpenGmail}>
              Gmail에서 열기
            </Button>
            <Button variant="outline" onClick={() => setEmailDraft(null)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
