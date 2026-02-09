import { Calendar, Clock, ArrowRight, AlertCircle, CalendarClock } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { StatusChip } from "../status-chip";
import { Application, User, Program } from "../../lib/types";
import { ProgramQuotaCard } from "../ui/program-quota-card";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

interface DashboardProps {
  applications: Application[];
  user: User;
  programs: Program[];
  onNavigate: (page: string, id?: string) => void;
}

export function Dashboard({ applications, user, programs, onNavigate }: DashboardProps) {
  const confirmedApplications = applications.filter(
    (app) => app.status === "confirmed" && app.scheduledDate
  );
  const pendingApplications = applications.filter(
    (app) => app.status === "pending" || app.status === "review"
  );

  // 사용자의 프로그램만 필터링 - user.programs가 없으면 빈 배열 사용
  const userPrograms = programs.filter((p) => user.programs?.includes(p.id) || false);

  const upcomingEvent = confirmedApplications
    .sort((a, b) => {
      const dateA = new Date(a.scheduledDate!).getTime();
      const dateB = new Date(b.scheduledDate!).getTime();
      return dateA - dateB;
    })[0];

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="mb-2">대시보드</h1>
        <p className="text-sm text-muted-foreground">
          오피스아워 신청 현황을 한눈에 확인하세요
        </p>
      </div>

      {/* Program Quotas */}
      {userPrograms.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">사업별 신청 가능 횟수</h2>
          <div className="grid grid-cols-3 gap-4">
            {userPrograms.map((program) => (
              <ProgramQuotaCard key={program.id} program={program} />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming event */}
      {upcomingEvent && (
        <Card className="border-primary bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              다가오는 일정
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start justify-between">
              <div className="space-y-3 flex-1">
                <div>
                  <h3 className="mb-1">{upcomingEvent.officeHourTitle}</h3>
                  <p className="text-sm text-muted-foreground">
                    {upcomingEvent.consultant}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span>
                      {format(new Date(upcomingEvent.scheduledDate!), "M월 d일 (E)", {
                        locale: ko,
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span>{upcomingEvent.scheduledTime}</span>
                  </div>
                  <div className="px-2 py-1 bg-white rounded text-xs">
                    {upcomingEvent.sessionFormat === "online"
                      ? "온라인"
                      : "오프라인"}
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => onNavigate("application", upcomingEvent.id)}
              >
                상세 보기
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending applications */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2>진행 중인 신청</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigate("history")}
          >
            전체 보기
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>

        {pendingApplications.length > 0 ? (
          <div className="grid gap-4">
            {pendingApplications.map((app) => (
              <Card key={app.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm">{app.officeHourTitle}</h3>
                        <StatusChip status={app.status} />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {app.consultant} · {app.agenda}
                      </p>
                      {app.type === "irregular" && app.periodFrom && (
                        <p className="text-xs text-muted-foreground">
                          희망 기간: {format(new Date(app.periodFrom), "M월 d일", { locale: ko })} ~{" "}
                          {format(new Date(app.periodTo!), "M월 d일", { locale: ko })}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onNavigate("application", app.id)}
                    >
                      확인
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                진행 중인 신청이 없습니다
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="mb-4">빠른 신청</h2>
        <div className="grid grid-cols-2 gap-4">
          <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => onNavigate("regular")}>
            <CardContent className="p-6">
              <Calendar className="w-8 h-8 text-primary mb-3" />
              <h3 className="mb-1">정기 오피스아워</h3>
              <p className="text-sm text-muted-foreground">
                월별 정기 일정 신청
              </p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => onNavigate("irregular")}>
            <CardContent className="p-6">
              <CalendarClock className="w-8 h-8 text-primary mb-3" />
              <h3 className="mb-1">비정기 오피스아워</h3>
              <p className="text-sm text-muted-foreground">
                맞춤형 일정 요청
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}