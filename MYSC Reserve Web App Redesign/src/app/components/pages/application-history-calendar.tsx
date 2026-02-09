import { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, LayoutGrid, List, Filter, Search } from "lucide-react";
import { Application } from "../../lib/types";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { StatusChip } from "../status-chip";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, isToday } from "date-fns";
import { ko } from "date-fns/locale";

interface ApplicationHistoryCalendarProps {
  applications: Application[];
  onNavigate: (page: string, id?: string) => void;
}

type ViewMode = "calendar" | "timeline" | "list";

export function ApplicationHistoryCalendar({ applications, onNavigate }: ApplicationHistoryCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("timeline");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // 캘린더 날짜 생성
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const weekDays = ["일", "월", "화", "수", "목", "금", "토"];

  // 필터링
  const filteredApplications = applications.filter(app => {
    const matchStatus = filterStatus === "all" || app.status === filterStatus;
    const matchSearch = searchQuery === "" || 
      app.agenda.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.consultant.toLowerCase().includes(searchQuery.toLowerCase());
    return matchStatus && matchSearch;
  });

  // 날짜별 신청
  const getApplicationsForDate = (date: Date) => {
    return filteredApplications.filter((app) => {
      if (!app.scheduledDate) return false;
      return isSameDay(new Date(app.scheduledDate), date);
    });
  };

  // 타임라인용 월별 그룹핑
  const applicationsByMonth = filteredApplications.reduce((acc, app) => {
    if (!app.scheduledDate) return acc;
    const monthKey = format(new Date(app.scheduledDate), "yyyy-MM");
    if (!acc[monthKey]) acc[monthKey] = [];
    acc[monthKey].push(app);
    return acc;
  }, {} as Record<string, Application[]>);

  const sortedMonths = Object.keys(applicationsByMonth).sort().reverse();

  const statusOptions = [
    { value: "all", label: "전체" },
    { value: "pending", label: "대기중" },
    { value: "review", label: "검토중" },
    { value: "confirmed", label: "확정" },
    { value: "completed", label: "완료" },
    { value: "cancelled", label: "취소" },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "#3b82f6";
      case "completed":
        return "#10b981";
      case "pending":
        return "#eab308";
      case "review":
        return "#f97316";
      case "cancelled":
        return "#ef4444";
      default:
        return "#6b7280";
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-8 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">신청 내역</h1>
            <p className="text-sm text-muted-foreground mt-1">
              모든 오피스아워 신청 기록을 확인하세요
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={viewMode === "timeline" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("timeline")}
            >
              <List className="w-4 h-4 mr-2" />
              타임라인
            </Button>
            <Button
              variant={viewMode === "calendar" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("calendar")}
            >
              <CalendarIcon className="w-4 h-4 mr-2" />
              캘린더
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("list")}
            >
              <LayoutGrid className="w-4 h-4 mr-2" />
              그리드
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="주제, 컨설턴트 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            {statusOptions.map((option) => (
              <Button
                key={option.value}
                variant={filterStatus === option.value ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Timeline View */}
      {viewMode === "timeline" && (
        <div className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto">
            {sortedMonths.map((monthKey) => {
              const apps = applicationsByMonth[monthKey];
              const monthDate = new Date(monthKey + "-01");
              
              return (
                <div key={monthKey} className="mb-8">
                  <div className="flex items-center gap-3 mb-4 sticky top-0 bg-gray-50 py-2 z-10">
                    <h2 className="text-lg font-semibold text-gray-900">
                      {format(monthDate, "yyyy년 M월", { locale: ko })}
                    </h2>
                    <Badge variant="secondary">{apps.length}건</Badge>
                  </div>
                  
                  <div className="space-y-3">
                    {apps
                      .sort((a, b) => {
                        const dateA = a.scheduledDate ? new Date(a.scheduledDate).getTime() : 0;
                        const dateB = b.scheduledDate ? new Date(b.scheduledDate).getTime() : 0;
                        return dateB - dateA;
                      })
                      .map((app, idx) => {
                        const statusColor = getStatusColor(app.status);
                        return (
                          <div
                            key={app.id}
                            onClick={() => onNavigate("application", app.id)}
                            className="bg-white border rounded-lg p-5 hover:shadow-lg cursor-pointer transition-all group relative"
                            style={{ borderLeft: `4px solid ${statusColor}` }}
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <h3 className="font-semibold text-gray-900">{app.agenda}</h3>
                                  <StatusChip status={app.status} size="sm" />
                                </div>
                                <p className="text-sm text-muted-foreground">{app.consultant}</p>
                              </div>
                              <div className="text-right">
                                {app.scheduledDate && (
                                  <>
                                    <div className="text-sm font-medium text-gray-900">
                                      {format(new Date(app.scheduledDate), "M월 d일 (E)", { locale: ko })}
                                    </div>
                                    {app.scheduledTime && (
                                      <div className="text-sm text-muted-foreground">{app.scheduledTime}</div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-3 text-sm">
                              <Badge variant="outline">
                                {app.sessionFormat === "online" ? "온라인" : "오프라인"}
                              </Badge>
                              {app.duration && (
                                <Badge variant="outline">{app.duration}시간</Badge>
                              )}
                              <span className="text-muted-foreground">
                                신청일: {format(new Date(app.createdAt), "yyyy.MM.dd")}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              );
            })}
            
            {filteredApplications.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">신청 내역이 없습니다</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Calendar View */}
      {viewMode === "calendar" && (
        <div className="flex-1 flex overflow-hidden">
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
                </div>
              </div>

              {/* Calendar Grid */}
              <div className="p-4">
                <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
                  {weekDays.map((day) => (
                    <div
                      key={day}
                      className="bg-gray-50 text-center py-3 text-sm font-semibold text-gray-700"
                    >
                      {day}
                    </div>
                  ))}

                  {calendarDays.map((day, idx) => {
                    const apps = getApplicationsForDate(day);
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
                          {apps.length > 0 && (
                            <Badge variant="secondary" className="text-xs h-5 px-1.5">
                              {apps.length}
                            </Badge>
                          )}
                        </div>
                        <div className="space-y-1">
                          {apps.slice(0, 2).map((app) => {
                            const statusColor = getStatusColor(app.status);
                            return (
                              <div
                                key={app.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onNavigate("application", app.id);
                                }}
                                className="text-xs p-1.5 rounded hover:opacity-80 transition-opacity"
                                style={{
                                  backgroundColor: `${statusColor}15`,
                                  borderLeft: `3px solid ${statusColor}`,
                                }}
                              >
                                <div className="font-medium truncate">{app.scheduledTime || "시간 미정"}</div>
                                <div className="text-gray-600 truncate">{app.agenda}</div>
                              </div>
                            );
                          })}
                          {apps.length > 2 && (
                            <div className="text-xs text-gray-500 pl-1.5">
                              +{apps.length - 2}개
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

          {/* Right Sidebar */}
          {selectedDate && (
            <div className="w-96 bg-white border-l p-6 overflow-y-auto">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">
                  {format(selectedDate, "M월 d일 (E)", { locale: ko })}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {getApplicationsForDate(selectedDate).length > 0
                    ? `${getApplicationsForDate(selectedDate).length}건의 신청`
                    : "신청 내역이 없습니다"}
                </p>
              </div>

              <div className="space-y-3">
                {getApplicationsForDate(selectedDate).map((app) => (
                  <div
                    key={app.id}
                    onClick={() => onNavigate("application", app.id)}
                    className="border rounded-lg p-4 hover:shadow-md cursor-pointer transition-all"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <StatusChip status={app.status} size="sm" />
                      <span className="text-sm font-medium text-gray-900">{app.scheduledTime}</span>
                    </div>
                    <h3 className="font-medium text-gray-900 mb-1">{app.agenda}</h3>
                    <p className="text-sm text-muted-foreground mb-2">{app.consultant}</p>
                    <div className="flex gap-2 text-xs">
                      <Badge variant="outline">
                        {app.sessionFormat === "online" ? "온라인" : "오프라인"}
                      </Badge>
                      {app.duration && (
                        <Badge variant="outline">{app.duration}시간</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Grid View */}
      {viewMode === "list" && (
        <div className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-3 gap-4">
              {filteredApplications.map((app) => {
                const statusColor = getStatusColor(app.status);
                return (
                  <div
                    key={app.id}
                    onClick={() => onNavigate("application", app.id)}
                    className="bg-white border rounded-lg p-5 hover:shadow-lg cursor-pointer transition-all"
                    style={{ borderTop: `4px solid ${statusColor}` }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <StatusChip status={app.status} size="sm" />
                      {app.scheduledDate && (
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(app.scheduledDate), "M/d")}
                        </div>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">{app.agenda}</h3>
                    <p className="text-sm text-muted-foreground mb-3">{app.consultant}</p>
                    <div className="flex gap-2 text-xs">
                      <Badge variant="outline">
                        {app.sessionFormat === "online" ? "온라인" : "오프라인"}
                      </Badge>
                      {app.duration && (
                        <Badge variant="outline">{app.duration}시간</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            {filteredApplications.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">신청 내역이 없습니다</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
