import type { Role } from "@/types/auth"

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
        관리자 승인 완료 후 로그인할 수 있습니다.
      </p>
      <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        {role === "admin" ? (
          <div className="space-y-2">
            <div className="font-semibold text-slate-700">관리자 계정</div>
            <div>1. 운영자가 계정을 승인하면 이용할 수 있습니다.</div>
            <div>
              승인이 완료되기 전에는 관리자 화면으로 이동할 수 없습니다.
            </div>
          </div>
        ) : role === "company" ? (
          <div className="space-y-2">
            <div className="font-semibold text-slate-700">스타트업 계정</div>
            <div>1. 운영자가 계정을 승인하면 이용할 수 있습니다.</div>
          </div>
        ) : role === "consultant" ? (
          <div className="space-y-2">
            <div className="font-semibold text-slate-700">컨설턴트 계정</div>
            <div>1. 운영자가 계정을 승인하면 이용할 수 있습니다.</div>
            <div>2. 승인 완료 후 컨설턴트 화면에 접근할 수 있습니다.</div>
          </div>
        ) : (
          "관리자 승인 완료 후 이용할 수 있습니다."
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
