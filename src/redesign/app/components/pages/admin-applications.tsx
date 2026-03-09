import { useMemo, useState } from "react";
import { Calendar, Clock, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/redesign/app/components/ui/card";
import { Button } from "@/redesign/app/components/ui/button";
import { Input } from "@/redesign/app/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/redesign/app/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/redesign/app/components/ui/table";
import { Badge } from "@/redesign/app/components/ui/badge";
import { StatusChip } from "@/redesign/app/components/status-chip";
import { Agenda, Application, ApplicationStatus } from "@/redesign/app/lib/types";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { AdminApplicationDetailModal } from "@/redesign/app/components/pages/admin-application-detail-modal";

interface AdminApplicationsProps {
  applications: Application[];
  agendas?: Agenda[];
  onUpdateStatus: (id: string, status: ApplicationStatus) => void;
  onUpdateApplication: (id: string, data: Partial<Application>) => void;
  onConfirmApplication?: (id: string) => void;
  onRejectApplication?: (id: string, reason: string) => void;
  onRequestApplication?: (id: string) => void;
  currentUserRole?: string;
  currentConsultantName?: string | null;
  currentConsultantAgendaIds?: string[];
}

export function AdminApplications({
  applications,
  agendas = [],
  onUpdateStatus,
  onUpdateApplication,
  onConfirmApplication,
  onRejectApplication,
  onRequestApplication,
  currentUserRole,
  currentConsultantName,
  currentConsultantAgendaIds = [],
}: AdminApplicationsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const isConsultantUser = currentUserRole === "consultant";

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

  const companyOptions = Array.from(
    new Set(
      applications
        .map((app) => app.companyName?.trim())
        .filter((value): value is string => Boolean(value))
    )
  ).sort((a, b) => a.localeCompare(b));

  // Filter applications
  const filteredApplications = applications.filter((app) => {
    const matchesConsultantAgenda = !isConsultantUser
      || ((currentConsultantAgendaIds.length > 0 || consultantAgendaNames.size > 0)
        && ((app.agendaId && currentConsultantAgendaIds.includes(app.agendaId))
          || (app.agenda && consultantAgendaNames.has(app.agenda))));

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const matchesSearch = normalizedQuery.length === 0
      ? true
      : app.officeHourTitle?.toLowerCase().includes(normalizedQuery)
        || app.companyName?.toLowerCase().includes(normalizedQuery)
        || app.consultant?.toLowerCase().includes(normalizedQuery)
        || app.agenda?.toLowerCase().includes(normalizedQuery);

    const normalizedStatus = app.status === "review" ? "pending" : app.status;
    const matchesStatus = statusFilter === "all" || normalizedStatus === statusFilter;
    const matchesCompany =
      companyFilter === "all" || app.companyName === companyFilter;

    return matchesConsultantAgenda && matchesSearch && matchesStatus && matchesCompany;
  });

  // Sort by most recent
  const sortedApplications = [...filteredApplications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const handleStatusChange = (id: string, newStatus: ApplicationStatus) => {
    onUpdateStatus(id, newStatus);
    if (statusFilter !== "all" && statusFilter !== newStatus) {
      setStatusFilter("all");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b px-8 py-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">신청 관리</h1>
        <p className="text-sm text-muted-foreground">
          전체 오피스아워 신청을 관리하고 상태를 변경할 수 있습니다
        </p>
      </div>
      <div className="p-8 space-y-6">

      <Card className="overflow-hidden bg-white">
        <CardContent className="p-4 border-b bg-white">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[220px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="기업, 제목, 아젠다로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="기업 필터" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 기업</SelectItem>
                {companyOptions.map((companyName) => (
                  <SelectItem key={companyName} value={companyName}>
                    {companyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        </CardContent>
        <CardContent className="p-4 border-b flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            총 <span className="font-semibold text-foreground">{sortedApplications.length}</span>개의 신청
          </p>
        </CardContent>
        <div className="max-h-[70vh] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-white z-10">
              <TableRow>
                <TableHead>상태</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>신청 기업</TableHead>
                <TableHead>오피스아워</TableHead>
                <TableHead>아젠다</TableHead>
                <TableHead>일정</TableHead>
                <TableHead className="text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedApplications.length > 0 ? (
                sortedApplications.map((app) => (
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
                        <p className="text-sm font-medium truncate">{app.officeHourTitle}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{app.agenda}</span>
                    </TableCell>
                    <TableCell>
                      {app.scheduledDate ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-xs">
                            <Calendar className="w-3 h-3" />
                            <span>{format(new Date(app.scheduledDate), "M/d (E)", { locale: ko })}</span>
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
                          {format(new Date(app.periodFrom), "M/d", { locale: ko })} ~{" "}
                          {format(new Date(app.periodTo!), "M/d", { locale: ko })}
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
                          onClick={() => setSelectedApplication(app)}
                        >
                          상세보기
                        </Button>
                      </div>
                    </TableCell>
                </TableRow>
              ))
            ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <Search className="w-12 h-12 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        {searchQuery || statusFilter !== "all" || companyFilter !== "all"
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
      </Card>
      </div>

      {/* Detail Modal */}
      {selectedApplication && (
        <AdminApplicationDetailModal
          application={selectedApplication}
          onClose={() => setSelectedApplication(null)}
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
