import { useEffect, useState } from "react"
import { Calendar, Filter, Mail, Search, Shield } from "lucide-react"
import { Button } from "@/redesign/app/components/ui/button"
import { Input } from "@/redesign/app/components/ui/input"
import { Badge } from "@/redesign/app/components/ui/badge"
import { PendingProfileApproval, UserWithPermissions } from "@/redesign/app/lib/types"
import { Switch } from "@/redesign/app/components/ui/switch"
import { Card, CardHeader, CardTitle } from "@/redesign/app/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/redesign/app/components/ui/select"
import { PaginationControls } from "@/redesign/app/components/ui/pagination-controls"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/redesign/app/components/ui/table"

interface AdminUsersProps {
  users: UserWithPermissions[]
  consultants?: { id: string; name: string; email: string }[]
  onUpdateUser: (id: string, data: Partial<UserWithPermissions>) => void
  onAddUser: (data: Omit<UserWithPermissions, "id" | "createdAt">) => void
  pendingApprovals: PendingProfileApproval[]
  onApprovePendingUser: (pendingProfile: PendingProfileApproval) => Promise<void> | void
  approvalSaving?: boolean
}

const PENDING_PAGE_SIZE = 5
const USER_PAGE_SIZE = 8

export function AdminUsers({
  users,
  consultants = [],
  onUpdateUser,
  onAddUser: _onAddUser,
  pendingApprovals,
  onApprovePendingUser,
  approvalSaving = false,
}: AdminUsersProps) {
  const pageTitleClassName = "text-2xl font-semibold text-slate-900"
  const pageDescriptionClassName = "mt-1 text-sm text-slate-500"
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [roleFilter, setRoleFilter] = useState<string>("all")
  const [approvalSearchQuery, setApprovalSearchQuery] = useState("")
  const [approvalRoleFilter, setApprovalRoleFilter] = useState<string>("all")
  const [approvingUserId, setApprovingUserId] = useState<string | null>(null)
  const [pendingPage, setPendingPage] = useState(1)
  const [userPage, setUserPage] = useState(1)

  const filteredUsers = users.filter((user) => {
    const keyword = searchQuery.trim().toLowerCase()
    const matchesSearch =
      keyword.length === 0
        ? true
        : user.email.toLowerCase().includes(keyword) ||
          (user.companyName ?? "").toLowerCase().includes(keyword) ||
          (user.programName ?? "").toLowerCase().includes(keyword)

    const matchesStatus = statusFilter === "all" || user.status === statusFilter
    const normalizedRole = user.role === "user" ? "company" : user.role
    const matchesRole = roleFilter === "all" || normalizedRole === roleFilter

    return matchesSearch && matchesStatus && matchesRole
  })

  const filteredPendingApprovals = pendingApprovals.filter((pending) => {
    const keyword = approvalSearchQuery.trim().toLowerCase()
    const requestedRole = pending.requestedRole ?? pending.role
    const matchesSearch = !keyword || pending.email.toLowerCase().includes(keyword)
    const matchesRole = approvalRoleFilter === "all" || requestedRole === approvalRoleFilter
    return matchesSearch && matchesRole
  })

  useEffect(() => {
    setPendingPage(1)
  }, [approvalRoleFilter, approvalSearchQuery, pendingApprovals.length])

  useEffect(() => {
    setUserPage(1)
  }, [roleFilter, searchQuery, statusFilter, users.length])

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredPendingApprovals.length / PENDING_PAGE_SIZE))
    if (pendingPage > totalPages) {
      setPendingPage(totalPages)
    }
  }, [filteredPendingApprovals.length, pendingPage])

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredUsers.length / USER_PAGE_SIZE))
    if (userPage > totalPages) {
      setUserPage(totalPages)
    }
  }, [filteredUsers.length, userPage])

  const handleUpdateStatus = (userId: string, status: UserWithPermissions["status"]) => {
    onUpdateUser(userId, { status })
  }

  const formatDate = (date?: Date | string) => {
    if (!date) return "-"
    const parsedDate = date instanceof Date ? date : new Date(date)
    if (Number.isNaN(parsedDate.getTime())) return "-"
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(parsedDate)
  }

  const getRoleLabel = (
    role: PendingProfileApproval["requestedRole"] | PendingProfileApproval["role"],
  ) => {
    if (role === "admin") return "관리자"
    if (role === "consultant") return "컨설턴트"
    return "회사"
  }

  const getUserRoleLabel = (role: UserWithPermissions["role"]) => {
    if (role === "admin") return "관리자"
    if (role === "consultant") return "컨설턴트"
    if (role === "staff") return "스태프"
    return "회사"
  }

  const getUserDisplayName = (user: UserWithPermissions, consultantName?: string | null) => {
    if (user.role === "admin") return "관리자"
    if (user.role === "staff") return "스태프"
    if (user.role === "consultant") {
      return consultantName?.trim() || user.email.split("@")[0] || "컨설턴트"
    }
    return user.companyName?.trim() || "회사명 미입력"
  }

  const getAvatarLabel = (user: UserWithPermissions, displayName: string) => {
    if (user.role === "admin") return "관"
    if (user.role === "staff") return "스"
    if (user.role === "consultant") return "컨"
    return displayName[0] || "회"
  }

  const getAvatarClass = (user: UserWithPermissions) => {
    if (user.role === "admin") return "bg-slate-900 text-white"
    if (user.role === "staff") return "bg-slate-200 text-slate-700"
    if (user.role === "consultant") return "bg-emerald-100 text-emerald-700"
    return "bg-blue-100 text-blue-700"
  }

  const handleApprovePendingUser = async (pending: PendingProfileApproval) => {
    setApprovingUserId(pending.id)
    try {
      await Promise.resolve(onApprovePendingUser(pending))
    } finally {
      setApprovingUserId(null)
    }
  }

  const paginatedPendingApprovals = filteredPendingApprovals.slice(
    (pendingPage - 1) * PENDING_PAGE_SIZE,
    pendingPage * PENDING_PAGE_SIZE,
  )

  const paginatedUsers = filteredUsers.slice(
    (userPage - 1) * USER_PAGE_SIZE,
    userPage * USER_PAGE_SIZE,
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <div className="shrink-0 border-b bg-white px-6 py-5">
        <h1 className={pageTitleClassName}>사용자 관리</h1>
        <p className={pageDescriptionClassName}>
          가입 승인과 사용자 계정 상태를 한 화면에서 관리합니다
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-6 pb-6 pt-5">
        <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-white lg:w-[30%]">
            <div className="shrink-0 border-b p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">가입 승인 대기</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    승인 전 계정을 검토하고 바로 처리합니다
                  </p>
                </div>
                <Badge variant="secondary" className="border border-sky-100 bg-sky-50 text-sky-700">
                  {filteredPendingApprovals.length}건
                </Badge>
              </div>

              <div className="mt-4 flex flex-row gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="이메일 검색"
                    value={approvalSearchQuery}
                    onChange={(e) => setApprovalSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={approvalRoleFilter} onValueChange={setApprovalRoleFilter}>
                  <SelectTrigger className="w-[132px] shrink-0">
                    <Filter className="mr-2 h-4 w-4" />
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
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {filteredPendingApprovals.length === 0 ? (
                <div className="flex h-full items-center justify-center px-5 py-16 text-center text-sm text-muted-foreground">
                  승인 대기 계정이 없습니다
                </div>
              ) : (
                <div className="divide-y">
                  {paginatedPendingApprovals.map((pending) => {
                    const requestedRole = pending.requestedRole ?? pending.role
                    const isApproving = approvalSaving || approvingUserId === pending.id
                    const currentRoleLabel = getRoleLabel(pending.role)
                    const requestedRoleLabel = getRoleLabel(requestedRole)

                    return (
                      <div key={pending.id} className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-900">
                              {pending.email || "-"}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                              <Badge variant="outline" className="h-6 px-2 text-[11px]">
                                현재 역할 {currentRoleLabel}
                              </Badge>
                              <Badge
                                variant="secondary"
                                className="h-6 bg-sky-50 px-2 text-[11px] text-sky-700"
                              >
                                신청 역할 {requestedRoleLabel}
                              </Badge>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              {pending.role !== requestedRole && (
                                <span>
                                  역할 변경 신청: {currentRoleLabel} → {requestedRoleLabel}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDate(pending.createdAt)}
                              </span>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            className="shrink-0"
                            disabled={isApproving}
                            onClick={() => handleApprovePendingUser(pending)}
                          >
                            {isApproving ? "승인 중..." : "승인"}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t px-4 py-3 flex justify-center">
              <PaginationControls
                page={pendingPage}
                totalItems={filteredPendingApprovals.length}
                pageSize={PENDING_PAGE_SIZE}
                onPageChange={setPendingPage}
                alwaysShow
              />
            </div>
          </section>

          <section className="min-h-0 lg:w-[70%]">
            <Card className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
              <CardHeader className="shrink-0 border-b bg-white px-5 py-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <CardTitle className="text-lg font-semibold text-slate-900">
                    사용자 리스트
                  </CardTitle>
                  <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                    {filteredUsers.length}명
                  </Badge>
                </div>
                <div className="flex flex-row gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="이메일, 회사명, 프로그램명 검색"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="w-[132px] shrink-0">
                      <Filter className="mr-2 h-4 w-4" />
                      <SelectValue placeholder="역할" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 역할</SelectItem>
                      <SelectItem value="company">회사</SelectItem>
                      <SelectItem value="admin">관리자</SelectItem>
                      <SelectItem value="consultant">컨설턴트</SelectItem>
                      <SelectItem value="staff">스태프</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[132px] shrink-0">
                      <Filter className="mr-2 h-4 w-4" />
                      <SelectValue placeholder="상태" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 상태</SelectItem>
                      <SelectItem value="active">활성</SelectItem>
                      <SelectItem value="inactive">비활성</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>

              <div className="min-h-0 flex-1 overflow-auto">
                <Table>
                  <TableHeader className="[&_tr]:sticky [&_tr]:top-0 [&_tr]:z-10 [&_tr]:bg-white">
                    <TableRow className="hover:bg-white">
                      <TableHead className="bg-white">사용자</TableHead>
                      <TableHead className="w-36 bg-white">회사명</TableHead>
                      <TableHead className="w-32 bg-white">프로그램</TableHead>
                      <TableHead className="w-24 bg-white">역할</TableHead>
                      <TableHead className="w-28 bg-white">가입일</TableHead>
                      <TableHead className="w-32 bg-white">상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="h-24 text-center text-sm text-muted-foreground"
                        >
                          검색 결과가 없습니다
                        </TableCell>
                      </TableRow>
                    )}
                    {paginatedUsers.map((user) => {
                      const consultantName = consultants.find(
                        (item) => item.email.toLowerCase() === user.email.toLowerCase(),
                      )?.name
                      const displayName = getUserDisplayName(user, consultantName)
                      const avatarLabel = getAvatarLabel(user, displayName)
                      const avatarClass = getAvatarClass(user)

                      return (
                        <TableRow key={user.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${avatarClass}`}
                              >
                                <span className="text-xs font-semibold">{avatarLabel}</span>
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="truncate text-sm font-medium text-slate-900">
                                    {displayName}
                                  </p>
                                  {user.role === "admin" && (
                                    <Shield className="h-3.5 w-3.5 shrink-0 text-primary" />
                                  )}
                                </div>
                                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                                  <Mail className="h-3 w-3 shrink-0" />
                                  {user.email}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {user.role === "user" ? user.companyName || "회사명 미입력" : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{user.programName || "-"}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {getUserRoleLabel(user.role)}
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {formatDate(user.createdAt)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Switch
                                checked={user.status === "active"}
                                onCheckedChange={(checked) =>
                                  handleUpdateStatus(user.id, checked ? "active" : "inactive")
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
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="shrink-0 border-t px-4 py-3 flex justify-center">
                <PaginationControls
                  page={userPage}
                  totalItems={filteredUsers.length}
                  pageSize={USER_PAGE_SIZE}
                  onPageChange={setUserPage}
                  alwaysShow
                />
              </div>
            </Card>
          </section>
        </div>
      </div>
    </div>
  )
}
