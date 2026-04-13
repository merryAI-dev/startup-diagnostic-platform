import { type ComponentType } from "react";
import {
  AlertCircle,
  Bell,
  Calendar,
  CalendarClock,
  CalendarRange,
  ClipboardList,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  MessageSquare,
  Newspaper,
  Settings,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  UserCog,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";
import { cn } from "@/redesign/app/components/ui/utils";

interface SidebarNavProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  userRole?: string;
  disabledPages?: Set<string>;
  attentionPages?: Set<string>;
}

type NavItem = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const adminNavItems: NavItem[] = [
  { id: "admin-dashboard", label: "관리자 대시보드", icon: Shield },
  { id: "admin-applications", label: "신청 관리", icon: ClipboardList },
  { id: "admin-program-list", label: "사업 관리", icon: FileText },
  { id: "startup-diagnostic", label: "기업 관리", icon: FileText },
  { id: "admin-agendas", label: "아젠다 관리", icon: FileText },
  { id: "admin-consultants", label: "컨설턴트 관리", icon: UserCog },
  { id: "admin-users", label: "사용자 관리", icon: Users },
  { id: "pending-reports", label: "오피스아워 보고서", icon: AlertCircle }, // 추가
];

const consultantNavItems: NavItem[] = [
  { id: "consultant-calendar", label: "내 일정 캘린더", icon: CalendarRange },
  { id: "consultant-profile", label: "내 정보 입력", icon: UserCog },
  { id: "consultant-companies", label: "기업 등록", icon: UsersRound },
  { id: "pending-reports", label: "오피스아워 일지", icon: FileText },
  { id: "admin-applications", label: "신청 관리", icon: ClipboardList },
];

const userNavItems: NavItem[] = [
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

const companyCoreNavIds = new Set([
  "dashboard",
  "regular",
  "company-metrics",
  "company-info",
  "settings",
]);

const activeNavIdByPage: Record<string, string> = {
  "regular-detail": "regular",
  "regular-wizard": "regular",
  "irregular-wizard": "irregular",
};

export function SidebarNav({
  currentPage,
  onNavigate,
  userRole = "user",
  disabledPages,
  attentionPages,
}: SidebarNavProps) {
  const isAdminUser = userRole === "admin" || userRole === "staff";
  const isConsultantUser = userRole === "consultant";
  const navItems = isAdminUser
    ? adminNavItems
    : isConsultantUser
      ? consultantNavItems
      : userNavItems;
  const visibleNavItems = navItems.filter((item) => item.id !== "admin-communication");
  const companyCoreNavItems = userNavItems.filter((item) =>
    companyCoreNavIds.has(item.id)
  );
  const activeNavId = activeNavIdByPage[currentPage] ?? currentPage;

  const renderNavButton = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = activeNavId === item.id;
    const isDisabled = disabledPages?.has(item.id) ?? false;
    const needsAttention = attentionPages?.has(item.id) ?? false;

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
        <span className="text-sm flex-1">{item.label}</span>
        {needsAttention && (
          <span className="h-2 w-2 rounded-full bg-red-500" />
        )}
      </button>
    );
  };

  return (
    <div className="flex h-full w-64 flex-col border-r border-slate-300 bg-slate-200">
      <nav className="flex-1 p-4 space-y-1">
        {isAdminUser || isConsultantUser ? (
          visibleNavItems.map((item) => renderNavButton(item))
        ) : (
          <>
            {companyCoreNavItems.map((item) => renderNavButton(item))}
          </>
        )}
      </nav>

    </div>
  );
}
