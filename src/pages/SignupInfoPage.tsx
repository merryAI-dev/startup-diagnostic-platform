import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { collection, doc } from "firebase/firestore"
import type { User as FirebaseUser } from "firebase/auth"
import { useAuth } from "../context/AuthContext"
import { signOutUser, signUpWithEmail } from "../firebase/auth"
import { db } from "../firebase/client"
import type { Role } from "../types/auth"
import { ConsultantProfilePage } from "../redesign/app/components/pages/consultant-profile-page"
import { ChevronDown } from "lucide-react"
import { toast } from "sonner"
import { createUserProfile } from "../firebase/profile"
import type { CompanyInfoForm, InvestmentInput } from "../types/company"
import { DEFAULT_FORM } from "../types/company"
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

function getRoleFromQuery(search: string): Role | null {
  const params = new URLSearchParams(search)
  const value = params.get("role")
  if (value === "company" || value === "consultant" || value === "admin") {
    return value
  }
  return null
}

export function SignupInfoPage() {
  const { user, profile, loading, refreshProfile } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [hydratingProfile, setHydratingProfile] = useState(false)
  const [creatingAccount, setCreatingAccount] = useState(false)

  const requestedRole = useMemo(
    () => profile?.requestedRole ?? getRoleFromQuery(location.search),
    [location.search, profile?.requestedRole]
  )
  const pendingSignup = useMemo(() => {
    try {
      const raw = sessionStorage.getItem("pending-signup")
      if (!raw) return null
      return JSON.parse(raw) as { role: Role; email: string; password: string }
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
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
  }, [loading, profile, refreshProfile, user])

  if (loading || hydratingProfile) {
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

  async function ensureAuthUser(): Promise<FirebaseUser | null> {
    if (user) return user
    if (!pendingSignup) {
      toast.error("회원가입 정보가 없습니다. 다시 회원가입을 진행해주세요.")
      return null
    }
    if (creatingAccount) return null
    setCreatingAccount(true)
    try {
      const credential = await signUpWithEmail(
        pendingSignup.email,
        pendingSignup.password
      )
      sessionStorage.removeItem("pending-signup")
      return credential.user
    } catch (error) {
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
              await createUserProfile(
                authUser.uid,
                "company",
                requestedRole,
                authUser.email
              )
              await handleComplete()
            } catch (error) {
              toast.error("승인 요청에 실패했습니다. 다시 시도해주세요.")
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
        onComplete={handleComplete}
        onCancel={() => navigate("/login")}
      />
    )
  }

  return (
    <CompanySignupInfo
      companyId={profile?.companyId ?? null}
      userId={user?.uid ?? ""}
      userEmail={fallbackEmail}
      requestedRole={requestedRole}
      ensureAuthUser={ensureAuthUser}
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
  onComplete,
  onCancel,
}: {
  consultantId: string
  authEmail: string
  userEmail: string
  requestedRole: Role
  ensureAuthUser: () => Promise<FirebaseUser | null>
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
      await createUserProfile(
        authUser.uid,
        "company",
        requestedRole,
        authUser.email ?? userEmail,
        { consultantInfo: values }
      )
      await onComplete()
    } catch (error) {
      toast.error("승인 요청에 실패했습니다. 다시 시도해주세요.")
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
  companyId,
  userId,
  userEmail,
  requestedRole,
  ensureAuthUser,
  onComplete,
  onCancel,
}: {
  companyId: string | null
  userId: string
  userEmail: string
  requestedRole: Role
  ensureAuthUser: () => Promise<FirebaseUser | null>
  onComplete: () => Promise<void>
  onCancel: () => void
}) {
  const [generatedCompanyId] = useState(() => {
    if (!db) return null
    const ref = doc(collection(db, "companies"))
    return ref.id
  })
  const effectiveCompanyId = companyId ?? generatedCompanyId

  if (!effectiveCompanyId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        회사 정보를 찾을 수 없습니다. 로그인 화면으로 이동해주세요.
      </div>
    )
  }

  const [form, setForm] = useState<CompanyInfoForm>(DEFAULT_FORM)
  const [investmentRows, setInvestmentRows] = useState<InvestmentInput[]>([
    { stage: "", date: "", postMoney: "", majorShareholder: "" },
  ])
  const [touched, setTouched] = useState<Partial<Record<keyof CompanyInfoForm, boolean>>>({})
  const [saving, setSaving] = useState(false)
  const [activeInvestmentStageRow, setActiveInvestmentStageRow] = useState<number | null>(null)

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

  function getFilteredInvestmentStageOptions(keyword: string) {
    const normalizedKeyword = keyword.trim().toLowerCase()
    if (!normalizedKeyword) {
      return [...INVESTMENT_STAGE_OPTIONS]
    }
    return INVESTMENT_STAGE_OPTIONS.filter((option) =>
      option.toLowerCase().includes(normalizedKeyword)
    )
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
    desiredInvestment2026: "2026년 내 희망 투자액",
    desiredPreValue: "투자전 희망기업가치",
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

  async function handleSubmit() {
    try {
      const authUser = await ensureAuthUser()
      if (!authUser) return
      setSaving(true)
      await createUserProfile(
        authUser.uid,
        "company",
        requestedRole,
        authUser.email ?? userEmail,
        { companyId: effectiveCompanyId, companyInfo: form, investmentRows }
      )
      await onComplete()
    } catch (error) {
      toast.error("승인 요청에 실패했습니다. 다시 시도해주세요.")
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
              {investmentRows.map((row, idx) => (
                <div
                  key={`investment-${idx}`}
                  className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]"
                >
                  <label className="text-xs text-slate-500">
                    <span className="block whitespace-nowrap">투자단계</span>
                    <div className="relative">
                      <input
                        className={inputClass(false)}
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
                          updateInvestmentRow(idx, "stage", event.target.value)
                        }}
                      />
                      <ChevronDown
                        className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                        aria-hidden="true"
                      />
                      {activeInvestmentStageRow === idx ? (
                        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                          {getFilteredInvestmentStageOptions(row.stage).length > 0 ? (
                            getFilteredInvestmentStageOptions(row.stage).map((option) => (
                              <button
                                key={option}
                                type="button"
                                className="w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                                onMouseDown={(event) => {
                                  event.preventDefault()
                                  updateInvestmentRow(idx, "stage", option)
                                  setActiveInvestmentStageRow(null)
                                }}
                              >
                                {option}
                              </button>
                            ))
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
                    <span className="block whitespace-nowrap">투자일시</span>
                    <input
                      type="date"
                      className={inputClass(false)}
                      value={row.date}
                      onChange={(e) => updateInvestmentRow(idx, "date", e.target.value)}
                    />
                  </label>
                  <label className="text-xs text-slate-500">
                    <span className="block whitespace-nowrap">투자금액 (억)</span>
                    <input
                      className={inputClass(false)}
                      placeholder="예: 25"
                      value={row.postMoney}
                      onChange={(e) =>
                        updateInvestmentRow(idx, "postMoney", formatNumberInput(e.target.value))
                      }
                    />
                  </label>
                  <label className="text-xs text-slate-500">
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
            <div className="text-sm font-semibold text-slate-700">인증/이력</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-xs text-slate-500">
                인증/지정 여부
                <input
                  className={inputClass(isFieldInvalid("certification"))}
                  placeholder="예: 벤처기업 인증"
                  value={form.certification}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, certification: e.target.value }))
                  }
                  onBlur={() => markTouched("certification")}
                />
              </label>
              <label className="text-xs text-slate-500">
                TIPS/LIPS 이력
                <div className="relative">
                  <select
                    className={inputClass(isFieldInvalid("tipsLipsHistory"))}
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
            <div className="text-sm font-semibold text-slate-700">투자 희망</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-xs text-slate-500">
                2026년 내 희망 투자액
                <input
                  className={inputClass(isFieldInvalid("desiredInvestment2026"))}
                  placeholder="예: 20억"
                  value={form.desiredInvestment2026}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      desiredInvestment2026: formatNumberInput(e.target.value),
                    }))
                  }
                  onBlur={() => markTouched("desiredInvestment2026")}
                />
              </label>
              <label className="text-xs text-slate-500">
                투자전 희망기업가치
                <input
                  className={inputClass(isFieldInvalid("desiredPreValue"))}
                  placeholder="예: 120억"
                  value={form.desiredPreValue}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      desiredPreValue: formatNumberInput(e.target.value),
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
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            승인 대기 요청
          </button>
        </div>
      </div>
    </div>
  )
}
