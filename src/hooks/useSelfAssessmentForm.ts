import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore"
import { useEffect, useMemo, useState } from "react"
import { db } from "../firebase/client"
import type {
  AnswerValue,
  SelfAssessmentAnswer,
  SelfAssessmentState,
} from "../types/selfAssessment"
import { SELF_ASSESSMENT_SECTIONS } from "../data/selfAssessment"

const DEFAULT_ANSWER: SelfAssessmentAnswer = {
  answer: null,
  reason: "",
}

function buildInitialState(): SelfAssessmentState {
  const state: SelfAssessmentState = {}
  SELF_ASSESSMENT_SECTIONS.forEach((section) => {
    section.subsections.forEach((subsection) => {
      subsection.questions.forEach((question) => {
        state[question.id] = { ...DEFAULT_ANSWER }
      })
    })
  })
  return state
}

export function useSelfAssessmentForm(companyId: string) {
  const [answers, setAnswers] = useState<SelfAssessmentState>(buildInitialState)
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [hasSavedData, setHasSavedData] = useState(false)

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      try {
        const ref = doc(db, "profiles", companyId, "selfAssessment", "info")
        const snapshot = await getDoc(ref)
        if (!mounted) return
        if (!snapshot.exists()) {
          setLoading(false)
          return
        }
        const data = snapshot.data() as { answers?: SelfAssessmentState }
        if (data?.answers) {
          setAnswers({ ...buildInitialState(), ...data.answers })
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
    return Object.values(answers).every(
      (value) => value.answer !== null
    )
  }, [answers])

  function updateAnswer(id: string, answer: AnswerValue) {
    setAnswers((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        answer,
      },
    }))
  }

  function updateReason(id: string, reason: string) {
    setAnswers((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        reason,
      },
    }))
  }

  async function saveSelfAssessment() {
    setSaveStatus(null)
    try {
      const ref = doc(db, "profiles", companyId, "selfAssessment", "info")
      await setDoc(
        ref,
        {
          answers,
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
    answers,
    loading,
    saveStatus,
    hasSavedData,
    isComplete,
    updateAnswer,
    updateReason,
    saveSelfAssessment,
  }
}
