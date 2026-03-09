import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { AuthCard } from "@/components/auth/AuthCard"
import { useAuth } from "@/context/AuthContext"
import { getUserProfile } from "@/firebase/profile"
import { signInWithEmail, signInWithGoogle, signOutUser } from "@/firebase/auth"
import type { Role } from "@/types/auth"

export function LoginPage() {
  const [loadingEmail, setLoadingEmail] = useState(false)
  const [loadingGoogle, setLoadingGoogle] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { refreshProfile } = useAuth()
  const isBusy = loadingEmail || loadingGoogle

  async function routeAfterLogin(uid: string) {
    let profile = null
    try {
      profile = await getUserProfile(uid)
    } catch (error: any) {
      const code = error?.code ?? ""
      if (code === "permission-denied") {
        setError("프로필 접근 권한이 없습니다. 관리자에게 문의해주세요.")
      } else {
        setError("프로필 정보를 불러오지 못했습니다.")
      }
      await signOutUser()
      return
    }

    if (!profile) {
      navigate("/signup")
      return
    }

    if (profile.active === false) {
      await signOutUser()
      navigate(`/pending?role=${profile.requestedRole ?? profile.role}`)
      return
    }

    navigate(
      profile.role === "admin" || profile.role === "consultant"
        ? "/admin"
        : "/company"
    )
  }

  async function handleEmailLogin(
    _unusedRole: Role,
    email: string,
    password: string
  ) {
    if (isBusy) return
    setLoadingEmail(true)
    setError(null)
    try {
      const result = await signInWithEmail(email, password)
      await refreshProfile()
      await routeAfterLogin(result.user.uid)
    } catch (err: any) {
      const code = err?.code ?? ""
      if (code === "auth/user-not-found" || code === "auth/invalid-credential") {
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

  async function handleGoogleLogin() {
    if (isBusy) return
    setLoadingGoogle(true)
    setError(null)
    try {
      const result = await signInWithGoogle()
      await refreshProfile()
      await routeAfterLogin(result.user.uid)
    } catch (err: any) {
      const code = err?.code ?? ""
      if (code === "auth/popup-closed-by-user") {
        setError("Google 로그인 창이 닫혔습니다. 다시 시도해주세요.")
      } else if (code === "auth/popup-blocked") {
        setError("팝업이 차단되었습니다. 브라우저 팝업 허용 후 다시 시도해주세요.")
      } else if (code === "auth/cancelled-popup-request") {
        setError("이미 로그인 요청이 진행 중입니다.")
      } else {
        setError("Google 로그인에 실패했습니다. 다시 시도해주세요.")
      }
    } finally {
      setLoadingGoogle(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center">
      <div className="w-full max-w-5xl">
        <AuthCard
          title="로그인"
          subtitle="이메일/비밀번호 또는 Google 계정으로 로그인하세요."
          onSubmit={handleEmailLogin}
          onSwap={() => navigate("/signup")}
          swapLabel="회원가입"
          role="company"
          showRoleSelector={false}
          loadingEmail={loadingEmail}
          onGoogle={handleGoogleLogin}
          showGoogle
          loadingGoogle={loadingGoogle}
          error={error}
        />
      </div>
    </div>
  )
}
