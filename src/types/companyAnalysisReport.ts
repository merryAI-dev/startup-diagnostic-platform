export type CompanyAnalysisReportForm = {
  companyName: string
  createdAt: string
  summaryCapability: string
  summaryMarket: string
  improvements: string
  acPriority1: string
  acPriority2: string
  acPriority3: string
  milestone56: string
  milestone78: string
  milestone910: string
}

export const EMPTY_COMPANY_ANALYSIS_REPORT_FORM: CompanyAnalysisReportForm = {
  companyName: "",
  createdAt: "",
  summaryCapability: "",
  summaryMarket: "",
  improvements: "",
  acPriority1: "",
  acPriority2: "",
  acPriority3: "",
  milestone56: "",
  milestone78: "",
  milestone910: "",
}

export function toCompanyAnalysisReportForm(
  value: Partial<CompanyAnalysisReportForm> | null | undefined,
  fallbackCompanyName = ""
): CompanyAnalysisReportForm {
  return {
    ...EMPTY_COMPANY_ANALYSIS_REPORT_FORM,
    ...value,
    companyName: value?.companyName || fallbackCompanyName,
    createdAt: value?.createdAt || new Date().toLocaleString("ko-KR"),
  }
}

function normalizeReportText(value: string) {
  return value.replace(/\r\n/g, "\n").trim()
}

export function splitReportParagraphs(value: string) {
  const normalized = normalizeReportText(value)
  if (!normalized) return []
  return normalized
    .split(/\n\s*\n/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function splitNumberedReportSections(value: string) {
  const normalized = normalizeReportText(value)
  if (!normalized) return []

  const matches = Array.from(normalized.matchAll(/(^|\n)\s*(\d+[.)])/g))
  if (matches.length <= 1) {
    return splitReportParagraphs(normalized)
  }

  return matches
    .map((match, index) => {
      const startIndex = match.index ?? 0
      const prefixLength = match[1]?.length ?? 0
      const start = startIndex + prefixLength
      const end = index + 1 < matches.length
        ? (matches[index + 1]?.index ?? normalized.length)
        : normalized.length
      return normalized.slice(start, end).trim()
    })
    .filter(Boolean)
}
