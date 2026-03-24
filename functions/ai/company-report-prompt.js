"use strict";

const COMPANY_ANALYSIS_REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summaryCapability",
    "summaryMarket",
    "improvements",
    "acPriority1",
    "acPriority2",
    "acPriority3",
    "milestone56",
    "milestone78",
    "milestone910",
  ],
  properties: {
    summaryCapability: { type: "string" },
    summaryMarket: { type: "string" },
    improvements: { type: "string" },
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
- "기업역량"은 기술/제품, 팀, 사업 기반, 현재 준비도 관점에서 서술합니다.
- "시장검증"은 고객 반응, PoC/미팅/납품/검증 단계, 목표 시장, 진입 전략 관점에서 서술합니다.
- "개선 필요사항"은 2~4개 핵심 항목으로 정리하되, 문제만 지적하지 말고 왜 필요한지와 보완 방향이 드러나게 작성합니다.
- "AC 프로그램 제안"은 우선순위별로 실제 지원 과제가 보이게 작성합니다.
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
1. summaryCapability
- 제목: 기업상황요약 - 기업역량
- 분량: 3~5문장
- 내용: 기술/제품 역량, 팀 구성, 운영 기반, 사업 준비도 관점의 요약

2. summaryMarket
- 제목: 기업상황요약 - 시장검증
- 분량: 3~5문장
- 내용: 고객 검증, 시장 진입 전략, 타깃 시장, 사업화 가능성 관점의 요약

3. improvements
- 제목: 개선 필요사항
- 분량: 2~4개 항목
- 형식: 번호 목록 텍스트
- 각 항목은 "무엇이 보완이 필요한지 + 왜 중요한지 + 어떤 방향이 필요한지"가 드러나야 함

4. acPriority1, acPriority2, acPriority3
- 제목: AC 프로그램 제안
- 분량: 각 1~2문장
- 형식: 짧은 과제명 + 지원 방향
- 실제 데이터와 무관한 표현은 쓰지 말 것

5. milestone56, milestone78, milestone910
- 제목: 액셀러레이팅 마일스톤 제안
- 분량: 각 필드당 2~4개 실행 항목
- 형식: 기간 내 목표와 실행 계획이 드러나는 텍스트
- 실행 가능한 액션 중심으로 작성할 것

[중요 제약]
- 현황 진단 점수와 문항 응답 사유를 적극 반영합니다.
- 점수가 낮은 영역은 개선 필요사항과 마일스톤에 연결합니다.
- 점수가 높은 영역은 기업역량/시장검증 요약에서 강점으로 반영합니다.
- AC 제안과 마일스톤은 서로 연결되어야 합니다.
- 내용이 불충분하면 과도한 단정 대신 "구체화 필요", "추가 검증 필요"처럼 표현합니다.
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
