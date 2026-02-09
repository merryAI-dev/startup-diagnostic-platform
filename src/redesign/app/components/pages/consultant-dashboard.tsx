import { useState, useMemo } from "react";
import { Application, Program, User } from "../../lib/types";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { 
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import { TrendingUp, Users, Target, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

interface ConsultantDashboardProps {
  applications: Application[];
  programs: Program[];
  currentUser: User;
}

export function ConsultantDashboard({ 
  applications, 
  programs, 
  currentUser 
}: ConsultantDashboardProps) {
  const [selectedView, setSelectedView] = useState<"companies" | "topics" | "monthly" | "growth">("companies");
  const toDate = (value: Date | string) =>
    value instanceof Date ? value : new Date(value);

  // 권한에 따른 프로그램 필터링
  const accessiblePrograms = useMemo(() => {
    if (currentUser.role === "admin") {
      return programs;
    }
    return programs.filter(p => currentUser.programs?.includes(p.id));
  }, [programs, currentUser]);

  // 필터링된 애플리케이션
  const filteredApplications = useMemo(() => {
    if (currentUser.role === "admin") {
      return applications;
    }
    return applications.filter(app => 
      app.programId && currentUser.programs?.includes(app.programId)
    );
  }, [applications, currentUser]);

  // 기업별 활동 분석
  const companyActivity = useMemo(() => {
    const companyMap: Record<string, {
      total: number;
      completed: number;
      topics: Set<string>;
      lastSession: Date | string;
    }> = {};

    filteredApplications.forEach(app => {
      const companyName = app.companyName ?? "미지정";
      const record =
        companyMap[companyName] ??
        (companyMap[companyName] = {
          total: 0,
          completed: 0,
          topics: new Set(),
          lastSession: app.createdAt,
        });

      record.total++;
      if (app.status === "completed") {
        record.completed++;
      }
      if (app.agenda) {
        record.topics.add(app.agenda);
      }
      if (toDate(app.createdAt) > toDate(record.lastSession)) {
        record.lastSession = app.createdAt;
      }
    });

    return Object.entries(companyMap)
      .map(([name, data]) => ({
        name,
        세션수: data.completed,
        진행중: data.total - data.completed,
        주제수: data.topics.size,
        마지막세션: String(data.lastSession),
      }))
      .sort((a, b) => b.세션수 - a.세션수)
      .slice(0, 15);
  }, [filteredApplications]);

  // 주제별 월별 트렌드
  const topicMonthlyTrend = useMemo(() => {
    const topicMap: Record<string, Record<string, number>> = {};

    filteredApplications.forEach(app => {
      if (!app.agenda || app.status !== "completed") return;
      
      const month = toDate(app.createdAt).toISOString().substring(0, 7);
      
      const bucket = topicMap[app.agenda] ?? (topicMap[app.agenda] = {});
      bucket[month] = (bucket[month] || 0) + 1;
    });

    // 모든 월 추출
    const allMonths = Array.from(
      new Set(
        filteredApplications.map(app => toDate(app.createdAt).toISOString().substring(0, 7))
      )
    ).sort().slice(-6);

    // 상위 5개 주제 선택
    const topTopics = Object.entries(topicMap)
      .map(([topic, months]) => ({
        topic,
        total: Object.values(months).reduce((sum, count) => sum + count, 0),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map(item => item.topic);

    // 차트 데이터 생성
    return allMonths.map(month => {
      const data: any = {
        월: format(new Date(month + "-01"), "M월", { locale: ko }),
      };
      
      topTopics.forEach(topic => {
        data[topic] = topicMap[topic]?.[month] || 0;
      });
      
      return data;
    });
  }, [filteredApplications]);

  // 기업별 성장 트랙킹
  const companyGrowth = useMemo(() => {
    const growthMap: Record<string, {
      earlyMonth: number;
      recentMonth: number;
    }> = {};

    const now = new Date();
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    filteredApplications.forEach(app => {
      if (app.status !== "completed") return;
      const companyName = app.companyName ?? "미지정";
      const appDate = toDate(app.createdAt);
      
      const record =
        growthMap[companyName] ??
        (growthMap[companyName] = {
          earlyMonth: 0,
          recentMonth: 0,
        });

      if (appDate < threeMonthsAgo) {
        record.earlyMonth++;
      } else {
        record.recentMonth++;
      }
    });

    return Object.entries(growthMap)
      .map(([name, data]) => ({
        name,
        이전활동: data.earlyMonth,
        최근활동: data.recentMonth,
        증가율: data.earlyMonth > 0 
          ? Math.round(((data.recentMonth - data.earlyMonth) / data.earlyMonth) * 100)
          : data.recentMonth > 0 ? 100 : 0,
      }))
      .filter(item => item.이전활동 > 0 || item.최근활동 > 0)
      .sort((a, b) => b.최근활동 - a.최근활동)
      .slice(0, 10);
  }, [filteredApplications]);

  // 주제별 인기도
  const topicPopularity = useMemo(() => {
    const topicMap: Record<string, number> = {};

    filteredApplications.forEach(app => {
      if (!app.agenda) return;
      topicMap[app.agenda] = (topicMap[app.agenda] || 0) + 1;
    });

    return Object.entries(topicMap)
      .map(([name, count]) => ({ name, 세션수: count }))
      .sort((a, b) => b.세션수 - a.세션수)
      .slice(0, 10);
  }, [filteredApplications]);

  // 통계
  const stats = useMemo(() => {
    const total = filteredApplications.length;
    const completed = filteredApplications.filter(a => a.status === "completed").length;
    const activeCompanies = new Set(
      filteredApplications
        .filter(a => a.status === "completed" || a.status === "confirmed")
        .map(a => a.companyName ?? "미지정")
    ).size;
    const totalTopics = new Set(
      filteredApplications.filter(a => a.agenda).map(a => a.agenda)
    ).size;

    return { total, completed, activeCompanies, totalTopics };
  }, [filteredApplications]);

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
          <h1 className="text-2xl font-bold text-gray-900">담당 사업 현황</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {accessiblePrograms.map(p => p.name).join(", ")} 사업의 스타트업 활동을 분석합니다
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="px-8 py-6 grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">총 세션</span>
            <Target className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900">{stats.completed}</div>
          <p className="text-xs text-muted-foreground mt-1">완료된 세션</p>
        </div>

        <div className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">활동 기업</span>
            <Users className="w-4 h-4 text-green-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900">{stats.activeCompanies}</div>
          <p className="text-xs text-muted-foreground mt-1">스타트업 수</p>
        </div>

        <div className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">논의 주제</span>
            <Sparkles className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900">{stats.totalTopics}</div>
          <p className="text-xs text-muted-foreground mt-1">다양한 주제</p>
        </div>

        <div className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">참여율</span>
            <TrendingUp className="w-4 h-4 text-primary" />
          </div>
          <div className="text-3xl font-bold text-primary">
            {Math.round((stats.completed / stats.total) * 100)}%
          </div>
          <p className="text-xs text-muted-foreground mt-1">완료율</p>
        </div>
      </div>

      {/* View Selector */}
      <div className="px-8 pb-4">
        <div className="flex gap-2">
          <Button
            variant={selectedView === "companies" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedView("companies")}
          >
            기업별 활동
          </Button>
          <Button
            variant={selectedView === "topics" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedView("topics")}
          >
            주제별 트렌드
          </Button>
          <Button
            variant={selectedView === "monthly" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedView("monthly")}
          >
            월별 주제 분석
          </Button>
          <Button
            variant={selectedView === "growth" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedView("growth")}
          >
            성장 트랙킹
          </Button>
        </div>
      </div>

      {/* Charts */}
      <div className="flex-1 px-8 pb-8 overflow-y-auto">
        {selectedView === "companies" && (
          <div className="bg-white rounded-lg border p-6">
            <h3 className="font-semibold text-gray-900 mb-4">스타트업별 오피스아워 활동</h3>
            <ResponsiveContainer width="100%" height={600}>
              <BarChart data={companyActivity} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={150} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="세션수" fill="#93c5fd" stackId="a" radius={[0, 4, 4, 0]} />
                <Bar dataKey="진행중" fill="#fde68a" stackId="a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {selectedView === "topics" && (
          <div className="bg-white rounded-lg border p-6">
            <h3 className="font-semibold text-gray-900 mb-4">주제별 인기도</h3>
            <ResponsiveContainer width="100%" height={500}>
              <BarChart data={topicPopularity} margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} angle={-15} textAnchor="end" height={100} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="세션수" fill="#c4b5fd" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {selectedView === "monthly" && (
          <div className="bg-white rounded-lg border p-6">
            <h3 className="font-semibold text-gray-900 mb-4">주제별 월별 트렌드 (TOP 5)</h3>
            <ResponsiveContainer width="100%" height={500}>
              <LineChart data={topicMonthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="월" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line type="monotone" dataKey="임팩트 측정" stroke="#10b981" strokeWidth={2} />
                <Line type="monotone" dataKey="비즈니스 모델 수립" stroke="#3b82f6" strokeWidth={2} />
                <Line type="monotone" dataKey="투자 유치" stroke="#f59e0b" strokeWidth={2} />
                <Line type="monotone" dataKey="마케팅 전략" stroke="#ec4899" strokeWidth={2} />
                <Line type="monotone" dataKey="기술 개발" stroke="#8b5cf6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {selectedView === "growth" && (
          <div className="bg-white rounded-lg border p-6">
            <h3 className="font-semibold text-gray-900 mb-4">스타트업 성장 트랙킹 (최근 3개월 vs 이전)</h3>
            <ResponsiveContainer width="100%" height={500}>
              <BarChart data={companyGrowth} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={150} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="이전활동" fill="#d1d5db" radius={[0, 4, 4, 0]} />
                <Bar dataKey="최근활동" fill="#86efac" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
