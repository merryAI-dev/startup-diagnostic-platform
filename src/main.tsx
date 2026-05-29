
import { createRoot } from "react-dom/client"
import { App } from "@/app"
import "./index.css"
import { AuthProvider } from "@/context/AuthContext"
import { ErrorBoundary, installGlobalErrorHandlers } from "@/observability/ErrorBoundary"

const rootEl = document.getElementById("app")
if (!rootEl) {
  throw new Error("Root element #app not found")
}

installGlobalErrorHandlers()

createRoot(rootEl).render(
  <ErrorBoundary>
    <AuthProvider>
      <App />
    </AuthProvider>
  </ErrorBoundary>
)
