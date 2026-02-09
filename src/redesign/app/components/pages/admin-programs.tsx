import { useState } from "react";
import { TrendingUp, Target, Clock, Award } from "lucide-react";
import { Program, Application } from "../../lib/types";
import { Progress } from "../ui/progress";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";

interface AdminProgramsProps {
  programs: Program[];
  applications: Application[];
  onUpdateProgram: (id: string, data: Partial<Program>) => void;
}

export function AdminPrograms({
  programs,
  applications,
  onUpdateProgram,
}: AdminProgramsProps) {
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(
    programs[0] || null
  );

  // 사업별 통계 계산
  const getProgramStats = (programId: string) => {
    const programApps = applications.filter((app) => app.programId === programId);
    const completedApps = programApps.filter((app) => app.status === "completed");
    
    const totalSessions = completedApps.length;
    const totalHours = completedApps.reduce((sum, app) => sum + (app.duration || 1), 0);
    const uniqueCompanies = new Set(programApps.map((app) => app.consultant)).size;

    return {
      totalSessions,
      totalHours,
      uniqueCompanies,
      applications: programApps,
    };
  };

  const getProgressPercentage = (completed: number, target: number) => {
    return Math.min(Math.round((completed / target) * 100), 100);
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return "text-green-600";
    if (percentage >= 70) return "text-blue-600";
    if (percentage >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  const selectedProgramId = selectedProgram?.id;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">사업별 프로그램 관리</h1>
        <p className="text-sm text-muted-foreground mt-1">
          각 사업의 목표 달성률과 진행 현황을 확인합니다
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Target className="w-4 h-4" />
            <span className="text-sm">전체 사업</span>
          </div>
          <div className="text-2xl font-bold">{programs.length}개</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-sm">목표 시수</span>
          </div>
          <div className="text-2xl font-bold">
            {programs.reduce((sum, p) => sum + p.targetHours, 0)}h
          </div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Award className="w-4 h-4" />
            <span className="text-sm">완료 시수</span>
          </div>
          <div className="text-2xl font-bold text-green-600">
            {programs.reduce((sum, p) => sum + p.completedHours, 0)}h
          </div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm">평균 달성률</span>
          </div>
          <div className="text-2xl font-bold">
            {Math.round(
              programs.reduce(
                (sum, p) => sum + (p.completedHours / p.targetHours) * 100,
                0
              ) / programs.length
            )}
            %
          </div>
        </div>
      </div>

      {/* Programs Grid */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {programs.map((program) => {
          const stats = getProgramStats(program.id);
          const percentage = getProgressPercentage(
            program.completedHours,
            program.targetHours
          );

          const remainingApplications = program.maxApplications - program.usedApplications;

          return (
            <div
              key={program.id}
              onClick={() => setSelectedProgram(program)}
              className={`bg-white rounded-lg border p-6 cursor-pointer transition-all hover:shadow-md ${
                selectedProgram?.id === program.id
                  ? "ring-2 ring-primary"
                  : ""
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: program.color }}
                    />
                    <h3 className="font-semibold text-gray-900">
                      {program.name}
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {program.description}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-muted-foreground">시수 진행률</span>
                    <span className={`font-semibold ${getProgressColor(percentage)}`}>
                      {percentage}%
                    </span>
                  </div>
                  <Progress value={percentage} className="h-2" />
                  <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                    <span>{program.completedHours}h 완료</span>
                    <span>목표 {program.targetHours}h</span>
                  </div>
                </div>

                <div className="pt-3 border-t">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground">신청 횟수</span>
                    <span className={`font-semibold ${remainingApplications <= 3 ? 'text-orange-600' : 'text-gray-900'}`}>
                      {program.usedApplications} / {program.maxApplications}회
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>남은 횟수</span>
                    <span className={remainingApplications <= 3 ? 'text-orange-600 font-semibold' : ''}>
                      {remainingApplications}회
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-3 border-t">
                  <div>
                    <div className="text-xs text-muted-foreground">세션 수</div>
                    <div className="text-sm font-semibold">
                      {stats.totalSessions}건
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">기업 수</div>
                    <div className="text-sm font-semibold">
                      {stats.uniqueCompanies}개
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Program Details */}
      {selectedProgram && (
        <div className="bg-white rounded-lg border p-6">
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: selectedProgram.color }}
              />
              <h2 className="text-xl font-bold">{selectedProgram.name}</h2>
              <Badge
                variant="outline"
                style={{
                  borderColor: selectedProgram.color,
                  color: selectedProgram.color,
                }}
              >
                {getProgressPercentage(
                  selectedProgram.completedHours,
                  selectedProgram.targetHours
                )}
                % 달성
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {selectedProgram.description}
            </p>
          </div>

          <Tabs defaultValue="applications">
            <TabsList>
              <TabsTrigger value="applications">신청 내역</TabsTrigger>
              <TabsTrigger value="stats">상세 통계</TabsTrigger>
            </TabsList>

            <TabsContent value="applications" className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>기업명</TableHead>
                    <TableHead>주제</TableHead>
                    <TableHead>컨설턴트</TableHead>
                    <TableHead>일시</TableHead>
                    <TableHead>시간</TableHead>
                    <TableHead>상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(selectedProgramId
                    ? getProgramStats(selectedProgramId).applications
                    : []
                  ).map((app) => (
                    <TableRow key={app.id}>
                      <TableCell className="font-medium">
                        {((app.officeHourTitle || "").split("-")[0] ?? "").trim() || "-"}
                      </TableCell>
                      <TableCell>{app.agenda}</TableCell>
                      <TableCell>{app.consultant}</TableCell>
                      <TableCell>
                        {app.scheduledDate || app.periodFrom || "-"}
                      </TableCell>
                      <TableCell>{app.duration || 1}h</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            app.status === "completed"
                              ? "default"
                              : app.status === "confirmed"
                              ? "secondary"
                              : "outline"
                          }
                          className={
                            app.status === "completed"
                              ? "bg-green-100 text-green-700"
                              : ""
                          }
                        >
                          {app.status === "completed"
                            ? "완료"
                            : app.status === "confirmed"
                            ? "확정"
                            : app.status === "pending"
                            ? "대기"
                            : app.status === "review"
                            ? "검토중"
                            : "취소"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="stats" className="mt-4">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-semibold">진행 현황</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm">전체 신청</span>
                      <span className="font-semibold">
                        {(selectedProgramId
                          ? getProgramStats(selectedProgramId).applications.length
                          : 0)}건
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm">완료된 세션</span>
                      <span className="font-semibold text-green-600">
                        {(selectedProgramId
                          ? getProgramStats(selectedProgramId).totalSessions
                          : 0)}건
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm">진행 중</span>
                      <span className="font-semibold text-blue-600">
                        {(selectedProgramId
                          ? getProgramStats(selectedProgramId).applications
                          : []
                        ).filter(
                          (app) =>
                            app.status === "confirmed" || app.status === "pending"
                        ).length}
                        건
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold">시수 분석</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm">목표 시수</span>
                      <span className="font-semibold">
                        {selectedProgram?.targetHours ?? 0}h
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm">완료 시수</span>
                      <span className="font-semibold text-green-600">
                        {selectedProgram?.completedHours ?? 0}h
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm">남은 시수</span>
                      <span className="font-semibold text-orange-600">
                        {(selectedProgram?.targetHours ?? 0) -
                          (selectedProgram?.completedHours ?? 0)}h
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
