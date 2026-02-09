import { useState, useEffect } from "react";
import { Toaster, toast } from "sonner";
import { AuthProvider, useAuth } from "./lib/auth-context";
import { Login } from "./components/auth/login";
import { Signup } from "./components/auth/signup";
import { AppContent } from "./AppContent";

type AuthPage = "login" | "signup";

function AuthenticatedApp() {
  const { user, loading, signIn, signUp } = useAuth();
  const [authPage, setAuthPage] = useState<AuthPage>("login");

  // localStorage 클리어 (한 번만 실행)
  useEffect(() => {
    const hasCleared = sessionStorage.getItem("mysc-cleared");
    if (!hasCleared) {
      localStorage.removeItem("mysc-user");
      sessionStorage.setItem("mysc-cleared", "true");
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    if (authPage === "login") {
      return (
        <>
          <Login
            onLogin={async (email: string) => {
              try {
                await signIn(email);
                toast.success("로그인되었습니다");
              } catch (error: any) {
                toast.error(error.message || "로그인에 실패했습니다");
              }
            }}
            onNavigateToSignup={() => setAuthPage("signup")}
          />
          <Toaster position="top-center" />
        </>
      );
    } else {
      return (
        <>
          <Signup
            onSignup={async (email: string, password: string, companyName: string, programName: string) => {
              try {
                await signUp(email, password, companyName, programName);
                toast.success("회원가입이 완료되었습니다");
              } catch (error: any) {
                toast.error(error.message || "회원가입에 실패했습니다");
              }
            }}
            onNavigateToLogin={() => setAuthPage("login")}
          />
          <Toaster position="top-center" />
        </>
      );
    }
  }

  return (
    <>
      <AppContent />
      <Toaster position="top-center" />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}