import {
  Agenda,
  RegularOfficeHour,
  Application,
  Message,
  Consultant,
  MessageTemplate,
  UserWithPermissions,
  Program,
} from "@/redesign/app/lib/types";
import { generateLargeApplications } from "@/redesign/app/lib/large-mock-data";

export const programs: Program[] = [
  {
    id: "p1",
    name: "농식품",
    description: "농식품 분야 임팩트 기업 육성 프로그램",
    color: "#10b981", // green
    targetHours: 240,
    completedHours: 136,
    maxApplications: 120,
    usedApplications: 72,
    internalTicketLimit: 80,
    externalTicketLimit: 40,
    periodStart: "2026-02-01",
    periodEnd: "2026-05-31",
    weekdays: ["TUE", "THU"],
  },
  {
    id: "p2",
    name: "해양수산",
    description: "해양수산 분야 혁신 기업 지원 프로그램",
    color: "#3b82f6", // blue
    targetHours: 120,
    completedHours: 54,
    maxApplications: 60,
    usedApplications: 36,
    internalTicketLimit: 45,
    externalTicketLimit: 15,
    periodStart: "2026-02-01",
    periodEnd: "2026-04-30",
    weekdays: ["TUE", "THU"],
  },
  {
    id: "p3",
    name: "경기도",
    description: "경기도 소재 사회적경제 기업 지원",
    color: "#8b5cf6", // purple
    targetHours: 400,
    completedHours: 240,
    maxApplications: 200,
    usedApplications: 120,
    internalTicketLimit: 120,
    externalTicketLimit: 80,
    periodStart: "2026-02-01",
    periodEnd: "2026-07-31",
    weekdays: ["TUE", "THU"],
  },
  {
    id: "p4",
    name: "환경",
    description: "환경 문제 해결 스타트업 육성",
    color: "#059669", // emerald
    targetHours: 100,
    completedHours: 40,
    maxApplications: 50,
    usedApplications: 30,
    internalTicketLimit: 35,
    externalTicketLimit: 15,
    periodStart: "2026-02-01",
    periodEnd: "2026-04-30",
    weekdays: ["TUE", "THU"],
  },
  {
    id: "p5",
    name: "사회서비스",
    description: "사회서비스 분야 임팩트 비즈니스",
    color: "#ec4899", // pink
    targetHours: 140,
    completedHours: 67,
    maxApplications: 70,
    usedApplications: 42,
    internalTicketLimit: 50,
    externalTicketLimit: 20,
    periodStart: "2026-02-01",
    periodEnd: "2026-05-31",
    weekdays: ["TUE", "THU"],
  },
  {
    id: "p6",
    name: "교육",
    description: "교육 혁신 소셜벤처 지원",
    color: "#f59e0b", // amber
    targetHours: 140,
    completedHours: 88,
    maxApplications: 70,
    usedApplications: 42,
    internalTicketLimit: 50,
    externalTicketLimit: 20,
    periodStart: "2026-02-01",
    periodEnd: "2026-05-31",
    weekdays: ["TUE", "THU"],
  },
];

export const agendas: Agenda[] = [
  {
    id: "1",
    name: "기술 개발",
    scope: "internal",
    description: "기술 로드맵, 개발 우선순위, MVP 고도화",
    category: "EMA_기술",
    active: true,
  },
  {
    id: "2",
    name: "임팩트 측정",
    scope: "internal",
    description: "임팩트 지표 설계, 측정 체계 구축",
    category: "임팩트 측정",
    active: true,
  },
  {
    id: "3",
    name: "비즈니스 모델 수립",
    scope: "internal",
    description: "BM 진단 및 수익구조 설계",
    category: "BM 수립",
    active: true,
  },
  {
    id: "4",
    name: "고객 개발",
    scope: "internal",
    description: "타깃 고객 발굴 및 인터뷰 전략",
    category: "고객개발",
    active: true,
  },
  {
    id: "5",
    name: "투자 유치",
    scope: "external",
    description: "IR 자료 점검, 투자자 대응 전략",
    category: "투자",
    active: true,
  },
  {
    id: "6",
    name: "마케팅 전략",
    scope: "external",
    description: "채널 믹스 및 퍼포먼스 마케팅 기획",
    category: "마케팅",
    active: true,
  },
  {
    id: "7",
    name: "인사/조직 관리",
    scope: "external",
    description: "조직 운영, 채용 및 리더십 체계",
    category: "조직",
    active: true,
  },
  {
    id: "8",
    name: "법률/계약",
    scope: "external",
    description: "계약 검토 및 리스크 점검",
    category: "법률",
    active: true,
  },
];

export const regularOfficeHours: RegularOfficeHour[] = [
  {
    id: "r1",
    title: "2월 정기 오피스아워 - 임팩트 측정 전문",
    consultant: "김임팩트 컨설턴트",
    consultantId: "c1",
    programId: "p1",
    month: "2026-02",
    availableDates: ["2026-02-10", "2026-02-17", "2026-02-24"],
    description:
      "임팩트 측정 및 평가 전문가와 함께하는 정기 오피스아워입니다. 임팩트 지표 설정, 측정 방법론, 보고서 작성 등을 논의할 수 있습니다.",
  },
  {
    id: "r2",
    title: "2월 정기 오피스아워 - 비즈니스 모델 컨설팅",
    consultant: "이비즈 컨설턴트",
    consultantId: "c2",
    programId: "p3",
    month: "2026-02",
    availableDates: ["2026-02-12", "2026-02-19", "2026-02-26"],
    description:
      "비즈니스 모델 수립 및 개선을 위한 정기 오피스아워입니다. 수익 모델, 고객 세그먼트, 가치 제안 등을 함께 검토합니다.",
  },
  {
    id: "r3",
    title: "3월 정기 오피스아워 - 기술 개발 전략",
    consultant: "박기술 컨설턴트",
    consultantId: "c3",
    programId: "p2",
    month: "2026-03",
    availableDates: [
      "2026-03-10",
      "2026-03-17",
      "2026-03-24",
      "2026-03-31",
    ],
    description:
      "기술 개발 전략 및 R&D 관리 전문가와의 정기 오피스아워입니다. 기술 로드맵, 개발 우선순위, 협업 전략 등을 논의합니다.",
  },
];

export const initialApplications: Application[] = generateLargeApplications();

export const initialMessages: Message[] = [
  {
    id: "msg1",
    applicationId: "app1",
    content:
      "안녕하세요, 오피스아워 일정이 확정되었습니다. 2월 10일 오후 2시에 온라인으로 진행됩니다. Zoom 링크는 하루 전에 전송드리겠습니다.",
    sender: "consultant",
    timestamp: new Date("2026-02-04T10:30:00"),
  },
  {
    id: "msg2",
    applicationId: "app1",
    content:
      "감사합니다! 미팅 전에 추가로 검토하실 자료를 보내드려도 될까요?",
    sender: "user",
    timestamp: new Date("2026-02-04T14:20:00"),
  },
  {
    id: "msg3",
    applicationId: "app1",
    content:
      "네, 가능합니다. 미팅 2일 전까지 전달해주시면 사전 검토하겠습니다.",
    sender: "consultant",
    timestamp: new Date("2026-02-04T15:10:00"),
  },
];

export const getTimeSlots = (
  date: string,
): { time: string; available: boolean; reason?: string }[] => {
  const allSlots = [
    "09:00",
    "10:00",
    "11:00",
    "13:00",
    "14:00",
    "15:00",
    "16:00",
    "17:00",
  ];

  return allSlots.map((time) => ({
    time,
    available: true,
  }));
};

export const initialConsultants: Consultant[] = [
  {
    id: "c1",
    name: "김임팩트",
    title: "대표 컨설턴트",
    email: "impact.kim@mysc.co.kr",
    phone: "+82-2-1234-5678",
    expertise: [
      "임팩트 측정",
      "ESG 전략",
      "지속가능성",
      "사회가치 평가",
    ],
    bio: "10년 이상 임팩트 측정 및 ESG 컨설팅 경험을 보유한 전문가입니다.",
    detailedBio:
      "서울대학교 환경대학원에서 지속가능발전 석사학위를 취득한 후, 10년 이상 임팩트 기업 및 사회적 경제 조직의 임팩트 측정과 ESG 전략 수립을 지원해왔습니다. 100개 이상의 기업과 협업하며 임팩트 측정 프레임워크 구축, SDGs 연계 전략, 사회가치 평가 등을 수행했습니다.",
    education: [
      "서울대학교 환경대학원 지속가능발전 전공 (석사)",
      "연세대학교 경영학과 (학사)",
    ],
    certifications: [
      "ESG 전문가 (KCGS)",
      "사회가치측정 전문가 (SVI)",
      "임팩트투자 전문가 (GIIN)",
    ],
    publications: [
      "『임팩트 측정의 이론과 실제』 공저 (2024)",
      '"한국형 임팩트 측정 프레임워크 개발 연구" (2023)',
    ],
    linkedIn: "linkedin.com/in/impact-kim",
    status: "active",
    sessionsCompleted: 127,
    satisfaction: 4.9,
    joinedDate: new Date("2021-03-15"),
    availability: [
      {
        dayOfWeek: 1,
        slots: [
          { start: "09:00", end: "10:00", available: true },
          { start: "10:00", end: "11:00", available: true },
          { start: "14:00", end: "15:00", available: true },
          { start: "15:00", end: "16:00", available: true },
        ],
      },
      {
        dayOfWeek: 2,
        slots: [
          { start: "09:00", end: "10:00", available: true },
          { start: "13:00", end: "14:00", available: true },
          { start: "14:00", end: "15:00", available: true },
        ],
      },
      {
        dayOfWeek: 4,
        slots: [
          { start: "10:00", end: "11:00", available: true },
          { start: "14:00", end: "15:00", available: true },
          { start: "15:00", end: "16:00", available: true },
        ],
      },
    ],
  },
  {
    id: "c2",
    name: "이비즈",
    title: "시니어 컨설턴트",
    email: "biz.lee@mysc.co.kr",
    phone: "+82-2-1234-5679",
    expertise: [
      "비즈니스 모델",
      "전략 기획",
      "고객 개발",
      "시장 검증",
    ],
    bio: "스타트업 비즈니스 모델 수립 및 전략 컨설팅 전문가입니다.",
    detailedBio:
      "실리콘밸리 스타트업에서 5년간 근무 후 한국에서 스타트업 컨설팅을 시작했습니다. 린 스타트업과 디자인 씽킹 방법론을 활용하여 80개 이상의 스타트업이 Product-Market Fit을 찾도록 지원했으며, 특히 비즈니스 모델 혁신과 고객 개발 전략에 강점을 가지고 있습니다.",
    education: [
      "스탠포드대학교 MBA",
      "카이스트 전산학과 (학사)",
    ],
    certifications: [
      "Lean Startup Certified Instructor",
      "Design Thinking Facilitator (IDEO)",
    ],
    publications: [
      '"비즈니스 모델 혁신 사례 연구" (Harvard Business Review Korea, 2024)',
      "『린 스타트업 실전 가이드』 번역 (2022)",
    ],
    linkedIn: "linkedin.com/in/biz-lee",
    status: "active",
    sessionsCompleted: 94,
    satisfaction: 4.8,
    joinedDate: new Date("2021-08-01"),
    availability: [
      {
        dayOfWeek: 1,
        slots: [
          { start: "13:00", end: "14:00", available: true },
          { start: "14:00", end: "15:00", available: true },
          { start: "15:00", end: "16:00", available: true },
        ],
      },
      {
        dayOfWeek: 3,
        slots: [
          { start: "09:00", end: "10:00", available: true },
          { start: "10:00", end: "11:00", available: true },
          { start: "14:00", end: "15:00", available: true },
        ],
      },
      {
        dayOfWeek: 5,
        slots: [
          { start: "09:00", end: "10:00", available: true },
          { start: "13:00", end: "14:00", available: true },
        ],
      },
    ],
  },
  {
    id: "c3",
    name: "박기술",
    title: "기술 전문 컨설턴트",
    email: "tech.park@mysc.co.kr",
    phone: "+82-2-1234-5680",
    expertise: [
      "기술 개발",
      "R&D 전략",
      "디지털 전환",
      "AI/ML",
    ],
    bio: "기술 스타트업의 R&D 전략 및 기술 로드맵 수립 전문가입니다.",
    detailedBio:
      "네이버와 카카오에서 10년 이상 기술 개발 및 프로젝트 매니저로 근무한 경험을 바탕으로, 스타트업의 기술 전략과 개발 로드맵 수립을 지원합니다. 특히 AI/ML 기술을 활용한 비즈니스 혁신과 디지털 전환 프로젝트에 전문성을 가지고 있습니다.",
    education: [
      "카이스트 전산학과 박사",
      "서울대학교 컴퓨터공학과 (학사)",
    ],
    certifications: [
      "AWS Certified Solutions Architect",
      "Google Cloud Professional",
      "PMP (Project Management Professional)",
    ],
    publications: [
      '"AI 스타트업의 기술 전략" (2024)',
      "다수의 국제 학술지 논문 게재 (SCI급 10편)",
    ],
    linkedIn: "linkedin.com/in/tech-park",
    status: "active",
    sessionsCompleted: 76,
    satisfaction: 4.9,
    joinedDate: new Date("2022-01-10"),
    availability: [
      {
        dayOfWeek: 2,
        slots: [
          { start: "10:00", end: "11:00", available: true },
          { start: "13:00", end: "14:00", available: true },
          { start: "14:00", end: "15:00", available: true },
        ],
      },
      {
        dayOfWeek: 4,
        slots: [
          { start: "09:00", end: "10:00", available: true },
          { start: "13:00", end: "14:00", available: true },
          { start: "15:00", end: "16:00", available: true },
        ],
      },
    ],
  },
  {
    id: "c4",
    name: "최투자",
    title: "투자/재무 전문 컨설턴트",
    email: "invest.choi@mysc.co.kr",
    phone: "+82-2-1234-5681",
    expertise: ["투자 유치", "재무 전략", "IR", "밸류에이션"],
    bio: "스타트업 투자 유치 및 재무 전략 수립 전문가입니다.",
    detailedBio:
      "대형 VC에서 투자심사역으로 근무하며 50개 이상의 스타트업 투자를 집행한 경험을 바탕으로, 현재는 스타트업의 투자 유치 전략과 IR 자료 작성을 지원합니다. 초기 단계부터 시리즈 B까지 전 단계의 펀딩 라운드 경험이 있으며, 투자자 관점에서의 실질적인 조언을 제공합니다.",
    education: [
      "와튼스쿨 MBA (Finance)",
      "고려대학교 경영학과 (학사)",
    ],
    certifications: [
      "CFA (Chartered Financial Analyst)",
      "벤처투자 전문가 (한국벤처투자협회)",
    ],
    publications: [
      "『스타트업 투자 유치 전략』 (2023)",
      '"한국 스타트업 생태계 분석 보고서" 공저 (2024)',
    ],
    linkedIn: "linkedin.com/in/invest-choi",
    status: "active",
    sessionsCompleted: 103,
    satisfaction: 4.8,
    joinedDate: new Date("2021-06-01"),
    availability: [
      {
        dayOfWeek: 1,
        slots: [
          { start: "10:00", end: "11:00", available: true },
          { start: "14:00", end: "15:00", available: true },
        ],
      },
      {
        dayOfWeek: 3,
        slots: [
          { start: "13:00", end: "14:00", available: true },
          { start: "14:00", end: "15:00", available: true },
          { start: "15:00", end: "16:00", available: true },
        ],
      },
    ],
  },
  {
    id: "c5",
    name: "정마케팅",
    title: "마케팅 전략 컨설턴트",
    email: "marketing.jung@mysc.co.kr",
    phone: "+82-2-1234-5682",
    expertise: [
      "마케팅 전략",
      "브랜딩",
      "고객 획득",
      "그로스 해킹",
    ],
    bio: "디지털 마케팅과 브랜드 전략 수립 전문가입니다.",
    detailedBio:
      "글로벌 마케팅 에이전시에서 10년 경력 후 임팩트 기업 마케팅을 전문으로 하고 있습니다. 성과 중심의 디지털 마케팅부터 브랜드 아이덴티티 구축까지, 임팩트 비즈니스의 특성을 이해하고 마케팅 전략을 수립합니다.",
    education: [
      "연세대학교 커뮤니케이션대학원 (석사)",
      "이화여대 경영학과 (학사)",
    ],
    certifications: [
      "Google Ads 공인 전문가",
      "Facebook Blueprint Certified",
      "브랜드 매니저 자격증",
    ],
    publications: [
      '"임팩트 브랜딩 전략" (2024)',
      "『소셜 벤처를 위한 마케팅 가이드』 (2022)",
    ],
    linkedIn: "linkedin.com/in/marketing-jung",
    status: "active",
    sessionsCompleted: 58,
    satisfaction: 4.7,
    joinedDate: new Date("2022-09-01"),
    availability: [
      {
        dayOfWeek: 2,
        slots: [
          { start: "09:00", end: "10:00", available: true },
          { start: "14:00", end: "15:00", available: true },
          { start: "15:00", end: "16:00", available: true },
        ],
      },
      {
        dayOfWeek: 4,
        slots: [
          { start: "10:00", end: "11:00", available: true },
          { start: "13:00", end: "14:00", available: true },
        ],
      },
    ],
  },
  {
    id: "c6",
    name: "강법률",
    title: "법률/지적재산권 컨설턴트",
    email: "legal.kang@mysc.co.kr",
    phone: "+82-2-1234-5683",
    expertise: [
      "기업 법무",
      "계약서",
      "지적재산권",
      "투자 계약",
    ],
    bio: "스타트업 법무 및 지적재산권 보호 전문 변호사입니다.",
    detailedBio:
      "법무법인에서 10년 이상 기업 법무를 담당한 후 스타트업 전문 변호사로 활동 중입니다. 계약서 검토, 투자 계약, 특허·상표 등 지적재산권 보호, 분쟁 해결 등 스타트업이 겪는 법률 문제를 실무적으로 지원합니다.",
    education: [
      "서울대학교 법학전문대학원 (J.D.)",
      "서울대학교 법학과 (학사)",
    ],
    certifications: [
      "변호사 (대한변호사협회)",
      "미국 뉴욕주 변호사",
    ],
    publications: [
      "『스타트업 법률 가이드』 (2023)",
      '"스타트업 투자 계약의 이해" (법률신문, 2024)',
    ],
    linkedIn: "linkedin.com/in/legal-kang",
    status: "active",
    sessionsCompleted: 41,
    satisfaction: 4.9,
    joinedDate: new Date("2023-02-01"),
    availability: [
      {
        dayOfWeek: 3,
        slots: [
          { start: "09:00", end: "10:00", available: true },
          { start: "13:00", end: "14:00", available: true },
          { start: "14:00", end: "15:00", available: true },
        ],
      },
      {
        dayOfWeek: 5,
        slots: [
          { start: "10:00", end: "11:00", available: true },
          { start: "14:00", end: "15:00", available: true },
        ],
      },
    ],
  },
];

export const initialMessageTemplates: MessageTemplate[] = [
  {
    id: "t1",
    title: "신청 접수 확인",
    category: "confirmation",
    subject: "Grow with Merry 오피스아워 신청이 접수되었습니다",
    content:
      "안녕하세요 {{applicantName}}님,\n\n{{officeHourTitle}} 신청이 정상적으로 접수되었습니다.\n\n담당 컨설턴트가 검토 후 빠른 시일 내에 연락드리겠습니다.\n\n감사합니다.\nGrow with Merry 팀",
    variables: ["applicantName", "officeHourTitle"],
    createdAt: new Date("2026-01-15"),
    updatedAt: new Date("2026-01-15"),
  },
  {
    id: "t2",
    title: "일정 확정 안내",
    category: "confirmation",
    subject: "오피스아워 일정이 확정되었습니다",
    content:
      "안녕하세요 {{applicantName}}님,\n\n오피스아워 일정이 확정되었습니다.\n\n일시: {{sessionDate}} {{sessionTime}}\n담당 컨설턴트: {{consultantName}}\n진행 방식: {{sessionFormat}}\n\n{{meetingLink}}\n\n준비하실 내용이 있으시면 미팅 2일 전까지 회신 부탁드립니다.\n\n감사합니다.\nGrow with Merry 팀",
    variables: [
      "applicantName",
      "sessionDate",
      "sessionTime",
      "consultantName",
      "sessionFormat",
      "meetingLink",
    ],
    createdAt: new Date("2026-01-15"),
    updatedAt: new Date("2026-01-20"),
  },
  {
    id: "t3",
    title: "미팅 1일 전 리마인더",
    category: "reminder",
    subject: "내일 오피스아워 일정 안내",
    content:
      "안녕하세요 {{applicantName}}님,\n\n내일 예정된 오피스아워를 안내드립니다.\n\n일시: {{sessionDate}} {{sessionTime}}\n담당 컨설턴트: {{consultantName}}\n\n{{meetingLink}}\n\n준비하신 자료가 있으시면 미리 공유 부탁드립니다.\n\n감사합니다.\nGrow with Merry 팀",
    variables: [
      "applicantName",
      "sessionDate",
      "sessionTime",
      "consultantName",
      "meetingLink",
    ],
    createdAt: new Date("2026-01-18"),
    updatedAt: new Date("2026-01-18"),
  },
  {
    id: "t4",
    title: "팔로우업 요청",
    category: "followup",
    subject: "오피스아워 후속 조치 안내",
    content:
      "안녕하세요 {{applicantName}}님,\n\n지난 {{sessionDate}} 오피스아워에 참여해주셔서 감사합니다.\n\n논의된 내용에 대한 후속 조치나 추가 질문이 있으시면 언제든지 회신 부탁드립니다.\n\n감사합니다.\nGrow with Merry 팀",
    variables: ["applicantName", "sessionDate"],
    createdAt: new Date("2026-01-20"),
    updatedAt: new Date("2026-01-20"),
  },
  {
    id: "t5",
    title: "비정기 검토 중",
    category: "review",
    subject: "비정기 오피스아워 신청 검토 중입니다",
    content:
      "안녕하세요 {{applicantName}}님,\n\n비정기 오피스아워 신청을 검토 중입니다.\n\n적합한 컨설턴트를 배정하고 일정을 조율하는 데 영업일 기준 2-3일 소요될 예정입니다.\n\n조금만 기다려주시면 빠르게 연락드리겠습니다.\n\n감사합니다.\nGrow with Merry 팀",
    variables: ["applicantName"],
    createdAt: new Date("2026-01-22"),
    updatedAt: new Date("2026-01-22"),
  },
];

export const initialUsers: UserWithPermissions[] = [
  {
    id: "u1",
    email: "user1@startup.com",
    companyName: "임팩트 스타트업",
    programName: "MYSC EMA",
    role: "user",
    permissions: {
      canApplyRegular: true,
      canApplyIrregular: true,
      canViewAll: false,
    },
    status: "active",
    createdAt: new Date("2025-12-01"),
    lastLoginAt: new Date("2026-02-06"),
  },
  {
    id: "u2",
    email: "user2@greentech.com",
    companyName: "그린테크",
    programName: "MYSC Accelerator",
    role: "user",
    permissions: {
      canApplyRegular: true,
      canApplyIrregular: false,
      canViewAll: false,
    },
    status: "active",
    createdAt: new Date("2026-01-10"),
    lastLoginAt: new Date("2026-02-05"),
  },
  {
    id: "u3",
    email: "user3@socialventure.com",
    companyName: "소셜벤처",
    programName: "MYSC EMA",
    role: "user",
    permissions: {
      canApplyRegular: true,
      canApplyIrregular: true,
      canViewAll: false,
    },
    status: "active",
    createdAt: new Date("2025-11-15"),
    lastLoginAt: new Date("2026-02-03"),
  },
  {
    id: "u4",
    email: "user4@impactco.com",
    companyName: "임팩트컴퍼니",
    programName: "MYSC Partner",
    role: "user",
    permissions: {
      canApplyRegular: false,
      canApplyIrregular: true,
      canViewAll: false,
    },
    status: "inactive",
    createdAt: new Date("2025-10-20"),
    lastLoginAt: new Date("2026-01-15"),
  },
  {
    id: "admin",
    email: "admin@mysc.co.kr",
    companyName: "MYSC",
    programName: "관리자",
    role: "admin",
    permissions: {
      canApplyRegular: true,
      canApplyIrregular: true,
      canViewAll: true,
    },
    status: "active",
    createdAt: new Date("2025-01-01"),
    lastLoginAt: new Date("2026-02-06"),
  },
];
