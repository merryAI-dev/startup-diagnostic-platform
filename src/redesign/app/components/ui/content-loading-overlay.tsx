import { Loader2 } from "lucide-react"

type ContentLoadingOverlayProps = {
  message?: string
}

export function ContentLoadingOverlay({ message = "Loading..." }: ContentLoadingOverlayProps) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/75 backdrop-blur-[1px]">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-700" />
        <div className="text-sm font-medium text-slate-600">{message}</div>
      </div>
    </div>
  )
}
