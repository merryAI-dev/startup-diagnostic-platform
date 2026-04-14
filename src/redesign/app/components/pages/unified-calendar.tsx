import { useState, useMemo } from "react";
import { addDays, differenceInDays } from "date-fns";
import {
  Agenda,
  Application,
  ApplicationStatus,
  ConsultantAvailability,
  OfficeHourReport,
  Program,
  User,
} from "@/redesign/app/lib/types";
import { Card } from "@/redesign/app/components/ui/card";
import { Button } from "@/redesign/app/components/ui/button";
import { Badge } from "@/redesign/app/components/ui/badge";
import { Calendar } from "@/redesign/app/components/ui/calendar";
import {
  AlertCircle,
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Grid3x3,
  List, Download, Share2, Plus, Clock, MapPin, Video, Users,
  Database, Wifi, WifiOff
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/redesign/app/components/ui/select";
import { useCalendarService } from "@/redesign/app/hooks/use-calendar-service";
import { useConnectionStatus } from "@/redesign/app/hooks/use-firestore";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/redesign/app/components/ui/dialog";
import { Input } from "@/redesign/app/components/ui/input";
import { Label } from "@/redesign/app/components/ui/label";
import { Textarea } from "@/redesign/app/components/ui/textarea";
import { AdminApplicationDetailModal } from "@/redesign/app/components/pages/admin-application-detail-modal";
import { cn } from "@/redesign/app/components/ui/utils";
import { toast } from "sonner";
import type { DayContentProps } from "react-day-picker";
import { endOfLocalDateKey, parseLocalDateTimeKey } from "@/redesign/app/lib/date-keys";
import { getPendingConsultantIds, isApplicationTargetingConsultant } from "@/redesign/app/lib/application-availability";

interface UnifiedCalendarProps {
  currentUser: User;
  applications: Application[];
  programs: Program[];
  reports?: OfficeHourReport[];
  agendas?: Agenda[];
  currentConsultantAgendaIds?: string[];
  currentConsultantAvailability?: ConsultantAvailability[];
  allowManualEventCreate?: boolean;
  onNavigateToApplication?: (id: string) => void;
  onCreateReport?: (applicationId: string) => void;
  onRequestApplication?: (id: string) => void;
  onRejectApplication?: (id: string, reason: string) => void;
  onConfirmApplication?: (id: string) => void;
  onUpdateStatus?: (id: string, status: ApplicationStatus) => void;
  onUpdateApplication?: (id: string, data: Partial<Application>) => void;
  currentConsultantId?: string | null;
  currentConsultantName?: string | null;
}

type ViewMode = "month" | "week" | "day" | "list";

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDateKey(value?: string): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value.trim());
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function normalizeConsultantDisplayName(value?: string | null): string {
  return (value ?? "")
    .replace(/\s*컨설턴트\s*$/u, "")
    .trim()
    .toLowerCase();
}

function toEventDateKey(value?: string | Date): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : toLocalDateKey(value);
  }
  const parsed = parseLocalDateKey(value);
  return parsed ? toLocalDateKey(parsed) : null;
}

function normalizeTimeKey(value?: string): string {
  if (!value) return "";
  const [hourRaw, minuteRaw] = value.trim().split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return value.trim();
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function clampDateToMonth(baseDate: Date, targetMonth: Date): Date {
  const year = targetMonth.getFullYear();
  const month = targetMonth.getMonth();
  const day = baseDate.getDate();
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay));
}

export function UnifiedCalendar({
  currentUser,
  applications,
  programs,
  reports = [],
  agendas = [],
  currentConsultantAgendaIds = [],
  currentConsultantAvailability = [],
  allowManualEventCreate = true,
  onNavigateToApplication,
  onCreateReport,
  onRequestApplication,
  onRejectApplication,
  onConfirmApplication,
  onUpdateStatus,
  onUpdateApplication,
  currentConsultantId = null,
  currentConsultantName = null,
}: UnifiedCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedProgram, setSelectedProgram] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<Application | null>(null);
  const [actionType, setActionType] = useState<"accept" | "reject">("accept");
  const [isActionPending, setIsActionPending] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedPendingApplicationId, setSelectedPendingApplicationId] = useState<string | null>(null);
  const [selectedScheduledApplicationId, setSelectedScheduledApplicationId] = useState<string | null>(null);
  const [newEvent, setNewEvent] = useState({
    title: "",
    date: "",
    startTime: "10:00",
    endTime: "11:00",
    description: "",
    location: "",
    type: "meeting" as const,
  });

  const { isOnline, isFirebaseReady } = useConnectionStatus();
  const calendarService = useCalendarService(currentUser.id, {
    subscribeToEvents: false,
  });

  // ─── 이벤트 생성 핸들러 ───
  const handleCreateEvent = async () => {
    if (!newEvent.title || !newEvent.date) {
      toast.error("제목과 날짜를 입력해주세요");
      return;
    }

    const start = new Date(`${newEvent.date}T${newEvent.startTime}:00`);
    const end = new Date(`${newEvent.date}T${newEvent.endTime}:00`);

    if (isFirebaseReady) {
      const id = await calendarService.createEvent({
        title: newEvent.title,
        type: newEvent.type,
        start,
        end,
        description: newEvent.description,
        location: newEvent.location,
      });
      if (id) {
        toast.success("일정이 등록되었습니다");
      } else {
        toast.error("일정 등록에 실패했습니다");
      }
    } else {
      toast.error("Firebase 설정이 필요합니다");
    }

    setShowCreateDialog(false);
    setNewEvent({
      title: "",
      date: "",
      startTime: "10:00",
      endTime: "11:00",
      description: "",
      location: "",
      type: "meeting",
    });
  };

  // 날짜별로 그룹화된 일정
  const eventsByDate = useMemo<Record<string, Application[]>>(() => {
    const filtered = selectedProgram
      ? applications.filter(app => app.programId === selectedProgram)
      : applications;

    const scheduled = filtered.filter(
      app =>
        (app.status === "confirmed" || app.status === "completed")
        && app.scheduledDate
    );

    const byDate: Record<string, Application[]> = {};
    scheduled.forEach((app) => {
      const key = toEventDateKey(app.scheduledDate);
      if (!key) return;
      const bucket = byDate[key] ?? (byDate[key] = []);
      bucket.push(app);
    });

    return byDate;
  }, [applications, selectedProgram]);

  // 선택된 날짜의 이벤트
  const selectedDateKey = toLocalDateKey(selectedDate);
  const selectedDateEvents = eventsByDate[selectedDateKey] ?? [];
  const calendarMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth(),
    1,
  );

  // 캘린더에서 날짜에 이벤트가 있는지 체크
  const hasEvents = (date: Date) => {
    const dateKey = toLocalDateKey(date);
    const events = eventsByDate[dateKey];
    return Boolean(events && events.length > 0);
  };

  const isConsultant = currentUser.role === "consultant";
  const isMyEvent = (event: Application) => {
    if (!isConsultant) return false;
    if (currentConsultantId && isApplicationTargetingConsultant(event, currentConsultantId)) {
      return true;
    }
    const currentNameKey = normalizeConsultantDisplayName(currentConsultantName);
    return (
      currentNameKey !== "" &&
      currentNameKey === normalizeConsultantDisplayName(event.consultant)
    );
  };
  const consultantAgendaNameSet = useMemo(() => {
    if (!isConsultant) return new Set<string>();
    const names = new Set<string>();
    const agendaById = new Map(agendas.map((agenda) => [agenda.id, agenda.name]));
    currentConsultantAgendaIds.forEach((value) => {
      const agendaName = agendaById.get(value);
      if (agendaName) {
        names.add(agendaName);
      } else if (value) {
        names.add(value);
      }
    });
    return names;
  }, [agendas, currentConsultantAgendaIds, isConsultant]);
  const matchesConsultantAgenda = (app: Application) => {
    if (!isConsultant) return true;
    if (currentConsultantAgendaIds.length === 0 && consultantAgendaNameSet.size === 0) {
      return false;
    }
    const agendaIdOk = app.agendaId ? currentConsultantAgendaIds.includes(app.agendaId) : false;
    const agendaNameOk = app.agenda ? consultantAgendaNameSet.has(app.agenda) : false;
    return agendaIdOk || agendaNameOk;
  };
  const isAssignedToCurrentConsultant = (app: Application) => {
    if (!isConsultant) return false;
    if (currentConsultantId && isApplicationTargetingConsultant(app, currentConsultantId)) {
      return true;
    }
    const currentNameKey = normalizeConsultantDisplayName(currentConsultantName);
    return (
      currentNameKey !== "" &&
      currentNameKey === normalizeConsultantDisplayName(app.consultant)
    );
  };
  const isCurrentConsultantAvailableAt = (app: Application) => {
    if (!isConsultant) return true;
    if (!app.scheduledDate || !app.scheduledTime) return true;
    const parsedDate = parseLocalDateKey(app.scheduledDate);
    if (!parsedDate) return false;
    const dayAvailability = currentConsultantAvailability.find(
      (availability) => availability.dayOfWeek === parsedDate.getDay()
    );
    if (!dayAvailability) return false;
    const targetTime = normalizeTimeKey(app.scheduledTime);
    return dayAvailability.slots.some(
      (slot) => normalizeTimeKey(slot.start) === targetTime && slot.available
    );
  };
  const hasCurrentConsultantConflict = (targetApp: Application) => {
    if (!isConsultant) return false;
    if (!targetApp.scheduledDate || !targetApp.scheduledTime) return false;
    const targetTime = normalizeTimeKey(targetApp.scheduledTime);
    return applications.some((app) => {
      if (app.id === targetApp.id) return false;
      if (!isAssignedToCurrentConsultant(app)) return false;
      if (
        app.status !== "pending"
        && app.status !== "review"
        && app.status !== "confirmed"
        && app.status !== "completed"
      ) {
        return false;
      }
      if (!app.scheduledDate || !app.scheduledTime) return false;
      return (
        app.scheduledDate === targetApp.scheduledDate
        && normalizeTimeKey(app.scheduledTime) === targetTime
      );
    });
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
  const pendingRequests = useMemo(() => {
    if (!isConsultant) return [];
    return applications
      .filter((app) => {
        const isPendingLike = app.status === "pending" || app.status === "review";
        if (!isPendingLike || hasSessionEnded(app)) return false;
        if (isAssignedToCurrentConsultant(app)) {
          return true;
        }

        const pendingConsultantIds = getPendingConsultantIds(app);
        const isUnassigned =
          !app.consultantId
          && pendingConsultantIds.length === 0
          && (!app.consultant || app.consultant === "담당자 배정 중");

        if (!isUnassigned) {
          return false;
        }

        return (
          matchesConsultantAgenda(app)
          && isCurrentConsultantAvailableAt(app)
          && !hasCurrentConsultantConflict(app)
        );
      })
      .sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA;
      });
  }, [applications, isConsultant, matchesConsultantAgenda, currentConsultantAvailability]);

  const pendingOfficeHourReports = useMemo(() => {
    if (!isConsultant) return [];

    const now = new Date();
    const reportedAppIds = new Set(reports.map((report) => report.applicationId));

    return applications
      .filter(
        (app) =>
          (app.status === "confirmed" || app.status === "completed")
          && app.scheduledDate
          && isAssignedToCurrentConsultant(app)
          && !reportedAppIds.has(app.id),
      )
      .map((app) => {
        const sessionEnd = getSessionEndTime(app);
        if (!sessionEnd || now < sessionEnd) return null;

        const deadline = addDays(sessionEnd, 3);
        const daysLeft = Math.max(0, differenceInDays(deadline, now));
        const overdueDays = Math.max(0, differenceInDays(now, deadline));
        const isOverdue = now > deadline;
        const program = programs.find((item) => item.id === app.programId);

        return {
          application: app,
          programName: program?.name || "프로그램 미지정",
          sessionEnd,
          deadline,
          daysLeft,
          overdueDays,
          isOverdue,
        };
      })
      .filter(
        (
          item,
        ): item is {
          application: Application;
          programName: string;
          sessionEnd: Date;
          deadline: Date;
          daysLeft: number;
          overdueDays: number;
          isOverdue: boolean;
        } => item !== null,
      )
      .sort((a, b) => {
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        if (a.isOverdue && b.isOverdue) return b.overdueDays - a.overdueDays;
        if (a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft;
        return a.deadline.getTime() - b.deadline.getTime();
      });
  }, [applications, isConsultant, programs, reports, currentConsultantId, currentConsultantName]);

  const selectedPendingApplication = useMemo(() => {
    if (!selectedPendingApplicationId) return null;
    return applications.find((app) => app.id === selectedPendingApplicationId) ?? null;
  }, [applications, selectedPendingApplicationId]);
  const selectedScheduledApplication = useMemo(() => {
    if (!selectedScheduledApplicationId) return null;
    return applications.find((app) => app.id === selectedScheduledApplicationId) ?? null;
  }, [applications, selectedScheduledApplicationId]);

  const openAcceptDialog = (event: Application) => {
    setActionType("accept");
    setActionTarget(event);
    setRejectReason("");
    setActionDialogOpen(true);
  };

  const openRejectDialog = (event: Application) => {
    setActionType("reject");
    setActionTarget(event);
    setRejectReason("");
    setActionDialogOpen(true);
  };

  const handleConfirmAction = async () => {
    if (!actionTarget || isActionPending) return;

    setIsActionPending(true);
    try {
      if (actionType === "accept") {
        await onRequestApplication?.(actionTarget.id);
      } else {
        const reason = rejectReason.trim();
        if (!reason) return;
        await onRejectApplication?.(actionTarget.id, reason);
      }

      setActionDialogOpen(false);
      setActionTarget(null);
      setRejectReason("");
    } catch (error) {
      console.error("Failed to process pending application action:", error);
    } finally {
      setIsActionPending(false);
    }
  };
  const openPendingDetailModal = (applicationId: string) => {
    setSelectedPendingApplicationId(applicationId);
  };
  const openScheduledDetail = (applicationId: string) => {
    if (isConsultant && onUpdateStatus && onUpdateApplication) {
      setSelectedScheduledApplicationId(applicationId);
      return;
    }
    onNavigateToApplication?.(applicationId);
  };

  const renderDayContent = (props: DayContentProps) => {
    const dateKey = toLocalDateKey(props.date);
    const dayEvents = eventsByDate[dateKey] ?? [];
    const hasEvent = dayEvents.length > 0;
    const hasMyEvent = isConsultant && dayEvents.some((event) => isMyEvent(event));
    const isSelected = Boolean(props.activeModifiers.selected);
    const underlineClass = isSelected
      ? hasMyEvent
        ? "bg-blue-200"
        : "bg-white/80"
      : hasMyEvent
        ? "bg-blue-500"
        : "bg-[#0A2540]/35";

    return (
      <div className="relative flex h-full w-full items-center justify-center">
        <span>{props.date.getDate()}</span>
        {hasEvent && (
          <span
            className={`pointer-events-none absolute bottom-0.5 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full ${underlineClass}`}
          />
        )}
      </div>
    );
  };

  // 이번 주 이벤트
  const thisWeekEvents = useMemo(() => {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    return Object.entries(eventsByDate)
      .filter(([dateStr]) => {
        const date = parseLocalDateKey(dateStr);
        if (!date) return false;
        return date >= weekStart && date < weekEnd;
      })
      .flatMap(([_, events]) => events)
      .sort((a, b) => {
        const dateA = parseLocalDateTimeKey(a.scheduledDate, a.scheduledTime || "00:00");
        const dateB = parseLocalDateTimeKey(b.scheduledDate, b.scheduledTime || "00:00");
        return (dateA?.getTime() ?? 0) - (dateB?.getTime() ?? 0);
      });
  }, [eventsByDate]);

  const getProgramColor = (programId?: string) => {
    if (!programId) return "#94a3b8";
    const program = programs.find(p => p.id === programId);
    return program?.color || "#94a3b8";
  };

  const formatTime = (time?: string) => {
    if (!time) return "";
    return time.substring(0, 5);
  };

  const countBadgeClassName =
    "h-7 rounded-full border-slate-300 bg-slate-100 px-3 text-xs font-semibold text-slate-700";

  const renderPendingOfficeHourReportsCard = () => (
    <Card className="flex max-h-[560px] min-h-0 flex-col p-5">
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <div>
          <h3 className="font-semibold text-[#0A2540]">미작성 오피스아워</h3>
          <p className="mt-1 text-xs text-slate-500">
            종료된 내 세션 중 일지 작성이 필요한 항목입니다
          </p>
        </div>
        <Badge variant="outline" className={countBadgeClassName}>
          {pendingOfficeHourReports.length}건
        </Badge>
      </div>

      {pendingOfficeHourReports.length === 0 ? (
        <div className="flex flex-1 items-center justify-center gap-1.5 py-5 text-center">
          <AlertCircle className="size-5 text-slate-300" />
          <p className="text-sm text-slate-500">바로 작성할 미작성 일지가 없습니다</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="space-y-2.5">
            {pendingOfficeHourReports.map((item) => {
              const dueLabel = item.isOverdue
                ? `기한 초과 ${item.overdueDays}일`
                : item.daysLeft === 0
                  ? "오늘 마감"
                  : `D-${item.daysLeft}`;

              return (
                <div
                  key={item.application.id}
                  className="cursor-pointer rounded-lg border border-slate-200 bg-white p-2.5 transition-shadow hover:shadow-sm"
                  onClick={() => onCreateReport?.(item.application.id)}
                >
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#0A2540]">
                        {item.application.officeHourTitle}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.application.companyName ?? "기업 미입력"} · {item.programName}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0 whitespace-nowrap",
                        item.isOverdue
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : "border-amber-200 bg-amber-50 text-amber-700",
                      )}
                    >
                      {dueLabel}
                    </Badge>
                  </div>

                  <div className="space-y-1 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <Clock className="size-3" />
                      <span>
                        {item.application.scheduledDate}
                        {item.application.scheduledTime ? ` ${formatTime(item.application.scheduledTime)}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="size-3" />
                      <span>
                        작성 마감 {item.deadline.toLocaleDateString("ko-KR")}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 flex justify-end">
                    <Button
                      size="sm"
                      className="h-8 px-3 text-xs"
                      onClick={(event) => {
                        event.stopPropagation();
                        onCreateReport?.(item.application.id);
                      }}
                    >
                      일지 작성
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );

  const renderPendingRequestsCard = () => (
    <Card className="flex max-h-[560px] min-h-0 flex-col p-5">
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <div>
          <h3 className="font-semibold text-[#0A2540]">수락 대기 요청</h3>
          <p className="mt-1 text-xs text-slate-500">
            아젠다 매칭된 요청 중에서 수락할 항목을 선택하세요
          </p>
        </div>
        <Badge variant="outline" className={countBadgeClassName}>
          {pendingRequests.length}건
        </Badge>
      </div>

      <div className="mb-3 flex shrink-0 items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">수락 대기</span>
        <span className="text-xs font-medium text-slate-500">{pendingRequests.length}건</span>
      </div>

      {pendingRequests.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-5 text-center">
          <p className="text-sm text-slate-500">수락 요청 가능한 항목이 없습니다</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="space-y-2.5">
            {pendingRequests.map((event) => {
              const actionHandler = onRequestApplication;
              return (
                <div
                  key={event.id}
                  className="cursor-pointer rounded-lg border border-slate-200 bg-white p-2.5 transition-shadow hover:shadow-sm"
                  onClick={() => openPendingDetailModal(event.id)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#0A2540]">
                        {event.officeHourTitle}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {event.companyName ?? "기업 미입력"} · {event.agenda}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {event.scheduledDate
                          ? `${event.scheduledDate} ${event.scheduledTime ?? ""}`.trim()
                          : event.periodFrom
                            ? `${event.periodFrom} ~ ${event.periodTo ?? ""}`.trim()
                            : "일정 미정"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-3 text-xs"
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          openRejectDialog(event);
                        }}
                      >
                        거절
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 px-3 text-xs"
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          if (!actionHandler) return;
                          openAcceptDialog(event);
                        }}
                        disabled={!actionHandler}
                      >
                        수락
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );

  const pageTitleClassName = "text-2xl font-semibold text-slate-900";
  const pageDescriptionClassName = "mt-1 text-sm text-slate-500";
  const pageContainerClassName = isConsultant
    ? "mx-auto w-full max-w-[1440px]"
    : "mx-auto w-full max-w-7xl";
  const pageTitle = isConsultant ? "내 일정 캘린더" : "통합 캘린더";
  const pageDescription = isConsultant
    ? "배정된 오피스아워와 개인 일정을 한눈에 확인합니다"
    : "모든 오피스아워 일정을 한눈에 확인하세요";

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* 헤더 */}
      <div className="border-b bg-white px-6 py-5">
        <div className={`${pageContainerClassName} flex items-center justify-between`}>
          <div>
            <h1 className={pageTitleClassName}>{pageTitle}</h1>
            <p className={pageDescriptionClassName}>{pageDescription}</p>
          </div>

          <div className="flex items-center gap-2">
              {allowManualEventCreate && (
                <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogTrigger asChild>
                  <Button className="gap-2 bg-[#0A2540] hover:bg-[#0A2540]/90">
                    <Plus className="size-4" />
                    일정 추가
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>새 일정 추가</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label>제목</Label>
                      <Input
                        value={newEvent.title}
                        onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                        placeholder="일정 제목"
                      />
                    </div>
                    <div>
                      <Label>유형</Label>
                      <Select
                        value={newEvent.type}
                        onValueChange={(val) => setNewEvent({ ...newEvent, type: val as any })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="meeting">미팅</SelectItem>
                          <SelectItem value="office_hour">오피스아워</SelectItem>
                          <SelectItem value="deadline">마감일</SelectItem>
                          <SelectItem value="milestone">마일스톤</SelectItem>
                          <SelectItem value="other">기타</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>날짜</Label>
                      <Input
                        type="date"
                        value={newEvent.date}
                        onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>시작 시간</Label>
                        <Input
                          type="time"
                          value={newEvent.startTime}
                          onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>종료 시간</Label>
                        <Input
                          type="time"
                          value={newEvent.endTime}
                          onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <Label>장소</Label>
                      <Input
                        value={newEvent.location}
                        onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                        placeholder="온라인 / 오프라인 장소"
                      />
                    </div>
                    <div>
                      <Label>설명</Label>
                      <Textarea
                        value={newEvent.description}
                        onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                        placeholder="일정 설명"
                        rows={3}
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                        취소
                      </Button>
                      <Button
                        onClick={handleCreateEvent}
                        disabled={calendarService.isLoading}
                        loading={calendarService.isLoading}
                        className="bg-[#5DADE2] hover:bg-[#5DADE2]/90"
                      >
                        일정 등록
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              )}

              <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>
                      {actionType === "accept" ? "수락 확인" : "최종 거절 확인"}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    {actionType === "accept" ? (
                      <div className="text-sm text-slate-600 space-y-2">
                        <p>이 요청을 수락하면 아래 컨설턴트로 배정됩니다.</p>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                          {currentConsultantName
                            ?? currentUser.companyName
                            ?? "현재 로그인한 컨설턴트"}
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
                          className="min-h-[100px]"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      disabled={isActionPending}
                      onClick={() => {
                        setActionDialogOpen(false);
                        setActionTarget(null);
                        setRejectReason("");
                      }}
                    >
                      취소
                    </Button>
                    <Button
                      onClick={handleConfirmAction}
                      disabled={isActionPending || (actionType === "reject" && rejectReason.trim().length === 0)}
                      loading={isActionPending}
                    >
                      확인
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {!isConsultant && (
                <Select value={selectedProgram || "all"} onValueChange={(val) => setSelectedProgram(val === "all" ? null : val)}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 프로그램</SelectItem>
                    {programs.map(program => (
                      <SelectItem key={program.id} value={program.id}>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: program.color }} />
                          {program.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {!isConsultant && (
                <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setViewMode("month")}
                    className={
                      viewMode === "month"
                        ? "bg-slate-900 text-white shadow-sm hover:bg-slate-900"
                        : "bg-transparent text-slate-600 hover:bg-white hover:text-slate-900"
                    }
                  >
                    <Grid3x3 className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setViewMode("list")}
                    className={
                      viewMode === "list"
                        ? "bg-slate-900 text-white shadow-sm hover:bg-slate-900"
                        : "bg-transparent text-slate-600 hover:bg-white hover:text-slate-900"
                    }
                  >
                    <List className="size-4" />
                  </Button>
                </div>
              )}


          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className={`${pageContainerClassName} p-5`}>
          {viewMode === "month" ? (
            <div
              className={cn(
                "grid gap-4",
                isConsultant
                  ? "2xl:grid-cols-[320px_minmax(0,1.35fr)_320px] min-[1800px]:grid-cols-[340px_minmax(0,1.5fr)_340px]"
                  : "md:grid-cols-3",
              )}
            >
              {isConsultant && (
                <div className="flex flex-col gap-4">
                  {renderPendingOfficeHourReportsCard()}
                </div>
              )}

              {/* 캘린더 */}
              <div className={cn(isConsultant ? "min-w-0" : "md:col-span-2")}>
                <Card className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-[#0A2540]">
                      {selectedDate.toLocaleDateString("ko-KR", { year: "numeric", month: "long" })}
                    </h2>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const newMonth = new Date(
                            currentMonth.getFullYear(),
                            currentMonth.getMonth() - 1,
                            1,
                          );
                          setCurrentMonth(newMonth);
                          setSelectedDate((prev) => clampDateToMonth(prev, newMonth));
                        }}
                      >
                        <ChevronLeft className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const today = new Date();
                          const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                          setCurrentMonth(monthStart);
                          setSelectedDate(today);
                        }}
                      >
                        오늘
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const newMonth = new Date(
                            currentMonth.getFullYear(),
                            currentMonth.getMonth() + 1,
                            1,
                          );
                          setCurrentMonth(newMonth);
                          setSelectedDate((prev) => clampDateToMonth(prev, newMonth));
                        }}
                      >
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <div
                    className={cn(
                      isConsultant ? "grid gap-3" : "grid gap-4",
                      isConsultant
                        ? "min-[1450px]:grid-cols-[minmax(0,1.2fr)_300px] min-[1680px]:grid-cols-[minmax(0,1.35fr)_340px]"
                        : "lg:grid-cols-[minmax(0,1.3fr)_280px] xl:grid-cols-[minmax(0,1.45fr)_300px]",
                    )}
                  >
                    <Calendar
                      key={`${calendarMonth.getFullYear()}-${calendarMonth.getMonth()}`}
                      mode="single"
                      selected={selectedDate}
                      month={calendarMonth}
                      onSelect={(date) => {
                        if (!date) return;
                        setSelectedDate(date);
                        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
                        setCurrentMonth(monthStart);
                      }}
                      onMonthChange={(month) => {
                        const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
                        setCurrentMonth(monthStart);
                        setSelectedDate((prev) => clampDateToMonth(prev, monthStart));
                      }}
                      className="rounded-md"
                      modifiers={{
                        hasEvent: (date) => hasEvents(date),
                      }}
                      modifiersClassNames={{
                        hasEvent:
                          "font-semibold text-[#0A2540]",
                      }}
                      components={{ DayContent: renderDayContent }}
                    />

                    <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                      <h3 className="font-semibold text-[#0A2540] mb-3">
                        {selectedDate.toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}
                      </h3>

                      {selectedDateEvents.length === 0 ? (
                        <div className="text-center py-8">
                          <CalendarIcon className="size-10 text-slate-300 mx-auto mb-2" />
                          <p className="text-slate-500 text-sm">일정이 없습니다</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {selectedDateEvents.map((event: Application) => (
                            <motion.div
                              key={event.id}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              className={`p-3 rounded-lg border-l-4 cursor-pointer transition-colors ${
                                isConsultant && isMyEvent(event) ? "bg-blue-50/70 hover:bg-blue-50" : "bg-white hover:bg-slate-100"
                              }`}
                              style={{
                                borderLeftColor:
                                  isConsultant && isMyEvent(event)
                                    ? "#3b82f6"
                                    : getProgramColor(event.programId),
                              }}
                              onClick={() => openScheduledDetail(event.id)}
                            >
                              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                                <h4 className="min-w-0 flex-1 text-sm font-medium text-[#0A2540]">
                                  {event.officeHourTitle}
                                </h4>
                                <Badge variant="outline" className="shrink-0 whitespace-nowrap text-xs">
                                  {event.status === "completed" ? "완료" : "예정"}
                                </Badge>
                              </div>

                              <div className="space-y-1 text-xs text-slate-600">
                                <div className="flex items-center gap-2">
                                  <Clock className="size-3" />
                                  <span>{formatTime(event.scheduledTime)}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Users className="size-3" />
                                  <span>{event.consultant}</span>
                                  {isConsultant && (
                                    <Badge
                                      className={`shrink-0 whitespace-nowrap text-[10px] ${
                                        isMyEvent(event)
                                          ? "bg-blue-100 text-blue-700 border-blue-200"
                                          : "bg-slate-100 text-slate-600 border-slate-200"
                                      }`}
                                      variant="outline"
                                    >
                                      {isMyEvent(event) ? "내 일정" : "다른 컨설턴트"}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {event.sessionFormat === "online" ? (
                                    <Video className="size-3" />
                                  ) : (
                                    <MapPin className="size-3" />
                                  )}
                                  <span>{event.sessionFormat === "online" ? "온라인" : "오프라인"}</span>
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>


                </Card>
              </div>

              {/* 선택된 날짜의 일정 */}
              <div className="flex min-w-0 flex-col gap-4 md:col-span-1">
                {isConsultant && (
                  renderPendingRequestsCard()
                )}

              </div>
            </div>
          ) : (
            /* 리스트 뷰 */
            <div className="space-y-6">
              {isConsultant && (
                <div className="grid gap-4 xl:grid-cols-2">
                  {renderPendingOfficeHourReportsCard()}
                  {renderPendingRequestsCard()}
                </div>
              )}

              <Card className="p-6">
                <h2 className="text-lg font-semibold text-[#0A2540] mb-6">전체 일정</h2>

              <div className="space-y-4">
                {Object.entries(eventsByDate)
                  .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
                  .map(([date, events]) => (
                    <div key={date}>
                      <h3 className="font-medium text-slate-700 mb-3 flex items-center gap-2">
                        <CalendarIcon className="size-4" />
                        {(parseLocalDateKey(date) ?? new Date(date)).toLocaleDateString("ko-KR", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          weekday: "short",
                        })}
                        <Badge variant="outline">{events.length}개</Badge>
                      </h3>

                      <div className="grid gap-3 ml-6">
                        {events.map((event: Application) => (
                          <motion.div
                            key={event.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                          >
                            <Card
                              className={`p-4 hover:shadow-md transition-shadow cursor-pointer ${
                                isConsultant && isMyEvent(event) ? "bg-blue-50/60 border-blue-200" : ""
                              }`}
                              style={{
                                borderLeft:
                                  isConsultant && isMyEvent(event)
                                    ? "4px solid #3b82f6"
                                    : undefined,
                              }}
                              onClick={() => openScheduledDetail(event.id)}
                            >
                              <div className="flex items-start gap-4">
                                <div
                                  className="w-1 h-full rounded-full"
                                  style={{ backgroundColor: getProgramColor(event.programId) }}
                                />
                                <div className="flex-1">
                                  <div className="flex items-start justify-between mb-2">
                                    <h4 className="font-semibold text-[#0A2540]">
                                      {event.officeHourTitle}
                                    </h4>
                                    <Badge>
                                      {event.status === "completed" ? "완료" : "예정"}
                                    </Badge>
                                  </div>

                                  <div className="grid md:grid-cols-3 gap-3 text-sm text-slate-600">
                                    <div className="flex items-center gap-2">
                                      <Clock className="size-4" />
                                      <span>{formatTime(event.scheduledTime)}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Users className="size-4" />
                                      <span>{event.consultant}</span>
                                      {isConsultant && (
                                        <Badge
                                          className={`text-[10px] ${
                                            isMyEvent(event)
                                              ? "bg-blue-100 text-blue-700 border-blue-200"
                                              : "bg-slate-100 text-slate-600 border-slate-200"
                                          }`}
                                          variant="outline"
                                        >
                                          {isMyEvent(event) ? "내 일정" : "다른 컨설턴트"}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {event.sessionFormat === "online" ? (
                                        <Video className="size-4" />
                                      ) : (
                                        <MapPin className="size-4" />
                                      )}
                                      <span>
                                        {event.sessionFormat === "online" ? "온라인" : "오프라인"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </Card>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  ))}

                {Object.keys(eventsByDate).length === 0 && (
                  <div className="text-center py-12">
                    <CalendarIcon className="size-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500 font-medium mb-2">예정된 일정이 없습니다</p>
                    <p className="text-sm text-slate-400">
                      새로운 오피스아워를 신청해보세요
                    </p>
                  </div>
                )}
              </div>
              </Card>
            </div>
          )}
        </div>
      </div>
      {selectedPendingApplication && onUpdateStatus && onUpdateApplication && (
        <AdminApplicationDetailModal
          application={selectedPendingApplication}
          onClose={() => setSelectedPendingApplicationId(null)}
          onUpdateStatus={onUpdateStatus}
          onUpdateApplication={onUpdateApplication}
          onConfirmApplication={onConfirmApplication}
          onRejectApplication={onRejectApplication}
          onRequestApplication={onRequestApplication}
          readOnly={true}
          allowStatusActions={isConsultant}
          currentConsultantName={currentConsultantName}
        />
      )}
      {selectedScheduledApplication && onUpdateStatus && onUpdateApplication && (
        <AdminApplicationDetailModal
          application={selectedScheduledApplication}
          onClose={() => setSelectedScheduledApplicationId(null)}
          onUpdateStatus={onUpdateStatus}
          onUpdateApplication={onUpdateApplication}
          onConfirmApplication={onConfirmApplication}
          onRejectApplication={onRejectApplication}
          onRequestApplication={onRequestApplication}
          readOnly={true}
          allowStatusActions={false}
          currentConsultantName={currentConsultantName}
        />
      )}
    </div>
  );
}
