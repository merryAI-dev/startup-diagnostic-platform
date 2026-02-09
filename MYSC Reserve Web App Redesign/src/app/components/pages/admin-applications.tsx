import { useState } from "react";
import { Calendar, Clock, Search, Filter, Eye, CheckCircle2, XCircle, MoreVertical } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { StatusChip } from "../status-chip";
import { Application, ApplicationStatus } from "../../lib/types";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { AdminApplicationDetailModal } from "./admin-application-detail-modal";

interface AdminApplicationsProps {
  applications: Application[];
  onUpdateStatus: (id: string, status: ApplicationStatus) => void;
  onUpdateApplication: (id: string, data: Partial<Application>) => void;
}

export function AdminApplications({
  applications,
  onUpdateStatus,
  onUpdateApplication,
}: AdminApplicationsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);

  // Filter applications
  const filteredApplications = applications.filter((app) => {
    const matchesSearch =
      app.officeHourTitle?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.consultant?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.agenda?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "all" || app.status === statusFilter;
    const matchesType = typeFilter === "all" || app.type === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  // Sort by most recent
  const sortedApplications = [...filteredApplications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const handleStatusChange = (id: string, newStatus: ApplicationStatus) => {
    onUpdateStatus(id, newStatus);
  };

  const getStatusActions = (app: Application) => {
    const actions: { label: string; status: ApplicationStatus; variant?: "default" | "destructive" }[] = [];

    switch (app.status) {
      case "pending":
        actions.push({ label: "검토 시작", status: "review" });
        actions.push({ label: "즉시 확정", status: "confirmed" });
        actions.push({ label: "취소", status: "cancelled", variant: "destructive" });
        break;
      case "review":
        actions.push({ label: "확정", status: "confirmed" });
        actions.push({ label: "취소", status: "cancelled", variant: "destructive" });
        break;
      case "confirmed":
        actions.push({ label: "완료 처리", status: "completed" });
        actions.push({ label: "취소", status: "cancelled", variant: "destructive" });
        break;
      case "cancelled":
        actions.push({ label: "재검토", status: "review" });
        break;
      case "completed":
        // No status changes for completed
        break;
    }

    return actions;
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="mb-2">신청 관리</h1>
        <p className="text-sm text-muted-foreground">
          전체 오피스아워 신청을 관리하고 상태를 변경할 수 있습니다
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            필터 및 검색
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="제목, 컨설턴트, 안건으로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="상태 필터" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                <SelectItem value="pending">신청중</SelectItem>
                <SelectItem value="review">검토중</SelectItem>
                <SelectItem value="confirmed">확정</SelectItem>
                <SelectItem value="cancelled">취소</SelectItem>
                <SelectItem value="completed">완료</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="유형 필터" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 유형</SelectItem>
                <SelectItem value="regular">정기</SelectItem>
                <SelectItem value="irregular">비정기</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          총 <span className="font-semibold text-foreground">{sortedApplications.length}</span>개의 신청
        </p>
      </div>

      {/* Applications Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>상태</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>오피스아워</TableHead>
                <TableHead>안건</TableHead>
                <TableHead>컨설턴트</TableHead>
                <TableHead>일정</TableHead>
                <TableHead>신청일</TableHead>
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
                      <div className="max-w-xs">
                        <p className="text-sm font-medium truncate">{app.officeHourTitle}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{app.agenda}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{app.consultant}</span>
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
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(app.createdAt), "M/d", { locale: ko })}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedApplication(app)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedApplication(app)}>
                              <Eye className="w-4 h-4 mr-2" />
                              상세 보기
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {getStatusActions(app).map((action, idx) => (
                              <DropdownMenuItem
                                key={idx}
                                onClick={() => handleStatusChange(app.id, action.status)}
                                className={action.variant === "destructive" ? "text-destructive" : ""}
                              >
                                {action.status === "confirmed" && <CheckCircle2 className="w-4 h-4 mr-2" />}
                                {action.status === "cancelled" && <XCircle className="w-4 h-4 mr-2" />}
                                {action.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <Search className="w-12 h-12 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        {searchQuery || statusFilter !== "all" || typeFilter !== "all"
                          ? "검색 결과가 없습니다"
                          : "신청 내역이 없습니다"}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail Modal */}
      {selectedApplication && (
        <AdminApplicationDetailModal
          application={selectedApplication}
          onClose={() => setSelectedApplication(null)}
          onUpdateStatus={onUpdateStatus}
          onUpdateApplication={onUpdateApplication}
        />
      )}
    </div>
  );
}