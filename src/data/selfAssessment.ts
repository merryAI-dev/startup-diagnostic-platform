import type { SelfAssessmentSection } from "../types/selfAssessment"

export const SELF_ASSESSMENT_SECTIONS: SelfAssessmentSection[] = [
  {
    id: "problem",
    storageKey: "problem",
    title: "문제",
    totalScore: 20,
    description:
      "우리 회사가 해결하고자 하는 문제가 무엇인지, 내부/외부에서 설득력 있게 설명 가능한지 확인합니다.",
    subsections: [
      {
        id: "problem-definition",
        storageKey: "problem_definition",
        title: "문제정의",
        totalScore: 20,
        description:
          "우리 회사가 비즈니스를 통해 해결하고자 하는 문제를 내외부 이해관계자에게 효과적으로 설명하는지 확인합니다.",
        questions: [
          {
            id: "problem_q1",
            storageKey: "q1",
            text:
              "우리 회사가 해결하고자 하는 문제가 무엇인지 설명할 수 있다",
            tag: "문제정의",
            weight: 7,
          },
          {
            id: "problem_q2",
            storageKey: "q2",
            text:
              "우리 회사가 해결하고자 하는 문제로 인해 발생하는 사회적 비용 혹은 문제의 심각성을 외부에 객관적으로 설명할 수 있다",
            tag: "외부에 갖는 설득력",
            weight: 7,
          },
          {
            id: "problem_q3",
            storageKey: "q3",
            text:
              "우리 회사가 해결하고자 하는 문제를 내부 임직원 누구나 자신의 언어로 설명할 수 있다",
            tag: "내부 임직원 공감대",
            weight: 6,
          },
        ],
      },
    ],
  },
  {
    id: "solution",
    storageKey: "solution",
    title: "솔루션",
    totalScore: 20,
    description:
      "제품/서비스의 구체성과 차별성을 확인하고 핵심 가설 검증 여부를 점검합니다.",
    subsections: [
      {
        id: "solution-specificity",
        storageKey: "item_specificity",
        title: "아이템의 구체성",
        totalScore: 10,
        description:
          "제품/서비스가 구체적으로 도출되었고 중요 가설을 검증했는지 확인합니다.",
        questions: [
          {
            id: "solution_q1",
            storageKey: "q1",
            text:
              "우리의 제품/서비스가 구체적으로 무엇인지 설명할 수 있다",
            tag: "아이템의 구체성",
            weight: 2.5,
          },
          {
            id: "solution_q2",
            storageKey: "q2",
            text:
              "우리의 제품/서비스를 확인할 수 있는 최소한의 MVP를 보유하고 있다 (예: 프로토타입, 시제품, 웹/앱 베타 등)",
            tag: "MVP",
            weight: 2.5,
          },
          {
            id: "solution_q3",
            storageKey: "q3",
            text:
              "우리의 MVP를 활용해 잠재 고객으로부터 핵심적인 가설을 검증했다",
            tag: "가설 검증",
            weight: 2.5,
          },
          {
            id: "solution_q4",
            storageKey: "q4",
            text:
              "제품/서비스로 가설 검증을 진행한 경우, 차별성을 고객 피드백으로 설명할 수 있다",
            tag: "고객 피드백",
            weight: 2.5,
          },
        ],
      },
      {
        id: "solution-differentiation",
        storageKey: "item_differentiation",
        title: "아이템의 차별성",
        totalScore: 10,
        description:
          "제품/서비스의 차별성을 객관적으로 설명하고 시장 포지셔닝을 이해하고 있는지 확인합니다.",
        questions: [
          {
            id: "diff_q1",
            storageKey: "q1",
            text:
              "우리의 제품/서비스가 기존 솔루션에 비해 어떤 차별적 경쟁력을 가지고 있는지 설명할 수 있다",
            tag: "아이템의 차별성",
            weight: 2,
          },
          {
            id: "diff_q2",
            storageKey: "q2",
            text:
              "제품/서비스 관련 기술 우위를 가지고 있어 디딤돌/TIPS 등 정부 R&D 지원사업에 선정되었다",
            tag: "R&D 지원",
            weight: 1,
          },
          {
            id: "diff_q3",
            storageKey: "q3",
            text:
              "제품/서비스 관련 주요 내용을 특허로 등록하거나 기술평가등급(TRL/TI)을 부여받았다",
            tag: "특허 및 기술평가",
            weight: 1.5,
          },
          {
            id: "diff_q4",
            storageKey: "q4",
            text:
              "시장 내 기존 솔루션 대비 차별적인 포지션을 분석해 설명할 수 있다 (가격, 기능, 품질 등)",
            tag: "시장 내 포지셔닝",
            weight: 2,
          },
          {
            id: "diff_q5",
            storageKey: "q5",
            text:
              "경쟁사가 우리 솔루션을 실행하지 못하는 이유를 설명할 수 있다",
            tag: "시장 내 포지셔닝",
            weight: 2,
          },
          {
            id: "diff_q6",
            storageKey: "q6",
            text:
              "시장에 아직 존재하지 않는 솔루션으로, 안착 시 첫 번째 제품/서비스로 시장을 선점할 수 있다",
            tag: "First Mover",
            weight: 1.5,
          },
        ],
      },
    ],
  },
  {
    id: "business",
    storageKey: "business",
    title: "사업화(비즈니스)",
    totalScore: 20,
    description:
      "제품/서비스를 사업화하는 비즈니스모델 전반의 준비도를 확인합니다.",
    subsections: [
      {
        id: "business-model",
        storageKey: "business_model",
        title: "비즈니스모델",
        totalScore: 20,
        description:
          "제품/서비스를 고객에게 전달하고 수익을 창출하는 구조를 설명할 수 있는지 확인합니다.",
        questions: [
          {
            id: "business_q1",
            storageKey: "q1",
            text:
              "우리 회사가 제품/서비스를 제공하여 고객에게 전달되고 수익을 창출하는 전 과정을 구체적으로 설명할 수 있다 (예: B2C, B2B 등)",
            tag: "비즈니스모델",
            weight: 3,
          },
          {
            id: "business_q2",
            storageKey: "q2",
            text:
              "우리의 제품/서비스의 고객이 누구이며 어떤 특성을 가지고 있는지 설명할 수 있다",
            tag: "고객과 시장",
            weight: 3,
          },
          {
            id: "business_q3",
            storageKey: "q3",
            text:
              "우리의 제품/서비스가 타겟팅하는 시장의 규모와 잠재력에 대해 설득할 수 있다 (예: TAM-SAM-SOM 등)",
            tag: "고객과 시장",
            weight: 2,
          },
          {
            id: "business_q4",
            storageKey: "q4",
            text:
              "제품/서비스를 판매하기 위해 고객을 만날 수 있는 채널을 구체적으로 마련하였다 (예: 자사몰, 유통판로 등)",
            tag: "고객과 시장",
            weight: 2,
          },
          {
            id: "business_q5",
            storageKey: "q5",
            text:
              "제품/서비스의 고객 확보를 위한 영업 및 마케팅 전략을 설명할 수 있다 (예: 프로모션, Lock-in 전략 등)",
            tag: "마케팅 및 그로스해킹",
            weight: 2,
          },
          {
            id: "business_q6",
            storageKey: "q6",
            text:
              "해당될 경우, 제품/서비스와 관련된 퍼널 데이터를 체계적으로 구축하였다 (예: 이탈률, 전환율, 재구매율 등)",
            tag: "마케팅 및 그로스해킹",
            weight: 2,
          },
          {
            id: "business_q7",
            storageKey: "q7",
            text:
              "우리의 제품/서비스에 대해 우리 회사의 핵심 활동이 무엇인지 설명할 수 있다 (예: OEM 위탁, 직접 제조, 유통 등)",
            tag: "핵심활동",
            weight: 2,
          },
          {
            id: "business_q8",
            storageKey: "q8",
            text:
              "제품/서비스를 판매하여 수익을 창출하는 방법과 장기적으로 수익을 극대화하는 방안을 설명할 수 있다",
            tag: "수익과 비용",
            weight: 2,
          },
          {
            id: "business_q9",
            storageKey: "q9",
            text:
              "제품/서비스를 판매하기까지 소요되는 비용구조와 장기적인 비용절감 방안을 설명할 수 있다",
            tag: "수익과 비용",
            weight: 2,
          },
        ],
      },
    ],
  },
  {
    id: "funding",
    storageKey: "funding",
    title: "자금조달(혼합금융)",
    totalScore: 15,
    description:
      "지원금, 융자, 투자 등 자금조달 준비 현황과 향후 계획을 확인합니다.",
    subsections: [
      {
        id: "funding-grants",
        storageKey: "grants",
        title: "지원금",
        totalScore: 5,
        description:
          "정부 및 민간 지원금 확보 현황과 향후 참여 계획을 확인합니다.",
        questions: [
          {
            id: "funding_q1",
            storageKey: "q1",
            text:
              "우리 회사는 오늘 기준 다양한 정부와 민간의 지원금을 확보하고 있다",
            tag: "지원금",
            weight: 2.5,
          },
          {
            id: "funding_q2",
            storageKey: "q2",
            text:
              "우리 회사는 향후 3년간 어떤 지원사업에 참여할지 계획안을 가지고 있다",
            tag: "지원 사업 참여",
            weight: 2.5,
          },
        ],
      },
      {
        id: "funding-loans",
        storageKey: "loans",
        title: "융자",
        totalScore: 5,
        description:
          "융자 확보 현황과 활용 가능한 혜택/상품 파악 여부를 확인합니다.",
        questions: [
          {
            id: "loan_q1",
            storageKey: "q1",
            text:
              "해당될 경우, 레버리지로 필요한 융자를 확보하고 있으며 원활한 이자상환이 이뤄지고 있다",
            tag: "융자",
            weight: 2.5,
          },
          {
            id: "loan_q2",
            storageKey: "q2",
            text:
              "앞으로 활용 가능한 저금리 융자 상품 또는 스타트업 혜택을 파악하고 있다",
            tag: "융자 활용 계획",
            weight: 2.5,
          },
        ],
      },
      {
        id: "funding-investment",
        storageKey: "investment",
        title: "투자",
        totalScore: 5,
        description:
          "투자 유치 경험과 준비 수준을 점검합니다.",
        questions: [
          {
            id: "invest_q1",
            storageKey: "q1",
            text: "이전에 지분투자를 유치한 이력이 있다",
            tag: "투자 유치 경험",
            weight: 1,
          },
          {
            id: "invest_q2",
            storageKey: "q2",
            text:
              "관심 있는 투자자들에게 정기적으로 회사 성과를 공유하고 있다",
            tag: "투자 유치 준비",
            weight: 1,
          },
          {
            id: "invest_q3",
            storageKey: "q3",
            text:
              "외부 요청 시 당일 송부할 수준으로 IR Deck을 3개월 이내 업데이트하고 있다",
            tag: "투자 유치 준비",
            weight: 1,
          },
          {
            id: "invest_q4",
            storageKey: "q4",
            text:
              "투자 마일스톤을 수립해 런웨이를 확인하며 투자 필요 시점을 매달 확인하고 있다",
            tag: "투자 일정 관리",
            weight: 1,
          },
          {
            id: "invest_q5",
            storageKey: "q5",
            text:
              "투자를 받아 비즈니스를 확장해 나갈 계획을 구체적인 수치로 제시할 수 있다",
            tag: "스케일업 계획",
            weight: 1,
          },
        ],
      },
    ],
  },
  {
    id: "team",
    storageKey: "team",
    title: "팀/조직",
    totalScore: 20,
    description:
      "구성원의 역량, 조직문화, 리스크 관리, 인증 준비 상태를 확인합니다.",
    subsections: [
      {
        id: "team-capability",
        storageKey: "business_capability",
        title: "사업적 역량",
        totalScore: 8,
        description:
          "사업 실행 역량과 인재 유치/육성 준비 상태를 확인합니다.",
        questions: [
          {
            id: "team_q1",
            storageKey: "q1",
            text:
              "우리 회사의 구성원들이 사업을 성공적으로 이끌어갈 역량과 역할로 구성되어 있음을 설명할 수 있다 (예: 이전 경력, 자격증, 역할 구조 등)",
            tag: "사업적 역량",
            weight: 2,
          },
          {
            id: "team_q2",
            storageKey: "q2",
            text:
              "제품/서비스와 관련된 핵심 기술을 책임지고 이끌 수 있는 구성원이 내부에 존재한다 (예: CTO, 기술 전담 팀장 등)",
            tag: "사업적 역량",
            weight: 2,
          },
          {
            id: "team_q3",
            storageKey: "q3",
            text:
              "중장기적 사업 발전의 로드맵을 구체적으로 수립하고 내부 임직원에게 공유하고 있다",
            tag: "내부 임직원 육성",
            weight: 1,
          },
          {
            id: "team_q4",
            storageKey: "q4",
            text:
              "구성원들이 사업적 역량을 확보하는 데 필요한 교육 훈련을 제공하고 있다 (예: 예산 및 집행금액, 연간 훈련인원)",
            tag: "내부 임직원 육성",
            weight: 1,
          },
          {
            id: "team_q5",
            storageKey: "q5",
            text:
              "향후 사업 성장에 필요한 역량과 역할의 구성원을 유치하는 데 필요한 활동을 수행하고 있다 (예: 회사홍보, 상시 인재풀, 지인 추천제 등)",
            tag: "인재 유치 계획",
            weight: 1,
          },
          {
            id: "team_q6",
            storageKey: "q6",
            text:
              "향후 사업 성장에 필요한 역량과 역할의 구성원을 유치하고 유지하기 위한 제도가 마련되어 있다 (예: 인건비 예산, 스톡옵션, 스톡그랜트 등)",
            tag: "인재 유치 계획",
            weight: 1,
          },
        ],
      },
      {
        id: "team-culture",
        storageKey: "culture_capability",
        title: "문화적 역량",
        totalScore: 4,
        description:
          "조직문화가 사업 미션과 정렬되어 있는지 확인합니다.",
        questions: [
          {
            id: "culture_q1",
            storageKey: "q1",
            text:
              "사업의 미션을 달성하기 용이한 조직문화가 어떤 모습일지 설명할 수 있다",
            tag: "문화적 역량",
            weight: 2,
          },
          {
            id: "culture_q2",
            storageKey: "q2",
            text:
              "현재 내부 운영전략과 조직문화가 사업의 미션에 잘 정렬되어 있다 (예: 내부 커뮤니케이션, 인재상, 채용 기준, 승진과 피드백 기준 등)",
            tag: "조직 문화",
            weight: 2,
          },
        ],
      },
      {
        id: "team-risk",
        storageKey: "risk_management",
        title: "리스크 관리",
        totalScore: 4,
        description:
          "사업과 조직 운영에 필요한 리스크 관리 실행 여부를 확인합니다.",
        questions: [
          {
            id: "risk_q1",
            storageKey: "q1",
            text:
              "법률적 리스크 관리를 위한 준비와 대응을 실행하고 있다 (예: 담당자 지정, 정기 자문, 내부 점검, 제휴 법무법인 보유 등)",
            tag: "법률",
            weight: 1.2,
          },
          {
            id: "risk_q2",
            storageKey: "q2",
            text:
              "노무적 리스크 관리를 위한 준비와 대응을 실행하고 있다 (예: 담당자 지정, 정기 자문, 내부 점검, 제휴 노무법인 보유 등)",
            tag: "노무",
            weight: 1,
          },
          {
            id: "risk_q3",
            storageKey: "q3",
            text:
              "지적재산권 관련 리스크 관리를 위한 준비와 대응을 실행하고 있다 (예: 담당자 지정, 정기 자문, 내부 점검, 제휴 특허/법무법인 보유 등)",
            tag: "지적재산권",
            weight: 1.2,
          },
          {
            id: "risk_q4",
            storageKey: "q4",
            text:
              "ESG 측면 리스크 관리를 위한 준비와 대응을 실행하고 있다 (예: 인권경영, 환경경영 등)",
            tag: "ESG",
            weight: 0.6,
          },
        ],
      },
      {
        id: "team-certification",
        storageKey: "certification",
        title: "인증",
        totalScore: 4,
        description:
          "사업과 조직 성장에 필요한 인증 및 제도 준비 상태를 확인합니다.",
        questions: [
          {
            id: "cert_q1",
            storageKey: "q1",
            text:
              "사업과 조직의 성장을 위해 필요한 인증이나 제도를 파악하고 있다 (예: 기업부설연구소, 벤처기업, 사회적기업, 비콥, 소셜벤처 등)",
            tag: "인증",
            weight: 2,
          },
          {
            id: "cert_q2",
            storageKey: "q2",
            text:
              "필요한 인증이나 제도를 취득하기 위한 목표 연도가 있다",
            tag: "인증 계획",
            weight: 2,
          },
        ],
      },
    ],
  },
  {
    id: "impact",
    storageKey: "impact",
    title: "임팩트",
    totalScore: 5,
    description:
      "사회환경적 임팩트 정의와 측정, 이해관계자 소통 여부를 확인합니다.",
    subsections: [
      {
        id: "impact-definition",
        storageKey: "impact_definition",
        title: "임팩트",
        totalScore: 5,
        description:
          "임팩트 정의와 측정 수준을 확인합니다.",
        questions: [
          {
            id: "impact_q1",
            storageKey: "q1",
            text:
              "우리 회사가 해결하고자 하는 문제를 제품/서비스로 해결했을 때 발생되는 사회환경적 임팩트를 설명할 수 있다",
            tag: "임팩트",
            weight: 2,
          },
          {
            id: "impact_q2",
            storageKey: "q2",
            text: "그 임팩트를 구체적으로 지표로 측정하고 있다",
            tag: "임팩트 측정",
            weight: 1.5,
          },
          {
            id: "impact_q3",
            storageKey: "q3",
            text:
              "그 임팩트를 제시함으로써 사회성과인센티브(SPC)에 선정되거나 임팩트 투자자와 소통한 적이 있다",
            tag: "임팩트 측정",
            weight: 1.5,
          },
        ],
      },
    ],
  },
]
