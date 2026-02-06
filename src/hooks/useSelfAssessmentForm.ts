import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore"
import { useEffect, useMemo, useState } from "react"
import { db } from "../firebase/client"
import type {
  AnswerValue,
  SelfAssessmentAnswer,
  SelfAssessmentSections,
  SelfAssessmentState,
} from "../types/selfAssessment"
import { SELF_ASSESSMENT_SECTIONS } from "../data/selfAssessment"

const DEFAULT_ANSWER: SelfAssessmentAnswer = {
  answer: null,
  reason: "",
}

function buildInitialState(): SelfAssessmentState {
  const sections: SelfAssessmentSections = {}
  SELF_ASSESSMENT_SECTIONS.forEach((section) => {
    const subsectionMap: Record<string, Record<string, SelfAssessmentAnswer>> =
      {}
    section.subsections.forEach((subsection) => {
      const questionMap: Record<string, SelfAssessmentAnswer> = {}
      subsection.questions.forEach((question) => {
        questionMap[question.storageKey] = { ...DEFAULT_ANSWER }
      })
      subsectionMap[subsection.storageKey] = questionMap
    })
    sections[section.storageKey] = subsectionMap
  })
  return { sections }
}

function mergeSections(
  base: SelfAssessmentSections,
  incoming?: SelfAssessmentSections
): SelfAssessmentSections {
  if (!incoming) return base
  const merged: SelfAssessmentSections = {}
  Object.keys(base ?? {}).forEach((sectionKey) => {
    const baseSection = base?.[sectionKey]
    if (!baseSection) return
    const incomingSection = incoming?.[sectionKey] ?? {}
    const sectionBucket: Record<string, Record<string, SelfAssessmentAnswer>> =
      {}
    Object.keys(baseSection).forEach((subsectionKey) => {
      const baseSubsection = baseSection[subsectionKey]
      if (!baseSubsection) return
      sectionBucket[subsectionKey] = {
        ...baseSubsection,
        ...(incomingSection[subsectionKey] ?? {}),
      }
    })
    merged[sectionKey] = sectionBucket
  })
  return merged
}

function fromLegacyAnswers(
  legacy?: Record<string, { answer: unknown; reason?: string }>
): SelfAssessmentSections | null {
  if (!legacy) return null
  const base = buildInitialState()
  SELF_ASSESSMENT_SECTIONS.forEach((section) => {
    section.subsections.forEach((subsection) => {
      subsection.questions.forEach((question) => {
        const legacyAnswer = legacy[question.id]
        if (legacyAnswer) {
          const normalizedAnswer =
            legacyAnswer.answer === "yes"
              ? true
              : legacyAnswer.answer === "no"
              ? false
              : legacyAnswer.answer === true
              ? true
              : legacyAnswer.answer === false
              ? false
              : null
          const sectionBucket = base.sections[section.storageKey]
          if (!sectionBucket) return
          const subsectionBucket = sectionBucket[subsection.storageKey]
          if (!subsectionBucket) return
          subsectionBucket[question.storageKey] = {
            answer: normalizedAnswer,
            reason: legacyAnswer.reason ?? "",
          }
        }
      })
    })
  })
  return base.sections
}

export function useSelfAssessmentForm(companyId: string) {
  const [state, setState] = useState<SelfAssessmentState>(buildInitialState)
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [hasSavedData, setHasSavedData] = useState(false)

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      try {
        const ref = doc(db, "companies", companyId, "selfAssessment", "info")
        const snapshot = await getDoc(ref)
        if (!mounted) return
        if (!snapshot.exists()) {
          setLoading(false)
          return
        }
        const data = snapshot.data() as {
          sections?: SelfAssessmentSections
          answers?: Record<string, { answer: unknown; reason?: string }>
        }
        if (data?.sections || data?.answers) {
          const base = buildInitialState()
          const legacySections = fromLegacyAnswers(data.answers)
          setState({
            sections: mergeSections(
              base.sections,
              data.sections ?? legacySections ?? undefined
            ),
          })
          setHasSavedData(true)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [companyId])

  const isComplete = useMemo(() => {
    return SELF_ASSESSMENT_SECTIONS.every((section) =>
      section.subsections.every((subsection) =>
        subsection.questions.every((question) => {
          const answer =
            state.sections?.[section.storageKey]?.[subsection.storageKey]?.[
              question.storageKey
            ]
          return answer?.answer !== null
        })
      )
    )
  }, [state])

  function updateAnswer(
    sectionKey: string,
    subsectionKey: string,
    questionKey: string,
    answer: AnswerValue
  ) {
    setState((prev) => {
      const prevSection = prev.sections[sectionKey] ?? {}
      const prevSubsection = prevSection[subsectionKey] ?? {}
      const prevAnswer = prevSubsection[questionKey] ?? DEFAULT_ANSWER
      return {
        sections: {
          ...prev.sections,
          [sectionKey]: {
            ...prevSection,
            [subsectionKey]: {
              ...prevSubsection,
              [questionKey]: {
                ...prevAnswer,
                answer,
              },
            },
          },
        },
      }
    })
  }

  function updateReason(
    sectionKey: string,
    subsectionKey: string,
    questionKey: string,
    reason: string
  ) {
    setState((prev) => {
      const prevSection = prev.sections[sectionKey] ?? {}
      const prevSubsection = prevSection[subsectionKey] ?? {}
      const prevAnswer = prevSubsection[questionKey] ?? DEFAULT_ANSWER
      return {
        sections: {
          ...prev.sections,
          [sectionKey]: {
            ...prevSection,
            [subsectionKey]: {
              ...prevSubsection,
              [questionKey]: {
                ...prevAnswer,
                reason,
              },
            },
          },
        },
      }
    })
  }

  async function saveSelfAssessment() {
    setSaveStatus(null)
    try {
      const ref = doc(db, "companies", companyId, "selfAssessment", "info")
      await setDoc(
        ref,
        {
          sections: state.sections,
          metadata: {
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
          },
        },
        { merge: true }
      )
      setSaveStatus("저장 완료")
      setHasSavedData(true)
      return true
    } catch (err) {
      setSaveStatus("저장에 실패했습니다.")
      return false
    }
  }

  return {
    sections: state.sections,
    loading,
    saveStatus,
    hasSavedData,
    isComplete,
    updateAnswer,
    updateReason,
    saveSelfAssessment,
  }
}
