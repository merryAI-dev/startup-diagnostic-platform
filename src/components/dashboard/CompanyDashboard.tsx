import type { User } from "firebase/auth"
import { ChevronDown } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { SELF_ASSESSMENT_SECTIONS } from "../../data/selfAssessment"
import { useCompanyInfoForm } from "../../hooks/useCompanyInfoForm"
import { useSelfAssessmentForm } from "../../hooks/useSelfAssessmentForm"
import type { CompanyInfoForm } from "../../types/company"
import { SelfAssessmentForm } from "./SelfAssessmentForm"

type CompanyDashboardProps = {
  onLogout: () => void
  companyId: string
  user: User
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

type AddressFieldKey = "headOffice" | "branchOffice"

type DaumPostcodeAddress = {
  zonecode?: string
  roadAddress?: string
  jibunAddress?: string
  bname?: string
  buildingName?: string
}

type DaumPostcodeInstance = {
  open: () => void
}

type DaumPostcodeConstructor = new (options: {
  oncomplete: (data: DaumPostcodeAddress) => void
}) => DaumPostcodeInstance

const DAUM_POSTCODE_SCRIPT_SRC =
  "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"
const TIPS_LIPS_OPTIONS = ["TIPS", "LIPS", "없음"] as const
const INVESTMENT_STAGE_OPTIONS = [
  "Pre-Seed",
  "Seed",
  "Pre-A",
  "Series A",
  "Series B",
  "Series C+",
  "Bridge/Extension",
  "Angel",
  "Convertible Note",
] as const

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
    "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold inline-flex items-center gap-1.5 min-w-[96px]"
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
      className={`flex-1 rounded-2xl border px-3 py-2.5 text-left transition ${active
          ? "border-slate-800 bg-slate-900 text-white shadow-md"
          : "border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50"
        }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div
            className={`text-sm font-semibold ${active ? "text-white" : "text-slate-900"}`}
          >
            {label}
          </div>
          {progressLabel ? (
            <div
              className={`mt-1 text-xs ${active ? "text-slate-200" : "text-slate-600"}`}
            >
              {progressLabel}
            </div>
          ) : null}
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${active
              ? "border border-white/20 bg-white/15 text-white"
              : status === "complete"
              ? "bg-emerald-200 text-emerald-800"
              : "bg-amber-50 text-amber-700"
            }`}
        >
          {status === "incomplete" ? (
            <span
              className={`inline-flex h-3 w-3 items-center justify-center text-[10px] font-bold ${
                active ? "text-white" : "text-amber-700"
              }`}
              aria-hidden="true"
            >
              !
            </span>
          ) : null}
          {status === "complete" ? "완료" : "미완료"}
        </span>
      </div>
    </button>
  )
}

export function CompanyDashboard({
  onLogout,
  companyId,
  user,
}: CompanyDashboardProps) {
  const {
    form,
    setForm,
    investmentRows,
    addInvestmentRow,
    removeInvestmentRow,
    updateInvestmentRow,
    loading,
    saving,
    saveStatus,
    canSubmit,
    missingRequired,
    invalidRequired,
    missingRequiredLabels,
    invalidRequiredLabels,
    formatNumberInput,
    formatRevenueInput,
    formatBusinessNumber,
    formatPhoneNumber,
    markTouched,
    isFieldInvalid,
    isFieldValid,
    saveCompanyInfo,
    saveCompanyInfoDraft,
  } = useCompanyInfoForm(companyId)

  const {
    sections,
    loading: assessmentLoading,
    saving: assessmentSaving,
    saveStatus: assessmentSaveStatus,
    answeredCount,
    totalQuestionCount,
    remainingCount,
    isComplete: assessmentComplete,
    updateAnswer,
    updateReason,
    saveSelfAssessment,
    saveSelfAssessmentDraft,
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
      "workforceFullTime",
      "workforceContract",
    ]
    const locationFields: (keyof CompanyInfoForm)[] = ["headOffice"]
    const financeFields: (keyof CompanyInfoForm)[] = [
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
    const financeComplete = financeFields.every(isFieldValid)
    const certificationComplete = certificationFields.every(isFieldValid)
    const fundingComplete = fundingFields.every(isFieldValid)

    const investmentComplete = investmentRows.every(
      (row) =>
        isFilled(row.stage)
        && isFilled(row.date)
        && hasNumber(row.postMoney)
        && isFilled(row.majorShareholder)
    )
    const financeInvestmentComplete = financeComplete && investmentComplete

    return [
      {
        key: "basic",
        label: "기본정보",
        variant: basicComplete ? "complete" : "warning",
        index: 1,
      },
      {
        key: "location",
        label: "소재지",
        variant: locationComplete ? "complete" : "warning",
        index: 2,
      },
      {
        key: "finance-investment",
        label: "재무/투자이력",
        variant: financeInvestmentComplete ? "complete" : "warning",
        index: 3,
      },
      {
        key: "certification",
        label: "인증/이력",
        variant: certificationComplete ? "complete" : "warning",
        index: 4,
      },
      {
        key: "funding",
        label: "투자희망",
        variant: fundingComplete ? "complete" : "warning",
        index: 5,
      },
    ]
  }, [form, investmentRows, isFieldInvalid, isFieldValid])

  const stepSummaries: StepSummary[] = [
    {
      key: "step1",
      label: "기업정보",
      status: canSubmit ? "complete" : "incomplete",
    },
    {
      key: "step2",
      label: "자가진단표",
      status: assessmentComplete ? "complete" : "incomplete",
    },
  ]

  const [activeStep, setActiveStep] = useState<StepKey>("step1")
  const [activeAssessmentSection, setActiveAssessmentSection] = useState(
    "problem",
  )
  const assessmentScrollRef = useRef<HTMLDivElement | null>(null)
  const postcodeScriptLoadingRef = useRef(false)
  const [activeInvestmentStageRow, setActiveInvestmentStageRow] = useState<
    number | null
  >(null)
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!saveStatus) return
    setSnackbarMessage(saveStatus)
  }, [saveStatus])

  useEffect(() => {
    if (!assessmentSaveStatus) return
    setSnackbarMessage(assessmentSaveStatus)
  }, [assessmentSaveStatus])

  useEffect(() => {
    if (!snackbarMessage) return
    const timerId = window.setTimeout(() => {
      setSnackbarMessage(null)
    }, 2200)
    return () => window.clearTimeout(timerId)
  }, [snackbarMessage])

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
      "mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-1",
      invalid
        ? "border-rose-300 bg-rose-50 text-rose-900 placeholder:text-rose-300 focus:border-rose-400 focus:ring-rose-200/60"
        : "border-slate-200 focus:border-slate-300 focus:ring-slate-200/60",
      extra,
    ]
      .filter(Boolean)
      .join(" ")
  }

  function openAddressSearchPopup(targetField: AddressFieldKey) {
    if (typeof window === "undefined") return
    const typedWindow = window as Window & {
      daum?: { Postcode?: DaumPostcodeConstructor }
    }
    const Postcode = typedWindow.daum?.Postcode
    if (!Postcode) return

    const postcode = new Postcode({
      oncomplete: (data) => {
        const baseAddress =
          data.roadAddress?.trim() || data.jibunAddress?.trim() || ""
        const extras = [data.bname?.trim(), data.buildingName?.trim()].filter(
          (value): value is string => Boolean(value)
        )
        const detailedAddress =
          extras.length > 0
            ? `${baseAddress} (${extras.join(", ")})`
            : baseAddress
        const zonecode = data.zonecode?.trim() ?? ""
        const fullAddress = zonecode
          ? `(${zonecode}) ${detailedAddress}`
          : detailedAddress
        if (!fullAddress) return

        setForm((prev) => ({
          ...prev,
          [targetField]: fullAddress,
        }))
        if (targetField === "headOffice") {
          markTouched("headOffice")
        }
      },
    })
    postcode.open()
  }

  function handleAddressSearchClick(targetField: AddressFieldKey) {
    if (typeof window === "undefined") return
    const typedWindow = window as Window & {
      daum?: { Postcode?: DaumPostcodeConstructor }
    }

    if (typedWindow.daum?.Postcode) {
      openAddressSearchPopup(targetField)
      return
    }

    if (postcodeScriptLoadingRef.current) return

    postcodeScriptLoadingRef.current = true

    const script = document.createElement("script")
    script.src = DAUM_POSTCODE_SCRIPT_SRC
    script.async = true
    script.onload = () => {
      postcodeScriptLoadingRef.current = false
      openAddressSearchPopup(targetField)
    }
    script.onerror = () => {
      postcodeScriptLoadingRef.current = false
    }
    document.head.appendChild(script)
  }

  function clearAddressField(targetField: AddressFieldKey) {
    setForm((prev) => ({
      ...prev,
      [targetField]: "",
    }))
    if (targetField === "headOffice") {
      markTouched("headOffice")
    }
  }

  function getFilteredInvestmentStageOptions(keyword: string) {
    const normalizedKeyword = keyword.trim().toLowerCase()
    if (!normalizedKeyword) {
      return [...INVESTMENT_STAGE_OPTIONS]
    }
    return INVESTMENT_STAGE_OPTIONS.filter((option) =>
      option.toLowerCase().includes(normalizedKeyword)
    )
  }

  function handleRemoveInvestmentRow(index: number) {
    removeInvestmentRow(index)
    setActiveInvestmentStageRow((prev) => {
      if (prev == null) return prev
      if (prev === index) return null
      return prev > index ? prev - 1 : prev
    })
  }

  return (
    <div className="w-full h-full bg-transparent">
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-100 px-8 py-4">
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
          </div>
        </div>

        <div className="border-b border-slate-100 px-8 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              진행 단계
            </span>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex flex-1 gap-2">
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
            </div>
          </div>
        </div>

        {activeStep === "step1" ? (
          <div className="border-b border-slate-100 bg-white px-8 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-700">
                기업정보 작성
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={saveCompanyInfoDraft}
                  disabled={saving}
                >
                  임시저장
                </button>
                <button
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-100"
                  onClick={saveCompanyInfo}
                  disabled={saving || !canSubmit}
                >
                  {canSubmit ? "기업정보 수정" : "기업정보 저장"}
                </button>
              </div>
            </div>
            {!canSubmit ? (
              <div className="mt-2 text-xs text-amber-700">
                {missingRequired > 0 ? `미입력 ${missingRequired}개` : null}
                {missingRequired > 0 && invalidRequired > 0 ? " · " : null}
                {invalidRequired > 0 ? `형식 확인 ${invalidRequired}개` : null}
                {(missingRequired > 0 || invalidRequired > 0) &&
                (missingRequiredLabels.length > 0 || invalidRequiredLabels.length > 0)
                  ? ` (${[
                      ...missingRequiredLabels,
                      ...invalidRequiredLabels,
                    ]
                      .slice(0, 3)
                      .join(", ")}${
                      missingRequiredLabels.length + invalidRequiredLabels.length > 3
                        ? " 외"
                        : ""
                    })`
                  : null}
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
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
          <div className="border-b border-slate-100 bg-white px-8 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-700">
                  자가진단표 작성
                </div>
                {assessmentComplete ? (
                  <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    입력 완료 {answeredCount}/{totalQuestionCount}
                  </div>
                ) : (
                  <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                    <span
                      className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-amber-200 bg-white text-[10px] font-bold text-amber-700"
                      aria-hidden="true"
                    >
                      !
                    </span>
                    미입력 {remainingCount}개 (완료 {answeredCount}/{totalQuestionCount})
                  </div>
                )}
              </div>
              <div
                className={`flex flex-wrap items-center gap-2 ${
                  assessmentComplete ? "" : "cursor-help"
                }`}
                title={
                  assessmentComplete
                    ? undefined
                    : "모든 문항의 답변과 근거를 입력해야 저장할 수 있습니다."
                }
              >
                <div className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm">
                  총점 {assessmentTotalScore}/100점
                </div>
                <button
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={saveSelfAssessmentDraft}
                  disabled={assessmentSaving}
                >
                  임시저장
                </button>
                <button
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-100"
                  onClick={saveSelfAssessment}
                  disabled={assessmentSaving || !assessmentComplete}
                >
                  {assessmentComplete ? "자가진단표 수정" : "자가진단표 저장"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex flex-1 min-h-0 flex-col">
          {activeStep === "step2" ? (
            assessmentLoading ? (
              <div className="px-8 pb-4 pt-3">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-sm text-slate-500">
                  자가 진단표를 불러오는 중입니다.
                </div>
              </div>
            ) : (
              <>
                <div className="border-b border-slate-100 bg-white px-8 pt-3">
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
                  className="min-h-0 flex-1 overflow-y-auto px-8 pb-4 pt-3"
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
              <div className="px-8 pb-4 pt-3">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-sm text-slate-500">
                  기존 데이터를 불러오는 중입니다.
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-4 pt-3">
                <div className="space-y-5">
                  <section>
                    <div className="text-sm font-semibold text-slate-700">
                      기본 정보
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-6">
                      <label className="text-xs text-slate-500 md:col-span-2">
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
                      <label className="text-xs text-slate-500 md:col-span-1">
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
                      <label className="text-xs text-slate-500 md:col-span-2">
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
                      <label className="text-xs text-slate-500 md:col-span-1">
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
                      <label className="text-xs text-slate-500 md:col-span-1">
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
                      <label className="text-xs text-slate-500 md:col-span-1">
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
                      <label className="text-xs text-slate-500 md:col-span-2">
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
                      <label className="text-xs text-slate-500 md:col-span-2">
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
                      <label className="text-xs text-slate-500 md:col-span-1">
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
                      <label className="text-xs text-slate-500 md:col-span-1">
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
                    </div>
                  </section>

                  <section>
                    <div className="text-sm font-semibold text-slate-700">
                      소재지
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="text-xs text-slate-500">
                        <div className="flex items-center justify-between gap-2">
                          <span>본점 소재지</span>
                          <button
                            type="button"
                            onClick={() => handleAddressSearchClick("headOffice")}
                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            주소 검색
                          </button>
                        </div>
                        <div className="relative">
                          <input
                            className={inputClass(
                              isFieldInvalid("headOffice"),
                              "pr-8"
                            )}
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
                          {form.headOffice.trim().length > 0 ? (
                            <button
                              type="button"
                              onClick={() => clearAddressField("headOffice")}
                              className="absolute right-2 top-1/2 -translate-y-1/2 px-1 py-0.5 text-[10px] font-semibold text-slate-400 hover:text-slate-700"
                              aria-label="본점 소재지 지우기"
                              title="지우기"
                            >
                              x
                            </button>
                          ) : null}
                        </div>
                      </label>
                      <label className="text-xs text-slate-500">
                        <div className="flex items-center justify-between gap-2">
                          <span>지점 또는 연구소 소재지</span>
                          <button
                            type="button"
                            onClick={() => handleAddressSearchClick("branchOffice")}
                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            주소 검색
                          </button>
                        </div>
                        <div className="relative">
                          <input
                            className={inputClass(false, "pr-8")}
                            placeholder="없으면 '없음' 입력"
                            value={form.branchOffice}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                branchOffice: e.target.value,
                              }))
                            }
                          />
                          {form.branchOffice.trim().length > 0 ? (
                            <button
                              type="button"
                              onClick={() => clearAddressField("branchOffice")}
                              className="absolute right-2 top-1/2 -translate-y-1/2 px-1 py-0.5 text-[10px] font-semibold text-slate-400 hover:text-slate-700"
                              aria-label="지점 또는 연구소 소재지 지우기"
                              title="지우기"
                            >
                              x
                            </button>
                          ) : null}
                        </div>
                      </label>
                    </div>
                  </section>

                  <section>
                    <div className="text-sm font-semibold text-slate-700">
                      재무 및 투자이력
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="text-xs text-slate-500">
                        매출액 (2025년)
                        <input
                          className={inputClass(isFieldInvalid("revenue2025"))}
                          placeholder="예: 12.5억"
                          value={form.revenue2025}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              revenue2025: formatRevenueInput(e.target.value),
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
                              revenue2026: formatRevenueInput(e.target.value),
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
                    <div className="mt-4 space-y-3">
                      <div className="text-xs font-semibold text-slate-600">
                        투자이력 (순서별 작성)
                      </div>
                      {investmentRows.map((row, idx) => (
                        <div
                          key={`investment-${idx}`}
                          className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]"
                        >
                          <label className="text-xs text-slate-500">
                            <span className="block whitespace-nowrap">
                              투자단계
                            </span>
                            <div className="relative">
                              <input
                                className={inputClass(false, "rounded-lg pr-9")}
                                placeholder="목록에서 선택 또는 직접 입력"
                                value={row.stage}
                                autoComplete="off"
                                onFocus={() => setActiveInvestmentStageRow(idx)}
                                onBlur={() =>
                                  window.setTimeout(() => {
                                    setActiveInvestmentStageRow((prev) =>
                                      prev === idx ? null : prev
                                    )
                                  }, 120)
                                }
                                onChange={(event) => {
                                  setActiveInvestmentStageRow(idx)
                                  updateInvestmentRow(
                                    idx,
                                    "stage",
                                    event.target.value
                                  )
                                }}
                              />
                              <ChevronDown
                                className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                                aria-hidden="true"
                              />
                              {activeInvestmentStageRow === idx ? (
                                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                                  {getFilteredInvestmentStageOptions(row.stage)
                                    .length > 0 ? (
                                    getFilteredInvestmentStageOptions(row.stage).map(
                                      (option) => (
                                        <button
                                          key={option}
                                          type="button"
                                          className="w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                                          onMouseDown={(event) => {
                                            event.preventDefault()
                                            updateInvestmentRow(
                                              idx,
                                              "stage",
                                              option
                                            )
                                            setActiveInvestmentStageRow(null)
                                          }}
                                        >
                                          {option}
                                        </button>
                                      )
                                    )
                                  ) : (
                                    <div className="px-3 py-2 text-xs text-slate-400">
                                      추천 항목이 없습니다.
                                    </div>
                                  )}
                                </div>
                              ) : null}
                            </div>
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
                              onClick={() => handleRemoveInvestmentRow(idx)}
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
                        <div className="relative">
                          <select
                            className={inputClass(
                              isFieldInvalid("tipsLipsHistory"),
                              "appearance-none pr-9"
                            )}
                            value={form.tipsLipsHistory}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                tipsLipsHistory: e.target.value,
                              }))
                            }
                            onBlur={() => markTouched("tipsLipsHistory")}
                          >
                            <option value="">선택해주세요</option>
                            {TIPS_LIPS_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                            {form.tipsLipsHistory.trim().length > 0 &&
                            !TIPS_LIPS_OPTIONS.some(
                              (option) => option === form.tipsLipsHistory
                            ) ? (
                              <option value={form.tipsLipsHistory}>
                                {form.tipsLipsHistory}
                              </option>
                            ) : null}
                          </select>
                          <ChevronDown
                            className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                            aria-hidden="true"
                          />
                        </div>
                      </label>
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
        {snackbarMessage ? (
          <div
            className={`pointer-events-none fixed bottom-6 right-6 z-50 rounded-xl border px-4 py-2 text-sm font-semibold shadow-lg ${
              snackbarMessage.includes("실패")
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-slate-800 bg-slate-900 text-white"
            }`}
          >
            {snackbarMessage}
          </div>
        ) : null}
      </div>
    </div>
  )
}
