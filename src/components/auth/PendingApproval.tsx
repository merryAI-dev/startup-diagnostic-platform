import type { Role } from "../../types/auth"

type PendingApprovalProps = {
  role?: Role | null
  onBack: () => void
  error?: string
  notice?: string
}

export function PendingApproval({
  role,
  onBack,
  error,
  notice,
}: PendingApprovalProps) {
  return (
    <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-900">
        가입 완료! 다음 단계를 진행하세요.
      </h1>
      <p className="mt-3 text-sm text-slate-500">
        이메일 인증 또는 관리자 승인이 완료되어야 로그인할 수 있어요.
      </p>
      <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        {role === "admin" ? (
          <div className="space-y-2">
            <div className="font-semibold text-slate-700">관리자 계정</div>
            <div>1. 이메일 인증을 완료하세요.</div>
            <div>2. 운영자가 Firebase 콘솔에서 승인해야 합니다.</div>
            <div>
              승인이 완료되기 전에는 관리자 화면으로 이동할 수 없습니다.
            </div>
          </div>
        ) : role === "company" ? (
          <div className="space-y-2">
            <div className="font-semibold text-slate-700">회사 계정</div>
            <div>1. 이메일 인증을 완료하세요.</div>
            <div>2. 인증이 완료되면 자동으로 접근 권한이 열립니다.</div>
          </div>
        ) : (
          "계정 유형에 따라 승인 또는 인증 절차를 완료하세요."
        )}
      </div>
      {notice ? (
        <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
          {notice}
        </div>
      ) : null}
      {error ? (
        <p className="mt-4 text-sm text-rose-600">{error}</p>
      ) : null}
      <div className="mt-6 flex justify-center">
        <button
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          onClick={onBack}
        >
          로그인으로 돌아가기
        </button>
      </div>
    </div>
  )
}
