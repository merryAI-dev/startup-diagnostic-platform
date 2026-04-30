import { useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { getBlob, ref as storageRef } from "firebase/storage";
import {
  Application,
  CompanyDirectoryItem,
  Consultant,
  OfficeHourReport,
  OfficeHourType,
  Program,
  User,
} from "@/redesign/app/lib/types";
import { normalizeCompanyName } from "@/redesign/app/lib/company-name";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/redesign/app/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/redesign/app/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/redesign/app/components/ui/command";
import { AlertCircle, Check, ChevronsUpDown, Clock, Download, Eye, FileText, Loader2, Mail, X } from "lucide-react";
import { addDays, format, differenceInDays } from "date-fns";
import { ko } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { storage as firebaseStorage } from "@/redesign/app/lib/firebase";
import { toast } from "sonner";
import { parseLocalDateTimeKey } from "@/redesign/app/lib/date-keys";

const EXCEL_CELL_SAFE_TEXT_LIMIT = 30000;

const parseLocalDate = (value?: string | null) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatLocalDateText = (
  value: string | null | undefined,
  pattern: string,
  fallback = "-",
) => {
  const date = parseLocalDate(value);
  return date ? format(date, pattern, { locale: ko }) : fallback;
};

const formatLocalDateTimeText = (
  date: string | null | undefined,
  time?: string | null,
  datePattern = "yyyy.MM.dd",
  fallback = "-",
) => {
  const dateText = formatLocalDateText(date, datePattern, "");
  if (!dateText) return fallback;
  const trimmedTime = time?.trim();
  return trimmedTime ? `${dateText} ${trimmedTime}` : dateText;
};

const formatReportWrittenAtText = (
  value: Date | string | null | undefined,
  pattern = "yyyy.MM.dd HH:mm",
  fallback = "-",
) => {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : format(date, pattern, { locale: ko });
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

const splitTextForExcelCells = (value: string, chunkSize = EXCEL_CELL_SAFE_TEXT_LIMIT) => {
  const normalized = value || "";
  if (normalized.length <= chunkSize) {
    return [normalized];
  }

  const chunks: string[] = [];
  let index = 0;
  while (index < normalized.length) {
    chunks.push(normalized.slice(index, index + chunkSize));
    index += chunkSize;
  }
  return chunks;
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

const resolveManualReportApplicationType = (
  report: Pick<OfficeHourReport, "applicationId" | "applicationType">,
): OfficeHourType => {
  if (report.applicationType === "mentoring") return "mentoring";
  if (report.applicationType === "irregular") return "irregular";
  if (report.applicationId.startsWith("manual-mentoring-")) return "mentoring";
  return "irregular";
};

const getApplicationTypeLabel = (type?: OfficeHourType) => {
  if (type === "regular") return "정기";
  if (type === "mentoring") return "멘토링&사후관리";
  if (type === "custom") return "기타";
  return "비정기";
};

const getApplicationTypeBadgeClassName = (type?: OfficeHourType) => {
  if (type === "regular") return "bg-blue-50 text-blue-700";
  if (type === "mentoring") return "bg-violet-50 text-violet-700";
  if (type === "custom") return "bg-slate-100 text-slate-700";
  return "bg-emerald-50 text-emerald-700";
};

const getManualApplicationOfficeHourTitle = (type: OfficeHourType, topic?: string) => {
  const trimmedTopic = topic?.trim();
  if (trimmedTopic) return trimmedTopic;
  return type === "mentoring" ? "멘토링&사후관리 일지" : "비정기 오피스아워";
};

const getManualApplicationAgenda = (type: OfficeHourType, topic?: string) => {
  const trimmedTopic = topic?.trim();
  if (trimmedTopic) return trimmedTopic;
  return type === "mentoring" ? "멘토링&사후관리" : "비정기 오피스아워";
};

interface PendingReportsDashboardProps {
  applications: Application[];
  reports: OfficeHourReport[];
  programs: Program[];
  consultants: Consultant[];
  companies?: CompanyDirectoryItem[];
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
  companies = [],
  currentUser,
  currentConsultantId,
  currentConsultantName,
  onCreateReport,
}: PendingReportsDashboardProps) {
  const PAGE_SIZE = 10;
  const isConsultantUser = currentUser.role === "consultant";
  const isAdminUser = currentUser.role === "admin";
  const pageTitleClassName = "text-2xl font-semibold text-slate-900";
  const pageDescriptionClassName = "mt-1 text-sm text-slate-500";
  const pageContainerClassName = isConsultantUser
    ? "mx-auto w-full max-w-[1600px]"
    : "mx-auto w-full max-w-[1600px]";
  const [reportDateRange, setReportDateRange] = useState<DateRange | undefined>();
  const [reportStatusFilter, setReportStatusFilter] = useState<"all" | "작성" | "미작성">("all");
  const [reportTypeFilter, setReportTypeFilter] = useState<"all" | OfficeHourType>("all");
  const [programFilter, setProgramFilter] = useState<string>("all");
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
  const [companyFilterOpen, setCompanyFilterOpen] = useState(false);
  const [companyFilterQuery, setCompanyFilterQuery] = useState("");
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);

  const companyNameById = useMemo(
    () => new Map(companies.map((company) => [company.id, company.name])),
    [companies],
  );

  const resolveRowCompanyId = (row: Pick<ReportRow, "application" | "report">) =>
    row.report?.companyId || row.application.companyId || null;

  const resolveRowCompanyName = (row: Pick<ReportRow, "application" | "report">) => {
    const companyId = resolveRowCompanyId(row);
    if (companyId && companyNameById.has(companyId)) {
      return companyNameById.get(companyId) ?? "기업명 미입력";
    }
    return (
      row.report?.companyName?.trim()
      || row.application.companyName?.trim()
      || row.application.applicantName?.trim()
      || "기업명 미입력"
    );
  };

  const companyFilterOptions = useMemo(() => {
    const normalizedQuery = normalizeCompanyName(companyFilterQuery);
    return companies
      .filter((company) => {
        if (!normalizedQuery) return true;
        const normalizedName = company.normalizedName || normalizeCompanyName(company.name);
        const normalizedAliases = (company.aliases ?? []).map((alias) => normalizeCompanyName(alias));
        return (
          normalizedName.includes(normalizedQuery)
          || normalizedQuery.includes(normalizedName)
          || normalizedAliases.some((alias) => alias.includes(normalizedQuery) || normalizedQuery.includes(alias))
        );
      })
      .sort((left, right) => {
        const leftSelected = selectedCompanyIds.includes(left.id);
        const rightSelected = selectedCompanyIds.includes(right.id);
        if (leftSelected !== rightSelected) return leftSelected ? -1 : 1;
        return left.name.localeCompare(right.name, "ko-KR");
      })
      .slice(0, normalizedQuery ? 50 : 80);
  }, [companies, companyFilterQuery, selectedCompanyIds]);

  const selectedCompanyFilters = useMemo(
    () =>
      selectedCompanyIds.map((companyId) => ({
        id: companyId,
        name: companyNameById.get(companyId) ?? "기업명 미입력",
      })),
    [companyNameById, selectedCompanyIds],
  );

  const visibleCompanyFilterBadges = selectedCompanyFilters.slice(0, 2);
  const hiddenCompanyFilterCount = selectedCompanyFilters.length - visibleCompanyFilterBadges.length;

  const toggleCompanyFilter = (companyId: string) => {
    setSelectedCompanyIds((prev) =>
      prev.includes(companyId)
        ? prev.filter((id) => id !== companyId)
        : [...prev, companyId],
    );
  };

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
    const scheduledDate = formatLocalDateText(
      row.application.scheduledDate,
      "yyyy년 M월 d일",
      "일정 확인 필요",
    );
    const companyName = resolveRowCompanyName(row);
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
      const scheduledDate = formatLocalDateTimeText(
        application.scheduledDate,
        application.scheduledTime,
        "yyyy-MM-dd",
      );
      const writtenDate = formatReportWrittenAtText(
        report.completedAt || report.createdAt,
        "yyyy-MM-dd HH:mm",
      );

      const rows: Array<[string, string]> = [
        ["사업", programName],
        ["컨설턴트", report.consultantName || application.consultant || "-"],
        ["기업", report.companyName || application.companyName || application.applicantName || "-"],
        ["오피스아워", application.officeHourTitle || "-"],
        ["진행일", scheduledDate],
        ["작성일", writtenDate],
        ["주제", report.topic || "-"],
        ["담당자", report.managerName || "-"],
        ["참여자", participantText || "-"],
        ["미팅 아젠다", content.companyStatus || "-"],
        ["자문내용", content.advisoryContent || "-"],
        ["스크립트", report.meetingRawText || "-"],
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
        const chunks = splitTextForExcelCells(value);

        chunks.forEach((chunk, chunkIndex) => {
          const row = worksheet.getRow(rowIndex);
          row.getCell(1).value = chunkIndex === 0 ? label : `${label} (${chunkIndex + 1})`;
          row.getCell(2).value = chunk;
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
      const safeCompanyName = (report.companyName || application.companyName || application.applicantName || "office-hour")
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
      const start = parseLocalDateTimeKey(app.scheduledDate, app.scheduledTime);
      if (start) {
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
          const manualType = resolveManualReportApplicationType(report);
          const syntheticApp: Application = {
            id: report.applicationId,
            type: manualType,
            status: "completed",
            companyId: report.companyId ?? null,
            companyName: report.companyName ?? undefined,
            officeHourTitle: getManualApplicationOfficeHourTitle(manualType, report.topic),
            consultant: report.consultantName || "컨설턴트",
            consultantId: report.consultantId,
            sessionFormat: "online",
            agenda: getManualApplicationAgenda(manualType, report.topic),
            requestContent: "",
            scheduledDate: report.date,
            scheduledTime: report.time,
            programId: report.programId,
            createdAt: report.createdAt,
            updatedAt: report.updatedAt,
          };
          if (!isForCurrentConsultant(syntheticApp, report)) return null;
          const program = programs.find((p) => p.id === report.programId);
          return {
            report,
            application: syntheticApp,
            programName: program?.name || "-",
            programColor: program?.color || "#94a3b8",
            programId: report.programId || "",
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
  const programFilterOptions = useMemo(() => {
    const rowsByProgramId = new Map<string, { id: string; name: string }>();
    reportRows.forEach((row) => {
      if (!row.programId || row.programName === "-" || rowsByProgramId.has(row.programId)) return;
      rowsByProgramId.set(row.programId, {
        id: row.programId,
        name: row.programName || "알 수 없음",
      });
    });
    return Array.from(rowsByProgramId.values()).sort((left, right) =>
      left.name.localeCompare(right.name, "ko-KR"),
    );
  }, [reportRows]);
  const filteredReportRows = useMemo(() => {
    const rangeStart = reportDateRange?.from
      ? new Date(
          reportDateRange.from.getFullYear(),
          reportDateRange.from.getMonth(),
          reportDateRange.from.getDate()
        )
      : null;
    const rangeEnd = reportDateRange?.to
      ? new Date(
          reportDateRange.to.getFullYear(),
          reportDateRange.to.getMonth(),
          reportDateRange.to.getDate()
        )
      : rangeStart;

    return reportRows.filter((row) => {
      if (isAdminUser && selectedCompanyIds.length > 0) {
        const companyId = resolveRowCompanyId(row);
        if (!companyId || !selectedCompanyIds.includes(companyId)) return false;
      }

      if (reportTypeFilter !== "all" && row.application.type !== reportTypeFilter) {
        return false;
      }

      if (programFilter !== "all" && row.programId !== programFilter) {
        return false;
      }

      if (reportStatusFilter !== "all" && row.statusLabel !== reportStatusFilter) {
        return false;
      }

      const scheduledDate = parseLocalDate(row.application.scheduledDate);
      if (!scheduledDate) return !rangeStart && !rangeEnd;
      const normalized = new Date(
        scheduledDate.getFullYear(),
        scheduledDate.getMonth(),
        scheduledDate.getDate()
      );

      if (rangeStart && normalized < rangeStart) return false;
      if (rangeEnd && normalized > rangeEnd) return false;
      return true;
    });
  }, [isAdminUser, programFilter, reportDateRange, reportRows, reportStatusFilter, reportTypeFilter, selectedCompanyIds]);
  const paginatedReportRows = useMemo(() => {
    const startIndex = (reportPage - 1) * PAGE_SIZE;
    return filteredReportRows.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredReportRows, reportPage]);
  const filteredPendingRows = useMemo(
    () => filteredReportRows.filter((row) => row.statusLabel === "미작성"),
    [filteredReportRows],
  );
  const filteredOverdueCount = useMemo(
    () => filteredPendingRows.filter((row) => row.dueOverdue).length,
    [filteredPendingRows],
  );
  const filteredCompletedSessionCount = filteredReportRows.length;
  const filteredCompletedDurationHours = useMemo(
    () =>
      filteredReportRows.reduce((sum, row) => {
        const duration = row.report?.duration;
        return sum + (typeof duration === "number" && Number.isFinite(duration) && duration > 0 ? duration : 0);
      }, 0),
    [filteredReportRows],
  );
  const selectedReportContent = useMemo(
    () => parseReportContent(selectedReportItem?.report.content),
    [selectedReportItem?.report.content]
  );
  const selectedReportDetailTitle = useMemo(() => {
    if (!selectedReportItem) {
      return "오피스아워 일지 상세";
    }

    const reportType =
      selectedReportItem.report.applicationType
      || selectedReportItem.application.type
      || resolveManualReportApplicationType(selectedReportItem.report);

    if (reportType === "mentoring") {
      return "멘토링&사후관리 일지 상세";
    }
    if (reportType === "irregular") {
      return "비정기 오피스아워 상세";
    }
    return "오피스아워 일지 상세";
  }, [selectedReportItem]);

  useEffect(() => {
    setReportPage(1);
  }, [filteredReportRows.length, programFilter, reportDateRange?.from, reportDateRange?.to, reportStatusFilter, reportTypeFilter, selectedCompanyIds]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredReportRows.length / PAGE_SIZE));
    if (reportPage > totalPages) {
      setReportPage(totalPages);
    }
  }, [filteredReportRows.length, reportPage]);

  const pageTitle = isConsultantUser ? "오피스아워 일지" : "오피스아워 보고서";
  const pageDescription = isConsultantUser
    ? "배정된 세션의 오피스아워 일지 작성 현황을 확인합니다"
    : "세션 완료 후 3일 이내 보고서 작성 현황을 관리합니다";
  const canCreateManualReport = currentUser.role === "consultant";

  const formatDurationHours = (value: number) =>
    Number.isInteger(value) ? `${value}시간` : `${value.toFixed(1)}시간`;

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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] text-emerald-700">진행 시수</span>
              <FileText className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <div className="text-xl font-bold text-emerald-700">
              {filteredCompletedSessionCount}건
            </div>
            <p className="mt-0.5 text-[10px] text-emerald-700">필터 결과 기준 세션 수</p>
          </div>

          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] text-indigo-700">진행 시간</span>
              <Clock className="h-3.5 w-3.5 text-indigo-500" />
            </div>
            <div className="text-xl font-bold text-indigo-700">
              {formatDurationHours(filteredCompletedDurationHours)}
            </div>
            <p className="mt-0.5 text-[10px] text-indigo-700">작성된 일지의 소요 시간 합계</p>
          </div>

          <div className="rounded-lg border bg-gray-50 px-4 py-2.5">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">미작성</span>
              <FileText className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <div className="text-xl font-bold text-gray-900">
              {filteredPendingRows.length}건
            </div>
          </div>

          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] text-red-700">기한 초과</span>
              <AlertCircle className="h-3.5 w-3.5 text-red-500" />
            </div>
            <div className="text-xl font-bold text-red-600">
              {filteredOverdueCount}건
            </div>
            <p className="mt-0.5 text-[10px] text-red-600">3일 이상 지난 보고서</p>
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
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h3 className="font-semibold text-gray-900">오피스아워 보고서 현황</h3>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                {isAdminUser && (
                  <Popover
                    open={companyFilterOpen}
                    onOpenChange={(open) => {
                      setCompanyFilterOpen(open);
                      if (!open) setCompanyFilterQuery("");
                    }}
                  >
                    <PopoverTrigger asChild>
                      <div
                        role="combobox"
                        aria-expanded={companyFilterOpen}
                        tabIndex={0}
                        className="flex min-h-9 w-full cursor-pointer items-center gap-1.5 rounded-md border bg-white px-2 py-1 text-sm outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-[320px]"
                      >
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                          {selectedCompanyFilters.length > 0 ? (
                            <>
                              {visibleCompanyFilterBadges.map((company) => (
                                <Badge
                                  key={company.id}
                                  variant="secondary"
                                  className="max-w-[120px] truncate bg-emerald-100 text-emerald-700"
                                >
                                  {company.name}
                                </Badge>
                              ))}
                              {hiddenCompanyFilterCount > 0 && (
                                <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                                  +{hiddenCompanyFilterCount}
                                </Badge>
                              )}
                            </>
                          ) : (
                            <span className="px-1 text-slate-500">기업 필터</span>
                          )}
                        </div>
                        {selectedCompanyIds.length > 0 && (
                          <button
                            type="button"
                            className="rounded-sm p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setSelectedCompanyIds([]);
                            }}
                            aria-label="기업 필터 전체 해제"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
                      </div>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-[min(420px,calc(100vw-48px))] p-0">
                      <Command shouldFilter={false}>
                        <CommandInput
                          value={companyFilterQuery}
                          onValueChange={setCompanyFilterQuery}
                          placeholder="기업명 검색"
                        />
                        <CommandList className="max-h-72">
                          <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
                          <CommandGroup>
                            {companyFilterOptions.map((company) => {
                              const selected = selectedCompanyIds.includes(company.id);
                              return (
                                <CommandItem
                                  key={company.id}
                                  value={company.id}
                                  onSelect={() => toggleCompanyFilter(company.id)}
                                  className="cursor-pointer"
                                >
                                  <Check
                                    className={
                                      selected
                                        ? "h-4 w-4 text-emerald-600 opacity-100"
                                        : "h-4 w-4 opacity-0"
                                    }
                                  />
                                  <span className="min-w-0 flex-1 truncate">{company.name}</span>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                      <div className="flex items-center justify-between border-t px-3 py-2">
                        <span className="text-xs text-slate-500">
                          {selectedCompanyIds.length > 0
                            ? `${selectedCompanyIds.length}개 기업 선택됨`
                            : "전체 기업"}
                        </span>
                        {selectedCompanyIds.length > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => setSelectedCompanyIds([])}
                          >
                            전체 보기
                          </Button>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                <Select value={programFilter} onValueChange={setProgramFilter}>
                  <SelectTrigger className="w-full bg-white sm:w-[180px]">
                    <SelectValue placeholder="사업 필터" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 사업</SelectItem>
                    {programFilterOptions.map((program) => (
                      <SelectItem key={program.id} value={program.id}>
                        {program.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={reportTypeFilter}
                  onValueChange={(value) => setReportTypeFilter(value as "all" | OfficeHourType)}
                >
                  <SelectTrigger className="w-full bg-white sm:w-[140px]">
                    <SelectValue placeholder="유형" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 유형</SelectItem>
                    <SelectItem value="regular">정기</SelectItem>
                    <SelectItem value="irregular">비정기</SelectItem>
                    <SelectItem value="mentoring">멘토링&사후관리</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={reportStatusFilter}
                  onValueChange={(value) => setReportStatusFilter(value as "all" | "작성" | "미작성")}
                >
                  <SelectTrigger className="w-full bg-white sm:w-[140px]">
                    <span className={reportStatusFilter === "all" ? "text-muted-foreground" : ""}>
                      {reportStatusFilter === "all" ? "작성여부" : reportStatusFilter}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="작성">작성</SelectItem>
                    <SelectItem value="미작성">미작성</SelectItem>
                  </SelectContent>
                </Select>
                <DateRangePicker
                  value={reportDateRange}
                  onChange={setReportDateRange}
                />
                {canCreateManualReport && (
                  <>
                    <Button
                      size="sm"
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                      onClick={() => onCreateReport("irregular-manual")}
                    >
                      비정기 오피스아워 작성
                    </Button>
                    <Button
                      size="sm"
                      className="bg-violet-600 text-white hover:bg-violet-700"
                      onClick={() => onCreateReport("mentoring-manual")}
                    >
                      멘토링&사후관리 일지 작성
                    </Button>
                  </>
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
                      <TableHead className="bg-white">기한</TableHead>
                      <TableHead className="bg-white">유형</TableHead>
                      <TableHead className="bg-white">기업명</TableHead>
                      <TableHead className="bg-white">사업명</TableHead>
                      <TableHead className="bg-white">컨설턴트</TableHead>
                      <TableHead className="bg-white">진행일시</TableHead>
                      <TableHead className="bg-white">소요시간</TableHead>
                      <TableHead className="bg-white">작성일</TableHead>
                      <TableHead className="w-[72px] bg-white text-center">다운로드</TableHead>
                      <TableHead className="bg-white text-right">관리</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedReportRows.map((row) => (
                      <TableRow key={`${row.type}-${row.application.id}`}>
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
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={getApplicationTypeBadgeClassName(row.application.type)}
                          >
                            {getApplicationTypeLabel(row.application.type)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="max-w-[180px] truncate">{resolveRowCompanyName(row)}</div>
                        </TableCell>
                        <TableCell>
                          {row.programName === "-" ? (
                            <span className="text-sm text-muted-foreground">-</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: row.programColor }} />
                              <span className="text-sm">{row.programName}</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.consultantName}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatLocalDateTimeText(
                            row.application.scheduledDate,
                            row.application.scheduledTime,
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {typeof row.report?.duration === "number" && Number.isFinite(row.report.duration)
                            ? row.report.duration
                            : "-"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.report
                            ? formatReportWrittenAtText(row.report.completedAt || row.report.createdAt)
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
                <DialogTitle>{selectedReportDetailTitle}</DialogTitle>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                <div className="grid grid-cols-1 gap-x-8 gap-y-5 border-b pb-6 text-sm md:grid-cols-2">
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-slate-500">사업</div>
                    <div className="text-sm text-slate-900">{selectedReportItem.programName}</div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-slate-500">컨설턴트</div>
                    <div className="text-sm text-slate-900">
                      {selectedReportItem.report.consultantName || selectedReportItem.application.consultant}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-slate-500">오피스아워</div>
                    <div className="text-sm text-slate-900">{selectedReportItem.application.officeHourTitle}</div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-slate-500">기업</div>
                    <div className="text-sm text-slate-900">{resolveRowCompanyName(selectedReportItem)}</div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-slate-500">진행일시</div>
                    <div className="text-sm text-slate-900">
                      {formatLocalDateTimeText(
                        selectedReportItem.application.scheduledDate,
                        selectedReportItem.application.scheduledTime,
                        "yyyy년 M월 d일",
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-slate-500">소요시간</div>
                    <div className="text-sm text-slate-900">
                      {typeof selectedReportItem.report.duration === "number"
                      && Number.isFinite(selectedReportItem.report.duration)
                        ? `${selectedReportItem.report.duration}시간`
                        : "-"}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-slate-500">작성일</div>
                    <div className="text-sm text-slate-900">
                      {formatReportWrittenAtText(
                        selectedReportItem.report.completedAt || selectedReportItem.report.createdAt,
                        "yyyy년 M월 d일 HH:mm",
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 border-b py-6">
                  <div className="text-xs font-medium text-slate-500">주제</div>
                  <div className="text-sm leading-6 text-slate-900 break-all">
                    {selectedReportItem.report.topic || "-"}
                  </div>
                </div>

                <div className="space-y-2 border-b py-6">
                  <div className="text-xs font-medium text-slate-500">담당자</div>
                  <div className="text-sm leading-6 text-slate-900 break-all">
                    {selectedReportItem.report.managerName || "-"}
                  </div>
                </div>

                <div className="space-y-2 border-b py-6">
                  <div className="text-xs font-medium text-slate-500">참여자</div>
                  <div className="text-sm leading-6 text-slate-900 break-all">
                    {(selectedReportItem.report.participants ?? []).join(", ") || "-"}
                  </div>
                </div>

                <div className="space-y-2 border-b py-6">
                  <div className="text-xs font-medium text-slate-500">미팅 아젠다</div>
                  <div className="whitespace-pre-wrap break-all text-sm leading-7 text-slate-900">
                    {selectedReportContent.companyStatus || "-"}
                  </div>
                </div>

                <div className="space-y-2 border-b py-6">
                  <div className="text-xs font-medium text-slate-500">자문내용</div>
                  <div className="whitespace-pre-wrap break-all text-sm leading-7 text-slate-900">
                    {selectedReportContent.advisoryContent || "-"}
                  </div>
                </div>

                <div className="space-y-2 py-6">
                  <div className="text-xs font-medium text-slate-500">팔로업</div>
                  <div className="whitespace-pre-wrap break-all text-sm leading-7 text-slate-900">
                    {selectedReportItem.report.followUp || "-"}
                  </div>
                </div>

                <div className="space-y-2 border-t py-6">
                  <div className="text-xs font-medium text-slate-500">스크립트</div>
                  <div className="max-h-[280px] overflow-y-auto rounded-md border bg-slate-50 px-4 py-3 whitespace-pre-wrap break-all text-sm leading-7 text-slate-900">
                    {selectedReportItem.report.meetingRawText || "-"}
                  </div>
                </div>

                {selectedReportItem.report.photos?.length > 0 && (
                  <div className="space-y-3 border-t py-6">
                    <div className="text-xs font-medium text-slate-500">사진</div>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
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

              <div className="shrink-0 border-t border-slate-200 bg-white px-6 py-4">
                <div className="flex justify-end">
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
