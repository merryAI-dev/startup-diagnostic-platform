import { useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { AuthCard } from "../components/auth/AuthCard"
import { useAuth } from "../context/AuthContext"
import { createUserProfile, getUserProfile } from "../firebase/profile"
import {
  signOutUser,
  signInWithGoogle,
  signUpWithEmail,
} from "../firebase/auth"
import type { Role } from "../types/auth"

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
      const result = await signUpWithEmail(email, password)
      const requestedRole = nextRole
      const role: Role = "company"
      await createUserProfile(
        result.user.uid,
        role,
        requestedRole,
        result.user.email
      )
      await signOutUser()
      navigate(`/pending?role=${nextRole}`)
    } catch (err) {
      setError("회원가입에 실패했습니다. 입력값을 확인하세요.")
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
        setError("이미 가입된 계정입니다. 로그인 화면으로 이동해주세요.")
        await signOutUser()
        navigate("/login")
        return
      }
      const requestedRole = role
      const assignedRole: Role = "company"
      await createUserProfile(
        result.user.uid,
        assignedRole,
        requestedRole,
        result.user.email
      )
      await signOutUser()
      navigate(`/pending?role=${role}`)
    } catch (err) {
      setError("Google 회원가입에 실패했습니다.")
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
