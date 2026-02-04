import type { Role } from "../../types/auth"

type RoleSelectorProps = {
  role: Role
  setRole: (role: Role) => void
}

export function RoleSelector({ role, setRole }: RoleSelectorProps) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 p-2">
      <button
        className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${
          role === "company"
            ? "bg-slate-900 text-white"
            : "text-slate-500 hover:text-slate-900"
        }`}
        onClick={() => setRole("company")}
      >
        회사
      </button>
      <button
        className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${
          role === "admin"
            ? "bg-slate-900 text-white"
            : "text-slate-500 hover:text-slate-900"
        }`}
        onClick={() => setRole("admin")}
      >
        관리자
      </button>
    </div>
  )
}
