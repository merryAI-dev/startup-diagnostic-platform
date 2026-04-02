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
import { CheckCircle2, FileSpreadsheet, Save, Wand2 } from "lucide-react"
import { Fragment, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { SELF_ASSESSMENT_SECTIONS } from "@/data/selfAssessment"
import { db, storage } from "@/firebase/client"
import { generateCompanyAnalysisReportViaFunction } from "@/redesign/app/lib/functions"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/redesign/app/components/ui/dialog"
import { PaginationControls } from "@/redesign/app/components/ui/pagination-controls"
import { formatCurrency, formatNumber } from "@/redesign/app/lib/company-metrics-data"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/redesign/app/components/ui/select"
import { ContentLoadingOverlay } from "@/redesign/app/components/ui/content-loading-overlay"
import {
  COMPANY_ANALYSIS_AC_FIELDS,
  COMPANY_ANALYSIS_BUSINESS_MODEL_FIELDS,
  COMPANY_ANALYSIS_IMPROVEMENT_FIELDS,
  COMPANY_ANALYSIS_MILESTONE_FIELDS,
  COMPANY_ANALYSIS_SUMMARY_FIELDS,
  EMPTY_COMPANY_ANALYSIS_REPORT_FORM,
  toCompanyAnalysisReportForm,
  type CompanyAnalysisReportForm,
} from "@/types/companyAnalysisReport"
import type { CompanyInfoRecord } from "@/types/company"
import type { SelfAssessmentSections } from "@/types/selfAssessment"
import type { MonthlyMetrics } from "@/redesign/app/lib/types"

type AdminDashboardProps = {
  user: User
  onLogout: () => void
}

type CompanySummary = {
  id: string
  name: string | null
  ownerUid: string
  hasExportVoucher: boolean
  hasInnovationVoucher: boolean
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

type MetricFormat = "number" | "currency"

type CustomMetricField = {
  key: string
  label: string
  format: MetricFormat
}

type MetricsSnapshot = {
  companyId: string
  companyName: string
  year: number
  data: MonthlyMetrics[]
  customFields: CustomMetricField[]
  visibleBaseMetricKeys: string[]
  updatedAt?: unknown
}

type MetricChartField = {
  key: string
  label: string
  format: MetricFormat
  color: string
}

type CompanyInfoField = {
  label: string
  value: string
  span?: "half" | "full"
  group?: string
}

type CompanyInfoSection = {
  title: string
  description?: string
  fields: CompanyInfoField[]
}

type VoucherFilterTag = "export" | "innovation"

const COMPANY_PAGE_SIZE = 8
const METRIC_MONTHS = Array.from({ length: 12 }, (_, index) => index + 1)
const BASE_METRIC_CHART_FIELDS: MetricChartField[] = [
  { key: "revenue", label: "매출", format: "currency", color: "#2563eb" },
  { key: "employees", label: "팀원 수", format: "number", color: "#0f766e" },
  { key: "customers", label: "고객 수", format: "number", color: "#8b5cf6" },
  { key: "monthlyActiveUsers", label: "MAU", format: "number", color: "#d97706" },
  { key: "patents", label: "특허", format: "number", color: "#dc2626" },
  { key: "certifications", label: "인증", format: "number", color: "#0891b2" },
]
const CUSTOM_METRIC_CHART_COLORS = [
  "#7c3aed",
  "#db2777",
  "#16a34a",
  "#ea580c",
  "#0284c7",
  "#ca8a04",
]
const DEFAULT_VISIBLE_BASE_METRIC_KEYS = BASE_METRIC_CHART_FIELDS.map((field) => field.key)

function excelColumnName(columnNumber: number) {
  let column = columnNumber
  let result = ""
  while (column > 0) {
    const remainder = (column - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    column = Math.floor((column - 1) / 26)
  }
  return result || "A"
}

function buildCompanyInfoTableRows(fields: CompanyInfoField[]) {
  const rows: CompanyInfoField[][] = []
  let currentRow: CompanyInfoField[] = []

  fields.forEach((field) => {
    if (field.span === "full") {
      if (currentRow.length > 0) {
        rows.push(currentRow)
        currentRow = []
      }
      rows.push([field])
      return
    }

    currentRow.push(field)
    if (currentRow.length === 2) {
      rows.push(currentRow)
      currentRow = []
    }
  })

  if (currentRow.length > 0) {
    rows.push(currentRow)
  }

  return rows
}

function groupCompanyInfoFields(fields: CompanyInfoField[]) {
  const ungrouped: CompanyInfoField[] = []
  const grouped = new Map<string, CompanyInfoField[]>()

  fields.forEach((field) => {
    if (!field.group) {
      ungrouped.push(field)
      return
    }

    const existing = grouped.get(field.group) ?? []
    existing.push(field)
    grouped.set(field.group, existing)
  })

  return {
    ungrouped,
    groupedEntries: Array.from(grouped.entries()),
  }
}

function isVoucherHeld(value: unknown) {
  return typeof value === "string" && value.trim() === "예"
}

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

function createEmptyMonth(year: number, month: number): MonthlyMetrics {
  return {
    month,
    year,
    revenue: 0,
    employees: 0,
    patents: 0,
    certifications: 0,
    customers: 0,
    monthlyActiveUsers: 0,
    otherMetrics: {},
  }
}

function formatCompanyInfoDateLabel(value: unknown) {
  const date = normalizeUnknownDate(value)
  if (!date) return "-"
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function normalizeMonthlyMetrics(data: MonthlyMetrics[], year: number): MonthlyMetrics[] {
  const dataByMonth = new Map(data.map((item) => [item.month, item]))

  return METRIC_MONTHS.map((month) => {
    const existing = dataByMonth.get(month)
    if (!existing) {
      return createEmptyMonth(year, month)
    }

    return {
      ...createEmptyMonth(year, month),
      ...existing,
      month,
      year,
      monthlyActiveUsers: existing.monthlyActiveUsers ?? 0,
      otherMetrics: { ...(existing.otherMetrics ?? {}) },
    }
  })
}

function inferCustomMetricFields(data: MonthlyMetrics[]): CustomMetricField[] {
  const keys = new Set<string>()
  data.forEach((item) => {
    Object.keys(item.otherMetrics ?? {}).forEach((key) => keys.add(key))
  })

  return Array.from(keys).map((key) => ({
    key,
    label: key,
    format: "number" as const,
  }))
}

function normalizeCustomMetricFields(
  value: unknown,
  fallback: CustomMetricField[],
): CustomMetricField[] {
  if (!Array.isArray(value)) {
    return fallback
  }

  const fields = value
    .filter(
      (field): field is CustomMetricField =>
        typeof field?.key === "string" &&
        typeof field?.label === "string" &&
        (field?.format === "number" || field?.format === "currency"),
    )
    .map((field) => ({
      key: field.key,
      label: field.label.trim() || field.key,
      format: field.format,
    }))

  return fields.length > 0 ? fields : fallback
}

function normalizeMetricsSnapshot(
  source: Partial<MetricsSnapshot> | null | undefined,
  companyId: string,
): MetricsSnapshot | null {
  if (!source) return null

  const year =
    typeof source.year === "number" && Number.isFinite(source.year)
      ? source.year
      : new Date().getFullYear()
  const data = Array.isArray(source.data) ? source.data : []
  const inferredCustomFields = inferCustomMetricFields(data)
  const customFields = normalizeCustomMetricFields(source.customFields, inferredCustomFields)
  const visibleBaseMetricKeys = Array.isArray(source.visibleBaseMetricKeys)
    ? DEFAULT_VISIBLE_BASE_METRIC_KEYS.filter((key) => source.visibleBaseMetricKeys?.includes(key))
    : DEFAULT_VISIBLE_BASE_METRIC_KEYS

  return {
    companyId,
    companyName: typeof source.companyName === "string" ? source.companyName : "",
    year,
    data: normalizeMonthlyMetrics(data, year),
    customFields,
    visibleBaseMetricKeys: visibleBaseMetricKeys.length > 0 ? visibleBaseMetricKeys : DEFAULT_VISIBLE_BASE_METRIC_KEYS,
    updatedAt: source.updatedAt,
  }
}

function formatMetricValue(value: number, format: MetricFormat) {
  return format === "currency" ? formatCurrency(value) : formatNumber(value)
}

function getMetricCellValue(item: MonthlyMetrics, key: string) {
  switch (key) {
    case "revenue":
      return item.revenue
    case "employees":
      return item.employees
    case "customers":
      return item.customers
    case "monthlyActiveUsers":
      return item.monthlyActiveUsers ?? 0
    case "patents":
      return item.patents
    case "certifications":
      return item.certifications
    default:
      return item.otherMetrics?.[key] ?? 0
  }
}

function createMetricsCsv(
  fields: MetricChartField[],
  rows: MonthlyMetrics[],
) {
  const escapeCell = (value: string) => {
    if (/[",\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`
    }
    return value
  }

  const headers = ["월", ...fields.map((field) => field.label)]
  const body = rows.map((row) => [
    `${row.year}-${String(row.month).padStart(2, "0")}`,
    ...fields.map((field) => formatMetricValue(getMetricCellValue(row, field.key), field.format)),
  ])

  return [headers, ...body]
    .map((line) => line.map((cell) => escapeCell(String(cell))).join(","))
    .join("\n")
}

function buildRecentMonthSlots(baseYear: number, baseMonth: number, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const offset = count - 1 - index
    let year = baseYear
    let month = baseMonth - offset

    while (month <= 0) {
      month += 12
      year -= 1
    }

    return { year, month }
  })
}

function normalizeUnknownDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof value === "object" && value !== null) {
    const maybeTimestamp = value as {
      toDate?: () => Date
      toMillis?: () => number
      seconds?: number
      nanoseconds?: number
    }
    if (typeof maybeTimestamp.toDate === "function") {
      try {
        const parsed = maybeTimestamp.toDate.call(value)
        if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) {
          return parsed
        }
      } catch {
        // Ignore invalid timestamp-like objects.
      }
    }
    if (typeof maybeTimestamp.toMillis === "function") {
      try {
        const parsed = new Date(maybeTimestamp.toMillis.call(value))
        if (!Number.isNaN(parsed.getTime())) {
          return parsed
        }
      } catch {
        // Ignore invalid timestamp-like objects.
      }
    }
    if (typeof maybeTimestamp.seconds === "number") {
      const nanos = typeof maybeTimestamp.nanoseconds === "number" ? maybeTimestamp.nanoseconds : 0
      const parsed = new Date(maybeTimestamp.seconds * 1000 + Math.floor(nanos / 1_000_000))
      return Number.isNaN(parsed.getTime()) ? null : parsed
    }
  }
  return null
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
  const [companyMetrics, setCompanyMetrics] = useState<MetricsSnapshot | null>(null)
  const [companyFiles, setCompanyFiles] = useState<
    { id: string; name: string; size: number; downloadUrl: string | null }[]
  >([])
  const [selfAssessment, setSelfAssessment] = useState<SelfAssessmentSections>(
    {}
  )
  const [loadingCompanies, setLoadingCompanies] = useState(true)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [companyQuery, setCompanyQuery] = useState("")
  const [voucherFilterTags, setVoucherFilterTags] = useState<VoucherFilterTag[]>([])
  const [companyPage, setCompanyPage] = useState(1)
  const [activeTab, setActiveTab] = useState<"info" | "assessment" | "metrics" | "report" | "officeHours">(
    "info"
  )
  const [selectedMetricChartKey, setSelectedMetricChartKey] = useState("revenue")
  const [programs, setPrograms] = useState<ProgramSummary[]>([])
  const [selectedCompanyProgramIds, setSelectedCompanyProgramIds] = useState<string[]>([])
  const [loadingPrograms, setLoadingPrograms] = useState(false)
  const [ticketDrafts, setTicketDrafts] = useState<Record<string, { internal: string; external: string }>>({})
  const [editingTicketProgramId, setEditingTicketProgramId] = useState<string | null>(null)
  const [ticketModalDraft, setTicketModalDraft] = useState<{ internal: string; external: string }>({
    internal: "0",
    external: "0",
  })
  const [savingTickets, setSavingTickets] = useState(false)
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [savingReport, setSavingReport] = useState(false)
  const [downloadingReport, setDownloadingReport] = useState(false)
  const [downloadingCompanyWorkbook, setDownloadingCompanyWorkbook] = useState(false)
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
        const liveCompanyDocs = companySnapshot.docs.filter((docSnap) => liveCompanyIds.has(docSnap.id))
        const companyInfoEntries = await Promise.all(
          liveCompanyDocs.map(async (docSnap) => {
            const companyInfoSnap = await getDoc(doc(db, "companies", docSnap.id, "companyInfo", "info"))
            const companyInfoData = companyInfoSnap.exists()
              ? (companyInfoSnap.data() as Partial<CompanyInfoRecord>)
              : null
            return [
              docSnap.id,
              {
                hasExportVoucher: isVoucherHeld(companyInfoData?.vouchers?.exportVoucherHeld),
                hasInnovationVoucher: isVoucherHeld(companyInfoData?.vouchers?.innovationVoucherHeld),
              },
            ] as const
          }),
        )
        if (!mounted) return
        const voucherStatusByCompanyId = new Map(companyInfoEntries)
        const list = liveCompanyDocs
          .map((docSnap) => {
            const data = docSnap.data() as {
              name?: string | null
              ownerUid?: string
            }
            const voucherStatus = voucherStatusByCompanyId.get(docSnap.id)
            return {
              id: docSnap.id,
              name: data.name?.trim() || "회사명 미정",
              ownerUid: data.ownerUid ?? "",
              hasExportVoucher: voucherStatus?.hasExportVoucher ?? false,
              hasInnovationVoucher: voucherStatus?.hasInnovationVoucher ?? false,
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
        const programSnapshot = await getDocs(collection(db, "programs"))
        if (!mounted) return
        const list = programSnapshot.docs.map((docSnap) => {
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
        setCompanyMetrics(null)
        setSelfAssessment({})
        setCompanyFiles([])
        setSelectedCompanyProgramIds([])
        setTicketDrafts({})
        setReportForm(EMPTY_COMPANY_ANALYSIS_REPORT_FORM)
        return
      }
      setLoadingDetails(true)
      try {
        const [infoSnap, assessmentSnap, filesSnap, companySnap, reportSnap, metricsSnap] = await Promise.all([
          getDoc(doc(db, "companies", selectedCompanyId, "companyInfo", "info")),
          getDoc(
            doc(db, "companies", selectedCompanyId, "selfAssessment", "info")
          ),
          getDocs(collection(db, "companies", selectedCompanyId, "files")),
          getDoc(doc(db, "companies", selectedCompanyId)),
          getDoc(doc(db, "companies", selectedCompanyId, "analysisReport", "current")),
          getDoc(doc(db, "companies", selectedCompanyId, "metrics", "annual")),
        ])
        if (!mounted) return
        const nextCompanyInfo = infoSnap.exists()
          ? (infoSnap.data() as CompanyInfoRecord)
          : null
        setCompanyInfo(nextCompanyInfo)
        const nextMetrics = metricsSnap.exists()
          ? normalizeMetricsSnapshot(
            metricsSnap.data() as Partial<MetricsSnapshot>,
            selectedCompanyId,
          )
          : null
        setCompanyMetrics(nextMetrics)
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
  const formatListValue = (values?: string[] | null) => {
    if (!values || values.length === 0) return "-"
    return values.join(", ")
  }
  const formatScore = (value: number) => {
    const rounded = Math.round(value * 10) / 10
    return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1)
  }

  const investmentRows = useMemo(() => {
    return companyInfo?.investments ?? []
  }, [companyInfo])

  const participatingProgramNames = useMemo(() => {
    if (selectedCompanyProgramIds.length === 0) return []
    return programs
      .filter((program) => selectedCompanyProgramIds.includes(program.id))
      .map((program) => program.name.trim())
      .filter((name) => name.length > 0)
  }, [programs, selectedCompanyProgramIds])

  const companyInfoSections = useMemo<CompanyInfoSection[]>(() => {
    if (!companyInfo) return []
    const coRepresentativeEnabled = companyInfo.basic?.ceo?.coRepresentative?.enabled === true

    return [
      {
        title: "기본 정보",
        description: "회사 기본 식별 정보와 서비스 개요",
        fields: [
          { label: "회사 유형", value: formatValue(companyInfo.basic?.companyType) },
          { label: "회사명", value: formatValue(companyInfo.basic?.companyInfo) },
          { label: "대표 솔루션", value: formatValue(companyInfo.basic?.representativeSolution), span: "full" },
          { label: "웹사이트", value: formatValue(companyInfo.basic?.website), span: "full" },
          { label: "법인 설립일", value: formatValue(companyInfo.basic?.foundedAt) },
          { label: "창업기수", value: formatValue(companyInfo.basic?.founderSerialNumber) },
          { label: "사업자등록번호", value: formatValue(companyInfo.basic?.businessNumber) },
          { label: "주업태", value: formatValue(companyInfo.basic?.primaryBusiness) },
          { label: "주업종", value: formatValue(companyInfo.basic?.primaryIndustry) },
        ],
      },
      {
        title: "대표자 정보",
        description: "대표자 및 주요 담당자 기본 정보",
        fields: [
          { label: "대표자", value: formatValue(companyInfo.basic?.ceo?.name) },
          { label: "대표 이메일", value: formatValue(companyInfo.basic?.ceo?.email) },
          { label: "대표 전화번호", value: formatValue(companyInfo.basic?.ceo?.phone) },
          { label: "대표 나이", value: formatValue(companyInfo.basic?.ceo?.age) },
          { label: "대표 성별", value: formatValue(companyInfo.basic?.ceo?.gender) },
          { label: "대표 국적", value: formatValue(companyInfo.basic?.ceo?.nationality) },
        ],
      },
      ...(coRepresentativeEnabled
        ? [{
            title: "공동대표 정보",
            description: "공동대표 등록 여부와 상세 정보",
            fields: [
              { label: "공동대표 성명", value: formatValue(companyInfo.basic?.ceo?.coRepresentative?.name) },
              { label: "공동대표 생년월일", value: formatValue(companyInfo.basic?.ceo?.coRepresentative?.birthDate) },
              { label: "공동대표 성별", value: formatValue(companyInfo.basic?.ceo?.coRepresentative?.gender) },
              { label: "공동대표 직책", value: formatValue(companyInfo.basic?.ceo?.coRepresentative?.title) },
            ],
          } satisfies CompanyInfoSection]
        : []),
      {
        title: "소재지 및 인력",
        description: "사업장 위치와 현재 인력 현황",
        fields: [
          { label: "본점 소재지", value: formatValue(companyInfo.locations?.headOffice), span: "full" },
          { label: "지점/연구소 소재지", value: formatValue(companyInfo.locations?.branchOrLab), span: "full" },
          { label: "정규직", value: formatValue(companyInfo.workforce?.fullTime) },
          { label: "계약직", value: formatValue(companyInfo.workforce?.contract) },
        ],
      },
      {
        title: "재무 및 투자희망",
        description: "매출, 자본, 희망 투자 관련 수치",
        fields: [
          { label: "매출액(2025)", value: formatValue(companyInfo.finance?.revenue?.y2025) },
          { label: "매출액(2026)", value: formatValue(companyInfo.finance?.revenue?.y2026) },
          { label: "자본총계", value: formatValue(companyInfo.finance?.capitalTotal) },
          { label: "2026년 희망 투자액", value: formatValue(companyInfo.fundingPlan?.desiredAmount2026) },
          { label: "투자전 희망 기업가치", value: formatValue(companyInfo.fundingPlan?.preValue) },
        ],
      },
      {
        title: "인증 및 바우처",
        description: "인증, 지정, 바우처 보유 현황",
        fields: [
          { label: "인증/지정여부", value: formatValue(companyInfo.certifications?.designation) },
          { label: "TIPS/LIPS 이력", value: formatValue(companyInfo.certifications?.tipsLipsHistory) },
          {
            label: "수출바우처 보유 여부",
            value: formatValue(companyInfo.vouchers?.exportVoucherHeld),
            group: "수출바우처",
          },
          {
            label: "수출바우처 확보 금액",
            value: formatValue(companyInfo.vouchers?.exportVoucherAmount),
            group: "수출바우처",
          },
          {
            label: "수출바우처 소진율",
            value: formatValue(companyInfo.vouchers?.exportVoucherUsageRate),
            group: "수출바우처",
          },
          {
            label: "혁신바우처 보유 여부",
            value: formatValue(companyInfo.vouchers?.innovationVoucherHeld),
            group: "혁신바우처",
          },
          {
            label: "혁신바우처 확보 금액",
            value: formatValue(companyInfo.vouchers?.innovationVoucherAmount),
            group: "혁신바우처",
          },
          {
            label: "혁신바우처 소진율",
            value: formatValue(companyInfo.vouchers?.innovationVoucherUsageRate),
            group: "혁신바우처",
          },
        ],
      },
      {
        title: "임팩트 및 글로벌",
        description: "SDGs, 해외 진출, MYSC 기대사항",
        fields: [
          { label: "대표 SDGs 1", value: formatValue(companyInfo.impact?.sdgPriority1) },
          { label: "대표 SDGs 2", value: formatValue(companyInfo.impact?.sdgPriority2) },
          {
            label: "해외 지사 또는 진출 희망국가",
            value: formatListValue(companyInfo.globalExpansion?.targetCountries),
            span: "full",
          },
          { label: "MYSC 기대사항", value: formatValue(companyInfo.impact?.myscExpectation), span: "full" },
        ],
      },
    ]
  }, [companyInfo])

  const companyInfoSaveInfoItems = useMemo(() => {
    if (!companyInfo) return []
    return [
      { label: "저장 상태", value: formatValue(companyInfo.metadata?.saveType) },
      { label: "최초 저장", value: formatCompanyInfoDateLabel(companyInfo.metadata?.createdAt) },
      { label: "마지막 수정", value: formatCompanyInfoDateLabel(companyInfo.metadata?.updatedAt) },
    ]
  }, [companyInfo])

  const selectedCompanyName = useMemo(() => {
    const selectedCompany = companies.find((company) => company.id === selectedCompanyId)
    return (
      companyInfo?.basic?.companyInfo?.trim() ||
      selectedCompany?.name?.trim() ||
      "company"
    )
  }, [companies, companyInfo?.basic?.companyInfo, selectedCompanyId])

  const metricsUpdatedLabel = useMemo(() => {
    if (!companyMetrics?.updatedAt) return null
    const date = normalizeUnknownDate(companyMetrics.updatedAt)
    if (!date) return null
    if (Number.isNaN(date.getTime())) return null
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)
  }, [companyMetrics?.updatedAt])

  const recentMetricsRows = useMemo(() => {
    if (!companyMetrics) return []
    return companyMetrics.data
  }, [companyMetrics])

  const hasMetricsDocument = Boolean(companyMetrics)

  const metricChartFields = useMemo<MetricChartField[]>(() => {
    const visibleBaseFields = BASE_METRIC_CHART_FIELDS.filter((field) =>
      companyMetrics?.visibleBaseMetricKeys?.includes(field.key) ?? true,
    )
    const customFields = companyMetrics?.customFields.map((field, index) => ({
      key: field.key,
      label: field.label,
      format: field.format,
      color: CUSTOM_METRIC_CHART_COLORS[index % CUSTOM_METRIC_CHART_COLORS.length] ?? "#64748b",
    })) ?? []

    return [...visibleBaseFields, ...customFields]
  }, [companyMetrics?.customFields, companyMetrics?.visibleBaseMetricKeys])

  const selectedMetricChartField = useMemo(
    () => metricChartFields.find((field) => field.key === selectedMetricChartKey) ?? metricChartFields[0] ?? null,
    [metricChartFields, selectedMetricChartKey],
  )

  const emptyMetricsMonthSlots = useMemo(() => {
    return buildRecentMonthSlots(companyMetrics?.year ?? new Date().getFullYear(), 12, 12)
  }, [companyMetrics?.year])

  const metricsChartData = useMemo(() => {
    if (companyMetrics) {
      return companyMetrics.data.map((row) => ({
        label: `${row.month}월`,
        ...Object.fromEntries(
          metricChartFields.map((field) => [
            field.key,
            getMetricCellValue(row, field.key),
          ]),
        ),
      }))
    }

    return emptyMetricsMonthSlots.map((row) => ({
      label: `${row.month}월`,
      ...Object.fromEntries(metricChartFields.map((field) => [field.key, null])),
    }))
  }, [companyMetrics, emptyMetricsMonthSlots, metricChartFields])

  useEffect(() => {
    if (metricChartFields.length === 0) return
    if (!metricChartFields.some((field) => field.key === selectedMetricChartKey)) {
      setSelectedMetricChartKey(metricChartFields[0]?.key ?? "revenue")
    }
  }, [metricChartFields, selectedMetricChartKey])

  const handleDownloadMetricsCsv = () => {
    const csvContent = createMetricsCsv(
      metricChartFields,
      hasMetricsDocument ? recentMetricsRows : [],
    )
    const blob = new Blob([`\uFEFF${csvContent}`], {
      type: "text/csv;charset=utf-8;",
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${selectedCompanyName}-metrics.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  const participatingPrograms = useMemo(() => {
    if (selectedCompanyProgramIds.length === 0) return []
    return programs.filter((program) => selectedCompanyProgramIds.includes(program.id))
  }, [programs, selectedCompanyProgramIds])

  const persistTicketDrafts = async (
    nextDrafts: Record<string, { internal: string; external: string }>,
  ) => {
    if (!selectedCompanyId) return
    setSavingTickets(true)
    try {
      const overrides: Record<string, { internal?: number; external?: number }> = {}
      participatingPrograms.forEach((program) => {
        const draft = nextDrafts[program.id]
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
      setTicketDrafts(nextDrafts)
      toast.success("티켓 수가 변경되었습니다")
    } finally {
      setSavingTickets(false)
    }
  }

  const openTicketEditModal = (programId: string) => {
    const currentDraft = ticketDrafts[programId] ?? { internal: "0", external: "0" }
    setEditingTicketProgramId(programId)
    setTicketModalDraft(currentDraft)
  }

  const handleTicketModalChange = (field: "internal" | "external", value: string) => {
    setTicketModalDraft((prev) => ({
      ...prev,
      [field]: value.replace(/[^\d]/g, ""),
    }))
  }

  const handleSaveTicketModal = async () => {
    if (!editingTicketProgramId) return
    const nextDrafts = {
      ...ticketDrafts,
      [editingTicketProgramId]: {
        internal: ticketModalDraft.internal || "0",
        external: ticketModalDraft.external || "0",
      },
    }
    await persistTicketDrafts(nextDrafts)
    setEditingTicketProgramId(null)
  }

  const filteredCompanies = useMemo(() => {
    const query = companyQuery.trim().toLowerCase()
    return companies.filter((company) => {
      const name = (company.name ?? "").toLowerCase()
      if (query && !name.includes(query)) {
        return false
      }
      if (voucherFilterTags.includes("export") && !company.hasExportVoucher) {
        return false
      }
      if (voucherFilterTags.includes("innovation") && !company.hasInnovationVoucher) {
        return false
      }
      return true
    })
  }, [companies, companyQuery, voucherFilterTags])

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
  }, [companyQuery, voucherFilterTags])

  useEffect(() => {
    setCompanyPage((prev) => Math.min(prev, totalCompanyPages))
  }, [totalCompanyPages])

  useEffect(() => {
    if (filteredCompanies.length === 0) {
      if (selectedCompanyId !== null) {
        setSelectedCompanyId(null)
      }
      return
    }

    if (!selectedCompanyId || !filteredCompanies.some((company) => company.id === selectedCompanyId)) {
      setSelectedCompanyId(filteredCompanies[0]?.id ?? null)
    }
  }, [filteredCompanies, selectedCompanyId])

  const toggleVoucherFilterTag = (tag: VoucherFilterTag) => {
    setVoucherFilterTags((prev) =>
      prev.includes(tag) ? prev.filter((value) => value !== tag) : [...prev, tag],
    )
  }

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

      writeSectionHeader(rowIndex, "비즈니스 모델")
      rowIndex += 1
      COMPANY_ANALYSIS_BUSINESS_MODEL_FIELDS.forEach(({ key, label }) => {
        writeLabelValueRow(rowIndex, label, reportForm[key] || "", 135)
        rowIndex += 1
      })
      rowIndex += 1

      writeSectionHeader(rowIndex, "기업상황 요약")
      rowIndex += 1
      COMPANY_ANALYSIS_SUMMARY_FIELDS.forEach(({ key, label }) => {
        writeLabelValueRow(rowIndex, label, reportForm[key] || "", 135)
        rowIndex += 1
      })
      rowIndex += 1

      writeSectionHeader(rowIndex, "개선 필요사항")
      rowIndex += 1
      COMPANY_ANALYSIS_IMPROVEMENT_FIELDS.forEach(({ key, label }) => {
        writeLabelValueRow(rowIndex, label, reportForm[key] || "", 135)
        rowIndex += 1
      })
      rowIndex += 1

      writeSectionHeader(rowIndex, "액셀러레이팅 프로그램 활용 제안")
      rowIndex += 1
      COMPANY_ANALYSIS_AC_FIELDS.forEach(({ key, label }) => {
        writeLabelValueRow(rowIndex, label, reportForm[key] || "", 135)
        rowIndex += 1
      })
      rowIndex += 1

      writeSectionHeader(rowIndex, "엑셀러레이팅 마일스톤 제안")
      rowIndex += 1
      COMPANY_ANALYSIS_MILESTONE_FIELDS.forEach(({ key, label }) => {
        writeLabelValueRow(rowIndex, label, reportForm[key] || "", 135)
        rowIndex += 1
      })

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

  const handleDownloadCompanyWorkbook = async () => {
    if (!selectedCompanyId) {
      toast.error("회사를 먼저 선택해주세요")
      return
    }

    setDownloadingCompanyWorkbook(true)
    try {
      const workbook = new ExcelJS.Workbook()
      workbook.creator = "MYSC"
      workbook.created = new Date()

      const border = {
        top: { style: "thin" as const, color: { argb: "FFE2E8F0" } },
        left: { style: "thin" as const, color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin" as const, color: { argb: "FFE2E8F0" } },
        right: { style: "thin" as const, color: { argb: "FFE2E8F0" } },
      }

      const createSheet = (name: string, widths: number[]) => {
        const worksheet = workbook.addWorksheet(name.slice(0, 31))
        worksheet.columns = widths.map((width) => ({ width }))
        worksheet.properties.defaultRowHeight = 20
        return worksheet
      }

      const estimateRowHeight = (values: Array<string | number | null | undefined>, charsPerLine = 40) => {
        const longest = values
          .map((value) => String(value ?? ""))
          .reduce((max, value) => Math.max(max, value.length), 0)
        return Math.max(20, Math.min(72, Math.ceil(Math.max(longest, 1) / charsPerLine) * 16))
      }

      const writeSheetTitle = (worksheet: ExcelJS.Worksheet, title: string, subtitle?: string) => {
        const lastColumn = excelColumnName(Math.max(worksheet.columnCount, 1))
        worksheet.mergeCells(`A1:${lastColumn}1`)
        worksheet.getCell("A1").value = title
        worksheet.getCell("A1").font = { name: "Malgun Gothic", size: 16, bold: true }
        worksheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left" }
        worksheet.getRow(1).height = 26

        if (subtitle) {
          worksheet.mergeCells(`A2:${lastColumn}2`)
          worksheet.getCell("A2").value = subtitle
          worksheet.getCell("A2").font = { name: "Malgun Gothic", size: 10, color: { argb: "FF64748B" } }
          worksheet.getCell("A2").alignment = { vertical: "middle", horizontal: "left" }
          worksheet.getRow(2).height = 20
          return 4
        }

        return 3
      }

      const writeSectionTitle = (worksheet: ExcelJS.Worksheet, rowNumber: number, title: string) => {
        const lastColumn = excelColumnName(Math.max(worksheet.columnCount, 1))
        worksheet.mergeCells(`A${rowNumber}:${lastColumn}${rowNumber}`)
        const cell = worksheet.getCell(`A${rowNumber}`)
        cell.value = title
        cell.font = { name: "Malgun Gothic", size: 11, bold: true }
        cell.alignment = { vertical: "middle", horizontal: "left" }
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" },
        }
        cell.border = border
        worksheet.getRow(rowNumber).height = 22
        for (let index = 2; index <= worksheet.columnCount; index += 1) {
          worksheet.getRow(rowNumber).getCell(index).border = border
          worksheet.getRow(rowNumber).getCell(index).fill = cell.fill
        }
        return rowNumber + 1
      }

      const writeKeyValueRows = (
        worksheet: ExcelJS.Worksheet,
        startRow: number,
        rows: Array<[string, string]>,
      ) => {
        let rowNumber = startRow
        rows.forEach(([label, value]) => {
          const row = worksheet.getRow(rowNumber)
          row.getCell(1).value = label
          row.getCell(1).font = { name: "Malgun Gothic", size: 10, bold: true }
          row.getCell(1).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF8FAFC" },
          }
          row.getCell(1).alignment = { vertical: "top", horizontal: "left", wrapText: true }
          row.getCell(1).border = border
          worksheet.mergeCells(`B${rowNumber}:${excelColumnName(Math.max(worksheet.columnCount, 2))}${rowNumber}`)
          row.getCell(2).value = value || "-"
          row.getCell(2).font = { name: "Malgun Gothic", size: 10 }
          row.getCell(2).alignment = { vertical: "top", horizontal: "left", wrapText: true }
          row.getCell(2).border = border
          for (let index = 3; index <= worksheet.columnCount; index += 1) {
            row.getCell(index).border = border
          }
          row.height = estimateRowHeight([label, value], 60)
          rowNumber += 1
        })
        return rowNumber
      }

      const writeTable = (
        worksheet: ExcelJS.Worksheet,
        startRow: number,
        headers: string[],
        rows: Array<Array<string | number | ExcelJS.CellHyperlinkValue | null | undefined>>,
      ) => {
        const headerRow = worksheet.getRow(startRow)
        headers.forEach((header, index) => {
          const cell = headerRow.getCell(index + 1)
          cell.value = header
          cell.font = { name: "Malgun Gothic", size: 10, bold: true }
          cell.alignment = { vertical: "middle", horizontal: "center" }
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF8FAFC" },
          }
          cell.border = border
        })
        headerRow.height = 22

        rows.forEach((values, rowIndex) => {
          const row = worksheet.getRow(startRow + rowIndex + 1)
          values.forEach((value, columnIndex) => {
            const cell = row.getCell(columnIndex + 1)
            cell.value = value ?? "-"
            cell.font = { name: "Malgun Gothic", size: 10 }
            cell.alignment = {
              vertical: "top",
              horizontal: typeof value === "number" ? "right" : "left",
              wrapText: true,
            }
            cell.border = border
          })
          row.height = estimateRowHeight(values.map((value) => (typeof value === "object" && value && "text" in value ? value.text : String(value ?? ""))), 36)
        })

        worksheet.views = [{ state: "frozen", ySplit: startRow }]
        return startRow + rows.length + 2
      }

      const toDisplay = (value: string | number | null | undefined) => String(formatValue(value))
      const toFileSize = (size: number) => `${(size / (1024 * 1024)).toFixed(1)}MB`
      const generatedAt = new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date())

      const latestMetricRow =
        hasMetricsDocument && recentMetricsRows.length > 0
          ? recentMetricsRows[recentMetricsRows.length - 1]
          : null

      const infoSheet = createSheet("기업정보", [22, 54])
      let rowIndex = writeSheetTitle(infoSheet, "기업정보", `${selectedCompanyName} 기본 정보 · ${generatedAt}`)
      rowIndex = writeSectionTitle(infoSheet, rowIndex, "기본 정보")
      rowIndex = writeKeyValueRows(infoSheet, rowIndex, [
        ["회사명", toDisplay(companyInfo?.basic?.companyInfo)],
        ["대표자", toDisplay(companyInfo?.basic?.ceo?.name)],
        ["대표 이메일", toDisplay(companyInfo?.basic?.ceo?.email)],
        ["대표 전화번호", toDisplay(companyInfo?.basic?.ceo?.phone)],
        ["법인 설립일", toDisplay(companyInfo?.basic?.foundedAt)],
        ["사업자등록번호", toDisplay(companyInfo?.basic?.businessNumber)],
        ["주업태", toDisplay(companyInfo?.basic?.primaryBusiness)],
        ["주업종", toDisplay(companyInfo?.basic?.primaryIndustry)],
      ])
      rowIndex += 1
      rowIndex = writeSectionTitle(infoSheet, rowIndex, "소재지 및 인력")
      rowIndex = writeKeyValueRows(infoSheet, rowIndex, [
        ["본점 소재지", toDisplay(companyInfo?.locations?.headOffice)],
        ["지점/연구소 소재지", toDisplay(companyInfo?.locations?.branchOrLab)],
        ["정규직", toDisplay(companyInfo?.workforce?.fullTime)],
        ["계약직", toDisplay(companyInfo?.workforce?.contract)],
      ])
      rowIndex += 1
      rowIndex = writeSectionTitle(infoSheet, rowIndex, "재무 및 인증")
      rowIndex = writeKeyValueRows(infoSheet, rowIndex, [
        ["매출액(2025)", toDisplay(companyInfo?.finance?.revenue?.y2025)],
        ["매출액(2026)", toDisplay(companyInfo?.finance?.revenue?.y2026)],
        ["자본총계", toDisplay(companyInfo?.finance?.capitalTotal)],
        ["인증/지정여부", toDisplay(companyInfo?.certifications?.designation)],
        ["TIPS/LIPS", toDisplay(companyInfo?.certifications?.tipsLipsHistory)],
        ["2026년 희망 투자액", toDisplay(companyInfo?.fundingPlan?.desiredAmount2026)],
        ["투자전 희망 기업가치", toDisplay(companyInfo?.fundingPlan?.preValue)],
      ])
      rowIndex += 1
      rowIndex = writeSectionTitle(infoSheet, rowIndex, "투자 이력")
      writeTable(
        infoSheet,
        rowIndex,
        ["단계", "일시", "금액", "주요주주"],
        investmentRows.length > 0
          ? investmentRows.map((row) => [
              row.stage || "-",
              row.date || "-",
              row.postMoney || "-",
              row.majorShareholder || "-",
            ])
          : [["-", "입력된 투자 이력이 없습니다.", "-", "-"]],
      )

      const assessmentSheet = createSheet("현황진단", [18, 16, 54, 12, 12, 54])
      rowIndex = writeSheetTitle(assessmentSheet, "현황 진단", `${selectedCompanyName} 자가진단 결과`)
      rowIndex = writeSectionTitle(assessmentSheet, rowIndex, "점수 요약")
      rowIndex = writeTable(
        assessmentSheet,
        rowIndex,
        ["대분류", "점수", "총점"],
        [
          ...assessmentSummary.grouped.map((section) => [
            section.sectionTitle,
            formatScore(section.sectionScore),
            formatScore(section.sectionTotal),
          ]),
          ["총점", formatScore(assessmentSummary.totalScore), "100"],
        ],
      )
      rowIndex = writeSectionTitle(assessmentSheet, rowIndex, "문항 상세")
      writeTable(
        assessmentSheet,
        rowIndex,
        ["대분류", "중분류", "문항", "응답", "점수", "사유"],
        assessmentSummary.grouped.flatMap((section) =>
          section.questions.map((item) => [
            item.sectionTitle,
            item.subsectionTitle,
            item.questionText,
            item.answerLabel,
            formatScore(item.score),
            item.reason || "-",
          ]),
        ),
      )

      const metricsSheet = createSheet(
        "실적",
        [12, ...metricChartFields.map((field) => Math.max(14, field.label.length + 6))],
      )
      rowIndex = writeSheetTitle(metricsSheet, "실적 관리", hasMetricsDocument ? `최근 업데이트 ${metricsUpdatedLabel ?? "기록 없음"}` : "월별 실적 문서 없음")
      if (!hasMetricsDocument) {
        rowIndex = writeSectionTitle(metricsSheet, rowIndex, "안내")
        rowIndex = writeKeyValueRows(metricsSheet, rowIndex, [["상태", "월별 실적 문서는 아직 입력되지 않았습니다."]])
        rowIndex += 1
      }
      writeTable(
        metricsSheet,
        rowIndex,
        ["월", ...metricChartFields.map((field) => field.label)],
        (hasMetricsDocument ? recentMetricsRows : emptyMetricsMonthSlots.map(({ year, month }) => createEmptyMonth(year, month))).map((row) => [
          `${row.year}-${String(row.month).padStart(2, "0")}`,
          ...metricChartFields.map((field) =>
            hasMetricsDocument
              ? formatMetricValue(getMetricCellValue(row, field.key), field.format)
              : "-",
          ),
        ]),
      )

      const reportSheet = createSheet("분석보고서", [24, 70])
      rowIndex = writeSheetTitle(reportSheet, "분석 보고서", `${selectedCompanyName} 관리자 작성 내용`)
      rowIndex = writeSectionTitle(reportSheet, rowIndex, "기본 정보")
      rowIndex = writeKeyValueRows(reportSheet, rowIndex, [
        ["기업명", reportForm.companyName || selectedCompanyName],
        ["작성일시", reportForm.createdAt || "-"],
      ])
      rowIndex += 1
      rowIndex = writeSectionTitle(reportSheet, rowIndex, "비즈니스 모델")
      rowIndex = writeKeyValueRows(
        reportSheet,
        rowIndex,
        COMPANY_ANALYSIS_BUSINESS_MODEL_FIELDS.map(({ key, label }) => [label, reportForm[key] || "-"]),
      )
      rowIndex += 1
      rowIndex = writeSectionTitle(reportSheet, rowIndex, "기업상황 요약")
      rowIndex = writeKeyValueRows(
        reportSheet,
        rowIndex,
        COMPANY_ANALYSIS_SUMMARY_FIELDS.map(({ key, label }) => [label, reportForm[key] || "-"]),
      )
      rowIndex += 1
      rowIndex = writeSectionTitle(reportSheet, rowIndex, "개선 필요사항")
      rowIndex = writeKeyValueRows(
        reportSheet,
        rowIndex,
        COMPANY_ANALYSIS_IMPROVEMENT_FIELDS.map(({ key, label }) => [label, reportForm[key] || "-"]),
      )
      rowIndex += 1
      rowIndex = writeSectionTitle(reportSheet, rowIndex, "액셀러레이팅 프로그램 활용 제안")
      rowIndex = writeKeyValueRows(
        reportSheet,
        rowIndex,
        COMPANY_ANALYSIS_AC_FIELDS.map(({ key, label }) => [label, reportForm[key] || "-"]),
      )
      rowIndex += 1
      rowIndex = writeSectionTitle(reportSheet, rowIndex, "엑셀러레이팅 마일스톤 제안")
      writeKeyValueRows(
        reportSheet,
        rowIndex,
        COMPANY_ANALYSIS_MILESTONE_FIELDS.map(({ key, label }) => [label, reportForm[key] || "-"]),
      )

      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
      const safeCompanyName = selectedCompanyName.replace(/[\\/:*?"<>|]/g, "-").trim() || "company"
      const safeDate = generatedAt.replace(/[\\/:*?"<>|]/g, "-").trim()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${safeCompanyName}_기업관리통합_${safeDate}.xlsx`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      toast.success("기업 관리 통합 엑셀을 다운로드했습니다")
    } catch (error) {
      console.error("Failed to download company workbook:", error)
      toast.error("기업 관리 통합 엑셀 다운로드에 실패했습니다")
    } finally {
      setDownloadingCompanyWorkbook(false)
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
              기업 기본 정보, 자가진단표, 실적, 업로드 자료와 티켓 현황을 관리합니다.
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
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => toggleVoucherFilterTag("export")}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    voucherFilterTags.includes("export")
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {voucherFilterTags.includes("export") ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                  수출바우처 보유
                </button>
                <button
                  type="button"
                  onClick={() => toggleVoucherFilterTag("innovation")}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    voucherFilterTags.includes("innovation")
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {voucherFilterTags.includes("innovation") ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                  혁신바우처 보유
                </button>
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
                    : activeTab === "metrics"
                      ? "실적 관리"
                    : activeTab === "officeHours"
                      ? "오피스아워"
                      : "기업진단분석보고서"}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleDownloadCompanyWorkbook()}
                  disabled={!selectedCompanyId || loadingDetails || downloadingCompanyWorkbook}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  {downloadingCompanyWorkbook ? "내보내는 중..." : "통합 다운로드"}
                </button>
              </div>
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
                onClick={() => setActiveTab("metrics")}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${activeTab === "metrics"
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
              >
                실적 관리
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
            <div className="relative flex-1 min-h-0 px-4 py-4 flex flex-col">
              {loadingDetails ? (
                <ContentLoadingOverlay />
              ) : null}
              {activeTab === "info" ? (
                !companyInfo ? (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-500">
                    기업 정보가 없습니다.
                  </div>
                ) : (
                  <div className="min-h-0 flex-1 overflow-y-auto text-sm text-slate-700">
                    <div className="space-y-4 pb-1">
                      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(148,163,184,0.18),_transparent_42%),linear-gradient(135deg,_#ffffff_0%,_#f8fafc_55%,_#eef2ff_100%)] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xl font-semibold tracking-[-0.02em] text-slate-900">
                              {selectedCompanyName}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                              기업 기본 정보와 제출 자료를 한 화면에서 확인합니다.
                            </div>
                            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              <span className="font-medium text-slate-400">참여 사업</span>
                              <span className="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 font-medium text-slate-600">
                                {participatingProgramNames.length > 0
                                  ? `${participatingProgramNames.length}개 · ${participatingProgramNames.join(", ")}`
                                  : "-"}
                              </span>
                            </div>
                          </div>
                          <div className="min-w-[260px] rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm backdrop-blur sm:max-w-[320px]">
                            <div className="flex flex-col gap-1.5 text-[11px] text-slate-500">
                            {companyInfoSaveInfoItems.map((item) => (
                              <div key={item.label} className="flex items-center justify-between gap-3">
                                <span className="font-medium text-slate-400">{item.label}</span>
                                <span
                                  className={`text-right ${
                                    item.value === "-" ? "text-slate-400" : "text-slate-700"
                                  }`}
                                >
                                  {item.value}
                                </span>
                              </div>
                            ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {companyInfoSections.map((section) => (
                          <div
                            key={section.title}
                            className="rounded-2xl border border-slate-200 bg-white p-4"
                          >
                            {(() => {
                              const { ungrouped, groupedEntries } = groupCompanyInfoFields(section.fields)
                              return (
                                <>
                            <div>
                              <div className="text-sm font-semibold text-slate-900">
                                {section.title}
                              </div>
                              {section.description ? (
                                <div className="mt-1 text-xs text-slate-500">
                                  {section.description}
                                </div>
                              ) : null}
                            </div>
                            {ungrouped.length > 0 ? (
                              <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                                <table className="w-full table-fixed border-collapse bg-white text-sm">
                                  <colgroup>
                                    <col className="w-[120px]" />
                                    <col />
                                    <col className="w-[120px]" />
                                    <col />
                                  </colgroup>
                                  <tbody>
                                    {buildCompanyInfoTableRows(ungrouped).map((row, rowIndex) => {
                                    const firstField = row[0]
                                    if (!firstField) return null

                                    return (
                                      <tr
                                        key={`${section.title}-row-${rowIndex}`}
                                        className={rowIndex > 0 ? "border-t border-slate-100" : ""}
                                      >
                                        {row.length === 1 ? (
                                          <>
                                            <th className="bg-slate-50 px-3 py-2.5 text-left align-top text-[11px] font-medium text-slate-500">
                                              {firstField.label}
                                            </th>
                                            <td
                                              colSpan={3}
                                              className={`px-3 py-2.5 align-top text-sm font-semibold break-words ${
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
                                              <Fragment key={`${section.title}-${field.label}`}>
                                                <th className="bg-slate-50 px-3 py-2.5 text-left align-top text-[11px] font-medium text-slate-500">
                                                  {field.label}
                                                </th>
                                                <td
                                                  className={`px-3 py-2.5 align-top text-sm font-semibold break-words ${
                                                    field.value === "-" ? "text-slate-400" : "text-slate-800"
                                                  }`}
                                                  title={field.value}
                                                >
                                                  {field.value}
                                                </td>
                                              </Fragment>
                                            ))}
                                          </>
                                        )}
                                      </tr>
                                    )
                                  })}
                                  </tbody>
                                </table>
                              </div>
                            ) : null}
                            {groupedEntries.length > 0 ? (
                              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                {groupedEntries.map(([groupLabel, fields]) => (
                                  <div
                                    key={`${section.title}-${groupLabel}`}
                                    className="overflow-hidden rounded-xl border border-slate-200"
                                  >
                                    <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                                      {groupLabel}
                                    </div>
                                    <table className="w-full table-fixed border-collapse bg-white text-sm">
                                      <colgroup>
                                        <col className="w-[140px]" />
                                        <col />
                                      </colgroup>
                                      <tbody>
                                        {fields.map((field, index) => (
                                          <tr
                                            key={`${section.title}-${groupLabel}-${field.label}`}
                                            className={index > 0 ? "border-t border-slate-100" : ""}
                                          >
                                            <th className="bg-slate-50 px-3 py-2.5 text-left align-top text-[11px] font-medium text-slate-500">
                                              {field.label.replace(`${groupLabel} `, "")}
                                            </th>
                                            <td
                                              className={`px-3 py-2.5 align-top text-sm font-semibold break-words ${
                                                field.value === "-" ? "text-slate-400" : "text-slate-800"
                                              }`}
                                              title={field.value}
                                            >
                                              {field.value}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                                </>
                              )
                            })()}
                          </div>
                        ))}

                          <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="text-sm font-semibold text-slate-900">
                              업로드 자료
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              기업이 제출한 첨부 파일
                            </div>
                            {companyFiles.length === 0 ? (
                              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3 text-sm text-slate-400">
                                업로드된 파일이 없습니다.
                              </div>
                            ) : (
                              <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
                                {companyFiles.map((file) => (
                                  <div
                                    key={file.id}
                                    className="flex items-center gap-3 px-3 py-2.5 text-xs border-t border-slate-100 first:border-t-0"
                                  >
                                    <div className="min-w-0 flex-1 truncate font-medium text-slate-700" title={file.name}>
                                      {file.name}
                                    </div>
                                    <div className="shrink-0 text-[11px] text-slate-400">
                                      {(file.size / (1024 * 1024)).toFixed(1)}MB
                                    </div>
                                    {file.downloadUrl ? (
                                      <a
                                        href={file.downloadUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="shrink-0 text-[11px] font-medium text-slate-600 transition hover:text-slate-900"
                                      >
                                        보기/다운로드
                                      </a>
                                    ) : (
                                      <span className="shrink-0 text-[11px] text-slate-400">링크 준비중</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="text-sm font-semibold text-slate-900">
                              투자 이력
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              단계, 일시, 금액, 주요주주
                            </div>
                            {investmentRows.length === 0 ? (
                              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3 text-sm text-slate-400">
                                입력된 투자 이력이 없습니다.
                              </div>
                            ) : (
                              <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
                                {investmentRows.map((row, index) => (
                                  <div
                                    key={`${row.stage}-${index}`}
                                    className="grid grid-cols-[minmax(0,1.1fr)_88px_96px_minmax(0,1fr)] items-center gap-3 px-3 py-2.5 text-xs border-t border-slate-100 first:border-t-0"
                                  >
                                    <div className="min-w-0 truncate font-medium text-slate-800" title={row.stage || "단계 미입력"}>
                                      {row.stage || "단계 미입력"}
                                    </div>
                                    <div className="truncate text-slate-500" title={formatValue(row.date)}>
                                      {formatValue(row.date)}
                                    </div>
                                    <div className="truncate text-slate-600" title={formatValue(row.postMoney)}>
                                      {formatValue(row.postMoney)}
                                    </div>
                                    <div className="min-w-0 truncate text-slate-500" title={formatValue(row.majorShareholder)}>
                                      {formatValue(row.majorShareholder)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                      </div>
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
              ) : activeTab === "metrics" ? (
                selectedCompanyId ? (
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
                    <div className="flex items-center justify-end whitespace-nowrap text-xs text-slate-500">
                      최근 업데이트 {hasMetricsDocument ? (metricsUpdatedLabel ?? "기록 없음") : "실적 문서 없음"}
                    </div>
                    {!hasMetricsDocument ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900">
                        월별 실적 문서는 아직 입력되지 않았습니다.
                      </div>
                    ) : null}

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="whitespace-nowrap text-sm font-semibold text-slate-800">
                          12개월 추이
                        </div>
                      </div>
                      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="mb-3 flex items-center justify-end">
                            <button
                              type="button"
                              onClick={handleDownloadMetricsCsv}
                              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                            >
                              <FileSpreadsheet className="h-4 w-4" />
                              다운로드
                            </button>
                          </div>
                          <div className="max-h-[420px] overflow-auto">
                            <table className="min-w-full w-max border-separate border-spacing-0 text-sm">
                              <thead>
                              <tr className="text-left text-xs text-slate-400">
                                <th className="sticky top-0 z-10 border-b border-slate-200 bg-white px-3 py-2 font-semibold whitespace-nowrap">월</th>
                                {metricChartFields.map((field) => (
                                  <th
                                    key={field.key}
                                    className="sticky top-0 z-10 border-b border-slate-200 bg-white px-3 py-2 font-semibold whitespace-nowrap"
                                  >
                                    {field.label}
                                  </th>
                                ))}
                              </tr>
                              </thead>
                              <tbody>
                                {(hasMetricsDocument ? recentMetricsRows : emptyMetricsMonthSlots).map((row) => (
                                  <tr
                                    key={`${row.year}-${row.month}`}
                                    className={hasMetricsDocument ? "text-slate-700" : "text-slate-400"}
                                  >
                                    <td className="border-b border-slate-100 px-3 py-2 font-semibold whitespace-nowrap">
                                      {hasMetricsDocument
                                        ? `${row.month}월`
                                        : `${row.year}.${String(row.month).padStart(2, "0")}`}
                                    </td>
                                    {metricChartFields.map((field) => (
                                      <td
                                        key={`${row.year}-${row.month}-${field.key}`}
                                        className="border-b border-slate-100 px-3 py-2 whitespace-nowrap"
                                      >
                                        {hasMetricsDocument
                                          ? formatMetricValue(
                                              getMetricCellValue(row as MonthlyMetrics, field.key),
                                              field.format,
                                            )
                                          : "-"}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="whitespace-nowrap text-xs font-semibold tracking-[0.08em] text-slate-400">
                              {selectedMetricChartField?.label ?? "-"} 추이
                            </div>
                            <Select
                              value={selectedMetricChartKey}
                              onValueChange={setSelectedMetricChartKey}
                            >
                              <SelectTrigger className="h-9 w-[180px] border border-slate-300 bg-white pr-4 shadow-none">
                                <SelectValue placeholder="지표 선택" />
                              </SelectTrigger>
                              <SelectContent>
                                {metricChartFields.map((field) => (
                                  <SelectItem key={field.key} value={field.key}>
                                    {field.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="mt-2 h-[320px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart
                                key={selectedMetricChartField?.key ?? "metric-chart"}
                                data={metricsChartData}
                                margin={{ top: 12, right: 8, left: 0, bottom: 0 }}
                              >
                                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                                <XAxis
                                  dataKey="label"
                                  tick={{ fill: "#64748b", fontSize: 12 }}
                                  axisLine={false}
                                  tickLine={false}
                                  tickMargin={8}
                                  interval={0}
                                  minTickGap={0}
                                />
                                <YAxis hide />
                                <Tooltip
                                  formatter={(value: unknown) => {
                                    if (typeof value !== "number" || !selectedMetricChartField) return "-"
                                    return formatMetricValue(value, selectedMetricChartField.format)
                                  }}
                                  labelFormatter={(label) => `${label}`}
                                />
                                {selectedMetricChartField ? (
                                  <Line
                                    type="monotone"
                                    dataKey={selectedMetricChartField.key}
                                    name={selectedMetricChartField.label}
                                    stroke={selectedMetricChartField.color}
                                    strokeWidth={2.5}
                                    dot={{ r: 3, fill: selectedMetricChartField.color }}
                                    connectNulls={false}
                                    isAnimationActive
                                    animationDuration={350}
                                    animationEasing="ease-out"
                                  />
                                ) : null}
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    </div>

                    {companyFiles.length > 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="text-sm font-semibold text-slate-800">
                          업로드 자료
                        </div>
                        <div className="mt-3 space-y-2">
                          {companyFiles.map((file) => (
                            <div
                              key={file.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5"
                            >
                              <div className="min-w-0 flex flex-1 items-center gap-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-slate-500 ring-1 ring-slate-200">
                                  <FileSpreadsheet className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium text-slate-800">
                                    {file.name}
                                  </div>
                                  <div className="mt-0.5 text-[11px] text-slate-500 whitespace-nowrap">
                                    {(file.size / (1024 * 1024)).toFixed(1)}MB
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {file.downloadUrl ? (
                                  <>
                                    <a
                                      href={file.downloadUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
                                    >
                                      확인
                                    </a>
                                    <a
                                      href={file.downloadUrl}
                                      download
                                      className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
                                    >
                                      다운로드
                                    </a>
                                  </>
                                ) : (
                                  <span className="text-[11px] text-slate-400">링크 없음</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-500">
                    회사를 먼저 선택해주세요.
                  </div>
                )
              ) : activeTab === "officeHours" ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">참여 사업 및 티켓</div>
                      <div className="text-xs text-slate-500">
                        기본 티켓은 사업 설정값이며, 기업별로 내부/외부 티켓을 조정할 수 있습니다.
                      </div>
                    </div>
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
                    <div className="space-y-2">
                      {participatingPrograms.map((program) => {
                        const draft = ticketDrafts[program.id] ?? {
                          internal: String(program.internalTicketLimit ?? 0),
                          external: String(program.externalTicketLimit ?? 0),
                        }
                        return (
                          <div
                            key={program.id}
                            className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2.5">
                              <div className="min-w-0 space-y-1">
                                <div className="text-sm font-semibold text-slate-800 whitespace-nowrap">
                                  {program.name}
                                </div>
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-1.5 text-xs whitespace-nowrap">
                                    <span className="inline-flex flex-col items-start gap-0.5">
                                      <span className="pl-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">기본</span>
                                      <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600 shadow-[0_1px_1px_rgba(15,23,42,0.03)]">
                                        내부 <span className="ml-1 font-semibold text-slate-700">{program.internalTicketLimit ?? 0}</span>
                                        <span className="mx-1.5 text-slate-300">·</span>
                                        외부 <span className="ml-1 font-semibold text-slate-700">{program.externalTicketLimit ?? 0}</span>
                                      </span>
                                    </span>
                                    <span className="mt-4 inline-flex items-center text-slate-300" aria-hidden="true">
                                      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] text-slate-400 shadow-[0_1px_1px_rgba(15,23,42,0.03)]">
                                        →
                                      </span>
                                    </span>
                                    <span className="inline-flex flex-col items-start gap-0.5">
                                      <span className="pl-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">현재</span>
                                      <span className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 font-medium text-blue-700 shadow-[0_1px_1px_rgba(59,130,246,0.08)]">
                                        내부 <span className="ml-1 font-semibold text-blue-700">{draft.internal || "0"}</span>
                                        <span className="mx-1.5 text-blue-300">·</span>
                                        외부 <span className="ml-1 font-semibold text-blue-700">{draft.external || "0"}</span>
                                      </span>
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => openTicketEditModal(program.id)}
                                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                              >
                                수정
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <Dialog
                    open={Boolean(editingTicketProgramId)}
                    onOpenChange={(open) => {
                      if (!open) {
                        setEditingTicketProgramId(null)
                      }
                    }}
                  >
                    <DialogContent className="sm:max-w-sm">
                      <DialogHeader>
                        <DialogTitle>티켓 수 변경</DialogTitle>
                        <DialogDescription>
                          내부/외부 티켓 수를 수정한 뒤 저장하세요.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="flex items-start gap-3 py-2">
                        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm text-slate-700">
                          <span className="text-xs font-medium text-slate-500">내부</span>
                          <input
                            inputMode="numeric"
                            value={ticketModalDraft.internal}
                            onChange={(event) => handleTicketModalChange("internal", event.target.value)}
                            className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                          />
                        </label>
                        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm text-slate-700">
                          <span className="text-xs font-medium text-slate-500">외부</span>
                          <input
                            inputMode="numeric"
                            value={ticketModalDraft.external}
                            onChange={(event) => handleTicketModalChange("external", event.target.value)}
                            className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                          />
                        </label>
                      </div>
                      <DialogFooter>
                        <button
                          type="button"
                          onClick={() => setEditingTicketProgramId(null)}
                          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSaveTicketModal()}
                          disabled={savingTickets}
                          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
                        >
                          {savingTickets ? "저장 중..." : "저장"}
                        </button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
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
                    <div className="text-sm font-semibold text-slate-700">비즈니스 모델</div>
                    <div className="mt-4 grid gap-4">
                      {COMPANY_ANALYSIS_BUSINESS_MODEL_FIELDS.map(({ key, label }) => (
                        <label key={key} className="text-xs text-slate-500">
                          {label}
                          <textarea
                            rows={3}
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] leading-6 text-slate-700"
                            value={reportForm[key]}
                            onChange={(e) =>
                              setReportForm((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-sm font-semibold text-slate-700">기업상황 요약</div>
                    <div className="mt-4 grid gap-4">
                      {COMPANY_ANALYSIS_SUMMARY_FIELDS.map(({ key, label }) => (
                        <label key={key} className="text-xs text-slate-500">
                          {label}
                          <textarea
                            rows={3}
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] leading-6 text-slate-700"
                            value={reportForm[key]}
                            onChange={(e) =>
                              setReportForm((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-sm font-semibold text-slate-700">개선 필요사항</div>
                    <div className="mt-4 grid gap-4">
                      {COMPANY_ANALYSIS_IMPROVEMENT_FIELDS.map(({ key, label }) => (
                        <label key={key} className="text-xs text-slate-500">
                          {label}
                          <textarea
                            rows={3}
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] leading-6 text-slate-700"
                            value={reportForm[key]}
                            onChange={(e) =>
                              setReportForm((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-sm font-semibold text-slate-700">
                      액셀러레이팅 프로그램 활용 제안
                    </div>
                    <div className="mt-3 space-y-3">
                      {COMPANY_ANALYSIS_AC_FIELDS.map(({ key, label }) => (
                        <label key={key} className="text-xs text-slate-500">
                          {label}
                          <textarea
                            rows={2}
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] leading-6 text-slate-700"
                            value={reportForm[key]}
                            onChange={(e) =>
                              setReportForm((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-sm font-semibold text-slate-700">
                        엑셀러레이팅 마일스톤 제안
                      </div>
                    <div className="mt-3 space-y-4">
                      {COMPANY_ANALYSIS_MILESTONE_FIELDS.map(({ key, label }) => (
                        <label
                          key={key}
                          className="grid gap-2 text-xs text-slate-500 lg:grid-cols-[96px_minmax(0,1fr)] lg:items-start"
                        >
                          <span className="inline-flex h-6 items-center justify-center self-start rounded-full border border-slate-200 bg-white px-2 text-[10px] font-medium tracking-[0.01em] text-slate-600">
                            {label}
                          </span>
                          <textarea
                            rows={4}
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] leading-6 text-slate-700"
                            value={reportForm[key]}
                            onChange={(e) =>
                              setReportForm((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                          />
                        </label>
                      ))}
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
