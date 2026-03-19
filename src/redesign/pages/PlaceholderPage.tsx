type PlaceholderPageProps = {
  title: string
  description?: string
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {description ? (
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">UI 시안</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            이 영역은 리디자인 UI가 적용되는 섹션입니다. 실제 데이터 연결은
            다음 단계에서 진행합니다.
          </p>
        </div>
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">다음 단계</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            기능 이식 여부에 따라 실제 컴포넌트로 교체할 수 있습니다.
          </p>
        </div>
      </div>
    </div>
  )
}
