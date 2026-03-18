import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AuthCard } from "@/components/auth/AuthCard"
import { useAuth } from "@/context/AuthContext"
import { signOutUser } from "@/firebase/auth"
import type { Role } from "@/types/auth"
import { toast } from "sonner"
import { PENDING_REQUEST_FLAG, PENDING_SIGNUP_KEY } from "@/constants/signup"

function getSignupErrorMessage(error: any) {
  const code = error?.code ?? ""
  if (code === "auth/email-already-in-use") {
    return "이미 사용 중인 이메일입니다."
  }
  if (code === "auth/invalid-email") {
    return "올바르지 않은 이메일 형식입니다."
  }
  if (code === "auth/weak-password") {
    return "비밀번호가 너무 약합니다. 더 강한 비밀번호를 입력해주세요."
  }
  return code
    ? `회원가입에 실패했습니다. (${code})`
    : "회원가입에 실패했습니다. 입력값을 확인하세요."
}

type PendingSignupDraft = {
  role: Role
  email: string
  password?: string
}

export function SignupPage() {
  const [role, setRole] = useState<Role>("company")
  const [loadingEmail, setLoadingEmail] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { user, profile, signupRequest, loading } = useAuth()
  const isBusy = loadingEmail

  useEffect(() => {
    if (loading || !user) return
    if (profile?.active === true) {
      navigate(
        profile.role === "admin" || profile.role === "consultant"
          ? "/admin"
          : "/company",
        { replace: true }
      )
      return
    }

    if (profile?.active === false || signupRequest) {
      sessionStorage.removeItem(PENDING_REQUEST_FLAG)
      sessionStorage.removeItem(PENDING_SIGNUP_KEY)
      void signOutUser().catch(() => {
        // ignore sign-out errors and keep the signup form accessible
      })
    }
  }, [loading, navigate, profile, signupRequest, user])

  function savePendingSignup(payload: PendingSignupDraft) {
    sessionStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify(payload))
  }

  async function handleEmailSignup(
    nextRole: Role,
    email: string,
    password: string
  ) {
    if (isBusy) return
    setLoadingEmail(true)
    setError(null)
    try {
      savePendingSignup({
        role: nextRole,
        email: email.trim(),
        password,
      })
      navigate(`/signup-info?role=${nextRole}`)
    } catch (err) {
      toast.error(getSignupErrorMessage(err))
    } finally {
      setLoadingEmail(false)
    }
  }

  async function handleSwapToLogin() {
    if (user) {
      await signOutUser()
    }
    navigate("/login")
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        불러오는 중...
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center">
      <AuthCard
        title="회원가입"
        subtitle="스타트업, 관리자, 컨설턴트 중 역할을 선택해 계정을 생성하세요."
        onSubmit={handleEmailSignup}
        onSwap={handleSwapToLogin}
        swapLabel="로그인"
        role={role}
        setRole={setRole}
        showEmailForm
        showExtraStep={false}
        loadingEmail={loadingEmail}
        error={error}
        notice={null}
      />
    </div>
  )
}
