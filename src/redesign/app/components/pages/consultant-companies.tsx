import {
  Fragment,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react"
import { Building2, ChevronDown, Loader2, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import type { CompanyDirectoryItem } from "@/redesign/app/lib/types"
import type { CompanyInfoForm, CompanyInfoRecord, InvestmentInput } from "@/types/company"
import { CompanyInfoEditorPanel } from "@/components/dashboard/CompanyInfoEditorPanel"
import {
  getExactCompanyNameMatches,
  getSimilarCompanyNameMatches,
  normalizeCompanyName,
} from "@/redesign/app/lib/company-name"
import { Badge } from "@/redesign/app/components/ui/badge"
import { Button } from "@/redesign/app/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/redesign/app/components/ui/dialog"
import { Input } from "@/redesign/app/components/ui/input"
import { Label } from "@/redesign/app/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/redesign/app/components/ui/table"

type ManualCompanyDraft = {
  name: string
  companyType: string
  representativeSolution: string
  sdgPriority1: string
  sdgPriority2: string
  ceoName: string
  ceoEmail: string
  ceoPhone: string
  ceoAge: string
  ceoGender: string
  ceoNationality: string
  hasCoRepresentative: string
  coRepresentativeName: string
  coRepresentativeBirthDate: string
  coRepresentativeGender: string
  coRepresentativeTitle: string
  founderSerialNumber: string
  website: string
  foundedAt: string
  businessNumber: string
  primaryBusiness: string
  primaryIndustry: string
  headOffice: string
  branchOffice: string
  targetCountries: string
  workforceFullTime: string
  workforceContract: string
  revenue2025: string
  revenue2026: string
  capitalTotal: string
  investmentRows: InvestmentInput[]
  certification: string
  tipsLipsHistory: string
  exportVoucherHeld: string
  exportVoucherAmount: string
  exportVoucherUsageRate: string
  innovationVoucherHeld: string
  innovationVoucherAmount: string
  innovationVoucherUsageRate: string
  myscExpectation: string
  desiredInvestment2026: string
  desiredPreValue: string
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

interface ConsultantCompaniesPageProps {
  companies: CompanyDirectoryItem[]
  currentUserId?: string | null
  saving?: boolean
  onCreateManualCompany: (data: {
    name: string
    normalizedName: string
    companyInfo: CompanyInfoRecord
  }) => Promise<boolean>
  onUpdateManualCompany: (
    companyId: string,
    data: {
      name?: string
      normalizedName?: string
      active?: boolean
      companyInfo?: CompanyInfoRecord
    },
  ) => Promise<boolean>
  onDeactivateManualCompany: (companyId: string) => Promise<boolean>
  onLoadCompanyInfo: (companyId: string) => Promise<CompanyInfoRecord | null>
}

const emptyDraft: ManualCompanyDraft = {
  name: "",
  companyType: "법인",
  representativeSolution: "",
  sdgPriority1: "",
  sdgPriority2: "",
  ceoName: "",
  ceoEmail: "",
  ceoPhone: "",
  ceoAge: "",
  ceoGender: "",
  ceoNationality: "",
  hasCoRepresentative: "",
  coRepresentativeName: "",
  coRepresentativeBirthDate: "",
  coRepresentativeGender: "",
  coRepresentativeTitle: "",
  founderSerialNumber: "",
  website: "",
  foundedAt: "",
  businessNumber: "",
  primaryBusiness: "",
  primaryIndustry: "",
  headOffice: "",
  branchOffice: "",
  targetCountries: "",
  workforceFullTime: "",
  workforceContract: "",
  revenue2025: "",
  revenue2026: "",
  capitalTotal: "",
  investmentRows: [],
  certification: "",
  tipsLipsHistory: "",
  exportVoucherHeld: "",
  exportVoucherAmount: "",
  exportVoucherUsageRate: "",
  innovationVoucherHeld: "",
  innovationVoucherAmount: "",
  innovationVoucherUsageRate: "",
  myscExpectation: "",
  desiredInvestment2026: "",
  desiredPreValue: "",
}

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
const GENDER_OPTIONS = ["남", "여"] as const
const YES_NO_OPTIONS = ["예", "아니요"] as const
const COMPANY_TYPE_OPTIONS = ["예비창업", "법인"] as const
const SDG_SECONDARY_OPTIONS = [...SDG_OPTIONS, "없음"] as const

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"

const fieldClassByKey: Partial<Record<keyof ManualCompanyDraft, string>> = {
  representativeSolution: "md:col-span-2",
  sdgPriority1: "md:col-span-2",
  sdgPriority2: "md:col-span-2",
  website: "md:col-span-2",
  targetCountries: "md:col-span-2",
  headOffice: "md:col-span-3",
  branchOffice: "md:col-span-3",
  myscExpectation: "md:col-span-2",
}

const fieldSuffixByKey: Partial<Record<keyof ManualCompanyDraft, string>> = {
  ceoAge: "세",
  founderSerialNumber: "회",
  workforceFullTime: "명",
  workforceContract: "명",
  revenue2025: "원",
  revenue2026: "원",
  capitalTotal: "원",
  exportVoucherAmount: "원",
  exportVoucherUsageRate: "%",
  innovationVoucherAmount: "원",
  innovationVoucherUsageRate: "%",
  desiredInvestment2026: "원",
  desiredPreValue: "원",
}

const companyInfoFields: Array<{
  key: keyof ManualCompanyDraft
  label: string
  placeholder?: string
  type?: "text" | "date" | "select"
  options?: readonly string[]
}> = [
  { key: "representativeSolution", label: "대표 솔루션 한 줄 소개" },
  { key: "sdgPriority1", label: "UN SDGs 우선순위 1위", type: "select", options: SDG_OPTIONS },
  {
    key: "sdgPriority2",
    label: "UN SDGs 우선순위 2위",
    type: "select",
    options: SDG_SECONDARY_OPTIONS,
  },
  { key: "website", label: "웹사이트" },
  { key: "foundedAt", label: "법인 설립일자", type: "date" },
  { key: "businessNumber", label: "사업자등록번호" },
  { key: "primaryBusiness", label: "주업태" },
  { key: "primaryIndustry", label: "주업종" },
  { key: "targetCountries", label: "해외 지사 또는 진출 희망국가", placeholder: "쉼표로 구분" },
  { key: "headOffice", label: "본점 소재지" },
  { key: "branchOffice", label: "지점 또는 연구소 소재지" },
  { key: "workforceFullTime", label: "종업원수 (정규)" },
  { key: "workforceContract", label: "종업원수 (계약)" },
  { key: "ceoName", label: "대표자 성명" },
  { key: "ceoEmail", label: "대표자 이메일" },
  { key: "ceoPhone", label: "대표자 전화번호" },
  { key: "ceoAge", label: "대표자 나이" },
  { key: "ceoGender", label: "대표자 성별", type: "select", options: GENDER_OPTIONS },
  { key: "ceoNationality", label: "대표자 국적" },
  { key: "hasCoRepresentative", label: "공동대표 여부", type: "select", options: YES_NO_OPTIONS },
  { key: "coRepresentativeName", label: "공동대표 성명" },
  { key: "coRepresentativeBirthDate", label: "공동대표 생년월일", type: "date" },
  {
    key: "coRepresentativeGender",
    label: "공동대표 성별",
    type: "select",
    options: GENDER_OPTIONS,
  },
  { key: "coRepresentativeTitle", label: "공동대표 직책" },
  { key: "founderSerialNumber", label: "이전 창업 횟수" },
  { key: "revenue2025", label: "매출액 (2025년, 원)" },
  { key: "revenue2026", label: "매출액 (2026년, 원)" },
  { key: "capitalTotal", label: "자본총계 (원)" },
  { key: "certification", label: "인증/지정 여부", type: "select", options: CERTIFICATION_OPTIONS },
  { key: "tipsLipsHistory", label: "TIPS/LIPS 이력", type: "select", options: TIPS_LIPS_OPTIONS },
  {
    key: "exportVoucherHeld",
    label: "수출바우처 보유 여부",
    type: "select",
    options: YES_NO_OPTIONS,
  },
  { key: "exportVoucherAmount", label: "수출바우처 확보 금액 (원)" },
  { key: "exportVoucherUsageRate", label: "수출바우처 소진율 (%)" },
  {
    key: "innovationVoucherHeld",
    label: "중소기업혁신바우처 보유 여부",
    type: "select",
    options: YES_NO_OPTIONS,
  },
  { key: "innovationVoucherAmount", label: "중소기업혁신바우처 확보 금액 (원)" },
  { key: "innovationVoucherUsageRate", label: "중소기업혁신바우처 소진율 (%)" },
  { key: "desiredInvestment2026", label: "2026년 내 희망 투자액 (원)" },
  { key: "desiredPreValue", label: "투자전 희망기업가치 (Pre-Value, 원)" },
  { key: "myscExpectation", label: "MYSC 기대사항" },
]

const companyInfoFieldByKey = new Map(companyInfoFields.map((field) => [field.key, field]))

const corporateOnlyFieldKeys = new Set<keyof ManualCompanyDraft>([
  "foundedAt",
  "businessNumber",
  "primaryBusiness",
  "primaryIndustry",
  "headOffice",
  "branchOffice",
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
])

const companyInfoSections: Array<{
  key: string
  label: string
  description: string
  corporateOnly?: boolean
  fieldKeys: Array<keyof ManualCompanyDraft>
}> = [
  {
    key: "company-service",
    label: "회사/서비스",
    description: "기업명, 사업 내용, 소재지를 입력합니다.",
    fieldKeys: [
      "representativeSolution",
      "sdgPriority1",
      "sdgPriority2",
      "website",
      "foundedAt",
      "businessNumber",
      "primaryBusiness",
      "primaryIndustry",
      "targetCountries",
      "headOffice",
      "branchOffice",
      "workforceFullTime",
      "workforceContract",
    ],
  },
  {
    key: "representative",
    label: "대표자",
    description: "대표자와 공동대표 정보를 입력합니다.",
    fieldKeys: [
      "ceoName",
      "ceoAge",
      "ceoEmail",
      "ceoPhone",
      "ceoGender",
      "ceoNationality",
      "hasCoRepresentative",
      "coRepresentativeName",
      "coRepresentativeBirthDate",
      "coRepresentativeGender",
      "coRepresentativeTitle",
      "founderSerialNumber",
    ],
  },
  {
    key: "finance",
    label: "재무/투자",
    description: "매출, 자본, 투자이력을 입력합니다.",
    corporateOnly: true,
    fieldKeys: ["revenue2025", "revenue2026", "capitalTotal"],
  },
  {
    key: "certification-voucher",
    label: "인증 및 바우처",
    description: "인증, TIPS/LIPS, 바우처 정보를 입력합니다.",
    corporateOnly: true,
    fieldKeys: [
      "certification",
      "tipsLipsHistory",
      "exportVoucherHeld",
      "exportVoucherAmount",
      "exportVoucherUsageRate",
      "innovationVoucherHeld",
      "innovationVoucherAmount",
      "innovationVoucherUsageRate",
    ],
  },
  {
    key: "funding",
    label: "투자희망",
    description: "희망 투자액과 MYSC 기대사항을 입력합니다.",
    fieldKeys: ["desiredInvestment2026", "desiredPreValue", "myscExpectation"],
  },
]

function createEmptyDraft() {
  return {
    ...emptyDraft,
    investmentRows: [],
  }
}

function toNumber(value: string) {
  const normalized = value.replace(/,/g, "").trim()
  if (!normalized) return null
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

function numberToString(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : ""
}

function toTargetCountries(value: string) {
  return value
    .split(/[,;\n]/u)
    .map((item) => item.trim())
    .filter(Boolean)
}

function buildCompanyInfoRecord(draft: ManualCompanyDraft): CompanyInfoRecord {
  const hasCoRepresentative = draft.hasCoRepresentative === "예"
  const isCorporate = draft.companyType !== "예비창업"
  return {
    basic: {
      companyType: draft.companyType,
      companyInfo: draft.name.trim(),
      representativeSolution: draft.representativeSolution.trim(),
      ceo: {
        name: draft.ceoName.trim(),
        email: draft.ceoEmail.trim(),
        phone: draft.ceoPhone.trim(),
        age: toNumber(draft.ceoAge),
        gender: draft.ceoGender.trim(),
        nationality: draft.ceoNationality.trim(),
        coRepresentative: {
          enabled: hasCoRepresentative,
          name: hasCoRepresentative ? draft.coRepresentativeName.trim() : "",
          birthDate: hasCoRepresentative ? draft.coRepresentativeBirthDate.trim() : "",
          gender: hasCoRepresentative ? draft.coRepresentativeGender.trim() : "",
          title: hasCoRepresentative ? draft.coRepresentativeTitle.trim() : "",
        },
      },
      founderSerialNumber: toNumber(draft.founderSerialNumber),
      website: draft.website.trim(),
      foundedAt: isCorporate ? draft.foundedAt.trim() : "",
      businessNumber: isCorporate ? draft.businessNumber.trim() : "",
      primaryBusiness: isCorporate ? draft.primaryBusiness.trim() : "",
      primaryIndustry: isCorporate ? draft.primaryIndustry.trim() : "",
    },
    locations: {
      headOffice: isCorporate ? draft.headOffice.trim() : "",
      branchOrLab: isCorporate ? draft.branchOffice.trim() : "",
    },
    workforce: {
      fullTime: isCorporate ? toNumber(draft.workforceFullTime) : null,
      contract: isCorporate ? toNumber(draft.workforceContract) : null,
    },
    finance: {
      revenue: {
        y2025: isCorporate ? toNumber(draft.revenue2025) : null,
        y2026: isCorporate ? toNumber(draft.revenue2026) : null,
      },
      capitalTotal: isCorporate ? toNumber(draft.capitalTotal) : null,
    },
    certifications: {
      designation: isCorporate ? draft.certification.trim() : "",
      tipsLipsHistory: isCorporate ? draft.tipsLipsHistory.trim() : "",
    },
    impact: {
      sdgPriority1: draft.sdgPriority1.trim(),
      sdgPriority2: draft.sdgPriority2.trim(),
      myscExpectation: draft.myscExpectation.trim(),
    },
    globalExpansion: {
      targetCountries: toTargetCountries(draft.targetCountries),
    },
    investments: isCorporate
      ? draft.investmentRows
          .filter(
            (row) =>
              row.stage.trim() ||
              row.date.trim() ||
              row.postMoney.trim() ||
              row.majorShareholder.trim(),
          )
          .map((row) => ({
            stage: row.stage.trim(),
            date: row.date.trim(),
            postMoney: toNumber(row.postMoney),
            majorShareholder: row.majorShareholder.trim(),
          }))
      : [],
    vouchers: {
      exportVoucherHeld: isCorporate ? draft.exportVoucherHeld.trim() : "",
      exportVoucherAmount: isCorporate ? draft.exportVoucherAmount.trim() : "",
      exportVoucherUsageRate: isCorporate ? draft.exportVoucherUsageRate.trim() : "",
      innovationVoucherHeld: isCorporate ? draft.innovationVoucherHeld.trim() : "",
      innovationVoucherAmount: isCorporate ? draft.innovationVoucherAmount.trim() : "",
      innovationVoucherUsageRate: isCorporate ? draft.innovationVoucherUsageRate.trim() : "",
    },
    fundingPlan: {
      desiredAmount2026: toNumber(draft.desiredInvestment2026),
      preValue: toNumber(draft.desiredPreValue),
    },
    metadata: {
      saveType: "draft",
    },
  }
}

function draftToCompanyInfoForm(draft: ManualCompanyDraft): CompanyInfoForm {
  return {
    companyType: draft.companyType,
    companyInfo: draft.name,
    representativeSolution: draft.representativeSolution,
    sdgPriority1: draft.sdgPriority1,
    sdgPriority2: draft.sdgPriority2,
    ceoName: draft.ceoName,
    ceoEmail: draft.ceoEmail,
    ceoPhone: draft.ceoPhone,
    ceoAge: draft.ceoAge,
    ceoGender: draft.ceoGender,
    ceoNationality: draft.ceoNationality,
    hasCoRepresentative: draft.hasCoRepresentative,
    coRepresentativeName: draft.coRepresentativeName,
    coRepresentativeBirthDate: draft.coRepresentativeBirthDate,
    coRepresentativeGender: draft.coRepresentativeGender,
    coRepresentativeTitle: draft.coRepresentativeTitle,
    founderSerialNumber: draft.founderSerialNumber,
    website: draft.website,
    foundedAt: draft.foundedAt,
    businessNumber: draft.businessNumber,
    primaryBusiness: draft.primaryBusiness,
    primaryIndustry: draft.primaryIndustry,
    headOffice: draft.headOffice,
    branchOffice: draft.branchOffice,
    targetCountries: draft.targetCountries,
    workforceFullTime: draft.workforceFullTime,
    workforceContract: draft.workforceContract,
    revenue2025: draft.revenue2025,
    revenue2026: draft.revenue2026,
    capitalTotal: draft.capitalTotal,
    certification: draft.certification,
    tipsLipsHistory: draft.tipsLipsHistory,
    exportVoucherHeld: draft.exportVoucherHeld,
    exportVoucherAmount: draft.exportVoucherAmount,
    exportVoucherUsageRate: draft.exportVoucherUsageRate,
    innovationVoucherHeld: draft.innovationVoucherHeld,
    innovationVoucherAmount: draft.innovationVoucherAmount,
    innovationVoucherUsageRate: draft.innovationVoucherUsageRate,
    myscExpectation: draft.myscExpectation,
    desiredInvestment2026: draft.desiredInvestment2026,
    desiredPreValue: draft.desiredPreValue,
  }
}

function applyCompanyInfoFormToDraft(
  previousDraft: ManualCompanyDraft,
  form: CompanyInfoForm,
): ManualCompanyDraft {
  return {
    ...previousDraft,
    name: form.companyInfo,
    companyType: form.companyType,
    representativeSolution: form.representativeSolution,
    sdgPriority1: form.sdgPriority1,
    sdgPriority2: form.sdgPriority2,
    ceoName: form.ceoName,
    ceoEmail: form.ceoEmail,
    ceoPhone: form.ceoPhone,
    ceoAge: form.ceoAge,
    ceoGender: form.ceoGender,
    ceoNationality: form.ceoNationality,
    hasCoRepresentative: form.hasCoRepresentative,
    coRepresentativeName: form.coRepresentativeName,
    coRepresentativeBirthDate: form.coRepresentativeBirthDate,
    coRepresentativeGender: form.coRepresentativeGender,
    coRepresentativeTitle: form.coRepresentativeTitle,
    founderSerialNumber: form.founderSerialNumber,
    website: form.website,
    foundedAt: form.foundedAt,
    businessNumber: form.businessNumber,
    primaryBusiness: form.primaryBusiness,
    primaryIndustry: form.primaryIndustry,
    headOffice: form.headOffice,
    branchOffice: form.branchOffice,
    targetCountries: form.targetCountries,
    workforceFullTime: form.workforceFullTime,
    workforceContract: form.workforceContract,
    revenue2025: form.revenue2025,
    revenue2026: form.revenue2026,
    capitalTotal: form.capitalTotal,
    certification: form.certification,
    tipsLipsHistory: form.tipsLipsHistory,
    exportVoucherHeld: form.exportVoucherHeld,
    exportVoucherAmount: form.exportVoucherAmount,
    exportVoucherUsageRate: form.exportVoucherUsageRate,
    innovationVoucherHeld: form.innovationVoucherHeld,
    innovationVoucherAmount: form.innovationVoucherAmount,
    innovationVoucherUsageRate: form.innovationVoucherUsageRate,
    myscExpectation: form.myscExpectation,
    desiredInvestment2026: form.desiredInvestment2026,
    desiredPreValue: form.desiredPreValue,
  }
}

function makeDraftFormSetter(
  setDraft: Dispatch<SetStateAction<ManualCompanyDraft>>,
): Dispatch<SetStateAction<CompanyInfoForm>> {
  return (update) => {
    setDraft((previousDraft) => {
      const previousForm = draftToCompanyInfoForm(previousDraft)
      const nextForm = typeof update === "function" ? update(previousForm) : update
      return applyCompanyInfoFormToDraft(previousDraft, nextForm)
    })
  }
}

function buildDraftFromCompanyInfo(
  company: CompanyDirectoryItem,
  info: CompanyInfoRecord | null,
): ManualCompanyDraft {
  if (!info) {
    return {
      ...createEmptyDraft(),
      name: company.name,
    }
  }
  const coRepresentative = info.basic?.ceo?.coRepresentative
  return {
    ...createEmptyDraft(),
    name: info.basic?.companyInfo?.trim() || company.name,
    companyType: info.basic?.companyType || "법인",
    representativeSolution: info.basic?.representativeSolution || "",
    sdgPriority1: info.impact?.sdgPriority1 || "",
    sdgPriority2: info.impact?.sdgPriority2 || "",
    ceoName: info.basic?.ceo?.name || "",
    ceoEmail: info.basic?.ceo?.email || "",
    ceoPhone: info.basic?.ceo?.phone || "",
    ceoAge: numberToString(info.basic?.ceo?.age),
    ceoGender: info.basic?.ceo?.gender || "",
    ceoNationality: info.basic?.ceo?.nationality || "",
    hasCoRepresentative: coRepresentative?.enabled ? "예" : coRepresentative ? "아니요" : "",
    coRepresentativeName: coRepresentative?.name || "",
    coRepresentativeBirthDate: coRepresentative?.birthDate || "",
    coRepresentativeGender: coRepresentative?.gender || "",
    coRepresentativeTitle: coRepresentative?.title || "",
    founderSerialNumber: numberToString(info.basic?.founderSerialNumber),
    website: info.basic?.website || "",
    foundedAt: info.basic?.foundedAt || "",
    businessNumber: info.basic?.businessNumber || "",
    primaryBusiness: info.basic?.primaryBusiness || "",
    primaryIndustry: info.basic?.primaryIndustry || "",
    headOffice: info.locations?.headOffice || "",
    branchOffice: info.locations?.branchOrLab || "",
    targetCountries: Array.isArray(info.globalExpansion?.targetCountries)
      ? info.globalExpansion.targetCountries.join(", ")
      : "",
    workforceFullTime: numberToString(info.workforce?.fullTime),
    workforceContract: numberToString(info.workforce?.contract),
    revenue2025: numberToString(info.finance?.revenue?.y2025),
    revenue2026: numberToString(info.finance?.revenue?.y2026),
    capitalTotal: numberToString(info.finance?.capitalTotal),
    investmentRows: (info.investments ?? []).map((row) => ({
      stage: row.stage || "",
      date: row.date || "",
      postMoney: numberToString(row.postMoney),
      majorShareholder: row.majorShareholder || "",
    })),
    certification: info.certifications?.designation || "",
    tipsLipsHistory: info.certifications?.tipsLipsHistory || "",
    exportVoucherHeld: info.vouchers?.exportVoucherHeld || "",
    exportVoucherAmount: info.vouchers?.exportVoucherAmount || "",
    exportVoucherUsageRate: info.vouchers?.exportVoucherUsageRate || "",
    innovationVoucherHeld: info.vouchers?.innovationVoucherHeld || "",
    innovationVoucherAmount: info.vouchers?.innovationVoucherAmount || "",
    innovationVoucherUsageRate: info.vouchers?.innovationVoucherUsageRate || "",
    myscExpectation: info.impact?.myscExpectation || "",
    desiredInvestment2026: numberToString(info.fundingPlan?.desiredAmount2026),
    desiredPreValue: numberToString(info.fundingPlan?.preValue),
  }
}

function isSignupCompany(company: CompanyDirectoryItem) {
  return !!company.ownerUid
}

function getCompanyTypeLabel(company: CompanyDirectoryItem) {
  if (isSignupCompany(company)) return "회원가입 기업"
  return "컨설턴트 등록기업"
}

function getCompanyTypeBadgeClassName(company: CompanyDirectoryItem) {
  if (isSignupCompany(company)) return "bg-blue-100 text-blue-700"
  return "bg-emerald-100 text-emerald-700"
}

function canManageManualCompany(company: CompanyDirectoryItem, currentUserId?: string | null) {
  return (
    company.source === "consultant_manual" &&
    !company.ownerUid &&
    !!currentUserId &&
    company.createdByUid === currentUserId
  )
}

function CompanyNameWarnings({
  exactMatches,
  similarMatches,
}: {
  exactMatches: CompanyDirectoryItem[]
  similarMatches: CompanyDirectoryItem[]
}) {
  if (exactMatches.length === 0 && similarMatches.length === 0) return null
  return (
    <div className="absolute left-0 right-0 top-full z-30 mt-1">
      {exactMatches.length > 0 ? (
        <div className="rounded-lg border border-rose-200 bg-white p-3 text-sm shadow-lg">
          <p className="font-medium text-rose-700">이미 등록된 기업입니다.</p>
          <div className="mt-2 divide-y">
            {exactMatches.slice(0, 3).map((company) => (
              <div key={company.id} className="py-2 text-slate-900">
                {company.name}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-white p-3 text-sm shadow-lg">
          <p className="font-medium text-amber-800">유사한 기업이 있습니다.</p>
          <div className="mt-2 divide-y">
            {similarMatches.map((company) => (
              <div key={company.id} className="py-2 text-slate-900">
                {company.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DraftField({
  draft,
  setDraft,
  fieldKey,
  prefix,
  readOnly,
  onAddressSearch,
}: {
  draft: ManualCompanyDraft
  setDraft: Dispatch<SetStateAction<ManualCompanyDraft>>
  fieldKey: keyof ManualCompanyDraft
  prefix: string
  readOnly?: boolean
  onAddressSearch?: (field: AddressFieldKey) => void
}) {
  const field = companyInfoFieldByKey.get(fieldKey)
  if (!field) return null
  const id = `${prefix}-${field.key}`
  const value = draft[field.key]
  const suffix = fieldSuffixByKey[field.key]
  if (typeof value !== "string") return null

  if (field.key === "headOffice" || field.key === "branchOffice") {
    const addressField = field.key
    return (
      <label
        className={`text-xs text-slate-500 ${fieldClassByKey[field.key] ?? "md:col-span-2"}`}
        htmlFor={id}
      >
        <div className="flex items-center justify-between gap-2">
          <span>
            {field.label} <span className="text-[11px] text-slate-400">(법인등기부등본 기준)</span>
          </span>
          <button
            type="button"
            disabled={readOnly}
            onClick={() => onAddressSearch?.(addressField)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            주소 검색
          </button>
        </div>
        <div className="relative">
          <input
            id={id}
            value={value}
            disabled={readOnly}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                [field.key]: event.target.value,
              }))
            }
            placeholder={field.key === "headOffice" ? "서울시 강남구 ..." : "없으면 '없음' 입력"}
            className={`${inputClass} pr-8`}
          />
          {value.trim().length > 0 && !readOnly ? (
            <button
              type="button"
              onClick={() =>
                setDraft((prev) => ({
                  ...prev,
                  [field.key]: "",
                }))
              }
              className="absolute right-2 top-1/2 -translate-y-1/2 px-1 py-0.5 text-[10px] font-semibold text-slate-400 hover:text-slate-700"
              aria-label={`${field.label} 지우기`}
              title="지우기"
            >
              x
            </button>
          ) : null}
        </div>
      </label>
    )
  }

  return (
    <label
      className={`text-xs text-slate-500 ${fieldClassByKey[field.key] ?? "md:col-span-2"}`}
      htmlFor={id}
    >
      {field.label}
      {field.type === "select" ? (
        <div className="relative">
          <select
            id={id}
            value={value}
            disabled={readOnly}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                [field.key]: event.target.value,
              }))
            }
            className={`${inputClass} appearance-none pr-10`}
          >
            <option value="">선택</option>
            {field.options?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        </div>
      ) : suffix ? (
        <div className="relative">
          <input
            id={id}
            type={field.type === "date" ? "date" : "text"}
            value={value}
            disabled={readOnly}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                [field.key]: event.target.value,
              }))
            }
            placeholder={field.placeholder}
            className={`${inputClass} pr-10`}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
            {suffix}
          </span>
        </div>
      ) : (
        <input
          id={id}
          type={field.type === "date" ? "date" : "text"}
          value={value}
          disabled={readOnly}
          onChange={(event) =>
            setDraft((prev) => ({
              ...prev,
              [field.key]: event.target.value,
            }))
          }
          placeholder={field.placeholder}
          className={inputClass}
        />
      )}
    </label>
  )
}

export function ManualCompanyInfoForm({
  draft,
  setDraft,
  prefix,
  readOnly = false,
  nameWarnings,
}: {
  draft: ManualCompanyDraft
  setDraft: Dispatch<SetStateAction<ManualCompanyDraft>>
  prefix: string
  readOnly?: boolean
  nameWarnings?: ReactNode
}) {
  const isPreStartup = draft.companyType === "예비창업"
  const visibleSections = companyInfoSections.filter(
    (section) => !(isPreStartup && section.corporateOnly),
  )
  const coRepresentativeFieldKeys = new Set<keyof ManualCompanyDraft>([
    "coRepresentativeName",
    "coRepresentativeBirthDate",
    "coRepresentativeGender",
    "coRepresentativeTitle",
  ])
  const [activeSection, setActiveSection] = useState("company-service")
  const postcodeScriptLoadingRef = useRef(false)

  const addInvestmentRow = () => {
    setDraft((prev) => {
      if (prev.investmentRows.length >= 3) return prev
      return {
        ...prev,
        investmentRows: [
          ...prev.investmentRows,
          { stage: "", date: "", postMoney: "", majorShareholder: "" },
        ],
      }
    })
  }

  const updateInvestmentRow = (index: number, field: keyof InvestmentInput, value: string) => {
    setDraft((prev) => ({
      ...prev,
      investmentRows: prev.investmentRows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row,
      ),
    }))
  }

  const removeInvestmentRow = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      investmentRows: prev.investmentRows.filter((_, rowIndex) => rowIndex !== index),
    }))
  }

  const scrollToSection = (sectionKey: string) => {
    setActiveSection(sectionKey)
    document.getElementById(`${prefix}-section-${sectionKey}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    })
  }

  const openAddressSearchPopup = (targetField: AddressFieldKey) => {
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

        setDraft((prev) => ({
          ...prev,
          [targetField]: fullAddress,
        }))
      },
    })
    postcode.open()
  }

  const handleAddressSearchClick = (targetField: AddressFieldKey) => {
    if (typeof window === "undefined" || readOnly) return
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

  const renderVoucherGroup = ({
    title,
    heldKey,
    amountKey,
    usageRateKey,
    amountLabel,
    usageRateLabel,
    amountPlaceholder,
    usageRatePlaceholder,
  }: {
    title: string
    heldKey: "exportVoucherHeld" | "innovationVoucherHeld"
    amountKey: "exportVoucherAmount" | "innovationVoucherAmount"
    usageRateKey: "exportVoucherUsageRate" | "innovationVoucherUsageRate"
    amountLabel: string
    usageRateLabel: string
    amountPlaceholder: string
    usageRatePlaceholder: string
  }) => {
    const amountDisabled = readOnly || draft[heldKey] !== "예"
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <label className="text-xs text-slate-500">
          <span className="block">{title} 보유 여부</span>
          <div className="mt-3 inline-grid w-fit grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1">
            {YES_NO_OPTIONS.map((option) => {
              const active = draft[heldKey] === option
              return (
                <button
                  key={option}
                  type="button"
                  disabled={readOnly}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    active
                      ? "bg-slate-900 text-white shadow-sm"
                      : "bg-transparent text-slate-600 hover:bg-slate-50"
                  }`}
                  onClick={() =>
                    setDraft((prev) => ({
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
            {amountLabel}
            <div className="relative">
              <input
                className={`${inputClass} pr-10`}
                placeholder={amountPlaceholder}
                value={draft[amountKey]}
                disabled={amountDisabled}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    [amountKey]: event.target.value,
                  }))
                }
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                원
              </span>
            </div>
          </label>
          <label className="text-xs text-slate-500">
            {usageRateLabel}
            <div className="relative">
              <input
                className={`${inputClass} pr-10`}
                placeholder={usageRatePlaceholder}
                value={draft[usageRateKey]}
                disabled={amountDisabled}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    [usageRateKey]: event.target.value,
                  }))
                }
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                %
              </span>
            </div>
          </label>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 bg-[#f8fafc]">
      <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="text-sm font-semibold text-slate-900">기업 정보</div>
          <div className="mt-1 text-xs text-slate-500">필요한 값만 입력할 수 있습니다.</div>
        </div>
        <div className="border-b border-slate-100 px-4 py-4">
          <div className="text-xs font-semibold uppercase text-slate-400">기업 유형</div>
          <div className="mt-3 inline-grid w-fit grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
            {COMPANY_TYPE_OPTIONS.map((option) => {
              const active = draft.companyType === option
              return (
                <button
                  key={option}
                  type="button"
                  disabled={readOnly}
                  onClick={() => setDraft((prev) => ({ ...prev, companyType: option }))}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    active
                      ? "bg-slate-900 text-white shadow-sm"
                      : "bg-transparent text-slate-600 hover:bg-white"
                  }`}
                >
                  {option}
                </button>
              )
            })}
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {visibleSections.map((section) => {
            const active = activeSection === section.key
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => scrollToSection(section.key)}
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
                      active ? "bg-slate-100 text-slate-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    선택 입력
                  </span>
                </div>
                <div className={`mt-1 text-[11px] ${active ? "text-slate-600" : "text-slate-400"}`}>
                  {section.description}
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4 lg:px-8">
        <div className="mb-4 flex gap-2 overflow-x-auto lg:hidden">
          {visibleSections.map((section) => (
            <button
              key={section.key}
              type="button"
              onClick={() => scrollToSection(section.key)}
              className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
            >
              {section.label}
            </button>
          ))}
        </div>
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 lg:hidden">
          <div className="text-xs font-semibold uppercase text-slate-400">기업 유형</div>
          <div className="mt-3 inline-grid w-fit grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
            {COMPANY_TYPE_OPTIONS.map((option) => {
              const active = draft.companyType === option
              return (
                <button
                  key={option}
                  type="button"
                  disabled={readOnly}
                  onClick={() => setDraft((prev) => ({ ...prev, companyType: option }))}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    active
                      ? "bg-slate-900 text-white shadow-sm"
                      : "bg-transparent text-slate-600 hover:bg-white"
                  }`}
                >
                  {option}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-5">
          {visibleSections.map((section) => {
            const fieldKeys = section.fieldKeys.filter(
              (fieldKey) =>
                !(isPreStartup && corporateOnlyFieldKeys.has(fieldKey)) &&
                !(draft.hasCoRepresentative !== "예" && coRepresentativeFieldKeys.has(fieldKey)),
            )
            return (
              <section
                key={section.key}
                id={`${prefix}-section-${section.key}`}
                className="space-y-4 scroll-mt-4"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-700">{section.label}</div>
                  <div className="mt-1 text-xs text-slate-400">{section.description}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  {section.key === "certification-voucher" ? (
                    <>
                      <div className="grid gap-3 md:grid-cols-6">
                        {(
                          ["certification", "tipsLipsHistory"] as Array<keyof ManualCompanyDraft>
                        ).map((fieldKey) => (
                          <DraftField
                            key={fieldKey}
                            draft={draft}
                            setDraft={setDraft}
                            fieldKey={fieldKey}
                            prefix={prefix}
                            readOnly={readOnly}
                            onAddressSearch={handleAddressSearchClick}
                          />
                        ))}
                      </div>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        {renderVoucherGroup({
                          title: "수출바우처",
                          heldKey: "exportVoucherHeld",
                          amountKey: "exportVoucherAmount",
                          usageRateKey: "exportVoucherUsageRate",
                          amountLabel: "수출바우처 확보 금액",
                          usageRateLabel: "수출바우처 소진율",
                          amountPlaceholder: "예: 50,000,000",
                          usageRatePlaceholder: "예: 40",
                        })}
                        {renderVoucherGroup({
                          title: "중소기업혁신바우처",
                          heldKey: "innovationVoucherHeld",
                          amountKey: "innovationVoucherAmount",
                          usageRateKey: "innovationVoucherUsageRate",
                          amountLabel: "중소기업혁신바우처 확보 금액",
                          usageRateLabel: "중소기업혁신바우처 소진율",
                          amountPlaceholder: "예: 30,000,000",
                          usageRatePlaceholder: "예: 75",
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-6">
                      {section.key === "company-service" && (
                        <div className="relative text-xs text-slate-500 md:col-span-3">
                          <Label htmlFor={`${prefix}-name`} className="text-xs text-slate-500">
                            기업/팀명 *
                          </Label>
                          <Input
                            id={`${prefix}-name`}
                            value={draft.name}
                            disabled={readOnly}
                            onChange={(event) =>
                              setDraft((prev) => ({ ...prev, name: event.target.value }))
                            }
                            placeholder={
                              isPreStartup
                                ? "팀명 또는 창업 예정 기업명을 입력하세요"
                                : "법인등기부등본 기준 회사명을 입력하세요"
                            }
                            className="mt-1"
                          />
                          {nameWarnings}
                        </div>
                      )}
                      {fieldKeys.map((fieldKey) => (
                        <DraftField
                          key={fieldKey}
                          draft={draft}
                          setDraft={setDraft}
                          fieldKey={fieldKey}
                          prefix={prefix}
                          readOnly={readOnly}
                          onAddressSearch={handleAddressSearchClick}
                        />
                      ))}
                    </div>
                  )}

                  {section.key === "finance" && !isPreStartup ? (
                    <div className="mt-5 space-y-3 border-t border-slate-100 pt-5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold text-slate-600">투자이력</div>
                        {!readOnly && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={draft.investmentRows.length >= 3}
                            onClick={addInvestmentRow}
                          >
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            투자이력 추가
                          </Button>
                        )}
                      </div>
                      {draft.investmentRows.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                          등록된 투자이력이 없습니다.
                        </div>
                      ) : (
                        draft.investmentRows.map((row, index) => (
                          <div
                            key={`investment-${index}`}
                            className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4"
                          >
                            <label className="text-xs text-slate-500">
                              투자단계
                              <div className="relative">
                                <select
                                  value={row.stage}
                                  disabled={readOnly}
                                  onChange={(event) =>
                                    updateInvestmentRow(index, "stage", event.target.value)
                                  }
                                  className={`${inputClass} appearance-none pr-10`}
                                >
                                  <option value="">선택</option>
                                  {INVESTMENT_STAGE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                              </div>
                            </label>
                            <label className="text-xs text-slate-500">
                              투자유치시기
                              <input
                                className={inputClass}
                                value={row.date}
                                disabled={readOnly}
                                onChange={(event) =>
                                  updateInvestmentRow(index, "date", event.target.value)
                                }
                                placeholder="YYYY.MM.DD"
                              />
                            </label>
                            <label className="text-xs text-slate-500">
                              투자 유치금액
                              <input
                                className={inputClass}
                                value={row.postMoney}
                                disabled={readOnly}
                                onChange={(event) =>
                                  updateInvestmentRow(index, "postMoney", event.target.value)
                                }
                                placeholder="예: 100,000,000"
                              />
                            </label>
                            <div className="flex items-start gap-2">
                              <label className="min-w-0 flex-1 text-xs text-slate-500">
                                지분율 상위 3명 주주명
                                <input
                                  className={inputClass}
                                  value={row.majorShareholder}
                                  disabled={readOnly}
                                  onChange={(event) =>
                                    updateInvestmentRow(
                                      index,
                                      "majorShareholder",
                                      event.target.value,
                                    )
                                  }
                                />
                              </label>
                              {!readOnly && (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="mt-6 h-9 w-9 text-rose-600 hover:text-rose-700"
                                  onClick={() => removeInvestmentRow(index)}
                                  aria-label="투자이력 삭제"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

type DisplayField = {
  label: string
  value: string
  span?: "full"
}

function formatDraftValue(
  draft: ManualCompanyDraft,
  key: keyof ManualCompanyDraft,
  fallback = "-",
) {
  const value = draft[key]
  if (typeof value !== "string") return fallback
  const trimmed = value.trim()
  if (!trimmed) return fallback
  const suffix = fieldSuffixByKey[key]
  return suffix ? `${trimmed}${suffix}` : trimmed
}

function buildDisplayRows(fields: DisplayField[]) {
  const rows: DisplayField[][] = []
  let pending: DisplayField[] = []

  fields.forEach((field) => {
    if (field.span === "full") {
      if (pending.length > 0) {
        rows.push(pending)
        pending = []
      }
      rows.push([field])
      return
    }
    pending.push(field)
    if (pending.length === 2) {
      rows.push(pending)
      pending = []
    }
  })

  if (pending.length > 0) rows.push(pending)
  return rows
}

function InfoValueTable({ fields }: { fields: DisplayField[] }) {
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full table-fixed border-collapse bg-white text-sm">
        <colgroup>
          <col className="w-[120px]" />
          <col />
          <col className="w-[120px]" />
          <col />
        </colgroup>
        <tbody>
          {buildDisplayRows(fields).map((row, rowIndex) => {
            const firstField = row[0]
            if (!firstField) return null
            return (
              <tr
                key={`${firstField.label}-${rowIndex}`}
                className={rowIndex > 0 ? "border-t border-slate-100" : ""}
              >
                {row.length === 1 ? (
                  <>
                    <th className="bg-slate-50 px-3 py-2.5 text-left align-top text-[11px] font-medium text-slate-500">
                      {firstField.label}
                    </th>
                    <td
                      colSpan={3}
                      className={`break-words px-3 py-2.5 align-top text-sm font-semibold ${
                        firstField.value === "-" ? "text-slate-400" : "text-slate-800"
                      }`}
                      title={firstField.value}
                    >
                      {firstField.value}
                    </td>
                  </>
                ) : (
                  <>
                    {row.map((field) => (
                      <Fragment key={field.label}>
                        <th className="bg-slate-50 px-3 py-2.5 text-left align-top text-[11px] font-medium text-slate-500">
                          {field.label}
                        </th>
                        <td
                          className={`break-words px-3 py-2.5 align-top text-sm font-semibold ${
                            field.value === "-" ? "text-slate-400" : "text-slate-800"
                          }`}
                          title={field.value}
                        >
                          {field.value}
                        </td>
                      </Fragment>
                    ))}
                    {row.length === 1 ? null : null}
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function InfoGroupTable({ title, fields }: { title: string; fields: DisplayField[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
        {title}
      </div>
      <table className="w-full table-fixed border-collapse bg-white text-sm">
        <colgroup>
          <col className="w-[140px]" />
          <col />
        </colgroup>
        <tbody>
          {fields.map((field, index) => (
            <tr
              key={`${title}-${field.label}`}
              className={index > 0 ? "border-t border-slate-100" : ""}
            >
              <th className="bg-slate-50 px-3 py-2.5 text-left align-top text-[11px] font-medium text-slate-500">
                {field.label}
              </th>
              <td
                className={`break-words px-3 py-2.5 align-top text-sm font-semibold ${
                  field.value === "-" ? "text-slate-400" : "text-slate-800"
                }`}
              >
                {field.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function InfoSection({
  title,
  description,
  fields,
  groups,
  children,
}: {
  title: string
  description?: string
  fields?: DisplayField[]
  groups?: Array<{ title: string; fields: DisplayField[] }>
  children?: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div>
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        {description ? <div className="mt-1 text-xs text-slate-500">{description}</div> : null}
      </div>
      {fields && fields.length > 0 ? <InfoValueTable fields={fields} /> : null}
      {groups && groups.length > 0 ? (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {groups.map((group) => (
            <InfoGroupTable key={group.title} title={group.title} fields={group.fields} />
          ))}
        </div>
      ) : null}
      {children}
    </section>
  )
}

function ManualCompanyInfoView({
  company,
  draft,
}: {
  company: CompanyDirectoryItem
  draft: ManualCompanyDraft
}) {
  const isPreStartup = draft.companyType === "예비창업"
  const hasCoRepresentative = draft.hasCoRepresentative === "예"
  const companyName = draft.name.trim() || company.name

  const companyFields: DisplayField[] = [
    { label: "회사 유형", value: formatDraftValue(draft, "companyType") },
    { label: "회사명", value: companyName || "-" },
    {
      label: "대표 솔루션",
      value: formatDraftValue(draft, "representativeSolution"),
      span: "full",
    },
    { label: "웹사이트", value: formatDraftValue(draft, "website"), span: "full" },
    { label: "SDGs 1순위", value: formatDraftValue(draft, "sdgPriority1") },
    { label: "SDGs 2순위", value: formatDraftValue(draft, "sdgPriority2") },
    {
      label: "해외 진출 희망국가",
      value: formatDraftValue(draft, "targetCountries"),
      span: "full",
    },
  ]

  if (!isPreStartup) {
    companyFields.push(
      { label: "법인 설립일", value: formatDraftValue(draft, "foundedAt") },
      { label: "사업자등록번호", value: formatDraftValue(draft, "businessNumber") },
      { label: "주업태", value: formatDraftValue(draft, "primaryBusiness") },
      { label: "주업종", value: formatDraftValue(draft, "primaryIndustry") },
      { label: "본점 소재지", value: formatDraftValue(draft, "headOffice"), span: "full" },
      { label: "지점/연구소 소재지", value: formatDraftValue(draft, "branchOffice"), span: "full" },
      { label: "정규직", value: formatDraftValue(draft, "workforceFullTime") },
      { label: "계약직", value: formatDraftValue(draft, "workforceContract") },
    )
  }

  const representativeFields: DisplayField[] = [
    { label: "대표자", value: formatDraftValue(draft, "ceoName") },
    { label: "대표 이메일", value: formatDraftValue(draft, "ceoEmail") },
    { label: "대표 전화번호", value: formatDraftValue(draft, "ceoPhone") },
    { label: "대표 나이", value: formatDraftValue(draft, "ceoAge") },
    { label: "대표 성별", value: formatDraftValue(draft, "ceoGender") },
    { label: "대표 국적", value: formatDraftValue(draft, "ceoNationality") },
    { label: "공동대표 여부", value: formatDraftValue(draft, "hasCoRepresentative") },
    { label: "이전 창업 횟수", value: formatDraftValue(draft, "founderSerialNumber") },
  ]

  if (hasCoRepresentative) {
    representativeFields.push(
      { label: "공동대표 성명", value: formatDraftValue(draft, "coRepresentativeName") },
      { label: "공동대표 생년월일", value: formatDraftValue(draft, "coRepresentativeBirthDate") },
      { label: "공동대표 성별", value: formatDraftValue(draft, "coRepresentativeGender") },
      { label: "공동대표 직책", value: formatDraftValue(draft, "coRepresentativeTitle") },
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8fafc] px-6 py-5 lg:px-8">
      <div className="space-y-4">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(148,163,184,0.18),_transparent_42%),linear-gradient(135deg,_#ffffff_0%,_#f8fafc_55%,_#eef2ff_100%)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xl font-semibold tracking-[-0.02em] text-slate-900">
                {companyName}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                기업 기본 정보를 한 화면에서 확인합니다.
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className={getCompanyTypeBadgeClassName(company)}>
                  {getCompanyTypeLabel(company)}
                </Badge>
                <Badge
                  variant="secondary"
                  className={
                    company.active === false
                      ? "bg-slate-100 text-slate-600"
                      : "bg-emerald-100 text-emerald-700"
                  }
                >
                  {company.active === false ? "비활성" : "사용"}
                </Badge>
              </div>
            </div>
            <div className="min-w-[240px] rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
              <div className="flex flex-col gap-1.5 text-[11px] text-slate-500">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-slate-400">기업 유형</span>
                  <span className="text-right text-slate-700">
                    {formatDraftValue(draft, "companyType")}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-slate-400">등록 구분</span>
                  <span className="text-right text-slate-700">{getCompanyTypeLabel(company)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-slate-400">상태</span>
                  <span className="text-right text-slate-700">
                    {company.active === false ? "비활성" : "사용"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <InfoSection
          title="회사/서비스"
          description="기업명, 사업 내용, 소재지를 확인합니다."
          fields={companyFields}
        />

        <InfoSection
          title="대표자"
          description="대표자와 공동대표 정보를 확인합니다."
          fields={representativeFields}
        />

        {!isPreStartup ? (
          <InfoSection
            title="재무/투자"
            description="매출, 자본, 투자이력을 확인합니다."
            fields={[
              { label: "매출액(2025)", value: formatDraftValue(draft, "revenue2025") },
              { label: "매출액(2026)", value: formatDraftValue(draft, "revenue2026") },
              { label: "자본총계", value: formatDraftValue(draft, "capitalTotal") },
            ]}
          >
            <div className="mt-4">
              <div className="text-xs font-semibold text-slate-600">투자이력</div>
              {draft.investmentRows.length === 0 ? (
                <div className="mt-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                  입력된 투자 이력이 없습니다.
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  {draft.investmentRows.map((row, index) => (
                    <div
                      key={`${row.stage}-${index}`}
                      className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600"
                    >
                      <div className="font-semibold text-slate-700">
                        {row.stage.trim() || "단계 미입력"}
                      </div>
                      <div className="mt-1 grid gap-1 sm:grid-cols-3">
                        <span>일시: {row.date.trim() || "-"}</span>
                        <span>
                          금액: {row.postMoney.trim() ? `${row.postMoney.trim()}원` : "-"}
                        </span>
                        <span>주요주주: {row.majorShareholder.trim() || "-"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </InfoSection>
        ) : null}

        {!isPreStartup ? (
          <InfoSection
            title="인증 및 바우처"
            description="인증, TIPS/LIPS, 바우처 정보를 확인합니다."
            fields={[
              { label: "인증/지정 여부", value: formatDraftValue(draft, "certification") },
              { label: "TIPS/LIPS", value: formatDraftValue(draft, "tipsLipsHistory") },
            ]}
            groups={[
              {
                title: "수출바우처",
                fields: [
                  { label: "보유 여부", value: formatDraftValue(draft, "exportVoucherHeld") },
                  { label: "확보 금액", value: formatDraftValue(draft, "exportVoucherAmount") },
                  { label: "소진율", value: formatDraftValue(draft, "exportVoucherUsageRate") },
                ],
              },
              {
                title: "중소기업혁신바우처",
                fields: [
                  { label: "보유 여부", value: formatDraftValue(draft, "innovationVoucherHeld") },
                  { label: "확보 금액", value: formatDraftValue(draft, "innovationVoucherAmount") },
                  { label: "소진율", value: formatDraftValue(draft, "innovationVoucherUsageRate") },
                ],
              },
            ]}
          />
        ) : null}

        <InfoSection
          title="투자희망"
          description="희망 투자액과 MYSC 기대사항을 확인합니다."
          fields={[
            {
              label: "2026년 희망 투자액",
              value: formatDraftValue(draft, "desiredInvestment2026"),
            },
            { label: "투자전 희망 기업가치", value: formatDraftValue(draft, "desiredPreValue") },
            {
              label: "MYSC 기대사항",
              value: formatDraftValue(draft, "myscExpectation"),
              span: "full",
            },
          ]}
        />
      </div>
    </div>
  )
}

export function ConsultantCompaniesPage({
  companies,
  currentUserId,
  saving = false,
  onCreateManualCompany,
  onUpdateManualCompany,
  onDeactivateManualCompany,
  onLoadCompanyInfo,
}: ConsultantCompaniesPageProps) {
  const [query, setQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [draft, setDraft] = useState<ManualCompanyDraft>(createEmptyDraft)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [detailCompany, setDetailCompany] = useState<CompanyDirectoryItem | null>(null)
  const [detailDraft, setDetailDraft] = useState<ManualCompanyDraft>(createEmptyDraft)
  const [detailMode, setDetailMode] = useState<"view" | "edit">("view")
  const [detailLoading, setDetailLoading] = useState(false)
  const createForm = useMemo(() => draftToCompanyInfoForm(draft), [draft])
  const detailForm = useMemo(() => draftToCompanyInfoForm(detailDraft), [detailDraft])
  const setCreateForm = useMemo(() => makeDraftFormSetter(setDraft), [])
  const setDetailForm = useMemo(() => makeDraftFormSetter(setDetailDraft), [])

  const exactMatches = useMemo(
    () => getExactCompanyNameMatches(draft.name, companies),
    [companies, draft.name],
  )
  const similarMatches = useMemo(
    () =>
      getSimilarCompanyNameMatches(draft.name, companies)
        .filter((company) => !exactMatches.some((exact) => exact.id === company.id))
        .slice(0, 5),
    [companies, draft.name, exactMatches],
  )
  const detailExactMatches = useMemo(
    () => getExactCompanyNameMatches(detailDraft.name, companies, detailCompany?.id),
    [companies, detailCompany?.id, detailDraft.name],
  )
  const detailSimilarMatches = useMemo(
    () =>
      getSimilarCompanyNameMatches(detailDraft.name, companies)
        .filter((company) => company.id !== detailCompany?.id)
        .filter((company) => !detailExactMatches.some((exact) => exact.id === company.id))
        .slice(0, 5),
    [companies, detailCompany?.id, detailDraft.name, detailExactMatches],
  )

  const filteredCompanies = useMemo(() => {
    const normalizedQuery = normalizeCompanyName(query)
    return companies
      .filter((company) => {
        if (typeFilter === "all") return true
        if (typeFilter === "signup") return isSignupCompany(company)
        if (typeFilter === "consultant_manual") return !isSignupCompany(company)
        return true
      })
      .filter((company) => {
        if (!normalizedQuery) return true
        const normalizedName = company.normalizedName || normalizeCompanyName(company.name)
        const normalizedAliases = (company.aliases ?? []).map((alias) =>
          normalizeCompanyName(alias),
        )
        return (
          normalizedName.includes(normalizedQuery) ||
          normalizedQuery.includes(normalizedName) ||
          normalizedAliases.some(
            (alias) => alias.includes(normalizedQuery) || normalizedQuery.includes(alias),
          )
        )
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ko-KR"))
  }, [companies, query, typeFilter])

  const handleCreate = async () => {
    const name = draft.name.trim()
    const normalizedName = normalizeCompanyName(name)
    if (!name || !normalizedName) {
      toast.error("기업명을 입력해주세요.")
      return
    }
    if (exactMatches.length > 0) {
      toast.error("이미 등록된 기업입니다. 기존 기업을 선택해 사용해주세요.")
      return
    }

    const ok = await onCreateManualCompany({
      name,
      normalizedName,
      companyInfo: buildCompanyInfoRecord(draft),
    })
    if (!ok) return
    setDraft(createEmptyDraft())
    setIsCreateDialogOpen(false)
  }

  const openCompanyDetail = async (
    company: CompanyDirectoryItem,
    mode: "view" | "edit" = "view",
  ) => {
    setDetailCompany(company)
    setDetailDraft({
      ...createEmptyDraft(),
      name: company.name,
    })
    setDetailMode(mode)
    setDetailLoading(true)
    const info = await onLoadCompanyInfo(company.id)
    setDetailDraft(buildDraftFromCompanyInfo(company, info))
    setDetailLoading(false)
  }

  const handleSaveDetail = async () => {
    if (!detailCompany) return
    const name = detailDraft.name.trim()
    const normalizedName = normalizeCompanyName(name)
    if (!name || !normalizedName) {
      toast.error("기업명을 입력해주세요.")
      return
    }
    if (detailExactMatches.length > 0) {
      toast.error("이미 등록된 기업명입니다. 기존 기업을 사용해주세요.")
      return
    }

    const ok = await onUpdateManualCompany(detailCompany.id, {
      name,
      normalizedName,
      companyInfo: buildCompanyInfoRecord(detailDraft),
    })
    if (!ok) return
    setDetailMode("view")
  }

  const detailManageable = detailCompany
    ? canManageManualCompany(detailCompany, currentUserId)
    : false

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-gray-50">
      <div className="border-b bg-white px-6 py-5">
        <div className="mx-auto w-full max-w-7xl">
          <h1 className="text-2xl font-semibold text-slate-900">기업 등록</h1>
          <p className="mt-1 text-sm text-slate-500">
            회원가입 없이 진행되는 비정기 오피스아워 대상 기업을 등록합니다.
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 px-6 pb-8 pt-5">
        <div className="mx-auto w-full max-w-7xl">
          <section className="flex h-[calc(100vh-230px)] min-h-[440px] flex-col overflow-hidden rounded-lg border bg-white">
            <div className="shrink-0 border-b p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="font-semibold text-slate-900">기업 목록</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    행을 클릭하면 기업 정보를 확인할 수 있습니다.
                  </p>
                </div>
                <div className="flex flex-col gap-2 md:flex-row md:items-center">
                  <div className="relative md:w-44">
                    <select
                      value={typeFilter}
                      onChange={(event) => setTypeFilter(event.target.value)}
                      className="h-9 w-full appearance-none rounded-md border border-input bg-input-background px-3 py-1 pr-9 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
                    >
                      <option value="all">구분 전체</option>
                      <option value="signup">회원가입 기업</option>
                      <option value="consultant_manual">컨설턴트 등록기업</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="기업명 검색"
                    className="md:w-72"
                  />
                  <Button type="button" onClick={() => setIsCreateDialogOpen(true)}>
                    기업 등록
                  </Button>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {filteredCompanies.length === 0 ? (
                <div className="p-12 text-center text-sm text-slate-500">
                  <Building2 className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                  등록된 기업을 찾지 못했습니다.
                </div>
              ) : (
                <Table>
                  <TableHeader className="[&_tr]:sticky [&_tr]:top-0 [&_tr]:z-10 [&_tr]:bg-white">
                    <TableRow className="hover:bg-white">
                      <TableHead className="bg-white">기업명</TableHead>
                      <TableHead className="bg-white">구분</TableHead>
                      <TableHead className="bg-white">상태</TableHead>
                      <TableHead className="w-[120px] bg-white text-right">관리</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCompanies.map((company) => {
                      const manageable = canManageManualCompany(company, currentUserId)
                      return (
                        <TableRow
                          key={company.id}
                          className="cursor-pointer"
                          onClick={() => void openCompanyDetail(company)}
                        >
                          <TableCell>
                            <div className="font-medium text-slate-900">{company.name}</div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={getCompanyTypeBadgeClassName(company)}
                            >
                              {getCompanyTypeLabel(company)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {company.active === false ? (
                              <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                                비활성
                              </Badge>
                            ) : (
                              <Badge
                                variant="secondary"
                                className="bg-emerald-100 text-emerald-700"
                              >
                                사용
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {manageable ? (
                              <div className="flex justify-end gap-2">
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    void openCompanyDetail(company, "edit")
                                  }}
                                  title="수정"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                {company.active === false ? (
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-8"
                                    disabled={saving}
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      void onUpdateManualCompany(company.id, { active: true })
                                    }}
                                    title="복구"
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-8 text-rose-600 hover:text-rose-700"
                                    disabled={saving}
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      const confirmed = window.confirm(
                                        "이 기업을 비활성화하시겠습니까? 기존 보고서 이력은 유지됩니다.",
                                      )
                                      if (!confirmed) return
                                      void onDeactivateManualCompany(company.id)
                                    }}
                                    title="비활성화"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">수정 불가</span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </section>
        </div>
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="grid h-[min(90vh,880px)] w-[calc(100vw-32px)] !max-w-[min(1120px,calc(100vw-32px))] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-5">
            <DialogTitle>기업 등록</DialogTitle>
          </DialogHeader>
          <CompanyInfoEditorPanel
            form={createForm}
            setForm={setCreateForm}
            investmentRows={draft.investmentRows}
            addInvestmentRow={() =>
              setDraft((prev) => ({
                ...prev,
                investmentRows:
                  prev.investmentRows.length >= 3
                    ? prev.investmentRows
                    : [
                        ...prev.investmentRows,
                        { stage: "", date: "", postMoney: "", majorShareholder: "" },
                      ],
              }))
            }
            removeInvestmentRow={(index) =>
              setDraft((prev) => ({
                ...prev,
                investmentRows: prev.investmentRows.filter((_, rowIndex) => rowIndex !== index),
              }))
            }
            updateInvestmentRow={(index, field, value) =>
              setDraft((prev) => ({
                ...prev,
                investmentRows: prev.investmentRows.map((row, rowIndex) =>
                  rowIndex === index ? { ...row, [field]: value } : row,
                ),
              }))
            }
            optional
            showPrograms={false}
            nameWarnings={
              draft.name.trim().length > 0 ? (
                <CompanyNameWarnings exactMatches={exactMatches} similarMatches={similarMatches} />
              ) : null
            }
          />
          <DialogFooter className="shrink-0 border-t px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraft(createEmptyDraft())
                setIsCreateDialogOpen(false)
              }}
            >
              취소
            </Button>
            <Button
              type="button"
              disabled={saving || exactMatches.length > 0}
              onClick={() => void handleCreate()}
            >
              등록
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!detailCompany}
        onOpenChange={(open) => {
          if (!open) setDetailCompany(null)
        }}
      >
        <DialogContent className="grid h-[min(90vh,880px)] w-[calc(100vw-32px)] !max-w-[min(1120px,calc(100vw-32px))] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-5">
            <DialogTitle>{detailMode === "edit" ? "기업 정보 수정" : "기업 정보"}</DialogTitle>
            {detailCompany && (
              <div className="flex items-center gap-2 pt-1">
                <Badge variant="secondary" className={getCompanyTypeBadgeClassName(detailCompany)}>
                  {getCompanyTypeLabel(detailCompany)}
                </Badge>
                {!detailManageable && (
                  <span className="text-xs text-slate-500">조회만 가능합니다.</span>
                )}
              </div>
            )}
          </DialogHeader>
          {detailLoading ? (
            <div className="flex min-h-[360px] items-center justify-center bg-[#f8fafc] text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              기업 정보를 불러오는 중입니다.
            </div>
          ) : detailCompany && detailMode === "view" ? (
            <ManualCompanyInfoView company={detailCompany} draft={detailDraft} />
          ) : (
            <CompanyInfoEditorPanel
              form={detailForm}
              setForm={setDetailForm}
              investmentRows={detailDraft.investmentRows}
              addInvestmentRow={() =>
                setDetailDraft((prev) => ({
                  ...prev,
                  investmentRows:
                    prev.investmentRows.length >= 3
                      ? prev.investmentRows
                      : [
                          ...prev.investmentRows,
                          { stage: "", date: "", postMoney: "", majorShareholder: "" },
                        ],
                }))
              }
              removeInvestmentRow={(index) =>
                setDetailDraft((prev) => ({
                  ...prev,
                  investmentRows: prev.investmentRows.filter((_, rowIndex) => rowIndex !== index),
                }))
              }
              updateInvestmentRow={(index, field, value) =>
                setDetailDraft((prev) => ({
                  ...prev,
                  investmentRows: prev.investmentRows.map((row, rowIndex) =>
                    rowIndex === index ? { ...row, [field]: value } : row,
                  ),
                }))
              }
              optional
              showPrograms={false}
              readOnly={detailMode === "view" || !detailManageable}
              nameWarnings={
                detailMode === "edit" && detailDraft.name.trim().length > 0 ? (
                  <CompanyNameWarnings
                    exactMatches={detailExactMatches}
                    similarMatches={detailSimilarMatches}
                  />
                ) : null
              }
            />
          )}
          <DialogFooter className="shrink-0 border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setDetailCompany(null)}>
              닫기
            </Button>
            {detailManageable && detailMode === "view" && (
              <Button type="button" onClick={() => setDetailMode("edit")}>
                수정
              </Button>
            )}
            {detailManageable && detailMode === "edit" && (
              <Button
                type="button"
                disabled={saving || detailExactMatches.length > 0}
                onClick={() => void handleSaveDetail()}
              >
                저장
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
