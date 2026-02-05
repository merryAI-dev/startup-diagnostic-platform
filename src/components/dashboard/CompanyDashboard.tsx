import { useMemo, useRef, useState } from "react"
import { useCompanyInfoForm } from "../../hooks/useCompanyInfoForm"
import type { CompanyInfoForm } from "../../types/company"
import { SelfAssessmentForm } from "./SelfAssessmentForm"
import { SELF_ASSESSMENT_SECTIONS } from "../../data/selfAssessment"
import { useSelfAssessmentForm } from "../../hooks/useSelfAssessmentForm"

type CompanyDashboardProps = {
  onLogout: () => void
  companyId: string
}

type StatusVariant = "idle" | "warning" | "complete"

type StatusItem = {
  key: string
  label: string
  variant: StatusVariant
  index: number
}

type StepKey = "step1" | "step2"

type StepSummary = {
  key: StepKey
  label: string
  status: "complete" | "incomplete"
}

function StatusBadge({
  label,
  variant,
  index,
}: {
  label: string
  variant: StatusVariant
  index: number
}) {
  const base =
    "rounded-full border px-3 py-1 text-xs font-semibold inline-flex items-center gap-2 min-w-[110px]"
  if (variant === "complete") {
    return (
      <div
        className={`${base} border-emerald-200 bg-emerald-50 text-emerald-700`}
      >
        <span className="text-emerald-700/70">{index}.</span>
        <span className="flex-1">{label}</span>
        <span className="inline-flex w-3.5 justify-end">
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 10l3 3 9-9" />
          </svg>
        </span>
      </div>
    )
  }
  if (variant === "warning") {
    return (
      <div className={`${base} border-amber-200 bg-amber-50 text-amber-700`}>
        <span className="text-amber-700/70">{index}.</span>
        <span className="flex-1">{label}</span>
        <span className="inline-flex w-3.5 justify-end">
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10 3l7 14H3l7-14z" />
            <path d="M10 8v4" />
            <path d="M10 14h.01" />
          </svg>
        </span>
      </div>
    )
  }
  return (
    <div className={`${base} border-slate-200 bg-slate-50 text-slate-600`}>
      <span className="text-slate-400">{index}.</span>
      <span className="flex-1">{label}</span>
      <span className="inline-flex w-3.5" />
    </div>
  )
}

function StepCard({
  label,
  status,
  progressLabel,
  active,
  onClick,
}: {
  label: string
  status: "complete" | "incomplete"
  progressLabel?: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-2xl border px-4 py-3 text-left transition ${
        active
          ? "border-slate-300 bg-slate-100 text-slate-900"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{label}</div>
          {progressLabel ? (
            <div className="mt-1 text-xs text-slate-500">{progressLabel}</div>
          ) : null}
        </div>
        <span
          className={`rounded-full px-2 py-1 text-xs font-semibold ${
            status === "complete"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {status === "complete" ? "완료" : "미완료"}
        </span>
      </div>
    </button>
  )
}

export function CompanyDashboard({
  onLogout,
  companyId,
}: CompanyDashboardProps) {
  const {
    form,
    setForm,
    investmentRows,
    addInvestmentRow,
    removeInvestmentRow,
    updateInvestmentRow,
    loading,
    saveStatus,
    canSubmit,
    formatNumberInput,
    formatBusinessNumber,
    formatPhoneNumber,
    markTouched,
    isFieldInvalid,
    isFieldValid,
    saveCompanyInfo,
    hasSavedData,
  } = useCompanyInfoForm(companyId)

  const {
    sections,
    loading: assessmentLoading,
    saveStatus: assessmentSaveStatus,
    hasSavedData: hasSavedAssessment,
    isComplete: assessmentComplete,
    updateAnswer,
    updateReason,
    saveSelfAssessment,
  } = useSelfAssessmentForm(companyId)

  const sectionStatus = useMemo<StatusItem[]>(() => {
    const isFilled = (value: string) => value.trim().length > 0
    const hasNumber = (value: string) => value.replace(/[^\d]/g, "").length > 0

    const basicFields: (keyof CompanyInfoForm)[] = [
      "companyInfo",
      "ceoName",
      "ceoEmail",
      "ceoPhone",
      "foundedAt",
      "businessNumber",
      "primaryBusiness",
      "primaryIndustry",
    ]
    const locationFields: (keyof CompanyInfoForm)[] = ["headOffice"]
    const workforceFields: (keyof CompanyInfoForm)[] = [
      "workforceFullTime",
      "workforceContract",
      "revenue2025",
      "revenue2026",
      "capitalTotal",
    ]
    const certificationFields: (keyof CompanyInfoForm)[] = [
      "certification",
      "tipsLipsHistory",
    ]
    const fundingFields: (keyof CompanyInfoForm)[] = [
      "desiredInvestment2026",
      "desiredPreValue",
    ]

    const basicComplete = basicFields.every(isFieldValid)
    const locationComplete = locationFields.every(isFieldValid)
    const workforceComplete = workforceFields.every(isFieldValid)
    const certificationComplete = certificationFields.every(isFieldValid)
    const fundingComplete = fundingFields.every(isFieldValid)

    const investmentComplete = investmentRows.every(
      (row) =>
        isFilled(row.stage)
        && isFilled(row.date)
        && hasNumber(row.postMoney)
        && isFilled(row.majorShareholder)
    )

    const basicWarning = basicFields.some(isFieldInvalid)
    const locationWarning = locationFields.some(isFieldInvalid)
    const workforceWarning = workforceFields.some(isFieldInvalid)
    const certificationWarning = certificationFields.some(isFieldInvalid)
    const fundingWarning = fundingFields.some(isFieldInvalid)

    return [
      {
        key: "basic",
        label: "기본정보",
        variant: basicComplete ? "complete" : basicWarning ? "warning" : "idle",
        index: 1,
      },
      {
        key: "location",
        label: "소재지",
        variant: locationComplete
          ? "complete"
          : locationWarning
          ? "warning"
          : "idle",
        index: 2,
      },
      {
        key: "workforce",
        label: "인력/재무",
        variant: workforceComplete
          ? "complete"
          : workforceWarning
          ? "warning"
          : "idle",
        index: 3,
      },
      {
        key: "certification",
        label: "인증/이력",
        variant: certificationComplete
          ? "complete"
          : certificationWarning
          ? "warning"
          : "idle",
        index: 4,
      },
      {
        key: "investment",
        label: "투자이력",
        variant: investmentComplete ? "complete" : "idle",
        index: 5,
      },
      {
        key: "funding",
        label: "투자희망",
        variant: fundingComplete
          ? "complete"
          : fundingWarning
          ? "warning"
          : "idle",
        index: 6,
      },
    ]
  }, [form, investmentRows, isFieldInvalid, isFieldValid])

  const overallProgress = useMemo(() => {
    const completed = Number(hasSavedData) + Number(hasSavedAssessment)
    return Math.round((completed / 2) * 100)
  }, [hasSavedData, hasSavedAssessment])

  const stepSummaries: StepSummary[] = [
    {
      key: "step1",
      label: "기업정보",
      status: hasSavedData ? "complete" : "incomplete",
    },
    {
      key: "step2",
      label: "자가진단표",
      status: hasSavedAssessment ? "complete" : "incomplete",
    },
  ]

  const [activeStep, setActiveStep] = useState<StepKey>("step1")
  const [activeAssessmentSection, setActiveAssessmentSection] = useState(
    "problem",
  )
  const assessmentScrollRef = useRef<HTMLDivElement | null>(null)

  const assessmentTotalScore = useMemo(() => {
    return SELF_ASSESSMENT_SECTIONS.reduce((sum, section) => {
      const sectionScore = section.subsections.reduce((subSum, subsection) => {
        return (
          subSum +
          subsection.questions.reduce((qSum, question) => {
            const answer =
              sections?.[section.storageKey]?.[subsection.storageKey]?.[
                question.storageKey
              ]
            return qSum + (answer?.answer === true ? question.weight : 0)
          }, 0)
        )
      }, 0)
      return sum + sectionScore
    }, 0)
  }, [sections])


  function inputClass(invalid?: boolean, extra?: string) {
    return [
      "mt-1 w-full rounded-xl border px-3 py-2 text-sm text-slate-700 focus:outline-none",
      invalid
        ? "border-rose-300 focus:border-rose-400"
        : "border-slate-200 focus:border-slate-400",
      extra,
    ]
      .filter(Boolean)
      .join(" ")
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm h-[calc(100vh-10rem)]">
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-100 px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Company Dashboard
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                기업 정보와 자가 진단표를 완료해야 다음 단계로 진행할 수
                있습니다.
              </p>
            </div>
            <button
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              onClick={onLogout}
            >
              로그아웃
            </button>
          </div>
        </div>

        <div className="border-b border-slate-100 px-8 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              진행 단계
            </span>
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex flex-1 gap-3">
                {stepSummaries.map((step) => (
                  <StepCard
                    key={step.key}
                    label={step.label}
                    status={step.status}
                    active={activeStep === step.key}
                    onClick={() => setActiveStep(step.key)}
                  />
                ))}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 sm:ml-auto">
                {saveStatus || assessmentSaveStatus ? (
                  <span>{saveStatus ?? assessmentSaveStatus}</span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="mt-4 h-1.5 w-full rounded-full bg-slate-100">
            <div
              className={`h-1.5 rounded-full transition-all ${
                overallProgress === 100
                  ? "bg-emerald-500"
                  : overallProgress >= 50
                  ? "bg-amber-400"
                  : "bg-slate-400"
              }`}
              style={{ width: `${overallProgress}%` }}
            />
          </div>
          <div className="mt-2 text-right text-xs font-semibold text-slate-500">
            전체 진행률 {overallProgress}%
          </div>
        </div>

        {activeStep === "step1" ? (
          <div className="border-b border-slate-100 bg-white px-8 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-700">
                기업정보 작성
              </div>
              <button
                className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition ${
                  canSubmit
                    ? "bg-emerald-500 hover:bg-emerald-600"
                    : "bg-slate-300"
                }`}
                onClick={saveCompanyInfo}
                disabled={!canSubmit}
              >
                {hasSavedData ? "기업정보 수정" : "기업정보 저장"}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {sectionStatus.map((item) => (
                <StatusBadge
                  key={item.key}
                  label={item.label}
                  variant={item.variant}
                  index={item.index}
                />
              ))}
            </div>
          </div>
        ) : null}

        {activeStep === "step2" ? (
          <div className="border-b border-slate-100 bg-white px-8 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-700">
                자가진단표 작성
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm">
                  총점 {assessmentTotalScore}/100점
                </div>
                <button
                  className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition ${
                    assessmentComplete
                      ? "bg-emerald-500 hover:bg-emerald-600"
                      : "bg-slate-300"
                  }`}
                  onClick={saveSelfAssessment}
                  disabled={!assessmentComplete}
                >
                  {hasSavedAssessment ? "자가진단표 수정" : "자가진단표 저장"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex flex-1 min-h-0 flex-col">
          {activeStep === "step2" ? (
            assessmentLoading ? (
              <div className="px-8 pb-6 pt-4">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-sm text-slate-500">
                  자가 진단표를 불러오는 중입니다.
                </div>
              </div>
            ) : (
              <>
                <div className="border-b border-slate-100 bg-white px-8 pt-4">
                  <SelfAssessmentForm
                    variant="header"
                    sections={sections}
                    onAnswerChange={updateAnswer}
                    onReasonChange={updateReason}
                    activeSectionId={activeAssessmentSection}
                    onSectionChange={(id) => {
                      setActiveAssessmentSection(id)
                      assessmentScrollRef.current?.scrollTo({
                        top: 0,
                        behavior: "auto",
                      })
                    }}
                  />
                </div>
                <div
                  ref={assessmentScrollRef}
                  className="min-h-0 flex-1 overflow-y-auto px-8 pb-6 pt-4"
                >
                  <SelfAssessmentForm
                    variant="content"
                    sections={sections}
                    onAnswerChange={updateAnswer}
                    onReasonChange={updateReason}
                    activeSectionId={activeAssessmentSection}
                  />
                </div>
              </>
            )
          ) : null}
          {activeStep === "step1" ? (
            loading ? (
              <div className="px-8 pb-6 pt-4">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-sm text-slate-500">
                  기존 데이터를 불러오는 중입니다.
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-6 pt-4">
                <div className="space-y-6">
                <section>
                  <div className="text-sm font-semibold text-slate-700">
                    기본 정보
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs text-slate-500">
                      기업정보
                      <input
                        className={inputClass(isFieldInvalid("companyInfo"))}
                        placeholder="회사명, 법인/개인 구분 등"
                        value={form.companyInfo}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            companyInfo: e.target.value,
                          }))
                        }
                        onBlur={() => markTouched("companyInfo")}
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      대표자 성명
                      <input
                        className={inputClass(isFieldInvalid("ceoName"))}
                        placeholder="홍길동"
                        value={form.ceoName}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            ceoName: e.target.value,
                          }))
                        }
                        onBlur={() => markTouched("ceoName")}
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      대표자 이메일
                      <input
                        className={inputClass(isFieldInvalid("ceoEmail"))}
                        placeholder="ceo@company.com"
                        value={form.ceoEmail}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            ceoEmail: e.target.value,
                          }))
                        }
                        onBlur={() => markTouched("ceoEmail")}
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      대표자 전화번호
                      <input
                        className={inputClass(isFieldInvalid("ceoPhone"))}
                        placeholder="010-0000-0000"
                        value={form.ceoPhone}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            ceoPhone: formatPhoneNumber(e.target.value),
                          }))
                        }
                        onBlur={() => markTouched("ceoPhone")}
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      법인 설립일자
                      <input
                        type="date"
                        className={inputClass(isFieldInvalid("foundedAt"))}
                        value={form.foundedAt}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            foundedAt: e.target.value,
                          }))
                        }
                        onBlur={() => markTouched("foundedAt")}
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      사업자등록번호
                      <input
                        className={inputClass(isFieldInvalid("businessNumber"))}
                        placeholder="000-00-00000"
                        value={form.businessNumber}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            businessNumber: formatBusinessNumber(
                              e.target.value
                            ),
                          }))
                        }
                        onBlur={() => markTouched("businessNumber")}
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      주업태
                      <input
                        className={inputClass(isFieldInvalid("primaryBusiness"))}
                        placeholder="예: 정보통신업"
                        value={form.primaryBusiness}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            primaryBusiness: e.target.value,
                          }))
                        }
                        onBlur={() => markTouched("primaryBusiness")}
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      주업종
                      <input
                        className={inputClass(isFieldInvalid("primaryIndustry"))}
                        placeholder="예: 소프트웨어 개발"
                        value={form.primaryIndustry}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            primaryIndustry: e.target.value,
                          }))
                        }
                        onBlur={() => markTouched("primaryIndustry")}
                      />
                    </label>
                  </div>
                </section>

                <section>
                  <div className="text-sm font-semibold text-slate-700">
                    소재지
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs text-slate-500">
                      본점 소재지
                      <input
                        className={inputClass(isFieldInvalid("headOffice"))}
                        placeholder="서울시 강남구 ..."
                        value={form.headOffice}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            headOffice: e.target.value,
                          }))
                        }
                        onBlur={() => markTouched("headOffice")}
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      지점 또는 연구소 소재지
                      <input
                        className={inputClass(false)}
                        placeholder="없으면 '없음' 입력"
                        value={form.branchOffice}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            branchOffice: e.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                </section>

                <section>
                  <div className="text-sm font-semibold text-slate-700">
                    인력 및 재무
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs text-slate-500">
                      종업원수 (정규)
                      <input
                        className={inputClass(isFieldInvalid("workforceFullTime"))}
                        placeholder="0"
                        value={form.workforceFullTime}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            workforceFullTime: formatNumberInput(
                              e.target.value
                            ),
                          }))
                        }
                        onBlur={() => markTouched("workforceFullTime")}
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      종업원수 (계약)
                      <input
                        className={inputClass(isFieldInvalid("workforceContract"))}
                        placeholder="0"
                        value={form.workforceContract}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            workforceContract: formatNumberInput(
                              e.target.value
                            ),
                          }))
                        }
                        onBlur={() => markTouched("workforceContract")}
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      매출액 (2025년)
                      <input
                        className={inputClass(isFieldInvalid("revenue2025"))}
                        placeholder="예: 12.5억"
                        value={form.revenue2025}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            revenue2025: formatNumberInput(e.target.value),
                          }))
                        }
                        onBlur={() => markTouched("revenue2025")}
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      매출액 (2026년)
                      <input
                        className={inputClass(isFieldInvalid("revenue2026"))}
                        placeholder="예: 18.0억"
                        value={form.revenue2026}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            revenue2026: formatNumberInput(e.target.value),
                          }))
                        }
                        onBlur={() => markTouched("revenue2026")}
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      자본총계 (원)
                      <input
                        className={inputClass(isFieldInvalid("capitalTotal"))}
                        placeholder="예: 300,000,000"
                        value={form.capitalTotal}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            capitalTotal: formatNumberInput(e.target.value),
                          }))
                        }
                        onBlur={() => markTouched("capitalTotal")}
                      />
                    </label>
                  </div>
                </section>

                <section>
                  <div className="text-sm font-semibold text-slate-700">
                    인증 및 이력
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs text-slate-500">
                      인증/지정 여부
                      <input
                        className={inputClass(isFieldInvalid("certification"))}
                        placeholder="예: 벤처기업 인증"
                        value={form.certification}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            certification: e.target.value,
                          }))
                        }
                        onBlur={() => markTouched("certification")}
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      TIPS/LIPS 이력
                      <input
                        className={inputClass(isFieldInvalid("tipsLipsHistory"))}
                        placeholder="예: TIPS 2024 선정"
                        value={form.tipsLipsHistory}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            tipsLipsHistory: e.target.value,
                          }))
                        }
                        onBlur={() => markTouched("tipsLipsHistory")}
                      />
                    </label>
                  </div>
                </section>

                <section>
                  <div className="text-sm font-semibold text-slate-700">
                    투자이력 (순서별 작성)
                  </div>
                  <div className="mt-3 space-y-3">
                    {investmentRows.map((row, idx) => (
                      <div
                        key={`investment-${idx}`}
                        className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]"
                      >
                        <label className="text-xs text-slate-500">
                          <span className="block whitespace-nowrap">
                            투자단계
                          </span>
                          <input
                            className={inputClass(false, "rounded-lg")}
                            placeholder="Seed/Series A"
                            value={row.stage}
                            onChange={(e) =>
                              updateInvestmentRow(
                                idx,
                                "stage",
                                e.target.value
                              )
                            }
                          />
                        </label>
                        <label className="text-xs text-slate-500">
                          <span className="block whitespace-nowrap">
                            투자일시
                          </span>
                          <input
                            type="date"
                            className={inputClass(false, "rounded-lg")}
                            value={row.date}
                            onChange={(e) =>
                              updateInvestmentRow(
                                idx,
                                "date",
                                e.target.value
                              )
                            }
                          />
                        </label>

                        <label className="text-xs text-slate-500">
                          <span className="block whitespace-nowrap">
                            투자금액 (억)
                          </span>
                          <input
                            className={inputClass(false, "rounded-lg")}
                            placeholder="예: 25"
                            value={row.postMoney}
                            onChange={(e) =>
                              updateInvestmentRow(
                                idx,
                                "postMoney",
                                formatNumberInput(e.target.value)
                              )
                            }
                          />
                        </label>
                        <label className="text-xs text-slate-500">
                          <span className="block whitespace-nowrap">
                            주요주주명
                          </span>
                          <input
                            className={inputClass(false, "rounded-lg")}
                            placeholder="투자사/주주명"
                            value={row.majorShareholder}
                            onChange={(e) =>
                              updateInvestmentRow(
                                idx,
                                "majorShareholder",
                                e.target.value
                              )
                            }
                          />
                        </label>
                        <div className="flex items-end justify-end sm:col-span-2 lg:col-span-1">
                          <button
                            type="button"
                            className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => removeInvestmentRow(idx)}
                            disabled={investmentRows.length <= 1}
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      onClick={addInvestmentRow}
                    >
                      + 투자이력 추가
                    </button>
                  </div>
                </section>

                <section>
                  <div className="text-sm font-semibold text-slate-700">
                    투자 희망
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs text-slate-500">
                      2026년 내 희망 투자액
                      <input
                        className={inputClass(
                          isFieldInvalid("desiredInvestment2026")
                        )}
                        placeholder="예: 20억"
                        value={form.desiredInvestment2026}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            desiredInvestment2026: formatNumberInput(
                              e.target.value
                            ),
                          }))
                        }
                        onBlur={() => markTouched("desiredInvestment2026")}
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      투자전 희망기업가치 (Pre-Value)
                      <input
                        className={inputClass(
                          isFieldInvalid("desiredPreValue")
                        )}
                        placeholder="예: 200억"
                        value={form.desiredPreValue}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            desiredPreValue: formatNumberInput(
                              e.target.value
                            ),
                          }))
                        }
                        onBlur={() => markTouched("desiredPreValue")}
                      />
                    </label>
                  </div>
                </section>
                </div>
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  )
}
