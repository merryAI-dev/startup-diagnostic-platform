import { Component, type ErrorInfo, type ReactNode } from "react"
import { recordTelemetryEvent } from "@/observability/client"

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ hasError: true })
    void recordTelemetryEvent({
      eventType: "react_error",
      severity: "fatal",
      route: `${window.location.pathname}${window.location.search}`,
      message: error.message,
      stack: error.stack || null,
      componentStack: errorInfo.componentStack || null,
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-900">
          <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-lg font-semibold">화면을 불러오지 못했습니다</h1>
            <p className="mt-2 text-sm text-slate-600">
              잠시 후 다시 시도해주세요. 문제가 반복되면 운영팀에서 오류 기록을 확인할 수 있습니다.
            </p>
            <button
              type="button"
              className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              onClick={() => window.location.reload()}
            >
              새로고침
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

let globalHandlersInstalled = false

export function installGlobalErrorHandlers() {
  if (globalHandlersInstalled || typeof window === "undefined") return
  globalHandlersInstalled = true

  window.addEventListener("error", (event) => {
    void recordTelemetryEvent({
      eventType: "client_error",
      severity: "error",
      route: `${window.location.pathname}${window.location.search}`,
      message: event.message,
      stack: event.error instanceof Error ? event.error.stack || null : null,
      metadata: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    })
  })

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason
    void recordTelemetryEvent({
      eventType: "promise_rejection",
      severity: "error",
      route: `${window.location.pathname}${window.location.search}`,
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack || null : null,
    })
  })
}

