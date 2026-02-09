import { useState, useMemo, useEffect } from "react";
import { CompanyMetrics, MonthlyMetrics, User } from "../../lib/types";
import { getCompanyMetrics, createCompanyMetrics, calculateGrowthRate, formatCurrency, formatNumber } from "../../lib/company-metrics-data";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Card } from "../ui/card";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine
} from "recharts";
import {
  TrendingUp, TrendingDown, Users, DollarSign, Award, 
  Sparkles, Download, ChevronUp, ChevronDown, Trophy, Zap
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface CompanyMetricsPageProps {
  currentUser: User;
}

export function CompanyMetricsPage({ currentUser }: CompanyMetricsPageProps) {
  const [metrics, setMetrics] = useState<CompanyMetrics>(() => {
    return getCompanyMetrics(currentUser.companyName) || createCompanyMetrics(currentUser.companyName);
  });

  const [selectedMonth, setSelectedMonth] = useState<number>(10); // 현재 월 (10월)
  const [isChartOpen, setIsChartOpen] = useState(true);
  const [editingMonth, setEditingMonth] = useState<number | null>(null);
  const [tempValues, setTempValues] = useState<Partial<MonthlyMetrics>>({});
  const [showCelebration, setShowCelebration] = useState(false);

  // 현재 선택된 월의 데이터
  const currentMonthData = useMemo(() => {
    return metrics.data.find(d => d.month === selectedMonth);
  }, [metrics, selectedMonth]);

  // 이전 월의 데이터 (성장률 계산용)
  const previousMonthData = useMemo(() => {
    if (selectedMonth === 1) return null;
    return metrics.data.find(d => d.month === selectedMonth - 1);
  }, [metrics, selectedMonth]);

  // 성장률 계산
  const growthRates = useMemo(() => {
    if (!currentMonthData || !previousMonthData) return null;
    
    return {
      revenue: calculateGrowthRate(currentMonthData.revenue, previousMonthData.revenue),
      employees: calculateGrowthRate(currentMonthData.employees, previousMonthData.employees),
      customers: calculateGrowthRate(currentMonthData.customers, previousMonthData.customers),
    };
  }, [currentMonthData, previousMonthData]);

  // 차트 데이터 준비
  const chartData = useMemo(() => {
    return metrics.data.map(d => ({
      월: `${d.month}월`,
      매출: d.revenue / 10000, // 만원 단위
      직원수: d.employees,
      고객수: d.customers,
      MAU: d.monthlyActiveUsers || 0,
    }));
  }, [metrics]);

  // 투자 누적 데이터
  const investmentData = useMemo(() => {
    let cumulative = 0;
    return metrics.investments.map(inv => {
      cumulative += inv.amount;
      return {
        라운드: inv.round,
        투자금액: inv.amount / 100000000, // 억원 단위
        누적투자: cumulative / 100000000,
        기업가치: inv.valuation ? inv.valuation / 100000000 : 0,
      };
    });
  }, [metrics]);

  // 마일스톤 달성률
  const milestoneStats = useMemo(() => {
    const byCategory: Record<string, number> = {};
    metrics.milestones.forEach(ms => {
      byCategory[ms.category] = (byCategory[ms.category] || 0) + 1;
    });
    return byCategory;
  }, [metrics]);

  // 데이터 수정 시작
  const handleEdit = (month: number) => {
    const data = metrics.data.find(d => d.month === month);
    if (data) {
      setEditingMonth(month);
      setTempValues({ ...data });
    }
  };

  // 데이터 저장
  const handleSave = () => {
    if (editingMonth && tempValues) {
      const updatedData = metrics.data.map(d => 
        d.month === editingMonth ? { ...d, ...tempValues } : d
      );
      
      setMetrics({
        ...metrics,
        data: updatedData,
      });

      setEditingMonth(null);
      setTempValues({});
      
      // 축하 애니메이션
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 2000);
    }
  };

  // 입력 필드 업데이트
  const updateTempValue = (field: keyof MonthlyMetrics, value: string) => {
    const numValue = parseInt(value) || 0;
    setTempValues(prev => ({ ...prev, [field]: numValue }));
  };

  // 차트 다운로드 (간단한 구현)
  const handleDownload = () => {
    alert("차트 다운로드 기능은 곧 제공될 예정입니다!");
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border rounded-lg shadow-xl">
          <p className="font-semibold text-gray-900 mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: <span className="font-bold">{entry.value.toLocaleString()}</span>
              {entry.dataKey === "매출" && " 만원"}
              {entry.dataKey === "투자금액" && " 억원"}
              {entry.dataKey === "누적투자" && " 억원"}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const categoryKorean: Record<string, string> = {
    patent: "특허",
    certification: "인증",
    award: "수상",
    partnership: "파트너십",
    product: "제품",
    other: "기타",
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white border-b px-8 py-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" />
              실적 관리 대시보드
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {currentUser.companyName}의 2026년 성장 현황을 한눈에
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" />
              투자자료 다운로드
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setIsChartOpen(!isChartOpen)}
            >
              {isChartOpen ? (
                <>
                  <ChevronDown className="w-4 h-4 mr-2" />
                  차트 숨기기
                </>
              ) : (
                <>
                  <ChevronUp className="w-4 h-4 mr-2" />
                  차트 보기
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* 축하 애니메이션 */}
      <AnimatePresence>
        {showCelebration && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-24 left-1/2 transform -translate-x-1/2 z-50"
          >
            <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-8 py-4 rounded-full shadow-2xl flex items-center gap-3">
              <Trophy className="w-6 h-6" />
              <span className="font-bold text-lg">데이터 저장 완료! 🎉</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6" style={{ paddingBottom: isChartOpen ? '500px' : '20px' }}>
        {/* 월 선택 탭 */}
        <div className="mb-6">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(month => (
              <Button
                key={month}
                variant={selectedMonth === month ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedMonth(month)}
                className="min-w-[80px]"
              >
                {month}월
              </Button>
            ))}
          </div>
        </div>

        {/* 핵심 지표 카드 */}
        {currentMonthData && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="p-5 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-blue-700">매출</span>
                  <DollarSign className="w-5 h-5 text-blue-500" />
                </div>
                <div className="text-2xl font-bold text-blue-900">
                  {formatCurrency(currentMonthData.revenue)}
                </div>
                {growthRates && (
                  <div className="flex items-center gap-1 mt-2">
                    {growthRates.revenue > 0 ? (
                      <TrendingUp className="w-4 h-4 text-green-600" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-600" />
                    )}
                    <span className={`text-sm font-semibold ${growthRates.revenue > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {growthRates.revenue > 0 ? '+' : ''}{growthRates.revenue}%
                    </span>
                    <span className="text-xs text-gray-600 ml-1">전월 대비</span>
                  </div>
                )}
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="p-5 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-green-700">직원 수</span>
                  <Users className="w-5 h-5 text-green-500" />
                </div>
                <div className="text-2xl font-bold text-green-900">
                  {currentMonthData.employees}명
                </div>
                {growthRates && growthRates.employees > 0 && (
                  <div className="flex items-center gap-1 mt-2">
                    <TrendingUp className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-semibold text-green-600">
                      +{growthRates.employees}%
                    </span>
                    <span className="text-xs text-gray-600 ml-1">전월 대비</span>
                  </div>
                )}
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="p-5 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-purple-700">고객 수</span>
                  <Zap className="w-5 h-5 text-purple-500" />
                </div>
                <div className="text-2xl font-bold text-purple-900">
                  {formatNumber(currentMonthData.customers)}
                </div>
                {growthRates && (
                  <div className="flex items-center gap-1 mt-2">
                    <TrendingUp className="w-4 h-4 text-purple-600" />
                    <span className="text-sm font-semibold text-purple-600">
                      +{growthRates.customers}%
                    </span>
                    <span className="text-xs text-gray-600 ml-1">전월 대비</span>
                  </div>
                )}
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Card className="p-5 bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-orange-700">특허/인증</span>
                  <Award className="w-5 h-5 text-orange-500" />
                </div>
                <div className="text-2xl font-bold text-orange-900">
                  {currentMonthData.patents + currentMonthData.certifications}건
                </div>
                <div className="text-xs text-gray-600 mt-2">
                  특허 {currentMonthData.patents} | 인증 {currentMonthData.certifications}
                </div>
              </Card>
            </motion.div>
          </div>
        )}

        {/* 데이터 입력 폼 */}
        {currentMonthData && (
          <Card className="p-6 mb-6 bg-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg text-gray-900">
                {selectedMonth}월 실적 입력
              </h3>
              {editingMonth === selectedMonth ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditingMonth(null)}>
                    취소
                  </Button>
                  <Button size="sm" onClick={handleSave}>
                    저장
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => handleEdit(selectedMonth)}>
                  수정
                </Button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  매출 (원)
                </label>
                <Input
                  type="number"
                  value={editingMonth === selectedMonth ? tempValues.revenue || '' : currentMonthData.revenue}
                  onChange={(e) => updateTempValue('revenue', e.target.value)}
                  disabled={editingMonth !== selectedMonth}
                  className="text-lg font-semibold"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  직원 수 (명)
                </label>
                <Input
                  type="number"
                  value={editingMonth === selectedMonth ? tempValues.employees || '' : currentMonthData.employees}
                  onChange={(e) => updateTempValue('employees', e.target.value)}
                  disabled={editingMonth !== selectedMonth}
                  className="text-lg font-semibold"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  고객 수
                </label>
                <Input
                  type="number"
                  value={editingMonth === selectedMonth ? tempValues.customers || '' : currentMonthData.customers}
                  onChange={(e) => updateTempValue('customers', e.target.value)}
                  disabled={editingMonth !== selectedMonth}
                  className="text-lg font-semibold"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  특허 (누적)
                </label>
                <Input
                  type="number"
                  value={editingMonth === selectedMonth ? tempValues.patents || '' : currentMonthData.patents}
                  onChange={(e) => updateTempValue('patents', e.target.value)}
                  disabled={editingMonth !== selectedMonth}
                  className="text-lg font-semibold"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  인증 (누적)
                </label>
                <Input
                  type="number"
                  value={editingMonth === selectedMonth ? tempValues.certifications || '' : currentMonthData.certifications}
                  onChange={(e) => updateTempValue('certifications', e.target.value)}
                  disabled={editingMonth !== selectedMonth}
                  className="text-lg font-semibold"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  MAU (월간 활성 사용자)
                </label>
                <Input
                  type="number"
                  value={editingMonth === selectedMonth ? tempValues.monthlyActiveUsers || '' : currentMonthData.monthlyActiveUsers || 0}
                  onChange={(e) => updateTempValue('monthlyActiveUsers', e.target.value)}
                  disabled={editingMonth !== selectedMonth}
                  className="text-lg font-semibold"
                />
              </div>
            </div>
          </Card>
        )}

        {/* 마일스톤 타임라인 */}
        <Card className="p-6 bg-white">
          <h3 className="font-semibold text-lg text-gray-900 mb-4">주요 마일스톤</h3>
          <div className="space-y-3">
            {metrics.milestones.map((milestone, index) => (
              <motion.div
                key={milestone.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-start gap-4 p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <Award className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-gray-900">{milestone.title}</h4>
                    <Badge variant="secondary">{categoryKorean[milestone.category]}</Badge>
                  </div>
                  <p className="text-sm text-gray-600 mb-1">{milestone.description}</p>
                  {milestone.achievement && (
                    <p className="text-sm text-primary font-medium">{milestone.achievement}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">{milestone.date}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </Card>
      </div>

      {/* 하단 고정 차트 모달 */}
      <AnimatePresence>
        {isChartOpen && (
          <motion.div
            initial={{ y: 500 }}
            animate={{ y: 0 }}
            exit={{ y: 500 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg"
            style={{ height: '200px', zIndex: 40 }}
          >
            <div className="h-full overflow-y-auto px-6 py-3">
              <div className="flex items-center justify-end mb-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsChartOpen(false)}
                  className="h-6 w-6 p-0"
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid grid-cols-5 gap-3">
                {/* 매출 추이 + 추세선 */}
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-md p-2 border border-blue-200">
                  <h4 className="font-medium text-xs text-gray-600 mb-1">매출 추이</h4>
                  <ResponsiveContainer width="100%" height={100}>
                    <LineChart data={chartData}>
                      <XAxis dataKey="월" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line 
                        type="monotone" 
                        dataKey="매출" 
                        stroke="#3b82f6" 
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* 고객 수 증가 */}
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-md p-2 border border-purple-200">
                  <h4 className="font-medium text-xs text-gray-600 mb-1">고객 수</h4>
                  <ResponsiveContainer width="100%" height={100}>
                    <AreaChart data={chartData}>
                      <XAxis dataKey="월" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area 
                        type="monotone" 
                        dataKey="고객수" 
                        stroke="#8b5cf6" 
                        fill="#c4b5fd"
                        strokeWidth={1}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* 직원 수 증가 */}
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-md p-2 border border-green-200">
                  <h4 className="font-medium text-xs text-gray-600 mb-1">직원 수</h4>
                  <ResponsiveContainer width="100%" height={100}>
                    <BarChart data={chartData}>
                      <XAxis dataKey="월" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="직원수" fill="#86efac" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* MAU 추이 */}
                <div className="bg-gradient-to-br from-pink-50 to-pink-100 rounded-md p-2 border border-pink-200">
                  <h4 className="font-medium text-xs text-gray-600 mb-1">MAU</h4>
                  <ResponsiveContainer width="100%" height={100}>
                    <LineChart data={chartData}>
                      <XAxis dataKey="월" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line 
                        type="monotone" 
                        dataKey="MAU" 
                        stroke="#ec4899" 
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* 투자 현황 (있는 경우) */}
                {investmentData.length > 0 && (
                  <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-md p-2 border border-orange-200">
                    <h4 className="font-medium text-xs text-gray-600 mb-1">투자 현황</h4>
                    <ResponsiveContainer width="100%" height={100}>
                      <BarChart data={investmentData}>
                        <XAxis dataKey="라운드" tick={{ fontSize: 9 }} />
                        <YAxis tick={{ fontSize: 9 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="투자금액" fill="#fbbf24" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}