export type CompanyAnalysisReportForm = {
  companyName: string
  author: string
  createdAt: string
  businessProblemDefinition: string
  businessItemOverview: string
  businessRevenueModel: string
  businessExpansionPlan: string
  summaryOverview: string
  summarySolution: string
  summaryCommercialization: string
  summaryScalability: string
  summaryFunding: string
  summaryTeamOrganization: string
  summarySustainability: string
  improvementCommercialization: string
  improvementScalability: string
  improvementFunding: string
  acPriority1: string
  acPriority2: string
  acPriority3: string
  milestone56: string
  milestone78: string
  milestone910: string
}

type ReportFieldKey = keyof CompanyAnalysisReportForm

export type CompanyAnalysisReportFieldDefinition = {
  key: ReportFieldKey
  label: string
}

export const EMPTY_COMPANY_ANALYSIS_REPORT_FORM: CompanyAnalysisReportForm = {
  companyName: "",
  author: "",
  createdAt: "",
  businessProblemDefinition: "",
  businessItemOverview: "",
  businessRevenueModel: "",
  businessExpansionPlan: "",
  summaryOverview: "",
  summarySolution: "",
  summaryCommercialization: "",
  summaryScalability: "",
  summaryFunding: "",
  summaryTeamOrganization: "",
  summarySustainability: "",
  improvementCommercialization: "",
  improvementScalability: "",
  improvementFunding: "",
  acPriority1: "",
  acPriority2: "",
  acPriority3: "",
  milestone56: "",
  milestone78: "",
  milestone910: "",
}

export const COMPANY_ANALYSIS_BUSINESS_MODEL_FIELDS: CompanyAnalysisReportFieldDefinition[] = [
  { key: "businessProblemDefinition", label: "문제정의" },
  { key: "businessItemOverview", label: "아이템 개요" },
  { key: "businessRevenueModel", label: "핵심 수익모델" },
  { key: "businessExpansionPlan", label: "확장 방안" },
]

export const COMPANY_ANALYSIS_SUMMARY_FIELDS: CompanyAnalysisReportFieldDefinition[] = [
  { key: "summaryOverview", label: "현황요약" },
  { key: "summarySolution", label: "솔루션" },
  { key: "summaryCommercialization", label: "사업화" },
  { key: "summaryScalability", label: "확장성" },
  { key: "summaryFunding", label: "자금조달" },
  { key: "summaryTeamOrganization", label: "팀/조직" },
  { key: "summarySustainability", label: "지속가능성" },
]

export const COMPANY_ANALYSIS_IMPROVEMENT_FIELDS: CompanyAnalysisReportFieldDefinition[] = [
  { key: "improvementCommercialization", label: "사업화" },
  { key: "improvementScalability", label: "확장성" },
  { key: "improvementFunding", label: "자금조달" },
]

export const COMPANY_ANALYSIS_AC_FIELDS: CompanyAnalysisReportFieldDefinition[] = [
  { key: "acPriority1", label: "1순위" },
  { key: "acPriority2", label: "2순위" },
  { key: "acPriority3", label: "3순위" },
]

export const COMPANY_ANALYSIS_MILESTONE_FIELDS: CompanyAnalysisReportFieldDefinition[] = [
  { key: "milestone56", label: "5~6월" },
  { key: "milestone78", label: "7~8월" },
  { key: "milestone910", label: "9~10월" },
]

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
