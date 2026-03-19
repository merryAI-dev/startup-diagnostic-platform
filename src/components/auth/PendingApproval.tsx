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
  const roleLabel =
    role === "admin" ? "관리자" : role === "consultant" ? "컨설턴트" : role === "company" ? "스타트업" : "계정"

  return (
    <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50/80 px-8 py-6">
        <div className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
          {roleLabel} 승인 대기
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">
          승인 요청이 접수되었습니다.
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          관리자 확인이 완료되면 로그인 후 서비스를 이용할 수 있습니다.
        </p>
      </div>
      <div className="p-8">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
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
      <div className="mt-6 flex justify-end">
        <button
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          onClick={onBack}
        >
          로그인으로 돌아가기
        </button>
      </div>
      </div>
    </div>
  )
}
