
import { BrowserRouter, Route, Routes } from "react-router-dom"
import {
  RequireApproved,
  RequireAuth,
  RequireRole,
} from "./components/auth/RouteGuards"
import { AdminPage } from "./pages/AdminPage"
import { CompanyPage } from "./pages/CompanyPage"
import { HomeRedirect } from "./pages/HomeRedirect"
import { LoginPage } from "./pages/LoginPage"
import { NotFoundPage } from "./pages/NotFoundPage"
import { PendingPage } from "./pages/PendingPage"
import { SignupPage } from "./pages/SignupPage"

export function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen w-full flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/pending" element={<PendingPage />} />

          <Route
            path="/admin"
            element={
              <RequireAuth>
                <RequireApproved>
                  <RequireRole role="admin">
                    <AdminPage />
                  </RequireRole>
                </RequireApproved>
              </RequireAuth>
            }
          />

          <Route
            path="/company"
            element={
              <RequireAuth>
                <RequireApproved>
                  <RequireRole role="company">
                    <CompanyPage />
                  </RequireRole>
                </RequireApproved>
              </RequireAuth>
            }
          />

          <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
        <footer className="border-t border-slate-200 bg-slate-100 px-6 py-4 text-right text-xs text-slate-500">
          © MYSC. All rights reserved.
        </footer>
      </div>
    </BrowserRouter>
  )
}
