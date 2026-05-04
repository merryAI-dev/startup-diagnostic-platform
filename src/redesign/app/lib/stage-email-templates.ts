import { format } from "date-fns"
import { ko } from "date-fns/locale"
import { parseLocalDateKey } from "@/redesign/app/lib/date-keys"
import type { Application, MessageTemplate } from "@/redesign/app/lib/types"

const DEFAULT_DETAIL_BASE_URL = "https://reserve.ema.kr"

export type StageEmailTemplateVariables = {
  companyName: string
  officeHourTypeLabel: string
  programName: string
  agendaName: string
  scheduledDateTimeLabel: string
  locationTypeLabel: string
  detailLink: string
  officeHourId: string
  arrangedScheduleId: string
}

export type StageEmailPreview = {
  subject: string
  text: string
  html: string
  variables: StageEmailTemplateVariables
}

const DEFAULT_TEMPLATE_VARIABLES = [
  "companyName",
  "officeHourTypeLabel",
  "programName",
  "agendaName",
  "scheduledDateTimeLabel",
  "locationTypeLabel",
  "detailLink",
  "officeHourId",
  "arrangedScheduleId",
]

const OFFICE_HOUR_CONFIRMED_CONTENT = [
  "안녕하세요. {{companyName}} 님.",
  "MYSC 오피스아워 일정이 확정되었습니다.",
  "단, 컨설턴트가 상세 내용을 검토하고 별도의 제안을 드릴 수 있습니다.",
  "불가피하게 변경이 필요한 경우, \"전달 사항\"에 입력해주시면 컨설턴트가 확인 가능합니다.",
  "",
  "구분 : {{officeHourTypeLabel}}",
  "사업 : {{programName}}",
  "주제 : {{agendaName}}",
  "일시 : {{scheduledDateTimeLabel}}",
  "장소 : {{locationTypeLabel}}",
  "",
  "자세한 내용은 링크: {{detailLink}} 참고 부탁드립니다.",
  "당일 변경은 불가하며, 예정시간 이후에는 취소가 불가합니다.",
].join("\n")

export const DEFAULT_STAGE_EMAIL_TEMPLATES: MessageTemplate[] = [
  {
    id: "office-hour-confirmed-generic",
    title: "오피스아워 일정 확정 안내",
    category: "confirmation",
    subject: "[MYSC] 오피스아워 일정 확정 안내",
    content: OFFICE_HOUR_CONFIRMED_CONTENT,
    variables: DEFAULT_TEMPLATE_VARIABLES,
    createdAt: new Date("2026-05-04T00:00:00+09:00"),
    updatedAt: new Date("2026-05-04T00:00:00+09:00"),
  },
  {
    id: "office-hour-confirmed-regular",
    title: "정기 오피스아워 일정 확정 안내",
    category: "confirmation",
    subject: "[MYSC] 정기 오피스아워 일정 확정 안내",
    content: OFFICE_HOUR_CONFIRMED_CONTENT,
    variables: DEFAULT_TEMPLATE_VARIABLES,
    createdAt: new Date("2026-05-04T00:00:00+09:00"),
    updatedAt: new Date("2026-05-04T00:00:00+09:00"),
  },
  {
    id: "office-hour-confirmed-irregular",
    title: "비정기 오피스아워 일정 확정 안내",
    category: "confirmation",
    subject: "[MYSC] 비정기 오피스아워 일정 확정 안내",
    content: OFFICE_HOUR_CONFIRMED_CONTENT,
    variables: DEFAULT_TEMPLATE_VARIABLES,
    createdAt: new Date("2026-05-04T00:00:00+09:00"),
    updatedAt: new Date("2026-05-04T00:00:00+09:00"),
  },
]

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function linkifyText(value: string) {
  return value.replace(
    /(https?:\/\/[^\s]+)/g,
    (url) => `<a href="${url}" style="color:#0f766e;text-decoration:underline;">${url}</a>`,
  )
}

function buildEmailHtmlDocument(bodyHtml: string) {
  return [
    "<!doctype html>",
    '<html lang="ko">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    "<title>MYSC Email</title>",
    "</head>",
    '<body style="margin:0;padding:24px;background-color:#f8fafc;color:#111827;">',
    '<div style="max-width:680px;margin:0 auto;padding:32px 28px;border:1px solid #e5e7eb;border-radius:16px;background-color:#ffffff;font-family:\'Apple SD Gothic Neo\',\'Malgun Gothic\',\'Noto Sans KR\',Arial,sans-serif;font-size:14px;line-height:1.8;white-space:pre-wrap;">',
    bodyHtml,
    "</div>",
    "</body>",
    "</html>",
  ].join("")
}

function renderTemplateString(template: string, variables: StageEmailTemplateVariables) {
  return template.replace(/\{\{\s*([a-zA-Z0-9]+)\s*\}\}/g, (_match, key: keyof StageEmailTemplateVariables) => {
    const value = variables[key]
    return typeof value === "string" ? value : ""
  })
}

function buildOfficeHourTypeLabel(templateId: string, application: Application) {
  if (templateId === "office-hour-confirmed-regular") return "정기오피스아워"
  if (templateId === "office-hour-confirmed-irregular") return "비정기오피스아워"
  if (application.type === "regular") return "정기오피스아워"
  if (application.type === "irregular") return "비정기오피스아워"
  return "오피스아워"
}

function buildScheduledDateTimeLabel(application: Application) {
  if (!application.scheduledDate) {
    return "일정 미정"
  }

  const parsedDate = parseLocalDateKey(application.scheduledDate)
  if (!parsedDate) {
    return application.scheduledTime
      ? `${application.scheduledDate} ${application.scheduledTime}`
      : application.scheduledDate
  }

  const dateLabel = format(parsedDate, "yyyy년 M월 d일 (EEE)", { locale: ko })
  return application.scheduledTime ? `${dateLabel} ${application.scheduledTime}` : dateLabel
}

function buildDetailLink(application: Application) {
  const officeHourId = application.officeHourId?.trim() ?? ""
  if (application.type === "irregular" && officeHourId) {
    return `${DEFAULT_DETAIL_BASE_URL}/system/company/irregular-officehour/${officeHourId}/arranged-schedule/${application.id}`
  }

  return `${DEFAULT_DETAIL_BASE_URL}/system/company/application?id=${application.id}`
}

export function buildStageEmailVariables(
  template: MessageTemplate,
  application: Application,
  programName?: string | null,
): StageEmailTemplateVariables {
  return {
    companyName: application.companyName?.trim() || application.applicantName?.trim() || "기업 미지정",
    officeHourTypeLabel: buildOfficeHourTypeLabel(template.id, application),
    programName: programName?.trim() || "사업 미지정",
    agendaName: application.agenda?.trim() || "아젠다 미지정",
    scheduledDateTimeLabel: buildScheduledDateTimeLabel(application),
    locationTypeLabel: application.sessionFormat === "offline" ? "오프라인" : "온라인",
    detailLink: buildDetailLink(application),
    officeHourId: application.officeHourId?.trim() || "",
    arrangedScheduleId: application.id,
  }
}

export function buildStageEmailPreview(
  template: MessageTemplate,
  application: Application,
  programName?: string | null,
): StageEmailPreview {
  const variables = buildStageEmailVariables(template, application, programName)
  const subject = renderTemplateString(template.subject, variables)
  const text = renderTemplateString(template.content, variables)
  const html = buildEmailHtmlDocument(linkifyText(escapeHtml(text)))

  return {
    subject,
    text,
    html,
    variables,
  }
}

export function parseRecipientList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,;]+/u)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  )
}
