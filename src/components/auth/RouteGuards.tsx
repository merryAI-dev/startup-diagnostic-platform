import { Navigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
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
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-600 shadow-sm">
        로딩 중...
      </div>
    </div>
  )
}
