import { useState, useMemo } from "react";
import { Application, Program } from "../../lib/types";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { 
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import { AlertTriangle, TrendingDown, XCircle, CheckCircle } from "lucide-react";

interface AdminOperationsDashboardProps {
  applications: Application[];
  programs: Program[];
}

export function AdminOperationsDashboard({ 
  applications, 
  programs 
}: AdminOperationsDashboardProps) {
  const [selectedView, setSelectedView] = useState<"cancellations" | "efficiency" | "problems">("cancellations");

  // 기업별 취소/변경 통계
  const companyCancellationStats = useMemo(() => {
    const companyMap: Record<string, {
      total: number;
      cancelled: number;
      completed: number;
      cancellationRate: number;
      programId: string;
    }> = {};

    applications.forEach(app => {
      if (!companyMap[app.companyName]) {
        companyMap[app.companyName] = {
          total: 0,
          cancelled: 0,
          completed: 0,
          cancellationRate: 0,
          programId: app.programId || "",
        };
      }

      companyMap[app.companyName].total++;
      if (app.status === "cancelled") {
        companyMap[app.companyName].cancelled++;
      }
      if (app.status === "completed") {
        companyMap[app.companyName].completed++;
      }
    });

    // 취소율 계산
    Object.keys(companyMap).forEach(company => {
      const data = companyMap[company];
      data.cancellationRate = Math.round((data.cancelled / data.total) * 100);
    });

    return Object.entries(companyMap)
      .map(([name, data]) => ({
        name,
        총신청: data.total,
        취소건수: data.cancelled,
        완료건수: data.completed,
        취소율: data.cancellationRate,
        사업: programs.find(p => p.id === data.programId)?.name || "미분류",
      }))
      .filter(item => item.취소건수 > 0)
      .sort((a, b) => b.취소율 - a.취소율)
      .slice(0, 15);
  }, [applications, programs]);

  // 사업별 운영 효율성
  const programEfficiency = useMemo(() => {
    return programs.map(program => {
      const programApps = applications.filter(a => a.programId === program.id);
      const total = programApps.length;
      const completed = programApps.filter(a => a.status === "completed").length;
      const cancelled = programApps.filter(a => a.status === "cancelled").length;
      const pending = programApps.filter(a => a.status === "pending" || a.status === "review").length;

      return {
        name: program.name,
        완료율: total > 0 ? Math.round((completed / total) * 100) : 0,
        취소율: total > 0 ? Math.round((cancelled / total) * 100) : 0,
        대기건수: pending,
        총건수: total,
        color: program.color,
      };
    });
  }, [applications, programs]);

  // 문제 패턴 감지
  const problemPatterns = useMemo(() => {
    const problems: Array<{
      type: string;
      severity: "high" | "medium" | "low";
      description: string;
      count: number;
    }> = [];

    // 1. 고취소율 기업 (20% 이상)
    const highCancellationCompanies = companyCancellationStats.filter(c => c.취소율 >= 20);
    if (highCancellationCompanies.length > 0) {
      problems.push({
        type: "고취소율 기업",
        severity: "high",
        description: `${highCancellationCompanies.length}개 기업이 20% 이상의 취소율을 보이고 있습니다`,
        count: highCancellationCompanies.length,
      });
    }

    // 2. 사업별 취소율 10% 이상
    const highCancellationPrograms = programEfficiency.filter(p => p.취소율 >= 10);
    if (highCancellationPrograms.length > 0) {
      problems.push({
        type: "사업 운영 비효율",
        severity: "medium",
        description: `${highCancellationPrograms.map(p => p.name).join(", ")} 사업의 취소율이 10% 이상입니다`,
        count: highCancellationPrograms.length,
      });
    }

    // 3. 대기 건수 많은 사업
    const highPendingPrograms = programEfficiency.filter(p => p.대기건수 >= 10);
    if (highPendingPrograms.length > 0) {
      problems.push({
        type: "처리 지연",
        severity: "medium",
        description: `${highPendingPrograms.map(p => p.name).join(", ")} 사업에 10건 이상의 대기 건수가 있습니다`,
        count: highPendingPrograms.reduce((sum, p) => sum + p.대기건수, 0),
      });
    }

    // 4. 완료율 낮은 사업 (60% 미만)
    const lowCompletionPrograms = programEfficiency.filter(p => p.완료율 < 60 && p.총건수 > 10);
    if (lowCompletionPrograms.length > 0) {
      problems.push({
        type: "낮은 완료율",
        severity: "low",
        description: `${lowCompletionPrograms.map(p => p.name).join(", ")} 사업의 완료율이 60% 미만입니다`,
        count: lowCompletionPrograms.length,
      });
    }

    return problems;
  }, [companyCancellationStats, programEfficiency]);

  // 전체 통계
  const stats = useMemo(() => {
    const total = applications.length;
    const cancelled = applications.filter(a => a.status === "cancelled").length;
    const completed = applications.filter(a => a.status === "completed").length;
    const cancellationRate = Math.round((cancelled / total) * 100);
    const completionRate = Math.round((completed / total) * 100);
    const problemCompanies = companyCancellationStats.filter(c => c.취소율 >= 20).length;

    return {
      total,
      cancelled,
      completed,
      cancellationRate,
      completionRate,
      problemCompanies,
    };
  }, [applications, companyCancellationStats]);

  // 상태별 분포
  const statusDistribution = useMemo(() => {
    const statuses = [
      { name: "완료", value: stats.completed, color: "#a7f3d0" },
      { name: "취소", value: stats.cancelled, color: "#fecaca" },
      { 
        name: "진행중", 
        value: stats.total - stats.completed - stats.cancelled, 
        color: "#bfdbfe" 
      },
    ].filter(s => s.value > 0);

    return statuses;
  }, [stats]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border rounded-lg shadow-lg">
          <p className="font-semibold text-gray-900 mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: <span className="font-semibold">{entry.value}</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-8 py-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">운영 효율성 대시보드</h1>
          <p className="text-sm text-muted-foreground mt-1">
            취소율, 완료율 등 운영 지표를 모니터링하고 문제 패턴을 발견합니다
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="px-8 py-6 grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">전체 취소율</span>
            <XCircle className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-3xl font-bold text-red-600">{stats.cancellationRate}%</div>
          <p className="text-xs text-muted-foreground mt-1">{stats.cancelled}건 취소</p>
        </div>

        <div className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">완료율</span>
            <CheckCircle className="w-4 h-4 text-green-500" />
          </div>
          <div className="text-3xl font-bold text-green-600">{stats.completionRate}%</div>
          <p className="text-xs text-muted-foreground mt-1">{stats.completed}건 완료</p>
        </div>

        <div className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">문제 기업</span>
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
          </div>
          <div className="text-3xl font-bold text-yellow-600">{stats.problemCompanies}</div>
          <p className="text-xs text-muted-foreground mt-1">20% 이상 취소율</p>
        </div>

        <div className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">감지된 이슈</span>
            <TrendingDown className="w-4 h-4 text-orange-500" />
          </div>
          <div className="text-3xl font-bold text-orange-600">{problemPatterns.length}</div>
          <p className="text-xs text-muted-foreground mt-1">주의 필요</p>
        </div>
      </div>

      {/* View Selector */}
      <div className="px-8 pb-4">
        <div className="flex gap-2">
          <Button
            variant={selectedView === "cancellations" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedView("cancellations")}
          >
            취소율 분석
          </Button>
          <Button
            variant={selectedView === "efficiency" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedView("efficiency")}
          >
            사업별 효율성
          </Button>
          <Button
            variant={selectedView === "problems" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedView("problems")}
          >
            문제 패턴
          </Button>
        </div>
      </div>

      {/* Charts */}
      <div className="flex-1 px-8 pb-8 overflow-y-auto">
        {selectedView === "cancellations" && (
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white rounded-lg border p-6">
              <h3 className="font-semibold text-gray-900 mb-4">
                고취소율 기업 TOP 15
                <Badge variant="destructive" className="ml-2">주의</Badge>
              </h3>
              <ResponsiveContainer width="100%" height={600}>
                <BarChart data={companyCancellationStats} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={150} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="취소건수" fill="#fecaca" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="완료건수" fill="#a7f3d0" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-lg border p-6">
              <h3 className="font-semibold text-gray-900 mb-4">전체 상태 분포</h3>
              <ResponsiveContainer width="100%" height={400}>
                <PieChart>
                  <Pie
                    data={statusDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={120}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {statusDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>

              <div className="mt-8 space-y-3">
                <h4 className="font-semibold text-sm text-gray-700">상세 통계</h4>
                {companyCancellationStats.slice(0, 5).map((company, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-lg border bg-gray-50">
                    <div>
                      <p className="font-medium text-sm">{company.name}</p>
                      <p className="text-xs text-muted-foreground">{company.사업}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-red-600">{company.취소율}%</p>
                      <p className="text-xs text-muted-foreground">
                        {company.취소건수}/{company.총신청}건
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {selectedView === "efficiency" && (
          <div className="bg-white rounded-lg border p-6">
            <h3 className="font-semibold text-gray-900 mb-4">사업별 운영 효율성</h3>
            <ResponsiveContainer width="100%" height={500}>
              <BarChart data={programEfficiency}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="완료율" fill="#86efac" radius={[4, 4, 0, 0]} />
                <Bar dataKey="취소율" fill="#fecaca" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-8 grid grid-cols-3 gap-4">
              {programEfficiency.map((program, index) => (
                <div key={index} className="p-4 rounded-lg border">
                  <div className="flex items-center gap-2 mb-3">
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: program.color }}
                    />
                    <h4 className="font-semibold text-sm">{program.name}</h4>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">총 건수:</span>
                      <span className="font-semibold">{program.총건수}건</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">완료율:</span>
                      <span className="font-semibold text-green-600">{program.완료율}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">취소율:</span>
                      <span className="font-semibold text-red-600">{program.취소율}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">대기:</span>
                      <span className="font-semibold text-yellow-600">{program.대기건수}건</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedView === "problems" && (
          <div className="bg-white rounded-lg border p-6">
            <h3 className="font-semibold text-gray-900 mb-4">감지된 문제 패턴</h3>
            
            <div className="space-y-4">
              {problemPatterns.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
                  <p className="text-lg font-semibold text-gray-900">문제가 감지되지 않았습니다</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    모든 사업이 정상적으로 운영되고 있습니다
                  </p>
                </div>
              ) : (
                problemPatterns.map((problem, index) => (
                  <div 
                    key={index} 
                    className={`p-5 rounded-lg border-2 ${
                      problem.severity === "high" 
                        ? "border-red-200 bg-red-50" 
                        : problem.severity === "medium"
                        ? "border-yellow-200 bg-yellow-50"
                        : "border-blue-200 bg-blue-50"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded-lg ${
                        problem.severity === "high"
                          ? "bg-red-100"
                          : problem.severity === "medium"
                          ? "bg-yellow-100"
                          : "bg-blue-100"
                      }`}>
                        <AlertTriangle className={`w-6 h-6 ${
                          problem.severity === "high"
                            ? "text-red-600"
                            : problem.severity === "medium"
                            ? "text-yellow-600"
                            : "text-blue-600"
                        }`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold text-gray-900">{problem.type}</h4>
                          <Badge 
                            variant={
                              problem.severity === "high" 
                                ? "destructive" 
                                : problem.severity === "medium"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {problem.severity === "high" ? "긴급" : problem.severity === "medium" ? "주의" : "모니터링"}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-700">{problem.description}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          영향받는 항목: {problem.count}개
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
