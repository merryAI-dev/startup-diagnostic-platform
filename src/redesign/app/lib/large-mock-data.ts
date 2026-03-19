import { Application } from "@/redesign/app/lib/types";

// 30개 이상의 스타트업 (사업별로 분산)
export const startups = [
  // 농식품 (p1) - 12개 기업
  "그린팜테크", "푸드체인", "어글리어스", "로컬푸드랩", "팜투테이블", 
  "스마트팜솔루션", "유기농이음", "푸드리사이클", "농부의마음", 
  "클린푸드", "지속가능농장", "에코하베스트",
  
  // 해양수산 (p2) - 8개 기업
  "오션테크", "해양바이오랩", "블루카본", "스마트어장", 
  "씨푸드체인", "해양정화솔루션", "피시테크", "마린이노베이션",
  
  // 경기도 (p3) - 15개 기업
  "소셜임팩트", "공유경제랩", "로컬커넥트", "이음플랫폼", 
  "커뮤니티웍스", "함께성장", "지역재생연구소", "동네가게살리기",
  "협동조합연합", "사회혁신센터", "골목경제", "마을기업",
  "로컬크리에이터", "지역자산화", "공동체경제",
  
  // 환경 (p4) - 10개 기업
  "제로웨이스트", "리사이클테크", "업사이클스튜디오", "그린에너지랩",
  "탄소중립솔루션", "에코디자인", "순환경제", "클린오션",
  "재생에너지", "환경모니터링",
  
  // 사회서비스 (p5) - 9개 기업
  "케어테크", "시니어케어", "장애인자립지원", "돌봄플랫폼",
  "헬스케어혁신", "사회복지IT", "케어매칭", "건강돌봄",
  "복지서비스랩",
  
  // 교육 (p6) - 11개 기업
  "에듀테크이노베이션", "평등교육", "디지털배움터", "교육격차해소",
  "온라인학습랩", "미래교실", "학습멘토링", "교육접근성",
  "청소년성장지원", "평생교육플랫폼", "교육콘텐츠제작소",
];

// 컨설턴트 리스트
export const consultants = [
  "김임팩트", "이비즈", "정재무", "박마케팅", "최전략",
  "강성장", "윤혁신", "조컨설팅", "한멘토", "신전문가"
];

// 주제 리스트
export const topics = [
  "기술 개발", "임팩트 측정", "비즈니스 모델 수립", "고객 개발",
  "투자 유치", "마케팅 전략", "인사/조직 관리", "법률/계약",
  "재무 관리", "IR 준비", "채용 전략", "파트너십 구축"
];

// 프로그램별 기업 매핑
const programStartups: Record<string, string[]> = {
  p1: startups.slice(0, 12),
  p2: startups.slice(12, 20),
  p3: startups.slice(20, 35),
  p4: startups.slice(35, 45),
  p5: startups.slice(45, 54),
  p6: startups.slice(54, 65),
};

// 프로그램별 목표 건수 (총 570건)
const programTargets: Record<string, number> = {
  p1: 120, // 농식품
  p2: 60,  // 해양수산
  p3: 200, // 경기도 (가장 큼)
  p4: 50,  // 환경
  p5: 70,  // 사회서비스
  p6: 70,  // 교육
};

function randomDate(start: Date, end: Date): string {
  const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return date.toISOString().split('T')[0] ?? date.toISOString();
}

function randomTime(): string {
  const hours = 9 + Math.floor(Math.random() * 9); // 9-17시
  return `${String(hours).padStart(2, '0')}:00`;
}

function randomElement<T>(arr: T[]): T {
  const item = arr[Math.floor(Math.random() * arr.length)];
  if (item === undefined) {
    throw new Error("randomElement: empty array");
  }
  return item;
}

// 대규모 애플리케이션 데이터 생성
export function generateLargeApplications(): Application[] {
  const applications: Application[] = [];
  let idCounter = 1;

  // 2025년 7월 ~ 2026년 2월 (8개월)
  const startDate = new Date('2025-07-01');
  const endDate = new Date('2026-02-28');

  Object.entries(programTargets).forEach(([programId, targetCount]) => {
    const programCompanies = programStartups[programId] ?? [];
    if (programCompanies.length === 0) return;
    
    for (let i = 0; i < targetCount; i++) {
      const company = randomElement(programCompanies);
      const consultant = randomElement(consultants);
      const topic = randomElement(topics);
      const createdAt = randomDate(startDate, endDate);
      const createdDateObj = new Date(createdAt);
      
      // 상태 분포: 완료 60%, 확정 20%, 대기/검토 10%, 취소 10%
      const rand = Math.random();
      let status: Application['status'];
      let scheduledDate: string | undefined;
      let scheduledTime: string | undefined;
      
      if (rand < 0.6) {
        // 완료 (60%)
        status = 'completed';
        const sessionDate = new Date(createdDateObj.getTime() + Math.random() * 30 * 24 * 60 * 60 * 1000);
        scheduledDate = sessionDate.toISOString().split('T')[0];
        scheduledTime = randomTime();
      } else if (rand < 0.8) {
        // 확정 (20%)
        status = 'confirmed';
        const sessionDate = new Date(createdDateObj.getTime() + Math.random() * 45 * 24 * 60 * 60 * 1000);
        scheduledDate = sessionDate.toISOString().split('T')[0];
        scheduledTime = randomTime();
      } else if (rand < 0.9) {
        // 대기/검토 (10%)
        status = Math.random() < 0.5 ? 'pending' : 'review';
      } else {
        // 취소 (10%)
        status = 'cancelled';
      }

      // 일부 기업은 취소를 더 자주 함 (문제 패턴)
      const isCancellationProne = ['그린팜테크', '로컬커넥트', '제로웨이스트', '에듀테크이노베이션'].includes(company);
      if (isCancellationProne && Math.random() < 0.2) {
        status = 'cancelled';
      }

      applications.push({
        id: `app${idCounter++}`,
        type: Math.random() < 0.7 ? 'regular' : 'custom',
        companyName: company,
        applicantName: `${company} 대표`,
        applicantEmail: `contact@${company.replace(/\s/g, '').toLowerCase()}.com`,
        officeHourTitle: `${company} - ${topic}`,
        agenda: topic,
        details: `${topic}에 대한 상담이 필요합니다.`,
        requestContent: `${topic}에 대한 상담이 필요합니다.`,
        status,
        createdAt,
        updatedAt: createdAt,
        consultant: status !== "pending" ? `${consultant} 컨설턴트` : "담당자 배정 중",
        sessionFormat: Math.random() < 0.6 ? "online" : "offline",
        programId,
        scheduledDate,
        scheduledTime,
        duration: 2,
      });
    }
  });

  // 날짜순 정렬
  applications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return applications;
}

// 기업별 취소/변경 통계 생성
export function getCompanyCancellationStats(applications: Application[]) {
  const stats: Record<string, { 
    total: number; 
    cancelled: number; 
    completed: number;
    cancellationRate: number;
  }> = {};

  applications.forEach(app => {
    const companyName = app.companyName ?? "미지정";
    if (!stats[companyName]) {
      stats[companyName] = {
        total: 0,
        cancelled: 0,
        completed: 0,
        cancellationRate: 0,
      };
    }
    const record = stats[companyName];
    if (!record) return;
    record.total++;
    if (app.status === 'cancelled') {
      record.cancelled++;
    }
    if (app.status === 'completed') {
      record.completed++;
    }
  });

  // 취소율 계산
  Object.keys(stats).forEach(company => {
    const record = stats[company];
    if (!record) return;
    record.cancellationRate = Math.round((record.cancelled / record.total) * 100);
  });

  return stats;
}

// 주제별 월별 트렌드
export function getTopicMonthlyTrend(applications: Application[]) {
  const trend: Record<string, Record<string, number>> = {};

  applications.forEach(app => {
    if (!app.agenda) return;
    
    const month = String(app.createdAt).substring(0, 7); // YYYY-MM
    
    const bucket = trend[app.agenda] ?? (trend[app.agenda] = {});
    bucket[month] = (bucket[month] || 0) + 1;
  });

  return trend;
}

// 기업별 월별 활동
export function getCompanyMonthlyActivity(applications: Application[]) {
  const activity: Record<string, Record<string, number>> = {};

  applications.forEach(app => {
    const month = String(app.createdAt).substring(0, 7);
    const companyName = app.companyName ?? "미지정";
    const bucket = activity[companyName] ?? (activity[companyName] = {});
    bucket[month] = (bucket[month] || 0) + 1;
  });

  return activity;
}
