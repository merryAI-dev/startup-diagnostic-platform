import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore"
import { useEffect, useMemo, useState } from "react"
import { db } from "@/firebase/client"
import type {
  CompanyInfoForm,
  CompanyInfoRecord,
  InvestmentInput,
} from "@/types/company"
import { DEFAULT_FORM } from "@/types/company"

const DEFAULT_INVESTMENTS: InvestmentInput[] = [
  {
    stage: "",
    date: "",
    postMoney: "",
    majorShareholder: "",
  },
]

const CORPORATE_ONLY_FIELDS: (keyof CompanyInfoForm)[] = [
  "foundedAt",
  "businessNumber",
  "website",
  "primaryBusiness",
  "primaryIndustry",
  "headOffice",
  "branchOffice",
  "targetCountries",
  "workforceFullTime",
  "workforceContract",
  "revenue2025",
  "revenue2026",
  "capitalTotal",
  "certification",
  "tipsLipsHistory",
  "exportVoucherHeld",
  "exportVoucherAmount",
  "exportVoucherUsageRate",
  "innovationVoucherHeld",
  "innovationVoucherAmount",
  "innovationVoucherUsageRate",
]

const CO_REPRESENTATIVE_FIELDS: (keyof CompanyInfoForm)[] = [
  "coRepresentativeName",
  "coRepresentativeBirthDate",
  "coRepresentativeGender",
  "coRepresentativeTitle",
]

const EXPORT_VOUCHER_DETAIL_FIELDS: (keyof CompanyInfoForm)[] = [
  "exportVoucherAmount",
  "exportVoucherUsageRate",
]

const INNOVATION_VOUCHER_DETAIL_FIELDS: (keyof CompanyInfoForm)[] = [
  "innovationVoucherAmount",
  "innovationVoucherUsageRate",
]

const MIN_LENGTH_RULES: Partial<Record<keyof CompanyInfoForm, number>> = {
  representativeSolution: 20,
}

type SaveType = "draft" | "final"

const FIELD_LABELS: Record<keyof CompanyInfoForm, string> = {
  companyType: "기업 형태",
  companyInfo: "기업정보",
  representativeSolution: "대표 솔루션",
  sdgPriority1: "UN SDGs 우선순위 1위",
  sdgPriority2: "UN SDGs 우선순위 2위",
  ceoName: "대표자 성명",
  ceoEmail: "대표자 이메일",
  ceoPhone: "대표자 전화번호",
  ceoAge: "대표자 나이",
  ceoGender: "대표자 성별",
  ceoNationality: "대표자 국적",
  hasCoRepresentative: "공동대표 여부",
  coRepresentativeName: "공동대표 성명",
  coRepresentativeBirthDate: "공동대표 생년월일",
  coRepresentativeGender: "공동대표 성별",
  coRepresentativeTitle: "공동대표 직책",
  founderSerialNumber: "이전 창업 횟수",
  website: "회사 홈페이지",
  foundedAt: "법인 설립일자",
  businessNumber: "사업자등록번호",
  primaryBusiness: "주업태",
  primaryIndustry: "주업종",
  headOffice: "본점 소재지",
  branchOffice: "지점 또는 연구소 소재지",
  targetCountries: "해외 지사 또는 진출 희망국가",
  workforceFullTime: "종업원수 (정규)",
  workforceContract: "종업원수 (계약)",
  revenue2025: "매출액 (2025년, 원)",
  revenue2026: "매출액 (2026년, 원)",
  capitalTotal: "자본총계 (원)",
  certification: "인증/지정 여부",
  tipsLipsHistory: "TIPS/LIPS 이력",
  exportVoucherHeld: "수출바우처 보유 여부",
  exportVoucherAmount: "수출바우처 확보 금액 (원)",
  exportVoucherUsageRate: "수출바우처 소진율 (%)",
  innovationVoucherHeld: "중소기업혁신바우처 보유 여부",
  innovationVoucherAmount: "중소기업혁신바우처 확보 금액 (원)",
  innovationVoucherUsageRate: "중소기업혁신바우처 소진율 (%)",
  myscExpectation: "MYSC에 가장 기대하는 점",
  desiredInvestment2026: "2026년 내 희망 투자액 (원)",
  desiredPreValue: "투자전 희망기업가치 (Pre-Value, 원)",
}

function formatNumber(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return ""
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

function formatNumberInput(value: string) {
  const digits = value.replace(/[^\d]/g, "")
  if (!digits) return ""
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

function formatRevenueInput(value: string) {
  return formatNumberInput(value)
}

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

function toIsoDate(value: string) {
  const digits = sanitizeInvestmentDateDigits(value)
  if (digits.length !== 8) return value.trim()
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
}

function toNumber(value: string) {
  const digits = value.replace(/[^\d]/g, "")
  if (!digits) return null
  return Number(digits)
}

function toDecimalNumber(value: string) {
  const normalized = value.replace(/,/g, "").trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  if (Number.isNaN(parsed)) return null
  return Math.round(parsed * 10) / 10
}

function formatBusinessNumber(value: string) {
  const digits = value.replace(/[^\d]/g, "").slice(0, 10)
  const parts = [] as string[]
  if (digits.length > 0) {
    parts.push(digits.slice(0, 3))
  }
  if (digits.length > 3) {
    parts.push(digits.slice(3, 5))
  }
  if (digits.length > 5) {
    parts.push(digits.slice(5, 10))
  }
  return parts.join("-")
}

function formatPhoneNumber(value: string) {
  const digits = value.replace(/[^\d]/g, "").slice(0, 11)
  if (digits.length < 4) return digits
  if (digits.length < 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`
  }
  if (digits.length < 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

function isFilled(value: string) {
  return value.trim().length > 0
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isPhone(value: string) {
  return /^\d{2,3}-\d{3,4}-\d{4}$/.test(value)
}

function isBusinessNumber(value: string) {
  return /^\d{3}-\d{2}-\d{5}$/.test(value)
}

function hasNumber(value: string) {
  return value.replace(/[^\d]/g, "").length > 0
}

function meetsMinLength(field: keyof CompanyInfoForm, value: string) {
  const minLength = MIN_LENGTH_RULES[field]
  if (!minLength) return true
  return value.trim().length >= minLength
}

function normalizeInvestmentStageValue(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .join(", ")
  }
  if (typeof value === "string") {
    return value.trim()
  }
  return ""
}

function toTargetCountries(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3)
}

export function useCompanyInfoForm(companyId: string) {
  const [form, setForm] = useState<CompanyInfoForm>(DEFAULT_FORM)
  const [savedForm, setSavedForm] = useState<CompanyInfoForm>(DEFAULT_FORM)
  const [companyProgramIds, setCompanyProgramIds] = useState<string[]>([])
  const [savedCompanyProgramIds, setSavedCompanyProgramIds] = useState<string[]>([])
  const [investmentRows, setInvestmentRows] = useState<InvestmentInput[]>(
    DEFAULT_INVESTMENTS
  )
  const [savedInvestmentRows, setSavedInvestmentRows] = useState<
    InvestmentInput[]
  >(DEFAULT_INVESTMENTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [hasSavedData, setHasSavedData] = useState(false)
  const [hasFinalSavedData, setHasFinalSavedData] = useState(false)
  const [touched, setTouched] = useState<
    Partial<Record<keyof CompanyInfoForm, boolean>>
  >({})

  const isPreStartup = form.companyType === "예비창업"
  const corporateRequiredKeys = useMemo<(keyof CompanyInfoForm)[]>(
    () =>
      isPreStartup
        ? []
        : [
            "foundedAt",
            "businessNumber",
            "website",
            "primaryBusiness",
            "primaryIndustry",
            "headOffice",
            "branchOffice",
            "targetCountries",
            "workforceFullTime",
            "workforceContract",
            "revenue2025",
            "revenue2026",
            "capitalTotal",
            "certification",
            "tipsLipsHistory",
            "exportVoucherHeld",
            "innovationVoucherHeld",
          ],
    [isPreStartup]
  )
  const coRepresentativeRequiredKeys = useMemo<(keyof CompanyInfoForm)[]>(
    () =>
      form.hasCoRepresentative === "예"
        ? CO_REPRESENTATIVE_FIELDS
        : [],
    [form.hasCoRepresentative]
  )
  const exportVoucherRequiredKeys = useMemo<(keyof CompanyInfoForm)[]>(
    () =>
      !isPreStartup && form.exportVoucherHeld === "예"
        ? EXPORT_VOUCHER_DETAIL_FIELDS
        : [],
    [form.exportVoucherHeld, isPreStartup]
  )
  const innovationVoucherRequiredKeys = useMemo<(keyof CompanyInfoForm)[]>(
    () =>
      !isPreStartup && form.innovationVoucherHeld === "예"
        ? INNOVATION_VOUCHER_DETAIL_FIELDS
        : [],
    [form.innovationVoucherHeld, isPreStartup]
  )
  const requiredKeys = useMemo<(keyof CompanyInfoForm)[]>(
    () => [
      "companyType",
      "companyInfo",
      "representativeSolution",
      "sdgPriority2",
      "ceoName",
      "ceoEmail",
      "ceoPhone",
      "ceoAge",
      "ceoGender",
      "ceoNationality",
      "hasCoRepresentative",
      "founderSerialNumber",
      "sdgPriority1",
      "desiredInvestment2026",
      "desiredPreValue",
      "myscExpectation",
      ...corporateRequiredKeys,
      ...coRepresentativeRequiredKeys,
      ...exportVoucherRequiredKeys,
      ...innovationVoucherRequiredKeys,
    ],
    [
      coRepresentativeRequiredKeys,
      corporateRequiredKeys,
      exportVoucherRequiredKeys,
      innovationVoucherRequiredKeys,
    ]
  )

  function shouldSkipFieldValidation(
    targetForm: CompanyInfoForm,
    field: keyof CompanyInfoForm
  ) {
    if (
      targetForm.companyType === "예비창업"
      && CORPORATE_ONLY_FIELDS.includes(field)
    ) {
      return true
    }
    if (
      targetForm.hasCoRepresentative !== "예"
      && CO_REPRESENTATIVE_FIELDS.includes(field)
    ) {
      return true
    }
    if (
      targetForm.exportVoucherHeld !== "예"
      && EXPORT_VOUCHER_DETAIL_FIELDS.includes(field)
    ) {
      return true
    }
    if (
      targetForm.innovationVoucherHeld !== "예"
      && INNOVATION_VOUCHER_DETAIL_FIELDS.includes(field)
    ) {
      return true
    }
    return false
  }

  const investmentRowsComplete = useMemo(() => {
    if (isPreStartup) return true
    if (investmentRows.length === 0) return true

    return investmentRows.every(
      (row) =>
        isFilled(row.stage)
        && isFilled(row.date)
        && hasNumber(row.postMoney)
        && isFilled(row.majorShareholder)
    )
  }, [investmentRows, isPreStartup])

  const missingRequiredFields = useMemo(
    () => requiredKeys.filter((key) => !isFilled(form[key] ?? "")),
    [requiredKeys, form]
  )

  const invalidRequiredFields = useMemo(
    () =>
      requiredKeys.filter((key) => {
        const value = form[key] ?? ""
        if (!isFilled(value)) return false
        if (!meetsMinLength(key, value)) return true
        if (key === "ceoEmail") return !isEmail(value)
        if (key === "ceoPhone") return !isPhone(value)
        if (key === "businessNumber") return !isBusinessNumber(value)
        return false
      }),
    [requiredKeys, form]
  )

  const missingRequired = missingRequiredFields.length
  const investmentRowsNeedInput = investmentRows.length > 0 && !investmentRowsComplete
  const invalidRequired = invalidRequiredFields.length + (investmentRowsNeedInput ? 1 : 0)
  const canSubmit = missingRequired === 0 && invalidRequired === 0

  useEffect(() => {
    let mounted = true
    async function loadCompanyInfo() {
      setLoading(true)
      try {
        const companyRef = doc(db, "companies", companyId)
        const ref = doc(db, "companies", companyId, "companyInfo", "info")
        const [companySnapshot, snapshot] = await Promise.all([
          getDoc(companyRef),
          getDoc(ref),
        ])
        if (!mounted) return

        const programs = Array.isArray(companySnapshot.data()?.programs)
          ? companySnapshot
              .data()!
              .programs.filter((value: unknown): value is string => typeof value === "string")
          : []
        setCompanyProgramIds(programs)
        setSavedCompanyProgramIds(programs)

        if (!snapshot.exists()) {
          setLoading(false)
          return
        }
        const data = snapshot.data() as CompanyInfoRecord
        setHasSavedData(true)
        setHasFinalSavedData(data.metadata?.saveType !== "draft")
        const nextForm: CompanyInfoForm = {
          companyType: data.basic?.companyType ?? "법인",
          companyInfo: data.basic?.companyInfo ?? "",
          representativeSolution: data.basic?.representativeSolution ?? "",
          sdgPriority1: data.impact?.sdgPriority1 ?? "",
          sdgPriority2: data.impact?.sdgPriority2 ?? "",
          ceoName: data.basic?.ceo?.name ?? "",
          ceoEmail: data.basic?.ceo?.email ?? "",
          ceoPhone: formatPhoneNumber(data.basic?.ceo?.phone ?? ""),
          ceoAge:
            data.basic?.ceo?.age != null ? String(data.basic.ceo.age) : "",
          ceoGender: data.basic?.ceo?.gender ?? "",
          ceoNationality: data.basic?.ceo?.nationality ?? "",
          hasCoRepresentative:
            data.basic?.ceo?.coRepresentative?.enabled === true ? "예" : "아니요",
          coRepresentativeName:
            data.basic?.ceo?.coRepresentative?.name ?? "",
          coRepresentativeBirthDate:
            data.basic?.ceo?.coRepresentative?.birthDate ?? "",
          coRepresentativeGender:
            data.basic?.ceo?.coRepresentative?.gender ?? "",
          coRepresentativeTitle:
            data.basic?.ceo?.coRepresentative?.title ?? "",
          founderSerialNumber:
            data.basic?.founderSerialNumber != null
              ? String(data.basic.founderSerialNumber)
              : "",
          website: data.basic?.website ?? "",
          foundedAt: data.basic?.foundedAt ?? "",
          businessNumber: formatBusinessNumber(data.basic?.businessNumber ?? ""),
          primaryBusiness: data.basic?.primaryBusiness ?? "",
          primaryIndustry: data.basic?.primaryIndustry ?? "",
          headOffice: data.locations?.headOffice ?? "",
          branchOffice: data.locations?.branchOrLab ?? "",
          targetCountries: (data.globalExpansion?.targetCountries ?? []).join(", "),
          workforceFullTime: formatNumber(data.workforce?.fullTime),
          workforceContract: formatNumber(data.workforce?.contract),
          revenue2025: formatNumber(data.finance?.revenue?.y2025),
          revenue2026: formatNumber(data.finance?.revenue?.y2026),
          capitalTotal: formatNumber(data.finance?.capitalTotal),
          certification: data.certifications?.designation ?? "",
          tipsLipsHistory: data.certifications?.tipsLipsHistory ?? "",
          exportVoucherHeld: data.vouchers?.exportVoucherHeld ?? "",
          exportVoucherAmount: data.vouchers?.exportVoucherAmount ?? "",
          exportVoucherUsageRate: data.vouchers?.exportVoucherUsageRate ?? "",
          innovationVoucherHeld: data.vouchers?.innovationVoucherHeld ?? "",
          innovationVoucherAmount: data.vouchers?.innovationVoucherAmount ?? "",
          innovationVoucherUsageRate: data.vouchers?.innovationVoucherUsageRate ?? "",
          myscExpectation: data.impact?.myscExpectation ?? "",
          desiredInvestment2026: formatNumber(
            data.fundingPlan?.desiredAmount2026
          ),
          desiredPreValue: formatNumber(data.fundingPlan?.preValue),
        }
        setForm(nextForm)
        setSavedForm(nextForm)
        const nextInvestments = (data.investments ?? []).map((row) => ({
          stage: normalizeInvestmentStageValue(row.stage),
          date: formatInvestmentDateInput(row.date ?? ""),
          postMoney: formatNumber(row.postMoney),
          majorShareholder: row.majorShareholder ?? "",
        }))
        setInvestmentRows(
          nextInvestments.length ? nextInvestments : DEFAULT_INVESTMENTS
        )
        setSavedInvestmentRows(
          nextInvestments.length ? nextInvestments : DEFAULT_INVESTMENTS
        )
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }
    loadCompanyInfo()
    return () => {
      mounted = false
    }
  }, [companyId])

  function addInvestmentRow() {
    setInvestmentRows((prev) => {
      if (prev.length >= 3) return prev
      return [
        ...prev,
        {
          stage: "",
          date: "",
          postMoney: "",
          majorShareholder: "",
        },
      ]
    })
  }

  function removeInvestmentRow(target: number) {
    setInvestmentRows((prev) => {
      return prev.filter((_, index) => index !== target)
    })
  }

  function updateInvestmentRow(
    index: number,
    field: keyof InvestmentInput,
    value: string
  ) {
    const nextValue =
      field === "postMoney"
        ? formatRevenueInput(value)
        : field === "date"
          ? formatInvestmentDateInput(value)
          : value
    setInvestmentRows((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: nextValue } : row
      )
    )
  }

  function buildCompanyInfo(saveType: SaveType): CompanyInfoRecord {
    const hasCoRepresentative = form.hasCoRepresentative === "예"
    const isCorporate = form.companyType !== "예비창업"
    const companyInfo: CompanyInfoRecord = {
      basic: {
        companyType: form.companyType,
        companyInfo: form.companyInfo,
        representativeSolution: form.representativeSolution,
        ceo: {
          name: form.ceoName,
          email: form.ceoEmail,
          phone: form.ceoPhone,
          age: toNumber(form.ceoAge),
          gender: form.ceoGender,
          nationality: form.ceoNationality,
          coRepresentative: {
            enabled: hasCoRepresentative,
            name: hasCoRepresentative ? form.coRepresentativeName : "",
            birthDate: hasCoRepresentative ? form.coRepresentativeBirthDate : "",
            gender: hasCoRepresentative ? form.coRepresentativeGender : "",
            title: hasCoRepresentative ? form.coRepresentativeTitle : "",
          },
        },
        founderSerialNumber: toNumber(form.founderSerialNumber),
        website: form.website,
        foundedAt: isCorporate ? form.foundedAt : "",
        businessNumber: isCorporate ? form.businessNumber : "",
        primaryBusiness: isCorporate ? form.primaryBusiness : "",
        primaryIndustry: isCorporate ? form.primaryIndustry : "",
      },
      locations: {
        headOffice: isCorporate ? form.headOffice : "",
        branchOrLab: isCorporate ? form.branchOffice : "",
      },
      workforce: {
        fullTime: isCorporate ? toNumber(form.workforceFullTime) : null,
        contract: isCorporate ? toNumber(form.workforceContract) : null,
      },
      finance: {
        revenue: {
          y2025: isCorporate ? toDecimalNumber(form.revenue2025) : null,
          y2026: isCorporate ? toDecimalNumber(form.revenue2026) : null,
        },
        capitalTotal: isCorporate ? toNumber(form.capitalTotal) : null,
      },
      certifications: {
        designation: isCorporate ? form.certification : "",
        tipsLipsHistory: isCorporate ? form.tipsLipsHistory : "",
      },
      impact: {
        sdgPriority1: form.sdgPriority1,
        sdgPriority2: form.sdgPriority2,
        myscExpectation: form.myscExpectation,
      },
      globalExpansion: {
        targetCountries: toTargetCountries(form.targetCountries),
      },
      investments: isCorporate
        ? investmentRows.map((row) => ({
            stage: normalizeInvestmentStageValue(row.stage),
            date: toIsoDate(row.date),
            postMoney: toDecimalNumber(row.postMoney),
            majorShareholder: row.majorShareholder,
          }))
        : [],
      vouchers: {
        exportVoucherHeld: isCorporate ? form.exportVoucherHeld : "",
        exportVoucherAmount: isCorporate ? form.exportVoucherAmount : "",
        exportVoucherUsageRate: isCorporate ? form.exportVoucherUsageRate : "",
        innovationVoucherHeld: isCorporate ? form.innovationVoucherHeld : "",
        innovationVoucherAmount: isCorporate ? form.innovationVoucherAmount : "",
        innovationVoucherUsageRate: isCorporate ? form.innovationVoucherUsageRate : "",
      },
      fundingPlan: {
        desiredAmount2026: toDecimalNumber(form.desiredInvestment2026),
        preValue: toDecimalNumber(form.desiredPreValue),
      },
      metadata: {
        updatedAt: serverTimestamp(),
        saveType,
      },
    }
    return companyInfo
  }

  async function saveCompanyInfoByType(saveType: SaveType) {
    setSaveStatus(null)
    setSaving(true)
    const companyInfo = buildCompanyInfo(saveType)
    try {
      const ref = doc(db, "companies", companyId, "companyInfo", "info")
      await setDoc(
        ref,
        {
          ...companyInfo,
          metadata: {
            ...companyInfo.metadata,
            createdAt: serverTimestamp(),
          },
        },
        { merge: true }
      )
      await setDoc(
        doc(db, "companies", companyId),
        {
          name: companyInfo.basic.companyInfo || null,
          programs: companyProgramIds,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
      setSavedForm(form)
      setSavedCompanyProgramIds(companyProgramIds)
      setSavedInvestmentRows(investmentRows)
      setHasSavedData(true)
      if (saveType === "final") {
        setHasFinalSavedData(true)
        setSaveStatus("저장 완료")
      } else {
        setSaveStatus("임시저장 완료")
      }
      return true
    } catch (err) {
      if (saveType === "final") {
        setSaveStatus("저장에 실패했습니다.")
      } else {
        setSaveStatus("임시저장에 실패했습니다.")
      }
      return false
    } finally {
      setSaving(false)
    }
  }

  async function saveCompanyInfo() {
    return saveCompanyInfoByType("final")
  }

  async function saveCompanyInfoDraft() {
    return saveCompanyInfoByType("draft")
  }

  return {
    form,
    setForm,
    companyProgramIds,
    setCompanyProgramIds,
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
    missingRequiredLabels: [
      ...missingRequiredFields.map((field) => FIELD_LABELS[field]),
    ],
    invalidRequiredLabels: [
      ...invalidRequiredFields.map((field) => FIELD_LABELS[field]),
      ...(investmentRowsNeedInput ? ["투자이력"] : []),
    ],
    hasSavedData,
    hasFinalSavedData,
    savedCompanyProgramIds,
    savedInvestmentRows,
    formatNumberInput,
    formatRevenueInput,
    formatBusinessNumber,
    markTouched: (field: keyof CompanyInfoForm) =>
      setTouched((prev) => ({ ...prev, [field]: true })),
    isFieldInvalid: (field: keyof CompanyInfoForm) => {
      if (shouldSkipFieldValidation(form, field)) {
        return false
      }
      if (!touched[field]) return false
      const value = form[field] ?? ""
      if (!isFilled(value)) return true
      if (!meetsMinLength(field, value)) return true
      if (field === "ceoEmail") return !isEmail(value)
      if (field === "ceoPhone") return !isPhone(value)
      if (field === "businessNumber") return !isBusinessNumber(value)
      return false
    },
    isFieldValid: (field: keyof CompanyInfoForm) => {
      if (shouldSkipFieldValidation(form, field)) {
        return true
      }
      const value = form[field] ?? ""
      if (!isFilled(value)) return false
      if (!meetsMinLength(field, value)) return false
      if (field === "ceoEmail") return isEmail(value)
      if (field === "ceoPhone") return isPhone(value)
      if (field === "businessNumber") return isBusinessNumber(value)
      return true
    },
    isSavedFieldValid: (field: keyof CompanyInfoForm) => {
      if (shouldSkipFieldValidation(savedForm, field)) {
        return true
      }
      const value = savedForm[field] ?? ""
      if (!isFilled(value)) return false
      if (!meetsMinLength(field, value)) return false
      if (field === "ceoEmail") return isEmail(value)
      if (field === "ceoPhone") return isPhone(value)
      if (field === "businessNumber") return isBusinessNumber(value)
      return true
    },
    formatPhoneNumber,
    saveCompanyInfo,
    saveCompanyInfoDraft,
  }
}
