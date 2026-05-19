import { Badge } from "@/redesign/app/components/ui/badge"
import {
  getApplicationChangeWindowInfo,
  shouldShowApplicationChangeWindowBadge,
} from "@/redesign/app/lib/application-change-window"
import type { Application } from "@/redesign/app/lib/types"

interface ApplicationChangeWindowBadgeProps {
  application: Pick<Application, "status" | "createdAt">
}

export function ApplicationChangeWindowBadge({
  application,
}: ApplicationChangeWindowBadgeProps) {
  if (!shouldShowApplicationChangeWindowBadge(application)) {
    return null
  }

  const info = getApplicationChangeWindowInfo(application.createdAt)
  return (
    <Badge
      variant="outline"
      className={
        info.isOpen
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-slate-200 bg-slate-100 text-slate-600"
      }
    >
      {info.isOpen ? "변경 가능" : "변경 마감"}
    </Badge>
  )
}
