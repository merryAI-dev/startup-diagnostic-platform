import { useState } from "react"
import { Panel } from "../ui/Panel"

type AdminDashboardProps = {
  onLogout: () => void
  onApprove?: (uid: string) => void
  approvalLoading?: boolean
  approvalError?: string | null
}

export function AdminDashboard({
  onLogout,
  onApprove,
  approvalLoading = false,
  approvalError = null,
}: AdminDashboardProps) {
  const [uid, setUid] = useState("")

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">
          Admin Dashboard
        </h1>
        <button
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          onClick={onLogout}
        >
          로그아웃
        </button>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Panel title="승인 대기 회사" value="12" />
        <Panel title="이번 주 진단 완료" value="38" />
        <Panel title="리포트 요청" value="7" />
        <Panel title="관리자 메시지" value="3" />
      </div>

      {onApprove && (
        <div className="mt-8 rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <div className="text-sm font-semibold text-slate-700">
            계정 승인 (데모)
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Firestore에서 승인할 사용자 UID를 입력하세요.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
              placeholder="Firebase UID"
              value={uid}
              onChange={(e) => setUid(e.target.value)}
            />
            <button
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => onApprove(uid)}
              disabled={approvalLoading || uid.trim().length === 0}
            >
              {approvalLoading ? "처리 중..." : "승인 처리"}
            </button>
          </div>
          {approvalError && (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {approvalError}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
