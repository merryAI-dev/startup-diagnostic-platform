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
  MessageSquareText,
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
} from "lucide-react"
import { NavLink } from "react-router-dom"
import { cn } from "@/redesign/ui/utils"

type NavItem = {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const adminNavItems: NavItem[] = [
  { id: "admin-dashboard", label: "관리자 대시보드", icon: Shield },
  { id: "admin-applications", label: "신청 관리", icon: ClipboardList },
  { id: "admin-programs", label: "사업별 프로그램", icon: Target },
  { id: "admin-consultants", label: "컨설턴트 관리", icon: UserCog },
  { id: "admin-users", label: "사용자 관리", icon: Users },
  { id: "admin-communication", label: "커뮤니케이션 센터", icon: MessageSquareText },
  { id: "startup-diagnostic", label: "스타트업 진단시트", icon: FileText },
  { id: "pending-reports", label: "미작성 보고서", icon: AlertCircle },
]

const userNavItems: NavItem[] = [
  { id: "dashboard", label: "대시보드", icon: LayoutDashboard },
  { id: "notifications", label: "알림", icon: Bell },
  { id: "messages", label: "메시지", icon: MessageSquare },
  { id: "unified-calendar", label: "통합 캘린더", icon: CalendarRange },
  { id: "goals-kanban", label: "목표 관리", icon: KanbanSquare },
  { id: "ai-recommendations", label: "AI 추천", icon: Sparkles },
  { id: "team-collaboration", label: "팀 협업", icon: UserPlus },
  { id: "consultants", label: "컨설턴트", icon: UsersRound },
  { id: "regular", label: "정기 오피스아워", icon: Calendar },
  { id: "irregular", label: "비정기 오피스아워", icon: CalendarClock },
  { id: "history", label: "전체 내역", icon: FileText },
  { id: "company-metrics", label: "실적 관리", icon: TrendingUp },
  { id: "company-newsletter", label: "기업 리포트", icon: Newspaper },
  { id: "settings", label: "설정", icon: Settings },
]

type SidebarNavProps = {
  basePath: string
  userRole?: "admin" | "company"
}

export function SidebarNav({ basePath, userRole = "company" }: SidebarNavProps) {
  const isAdminUser = userRole === "admin"
  const navItems = isAdminUser ? [...adminNavItems, ...userNavItems] : userNavItems

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon
    return (
      <NavLink
        key={item.id}
        to={`${basePath}/${item.id}`}
        className={({ isActive }) =>
          cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
            isActive
              ? "bg-primary text-primary-foreground"
              : "text-foreground hover:bg-accent"
          )
        }
      >
        <Icon className="h-5 w-5" />
        <span>{item.label}</span>
      </NavLink>
    )
  }

  return (
    <div className="flex h-full w-64 flex-col border-r bg-white">
      <nav className="flex-1 space-y-1 p-4">
        {isAdminUser ? (
          <>
            <div className="mb-2 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                관리자
              </p>
            </div>
            {adminNavItems.map(renderNavItem)}
            <div className="mb-2 mt-4 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                사용자
              </p>
            </div>
            {userNavItems.map(renderNavItem)}
          </>
        ) : (
          navItems.map(renderNavItem)
        )}
      </nav>

      <div className="border-t p-4">
        <div className="rounded-lg bg-blue-50 p-3">
          <p className="mb-1 text-xs text-blue-900">도움이 필요하신가요?</p>
          <span className="text-xs text-primary">사용 가이드 보기</span>
        </div>
      </div>
    </div>
  )
}
