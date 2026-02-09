import { useState } from "react";
import { TeamMember, User } from "../../lib/types";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Avatar } from "../ui/avatar";
import { ScrollArea } from "../ui/scroll-area";
import { Separator } from "../ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  Users, UserPlus, Mail, MoreVertical, Shield, Edit, Trash2,
  CheckCircle2, XCircle, Crown, Star, Activity, Calendar, Search,
  MessageSquare, Phone, Video, Clock, TrendingUp
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../ui/utils";

interface TeamCollaborationProps {
  currentUser: User;
  teamMembers: TeamMember[];
  onInviteMember: (email: string, role: string) => void;
  onUpdateMember: (id: string, updates: Partial<TeamMember>) => void;
  onRemoveMember: (id: string) => void;
}

const roleLabels = {
  admin: "관리자",
  consultant: "컨설턴트",
  staff: "스태프",
  user: "사용자",
};

const roleColors = {
  admin: "bg-purple-100 text-purple-700 border-purple-200",
  consultant: "bg-blue-100 text-blue-700 border-blue-200",
  staff: "bg-emerald-100 text-emerald-700 border-emerald-200",
  user: "bg-slate-100 text-slate-700 border-slate-200",
};

export function TeamCollaboration({
  currentUser,
  teamMembers,
  onInviteMember,
  onUpdateMember,
  onRemoveMember,
}: TeamCollaborationProps) {
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<User["role"]>("user");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);

  const filteredMembers = teamMembers.filter(member =>
    member.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    member.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    member.position?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleInvite = () => {
    if (inviteEmail.trim()) {
      onInviteMember(inviteEmail, inviteRole);
      setInviteEmail("");
      setInviteRole("user");
      setIsInviteDialogOpen(false);
    }
  };

  const activeMembers = filteredMembers.filter(m => m.isActive);
  const inactiveMembers = filteredMembers.filter(m => !m.isActive);

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* 헤더 */}
      <div className="bg-white border-b p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-[#5DADE2] to-[#0A2540] rounded-xl">
                <Users className="size-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[#0A2540]">팀 협업</h1>
                <p className="text-slate-600">팀원 관리 및 권한 설정</p>
              </div>
            </div>

            <Button
              onClick={() => setIsInviteDialogOpen(true)}
              className="bg-[#5DADE2] hover:bg-[#5DADE2]/90 gap-2"
            >
              <UserPlus className="size-4" />
              팀원 초대
            </Button>
          </div>

          {/* 통계 */}
          <div className="grid md:grid-cols-4 gap-4">
            {[
              { label: "전체 팀원", value: teamMembers.length, icon: Users, color: "text-blue-600 bg-blue-50" },
              { label: "활성 멤버", value: activeMembers.length, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
              { label: "관리자", value: teamMembers.filter(m => m.role === "admin").length, icon: Crown, color: "text-purple-600 bg-purple-50" },
              { label: "이번 달 활동", value: Math.floor(Math.random() * 100), icon: Activity, color: "text-amber-600 bg-amber-50" },
            ].map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-lg", stat.color)}>
                      <stat.icon className="size-5" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-[#0A2540]">{stat.value}</p>
                      <p className="text-sm text-slate-600">{stat.label}</p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* 검색 */}
          <div className="mt-6 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <Input
              placeholder="이름, 이메일, 직책으로 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {/* 팀원 목록 */}
      <ScrollArea className="flex-1 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* 활성 멤버 */}
          <div>
            <h2 className="text-lg font-semibold text-[#0A2540] mb-4 flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600" />
              활성 멤버 ({activeMembers.length})
            </h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              <AnimatePresence>
                {activeMembers.map((member, index) => (
                  <motion.div
                    key={member.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2, delay: index * 0.03 }}
                  >
                    <Card className="p-5 hover:shadow-lg transition-all group">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-start gap-3">
                          <Avatar className="w-12 h-12">
                            <div className="w-full h-full bg-gradient-to-br from-[#5DADE2] to-[#0A2540] flex items-center justify-center text-white font-semibold text-lg">
                              {member.companyName.charAt(0).toUpperCase()}
                            </div>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-[#0A2540]">{member.companyName}</h3>
                              {member.id === currentUser.id && (
                                <Badge variant="outline" className="text-xs">
                                  나
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-slate-600">{member.email}</p>
                          </div>
                        </div>

                        {currentUser.role === "admin" && member.id !== currentUser.id && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100">
                                <MoreVertical className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setSelectedMember(member)}>
                                <Edit className="size-3 mr-2" />
                                수정
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onUpdateMember(member.id, { isActive: false })}
                              >
                                <XCircle className="size-3 mr-2" />
                                비활성화
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onRemoveMember(member.id)}
                                className="text-red-600"
                              >
                                <Trash2 className="size-3 mr-2" />
                                제거
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>

                      {/* 역할 & 부서 */}
                      <div className="flex items-center gap-2 mb-3">
                        <Badge className={cn("text-xs", roleColors[member.role])}>
                          {member.role === "admin" && <Crown className="size-3 mr-1" />}
                          {member.role === "consultant" && <Star className="size-3 mr-1" />}
                          {member.role === "staff" && <Shield className="size-3 mr-1" />}
                          {roleLabels[member.role]}
                        </Badge>
                        {member.position && (
                          <Badge variant="outline" className="text-xs">
                            {member.position}
                          </Badge>
                        )}
                      </div>

                      {member.department && (
                        <p className="text-sm text-slate-600 mb-3">{member.department}</p>
                      )}

                      <Separator className="my-3" />

                      {/* 정보 */}
                      <div className="space-y-2 text-xs text-slate-600 mb-3">
                        <div className="flex items-center gap-2">
                          <Calendar className="size-3" />
                          <span>
                            {new Date(member.joinedAt).toLocaleDateString("ko-KR")} 가입
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Activity className="size-3" />
                          <span>
                            최근 활동: {member.lastLoginAt
                              ? new Date(member.lastLoginAt).toLocaleDateString("ko-KR")
                              : "정보 없음"}
                          </span>
                        </div>
                      </div>

                      {/* 액션 버튼 */}
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1 gap-1">
                          <MessageSquare className="size-3" />
                          메시지
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1">
                          <Mail className="size-3" />
                        </Button>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {activeMembers.length === 0 && (
              <Card className="p-12 text-center">
                <Users className="size-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500 font-medium mb-2">활성 멤버가 없습니다</p>
                <p className="text-sm text-slate-400">팀원을 초대하여 협업을 시작하세요</p>
              </Card>
            )}
          </div>

          {/* 비활성 멤버 */}
          {inactiveMembers.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-slate-600 mb-4 flex items-center gap-2">
                <XCircle className="size-5" />
                비활성 멤버 ({inactiveMembers.length})
              </h2>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {inactiveMembers.map((member, index) => (
                  <motion.div
                    key={member.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.03 }}
                  >
                    <Card className="p-5 opacity-60 hover:opacity-80 transition-opacity">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-start gap-3">
                          <Avatar className="w-10 h-10">
                            <div className="w-full h-full bg-slate-300 flex items-center justify-center text-white font-semibold">
                              {member.companyName.charAt(0).toUpperCase()}
                            </div>
                          </Avatar>
                          <div>
                            <h3 className="font-semibold text-slate-700 text-sm">{member.companyName}</h3>
                            <p className="text-xs text-slate-500">{member.email}</p>
                          </div>
                        </div>

                        {currentUser.role === "admin" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onUpdateMember(member.id, { isActive: true })}
                            className="h-7 text-xs"
                          >
                            재활성화
                          </Button>
                        )}
                      </div>

                      <Badge variant="outline" className="text-xs">
                        비활성
                      </Badge>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* 초대 다이얼로그 */}
      <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>팀원 초대</DialogTitle>
            <DialogDescription>
              새로운 팀원을 초대하여 함께 협업하세요
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">
                이메일 주소 *
              </label>
              <Input
                type="email"
                placeholder="example@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">
                역할
              </label>
              <Select value={inviteRole} onValueChange={(val) => setInviteRole(val as User["role"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">사용자 - 기본 권한</SelectItem>
                  <SelectItem value="staff">스태프 - 관리 권한</SelectItem>
                  <SelectItem value="consultant">컨설턴트 - 컨설팅 권한</SelectItem>
                  <SelectItem value="admin">관리자 - 모든 권한</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 mt-2">
                초대 후에도 역할을 변경할 수 있습니다
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsInviteDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleInvite} className="bg-[#5DADE2] hover:bg-[#5DADE2]/90">
              초대 보내기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
