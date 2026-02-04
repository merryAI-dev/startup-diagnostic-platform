import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { AuthCard } from "../components/auth/AuthCard"
import { useAuth } from "../context/AuthContext"
import {
  activateUserProfile,
  createUserProfile,
  getUserProfile,
  updateProfileRole,
} from "../firebase/profile"
import { auth } from "../firebase/client"
import {
  signInWithEmail,
  signInWithGoogle,
} from "../firebase/auth"
import type { Role } from "../types/auth"

export function LoginPage() {
  const [role, setRole] = useState<Role>("company")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { refreshProfile } = useAuth()

  async function routeAfterLogin(uid: string) {
    const profile = await getUserProfile(uid)
    if (!profile) {
      setError("프로필이 없습니다. 회원가입을 진행해주세요.")
      navigate("/signup")
      return
    }
    if (!profile.active) {
      // Ensure we have the latest verification state.
      if (auth.currentUser) {
        await auth.currentUser.reload()
      }
      if (
        auth.currentUser?.emailVerified
        && profile.requestedRole !== "admin"
      ) {
        if (profile.role !== "company") {
          await updateProfileRole(uid, "company")
        }
        await activateUserProfile(uid)
        const refreshed = await getUserProfile(uid)
        if (refreshed?.active) {
          navigate(refreshed.role === "admin" ? "/admin" : "/company")
          return
        }
      }
      navigate("/pending")
      return
    }
    navigate(profile.role === "admin" ? "/admin" : "/company")
  }

  async function handleEmailLogin(
    _role: Role,
    email: string,
    password: string
  ) {
    setLoading(true)
    setError(null)
    try {
      const result = await signInWithEmail(email, password)
      await refreshProfile()
      await routeAfterLogin(result.user.uid)
    } catch (err) {
      setError("로그인에 실패했습니다. 입력값을 확인하세요.")
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleLogin() {
    setLoading(true)
    setError(null)
    try {
      const result = await signInWithGoogle()
      const existingProfile = await getUserProfile(result.user.uid)
      if (!existingProfile) {
        const requestedRole = role
        const assignedRole: Role = "company"
        await createUserProfile(
          result.user.uid,
          assignedRole,
          requestedRole,
          result.user.email
        )
      }
      await refreshProfile()
      await routeAfterLogin(result.user.uid)
    } catch (err) {
      setError("Google 로그인에 실패했습니다.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center">
      <div className="w-full max-w-5xl">
        <AuthCard
          title="로그인"
          subtitle="계정으로 로그인하세요."
          onGoogle={handleGoogleLogin}
          onSubmit={handleEmailLogin}
          onSwap={() => navigate("/signup")}
          swapLabel="회원가입"
          role={role}
          setRole={setRole}
          showRoleSelector
          loading={loading}
          error={error}
        />
      </div>
    </div>
  )
}
