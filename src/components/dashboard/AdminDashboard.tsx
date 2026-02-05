import { useEffect, useMemo, useState } from "react"
import type { User } from "firebase/auth"
import {
  collection,
  doc,
  getDoc,
  getDocs,
} from "firebase/firestore"
import { db } from "../../firebase/client"
import type { CompanyInfoRecord } from "../../types/company"
import type { SelfAssessmentSections } from "../../types/selfAssessment"
import { SELF_ASSESSMENT_SECTIONS } from "../../data/selfAssessment"

type AdminDashboardProps = {
  user: User
  onLogout: () => void
}

type CompanySummary = {
  id: string
  name: string | null
  ownerUid: string
}

export function AdminDashboard({
  user,
  onLogout,
}: AdminDashboardProps) {
  const [companies, setCompanies] = useState<CompanySummary[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)
  const [companyInfo, setCompanyInfo] = useState<CompanyInfoRecord | null>(null)
  const [selfAssessment, setSelfAssessment] = useState<SelfAssessmentSections>(
    {}
  )
  const [loadingCompanies, setLoadingCompanies] = useState(true)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [companyQuery, setCompanyQuery] = useState("")
  const [activeTab, setActiveTab] = useState<"info" | "assessment">("info")
  const [activeSectionFilter, setActiveSectionFilter] = useState<string>("문제")
  const primaryProvider = user.providerData?.[0]?.providerId ?? "password"
  const isGoogle = primaryProvider === "google.com"
  const email = user.email ?? user.providerData?.[0]?.email ?? "사용자"
  const avatarUrl = user.photoURL ?? user.providerData?.[0]?.photoURL ?? ""
  const initials = email
    .split("@")[0]
    .slice(0, 2)
    .toUpperCase()

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
        if (!selectedCompanyId && list.length > 0) {
          setSelectedCompanyId(list[0].id)
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
    async function loadDetails() {
      if (!selectedCompanyId) {
        setCompanyInfo(null)
        setSelfAssessment({})
        return
      }
      setLoadingDetails(true)
      try {
        const [infoSnap, assessmentSnap] = await Promise.all([
          getDoc(doc(db, "companies", selectedCompanyId, "companyInfo", "info")),
          getDoc(
            doc(db, "companies", selectedCompanyId, "selfAssessment", "info")
          ),
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
  }, [selectedCompanyId])

  const formatValue = (value?: string | number | null) => {
    if (value === null || value === undefined || value === "") return "-"
    if (typeof value === "number") return value.toLocaleString()
    return value
  }

  const investmentRows = useMemo(() => {
    return companyInfo?.investments ?? []
  }, [companyInfo])

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
      totalScore += sectionScore
      return {
        sectionTitle: section.title,
        sectionScore,
        sectionTotal: section.totalScore,
        questions,
      }
    })

    return { totalScore, sectionScores, grouped }
  }, [selfAssessment])

  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm h-[calc(100vh-10rem)]">
      <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-100 px-8 py-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          Admin Dashboard
        </h1>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="사용자 프로필"
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                {initials}
              </div>
            )}
            <div className="text-right">
              <div className="text-xs font-semibold text-slate-700">
                {email}
              </div>
              <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-slate-500">
                {isGoogle ? (
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      fill="#EA4335"
                      d="M12 10.2v3.8h5.3c-.2 1.2-1.4 3.5-5.3 3.5-3.2 0-5.8-2.6-5.8-5.8S8.8 5.9 12 5.9c1.8 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.9 2.4 2.8 6.5 2.8 11.6S6.9 20.8 12 20.8c7 0 8.4-4.9 8.4-7.4 0-.5-.1-.9-.1-1.3H12z"
                    />
                  </svg>
                ) : (
                  <svg
                    className="h-3.5 w-3.5 text-slate-500"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M10 2a4 4 0 00-4 4v3H5a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2h-1V6a4 4 0 00-4-4zm-2 7V6a2 2 0 114 0v3H8z" />
                  </svg>
                )}
                <span>{isGoogle ? "Google 로그인" : "이메일 로그인"}</span>
              </div>
            </div>
          </div>
          <button
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            onClick={onLogout}
          >
            로그아웃
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 grid gap-6 lg:grid-cols-[280px_1fr] px-8 py-6">
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
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                    company.id === selectedCompanyId
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
              {activeTab === "info" ? "기업 정보" : "현황 진단 (자가진단)"}
            </div>
            {loadingDetails ? (
              <span className="text-xs text-slate-400">불러오는 중...</span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-2">
            <button
              type="button"
              onClick={() => setActiveTab("info")}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
                activeTab === "info"
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              기업 정보
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("assessment")}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
                activeTab === "assessment"
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              현황 진단
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
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-700">
                    대분류 점수
                  </div>
                  <div className="rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm">
                    총점 {assessmentSummary.totalScore}/100점
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {assessmentSummary.grouped.map((section) => (
                    <button
                      key={`summary-${section.sectionTitle}`}
                      type="button"
                      onClick={() => setActiveSectionFilter(section.sectionTitle)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                        activeSectionFilter === section.sectionTitle
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {section.sectionTitle} {section.sectionScore}/{section.sectionTotal}점
                    </button>
                  ))}
                </div>
                {(() => {
                  const filtered = assessmentSummary.grouped.filter(
                    (section) => section.sectionTitle === activeSectionFilter
                  )
                  if (filtered.length === 1) {
                    const section = filtered[0]
                    return (
                      <div className="mt-4 min-h-0 flex-1 overflow-hidden">
                        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden flex h-full flex-col">
                          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                            <div className="text-sm font-semibold text-slate-800">
                              {section.sectionTitle}
                            </div>
                            <div className="text-xs font-semibold text-slate-600">
                              {section.sectionScore}/{section.sectionTotal}점
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
                                    className={`rounded-full px-2 py-0.5 font-semibold ${
                                      item.answerLabel === "예"
                                        ? "bg-emerald-100 text-emerald-700"
                                        : item.answerLabel === "아니오"
                                        ? "bg-rose-100 text-rose-700"
                                        : "bg-slate-100 text-slate-500"
                                    }`}
                                  >
                                    {item.answerLabel}
                                  </span>
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                                    {item.score}점
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
                              {section.sectionScore}/{section.sectionTotal}점
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
                                    className={`rounded-full px-2 py-0.5 font-semibold ${
                                      item.answerLabel === "예"
                                        ? "bg-emerald-100 text-emerald-700"
                                        : item.answerLabel === "아니오"
                                        ? "bg-rose-100 text-rose-700"
                                        : "bg-slate-100 text-slate-500"
                                    }`}
                                  >
                                    {item.answerLabel}
                                  </span>
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                                    {item.score}점
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
            )}
          </div>
        </div>
      </div>

      

      </div>
    </div>
  )
}
