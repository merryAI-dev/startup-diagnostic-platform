import { LogOut, User as UserIcon } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/redesign/ui/button"

type TopbarProps = {
  title: string
  subtitle?: string
  userLabel?: string
  onLogout: () => void
  menuLinks?: Array<{ label: string; to: string }>
}

export function Topbar({
  title,
  subtitle,
  userLabel,
  onLogout,
  menuLinks = [],
}: TopbarProps) {
  return (
    <div className="flex h-16 items-center justify-between border-b bg-white px-6">
      <div className="flex flex-col">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        {subtitle ? (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <details className="relative">
          <summary className="list-none">
            <button
              type="button"
              className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
            >
              <UserIcon className="h-4 w-4 text-slate-500" />
              <span>{userLabel ?? "사용자"}</span>
            </button>
          </summary>
          <div className="absolute right-0 mt-2 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
            {menuLinks.length ? (
              <div className="mb-2 border-b border-slate-100 pb-2">
                {menuLinks.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={onLogout}
            >
              <LogOut className="h-4 w-4" />
              로그아웃
            </Button>
          </div>
        </details>
      </div>
    </div>
  )
}
