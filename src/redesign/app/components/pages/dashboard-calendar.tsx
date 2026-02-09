import { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, FileText, Target } from "lucide-react";
import { Application, User, Program } from "../../lib/types";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { StatusChip } from "../status-chip";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, isToday } from "date-fns";
import { ko } from "date-fns/locale";

interface DashboardCalendarProps {
  applications: Application[];
  user: User;
  programs: Program[];
  onNavigate: (page: string, id?: string) => void;
}

export function DashboardCalendar({ applications, user, programs, onNavigate }: DashboardCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());

  // 사용자의 프로그램만 필터링
  const userPrograms = programs.filter((p) => user.programs?.includes(p.id) || false);

  // 확정된 일정들
  const confirmedApplications = applications.filter(
    (app) => app.status === "confirmed" && app.scheduledDate
  );

  // 대기중인 신청
  const pendingApplications = applications.filter(
    (app) => app.status === "pending" || app.status === "review"
  );

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
      default:
        return "#6b7280"; // gray-500
    }
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
            <Button
              onClick={() => onNavigate("irregular")}
            >
              비정기 오피스아워 신청
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Program Quotas */}
        <div className="w-80 bg-white border-r p-6 overflow-y-auto">
          <h2 className="font-semibold text-gray-900 mb-4">사업별 신청 현황</h2>
          <div className="space-y-4">
            {userPrograms.map((program) => {
              const remainingApplications = program.maxApplications - program.usedApplications;
              const usagePercentage = Math.round(
                (program.usedApplications / program.maxApplications) * 100
              );

              return (
                <div
                  key={program.id}
                  className="border rounded-lg p-4 hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: program.color }}
                    />
                    <h3 className="font-semibold text-sm">{program.name}</h3>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">신청 횟수</span>
                      <span className="font-semibold">
                        {program.usedApplications} / {program.maxApplications}회
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">남은 횟수</span>
                      <span className={`font-semibold ${remainingApplications <= 3 ? 'text-red-600' : 'text-gray-900'}`}>
                        {remainingApplications}회
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-2">
                      <div
                        className="h-full transition-all"
                        style={{
                          width: `${usagePercentage}%`,
                          backgroundColor: program.color,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pending Applications */}
          {pendingApplications.length > 0 && (
            <div className="mt-8">
              <h2 className="font-semibold text-gray-900 mb-4">대기중인 신청</h2>
              <div className="space-y-2">
                {pendingApplications.slice(0, 5).map((app) => (
                  <div
                    key={app.id}
                    onClick={() => onNavigate("application", app.id)}
                    className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-sm font-medium line-clamp-1">{app.agenda}</p>
                      <StatusChip status={app.status} size="sm" />
                    </div>
                    <p className="text-xs text-muted-foreground">{app.consultant}</p>
                  </div>
                ))}
                {pendingApplications.length > 5 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => onNavigate("history")}
                  >
                    전체 보기 ({pendingApplications.length})
                  </Button>
                )}
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
                            <div className="text-gray-600 truncate">{event.agenda}</div>
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
                  <h3 className="font-medium text-gray-900 mb-1">{event.agenda}</h3>
                  <p className="text-sm text-muted-foreground mb-2">{event.consultant}</p>
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
              <h2 className="font-semibold text-gray-900 mb-4">다가오는 일정</h2>
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
                    <h3 className="font-medium text-sm text-gray-900 mb-1">{event.agenda}</h3>
                    <p className="text-xs text-muted-foreground">{event.consultant}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}