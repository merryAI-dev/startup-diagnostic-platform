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
  Program,
  Agenda,
  FileItem,
  RegularOfficeHour,
  OfficeHourSlot,
  Consultant,
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
import { Calendar } from "@/redesign/app/components/ui/calendar";
import { Label } from "@/redesign/app/components/ui/label";
import { Textarea } from "@/redesign/app/components/ui/textarea";
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
  isBefore,
  startOfDay,
} from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/redesign/app/components/ui/utils";

interface DashboardCalendarProps {
  applications: Application[];
  user: User;
  programs: Program[];
  agendas: Agenda[];
  regularOfficeHours: RegularOfficeHour[];
  officeHourSlots: OfficeHourSlot[];
  consultants: Consultant[];
  ticketOverrides?: Record<string, { internal?: number; external?: number }>;
  onNavigate: (page: string, id?: string) => void;
  onCancelApplication: (id: string) => Promise<void> | void;
  onUpdateCompanyApplication?: (
    id: string,
    payload: {
      requestContent: string;
      retainedAttachments: Array<{ name: string; url?: string }>;
      newFiles: FileItem[];
      scheduledDate?: string;
      scheduledTime?: string;
      slotId?: string;
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

function normalizeTimeKey(value?: string): string {
  if (!value) return "";
  const [hourRaw, minuteRaw] = value.trim().split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return value.trim();
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeConsultantDisplayName(value?: string | null): string {
  return (value ?? "")
    .replace(/\s*컨설턴트\s*$/u, "")
    .trim()
    .toLowerCase();
}

export function DashboardCalendar({
  applications,
  user,
  programs,
  agendas,
  regularOfficeHours,
  officeHourSlots,
  consultants,
  ticketOverrides,
  onNavigate,
  onCancelApplication,
  onUpdateCompanyApplication,
}: DashboardCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [cancelTarget, setCancelTarget] = useState<Application | null>(null);
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [applicationListTab, setApplicationListTab] = useState<"pending" | "rejected">("pending");
  const [isEditingApplication, setIsEditingApplication] = useState(false);
  const [editingRequestSections, setEditingRequestSections] = useState<RequestSections>(
    createEmptyRequestSections()
  );
  const [editingScheduledDate, setEditingScheduledDate] = useState<Date | undefined>();
  const [editingScheduledTime, setEditingScheduledTime] = useState("");
  const [editingSlotId, setEditingSlotId] = useState<string | undefined>();
  const [editingRetainedAttachments, setEditingRetainedAttachments] = useState<
    Array<{ id: string; name: string; url?: string }>
  >([]);
  const [editingNewFiles, setEditingNewFiles] = useState<FileItem[]>([]);
  const [savingApplicationEdit, setSavingApplicationEdit] = useState(false);

  const userPrograms = programs;
  const agendaScopeById = useMemo(
    () => new Map(agendas.map((agenda) => [agenda.id, agenda.scope])),
    [agendas]
  );
  const agendaScopeByName = useMemo(
    () => new Map(agendas.map((agenda) => [agenda.name, agenda.scope])),
    [agendas]
  );

  const canViewAll =
    user.permissions?.canViewAllApplications
    || user.role === "admin"
    || user.role === "staff"
    || user.role === "consultant";
  // AppContent already passes role-scoped applications.
  // Re-filtering here with looser fallback rules can surface stale or unrelated items.
  const userApplications = applications;

  // 확정된 일정들
  const confirmedApplications = userApplications.filter(
    (app) => app.status === "confirmed" && app.scheduledDate
  );

  const getSessionEndTime = (app: Application) => {
    const durationHours = app.duration ?? 2;
    if (app.scheduledDate && app.scheduledTime) {
      const start = new Date(`${app.scheduledDate}T${app.scheduledTime}`);
      if (!Number.isNaN(start.getTime())) {
        return new Date(start.getTime() + durationHours * 60 * 60 * 1000);
      }
    }
    if (app.scheduledDate) {
      const fallback = new Date(`${app.scheduledDate}T23:59`);
      if (!Number.isNaN(fallback.getTime())) {
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

  const getApplicationScope = (app: Application) => {
    if (app.type === "irregular" && typeof app.isInternal === "boolean") {
      return app.isInternal ? "internal" : "external";
    }
    if (app.agendaId && agendaScopeById.has(app.agendaId)) {
      return agendaScopeById.get(app.agendaId) ?? null;
    }
    if (app.agenda && agendaScopeByName.has(app.agenda)) {
      return agendaScopeByName.get(app.agenda) ?? null;
    }
    return null;
  };

  const ticketStats = useMemo(() => {
    const overrides = ticketOverrides ?? {};
    const totalInternal = userPrograms.reduce((sum, program) => {
      const override = overrides[program.id]?.internal;
      const value =
        typeof override === "number" ? override : (program.internalTicketLimit ?? 0);
      return sum + value;
    }, 0);
    const totalExternal = userPrograms.reduce((sum, program) => {
      const override = overrides[program.id]?.external;
      const value =
        typeof override === "number" ? override : (program.externalTicketLimit ?? 0);
      return sum + value;
    }, 0);
    let reservedInternal = 0;
    let reservedExternal = 0;
    let completedInternal = 0;
    let completedExternal = 0;

    userApplications.forEach((app) => {
      const scope = getApplicationScope(app);
      if (!scope) return;
      const isReserved =
        app.status === "pending" || app.status === "review" || app.status === "confirmed";
      const isCompleted = app.status === "completed";
      if (!isReserved && !isCompleted) return;
      if (scope === "internal") {
        if (isCompleted) completedInternal += 1;
        else reservedInternal += 1;
      } else {
        if (isCompleted) completedExternal += 1;
        else reservedExternal += 1;
      }
    });

    return {
      totalInternal,
      totalExternal,
      reservedInternal,
      reservedExternal,
      completedInternal,
      completedExternal,
      remainingInternal: Math.max(0, totalInternal - reservedInternal - completedInternal),
      remainingExternal: Math.max(0, totalExternal - reservedExternal - completedExternal),
    };
  }, [userApplications, userPrograms, agendaScopeById, agendaScopeByName]);

  // 캘린더 날짜 생성
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // 특정 날짜의 일정들
  const getEventsForDate = (date: Date) => {
    return confirmedApplications.filter((app) => {
      if (!app.scheduledDate) return false;
      return isSameDay(new Date(app.scheduledDate), date);
    });
  };

  // 선택된 날짜의 일정들
  const selectedDateEvents = selectedDate ? getEventsForDate(selectedDate) : [];

  // 다가오는 일정 (향후 7일)
  const upcomingEvents = confirmedApplications
    .filter((app) => {
      if (!app.scheduledDate) return false;
      const eventDate = new Date(app.scheduledDate);
      const today = new Date();
      const weekLater = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      return eventDate >= today && eventDate <= weekLater;
    })
    .sort((a, b) => {
      const dateA = new Date(a.scheduledDate!).getTime();
      const dateB = new Date(b.scheduledDate!).getTime();
      return dateA - dateB;
    });

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
    setSelectedApplication(application);
  };

  const formatScheduleLabel = (application: Application) => {
    if (application.scheduledDate && application.scheduledTime) {
      return `${format(new Date(application.scheduledDate), "M월 d일 (E)", { locale: ko })} ${application.scheduledTime}`;
    }
    if (application.periodFrom && application.periodTo) {
      return `${format(new Date(application.periodFrom), "M월 d일", { locale: ko })} - ${format(new Date(application.periodTo), "M월 d일", { locale: ko })}`;
    }
    return "일정 조율 중";
  };

  const getApplicationTypeLabel = (application: Application) =>
    application.type === "irregular" ? "비정기 오피스아워" : "정기 오피스아워";

  const canDeleteApplication =
    selectedApplication
    && (selectedApplication.status === "pending" || selectedApplication.status === "review");
  const canEditApplication =
    Boolean(
      selectedApplication
      && user.role === "user"
      && onUpdateCompanyApplication
      && !hasSessionEnded(selectedApplication)
      && (selectedApplication.status === "pending" || selectedApplication.status === "confirmed")
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

  const selectedApplicationRequestSections = useMemo(
    () => parseRequestSections(selectedApplication?.requestContent),
    [selectedApplication?.requestContent]
  );
  const selectedAgenda = useMemo(() => {
    if (!selectedApplication) return null;
    if (selectedApplication.agendaId) {
      return agendas.find((agenda) => agenda.id === selectedApplication.agendaId) ?? null;
    }
    return agendas.find((agenda) => agenda.name === selectedApplication.agenda) ?? null;
  }, [agendas, selectedApplication]);
  const canEditRegularSchedule = Boolean(
    canEditApplication && selectedApplication?.type === "regular" && selectedAgenda
  );
  const relatedRegularOfficeHours = useMemo(() => {
    if (!selectedApplication || selectedApplication.type !== "regular") return [];
    if (selectedApplication.programId) {
      return regularOfficeHours.filter(
        (officeHour) => officeHour.programId === selectedApplication.programId
      );
    }
    if (selectedApplication.officeHourId) {
      return regularOfficeHours.filter(
        (officeHour) => officeHour.id === selectedApplication.officeHourId
      );
    }
    return [];
  }, [regularOfficeHours, selectedApplication]);
  const rescheduleConsultantPool = useMemo(() => {
    if (!selectedAgenda?.id) return [];
    return consultants.filter(
      (consultant) =>
        consultant.status === "active" && (consultant.agendaIds ?? []).includes(selectedAgenda.id)
    );
  }, [consultants, selectedAgenda]);
  const availableRescheduleDateKeys = useMemo(() => {
    const next = new Set<string>();
    relatedRegularOfficeHours.forEach((officeHour) => {
      (officeHour.availableDates ?? []).forEach((date) => {
        if (typeof date === "string" && date.trim()) {
          next.add(date.slice(0, 10));
        }
      });
      (officeHour.slots ?? []).forEach((slot) => {
        if (slot.date) next.add(slot.date);
      });
    });
    if (selectedApplication?.scheduledDate) {
      next.add(selectedApplication.scheduledDate);
    }
    return next;
  }, [relatedRegularOfficeHours, selectedApplication?.scheduledDate]);
  const rescheduleTimeSlots = useMemo(() => {
    if (!canEditRegularSchedule || !editingScheduledDate || !selectedApplication || !selectedAgenda) {
      return [];
    }

    const selectedDateKey = format(editingScheduledDate, "yyyy-MM-dd");
    const currentTimeKey = normalizeTimeKey(selectedApplication.scheduledTime);
    const relatedProgramIds = new Set(
      relatedRegularOfficeHours
        .map((officeHour) => officeHour.programId)
        .filter((value): value is string => Boolean(value))
    );
    const embeddedSlotsForDate = relatedRegularOfficeHours.flatMap((officeHour) =>
      (officeHour.slots ?? []).filter((slot) => {
        if (slot.date !== selectedDateKey) return false;
        if (!selectedAgenda.id) return true;
        if (!slot.agendaIds || slot.agendaIds.length === 0) return true;
        return slot.agendaIds.includes(selectedAgenda.id);
      })
    );
    const slotsForDate = relatedProgramIds.size > 0
      ? officeHourSlots.filter((slot) => {
          if (slot.type !== "regular") return false;
          if (slot.date !== selectedDateKey) return false;
          if (!slot.programId || !relatedProgramIds.has(slot.programId)) return false;
          if (!selectedAgenda.id) return true;
          if (!slot.agendaIds || slot.agendaIds.length === 0) return true;
          return slot.agendaIds.includes(selectedAgenda.id);
        })
      : embeddedSlotsForDate;

    const blockedAgendaTimes = new Set<string>();
    applications.forEach((application) => {
      if (application.id === selectedApplication.id) return;
      if (application.type !== "regular") return;
      if (
        application.status !== "pending"
        && application.status !== "review"
        && application.status !== "confirmed"
        && application.status !== "completed"
      ) {
        return;
      }
      const sameAgenda = selectedApplication.agendaId
        ? application.agendaId === selectedApplication.agendaId
        : application.agenda === selectedApplication.agenda;
      if (!sameAgenda) return;
      if (application.scheduledDate !== selectedDateKey) return;
      if (application.scheduledTime) {
        blockedAgendaTimes.add(normalizeTimeKey(application.scheduledTime));
      }
    });

    const hasAssignableConsultantAt = (time: string) => {
      const normalizedTime = normalizeTimeKey(time);
      return rescheduleConsultantPool.some((consultant) => {
        const dayAvailability = consultant.availability.find(
          (day) => day.dayOfWeek === editingScheduledDate.getDay()
        );
        const availableInSchedule = Boolean(
          dayAvailability?.slots.some(
            (slotAvailability) =>
              normalizeTimeKey(slotAvailability.start) === normalizedTime
              && slotAvailability.available
          )
        );
        if (!availableInSchedule) return false;

        const hasBusyConflict = applications.some((application) => {
          if (application.id === selectedApplication.id) return false;
          if (
            application.status !== "pending"
            && application.status !== "review"
            && application.status !== "confirmed"
            && application.status !== "completed"
          ) {
            return false;
          }
          if (!application.scheduledDate || !application.scheduledTime) return false;
          if (application.scheduledDate !== selectedDateKey) return false;
          if (normalizeTimeKey(application.scheduledTime) !== normalizedTime) return false;
          if (application.consultantId) {
            return application.consultantId === consultant.id;
          }
          return (
            normalizeConsultantDisplayName(application.consultant)
            === normalizeConsultantDisplayName(consultant.name)
          );
        });

        return !hasBusyConflict;
      });
    };

    const byTime = new Map<string, { hasOpen: boolean; hasCurrent: boolean; slotId?: string }>();
    slotsForDate.forEach((slot) => {
      const timeKey = normalizeTimeKey(slot.startTime);
      const isCurrent =
        selectedApplication.scheduledDate === selectedDateKey
        && currentTimeKey === timeKey
        && (
          slot.id === selectedApplication.officeHourSlotId
          || (!selectedApplication.officeHourSlotId && selectedApplication.scheduledTime === slot.startTime)
        );
      const existing = byTime.get(timeKey);
      if (!existing) {
        byTime.set(timeKey, {
          hasOpen: slot.status === "open",
          hasCurrent: isCurrent,
          slotId: slot.id,
        });
        return;
      }
      byTime.set(timeKey, {
        hasOpen: existing.hasOpen || slot.status === "open",
        hasCurrent: existing.hasCurrent || isCurrent,
        slotId: existing.hasOpen ? existing.slotId : slot.status === "open" ? slot.id : existing.slotId,
      });
    });

    return Array.from(byTime.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, meta]) => {
        const blockedByAgenda = blockedAgendaTimes.has(time);
        const consultantAssignable = hasAssignableConsultantAt(time);
        const available = meta.hasCurrent || (meta.hasOpen && !blockedByAgenda && consultantAssignable);
        return {
          time,
          slotId: meta.slotId,
          available,
          reason: available
            ? undefined
            : blockedByAgenda
              ? "이미 예약된 시간입니다"
              : !consultantAssignable
                ? "해당 시간에 배정 가능한 컨설턴트가 없습니다"
                : "예약 불가한 시간입니다",
        };
      });
  }, [
    applications,
    canEditRegularSchedule,
    editingScheduledDate,
    officeHourSlots,
    relatedRegularOfficeHours,
    rescheduleConsultantPool,
    selectedAgenda,
    selectedApplication,
  ]);
  const hasScheduleChanges = Boolean(
    selectedApplication
    && canEditRegularSchedule
    && editingScheduledDate
    && editingScheduledTime
    && (
      selectedApplication.scheduledDate !== format(editingScheduledDate, "yyyy-MM-dd")
      || normalizeTimeKey(selectedApplication.scheduledTime) !== normalizeTimeKey(editingScheduledTime)
      || (editingSlotId ?? "") !== (selectedApplication.officeHourSlotId ?? "")
    )
  );

  const listTabButtonClass = (tab: "pending" | "rejected") =>
    `inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
      applicationListTab === tab
        ? "bg-slate-900 text-white"
        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
    }`;

  const internalTicketsDepleted = ticketStats.remainingInternal === 0;
  const externalTicketsDepleted = ticketStats.remainingExternal === 0;
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
    if (!selectedApplication) return;
    const nextSelectedApplication = applications.find(
      (application) => application.id === selectedApplication.id
    );
    if (!nextSelectedApplication) {
      setSelectedApplication(null);
      return;
    }
    if (nextSelectedApplication !== selectedApplication) {
      setSelectedApplication(nextSelectedApplication);
    }
  }, [applications, selectedApplication]);

  useEffect(() => {
    if (!selectedApplication) {
      setIsEditingApplication(false);
      setEditingRequestSections(createEmptyRequestSections());
      setEditingScheduledDate(undefined);
      setEditingScheduledTime("");
      setEditingSlotId(undefined);
      setEditingRetainedAttachments([]);
      setEditingNewFiles([]);
      setSavingApplicationEdit(false);
      return;
    }

    setEditingRequestSections(parseRequestSections(selectedApplication.requestContent));
    setEditingScheduledDate(
      selectedApplication.scheduledDate
        ? new Date(`${selectedApplication.scheduledDate}T00:00:00`)
        : undefined
    );
    setEditingScheduledTime(selectedApplication.scheduledTime ?? "");
    setEditingSlotId(selectedApplication.officeHourSlotId);
    setEditingRetainedAttachments(selectedApplicationAttachments);
    setEditingNewFiles([]);
    setIsEditingApplication(false);
  }, [selectedApplication, selectedApplicationAttachments]);

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
      scheduledDate:
        hasScheduleChanges && editingScheduledDate
          ? format(editingScheduledDate, "yyyy-MM-dd")
          : undefined,
      scheduledTime: hasScheduleChanges ? editingScheduledTime : undefined,
      slotId: hasScheduleChanges ? editingSlotId : undefined,
    });
    setSavingApplicationEdit(false);
    if (!ok) return;
    setIsEditingApplication(false);
    setEditingNewFiles([]);
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
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

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Ticket Summary */}
        <div className="w-80 bg-white border-r p-6 overflow-y-auto">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">티켓 현황</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div
                className={`rounded-lg border p-3 transition-colors ${
                  internalTicketsDepleted
                    ? "border-slate-200 bg-slate-100 text-slate-400"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div
                    className={`text-xs font-semibold ${
                      internalTicketsDepleted ? "text-slate-500" : "text-gray-900"
                    }`}
                  >
                    내부 티켓
                  </div>
                  {internalTicketsDepleted ? (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                      소진
                    </span>
                  ) : null}
                </div>
                <div
                  className={`text-xl font-bold leading-none ${
                    internalTicketsDepleted ? "text-slate-400" : "text-gray-900"
                  }`}
                >
                  {ticketStats.remainingInternal}
                  <span className="text-xs font-normal text-muted-foreground">
                    {" "}
                    / {ticketStats.totalInternal}
                  </span>
                </div>
                <p
                  className={`mt-1 text-[11px] ${
                    internalTicketsDepleted ? "text-slate-400" : "text-muted-foreground"
                  }`}
                >
                  예약 {ticketStats.reservedInternal} · 완료 {ticketStats.completedInternal}
                </p>
              </div>
              <div
                className={`rounded-lg border p-3 transition-colors ${
                  externalTicketsDepleted
                    ? "border-slate-200 bg-slate-100 text-slate-400"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div
                    className={`text-xs font-semibold ${
                      externalTicketsDepleted ? "text-slate-500" : "text-gray-900"
                    }`}
                  >
                    외부 티켓
                  </div>
                  {externalTicketsDepleted ? (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                      소진
                    </span>
                  ) : null}
                </div>
                <div
                  className={`text-xl font-bold leading-none ${
                    externalTicketsDepleted ? "text-slate-400" : "text-gray-900"
                  }`}
                >
                  {ticketStats.remainingExternal}
                  <span className="text-xs font-normal text-muted-foreground">
                    {" "}
                    / {ticketStats.totalExternal}
                  </span>
                </div>
                <p
                  className={`mt-1 text-[11px] ${
                    externalTicketsDepleted ? "text-slate-400" : "text-muted-foreground"
                  }`}
                >
                  예약 {ticketStats.reservedExternal} · 완료 {ticketStats.completedExternal}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">참여 사업</h2>
            {userPrograms.length > 0 ? (
              <div className="max-h-48 overflow-y-auto pr-1">
                <ul className="space-y-2">
                  {userPrograms.map((program) => (
                    <li key={program.id} className="text-sm border rounded-lg px-3 py-2 bg-gray-50">
                      {program.name}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                참여 중인 사업이 없습니다.
              </p>
            )}
          </div>

          {(pendingApplications.length > 0 || rejectedApplications.length > 0) && (
            <div className="mt-8">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-900">신청 현황</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={listTabButtonClass("pending")}
                    onClick={() => setApplicationListTab("pending")}
                  >
                    대기중
                    <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[11px]">
                      {pendingApplications.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={listTabButtonClass("rejected")}
                    onClick={() => setApplicationListTab("rejected")}
                  >
                    거절됨
                    <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[11px]">
                      {rejectedApplications.length}
                    </span>
                  </button>
                </div>
              </div>

              {currentListApplications.length > 0 ? (
                <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
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
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
                  {applicationListTab === "pending"
                    ? "대기중인 신청이 없습니다."
                    : "거절된 신청이 없습니다."}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Main Calendar */}
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
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
          <div className="flex-1 overflow-y-auto p-6">
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
            <div className="space-y-3 mb-8">
              {selectedDateEvents.map((event) => (
                <div
                  key={event.id}
                  onClick={() => openApplicationModal(event)}
                  className="border rounded-lg p-4 hover:shadow-md cursor-pointer transition-all"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="font-semibold text-sm">{event.scheduledTime}</span>
                    </div>
                    <StatusChip status={event.status} size="sm" />
                  </div>
                  <h3 className="font-medium text-gray-900 mb-1">{event.officeHourTitle}</h3>
                  {event.agenda && (
                    <p className="text-xs text-muted-foreground mb-2">
                      {event.agenda}
                    </p>
                  )}
                  {shouldShowConsultant(event.consultant) && (
                    <p className="text-sm text-muted-foreground mb-2">
                      {event.consultant}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="px-2 py-1 bg-gray-100 rounded">
                      {event.sessionFormat === "online" ? "온라인" : "오프라인"}
                    </span>
                    {event.duration && (
                      <span className="px-2 py-1 bg-gray-100 rounded">
                        {event.duration}시간
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Upcoming Events */}
          {upcomingEvents.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-900 mb-4">다가오는 일정</h2>
              <div className="space-y-3">
                {upcomingEvents.slice(0, 5).map((event) => (
                  <div
                    key={event.id}
                    onClick={() => openApplicationModal(event)}
                    className="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
                      <CalendarIcon className="w-3 h-3" />
                      <span>
                        {format(new Date(event.scheduledDate!), "M월 d일 (E)", { locale: ko })}
                      </span>
                      <span>{event.scheduledTime}</span>
                    </div>
                    <h3 className="font-medium text-sm text-gray-900 mb-1">{event.officeHourTitle}</h3>
                    {event.agenda && (
                      <p className="text-xs text-muted-foreground mb-1">
                        {event.agenda}
                      </p>
                    )}
                    {shouldShowConsultant(event.consultant) && (
                      <p className="text-xs text-muted-foreground">{event.consultant}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={Boolean(selectedApplication)}
        onOpenChange={(open) => {
          if (!open) setSelectedApplication(null);
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
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
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
                            setEditingScheduledDate(
                              selectedApplication.scheduledDate
                                ? new Date(`${selectedApplication.scheduledDate}T00:00:00`)
                                : undefined
                            );
                            setEditingScheduledTime(selectedApplication.scheduledTime ?? "");
                            setEditingSlotId(selectedApplication.officeHourSlotId);
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
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                      <CalendarIcon className="h-3.5 w-3.5" />
                      일정
                    </div>
                    {isEditingApplication && canEditRegularSchedule ? (
                      <div className="mt-3 space-y-4">
                        <div>
                          <Label className="mb-2 block text-xs font-semibold text-slate-700">
                            신청 가능한 날짜
                          </Label>
                          <Calendar
                            mode="single"
                            selected={editingScheduledDate}
                            onSelect={(date) => {
                              setEditingScheduledDate(date);
                              setEditingScheduledTime("");
                              setEditingSlotId(undefined);
                            }}
                            disabled={(date) => {
                              if (isBefore(date, startOfDay(new Date()))) return true;
                              const dateKey = format(date, "yyyy-MM-dd");
                              return !availableRescheduleDateKeys.has(dateKey);
                            }}
                            className="rounded-md border bg-white"
                          />
                        </div>
                        {editingScheduledDate ? (
                          <div>
                            <Label className="mb-2 block text-xs font-semibold text-slate-700">
                              시간 선택
                            </Label>
                            {rescheduleTimeSlots.length > 0 ? (
                              <div className="grid grid-cols-2 gap-2">
                                {rescheduleTimeSlots.map((slot) => (
                                  <button
                                    key={slot.time}
                                    type="button"
                                    disabled={!slot.available}
                                    onClick={() => {
                                      setEditingScheduledTime(slot.time);
                                      setEditingSlotId(slot.slotId);
                                    }}
                                    className={cn(
                                      "rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                                      !slot.available && "cursor-not-allowed bg-slate-100 text-slate-400",
                                      slot.available && editingScheduledTime === slot.time
                                        && "border-blue-500 bg-blue-500 text-white",
                                      slot.available && editingScheduledTime !== slot.time
                                        && "bg-white text-slate-700 hover:border-slate-400"
                                    )}
                                    title={slot.reason}
                                  >
                                    <div className="font-semibold">{slot.time}</div>
                                    {!slot.available && slot.reason ? (
                                      <div className="mt-1 text-[10px] leading-4 text-inherit opacity-80">
                                        {slot.reason}
                                      </div>
                                    ) : null}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-4 text-xs text-slate-500">
                                선택 가능한 시간이 없습니다.
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {formatScheduleLabel(selectedApplication)}
                      </p>
                    )}
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
                      || (canEditRegularSchedule && (!editingScheduledDate || !editingScheduledTime || !editingSlotId))
                    }
                  >
                    {savingApplicationEdit ? "저장 중..." : "저장"}
                  </Button>
                ) : null}
                <Button onClick={() => setSelectedApplication(null)}>닫기</Button>
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
                  setSelectedApplication(null);
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
