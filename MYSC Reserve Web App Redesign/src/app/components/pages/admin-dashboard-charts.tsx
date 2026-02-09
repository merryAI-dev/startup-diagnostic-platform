import { useState } from "react";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Application, Program, User } from "../../lib/types";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Calendar, TrendingUp, Users, Clock, Filter } from "lucide-react";

interface AdminDashboardChartsProps {
  applications: Application[];
  programs: Program[];
  currentUser: User;
}

export function AdminDashboardCharts({ applications, programs, currentUser }: AdminDashboardChartsProps) {
  const [selectedProgram, setSelectedProgram] = useState<string>("all");

  // 권한에 따라 프로그램 필터링
  const visiblePrograms = currentUser.role === "admin" 
    ? programs 
    : programs.filter(p => currentUser.programs.includes(p.id));

  // 선택된 프로그램에 따라 신청 필터링
  const filteredApplications = selectedProgram === "all" 
    ? applications 
    : applications.filter(app => app.programId === selectedProgram);

  // 상태별 통계
  const statusStats = [
    { name: "대기중", value: filteredApplications.filter(a => a.status === "pending").length, color: "#eab308" },
    { name: "검토중", value: filteredApplications.filter(a => a.status === "review").length, color: "#f97316" },
    { name: "확정", value: filteredApplications.filter(a => a.status === "confirmed").length, color: "#3b82f6" },
    { name: "완료", value: filteredApplications.filter(a => a.status === "completed").length, color: "#10b981" },
    { name: "취소", value: filteredApplications.filter(a => a.status === "cancelled").length, color: "#ef4444" },
  ].filter(s => s.value > 0);

  // 프로그램별 진행률
  const programProgress = visiblePrograms.map(p => ({
    name: p.name,
    목표: p.targetHours,
    완료: p.completedHours,
    진행률: Math.round((p.completedHours / p.targetHours) * 100),
    color: p.color,
  }));

  // 프로그램별 신청 현황
  const programApplications = visiblePrograms.map(p => ({
    name: p.name,
    사용: p.usedApplications,
    남은횟수: p.maxApplications - p.usedApplications,
    최대: p.maxApplications,
    color: p.color,
  }));

  // 월별 신청 추이 (최근 6개월)
  const monthlyTrend = (() => {
    const months = ["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"];
    return months.map(month => ({
      month: month.split("-")[1] + "월",
      신청수: Math.floor(Math.random() * 20) + 10,
      완료수: Math.floor(Math.random() * 15) + 5,
    }));
  })();

  // 주요 지표
  const totalApplications = filteredApplications.length;
  const completedApplications = filteredApplications.filter(a => a.status === "completed").length;
  const pendingApplications = filteredApplications.filter(a => a.status === "pending" || a.status === "review").length;
  const confirmedApplications = filteredApplications.filter(a => a.status === "confirmed").length;

  const completionRate = totalApplications > 0 
    ? Math.round((completedApplications / totalApplications) * 100) 
    : 0;

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-8 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {currentUser.role === "admin" 
                ? "전체 프로그램 현황을 한눈에 확인하세요" 
                : `담당 프로그램 현황 (${visiblePrograms.length}개 사업)`}
            </p>
          </div>
        </div>

        {/* Program Filter */}
        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={selectedProgram === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedProgram("all")}
            >
              전체
            </Button>
            {visiblePrograms.map((program) => (
              <Button
                key={program.id}
                variant={selectedProgram === program.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedProgram(program.id)}
              >
                <div 
                  className="w-2 h-2 rounded-full mr-2" 
                  style={{ backgroundColor: program.color }}
                />
                {program.name}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">전체 신청</span>
                <Calendar className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-3xl font-bold text-gray-900">{totalApplications}</div>
              <p className="text-xs text-muted-foreground mt-1">Total Applications</p>
            </div>

            <div className="bg-white rounded-lg border p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">완료</span>
                <TrendingUp className="w-4 h-4 text-green-500" />
              </div>
              <div className="text-3xl font-bold text-gray-900">{completedApplications}</div>
              <p className="text-xs text-muted-foreground mt-1">{completionRate}% 완료율</p>
            </div>

            <div className="bg-white rounded-lg border p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">진행중</span>
                <Clock className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-3xl font-bold text-gray-900">{confirmedApplications}</div>
              <p className="text-xs text-muted-foreground mt-1">Confirmed</p>
            </div>

            <div className="bg-white rounded-lg border p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">대기중</span>
                <Users className="w-4 h-4 text-yellow-500" />
              </div>
              <div className="text-3xl font-bold text-gray-900">{pendingApplications}</div>
              <p className="text-xs text-muted-foreground mt-1">Pending Review</p>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-2 gap-6">
            {/* Program Progress */}
            <div className="bg-white rounded-lg border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">사업별 목표 시수 진행률</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={programProgress}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '8px 12px'
                    }}
                  />
                  <Legend />
                  <Bar dataKey="완료" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="목표" fill="#e5e7eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Application Status */}
            <div className="bg-white rounded-lg border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">신청 상태 분포</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={statusStats}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {statusStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '8px 12px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Program Application Quota */}
            <div className="bg-white rounded-lg border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">사업별 신청 횟수 현황</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={programApplications} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '8px 12px'
                    }}
                  />
                  <Legend />
                  <Bar dataKey="사용" stackId="a" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="남은횟수" stackId="a" fill="#e5e7eb" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Monthly Trend */}
            <div className="bg-white rounded-lg border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">월별 신청 추이</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '8px 12px'
                    }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="신청수" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    dot={{ fill: '#3b82f6', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="완료수" 
                    stroke="#10b981" 
                    strokeWidth={2}
                    dot={{ fill: '#10b981', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Program Details Table */}
          <div className="bg-white rounded-lg border">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold text-gray-900">사업별 상세 현황</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      사업명
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      목표 시수
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      완료 시수
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      진행률
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      신청 횟수
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      남은 횟수
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {visiblePrograms.map((program) => {
                    const progressPercentage = Math.round((program.completedHours / program.targetHours) * 100);
                    const remaining = program.maxApplications - program.usedApplications;
                    
                    return (
                      <tr key={program.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: program.color }}
                            />
                            <span className="font-medium text-gray-900">{program.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {program.targetHours}시간
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {program.completedHours}시간
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden max-w-[100px]">
                              <div 
                                className="h-full rounded-full transition-all"
                                style={{ 
                                  width: `${progressPercentage}%`,
                                  backgroundColor: program.color 
                                }}
                              />
                            </div>
                            <span className="text-sm font-medium text-gray-900">{progressPercentage}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {program.usedApplications} / {program.maxApplications}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge 
                            variant={remaining <= 3 ? "destructive" : "secondary"}
                            className="font-medium"
                          >
                            {remaining}회
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
