import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { AuthCard } from "../components/auth/AuthCard"
import { createUserProfile } from "../firebase/profile"
import {
  sendVerificationEmail,
  signOutUser,
  signUpWithEmail,
  signInWithGoogle,
} from "../firebase/auth"
import { auth } from "../firebase/client"
import type { Role } from "../types/auth"

export function SignupPage() {
  const [role, setRole] = useState<Role>("company")
  const [loadingEmail, setLoadingEmail] = useState(false)
  const [loadingGoogle, setLoadingGoogle] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const isBusy = loadingEmail || loadingGoogle

  async function handleEmailSignup(
    nextRole: Role,
    email: string,
    password: string
  ) {
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
      auth.languageCode = "ko"
      await sendVerificationEmail(result.user)
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
      const result = await signInWithGoogle()
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
        subtitle="회사 또는 관리자 계정을 생성하세요."
        onGoogle={handleGoogleSignup}
        onSubmit={handleEmailSignup}
        onSwap={() => navigate("/login")}
        swapLabel="로그인"
        role={role}
        setRole={setRole}
        showGoogle={false}
        showExtraStep
        loadingEmail={loadingEmail}
        loadingGoogle={loadingGoogle}
        error={error}
      />
    </div>
  )
}
