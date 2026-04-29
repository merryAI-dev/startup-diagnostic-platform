import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { AuthCard } from "@/components/auth/AuthCard"
import { useAuth } from "@/context/AuthContext"
import { getSignupRequest, getUserProfile } from "@/firebase/profile"
import { signInWithEmail, signOutUser } from "@/firebase/auth"
import { readFirebaseErrorCode } from "@/firebase/errors"
import type { Role } from "@/types/auth"
import { PENDING_REQUEST_FLAG } from "@/constants/signup"

export function LoginPage() {
  const [loadingEmail, setLoadingEmail] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { refreshProfile } = useAuth()
  const isBusy = loadingEmail

  async function routeAfterLogin(uid: string): Promise<boolean> {
    let profile = null
    let signupRequest = null
    try {
      ;[profile, signupRequest] = await Promise.all([getUserProfile(uid), getSignupRequest(uid)])
    } catch (error: unknown) {
      const code = readFirebaseErrorCode(error)
      if (code === "permission-denied") {
        setError("프로필 접근 권한이 없습니다. 관리자에게 문의해주세요.")
      } else {
        setError("프로필 정보를 불러오지 못했습니다.")
      }
      await signOutUser()
      return false
    }

    if (!profile && !signupRequest) {
      navigate("/signup")
      return true
    }

    if (profile?.active === true) {
      navigate(profile.role === "admin" || profile.role === "consultant" ? "/admin" : "/company")
      return true
    }

    if (profile?.active === false || signupRequest) {
      await signOutUser()
      sessionStorage.setItem(PENDING_REQUEST_FLAG, "1")
      navigate(
        `/pending?role=${signupRequest?.requestedRole ?? signupRequest?.role ?? profile?.requestedRole ?? profile?.role}`,
      )
      return true
    }

    navigate("/signup")
    return true
  }

  async function handleEmailLogin(_unusedRole: Role, email: string, password: string) {
    if (isBusy) return
    setLoadingEmail(true)
    setError(null)
    try {
      const result = await signInWithEmail(email, password)
      await refreshProfile()
      await routeAfterLogin(result.user.uid)
    } catch (error: unknown) {
      const code = readFirebaseErrorCode(error)
      if (code === "auth/firebase-not-configured") {
        setError("Firebase 환경변수가 설정되지 않았습니다. 로컬 `.env`를 먼저 구성해주세요.")
      } else if (code === "auth/user-not-found" || code === "auth/invalid-credential") {
        setError("가입되지 않은 계정이거나 이메일/비밀번호가 올바르지 않습니다.")
      } else if (code === "auth/wrong-password") {
        setError("비밀번호가 올바르지 않습니다.")
      } else if (code === "auth/too-many-requests") {
        setError("로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.")
      } else {
        setError("로그인에 실패했습니다. 입력값을 확인하세요.")
      }
    } finally {
      setLoadingEmail(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center">
      <div className="w-full max-w-5xl">
        <AuthCard
          title="로그인"
          subtitle="이메일/비밀번호로 로그인하세요."
          onSubmit={handleEmailLogin}
          onForgotPassword={() => navigate("/reset-password")}
          onSwap={() => navigate("/signup")}
          swapLabel="회원가입"
          role="company"
          showRoleSelector={false}
          loadingEmail={loadingEmail}
          error={error}
        />
      </div>
    </div>
  )
}
