import { SELF_ASSESSMENT_SECTIONS } from "@/data/selfAssessment"
import type {
  SelfAssessmentAnswer,
  SelfAssessmentSections,
} from "@/types/selfAssessment"

function isSelfAssessmentAnswerComplete(answer?: SelfAssessmentAnswer) {
  return answer?.answer !== null
    && answer?.answer !== undefined
    && (answer?.reason ?? "").trim().length >= 1
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
