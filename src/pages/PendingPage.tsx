import { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { PendingApproval } from "../components/auth/PendingApproval"
import { useAuth } from "../context/AuthContext"
import type { Role } from "../types/auth"
import { activateUserProfile } from "../firebase/profile"

export function PendingPage() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [activationError, setActivationError] = useState<string | null>(null)

  const roleFromQuery = useMemo<Role | null>(() => {
    const params = new URLSearchParams(location.search)
    const value = params.get("role")
    if (value === "admin" || value === "company") {
      return value
    }
    return null
  }, [location.search])

  const noticeFromQuery = useMemo<string | null>(() => {
    const params = new URLSearchParams(location.search)
    const reason = params.get("reason")
    if (reason === "google") {
      return "Google 로그인도 이메일 인증 또는 관리자 승인이 완료되어야 사용할 수 있습니다."
    }
    return null
  }, [location.search])

  useEffect(() => {
    let isMounted = true
    async function tryActivate() {
      if (!user || !profile) return
      if (profile.active) {
        navigate(profile.role === "admin" ? "/admin" : "/company")
        return
      }
      await user.reload()
      if (!user.emailVerified) return
      if (profile.requestedRole === "admin") return
      try {
        await activateUserProfile(user.uid)
        await refreshProfile()
        if (!isMounted) return
        navigate(profile.role === "admin" ? "/admin" : "/company")
      } catch (err) {
        if (!isMounted) return
        setActivationError("승인 처리에 실패했습니다. 다시 시도해주세요.")
      }
    }
    tryActivate()
    return () => {
      isMounted = false
    }
  }, [user, profile, refreshProfile, navigate])

  return (
    <PendingApproval
      role={profile?.role ?? roleFromQuery}
      onBack={() => navigate("/login")}
      error={activationError ?? undefined}
      notice={noticeFromQuery ?? undefined}
    />
  )
}
