import { Link } from "react-router-dom"

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-900">
        페이지를 찾을 수 없습니다.
      </h1>
      <p className="mt-3 text-sm text-slate-500">
        요청하신 페이지가 존재하지 않습니다.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
      >
        홈으로 이동
      </Link>
    </div>
  )
}
