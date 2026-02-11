import { BarChart3, Calendar, Clock3, Target } from "lucide-react";
import { useMemo } from "react";
import { initialApplications, programs as initialPrograms } from "../../lib/data";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Progress } from "../ui/progress";

interface AdminDashboardDeprecatedProps {
  onNavigate: (page: string, id?: string) => void;
}

export function AdminDashboardDeprecated({
  onNavigate: _onNavigate,
}: AdminDashboardDeprecatedProps) {
  const programCards = useMemo(() => {
    const getProgressRate = (completed: number, target: number) => {
      if (target <= 0) return 0;
      return Math.min(100, Math.max(0, Math.round((completed / target) * 100)));
    };

    return initialPrograms.map((program) => {
      const progressRate = getProgressRate(program.completedHours, program.targetHours);
      const used = program.usedApplications;
      const max = program.maxApplications;
      const remaining = Math.max(0, max - used);
      const programApplications = initialApplications.filter(
        (application) => application.programId === program.id
      );
      const pendingCount = programApplications.filter(
        (application) => application.status === "pending" || application.status === "review"
      ).length;
      const completedCount = programApplications.filter(
        (application) => application.status === "completed"
      ).length;

      return {
        ...program,
        progressRate,
        used,
        max,
        remaining,
        pendingCount,
        completedCount,
      };
    });
  }, []);

  const summary = useMemo(() => {
    const totalTargetHours = programCards.reduce(
      (sum, program) => sum + program.targetHours,
      0
    );
    const totalCompletedHours = programCards.reduce(
      (sum, program) => sum + program.completedHours,
      0
    );
    const totalApplications = programCards.reduce(
      (sum, program) => sum + program.used,
      0
    );
    const totalCapacity = programCards.reduce((sum, program) => sum + program.max, 0);
    const totalProgressRate =
      totalTargetHours > 0
        ? Math.round((totalCompletedHours / totalTargetHours) * 100)
        : 0;

    return {
      totalTargetHours,
      totalCompletedHours,
      totalApplications,
      totalCapacity,
      totalProgressRate,
    };
  }, [programCards]);

  return (
    <div className="h-full bg-gray-50 p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">관리자 대시보드 (구버전)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          태그 선택 없이 사업별 목표/완료 시수와 진행 현황을 한눈에 확인합니다.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">전체 사업</span>
              <BarChart3 className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-3xl font-bold">{programCards.length}개</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">목표 시수</span>
              <Target className="h-4 w-4 text-indigo-500" />
            </div>
            <div className="text-3xl font-bold">{summary.totalTargetHours}h</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">완료 시수</span>
              <Clock3 className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-3xl font-bold text-emerald-600">
              {summary.totalCompletedHours}h
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">전체 달성률</span>
              <Calendar className="h-4 w-4 text-amber-500" />
            </div>
            <div className="text-3xl font-bold text-amber-600">
              {summary.totalProgressRate}%
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.totalApplications}/{summary.totalCapacity}회 사용
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {programCards.map((program) => (
          <Card key={program.id}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: program.color }}
                  />
                  <span className="text-base">{program.name}</span>
                </div>
                <Badge variant={program.remaining <= 3 ? "destructive" : "secondary"}>
                  잔여 {program.remaining}회
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">{program.description}</p>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg border bg-slate-50 p-2.5">
                  <div className="text-[11px] text-muted-foreground">목표</div>
                  <div className="text-base font-semibold">{program.targetHours}h</div>
                </div>
                <div className="rounded-lg border bg-slate-50 p-2.5">
                  <div className="text-[11px] text-muted-foreground">완료</div>
                  <div className="text-base font-semibold text-emerald-600">
                    {program.completedHours}h
                  </div>
                </div>
                <div className="rounded-lg border bg-slate-50 p-2.5">
                  <div className="text-[11px] text-muted-foreground">달성률</div>
                  <div className="text-base font-semibold">{program.progressRate}%</div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>시수 진행</span>
                  <span>
                    {program.completedHours}h / {program.targetHours}h
                  </span>
                </div>
                <Progress value={program.progressRate} className="h-2" />
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-md border p-2 text-center">
                  <div className="text-muted-foreground">사용 티켓</div>
                  <div className="mt-0.5 font-semibold">
                    {program.used}/{program.max}
                  </div>
                </div>
                <div className="rounded-md border p-2 text-center">
                  <div className="text-muted-foreground">대기</div>
                  <div className="mt-0.5 font-semibold">{program.pendingCount}건</div>
                </div>
                <div className="rounded-md border p-2 text-center">
                  <div className="text-muted-foreground">완료</div>
                  <div className="mt-0.5 font-semibold">{program.completedCount}건</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
