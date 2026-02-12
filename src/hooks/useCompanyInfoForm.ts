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

type SaveType = "draft" | "final"

const FIELD_LABELS: Record<keyof CompanyInfoForm, string> = {
  companyInfo: "기업정보",
  ceoName: "대표자 성명",
  ceoEmail: "대표자 이메일",
  ceoPhone: "대표자 전화번호",
  foundedAt: "법인 설립일자",
  businessNumber: "사업자등록번호",
  primaryBusiness: "주업태",
  primaryIndustry: "주업종",
  headOffice: "본점 소재지",
  branchOffice: "지점 또는 연구소 소재지",
  workforceFullTime: "종업원수 (정규)",
  workforceContract: "종업원수 (계약)",
  revenue2025: "매출액 (2025년)",
  revenue2026: "매출액 (2026년)",
  capitalTotal: "자본총계",
  certification: "인증/지정 여부",
  tipsLipsHistory: "TIPS/LIPS 이력",
  desiredInvestment2026: "2026년 내 희망 투자액",
  desiredPreValue: "투자전 희망기업가치",
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
  const sanitized = value.replace(/[^\d.]/g, "")
  if (!sanitized) return ""

  const firstDotIndex = sanitized.indexOf(".")
  const hasDot = firstDotIndex >= 0
  const compact = hasDot
    ? `${sanitized.slice(0, firstDotIndex)}.${sanitized
        .slice(firstDotIndex + 1)
        .replace(/\./g, "")}`
    : sanitized
  const [rawInteger = "", rawDecimal = ""] = compact.split(".")
  const integerDigits = rawInteger.replace(/[^\d]/g, "")
  const decimalDigits = rawDecimal.replace(/[^\d]/g, "").slice(0, 1)

  let integerValue = integerDigits
  if (!integerValue && hasDot) {
    integerValue = "0"
  }
  const normalizedInteger =
    integerValue.length > 1 ? integerValue.replace(/^0+(?=\d)/, "") : integerValue
  const formattedInteger = normalizedInteger
    ? normalizedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    : ""

  if (!hasDot) return formattedInteger
  return `${formattedInteger || "0"}.${decimalDigits}`
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

export function useCompanyInfoForm(companyId: string) {
  const [form, setForm] = useState<CompanyInfoForm>(DEFAULT_FORM)
  const [savedForm, setSavedForm] = useState<CompanyInfoForm>(DEFAULT_FORM)
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

  const requiredKeys = useMemo<(keyof CompanyInfoForm)[]>(
    () => [
      "companyInfo",
      "ceoName",
      "ceoEmail",
      "ceoPhone",
      "foundedAt",
      "businessNumber",
      "primaryBusiness",
      "primaryIndustry",
      "headOffice",
      "workforceFullTime",
      "workforceContract",
      "revenue2025",
      "revenue2026",
      "capitalTotal",
      "certification",
      "tipsLipsHistory",
      "desiredInvestment2026",
      "desiredPreValue",
    ],
    []
  )

  const missingRequiredFields = useMemo(
    () => requiredKeys.filter((key) => !isFilled(form[key] ?? "")),
    [requiredKeys, form]
  )

  const invalidRequiredFields = useMemo(
    () =>
      requiredKeys.filter((key) => {
        const value = form[key] ?? ""
        if (!isFilled(value)) return false
        if (key === "ceoEmail") return !isEmail(value)
        if (key === "ceoPhone") return !isPhone(value)
        if (key === "businessNumber") return !isBusinessNumber(value)
        return false
      }),
    [requiredKeys, form]
  )

  const missingRequired = missingRequiredFields.length
  const invalidRequired = invalidRequiredFields.length
  const canSubmit = missingRequired === 0 && invalidRequired === 0

  useEffect(() => {
    let mounted = true
    async function loadCompanyInfo() {
      setLoading(true)
      try {
        const ref = doc(db, "companies", companyId, "companyInfo", "info")
        const snapshot = await getDoc(ref)
        if (!mounted) return
        if (!snapshot.exists()) {
          setLoading(false)
          return
        }
        const data = snapshot.data() as CompanyInfoRecord
        setHasSavedData(true)
        setHasFinalSavedData(data.metadata?.saveType !== "draft")
        const nextForm: CompanyInfoForm = {
          companyInfo: data.basic?.companyInfo ?? "",
          ceoName: data.basic?.ceo?.name ?? "",
          ceoEmail: data.basic?.ceo?.email ?? "",
          ceoPhone: formatPhoneNumber(data.basic?.ceo?.phone ?? ""),
          foundedAt: data.basic?.foundedAt ?? "",
          businessNumber: formatBusinessNumber(data.basic?.businessNumber ?? ""),
          primaryBusiness: data.basic?.primaryBusiness ?? "",
          primaryIndustry: data.basic?.primaryIndustry ?? "",
          headOffice: data.locations?.headOffice ?? "",
          branchOffice: data.locations?.branchOrLab ?? "",
          workforceFullTime: formatNumber(data.workforce?.fullTime),
          workforceContract: formatNumber(data.workforce?.contract),
          revenue2025: formatNumber(data.finance?.revenue?.y2025),
          revenue2026: formatNumber(data.finance?.revenue?.y2026),
          capitalTotal: formatNumber(data.finance?.capitalTotal),
          certification: data.certifications?.designation ?? "",
          tipsLipsHistory: data.certifications?.tipsLipsHistory ?? "",
          desiredInvestment2026: formatNumber(
            data.fundingPlan?.desiredAmount2026
          ),
          desiredPreValue: formatNumber(data.fundingPlan?.preValue),
        }
        setForm(nextForm)
        setSavedForm(nextForm)
        const nextInvestments = (data.investments ?? []).map((row) => ({
          stage: row.stage ?? "",
          date: row.date ?? "",
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
    setInvestmentRows((prev) => [
      ...prev,
      {
        stage: "",
        date: "",
        postMoney: "",
        majorShareholder: "",
      },
    ])
  }

  function removeInvestmentRow(target: number) {
    setInvestmentRows((prev) => {
      if (prev.length <= 1) {
        return prev
      }
      return prev.filter((_, index) => index !== target)
    })
  }

  function updateInvestmentRow(
    index: number,
    field: keyof InvestmentInput,
    value: string
  ) {
    setInvestmentRows((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row
      )
    )
  }

  function buildCompanyInfo(saveType: SaveType): CompanyInfoRecord {
    const companyInfo: CompanyInfoRecord = {
      basic: {
        companyInfo: form.companyInfo,
        ceo: {
          name: form.ceoName,
          email: form.ceoEmail,
          phone: form.ceoPhone,
        },
        foundedAt: form.foundedAt,
        businessNumber: form.businessNumber,
        primaryBusiness: form.primaryBusiness,
        primaryIndustry: form.primaryIndustry,
      },
      locations: {
        headOffice: form.headOffice,
        branchOrLab: form.branchOffice,
      },
      workforce: {
        fullTime: toNumber(form.workforceFullTime),
        contract: toNumber(form.workforceContract),
      },
      finance: {
        revenue: {
          y2025: toDecimalNumber(form.revenue2025),
          y2026: toDecimalNumber(form.revenue2026),
        },
        capitalTotal: toNumber(form.capitalTotal),
      },
      certifications: {
        designation: form.certification,
        tipsLipsHistory: form.tipsLipsHistory,
      },
      investments: investmentRows.map((row) => ({
        stage: row.stage,
        date: row.date,
        postMoney: toNumber(row.postMoney),
        majorShareholder: row.majorShareholder,
      })),
      fundingPlan: {
        desiredAmount2026: toNumber(form.desiredInvestment2026),
        preValue: toNumber(form.desiredPreValue),
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
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
      setSavedForm(form)
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
    missingRequiredLabels: missingRequiredFields.map((field) => FIELD_LABELS[field]),
    invalidRequiredLabels: invalidRequiredFields.map((field) => FIELD_LABELS[field]),
    hasSavedData,
    hasFinalSavedData,
    savedInvestmentRows,
    formatNumberInput,
    formatRevenueInput,
    formatBusinessNumber,
    markTouched: (field: keyof CompanyInfoForm) =>
      setTouched((prev) => ({ ...prev, [field]: true })),
    isFieldInvalid: (field: keyof CompanyInfoForm) => {
      if (!touched[field]) return false
      const value = form[field] ?? ""
      if (!isFilled(value)) return true
      if (field === "ceoEmail") return !isEmail(value)
      if (field === "ceoPhone") return !isPhone(value)
      if (field === "businessNumber") return !isBusinessNumber(value)
      return false
    },
    isFieldValid: (field: keyof CompanyInfoForm) => {
      const value = form[field] ?? ""
      if (!isFilled(value)) return false
      if (field === "ceoEmail") return isEmail(value)
      if (field === "ceoPhone") return isPhone(value)
      if (field === "businessNumber") return isBusinessNumber(value)
      return true
    },
    isSavedFieldValid: (field: keyof CompanyInfoForm) => {
      const value = savedForm[field] ?? ""
      if (!isFilled(value)) return false
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
