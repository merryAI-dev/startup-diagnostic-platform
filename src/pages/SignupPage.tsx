import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { AuthCard } from "@/components/auth/AuthCard"
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
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const isBusy = loadingEmail

  async function handleEmailSignup(
    nextRole: Role,
    email: string,
    password: string
  ) {
    if (isBusy) return
    setLoadingEmail(true)
    setError(null)
    try {
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

  return (
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center">
      <AuthCard
        title="회원가입"
        subtitle="스타트업, 관리자, 컨설턴트 중 역할을 선택해 계정을 생성하세요."
        onSubmit={handleEmailSignup}
        onSwap={() => navigate("/login")}
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
