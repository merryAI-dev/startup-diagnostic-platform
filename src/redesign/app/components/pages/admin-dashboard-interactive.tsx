import { Application, Program, User } from "@/redesign/app/lib/types";
import { AdminDashboardCharts } from "@/redesign/app/components/pages/admin-dashboard-charts";
import { ConsultantDashboard } from "@/redesign/app/components/pages/consultant-dashboard";

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
  onNavigate: _onNavigate
}: AdminDashboardInteractiveProps) {
  // 컨설턴트/실무진은 기존 담당 사업 현황 대시보드를 유지
  if (currentUser.role !== "admin") {
    return (
      <ConsultantDashboard 
        applications={applications}
        programs={programs}
        currentUser={currentUser}
      />
    );
  }

  // 관리자는 사업별 목표/달성률 중심 대시보드를 사용
  return (
    <AdminDashboardCharts
      applications={applications}
      programs={programs}
      currentUser={currentUser}
    />
  );
}
