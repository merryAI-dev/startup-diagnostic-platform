import { useMemo, useState } from "react"
import { SELF_ASSESSMENT_SECTIONS } from "../../data/selfAssessment"
import type {
  AnswerValue,
  SelfAssessmentSections,
} from "../../types/selfAssessment"

function AnswerToggle({
  value,
  onChange,
}: {
  value: AnswerValue
  onChange: (value: AnswerValue) => void
}) {
  return (
    <div className="flex gap-2">
      {[
        { label: "예", value: true as const },
        { label: "아니오", value: false as const },
      ].map((option) => (
        <button
          key={String(option.value)}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
            value === option.value
              ? option.value === true
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-rose-600 bg-rose-600 text-white"
              : "border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function formatScore(score: number) {
  if (Number.isInteger(score)) {
    return `${score}`
  }
  return score.toFixed(1).replace(/\.0$/, "")
}

function isQuestionInputComplete(answer: {
  answer?: AnswerValue
  reason?: string
}) {
  return answer?.answer !== null && answer?.answer !== undefined
    && (answer?.reason ?? "").trim().length >= 1
}

export function SelfAssessmentForm({
  sections,
  onAnswerChange,
  onReasonChange,
  activeSectionId,
  onSectionChange,
  variant = "full",
  readOnly = false,
}: {
  sections: SelfAssessmentSections
  onAnswerChange: (
    sectionKey: string,
    subsectionKey: string,
    questionKey: string,
    value: AnswerValue
  ) => void
  onReasonChange: (
    sectionKey: string,
    subsectionKey: string,
    questionKey: string,
    value: string
  ) => void
  activeSectionId?: string
  onSectionChange?: (id: string) => void
  variant?: "full" | "header" | "content"
  readOnly?: boolean
}) {
  const [internalActiveSectionId, setInternalActiveSectionId] = useState(
    SELF_ASSESSMENT_SECTIONS[0]?.storageKey ?? "",
  )
  const resolvedActiveSectionId =
    activeSectionId ?? internalActiveSectionId
  const handleSectionChange = onSectionChange ?? setInternalActiveSectionId

  const { sectionAnsweredCounts, sectionQuestionCounts, questionScores } = useMemo(() => {
    const nextSectionAnsweredCounts: Record<string, number> = {}
    const nextSectionQuestionCounts: Record<string, number> = {}
    const nextQuestionScores: Record<string, number> = {}

    SELF_ASSESSMENT_SECTIONS.forEach((section) => {
      let sectionAnsweredCount = 0
      let sectionQuestionCount = 0
      section.subsections.forEach((subsection) => {
        subsection.questions.forEach((question) => {
          const answer =
            sections?.[section.storageKey]?.[subsection.storageKey]?.[
              question.storageKey
            ]
          const score = answer?.answer === true ? question.weight : 0
          if (isQuestionInputComplete(answer)) {
            sectionAnsweredCount += 1
          }
          sectionQuestionCount += 1
          nextQuestionScores[question.id] = score
        })
      })
      nextSectionAnsweredCounts[section.id] = sectionAnsweredCount
      nextSectionQuestionCounts[section.id] = sectionQuestionCount
    })

    return {
      sectionAnsweredCounts: nextSectionAnsweredCounts,
      sectionQuestionCounts: nextSectionQuestionCounts,
      questionScores: nextQuestionScores,
    }
  }, [sections])

  const activeSection =
    SELF_ASSESSMENT_SECTIONS.find(
      (section) => section.storageKey === resolvedActiveSectionId,
    ) ?? SELF_ASSESSMENT_SECTIONS[0]

  if (!activeSection) {
    return null
  }

  const containerClass =
    variant === "header" ? "space-y-0" : "space-y-6"

  return (
    <div className={containerClass}>
      {variant !== "content" ? (
        <div className="flex flex-wrap gap-2 border-b border-slate-200">
          {SELF_ASSESSMENT_SECTIONS.map((section) => {
            const isActive = section.storageKey === resolvedActiveSectionId
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => handleSectionChange(section.storageKey)}
                className={`-mb-px border-b-2 px-3 pb-2 text-sm font-semibold transition-colors ${
                  isActive
                    ? "border-slate-900 text-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {section.title}
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                  {sectionAnsweredCounts[section.id] ?? 0}/
                  {sectionQuestionCounts[section.id] ?? 0}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

      {variant !== "header" ? (
      <section className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-lg font-semibold text-slate-900">
            {activeSection.title}
          </div>
          {activeSection.description ? (
            <p className="mt-1 text-sm text-slate-600">
              {activeSection.description}
            </p>
          ) : null}
        </div>

        {activeSection.subsections.map((subsection) => (
          <div
            key={subsection.id}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
          >
            <div className="border-b border-emerald-100 bg-emerald-50/70 px-4 py-3">
              <div className="text-sm font-semibold text-emerald-900">
                {subsection.title}
              </div>
              {subsection.description ? (
                <p className="mt-1 text-xs text-emerald-700/80">
                  {subsection.description}
                </p>
              ) : null}
            </div>

            <div className="space-y-4 p-4">
              {subsection.questions.map((question, index) => {
                const answer =
                  sections?.[activeSection.storageKey]?.[
                    subsection.storageKey
                  ]?.[question.storageKey]
                const score = questionScores[question.id] ?? 0
                return (
                  <div
                    key={question.id}
                    className="rounded-xl border border-slate-100 bg-slate-50 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-slate-800">
                          Q{index + 1}. {question.text}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {question.tag ? (
                            <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                              {question.tag}
                            </span>
                          ) : null}
                          {answer?.answer !== null && answer?.answer !== undefined ? (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                answer.answer === true
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-slate-200 text-slate-600"
                              }`}
                            >
                              {answer.answer === true ? "+ " : ""}
                              {formatScore(score)}점
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-400">
                              점수 없음
                            </span>
                          )}
                        </div>
                      </div>
                      {readOnly ? (
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            answer?.answer === true
                              ? "bg-emerald-100 text-emerald-700"
                              : answer?.answer === false
                              ? "bg-rose-100 text-rose-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {answer?.answer === true
                            ? "예"
                            : answer?.answer === false
                            ? "아니오"
                            : "미선택"}
                        </span>
                      ) : (
                        <AnswerToggle
                          value={answer?.answer ?? null}
                          onChange={(value) =>
                            onAnswerChange(
                              activeSection.storageKey,
                              subsection.storageKey,
                              question.storageKey,
                              value
                            )
                          }
                        />
                      )}
                    </div>

                    <div className="mt-3">
                      <label className="text-xs text-slate-500">
                        {answer?.answer === true
                          ? "예라고 답변한 근거를 작성해주세요."
                          : answer?.answer === false
                          ? "아니오라면 MYSC가 어떻게 도우면 좋을지 작성해주세요."
                          : "예/아니오를 선택한 뒤 이유를 작성해주세요."}
                        <textarea
                          rows={2}
                          readOnly={readOnly}
                          className={`mt-2 w-full rounded-xl border px-3 py-2 text-sm ${
                            readOnly
                              ? "border-slate-100 bg-slate-50 text-slate-600"
                              : "border-slate-200 bg-white text-slate-700 focus:border-slate-400 focus:outline-none"
                          }`}
                          placeholder="근거 또는 도움 요청 내용을 작성해주세요."
                          value={answer?.reason ?? ""}
                          onChange={(event) =>
                            onReasonChange(
                              activeSection.storageKey,
                              subsection.storageKey,
                              question.storageKey,
                              event.target.value
                            )
                          }
                        />
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </section>
      ) : null}
    </div>
  )
}
