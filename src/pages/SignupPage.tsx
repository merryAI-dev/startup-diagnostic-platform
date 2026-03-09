import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AuthCard } from "@/components/auth/AuthCard"
import { useAuth } from "@/context/AuthContext"
import { signOutUser } from "@/firebase/auth"
import type { Role } from "@/types/auth"
import { toast } from "sonner"

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
  provider?: "email" | "google"
}

const PENDING_SIGNUP_KEY = "pending-signup"

export function SignupPage() {
  const [role, setRole] = useState<Role>("company")
  const [loadingEmail, setLoadingEmail] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { user, profile, loading } = useAuth()
  const isBusy = loadingEmail
  const isOnboardingSignedInUser = !loading && Boolean(user) && !profile

  useEffect(() => {
    if (loading || !user || !profile) return
    if (profile.active === false) {
      navigate(`/pending?role=${profile.requestedRole ?? profile.role}`, {
        replace: true,
      })
      return
    }
    navigate(
      profile.role === "admin" || profile.role === "consultant"
        ? "/admin"
        : "/company",
      { replace: true }
    )
  }, [loading, navigate, profile, user])

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
        provider: "email",
      })
      navigate(`/signup-info?role=${nextRole}`)
    } catch (err) {
      toast.error(getSignupErrorMessage(err))
    } finally {
      setLoadingEmail(false)
    }
  }

  function handleSignedInContinue(nextRole: Role) {
    if (!user) {
      setError("로그인 상태를 확인할 수 없습니다. 다시 로그인해주세요.")
      return
    }
    setError(null)
    savePendingSignup({
      role: nextRole,
      email: user.email ?? "",
      provider: "google",
    })
    navigate(`/signup-info?role=${nextRole}`)
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
        subtitle={
          isOnboardingSignedInUser
            ? "역할 선택 후 필수 정보를 입력하면 승인 대기로 접수됩니다."
            : "회사, 관리자, 컨설턴트 중 역할을 선택해 계정을 생성하세요."
        }
        onSubmit={handleEmailSignup}
        onContinue={handleSignedInContinue}
        continueLabel="역할 선택 후 계속"
        onSwap={handleSwapToLogin}
        swapLabel="로그인"
        role={role}
        setRole={setRole}
        showEmailForm={!isOnboardingSignedInUser}
        showExtraStep={false}
        loadingEmail={loadingEmail}
        error={error}
        notice={null}
      />
    </div>
  )
}
