import type { User } from "firebase/auth"
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore"
import { getDownloadURL, ref as storageRef } from "firebase/storage"
import ExcelJS from "exceljs"
import { FileSpreadsheet, Save, Wand2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { SELF_ASSESSMENT_SECTIONS } from "@/data/selfAssessment"
import { db, storage } from "@/firebase/client"
import { generateCompanyAnalysisReportViaFunction } from "@/redesign/app/lib/functions"
import { PaginationControls } from "@/redesign/app/components/ui/pagination-controls"
import {
  EMPTY_COMPANY_ANALYSIS_REPORT_FORM,
  splitNumberedReportSections,
  splitReportParagraphs,
  toCompanyAnalysisReportForm,
  type CompanyAnalysisReportForm,
} from "@/types/companyAnalysisReport"
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

type ProfileSummary = {
  role?: string | null
  active?: boolean
  approvedAt?: unknown
  companyId?: string | null
}

type ProgramSummary = {
  id: string
  name: string
  internalTicketLimit?: number
  externalTicketLimit?: number
  companyIds?: string[]
}

const COMPANY_PAGE_SIZE = 8

function getRadarLabelLines(label: string) {
  const normalized = label.trim()
  if (!normalized) return [""]
  if (normalized.includes("(")) {
    return normalized.replace("(", "\n(").split("\n")
  }
  if (normalized.length > 8) {
    const midpoint = Math.ceil(normalized.length / 2)
    return [normalized.slice(0, midpoint), normalized.slice(midpoint)]
  }
  return [normalized]
}

function buildRadarChartSvg(radarData: {
  size: number
  center: number
  radius: number
  points: string
  axes: Array<{
    angle: number
    x: number
    y: number
    labelX: number
    labelY: number
    label: string
  }>
}) {
  const expandedWidth = radarData.size + 120
  const expandedHeight = radarData.size + 120
  const offsetX = 60
  const offsetY = 60
  const shiftedPoints = radarData.points
    .split(" ")
    .map((point) => {
      const [xRaw, yRaw] = point.split(",")
      const x = Number(xRaw ?? 0)
      const y = Number(yRaw ?? 0)
      return `${x + offsetX},${y + offsetY}`
    })
    .join(" ")

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${expandedWidth}" height="${expandedHeight}" viewBox="0 0 ${expandedWidth} ${expandedHeight}">
      <rect width="100%" height="100%" fill="#ffffff" />
      ${[1, 0.75, 0.5, 0.25].map((ratio) => {
        const points = radarData.axes
          .map((axis) => {
            const x = radarData.center + Math.cos(axis.angle) * radarData.radius * ratio + offsetX
            const y = radarData.center + Math.sin(axis.angle) * radarData.radius * ratio + offsetY
            return `${x},${y}`
          })
          .join(" ")
        return `<polygon points="${points}" fill="none" stroke="#e2e8f0" stroke-width="1" />`
      }).join("")}
      ${radarData.axes.map((axis) => `
        <line
          x1="${radarData.center + offsetX}"
          y1="${radarData.center + offsetY}"
          x2="${radarData.center + Math.cos(axis.angle) * radarData.radius + offsetX}"
          y2="${radarData.center + Math.sin(axis.angle) * radarData.radius + offsetY}"
          stroke="#e2e8f0"
          stroke-width="1"
        />
      `).join("")}
      <polygon points="${shiftedPoints}" fill="rgba(15,118,110,0.18)" stroke="#0f766e" stroke-width="2" />
      ${radarData.axes.map((axis) => `
        <circle cx="${axis.x + offsetX}" cy="${axis.y + offsetY}" r="3" fill="#0f766e" />
      `).join("")}
      ${radarData.axes.map((axis) => {
        const lines = getRadarLabelLines(axis.label)
        return `
          <text
            x="${axis.labelX + offsetX}"
            y="${axis.labelY + offsetY}"
            text-anchor="middle"
            font-size="12"
            font-family="Malgun Gothic, Apple SD Gothic Neo, sans-serif"
            fill="#475569"
          >
            ${lines.map((line, index) => `
              <tspan x="${axis.labelX + offsetX}" dy="${index === 0 ? 0 : 14}">${line}</tspan>
            `).join("")}
          </text>
        `
      }).join("")}
    </svg>
  `.trim()
}

async function renderSvgToPngDataUrl(svg: string) {
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  const image = new Image()
  image.decoding = "async"

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error("Failed to render radar chart"))
    image.src = dataUrl
  })

  const canvas = document.createElement("canvas")
  canvas.width = image.naturalWidth || image.width
  canvas.height = image.naturalHeight || image.height
  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("Canvas context is not available")
  }
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0)
  return canvas.toDataURL("image/png")
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
  const [companyPage, setCompanyPage] = useState(1)
  const [activeTab, setActiveTab] = useState<"info" | "assessment" | "report" | "officeHours">(
    "info"
  )
  const [programs, setPrograms] = useState<ProgramSummary[]>([])
  const [selectedCompanyProgramIds, setSelectedCompanyProgramIds] = useState<string[]>([])
  const [loadingPrograms, setLoadingPrograms] = useState(false)
  const [ticketDrafts, setTicketDrafts] = useState<Record<string, { internal: string; external: string }>>({})
  const [savingTickets, setSavingTickets] = useState(false)
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [savingReport, setSavingReport] = useState(false)
  const [downloadingReport, setDownloadingReport] = useState(false)
  const [activeSectionFilter, setActiveSectionFilter] = useState<string>("문제")
  const [reportForm, setReportForm] = useState<CompanyAnalysisReportForm>(EMPTY_COMPANY_ANALYSIS_REPORT_FORM)

  useEffect(() => {
    let mounted = true
    async function loadCompanies() {
      setLoadingCompanies(true)
      try {
        const [profileSnapshot, companySnapshot] = await Promise.all([
          getDocs(collection(db, "profiles")),
          getDocs(collection(db, "companies")),
        ])
        const liveCompanyIds = new Set(
          profileSnapshot.docs
            .map((docSnap) => docSnap.data() as ProfileSummary)
            .filter(
              (data) =>
                data.role === "company" &&
                (data.active === true || !!data.approvedAt) &&
                typeof data.companyId === "string" &&
                data.companyId.trim().length > 0,
            )
            .map((data) => data.companyId!.trim()),
        )
        if (!mounted) return
        const list = companySnapshot.docs
          .filter((docSnap) => liveCompanyIds.has(docSnap.id))
          .map((docSnap) => {
            const data = docSnap.data() as {
              name?: string | null
              ownerUid?: string
            }
            return {
              id: docSnap.id,
              name: data.name?.trim() || "회사명 미정",
              ownerUid: data.ownerUid ?? "",
            }
          })
          .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "ko-KR"))
        setCompanies(list)
        const first = list[0]
        if ((!selectedCompanyId || !list.some((company) => company.id === selectedCompanyId)) && first) {
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
        setSelectedCompanyProgramIds([])
        setTicketDrafts({})
        setReportForm(EMPTY_COMPANY_ANALYSIS_REPORT_FORM)
        return
      }
      setLoadingDetails(true)
      try {
        const [infoSnap, assessmentSnap, filesSnap, companySnap, reportSnap] = await Promise.all([
          getDoc(doc(db, "companies", selectedCompanyId, "companyInfo", "info")),
          getDoc(
            doc(db, "companies", selectedCompanyId, "selfAssessment", "info")
          ),
          getDocs(collection(db, "companies", selectedCompanyId, "files")),
          getDoc(doc(db, "companies", selectedCompanyId)),
          getDoc(doc(db, "companies", selectedCompanyId, "analysisReport", "current")),
        ])
        if (!mounted) return
        const nextCompanyInfo = infoSnap.exists()
          ? (infoSnap.data() as CompanyInfoRecord)
          : null
        setCompanyInfo(nextCompanyInfo)
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
          ? (companySnap.data() as {
            programTicketOverrides?: Record<string, { internal?: number; external?: number }>
            programs?: string[]
          })
          : {}
        const overrides = overrideData.programTicketOverrides ?? {}
        const companyProgramIds = Array.isArray(overrideData.programs)
          ? overrideData.programs.filter((value): value is string => typeof value === "string")
          : []
        setSelectedCompanyProgramIds(companyProgramIds)
        const participating = programs.filter((program) => companyProgramIds.includes(program.id))
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
        const companyName =
          nextCompanyInfo?.basic?.companyInfo ||
          (companySnap.exists() ? ((companySnap.data() as { name?: string | null }).name ?? "") : "")
        const savedReport = reportSnap.exists()
          ? (reportSnap.data() as Partial<CompanyAnalysisReportForm>)
          : null
        setReportForm(toCompanyAnalysisReportForm(savedReport, companyName))
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
    if (selectedCompanyProgramIds.length === 0) return []
    return programs.filter((program) => selectedCompanyProgramIds.includes(program.id))
  }, [programs, selectedCompanyProgramIds])

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
      return name.includes(query)
    })
  }, [companies, companyQuery])

  const totalCompanyPages = Math.max(
    1,
    Math.ceil(filteredCompanies.length / COMPANY_PAGE_SIZE)
  )

  const paginatedCompanies = useMemo(() => {
    const startIndex = (companyPage - 1) * COMPANY_PAGE_SIZE
    return filteredCompanies.slice(startIndex, startIndex + COMPANY_PAGE_SIZE)
  }, [companyPage, filteredCompanies])

  useEffect(() => {
    setCompanyPage(1)
  }, [companyQuery])

  useEffect(() => {
    setCompanyPage((prev) => Math.min(prev, totalCompanyPages))
  }, [totalCompanyPages])

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
    const size = 320
    const center = size / 2
    const radius = size / 2 - 44
    const axes = assessmentSummary.grouped.map((section, index) => {
      const angle = (Math.PI * 2 * index) / assessmentSummary.grouped.length - Math.PI / 2
      const total = assessmentSummary.sectionTotals[section.sectionKey] ?? section.sectionTotal
      const score = assessmentSummary.sectionScores[section.sectionKey] ?? section.sectionScore
      const ratio = total > 0 ? score / total : 0
      const x = center + Math.cos(angle) * radius * ratio
      const y = center + Math.sin(angle) * radius * ratio
      const labelX = center + Math.cos(angle) * (radius + 30)
      const labelY = center + Math.sin(angle) * (radius + 30)
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

  const improvementSections = useMemo(
    () => splitNumberedReportSections(reportForm.improvements),
    [reportForm.improvements]
  )

  const diagnosticSummaryText = useMemo(() => {
    const sections = [
      reportForm.summaryCapability.trim(),
      reportForm.summaryMarket.trim(),
    ].filter(Boolean)
    return sections.length > 0 ? sections.join("\n\n") : ""
  }, [reportForm.summaryCapability, reportForm.summaryMarket])

  const improvementsText = useMemo(() => {
    if (improvementSections.length > 0) {
      return improvementSections.join("\n\n")
    }
    return reportForm.improvements.trim()
  }, [improvementSections, reportForm.improvements])

  const handleDiagnosticSummaryChange = (value: string) => {
    const normalized = value.replace(/\r\n/g, "\n").trim()
    if (!normalized) {
      setReportForm((prev) => ({
        ...prev,
        summaryCapability: "",
        summaryMarket: "",
      }))
      return
    }

    const paragraphs = splitReportParagraphs(normalized)
    if (paragraphs.length <= 1) {
      setReportForm((prev) => ({
        ...prev,
        summaryCapability: normalized,
        summaryMarket: "",
      }))
      return
    }

    const midpoint = Math.ceil(paragraphs.length / 2)
    setReportForm((prev) => ({
      ...prev,
      summaryCapability: paragraphs.slice(0, midpoint).join("\n\n"),
      summaryMarket: paragraphs.slice(midpoint).join("\n\n"),
    }))
  }

  const handleGenerateAiDraft = async () => {
    if (!companyInfo) {
      toast.error("기업 정보가 없어 AI 초안을 생성할 수 없습니다")
      return
    }

    setIsGeneratingReport(true)
    try {
      const assessmentDetails = assessmentSummary.grouped.flatMap((section) =>
        section.questions.map((item) => ({
          sectionTitle: item.sectionTitle,
          subsectionTitle: item.subsectionTitle,
          questionText: item.questionText,
          answerLabel: item.answerLabel,
          reason: item.reason,
          score: item.score,
        })),
      )

      const result = await generateCompanyAnalysisReportViaFunction({
        companyName:
          reportForm.companyName ||
          companyInfo.basic?.companyInfo ||
          companies.find((company) => company.id === selectedCompanyId)?.name ||
          "회사명 미정",
        companyInfo,
        assessmentSummary: {
          totalScore: assessmentSummary.totalScore,
          grouped: assessmentSummary.grouped.map((section) => ({
            sectionTitle: section.sectionTitle,
            sectionScore: section.sectionScore,
            sectionTotal: section.sectionTotal,
          })),
        },
        assessmentDetails,
      })

      setReportForm((prev) => ({
        ...prev,
        ...result.report,
        createdAt: new Date().toLocaleString("ko-KR"),
      }))
      toast.success("AI 보고서 초안이 생성되었습니다")
    } catch (error) {
      console.error("Failed to generate AI company report:", error)
      toast.error("AI 보고서 초안 생성에 실패했습니다")
    } finally {
      setIsGeneratingReport(false)
    }
  }

  const handleSaveReport = async () => {
    if (!selectedCompanyId) {
      toast.error("회사를 먼저 선택해주세요")
      return
    }

    setSavingReport(true)
    try {
      const companyName =
        companyInfo?.basic?.companyInfo ||
        companies.find((company) => company.id === selectedCompanyId)?.name ||
        reportForm.companyName ||
        "회사명 미정"
      const savedAt = new Date().toLocaleString("ko-KR")

      const nextReportForm = {
        ...reportForm,
        companyName,
        createdAt: savedAt,
      }

      await setDoc(
        doc(db, "companies", selectedCompanyId, "analysisReport", "current"),
        {
          ...nextReportForm,
          companyId: selectedCompanyId,
          updatedAt: serverTimestamp(),
          updatedByUid: user.uid,
        },
        { merge: true }
      )

      setReportForm(nextReportForm)
      toast.success("분석 보고서가 저장되었습니다")
    } catch (error) {
      console.error("Failed to save company analysis report:", error)
      toast.error("분석 보고서 저장에 실패했습니다")
    } finally {
      setSavingReport(false)
    }
  }

  const handleDownloadReportExcel = async () => {
    if (!selectedCompanyId) {
      toast.error("회사를 먼저 선택해주세요")
      return
    }

    setDownloadingReport(true)
    try {
      const workbook = new ExcelJS.Workbook()
      workbook.creator = "MYSC"
      workbook.created = new Date()

      const worksheet = workbook.addWorksheet("기업진단분석보고서")
      worksheet.columns = [
        { width: 3 },
        { width: 18 },
        { width: 18 },
        { width: 18 },
        { width: 18 },
        { width: 18 },
        { width: 18 },
        { width: 15 },
        { width: 15 },
        { width: 15 },
      ]

      worksheet.mergeCells("B1:J1")
      const titleCell = worksheet.getCell("B1")
      titleCell.value = "기업진단분석보고서"
      titleCell.font = { name: "Malgun Gothic", size: 16, bold: true }
      titleCell.alignment = { vertical: "middle", horizontal: "left" }
      worksheet.getRow(1).height = 26

      const applyBorderRange = (
        rowNumber: number,
        startColumn: number,
        endColumn: number,
        borderColor = "FFCBD5E1"
      ) => {
        for (let column = startColumn; column <= endColumn; column += 1) {
          worksheet.getRow(rowNumber).getCell(column).border = {
            top: { style: "thin", color: { argb: "FFCBD5E1" } },
            left: { style: "thin", color: { argb: borderColor } },
            bottom: { style: "thin", color: { argb: borderColor } },
            right: { style: "thin", color: { argb: borderColor } },
          }
        }
      }

      const estimateRowHeight = (
        text: string,
        charsPerLine: number,
        minHeight = 24,
        maxHeight = 110
      ) => {
        const lineCount = String(text || "")
          .split("\n")
          .reduce((count, line) => {
            const normalized = line.trim()
            return count + Math.max(1, Math.ceil((normalized.length || 1) / charsPerLine))
          }, 0)

        return Math.min(maxHeight, Math.max(minHeight, lineCount * 16 + 6))
      }

      const writeLabelValueRow = (
        rowIndex: number,
        label: string,
        value: string,
        charsPerLine = 120
      ) => {
        const row = worksheet.getRow(rowIndex)
        row.getCell(2).value = label
        worksheet.mergeCells(`C${rowIndex}:J${rowIndex}`)
        row.getCell(3).value = value
        row.getCell(2).font = { name: "Malgun Gothic", size: 10, bold: true }
        row.getCell(3).font = { name: "Malgun Gothic", size: 10 }
        row.getCell(2).alignment = { vertical: "top", wrapText: true }
        row.getCell(3).alignment = { vertical: "top", wrapText: true }
        row.getCell(2).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" },
        }
        row.height = estimateRowHeight(value, charsPerLine)
        applyBorderRange(rowIndex, 2, 10)
      }

      const writeSectionHeader = (rowIndex: number, title: string) => {
        worksheet.mergeCells(`B${rowIndex}:J${rowIndex}`)
        const cell = worksheet.getCell(`B${rowIndex}`)
        cell.value = title
        cell.font = { name: "Malgun Gothic", size: 11, bold: true }
        cell.alignment = { vertical: "middle", horizontal: "left" }
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFEFF6FF" },
        }
        worksheet.getRow(rowIndex).height = 20
        applyBorderRange(rowIndex, 2, 10)
      }

      const radarChartSvg = buildRadarChartSvg(radarData)
      const radarChartImage = await renderSvgToPngDataUrl(radarChartSvg)
      const radarChartImageId = workbook.addImage({
        base64: radarChartImage,
        extension: "png",
      })

      let rowIndex = 3
      writeLabelValueRow(rowIndex, "기업명", reportForm.companyName || "")
      rowIndex += 1
      writeLabelValueRow(rowIndex, "작성일시", reportForm.createdAt || "")
      rowIndex += 2

      writeSectionHeader(rowIndex, "현황 분석 점수")
      rowIndex += 1

      const mainSheetChartRow = rowIndex
      const mainSheetChartHeightRows = 14
      worksheet.addImage(radarChartImageId, {
        tl: { col: 1.1, row: mainSheetChartRow - 0.35 },
        ext: { width: 470, height: 320 },
        editAs: "oneCell",
      })
      for (let row = mainSheetChartRow; row < mainSheetChartRow + mainSheetChartHeightRows; row += 1) {
        worksheet.getRow(row).height = 18
      }

      const writeScoreSummaryRow = (
        rowNumber: number,
        label: string,
        value: string,
        highlighted = false
      ) => {
        const row = worksheet.getRow(rowNumber)
        worksheet.mergeCells(`H${rowNumber}:I${rowNumber}`)
        row.getCell(8).value = label
        row.getCell(10).value = value
        row.getCell(8).font = { name: "Malgun Gothic", size: 10, bold: true }
        row.getCell(10).font = {
          name: "Malgun Gothic",
          size: 10,
          bold: highlighted,
        }
        row.getCell(8).alignment = { vertical: "middle", wrapText: false }
        row.getCell(10).alignment = { vertical: "middle", wrapText: false, horizontal: "right" }
        const fillColor = highlighted ? "FFF0FDF4" : "FFF8FAFC"
        const borderColor = highlighted ? "FFA7F3D0" : "FFCBD5E1"
        row.getCell(8).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: fillColor },
        }
        row.getCell(10).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: highlighted ? "FFECFDF5" : "FFFFFFFF" },
        }
        row.height = 20
        applyBorderRange(rowNumber, 8, 10, borderColor)
      }

      worksheet.mergeCells(`H${mainSheetChartRow}:J${mainSheetChartRow}`)
      const scoreTableTitleCell = worksheet.getCell(`H${mainSheetChartRow}`)
      scoreTableTitleCell.value = "항목별 점수"
      scoreTableTitleCell.font = { name: "Malgun Gothic", size: 10, bold: true }
      scoreTableTitleCell.alignment = { vertical: "middle", horizontal: "left" }
      scoreTableTitleCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF8FAFC" },
      }
      worksheet.getRow(mainSheetChartRow).height = 20
      applyBorderRange(mainSheetChartRow, 8, 10)

      let mainSheetScoreRow = mainSheetChartRow + 1
      writeScoreSummaryRow(mainSheetScoreRow, "총점", `${formatScore(assessmentSummary.totalScore)}/100점`, true)
      mainSheetScoreRow += 1
      assessmentSummary.grouped.forEach((section) => {
        writeScoreSummaryRow(
          mainSheetScoreRow,
          section.sectionTitle,
          `${formatScore(section.sectionScore)}/${formatScore(section.sectionTotal)}점`
        )
        mainSheetScoreRow += 1
      })

      rowIndex = mainSheetChartRow + mainSheetChartHeightRows + 1

      writeSectionHeader(rowIndex, "기업상황요약")
      rowIndex += 1
      writeLabelValueRow(rowIndex, "기업진단", diagnosticSummaryText || "", 135)
      rowIndex += 1
      writeLabelValueRow(rowIndex, "개선 필요사항", improvementsText || "", 135)
      rowIndex += 2

      writeSectionHeader(rowIndex, "AC 프로그램 제안")
      rowIndex += 1
      writeLabelValueRow(rowIndex, "1순위", reportForm.acPriority1 || "", 135)
      rowIndex += 1
      writeLabelValueRow(rowIndex, "2순위", reportForm.acPriority2 || "", 135)
      rowIndex += 1
      writeLabelValueRow(rowIndex, "3순위", reportForm.acPriority3 || "", 135)
      rowIndex += 2

      writeSectionHeader(rowIndex, "엑셀러레이팅 마일스톤 제안")
      rowIndex += 1
      writeLabelValueRow(rowIndex, "5~6월", reportForm.milestone56 || "", 135)
      rowIndex += 1
      writeLabelValueRow(rowIndex, "7~8월", reportForm.milestone78 || "", 135)
      rowIndex += 1
      writeLabelValueRow(rowIndex, "9~10월", reportForm.milestone910 || "", 135)

      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
      const safeCompanyName = (reportForm.companyName || "company-report")
        .replace(/[\\/:*?"<>|]/g, "-")
        .trim()
      const safeCreatedAt = (reportForm.createdAt || new Date().toLocaleDateString("ko-KR"))
        .replace(/[\\/:*?"<>|]/g, "-")
        .trim()
      const filename = `${safeCompanyName}_기업진단분석보고서_${safeCreatedAt}.xlsx`
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      toast.success("분석 보고서를 엑셀로 다운로드했습니다")
    } catch (error) {
      console.error("Failed to download company analysis report:", error)
      toast.error("엑셀 다운로드에 실패했습니다")
    } finally {
      setDownloadingReport(false)
    }
  }

  return (
    <div className="bg-transparent h-full">
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-5">
          <div className="mx-auto w-full max-w-7xl">
            <h1 className="text-2xl font-semibold text-slate-900">
              기업 관리
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              기업 기본 정보, 자가진단표, 업로드 자료와 티켓 현황을 관리합니다.
            </p>
          </div>
        </div>
        <div className="mx-auto grid h-full w-full max-w-7xl flex-1 min-h-0 gap-6 px-6 py-5 lg:grid-cols-[300px_1fr]">
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white lg:sticky lg:top-5 lg:max-h-[calc(100vh-12rem)]">
            <div className="shrink-0 border-b border-slate-100 px-4 py-4">
              <div className="text-sm font-semibold text-slate-700">
                회사 목록
              </div>
              <input
                className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                placeholder="회사명 검색"
                value={companyQuery}
                onChange={(e) => setCompanyQuery(e.target.value)}
              />
              <div className="mt-2 text-xs text-slate-500">
                총 {filteredCompanies.length.toLocaleString()}개
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {loadingCompanies ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
                  회사 목록을 불러오는 중입니다.
                </div>
              ) : filteredCompanies.length === 0 ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
                  검색 결과가 없습니다.
                </div>
              ) : (
                <div className="space-y-2">
                  {paginatedCompanies.map((company) => (
                    <button
                      key={company.id}
                      type="button"
                      onClick={() => setSelectedCompanyId(company.id)}
                      className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition ${company.id === selectedCompanyId
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                    >
                      <div className="truncate font-medium">{company.name}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {filteredCompanies.length > COMPANY_PAGE_SIZE ? (
              <div className="shrink-0 border-t border-slate-100 px-3 py-3">
                <PaginationControls
                  page={companyPage}
                  totalItems={filteredCompanies.length}
                  pageSize={COMPANY_PAGE_SIZE}
                  onPageChange={setCompanyPage}
                />
              </div>
            ) : null}
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
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-800">
                          기업진단분석보고서
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          기업 정보와 현황 진단을 바탕으로 AI 초안을 생성한 뒤 수정할 수 있습니다.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleGenerateAiDraft()}
                          disabled={isGeneratingReport || !companyInfo}
                          className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Wand2 className="h-3.5 w-3.5" />
                          {isGeneratingReport ? "AI 초안 생성 중..." : "AI 초안 생성"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDownloadReportExcel()}
                          disabled={downloadingReport || !selectedCompanyId}
                          className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                          {downloadingReport ? "다운로드 준비 중..." : "엑셀 다운로드"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSaveReport()}
                          disabled={savingReport || !selectedCompanyId}
                          className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 transition hover:border-sky-300 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Save className="h-3.5 w-3.5" />
                          {savingReport ? "저장 중..." : "보고서 저장"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                      <div className="text-xs font-semibold tracking-[0.08em] text-slate-400">
                        기업명
                      </div>
                      <div className="mt-2 text-sm text-slate-700">
                        {reportForm.companyName || "-"}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                      <div className="text-xs font-semibold tracking-[0.08em] text-slate-400">
                        작성일시
                      </div>
                      <div className="mt-2 text-sm text-slate-700">
                        {reportForm.createdAt || "-"}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-2">
                    <div className="text-sm font-semibold text-slate-700">
                      현황 분석 점수
                    </div>
                    <div className="mt-1 grid gap-0.5 lg:grid-cols-[316px_1fr] lg:items-center">
                      <div className="-mt-3 flex items-start justify-start -ml-8">
                        <svg
                          width={radarData.size}
                          height={radarData.size}
                          viewBox={`-72 -72 ${radarData.size + 144} ${radarData.size + 144}`}
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
                              textAnchor="middle"
                              fontSize="14"
                              fill="#475569"
                            >
                              {getRadarLabelLines(axis.label).map((line, lineIndex) => (
                                <tspan
                                  key={`${axis.label}-${lineIndex}`}
                                  x={axis.labelX}
                                  dy={lineIndex === 0 ? 0 : 16}
                                >
                                  {line}
                                </tspan>
                              ))}
                            </text>
                          ))}
                        </svg>
                      </div>
                      <div className="-ml-2 grid grid-cols-2 gap-1.5 self-center sm:grid-cols-3 lg:-ml-3 lg:mr-1">
                        {assessmentSummary.grouped.map((section) => (
                          <div
                            key={`score-${section.sectionTitle}`}
                            className="flex min-h-[52px] flex-col justify-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 shadow-sm"
                          >
                            <div className="overflow-visible whitespace-nowrap text-center text-[10px] font-semibold leading-tight tracking-tight text-slate-700">
                              {section.sectionTitle}
                            </div>
                            <div className="mt-0.5 whitespace-nowrap text-center text-[10px] leading-tight tracking-tight text-slate-600">
                              {formatScore(section.sectionScore)}/{formatScore(section.sectionTotal)}점
                            </div>
                          </div>
                        ))}
                        <div className="flex min-h-[52px] flex-col justify-center rounded-md border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800 shadow-sm sm:col-start-3">
                          <div className="text-center font-semibold leading-tight">총점</div>
                          <div className="mt-0.5 text-center text-[11px] leading-tight">
                            {formatScore(assessmentSummary.totalScore)}/100점
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-sm font-semibold text-slate-700">
                      기업상황요약
                    </div>
                    <div className="mt-4 space-y-5">
                      <div className="space-y-4">
                        <div className="text-xs font-semibold tracking-[0.08em] text-slate-400">
                          기업진단
                        </div>
                        <textarea
                          rows={4}
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-[13px] leading-6 text-slate-700"
                          value={diagnosticSummaryText}
                          onChange={(e) => handleDiagnosticSummaryChange(e.target.value)}
                        />
                      </div>

                      <div className="border-t border-slate-100" />

                      <div className="space-y-4">
                        <div className="text-xs font-semibold tracking-[0.08em] text-slate-400">
                          개선 필요사항
                        </div>
                        <textarea
                          rows={5}
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-[13px] leading-6 text-slate-700"
                          value={improvementsText}
                          onChange={(e) =>
                            setReportForm((prev) => ({
                              ...prev,
                              improvements: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-sm font-semibold text-slate-700">
                      AC 프로그램 제안
                    </div>
                    <div className="mt-3 space-y-3">
                      <label className="text-xs text-slate-500">
                        1순위
                        <textarea
                          rows={2}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] leading-6 text-slate-700"
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
                        <textarea
                          rows={2}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] leading-6 text-slate-700"
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
                        <textarea
                          rows={2}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] leading-6 text-slate-700"
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
                      <div className="mt-3 space-y-4">
                        <label className="grid gap-2 text-xs text-slate-500 lg:grid-cols-[96px_minmax(0,1fr)] lg:items-start">
                          <span className="inline-flex h-6 items-center justify-center self-start rounded-full border border-slate-200 bg-white px-2 text-[10px] font-medium tracking-[0.01em] text-slate-600">
                            5~6월
                          </span>
                          <textarea
                            rows={4}
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] leading-6 text-slate-700"
                            value={reportForm.milestone56}
                            onChange={(e) =>
                            setReportForm((prev) => ({
                              ...prev,
                              milestone56: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="grid gap-2 text-xs text-slate-500 lg:grid-cols-[96px_minmax(0,1fr)] lg:items-start">
                        <span className="inline-flex h-6 items-center justify-center self-start rounded-full border border-slate-200 bg-white px-2 text-[10px] font-medium tracking-[0.01em] text-slate-600">
                          7~8월
                        </span>
                        <textarea
                          rows={4}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] leading-6 text-slate-700"
                          value={reportForm.milestone78}
                          onChange={(e) =>
                            setReportForm((prev) => ({
                              ...prev,
                            milestone78: e.target.value,
                          }))
                        }
                      />
                    </label>
                      <label className="grid gap-2 text-xs text-slate-500 lg:grid-cols-[96px_minmax(0,1fr)] lg:items-start">
                        <span className="inline-flex h-6 items-center justify-center self-start rounded-full border border-slate-200 bg-white px-2 text-[10px] font-medium tracking-[0.01em] text-slate-600">
                          9~10월
                        </span>
                        <textarea
                          rows={4}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] leading-6 text-slate-700"
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
