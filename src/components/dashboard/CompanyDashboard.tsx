import type { User } from "firebase/auth"
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore"
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytesResumable,
  type UploadTask,
} from "firebase/storage"
import {
  Check,
  ChevronDown,
  Eye,
  FileImage,
  FileText,
  Loader2,
  Trash2,
  UploadCloud,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { SELF_ASSESSMENT_SECTIONS } from "@/data/selfAssessment"
import { useCompanyInfoForm } from "@/hooks/useCompanyInfoForm"
import { useSelfAssessmentForm } from "@/hooks/useSelfAssessmentForm"
import { db, storage } from "@/firebase/client"
import type { CompanyInfoForm } from "@/types/company"
import { SelfAssessmentForm } from "@/components/dashboard/SelfAssessmentForm"
import { InputSuffix } from "@/components/ui/InputSuffix"
import { MIN_SELF_ASSESSMENT_REASON_LENGTH } from "@/utils/selfAssessment"

type CompanyDashboardProps = {
  onLogout: () => void
  companyId: string
  user: User
}

type ProgramOption = {
  id: string
  name: string
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

type DashboardPageKey = "company-info" | "self-assessment"

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
              className={`inline-flex h-3 w-3 items-center justify-center text-[10px] font-bold ${active ? "text-white" : "text-amber-700"
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
    missingRequiredLabels,
    invalidRequiredLabels,
    formatNumberInput,
    formatSignedNumberInput,
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

  const [uploadingFiles, setUploadingFiles] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [availablePrograms, setAvailablePrograms] = useState<ProgramOption[]>([])
  const [deletedFileIds, setDeletedFileIds] = useState<Record<string, boolean>>(
    {}
  )
  const [deletingFileIds, setDeletingFileIds] = useState<Record<string, boolean>>(
    {}
  )
  const [companyFiles, setCompanyFiles] = useState<
    {
      id: string
      name: string
      size: number
      storagePath: string
      downloadUrl: string | null
    }[]
  >([])
  const [uploads, setUploads] = useState<
    {
      id: string
      name: string
      progress: number
      status: "queued" | "uploading" | "done" | "error" | "canceled"
      storagePath: string
      file?: File
    }[]
  >([])
  const uploadTasksRef = useRef<Map<string, UploadTask>>(new Map())

  const allowedExtensions = ["pdf", "png", "ai"]

  async function loadAvailablePrograms() {
    try {
      const programsRef = collection(db, "programs")
      const programsQuery = query(programsRef, orderBy("name", "asc"))
      const snapshot = await getDocs(programsQuery)
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
      console.warn("Failed to load programs:", error)
      setAvailablePrograms([])
    }
  }


  async function loadCompanyFiles() {
    try {
      const filesRef = collection(db, "companies", companyId, "files")
      const filesQuery = query(filesRef, orderBy("createdAt", "desc"))
      const snapshot = await getDocs(filesQuery)
      const items = await Promise.all(
        snapshot.docs.map(async (docSnap) => {
          const data = docSnap.data() as {
            name: string
            size: number
            storagePath: string
          }
          let downloadUrl: string | null = null
          try {
            downloadUrl = await getDownloadURL(
              storageRef(storage, data.storagePath)
            )
          } catch {
            downloadUrl = null
          }
          return {
            id: docSnap.id,
            name: data.name,
            size: data.size,
            storagePath: data.storagePath,
            downloadUrl,
          }
        })
      )
      setCompanyFiles(items)
      setUploads((prev) =>
        prev.filter(
          (item) =>
            !(item.status === "done" && items.some((saved) => saved.id === item.id))
        )
      )
    } catch (error) {
      console.warn("Failed to load company files:", error)
    }
  }

  useEffect(() => {
    void loadAvailablePrograms()
  }, [])

  useEffect(() => {
    if (!companyId) return
    void loadCompanyFiles()
  }, [companyId])

  async function startUpload(
    file: File,
    docId: string,
    storagePath: string
  ) {
    return new Promise<void>((resolve, reject) => {
      const task = uploadBytesResumable(storageRef(storage, storagePath), file)
      uploadTasksRef.current.set(docId, task)
      setUploads((prev) =>
        prev.map((item) =>
          item.id === docId ? { ...item, status: "uploading" } : item
        )
      )
      task.on(
        "state_changed",
        (snapshot) => {
          const rawProgress = Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          )
          const progress =
            rawProgress >= 100 ? 99 : Math.max(0, Math.min(rawProgress, 99))
          setUploads((prev) =>
            prev.map((item) =>
              item.id === docId ? { ...item, progress } : item
            )
          )
        },
        (error) => {
          uploadTasksRef.current.delete(docId)
          setUploads((prev) =>
            prev.map((item) =>
              item.id === docId ? { ...item, status: "error" } : item
            )
          )
          reject(error)
        },
        async () => {
          try {
            const downloadUrl = await getDownloadURL(task.snapshot.ref)
            await setDoc(doc(db, "companies", companyId, "files", docId), {
              name: file.name,
              size: file.size,
              contentType: file.type || null,
              storagePath,
              createdByUid: user.uid,
              createdAt: serverTimestamp(),
            })
            setUploads((prev) =>
              prev.filter((item) => item.id !== docId)
            )
            setCompanyFiles((prev) => [
              {
                id: docId,
                name: file.name,
                size: file.size,
                storagePath,
                downloadUrl,
              },
              ...prev,
            ])
            toast.success(`${file.name} 업로드 완료`)
            resolve()
          } catch (error) {
            setUploads((prev) =>
              prev.map((item) =>
                item.id === docId ? { ...item, status: "error" } : item
              )
            )
            reject(error)
          } finally {
            uploadTasksRef.current.delete(docId)
          }
        }
      )
    })
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploadError(null)
    setUploadingFiles(true)
    try {
      const entries = Array.from(files)
      const uploadJobs = entries.map(async (file) => {
        const extension = file.name.split(".").pop()?.toLowerCase() ?? ""
        if (!allowedExtensions.includes(extension)) {
          setUploadError("PDF, PNG, AI 파일만 업로드할 수 있습니다.")
          return
        }
        if (file.size > 50 * 1024 * 1024) {
          setUploadError("파일은 50MB 이하만 업로드할 수 있습니다.")
          return
        }
        await setDoc(
          doc(db, "companies", companyId),
          {
            ownerUid: user.uid,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        )
        const filesRef = collection(db, "companies", companyId, "files")
        const docRef = doc(filesRef)
        const storagePath = `company-files/${companyId}/${docRef.id}/${file.name}`
        setUploads((prev) => [
          ...prev,
          {
            id: docRef.id,
            name: file.name,
            progress: 0,
            status: "queued",
            storagePath,
            file,
          },
        ])
        await startUpload(file, docRef.id, storagePath)
      })
      await Promise.all(uploadJobs)
    } catch (error) {
      console.warn("File upload failed:", error)
      setUploadError("파일 업로드에 실패했습니다. 다시 시도해주세요.")
    } finally {
      setUploadingFiles(false)
    }
  }

  function cancelUpload(targetId: string) {
    const task = uploadTasksRef.current.get(targetId)
    if (!task) return
    task.cancel()
    uploadTasksRef.current.delete(targetId)
    setUploads((prev) =>
      prev.map((item) =>
        item.id === targetId ? { ...item, status: "canceled" } : item
      )
    )
  }

  async function retryUpload(targetId: string) {
    const target = uploads.find((item) => item.id === targetId)
    if (!target || !target.file) return
    setUploads((prev) =>
      prev.map((item) =>
        item.id === targetId
          ? { ...item, status: "queued", progress: 0 }
          : item
      )
    )
    try {
      await startUpload(target.file, target.id, target.storagePath)
      await loadCompanyFiles()
    } catch (error) {
      console.warn("Retry upload failed:", error)
    }
  }

  async function handleFileDelete(file: { id: string; storagePath: string }) {
    let storageDeleted = false
    let docDeleted = false
    try {
      setDeletingFileIds((prev) => ({ ...prev, [file.id]: true }))
      try {
        await deleteObject(storageRef(storage, file.storagePath))
        storageDeleted = true
      } catch (error: any) {
        const code = error?.code ?? ""
        if (code === "storage/object-not-found") {
          storageDeleted = true
        } else {
          throw error
        }
      }

      try {
        await deleteDoc(doc(db, "companies", companyId, "files", file.id))
        docDeleted = true
      } catch (error) {
        console.warn("Failed to delete file metadata:", error)
      }

      await loadCompanyFiles()
      if (!docDeleted) {
        toast.warning("파일은 삭제되었지만 목록 정리에 실패했습니다.")
      } else {
        setDeletedFileIds((prev) => ({ ...prev, [file.id]: true }))
        setTimeout(() => {
          setDeletedFileIds((prev) => {
            const next = { ...prev }
            delete next[file.id]
            return next
          })
        }, 2000)
        toast.success("파일이 삭제되었습니다.")
      }
    } catch (error) {
      console.warn("Failed to delete file:", error)
      toast.error("파일 삭제에 실패했습니다.")
    } finally {
      setDeletingFileIds((prev) => {
        const next = { ...prev }
        delete next[file.id]
        return next
      })
    }
  }

  const sectionStatus = useMemo<StatusItem[]>(() => {
    const isFilled = (value: string) => value.trim().length > 0
    const hasNumber = (value: string) => value.replace(/[^\d]/g, "").length > 0
    const isPreStartup = form.companyType === "예비창업"

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
      "ceoAge",
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

    const companyServiceComplete = companyServiceFields.every(isFieldValid)
    const representativeComplete = representativeFields.every(isFieldValid)
    const financeComplete = financeFields.every(isFieldValid)
    const certificationComplete = certificationFields.every(isFieldValid)
    const fundingComplete = fundingFields.every(isFieldValid)

    const hasInvestmentRows = investmentRows.length > 0
    const investmentComplete =
      !hasInvestmentRows
      || investmentRows.every(
        (row) =>
          parseInvestmentStages(row.stage).length > 0
          && isFilled(row.date)
          && hasNumber(row.postMoney)
          && isFilled(row.majorShareholder)
      )
    const financeInvestmentComplete = financeComplete && investmentComplete

    const items: StatusItem[] = [
      {
        key: "company-service",
        label: "회사/서비스",
        variant: companyServiceComplete ? "complete" : "warning" as StatusVariant,
        index: 1,
      },
      {
        key: "representative",
        label: "대표자",
        variant: representativeComplete ? "complete" : "warning" as StatusVariant,
        index: 2,
      },
      ...(isPreStartup
        ? []
        : [
            {
              key: "finance-investment",
              label: "재무/투자이력",
              variant: financeInvestmentComplete ? "complete" : "warning" as StatusVariant,
              index: 3,
            },
            {
              key: "certification-voucher",
              label: "인증 및 바우처",
              variant: certificationComplete ? "complete" : "warning" as StatusVariant,
              index: 4,
            },
          ]),
      {
        key: "funding",
        label: "투자희망",
        variant: fundingComplete ? "complete" : "warning" as StatusVariant,
        index: isPreStartup ? 3 : 5,
      },
    ]
    return items
  }, [form, investmentRows, isFieldInvalid, isFieldValid])

  const isPreStartup = form.companyType === "예비창업"
  const representativeSolutionLength = form.representativeSolution.length
  const myscExpectationLength = form.myscExpectation.length
  const [activePage, setActivePage] = useState<DashboardPageKey>("company-info")
  const [activeCompanySection, setActiveCompanySection] = useState("company-service")
  const [activeAssessmentSection, setActiveAssessmentSection] = useState(
    "problem",
  )
  const assessmentScrollRef = useRef<HTMLDivElement | null>(null)
  const companySectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const postcodeScriptLoadingRef = useRef(false)
  const [activeInvestmentStageRow, setActiveInvestmentStageRow] = useState<
    number | null
  >(null)
  const [certificationDropdownOpen, setCertificationDropdownOpen] = useState(false)
  const [programDropdownOpen, setProgramDropdownOpen] = useState(false)
  const investmentStageDropdownRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const certificationDropdownRef = useRef<HTMLDivElement | null>(null)
  const programDropdownRef = useRef<HTMLDivElement | null>(null)
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
  const assessmentSections = useMemo(
    () =>
      SELF_ASSESSMENT_SECTIONS.map((section) => {
        let answeredCountForSection = 0
        let questionCountForSection = 0

        section.subsections.forEach((subsection) => {
          subsection.questions.forEach((question) => {
            const answer =
              sections?.[section.storageKey]?.[subsection.storageKey]?.[
                question.storageKey
              ]

            questionCountForSection += 1
            const reasonLength = (answer?.reason ?? "").trim().length
            const isAnswered =
              typeof answer?.answer === "boolean"
              && reasonLength >= MIN_SELF_ASSESSMENT_REASON_LENGTH

            if (isAnswered) {
              answeredCountForSection += 1
            }
          })
        })

        return {
          key: section.storageKey,
          title: section.title,
          description: section.description,
          totalScore: section.totalScore,
          answeredCount: answeredCountForSection,
          questionCount: questionCountForSection,
          variant:
            answeredCountForSection === questionCountForSection
              ? "complete"
              : "warning",
        }
      }),
    [sections]
  )


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

  function handleRemoveInvestmentRow(index: number) {
    removeInvestmentRow(index)
    setActiveInvestmentStageRow((prev) => {
      if (prev == null) return prev
      if (prev === index) return null
      return prev > index ? prev - 1 : prev
    })
  }

  function toggleCompanyProgram(programId: string) {
    setCompanyProgramIds((prev) => {
      if (prev.includes(programId)) {
        return prev.filter((value) => value !== programId)
      }
      return [...prev, programId]
    })
  }

  function removeCompanyProgram(programId: string) {
    setCompanyProgramIds((prev) => prev.filter((value) => value !== programId))
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

  const selectedProgramOptions = useMemo(() => {
    const programById = new Map(
      availablePrograms.map((program) => [program.id, program.name])
    )
    return companyProgramIds.map((programId) => ({
      id: programId,
      name: programById.get(programId) ?? "알 수 없는 사업",
    }))
  }, [availablePrograms, companyProgramIds])

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
    [isPreStartup]
  )
  const companySectionStatusByKey = useMemo(() => {
    const byKey: Record<string, StatusVariant> = {
      "company-service": "warning",
      representative: "warning",
      "finance-investment": "warning",
      "certification-voucher": "warning",
      funding: "warning",
    }
    sectionStatus.forEach((item) => {
      if (item.key === "company-service") byKey["company-service"] = item.variant
      if (item.key === "representative") byKey.representative = item.variant
      if (item.key === "finance-investment") byKey["finance-investment"] = item.variant
      if (item.key === "certification-voucher") byKey["certification-voucher"] = item.variant
      if (item.key === "funding") byKey.funding = item.variant
    })
    return byKey
  }, [sectionStatus])

  useEffect(() => {
    if (companyInfoSections.some((section) => section.key === activeCompanySection)) {
      return
    }
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
  ])

  function scrollToCompanySection(sectionKey: string) {
    setActiveCompanySection(sectionKey)
    companySectionRefs.current[sectionKey]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    })
  }

  function selectAssessmentSection(sectionKey: string) {
    setActiveAssessmentSection(sectionKey)
    assessmentScrollRef.current?.scrollTo({
      top: 0,
      behavior: "auto",
    })
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

    if (nextType === "예비창업") {
      setActiveCompanySection("company-service")
    }
  }

  return (
    <div className="h-full w-full bg-[#f8fafc]">
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-200/80 bg-white/80 px-8 py-4 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                기업 정보 입력
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                기업 정보와 자가진단표를 각각 관리합니다.
              </p>
            </div>
          </div>
        </div>

        <div className="border-b border-slate-200 bg-slate-100 px-8 pt-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                onClick={() => setActivePage("company-info")}
                className={`relative -mb-px inline-flex items-center gap-2 rounded-t-2xl border px-4 py-2.5 text-sm font-semibold transition ${
                  activePage === "company-info"
                    ? "border-slate-300 border-b-white bg-white text-slate-950"
                    : "border-transparent bg-slate-200 text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                <span>기업 정보 입력</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    activePage === "company-info"
                      ? canSubmit
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700"
                      : canSubmit
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {canSubmit ? "완료" : "작성중"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActivePage("self-assessment")}
                className={`relative -mb-px inline-flex items-center gap-2 rounded-t-2xl border px-4 py-2.5 text-sm font-semibold transition ${
                  activePage === "self-assessment"
                    ? "border-slate-300 border-b-white bg-white text-slate-950"
                    : "border-transparent bg-slate-200 text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                <span>자가진단표</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    activePage === "self-assessment"
                      ? assessmentComplete
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700"
                      : assessmentComplete
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {assessmentComplete ? "완료" : "미완료"}
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-1 min-h-0 flex-col">
          {activePage === "self-assessment" ? (
            assessmentLoading ? (
              <div className="px-8 pb-4 pt-3">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-sm text-slate-500">
                  자가 진단표를 불러오는 중입니다.
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex flex-1 bg-[#f8fafc]">
                <aside className="hidden h-full w-72 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
                  <div className="border-b border-slate-100 px-6 py-5">
                    <div className="text-sm font-semibold text-slate-900">
                      자가진단표 작성
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      좌측 항목을 따라 영역별로 점검합니다.
                    </div>
                  </div>
                  <div className="border-b border-slate-100 px-4 py-4">
                    <div className="rounded-2xl border border-slate-600 bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 p-3.5 shadow-sm shadow-slate-900/15">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                            Overall
                          </div>
                          <div className="mt-1.5 text-xl font-semibold text-white">
                            {assessmentTotalScore}
                            <span className="ml-1 text-sm font-medium text-slate-300">
                              / 100
                            </span>
                          </div>
                        </div>
                        {assessmentComplete ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                            완료
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 text-[11px] text-slate-200">
                        완료 {answeredCount}/{totalQuestionCount}
                        {assessmentComplete ? null : ` · 미입력 ${remainingCount}개`}
                      </div>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
                    {assessmentSections.map((section) => {
                      const active = activeAssessmentSection === section.key
                      return (
                        <button
                          key={section.key}
                          type="button"
                          onClick={() => selectAssessmentSection(section.key)}
                          className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                            active
                              ? "border-slate-400 bg-white text-slate-900 shadow-lg shadow-slate-200/80 ring-1 ring-slate-200"
                              : "border-slate-200 bg-slate-50/80 text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-600"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-xs font-semibold">
                              {section.title}
                            </div>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                active
                                  ? section.variant === "complete"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-amber-100 text-amber-800"
                                  : section.variant === "complete"
                                    ? "bg-emerald-50 text-emerald-600"
                                    : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              {section.answeredCount}/{section.questionCount}
                            </span>
                          </div>
                          <div
                            className={`mt-1 text-[11px] ${
                              active ? "text-slate-600" : "text-slate-400"
                            }`}
                          >
                            {section.description}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  <div className="border-t border-slate-100 px-4 py-4">
                    <div className="flex justify-end gap-2">
                      <button
                        className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={saveSelfAssessmentDraft}
                        disabled={assessmentSaving}
                      >
                        임시저장
                      </button>
                      <button
                        className="inline-flex rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-100"
                        onClick={saveSelfAssessment}
                        disabled={assessmentSaving || !assessmentComplete}
                      >
                        저장
                      </button>
                    </div>
                  </div>
                </aside>
                <div
                  ref={assessmentScrollRef}
                  className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4 lg:px-8"
                >
                  <div className="rounded-2xl border border-slate-600 bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 p-3.5 shadow-sm shadow-slate-900/15 lg:hidden">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-[13px] font-semibold text-white">
                          자가진단표 작성
                        </div>
                        <div className="mt-1 text-[11px] text-slate-200">
                          완료 {answeredCount}/{totalQuestionCount}
                          {assessmentComplete ? null : ` · 미입력 ${remainingCount}개`}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/15 bg-white/10 px-2.5 py-1.5 text-[13px] font-semibold text-white shadow-sm backdrop-blur-sm">
                        총점 {assessmentTotalScore}/100점
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
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
                        저장
                      </button>
                    </div>
                  </div>
                  <div className="mb-4 mt-4 flex gap-2 overflow-x-auto lg:hidden">
                    {assessmentSections.map((section) => {
                      const active = activeAssessmentSection === section.key
                      return (
                        <button
                          key={section.key}
                          type="button"
                          onClick={() => selectAssessmentSection(section.key)}
                          className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                            active
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-600"
                          }`}
                        >
                          {section.title} {section.answeredCount}/{section.questionCount}
                        </button>
                      )
                    })}
                  </div>
                  <SelfAssessmentForm
                    variant="content"
                    sections={sections}
                    onAnswerChange={updateAnswer}
                    onReasonChange={updateReason}
                    activeSectionId={activeAssessmentSection}
                  />
                </div>
              </div>
            )
          ) : null}
          {activePage === "company-info" ? (
            loading ? (
              <div className="px-8 pb-4 pt-3">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-sm text-slate-500">
                  기존 데이터를 불러오는 중입니다.
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex flex-1 bg-[#f8fafc]">
                <aside className="hidden h-full w-72 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
                  <div className="border-b border-slate-100 px-6 py-5">
                    <div className="text-sm font-semibold text-slate-900">
                      기업 정보 입력
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      유형에 따라 필요한 섹션만 안내합니다.
                    </div>
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
                            onClick={() => applyCompanyType(option)}
                            className={segmentedToggleClass(active)}
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
                                active
                                  ? variant === "complete"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-amber-100 text-amber-800"
                                  : variant === "complete"
                                    ? "bg-emerald-50 text-emerald-600"
                                    : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              {variant === "complete" ? "완료" : "입력 필요"}
                            </span>
                          </div>
                          <div
                            className={`mt-1 text-[11px] ${
                              active ? "text-slate-600" : "text-slate-400"
                            }`}
                          >
                            {section.description}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  <div className="border-t border-slate-100 px-4 py-4">
                    <div className="flex justify-end gap-2">
                      <button
                        className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={saveCompanyInfoDraft}
                        disabled={saving}
                      >
                        임시저장
                      </button>
                      <button
                        className="inline-flex rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-100"
                        onClick={saveCompanyInfo}
                        disabled={saving || !canSubmit}
                      >
                        저장
                      </button>
                    </div>
                  </div>
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
                    <div className="text-sm font-semibold text-slate-700">
                      회사/서비스
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-5">
                      <div className="grid gap-3 md:grid-cols-6">
                        <label className="text-xs text-slate-500 md:col-span-3">
                          기업/팀명
                          <input
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
                              tabIndex={0}
                              className={`${inputClass(false, "cursor-pointer pr-9 text-left")}`}
                              onMouseDown={(event) => {
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
                            <ChevronDown
                              className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                              aria-hidden="true"
                            />
                            {programDropdownOpen ? (
                              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                                {availablePrograms.length > 0 ? (
                                  availablePrograms.map((program) => {
                                    const isSelected = companyProgramIds.includes(program.id)
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
                                        <span className="min-w-0 flex-1 truncate">
                                          {program.name}
                                        </span>
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
                            <div className="md:col-span-6 mt-2 border-t border-slate-100 pt-5" />
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
                                  businessNumber: formatBusinessNumber(
                                    e.target.value
                                  ),
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
                                setForm((prev) => ({ ...prev, targetCountries: e.target.value }))
                              }
                              onBlur={() => markTouched("targetCountries")}
                            />
                          </label>
                          <div className="md:col-span-6 mt-2 border-t border-slate-100 pt-5" />
                          <label className="text-xs text-slate-500 md:col-span-3">
                            <div className="flex items-center justify-between gap-2">
                              <span>본점 소재지 <span className="text-[11px] text-slate-400">(법인등기부등본 기준)</span></span>
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
                          <label className="text-xs text-slate-500 md:col-span-3">
                            <div className="flex items-center justify-between gap-2">
                              <span>지점 또는 연구소 소재지 <span className="text-[11px] text-slate-400">(법인등기부등본 기준)</span></span>
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
                                className={inputClass(
                                  isFieldInvalid("branchOffice"),
                                  "pr-8"
                                )}
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
                          <div className="md:col-span-6 mt-1 border-t border-slate-100 pt-5" />
                          <label className="text-xs text-slate-500 md:col-span-2">
                            종업원수 (정규, 4대보험 가입자 수 기준)
                            <InputSuffix suffix="명">
                              <input
                                className={inputClass(
                                  isFieldInvalid("workforceFullTime"),
                                  "mt-0"
                                )}
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
                            </InputSuffix>
                          </label>
                          <label className="text-xs text-slate-500 md:col-span-2">
                            종업원수 (계약, 4대보험 가입자 수 기준)
                            <InputSuffix suffix="명">
                              <input
                                className={inputClass(
                                  isFieldInvalid("workforceContract"),
                                  "mt-0"
                                )}
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
                    <div className="text-sm font-semibold text-slate-700">
                      대표자
                    </div>

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
                                  className={segmentedToggleClass(active)}
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
                            className={inputClass(isFieldInvalid("ceoNationality"))}
                            placeholder="예: 대한민국"
                            value={form.ceoNationality}
                            onChange={(e) =>
                              setForm((prev) => ({ ...prev, ceoNationality: e.target.value }))
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
                                founderSerialNumber: e.target.value.replace(/[^\d]/g, "").slice(0, 2),
                              }))
                            }
                            onBlur={() => markTouched("founderSerialNumber")}
                          />
                        </label>
                        <div className="md:col-span-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
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
                                    className={segmentedToggleClass(active)}
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
                      companySectionRefs.current["finance-investment"] = element
                    }}
                    className="space-y-4"
                  >
                    <div className="text-sm font-semibold text-slate-700">
                      재무 및 투자이력
                    </div>
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
                            <span className="block whitespace-nowrap">
                              투자단계 (다중선택)
                            </span>
                            <div
                              className="relative"
                              ref={(element) => {
                                investmentStageDropdownRefs.current[idx] = element
                              }}
                            >
                              <div
                                tabIndex={0}
                                className={inputClass(false, "min-h-[40px] cursor-pointer rounded-lg pr-9")}
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
                                        className="inline-flex h-5 items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-1.5 text-[9px] font-medium text-slate-700"
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
                            <span className="block whitespace-nowrap">
                              투자유치시기
                            </span>
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

                          <label className="text-xs text-slate-500">
                            <span className="block whitespace-nowrap">
                              투자 유치금액
                            </span>
                            <InputSuffix suffix="원">
                              <input
                                className={inputClass(false, "mt-0 rounded-lg")}
                                placeholder="예: 2,550,000,000"
                                inputMode="numeric"
                                value={row.postMoney}
                                onChange={(e) =>
                                  updateInvestmentRow(
                                    idx,
                                    "postMoney",
                                    e.target.value
                                  )
                                }
                              />
                            </InputSuffix>
                          </label>
                          <div className="flex items-start gap-2">
                            <label className="min-w-0 flex-1 text-xs text-slate-500">
                              <span className="block whitespace-nowrap">
                                지분율 상위 3명 주주명
                              </span>
                              <input
                                className={inputClass(false, "rounded-lg")}
                                placeholder="예: 홍길동, 김철수, 박영희"
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
                            <button
                              type="button"
                              className="mt-5 rounded-md border border-rose-200 p-2 text-rose-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => handleRemoveInvestmentRow(idx)}
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
                        disabled={investmentRows.length >= 3}
                      >
                        {investmentRows.length >= 3 ? "최대 3개까지 입력 가능" : "+ 투자이력 추가"}
                      </button>
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
                    <div className="text-sm font-semibold text-slate-700">
                      인증 및 바우처
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs text-slate-500">
                        <span className="block whitespace-nowrap">
                          인증/지정 여부 (다중선택)
                        </span>
                        <div
                          className="relative"
                          ref={certificationDropdownRef}
                        >
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
                                    className="inline-flex h-5 items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-1.5 text-[9px] font-medium text-slate-700"
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
                                  onClick={() =>
                                    setForm((prev) => ({
                                      ...prev,
                                      exportVoucherHeld: prev.exportVoucherHeld === option ? "" : option,
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
                              수출바우처 확보 금액
                              <InputSuffix
                                suffix="원"
                                disabled={form.exportVoucherHeld !== "예"}
                              >
                                <input
                                  className={inputClass(isFieldInvalid("exportVoucherAmount"), "mt-0")}
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
                              <InputSuffix
                                suffix="%"
                                disabled={form.exportVoucherHeld !== "예"}
                              >
                                <input
                                  className={inputClass(isFieldInvalid("exportVoucherUsageRate"), "mt-0")}
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
                                  onClick={() =>
                                    setForm((prev) => ({
                                      ...prev,
                                      innovationVoucherHeld:
                                        prev.innovationVoucherHeld === option ? "" : option,
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
                              중소기업혁신바우처 확보 금액
                              <InputSuffix
                                suffix="원"
                                disabled={form.innovationVoucherHeld !== "예"}
                              >
                                <input
                                  className={inputClass(isFieldInvalid("innovationVoucherAmount"), "mt-0")}
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
                              <InputSuffix
                                suffix="%"
                                disabled={form.innovationVoucherHeld !== "예"}
                              >
                                <input
                                  className={inputClass(isFieldInvalid("innovationVoucherUsageRate"), "mt-0")}
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
                      companySectionRefs.current.funding = element
                    }}
                    className="space-y-4"
                  >
                    <div className="text-sm font-semibold text-slate-700">
                      투자희망
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="grid gap-3 md:grid-cols-4">
                      <label className="text-xs text-slate-500 md:col-span-2 md:max-w-md">
                        2026년 내 희망 투자액
                        <InputSuffix suffix="원">
                          <input
                            className={inputClass(
                              isFieldInvalid("desiredInvestment2026"),
                              "mt-0"
                            )}
                            placeholder="예: 2,050,000,000"
                            inputMode="numeric"
                            value={form.desiredInvestment2026}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                desiredInvestment2026: formatRevenueInput(
                                  e.target.value
                                ),
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
                            className={inputClass(
                              isFieldInvalid("desiredPreValue"),
                              "mt-0"
                            )}
                            placeholder="예: 20,000,000,000"
                            inputMode="numeric"
                            value={form.desiredPreValue}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                desiredPreValue: formatRevenueInput(
                                  e.target.value
                                ),
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
                          maxLength={MYSC_EXPECTATION_MAX_LENGTH}
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
                          {myscExpectationLength}/{MYSC_EXPECTATION_MAX_LENGTH}자
                        </div>
                      </label>
                    </div>
                    </div>
                  </section>

                  <section>
                    <div className="text-sm font-semibold text-slate-700">
                      자료 업로드
                    </div>
                    <div className="mt-3 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-700 hover:text-white hover:shadow-sm">
                            <UploadCloud className="h-4 w-4" />
                            파일 업로드
                            <input
                              type="file"
                              multiple
                              accept=".pdf,.png,.ai"
                              className="hidden"
                              onChange={(event) => handleFileUpload(event.target.files)}
                              disabled={uploadingFiles}
                            />
                          </label>
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              회사 자료 업로드
                            </div>
                            <div className="text-xs text-slate-500">
                              PDF, PNG, AI · 최대 50MB · 여러 파일 가능
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-500">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1">
                          <FileText className="h-3.5 w-3.5" /> PDF
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1">
                          <FileImage className="h-3.5 w-3.5" /> PNG/AI
                        </span>
                      </div>
                      {uploadError ? (
                        <div className="mt-2 text-xs text-rose-600">{uploadError}</div>
                      ) : null}
                      {uploads.length === 0 && companyFiles.length === 0 ? (
                        <div className="mt-3 text-xs text-slate-400">
                          업로드된 파일이 없습니다.
                        </div>
                      ) : (
                        <div className="mt-3 space-y-2 text-xs">
                          {[
                            ...uploads.map((item) => ({
                              kind: "upload" as const,
                              id: item.id,
                              name: item.name,
                              size: null as number | null,
                              status: item.status,
                              progress: item.progress,
                              downloadUrl: null as string | null,
                            })),
                            ...companyFiles
                              .filter((file) => !uploads.some((item) => item.id === file.id))
                              .map((file) => ({
                                kind: "file" as const,
                                id: file.id,
                                name: file.name,
                                size: file.size,
                                status: "done" as const,
                                progress: 100,
                                downloadUrl: file.downloadUrl,
                                storagePath: file.storagePath,
                              })),
                          ].map((item) => (
                            <div
                              key={item.id}
                              className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 ${
                                item.kind === "file" && deletingFileIds[item.id]
                                  ? "opacity-60 pointer-events-none"
                                  : ""
                              }`}
                            >
                              <span className="flex-1 text-slate-700">
                                {item.name}
                              </span>
                              <span className="text-slate-400">
                                {item.size !== null
                                  ? `${(item.size / (1024 * 1024)).toFixed(1)}MB`
                                  : item.status === "uploading"
                                    ? `${item.progress}%`
                                    : item.status === "done"
                                      ? "업로드 완료"
                                      : `${item.progress}%`}
                              </span>
                              <div className="flex items-center gap-2">
                                {item.kind === "upload" && item.status === "uploading" ? (
                                  <button
                                    type="button"
                                    className="text-xs text-slate-500 hover:text-slate-700"
                                    onClick={() => cancelUpload(item.id)}
                                  >
                                    업로드 취소
                                  </button>
                                ) : null}
                                {item.kind === "upload" && item.status === "error" ? (
                                  <button
                                    type="button"
                                    className="text-xs text-slate-600 hover:text-slate-900"
                                    onClick={() => retryUpload(item.id)}
                                  >
                                    재시도
                                  </button>
                                ) : null}
                                {item.kind === "upload" && item.status === "queued" ? (
                                  <span className="text-xs text-slate-400">대기중</span>
                                ) : null}
                                {item.kind === "upload" && item.status === "error" ? (
                                  <span className="text-xs text-rose-600">실패</span>
                                ) : null}
                                {item.kind === "upload" && item.status === "canceled" ? (
                                  <span className="text-xs text-slate-400">취소됨</span>
                                ) : null}
                                {item.kind === "file" && deletedFileIds[item.id] ? (
                                  <span className="text-xs text-emerald-600">삭제됨</span>
                                ) : null}
                                {item.kind === "file" && !deletedFileIds[item.id] ? (
                                  <>
                                    {item.downloadUrl ? (
                                      <a
                                        href={item.downloadUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:text-slate-900"
                                        aria-label="미리보기"
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                        미리보기
                                      </a>
                                    ) : (
                                      <span className="text-slate-400">
                                        링크 준비중
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                                      onClick={() =>
                                        handleFileDelete({
                                          id: item.id,
                                          storagePath: item.storagePath,
                                        })
                                      }
                                      aria-label="파일 삭제"
                                      disabled={Boolean(deletingFileIds[item.id])}
                                    >
                                      {deletingFileIds[item.id] ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>
                  </div>
                </div>
              </div>
            )
          ) : null}
        </div>
        {snackbarMessage ? (
      <div
        className={`pointer-events-none fixed bottom-6 right-6 z-50 rounded-xl border px-4 py-2 text-sm font-semibold shadow-lg ${snackbarMessage.includes("실패")
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
