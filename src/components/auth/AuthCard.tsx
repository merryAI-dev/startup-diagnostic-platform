import { useState } from "react"
import type { Role } from "@/types/auth"
import { RoleSelector } from "@/components/auth/RoleSelector"

type AuthCardProps = {
  title: string
  subtitle: string
  onSubmit: (role: Role, email: string, password: string) => void
  onContinue?: (role: Role) => void
  continueLabel?: string
  onSwap: () => void
  swapLabel: string
  role?: Role
  setRole?: (role: Role) => void
  showRoleSelector?: boolean
  showEmailForm?: boolean
  showExtraStep?: boolean
  loadingEmail?: boolean
  error?: string | null
  notice?: string | null
  submitLabel?: string
  swapPrompt?: string
  showPasswordField?: boolean
  onForgotPassword?: () => void
  forgotPasswordPrompt?: string
  forgotPasswordLabel?: string
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function getEmailError(value: string) {
  if (!value.trim()) return "이메일을 입력해주세요."
  if (!emailPattern.test(value)) return "올바른 이메일 형식이 아닙니다."
  return null
}

function getPasswordError(value: string) {
  if (!value.trim()) return "비밀번호를 입력해주세요."
  if (value.length < 6) return "비밀번호는 6자 이상이어야 합니다."
  return null
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`h-4 w-4 animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
    </svg>
  )
}

export function AuthCard({
  title,
  subtitle,
  onSubmit,
  onSwap,
  swapLabel,
  role,
  setRole,
  showRoleSelector = true,
  showEmailForm = true,
  showExtraStep = false,
  loadingEmail = false,
  onContinue,
  continueLabel = "다음 단계로",
  error = null,
  notice = null,
  submitLabel,
  swapPrompt,
  showPasswordField = true,
  onForgotPassword,
  forgotPasswordPrompt = "비밀번호를 잊으셨나요?",
  forgotPasswordLabel = "비밀번호 찾기",
}: AuthCardProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [touched, setTouched] = useState({ email: false, password: false })

  const emailError = getEmailError(email)
  const passwordError = showPasswordField ? getPasswordError(password) : null
  const showEmailError = touched.email && emailError
  const showPasswordError = showPasswordField && touched.password && passwordError
  const isBusy = loadingEmail
  const selectedRole = role ?? "company"
  const shouldShowRoleSelector = showRoleSelector && !!role && !!setRole
  const resolvedSwapPrompt =
    swapPrompt ?? (swapLabel === "회원가입" ? "아직 계정이 없으신가요?" : "이미 계정이 있으신가요?")

  function handleSubmit() {
    if (!showEmailForm) return
    if (emailError || passwordError) {
      setTouched({ email: true, password: true })
      return
    }
    onSubmit(selectedRole, email.trim(), showPasswordField ? password : "")
  }

  function handleContinue() {
    if (!onContinue) return
    onContinue(selectedRole)
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2 place-items-center">
      <div className="flex w-full max-w-md flex-col rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>

        <div className="mt-6 space-y-4">
          {shouldShowRoleSelector && role && setRole ? (
            <RoleSelector role={role} setRole={setRole} />
          ) : null}

          {showEmailForm ? (
            <label className="block text-sm text-slate-600">
              이메일
              <input
                data-testid="auth-email"
                className={`mt-1 w-full rounded-xl border px-4 py-2 text-sm focus:outline-none ${
                  showEmailError
                    ? "border-rose-300 focus:border-rose-400"
                    : "border-slate-200 focus:border-slate-400"
                }`}
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                disabled={isBusy}
              />
              {showEmailError ? <p className="mt-1 text-xs text-rose-600">{emailError}</p> : null}
            </label>
          ) : null}

          {showEmailForm && showPasswordField ? (
            <label className="block text-sm text-slate-600">
              비밀번호
              <div className="relative mt-1">
                <input
                  data-testid="auth-password"
                  type={showPassword ? "text" : "password"}
                  className={`w-full rounded-xl border px-4 py-2 pr-10 text-sm focus:outline-none ${
                    showPasswordError
                      ? "border-rose-300 focus:border-rose-400"
                      : "border-slate-200 focus:border-slate-400"
                  }`}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
                  disabled={isBusy}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-2 flex items-center text-slate-500 hover:text-slate-700"
                  onClick={() => setShowPassword((prev) => !prev)}
                  disabled={isBusy}
                  aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                >
                  {showPassword ? (
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3 3l18 18" />
                      <path d="M10.58 10.58A3 3 0 0112 9a3 3 0 013 3 3 3 0 01-.58 1.78" />
                      <path d="M9.9 5.27A10.94 10.94 0 0112 5c5 0 9.27 3.11 11 7-0.59 1.33-1.46 2.52-2.54 3.48" />
                      <path d="M6.11 6.11C4.2 7.25 2.73 9 2 12c0.9 2 2.53 3.76 4.67 5.06A11 11 0 0012 19c1.46 0 2.86-.28 4.16-.8" />
                    </svg>
                  ) : (
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                  <span className="sr-only">
                    {showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                  </span>
                </button>
              </div>
              {showPasswordError ? (
                <p className="mt-1 text-xs text-rose-600">{passwordError}</p>
              ) : null}
            </label>
          ) : null}

          {showExtraStep && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
              가입 후 계정 상태가 승인 대기일 수 있으며, 역할에 따라 관리자 승인이 필요합니다.
            </div>
          )}

          {notice ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-700">
              {notice}
            </div>
          ) : null}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
              {error}
            </div>
          )}

          {showEmailForm ? (
            <button
              data-testid="auth-submit"
              className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleSubmit}
              disabled={isBusy}
            >
              {loadingEmail ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Spinner className="text-white" />
                  <span className="sr-only">처리 중</span>
                </span>
              ) : (
                (submitLabel ?? title)
              )}
            </button>
          ) : null}

          {!showEmailForm && onContinue ? (
            <button
              className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleContinue}
              disabled={isBusy}
            >
              {continueLabel}
            </button>
          ) : null}
        </div>

        <div className="mt-6 ml-auto w-fit space-y-1 text-[11px] leading-4 text-right">
          <div className="flex items-center justify-end gap-1.5">
            <span className="text-slate-500">{resolvedSwapPrompt}</span>
            <button
              data-testid="auth-swap"
              className="text-[11px] font-semibold text-slate-900 hover:text-slate-700"
              onClick={onSwap}
            >
              {swapLabel}
            </button>
          </div>

          {showEmailForm && showPasswordField && onForgotPassword ? (
            <div className="flex items-center justify-end gap-1.5">
              <span className="text-slate-500">{forgotPasswordPrompt}</span>
              <button
                type="button"
                className="text-[11px] font-semibold text-slate-900 hover:text-slate-700"
                onClick={onForgotPassword}
                disabled={isBusy}
              >
                {forgotPasswordLabel}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="w-full h-full max-w-md rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-8 text-white shadow-sm">
        <h2 className="text-2xl font-semibold">진단 플랫폼 시작</h2>
        <p className="mt-3 text-sm text-slate-200">
          로그인은 공통 인증으로 단순하게, 역할 선택은 가입 단계에서 명확하게 분리해 운영하세요.
        </p>
        <div className="mt-6 space-y-2 text-sm text-slate-200">
          <div>• 스타트업: 진단 설문 작성, 결과 확인, 리포트 다운로드</div>
          <div>• 관리자: 사용자 승인, 운영 대시보드 관리</div>
          <div>• 컨설턴트: 오피스아워 운영 및 기업 지원</div>
        </div>
      </div>
    </div>
  )
}
