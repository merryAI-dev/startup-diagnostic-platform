import { useEffect, useMemo, useState } from "react";
import { Calendar, Clock, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/redesign/app/components/ui/card";
import { Button } from "@/redesign/app/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/redesign/app/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/redesign/app/components/ui/table";
import { Badge } from "@/redesign/app/components/ui/badge";
import { DateRangePicker } from "@/redesign/app/components/ui/date-range-picker";
import { PaginationControls } from "@/redesign/app/components/ui/pagination-controls";
import { StatusChip } from "@/redesign/app/components/status-chip";
import { Agenda, Application, ApplicationStatus, ConsultantAvailability, Program } from "@/redesign/app/lib/types";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { AdminApplicationDetailModal } from "@/redesign/app/components/pages/admin-application-detail-modal";
import type { DateRange } from "react-day-picker";
import { parseLocalDateKey } from "@/redesign/app/lib/date-keys";
import { getPendingConsultantIds, isApplicationTargetingConsultant } from "@/redesign/app/lib/application-availability";

interface AdminApplicationsProps {
  applications: Application[];
  agendas?: Agenda[];
  programs?: Program[];
  onUpdateStatus: (id: string, status: ApplicationStatus) => void;
  onUpdateApplication: (id: string, data: Partial<Application>) => void;
  onConfirmApplication?: (id: string) => void;
  onRejectApplication?: (id: string, reason: string) => void;
  onRequestApplication?: (id: string) => void;
  currentUserRole?: string;
  currentConsultantId?: string | null;
  currentConsultantName?: string | null;
  currentConsultantAgendaIds?: string[];
  currentConsultantAvailability?: ConsultantAvailability[];
}

export function AdminApplications({
  applications,
  agendas = [],
  programs = [],
  onUpdateStatus,
  onUpdateApplication,
  onConfirmApplication,
  onRejectApplication,
  onRequestApplication,
  currentUserRole,
  currentConsultantId,
  currentConsultantName,
  currentConsultantAgendaIds = [],
  currentConsultantAvailability = [],
}: AdminApplicationsProps) {
  const PAGE_SIZE = 10;
  const pageTitleClassName = "text-2xl font-semibold text-slate-900";
  const pageDescriptionClassName = "mt-1 text-sm text-slate-500";
  const [programFilter, setProgramFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [page, setPage] = useState(1);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const isConsultantUser = currentUserRole === "consultant";
  const pageContainerClassName = isConsultantUser
    ? "mx-auto w-full max-w-[1600px]"
    : "mx-auto w-full max-w-[1600px]";

  const parseDateValue = (value?: string | null) => {
    if (!value) return null;
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return null;
    const next = new Date(year, month - 1, day);
    return Number.isNaN(next.getTime()) ? null : next;
  };

  const isDateInRange = (date: Date | null) => {
    if (!dateRange?.from && !dateRange?.to) return true;
    if (!date) return false;

    const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const start = dateRange.from
      ? new Date(dateRange.from.getFullYear(), dateRange.from.getMonth(), dateRange.from.getDate())
      : null;
    const end = dateRange.to
      ? new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate())
      : start;

    if (start && normalized < start) return false;
    if (end && normalized > end) return false;
    return true;
  };

  const doesPeriodOverlapRange = (startValue?: string | null, endValue?: string | null) => {
    if (!dateRange?.from && !dateRange?.to) return true;

    const start = parseDateValue(startValue);
    const end = parseDateValue(endValue) ?? start;
    const rangeStart = dateRange?.from
      ? new Date(dateRange.from.getFullYear(), dateRange.from.getMonth(), dateRange.from.getDate())
      : null;
    const rangeEnd = dateRange?.to
      ? new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate())
      : rangeStart;

    if (!start || !end) return false;
    if (!rangeStart && !rangeEnd) return true;

    const normalizedStart = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const normalizedEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    const effectiveRangeStart = rangeStart ?? rangeEnd!;
    const effectiveRangeEnd = rangeEnd ?? rangeStart!;

    return normalizedStart <= effectiveRangeEnd && normalizedEnd >= effectiveRangeStart;
  };

  const consultantAgendaNames = useMemo(() => {
    if (currentConsultantAgendaIds.length === 0) return new Set<string>();
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
  }, [agendas, currentConsultantAgendaIds]);

  const normalizeConsultantDisplayName = (value?: string | null) =>
    (value ?? "")
      .replace(/\s*컨설턴트\s*$/u, "")
      .trim()
      .toLowerCase();

  const normalizeTimeKey = (value?: string | null) => {
    if (!value) return "";
    const [hourRaw, minuteRaw] = value.trim().split(":");
    const hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return value.trim();
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  };

  const isAssignedToCurrentConsultant = (app: Application) => {
    if (!isConsultantUser) return false;
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
    if (!isConsultantUser) return true;
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
    if (!isConsultantUser) return false;
    if (!targetApp.scheduledDate || !targetApp.scheduledTime) return false;
    const targetTime = normalizeTimeKey(targetApp.scheduledTime);
    return applications.some((app) => {
      if (app.id === targetApp.id) return false;
      if (!isAssignedToCurrentConsultant(app)) return false;
      if (
        app.status !== "pending" &&
        app.status !== "review" &&
        app.status !== "confirmed" &&
        app.status !== "completed"
      ) {
        return false;
      }
      if (!app.scheduledDate || !app.scheduledTime) return false;
      return (
        app.scheduledDate === targetApp.scheduledDate &&
        normalizeTimeKey(app.scheduledTime) === targetTime
      );
    });
  };

  const matchesConsultantAgenda = (app: Application) => {
    if (!isConsultantUser) return true;
    if (currentConsultantAgendaIds.length === 0 && consultantAgendaNames.size === 0) {
      return false;
    }
    const agendaIdOk = app.agendaId ? currentConsultantAgendaIds.includes(app.agendaId) : false;
    const agendaNameOk = app.agenda ? consultantAgendaNames.has(app.agenda) : false;
    return agendaIdOk || agendaNameOk;
  };

  const programNameById = useMemo(
    () => new Map(programs.map((program) => [program.id, program.name])),
    [programs],
  );

  const getApplicationProgramLabel = (application: Application) => {
    const mappedProgramName = application.programId ? programNameById.get(application.programId) : null;
    if (mappedProgramName) return mappedProgramName;

    const title = application.officeHourTitle?.trim();
    if (!title) return "-";

    return title
      .replace(/\s*정기 오피스아워$/u, "")
      .replace(/^비정기 오피스아워\s*-\s*/u, "")
      .replace(/^비정기 오피스아워\s*/u, "")
      .trim() || "-";
  };

  const programFilterOptions = useMemo(() => {
    return Array.from(
      new Set(
        applications
          .map((application) => getApplicationProgramLabel(application))
          .filter((name) => name && name !== "-"),
      ),
    ).sort((a, b) => a.localeCompare(b, "ko"));
  }, [applications, programNameById]);

  // Filter applications
  const filteredApplications = applications.filter((app) => {
    const passesConsultantScope = !isConsultantUser || (() => {
      if (isAssignedToCurrentConsultant(app)) {
        return true;
      }

      const isPendingLike = app.status === "pending" || app.status === "review";
      const pendingConsultantIds = getPendingConsultantIds(app);
      const isUnassigned =
        !app.consultantId &&
        pendingConsultantIds.length === 0 &&
        (!app.consultant || app.consultant === "담당자 배정 중");

      if (!isPendingLike || !isUnassigned) {
        return false;
      }

      return (
        matchesConsultantAgenda(app) &&
        isCurrentConsultantAvailableAt(app) &&
        !hasCurrentConsultantConflict(app)
      );
    })();

    const applicationProgramLabel = getApplicationProgramLabel(app);
    const matchesProgram = programFilter === "all" || applicationProgramLabel === programFilter;

    const normalizedStatus = app.status === "review" ? "pending" : app.status;
    const matchesStatus = statusFilter === "all" || normalizedStatus === statusFilter;
    const matchesDate =
      app.scheduledDate
        ? isDateInRange(parseDateValue(app.scheduledDate))
        : doesPeriodOverlapRange(app.periodFrom, app.periodTo);

    return passesConsultantScope && matchesProgram && matchesStatus && matchesDate;
  });

  // Sort by most recent
  const sortedApplications = [...filteredApplications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const paginatedApplications = useMemo(() => {
    const startIndex = (page - 1) * PAGE_SIZE;
    return sortedApplications.slice(startIndex, startIndex + PAGE_SIZE);
  }, [page, sortedApplications]);

  useEffect(() => {
    setPage(1);
  }, [applications.length, dateRange?.from, dateRange?.to, programFilter, statusFilter]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(sortedApplications.length / PAGE_SIZE));
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, sortedApplications.length]);

  const selectedApplication = useMemo(
    () => applications.find((application) => application.id === selectedApplicationId) ?? null,
    [applications, selectedApplicationId],
  );

  const handleStatusChange = (id: string, newStatus: ApplicationStatus) => {
    onUpdateStatus(id, newStatus);
    if (statusFilter !== "all" && statusFilter !== newStatus) {
      setStatusFilter("all");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <div className="shrink-0 border-b bg-white px-6 py-5">
        <div className={pageContainerClassName}>
          <h1 className={pageTitleClassName}>신청 관리</h1>
          <p className={pageDescriptionClassName}>
            {isConsultantUser
              ? "담당 사업의 오피스아워 신청을 확인하고 상태를 처리합니다"
              : "전체 오피스아워 신청을 관리하고 상태를 변경할 수 있습니다"}
          </p>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-6 pb-6 pt-5">
      <div className={`${pageContainerClassName} flex min-h-0 flex-1 flex-col`}>
      <Card className="mt-1 flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <CardContent className="shrink-0 border-b bg-white p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Select value={programFilter} onValueChange={setProgramFilter}>
                <SelectTrigger className="w-full sm:w-[260px]">
                  <SelectValue placeholder="신청사업 필터" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 사업</SelectItem>
                  {programFilterOptions.map((programName) => (
                    <SelectItem key={programName} value={programName}>
                      {programName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DateRangePicker
                value={dateRange}
                onChange={setDateRange}
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="상태 필터" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 상태</SelectItem>
                  <SelectItem value="pending">수락 대기</SelectItem>
                  <SelectItem value="confirmed">확정</SelectItem>
                  <SelectItem value="rejected">거절됨</SelectItem>
                  <SelectItem value="cancelled">취소</SelectItem>
                  <SelectItem value="completed">완료</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Table>
            <TableHeader className="[&_tr]:sticky [&_tr]:top-0 [&_tr]:z-10 [&_tr]:bg-white">
              <TableRow className="hover:bg-white">
                <TableHead className="bg-white">상태</TableHead>
                <TableHead className="bg-white">유형</TableHead>
                <TableHead className="bg-white">신청 기업</TableHead>
                <TableHead className="bg-white">신청 사업</TableHead>
                <TableHead className="bg-white">아젠다</TableHead>
                <TableHead className="bg-white">컨설턴트</TableHead>
                <TableHead className="bg-white">일정</TableHead>
                <TableHead className="bg-white text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedApplications.length > 0 ? (
                paginatedApplications.map((app) => (
                  <TableRow key={app.id} className="cursor-pointer hover:bg-accent">
                    <TableCell>
                      <StatusChip status={app.status} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {app.type === "regular" ? "정기" : "비정기"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium">
                        {app.companyName || "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-xs">
                        <p className="text-sm font-medium truncate">{getApplicationProgramLabel(app)}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{app.agenda}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {app.consultant?.trim() || "담당자 배정 중"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {app.scheduledDate ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-xs">
                            <Calendar className="w-3 h-3" />
                            <span>{format(parseLocalDateKey(app.scheduledDate)!, "M/d (E)", { locale: ko })}</span>
                          </div>
                          {app.scheduledTime && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              <span>{app.scheduledTime}</span>
                            </div>
                          )}
                        </div>
                      ) : app.periodFrom ? (
                        <div className="text-xs text-muted-foreground">
                          {format(parseLocalDateKey(app.periodFrom)!, "M/d", { locale: ko })} ~{" "}
                          {format(parseLocalDateKey(app.periodTo!)!, "M/d", { locale: ko })}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedApplicationId(app.id)}
                        >
                          상세보기
                        </Button>
                      </div>
                    </TableCell>
                </TableRow>
              ))
            ) : (
                <TableRow>
                  <TableCell colSpan={8} className="h-[420px] p-0">
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
                      <Search className="w-12 h-12 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        {programFilter !== "all" || statusFilter !== "all" || dateRange?.from || dateRange?.to
                          ? "검색 결과가 없습니다"
                          : "신청 내역이 없습니다"}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="shrink-0 border-t bg-white px-4 py-3">
          <PaginationControls
            page={page}
            pageSize={PAGE_SIZE}
            totalItems={sortedApplications.length}
            onPageChange={setPage}
            alwaysShow
          />
        </div>
      </Card>
      </div>
      </div>

      {/* Detail Modal */}
      {selectedApplication && (
        <AdminApplicationDetailModal
          application={selectedApplication}
          onClose={() => setSelectedApplicationId(null)}
          onUpdateStatus={handleStatusChange}
          onUpdateApplication={onUpdateApplication}
          onConfirmApplication={onConfirmApplication}
          onRejectApplication={onRejectApplication}
          onRequestApplication={onRequestApplication}
          readOnly={true}
          allowStatusActions={isConsultantUser}
          currentConsultantName={currentConsultantName}
        />
      )}
    </div>
  );
}
