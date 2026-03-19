import { CompanyMetrics, MonthlyMetrics, Investment, Milestone } from "@/redesign/app/lib/types";

// 2026년 1월~10월 더미 데이터 생성
function generateMonthlyMetrics(companyName: string): MonthlyMetrics[] {
  const baseMetrics: Record<string, { revenue: number; employees: number; customers: number }> = {
    "임팩트 스타트업": { revenue: 50000000, employees: 8, customers: 120 },
    "그린테크": { revenue: 80000000, employees: 12, customers: 200 },
    "소셜벤처": { revenue: 35000000, employees: 5, customers: 80 },
  };

  const base = baseMetrics[companyName] || { revenue: 40000000, employees: 6, customers: 100 };
  const data: MonthlyMetrics[] = [];

  for (let month = 1; month <= 10; month++) {
    // 성장률: 월 평균 5-15% 성장 (변동성 있게)
    const growthRate = 1 + (Math.random() * 0.10 + 0.05);
    const prevRevenue =
      month === 1 ? base.revenue : data[month - 2]?.revenue ?? base.revenue;
    
    data.push({
      month,
      year: 2026,
      revenue: Math.round(prevRevenue * growthRate),
      employees: base.employees + Math.floor(month * 0.5), // 점진적 증가
      patents: Math.floor(month / 3), // 3개월마다 1개씩
      certifications: Math.floor(month / 4), // 4개월마다 1개씩
      customers: base.customers + Math.floor(month * 15 * (1 + Math.random() * 0.3)),
      monthlyActiveUsers: Math.round((base.customers + month * 20) * (0.6 + Math.random() * 0.2)),
    });
  }

  return data;
}

function generateInvestments(companyName: string): Investment[] {
  const investments: Investment[] = [];

  // 2025년 Seed 투자
  if (["임팩트 스타트업", "그린테크"].includes(companyName)) {
    investments.push({
      id: "inv1",
      date: "2025-06-15",
      round: "Seed",
      amount: 500000000, // 5억
      investor: "임팩트 벤처스",
      valuation: 2000000000, // 20억
    });
  }

  // 2026년 Pre-A 또는 Series A 투자
  if (companyName === "그린테크") {
    investments.push({
      id: "inv2",
      date: "2026-03-20",
      round: "Pre-A",
      amount: 1500000000, // 15억
      investor: "그린임팩트펀드, 소셜벤처캐피탈",
      valuation: 8000000000, // 80억
    });
  }

  if (companyName === "임팩트 스타트업") {
    investments.push({
      id: "inv2",
      date: "2026-07-10",
      round: "Bridge",
      amount: 700000000, // 7억
      investor: "성장플러스펀드",
      valuation: 4500000000, // 45억
    });
  }

  return investments;
}

function generateMilestones(companyName: string): Milestone[] {
  const milestones: Milestone[] = [
    {
      id: "ms1",
      date: "2026-02-10",
      title: "특허 1건 등록",
      category: "patent",
      description: "핵심 기술 특허 등록 완료",
      achievement: "AI 기반 임팩트 측정 알고리즘 특허",
    },
    {
      id: "ms2",
      date: "2026-04-15",
      title: "B Corp 인증 획득",
      category: "certification",
      description: "B Corporation 인증 획득",
      achievement: "종합 점수 92.5점",
    },
    {
      id: "ms3",
      date: "2026-06-20",
      title: "주요 파트너십 체결",
      category: "partnership",
      description: "대기업과 전략적 파트너십",
      achievement: "삼성전자 C-Lab과 협력 계약",
    },
    {
      id: "ms4",
      date: "2026-08-05",
      title: "신제품 출시",
      category: "product",
      description: "신규 SaaS 플랫폼 런칭",
      achievement: "출시 첫 달 가입자 500명 돌파",
    },
    {
      id: "ms5",
      date: "2026-09-12",
      title: "소셜임팩트 어워드 수상",
      category: "award",
      description: "사회혁신 우수기업 선정",
      achievement: "행정안전부 장관상",
    },
  ];

  return milestones;
}

// 샘플 기업들의 실적 데이터
export const companyMetricsData: CompanyMetrics[] = [
  {
    id: "cm1",
    companyName: "임팩트 스타트업",
    year: 2026,
    data: generateMonthlyMetrics("임팩트 스타트업"),
    investments: generateInvestments("임팩트 스타트업"),
    milestones: generateMilestones("임팩트 스타트업"),
  },
  {
    id: "cm2",
    companyName: "그린테크",
    year: 2026,
    data: generateMonthlyMetrics("그린테크"),
    investments: generateInvestments("그린테크"),
    milestones: generateMilestones("그린테크"),
  },
  {
    id: "cm3",
    companyName: "소셜벤처",
    year: 2026,
    data: generateMonthlyMetrics("소셜벤처"),
    investments: generateInvestments("소셜벤처"),
    milestones: generateMilestones("소셜벤처"),
  },
];

// 기업명으로 메트릭 데이터 가져오기
export function getCompanyMetrics(companyName: string): CompanyMetrics | undefined {
  return companyMetricsData.find(cm => cm.companyName === companyName);
}

// 새로운 기업 메트릭 생성
export function createCompanyMetrics(companyName: string): CompanyMetrics {
  return {
    id: `cm${Date.now()}`,
    companyName,
    year: 2026,
    data: generateMonthlyMetrics(companyName),
    investments: generateInvestments(companyName),
    milestones: generateMilestones(companyName),
  };
}

// 성장률 계산
export function calculateGrowthRate(current: number, previous: number): number {
  if (previous === 0) return 0;
  return Math.round(((current - previous) / previous) * 100);
}

// 포맷팅 유틸
export function formatCurrency(value: number): string {
  if (value >= 100000000) {
    return `${(value / 100000000).toFixed(1)}억원`;
  } else if (value >= 10000) {
    return `${(value / 10000).toFixed(0)}만원`;
  }
  return `${value.toLocaleString()}원`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString();
}
