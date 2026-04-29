import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import type { User as FirebaseUser } from "firebase/auth"
import { collection, getDocs, orderBy, query } from "firebase/firestore"
import { useAuth } from "@/context/AuthContext"
import { getSignInMethods, signInWithEmail, signOutUser, signUpWithEmail } from "@/firebase/auth"
import { db } from "@/firebase/client"
import type { Role } from "@/types/auth"
import { ConsultantProfilePage } from "@/redesign/app/components/pages/consultant-profile-page"
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { createSignupRequest, getSignupRequest, getUserProfile } from "@/firebase/profile"
import type { CompanyInfoForm, InvestmentInput } from "@/types/company"
import { DEFAULT_FORM } from "@/types/company"
import { InputSuffix } from "@/components/ui/InputSuffix"
import { PENDING_REQUEST_FLAG, PENDING_SIGNUP_KEY } from "@/constants/signup"

type ProgramOption = {
  id: string
  name: string
}
type PendingSignupDraft = {
  role: Role
  email: string
  password?: string
}

function getSignupErrorMessage(error: any) {
  const code = error?.code ?? ""
  if (code === "auth/firebase-not-configured") {
    return "Firebase 환경변수가 설정되지 않았습니다. 로컬 `.env`를 먼저 구성해주세요."
  }
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
  const adminSubmitLockRef = useRef(false)

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
    sessionStorage.setItem(PENDING_REQUEST_FLAG, "1")
    await signOutUser()
    navigate(`/pending?role=${requestedRole}`)
  }

  async function guardExistingProfile(
    authUser: FirebaseUser,
    nextRequestedRole: Role
  ) {
    const [existingProfile, existingSignupRequest] = await Promise.all([
      getUserProfile(authUser.uid),
      getSignupRequest(authUser.uid),
    ])
    console.log("guardExistingProfile", {
      uid: authUser.uid,
      nextRequestedRole,
      existingProfile,
      existingSignupRequest,
    })
    if (!existingProfile && !existingSignupRequest) return true

    const existingRequestedRole =
      existingSignupRequest?.requestedRole ??
      existingSignupRequest?.role ??
      existingProfile?.requestedRole ??
      existingProfile?.role ??
      nextRequestedRole
    const existingRoleLabel = getRoleLabel(existingRequestedRole)
    const requestedRoleLabel = getRoleLabel(nextRequestedRole)

    if (existingProfile?.active === true) {
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
            관리자 승인 요청
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            관리자 계정은 별도 정보 입력 없이 승인 요청만 진행합니다.
          </p>
        </div>
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-900 shadow-sm">
          <div className="font-semibold">승인 후 로그인 가능</div>
          <p className="mt-1 text-sm leading-6 text-sky-800">
            승인 요청을 완료 후 다른 관리자가 계정을 승인한 뒤에만 관리자 화면에
            로그인할 수 있습니다.
          </p>
        </div>
        <button
          className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white"
          onClick={async () => {
            if (adminSubmitLockRef.current) return
            adminSubmitLockRef.current = true
            try {
              const authUser = await ensureAuthUser()
              if (!authUser) return
              const canProceed = await guardExistingProfile(authUser, requestedRole)
              if (!canProceed) return
              await createSignupRequest(
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
            } finally {
              adminSubmitLockRef.current = false
            }
          }}
          type="button"
        >
          관리자 승인 요청
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
  const submitLockRef = useRef(false)
  const [submitting, setSubmitting] = useState(false)

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
    if (submitLockRef.current) return
    submitLockRef.current = true
    setSubmitting(true)
    try {
      const authUser = await ensureAuthUser()
      if (!authUser) return
      const canProceed = await guardExistingProfile(authUser, requestedRole)
      if (!canProceed) return
      await createSignupRequest(
        authUser.uid,
        "company",
        requestedRole,
        authUser.email ?? userEmail,
        { consultantInfo: values }
      )
      await onComplete()
    } catch (error) {
      console.error("signup submit error", error)
      const code = getErrorCode(error)
      toast.error(
        code
          ? `승인 요청에 실패했습니다. (${code})`
          : "승인 요청에 실패했습니다. 다시 시도해주세요."
      )
    } finally {
      submitLockRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="h-full overflow-hidden bg-gray-50 p-6">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="shrink-0 border-b border-slate-200 bg-white px-8 py-5">
          <button
            type="button"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-800"
            onClick={onCancel}
          >
            <ArrowLeft className="h-4 w-4" />
            <span>로그인으로 돌아가기</span>
          </button>
          <div className="mt-3 space-y-2">
            <h1 className="text-2xl font-semibold text-slate-900">
              {getRoleLabel(requestedRole)} 정보 입력
            </h1>
            <p className="text-sm text-slate-500">
              필수 정보를 입력한 뒤 승인 대기 요청을 진행해주세요.
            </p>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-6 lg:p-8">
          <ConsultantProfilePage
            consultant={null}
            defaultEmail={authEmail}
            embedded
            submitLabel="승인 대기 요청"
            submitClassName="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            hideReset
            hideDescription
            saving={submitting}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
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
  const [availablePrograms, setAvailablePrograms] = useState<ProgramOption[]>([])
  const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>([])
  const [investmentRows, setInvestmentRows] = useState<InvestmentInput[]>([
    { stage: "", date: "", postMoney: "", majorShareholder: "" },
  ])
  const [touched, setTouched] = useState<Partial<Record<keyof CompanyInfoForm, boolean>>>({})
  const [saving, setSaving] = useState(false)
  const [activeInvestmentStageRow, setActiveInvestmentStageRow] = useState<number | null>(null)
  const [certificationDropdownOpen, setCertificationDropdownOpen] = useState(false)
  const [programDropdownOpen, setProgramDropdownOpen] = useState(false)
  const investmentStageDropdownRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const certificationDropdownRef = useRef<HTMLDivElement | null>(null)
  const programDropdownRef = useRef<HTMLDivElement | null>(null)
  const signupSectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const [consentOpen, setConsentOpen] = useState(false)
  const [consentTerms, setConsentTerms] = useState(false)
  const [consentPrivacy, setConsentPrivacy] = useState(false)
  const [consentMarketing, setConsentMarketing] = useState(false)
  const submitLockRef = useRef(false)
  const [consentError, setConsentError] = useState<string | null>(null)
  const [activeSignupSection, setActiveSignupSection] = useState("company-service")
  const CONSENT_VERSION = "v1.0"
  const CONSENT_METHOD = "company_signup_modal"

  useEffect(() => {
    let active = true

    async function loadPrograms() {
      if (!db) {
        setAvailablePrograms([])
        return
      }
      try {
        const snapshot = await getDocs(
          query(collection(db, "programs"), orderBy("name", "asc"))
        )
        if (!active) return
        setAvailablePrograms(
          snapshot.docs.map((docSnap) => {
            const data = docSnap.data() as { name?: string }
            return {
              id: docSnap.id,
              name: data.name?.trim() || "이름 없는 사업",
            }
          })
        )
      } catch (error) {
        console.warn("Failed to load signup programs:", error)
        if (active) {
          setAvailablePrograms([])
        }
      }
    }

    void loadPrograms()

    return () => {
      active = false
    }
  }, [])

  const uniquePrograms = useMemo(() => {
    const seen = new Set<string>()
    return availablePrograms.filter((program) => {
      if (seen.has(program.id)) return false
      seen.add(program.id)
      return true
    })
  }, [availablePrograms])


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
  const SDG_SECONDARY_OPTIONS = [...SDG_OPTIONS, "없음"] as const
  const GENDER_OPTIONS = ["남", "여"] as const
  const YES_NO_OPTIONS = ["예", "아니요"] as const
  const COMPANY_TYPE_OPTIONS = ["예비창업", "법인"] as const
  const REPRESENTATIVE_SOLUTION_MAX_LENGTH = 50
  const REPRESENTATIVE_SOLUTION_MIN_LENGTH = 20
  const MYSC_EXPECTATION_MIN_LENGTH = 20

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

  const isPreStartup = form.companyType === "예비창업"
  const representativeSolutionLength = form.representativeSolution.length
  const myscExpectationLength = form.myscExpectation.length
  const corporateRequiredKeys: (keyof CompanyInfoForm)[] = isPreStartup
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
      ]
  const coRepresentativeRequiredKeys: (keyof CompanyInfoForm)[] =
    form.hasCoRepresentative === "예"
      ? CO_REPRESENTATIVE_FIELDS
      : []
  const exportVoucherRequiredKeys: (keyof CompanyInfoForm)[] =
    !isPreStartup && form.exportVoucherHeld === "예"
      ? EXPORT_VOUCHER_DETAIL_FIELDS
      : []
  const innovationVoucherRequiredKeys: (keyof CompanyInfoForm)[] =
    !isPreStartup && form.innovationVoucherHeld === "예"
      ? INNOVATION_VOUCHER_DETAIL_FIELDS
      : []
  const requiredKeys: (keyof CompanyInfoForm)[] = [
    "companyType",
    "companyInfo",
    "representativeSolution",
    "sdgPriority2",
    "ceoName",
    "ceoEmail",
    "ceoPhone",
    "ceoBirthDate",
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
  ]

  const FIELD_LABELS: Record<keyof CompanyInfoForm, string> = {
    companyType: "기업 형태",
    companyInfo: "기업정보",
    representativeSolution: "대표 솔루션",
    sdgPriority1: "UN SDGs 우선순위 1위",
    sdgPriority2: "UN SDGs 우선순위 2위",
    ceoName: "대표자 성명",
    ceoEmail: "대표자 이메일",
    ceoPhone: "대표자 전화번호",
    ceoBirthDate: "대표자 생년월일",
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
    headOffice: "본점 소재지 (법인등기부등본 기준)",
    branchOffice: "지점 또는 연구소 소재지 (법인등기부등본 기준)",
    targetCountries: "해외 지사 또는 진출 희망국가",
    workforceFullTime: "종업원수 (정규, 4대보험 가입자 수 기준)",
    workforceContract: "종업원수 (계약, 4대보험 가입자 수 기준)",
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
    if (field === "representativeSolution") return value.trim().length >= REPRESENTATIVE_SOLUTION_MIN_LENGTH
    if (field === "myscExpectation") return value.trim().length >= MYSC_EXPECTATION_MIN_LENGTH
    return true
  }

  function shouldSkipFieldValidation(field: keyof CompanyInfoForm) {
    if (isPreStartup && CORPORATE_ONLY_FIELDS.includes(field)) return true
    if (form.hasCoRepresentative !== "예" && CO_REPRESENTATIVE_FIELDS.includes(field)) return true
    if (form.exportVoucherHeld !== "예" && EXPORT_VOUCHER_DETAIL_FIELDS.includes(field)) return true
    if (form.innovationVoucherHeld !== "예" && INNOVATION_VOUCHER_DETAIL_FIELDS.includes(field)) return true
    return false
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
    if (!meetsMinLength(key, value)) return true
    if (key === "ceoEmail") return !isEmail(value)
    if (key === "ceoPhone") return !isPhone(value)
    if (key === "businessNumber") return !isBusinessNumber(value)
    return false
  })
  const hasInvestmentRows = investmentRows.length > 0
  const investmentRowsComplete =
    isPreStartup
    || !hasInvestmentRows
    || investmentRows.every(
      (row) =>
        parseInvestmentStages(row.stage).length > 0
        && isFilled(row.date)
        && hasNumber(row.postMoney)
        && isFilled(row.majorShareholder)
    )
  const investmentRowsNeedInput = hasInvestmentRows && !investmentRowsComplete
  const canSubmit =
    missingRequiredFields.length === 0
    && invalidRequiredFields.length === 0
    && investmentRowsComplete
  const missingRequired = missingRequiredFields.length
  const invalidRequired = invalidRequiredFields.length + (investmentRowsNeedInput ? 1 : 0)
  const missingRequiredLabels = [
    ...missingRequiredFields.map((field) => FIELD_LABELS[field]),
  ]
  const invalidRequiredLabels = [
    ...invalidRequiredFields.map((field) => FIELD_LABELS[field]),
    ...(investmentRowsNeedInput ? ["투자이력"] : []),
  ]

  function markTouched(field: keyof CompanyInfoForm) {
    setTouched((prev) => ({ ...prev, [field]: true }))
  }

  function isFieldInvalid(field: keyof CompanyInfoForm) {
    if (shouldSkipFieldValidation(field)) return false
    if (!touched[field]) return false
    const value = form[field] ?? ""
    if (!isFilled(value)) return true
    if (!meetsMinLength(field, value)) return true
    if (field === "ceoEmail") return !isEmail(value)
    if (field === "ceoPhone") return !isPhone(value)
    if (field === "businessNumber") return !isBusinessNumber(value)
    return false
  }

  function isFieldValid(field: keyof CompanyInfoForm) {
    if (shouldSkipFieldValidation(field)) return true
    const value = form[field] ?? ""
    if (!isFilled(value)) return false
    if (!meetsMinLength(field, value)) return false
    if (field === "ceoEmail") return isEmail(value)
    if (field === "ceoPhone") return isPhone(value)
    if (field === "businessNumber") return isBusinessNumber(value)
    return true
  }

  function addInvestmentRow() {
    setInvestmentRows((prev) => [
      ...prev,
      { stage: "", date: "", postMoney: "", majorShareholder: "" },
    ])
  }

  function removeInvestmentRow(target: number) {
    setInvestmentRows((prev) => {
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

  useEffect(() => {
    if (!certificationDropdownOpen) return

    function handleOutsideClick(event: MouseEvent) {
      const current = certificationDropdownRef.current
      if (!current) return
      if (event.target instanceof Node && current.contains(event.target)) return
      setCertificationDropdownOpen(false)
    }

    document.addEventListener("mousedown", handleOutsideClick)
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick)
    }
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
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick)
    }
  }, [programDropdownOpen])

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

  function parseDelimitedSelections(value: unknown) {
    if (Array.isArray(value)) {
      return value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    }
    if (typeof value !== "string") {
      return []
    }
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  }

  function parseInvestmentStages(value: unknown) {
    return parseDelimitedSelections(value)
  }

  function parseCertificationSelections(value: unknown) {
    return parseDelimitedSelections(value)
  }

  function serializeDelimitedSelections(values: string[]) {
    return values.join(", ")
  }

  function serializeInvestmentStages(values: string[]) {
    return serializeDelimitedSelections(values)
  }

  function toggleProgram(programId: string) {
    setSelectedProgramIds((prev) =>
      prev.includes(programId)
        ? prev.filter((value) => value !== programId)
        : [...prev, programId]
    )
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

  function toggleCertification(option: string) {
    const normalized = option.trim()
    if (!normalized) return
    const currentSelections = parseCertificationSelections(form.certification)
    const exists = currentSelections.includes(normalized)
    const nextSelections = exists
      ? currentSelections.filter((item) => item !== normalized)
      : [...currentSelections, normalized]
    setForm((prev) => ({
      ...prev,
      certification: serializeDelimitedSelections(nextSelections),
    }))
    markTouched("certification")
  }

  function removeCertification(option: string) {
    const nextSelections = parseCertificationSelections(form.certification).filter(
      (item) => item !== option
    )
    setForm((prev) => ({
      ...prev,
      certification: serializeDelimitedSelections(nextSelections),
    }))
    markTouched("certification")
  }

  async function handleSubmit() {
    if (submitLockRef.current) return
    submitLockRef.current = true
    setSaving(true)
    try {
      const authUser = await ensureAuthUser()
      if (!authUser) return false
      const canProceed = await guardExistingProfile(authUser, requestedRole)
      if (!canProceed) return false
      const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null
      await createSignupRequest(
        authUser.uid,
        "company",
        requestedRole,
        authUser.email ?? userEmail,
        {
          companyId: authUser.uid,
          companyInfo: form,
          programIds: selectedProgramIds,
          investmentRows,
          consents: {
            terms: {
              consented: consentTerms,
              version: CONSENT_VERSION,
              method: CONSENT_METHOD,
              userAgent,
            },
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
      return true
    } catch (error) {
      const code = getErrorCode(error)
      toast.error(
        code
          ? `승인 요청에 실패했습니다. (${code})`
          : "승인 요청에 실패했습니다. 다시 시도해주세요."
      )
      return false
    } finally {
      submitLockRef.current = false
      setSaving(false)
    }
  }

  async function handleSubmitRequest() {
    if (!canSubmit || saving) return
    if (!consentTerms || !consentPrivacy) {
      setConsentError(null)
      setConsentOpen(true)
      return
    }
    await handleSubmit()
  }

  async function handleConsentConfirm() {
    if (!consentTerms && !consentPrivacy) {
      setConsentError("서비스 이용약관 및 개인정보 수집·이용 동의는 필수입니다.")
      return
    }
    if (!consentTerms) {
      setConsentError("서비스 이용약관 동의는 필수입니다.")
      return
    }
    if (!consentPrivacy) {
      setConsentError("개인정보 수집·이용 동의는 필수입니다.")
      return
    }

    const submitted = await handleSubmit()
    if (submitted) {
      setConsentOpen(false)
    }
  }

  function inputClass(invalid?: boolean, extra?: string) {
    return [
      "mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:placeholder:text-slate-300",
      invalid
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
          ? "bg-slate-700 text-white"
          : "text-slate-500 hover:bg-white/80 hover:text-slate-700",
    ].join(" ")
  }

  function applyCompanyType(nextType: (typeof COMPANY_TYPE_OPTIONS)[number]) {
    setForm((prev) => {
      if (nextType !== "예비창업") {
        return {
          ...prev,
          companyType: nextType,
        }
      }

      return {
        ...prev,
        companyType: nextType,
        foundedAt: "",
        businessNumber: "",
        website: "",
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

    setInvestmentRows([{ stage: "", date: "", postMoney: "", majorShareholder: "" }])
  }

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
  ])

  const signupSections = useMemo(
    () => [
      { key: "company-service", label: "회사/서비스" },
      { key: "representative", label: "대표자" },
      ...(!isPreStartup
        ? [
            { key: "finance-investment", label: "재무 및 투자이력" },
            { key: "certification-voucher", label: "인증 및 바우처" },
          ]
        : []),
      { key: "funding", label: "투자희망" },
    ],
    [isPreStartup]
  )
  const signupSectionCompletion = useMemo(() => {
    const companyServiceFields: (keyof CompanyInfoForm)[] = [
      "companyType",
      "companyInfo",
      "representativeSolution",
      "sdgPriority1",
      "sdgPriority2",
    ]
    if (!isPreStartup) {
      companyServiceFields.push(
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
      )
    }

    const representativeFields: (keyof CompanyInfoForm)[] = [
      "ceoName",
      "ceoBirthDate",
      "ceoEmail",
      "ceoPhone",
      "ceoGender",
      "ceoNationality",
      "founderSerialNumber",
      "hasCoRepresentative",
    ]
    if (form.hasCoRepresentative === "예") {
      representativeFields.push(
        "coRepresentativeName",
        "coRepresentativeBirthDate",
        "coRepresentativeGender",
        "coRepresentativeTitle",
      )
    }

    const financeFields: (keyof CompanyInfoForm)[] = [
      "revenue2025",
      "revenue2026",
      "capitalTotal",
    ]
    const certificationFields: (keyof CompanyInfoForm)[] = [
      "certification",
      "tipsLipsHistory",
      "exportVoucherHeld",
      "innovationVoucherHeld",
    ]
    if (form.exportVoucherHeld === "예") {
      certificationFields.push("exportVoucherAmount", "exportVoucherUsageRate")
    }
    if (form.innovationVoucherHeld === "예") {
      certificationFields.push(
        "innovationVoucherAmount",
        "innovationVoucherUsageRate"
      )
    }
    const fundingFields: (keyof CompanyInfoForm)[] = [
      "desiredInvestment2026",
      "desiredPreValue",
      "myscExpectation",
    ]

    return {
      "company-service": companyServiceFields.every(isFieldValid),
      representative: representativeFields.every(isFieldValid),
      "finance-investment": isPreStartup
        ? true
        : financeFields.every(isFieldValid) && investmentRowsComplete,
      "certification-voucher": isPreStartup
        ? true
        : certificationFields.every(isFieldValid),
      funding: fundingFields.every(isFieldValid),
    } as Record<string, boolean>
  }, [form, investmentRowsComplete, isPreStartup])

  useEffect(() => {
    if (signupSections.some((section) => section.key === activeSignupSection)) return
    setActiveSignupSection("company-service")
  }, [activeSignupSection, signupSections])

  function scrollToSignupSection(sectionKey: string) {
    setActiveSignupSection(sectionKey)
    signupSectionRefs.current[sectionKey]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    })
  }

  return (
    <div className="h-full overflow-hidden bg-gray-50 p-6">
      <div className="mx-auto h-full w-full max-w-6xl">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="shrink-0 border-b border-slate-200 bg-white px-8 py-5">
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-800"
              onClick={onCancel}
            >
              <ArrowLeft className="h-4 w-4" />
              <span>로그인으로 돌아가기</span>
            </button>
            <button
              type="button"
              data-testid="company-signup-submit-mobile"
              onClick={() => {
                void handleSubmitRequest()
              }}
              disabled={!canSubmit || saving}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 lg:hidden"
            >
              {saving ? "요청 중..." : "승인 대기 요청"}
            </button>
          </div>
          <div className="mt-3 space-y-2">
            <h1 className="text-2xl font-semibold text-slate-900">
              기업 정보 입력
            </h1>
            <p className="text-sm text-slate-500">
              필수 정보를 모두 입력해야 승인 대기로 이동할 수 있습니다.
            </p>
            {!canSubmit ? (
              <div className="text-xs text-amber-700">
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
            ) : (
              <div className="text-xs font-semibold text-slate-600">필수 입력이 모두 완료되었습니다.</div>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 gap-6 overflow-hidden p-6 lg:p-8">
          <aside className="hidden w-64 shrink-0 lg:block">
            <div className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">기업 유형</div>
              <div className="mt-3 inline-grid w-fit grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                {COMPANY_TYPE_OPTIONS.map((option) => {
                  const active = form.companyType === option
                  return (
                    <button
                      key={option}
                      type="button"
                      data-testid={`company-type-${option === "예비창업" ? "prestartup" : "corporation"}`}
                      className={segmentedToggleClass(active)}
                      onClick={() => applyCompanyType(option)}
                    >
                      {option}
                    </button>
                  )
                })}
              </div>
              <div className="mt-5 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {signupSections.map((section) => {
                  const active = activeSignupSection === section.key
                  return (
                    <button
                      key={section.key}
                      type="button"
                      onClick={() => scrollToSignupSection(section.key)}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${
                        active
                          ? "border border-slate-300 bg-slate-100 text-slate-900"
                          : "border border-transparent bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                      }`}
                    >
                      <span>{section.label}</span>
                      {signupSectionCompletion[section.key] ? (
                        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-white">
                          <Check className="h-3 w-3" />
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
              <div className="mt-5 border-t border-slate-100 pt-4">
                <div className="flex justify-end">
                  <button
                    type="button"
                    data-testid="company-signup-submit"
                    onClick={() => {
                      void handleSubmitRequest()
                    }}
                    disabled={!canSubmit || saving}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "요청 중..." : "승인 대기 요청"}
                  </button>
                </div>
              </div>
            </div>
          </aside>

          <div className="min-w-0 flex-1 space-y-5 overflow-y-auto pr-1">
            <section
              ref={(element) => {
                signupSectionRefs.current["company-service"] = element
              }}
              className="space-y-4"
            >
              <div className="text-sm font-semibold text-slate-700">회사/서비스</div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="grid gap-3 md:grid-cols-6">
                  <label className="text-xs text-slate-500 md:col-span-3">
                    기업/팀명
                    <input
                      data-testid="company-signup-name"
                      className={inputClass(isFieldInvalid("companyInfo"))}
                      placeholder={
                        isPreStartup
                          ? "팀명 또는 창업 예정 기업명을 입력하세요"
                          : "법인등기부등본 기준 회사명을 입력하세요"
                      }
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
                  <label className="text-xs text-slate-500 md:col-span-3">
                    2026년 MYSC 참여사업
                    <div className="relative mt-1" ref={programDropdownRef}>
                      <div
                        data-testid="company-program-trigger"
                        tabIndex={0}
                        className={inputClass(false, "cursor-pointer pr-9 text-left")}
                        onMouseDown={(event) => {
                          event.preventDefault()
                          setProgramDropdownOpen((prev) => !prev)
                        }}
                      >
                        {selectedProgramIds.length > 0 ? (
                          <div className="truncate pr-2 text-sm text-slate-700">
                        {uniquePrograms
                          .filter((program) => selectedProgramIds.includes(program.id))
                          .map((program) => program.name)
                          .join(", ")}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">
                            참여 중인 사업을 선택하세요
                          </span>
                        )}
                      </div>
                      <ChevronDown
                        className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                        aria-hidden="true"
                      />
                      {programDropdownOpen ? (
                        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                          {uniquePrograms.length > 0 ? (
                            uniquePrograms.map((program) => {
                              const isSelected = selectedProgramIds.includes(program.id)
                              return (
                                <button
                                  key={program.id}
                                  type="button"
                                  data-testid={`company-program-option-${program.id}`}
                                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs ${
                                    isSelected
                                      ? "bg-slate-100 font-semibold text-slate-900"
                                      : "text-slate-700 hover:bg-slate-50"
                                  }`}
                                  onMouseDown={(event) => {
                                    event.preventDefault()
                                    toggleProgram(program.id)
                                  }}
                                >
                                  <span
                                    className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
                                      isSelected
                                        ? "border-slate-700 bg-slate-700 text-white"
                                        : "border-slate-300 bg-white text-transparent"
                                    }`}
                                  >
                                    <Check className="h-3 w-3" />
                                  </span>
                                  <span className="min-w-0 flex-1 truncate">{program.name}</span>
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
                  <label className="text-xs text-slate-500 md:col-span-2">
                    대표 솔루션 한 줄 소개
                    <input
                      className={inputClass(isFieldInvalid("representativeSolution"))}
                      maxLength={REPRESENTATIVE_SOLUTION_MAX_LENGTH}
                      placeholder="기업/서비스를 한 줄로 소개해주세요"
                      value={form.representativeSolution}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          representativeSolution: e.target.value.slice(
                            0,
                            REPRESENTATIVE_SOLUTION_MAX_LENGTH
                          ),
                        }))
                      }
                      onBlur={() => markTouched("representativeSolution")}
                    />
                    <div className="mt-1 text-[11px] text-slate-400">
                      {Math.min(
                        representativeSolutionLength,
                        REPRESENTATIVE_SOLUTION_MIN_LENGTH
                      )}/{REPRESENTATIVE_SOLUTION_MIN_LENGTH}자
                    </div>
                  </label>
                  <label className="text-xs text-slate-500 md:col-span-2">
                    UN SDGs 우선순위 1위
                    <div className="relative">
                      <select
                        className={`${inputClass(isFieldInvalid("sdgPriority1"))} appearance-none pr-10`}
                        value={form.sdgPriority1}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, sdgPriority1: e.target.value }))
                        }
                        onBlur={() => markTouched("sdgPriority1")}
                      >
                        <option value="">선택</option>
                        {SDG_OPTIONS.map((option) => (
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
                  <label className="text-xs text-slate-500 md:col-span-2">
                    UN SDGs 우선순위 2위
                    <div className="relative">
                      <select
                        className={`${inputClass(isFieldInvalid("sdgPriority2"))} appearance-none pr-10`}
                        value={form.sdgPriority2}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, sdgPriority2: e.target.value }))
                        }
                        onBlur={() => markTouched("sdgPriority2")}
                      >
                        <option value="">선택</option>
                        {SDG_SECONDARY_OPTIONS.map((option) => (
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
                  {!isPreStartup ? (
                    <>
                      <div className="mt-2 border-t border-slate-100 pt-5 md:col-span-6" />
                      <label className="text-xs text-slate-500 md:col-span-2">
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
                      <label className="text-xs text-slate-500 md:col-span-2">
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
                      <label className="text-xs text-slate-500 md:col-span-2">
                        회사 홈페이지
                        <input
                          className={inputClass(isFieldInvalid("website"))}
                          placeholder="https://example.com"
                          value={form.website}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, website: e.target.value }))
                          }
                          onBlur={() => markTouched("website")}
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
                      <label className="text-xs text-slate-500 md:col-span-2">
                        해외 지사 또는 진출 희망국가 (최대 3개)
                        <input
                          className={inputClass(isFieldInvalid("targetCountries"))}
                          placeholder="없으면 '없음' 입력"
                          value={form.targetCountries}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              targetCountries: e.target.value,
                            }))
                          }
                          onBlur={() => markTouched("targetCountries")}
                        />
                      </label>
                      <div className="mt-2 border-t border-slate-100 pt-5 md:col-span-6" />
                      <label className="text-xs text-slate-500 md:col-span-3">
                        <div className="flex items-center justify-between gap-2">
                          <span>
                            본점 소재지{" "}
                            <span className="text-[11px] text-slate-400">
                              (법인등기부등본 기준)
                            </span>
                          </span>
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
                            className={inputClass(isFieldInvalid("headOffice"), "pr-8")}
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
                      <label className="text-xs text-slate-500 md:col-span-3">
                        <div className="flex items-center justify-between gap-2">
                          <span>
                            지점 또는 연구소 소재지{" "}
                            <span className="text-[11px] text-slate-400">
                              (법인등기부등본 기준)
                            </span>
                          </span>
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
                            className={inputClass(isFieldInvalid("branchOffice"), "pr-8")}
                            placeholder="없으면 '없음' 입력"
                            value={form.branchOffice}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                branchOffice: e.target.value,
                              }))
                            }
                            onBlur={() => markTouched("branchOffice")}
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
                      <div className="mt-1 border-t border-slate-100 pt-5 md:col-span-6" />
                      <label className="text-xs text-slate-500 md:col-span-2">
                        종업원수 (정규, 4대보험 가입자 수 기준)
                        <InputSuffix suffix="명">
                          <input
                            className={inputClass(isFieldInvalid("workforceFullTime"), "mt-0")}
                            placeholder="0"
                            value={form.workforceFullTime}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                workforceFullTime: formatNumberInput(e.target.value),
                              }))
                            }
                            onBlur={() => markTouched("workforceFullTime")}
                          />
                        </InputSuffix>
                      </label>
                      <label className="text-xs text-slate-500 md:col-span-2">
                        종업원수 (계약, 4대보험 가입자 수 기준)
                        <InputSuffix suffix="명">
                          <input
                            className={inputClass(isFieldInvalid("workforceContract"), "mt-0")}
                            placeholder="0"
                            value={form.workforceContract}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                workforceContract: formatNumberInput(e.target.value),
                              }))
                            }
                            onBlur={() => markTouched("workforceContract")}
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
                signupSectionRefs.current.representative = element
              }}
              className="space-y-4"
            >
              <div className="text-sm font-semibold text-slate-700">대표자</div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="grid gap-3 md:grid-cols-6">
                  <label className="text-xs text-slate-500 md:col-span-2">
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
                    대표자 생년월일
                    <input
                      type="date"
                      className={inputClass(isFieldInvalid("ceoBirthDate"))}
                      value={form.ceoBirthDate}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          ceoBirthDate: e.target.value,
                        }))
                      }
                      onBlur={() => markTouched("ceoBirthDate")}
                    />
                  </label>
                  <label className="text-xs text-slate-500 md:col-span-1">
                    대표자 나이
                    <input
                      className={inputClass(isFieldInvalid("ceoAge"))}
                      inputMode="numeric"
                      placeholder="예: 42"
                      value={form.ceoAge}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          ceoAge: e.target.value.replace(/[^\d]/g, "").slice(0, 3),
                        }))
                      }
                      onBlur={() => markTouched("ceoAge")}
                    />
                  </label>
                  <label className="text-xs text-slate-500 md:col-span-3">
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
                  <label className="text-xs text-slate-500 md:col-span-2">
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
                    <span className="block">대표자 성별</span>
                    <div className="mt-1 inline-grid w-fit grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1">
                      {GENDER_OPTIONS.map((option) => {
                        const active = form.ceoGender === option
                        return (
                          <button
                            key={option}
                            type="button"
                            data-testid={`company-ceo-gender-${option === "남" ? "male" : "female"}`}
                            className={segmentedToggleClass(active)}
                            onClick={() => {
                              setForm((prev) => ({
                                ...prev,
                                ceoGender: prev.ceoGender === option ? "" : option,
                              }))
                              markTouched("ceoGender")
                            }}
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
                      className={inputClass(isFieldInvalid("ceoNationality"))}
                      placeholder="예: 대한민국"
                      value={form.ceoNationality}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          ceoNationality: e.target.value,
                        }))
                      }
                      onBlur={() => markTouched("ceoNationality")}
                    />
                  </label>
                  <label className="text-xs text-slate-500 md:col-span-1">
                    이전 창업 횟수
                    <input
                      className={inputClass(isFieldInvalid("founderSerialNumber"))}
                      inputMode="numeric"
                      placeholder="예: 1"
                      value={form.founderSerialNumber}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          founderSerialNumber: e.target.value
                            .replace(/[^\d]/g, "")
                            .slice(0, 2),
                        }))
                      }
                      onBlur={() => markTouched("founderSerialNumber")}
                    />
                  </label>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-slate-700">
                          공동대표 정보
                        </div>
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
                              data-testid={`company-corep-${option === "예" ? "yes" : "no"}`}
                              className={segmentedToggleClass(active)}
                              onClick={() => {
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
                                markTouched("hasCoRepresentative")
                              }}
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
                            className={inputClass(isFieldInvalid("coRepresentativeName"))}
                            placeholder="홍길동"
                            value={form.coRepresentativeName}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                coRepresentativeName: e.target.value,
                              }))
                            }
                            onBlur={() => markTouched("coRepresentativeName")}
                          />
                        </label>
                        <label className="text-xs text-slate-500 md:col-span-2">
                          공동대표 생년월일
                          <input
                            type="date"
                            className={inputClass(isFieldInvalid("coRepresentativeBirthDate"))}
                            value={form.coRepresentativeBirthDate}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                coRepresentativeBirthDate: e.target.value,
                              }))
                            }
                            onBlur={() => markTouched("coRepresentativeBirthDate")}
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
                                  className={segmentedToggleClass(active)}
                                  onClick={() => {
                                    setForm((prev) => ({
                                      ...prev,
                                      coRepresentativeGender:
                                        prev.coRepresentativeGender === option ? "" : option,
                                    }))
                                    markTouched("coRepresentativeGender")
                                  }}
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
                            className={inputClass(isFieldInvalid("coRepresentativeTitle"))}
                            placeholder="예: COO"
                            value={form.coRepresentativeTitle}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                coRepresentativeTitle: e.target.value,
                              }))
                            }
                            onBlur={() => markTouched("coRepresentativeTitle")}
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
                  signupSectionRefs.current["finance-investment"] = element
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
                          className={inputClass(isFieldInvalid("revenue2025"), "mt-0")}
                          placeholder="예: 1,250,000,000"
                          value={form.revenue2025}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              revenue2025: formatRevenueInput(e.target.value),
                            }))
                          }
                          onBlur={() => markTouched("revenue2025")}
                        />
                      </InputSuffix>
                    </label>
                    <label className="text-xs text-slate-500 md:col-span-2 md:max-w-md">
                      매출액 (2026년)
                      <InputSuffix suffix="원">
                        <input
                          className={inputClass(isFieldInvalid("revenue2026"), "mt-0")}
                          placeholder="예: 1,800,000,000"
                          value={form.revenue2026}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              revenue2026: formatRevenueInput(e.target.value),
                            }))
                          }
                          onBlur={() => markTouched("revenue2026")}
                        />
                      </InputSuffix>
                    </label>
                    <label className="text-xs text-slate-500 md:col-span-2 md:max-w-md">
                      자본총계
                      <InputSuffix suffix="원">
                        <input
                          className={inputClass(isFieldInvalid("capitalTotal"), "mt-0")}
                          placeholder="예: 300,000,000"
                          value={form.capitalTotal}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              capitalTotal: formatSignedNumberInput(e.target.value),
                            }))
                          }
                          onBlur={() => markTouched("capitalTotal")}
                        />
                      </InputSuffix>
                    </label>
                  </div>
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold text-slate-600">
                        투자이력 (순서별 작성)
                      </div>
                      <button
                        type="button"
                        className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        onClick={addInvestmentRow}
                        disabled={investmentRows.length >= 3}
                      >
                        {investmentRows.length >= 3 ? "최대 3개" : "+ 투자이력 추가"}
                      </button>
                    </div>
                    {investmentRows.map((row, idx) => {
                      const selectedStages = parseInvestmentStages(row.stage)
                      return (
                        <div
                          key={`investment-${idx}`}
                          className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(240px,2fr)_minmax(120px,0.95fr)_minmax(150px,1.1fr)_minmax(170px,1.35fr)_auto] lg:items-end"
                        >
                          <label className="min-w-0 text-xs text-slate-500">
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
                                  "min-h-[40px] cursor-pointer rounded-lg pr-9"
                                )}
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
                                        className="inline-flex h-5 items-center gap-1 rounded-full border border-slate-400 bg-slate-100 px-1.5 text-[9px] font-medium text-slate-700"
                                      >
                                        <span>{stage}</span>
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
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="inline-block min-w-max whitespace-nowrap text-sm text-slate-400">
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
                          <label className="min-w-0 text-xs text-slate-500">
                            <span className="block whitespace-nowrap">투자유치시기</span>
                            <input
                              type="text"
                              className={inputClass(false, "rounded-lg")}
                              inputMode="numeric"
                              maxLength={10}
                              placeholder="YYYY.MM.DD"
                              value={row.date}
                              onInput={(e) => {
                                const nextValue = formatInvestmentDateInput(
                                  e.currentTarget.value
                                )
                                e.currentTarget.value = nextValue
                                updateInvestmentRow(idx, "date", nextValue)
                              }}
                              onBlur={(e) => {
                                const nextValue = formatInvestmentDateInput(
                                  e.currentTarget.value
                                )
                                const digits = nextValue.replace(/[^\d]/g, "")
                                updateInvestmentRow(
                                  idx,
                                  "date",
                                  digits.length === 8 ? nextValue : ""
                                )
                              }}
                            />
                          </label>
                          <label className="min-w-0 text-xs text-slate-500">
                            <span className="block whitespace-nowrap">투자 유치금액</span>
                            <InputSuffix suffix="원">
                              <input
                                className={inputClass(false, "mt-0 rounded-lg")}
                                placeholder="예: 2,550,000,000"
                                inputMode="numeric"
                                value={row.postMoney}
                                onChange={(e) =>
                                  updateInvestmentRow(idx, "postMoney", e.target.value)
                                }
                              />
                            </InputSuffix>
                          </label>
                          <div className="flex items-start gap-2">
                            <label className="min-w-0 flex-1 text-xs text-slate-500">
                              <span className="block whitespace-nowrap">주주명(지분율 상위 3명)</span>
                              <input
                                className={inputClass(false, "rounded-lg")}
                                placeholder="예: 홍길동, 김철수, 박영희"
                                value={row.majorShareholder}
                                onChange={(e) =>
                                  updateInvestmentRow(idx, "majorShareholder", e.target.value)
                                }
                              />
                            </label>
                            <button
                              type="button"
                              className="mt-5 shrink-0 rounded-md border border-rose-200 p-2 text-rose-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => removeInvestmentRow(idx)}
                              aria-label="삭제"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </section>
            ) : null}

            {!isPreStartup ? (
              <section
                ref={(element) => {
                  signupSectionRefs.current["certification-voucher"] = element
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
                            isFieldInvalid("certification"),
                            "min-h-[40px] cursor-pointer rounded-lg pr-9"
                          )}
                          onMouseDown={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            setCertificationDropdownOpen((prev) => !prev)
                          }}
                        >
                          {parseCertificationSelections(form.certification).length > 0 ? (
                            <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap pr-1">
                              {parseCertificationSelections(form.certification).map((option) => (
                                <span
                                  key={option}
                                  className="inline-flex h-5 items-center gap-1 rounded-full border border-slate-400 bg-slate-100 px-1.5 text-[9px] font-medium text-slate-700"
                                >
                                  <span>{option}</span>
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
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm text-slate-400">
                              인증/지정 여부를 선택하세요
                            </span>
                          )}
                        </div>
                        <ChevronDown
                          className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                          aria-hidden="true"
                        />
                        {certificationDropdownOpen ? (
                          <div className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                            {CERTIFICATION_OPTIONS.map((option) => {
                              const isSelected = parseCertificationSelections(
                                form.certification
                              ).includes(option)
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
                          className={`${inputClass(isFieldInvalid("tipsLipsHistory"))} appearance-none pr-10`}
                          value={form.tipsLipsHistory}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              tipsLipsHistory: e.target.value,
                            }))
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
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <label className="text-xs text-slate-500">
                        <span className="block">수출바우처 보유 여부</span>
                        <div className="mt-3 inline-grid w-fit grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1">
                          {YES_NO_OPTIONS.map((option) => {
                            const active = form.exportVoucherHeld === option
                            return (
                              <button
                                key={option}
                                type="button"
                                className={segmentedToggleClass(active)}
                                onClick={() => {
                                  setForm((prev) => ({
                                    ...prev,
                                    exportVoucherHeld:
                                      prev.exportVoucherHeld === option ? "" : option,
                                  }))
                                  markTouched("exportVoucherHeld")
                                }}
                              >
                                {option}
                              </button>
                            )
                          })}
                        </div>
                      </label>
                      <div className="mt-5 grid gap-3">
                        <label className="text-xs text-slate-500">
                          수출바우처 확보 금액
                          <InputSuffix suffix="원" disabled={form.exportVoucherHeld !== "예"}>
                            <input
                              className={inputClass(
                                isFieldInvalid("exportVoucherAmount"),
                                "mt-0"
                              )}
                              placeholder="예: 50,000,000"
                              inputMode="numeric"
                              value={form.exportVoucherAmount}
                              disabled={form.exportVoucherHeld !== "예"}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  exportVoucherAmount: formatNumberInput(e.target.value),
                                }))
                              }
                              onBlur={() => markTouched("exportVoucherAmount")}
                            />
                          </InputSuffix>
                        </label>
                        <label className="text-xs text-slate-500">
                          수출바우처 소진율
                          <InputSuffix suffix="%" disabled={form.exportVoucherHeld !== "예"}>
                            <input
                              className={inputClass(
                                isFieldInvalid("exportVoucherUsageRate"),
                                "mt-0"
                              )}
                              placeholder="예: 40"
                              inputMode="numeric"
                              value={form.exportVoucherUsageRate}
                              disabled={form.exportVoucherHeld !== "예"}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  exportVoucherUsageRate: formatNumberInput(e.target.value),
                                }))
                              }
                              onBlur={() => markTouched("exportVoucherUsageRate")}
                            />
                          </InputSuffix>
                        </label>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <label className="text-xs text-slate-500">
                        <span className="block">중소기업혁신바우처 보유 여부</span>
                        <div className="mt-3 inline-grid w-fit grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1">
                          {YES_NO_OPTIONS.map((option) => {
                            const active = form.innovationVoucherHeld === option
                            return (
                              <button
                                key={option}
                                type="button"
                                className={segmentedToggleClass(active)}
                                onClick={() => {
                                  setForm((prev) => ({
                                    ...prev,
                                    innovationVoucherHeld:
                                      prev.innovationVoucherHeld === option ? "" : option,
                                  }))
                                  markTouched("innovationVoucherHeld")
                                }}
                              >
                                {option}
                              </button>
                            )
                          })}
                        </div>
                      </label>
                      <div className="mt-5 grid gap-3">
                        <label className="text-xs text-slate-500">
                          중소기업혁신바우처 확보 금액
                          <InputSuffix suffix="원" disabled={form.innovationVoucherHeld !== "예"}>
                            <input
                              className={inputClass(
                                isFieldInvalid("innovationVoucherAmount"),
                                "mt-0"
                              )}
                              placeholder="예: 30,000,000"
                              inputMode="numeric"
                              value={form.innovationVoucherAmount}
                              disabled={form.innovationVoucherHeld !== "예"}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  innovationVoucherAmount: formatNumberInput(e.target.value),
                                }))
                              }
                              onBlur={() => markTouched("innovationVoucherAmount")}
                            />
                          </InputSuffix>
                        </label>
                        <label className="text-xs text-slate-500">
                          중소기업혁신바우처 소진율
                          <InputSuffix suffix="%" disabled={form.innovationVoucherHeld !== "예"}>
                            <input
                              className={inputClass(
                                isFieldInvalid("innovationVoucherUsageRate"),
                                "mt-0"
                              )}
                              placeholder="예: 75"
                              inputMode="numeric"
                              value={form.innovationVoucherUsageRate}
                              disabled={form.innovationVoucherHeld !== "예"}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  innovationVoucherUsageRate: formatNumberInput(e.target.value),
                                }))
                              }
                              onBlur={() => markTouched("innovationVoucherUsageRate")}
                            />
                          </InputSuffix>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            <section
              ref={(element) => {
                signupSectionRefs.current.funding = element
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
                        className={inputClass(isFieldInvalid("desiredInvestment2026"), "mt-0")}
                        placeholder="예: 2,050,000,000"
                        inputMode="numeric"
                        value={form.desiredInvestment2026}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            desiredInvestment2026: formatRevenueInput(e.target.value),
                          }))
                        }
                        onBlur={() => markTouched("desiredInvestment2026")}
                      />
                    </InputSuffix>
                  </label>
                  <label className="text-xs text-slate-500 md:col-span-2 md:max-w-md">
                    투자전 희망기업가치 (Pre-Value)
                    <InputSuffix suffix="원">
                      <input
                        className={inputClass(isFieldInvalid("desiredPreValue"), "mt-0")}
                        placeholder="예: 20,000,000,000"
                        inputMode="numeric"
                        value={form.desiredPreValue}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            desiredPreValue: formatRevenueInput(e.target.value),
                          }))
                        }
                        onBlur={() => markTouched("desiredPreValue")}
                      />
                    </InputSuffix>
                  </label>
                </div>
                <div className="mt-3">
                  <label className="text-xs text-slate-500">
                    MYSC에 가장 기대하는 점
                    <input
                      className={inputClass(isFieldInvalid("myscExpectation"))}
                      placeholder="MYSC에 기대하는 점을 입력하세요"
                      value={form.myscExpectation}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          myscExpectation: e.target.value,
                        }))
                      }
                      onBlur={() => markTouched("myscExpectation")}
                    />
                    <div className="mt-1 text-[11px] text-slate-400">
                      {myscExpectationLength}/{MYSC_EXPECTATION_MIN_LENGTH}자 이상
                    </div>
                  </label>
                </div>
              </div>
            </section>
          </div>
      </div>
      </div>
      </div>

      {consentOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 px-4 py-6 sm:py-8">
          <div className="flex min-h-full items-center justify-center">
            <div className="flex w-full max-w-lg max-h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-2xl bg-white p-6 shadow-xl sm:max-h-[calc(100vh-4rem)]">
            <div className="flex shrink-0 items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">약관 및 동의</h2>
                <p className="mt-1 text-sm text-slate-500">
                  필수 동의와 선택 동의를 구분해 받으며, 선택 동의 미동의 시에도 회원가입은 가능합니다.
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

            <div className="mt-5 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 text-sm">
              <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <input
                  type="checkbox"
                  data-testid="company-consent-terms"
                  className="mt-1"
                  checked={consentTerms}
                  onChange={(e) => {
                    setConsentTerms(e.target.checked)
                    if (e.target.checked) setConsentError(null)
                  }}
                />
                <span>
                  <span className="font-semibold text-slate-900">서비스 이용약관</span>{" "}
                  <span className="text-rose-600">(필수)</span>
                  <span className="block text-xs text-slate-500 mt-1">
                    회원가입, 기업 등록 및 프로그램 운영 관련 서비스 이용을 위한 필수 약관입니다.
                  </span>
                </span>
              </label>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 leading-relaxed">
                <p className="font-semibold text-slate-700">[서비스 이용약관]</p>
                <p className="mt-2">제1조 (목적)</p>
                <p>
                  본 약관은 MYSC(이하 &quot;회사&quot;)가 제공하는 서비스의 이용과 관련하여 회사와 회원 간의
                  권리, 의무 및 책임사항을 정함을 목적으로 합니다.
                </p>
                <p className="mt-2">제2조 (회원가입 및 이용)</p>
                <p>
                  회원은 회사가 정한 절차에 따라 가입을 신청하고, 회사의 승인에 따라 서비스를 이용할 수
                  있습니다. 회원은 가입 신청 시 사실에 부합하는 정보를 제공하여야 하며, 제공한 정보에
                  변경이 있는 경우 이를 즉시 수정하거나 회사에 알려야 합니다.
                </p>
                <p className="mt-2">제3조 (서비스의 제공)</p>
                <p>
                  회사는 회원에게 기업 등록, 프로그램 신청 및 참여, 심사 및 운영 안내, 후속 지원 검토,
                  투자 검토 및 연계 가능성 검토 등 관련 서비스를 제공합니다.
                </p>
                <p className="mt-2">제4조 (기업정보의 제공 및 활용)</p>
                <p>
                  회원은 서비스 이용 과정에서 회사명, 회사 소개, 사업 내용, 매출, 자본, 투자 이력 및
                  계획, 인력 현황, 바우처 및 인증 정보 등 기업 관련 정보를 회사에 제공할 수 있습니다.
                </p>
                <p className="mt-2">회사는 회원이 제공한 기업정보를 다음 목적 범위 내에서 활용할 수 있습니다.</p>
                <p>1. 회원가입 심사 및 참여기업 확인</p>
                <p>2. 프로그램 운영, 심사, 결과 안내 및 이력 관리</p>
                <p>3. 내부 검토자료 작성, 투자 검토, 후속 지원 및 파트너 연계 가능성 검토</p>
                <p>4. 회원 문의 대응 및 서비스 운영 품질 개선</p>
                <p className="mt-2">
                  회사는 회원의 별도 동의 없이 회원이 제공한 개인정보 또는 기업정보를 외부 제3자에게
                  제공하지 않습니다. 다만, 법령에 따른 경우 또는 회원이 별도로 동의한 경우는 예외로
                  합니다.
                </p>
                <p className="mt-2">제5조 (회원의 책임)</p>
                <p>
                  회원은 타인의 정보를 도용하거나 허위 정보를 등록하여서는 안 되며, 서비스 운영을 방해하는
                  행위를 하여서는 안 됩니다.
                </p>
                <p className="mt-2">제6조 (약관의 변경)</p>
                <p>
                  회사는 관련 법령을 위반하지 않는 범위에서 약관을 변경할 수 있으며, 중요한 변경이 있는
                  경우 사전에 공지하거나 회원에게 안내합니다.
                </p>
              </div>

              <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <input
                  type="checkbox"
                  data-testid="company-consent-privacy"
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
                    회원 식별, 가입 심사, 프로그램 운영 및 관련 연락을 위한 필수 동의입니다.
                  </span>
                </span>
              </label>
              <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 leading-relaxed">
                <p className="font-semibold text-slate-700">[개인정보 수집·이용 동의] (필수)</p>
                <p className="mt-2">1. 수집·이용 목적</p>
                <p>
                  회사는 회원 식별, 가입 심사, 참여기업 확인, 프로그램 운영, 결과 안내, 문의 대응,
                  공지사항 전달, 후속 지원 검토 및 관련 연락을 위하여 개인정보를 수집·이용합니다.
                </p>
                <p className="mt-2">2. 수집 항목</p>
                <p>
                  대표자 및 담당자의 이름, 이메일 주소, 휴대전화번호, 연령, 성별, 국적, 공동대표 정보
                  (해당 시), 기타 회원가입 및 프로그램 운영에 필요한 연락 정보
                </p>
                <p className="mt-2">3. 보유 및 이용 기간</p>
                <p>
                  회원 탈퇴 시까지 보관하며, 관계 법령에 따라 별도 보관이 필요한 경우 해당 기간 동안
                  보관합니다.
                </p>
                <p className="mt-2">4. 동의 거부권 및 불이익</p>
                <p>
                  이용자는 개인정보 수집·이용에 대한 동의를 거부할 권리가 있습니다. 다만 본 동의는
                  회원가입 및 서비스 이용을 위한 필수 동의로, 동의를 거부할 경우 회원가입이 제한됩니다.
                </p>
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
                    이벤트, 뉴스레터, 프로그램 안내 수신 여부를 선택할 수 있습니다.
                  </span>
                </span>
              </label>
              <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 leading-relaxed">
                <p className="font-semibold text-slate-700">[광고성 정보 수신 동의] 선택</p>
                <p className="mt-2">1. 수신 목적</p>
                <p>
                  회사는 회원에게 이벤트, 혜택, 신규 서비스, 신규 프로그램 모집, 프로모션, 뉴스레터 등
                  광고성 정보를 전송하기 위해 개인정보를 이용합니다.
                </p>
                <p className="mt-2">2. 수집·이용 항목</p>
                <p>이메일 주소, 휴대전화번호, 앱 알림 수신 토큰(해당하는 경우)</p>
                <p className="mt-2">3. 전송 방법</p>
                <p>이메일, 문자메시지, 앱 알림(회사가 실제 제공하는 수단에 한함)</p>
                <p className="mt-2">4. 보유 및 이용 기간</p>
                <p>회원의 동의 철회 또는 회원 탈퇴 시까지 보유·이용합니다.</p>
                <p className="mt-2">5. 동의 거부권 및 불이익</p>
                <p>
                  이용자는 광고성 정보 수신에 대한 동의를 거부할 권리가 있으며, 동의하지 않더라도 서비스
                  이용에는 제한이 없습니다.
                </p>
                <p className="mt-2">6. 동의 철회 방법</p>
                <p>이용자는 계정 설정 또는 고객센터를 통해 언제든지 동의를 철회할 수 있습니다.</p>
              </div>

              {consentError ? (
                <div className="text-xs text-rose-600">{consentError}</div>
              ) : null}
            </div>

            <div className="mt-6 flex shrink-0 items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                onClick={() => setConsentOpen(false)}
                disabled={saving}
              >
                취소
              </button>
              <button
                type="button"
                data-testid="company-consent-confirm"
                disabled={saving || !consentTerms || !consentPrivacy}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => {
                  void handleConsentConfirm()
                }}
              >
                {saving ? "승인 요청 중..." : "동의하고 계속"}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
