import type { ReactNode } from "react"
import { SidebarNav } from "@/redesign/layout/SidebarNav"
import { Topbar } from "@/redesign/layout/Topbar"

type AppShellProps = {
  basePath: string
  userRole?: "admin" | "company"
  title: string
  subtitle?: string
  userLabel?: string
  onLogout: () => void
  menuLinks?: Array<{ label: string; to: string }>
  children: ReactNode
}

export function AppShell({
  basePath,
  userRole,
  title,
  subtitle,
  userLabel,
  onLogout,
  menuLinks,
  children,
}: AppShellProps) {
  return (
    <div className="flex h-screen min-h-0 w-full overflow-hidden bg-background text-foreground">
      <SidebarNav basePath={basePath} userRole={userRole} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Topbar
          title={title}
          subtitle={subtitle}
          userLabel={userLabel}
          onLogout={onLogout}
          menuLinks={menuLinks}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
