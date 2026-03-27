import { BrowserRouter, Outlet, Route, Routes, useLocation } from "react-router-dom"
import { RequireApproved, RequireAuth, RequireRole } from "@/components/auth/RouteGuards"
import { AdminShell } from "@/redesign/shells/AdminShell"
import { CompanyShell } from "@/redesign/shells/CompanyShell"
import { HomeRedirect } from "@/pages/HomeRedirect"
import { LoginPage } from "@/pages/LoginPage"
import { NotFoundPage } from "@/pages/NotFoundPage"
import { PendingPage } from "@/pages/PendingPage"
import { PasswordResetPage } from "@/pages/PasswordResetPage"
import { SignupPage } from "@/pages/SignupPage"
import { SignupInfoPage } from "@/pages/SignupInfoPage"
import { Toaster } from "sonner"
function PublicLayout() {
  const location = useLocation()
  const isSignupInfo = location.pathname === "/signup-info"

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      <div className={`flex-1 ${isSignupInfo ? "overflow-hidden" : "overflow-y-auto"}`}>
        <Outlet />
      </div>
      <Toaster position="top-center" />
      {isSignupInfo ? null : (
        <footer className="border-t border-slate-200 bg-slate-100 px-6 py-4 text-right text-xs text-slate-500">
          © MYSC. All rights reserved.
        </footer>
      )}
    </div>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<PasswordResetPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/signup-info" element={<SignupInfoPage />} />
          <Route path="/pending" element={<PendingPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route
          path="/admin/*"
          element={
            <RequireAuth>
              <RequireApproved>
                <RequireRole role={["admin", "consultant"]}>
                  <AdminShell />
                </RequireRole>
              </RequireApproved>
            </RequireAuth>
          }
        />

        <Route
          path="/company/*"
          element={
            <RequireAuth>
              <RequireApproved>
                <RequireRole role="company">
                  <CompanyShell />
                </RequireRole>
              </RequireApproved>
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
