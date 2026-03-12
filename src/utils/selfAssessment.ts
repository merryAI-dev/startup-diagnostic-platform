import { SELF_ASSESSMENT_SECTIONS } from "@/data/selfAssessment"
import type {
  SelfAssessmentAnswer,
  SelfAssessmentSections,
} from "@/types/selfAssessment"

export const MIN_SELF_ASSESSMENT_REASON_LENGTH = 20

export function isSelfAssessmentAnswerComplete(answer?: SelfAssessmentAnswer) {
  return answer?.answer !== null
    && answer?.answer !== undefined
    && (answer?.reason ?? "").trim().length >= MIN_SELF_ASSESSMENT_REASON_LENGTH
}

export function isSelfAssessmentComplete(
  sections?: SelfAssessmentSections | null
) {
  if (!sections) return false

  return SELF_ASSESSMENT_SECTIONS.every((section) =>
    section.subsections.every((subsection) =>
      subsection.questions.every((question) =>
        isSelfAssessmentAnswerComplete(
          sections?.[section.storageKey]?.[subsection.storageKey]?.[
            question.storageKey
          ]
        )
      )
    )
  )
}
