import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  FileText,
  Pencil,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import {
  Application,
  User,
  FileItem,
} from "@/redesign/app/lib/types";
import { Button } from "@/redesign/app/components/ui/button";
import { StatusChip } from "@/redesign/app/components/status-chip";
import { FileUpload } from "@/redesign/app/components/file-upload";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/redesign/app/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/redesign/app/components/ui/dialog";
import { Textarea } from "@/redesign/app/components/ui/textarea";
import { Input } from "@/redesign/app/components/ui/input";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  isToday,
} from "date-fns";
import { ko } from "date-fns/locale";
import {
  endOfLocalDateKey,
  parseLocalDateKey,
  parseLocalDateTimeKey,
} from "@/redesign/app/lib/date-keys";

interface DashboardCalendarProps {
  applications: Application[];
  applicationsWithoutAssignableConsultantIds?: string[];
  user: User;
  onNavigate: (page: string, id?: string) => void;
  onCancelApplication: (id: string) => Promise<void> | void;
  onUpdateCompanyApplication?: (
    id: string,
    payload: {
      requestContent: string;
      retainedAttachments: Array<{ name: string; url?: string }>;
      newFiles: FileItem[];
    }
  ) => Promise<boolean>;
}

type RequestSectionKey =
  | "currentSituation"
  | "keyChallenges"
  | "requestedSupport";

type RequestSections = Record<RequestSectionKey, string>;

const REQUEST_SECTION_MIN_LENGTH = 20;
const REQUEST_SECTION_META: Array<{
  key: RequestSectionKey;
  label: string;
  placeholder: string;
}> = [
  {
    key: "currentSituation",
    label: "1. 현재 상황 및 배경",
    placeholder: "예: 지금까지의 진행 과정과 주요 이슈 발생 배경",
  },
  {
    key: "keyChallenges",
    label: "2. 당면한 문제/과제",
    placeholder: "예: 현재 가장 해결이 필요한 문제와 영향",
  },
  {
    key: "requestedSupport",
    label: "3. 요청 사항",
    placeholder: "예: 오피스아워에서 얻고 싶은 구체적인 도움/산출물",
  },
];

function createEmptyRequestSections(): RequestSections {
  return {
    currentSituation: "",
    keyChallenges: "",
    requestedSupport: "",
  };
}

function parseRequestSections(content?: string): RequestSections {
  const parsed = createEmptyRequestSections();
  if (!content?.trim()) return parsed;

  const normalizedContent = content.replace(/\r\n/g, "\n");
  const headerPatterns: Array<{ key: RequestSectionKey; pattern: RegExp }> = [
    { key: "currentSituation", pattern: /^\s*1\.\s*현재 상황 및 배경\s*$/m },
    { key: "keyChallenges", pattern: /^\s*2\.\s*당면한 문제\/과제\s*$/m },
    { key: "requestedSupport", pattern: /^\s*3\.\s*요청 사항\s*$/m },
  ];

  const matches = headerPatterns
    .map(({ key, pattern }) => {
      const match = pattern.exec(normalizedContent);
      return match
        ? { key, index: match.index, header: match[0] }
        : null;
    })
    .filter((value): value is { key: RequestSectionKey; index: number; header: string } => Boolean(value))
    .sort((a, b) => a.index - b.index);

  if (matches.length === 0) {
    parsed.currentSituation = content.trim();
    return parsed;
  }

  matches.forEach((match, index) => {
    const start = match.index + match.header.length;
    const end = matches[index + 1]?.index ?? normalizedContent.length;
    parsed[match.key] = normalizedContent.slice(start, end).trim();
  });

  return parsed;
}

function buildRequestContent(sections: RequestSections): string {
  return REQUEST_SECTION_META.map(({ key, label }) => {
    const value = sections[key].trim();
    return `${label}\n${value}`;
  }).join("\n\n");
}

export function DashboardCalendar({
  applications,
  applicationsWithoutAssignableConsultantIds = [],
  user,
  onNavigate,
  onCancelApplication,
  onUpdateCompanyApplication,
}: DashboardCalendarProps) {
  const applicationsWithoutAssignableConsultantIdSet = useMemo(
    () => new Set(applicationsWithoutAssignableConsultantIds),
    [applicationsWithoutAssignableConsultantIds],
  );
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [cancelTarget, setCancelTarget] = useState<Application | null>(null);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [applicationListTab, setApplicationListTab] = useState<"pending" | "rejected">("pending");
  const [isEditingApplication, setIsEditingApplication] = useState(false);
  const [editingRequestSections, setEditingRequestSections] = useState<RequestSections>(
    createEmptyRequestSections()
  );
  const [editingRetainedAttachments, setEditingRetainedAttachments] = useState<
    Array<{ id: string; name: string; url?: string }>
  >([]);
  const [editingNewFiles, setEditingNewFiles] = useState<FileItem[]>([]);
  const [savingApplicationEdit, setSavingApplicationEdit] = useState(false);

  const canViewAll =
    user.permissions?.canViewAllApplications
    || user.role === "admin"
    || user.role === "staff"
    || user.role === "consultant";
  // AppContent already passes role-scoped applications.
  // Re-filtering here with looser fallback rules can surface stale or unrelated items.
  const userApplications = applications;

  // 진행 예정 + 완료 일정들
  const scheduledApplications = userApplications.filter(
    (app) => (app.status === "confirmed" || app.status === "completed") && app.scheduledDate
  );

  const getSessionEndTime = (app: Application) => {
    const durationHours = app.duration ?? 1;
    if (app.scheduledDate && app.scheduledTime) {
      const start = parseLocalDateTimeKey(app.scheduledDate, app.scheduledTime);
      if (start) {
        return new Date(start.getTime() + durationHours * 60 * 60 * 1000);
      }
    }
    if (app.scheduledDate) {
      const fallback = endOfLocalDateKey(app.scheduledDate);
      if (fallback) {
        return fallback;
      }
    }
    return null;
  };

  const hasSessionEnded = (app: Application) => {
    const endTime = getSessionEndTime(app);
    return Boolean(endTime && new Date() >= endTime);
  };

  // 대기중인 신청
  const pendingApplications = userApplications.filter(
    (app) =>
      (app.status === "pending" || app.status === "review")
      && !hasSessionEnded(app)
  );
  const rejectedApplications = userApplications.filter(
    (app) =>
      app.status === "rejected"
      || (
        (app.status === "pending" || app.status === "review")
        && hasSessionEnded(app)
      )
  );

  // 캘린더 날짜 생성
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // 특정 날짜의 일정들
  const getEventsForDate = (date: Date) => {
    return scheduledApplications.filter((app) => {
      if (!app.scheduledDate) return false;
      const scheduledDate = parseLocalDateKey(app.scheduledDate);
      return Boolean(scheduledDate && isSameDay(scheduledDate, date));
    });
  };

  // 선택된 날짜의 일정들
  const selectedDateEvents = useMemo(() => {
    const events = selectedDate ? getEventsForDate(selectedDate) : [];
    return [...events].sort((a, b) => {
      const timeA = a.scheduledTime ?? "";
      const timeB = b.scheduledTime ?? "";
      if (timeA !== timeB) {
        return timeA.localeCompare(timeB);
      }
      return (a.officeHourTitle ?? "").localeCompare(b.officeHourTitle ?? "");
    });
  }, [selectedDate, scheduledApplications]);

  const weekDays = ["일", "월", "화", "수", "목", "금", "토"];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "#3b82f6"; // blue-500
      case "completed":
        return "#10b981"; // green-500
      case "pending":
        return "#eab308"; // yellow-500
      case "review":
        return "#f97316"; // orange-500
      case "rejected":
        return "#f43f5e"; // rose-500
      default:
        return "#6b7280"; // gray-500
    }
  };

  const shouldShowConsultant = (consultant?: string) =>
    Boolean(consultant && consultant !== "담당자 배정 중");

  const buildMetaLine = (app: Application) => {
    const parts = [];
    if (shouldShowConsultant(app.consultant)) parts.push(app.consultant);
    if (app.agenda) parts.push(app.agenda);
    return parts.join(" · ");
  };

  const currentListApplications =
    applicationListTab === "pending" ? pendingApplications : rejectedApplications;

  const openApplicationModal = (application: Application) => {
    setSelectedApplicationId(application.id);
  };

  const formatScheduleLabel = (application: Application) => {
    if (application.scheduledDate && application.scheduledTime) {
      const scheduledDate = parseLocalDateKey(application.scheduledDate);
      if (!scheduledDate) return application.scheduledTime;
      return `${format(scheduledDate, "M월 d일 (E)", { locale: ko })} ${application.scheduledTime}`;
    }
    if (application.periodFrom && application.periodTo) {
      return `${format(parseLocalDateKey(application.periodFrom)!, "M월 d일", { locale: ko })} - ${format(parseLocalDateKey(application.periodTo)!, "M월 d일", { locale: ko })}`;
    }
    return "일정 조율 중";
  };

  const getApplicationTypeLabel = (application: Application) =>
    application.type === "irregular" ? "비정기 오피스아워" : "정기 오피스아워";

  const selectedApplication = useMemo(
    () =>
      selectedApplicationId
        ? applications.find((application) => application.id === selectedApplicationId) ?? null
        : null,
    [applications, selectedApplicationId]
  );

  const canDeleteApplication =
    selectedApplication
    && (selectedApplication.status === "pending" || selectedApplication.status === "review");
  const canEditApplication =
    Boolean(
      selectedApplication
      && user.role === "user"
      && onUpdateCompanyApplication
      && !hasSessionEnded(selectedApplication)
      && (
        selectedApplication.status === "pending" ||
        selectedApplication.status === "review" ||
        selectedApplication.status === "confirmed"
      )
    );

  const selectedApplicationAttachments = useMemo(() => {
    if (!selectedApplication) return [];
    const names = selectedApplication.attachments ?? [];
    const urls = selectedApplication.attachmentUrls ?? [];
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
  }, [selectedApplication]);
  const selectedApplicationAttachmentsKey = useMemo(
    () =>
      selectedApplicationAttachments
        .map((item) => `${item.id}:${item.name}:${item.url ?? ""}`)
        .join("|"),
    [selectedApplicationAttachments]
  );

  const selectedApplicationRequestSections = useMemo(
    () => parseRequestSections(selectedApplication?.requestContent),
    [selectedApplication?.requestContent]
  );

  const listTabButtonClass = (tab: "pending" | "rejected") =>
    `group relative flex flex-1 items-center justify-center gap-2 border-b-2 px-2 py-3 text-sm font-semibold whitespace-nowrap transition ${
      applicationListTab === tab
        ? "border-slate-900 text-slate-900"
        : "border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-700"
    }`;
  const editingRequestSectionValidations = useMemo(
    () =>
      REQUEST_SECTION_META.map(({ key, label }) => {
        const value = editingRequestSections[key].trim();
        return {
          key,
          label,
          length: value.length,
          isValid: value.length >= REQUEST_SECTION_MIN_LENGTH,
        };
      }),
    [editingRequestSections]
  );
  const isEditingRequestSectionsValid = editingRequestSectionValidations.every(
    (item) => item.isValid
  );

  useEffect(() => {
    if (!selectedApplication) {
      setIsEditingApplication(false);
      setEditingRequestSections(createEmptyRequestSections());
      setEditingRetainedAttachments([]);
      setEditingNewFiles([]);
      setSavingApplicationEdit(false);
      return;
    }

    setEditingRequestSections(parseRequestSections(selectedApplication.requestContent));
    setEditingRetainedAttachments(selectedApplicationAttachments);
    setEditingNewFiles([]);
    setIsEditingApplication(false);
  }, [
    selectedApplication?.id,
    selectedApplication?.requestContent,
    selectedApplicationAttachmentsKey,
  ]);

  const handleSaveApplicationEdit = async () => {
    if (!selectedApplication || !onUpdateCompanyApplication || !canEditApplication) return;
    setSavingApplicationEdit(true);
    const ok = await onUpdateCompanyApplication(selectedApplication.id, {
      requestContent: buildRequestContent(editingRequestSections),
      retainedAttachments: editingRetainedAttachments.map((item) => ({
        name: item.name,
        url: item.url,
      })),
      newFiles: editingNewFiles,
    });
    setSavingApplicationEdit(false);
    if (!ok) return;
    setIsEditingApplication(false);
    setEditingNewFiles([]);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50">
      {/* Header */}
      <div className="border-b border-slate-200/80 bg-white/80 px-8 py-4 backdrop-blur-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">대시보드</h1>
            <p className="mt-1 text-sm text-slate-500">
              {user.companyName}의 오피스아워 일정과 신청 현황을 확인합니다
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => onNavigate("regular")}
            >
              정기 오피스아워 신청
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex w-80 min-h-0 flex-col bg-white border-r p-6">
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-gray-900">신청 현황</h2>
              <div className="mt-3 border-b border-slate-200">
                <div className="flex items-center gap-4">
                <button
                  type="button"
                  className={listTabButtonClass("pending")}
                  onClick={() => setApplicationListTab("pending")}
                >
                  <span>대기중</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none transition ${
                      applicationListTab === "pending"
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                    }`}
                  >
                    {pendingApplications.length}
                  </span>
                </button>
                <button
                  type="button"
                  className={listTabButtonClass("rejected")}
                  onClick={() => setApplicationListTab("rejected")}
                >
                  <span>거절됨</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none transition ${
                      applicationListTab === "rejected"
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                    }`}
                  >
                    {rejectedApplications.length}
                  </span>
                </button>
                </div>
              </div>
            </div>

            {currentListApplications.length > 0 ? (
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {currentListApplications.map((app) => {
                  const metaLine = buildMetaLine(app);
                  return (
                    <div
                      key={app.id}
                      onClick={() => openApplicationModal(app)}
                      className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition-colors hover:bg-slate-50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-[13px] font-semibold leading-5 text-slate-900">
                            {app.officeHourTitle}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {formatScheduleLabel(app)}
                          </p>
                        </div>
                        <StatusChip
                          status={app.status}
                          size="sm"
                          className="shrink-0 whitespace-nowrap"
                        />
                      </div>
                      {metaLine ? (
                        <p className="mt-1 truncate text-[11px] text-slate-500">
                          {metaLine}
                        </p>
                      ) : null}
                      {applicationListTab === "pending" && applicationsWithoutAssignableConsultantIdSet.has(app.id) ? (
                        <p className="mt-1 line-clamp-2 text-[11px] text-amber-600">
                          현재 수락 가능한 컨설턴트가 없습니다. 일정조정과 관련하여 관리자에게 문의해주세요.
                        </p>
                      ) : null}
                      {applicationListTab === "rejected" ? (
                        <p className="mt-1 line-clamp-2 text-[11px] text-rose-600">
                          거절 사유: {app.rejectionReason?.trim() || "사유가 등록되지 않았습니다."}
                        </p>
                      ) : (
                        <div className="mt-2 flex justify-end">
                          <button
                            type="button"
                            className="rounded-md border border-rose-200 px-2.5 py-1 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-50"
                            onClick={(event) => {
                              event.stopPropagation();
                              setCancelTarget(app);
                            }}
                          >
                            신청 삭제
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
                {applicationListTab === "pending"
                  ? "대기중인 신청이 없습니다."
                  : "거절된 신청이 없습니다."}
              </div>
            )}
          </div>
        </div>

        {/* Main Calendar */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
          {/* Calendar Header */}
          <div className="border-b px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-bold text-gray-900">
                  {format(currentMonth, "yyyy년 M월", { locale: ko })}
                </h2>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentMonth(new Date())}
                  >
                    오늘
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span>확정</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span>완료</span>
                </div>
              </div>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
              {/* Week days header */}
              {weekDays.map((day) => (
                <div
                  key={day}
                  className="bg-gray-50 text-center py-3 text-sm font-semibold text-gray-700"
                >
                  {day}
                </div>
              ))}

              {/* Calendar days */}
              {calendarDays.map((day, idx) => {
                const events = getEventsForDate(day);
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const isTodayDate = isToday(day);

                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedDate(day)}
                    className={`
                      bg-white min-h-[100px] p-2 cursor-pointer transition-all
                      ${!isCurrentMonth ? "text-gray-300" : "text-gray-900"}
                      ${isSelected ? "ring-2 ring-primary ring-inset" : ""}
                      ${isTodayDate && !isSelected ? "bg-blue-50" : ""}
                      hover:bg-gray-50
                    `}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-sm font-medium ${
                          isTodayDate ? "bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center" : ""
                        }`}
                      >
                        {format(day, "d")}
                      </span>
                      {events.length > 0 && (
                        <span className="text-xs font-medium text-gray-500">
                          {events.length}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {events.slice(0, 2).map((event) => {
                        const statusColor = getStatusColor(event.status);
                        return (
                          <div
                            key={event.id}
                            className="text-xs p-1 rounded truncate"
                            style={{
                              backgroundColor: `${statusColor}15`,
                              borderLeft: `3px solid ${statusColor}`,
                            }}
                          >
                            <div className="font-medium truncate">{event.scheduledTime}</div>
                            <div className="text-gray-700 truncate">{event.officeHourTitle}</div>
                            {event.agenda && (
                              <div className="text-[11px] text-gray-500 truncate">
                                {event.agenda}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {events.length > 2 && (
                        <div className="text-xs text-gray-500 pl-1">
                          +{events.length - 2} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Sidebar - Selected Date Details */}
        <div className="w-96 bg-white border-l p-6 overflow-y-auto">
          <div className="mb-6">
            <h2 className="font-semibold text-gray-900 mb-1">
              {selectedDate ? format(selectedDate, "M월 d일 (E)", { locale: ko }) : "날짜를 선택하세요"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {selectedDateEvents.length > 0
                ? `${selectedDateEvents.length}건의 일정`
                : "예정된 일정이 없습니다"}
            </p>
          </div>

          {/* Selected Date Events */}
          {selectedDateEvents.length > 0 && (
            <div className="space-y-4">
              {selectedDateEvents.map((event, index) => (
                <div key={event.id} className="relative pl-20">
                  {index < selectedDateEvents.length - 1 ? (
                    <div className="absolute left-[4.28rem] top-10 bottom-[-1.25rem] w-px bg-slate-200" />
                  ) : null}
                  <div className="absolute left-0 top-0 flex w-16 flex-col items-end gap-1 text-right">
                    <span className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                      {event.scheduledTime ?? "시간 미정"}
                    </span>
                    {event.duration ? (
                      <span className="text-[11px] text-slate-400">
                        {event.duration}시간
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => openApplicationModal(event)}
                    className="group relative w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition-all hover:border-slate-300 hover:bg-slate-50"
                  >
                    <div className="absolute left-[-1.15rem] top-5 h-2.5 w-2.5 rounded-full border-2 border-white bg-slate-400 shadow-sm" />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {event.officeHourTitle}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-1">
                            {event.sessionFormat === "online" ? "온라인" : "오프라인"}
                          </span>
                          {event.agenda ? <span>{event.agenda}</span> : null}
                          {shouldShowConsultant(event.consultant) ? <span>{event.consultant}</span> : null}
                        </div>
                      </div>
                      <StatusChip status={event.status} size="sm" />
                    </div>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={Boolean(selectedApplication)}
        onOpenChange={(open) => {
          if (!open) setSelectedApplicationId(null);
        }}
      >
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden p-0">
          {selectedApplication ? (
            <>
              <DialogHeader className="border-b border-slate-200 px-6 py-5">
                <div className="flex flex-col gap-4">
                  <div className="min-w-0">
                    <DialogTitle className="line-clamp-2 text-xl text-slate-900">
                      {selectedApplication.officeHourTitle}
                    </DialogTitle>
                    <DialogDescription className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                        {getApplicationTypeLabel(selectedApplication)}
                      </span>
                      <StatusChip status={selectedApplication.status} size="sm" />
                    </DialogDescription>
                  </div>
                  <div className="-mr-2 flex items-center justify-end gap-2 self-end">
                    {canEditApplication ? (
                      <Button
                        variant={isEditingApplication ? "outline" : "default"}
                        size="sm"
                        className={
                          isEditingApplication
                            ? undefined
                            : "bg-blue-500 text-white hover:bg-blue-600"
                        }
                        onClick={() => {
                          if (isEditingApplication) {
                            setIsEditingApplication(false);
                            setEditingRequestSections(
                              parseRequestSections(selectedApplication.requestContent)
                            );
                            setEditingRetainedAttachments(selectedApplicationAttachments);
                            setEditingNewFiles([]);
                            return;
                          }
                          setIsEditingApplication(true);
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        {isEditingApplication ? "편집 취소" : "수정하기"}
                      </Button>
                    ) : null}
                    {canDeleteApplication ? (
                      <Button
                        size="sm"
                        className="bg-rose-600 text-white hover:bg-rose-700"
                        onClick={() => {
                          setCancelTarget(selectedApplication);
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        신청 삭제
                      </Button>
                    ) : null}
                  </div>
                </div>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <div className="space-y-5">
                {applicationsWithoutAssignableConsultantIdSet.has(selectedApplication.id) &&
                  (selectedApplication.status === "pending" || selectedApplication.status === "review") ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    현재 수락 가능한 컨설턴트가 없습니다. 일정조정과 관련하여 관리자에게 문의해주세요.
                  </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                      <CalendarIcon className="h-3.5 w-3.5" />
                      일정
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {formatScheduleLabel(selectedApplication)}
                    </p>
                    {isEditingApplication ? (
                      <p className="mt-2 text-[11px] text-slate-500">
                        대기중 리스트에서는 신청 내용과 첨부 파일만 수정할 수 있습니다.
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                      <Clock className="h-3.5 w-3.5" />
                      진행 방식
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {selectedApplication.sessionFormat === "online" ? "온라인" : "오프라인"}
                      {selectedApplication.duration ? ` · ${selectedApplication.duration}시간` : ""}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                      <UserIcon className="h-3.5 w-3.5" />
                      담당 컨설턴트 / 아젠다
                    </div>
                    <p className="mt-2 text-sm text-slate-900">
                      {buildMetaLine(selectedApplication) || "배정 대기 중"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                      <FileText className="h-3.5 w-3.5" />
                      신청 유형
                    </div>
                    <p className="mt-2 text-sm text-slate-900">
                      {selectedApplication.isInternal === undefined
                        ? "-"
                        : selectedApplication.isInternal
                          ? "내부"
                          : "외부"}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                  <div className="text-xs font-semibold text-slate-500">신청 내용</div>
                  {isEditingApplication ? (
                    <div className="mt-3 space-y-4">
                      {REQUEST_SECTION_META.map((section) => {
                        const validation = editingRequestSectionValidations.find(
                          (item) => item.key === section.key
                        );
                        return (
                          <div key={section.key}>
                            <div className="text-xs font-semibold text-slate-700">
                              {section.label}
                            </div>
                            <Textarea
                              value={editingRequestSections[section.key]}
                              onChange={(event) =>
                                setEditingRequestSections((prev) => ({
                                  ...prev,
                                  [section.key]: event.target.value,
                                }))
                              }
                              className="mt-2 min-h-[110px]"
                              placeholder={section.placeholder}
                            />
                            <div className="mt-1 text-[11px] text-slate-400">
                              {validation?.length ?? 0}/{REQUEST_SECTION_MIN_LENGTH}자 이상
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-3 space-y-4">
                      {REQUEST_SECTION_META.map((section) => {
                        const value = selectedApplicationRequestSections[section.key].trim();
                        return (
                          <div key={section.key}>
                            <div className="text-xs font-semibold text-slate-700">
                              {section.label}
                            </div>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-900">
                              {value || "-"}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {selectedApplication.rejectionReason ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4">
                    <div className="text-xs font-semibold text-rose-700">거절 사유</div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-rose-700">
                      {selectedApplication.rejectionReason}
                    </p>
                  </div>
                ) : null}

                {(selectedApplicationAttachments.length > 0 || isEditingApplication) ? (
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                    <div className="text-xs font-semibold text-slate-500">첨부 파일</div>
                    {isEditingApplication ? (
                      <div className="mt-3 space-y-3">
                        {editingRetainedAttachments.length > 0 ? (
                          <div className="space-y-2">
                            {editingRetainedAttachments.map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
                              >
                                {item.url ? (
                                  <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    download
                                    className="min-w-0 flex-1 break-all text-sm text-slate-700 underline underline-offset-2"
                                  >
                                    {item.name}
                                  </a>
                                ) : (
                                  <span className="min-w-0 flex-1 break-all text-sm text-slate-600">
                                    {item.name}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  className="shrink-0 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                  onClick={() =>
                                    setEditingRetainedAttachments((prev) =>
                                      prev.filter((target) => target.id !== item.id)
                                    )
                                  }
                                >
                                  삭제
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        <FileUpload
                          files={editingNewFiles}
                          onFilesChange={setEditingNewFiles}
                          maxFiles={5}
                        />
                      </div>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedApplicationAttachments.map((item) =>
                          item.url ? (
                            <a
                              key={item.id}
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              download
                              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600"
                            >
                              {item.name}
                            </a>
                          ) : (
                            <span
                              key={item.id}
                              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600"
                            >
                              {item.name}
                            </span>
                          )
                        )}
                      </div>
                    )}
                  </div>
                ) : null}
                </div>
              </div>

              <DialogFooter className="border-t border-slate-200 px-6 py-4">
                {isEditingApplication ? (
                  <Button
                    type="button"
                    onClick={handleSaveApplicationEdit}
                    disabled={
                      savingApplicationEdit
                      || !isEditingRequestSectionsValid
                    }
                  >
                    {savingApplicationEdit ? "저장 중..." : "저장"}
                  </Button>
                ) : null}
                <Button onClick={() => setSelectedApplicationId(null)}>닫기</Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>신청을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              신청을 삭제하면 신청 내역은 사라집니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!cancelTarget) return;
                await Promise.resolve(onCancelApplication(cancelTarget.id));
                if (selectedApplication?.id === cancelTarget.id) {
                  setSelectedApplicationId(null);
                }
                setCancelTarget(null);
              }}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
