import { useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { AuthCard } from "@/components/auth/AuthCard"
import { useAuth } from "@/context/AuthContext"
import { createUserProfile, getUserProfile } from "@/firebase/profile"
import {
  signOutUser,
  signInWithGoogle,
  signUpWithEmail,
} from "@/firebase/auth"
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

const PENDING_SIGNUP_KEY = "pending-signup";

export function SignupPage() {
  const [role, setRole] = useState<Role>("company")
  const [loadingEmail, setLoadingEmail] = useState(false)
  const [loadingGoogle, setLoadingGoogle] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isBusy = loadingEmail || loadingGoogle
  const source = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get("source")
  }, [location.search])
  const isGoogleLoginContinuation = source === "google-login"
  const hasGoogleSessionWithoutProfile = isGoogleLoginContinuation && !!user && !profile

  async function handleEmailSignup(
    nextRole: Role,
    email: string,
    password: string
  ) {
    if (isGoogleLoginContinuation) {
      setError("Google 계정으로 가입 중입니다. 아래 Google 버튼으로 완료해주세요.")
      return
    }
    if (isBusy) return
    setLoadingEmail(true)
    setError(null)
    try {
      if (nextRole === "admin") {
        const result = await signUpWithEmail(email, password)
        await createUserProfile(
          result.user.uid,
          "admin",
          "admin",
          result.user.email,
          { active: false }
        )
        await signOutUser()
        toast.success("관리자 승인 대기 중입니다. 승인 후 로그인해주세요.")
        navigate("/login")
        return
      }
      sessionStorage.setItem(
        PENDING_SIGNUP_KEY,
        JSON.stringify({
          role: nextRole,
          email: email.trim(),
          password,
        })
      )
      navigate(`/signup-info?role=${nextRole}`)
    } catch (err) {
      toast.error(getSignupErrorMessage(err))
    } finally {
      setLoadingEmail(false)
    }
  }

  async function handleGoogleSignup() {
    if (isBusy) return
    setLoadingGoogle(true)
    setError(null)
    try {
      const result = hasGoogleSessionWithoutProfile && user
        ? { user }
        : await signInWithGoogle()
      const existingProfile = await getUserProfile(result.user.uid)
      if (existingProfile) {
        toast.error("이미 가입된 계정입니다. 로그인 화면으로 이동해주세요.")
        await signOutUser()
        navigate("/login")
        return
      }
      if (role === "admin") {
        await createUserProfile(
          result.user.uid,
          "admin",
          "admin",
          result.user.email,
          { active: false }
        )
        await signOutUser()
        toast.success("관리자 승인 대기 중입니다. 승인 후 로그인해주세요.")
        navigate("/login")
        return
      }
      navigate(`/signup-info?role=${role}`)
    } catch (err) {
      toast.error(getSignupErrorMessage(err))
    } finally {
      setLoadingGoogle(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center">
      <AuthCard
        title="회원가입"
        subtitle={
          hasGoogleSessionWithoutProfile
            ? "Google 계정 확인이 완료되었습니다. 역할 선택 후 가입을 완료하세요."
            : "회사, 관리자, 컨설턴트 중 역할을 선택해 계정을 생성하세요."
        }
        onGoogle={handleGoogleSignup}
        onSubmit={handleEmailSignup}
        onSwap={() => navigate("/login")}
        swapLabel="로그인"
        role={role}
        setRole={setRole}
        showGoogle
        showEmailForm={!hasGoogleSessionWithoutProfile}
        showExtraStep
        loadingEmail={loadingEmail}
        loadingGoogle={loadingGoogle}
        error={error}
        notice={
          hasGoogleSessionWithoutProfile
            ? "현재 로그인된 Google 계정으로 가입이 진행됩니다."
            : isGoogleLoginContinuation
              ? "Google 세션이 만료되었으면 Google 버튼을 눌러 다시 인증하세요."
              : null
        }
        googleLabel="Google로 회원가입"
      />
    </div>
  )
}
