import { useEffect, useMemo } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { PendingApproval } from "@/components/auth/PendingApproval"
import { useAuth } from "@/context/AuthContext"
import { signOutUser } from "@/firebase/auth"
import type { Role } from "@/types/auth"
import { PENDING_REQUEST_FLAG, PENDING_SIGNUP_KEY } from "@/constants/signup"

export function PendingPage() {
  const { profile, signupRequest } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const roleFromQuery = useMemo<Role | null>(() => {
    const params = new URLSearchParams(location.search)
    const value = params.get("role")
    if (value === "admin" || value === "company" || value === "consultant") {
      return value
    }
    return null
  }, [location.search])

  useEffect(() => {
    if (!profile?.active) return
    navigate(
      profile.role === "admin" || profile.role === "consultant"
        ? "/admin"
        : "/company"
    )
  }, [profile, navigate])

  return (
    <div className="h-full overflow-hidden bg-gray-50 p-6">
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col items-center justify-center gap-6">
        <PendingApproval
          role={signupRequest?.requestedRole ?? signupRequest?.role ?? profile?.requestedRole ?? profile?.role ?? roleFromQuery}
          onBack={() => navigate("/login")}
        />
      </div>
    </div>
  )
}
