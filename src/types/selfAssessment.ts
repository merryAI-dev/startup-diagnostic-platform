export type AnswerValue = boolean | null

export type SelfAssessmentAnswer = {
  answer: AnswerValue
  reason: string
}

export type SelfAssessmentState = {
  sections: SelfAssessmentSections
}

export type SelfAssessmentQuestion = {
  id: string
  storageKey: string
  text: string
  tag?: string
  weight: number
}

export type SelfAssessmentSubsection = {
  id: string
  storageKey: string
  title: string
  description?: string
  totalScore: number
  questions: SelfAssessmentQuestion[]
}

export type SelfAssessmentSection = {
  id: string
  storageKey: string
  title: string
  description?: string
  totalScore: number
  subsections: SelfAssessmentSubsection[]
}

export type SelfAssessmentSections = Record<
  string,
  Record<string, Record<string, SelfAssessmentAnswer>>
>
