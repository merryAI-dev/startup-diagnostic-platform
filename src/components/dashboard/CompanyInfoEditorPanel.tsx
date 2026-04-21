import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react"
import { Check, ChevronDown, Trash2 } from "lucide-react"
import { toast } from "sonner"
import type { CompanyInfoForm, InvestmentInput } from "@/types/company"
import { InputSuffix } from "@/components/ui/InputSuffix"

export type CompanyInfoEditorProgramOption = {
  id: string
  name: string
}

type StatusVariant = "idle" | "warning" | "complete"
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

export type CompanyInfoEditorPanelProps = {
  form: CompanyInfoForm
  setForm: Dispatch<SetStateAction<CompanyInfoForm>>
  investmentRows: InvestmentInput[]
  addInvestmentRow: () => void
  removeInvestmentRow: (index: number) => void
  updateInvestmentRow: (index: number, field: keyof InvestmentInput, value: string) => void
  readOnly?: boolean
  optional?: boolean
  saving?: boolean
  canSubmit?: boolean
  showSaveActions?: boolean
  showPrograms?: boolean
  programOptions?: CompanyInfoEditorProgramOption[]
  selectedProgramIds?: string[]
  setSelectedProgramIds?: Dispatch<SetStateAction<string[]>>
  nameWarnings?: ReactNode
  onSaveDraft?: () => void
  onSave?: () => void
  isFieldInvalid?: (field: keyof CompanyInfoForm) => boolean
  isFieldValid?: (field: keyof CompanyInfoForm) => boolean
  markTouched?: (field: keyof CompanyInfoForm) => void
}

const DAUM_POSTCODE_SCRIPT_SRC =
  "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"
const CERTIFICATION_OPTIONS = [
  "예비사회적기업",
  "사회적기업",
  "비콥(B Corp)",
  "여성기업",
  "소셜벤처",
  "소상공인",
  "벤처기업",
  "해당없음",
] as const
const TIPS_LIPS_OPTIONS = [
  "TIPS",
  "프리팁스(시드)",
  "프리팁스(지역)",
  "딥테크 TIPS",
  "LIPS",
  "상권연계형 LIPS",
  "해당없음",
] as const
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
const SDG_OPTIONS = [
  "1. 빈곤 종식",
  "2. 기아 종식",
  "3. 건강과 웰빙",
  "4. 양질의 교육",
  "5. 성평등",
  "6. 깨끗한 물과 위생",
  "7. 모두를 위한 깨끗한 에너지",
  "8. 양질의 일자리와 경제성장",
  "9. 산업, 혁신과 사회기반시설",
  "10. 불평등 감소",
  "11. 지속가능한 도시와 공동체",
  "12. 책임 있는 소비와 생산",
  "13. 기후행동",
  "14. 해양생태계 보전",
  "15. 육상생태계 보전",
  "16. 평화, 정의와 제도",
  "17. 목표를 위한 파트너십",
] as const
const GENDER_OPTIONS = ["남", "여"] as const
const YES_NO_OPTIONS = ["예", "아니요"] as const
const COMPANY_TYPE_OPTIONS = ["예비창업", "법인"] as const
const SDG_SECONDARY_OPTIONS = [...SDG_OPTIONS, "없음"] as const
const REPRESENTATIVE_SOLUTION_MAX_LENGTH = 50
const REPRESENTATIVE_SOLUTION_MIN_LENGTH = 20
const MYSC_EXPECTATION_MAX_LENGTH = 20

function sanitizeInvestmentDateDigits(value: string) {
  const source = value.replace(/[^\d]/g, "").slice(0, 8)
  if (!source) return ""
  let digits = source.slice(0, 4)
  if (source.length <= 4) return digits
  const monthTens = source[4]
  if (!monthTens || monthTens < "0" || monthTens > "1") return digits
  digits += monthTens
  if (source.length === 5) return digits
  const monthOnes = source[5]
  if (!monthOnes) return digits
  const month = Number(`${monthTens}${monthOnes}`)
  if (month < 1 || month > 12) return digits
  digits += monthOnes
  if (source.length === 6) return digits
  const dayTens = source[6]
  if (!dayTens || dayTens < "0" || dayTens > "3") return digits
  digits += dayTens
  if (source.length === 7) return digits
  const dayOnes = source[7]
  if (!dayOnes) return digits
  const year = Number(source.slice(0, 4))
  const maxDay = new Date(year, month, 0).getDate()
  const day = Number(`${dayTens}${dayOnes}`)
  if (day < 1 || day > maxDay) return digits
  digits += dayOnes
  return digits
}

function formatInvestmentDateInput(value: string) {
  const digits = sanitizeInvestmentDateDigits(value)
  if (!digits) return ""
  if (digits.length <= 4) return digits
  if (digits.length <= 6) return `${digits.slice(0, 4)}.${digits.slice(4)}`
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`
}

function formatNumberInput(value: string) {
  const digits = value.replace(/[^\d]/g, "")
  if (!digits) return ""
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

function formatSignedNumberInput(value: string) {
  const trimmed = value.trim()
  const isNegative = trimmed.startsWith("-")
  const digits = value.replace(/[^\d]/g, "")
  if (!digits) return isNegative ? "-" : ""
  const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return isNegative ? `-${formatted}` : formatted
}

function formatBusinessNumber(value: string) {
  const digits = value.replace(/[^\d]/g, "").slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
}

function formatPhoneNumber(value: string) {
  const digits = value.replace(/[^\d]/g, "").slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

function parseDelimitedSelections(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
  }
  if (typeof value !== "string") return []
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function serializeDelimitedSelections(values: string[]) {
  return values.join(", ")
}

export function CompanyInfoEditorPanel({
  form,
  setForm,
  investmentRows,
  addInvestmentRow,
  removeInvestmentRow,
  updateInvestmentRow,
  readOnly = false,
  optional = false,
  saving = false,
  canSubmit = true,
  showSaveActions = false,
  showPrograms = true,
  programOptions = [],
  selectedProgramIds = [],
  setSelectedProgramIds,
  nameWarnings,
  onSaveDraft,
  onSave,
  isFieldInvalid,
  isFieldValid,
  markTouched,
}: CompanyInfoEditorPanelProps) {
  const isPreStartup = form.companyType === "예비창업"
  const representativeSolutionLength = form.representativeSolution.length
  const myscExpectationLength = form.myscExpectation.length
  const [activeCompanySection, setActiveCompanySection] = useState("company-service")
  const companySectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const postcodeScriptLoadingRef = useRef(false)
  const [activeInvestmentStageRow, setActiveInvestmentStageRow] = useState<number | null>(null)
  const [certificationDropdownOpen, setCertificationDropdownOpen] = useState(false)
  const [programDropdownOpen, setProgramDropdownOpen] = useState(false)
  const investmentStageDropdownRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const certificationDropdownRef = useRef<HTMLDivElement | null>(null)
  const programDropdownRef = useRef<HTMLDivElement | null>(null)

  const invalid = (field: keyof CompanyInfoForm) => (!optional && isFieldInvalid?.(field)) || false
  const touch = (field: keyof CompanyInfoForm) => {
    if (!optional) markTouched?.(field)
  }

  function inputClass(fieldInvalid?: boolean, extra?: string) {
    return [
      "mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:placeholder:text-slate-300",
      fieldInvalid
        ? "border-rose-300 bg-rose-50 text-rose-900 placeholder:text-rose-300 focus:border-rose-400 focus:ring-rose-200/60"
        : "border-slate-200 focus:border-slate-300 focus:ring-slate-200/60",
      extra,
    ]
      .filter(Boolean)
      .join(" ")
  }

  function segmentedToggleClass(active: boolean, disabled = false) {
    return [
      "min-w-[42px] rounded-lg px-2.5 py-1.5 text-xs font-semibold transition",
      disabled
        ? active
          ? "bg-slate-200 text-slate-500"
          : "text-slate-400"
        : active
          ? "bg-slate-700 text-white shadow-sm"
          : "text-slate-500 hover:bg-white/80 hover:text-slate-700",
    ].join(" ")
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
        const baseAddress = data.roadAddress?.trim() || data.jibunAddress?.trim() || ""
        const extras = [data.bname?.trim(), data.buildingName?.trim()].filter(
          (value): value is string => Boolean(value),
        )
        const detailedAddress =
          extras.length > 0 ? `${baseAddress} (${extras.join(", ")})` : baseAddress
        const zonecode = data.zonecode?.trim() ?? ""
        const fullAddress = zonecode ? `(${zonecode}) ${detailedAddress}` : detailedAddress
        if (!fullAddress) return
        setForm((prev) => ({ ...prev, [targetField]: fullAddress }))
        if (targetField === "headOffice") touch("headOffice")
      },
    })
    postcode.open()
  }

  function handleAddressSearchClick(targetField: AddressFieldKey) {
    if (readOnly || typeof window === "undefined") return
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
      toast.error("주소 검색 스크립트를 불러오지 못했습니다.")
    }
    document.head.appendChild(script)
  }

  function clearAddressField(targetField: AddressFieldKey) {
    setForm((prev) => ({ ...prev, [targetField]: "" }))
    if (targetField === "headOffice") touch("headOffice")
  }

  function toggleInvestmentStage(index: number, stage: string) {
    const normalized = stage.trim()
    if (!normalized) return
    const currentStages = parseDelimitedSelections(investmentRows[index]?.stage ?? "")
    const exists = currentStages.includes(normalized)
    const nextStages = exists
      ? currentStages.filter((item) => item !== normalized)
      : [...currentStages, normalized]
    updateInvestmentRow(index, "stage", serializeDelimitedSelections(nextStages))
  }

  function removeInvestmentStage(index: number, stage: string) {
    const currentStages = parseDelimitedSelections(investmentRows[index]?.stage ?? "")
    updateInvestmentRow(
      index,
      "stage",
      serializeDelimitedSelections(currentStages.filter((item) => item !== stage)),
    )
  }

  function toggleCertification(option: string) {
    const normalized = option.trim()
    if (!normalized) return
    const currentSelections = parseDelimitedSelections(form.certification)
    const exists = currentSelections.includes(normalized)
    const nextSelections = exists
      ? currentSelections.filter((item) => item !== normalized)
      : [...currentSelections, normalized]
    setForm((prev) => ({ ...prev, certification: serializeDelimitedSelections(nextSelections) }))
    touch("certification")
  }

  function removeCertification(option: string) {
    setForm((prev) => ({
      ...prev,
      certification: serializeDelimitedSelections(
        parseDelimitedSelections(form.certification).filter((item) => item !== option),
      ),
    }))
    touch("certification")
  }

  function handleRemoveInvestmentRow(index: number) {
    removeInvestmentRow(index)
    setActiveInvestmentStageRow((prev) => {
      if (prev == null) return prev
      if (prev === index) return null
      return prev > index ? prev - 1 : prev
    })
  }

  function toggleCompanyProgram(programId: string) {
    setSelectedProgramIds?.((prev) => {
      if (prev.includes(programId)) return prev.filter((value) => value !== programId)
      return [...prev, programId]
    })
  }

  function removeCompanyProgram(programId: string) {
    setSelectedProgramIds?.((prev) => prev.filter((value) => value !== programId))
  }

  const selectedProgramOptions = useMemo(() => {
    const programById = new Map(programOptions.map((program) => [program.id, program.name]))
    return selectedProgramIds.map((programId) => ({
      id: programId,
      name: programById.get(programId) ?? "알 수 없는 사업",
    }))
  }, [programOptions, selectedProgramIds])

  const companyInfoSections = useMemo(
    () => [
      {
        key: "company-service",
        label: "회사/서비스",
        description: "회사와 서비스, 법인 기본 정보와 소재지를 입력합니다.",
      },
      {
        key: "representative",
        label: "대표자",
        description: "대표자와 공동대표 정보를 함께 입력합니다.",
      },
      ...(!isPreStartup
        ? [
            {
              key: "finance-investment",
              label: "재무 및 투자이력",
              description: "매출, 자본, 투자 이력을 입력합니다.",
            },
            {
              key: "certification-voucher",
              label: "인증 및 바우처",
              description: "인증, TIPS/LIPS, 바우처 이력을 입력합니다.",
            },
          ]
        : []),
      {
        key: "funding",
        label: "투자 희망",
        description: "희망 투자액과 기대사항을 입력합니다.",
      },
    ],
    [isPreStartup],
  )

  const companySectionStatusByKey = useMemo(() => {
    const requiredBySection: Record<string, Array<keyof CompanyInfoForm>> = {
      "company-service": [
        "companyInfo",
        "representativeSolution",
        "sdgPriority1",
        "sdgPriority2",
        "foundedAt",
        "businessNumber",
        "website",
        "primaryBusiness",
        "primaryIndustry",
        "targetCountries",
        "headOffice",
        "branchOffice",
        "workforceFullTime",
        "workforceContract",
      ],
      representative: [
        "ceoName",
        "ceoBirthDate",
        "ceoEmail",
        "ceoPhone",
        "ceoGender",
        "ceoNationality",
        "founderSerialNumber",
        "hasCoRepresentative",
      ],
      "finance-investment": ["revenue2025", "revenue2026", "capitalTotal"],
      "certification-voucher": [
        "certification",
        "tipsLipsHistory",
        "exportVoucherHeld",
        "innovationVoucherHeld",
      ],
      funding: ["desiredInvestment2026", "desiredPreValue", "myscExpectation"],
    }
    const status: Record<string, StatusVariant> = {}
    companyInfoSections.forEach((section) => {
      if (optional) {
        status[section.key] = "idle"
        return
      }
      const keys = requiredBySection[section.key] ?? []
      status[section.key] =
        keys.length > 0 && keys.every((key) => isFieldValid?.(key)) ? "complete" : "warning"
    })
    return status
  }, [companyInfoSections, optional, isFieldValid])

  useEffect(() => {
    if (companyInfoSections.some((section) => section.key === activeCompanySection)) return
    setActiveCompanySection("company-service")
  }, [activeCompanySection, companyInfoSections])

  useEffect(() => {
    if (form.hasCoRepresentative === "예") return
    if (
      !form.coRepresentativeName &&
      !form.coRepresentativeBirthDate &&
      !form.coRepresentativeGender &&
      !form.coRepresentativeTitle
    ) {
      return
    }
    setForm((prev) => ({
      ...prev,
      coRepresentativeName: "",
      coRepresentativeBirthDate: "",
      coRepresentativeGender: "",
      coRepresentativeTitle: "",
    }))
  }, [
    form.coRepresentativeBirthDate,
    form.coRepresentativeGender,
    form.coRepresentativeName,
    form.coRepresentativeTitle,
    form.hasCoRepresentative,
    setForm,
  ])

  useEffect(() => {
    const rowIndex = activeInvestmentStageRow
    if (rowIndex === null) return
    const currentIndex = rowIndex
    function handleOutsideClick(event: MouseEvent) {
      const current = investmentStageDropdownRefs.current[currentIndex]
      if (!current) return
      if (event.target instanceof Node && current.contains(event.target)) return
      setActiveInvestmentStageRow(null)
    }
    document.addEventListener("mousedown", handleOutsideClick)
    return () => document.removeEventListener("mousedown", handleOutsideClick)
  }, [activeInvestmentStageRow])

  useEffect(() => {
    if (!certificationDropdownOpen) return
    function handleOutsideClick(event: MouseEvent) {
      const current = certificationDropdownRef.current
      if (!current) return
      if (event.target instanceof Node && current.contains(event.target)) return
      setCertificationDropdownOpen(false)
    }
    document.addEventListener("mousedown", handleOutsideClick)
    return () => document.removeEventListener("mousedown", handleOutsideClick)
  }, [certificationDropdownOpen])

  useEffect(() => {
    if (!programDropdownOpen) return
    function handleOutsideClick(event: MouseEvent) {
      const current = programDropdownRef.current
      if (!current) return
      if (event.target instanceof Node && current.contains(event.target)) return
      setProgramDropdownOpen(false)
    }
    document.addEventListener("mousedown", handleOutsideClick)
    return () => document.removeEventListener("mousedown", handleOutsideClick)
  }, [programDropdownOpen])

  function scrollToCompanySection(sectionKey: string) {
    setActiveCompanySection(sectionKey)
    companySectionRefs.current[sectionKey]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    })
  }

  function applyCompanyType(nextType: (typeof COMPANY_TYPE_OPTIONS)[number]) {
    setForm((prev) => {
      if (nextType !== "예비창업") return { ...prev, companyType: nextType }
      return {
        ...prev,
        companyType: nextType,
        foundedAt: "",
        businessNumber: "",
        primaryBusiness: "",
        primaryIndustry: "",
        headOffice: "",
        branchOffice: "",
        workforceFullTime: "",
        workforceContract: "",
        revenue2025: "",
        revenue2026: "",
        capitalTotal: "",
        certification: "",
        tipsLipsHistory: "",
        exportVoucherHeld: "",
        exportVoucherAmount: "",
        exportVoucherUsageRate: "",
        innovationVoucherHeld: "",
        innovationVoucherAmount: "",
        innovationVoucherUsageRate: "",
      }
    })
  }

  const renderSectionStatus = (sectionKey: string) => {
    if (optional) return "선택 입력"
    return companySectionStatusByKey[sectionKey] === "complete" ? "완료" : "입력 필요"
  }

  return (
    <div className="min-h-0 flex flex-1 bg-[#f8fafc]">
      <aside className="hidden h-full w-72 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="text-sm font-semibold text-slate-900">기업 정보 입력</div>
          <div className="mt-1 text-xs text-slate-500">유형에 따라 필요한 섹션만 안내합니다.</div>
        </div>
        <div className="border-b border-slate-100 px-4 py-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            기업 유형
          </div>
          <div className="mt-3 inline-grid w-fit grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
            {COMPANY_TYPE_OPTIONS.map((option) => {
              const active = form.companyType === option
              return (
                <button
                  key={option}
                  type="button"
                  disabled={readOnly}
                  onClick={() => applyCompanyType(option)}
                  className={segmentedToggleClass(active, readOnly)}
                >
                  {option}
                </button>
              )
            })}
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {companyInfoSections.map((section) => {
            const active = activeCompanySection === section.key
            const variant = companySectionStatusByKey[section.key] ?? "warning"
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => scrollToCompanySection(section.key)}
                className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                  active
                    ? "border-slate-400 bg-white text-slate-900 shadow-lg shadow-slate-200/80 ring-1 ring-slate-200"
                    : "border-slate-200 bg-slate-50/80 text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-600"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold">{section.label}</div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      optional
                        ? active
                          ? "bg-slate-100 text-slate-700"
                          : "bg-slate-100 text-slate-500"
                        : active
                          ? variant === "complete"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-800"
                          : variant === "complete"
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {renderSectionStatus(section.key)}
                  </span>
                </div>
                <div className={`mt-1 text-[11px] ${active ? "text-slate-600" : "text-slate-400"}`}>
                  {section.description}
                </div>
              </button>
            )
          })}
        </div>
        {showSaveActions ? (
          <div className="border-t border-slate-100 px-4 py-4">
            <div className="flex justify-end gap-2">
              <button
                className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={onSaveDraft}
                disabled={saving}
              >
                임시저장
              </button>
              <button
                className="inline-flex rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-100"
                onClick={onSave}
                disabled={saving || !canSubmit}
              >
                저장
              </button>
            </div>
          </div>
        ) : null}
      </aside>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4 lg:px-8">
        <div className="mb-4 flex gap-2 overflow-x-auto lg:hidden">
          {companyInfoSections.map((section) => {
            const active = activeCompanySection === section.key
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => scrollToCompanySection(section.key)}
                className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                {section.label}
              </button>
            )
          })}
        </div>
        <div className="space-y-5">
          <section
            ref={(element) => {
              companySectionRefs.current["company-service"] = element
            }}
            className="space-y-4"
          >
            <div className="text-sm font-semibold text-slate-700">회사/서비스</div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="grid gap-3 md:grid-cols-6">
                <label className="relative text-xs text-slate-500 md:col-span-3">
                  기업/팀명
                  <input
                    className={inputClass(invalid("companyInfo"))}
                    placeholder={
                      isPreStartup
                        ? "팀명 또는 창업 예정 기업명을 입력하세요"
                        : "법인등기부등본 기준 회사명을 입력하세요"
                    }
                    value={form.companyInfo}
                    disabled={readOnly}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        companyInfo: e.target.value,
                      }))
                    }
                    onBlur={() => touch("companyInfo")}
                  />
                  {nameWarnings}
                </label>
                {showPrograms ? (
                  <label className="text-xs text-slate-500 md:col-span-3">
                    2026년 MYSC 참여사업
                    <div className="relative mt-1" ref={programDropdownRef}>
                      <div
                        tabIndex={0}
                        className={`${inputClass(false, "cursor-pointer pr-9 text-left")}`}
                        onMouseDown={(event) => {
                          if (readOnly) return
                          event.preventDefault()
                          setProgramDropdownOpen((prev) => !prev)
                        }}
                      >
                        {selectedProgramOptions.length > 0 ? (
                          <div className="truncate pr-2 text-sm text-slate-700">
                            {selectedProgramOptions.map((program) => program.name).join(", ")}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">
                            참여 중인 사업을 선택하세요
                          </span>
                        )}
                      </div>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      {programDropdownOpen ? (
                        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                          {programOptions.length > 0 ? (
                            programOptions.map((program) => {
                              const isSelected = selectedProgramIds.includes(program.id)
                              return (
                                <button
                                  key={program.id}
                                  type="button"
                                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs ${
                                    isSelected
                                      ? "bg-emerald-50 font-semibold text-emerald-700"
                                      : "text-slate-700 hover:bg-slate-50"
                                  }`}
                                  onMouseDown={(event) => {
                                    event.preventDefault()
                                    toggleCompanyProgram(program.id)
                                  }}
                                >
                                  <span
                                    className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
                                      isSelected
                                        ? "border-emerald-500 bg-emerald-500 text-white"
                                        : "border-slate-300 bg-white text-transparent"
                                    }`}
                                  >
                                    <Check className="h-3 w-3" />
                                  </span>
                                  <span className="min-w-0 flex-1 truncate">{program.name}</span>
                                  {isSelected ? (
                                    <span
                                      className="text-slate-400 hover:text-slate-600"
                                      onMouseDown={(event) => {
                                        event.preventDefault()
                                        event.stopPropagation()
                                        removeCompanyProgram(program.id)
                                      }}
                                    >
                                      ×
                                    </span>
                                  ) : null}
                                </button>
                              )
                            })
                          ) : (
                            <div className="px-3 py-2 text-xs text-slate-500">
                              등록된 사업이 없습니다.
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </label>
                ) : null}
                <label className="text-xs text-slate-500 md:col-span-2">
                  대표 솔루션 한 줄 소개
                  <input
                    className={inputClass(invalid("representativeSolution"))}
                    maxLength={REPRESENTATIVE_SOLUTION_MAX_LENGTH}
                    placeholder="기업/서비스를 한 줄로 소개해주세요"
                    value={form.representativeSolution}
                    disabled={readOnly}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        representativeSolution: e.target.value.slice(
                          0,
                          REPRESENTATIVE_SOLUTION_MAX_LENGTH,
                        ),
                      }))
                    }
                    onBlur={() => touch("representativeSolution")}
                  />
                  <div className="mt-1 text-[11px] text-slate-400">
                    {Math.min(representativeSolutionLength, REPRESENTATIVE_SOLUTION_MIN_LENGTH)}/
                    {REPRESENTATIVE_SOLUTION_MIN_LENGTH}자
                  </div>
                </label>
                <label className="text-xs text-slate-500 md:col-span-2">
                  UN SDGs 우선순위 1위
                  <div className="relative">
                    <select
                      className={`${inputClass(invalid("sdgPriority1"))} appearance-none pr-10`}
                      value={form.sdgPriority1}
                      disabled={readOnly}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, sdgPriority1: e.target.value }))
                      }
                      onBlur={() => touch("sdgPriority1")}
                    >
                      <option value="">선택</option>
                      {SDG_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  </div>
                </label>
                <label className="text-xs text-slate-500 md:col-span-2">
                  UN SDGs 우선순위 2위
                  <div className="relative">
                    <select
                      className={`${inputClass(invalid("sdgPriority2"))} appearance-none pr-10`}
                      value={form.sdgPriority2}
                      disabled={readOnly}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, sdgPriority2: e.target.value }))
                      }
                      onBlur={() => touch("sdgPriority2")}
                    >
                      <option value="">선택</option>
                      {SDG_SECONDARY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  </div>
                </label>
                {!isPreStartup ? (
                  <>
                    <div className="mt-2 border-t border-slate-100 pt-5 md:col-span-6" />
                    <label className="text-xs text-slate-500 md:col-span-2">
                      법인 설립일자
                      <input
                        type="date"
                        className={inputClass(invalid("foundedAt"))}
                        value={form.foundedAt}
                        disabled={readOnly}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, foundedAt: e.target.value }))
                        }
                        onBlur={() => touch("foundedAt")}
                      />
                    </label>
                    <label className="text-xs text-slate-500 md:col-span-2">
                      사업자등록번호
                      <input
                        className={inputClass(invalid("businessNumber"))}
                        placeholder="000-00-00000"
                        value={form.businessNumber}
                        disabled={readOnly}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            businessNumber: formatBusinessNumber(e.target.value),
                          }))
                        }
                        onBlur={() => touch("businessNumber")}
                      />
                    </label>
                    <label className="text-xs text-slate-500 md:col-span-2">
                      회사 홈페이지
                      <input
                        className={inputClass(invalid("website"))}
                        placeholder="https://example.com"
                        value={form.website}
                        disabled={readOnly}
                        onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))}
                        onBlur={() => touch("website")}
                      />
                    </label>
                    <label className="text-xs text-slate-500 md:col-span-2">
                      주업태
                      <input
                        className={inputClass(invalid("primaryBusiness"))}
                        placeholder="예: 정보통신업"
                        value={form.primaryBusiness}
                        disabled={readOnly}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, primaryBusiness: e.target.value }))
                        }
                        onBlur={() => touch("primaryBusiness")}
                      />
                    </label>
                    <label className="text-xs text-slate-500 md:col-span-2">
                      주업종
                      <input
                        className={inputClass(invalid("primaryIndustry"))}
                        placeholder="예: 소프트웨어 개발"
                        value={form.primaryIndustry}
                        disabled={readOnly}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, primaryIndustry: e.target.value }))
                        }
                        onBlur={() => touch("primaryIndustry")}
                      />
                    </label>
                    <label className="text-xs text-slate-500 md:col-span-2">
                      해외 지사 또는 진출 희망국가 (최대 3개)
                      <input
                        className={inputClass(invalid("targetCountries"))}
                        placeholder="없으면 '없음' 입력"
                        value={form.targetCountries}
                        disabled={readOnly}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, targetCountries: e.target.value }))
                        }
                        onBlur={() => touch("targetCountries")}
                      />
                    </label>
                    <div className="mt-2 border-t border-slate-100 pt-5 md:col-span-6" />
                    <label className="text-xs text-slate-500 md:col-span-3">
                      <div className="flex items-center justify-between gap-2">
                        <span>
                          본점 소재지{" "}
                          <span className="text-[11px] text-slate-400">(법인등기부등본 기준)</span>
                        </span>
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => handleAddressSearchClick("headOffice")}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          주소 검색
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          className={inputClass(invalid("headOffice"), "pr-8")}
                          placeholder="서울시 강남구 ..."
                          value={form.headOffice}
                          disabled={readOnly}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, headOffice: e.target.value }))
                          }
                          onBlur={() => touch("headOffice")}
                        />
                        {form.headOffice.trim().length > 0 && !readOnly ? (
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
                    <label className="text-xs text-slate-500 md:col-span-3">
                      <div className="flex items-center justify-between gap-2">
                        <span>
                          지점 또는 연구소 소재지{" "}
                          <span className="text-[11px] text-slate-400">(법인등기부등본 기준)</span>
                        </span>
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => handleAddressSearchClick("branchOffice")}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          주소 검색
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          className={inputClass(invalid("branchOffice"), "pr-8")}
                          placeholder="없으면 '없음' 입력"
                          value={form.branchOffice}
                          disabled={readOnly}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, branchOffice: e.target.value }))
                          }
                          onBlur={() => touch("branchOffice")}
                        />
                        {form.branchOffice.trim().length > 0 && !readOnly ? (
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
                    <div className="mt-1 border-t border-slate-100 pt-5 md:col-span-6" />
                    <label className="text-xs text-slate-500 md:col-span-2">
                      종업원수 (정규, 4대보험 가입자 수 기준)
                      <InputSuffix suffix="명">
                        <input
                          className={inputClass(invalid("workforceFullTime"), "mt-0")}
                          placeholder="0"
                          value={form.workforceFullTime}
                          disabled={readOnly}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              workforceFullTime: formatNumberInput(e.target.value),
                            }))
                          }
                          onBlur={() => touch("workforceFullTime")}
                        />
                      </InputSuffix>
                    </label>
                    <label className="text-xs text-slate-500 md:col-span-2">
                      종업원수 (계약, 4대보험 가입자 수 기준)
                      <InputSuffix suffix="명">
                        <input
                          className={inputClass(invalid("workforceContract"), "mt-0")}
                          placeholder="0"
                          value={form.workforceContract}
                          disabled={readOnly}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              workforceContract: formatNumberInput(e.target.value),
                            }))
                          }
                          onBlur={() => touch("workforceContract")}
                        />
                      </InputSuffix>
                    </label>
                  </>
                ) : null}
              </div>
            </div>
          </section>

          <section
            ref={(element) => {
              companySectionRefs.current.representative = element
            }}
            className="space-y-4"
          >
            <div className="text-sm font-semibold text-slate-700">대표자</div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="grid gap-3 md:grid-cols-6">
                <label className="text-xs text-slate-500 md:col-span-2">
                  대표자 성명
                  <input
                    className={inputClass(invalid("ceoName"))}
                    placeholder="홍길동"
                    value={form.ceoName}
                    disabled={readOnly}
                    onChange={(e) => setForm((prev) => ({ ...prev, ceoName: e.target.value }))}
                    onBlur={() => touch("ceoName")}
                  />
                </label>
                <label className="text-xs text-slate-500 md:col-span-2">
                  대표자 생년월일
                  <input
                    type="date"
                    className={inputClass(invalid("ceoBirthDate"))}
                    value={form.ceoBirthDate}
                    disabled={readOnly}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        ceoBirthDate: e.target.value,
                      }))
                    }
                    onBlur={() => touch("ceoBirthDate")}
                  />
                </label>
                <label className="text-xs text-slate-500 md:col-span-1">
                  대표자 나이
                  <input
                    className={inputClass(invalid("ceoAge"))}
                    inputMode="numeric"
                    placeholder="예: 42"
                    value={form.ceoAge}
                    disabled={readOnly}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        ceoAge: e.target.value.replace(/[^\d]/g, "").slice(0, 3),
                      }))
                    }
                    onBlur={() => touch("ceoAge")}
                  />
                </label>
                <label className="text-xs text-slate-500 md:col-span-3">
                  대표자 이메일
                  <input
                    className={inputClass(invalid("ceoEmail"))}
                    placeholder="ceo@company.com"
                    value={form.ceoEmail}
                    disabled={readOnly}
                    onChange={(e) => setForm((prev) => ({ ...prev, ceoEmail: e.target.value }))}
                    onBlur={() => touch("ceoEmail")}
                  />
                </label>
                <label className="text-xs text-slate-500 md:col-span-2">
                  대표자 전화번호
                  <input
                    className={inputClass(invalid("ceoPhone"))}
                    placeholder="010-0000-0000"
                    value={form.ceoPhone}
                    disabled={readOnly}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, ceoPhone: formatPhoneNumber(e.target.value) }))
                    }
                    onBlur={() => touch("ceoPhone")}
                  />
                </label>
                <label className="text-xs text-slate-500 md:col-span-1">
                  <span className="block">대표자 성별</span>
                  <div className="mt-1 inline-grid w-fit grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1">
                    {GENDER_OPTIONS.map((option) => {
                      const active = form.ceoGender === option
                      return (
                        <button
                          key={option}
                          type="button"
                          disabled={readOnly}
                          className={segmentedToggleClass(active, readOnly)}
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              ceoGender: prev.ceoGender === option ? "" : option,
                            }))
                          }
                        >
                          {option}
                        </button>
                      )
                    })}
                  </div>
                </label>
                <label className="text-xs text-slate-500 md:col-span-2">
                  대표자 국적
                  <input
                    className={inputClass(invalid("ceoNationality"))}
                    placeholder="예: 대한민국"
                    value={form.ceoNationality}
                    disabled={readOnly}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, ceoNationality: e.target.value }))
                    }
                    onBlur={() => touch("ceoNationality")}
                  />
                </label>
                <label className="text-xs text-slate-500 md:col-span-1">
                  이전 창업 횟수
                  <input
                    className={inputClass(invalid("founderSerialNumber"))}
                    inputMode="numeric"
                    placeholder="예: 1"
                    value={form.founderSerialNumber}
                    disabled={readOnly}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        founderSerialNumber: e.target.value.replace(/[^\d]/g, "").slice(0, 2),
                      }))
                    }
                    onBlur={() => touch("founderSerialNumber")}
                  />
                </label>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-slate-700">공동대표 정보</div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        공동대표가 있는 경우에만 추가 정보를 입력합니다.
                      </div>
                    </div>
                    <div className="inline-grid w-fit grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1">
                      {YES_NO_OPTIONS.map((option) => {
                        const active = form.hasCoRepresentative === option
                        return (
                          <button
                            key={option}
                            type="button"
                            disabled={readOnly}
                            className={segmentedToggleClass(active, readOnly)}
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                hasCoRepresentative:
                                  prev.hasCoRepresentative === option ? "" : option,
                                coRepresentativeName:
                                  option === "예" ? prev.coRepresentativeName : "",
                                coRepresentativeBirthDate:
                                  option === "예" ? prev.coRepresentativeBirthDate : "",
                                coRepresentativeGender:
                                  option === "예" ? prev.coRepresentativeGender : "",
                                coRepresentativeTitle:
                                  option === "예" ? prev.coRepresentativeTitle : "",
                              }))
                            }
                          >
                            {option}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  {form.hasCoRepresentative === "예" ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-6">
                      <label className="text-xs text-slate-500 md:col-span-2">
                        공동대표 성명
                        <input
                          className={inputClass(invalid("coRepresentativeName"))}
                          placeholder="홍길동"
                          value={form.coRepresentativeName}
                          disabled={readOnly}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, coRepresentativeName: e.target.value }))
                          }
                          onBlur={() => touch("coRepresentativeName")}
                        />
                      </label>
                      <label className="text-xs text-slate-500 md:col-span-2">
                        공동대표 생년월일
                        <input
                          type="date"
                          className={inputClass(invalid("coRepresentativeBirthDate"))}
                          value={form.coRepresentativeBirthDate}
                          disabled={readOnly}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              coRepresentativeBirthDate: e.target.value,
                            }))
                          }
                          onBlur={() => touch("coRepresentativeBirthDate")}
                        />
                      </label>
                      <label className="text-xs text-slate-500 md:col-span-1">
                        <span className="block">공동대표 성별</span>
                        <div className="mt-1 inline-grid w-fit grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1">
                          {GENDER_OPTIONS.map((option) => {
                            const active = form.coRepresentativeGender === option
                            return (
                              <button
                                key={option}
                                type="button"
                                disabled={readOnly}
                                className={segmentedToggleClass(active, readOnly)}
                                onClick={() =>
                                  setForm((prev) => ({
                                    ...prev,
                                    coRepresentativeGender:
                                      prev.coRepresentativeGender === option ? "" : option,
                                  }))
                                }
                              >
                                {option}
                              </button>
                            )
                          })}
                        </div>
                      </label>
                      <label className="text-xs text-slate-500 md:col-span-1">
                        공동대표 직책
                        <input
                          className={inputClass(invalid("coRepresentativeTitle"))}
                          placeholder="예: COO"
                          value={form.coRepresentativeTitle}
                          disabled={readOnly}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, coRepresentativeTitle: e.target.value }))
                          }
                          onBlur={() => touch("coRepresentativeTitle")}
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          {!isPreStartup ? (
            <section
              ref={(element) => {
                companySectionRefs.current["finance-investment"] = element
              }}
              className="space-y-4"
            >
              <div className="text-sm font-semibold text-slate-700">재무 및 투자이력</div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="grid gap-3 md:grid-cols-4">
                  <label className="text-xs text-slate-500 md:col-span-2 md:max-w-md">
                    매출액 (2025년)
                    <InputSuffix suffix="원">
                      <input
                        className={inputClass(invalid("revenue2025"), "mt-0")}
                        placeholder="예: 1,250,000,000"
                        value={form.revenue2025}
                        disabled={readOnly}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            revenue2025: formatNumberInput(e.target.value),
                          }))
                        }
                        onBlur={() => touch("revenue2025")}
                      />
                    </InputSuffix>
                  </label>
                  <label className="text-xs text-slate-500 md:col-span-2 md:max-w-md">
                    매출액 (2026년)
                    <InputSuffix suffix="원">
                      <input
                        className={inputClass(invalid("revenue2026"), "mt-0")}
                        placeholder="예: 1,800,000,000"
                        value={form.revenue2026}
                        disabled={readOnly}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            revenue2026: formatNumberInput(e.target.value),
                          }))
                        }
                        onBlur={() => touch("revenue2026")}
                      />
                    </InputSuffix>
                  </label>
                  <label className="text-xs text-slate-500 md:col-span-2 md:max-w-md">
                    자본총계
                    <InputSuffix suffix="원">
                      <input
                        className={inputClass(invalid("capitalTotal"), "mt-0")}
                        placeholder="예: 300,000,000"
                        value={form.capitalTotal}
                        disabled={readOnly}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            capitalTotal: formatSignedNumberInput(e.target.value),
                          }))
                        }
                        onBlur={() => touch("capitalTotal")}
                      />
                    </InputSuffix>
                  </label>
                </div>
                <div className="mt-4 space-y-3">
                  <div className="text-xs font-semibold text-slate-600">투자이력 (순서별 작성)</div>
                  {investmentRows.map((row, idx) => {
                    const selectedStages = parseDelimitedSelections(row.stage)
                    return (
                      <div
                        key={`investment-${idx}`}
                        className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4"
                      >
                        <label className="text-xs text-slate-500">
                          <span className="block whitespace-nowrap">투자단계 (다중선택)</span>
                          <div
                            className="relative"
                            ref={(element) => {
                              investmentStageDropdownRefs.current[idx] = element
                            }}
                          >
                            <div
                              tabIndex={0}
                              className={inputClass(
                                false,
                                "min-h-[40px] cursor-pointer rounded-lg pr-9",
                              )}
                              onMouseDown={(event) => {
                                if (readOnly) return
                                event.preventDefault()
                                event.stopPropagation()
                                setActiveInvestmentStageRow((prev) => (prev === idx ? null : idx))
                              }}
                            >
                              {selectedStages.length > 0 ? (
                                <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap pr-1">
                                  {selectedStages.map((stage) => (
                                    <span
                                      key={`${stage}-${idx}`}
                                      className="inline-flex h-5 items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-1.5 text-[9px] font-medium text-slate-700"
                                    >
                                      <span>{stage}</span>
                                      {!readOnly ? (
                                        <button
                                          type="button"
                                          className="text-slate-500 hover:text-slate-800"
                                          onMouseDown={(event) => {
                                            event.preventDefault()
                                            event.stopPropagation()
                                            removeInvestmentStage(idx, stage)
                                          }}
                                        >
                                          ×
                                        </button>
                                      ) : null}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-sm text-slate-400">
                                  투자단계를 선택하세요
                                </span>
                              )}
                            </div>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                            {activeInvestmentStageRow === idx ? (
                              <div className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                                {INVESTMENT_STAGE_OPTIONS.map((option) => {
                                  const isSelected = selectedStages.includes(option)
                                  return (
                                    <button
                                      key={option}
                                      type="button"
                                      className={`w-full px-3 py-2 text-left text-xs hover:bg-slate-50 ${
                                        isSelected
                                          ? "font-semibold text-slate-900"
                                          : "text-slate-700"
                                      }`}
                                      onMouseDown={(event) => {
                                        event.preventDefault()
                                        toggleInvestmentStage(idx, option)
                                      }}
                                    >
                                      {isSelected ? `✓ ${option}` : option}
                                    </button>
                                  )
                                })}
                              </div>
                            ) : null}
                          </div>
                        </label>
                        <label className="text-xs text-slate-500">
                          <span className="block whitespace-nowrap">투자유치시기</span>
                          <input
                            type="text"
                            className={inputClass(false, "rounded-lg")}
                            inputMode="numeric"
                            maxLength={10}
                            placeholder="YYYY.MM.DD"
                            value={row.date}
                            disabled={readOnly}
                            onInput={(e) => {
                              const nextValue = formatInvestmentDateInput(e.currentTarget.value)
                              e.currentTarget.value = nextValue
                              updateInvestmentRow(idx, "date", nextValue)
                            }}
                            onBlur={(e) => {
                              const nextValue = formatInvestmentDateInput(e.currentTarget.value)
                              const digits = nextValue.replace(/[^\d]/g, "")
                              updateInvestmentRow(idx, "date", digits.length === 8 ? nextValue : "")
                            }}
                          />
                        </label>
                        <label className="text-xs text-slate-500">
                          <span className="block whitespace-nowrap">투자 유치금액</span>
                          <InputSuffix suffix="원">
                            <input
                              className={inputClass(false, "mt-0 rounded-lg")}
                              placeholder="예: 2,550,000,000"
                              inputMode="numeric"
                              value={row.postMoney}
                              disabled={readOnly}
                              onChange={(e) =>
                                updateInvestmentRow(
                                  idx,
                                  "postMoney",
                                  formatNumberInput(e.target.value),
                                )
                              }
                            />
                          </InputSuffix>
                        </label>
                        <div className="flex items-start gap-2">
                          <label className="min-w-0 flex-1 text-xs text-slate-500">
                            <span className="block whitespace-nowrap">지분율 상위 3명 주주명</span>
                            <input
                              className={inputClass(false, "rounded-lg")}
                              placeholder="예: 홍길동, 김철수, 박영희"
                              value={row.majorShareholder}
                              disabled={readOnly}
                              onChange={(e) =>
                                updateInvestmentRow(idx, "majorShareholder", e.target.value)
                              }
                            />
                          </label>
                          {!readOnly ? (
                            <button
                              type="button"
                              className="mt-5 rounded-md border border-rose-200 p-2 text-rose-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => handleRemoveInvestmentRow(idx)}
                              aria-label="삭제"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                  {!readOnly ? (
                    <button
                      type="button"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      onClick={addInvestmentRow}
                      disabled={investmentRows.length >= 3}
                    >
                      {investmentRows.length >= 3 ? "최대 3개까지 입력 가능" : "+ 투자이력 추가"}
                    </button>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          {!isPreStartup ? (
            <section
              ref={(element) => {
                companySectionRefs.current["certification-voucher"] = element
              }}
              className="space-y-4"
            >
              <div className="text-sm font-semibold text-slate-700">인증 및 바우처</div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-slate-500">
                    <span className="block whitespace-nowrap">인증/지정 여부 (다중선택)</span>
                    <div className="relative" ref={certificationDropdownRef}>
                      <div
                        tabIndex={0}
                        className={inputClass(
                          invalid("certification"),
                          "min-h-[40px] cursor-pointer rounded-lg pr-9",
                        )}
                        onMouseDown={(event) => {
                          if (readOnly) return
                          event.preventDefault()
                          event.stopPropagation()
                          setCertificationDropdownOpen((prev) => !prev)
                        }}
                      >
                        {parseDelimitedSelections(form.certification).length > 0 ? (
                          <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap pr-1">
                            {parseDelimitedSelections(form.certification).map((option) => (
                              <span
                                key={option}
                                className="inline-flex h-5 items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-1.5 text-[9px] font-medium text-slate-700"
                              >
                                <span>{option}</span>
                                {!readOnly ? (
                                  <button
                                    type="button"
                                    className="text-slate-500 hover:text-slate-800"
                                    onMouseDown={(event) => {
                                      event.preventDefault()
                                      event.stopPropagation()
                                      removeCertification(option)
                                    }}
                                  >
                                    ×
                                  </button>
                                ) : null}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">
                            인증/지정 여부를 선택하세요
                          </span>
                        )}
                      </div>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      {certificationDropdownOpen ? (
                        <div className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                          {CERTIFICATION_OPTIONS.map((option) => {
                            const isSelected = parseDelimitedSelections(
                              form.certification,
                            ).includes(option)
                            return (
                              <button
                                key={option}
                                type="button"
                                className={`w-full px-3 py-2 text-left text-xs hover:bg-slate-50 ${
                                  isSelected ? "font-semibold text-slate-900" : "text-slate-700"
                                }`}
                                onMouseDown={(event) => {
                                  event.preventDefault()
                                  toggleCertification(option)
                                }}
                              >
                                {isSelected ? `✓ ${option}` : option}
                              </button>
                            )
                          })}
                        </div>
                      ) : null}
                    </div>
                  </label>
                  <label className="text-xs text-slate-500">
                    TIPS/LIPS 이력
                    <div className="relative">
                      <select
                        className={`${inputClass(invalid("tipsLipsHistory"))} appearance-none pr-10`}
                        value={form.tipsLipsHistory}
                        disabled={readOnly}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, tipsLipsHistory: e.target.value }))
                        }
                        onBlur={() => touch("tipsLipsHistory")}
                      >
                        <option value="">선택</option>
                        {TIPS_LIPS_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    </div>
                  </label>
                </div>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {[
                    {
                      held: "exportVoucherHeld",
                      amount: "exportVoucherAmount",
                      usage: "exportVoucherUsageRate",
                      title: "수출바우처",
                      amountPlaceholder: "예: 50,000,000",
                      usagePlaceholder: "예: 40",
                    },
                    {
                      held: "innovationVoucherHeld",
                      amount: "innovationVoucherAmount",
                      usage: "innovationVoucherUsageRate",
                      title: "중소기업혁신바우처",
                      amountPlaceholder: "예: 30,000,000",
                      usagePlaceholder: "예: 75",
                    },
                  ].map((group) => {
                    const heldKey = group.held as "exportVoucherHeld" | "innovationVoucherHeld"
                    const amountKey = group.amount as
                      | "exportVoucherAmount"
                      | "innovationVoucherAmount"
                    const usageKey = group.usage as
                      | "exportVoucherUsageRate"
                      | "innovationVoucherUsageRate"
                    return (
                      <div
                        key={group.title}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <label className="text-xs text-slate-500">
                          <span className="block">{group.title} 보유 여부</span>
                          <div className="mt-3 inline-grid w-fit grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1">
                            {YES_NO_OPTIONS.map((option) => {
                              const active = form[heldKey] === option
                              return (
                                <button
                                  key={option}
                                  type="button"
                                  disabled={readOnly}
                                  className={segmentedToggleClass(active, readOnly)}
                                  onClick={() =>
                                    setForm((prev) => ({
                                      ...prev,
                                      [heldKey]: prev[heldKey] === option ? "" : option,
                                    }))
                                  }
                                >
                                  {option}
                                </button>
                              )
                            })}
                          </div>
                        </label>
                        <div className="mt-5 grid gap-3">
                          <label className="text-xs text-slate-500">
                            {group.title} 확보 금액
                            <InputSuffix suffix="원" disabled={form[heldKey] !== "예"}>
                              <input
                                className={inputClass(invalid(amountKey), "mt-0")}
                                placeholder={group.amountPlaceholder}
                                inputMode="numeric"
                                value={form[amountKey]}
                                disabled={readOnly || form[heldKey] !== "예"}
                                onChange={(e) =>
                                  setForm((prev) => ({
                                    ...prev,
                                    [amountKey]: formatNumberInput(e.target.value),
                                  }))
                                }
                                onBlur={() => touch(amountKey)}
                              />
                            </InputSuffix>
                          </label>
                          <label className="text-xs text-slate-500">
                            {group.title} 소진율
                            <InputSuffix suffix="%" disabled={form[heldKey] !== "예"}>
                              <input
                                className={inputClass(invalid(usageKey), "mt-0")}
                                placeholder={group.usagePlaceholder}
                                inputMode="numeric"
                                value={form[usageKey]}
                                disabled={readOnly || form[heldKey] !== "예"}
                                onChange={(e) =>
                                  setForm((prev) => ({
                                    ...prev,
                                    [usageKey]: formatNumberInput(e.target.value),
                                  }))
                                }
                                onBlur={() => touch(usageKey)}
                              />
                            </InputSuffix>
                          </label>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </section>
          ) : null}

          <section
            ref={(element) => {
              companySectionRefs.current.funding = element
            }}
            className="space-y-4"
          >
            <div className="text-sm font-semibold text-slate-700">투자희망</div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="grid gap-3 md:grid-cols-4">
                <label className="text-xs text-slate-500 md:col-span-2 md:max-w-md">
                  2026년 내 희망 투자액
                  <InputSuffix suffix="원">
                    <input
                      className={inputClass(invalid("desiredInvestment2026"), "mt-0")}
                      placeholder="예: 2,050,000,000"
                      inputMode="numeric"
                      value={form.desiredInvestment2026}
                      disabled={readOnly}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          desiredInvestment2026: formatNumberInput(e.target.value),
                        }))
                      }
                      onBlur={() => touch("desiredInvestment2026")}
                    />
                  </InputSuffix>
                </label>
                <label className="text-xs text-slate-500 md:col-span-2 md:max-w-md">
                  투자전 희망기업가치 (Pre-Value)
                  <InputSuffix suffix="원">
                    <input
                      className={inputClass(invalid("desiredPreValue"), "mt-0")}
                      placeholder="예: 20,000,000,000"
                      inputMode="numeric"
                      value={form.desiredPreValue}
                      disabled={readOnly}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          desiredPreValue: formatNumberInput(e.target.value),
                        }))
                      }
                      onBlur={() => touch("desiredPreValue")}
                    />
                  </InputSuffix>
                </label>
              </div>
              <div className="mt-3">
                <label className="text-xs text-slate-500">
                  MYSC에 가장 기대하는 점
                  <input
                    className={inputClass(invalid("myscExpectation"))}
                    maxLength={MYSC_EXPECTATION_MAX_LENGTH}
                    placeholder="MYSC에 기대하는 점을 입력하세요"
                    value={form.myscExpectation}
                    disabled={readOnly}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, myscExpectation: e.target.value }))
                    }
                    onBlur={() => touch("myscExpectation")}
                  />
                  <div className="mt-1 text-[11px] text-slate-400">
                    {myscExpectationLength}/{MYSC_EXPECTATION_MAX_LENGTH}자
                  </div>
                </label>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
