export type AnswerValue = "yes" | "no" | null

export type SelfAssessmentAnswer = {
  answer: AnswerValue
  reason: string
}

export type SelfAssessmentState = Record<string, SelfAssessmentAnswer>

export type SelfAssessmentQuestion = {
  id: string
  text: string
  tag?: string
  weight: number
}

export type SelfAssessmentSubsection = {
  id: string
  title: string
  description?: string
  totalScore: number
  questions: SelfAssessmentQuestion[]
}

export type SelfAssessmentSection = {
  id: string
  title: string
  description?: string
  totalScore: number
  subsections: SelfAssessmentSubsection[]
}
