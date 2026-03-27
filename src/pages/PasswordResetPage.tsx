import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { AuthCard } from "@/components/auth/AuthCard"
import { readFirebaseErrorCode } from "@/firebase/errors"
import { requestPasswordReset } from "@/firebase/auth"
import type { Role } from "@/types/auth"

export function PasswordResetPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const navigate = useNavigate()

  async function handlePasswordReset(_unusedRole: Role, email: string, _unusedPassword: string) {
    if (loading) return

    setLoading(true)
    setError(null)
    setNotice(null)

    try {
      await requestPasswordReset(email)
      setNotice(
        "입력한 이메일이 가입된 계정과 일치하면 비밀번호 재설정 메일이 발송됩니다. 메일함과 스팸함을 확인해주세요.",
      )
    } catch (error: unknown) {
      const code = readFirebaseErrorCode(error)

      if (code === "auth/invalid-email") {
        setError("올바른 이메일 형식이 아닙니다.")
      } else if (code === "auth/too-many-requests") {
        setError("요청이 너무 많습니다. 잠시 후 다시 시도해주세요.")
      } else {
        setError("비밀번호 재설정 메일을 보내지 못했습니다. 잠시 후 다시 시도해주세요.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center">
      <div className="w-full max-w-5xl">
        <AuthCard
          title="비밀번호 재설정"
          subtitle="가입한 이메일을 입력하면 비밀번호 재설정 링크를 보내드립니다."
          submitLabel="재설정 메일 보내기"
          onSubmit={handlePasswordReset}
          onSwap={() => navigate("/login")}
          swapLabel="로그인"
          role="company"
          showRoleSelector={false}
          showPasswordField={false}
          loadingEmail={loading}
          error={error}
          notice={notice}
        />
      </div>
    </div>
  )
}
