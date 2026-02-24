import type { User } from "firebase/auth"
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
} from "firebase/firestore"
import { getDownloadURL, ref as storageRef } from "firebase/storage"
import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { SELF_ASSESSMENT_SECTIONS } from "@/data/selfAssessment"
import { db, storage } from "@/firebase/client"
import type { CompanyInfoRecord } from "@/types/company"
import type { SelfAssessmentSections } from "@/types/selfAssessment"

type AdminDashboardProps = {
  user: User
  onLogout: () => void
}

type CompanySummary = {
  id: string
  name: string | null
  ownerUid: string
}

type ProgramSummary = {
  id: string
  name: string
  internalTicketLimit?: number
  externalTicketLimit?: number
  companyIds?: string[]
}

export function AdminDashboard({
  user,
  onLogout,
}: AdminDashboardProps) {
  const navigate = useNavigate()
  const [companies, setCompanies] = useState<CompanySummary[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)
  const [companyInfo, setCompanyInfo] = useState<CompanyInfoRecord | null>(null)
  const [companyFiles, setCompanyFiles] = useState<
    { id: string; name: string; size: number; downloadUrl: string | null }[]
  >([])
  const [selfAssessment, setSelfAssessment] = useState<SelfAssessmentSections>(
    {}
  )
  const [loadingCompanies, setLoadingCompanies] = useState(true)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [companyQuery, setCompanyQuery] = useState("")
  const [activeTab, setActiveTab] = useState<"info" | "assessment" | "report" | "officeHours">(
    "info"
  )
  const [programs, setPrograms] = useState<ProgramSummary[]>([])
  const [loadingPrograms, setLoadingPrograms] = useState(false)
  const [ticketDrafts, setTicketDrafts] = useState<Record<string, { internal: string; external: string }>>({})
  const [savingTickets, setSavingTickets] = useState(false)
  const [activeSectionFilter, setActiveSectionFilter] = useState<string>("문제")
  const [reportForm, setReportForm] = useState({
    companyName: "",
    createdAt: "",
    summaryCapability: "",
    summaryMarket: "",
    improvements: "",
    acPriority1: "",
    acPriority2: "",
    acPriority3: "",
    milestone56: "",
    milestone78: "",
    milestone910: "",
  })
  const email = user.email ?? user.providerData?.[0]?.email ?? "사용자"

  useEffect(() => {
    let mounted = true
    async function loadCompanies() {
      setLoadingCompanies(true)
      try {
        const snapshot = await getDocs(collection(db, "companies"))
        if (!mounted) return
        const list = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as {
            name?: string | null
            ownerUid?: string
          }
          return {
            id: docSnap.id,
            name: data.name ?? "회사명 미정",
            ownerUid: data.ownerUid ?? "",
          }
        })
        setCompanies(list)
        const first = list[0]
        if (!selectedCompanyId && first) {
          setSelectedCompanyId(first.id)
        }
      } finally {
        if (mounted) {
          setLoadingCompanies(false)
        }
      }
    }
    loadCompanies()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let mounted = true
    async function loadPrograms() {
      setLoadingPrograms(true)
      try {
        const snapshot = await getDocs(collection(db, "programs"))
        if (!mounted) return
        const list = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as {
            name?: string
            internalTicketLimit?: number
            externalTicketLimit?: number
            companyIds?: string[]
          }
          return {
            id: docSnap.id,
            name: data.name ?? "사업명 미정",
            internalTicketLimit: data.internalTicketLimit ?? 0,
            externalTicketLimit: data.externalTicketLimit ?? 0,
            companyIds: data.companyIds ?? [],
          }
        })
        setPrograms(list)
      } finally {
        if (mounted) {
          setLoadingPrograms(false)
        }
      }
    }
    loadPrograms()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let mounted = true
    async function loadDetails() {
      if (!selectedCompanyId) {
        setCompanyInfo(null)
        setSelfAssessment({})
        setCompanyFiles([])
        setTicketDrafts({})
        return
      }
      setLoadingDetails(true)
      try {
        const [infoSnap, assessmentSnap, filesSnap, companySnap] = await Promise.all([
          getDoc(doc(db, "companies", selectedCompanyId, "companyInfo", "info")),
          getDoc(
            doc(db, "companies", selectedCompanyId, "selfAssessment", "info")
          ),
          getDocs(collection(db, "companies", selectedCompanyId, "files")),
          getDoc(doc(db, "companies", selectedCompanyId)),
        ])
        if (!mounted) return
        setCompanyInfo(
          infoSnap.exists()
            ? (infoSnap.data() as CompanyInfoRecord)
            : null
        )
        const assessmentData = assessmentSnap.exists()
          ? (assessmentSnap.data() as { sections?: SelfAssessmentSections })
          : null
        setSelfAssessment(assessmentData?.sections ?? {})
        const files = await Promise.all(
          filesSnap.docs.map(async (docSnap) => {
            const data = docSnap.data() as {
              name: string
              size: number
              storagePath: string
            }
            let downloadUrl: string | null = null
            try {
              downloadUrl = await getDownloadURL(storageRef(storage, data.storagePath))
            } catch {
              downloadUrl = null
            }
            return {
              id: docSnap.id,
              name: data.name,
              size: data.size,
              downloadUrl,
            }
          })
        )
        setCompanyFiles(files)
        const overrideData = companySnap.exists()
          ? (companySnap.data() as { programTicketOverrides?: Record<string, { internal?: number; external?: number }> })
          : {}
        const overrides = overrideData.programTicketOverrides ?? {}
        const participating = programs.filter((program) =>
          program.companyIds?.includes(selectedCompanyId)
        )
        const nextDrafts: Record<string, { internal: string; external: string }> = {}
        participating.forEach((program) => {
          const override = overrides[program.id]
          const internalValue =
            typeof override?.internal === "number"
              ? override.internal
              : (program.internalTicketLimit ?? 0)
          const externalValue =
            typeof override?.external === "number"
              ? override.external
              : (program.externalTicketLimit ?? 0)
          nextDrafts[program.id] = {
            internal: String(internalValue),
            external: String(externalValue),
          }
        })
        setTicketDrafts(nextDrafts)
      } finally {
        if (mounted) {
          setLoadingDetails(false)
        }
      }
    }
    loadDetails()
    return () => {
      mounted = false
    }
  }, [programs, selectedCompanyId])

  useEffect(() => {
    const nextCompanyName = companyInfo?.basic?.companyInfo ?? ""
    setReportForm((prev) => ({
      ...prev,
      companyName: nextCompanyName,
      createdAt:
        prev.createdAt || new Date().toLocaleString("ko-KR"),
    }))
  }, [companyInfo, selectedCompanyId])

  const formatValue = (value?: string | number | null) => {
    if (value === null || value === undefined || value === "") return "-"
    if (typeof value === "number") return value.toLocaleString()
    return value
  }
  const formatScore = (value: number) => {
    const rounded = Math.round(value * 10) / 10
    return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1)
  }

  const investmentRows = useMemo(() => {
    return companyInfo?.investments ?? []
  }, [companyInfo])

  const participatingPrograms = useMemo(() => {
    if (!selectedCompanyId) return []
    return programs.filter((program) => program.companyIds?.includes(selectedCompanyId))
  }, [programs, selectedCompanyId])

  const handleTicketChange = (programId: string, field: "internal" | "external", value: string) => {
    setTicketDrafts((prev) => ({
      ...prev,
      [programId]: {
        internal: prev[programId]?.internal ?? "0",
        external: prev[programId]?.external ?? "0",
        [field]: value.replace(/[^\d]/g, ""),
      },
    }))
  }

  const handleSaveTickets = async () => {
    if (!selectedCompanyId) return
    setSavingTickets(true)
    try {
      const overrides: Record<string, { internal?: number; external?: number }> = {}
      participatingPrograms.forEach((program) => {
        const draft = ticketDrafts[program.id]
        if (!draft) return
        const internal = Number(draft.internal || 0)
        const external = Number(draft.external || 0)
        const baseInternal = program.internalTicketLimit ?? 0
        const baseExternal = program.externalTicketLimit ?? 0
        if (internal !== baseInternal || external !== baseExternal) {
          overrides[program.id] = { internal, external }
        }
      })
      await updateDoc(doc(db, "companies", selectedCompanyId), {
        programTicketOverrides: overrides,
      })
      toast.success("티켓 수가 변경되었습니다")
    } finally {
      setSavingTickets(false)
    }
  }

  const filteredCompanies = useMemo(() => {
    const query = companyQuery.trim().toLowerCase()
    if (!query) return companies
    return companies.filter((company) => {
      const name = (company.name ?? "").toLowerCase()
      return name.includes(query) || company.id.toLowerCase().includes(query)
    })
  }, [companies, companyQuery])

  const assessmentSummary = useMemo(() => {
    let totalScore = 0
    const sectionScores: Record<string, number> = {}
    const sectionTotals: Record<string, number> = {}
    const grouped = SELF_ASSESSMENT_SECTIONS.map((section) => {
      let sectionScore = 0
      const questions = section.subsections.flatMap((subsection) =>
        subsection.questions.map((question) => {
          const answer =
            selfAssessment?.[section.storageKey]?.[subsection.storageKey]?.[
            question.storageKey
            ]
          const answerValue =
            answer?.answer === true
              ? "예"
              : answer?.answer === false
                ? "아니오"
                : "미선택"
          const score = answer?.answer === true ? question.weight : 0
          sectionScore += score
          return {
            sectionTitle: section.title,
            subsectionTitle: subsection.title,
            questionText: question.text,
            answerLabel: answerValue,
            reason: answer?.reason ?? "",
            score,
          }
        })
      )
      sectionScores[section.storageKey] = sectionScore
      sectionTotals[section.storageKey] = section.totalScore
      totalScore += sectionScore
      return {
        sectionTitle: section.title,
        sectionKey: section.storageKey,
        sectionScore,
        sectionTotal: section.totalScore,
        questions,
      }
    })

    return { totalScore, sectionScores, sectionTotals, grouped }
  }, [selfAssessment])

  const radarData = useMemo(() => {
    const size = 240
    const center = size / 2
    const radius = size / 2 - 18
    const axes = assessmentSummary.grouped.map((section, index) => {
      const angle = (Math.PI * 2 * index) / assessmentSummary.grouped.length - Math.PI / 2
      const total = assessmentSummary.sectionTotals[section.sectionKey] ?? section.sectionTotal
      const score = assessmentSummary.sectionScores[section.sectionKey] ?? section.sectionScore
      const ratio = total > 0 ? score / total : 0
      const x = center + Math.cos(angle) * radius * ratio
      const y = center + Math.sin(angle) * radius * ratio
      const labelX = center + Math.cos(angle) * (radius + 10)
      const labelY = center + Math.sin(angle) * (radius + 10)
      return {
        angle,
        x,
        y,
        labelX,
        labelY,
        label: section.sectionTitle,
        score,
        total,
      }
    })

    const points = axes.map((axis) => `${axis.x},${axis.y}`).join(" ")
    return { size, center, radius, axes, points }
  }, [assessmentSummary])

  return (
    <div className="bg-transparent h-full">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 px-8 py-5">
          <h1 className="text-2xl font-semibold text-slate-900">
            Admin Dashboard
          </h1>
          <div className="flex items-center gap-3">
            <button
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              onClick={() => navigate("/admin/consultants")}
            >
              컨설턴트 관리
            </button>
            <div className="hidden text-xs text-slate-400 md:block">
              {email}
            </div>
          </div>
        </div>
        <div className="flex-1 min-h-0 grid gap-6 lg:grid-cols-[280px_1fr] px-8 py-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 h-full overflow-y-auto">
            <div className="text-sm font-semibold text-slate-700">
              회사 목록
            </div>
            <input
              className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
              placeholder="회사명 또는 ID 검색"
              value={companyQuery}
              onChange={(e) => setCompanyQuery(e.target.value)}
            />
            <div className="mt-3 space-y-2">
              {loadingCompanies ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
                  회사 목록을 불러오는 중입니다.
                </div>
              ) : filteredCompanies.length === 0 ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
                  검색 결과가 없습니다.
                </div>
              ) : (
                filteredCompanies.map((company) => (
                  <button
                    key={company.id}
                    type="button"
                    onClick={() => setSelectedCompanyId(company.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${company.id === selectedCompanyId
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                  >
                    <div className="font-semibold">{company.name}</div>
                    <div className="mt-1 text-xs text-slate-300">
                      {company.id}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="text-sm font-semibold text-slate-700">
                {activeTab === "info"
                  ? "기업 정보"
                  : activeTab === "assessment"
                    ? "현황 진단 (자가진단)"
                    : activeTab === "officeHours"
                      ? "오피스아워"
                      : "기업진단분석보고서"}
              </div>
              {loadingDetails ? (
                <span className="text-xs text-slate-400">불러오는 중...</span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 px-4">
              <button
                type="button"
                onClick={() => setActiveTab("info")}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${activeTab === "info"
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
              >
                기업 정보
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("assessment")}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${activeTab === "assessment"
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
              >
                현황 진단
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("report")}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${activeTab === "report"
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
              >
                분석 보고서
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("officeHours")}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${activeTab === "officeHours"
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
              >
                오피스아워
              </button>
            </div>
            <div className="flex-1 min-h-0 px-4 py-4 flex flex-col">
              {activeTab === "info" ? (
                !companyInfo ? (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-500">
                    기업 정보가 없습니다.
                  </div>
                ) : (
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto text-sm text-slate-700">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="text-xs text-slate-400">회사명</div>
                        <div className="font-semibold">
                          {formatValue(companyInfo.basic?.companyInfo)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">대표자</div>
                        <div className="font-semibold">
                          {formatValue(companyInfo.basic?.ceo?.name)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">대표 이메일</div>
                        <div className="font-semibold">
                          {formatValue(companyInfo.basic?.ceo?.email)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">대표 전화번호</div>
                        <div className="font-semibold">
                          {formatValue(companyInfo.basic?.ceo?.phone)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">법인 설립일</div>
                        <div className="font-semibold">
                          {formatValue(companyInfo.basic?.foundedAt)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">
                          사업자등록번호
                        </div>
                        <div className="font-semibold">
                          {formatValue(companyInfo.basic?.businessNumber)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">주업태</div>
                        <div className="font-semibold">
                          {formatValue(companyInfo.basic?.primaryBusiness)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">주업종</div>
                        <div className="font-semibold">
                          {formatValue(companyInfo.basic?.primaryIndustry)}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="text-xs text-slate-400">본점 소재지</div>
                        <div className="font-semibold">
                          {formatValue(companyInfo.locations?.headOffice)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">
                          지점/연구소 소재지
                        </div>
                        <div className="font-semibold">
                          {formatValue(companyInfo.locations?.branchOrLab)}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="text-xs text-slate-400">정규직</div>
                        <div className="font-semibold">
                          {formatValue(companyInfo.workforce?.fullTime)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">계약직</div>
                        <div className="font-semibold">
                          {formatValue(companyInfo.workforce?.contract)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">
                          매출액(2025)
                        </div>
                        <div className="font-semibold">
                          {formatValue(companyInfo.finance?.revenue?.y2025)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">
                          매출액(2026)
                        </div>
                        <div className="font-semibold">
                          {formatValue(companyInfo.finance?.revenue?.y2026)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">자본총계</div>
                        <div className="font-semibold">
                          {formatValue(companyInfo.finance?.capitalTotal)}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="text-xs text-slate-400">
                          인증/지정여부
                        </div>
                        <div className="font-semibold">
                          {formatValue(companyInfo.certifications?.designation)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">TIPS/LIPS</div>
                        <div className="font-semibold">
                          {formatValue(companyInfo.certifications?.tipsLipsHistory)}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="text-xs text-slate-400">
                          2026년 희망 투자액
                        </div>
                        <div className="font-semibold">
                          {formatValue(companyInfo.fundingPlan?.desiredAmount2026)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">
                          투자전 희망 기업가치
                        </div>
                        <div className="font-semibold">
                          {formatValue(companyInfo.fundingPlan?.preValue)}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <div className="text-xs font-semibold text-slate-600">
                        업로드 자료
                      </div>
                      {companyFiles.length === 0 ? (
                        <div className="mt-2 text-xs text-slate-400">
                          업로드된 파일이 없습니다.
                        </div>
                      ) : (
                        <div className="mt-3 space-y-2 text-xs">
                          {companyFiles.map((file) => (
                            <div
                              key={file.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                            >
                              <span className="flex-1 text-slate-700">
                                {file.name}
                              </span>
                              <span className="text-slate-400">
                                {(file.size / (1024 * 1024)).toFixed(1)}MB
                              </span>
                              {file.downloadUrl ? (
                                <a
                                  href={file.downloadUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-slate-600 hover:text-slate-900"
                                >
                                  보기/다운로드
                                </a>
                              ) : (
                                <span className="text-slate-400">
                                  링크 준비중
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="text-xs text-slate-400">투자 이력</div>
                      {investmentRows.length === 0 ? (
                        <div className="mt-2 text-sm text-slate-500">
                          입력된 투자 이력이 없습니다.
                        </div>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {investmentRows.map((row, index) => (
                            <div
                              key={`${row.stage}-${index}`}
                              className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600"
                            >
                              <div className="font-semibold text-slate-700">
                                {row.stage || "단계 미입력"}
                              </div>
                              <div className="mt-1 grid gap-1 sm:grid-cols-3">
                                <span>
                                  일시: {formatValue(row.date)}
                                </span>
                                <span>
                                  금액: {formatValue(row.postMoney)}
                                </span>
                                <span>
                                  주요주주: {formatValue(row.majorShareholder)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              ) : activeTab === "assessment" ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-700">
                      대분류 점수
                    </div>
                    <div className="rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm">
                      총점 {formatScore(assessmentSummary.totalScore)}/100점
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {assessmentSummary.grouped.map((section) => (
                      <button
                        key={`summary-${section.sectionTitle}`}
                        type="button"
                        onClick={() => setActiveSectionFilter(section.sectionTitle)}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${activeSectionFilter === section.sectionTitle
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                      >
                        {section.sectionTitle} {formatScore(section.sectionScore)}/{formatScore(section.sectionTotal)}점
                      </button>
                    ))}
                  </div>
                  {(() => {
                    const filtered = assessmentSummary.grouped.filter(
                      (section) => section.sectionTitle === activeSectionFilter
                    )
                  if (filtered.length === 1) {
                    const section = filtered[0]
                    if (!section) return null
                    return (
                        <div className="mt-4 min-h-0 flex-1 overflow-hidden">
                          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden flex h-full flex-col">
                            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                              <div className="text-sm font-semibold text-slate-800">
                                {section.sectionTitle}
                              </div>
                              <div className="text-xs font-semibold text-slate-600">
                                {formatScore(section.sectionScore)}/{formatScore(section.sectionTotal)}점
                              </div>
                            </div>
                            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                              {section.questions.map((item, index) => (
                                <div
                                  key={`${section.sectionTitle}-${index}`}
                                  className="rounded-xl border border-slate-100 bg-white p-3"
                                >
                                  <div className="text-xs text-slate-400">
                                    {item.subsectionTitle}
                                  </div>
                                  <div className="mt-1 text-sm font-semibold text-slate-800">
                                    {item.questionText}
                                  </div>
                                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                    <span
                                      className={`rounded-full px-2 py-0.5 font-semibold ${item.answerLabel === "예"
                                        ? "bg-emerald-100 text-emerald-700"
                                        : item.answerLabel === "아니오"
                                          ? "bg-rose-100 text-rose-700"
                                          : "bg-slate-100 text-slate-500"
                                        }`}
                                    >
                                      {item.answerLabel}
                                    </span>
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                                      {formatScore(item.score)}점
                                    </span>
                                  </div>
                                  {item.reason ? (
                                    <div className="mt-2 text-xs text-slate-600">
                                      {item.reason}
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto">
                        {filtered.map((section) => (
                          <div
                            key={section.sectionTitle}
                            className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
                          >
                            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                              <div className="text-sm font-semibold text-slate-800">
                                {section.sectionTitle}
                              </div>
                              <div className="text-xs font-semibold text-slate-600">
                                {formatScore(section.sectionScore)}/{formatScore(section.sectionTotal)}점
                              </div>
                            </div>
                            <div className="space-y-3 p-4">
                              {section.questions.map((item, index) => (
                                <div
                                  key={`${section.sectionTitle}-${index}`}
                                  className="rounded-xl border border-slate-100 bg-white p-3"
                                >
                                  <div className="text-xs text-slate-400">
                                    {item.subsectionTitle}
                                  </div>
                                  <div className="mt-1 text-sm font-semibold text-slate-800">
                                    {item.questionText}
                                  </div>
                                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                    <span
                                      className={`rounded-full px-2 py-0.5 font-semibold ${item.answerLabel === "예"
                                        ? "bg-emerald-100 text-emerald-700"
                                        : item.answerLabel === "아니오"
                                          ? "bg-rose-100 text-rose-700"
                                          : "bg-slate-100 text-slate-500"
                                        }`}
                                    >
                                      {item.answerLabel}
                                    </span>
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                                      {formatScore(item.score)}점
                                    </span>
                                  </div>
                                  {item.reason ? (
                                    <div className="mt-2 text-xs text-slate-600">
                                      {item.reason}
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              ) : activeTab === "officeHours" ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">참여 사업 및 티켓</div>
                      <div className="text-xs text-slate-500">
                        기본 티켓은 사업 설정값이며, 기업별로 내부/외부 티켓을 조정할 수 있습니다.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveTickets}
                      disabled={savingTickets || loadingPrograms}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:bg-slate-300"
                    >
                      {savingTickets ? "저장 중..." : "저장"}
                    </button>
                  </div>

                  {loadingPrograms ? (
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-500">
                      사업 정보를 불러오는 중입니다.
                    </div>
                  ) : participatingPrograms.length === 0 ? (
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-500">
                      참여 중인 사업이 없습니다.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {participatingPrograms.map((program) => {
                        const draft = ticketDrafts[program.id] ?? {
                          internal: String(program.internalTicketLimit ?? 0),
                          external: String(program.externalTicketLimit ?? 0),
                        }
                        return (
                          <div key={program.id} className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <div className="text-sm font-semibold text-slate-800">
                                  {program.name}
                                </div>
                                <div className="text-xs text-slate-500 mt-1">
                                  기본 내부 {program.internalTicketLimit ?? 0} · 기본 외부 {program.externalTicketLimit ?? 0}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-xs text-slate-500">내부</div>
                                <input
                                  inputMode="numeric"
                                  value={draft.internal}
                                  onChange={(event) =>
                                    handleTicketChange(program.id, "internal", event.target.value)
                                  }
                                  className="w-20 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700"
                                />
                                <div className="text-xs text-slate-500">외부</div>
                                <input
                                  inputMode="numeric"
                                  value={draft.external}
                                  onChange={(event) =>
                                    handleTicketChange(program.id, "external", event.target.value)
                                  }
                                  className="w-20 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700"
                                />
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto space-y-6">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-sm font-semibold text-slate-800">
                      기업진단분석보고서
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      기업 정보를 기반으로 분석 보고서를 작성합니다.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-xs text-slate-500">
                      기업명
                      <input
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        value={reportForm.companyName}
                        onChange={(e) =>
                          setReportForm((prev) => ({
                            ...prev,
                            companyName: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      작성일시
                      <input
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        value={reportForm.createdAt}
                        onChange={(e) =>
                          setReportForm((prev) => ({
                            ...prev,
                            createdAt: e.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-sm font-semibold text-slate-700">
                      현황 분석 점수
                    </div>
                    <div className="mt-4 grid gap-4 lg:grid-cols-[300px_1fr]">
                      <div className="flex items-center justify-start pl-2">
                        <svg
                          width={radarData.size}
                          height={radarData.size}
                          viewBox={`-24 -24 ${radarData.size + 48} ${radarData.size + 48}`}
                        >
                          {[1, 0.75, 0.5, 0.25].map((ratio) => {
                            const points = radarData.axes
                              .map((axis) => {
                                const x =
                                  radarData.center +
                                  Math.cos(axis.angle) * radarData.radius * ratio
                                const y =
                                  radarData.center +
                                  Math.sin(axis.angle) * radarData.radius * ratio
                                return `${x},${y}`
                              })
                              .join(" ")
                            return (
                              <polygon
                                key={ratio}
                                points={points}
                                fill="none"
                                stroke="#e2e8f0"
                                strokeWidth="1"
                              />
                            )
                          })}
                          {radarData.axes.map((axis, index) => (
                            <line
                              key={`axis-${index}`}
                              x1={radarData.center}
                              y1={radarData.center}
                              x2={
                                radarData.center +
                                Math.cos(axis.angle) * radarData.radius
                              }
                              y2={
                                radarData.center +
                                Math.sin(axis.angle) * radarData.radius
                              }
                              stroke="#e2e8f0"
                              strokeWidth="1"
                            />
                          ))}
                          <polygon
                            points={radarData.points}
                            fill="rgba(15, 118, 110, 0.18)"
                            stroke="#0f766e"
                            strokeWidth="2"
                          />
                          {radarData.axes.map((axis, index) => (
                            <circle
                              key={`point-${index}`}
                              cx={axis.x}
                              cy={axis.y}
                              r="3"
                              fill="#0f766e"
                            />
                          ))}
                          {radarData.axes.map((axis, index) => (
                            <text
                              key={`label-${index}`}
                              x={axis.labelX}
                              y={axis.labelY}
                              textAnchor={
                                axis.labelX < radarData.center ? "end" : "start"
                              }
                              dominantBaseline="middle"
                              fontSize="9"
                              fill="#475569"
                            >
                              {axis.label}
                            </text>
                          ))}
                        </svg>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {assessmentSummary.grouped.map((section) => (
                          <div
                            key={`score-${section.sectionTitle}`}
                            className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600"
                          >
                            <div className="font-semibold text-slate-700 whitespace-normal break-words text-[11px] leading-snug">
                              {section.sectionTitle}
                            </div>
                            <div className="mt-1 whitespace-normal break-words text-[11px] text-slate-600">
                              {formatScore(section.sectionScore)}/{formatScore(section.sectionTotal)}점
                            </div>
                          </div>
                        ))}
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                          <div className="font-semibold whitespace-normal break-words text-[11px] leading-snug">총점</div>
                          <div className="mt-1 whitespace-normal break-words text-[11px]">
                            {formatScore(assessmentSummary.totalScore)}/100점
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-xs text-slate-500">
                      기업상황요약 - 기업 역량
                      <textarea
                        rows={3}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        value={reportForm.summaryCapability}
                        onChange={(e) =>
                          setReportForm((prev) => ({
                            ...prev,
                            summaryCapability: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      기업상황요약 - 시장검증
                      <textarea
                        rows={3}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        value={reportForm.summaryMarket}
                        onChange={(e) =>
                          setReportForm((prev) => ({
                            ...prev,
                            summaryMarket: e.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>

                  <label className="text-xs text-slate-500">
                    개선 필요사항 (항목별 요약)
                    <textarea
                      rows={4}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                      value={reportForm.improvements}
                      onChange={(e) =>
                        setReportForm((prev) => ({
                          ...prev,
                          improvements: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-sm font-semibold text-slate-700">
                      AC 프로그램 제안
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <label className="text-xs text-slate-500">
                        1순위
                        <input
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                          value={reportForm.acPriority1}
                          onChange={(e) =>
                            setReportForm((prev) => ({
                              ...prev,
                              acPriority1: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="text-xs text-slate-500">
                        2순위
                        <input
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                          value={reportForm.acPriority2}
                          onChange={(e) =>
                            setReportForm((prev) => ({
                              ...prev,
                              acPriority2: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="text-xs text-slate-500">
                        3순위
                        <input
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                          value={reportForm.acPriority3}
                          onChange={(e) =>
                            setReportForm((prev) => ({
                              ...prev,
                              acPriority3: e.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-sm font-semibold text-slate-700">
                      엑셀러레이팅 마일스톤 제안
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <label className="text-xs text-slate-500">
                        5~6월
                        <textarea
                          rows={3}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                          value={reportForm.milestone56}
                          onChange={(e) =>
                            setReportForm((prev) => ({
                              ...prev,
                              milestone56: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="text-xs text-slate-500">
                        7~8월
                        <textarea
                          rows={3}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                          value={reportForm.milestone78}
                          onChange={(e) =>
                            setReportForm((prev) => ({
                              ...prev,
                              milestone78: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="text-xs text-slate-500">
                        9~10월
                        <textarea
                          rows={3}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                          value={reportForm.milestone910}
                          onChange={(e) =>
                            setReportForm((prev) => ({
                              ...prev,
                              milestone910: e.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>



      </div>
    </div>
  )
}
