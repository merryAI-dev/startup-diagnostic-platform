import { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar, List } from "lucide-react";
import { RegularOfficeHour } from "@/redesign/app/lib/types";
import { Button } from "@/redesign/app/components/ui/button";
import { Badge } from "@/redesign/app/components/ui/badge";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, isToday, parseISO, addDays, isBefore, startOfDay } from "date-fns";
import { ko } from "date-fns/locale";

interface RegularOfficeHoursCalendarProps {
  officeHours: RegularOfficeHour[];
  onSelectOfficeHour: (id: string) => void;
}

type ViewMode = "calendar" | "list";

export function RegularOfficeHoursCalendar({
  officeHours,
  onSelectOfficeHour,
}: RegularOfficeHoursCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("calendar");

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

  const todayStart = startOfDay(new Date());
  // 오늘 이전 날짜는 캘린더 진입 단계에서 제외
  const filteredOfficeHours = officeHours
    .map((officeHour) => ({
      ...officeHour,
      availableDates: (officeHour.availableDates ?? []).filter(
        (date) => !isBefore(parseISO(date), todayStart)
      ),
    }))
    .filter((officeHour) => officeHour.availableDates.length > 0);

  // 날짜별로 오피스아워를 펼쳐서 배열로 만들기
  const expandedSessions = filteredOfficeHours.flatMap(oh => 
    oh.availableDates.map(date => ({
      ...oh,
      date: date,
    }))
  );

  // 특정 날짜의 오피스아워
  const getOfficeHoursForDate = (date: Date) => {
    return expandedSessions.filter((session) => {
      const sessionDate = parseISO(session.date);
      return isSameDay(sessionDate, date);
    });
  };

  const weekDays = ["일", "월", "화", "수", "목", "금", "토"];

  // 요일별 그룹핑
  const sessionsByDay = expandedSessions.reduce((acc, session) => {
    const dayOfWeek = format(parseISO(session.date), "E", { locale: ko });
    if (!acc[dayOfWeek]) acc[dayOfWeek] = [];
    acc[dayOfWeek].push(session);
    return acc;
  }, {} as Record<string, typeof expandedSessions>);
  const currentMonthSessionCount = expandedSessions.filter((session) =>
    isSameMonth(parseISO(session.date), currentMonth)
  ).length;

  return (
    <div className="min-h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="border-b border-slate-200/80 bg-white/80 px-8 py-4 backdrop-blur-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">정기 오피스아워</h1>
            <p className="mt-1 text-sm text-slate-500">
              매주 정해진 시간에 진행되는 오피스아워를 신청하세요
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={viewMode === "calendar" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("calendar")}
            >
              <Calendar className="w-4 h-4 mr-2" />
              캘린더
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("list")}
            >
              <List className="w-4 h-4 mr-2" />
              리스트
            </Button>
          </div>
        </div>

      </div>

      {viewMode === "calendar" ? (
        <div className="flex-1 flex min-h-0">
          {/* Main Calendar */}
          <div className="flex-1 px-4 pt-4 pb-6 overflow-y-auto">
            <div className="bg-white rounded-lg border">
              {/* Calendar Header */}
              <div className="border-b px-5 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <h2 className="text-base font-semibold text-gray-900">
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
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    이번 달 예약 가능 일정
                    <span className="rounded-full bg-white px-2 py-0.5 text-emerald-900">
                      {currentMonthSessionCount}건
                    </span>
                  </div>
                </div>
              </div>

              {/* Calendar Grid */}
              <div className="p-3">
                <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
                  {/* Week days header */}
                  {weekDays.map((day) => (
                    <div
                      key={day}
                      className="bg-gray-50 text-center py-2 text-xs font-semibold text-gray-700"
                    >
                      {day}
                    </div>
                  ))}

                  {/* Calendar days */}
                  {calendarDays.map((day, idx) => {
                    const sessions = getOfficeHoursForDate(day);
                    const isCurrentMonth = isSameMonth(day, currentMonth);
                    const isSelected = selectedDate && isSameDay(day, selectedDate);
                    const isTodayDate = isToday(day);

                    return (
                      <div
                        key={idx}
                        onClick={() => setSelectedDate(day)}
                        className={`
                          bg-white h-[104px] p-1.5 cursor-pointer transition-all
                          ${!isCurrentMonth ? "bg-gray-50 text-gray-400" : "text-gray-900"}
                          ${isSelected ? "ring-2 ring-primary ring-inset" : ""}
                          ${isTodayDate && !isSelected ? "bg-blue-50" : ""}
                          hover:bg-gray-50
                        `}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className={`text-xs font-medium ${
                              isTodayDate
                                ? "bg-primary text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]"
                                : isCurrentMonth
                                  ? "inline-flex min-w-6 items-center justify-center px-1 text-[10px] font-semibold text-slate-700"
                                  : "inline-flex min-w-6 items-center justify-center px-1 text-[10px] font-semibold text-slate-400"
                            }`}
                          >
                            {format(day, "d")}
                          </span>
                          {sessions.length > 0 && (
                            <Badge
                              variant="outline"
                              className="h-5 rounded-full border-emerald-200 bg-emerald-50 px-1.5 text-[10px] font-semibold text-emerald-800"
                            >
                              {sessions.length}건
                            </Badge>
                          )}
                        </div>
                        <div className="h-[70px] grid grid-rows-3 gap-1">
                          {sessions.slice(0, 2).map((session, sessionIdx) => (
                            <div
                              key={session.id + sessionIdx}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectOfficeHour(session.id);
                              }}
                              className="h-full text-[10px] leading-4 px-1 rounded bg-primary/10 hover:bg-primary/20 transition-colors border-l-2 border-primary truncate"
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

          {/* Right Sidebar - Selected Date Details */}
          {selectedDate && (
            <div className="w-96 bg-white border-l p-5 overflow-y-auto">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-gray-900 mb-1">
                  {format(selectedDate, "M월 d일 (E)", { locale: ko })}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {getOfficeHoursForDate(selectedDate).length > 0
                    ? `${getOfficeHoursForDate(selectedDate).length}개의 세션`
                    : "예정된 세션이 없습니다"}
                </p>
              </div>

              <div className="space-y-2">
                {getOfficeHoursForDate(selectedDate).map((session) => (
                  <div
                    key={session.id + session.date}
                    onClick={() => onSelectOfficeHour(session.id)}
                    className="group relative overflow-hidden rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2.5 hover:border-primary/40 hover:bg-white hover:shadow-sm cursor-pointer transition-all"
                  >
                    <div className="absolute left-0 top-0 h-full w-1 bg-primary/20 group-hover:bg-primary/50 transition-colors" />
                    <div className="pl-1 space-y-1">
                      <h3 className="text-[13px] font-semibold tracking-tight text-gray-900 line-clamp-1">
                        {session.title}
                      </h3>
                      <p className="text-[11px] leading-4 text-muted-foreground line-clamp-1">
                        {session.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* List View */
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-5xl mx-auto">
            {/* Group by Day of Week */}
            {Object.entries(sessionsByDay).length === 0 ? (
              <div className="rounded-lg border bg-white p-6 text-sm text-muted-foreground">
                표시할 정기 오피스아워가 없습니다.
              </div>
            ) : (
              Object.entries(sessionsByDay).map(([day, sessions]) => (
                <div key={day} className="mb-8">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-semibold">
                      {day}
                    </div>
                    {day}요일
                    <Badge variant="secondary" className="ml-2">
                      {sessions.length}
                    </Badge>
                  </h2>
                  <div className="grid grid-cols-2 gap-4">
                    {sessions.map((session) => (
                      <div
                        key={session.id + session.date}
                        onClick={() => onSelectOfficeHour(session.id)}
                        className="bg-white border rounded-lg p-5 hover:shadow-lg cursor-pointer transition-all group"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h3 className="font-semibold text-gray-900">{session.title}</h3>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {session.description}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {format(parseISO(session.date), "M월 d일", { locale: ko })}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
