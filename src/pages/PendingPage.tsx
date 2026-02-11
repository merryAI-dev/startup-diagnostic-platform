import { useEffect, useMemo } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { PendingApproval } from "../components/auth/PendingApproval"
import { useAuth } from "../context/AuthContext"
import type { Role } from "../types/auth"

export function PendingPage() {
  const { profile } = useAuth()
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
    <PendingApproval
      role={profile?.requestedRole ?? profile?.role ?? roleFromQuery}
      onBack={() => navigate("/login")}
    />
  )
}
