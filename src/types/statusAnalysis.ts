import type {
  AnswerValue,
  SelfAssessmentAnswer,
  SelfAssessmentSections,
} from "@/types/selfAssessment"

export type StatusAnalysisSections = SelfAssessmentSections

const DEFAULT_STATUS_ANALYSIS_ANSWER: SelfAssessmentAnswer = {
  answer: null,
  reason: "",
}

export function normalizeStatusAnalysisSections(value: unknown): StatusAnalysisSections {
  if (!value || typeof value !== "object") return {}

  const sections: StatusAnalysisSections = {}

  Object.entries(value as Record<string, unknown>).forEach(([sectionKey, sectionValue]) => {
    if (!sectionValue || typeof sectionValue !== "object") return

    const subsections: Record<string, Record<string, SelfAssessmentAnswer>> = {}

    Object.entries(sectionValue as Record<string, unknown>).forEach(
      ([subsectionKey, subsectionValue]) => {
        if (!subsectionValue || typeof subsectionValue !== "object") return

        const questions: Record<string, SelfAssessmentAnswer> = {}

        Object.entries(subsectionValue as Record<string, unknown>).forEach(
          ([questionKey, questionValue]) => {
            if (!questionValue || typeof questionValue !== "object") return

            const rawAnswer = (questionValue as { answer?: unknown }).answer
            const answer =
              typeof rawAnswer === "boolean"
                ? rawAnswer
                : rawAnswer === null
                  ? null
                  : null
            const reason =
              typeof (questionValue as { reason?: unknown }).reason === "string"
                ? (questionValue as { reason: string }).reason
                : ""

            questions[questionKey] = { answer, reason }
          },
        )

        if (Object.keys(questions).length > 0) {
          subsections[subsectionKey] = questions
        }
      },
    )

    if (Object.keys(subsections).length > 0) {
      sections[sectionKey] = subsections
    }
  })

  return sections
}

export function getStatusAnalysisAnswer(
  sections: StatusAnalysisSections,
  sectionKey: string,
  subsectionKey: string,
  questionKey: string,
): AnswerValue {
  return sections[sectionKey]?.[subsectionKey]?.[questionKey]?.answer ?? null
}

export function getStatusAnalysisReason(
  sections: StatusAnalysisSections,
  sectionKey: string,
  subsectionKey: string,
  questionKey: string,
): string {
  return sections[sectionKey]?.[subsectionKey]?.[questionKey]?.reason ?? ""
}

export function setStatusAnalysisAnswer(
  sections: StatusAnalysisSections,
  sectionKey: string,
  subsectionKey: string,
  questionKey: string,
  answer: Exclude<AnswerValue, null>,
): StatusAnalysisSections {
  return {
    ...sections,
    [sectionKey]: {
      ...(sections[sectionKey] ?? {}),
      [subsectionKey]: {
        ...(sections[sectionKey]?.[subsectionKey] ?? {}),
        [questionKey]: {
          ...(sections[sectionKey]?.[subsectionKey]?.[questionKey] ?? DEFAULT_STATUS_ANALYSIS_ANSWER),
          answer,
        },
      },
    },
  }
}

export function setStatusAnalysisReason(
  sections: StatusAnalysisSections,
  sectionKey: string,
  subsectionKey: string,
  questionKey: string,
  reason: string,
): StatusAnalysisSections {
  return {
    ...sections,
    [sectionKey]: {
      ...(sections[sectionKey] ?? {}),
      [subsectionKey]: {
        ...(sections[sectionKey]?.[subsectionKey] ?? {}),
        [questionKey]: {
          ...(sections[sectionKey]?.[subsectionKey]?.[questionKey] ?? DEFAULT_STATUS_ANALYSIS_ANSWER),
          reason,
        },
      },
    },
  }
}

export function sanitizeStatusAnalysisSections(
  sections: StatusAnalysisSections,
): StatusAnalysisSections {
  const sanitized: StatusAnalysisSections = {}

  Object.entries(sections).forEach(([sectionKey, sectionValue]) => {
    const sanitizedSection: Record<string, Record<string, SelfAssessmentAnswer>> = {}

    Object.entries(sectionValue).forEach(([subsectionKey, subsectionValue]) => {
      const sanitizedSubsection: Record<string, SelfAssessmentAnswer> = {}

      Object.entries(subsectionValue).forEach(([questionKey, questionValue]) => {
        if (questionValue.reason.trim().length === 0 && questionValue.answer === null) return
        sanitizedSubsection[questionKey] = {
          answer: questionValue.answer,
          reason: questionValue.reason,
        }
      })

      if (Object.keys(sanitizedSubsection).length > 0) {
        sanitizedSection[subsectionKey] = sanitizedSubsection
      }
    })

    if (Object.keys(sanitizedSection).length > 0) {
      sanitized[sectionKey] = sanitizedSection
    }
  })

  return sanitized
}
