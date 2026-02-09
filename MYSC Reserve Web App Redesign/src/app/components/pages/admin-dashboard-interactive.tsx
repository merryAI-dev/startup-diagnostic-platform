import { useState, useMemo } from "react";
import { Application, Program, User } from "../../lib/types";
import { Button } from "../ui/button";
import { ConsultantDashboard } from "./consultant-dashboard";
import { AdminOperationsDashboard } from "./admin-operations-dashboard";

interface AdminDashboardInteractiveProps {
  applications: Application[];
  programs: Program[];
  currentUser: User;
  onNavigate: (page: string, id?: string) => void;
}

export function AdminDashboardInteractive({ 
  applications, 
  programs, 
  currentUser,
  onNavigate 
}: AdminDashboardInteractiveProps) {
  // 컨설턴트/실무진은 ConsultantDashboard 사용
  // 관리자는 둘 다 선택 가능
  const [dashboardType, setDashboardType] = useState<"operations" | "insights">(
    currentUser.role === "admin" ? "operations" : "insights"
  );

  // 컨설턴트/실무진은 무조건 insights (담당 사업 현황)
  if (currentUser.role !== "admin") {
    return (
      <ConsultantDashboard 
        applications={applications}
        programs={programs}
        currentUser={currentUser}
      />
    );
  }

  // 관리자는 두 가지 뷰 선택 가능
  return (
    <div className="h-full flex flex-col">
      {/* Dashboard Type Selector (Admin only) */}
      <div className="bg-white border-b px-8 py-4">
        <div className="flex gap-2">
          <Button
            variant={dashboardType === "operations" ? "default" : "outline"}
            size="sm"
            onClick={() => setDashboardType("operations")}
          >
            운영 효율성 (취소/변경 트랙킹)
          </Button>
          <Button
            variant={dashboardType === "insights" ? "default" : "outline"}
            size="sm"
            onClick={() => setDashboardType("insights")}
          >
            스타트업 인사이트 (기업/주제 분석)
          </Button>
        </div>
      </div>

      {/* Dashboard Content */}
      <div className="flex-1 overflow-hidden">
        {dashboardType === "operations" ? (
          <AdminOperationsDashboard 
            applications={applications}
            programs={programs}
          />
        ) : (
          <ConsultantDashboard 
            applications={applications}
            programs={programs}
            currentUser={currentUser}
          />
        )}
      </div>
    </div>
  );
}