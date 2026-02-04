type PanelProps = {
  title: string
  value: string
}

export function Panel({ title, value }: PanelProps) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="mt-2 text-lg font-semibold text-slate-900">
        {value}
      </div>
    </div>
  )
}
