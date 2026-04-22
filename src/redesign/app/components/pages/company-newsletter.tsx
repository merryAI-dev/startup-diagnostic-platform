import { useState, useMemo } from "react";
import { User, CompanyMetrics, MonthlyMetrics } from "@/redesign/app/lib/types";
import { getCompanyMetrics, createCompanyMetrics, formatCurrency, formatNumber, calculateGrowthRate } from "@/redesign/app/lib/company-metrics-data";
import { generateCompanyRelevantNews, trendingKeywords, categoryColors, categoryLabels, NewsArticle } from "@/redesign/app/lib/news-data";
import { Card } from "@/redesign/app/components/ui/card";
import { Badge } from "@/redesign/app/components/ui/badge";
import { Button } from "@/redesign/app/components/ui/button";
import { Separator } from "@/redesign/app/components/ui/separator";
import { Progress } from "@/redesign/app/components/ui/progress";
import {
  TrendingUp, TrendingDown, Calendar, Users, DollarSign,
  Award, Newspaper, ExternalLink, Sparkles, Download,
  Target, Zap, Trophy, Building2, LineChart as LineChartIcon,
  ArrowUpRight, ArrowDownRight, Clock, Info, Mail, Share2,
  FileText, Briefcase, BarChart3, PieChart, Activity,
  Globe, Rocket, Star, ChevronRight, Eye, ThumbsUp, MessageSquare
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  Cell, PieChart as RePieChart, Pie
} from "recharts";

interface CompanyNewsletterProps {
  currentUser: User;
}

const COLORS = ['#0A2540', '#5DADE2', '#27AE60', '#F39C12', '#E74C3C', '#8E44AD'];

export function CompanyNewsletter({ currentUser }: CompanyNewsletterProps) {
  const [metrics, setMetrics] = useState<CompanyMetrics>(() => {
    return getCompanyMetrics(currentUser.companyName) || createCompanyMetrics(currentUser.companyName);
  });

  const [news, setNews] = useState<NewsArticle[]>(() => {
    return generateCompanyRelevantNews(currentUser.companyName);
  });

  const [selectedNewsCategory, setSelectedNewsCategory] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<"overview" | "performance" | "news">("overview");

  // 현재 월 (10월)
  const currentMonth = 10;
  const currentMonthData = metrics.data.find(d => d.month === currentMonth);
  const previousMonthData = metrics.data.find(d => d.month === currentMonth - 1);

  // 최근 6개월 데이터
  const recentMonths = useMemo(() => {
    return metrics.data.slice(-6);
  }, [metrics]);

  // 성장률 계산
  const growthRates = useMemo(() => {
    if (!currentMonthData || !previousMonthData) return null;

    return {
      revenue: calculateGrowthRate(currentMonthData.revenue, previousMonthData.revenue),
      employees: calculateGrowthRate(currentMonthData.employees, previousMonthData.employees),
      customers: calculateGrowthRate(currentMonthData.customers, previousMonthData.customers),
      mau: currentMonthData.monthlyActiveUsers && previousMonthData.monthlyActiveUsers
        ? calculateGrowthRate(currentMonthData.monthlyActiveUsers, previousMonthData.monthlyActiveUsers)
        : null,
    };
  }, [currentMonthData, previousMonthData]);

  // 최근 마일스톤 (최근 3개)
  const recentMilestones = useMemo(() => {
    return [...metrics.milestones]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3);
  }, [metrics]);

  // 필터링된 뉴스
  const filteredNews = useMemo(() => {
    if (!selectedNewsCategory) return news;
    return news.filter(n => n.category === selectedNewsCategory);
  }, [news, selectedNewsCategory]);

  // 현재 날짜
  const today = new Date("2026-02-08");
  const formattedDate = today.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // 차트 데이터 준비
  const chartData = recentMonths.map(m => ({
    month: `${m.month}월`,
    매출: Math.round(m.revenue / 1000000), // 백만원 단위
    고객수: m.customers,
    MAU: m.monthlyActiveUsers || 0,
    직원수: m.employees,
  }));

  // 목표 대비 달성률 계산
  const yearlyTarget = 1200000000; // 12억원 목표
  const currentTotal = metrics.data.reduce((sum, m) => sum + m.revenue, 0);
  const achievementRate = Math.round((currentTotal / yearlyTarget) * 100);

  // 카테고리별 뉴스 개수
  const newsByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    news.forEach(n => {
      counts[n.category] = (counts[n.category] || 0) + 1;
    });
    return Object.entries(counts).map(([category, count]) => ({
      category: categoryLabels[category as keyof typeof categoryLabels],
      count,
      color: categoryColors[category as keyof typeof categoryColors],
    }));
  }, [news]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 프리미엄 헤더 */}
      <div className="relative bg-gradient-to-br from-[#0A2540] via-[#0A2540] to-[#1a3a5f] text-white overflow-hidden">
        {/* 배경 패턴 */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-96 h-96 bg-[#5DADE2] rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-[#5DADE2] rounded-full blur-3xl"></div>
        </div>

        <div className="relative mx-auto max-w-[1600px] px-8 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-start justify-between mb-8">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-3 bg-white/10 backdrop-blur-sm rounded-xl">
                    <Building2 className="size-8" />
                  </div>
                  <div>
                    <h1 className="text-4xl font-bold mb-1">
                      {currentUser.companyName}
                    </h1>
                    <p className="text-blue-200 text-lg">Growth Report · {formattedDate}</p>
                  </div>
                </div>
                <p className="text-blue-100 text-lg max-w-2xl">
                  실시간 데이터 기반 성장 분석 리포트 · 업계 트렌드 및 인사이트 제공
                </p>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="gap-2 bg-white/10 border-white/20 hover:bg-white/20 text-white">
                  <Share2 className="size-4" />
                  공유
                </Button>
                <Button className="gap-2 bg-white text-[#0A2540] hover:bg-white/90">
                  <Download className="size-4" />
                  PDF 다운로드
                </Button>
              </div>
            </div>

            {/* 주요 지표 카드 */}
            <div className="grid md:grid-cols-4 gap-4">
              {[
                {
                  label: "이번 달 매출",
                  value: formatCurrency(currentMonthData?.revenue || 0),
                  change: growthRates?.revenue || 0,
                  icon: DollarSign,
                  color: "bg-emerald-500",
                },
                {
                  label: "누적 고객",
                  value: `${formatNumber(currentMonthData?.customers || 0)}명`,
                  change: growthRates?.customers || 0,
                  icon: Users,
                  color: "bg-blue-500",
                },
                {
                  label: "월간 활성 사용자",
                  value: `${formatNumber(currentMonthData?.monthlyActiveUsers || 0)}명`,
                  change: growthRates?.mau || 0,
                  icon: Activity,
                  color: "bg-purple-500",
                },
                {
                  label: "팀 규모",
                  value: `${currentMonthData?.employees || 0}명`,
                  change: growthRates?.employees || 0,
                  icon: Briefcase,
                  color: "bg-orange-500",
                },
              ].map((metric, index) => (
                <motion.div
                  key={metric.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 * index }}
                >
                  <Card className="p-5 bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-all duration-300">
                    <div className="flex items-start justify-between mb-3">
                      <div className={`p-2.5 ${metric.color} rounded-lg`}>
                        <metric.icon className="size-5 text-white" />
                      </div>
                      {metric.change !== 0 && (
                        <Badge className={`${metric.change > 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'} border-0`}>
                          {metric.change > 0 ? (
                            <TrendingUp className="size-3 mr-1" />
                          ) : (
                            <TrendingDown className="size-3 mr-1" />
                          )}
                          {Math.abs(metric.change)}%
                        </Badge>
                      )}
                    </div>
                    <p className="text-white/70 text-sm mb-1">{metric.label}</p>
                    <p className="text-2xl font-bold text-white">{metric.value}</p>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="mx-auto max-w-[1600px] px-8">
          <div className="flex gap-8">
            {[
              { id: "overview", label: "종합 현황", icon: BarChart3 },
              { id: "performance", label: "성과 분석", icon: LineChartIcon },
              { id: "news", label: "업계 뉴스", icon: Newspaper },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedTab(tab.id as any)}
                className={`flex items-center gap-2 py-4 px-2 border-b-2 transition-all ${
                  selectedTab === tab.id
                    ? "border-[#5DADE2] text-[#0A2540] font-semibold"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                <tab.icon className="size-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-8 py-8">
        <AnimatePresence mode="wait">
          {/* 종합 현황 탭 */}
          {selectedTab === "overview" && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {/* 연간 목표 달성률 */}
              <Card className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-[#0A2540] mb-1">2026년 연간 목표 달성률</h3>
                    <p className="text-sm text-slate-600">목표 매출: {formatCurrency(yearlyTarget)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-4xl font-bold text-[#5DADE2]">{achievementRate}%</p>
                    <p className="text-sm text-slate-600">현재 달성</p>
                  </div>
                </div>
                <Progress value={achievementRate} className="h-3 mb-2" />
                <p className="text-sm text-slate-600">
                  누적 매출: {formatCurrency(currentTotal)} / 목표까지 {formatCurrency(yearlyTarget - currentTotal)} 남음
                </p>
              </Card>

              <div className="grid md:grid-cols-2 gap-6">
                {/* 6개월 매출 트렌드 */}
                <Card className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-lg font-semibold text-[#0A2540] mb-1">매출 트렌드</h3>
                      <p className="text-sm text-slate-600">최근 6개월</p>
                    </div>
                    <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
                      <TrendingUp className="size-3 mr-1" />
                      성장 중
                    </Badge>
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={chartData}>
                      <defs>
                        <linearGradient id="colorRevenue2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#5DADE2" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#5DADE2" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: 12 }} />
                      <YAxis stroke="#64748b" style={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          fontSize: 12,
                        }}
                        formatter={(value: number) => [`${value}M`, '매출']}
                      />
                      <Area
                        type="monotone"
                        dataKey="매출"
                        stroke="#5DADE2"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorRevenue2)"
                      />
                      <Line
                        type="monotone"
                        dataKey="매출"
                        stroke="#0A2540"
                        strokeWidth={3}
                        dot={{ fill: '#0A2540', r: 5 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Card>

                {/* 고객 & MAU 트렌드 */}
                <Card className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-lg font-semibold text-[#0A2540] mb-1">고객 성장</h3>
                      <p className="text-sm text-slate-600">누적 고객 vs 월간 활성 사용자</p>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: 12 }} />
                      <YAxis stroke="#64748b" style={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          fontSize: 12,
                        }}
                      />
                      <Legend />
                      <Bar dataKey="고객수" fill="#0A2540" radius={[8, 8, 0, 0]} />
                      <Bar dataKey="MAU" fill="#5DADE2" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </div>

              {/* 주요 마일스톤 */}
              <Card className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Trophy className="size-5 text-[#5DADE2]" />
                    <h3 className="text-lg font-semibold text-[#0A2540]">주요 성과 및 마일스톤</h3>
                  </div>
                  <Button variant="outline" size="sm" className="gap-2">
                    전체 보기
                    <ChevronRight className="size-4" />
                  </Button>
                </div>

                <div className="relative">
                  {/* 타임라인 라인 */}
                  <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-[#5DADE2] to-slate-200"></div>

                  <div className="space-y-6">
                    {recentMilestones.map((milestone, index) => (
                      <motion.div
                        key={milestone.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: 0.1 * index }}
                        className="relative flex gap-6"
                      >
                        {/* 타임라인 포인트 */}
                        <div className="relative flex-shrink-0">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#5DADE2] to-[#0A2540] flex items-center justify-center shadow-lg">
                            {milestone.category === "award" && <Trophy className="size-6 text-white" />}
                            {milestone.category === "patent" && <Award className="size-6 text-white" />}
                            {milestone.category === "certification" && <Star className="size-6 text-white" />}
                            {milestone.category === "partnership" && <Users className="size-6 text-white" />}
                            {milestone.category === "product" && <Rocket className="size-6 text-white" />}
                            {milestone.category === "other" && <Target className="size-6 text-white" />}
                          </div>
                        </div>

                        {/* 내용 */}
                        <div className="flex-1 pb-6">
                          <div className="bg-white rounded-xl p-5 border border-slate-200 hover:shadow-lg transition-shadow">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <h4 className="text-lg font-semibold text-[#0A2540] mb-1">{milestone.title}</h4>
                                <p className="text-sm text-slate-600">{milestone.description}</p>
                              </div>
                              <Badge variant="outline" className="flex-shrink-0">
                                {new Date(milestone.date).toLocaleDateString("ko-KR", { 
                                  month: "short", 
                                  day: "numeric" 
                                })}
                              </Badge>
                            </div>
                            {milestone.achievement && (
                              <div className="flex items-center gap-2 mt-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100">
                                <Sparkles className="size-4 text-[#5DADE2]" />
                                <p className="text-sm font-medium text-[#0A2540]">{milestone.achievement}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </Card>

              {/* 투자 정보 */}
              {metrics.investments.length > 0 && (
                <Card className="p-6 bg-gradient-to-br from-emerald-50 via-teal-50 to-blue-50 border-emerald-200">
                  <div className="flex items-center gap-2 mb-6">
                    <DollarSign className="size-5 text-emerald-600" />
                    <h3 className="text-lg font-semibold text-[#0A2540]">투자 히스토리</h3>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    {metrics.investments.map((investment, index) => (
                      <motion.div
                        key={investment.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3, delay: 0.1 * index }}
                        className="p-5 bg-white rounded-xl border border-emerald-200 shadow-sm hover:shadow-md transition-all"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <Badge className="bg-emerald-600 text-white text-sm px-3 py-1">
                            {investment.round}
                          </Badge>
                          <span className="text-sm text-slate-600 flex items-center gap-1">
                            <Calendar className="size-3" />
                            {new Date(investment.date).toLocaleDateString("ko-KR")}
                          </span>
                        </div>
                        <p className="text-3xl font-bold text-[#0A2540] mb-3">
                          {formatCurrency(investment.amount)}
                        </p>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <Building2 className="size-4 text-slate-400" />
                            <span className="text-slate-700">{investment.investor}</span>
                          </div>
                          {investment.valuation && (
                            <div className="flex items-center gap-2 text-sm">
                              <BarChart3 className="size-4 text-slate-400" />
                              <span className="text-slate-600">기업 가치: {formatCurrency(investment.valuation)}</span>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </Card>
              )}
            </motion.div>
          )}

          {/* 성과 분석 탭 */}
          {selectedTab === "performance" && (
            <motion.div
              key="performance"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <div className="grid md:grid-cols-3 gap-6">
                {/* 월별 성장률 */}
                <Card className="p-6 col-span-2">
                  <h3 className="text-lg font-semibold text-[#0A2540] mb-4">월별 성장률 비교</h3>
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: 12 }} />
                      <YAxis stroke="#64748b" style={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          fontSize: 12,
                        }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="매출" stroke="#0A2540" strokeWidth={3} dot={{ r: 5 }} />
                      <Line type="monotone" dataKey="고객수" stroke="#5DADE2" strokeWidth={3} dot={{ r: 5 }} />
                      <Line type="monotone" dataKey="직원수" stroke="#27AE60" strokeWidth={3} dot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>

                {/* 성과 요약 */}
                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-[#0A2540] mb-4">성과 요약</h3>
                  <div className="space-y-4">
                    {[
                      { label: "특허 등록", value: currentMonthData?.patents || 0, icon: Award, color: "text-blue-600" },
                      { label: "인증 획득", value: currentMonthData?.certifications || 0, icon: Star, color: "text-purple-600" },
                      { label: "마일스톤", value: metrics.milestones.length, icon: Trophy, color: "text-amber-600" },
                      { label: "투자 유치", value: metrics.investments.length, icon: DollarSign, color: "text-emerald-600" },
                    ].map((item, index) => (
                      <motion.div
                        key={item.label}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: 0.1 * index }}
                        className="flex items-center justify-between p-4 bg-slate-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <item.icon className={`size-5 ${item.color}`} />
                          <span className="font-medium text-slate-700">{item.label}</span>
                        </div>
                        <span className="text-2xl font-bold text-[#0A2540]">{item.value}</span>
                      </motion.div>
                    ))}
                  </div>
                </Card>
              </div>

              {/* 주요 지표 상세 분석 */}
              <div className="grid md:grid-cols-2 gap-6">
                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-[#0A2540] mb-4">매출 구성 분석</h3>
                  <div className="space-y-4">
                    {[
                      { label: "B2B 사업", value: 60, color: "#0A2540" },
                      { label: "B2C 사업", value: 30, color: "#5DADE2" },
                      { label: "기타", value: 10, color: "#27AE60" },
                    ].map((item, index) => (
                      <div key={item.label}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-slate-700">{item.label}</span>
                          <span className="text-sm font-bold text-[#0A2540]">{item.value}%</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${item.value}%` }}
                            transition={{ duration: 0.8, delay: 0.2 * index }}
                            className="h-full rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-6">
                  <h3 className="text-lg font-semibold text-[#0A2540] mb-4">고객 전환율</h3>
                  <div className="space-y-4">
                    {[
                      { label: "방문자 → 가입", value: 45, color: "#5DADE2" },
                      { label: "가입 → 유료 전환", value: 28, color: "#0A2540" },
                      { label: "유료 → 유지율", value: 82, color: "#27AE60" },
                    ].map((item, index) => (
                      <div key={item.label}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-slate-700">{item.label}</span>
                          <span className="text-sm font-bold text-[#0A2540]">{item.value}%</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${item.value}%` }}
                            transition={{ duration: 0.8, delay: 0.2 * index }}
                            className="h-full rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              {/* 비즈니스 인사이트 */}
              <Card className="p-6 bg-gradient-to-br from-violet-50 to-indigo-50 border-violet-200">
                <div className="flex items-center gap-2 mb-6">
                  <Sparkles className="size-5 text-violet-600" />
                  <h3 className="text-lg font-semibold text-[#0A2540]">비즈니스 인사이트</h3>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  {[
                    {
                      title: "강점",
                      icon: TrendingUp,
                      color: "text-emerald-600",
                      bg: "bg-emerald-50",
                      content: "매출 성장률이 업계 평균(8%) 대비 높은 수준을 유지하고 있습니다. 고객 유지율도 우수합니다.",
                    },
                    {
                      title: "개선 필요",
                      icon: Target,
                      color: "text-amber-600",
                      bg: "bg-amber-50",
                      content: "신규 고객 획득 비용이 증가하고 있습니다. 마케팅 전략 재검토가 필요합니다.",
                    },
                    {
                      title: "기회",
                      icon: Rocket,
                      color: "text-blue-600",
                      bg: "bg-blue-50",
                      content: "ESG 투자 트렌드에 맞춰 사회적 가치를 강조한 IR 자료 준비를 권장합니다.",
                    },
                  ].map((insight, index) => (
                    <motion.div
                      key={insight.title}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.1 * index }}
                      className={`p-5 ${insight.bg} rounded-xl border border-${insight.color.split('-')[1]}-200`}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <insight.icon className={`size-5 ${insight.color}`} />
                        <h4 className="font-semibold text-[#0A2540]">{insight.title}</h4>
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed">{insight.content}</p>
                    </motion.div>
                  ))}
                </div>
              </Card>
            </motion.div>
          )}

          {/* 업계 뉴스 탭 */}
          {selectedTab === "news" && (
            <motion.div
              key="news"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {/* 트렌드 키워드 */}
              <Card className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
                <div className="flex items-center gap-2 mb-4">
                  <Globe className="size-5 text-[#5DADE2]" />
                  <h3 className="text-lg font-semibold text-[#0A2540]">현재 트렌드</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {trendingKeywords.map((keyword, index) => (
                    <motion.div
                      key={keyword}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2, delay: 0.05 * index }}
                    >
                      <Badge className="text-sm px-4 py-2 bg-white border-blue-200 text-[#0A2540] hover:bg-blue-50 cursor-pointer">
                        # {keyword}
                      </Badge>
                    </motion.div>
                  ))}
                </div>
              </Card>

              {/* 카테고리 필터 */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium text-slate-700">카테고리:</span>
                <Button
                  size="sm"
                  variant={selectedNewsCategory === null ? "default" : "outline"}
                  onClick={() => setSelectedNewsCategory(null)}
                  className={selectedNewsCategory === null ? "bg-[#5DADE2] hover:bg-[#5DADE2]/90" : ""}
                >
                  전체 ({news.length})
                </Button>
                {Object.entries(categoryLabels).map(([category, label]) => {
                  const count = news.filter(n => n.category === category).length;
                  return (
                    <Button
                      key={category}
                      size="sm"
                      variant={selectedNewsCategory === category ? "default" : "outline"}
                      onClick={() => setSelectedNewsCategory(category)}
                      className={selectedNewsCategory === category ? "bg-[#5DADE2] hover:bg-[#5DADE2]/90" : ""}
                    >
                      {label} ({count})
                    </Button>
                  );
                })}
              </div>

              {/* 뉴스 그리드 */}
              <div className="grid md:grid-cols-2 gap-6">
                {filteredNews.slice(0, 8).map((article, index) => (
                  <motion.div
                    key={article.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.05 * index }}
                  >
                    <Card className="overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer group h-full">
                      {article.imageUrl && (
                        <div className="h-48 overflow-hidden relative">
                          <img
                            src={article.imageUrl}
                            alt={article.title}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          />
                          <div className="absolute top-4 left-4">
                            <Badge
                              style={{
                                backgroundColor: categoryColors[article.category],
                                color: 'white',
                              }}
                              className="shadow-lg"
                            >
                              {categoryLabels[article.category]}
                            </Badge>
                          </div>
                          {article.relevanceScore > 85 && (
                            <div className="absolute top-4 right-4">
                              <Badge className="bg-amber-500 text-white shadow-lg">
                                <Star className="size-3 mr-1" />
                                주목
                              </Badge>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="p-5">
                        <div className="flex items-center gap-2 mb-3 text-xs text-slate-500">
                          <span className="font-medium text-[#5DADE2]">{article.source}</span>
                          <span>·</span>
                          <span>
                            {new Date(article.publishedAt).toLocaleDateString("ko-KR", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                        <h3 className="font-semibold text-[#0A2540] mb-2 group-hover:text-[#5DADE2] transition-colors line-clamp-2 text-lg">
                          {article.title}
                        </h3>
                        <p className="text-sm text-slate-600 line-clamp-3 mb-4">{article.description}</p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <Eye className="size-3" />
                              {Math.floor(Math.random() * 500 + 100)}
                            </span>
                            <span className="flex items-center gap-1">
                              <ThumbsUp className="size-3" />
                              {Math.floor(Math.random() * 50 + 10)}
                            </span>
                            <span className="flex items-center gap-1">
                              <MessageSquare className="size-3" />
                              {Math.floor(Math.random() * 20 + 5)}
                            </span>
                          </div>
                          <Button variant="ghost" size="sm" className="gap-1 text-[#5DADE2] hover:text-[#0A2540]">
                            읽기
                            <ChevronRight className="size-3" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>

              {/* API 안내 */}
              <Card className="p-6 bg-gradient-to-r from-slate-50 to-slate-100 border-slate-200">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-white rounded-lg">
                    <Info className="size-5 text-[#5DADE2]" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-[#0A2540] mb-2">실시간 뉴스 크롤링 설정</h4>
                    <p className="text-sm text-slate-600 mb-3">
                      현재는 샘플 데이터를 표시합니다. 실제 운영 환경에서는 뉴스 API를 연동하여 
                      실시간으로 업계 뉴스를 수집할 수 있습니다.
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="gap-2">
                        <FileText className="size-4" />
                        API 연동 가이드
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Globe className="size-4" />
                        News API 신청
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="mt-12 py-8 border-t border-slate-200 text-center text-sm text-slate-500">
          <p className="mb-2">
            이 리포트는 <span className="font-semibold text-[#5DADE2]">Grow with Merry</span> 플랫폼에서 자동 생성되었습니다.
          </p>
          <p>© 2026 MYSC. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
