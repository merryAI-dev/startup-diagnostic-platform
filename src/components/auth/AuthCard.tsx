import { useState } from "react"
import type { Role } from "../../types/auth"
import { RoleSelector } from "./RoleSelector"

type AuthCardProps = {
  title: string
  subtitle: string
  onGoogle: () => void
  onSubmit: (role: Role, email: string, password: string) => void
  onSwap: () => void
  swapLabel: string
  role: Role
  setRole: (role: Role) => void
  showGoogle?: boolean
  showRoleSelector?: boolean
  showExtraStep?: boolean
  loading?: boolean
  error?: string | null
}

export function AuthCard({
  title,
  subtitle,
  onGoogle,
  onSubmit,
  onSwap,
  swapLabel,
  role,
  setRole,
  showGoogle = true,
  showRoleSelector = true,
  showExtraStep = false,
  loading = false,
  error = null,
}: AuthCardProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="grid gap-8 lg:grid-cols-2 place-items-center">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>

        <div className="mt-6 space-y-4">
          {showRoleSelector ? (
            <RoleSelector role={role} setRole={setRole} />
          ) : null}

          <label className="block text-sm text-slate-600">
            이메일
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:border-slate-400 focus:outline-none"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="block text-sm text-slate-600">
            비밀번호
            <div className="relative mt-1">
              <input
                type={showPassword ? "text" : "password"}
                className="w-full rounded-xl border border-slate-200 px-4 py-2 pr-10 text-sm focus:border-slate-400 focus:outline-none"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-2 flex items-center text-slate-500 hover:text-slate-700"
                onClick={() => setShowPassword((prev) => !prev)}
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
          </label>

          {showExtraStep && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
              가입 후 이메일 인증 또는 관리자 승인 단계를 거치도록
              구성할 수 있습니다.
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
              {error}
            </div>
          )}

          <button
            className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => onSubmit(role, email, password)}
            disabled={loading}
          >
            {loading ? "처리 중..." : title}
          </button>

          {showGoogle ? (
            <button
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onGoogle}
              disabled={loading}
            >
              Google 로그인
            </button>
          ) : null}
        </div>

        <div className="mt-6 text-center text-sm text-slate-500">
          {swapLabel}이 필요하신가요?{" "}
          <button
            className="font-semibold text-slate-900 hover:text-slate-700"
            onClick={onSwap}
          >
            {swapLabel}
          </button>
        </div>
      </div>

      <div className="w-full h-full max-w-md rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-8 text-white shadow-sm">
        <h2 className="text-2xl font-semibold">진단 플랫폼 시작</h2>
        <p className="mt-3 text-sm text-slate-200">
          관리자와 회사 계정의 경험을 분리해도 됩니다. 먼저 화면
          분기만으로 동작을 확인하고, 이후 서버 권한/Firestore 규칙을
          강화하면 됩니다.
        </p>
        <div className="mt-6 space-y-2 text-sm text-slate-200">
          <div>• Admin: 대시보드, 사용자 관리, 진단 결과 검토</div>
          <div>• Company: 진단 설문, 결과 확인, 리포트 다운로드</div>
        </div>
      </div>
    </div>
  )
}
