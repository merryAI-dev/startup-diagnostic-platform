import { useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { getBlob, ref as storageRef } from "firebase/storage";
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
import { DateRangePicker } from "@/redesign/app/components/ui/date-range-picker";
import { PaginationControls } from "@/redesign/app/components/ui/pagination-controls";
import { AlertCircle, Clock, Download, Eye, FileText, Loader2, Mail } from "lucide-react";
import { addDays, format, differenceInDays } from "date-fns";
import { ko } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { storage as firebaseStorage } from "@/redesign/app/lib/firebase";
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

const isExcelSupportedImageType = (contentType: string) => {
  const normalized = contentType.toLowerCase();
  return (
    normalized.includes("png")
    || normalized.includes("jpeg")
    || normalized.includes("jpg")
    || normalized.includes("gif")
  );
};

const normalizeExcelImageExtension = (
  contentType: string,
  url: string
): "png" | "jpeg" | "gif" => {
  const byType = contentType.toLowerCase();
  if (byType.includes("png")) return "png";
  if (byType.includes("jpeg") || byType.includes("jpg")) return "jpeg";
  if (byType.includes("gif")) return "gif";
  const path = (url.split("?")[0] ?? "").toLowerCase();
  if (path.endsWith(".png")) return "png";
  if (path.endsWith(".gif")) return "gif";
  return "jpeg";
};

const convertImageBlobToPngBuffer = async (blob: Blob) => {
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () => reject(new Error("이미지 디코딩에 실패했습니다."));
      next.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("이미지 변환 컨텍스트를 생성할 수 없습니다.");
    }

    context.drawImage(image, 0, 0);

    const convertedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/png");
    });

    if (!convertedBlob) {
      throw new Error("PNG 변환에 실패했습니다.");
    }

    return convertedBlob.arrayBuffer();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const loadWorkbookImageBuffer = async (url: string) => {
  const blob = await (async () => {
    if (firebaseStorage) {
        try {
          return await getBlob(storageRef(firebaseStorage, url));
        } catch (error) {
          if (error instanceof Error && /cors|xmlhttprequest|access-control-allow-origin/i.test(error.message)) {
            throw new Error("Firebase Storage CORS 설정이 필요합니다.");
          }
          // Fallback to fetch for non-Storage URLs or SDK resolution failures.
        }
      }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.blob();
  })();

  if (isExcelSupportedImageType(blob.type || "")) {
    return {
      buffer: await blob.arrayBuffer(),
      extension: normalizeExcelImageExtension(blob.type || "", url),
    } as const;
  }

  return {
    buffer: await convertImageBlobToPngBuffer(blob),
    extension: "png" as const,
  };
};

const normalizeConsultantDisplayName = (value?: string | null) =>
  (value ?? "")
    .replace(/\s*컨설턴트\s*$/u, "")
    .trim()
    .toLowerCase();

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

type DownloadTarget = {
  report: OfficeHourReport;
  application: Application;
  programName: string;
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
  const PAGE_SIZE = 10;
  const isConsultantUser = currentUser.role === "consultant";
  const isAdminUser = currentUser.role === "admin";
  const pageTitleClassName = "text-2xl font-semibold text-slate-900";
  const pageDescriptionClassName = "mt-1 text-sm text-slate-500";
  const pageContainerClassName = isConsultantUser
    ? "mx-auto w-full max-w-[1440px]"
    : "mx-auto w-full max-w-7xl";
  const [reportDateRange, setReportDateRange] = useState<DateRange | undefined>();
  const [reportPage, setReportPage] = useState(1);
  const [selectedReportItem, setSelectedReportItem] = useState<{
    report: OfficeHourReport;
    application: Application;
    programName: string;
    programColor: string;
    programId: string;
  } | null>(null);
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);
  const [downloadingReportId, setDownloadingReportId] = useState<string | null>(null);

  const normalizeConsultantName = (value?: string | null) =>
    (value ?? "").replace(/\s*컨설턴트\s*$/u, "").trim().toLowerCase();

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const resolveConsultantEmail = (application?: Application | null, report?: OfficeHourReport | null) => {
    const consultantId = report?.consultantId || application?.consultantId || "";

    if (consultantId) {
      const byId = consultants.find((consultant) => consultant.id === consultantId);
      if (byId?.email) return byId.email;
    }
    return "";
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

  const downloadReportAsExcel = async ({ report, application, programName }: DownloadTarget) => {
    try {
      const content = parseReportContent(report.content);
      const participantText = (report.participants ?? []).join(", ");
      const scheduledDate = application.scheduledDate
        ? format(
            parseLocalDate(application.scheduledDate) ?? new Date(application.scheduledDate),
            "yyyy-MM-dd",
            { locale: ko }
          )
        : "-";
      const writtenDate = report.date
        ? format(
            parseLocalDate(report.date) ?? new Date(report.date),
            "yyyy-MM-dd",
            { locale: ko }
          )
        : "-";

      const rows: Array<[string, string]> = [
        ["사업", programName],
        ["컨설턴트", report.consultantName || application.consultant || "-"],
        ["기업", application.companyName || application.applicantName || "-"],
        ["오피스아워", application.officeHourTitle || "-"],
        ["진행일", scheduledDate],
        ["작성일", writtenDate],
        ["주제", report.topic || "-"],
        ["참여자", participantText || "-"],
        ["기업의 현황", content.companyStatus || "-"],
        ["자문내용", content.advisoryContent || "-"],
        ["팔로업", report.followUp || "-"],
        ["첨부 사진", report.photos?.length ? `${report.photos.length}개` : "-"],
      ];

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "MYSC";
      workbook.created = new Date();
      const worksheet = workbook.addWorksheet("오피스아워 일지");

      worksheet.columns = [
        { width: 22 },
        { width: 80 },
      ];
      worksheet.mergeCells("A1:B1");
      const titleCell = worksheet.getCell("A1");
      titleCell.value = "오피스아워 일지";
      titleCell.font = { name: "Malgun Gothic", size: 16, bold: true };
      titleCell.alignment = { vertical: "middle", horizontal: "left" };
      worksheet.getRow(1).height = 24;

      let rowIndex = 3;
      rows.forEach(([label, value]) => {
        const row = worksheet.getRow(rowIndex);
        row.getCell(1).value = label;
        row.getCell(2).value = value;
        row.getCell(1).font = { name: "Malgun Gothic", size: 10, bold: true };
        row.getCell(2).font = { name: "Malgun Gothic", size: 10 };
        row.getCell(1).alignment = { vertical: "top", wrapText: true };
        row.getCell(2).alignment = { vertical: "top", wrapText: true };
        row.getCell(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" },
        };
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FFCBD5E1" } },
            left: { style: "thin", color: { argb: "FFCBD5E1" } },
            bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
            right: { style: "thin", color: { argb: "FFCBD5E1" } },
          };
        });
        rowIndex += 1;
      });

      let imageFailures = 0;

      if (report.photos?.length) {
        rowIndex += 1;
        worksheet.getCell(`A${rowIndex}`).value = "사진";
        worksheet.getCell(`A${rowIndex}`).font = { name: "Malgun Gothic", size: 12, bold: true };
        rowIndex += 1;

        for (let index = 0; index < report.photos.length; index += 1) {
          const url = report.photos[index] ?? "";
          if (!url) {
            imageFailures += 1;
            continue;
          }
          try {
            const { buffer, extension } = await loadWorkbookImageBuffer(url);
            const imageId = workbook.addImage({
              buffer,
              extension,
            });

            worksheet.mergeCells(`A${rowIndex}:B${rowIndex}`);
            worksheet.getCell(`A${rowIndex}`).value = `사진 ${index + 1}`;
            worksheet.getCell(`A${rowIndex}`).font = { name: "Malgun Gothic", size: 10, bold: true };
            rowIndex += 1;
            worksheet.addImage(imageId, {
              tl: { col: 0, row: rowIndex - 1 },
              ext: { width: 560, height: 315 },
              editAs: "oneCell",
            });

            for (let offset = 0; offset < 17; offset += 1) {
              worksheet.getRow(rowIndex + offset).height = 18;
            }
            rowIndex += 18;
          } catch (error) {
            imageFailures += 1;
            worksheet.getCell(`A${rowIndex}`).value = `사진 ${index + 1}`;
            worksheet.getCell(`B${rowIndex}`).value = "파일에 직접 넣지 못했습니다.";
            worksheet.getCell(`B${rowIndex}`).font = {
              name: "Malgun Gothic",
              size: 10,
              color: { argb: "FF64748B" },
            };
            rowIndex += 1;
            if (error instanceof Error && /cors/i.test(error.message)) {
              throw error;
            }
          }
        }
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const safeCompanyName = (application.companyName || application.applicantName || "office-hour")
        .replace(/[\\/:*?"<>|]/g, "-")
        .trim();
      const safeDate = scheduledDate === "-" ? "undated" : scheduledDate;
      const filename = `${safeCompanyName}_오피스아워일지_${safeDate}.xlsx`;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("엑셀 다운로드가 완료되었습니다.");
      if (imageFailures > 0) {
        toast.error(`이미지 ${imageFailures}개는 파일에 직접 넣지 못해 제외되었습니다.`);
      }
    } catch (error) {
      console.error("report excel download failed", error);
      const message =
        error instanceof Error && /cors/i.test(error.message)
          ? "엑셀 다운로드에 실패했습니다. Firebase Storage CORS 설정이 필요합니다."
          : "엑셀 다운로드에 실패했습니다.";
      toast.error(message);
    }
  };

  const handleDownloadReport = async (target: DownloadTarget & { reportId: string }) => {
    if (downloadingReportId) return;

    setDownloadingReportId(target.reportId);
    try {
      await downloadReportAsExcel(target);
    } finally {
      setDownloadingReportId(null);
    }
  };

  const isForCurrentConsultant = (application?: Application | null, report?: OfficeHourReport | null) => {
    if (!isConsultantUser) return true;
    if (currentConsultantId) {
      if (report?.consultantId) return report.consultantId === currentConsultantId;
      if (application?.consultantId) return application.consultantId === currentConsultantId;
    }
    const currentNameKey = normalizeConsultantDisplayName(currentConsultantName);
    if (!currentNameKey) return false;
    if (report?.consultantName) {
      return normalizeConsultantDisplayName(report.consultantName) === currentNameKey;
    }
    if (application?.consultant) {
      return normalizeConsultantDisplayName(application.consultant) === currentNameKey;
    }
    return false;
  };

  const getSessionEndTime = (app: Application) => {
    const durationHours = app.duration ?? 1;

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
  const filteredReportRows = useMemo(() => {
    if (!reportDateRange?.from && !reportDateRange?.to) {
      return reportRows;
    }

    const rangeStart = reportDateRange.from
      ? new Date(
          reportDateRange.from.getFullYear(),
          reportDateRange.from.getMonth(),
          reportDateRange.from.getDate()
        )
      : null;
    const rangeEnd = reportDateRange.to
      ? new Date(
          reportDateRange.to.getFullYear(),
          reportDateRange.to.getMonth(),
          reportDateRange.to.getDate()
        )
      : rangeStart;

    return reportRows.filter((row) => {
      const scheduledDate = parseLocalDate(row.application.scheduledDate);
      if (!scheduledDate) return false;
      const normalized = new Date(
        scheduledDate.getFullYear(),
        scheduledDate.getMonth(),
        scheduledDate.getDate()
      );

      if (rangeStart && normalized < rangeStart) return false;
      if (rangeEnd && normalized > rangeEnd) return false;
      return true;
    });
  }, [reportDateRange, reportRows]);
  const paginatedReportRows = useMemo(() => {
    const startIndex = (reportPage - 1) * PAGE_SIZE;
    return filteredReportRows.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredReportRows, reportPage]);
  const selectedReportContent = useMemo(
    () => parseReportContent(selectedReportItem?.report.content),
    [selectedReportItem?.report.content]
  );

  useEffect(() => {
    setReportPage(1);
  }, [filteredReportRows.length, reportDateRange?.from, reportDateRange?.to]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredReportRows.length / PAGE_SIZE));
    if (reportPage > totalPages) {
      setReportPage(totalPages);
    }
  }, [filteredReportRows.length, reportPage]);

  const pageTitle = isConsultantUser ? "오피스아워 일지" : "미작성 보고서";
  const pageDescription = isConsultantUser
    ? "배정된 세션의 오피스아워 일지 작성 현황을 확인합니다"
    : "세션 완료 후 3일 이내 보고서 작성 현황을 관리합니다";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-5">
        <div className={pageContainerClassName}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className={pageTitleClassName}>{pageTitle}</h1>
              <p className={pageDescriptionClassName}>{pageDescription}</p>
            </div>
          </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border bg-gray-50 px-4 py-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">전체 미작성</span>
              <FileText className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {pendingReports.length}건
            </div>
          </div>

          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs text-red-700">기한 초과</span>
              <AlertCircle className="h-3.5 w-3.5 text-red-500" />
            </div>
            <div className="text-2xl font-bold text-red-600">
              {overdueCount}건
            </div>
            <p className="mt-0.5 text-[11px] text-red-600">3일 이상 지난 보고서</p>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs text-amber-700">곧 마감</span>
              <Clock className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-amber-600">
              {pendingReports.filter((p) => !p.isOverdue && p.daysLeft <= 1).length}건
            </div>
            <p className="mt-0.5 text-[11px] text-amber-600">마감 1일 이내</p>
          </div>
        </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 py-5">
        <div className={`${pageContainerClassName} flex min-h-0 flex-1 flex-col`}>
        {/* 오피스아워 보고서 현황 */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-white">
          <div className="shrink-0 border-b p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">오피스아워 보고서 현황</h3>
              <div className="flex items-center gap-2">
                <DateRangePicker
                  value={reportDateRange}
                  onChange={setReportDateRange}
                />
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
          </div>
          <div className="flex min-h-0 flex-1 flex-col divide-y overflow-hidden">
            {filteredReportRows.length === 0 ? (
              <div className="p-12 text-center">
                <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  보고서 데이터가 없습니다
                </p>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <Table>
                  <TableHeader className="[&_tr]:sticky [&_tr]:top-0 [&_tr]:z-10 [&_tr]:bg-white">
                    <TableRow className="hover:bg-white">
                      <TableHead className="bg-white">상태</TableHead>
                      <TableHead className="bg-white">사업</TableHead>
                      <TableHead className="bg-white">컨설턴트</TableHead>
                      <TableHead className="bg-white">오피스아워</TableHead>
                      <TableHead className="bg-white">기한</TableHead>
                      <TableHead className="bg-white">진행일</TableHead>
                      <TableHead className="bg-white">작성일</TableHead>
                      <TableHead className="w-[72px] bg-white text-center">다운로드</TableHead>
                      <TableHead className="bg-white text-right">관리</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedReportRows.map((row) => (
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
                        <TableCell className="text-center">
                          {row.report ? (
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-800"
                              disabled={downloadingReportId !== null}
                              onClick={() =>
                                void handleDownloadReport({
                                  reportId: row.report!.id,
                                  report: row.report!,
                                  application: row.application,
                                  programName: row.programName,
                                })
                              }
                              aria-label="엑셀 다운로드"
                              title="엑셀 다운로드"
                            >
                              {downloadingReportId === row.report.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {isAdminUser ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8"
                                disabled={!row.report}
                                onClick={() => {
                                  if (!row.report) return;
                                  setSelectedReportItem({
                                    report: row.report,
                                    application: row.application,
                                    programName: row.programName,
                                    programColor: row.programColor,
                                    programId: row.programId,
                                  });
                                }}
                                aria-label="상세 보기"
                                title={row.report ? "상세 보기" : "작성된 일지가 없습니다"}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8"
                                disabled={!!row.report}
                                onClick={() => {
                                  if (row.report) return;
                                  handleSendReminderEmail(row);
                                }}
                                aria-label="리마인드 메일 전송"
                                title={row.report ? "이미 작성된 일지입니다" : "리마인드 메일 전송"}
                              >
                                <Mail className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : row.type === "submitted" ? (
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              onClick={() =>
                                setSelectedReportItem({
                                  report: row.report!,
                                  application: row.application,
                                  programName: row.programName,
                                  programColor: row.programColor,
                                  programId: row.programId,
                                })
                              }
                              aria-label="상세 보기"
                              title="상세 보기"
                            >
                              <Eye className="h-4 w-4" />
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
          <div className="shrink-0 border-t bg-white px-6 py-3">
            <PaginationControls
              page={reportPage}
              pageSize={PAGE_SIZE}
              totalItems={filteredReportRows.length}
              onPageChange={setReportPage}
              alwaysShow
            />
          </div>
        </div>
        </div>
      </div>
      <Dialog open={!!selectedReportItem} onOpenChange={(open) => {
        if (!open) setSelectedReportItem(null);
      }}>
        <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden p-0">
          {selectedReportItem && (
            <div className="flex min-h-0 flex-1 flex-col">
              <DialogHeader className="shrink-0 border-b px-6 py-5">
                <DialogTitle>오피스아워 일지 상세</DialogTitle>
              </DialogHeader>

              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-6">
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
              </div>

              <div className="shrink-0 border-t px-6 py-4">
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
