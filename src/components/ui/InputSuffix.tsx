import type { ReactNode } from "react"

type InputSuffixProps = {
  suffix: string
  disabled?: boolean
  className?: string
  children: ReactNode
}

export function InputSuffix({
  suffix,
  disabled = false,
  className = "",
  children,
}: InputSuffixProps) {
  return (
    <div className={`mt-1 flex items-center gap-2 ${className}`.trim()}>
      <div className="min-w-0 flex-1">{children}</div>
      <span
        className={`shrink-0 text-xs font-semibold ${
          disabled ? "text-slate-300" : "text-slate-500"
        }`}
      >
        {suffix}
      </span>
    </div>
  )
}
