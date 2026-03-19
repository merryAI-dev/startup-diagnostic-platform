import { ReactNode } from "react";
import { useAuth as useAppAuth } from "@/context/AuthContext";
import { Alert, AlertDescription } from "@/redesign/app/components/ui/alert";
import { ShieldAlert } from "lucide-react";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: "admin" | "consultant" | "staff" | "user";
  allowedRoles?: Array<"admin" | "consultant" | "staff" | "user">;
  fallback?: ReactNode;
}

export function ProtectedRoute({ 
  children, 
  requiredRole, 
  allowedRoles,
  fallback 
}: ProtectedRouteProps) {
  const { user: firebaseUser, profile, loading } = useAppAuth();
  const resolvedRole =
    profile?.role === "admin"
      ? "admin"
      : profile?.role === "consultant"
        ? "consultant"
        : "user";
  const user = firebaseUser
    ? {
        role: resolvedRole,
      }
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <Alert className="max-w-md" variant="destructive">
          <ShieldAlert className="w-4 h-4" />
          <AlertDescription>
            이 페이지에 접근하려면 로그인이 필요합니다.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // 역할 기반 접근 제어
  const hasAccess = checkAccess(user.role, requiredRole, allowedRoles);

  if (!hasAccess) {
    if (fallback) {
      return <>{fallback}</>;
    }
    
    return (
      <div className="flex items-center justify-center h-full p-8">
        <Alert className="max-w-md" variant="destructive">
          <ShieldAlert className="w-4 h-4" />
          <AlertDescription>
            <p className="font-semibold mb-1">접근 권한이 없습니다</p>
            <p className="text-sm">
              이 페이지는 {getRoleDisplayName(requiredRole, allowedRoles)} 전용입니다.
            </p>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return <>{children}</>;
}

// 권한 체크 로직
function checkAccess(
  userRole: string,
  requiredRole?: string,
  allowedRoles?: string[]
): boolean {
  // allowedRoles가 있으면 그것을 우선 체크
  if (allowedRoles && allowedRoles.length > 0) {
    return allowedRoles.includes(userRole);
  }

  // requiredRole이 있으면 체크
  if (requiredRole) {
    // admin은 모든 페이지 접근 가능
    if (userRole === "admin") return true;
    
    // 역할 계층 구조
    const roleHierarchy: { [key: string]: number } = {
      "user": 0,
      "staff": 1,
      "consultant": 2,
      "admin": 3,
    };
    
    const userLevel = roleHierarchy[userRole] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;
    
    return userLevel >= requiredLevel;
  }

  // 권한 체크가 없으면 모든 사용자 접근 가능
  return true;
}

// 역할 표시 이름
function getRoleDisplayName(
  requiredRole?: string,
  allowedRoles?: string[]
): string {
  const roleNames: { [key: string]: string } = {
    "admin": "관리자",
    "consultant": "컨설턴트",
    "staff": "실무진",
    "user": "사용자",
  };

  if (allowedRoles && allowedRoles.length > 0) {
    return allowedRoles.map(r => roleNames[r] || r).join(", ");
  }

  if (requiredRole) {
    return roleNames[requiredRole] || requiredRole;
  }

  return "인증된 사용자";
}
