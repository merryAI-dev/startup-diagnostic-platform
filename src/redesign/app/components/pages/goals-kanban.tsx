import { useState } from "react";
import { Goal, User, GoalComment } from "@/redesign/app/lib/types";
import { Card } from "@/redesign/app/components/ui/card";
import { Button } from "@/redesign/app/components/ui/button";
import { Badge } from "@/redesign/app/components/ui/badge";
import { Progress } from "@/redesign/app/components/ui/progress";
import { Input } from "@/redesign/app/components/ui/input";
import { Textarea } from "@/redesign/app/components/ui/textarea";
import { Avatar } from "@/redesign/app/components/ui/avatar";
import { ScrollArea } from "@/redesign/app/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/redesign/app/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/redesign/app/components/ui/dialog";
import {
  Target, Plus, Calendar, Users, TrendingUp, AlertCircle,
  Flag, CheckCircle2, Clock, MoreVertical, Edit, Trash2,
  MessageSquare, Paperclip, GripVertical
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/redesign/app/components/ui/dropdown-menu";
import { cn } from "@/redesign/app/components/ui/utils";

interface GoalsKanbanProps {
  currentUser: User;
  goals: Goal[];
  onCreateGoal: (goal: Omit<Goal, "id" | "createdAt" | "updatedAt">) => void;
  onUpdateGoal: (id: string, updates: Partial<Goal>) => void;
  onDeleteGoal: (id: string) => void;
}

const statusColumns = [
  { id: "backlog" as const, label: "대기", icon: Clock, color: "bg-slate-500" },
  { id: "todo" as const, label: "할 일", icon: AlertCircle, color: "bg-blue-500" },
  { id: "in_progress" as const, label: "진행중", icon: TrendingUp, color: "bg-amber-500" },
  { id: "review" as const, label: "검토", icon: Flag, color: "bg-purple-500" },
  { id: "completed" as const, label: "완료", icon: CheckCircle2, color: "bg-emerald-500" },
];

const priorityConfig = {
  low: { label: "낮음", color: "text-slate-600 bg-slate-100" },
  medium: { label: "보통", color: "text-blue-600 bg-blue-100" },
  high: { label: "높음", color: "text-red-600 bg-red-100" },
};

export function GoalsKanban({
  currentUser,
  goals,
  onCreateGoal,
  onUpdateGoal,
  onDeleteGoal,
}: GoalsKanbanProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [newGoal, setNewGoal] = useState({
    title: "",
    description: "",
    status: "todo" as Goal["status"],
    priority: "medium" as Goal["priority"],
    dueDate: "",
    tags: [] as string[],
    assignees: [currentUser.id],
  });

  const handleCreateGoal = () => {
    if (newGoal.title.trim()) {
      onCreateGoal({
        ...newGoal,
        progress: 0,
        createdBy: currentUser.id,
      });
      setNewGoal({
        title: "",
        description: "",
        status: "todo",
        priority: "medium",
        dueDate: "",
        tags: [],
        assignees: [currentUser.id],
      });
      setIsCreateDialogOpen(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, goalId: string) => {
    e.dataTransfer.setData("goalId", goalId);
  };

  const handleDrop = (e: React.DragEvent, newStatus: Goal["status"]) => {
    e.preventDefault();
    const goalId = e.dataTransfer.getData("goalId");
    onUpdateGoal(goalId, { status: newStatus });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const getDaysUntilDue = (dueDate?: string | Date) => {
    if (!dueDate) return null;
    const today = new Date();
    const due = dueDate instanceof Date ? dueDate : new Date(dueDate);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* 헤더 */}
      <div className="bg-white border-b p-6">
        <div className="max-w-[1800px] mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-[#5DADE2] to-[#0A2540] rounded-xl">
                <Target className="size-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[#0A2540]">목표 관리</h1>
                <p className="text-slate-600">Kanban 보드로 목표를 추적하세요</p>
              </div>
            </div>

            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[#5DADE2] hover:bg-[#5DADE2]/90 gap-2">
                  <Plus className="size-4" />
                  새 목표 추가
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>새 목표 생성</DialogTitle>
                  <DialogDescription>
                    달성하고자 하는 목표를 설정하세요
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-2 block">
                      목표 제목 *
                    </label>
                    <Input
                      placeholder="예: Q1 매출 목표 달성"
                      value={newGoal.title}
                      onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-2 block">
                      설명
                    </label>
                    <Textarea
                      placeholder="목표에 대한 상세 설명을 입력하세요"
                      value={newGoal.description}
                      onChange={(e) => setNewGoal({ ...newGoal, description: e.target.value })}
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-slate-700 mb-2 block">
                        우선순위
                      </label>
                      <Select
                        value={newGoal.priority}
                        onValueChange={(val) => setNewGoal({ ...newGoal, priority: val as Goal["priority"] })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">낮음</SelectItem>
                          <SelectItem value="medium">보통</SelectItem>
                          <SelectItem value="high">높음</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700 mb-2 block">
                        마감일
                      </label>
                      <Input
                        type="date"
                        value={newGoal.dueDate}
                        onChange={(e) => setNewGoal({ ...newGoal, dueDate: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    취소
                  </Button>
                  <Button onClick={handleCreateGoal} className="bg-[#5DADE2] hover:bg-[#5DADE2]/90">
                    생성
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* 통계 */}
          <div className="grid grid-cols-5 gap-4 mt-6">
            {statusColumns.map((col) => {
              const count = goals.filter(g => g.status === col.id).length;
              const Icon = col.icon;
              return (
                <Card key={col.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-lg", col.color.replace("bg-", "bg-") + "/10")}>
                      <Icon className={cn("size-4", col.color.replace("bg-", "text-"))} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-[#0A2540]">{count}</p>
                      <p className="text-sm text-slate-600">{col.label}</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {/* Kanban 보드 */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-[1800px] mx-auto">
          <div className="grid grid-cols-5 gap-4 h-full">
            {statusColumns.map((column) => {
              const columnGoals = goals.filter(g => g.status === column.id);
              const Icon = column.icon;

              return (
                <div
                  key={column.id}
                  className="flex flex-col"
                  onDrop={(e) => handleDrop(e, column.id)}
                  onDragOver={handleDragOver}
                >
                  {/* 컬럼 헤더 */}
                  <div className="bg-white rounded-t-xl border-t border-x p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className={cn("size-4", column.color.replace("bg-", "text-"))} />
                        <h3 className="font-semibold text-[#0A2540]">{column.label}</h3>
                      </div>
                      <Badge variant="secondary">{columnGoals.length}</Badge>
                    </div>
                  </div>

                  {/* 카드 목록 */}
                  <ScrollArea className="flex-1 bg-slate-100 rounded-b-xl border p-2 min-h-[500px]">
                    <div className="space-y-2">
                      <AnimatePresence>
                        {columnGoals.map((goal, index) => {
                          const daysUntilDue = getDaysUntilDue(goal.dueDate);
                          const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
                          const isUrgent = daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 3;

                          return (
                            <motion.div
                              key={goal.id}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ duration: 0.2, delay: index * 0.03 }}
                              draggable
                              onDragStartCapture={(e) => handleDragStart(e, goal.id)}
                              className="group"
                            >
                              <Card className="p-4 cursor-move hover:shadow-lg transition-all">
                                {/* 드래그 핸들 & 액션 */}
                                <div className="flex items-start justify-between mb-3">
                                  <GripVertical className="size-4 text-slate-400 flex-shrink-0" />
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100">
                                        <MoreVertical className="size-3" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => setSelectedGoal(goal)}>
                                        <Edit className="size-3 mr-2" />
                                        수정
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => onDeleteGoal(goal.id)}
                                        className="text-red-600"
                                      >
                                        <Trash2 className="size-3 mr-2" />
                                        삭제
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>

                                {/* 우선순위 */}
                                <Badge
                                  className={cn("text-xs mb-2", priorityConfig[goal.priority].color)}
                                >
                                  {priorityConfig[goal.priority].label}
                                </Badge>

                                {/* 제목 */}
                                <h4 className="font-semibold text-sm text-[#0A2540] mb-2 line-clamp-2">
                                  {goal.title}
                                </h4>

                                {/* 설명 */}
                                {goal.description && (
                                  <p className="text-xs text-slate-600 mb-3 line-clamp-2">
                                    {goal.description}
                                  </p>
                                )}

                                {/* 진행률 */}
                                {goal.progress > 0 && (
                                  <div className="mb-3">
                                    <div className="flex items-center justify-between text-xs mb-1">
                                      <span className="text-slate-600">진행률</span>
                                      <span className="font-semibold text-[#5DADE2]">{goal.progress}%</span>
                                    </div>
                                    <Progress value={goal.progress} className="h-1.5" />
                                  </div>
                                )}

                                {/* 태그 */}
                                {goal.tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mb-3">
                                    {goal.tags.slice(0, 2).map((tag) => (
                                      <Badge key={tag} variant="outline" className="text-xs">
                                        {tag}
                                      </Badge>
                                    ))}
                                    {goal.tags.length > 2 && (
                                      <Badge variant="outline" className="text-xs">
                                        +{goal.tags.length - 2}
                                      </Badge>
                                    )}
                                  </div>
                                )}

                                {/* 하단 메타 */}
                                <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t">
                                  <div className="flex items-center gap-2">
                                    {goal.dueDate && (
                                      <div
                                        className={cn(
                                          "flex items-center gap-1",
                                          isOverdue ? "text-red-600 font-semibold" : isUrgent ? "text-amber-600 font-semibold" : ""
                                        )}
                                      >
                                        <Calendar className="size-3" />
                                        <span>
                                          {isOverdue
                                            ? `${Math.abs(daysUntilDue!)}일 지남`
                                            : daysUntilDue === 0
                                            ? "오늘 마감"
                                            : daysUntilDue === 1
                                            ? "내일 마감"
                                            : `${daysUntilDue}일 남음`}
                                        </span>
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1">
                                    {goal.comments && goal.comments.length > 0 && (
                                      <div className="flex items-center gap-1">
                                        <MessageSquare className="size-3" />
                                        <span>{goal.comments.length}</span>
                                      </div>
                                    )}
                                    {goal.attachments && goal.attachments.length > 0 && (
                                      <div className="flex items-center gap-1 ml-2">
                                        <Paperclip className="size-3" />
                                        <span>{goal.attachments.length}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* 담당자 */}
                                {goal.assignees.length > 0 && (
                                  <div className="flex items-center gap-1 mt-3 pt-3 border-t">
                                    <Users className="size-3 text-slate-400" />
                                    <div className="flex -space-x-2">
                                      {goal.assignees.slice(0, 3).map((_, idx) => (
                                        <Avatar key={idx} className="w-6 h-6 border-2 border-white">
                                          <div className="w-full h-full bg-gradient-to-br from-[#5DADE2] to-[#0A2540] flex items-center justify-center text-white text-xs font-semibold">
                                            {currentUser.companyName.charAt(0)}
                                          </div>
                                        </Avatar>
                                      ))}
                                      {goal.assignees.length > 3 && (
                                        <div className="w-6 h-6 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-xs font-semibold text-slate-600">
                                          +{goal.assignees.length - 3}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </Card>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>

                      {columnGoals.length === 0 && (
                        <div className="text-center py-8 text-slate-400 text-sm">
                          카드를 여기로 드래그하세요
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
