import { useState } from "react";
import { Search, Filter, UserPlus, Mail, Building, Calendar, Shield } from "lucide-react";
import { Button } from "@/redesign/app/components/ui/button";
import { Input } from "@/redesign/app/components/ui/input";
import { Badge } from "@/redesign/app/components/ui/badge";
import { PendingProfileApproval, UserWithPermissions } from "@/redesign/app/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/redesign/app/components/ui/table";
import { Switch } from "@/redesign/app/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/redesign/app/components/ui/select";

interface AdminUsersProps {
  users: UserWithPermissions[];
  consultants?: { id: string; name: string; email: string }[];
  onUpdateUser: (id: string, data: Partial<UserWithPermissions>) => void;
  onAddUser: (data: Omit<UserWithPermissions, "id" | "createdAt">) => void;
  pendingApprovals: PendingProfileApproval[];
  onApprovePendingUser: (
    pendingProfile: PendingProfileApproval
  ) => Promise<void> | void;
  approvalSaving?: boolean;
}

export function AdminUsers({
  users,
  consultants = [],
  onUpdateUser,
  onAddUser,
  pendingApprovals,
  onApprovePendingUser,
  approvalSaving = false,
}: AdminUsersProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [approvalSearchQuery, setApprovalSearchQuery] = useState("");
  const [approvalRoleFilter, setApprovalRoleFilter] = useState<string>("all");
  const [approvingUserId, setApprovingUserId] = useState<string | null>(null);

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.programName.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || user.status === statusFilter;
    const normalizedRole = user.role === "user" ? "company" : user.role;
    const matchesRole = roleFilter === "all" || normalizedRole === roleFilter;

    return matchesSearch && matchesStatus && matchesRole;
  });

  const handleUpdatePermissions = (
    userId: string,
    permission: keyof UserWithPermissions["permissions"],
    value: boolean
  ) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    onUpdateUser(userId, {
      permissions: {
        ...user.permissions,
        [permission]: value,
      },
    });
  };

  const handleUpdateStatus = (userId: string, status: UserWithPermissions["status"]) => {
    onUpdateUser(userId, { status });
  };

  const formatDate = (date?: Date | string) => {
    if (!date) return "-";
    const parsedDate = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(parsedDate.getTime())) return "-";
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(parsedDate);
  };

  const getRoleLabel = (
    role: PendingProfileApproval["requestedRole"] | PendingProfileApproval["role"]
  ) => {
    if (role === "admin") return "관리자";
    if (role === "consultant") return "컨설턴트";
    return "회사";
  };
  const getUserRoleLabel = (role: UserWithPermissions["role"]) => {
    if (role === "admin") return "관리자";
    if (role === "consultant") return "컨설턴트";
    if (role === "staff") return "스태프";
    return "회사";
  };
  const getUserDisplayName = (
    user: UserWithPermissions,
    consultantName?: string | null
  ) => {
    if (user.role === "admin") return "관리자";
    if (user.role === "staff") return "스태프";
    if (user.role === "consultant") {
      return consultantName?.trim()
        || user.email.split("@")[0]
        || "컨설턴트";
    }
    return user.companyName?.trim() || "회사명 미입력";
  };
  const getAvatarLabel = (user: UserWithPermissions, displayName: string) => {
    if (user.role === "admin") return "관";
    if (user.role === "staff") return "스";
    if (user.role === "consultant") return "컨";
    return displayName[0] || "회";
  };
  const getAvatarClass = (user: UserWithPermissions) => {
    if (user.role === "admin") return "bg-slate-900 text-white";
    if (user.role === "staff") return "bg-slate-200 text-slate-700";
    if (user.role === "consultant") return "bg-emerald-100 text-emerald-700";
    return "bg-blue-100 text-blue-700";
  };

  const filteredPendingApprovals = pendingApprovals.filter((pending) => {
    const keyword = approvalSearchQuery.trim().toLowerCase();
    const requestedRole = pending.requestedRole ?? pending.role;
    const matchesSearch = !keyword || pending.email.toLowerCase().includes(keyword);
    const matchesRole = approvalRoleFilter === "all" || requestedRole === approvalRoleFilter;
    return matchesSearch && matchesRole;
  });

  const handleApprovePendingUser = async (pending: PendingProfileApproval) => {
    setApprovingUserId(pending.id);
    try {
      await Promise.resolve(onApprovePendingUser(pending));
    } finally {
      setApprovingUserId(null);
    }
  };

  const stats = {
    total: users.length,
    active: users.filter(u => u.status === "active").length,
    inactive: users.filter(u => u.status === "inactive").length,
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">사용자 관리</h1>
            <p className="text-sm text-muted-foreground mt-1">
              사용자 정보 및 권한을 관리합니다
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">가입 승인 대기</h2>
            <p className="text-sm text-muted-foreground mt-1">
              회원가입 후 승인 대기 중인 계정을 역할별로 승인합니다
            </p>
          </div>
          <Badge variant="secondary" className="text-sm bg-sky-50 text-sky-700 border border-sky-100">
            {pendingApprovals.length}건 대기
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex-1 min-w-[220px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="승인 대기 이메일 검색..."
              value={approvalSearchQuery}
              onChange={(e) => setApprovalSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={approvalRoleFilter} onValueChange={setApprovalRoleFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="요청 역할" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 요청 역할</SelectItem>
              <SelectItem value="company">회사</SelectItem>
              <SelectItem value="admin">관리자</SelectItem>
              <SelectItem value="consultant">컨설턴트</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이메일</TableHead>
                <TableHead>요청 역할</TableHead>
                <TableHead>현재 역할</TableHead>
                <TableHead>가입일</TableHead>
                <TableHead>액션</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPendingApprovals.map((pending) => {
                const requestedRole = pending.requestedRole ?? pending.role;
                const isApproving =
                  approvalSaving || approvingUserId === pending.id;

                return (
                  <TableRow key={pending.id}>
                    <TableCell className="text-sm">{pending.email || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{getRoleLabel(requestedRole)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {getRoleLabel(pending.role)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(pending.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        disabled={isApproving}
                        onClick={() => handleApprovePendingUser(pending)}
                      >
                        {isApproving ? "승인 중..." : "승인"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {filteredPendingApprovals.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              승인 대기 계정이 없습니다
            </div>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-muted-foreground mb-1">전체 사용자</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-muted-foreground mb-1">활성 사용자</div>
          <div className="text-2xl font-bold text-green-600">{stats.active}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-muted-foreground mb-1">비활성 사용자</div>
          <div className="text-2xl font-bold text-gray-400">{stats.inactive}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border p-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="이메일, 회사명, 프로그램명으로 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-40">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="역할" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 역할</SelectItem>
              <SelectItem value="company">회사</SelectItem>
              <SelectItem value="admin">관리자</SelectItem>
              <SelectItem value="consultant">컨설턴트</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            <SelectItem value="active">활성</SelectItem>
            <SelectItem value="inactive">비활성</SelectItem>
          </SelectContent>
        </Select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg border">
        <div className="max-h-[540px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>사용자</TableHead>
                <TableHead>프로그램</TableHead>
                <TableHead>역할</TableHead>
                <TableHead>가입일</TableHead>
              <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => {
                const consultantName = consultants.find(
                  (item) => item.email.toLowerCase() === user.email.toLowerCase()
                )?.name;
                const displayName = getUserDisplayName(user, consultantName);
                const avatarLabel = getAvatarLabel(user, displayName);
                const avatarClass = getAvatarClass(user);
                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${avatarClass}`}>
                          <span className="text-sm font-semibold">
                            {avatarLabel}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {displayName}
                            {user.role === "admin" && (
                              <Shield className="w-3 h-3 text-primary" />
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{user.programName}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {getUserRoleLabel(user.role)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(user.createdAt)}
                    </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={user.status === "active"}
                      onCheckedChange={(checked) =>
                        handleUpdateStatus(
                          user.id,
                          checked ? "active" : "inactive"
                        )
                      }
                    />
                    <Badge
                      variant="secondary"
                      className={
                        user.status === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }
                    >
                      {user.status === "active" ? "활성" : "비활성"}
                    </Badge>
                  </div>
                </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            검색 결과가 없습니다
          </div>
        )}
      </div>
    </div>
  );
}
