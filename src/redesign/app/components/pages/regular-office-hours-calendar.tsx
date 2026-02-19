import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar, List, Filter } from "lucide-react";
import { Agenda, RegularOfficeHour } from "@/redesign/app/lib/types";
import { Button } from "@/redesign/app/components/ui/button";
import { Badge } from "@/redesign/app/components/ui/badge";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, isToday, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/redesign/app/components/ui/dropdown-menu";

interface RegularOfficeHoursCalendarProps {
  officeHours: RegularOfficeHour[];
  agendas: Agenda[];
  onSelectOfficeHour: (id: string) => void;
}

type ViewMode = "calendar" | "list";

export function RegularOfficeHoursCalendar({
  officeHours,
  agendas,
  onSelectOfficeHour,
}: RegularOfficeHoursCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const [selectedAgendaIds, setSelectedAgendaIds] = useState<string[]>([]);

  // 캘린더 날짜 생성
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // 필터링된 오피스아워
  const filteredOfficeHours = officeHours.filter((oh) => {
    const agendaMatch =
      selectedAgendaIds.length === 0
      || (oh.agendaIds ?? []).some((agendaId) =>
        selectedAgendaIds.includes(agendaId)
      );
    return agendaMatch;
  });
  const hasSessions = filteredOfficeHours.length > 0;

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

  const selectedAgendaLabel = useMemo(() => {
    if (selectedAgendaIds.length === 0) return "아젠다 전체";
    const names = agendas
      .filter((agenda) => selectedAgendaIds.includes(agenda.id))
      .map((agenda) => agenda.name);
    if (names.length <= 2) return names.join(", ");
    return `${names.slice(0, 2).join(", ")} 외 ${names.length - 2}개`;
  }, [agendas, selectedAgendaIds]);

  function toggleAgendaFilter(agendaId: string, checked: boolean) {
    setSelectedAgendaIds((prev) => {
      if (checked) {
        return [...new Set([...prev, agendaId])];
      }
      return prev.filter((id) => id !== agendaId);
    });
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-8 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">정기 오피스아워</h1>
            <p className="text-sm text-muted-foreground mt-1">
              매주 정해진 시간에 진행되는 오피스아워를 신청하세요
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              컨설턴트는 수락 후 확정됩니다.
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

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                {selectedAgendaLabel}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-72">
              {agendas.map((agenda) => (
                <DropdownMenuCheckboxItem
                  key={agenda.id}
                  checked={selectedAgendaIds.includes(agenda.id)}
                  onCheckedChange={(checked) =>
                    toggleAgendaFilter(agenda.id, Boolean(checked))
                  }
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={agenda.scope === "internal" ? "secondary" : "outline"}
                      className="text-[10px]"
                    >
                      {agenda.scope === "internal" ? "내부" : "외부"}
                    </Badge>
                    <span>{agenda.name}</span>
                  </div>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {!hasSessions ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-lg rounded-xl border bg-white p-8 text-center">
            <h2 className="text-lg font-semibold text-gray-900">표시할 정기 오피스아워가 없습니다</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              사업 기간 형식(YYYY-MM-DD 또는 25.12.22)을 확인하고, 기간이 오늘(2026-02-11) 기준 유효한지 확인해주세요.
              요일은 화/목 고정이며, 아젠다 필터가 선택된 경우 해당 아젠다에 연결된 사업만 표시됩니다.
            </p>
          </div>
        </div>
      ) : viewMode === "calendar" ? (
        <div className="flex-1 flex overflow-hidden">
          {/* Main Calendar */}
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="bg-white rounded-lg border">
              {/* Calendar Header */}
              <div className="border-b px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <h2 className="text-lg font-semibold text-gray-900">
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
                  <div className="text-sm text-muted-foreground">
                    총 {filteredOfficeHours.length}개 세션
                  </div>
                </div>
              </div>

              {/* Calendar Grid */}
              <div className="p-4">
                <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
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
                    const sessions = getOfficeHoursForDate(day);
                    const isCurrentMonth = isSameMonth(day, currentMonth);
                    const isSelected = selectedDate && isSameDay(day, selectedDate);
                    const isTodayDate = isToday(day);

                    return (
                      <div
                        key={idx}
                        onClick={() => setSelectedDate(day)}
                        className={`
                          bg-white min-h-[120px] p-2 cursor-pointer transition-all
                          ${!isCurrentMonth ? "bg-gray-50 text-gray-400" : "text-gray-900"}
                          ${isSelected ? "ring-2 ring-primary ring-inset" : ""}
                          ${isTodayDate && !isSelected ? "bg-blue-50" : ""}
                          hover:bg-gray-50
                        `}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className={`text-sm font-medium ${
                              isTodayDate ? "bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center text-xs" : ""
                            }`}
                          >
                            {format(day, "d")}
                          </span>
                          {sessions.length > 0 && (
                            <Badge variant="secondary" className="text-xs h-5 px-1.5">
                              {sessions.length}
                            </Badge>
                          )}
                        </div>
                        <div className="space-y-1">
                          {sessions.slice(0, 3).map((session, sessionIdx) => (
                            <div
                              key={session.id + sessionIdx}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectOfficeHour(session.id);
                              }}
                              className="text-xs p-1.5 rounded bg-primary/10 hover:bg-primary/20 transition-colors border-l-2 border-primary"
                            >
                            <div className="font-medium truncate">{session.title}</div>
                            <div className="text-gray-600 truncate">{session.description}</div>
                            </div>
                          ))}
                          {sessions.length > 3 && (
                            <div className="text-xs text-gray-500 pl-1.5">
                              +{sessions.length - 3}개
                            </div>
                          )}
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
            <div className="w-96 bg-white border-l p-6 overflow-y-auto">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">
                  {format(selectedDate, "M월 d일 (E)", { locale: ko })}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {getOfficeHoursForDate(selectedDate).length > 0
                    ? `${getOfficeHoursForDate(selectedDate).length}개의 세션`
                    : "예정된 세션이 없습니다"}
                </p>
              </div>

              <div className="space-y-3">
                {getOfficeHoursForDate(selectedDate).map((session) => (
                  <div
                    key={session.id + session.date}
                    onClick={() => onSelectOfficeHour(session.id)}
                    className="border rounded-lg p-4 hover:shadow-md cursor-pointer transition-all group"
                  >
                    <div className="space-y-2">
                      <h3 className="font-medium text-gray-900">{session.title}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">
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
            {Object.entries(sessionsByDay).map(([day, sessions]) => (
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
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
