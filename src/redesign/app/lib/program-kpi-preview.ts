export type ProgramKpiFormat = "number" | "currency"

export type ProgramKpiDefinition = {
  id: string
  label: string
  format: ProgramKpiFormat
  unit: string
  description: string
}

export type ProgramKpiMonthlyRow = {
  month: number
  year: number
  values: Record<string, number>
}

export type ProgramKpiPreview = {
  programId: string
  programName: string
  definitions: ProgramKpiDefinition[]
  rows: ProgramKpiMonthlyRow[]
}

type ProgramPreviewTarget = {
  id: string
  name: string
}

type ProgramKpiTemplateDefinition = Omit<ProgramKpiDefinition, "id"> & {
  sampleMin: number
  sampleMax: number
  roundingUnit?: number
}

type ProgramKpiTemplate = {
  id: string
  keywords: string[]
  definitions: ProgramKpiTemplateDefinition[]
}

const KPI_TEMPLATES: ProgramKpiTemplate[] = [
  {
    id: "investment",
    keywords: ["투자", "ir", "tips", "팁스", "seed", "series", "액셀", "acceler"],
    definitions: [
      {
        label: "투자 미팅 수",
        format: "number",
        unit: "건",
        description: "월별 투자자 미팅 및 IR 진행 횟수를 관리합니다.",
        sampleMin: 2,
        sampleMax: 16,
      },
      {
        label: "투자 검토 단계 진입 수",
        format: "number",
        unit: "건",
        description: "투자 검토 및 DD 단계까지 진입한 건수를 집계합니다.",
        sampleMin: 0,
        sampleMax: 6,
      },
      {
        label: "투자 유치 총액",
        format: "currency",
        unit: "원",
        description: "해당 월에 확정된 투자 유치 금액 합계를 관리합니다.",
        sampleMin: 30000000,
        sampleMax: 900000000,
        roundingUnit: 1000000,
      },
    ],
  },
  {
    id: "global",
    keywords: ["글로벌", "해외", "수출", "export", "global"],
    definitions: [
      {
        label: "해외 바이어 미팅 수",
        format: "number",
        unit: "건",
        description: "월별 해외 바이어 및 파트너 미팅 수를 집계합니다.",
        sampleMin: 1,
        sampleMax: 18,
      },
      {
        label: "해외 파트너 확보 수",
        format: "number",
        unit: "개",
        description: "유통사, 리셀러, 현지 협력사 확보 수를 관리합니다.",
        sampleMin: 0,
        sampleMax: 8,
      },
      {
        label: "수출 계약 금액",
        format: "currency",
        unit: "원",
        description: "해당 월 체결한 수출 계약 금액 합계를 집계합니다.",
        sampleMin: 20000000,
        sampleMax: 650000000,
        roundingUnit: 1000000,
      },
    ],
  },
  {
    id: "poc",
    keywords: ["poc", "실증", "pilot", "테스트베드", "도입", "전환"],
    definitions: [
      {
        label: "PoC 진행 건수",
        format: "number",
        unit: "건",
        description: "월별 실증 및 PoC 진행 건수를 집계합니다.",
        sampleMin: 1,
        sampleMax: 10,
      },
      {
        label: "도입 검토 고객 수",
        format: "number",
        unit: "개사",
        description: "도입 검토 단계까지 진입한 고객사를 관리합니다.",
        sampleMin: 1,
        sampleMax: 12,
      },
      {
        label: "유료 전환 계약 수",
        format: "number",
        unit: "건",
        description: "PoC 이후 유료 전환에 성공한 계약 수를 관리합니다.",
        sampleMin: 0,
        sampleMax: 5,
      },
    ],
  },
  {
    id: "impact",
    keywords: ["임팩트", "esg", "소셜", "사회", "impact", "그린", "환경", "climate"],
    definitions: [
      {
        label: "임팩트 측정 완료 수",
        format: "number",
        unit: "건",
        description: "월별 임팩트 측정 또는 평가 완료 건수를 관리합니다.",
        sampleMin: 1,
        sampleMax: 14,
      },
      {
        label: "사회성과 도입 기관 수",
        format: "number",
        unit: "개",
        description: "성과 측정 체계를 도입한 기관 및 파트너 수를 집계합니다.",
        sampleMin: 0,
        sampleMax: 7,
      },
      {
        label: "임팩트 프로젝트 매출",
        format: "currency",
        unit: "원",
        description: "임팩트 연계 프로젝트에서 발생한 월별 매출을 관리합니다.",
        sampleMin: 10000000,
        sampleMax: 240000000,
        roundingUnit: 1000000,
      },
    ],
  },
  {
    id: "growth",
    keywords: ["판로", "마케팅", "브랜딩", "유통", "sales", "고객", "voucher", "바우처"],
    definitions: [
      {
        label: "신규 리드 확보 수",
        format: "number",
        unit: "건",
        description: "월별 신규 리드 및 잠재 고객 확보 건수를 관리합니다.",
        sampleMin: 5,
        sampleMax: 40,
      },
      {
        label: "제안서 발송 수",
        format: "number",
        unit: "건",
        description: "고객사 또는 유통사 대상 제안서 발송 건수를 집계합니다.",
        sampleMin: 2,
        sampleMax: 20,
      },
      {
        label: "신규 계약 매출",
        format: "currency",
        unit: "원",
        description: "해당 월 신규 계약으로 연결된 매출 규모를 관리합니다.",
        sampleMin: 15000000,
        sampleMax: 320000000,
        roundingUnit: 1000000,
      },
    ],
  },
]

function normalizeLabel(value?: string | null) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, "")
}

function hashString(value: string) {
  return Array.from(value).reduce((sum, char) => sum + char.charCodeAt(0), 0)
}

function buildMetricId(programId: string, label: string) {
  return `${programId}__${label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")}`
}

function getTemplateByProgram(program: ProgramPreviewTarget, fallbackIndex = 0) {
  const normalizedProgramName = normalizeLabel(program.name)
  const matchedTemplate = KPI_TEMPLATES.find((template) =>
    template.keywords.some((keyword) => normalizedProgramName.includes(normalizeLabel(keyword))),
  )

  if (matchedTemplate) {
    return matchedTemplate
  }

  const fallbackTemplateIndex = (hashString(program.id) + fallbackIndex) % KPI_TEMPLATES.length
  return KPI_TEMPLATES[fallbackTemplateIndex] ?? KPI_TEMPLATES[0]!
}

function buildSampleValue(
  definition: ProgramKpiTemplateDefinition,
  seed: number,
  month: number,
) {
  const span = Math.max(definition.sampleMax - definition.sampleMin, 1)
  const monthlyTrend = month * Math.max(Math.round(span / 18), 1)
  const rawValue = definition.sampleMin + ((seed * 17) % span) + monthlyTrend

  if (definition.format === "currency") {
    const roundingUnit = definition.roundingUnit ?? 1000000
    return Math.round(rawValue / roundingUnit) * roundingUnit
  }

  return rawValue
}

export function isStartup11PreviewCompany(companyName?: string | null) {
  return normalizeLabel(companyName) === "startup11"
}

export function getProgramKpiPreviewDefinitions(
  program: ProgramPreviewTarget,
  fallbackIndex = 0,
): ProgramKpiDefinition[] {
  const template = getTemplateByProgram(program, fallbackIndex)
  return template.definitions.map((definition) => ({
    ...definition,
    id: buildMetricId(program.id, definition.label),
  }))
}

export function buildProgramKpiPreview(
  program: ProgramPreviewTarget,
  year: number,
  companySeed = "preview",
  fallbackIndex = 0,
): ProgramKpiPreview {
  const template = getTemplateByProgram(program, fallbackIndex)
  const definitions: ProgramKpiDefinition[] = template.definitions.map((definition) => ({
    ...definition,
    id: buildMetricId(program.id, definition.label),
  }))
  const baseSeed = hashString(`${companySeed}:${program.id}`)

  const rows = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1
    const values = definitions.reduce<Record<string, number>>(
      (accumulator, definition, definitionIndex) => {
        const seed = baseSeed + month * 13 + definitionIndex * 17
        const templateDefinition = template.definitions[definitionIndex]
        const value = templateDefinition
          ? buildSampleValue(templateDefinition, seed, month)
          : definition.format === "currency"
            ? ((seed * 1750000) % 900000000) + 25000000
            : (seed % 8) + Math.floor(month / 3)
        accumulator[definition.id] = value
        return accumulator
      },
      {},
    )

    return {
      month,
      year,
      values,
    }
  })

  return {
    programId: program.id,
    programName: program.name,
    definitions,
    rows,
  }
}

export function buildProgramKpiPreviews(
  programs: ProgramPreviewTarget[],
  year: number,
  companySeed = "preview",
) {
  if (!isStartup11PreviewCompany(companySeed)) {
    return programs.map((program) => ({
      programId: program.id,
      programName: program.name,
      definitions: [],
      rows: [],
    }))
  }

  return programs.map((program, index) => buildProgramKpiPreview(program, year, companySeed, index))
}
