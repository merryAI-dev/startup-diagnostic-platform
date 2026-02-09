import { Calendar, CalendarClock, FileText, Settings, LayoutDashboard, Shield, ClipboardList, Users, UserCog, MessageSquareText, Target, UsersRound, AlertCircle, TrendingUp, Newspaper, Bell, MessageSquare, Sparkles, CalendarRange, KanbanSquare, UserPlus } from "lucide-react";
import { cn } from "../ui/utils";

interface SidebarNavProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  userRole?: string;
  disabledPages?: Set<string>;
}

const adminNavItems = [
  { id: "admin-dashboard", label: "관리자 대시보드", icon: Shield },
  { id: "admin-applications", label: "신청 관리", icon: ClipboardList },
  { id: "admin-programs", label: "사업별 프로그램", icon: Target },
  { id: "admin-consultants", label: "컨설턴트 관리", icon: UserCog },
  { id: "admin-users", label: "사용자 관리", icon: Users },
  { id: "admin-communication", label: "커뮤니케이션 센터", icon: MessageSquareText },
  { id: "startup-diagnostic", label: "스타트업 진단시트", icon: FileText },
  { id: "pending-reports", label: "미작성 보고서", icon: AlertCircle }, // 추가
];

const userNavItems = [
  { id: "dashboard", label: "대시보드", icon: LayoutDashboard },
  { id: "notifications", label: "알림", icon: Bell }, // 새로 추가
  { id: "messages", label: "메시지", icon: MessageSquare }, // 새로 추가
  { id: "unified-calendar", label: "통합 캘린더", icon: CalendarRange }, // 새로 추가
  { id: "goals-kanban", label: "목표 관리", icon: KanbanSquare }, // 새로 추가
  { id: "ai-recommendations", label: "AI 추천", icon: Sparkles }, // 새로 추가
  { id: "team-collaboration", label: "팀 협업", icon: UserPlus }, // 새로 추가
  { id: "consultants", label: "컨설턴트", icon: UsersRound },
  { id: "regular", label: "정기 오피스아워", icon: Calendar },
  { id: "irregular", label: "비정기 오피스아워", icon: CalendarClock },
  { id: "history", label: "전체 내역", icon: FileText },
  { id: "company-metrics", label: "실적 관리", icon: TrendingUp },
  { id: "company-newsletter", label: "기업 리포트", icon: Newspaper }, // 추가
  { id: "company-info", label: "기업 정보 입력", icon: FileText },
  { id: "settings", label: "설정", icon: Settings },
];

export function SidebarNav({
  currentPage,
  onNavigate,
  userRole = "user",
  disabledPages,
}: SidebarNavProps) {
  const isAdminUser = userRole === "admin" || userRole === "consultant" || userRole === "staff";
  const navItems = isAdminUser ? adminNavItems : userNavItems;

  return (
    <div className="w-64 border-r bg-white h-full flex flex-col">
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          const isDisabled = disabledPages?.has(item.id) ?? false;

          return (
            <button
              key={item.id}
              onClick={() => {
                if (isDisabled) return;
                onNavigate(item.id);
              }}
              disabled={isDisabled}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left",
                isDisabled
                  ? "text-slate-300 cursor-not-allowed bg-transparent"
                  : isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-accent"
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-sm">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t">
        <div className="p-3 bg-blue-50 rounded-lg">
          <p className="text-xs text-blue-900 mb-1">도움이 필요하신가요?</p>
          <a href="#" className="text-xs text-primary hover:underline">
            사용 가이드 보기
          </a>
        </div>
      </div>
    </div>
  );
}
