import type { Role } from "@/types/auth"

type RoleSelectorProps = {
  role: Role
  setRole: (role: Role) => void
}

export function RoleSelector({ role, setRole }: RoleSelectorProps) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-slate-500">가입 역할 선택</div>
      <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-200 p-2">
        <button
          data-testid="signup-role-company"
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${
            role === "company"
              ? "bg-slate-900 text-white"
              : "text-slate-500 hover:text-slate-900"
          }`}
          onClick={() => setRole("company")}
        >
          스타트업
        </button>
        <button
          data-testid="signup-role-admin"
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${
            role === "admin"
              ? "bg-slate-900 text-white"
              : "text-slate-500 hover:text-slate-900"
          }`}
          onClick={() => setRole("admin")}
        >
          관리자
        </button>
        <button
          data-testid="signup-role-consultant"
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${
            role === "consultant"
              ? "bg-slate-900 text-white"
              : "text-slate-500 hover:text-slate-900"
          }`}
          onClick={() => setRole("consultant")}
        >
          컨설턴트
        </button>
      </div>
    </div>
  )
}
