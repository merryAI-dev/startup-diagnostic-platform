import { useState } from "react";
import { Search, Filter, UserPlus, Mail, Building, Calendar, Shield } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { UserWithPermissions } from "../../lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Label } from "../ui/label";
import { Checkbox } from "../ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

interface AdminUsersProps {
  users: UserWithPermissions[];
  onUpdateUser: (id: string, data: Partial<UserWithPermissions>) => void;
  onAddUser: (data: Omit<UserWithPermissions, "id" | "createdAt">) => void;
}

export function AdminUsers({ users, onUpdateUser, onAddUser }: AdminUsersProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<UserWithPermissions | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.programName.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || user.status === statusFilter;

    return matchesSearch && matchesStatus;
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

  const formatDate = (date: Date | string) => {
    const parsedDate = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(parsedDate);
  };

  const stats = {
    total: users.length,
    active: users.filter(u => u.status === "active").length,
    inactive: users.filter(u => u.status === "inactive").length,
    suspended: users.filter(u => u.status === "suspended").length,
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

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
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
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-muted-foreground mb-1">정지된 사용자</div>
          <div className="text-2xl font-bold text-red-600">{stats.suspended}</div>
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
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 상태</SelectItem>
              <SelectItem value="active">활성</SelectItem>
              <SelectItem value="inactive">비활성</SelectItem>
              <SelectItem value="suspended">정지</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>사용자</TableHead>
              <TableHead>프로그램</TableHead>
              <TableHead>권한</TableHead>
              <TableHead>가입일</TableHead>
              <TableHead>최근 로그인</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-semibold text-primary">
                        {user.companyName[0]}
                      </span>
                    </div>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {user.companyName}
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
                <TableCell>
                  <div className="flex flex-col gap-1 text-xs">
                    {user.permissions.canApplyRegular && (
                      <span className="text-green-600">✓ 정기 신청</span>
                    )}
                    {user.permissions.canApplyIrregular && (
                      <span className="text-green-600">✓ 비정기 신청</span>
                    )}
                    {user.permissions.canViewAll && (
                      <span className="text-blue-600">✓ 전체 조회</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(user.createdAt)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {user.lastLoginAt ? formatDate(user.lastLoginAt) : "-"}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      user.status === "active"
                        ? "default"
                        : user.status === "suspended"
                        ? "destructive"
                        : "secondary"
                    }
                    className={
                      user.status === "active"
                        ? "bg-green-100 text-green-700"
                        : ""
                    }
                  >
                    {user.status === "active"
                      ? "활성"
                      : user.status === "suspended"
                      ? "정지"
                      : "비활성"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Dialog
                    open={isEditDialogOpen && selectedUser?.id === user.id}
                    onOpenChange={(open) => {
                      setIsEditDialogOpen(open);
                      if (open) setSelectedUser(user);
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm">
                        편집
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>사용자 권한 관리</DialogTitle>
                        <DialogDescription>
                          {user.companyName} ({user.email})
                        </DialogDescription>
                      </DialogHeader>
                      
                      <div className="space-y-6">
                        <div>
                          <Label className="text-base font-semibold mb-3 block">
                            상태
                          </Label>
                          <Select
                            value={user.status}
                            onValueChange={(value) =>
                              handleUpdateStatus(user.id, value as UserWithPermissions["status"])
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">활성</SelectItem>
                              <SelectItem value="inactive">비활성</SelectItem>
                              <SelectItem value="suspended">정지</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="text-base font-semibold mb-3 block">
                            권한 설정
                          </Label>
                          <div className="space-y-3">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="regular"
                                checked={user.permissions.canApplyRegular}
                                onCheckedChange={(checked) =>
                                  handleUpdatePermissions(
                                    user.id,
                                    "canApplyRegular",
                                    checked as boolean
                                  )
                                }
                              />
                              <Label
                                htmlFor="regular"
                                className="text-sm font-normal cursor-pointer"
                              >
                                정기 오피스아워 신청 가능
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="irregular"
                                checked={user.permissions.canApplyIrregular}
                                onCheckedChange={(checked) =>
                                  handleUpdatePermissions(
                                    user.id,
                                    "canApplyIrregular",
                                    checked as boolean
                                  )
                                }
                              />
                              <Label
                                htmlFor="irregular"
                                className="text-sm font-normal cursor-pointer"
                              >
                                비정기 오피스아워 신청 가능
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="viewAll"
                                checked={user.permissions.canViewAll}
                                onCheckedChange={(checked) =>
                                  handleUpdatePermissions(
                                    user.id,
                                    "canViewAll",
                                    checked as boolean
                                  )
                                }
                              />
                              <Label
                                htmlFor="viewAll"
                                className="text-sm font-normal cursor-pointer"
                              >
                                전체 신청 내역 조회 가능
                              </Label>
                            </div>
                          </div>
                        </div>

                        <div className="pt-4 border-t">
                          <div className="text-xs text-muted-foreground space-y-1">
                            <div>가입일: {formatDate(user.createdAt)}</div>
                            <div>
                              최근 로그인:{" "}
                              {user.lastLoginAt
                                ? formatDate(user.lastLoginAt)
                                : "없음"}
                            </div>
                            <div>프로그램: {user.programName}</div>
                          </div>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {filteredUsers.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            검색 결과가 없습니다
          </div>
        )}
      </div>
    </div>
  );
}
