import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock } from "lucide-react";
import { Application, User, Program, Agenda } from "@/redesign/app/lib/types";
import { Button } from "@/redesign/app/components/ui/button";
import { StatusChip } from "@/redesign/app/components/status-chip";
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
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, isToday } from "date-fns";
import { ko } from "date-fns/locale";

interface DashboardCalendarProps {
  applications: Application[];
  user: User;
  programs: Program[];
  agendas: Agenda[];
  ticketOverrides?: Record<string, { internal?: number; external?: number }>;
  onNavigate: (page: string, id?: string) => void;
  onCancelApplication: (id: string) => Promise<void> | void;
}

export function DashboardCalendar({
  applications,
  user,
  programs,
  agendas,
  ticketOverrides,
  onNavigate,
  onCancelApplication,
}: DashboardCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [cancelTarget, setCancelTarget] = useState<Application | null>(null);

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

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">오피스아워 일정</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {user.companyName}의 컨설팅 일정을 관리합니다
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
              <div className="border rounded-lg p-3">
                <div className="text-xs font-semibold text-gray-900 mb-1">내부 티켓</div>
                <div className="text-xl font-bold text-gray-900 leading-none">
                  {ticketStats.remainingInternal}
                  <span className="text-xs font-normal text-muted-foreground">
                    {" "}
                    / {ticketStats.totalInternal}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  예약 {ticketStats.reservedInternal} · 완료 {ticketStats.completedInternal}
                </p>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-xs font-semibold text-gray-900 mb-1">외부 티켓</div>
                <div className="text-xl font-bold text-gray-900 leading-none">
                  {ticketStats.remainingExternal}
                  <span className="text-xs font-normal text-muted-foreground">
                    {" "}
                    / {ticketStats.totalExternal}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
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

          {/* Pending Applications */}
          {pendingApplications.length > 0 && (
            <div className="mt-8">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">대기중인 신청</h2>
              <div className="max-h-72 overflow-y-auto pr-1 space-y-2">
                {pendingApplications.map((app) => (
                  <div
                    key={app.id}
                    onClick={() => onNavigate("application", app.id)}
                    className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-snug break-words">
                          {app.officeHourTitle}
                        </p>
                      </div>
                      <StatusChip status={app.status} size="sm" className="shrink-0 whitespace-nowrap" />
                    </div>
                    {(() => {
                      const metaLine = buildMetaLine(app);
                      return metaLine ? (
                        <p className="text-xs text-muted-foreground">
                          {metaLine}
                        </p>
                      ) : null;
                    })()}
                    <div className="mt-2 flex justify-end">
                      <Button
                        size="sm"
                        variant="default"
                        className="bg-rose-600 border-rose-600 text-white font-semibold shadow-md hover:bg-rose-700 hover:border-rose-700"
                        onClick={(event) => {
                          event.stopPropagation();
                          setCancelTarget(app);
                        }}
                      >
                        신청 삭제
                      </Button>
                    </div>
                    {app.rejectionReason && (
                      <p className="text-xs text-rose-600 mt-1">
                        거절 사유: {app.rejectionReason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rejected Applications */}
          {rejectedApplications.length > 0 && (
            <div className="mt-8">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">거절된 신청</h2>
              <div className="max-h-72 overflow-y-auto pr-1 space-y-2">
                {rejectedApplications.map((app) => (
                  <div
                    key={app.id}
                    onClick={() => onNavigate("application", app.id)}
                    className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-snug break-words">
                          {app.officeHourTitle}
                        </p>
                      </div>
                      <StatusChip status={app.status} size="sm" className="shrink-0 whitespace-nowrap" />
                    </div>
                    {(() => {
                      const metaLine = buildMetaLine(app);
                      return metaLine ? (
                        <p className="text-xs text-muted-foreground">
                          {metaLine}
                        </p>
                      ) : null;
                    })()}
                    <p className="text-xs text-rose-600 mt-1">
                      거절 사유: {app.rejectionReason?.trim() || "사유가 등록되지 않았습니다."}
                    </p>
                  </div>
                ))}
              </div>
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
                  onClick={() => onNavigate("application", event.id)}
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
                    onClick={() => onNavigate("application", event.id)}
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
