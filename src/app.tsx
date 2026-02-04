
import { BrowserRouter, Route, Routes } from "react-router-dom"
import { HomeRedirect } from "./pages/HomeRedirect"
import { LoginPage } from "./pages/LoginPage"
import { SignupPage } from "./pages/SignupPage"
import { PendingPage } from "./pages/PendingPage"
import { AdminPage } from "./pages/AdminPage"
import { CompanyPage } from "./pages/CompanyPage"
import { NotFoundPage } from "./pages/NotFoundPage"
import {
  RequireApproved,
  RequireAuth,
  RequireRole,
} from "./components/auth/RouteGuards"

export function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen">
        <div className="mx-auto w-full max-w-5xl px-6 py-10">
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
      </div>
    </BrowserRouter>
  )
}
