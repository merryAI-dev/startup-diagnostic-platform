import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import type { User as FirebaseUser } from "firebase/auth"
import { useAuth } from "@/context/AuthContext"
import { getSignInMethods, signInWithEmail, signOutUser, signUpWithEmail } from "@/firebase/auth"
import { db } from "@/firebase/client"
import type { Role } from "@/types/auth"
import { ConsultantProfilePage } from "@/redesign/app/components/pages/consultant-profile-page"
import {
  ChevronDown,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { createUserProfile, getUserProfile } from "@/firebase/profile"
import type { CompanyInfoForm, InvestmentInput } from "@/types/company"
import { DEFAULT_FORM } from "@/types/company"

const PENDING_SIGNUP_KEY = "pending-signup"
type PendingSignupDraft = {
  role: Role
  email: string
  password?: string
}

function getSignupErrorMessage(error: any) {
  const code = error?.code ?? ""
  if (code === "auth/email-already-in-use") {
    return "이미 사용 중인 이메일입니다."
  }
  if (code === "auth/invalid-email") {
    return "올바르지 않은 이메일 형식입니다."
  }
  if (code === "auth/weak-password") {
    return "비밀번호가 너무 약합니다. 더 강한 비밀번호를 입력해주세요."
  }
  return "회원가입에 실패했습니다. 입력값을 확인하세요."
}

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code?: unknown }).code ?? "")
  }
  return ""
}

function getRoleFromQuery(search: string): Role | null {
  const params = new URLSearchParams(search)
  const value = params.get("role")
  if (value === "company" || value === "consultant" || value === "admin") {
    return value
  }
  return null
}

function getRoleLabel(role: Role) {
  if (role === "admin") return "관리자"
  if (role === "consultant") return "컨설턴트"
  return "스타트업"
}

export function SignupInfoPage() {
  const { user, profile, loading, refreshProfile } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [hydratingProfile, setHydratingProfile] = useState(false)
  const [creatingAccount, setCreatingAccount] = useState(false)

  const pendingSignup = useMemo(() => {
    try {
      const raw = sessionStorage.getItem(PENDING_SIGNUP_KEY)
      if (!raw) return null
      return JSON.parse(raw) as PendingSignupDraft
    } catch {
      return null
    }
  }, [])
  const requestedRole = useMemo(
    () => profile?.requestedRole ?? getRoleFromQuery(location.search) ?? pendingSignup?.role ?? null,
    [location.search, pendingSignup?.role, profile?.requestedRole]
  )

  useEffect(() => {
    if (creatingAccount) return
    if (loading) return
    if (!user) return
    if (profile) return
    let alive = true
    setHydratingProfile(true)
    refreshProfile()
      .catch(() => null)
      .finally(() => {
        if (alive) setHydratingProfile(false)
      })
    return () => {
      alive = false
    }
  }, [creatingAccount, loading, profile, refreshProfile, user])

  if (loading || (hydratingProfile && !creatingAccount)) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        불러오는 중...
      </div>
    )
  }

  if (!requestedRole) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        잘못된 접근입니다. 로그인 화면으로 이동해주세요.
      </div>
    )
  }

  const handleComplete = async () => {
    await signOutUser()
    navigate(`/pending?role=${requestedRole}`)
  }

  async function guardExistingProfile(
    authUser: FirebaseUser,
    nextRequestedRole: Role
  ) {
    const existingProfile = await getUserProfile(authUser.uid)
    if (!existingProfile) return true

    const existingRequestedRole = existingProfile.requestedRole ?? existingProfile.role
    const existingRoleLabel = getRoleLabel(existingRequestedRole)
    const requestedRoleLabel = getRoleLabel(nextRequestedRole)

    if (existingProfile.active === true) {
      if (existingRequestedRole !== nextRequestedRole) {
        toast.error(`이미 승인된 ${existingRoleLabel} 계정입니다. ${requestedRoleLabel} 역할로는 가입할 수 없습니다.`)
      } else {
        toast.error(`이미 승인된 ${existingRoleLabel} 계정입니다. 로그인 후 이용해주세요.`)
      }
      navigate(
        existingProfile.role === "admin" || existingProfile.role === "consultant"
          ? "/admin"
          : "/company"
      )
      return false
    }

    if (existingRequestedRole !== nextRequestedRole) {
      toast.error(`이미 ${existingRoleLabel} 역할로 승인 대기 중입니다.`)
    } else {
      toast.error(`이미 ${existingRoleLabel} 역할로 승인 대기 중입니다. 승인 후 이용해주세요.`)
    }
    await signOutUser()
    navigate(`/pending?role=${existingRequestedRole}`)
    return false
  }

  async function ensureAuthUser(): Promise<FirebaseUser | null> {
    if (user) return user
    if (!pendingSignup) {
      toast.error("회원가입 정보가 없습니다. 다시 회원가입을 진행해주세요.")
      return null
    }
    if (!pendingSignup.password) {
      toast.error("로그인 정보가 만료되었습니다. 다시 로그인 후 시도해주세요.")
      return null
    }
    if (creatingAccount) return null
    setCreatingAccount(true)
    try {
      const signInMethods = await getSignInMethods(pendingSignup.email)
      const hasPasswordMethod = signInMethods.includes("password")
      const hasGoogleMethod = signInMethods.includes("google.com")
      if (hasGoogleMethod && !hasPasswordMethod) {
        toast.error("이미 사용 중인 이메일입니다. 다른 이메일을 사용해주세요.")
        return null
      }

      const credential = await signUpWithEmail(
        pendingSignup.email,
        pendingSignup.password
      )
      sessionStorage.removeItem(PENDING_SIGNUP_KEY)
      return credential.user
    } catch (error) {
      const code = (error as { code?: string })?.code ?? ""
      if (code === "auth/email-already-in-use") {
        try {
          const credential = await signInWithEmail(
            pendingSignup.email,
            pendingSignup.password
          )
          sessionStorage.removeItem(PENDING_SIGNUP_KEY)
          return credential.user
        } catch {
          toast.error("이미 가입된 이메일입니다. 로그인 후 다시 시도해주세요.")
          return null
        }
      }
      toast.error(getSignupErrorMessage(error))
      return null
    } finally {
      setCreatingAccount(false)
    }
  }

  if (requestedRole === "admin") {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-6 px-6 py-12">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            관리자 정보 입력
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            별도 정보 입력 없이 관리자 승인 대기로 이동합니다.
          </p>
        </div>
        <button
          className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white"
          onClick={async () => {
            try {
              const authUser = await ensureAuthUser()
              if (!authUser) return
              const canProceed = await guardExistingProfile(authUser, requestedRole)
              if (!canProceed) return
              await createUserProfile(
                authUser.uid,
                "company",
                requestedRole,
                authUser.email
              )
              await handleComplete()
            } catch (error) {
              const code = getErrorCode(error)
              toast.error(
                code
                  ? `승인 요청에 실패했습니다. (${code})`
                  : "승인 요청에 실패했습니다. 다시 시도해주세요."
              )
            }
          }}
          type="button"
        >
          승인 대기 요청
        </button>
      </div>
    )
  }

  const fallbackEmail = user?.email ?? pendingSignup?.email ?? ""

  if (requestedRole === "consultant") {
    return (
      <ConsultantSignupInfo
        consultantId={user?.uid ?? ""}
        authEmail={fallbackEmail}
        userEmail={fallbackEmail}
        requestedRole={requestedRole}
        ensureAuthUser={ensureAuthUser}
        guardExistingProfile={guardExistingProfile}
        onComplete={handleComplete}
        onCancel={() => navigate("/login")}
      />
    )
  }

  return (
    <CompanySignupInfo
      userEmail={fallbackEmail}
      requestedRole={requestedRole}
      ensureAuthUser={ensureAuthUser}
      guardExistingProfile={guardExistingProfile}
      onComplete={handleComplete}
      onCancel={() => navigate("/login")}
    />
  )
}

function ConsultantSignupInfo({
  consultantId,
  authEmail,
  userEmail,
  requestedRole,
  ensureAuthUser,
  guardExistingProfile,
  onComplete,
  onCancel,
}: {
  consultantId: string
  authEmail: string
  userEmail: string
  requestedRole: Role
  ensureAuthUser: () => Promise<FirebaseUser | null>
  guardExistingProfile: (
    authUser: FirebaseUser,
    nextRequestedRole: Role
  ) => Promise<boolean>
  onComplete: () => Promise<void>
  onCancel: () => void
}) {
  async function handleSubmit(values: {
    name: string
    organization: string
    email: string
    phone: string
    secondaryEmail: string
    secondaryPhone: string
    fixedMeetingLink: string
    expertise: string
    bio: string
  }) {
    if (!db) return
    try {
      const authUser = await ensureAuthUser()
      if (!authUser) return
      const canProceed = await guardExistingProfile(authUser, requestedRole)
      if (!canProceed) return
      await createUserProfile(
        authUser.uid,
        "company",
        requestedRole,
        authUser.email ?? userEmail,
        { consultantInfo: values }
      )
      await onComplete()
    } catch (error) {
      const code = getErrorCode(error)
      toast.error(
        code
          ? `승인 요청에 실패했습니다. (${code})`
          : "승인 요청에 실패했습니다. 다시 시도해주세요."
      )
    }
  }

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-gray-50 py-10">
      <ConsultantProfilePage
        consultant={null}
        defaultEmail={authEmail}
        submitLabel="승인 대기 요청"
        submitClassName="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
        hideReset
        hideDescription
        onBack={onCancel}
        onSubmit={handleSubmit}
      />
    </div>
  )
}

function CompanySignupInfo({
  userEmail,
  requestedRole,
  ensureAuthUser,
  guardExistingProfile,
  onComplete,
  onCancel,
}: {
  userEmail: string
  requestedRole: Role
  ensureAuthUser: () => Promise<FirebaseUser | null>
  guardExistingProfile: (
    authUser: FirebaseUser,
    nextRequestedRole: Role
  ) => Promise<boolean>
  onComplete: () => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState<CompanyInfoForm>(DEFAULT_FORM)
  const [investmentRows, setInvestmentRows] = useState<InvestmentInput[]>([
    { stage: "", date: "", postMoney: "", majorShareholder: "" },
  ])
  const [touched, setTouched] = useState<Partial<Record<keyof CompanyInfoForm, boolean>>>({})
  const [saving, setSaving] = useState(false)
  const [activeInvestmentStageRow, setActiveInvestmentStageRow] = useState<number | null>(null)
  const investmentStageDropdownRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const [consentOpen, setConsentOpen] = useState(false)
  const [consentPrivacy, setConsentPrivacy] = useState(false)
  const [consentMarketing, setConsentMarketing] = useState(false)
  const [consentError, setConsentError] = useState<string | null>(null)
  const CONSENT_VERSION = "v1.0"
  const CONSENT_METHOD = "company_signup_modal"


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
  const postcodeScriptLoadingRef = useRef(false)

  function openAddressSearchPopup(targetField: AddressFieldKey) {
    const typedWindow = window as Window & { daum?: { Postcode?: DaumPostcodeConstructor } }
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
    const typedWindow = window as Window & { daum?: { Postcode?: DaumPostcodeConstructor } }
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

  const requiredKeys: (keyof CompanyInfoForm)[] = [
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
  ]

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
    desiredInvestment2026: "2026년 내 희망 투자액 (억)",
    desiredPreValue: "투자전 희망기업가치 (Pre-Value, 억)",
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

  const missingRequiredFields = requiredKeys.filter((key) => !isFilled(form[key] ?? ""))
  const invalidRequiredFields = requiredKeys.filter((key) => {
    const value = form[key] ?? ""
    if (!isFilled(value)) return false
    if (key === "ceoEmail") return !isEmail(value)
    if (key === "ceoPhone") return !isPhone(value)
    if (key === "businessNumber") return !isBusinessNumber(value)
    return false
  })
  const canSubmit = missingRequiredFields.length === 0 && invalidRequiredFields.length === 0
  const missingRequired = missingRequiredFields.length
  const invalidRequired = invalidRequiredFields.length
  const missingRequiredLabels = missingRequiredFields.map((field) => FIELD_LABELS[field])
  const invalidRequiredLabels = invalidRequiredFields.map((field) => FIELD_LABELS[field])

  function markTouched(field: keyof CompanyInfoForm) {
    setTouched((prev) => ({ ...prev, [field]: true }))
  }

  function isFieldInvalid(field: keyof CompanyInfoForm) {
    if (!touched[field]) return false
    const value = form[field] ?? ""
    if (!isFilled(value)) return true
    if (field === "ceoEmail") return !isEmail(value)
    if (field === "ceoPhone") return !isPhone(value)
    if (field === "businessNumber") return !isBusinessNumber(value)
    return false
  }

  function addInvestmentRow() {
    setInvestmentRows((prev) => [
      ...prev,
      { stage: "", date: "", postMoney: "", majorShareholder: "" },
    ])
  }

  function removeInvestmentRow(target: number) {
    setInvestmentRows((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((_, index) => index !== target)
    })
    setActiveInvestmentStageRow((prev) => {
      if (prev === null) return prev
      if (prev === target) return null
      return prev > target ? prev - 1 : prev
    })
  }

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
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick)
    }
  }, [activeInvestmentStageRow])

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

  function parseInvestmentStages(value: string) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  }

  function serializeInvestmentStages(values: string[]) {
    return values.join(", ")
  }

  function toggleInvestmentStage(index: number, stage: string) {
    const normalized = stage.trim()
    if (!normalized) return
    const currentStages = parseInvestmentStages(investmentRows[index]?.stage ?? "")
    const exists = currentStages.includes(normalized)
    const nextStages = exists
      ? currentStages.filter((item) => item !== normalized)
      : [...currentStages, normalized]
    updateInvestmentRow(index, "stage", serializeInvestmentStages(nextStages))
  }

  function removeInvestmentStage(index: number, stage: string) {
    const currentStages = parseInvestmentStages(investmentRows[index]?.stage ?? "")
    const nextStages = currentStages.filter((item) => item !== stage)
    updateInvestmentRow(index, "stage", serializeInvestmentStages(nextStages))
  }

  async function handleSubmit() {
    try {
      const authUser = await ensureAuthUser()
      if (!authUser) return
      const canProceed = await guardExistingProfile(authUser, requestedRole)
      if (!canProceed) return
      setSaving(true)
      const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null
      await createUserProfile(
        authUser.uid,
        "company",
        requestedRole,
        authUser.email ?? userEmail,
        {
          companyId: authUser.uid,
          companyInfo: form,
          investmentRows,
          consents: {
            privacy: {
              consented: consentPrivacy,
              version: CONSENT_VERSION,
              method: CONSENT_METHOD,
              userAgent,
            },
            marketing: {
              consented: consentMarketing,
              version: CONSENT_VERSION,
              method: CONSENT_METHOD,
              userAgent,
            },
          },
        }
      )
      await onComplete()
    } catch (error) {
      const code = getErrorCode(error)
      toast.error(
        code
          ? `승인 요청에 실패했습니다. (${code})`
          : "승인 요청에 실패했습니다. 다시 시도해주세요."
      )
    } finally {
      setSaving(false)
    }
  }

  function inputClass(invalid?: boolean) {
    return [
      "mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-1",
      invalid
        ? "border-rose-300 bg-rose-50 text-rose-900 placeholder:text-rose-300 focus:border-rose-400 focus:ring-rose-200/60"
        : "border-slate-200 focus:border-slate-300 focus:ring-slate-200/60",
    ].join(" ")
  }

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-gray-50 py-10">
      <div className="mx-auto w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">
            기업 정보 입력
          </h1>
          <p className="text-sm text-slate-500">
            필수 정보를 모두 입력해야 승인 대기로 이동할 수 있습니다.
          </p>
        </div>

        {!canSubmit ? (
          <div className="mt-4 text-xs text-amber-700">
            {missingRequired > 0 ? `미입력 ${missingRequired}개` : null}
            {missingRequired > 0 && invalidRequired > 0 ? " · " : null}
            {invalidRequired > 0 ? `형식 확인 ${invalidRequired}개` : null}
            {(missingRequired > 0 || invalidRequired > 0) &&
            (missingRequiredLabels.length > 0 || invalidRequiredLabels.length > 0)
              ? ` (${[...missingRequiredLabels, ...invalidRequiredLabels]
                  .slice(0, 3)
                  .join(", ")}${
                  missingRequiredLabels.length + invalidRequiredLabels.length > 3
                    ? " 외"
                    : ""
                })`
              : null}
          </div>
        ) : null}

        <div className="mt-6 space-y-6">
          <section>
            <div className="text-sm font-semibold text-slate-700">기본 정보</div>
            <div className="mt-3 grid gap-3 md:grid-cols-6">
              <label className="text-xs text-slate-500 md:col-span-3">
                기업정보
                <input
                  className={inputClass(isFieldInvalid("companyInfo"))}
                  placeholder="회사명, 법인/개인 구분 등"
                  value={form.companyInfo}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, companyInfo: e.target.value }))
                  }
                  onBlur={() => markTouched("companyInfo")}
                />
              </label>
              <label className="text-xs text-slate-500 md:col-span-2">
                대표자 성명
                <input
                  className={inputClass(isFieldInvalid("ceoName"))}
                  placeholder="홍길동"
                  value={form.ceoName}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, ceoName: e.target.value }))
                  }
                  onBlur={() => markTouched("ceoName")}
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
              <label className="text-xs text-slate-500 md:col-span-3">
                대표자 이메일
                <input
                  className={inputClass(isFieldInvalid("ceoEmail"))}
                  placeholder="ceo@company.com"
                  value={form.ceoEmail}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, ceoEmail: e.target.value }))
                  }
                  onBlur={() => markTouched("ceoEmail")}
                />
              </label>
              <label className="text-xs text-slate-500 md:col-span-2">
                법인 설립일자
                <input
                  type="date"
                  className={inputClass(isFieldInvalid("foundedAt"))}
                  value={form.foundedAt}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, foundedAt: e.target.value }))
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
                      businessNumber: formatBusinessNumber(e.target.value),
                    }))
                  }
                  onBlur={() => markTouched("businessNumber")}
                />
              </label>
              <label className="text-xs text-slate-500 md:col-span-3">
                주업태
                <input
                  className={inputClass(isFieldInvalid("primaryBusiness"))}
                  placeholder="예: 제조"
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
              <label className="text-xs text-slate-500 md:col-span-3">
                주업종
                <input
                  className={inputClass(isFieldInvalid("primaryIndustry"))}
                  placeholder="예: 식품"
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
            <div className="text-sm font-semibold text-slate-700">자료 업로드</div>
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
              회원가입 단계에서는 회사 자료 업로드를 받지 않습니다.
              계정 승인 후 기업 정보 입력 페이지에서 업로드해주세요.
            </div>
          </section>

          <section>
            <div className="text-sm font-semibold text-slate-700">사업장 정보</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-xs text-slate-500">
                <div className="flex items-center justify-between">
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
                    className={inputClass(isFieldInvalid("headOffice"))}
                    placeholder="주소 검색으로 입력"
                    value={form.headOffice}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, headOffice: e.target.value }))
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
                <div className="flex items-center justify-between">
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
                    className={inputClass(false)}
                    placeholder="없으면 '없음' 입력"
                    value={form.branchOffice}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, branchOffice: e.target.value }))
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
            <div className="text-sm font-semibold text-slate-700">인력 현황</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-xs text-slate-500">
                종업원수 (정규)
                <input
                  className={inputClass(isFieldInvalid("workforceFullTime"))}
                  value={form.workforceFullTime}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      workforceFullTime: formatNumberInput(e.target.value),
                    }))
                  }
                  onBlur={() => markTouched("workforceFullTime")}
                />
              </label>
              <label className="text-xs text-slate-500">
                종업원수 (계약)
                <input
                  className={inputClass(isFieldInvalid("workforceContract"))}
                  value={form.workforceContract}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      workforceContract: formatNumberInput(e.target.value),
                    }))
                  }
                  onBlur={() => markTouched("workforceContract")}
                />
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
              {investmentRows.map((row, idx) => {
                const selectedStages = parseInvestmentStages(row.stage)

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
                        className={`${inputClass(false)} min-h-[40px] cursor-pointer pr-9`}
                        onMouseDown={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          setActiveInvestmentStageRow((prev) =>
                            prev === idx ? null : idx
                          )
                        }}
                      >
                        {selectedStages.length > 0 ? (
                          <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap pr-1">
                            {selectedStages.map((stage) => (
                              <span
                                key={`${stage}-${idx}`}
                                className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-700 px-1.5 py-0 text-[10px] font-semibold text-white"
                              >
                                <span>{stage}</span>
                                <button
                                  type="button"
                                  className="text-white/80 hover:text-white"
                                  onMouseDown={(event) => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    removeInvestmentStage(idx, stage)
                                  }}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">
                            투자단계를 선택하세요
                          </span>
                        )}
                      </div>
                      <ChevronDown
                        className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                        aria-hidden="true"
                      />
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
                    <span className="block whitespace-nowrap">투자일시</span>
                    <input
                      type="text"
                      className={inputClass(false)}
                      inputMode="numeric"
                      maxLength={10}
                      placeholder="YYYY.MM.DD"
                      value={row.date}
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
                    <span className="block whitespace-nowrap">투자금액 (억)</span>
                    <input
                      className={inputClass(false)}
                      placeholder="예: 25.5"
                      inputMode="decimal"
                      value={row.postMoney}
                      onChange={(e) => updateInvestmentRow(idx, "postMoney", e.target.value)}
                    />
                  </label>
                  <div className="flex items-start gap-2">
                    <label className="min-w-0 flex-1 text-xs text-slate-500">
                      <span className="block whitespace-nowrap">주요주주명</span>
                      <input
                        className={inputClass(false)}
                        placeholder="투자사/주주명"
                        value={row.majorShareholder}
                        onChange={(e) =>
                          updateInvestmentRow(idx, "majorShareholder", e.target.value)
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="mt-5 rounded-md border border-rose-200 p-2 text-rose-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => removeInvestmentRow(idx)}
                      disabled={investmentRows.length <= 1}
                      aria-label="삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                )
              })}
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
            <div className="text-sm font-semibold text-slate-700">인증/이력</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-xs text-slate-500">
                인증/지정 여부
                <div className="relative">
                  <select
                    className={`${inputClass(isFieldInvalid("certification"))} appearance-none pr-10`}
                    value={form.certification}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, certification: e.target.value }))
                    }
                    onBlur={() => markTouched("certification")}
                  >
                    <option value="">선택</option>
                    {CERTIFICATION_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                </div>
              </label>
              <label className="text-xs text-slate-500">
                TIPS/LIPS 이력
                <div className="relative">
                  <select
                    className={`${inputClass(isFieldInvalid("tipsLipsHistory"))} appearance-none pr-10`}
                    value={form.tipsLipsHistory}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, tipsLipsHistory: e.target.value }))
                    }
                    onBlur={() => markTouched("tipsLipsHistory")}
                  >
                    <option value="">선택</option>
                    {TIPS_LIPS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
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
            <div className="text-sm font-semibold text-slate-700">투자 희망</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-xs text-slate-500">
                2026년 내 희망 투자액 (억)
                <input
                  className={inputClass(isFieldInvalid("desiredInvestment2026"))}
                  placeholder="예: 20.5"
                  inputMode="decimal"
                  value={form.desiredInvestment2026}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      desiredInvestment2026: formatRevenueInput(e.target.value),
                    }))
                  }
                  onBlur={() => markTouched("desiredInvestment2026")}
                />
              </label>
              <label className="text-xs text-slate-500">
                투자전 희망기업가치 (Pre-Value, 억)
                <input
                  className={inputClass(isFieldInvalid("desiredPreValue"))}
                  placeholder="예: 120.0"
                  inputMode="decimal"
                  value={form.desiredPreValue}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      desiredPreValue: formatRevenueInput(e.target.value),
                    }))
                  }
                  onBlur={() => markTouched("desiredPreValue")}
                />
              </label>
            </div>
          </section>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            className="text-sm text-slate-500 hover:text-slate-700"
            onClick={onCancel}
          >
            로그인으로 돌아가기
          </button>
          <button
            type="button"
            onClick={() => {
              if (!canSubmit || saving) return
              if (!consentPrivacy) {
                setConsentError(null)
                setConsentOpen(true)
                return
              }
              handleSubmit()
            }}
            disabled={!canSubmit || saving}
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            승인 대기 요청
          </button>
        </div>
      </div>

      {consentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">약관 및 동의</h2>
                <p className="mt-1 text-sm text-slate-500">
                  회사 가입을 위해 아래 동의가 필요합니다.
                </p>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600"
                onClick={() => setConsentOpen(false)}
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-4 text-sm">
              <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={consentPrivacy}
                  onChange={(e) => {
                    setConsentPrivacy(e.target.checked)
                    if (e.target.checked) setConsentError(null)
                  }}
                />
                <span>
                  <span className="font-semibold text-slate-900">개인정보 수집·이용 동의</span>{" "}
                  <span className="text-rose-600">(필수)</span>
                  <span className="block text-xs text-slate-500 mt-1">
                    수집 목적, 항목, 보유·이용 기간, 동의 거부권을 포함합니다.
                  </span>
                </span>
              </label>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 leading-relaxed">
                <p className="font-semibold text-slate-700">[개인정보 수집·이용 동의]</p>
                <p className="mt-2">제1조 (수집 목적)</p>
                <p>회사는 회원 가입 및 서비스 제공, 고객 문의 대응, 공지사항 전달을 위하여 개인정보를 수집·이용합니다.</p>
                <p className="mt-2">제2조 (수집 항목)</p>
                <p>필수: 회사명, 대표자 성명, 대표자 이메일, 대표자 전화번호, 사업자등록번호, 소재지 등 가입에 필요한 정보</p>
                <p className="mt-2">제3조 (보유 및 이용 기간)</p>
                <p>회원 탈퇴 시까지 보관하며, 관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관합니다.</p>
                <p className="mt-2">제4조 (동의 거부권 및 불이익)</p>
                <p>동의를 거부할 권리가 있으며, 필수 항목 동의 거부 시 회원가입이 제한될 수 있습니다.</p>
              </div>

              <label className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={consentMarketing}
                  onChange={(e) => setConsentMarketing(e.target.checked)}
                />
                <span>
                  <span className="font-semibold text-slate-900">마케팅 정보 수신 동의</span>{" "}
                  <span className="text-slate-500">(선택)</span>
                  <span className="block text-xs text-slate-500 mt-1">
                    이벤트, 뉴스레터 등 안내를 받을 수 있습니다.
                  </span>
                </span>
              </label>
              <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 leading-relaxed">
                <p className="font-semibold text-slate-700">[마케팅 정보 수신 동의]</p>
                <p className="mt-2">제1조 (수신 목적)</p>
                <p>회사는 서비스 안내, 이벤트, 프로모션 등 마케팅 정보를 제공하기 위해 개인정보를 이용합니다.</p>
                <p className="mt-2">제2조 (전송 방법)</p>
                <p>이메일, 문자, 앱 알림 등 전자적 전송매체를 통해 안내합니다.</p>
                <p className="mt-2">제3조 (보유 및 이용 기간)</p>
                <p>동의 철회 시까지 보관·이용합니다.</p>
                <p className="mt-2">제4조 (동의 거부권)</p>
                <p>동의를 거부하더라도 서비스 이용에는 제한이 없습니다.</p>
              </div>

              {consentError ? (
                <div className="text-xs text-rose-600">{consentError}</div>
              ) : null}
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                onClick={() => setConsentOpen(false)}
              >
                취소
              </button>
              <button
                type="button"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                onClick={() => {
                  if (!consentPrivacy) {
                    setConsentError("개인정보 수집·이용 동의는 필수입니다.")
                    return
                  }
                  setConsentOpen(false)
                  handleSubmit()
                }}
              >
                동의하고 계속
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
