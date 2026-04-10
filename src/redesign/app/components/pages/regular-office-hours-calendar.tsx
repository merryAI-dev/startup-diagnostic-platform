import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Program, RegularOfficeHour } from "@/redesign/app/lib/types";
import { Button } from "@/redesign/app/components/ui/button";
import { Badge } from "@/redesign/app/components/ui/badge";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, isToday, addDays, isBefore, startOfDay } from "date-fns";
import { ko } from "date-fns/locale";
import { parseLocalDateKey } from "@/redesign/app/lib/date-keys";

interface RegularOfficeHoursCalendarProps {
  officeHours: RegularOfficeHour[];
  programs: Program[];
  ticketStats: {
    totalInternal: number;
    totalExternal: number;
    reservedInternal: number;
    reservedExternal: number;
    completedInternal: number;
    completedExternal: number;
    remainingInternal: number;
    remainingExternal: number;
  };
  summary: {
    upcomingCount: number;
    currentMonthCount: number;
    nextScheduleLabel: string | null;
  };
  onSelectOfficeHour: (id?: string, dateKey?: string) => void;
}

export function RegularOfficeHoursCalendar({
  officeHours,
  programs,
  ticketStats,
  summary,
  onSelectOfficeHour,
}: RegularOfficeHoursCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const monthInitializedRef = useRef(false);

  // 캘린더 날짜 생성
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const baseCalendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const lastBaseDay = baseCalendarDays[baseCalendarDays.length - 1] ?? calendarEnd;
  const calendarDays = baseCalendarDays.length >= 42
    ? baseCalendarDays.slice(0, 42)
    : [
      ...baseCalendarDays,
      ...Array.from({ length: 42 - baseCalendarDays.length }, (_, index) =>
        addDays(lastBaseDay, index + 1)
      ),
    ];

  const todayStart = useMemo(() => startOfDay(new Date()), []);
  const normalizedOfficeHours = useMemo(
    () =>
      officeHours
        .map((officeHour) => ({
          ...officeHour,
          availableDates: (officeHour.availableDates ?? []).filter((date) =>
            Boolean(parseLocalDateKey(date))
          ),
        }))
        .filter((officeHour) => officeHour.availableDates.length > 0),
    [officeHours]
  );

  const expandedSessions = useMemo(
    () =>
      normalizedOfficeHours
        .flatMap((officeHour) =>
          officeHour.availableDates.map((date) => ({
            ...officeHour,
            date,
          }))
        )
        .sort((a, b) => {
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
          return a.title.localeCompare(b.title);
        }),
    [normalizedOfficeHours]
  );
  const displayDateKeys = useMemo(
    () => new Set(
      expandedSessions
        .map((session) => parseLocalDateKey(session.date))
        .filter((value): value is Date => Boolean(value))
        .map((date) => format(date, "yyyy-MM-dd"))
    ),
    [expandedSessions]
  );
  const requestableSessions = useMemo(
    () =>
      expandedSessions.filter((session) => {
        const parsed = parseLocalDateKey(session.date);
        return parsed ? !isBefore(parsed, todayStart) : false;
      }),
    [expandedSessions, todayStart]
  );
  const firstRequestableSession = requestableSessions[0];
  const firstExpandedSession = expandedSessions[0];
  const firstAvailableDate = firstRequestableSession
    ? parseLocalDateKey(firstRequestableSession.date)
    : firstExpandedSession
      ? parseLocalDateKey(firstExpandedSession.date)
    : null;

  useEffect(() => {
    if (!selectedDate) {
      setSelectedDate(firstAvailableDate);
      return;
    }
    const selectedKey = format(selectedDate, "yyyy-MM-dd");
    if (!displayDateKeys.has(selectedKey)) {
      setSelectedDate(firstAvailableDate);
    }
  }, [displayDateKeys, firstAvailableDate, selectedDate]);

  useEffect(() => {
    if (!firstAvailableDate || monthInitializedRef.current) return;
    setCurrentMonth(firstAvailableDate);
    monthInitializedRef.current = true;
  }, [firstAvailableDate]);

  // 특정 날짜의 오피스아워
  const getOfficeHoursForDate = (date: Date) => {
    return expandedSessions.filter((session) => {
      const sessionDate = parseLocalDateKey(session.date);
      if (!sessionDate) return false;
      return isSameDay(sessionDate, date);
    });
  };
  const isPastSessionDate = (dateKey: string) => {
    const parsed = parseLocalDateKey(dateKey);
    return parsed ? isBefore(parsed, todayStart) : false;
  };

  const weekDays = ["일", "월", "화", "수", "목", "금", "토"];

  const currentMonthSessionCount = expandedSessions.filter((session) =>
    Boolean(parseLocalDateKey(session.date) && isSameMonth(parseLocalDateKey(session.date)!, currentMonth))
  ).length;
  const visibleProgramNames = programs.map((program) => program.name);
  const internalTicketsDepleted = ticketStats.remainingInternal === 0;
  const externalTicketsDepleted = ticketStats.remainingExternal === 0;

  return (
    <div className="min-h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="border-b border-slate-200/80 bg-linear-to-r from-white via-slate-50/80 to-sky-50/60 px-6 py-2 backdrop-blur-sm">
        <div className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">정기 오피스아워</h1>
              <p className="mt-0.5 text-[13px] text-slate-500">
                날짜를 선택한 뒤 신청할 사업과 시간을 바로 선택하세요.
              </p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(320px,1fr)_minmax(240px,0.9fr)_minmax(220px,0.95fr)]">
            <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white px-3 pt-3 pb-2 shadow-xs">
              <div className="absolute top-0 right-0 h-16 w-16 rounded-full bg-sky-100/60 blur-2xl" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                    참여 사업
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-[13px] font-semibold text-slate-900">{programs.length}개</p>
                    <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                      신청 가능 사업
                    </span>
                  </div>
                </div>
              </div>
              {programs.length > 0 ? (
                <div className="relative mt-2 rounded-lg border border-slate-200/80 bg-slate-50/80 px-2.5 py-1.5">
                  <div className="max-h-20 space-y-1 overflow-y-auto pr-1">
                    {visibleProgramNames.map((name, index) => (
                      <div
                        key={name}
                        className="grid grid-cols-[22px_1fr] items-start gap-2 rounded-md border border-slate-200/80 bg-white/90 px-1.5 py-1"
                      >
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-slate-100 text-[10px] font-semibold text-slate-600">
                          {index + 1}
                        </span>
                        <p className="min-w-0 text-[11px] leading-4 text-slate-700">
                          {name}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-2.5 text-xs text-slate-500">참여 중인 사업이 없습니다.</p>
              )}
            </div>

            <div className="w-full rounded-xl border border-slate-200 bg-white px-3 pt-3 pb-2 shadow-xs">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                  티켓 현황
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div
                  className={`rounded-lg border px-2 py-2 ${
                    internalTicketsDepleted ? "border-slate-200 bg-slate-100" : "border-sky-100 bg-sky-50/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      내부
                    </p>
                    {internalTicketsDepleted ? (
                      <span className="whitespace-nowrap rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
                        소진
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex items-end gap-1">
                    <p className="text-sm font-semibold leading-none text-slate-900">
                      {ticketStats.remainingInternal}
                    </p>
                    <span className="text-[10px] font-medium text-slate-400">
                      / {ticketStats.totalInternal}
                    </span>
                  </div>
                  <p className="mt-1 text-[9px] text-slate-500">
                    예약 {ticketStats.reservedInternal} · 완료 {ticketStats.completedInternal}
                  </p>
                </div>

                <div
                  className={`rounded-lg border px-2 py-2 ${
                    externalTicketsDepleted ? "border-slate-200 bg-slate-100" : "border-emerald-100 bg-emerald-50/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      외부
                    </p>
                    {externalTicketsDepleted ? (
                      <span className="whitespace-nowrap rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
                        소진
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex items-end gap-1">
                    <p className="text-sm font-semibold leading-none text-slate-900">
                      {ticketStats.remainingExternal}
                    </p>
                    <span className="text-[10px] font-medium text-slate-400">
                      / {ticketStats.totalExternal}
                    </span>
                  </div>
                  <p className="mt-1 text-[9px] text-slate-500">
                    예약 {ticketStats.reservedExternal} · 완료 {ticketStats.completedExternal}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex h-full w-full flex-col rounded-xl border border-slate-200 bg-white px-3 pt-3 pb-2 shadow-xs">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                예정 일정
              </p>
              <div className="mt-1.5 flex items-end gap-1.5">
                <p className="text-base font-semibold leading-none text-slate-900">
                  {summary.upcomingCount}
                </p>
                <span className="text-xs font-medium text-slate-400">
                  건
                </span>
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                이번 달 {summary.currentMonthCount}건
              </p>
              <div className="mt-2 flex flex-1 flex-col rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  가장 가까운 일정
                </p>
                <p className="mt-1 flex-1 text-xs font-medium leading-5 text-slate-700">
                  {summary.nextScheduleLabel ?? "예정 일정 없음"}
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Main Calendar */}
          <div className="flex-1 px-3 pt-2 pb-2">
            <div className="rounded-lg border bg-white">
              {/* Calendar Header */}
              <div className="border-b px-4 py-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <h2 className="text-[15px] font-semibold text-gray-900">
                      {format(currentMonth, "yyyy년 M월", { locale: ko })}
                    </h2>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCurrentMonth(new Date())}
                      >
                        오늘
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-800">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    이번 달 예약 가능 일정
                    <span className="rounded-full bg-white px-2 py-0.5 text-emerald-900">
                      {currentMonthSessionCount}건
                    </span>
                  </div>
                </div>
              </div>

              {/* Calendar Grid */}
              <div className="p-2">
                <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
                  {/* Week days header */}
                  {weekDays.map((day) => (
                    <div
                      key={day}
                      className="bg-gray-50 text-center py-1.5 text-[11px] font-semibold text-gray-700"
                    >
                      {day}
                    </div>
                  ))}

                  {/* Calendar days */}
                  {calendarDays.map((day, idx) => {
                    const sessions = getOfficeHoursForDate(day);
                    const hasSessions = sessions.length > 0;
                    const hasRequestableSessions = sessions.some((session) => !isPastSessionDate(session.date));
                    const isCurrentMonth = isSameMonth(day, currentMonth);
                    const isSelected = selectedDate && isSameDay(day, selectedDate);
                    const isTodayDate = isToday(day);

                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          if (!hasSessions || !hasRequestableSessions) return;
                          setSelectedDate(day);
                          onSelectOfficeHour(undefined, format(day, "yyyy-MM-dd"));
                        }}
                        className={`
                          bg-white h-[90px] p-1.5 transition-all
                          ${!isCurrentMonth ? "bg-gray-50 text-gray-400" : "text-gray-900"}
                          ${hasSessions ? "cursor-pointer hover:bg-gray-50" : "cursor-default bg-slate-50/50"}
                          ${isSelected ? "ring-2 ring-primary ring-inset" : ""}
                          ${isTodayDate && !isSelected && hasSessions ? "bg-blue-50" : ""}
                          ${hasSessions && !hasRequestableSessions ? "bg-slate-100 text-slate-500" : ""}
                        `}
                      >
                        <div className="mb-1.5 flex items-center justify-between">
                          <span
                            className={`text-xs font-medium ${
                              isTodayDate
                                ? "bg-primary text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]"
                                : isCurrentMonth
                                  ? `inline-flex min-w-6 items-center justify-center px-1 text-[10px] font-semibold ${
                                      hasSessions ? "text-slate-700" : "text-slate-400"
                                    }`
                                  : "inline-flex min-w-6 items-center justify-center px-1 text-[10px] font-semibold text-slate-400"
                            }`}
                          >
                            {format(day, "d")}
                          </span>
                          {sessions.length > 0 && (
                            <Badge
                              variant="outline"
                              className={`h-5 rounded-full px-1.5 text-[10px] font-semibold ${
                                hasRequestableSessions
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                  : "border-slate-200 bg-slate-100 text-slate-600"
                              }`}
                            >
                              {sessions.length}건
                            </Badge>
                          )}
                        </div>
                        <div className="grid h-[60px] grid-rows-3 gap-1">
                          {sessions.slice(0, 2).map((session, sessionIdx) => (
                            <div
                              key={session.id + sessionIdx}
                              data-testid={`regular-calendar-session-${session.id}`}
                              className={`pointer-events-none h-full text-[10px] leading-4 px-1 rounded border-l-2 truncate ${
                                isPastSessionDate(session.date)
                                  ? "border-slate-300 bg-slate-100 text-slate-500"
                                  : "border-primary bg-primary/10"
                              }`}
                            >
                              {session.title}
                            </div>
                          ))}
                          {Array.from({ length: Math.max(0, 2 - sessions.slice(0, 2).length) }).map((_, emptyIdx) => (
                            <div key={`empty-${idx}-${emptyIdx}`} className="h-full" />
                          ))}
                          <div className="h-full text-[10px] leading-4 text-gray-500 pl-1 truncate">
                            {sessions.length > 2 ? `+${sessions.length - 2}개` : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
        </div>
      </div>
    </div>
  );
}
