import { Navigate, useLocation } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
import { Topbar } from "@/redesign/app/components/layout/topbar"
import { SidebarNav } from "@/redesign/app/components/layout/sidebar-nav"
import { ContentLoadingOverlay } from "@/redesign/app/components/ui/content-loading-overlay"
import type { User } from "@/redesign/app/lib/types"
import type { Role } from "@/types/auth"

export function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth()
  if (loading) {
    return <LoadingScreen />
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }
  return children
}

export function RequireApproved({ children }: { children: JSX.Element }) {
  const { profile, signupRequest, loading } = useAuth()
  if (loading) {
    return <LoadingScreen />
  }
  if (profile?.active === true) {
    return children
  }
  if (profile?.active === false || signupRequest) {
    return <Navigate to="/pending" replace />
  }
  return <Navigate to="/signup" replace />
}

export function RequireRole({
  role,
  children,
}: {
  role: Role | Role[]
  children: JSX.Element
}) {
  const { profile, signupRequest, loading } = useAuth()
  if (loading) {
    return <LoadingScreen />
  }
  if (profile?.active === true) {
    const allowedRoles = Array.isArray(role) ? role : [role]
    if (!allowedRoles.includes(profile.role)) {
      return <Navigate to="/" replace />
    }
    return children
  }
  if (signupRequest) {
    return <Navigate to="/pending" replace />
  }
  if (!profile) {
    return <Navigate to="/signup" replace />
  }
  if (profile.active === false) {
    return <Navigate to="/pending" replace />
  }
  const allowedRoles = Array.isArray(role) ? role : [role]
  if (!allowedRoles.includes(profile.role)) {
    return <Navigate to="/" replace />
  }
  return children
}

export function LoadingScreen() {
  const location = useLocation()
  const rootSegment = location.pathname.split("/")[1] ?? ""
  const routeSegment = location.pathname.split("/")[2] ?? ""
  const loadingRole =
    routeSegment.startsWith("consultant-")
      ? "consultant"
      : rootSegment === "admin"
        ? "admin"
        : "user"
  const loadingPage =
    routeSegment ||
    (loadingRole === "consultant"
      ? "consultant-calendar"
      : loadingRole === "admin"
        ? "admin-dashboard"
        : "dashboard")
  const loadingUser: User =
    loadingRole === "admin"
      ? {
          id: "loading-admin",
          email: "",
          companyName: "관리자",
          programName: "MYSC",
          role: "admin",
        }
      : loadingRole === "consultant"
        ? {
            id: "loading-consultant",
            email: "",
            companyName: "컨설턴트",
            programName: "MYSC",
            role: "consultant",
          }
        : {
            id: "loading-user",
            email: "",
            companyName: "회사",
            programName: "MYSC",
            role: "user",
          }

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <Topbar user={loadingUser} onLogout={async () => {}} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <SidebarNav
          currentPage={loadingPage}
          onNavigate={() => {}}
          userRole={loadingRole}
          disabledPages={new Set()}
        />
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-gray-50">
          <ContentLoadingOverlay />
        </main>
      </div>
    </div>
  )
}
