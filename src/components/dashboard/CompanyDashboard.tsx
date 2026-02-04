import { Panel } from "../ui/Panel"

type CompanyDashboardProps = {
  onLogout: () => void
}

export function CompanyDashboard({ onLogout }: CompanyDashboardProps) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">
          Company Dashboard
        </h1>
        <button
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          onClick={onLogout}
        >
          로그아웃
        </button>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Panel title="진단 상태" value="대기" />
        <Panel title="최근 리포트" value="2026-02-04" />
        <Panel title="예상 점수" value="81" />
        <Panel title="요청사항" value="2" />
      </div>
    </div>
  )
}
