import { useMemo } from "react";
import { Application, Program, OfficeHourReport, User } from "@/redesign/app/lib/types";
import { Button } from "@/redesign/app/components/ui/button";
import { Badge } from "@/redesign/app/components/ui/badge";
import { AlertCircle, Clock, Calendar, FileText } from "lucide-react";
import { addDays, format, differenceInDays } from "date-fns";
import { ko } from "date-fns/locale";

const parseLocalDate = (value?: string | null) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

interface PendingReportsDashboardProps {
  applications: Application[];
  reports: OfficeHourReport[];
  programs: Program[];
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

export function PendingReportsDashboard({
  applications,
  reports,
  programs,
  currentUser,
  currentConsultantId,
  currentConsultantName,
  onCreateReport,
  onEditReport,
  onDeleteReport,
}: PendingReportsDashboardProps) {
  const isConsultantUser = currentUser.role === "consultant";

  const normalizeConsultantName = (value?: string | null) =>
    (value ?? "").replace(/\s*컨설턴트\s*$/u, "").trim().toLowerCase();

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
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => {
        const timeA = new Date(a.report.updatedAt ?? a.report.createdAt).getTime();
        const timeB = new Date(b.report.updatedAt ?? b.report.createdAt).getTime();
        return timeB - timeA;
      });
  }, [applications, programs, reports, isConsultantUser, currentConsultantId, currentConsultantName]);

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

        {/* 미작성 보고서 목록 */}
        <div className="bg-white rounded-lg border">
          <div className="p-6 border-b">
            <h3 className="font-semibold text-gray-900">보고서 작성이 필요한 세션</h3>
          </div>
          <div className="divide-y">
            {pendingReports.length === 0 ? (
              <div className="p-12 text-center">
                <FileText className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  모든 보고서가 작성되었습니다!
                </p>
              </div>
            ) : (
              pendingReports.map((item) => (
                <div
                  key={item.application.id}
                  className={`p-4 hover:bg-gray-50 transition-colors ${
                    item.isOverdue ? "bg-red-50/50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: item.programColor }}
                        />
                        <span className="text-xs text-muted-foreground">
                          {item.programName}
                        </span>
                        {item.isOverdue && (
                          <Badge variant="destructive" className="text-xs">
                            기한 초과
                          </Badge>
                        )}
                      </div>
                      <h4 className="font-medium text-gray-900 mb-1">
                        {item.application.officeHourTitle}
                      </h4>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>
                            {format(
                              parseLocalDate(item.application.scheduledDate!)
                                ?? new Date(item.application.scheduledDate!),
                              "yyyy년 M월 d일",
                              { locale: ko }
                            )}
                          </span>
                        </div>
                        <span>•</span>
                        <span>{item.application.consultant}</span>
                        <span>•</span>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          <span
                            className={`whitespace-nowrap ${item.isOverdue ? "text-red-600 font-medium" : ""}`}
                          >
                            {item.isOverdue
                              ? `기한 초과 ${item.overdueDays}일`
                              : `D-${item.daysLeft}`}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => onCreateReport(item.application.id)}
                      variant={item.isOverdue ? "destructive" : "default"}
                    >
                      보고서 작성
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 비정기 오피스아워 일지 작성 */}
        <div className="bg-white rounded-lg border mt-6">
          <div className="p-6 border-b flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-gray-900">비정기 오피스아워 일지 작성</h3>
              <p className="text-sm text-muted-foreground mt-1">
                비정기 오피스아워 세션에 대해 일지를 작성해주세요.
              </p>
            </div>
            <Button
              size="lg"
              className="bg-slate-900 text-white hover:bg-slate-800"
              onClick={() => onCreateReport("irregular-manual")}
            >
              새 일지 작성
            </Button>
          </div>
          <div className="divide-y">
            {irregularPendingReports.map((item) => (
              <div
                key={item.application.id}
                className={`p-4 hover:bg-gray-50 transition-colors ${
                  item.isOverdue ? "bg-red-50/50" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: item.programColor }}
                      />
                      <span className="text-xs text-muted-foreground">
                        {item.programName}
                      </span>
                      {item.isOverdue && (
                        <Badge variant="destructive" className="text-xs">
                          기한 초과
                        </Badge>
                      )}
                    </div>
                    <h4 className="font-medium text-gray-900 mb-1">
                      {item.application.officeHourTitle}
                    </h4>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>
                          {format(
                            parseLocalDate(item.application.scheduledDate!)
                              ?? new Date(item.application.scheduledDate!),
                            "yyyy년 M월 d일",
                            { locale: ko }
                          )}
                        </span>
                      </div>
                      <span>•</span>
                      <span>{item.application.consultant}</span>
                      <span>•</span>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span
                          className={`whitespace-nowrap ${item.isOverdue ? "text-red-600 font-medium" : ""}`}
                        >
                          {item.isOverdue
                            ? `기한 초과 ${item.overdueDays}일`
                            : `D-${item.daysLeft}`}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => onCreateReport(item.application.id)}
                    variant={item.isOverdue ? "destructive" : "default"}
                  >
                    보고서 작성
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 작성된 보고서 목록 */}
        <div className="bg-white rounded-lg border mt-6">
          <div className="p-6 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">작성된 보고서</h3>
            <span className="text-sm text-muted-foreground">
              {submittedReports.length}건
            </span>
          </div>
          <div className="divide-y">
            {submittedReports.length === 0 ? (
              <div className="p-12 text-center">
                <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  작성된 보고서가 없습니다
                </p>
              </div>
            ) : (
              submittedReports.map(({ report, application, programName, programColor }) => (
                <div
                  key={report.id}
                  className="p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: programColor }}
                        />
                        <span className="text-xs text-muted-foreground">
                          {programName}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          만족도 {report.satisfaction}점
                        </Badge>
                      </div>
                      <h4 className="font-medium text-gray-900 mb-1 truncate">
                        {application.officeHourTitle}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>
                            {report.date
                              ? format(
                                parseLocalDate(report.date) ?? new Date(report.date),
                                "yyyy년 M월 d일",
                                { locale: ko }
                              )
                              : "-"}
                          </span>
                        </div>
                        <span>•</span>
                        <span>{report.consultantName || application.consultant}</span>
                        <span>•</span>
                        <span>
                          수정일 {format(new Date(report.updatedAt ?? report.createdAt), "M/d", { locale: ko })}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onEditReport(report)}
                      >
                        보기/수정
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (confirm("보고서를 되돌려 미작성 목록으로 보낼까요?")) {
                            onDeleteReport(report);
                          }
                        }}
                      >
                        되돌리기
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
