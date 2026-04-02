"use strict";

const COMPANY_ANALYSIS_REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "businessProblemDefinition",
    "businessItemOverview",
    "businessRevenueModel",
    "businessExpansionPlan",
    "summaryOverview",
    "summarySolution",
    "summaryCommercialization",
    "summaryScalability",
    "summaryFunding",
    "summaryTeamOrganization",
    "summarySustainability",
    "improvementCommercialization",
    "improvementScalability",
    "improvementFunding",
    "acPriority1",
    "acPriority2",
    "acPriority3",
    "milestone56",
    "milestone78",
    "milestone910",
  ],
  properties: {
    businessProblemDefinition: { type: "string" },
    businessItemOverview: { type: "string" },
    businessRevenueModel: { type: "string" },
    businessExpansionPlan: { type: "string" },
    summaryOverview: { type: "string" },
    summarySolution: { type: "string" },
    summaryCommercialization: { type: "string" },
    summaryScalability: { type: "string" },
    summaryFunding: { type: "string" },
    summaryTeamOrganization: { type: "string" },
    summarySustainability: { type: "string" },
    improvementCommercialization: { type: "string" },
    improvementScalability: { type: "string" },
    improvementFunding: { type: "string" },
    acPriority1: { type: "string" },
    acPriority2: { type: "string" },
    acPriority3: { type: "string" },
    milestone56: { type: "string" },
    milestone78: { type: "string" },
    milestone910: { type: "string" },
  },
};

const COMPANY_ANALYSIS_SYSTEM_INSTRUCTION = `
당신은 스타트업 액셀러레이팅 프로그램의 심사역이자 기업진단 분석가입니다.
당신의 임무는 기업 정보와 현황 진단 결과를 바탕으로 어드민 화면에 바로 입력 가능한 기업진단분석보고서 초안을 작성하는 것입니다.

작성 원칙:
- 반드시 한국어로 작성합니다.
- 제공된 데이터만 근거로 작성합니다.
- 입력 데이터에 없는 매출, 계약, 투자 확정, 고객 성과, 기술 우위, 해외 진출 성과를 추정해서 쓰지 않습니다.
- 과장된 홍보 문구를 쓰지 않습니다.
- 장점과 한계를 균형 있게 서술합니다.
- 실무자가 읽는 내부 보고서 톤으로 작성합니다.
- 각 항목은 바로 폼에 붙여넣을 수 있게 간결하지만 밀도 있게 작성합니다.

스타일 가이드:
- "비즈니스 모델"은 문제정의, 아이템 개요, 핵심 수익모델, 확장 방안이 서로 논리적으로 연결되게 작성합니다.
- "기업상황 요약"은 현황요약, 솔루션, 사업화, 확장성, 자금조달, 팀/조직, 지속가능성 순으로 작성합니다.
- "개선 필요사항"은 사업화, 확장성, 자금조달 관점에서 핵심 보완점을 정리합니다.
- "액셀러레이팅 프로그램 활용 제안"은 우선순위별로 실제 지원 과제가 보이게 작성합니다.
- "마일스톤"은 기간별 목표와 실행 항목이 드러나야 하며, 액션 중심으로 작성합니다.

문체 가이드:
- 문장은 단정하고 명확하게 씁니다.
- "~임", "~필요함", "~예정임", "~모색 중임" 같은 내부 보고서 문체를 사용할 수 있습니다.
- 불필요한 수식어는 줄이고, 핵심 판단과 실행 방향을 우선합니다.

출력 규칙:
- 반드시 JSON만 반환합니다.
- 마크다운 코드블록을 쓰지 않습니다.
- 필드 이름은 지정된 스키마와 정확히 일치해야 합니다.
`.trim();

function serializeJson(value) {
  return JSON.stringify(value ?? null, null, 2);
}

function buildCompanyAnalysisUserPrompt({
  companyName,
  companyInfo,
  assessmentSummary,
  assessmentDetails,
}) {
  return `
다음 기업의 기업진단분석보고서 초안을 작성하세요.

[출력 필드 설명]
1. businessProblemDefinition
- 제목: 비즈니스 모델 - 문제정의
- 분량: 2~4문장
- 내용: 기업이 해결하려는 핵심 문제, 문제의 심각성, 대상 고객/이해관계자 관점 요약

2. businessItemOverview
- 제목: 비즈니스 모델 - 아이템 개요
- 분량: 2~4문장
- 내용: 현재 제품/서비스가 무엇인지, 어떤 방식으로 문제를 해결하는지 설명

3. businessRevenueModel
- 제목: 비즈니스 모델 - 핵심 수익모델
- 분량: 2~4문장
- 내용: 현재 또는 계획 중인 핵심 수익구조와 매출 발생 구조를 설명

4. businessExpansionPlan
- 제목: 비즈니스 모델 - 확장 방안
- 분량: 2~4문장
- 내용: 시장/채널/제품/지역 관점의 확장 방향을 설명

5. summaryOverview
- 제목: 기업상황 요약 - 현황요약
- 분량: 2~4문장
- 내용: 현 시점 기업의 전반적 준비도와 핵심 판단 요약

6. summarySolution
- 제목: 기업상황 요약 - 솔루션
- 분량: 2~4문장
- 내용: 솔루션 구체성, MVP, 차별성, 검증 수준 요약

7. summaryCommercialization
- 제목: 기업상황 요약 - 사업화
- 분량: 2~4문장
- 내용: 고객, 시장, 채널, 수익/비용 구조, 영업/마케팅 준비도 요약

8. summaryScalability
- 제목: 기업상황 요약 - 확장성
- 분량: 2~4문장
- 내용: 협업 전략, 오픈이노베이션, 외부 확장 가능성 요약

9. summaryFunding
- 제목: 기업상황 요약 - 자금조달
- 분량: 2~4문장
- 내용: 지원금, 융자, 투자 준비도와 런웨이/투자계획 요약

10. summaryTeamOrganization
- 제목: 기업상황 요약 - 팀/조직
- 분량: 2~4문장
- 내용: 팀 역량, 채용/유지 전략, 제도/인증 준비도 요약

11. summarySustainability
- 제목: 기업상황 요약 - 지속가능성
- 분량: 2~4문장
- 내용: 규제, 노무, 지재권, ESG 등 주요 리스크 관리 수준 요약

12. improvementCommercialization, improvementScalability, improvementFunding
- 제목: 개선 필요사항
- 분량: 각 1~3문장
- 형식: 짧은 문제 진단 + 보완 방향
- improvementCommercialization: 사업화 관점 개선 포인트
- improvementScalability: 확장성 관점 개선 포인트
- improvementFunding: 자금조달 관점 개선 포인트

13. acPriority1, acPriority2, acPriority3
- 제목: 액셀러레이팅 프로그램 활용 제안
- 분량: 각 1~2문장
- 형식: 짧은 과제명 + 지원 방향
- 실제 데이터와 무관한 표현은 쓰지 말 것

14. milestone56, milestone78, milestone910
- 제목: 액셀러레이팅 마일스톤 제안
- 분량: 각 필드당 2~4개 실행 항목
- 형식: 기간 내 목표와 실행 계획이 드러나는 텍스트
- 실행 가능한 액션 중심으로 작성할 것

[중요 제약]
- 현황 진단 점수와 문항 응답 사유를 적극 반영합니다.
- 점수가 낮은 영역은 개선 필요사항과 마일스톤에 연결합니다.
- 점수가 높은 영역은 관련 기업상황 요약 항목에서 강점으로 반영합니다.
- AC 제안과 마일스톤은 서로 연결되어야 합니다.
- 내용이 불충분하면 과도한 단정 대신 "구체화 필요", "추가 검증 필요"처럼 표현합니다.
- 비즈니스모델 이미지는 언급하지 않습니다.
- 예시 문구를 복제하지 말고 현재 입력 데이터에 맞게 새로 작성합니다.

[기업명]
${companyName ?? ""}

[기업 정보]
${serializeJson(companyInfo)}

[현황 진단 요약]
${serializeJson(assessmentSummary)}

[현황 진단 상세 문항]
${serializeJson(assessmentDetails)}
`.trim();
}

module.exports = {
  COMPANY_ANALYSIS_REPORT_SCHEMA,
  COMPANY_ANALYSIS_SYSTEM_INSTRUCTION,
  buildCompanyAnalysisUserPrompt,
};
