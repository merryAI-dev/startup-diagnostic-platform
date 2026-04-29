import { SELF_ASSESSMENT_SECTIONS } from "@/data/selfAssessment"
import {
  COMPANY_ANALYSIS_AC_FIELDS,
  COMPANY_ANALYSIS_BUSINESS_MODEL_FIELDS,
  COMPANY_ANALYSIS_IMPROVEMENT_FIELDS,
  COMPANY_ANALYSIS_MILESTONE_FIELDS,
  COMPANY_ANALYSIS_SUMMARY_FIELDS,
  type CompanyAnalysisReportForm,
} from "@/types/companyAnalysisReport"
import type { CompanyInfoRecord } from "@/types/company"
import type { SelfAssessmentSections } from "@/types/selfAssessment"
import { isSelfAssessmentAnswerComplete } from "@/utils/selfAssessment"

export type ReadinessStatus = "done" | "partial" | "missing"

export type ReadinessCheck = {
  status: ReadinessStatus
  label: string
  done: number
  total: number
}

const ANALYSIS_FIELDS = [
  ...COMPANY_ANALYSIS_BUSINESS_MODEL_FIELDS,
  ...COMPANY_ANALYSIS_SUMMARY_FIELDS,
  ...COMPANY_ANALYSIS_IMPROVEMENT_FIELDS,
  ...COMPANY_ANALYSIS_AC_FIELDS,
  ...COMPANY_ANALYSIS_MILESTONE_FIELDS,
]

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
}

function buildCheck(
  done: number,
  total: number,
  labels: Record<ReadinessStatus, string>,
): ReadinessCheck {
  const normalizedTotal = Math.max(total, 1)
  const status: ReadinessStatus =
    done >= normalizedTotal ? "done" : done > 0 ? "partial" : "missing"
  return {
    status,
    label: labels[status],
    done,
    total: normalizedTotal,
  }
}

export function getCompanyInfoReadiness(info?: Partial<CompanyInfoRecord> | null): ReadinessCheck {
  if (!info) {
    return buildCheck(0, 1, {
      done: "최종저장",
      partial: "임시저장",
      missing: "미작성",
    })
  }

  const saveType = info.metadata?.saveType
  return buildCheck(saveType === "final" ? 1 : 0.5, 1, {
    done: "최종저장",
    partial: "임시저장",
    missing: "미작성",
  })
}

export function getSelfAssessmentReadiness(
  sections?: SelfAssessmentSections | null,
  saveType?: string | null,
): ReadinessCheck {
  let done = 0
  let total = 0

  SELF_ASSESSMENT_SECTIONS.forEach((section) => {
    section.subsections.forEach((subsection) => {
      subsection.questions.forEach((question) => {
        total += 1
        if (
          isSelfAssessmentAnswerComplete(
            sections?.[section.storageKey]?.[subsection.storageKey]?.[question.storageKey],
          )
        ) {
          done += 1
        }
      })
    })
  })

  const check = buildCheck(done, total, {
    done: "최종저장",
    partial: saveType === "draft" ? "임시저장" : "작성중",
    missing: "미작성",
  })
  if (saveType === "final" && done === total) {
    return { ...check, status: "done", label: "최종저장" }
  }
  return check
}

export function getAnalysisReportReadiness(
  report?: Partial<CompanyAnalysisReportForm> | null,
): ReadinessCheck {
  const total = ANALYSIS_FIELDS.length
  const done = ANALYSIS_FIELDS.filter((field) => hasText(report?.[field.key])).length

  return buildCheck(done, total, {
    done: "작성",
    partial: "작성중",
    missing: "미작성",
  })
}

export function getOverallReadinessPercent(checks: ReadinessCheck[]) {
  if (checks.length === 0) return 0

  const ratio =
    checks.reduce((sum, check) => sum + Math.min(check.done / check.total, 1), 0) / checks.length
  return Math.round(ratio * 100)
}

export function getNextReadinessAction(params: {
  hasOwner: boolean
  companyInfo: ReadinessCheck
  selfAssessment: ReadinessCheck
  analysisReport: ReadinessCheck
}) {
  if (!params.hasOwner) return "기업 회원가입/계정 연결 확인"
  if (params.companyInfo.status !== "done") return "기업정보 최종 저장 요청"
  if (params.selfAssessment.status !== "done") return "자가진단 작성 요청"
  if (params.analysisReport.status !== "done") return "멘토 현황분석/보고서 작성"
  return "완료"
}
