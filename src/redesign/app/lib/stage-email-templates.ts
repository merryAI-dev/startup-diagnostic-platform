import { format } from "date-fns"
import { ko } from "date-fns/locale"
import { parseLocalDateKey } from "@/redesign/app/lib/date-keys"
import type { Application, MessageTemplate } from "@/redesign/app/lib/types"

const DEFAULT_DETAIL_BASE_URL = "https://reserve.ema.kr"

export type StageEmailTemplateVariables = {
  companyName: string
  consultantName: string
  officeHourTypeLabel: string
  officeHourTitle: string
  programName: string
  agendaName: string
  scheduledDateTimeLabel: string
  applicationScheduleLabel: string
  registrationWindowLabel: string
  locationTypeLabel: string
  detailLink: string
  applicationLink: string
  inputLink: string
  meetingLink: string
  reportLink: string
  officeHourId: string
  arrangedScheduleId: string
}

export type StageEmailPreview = {
  subject: string
  text: string
  html: string
  variables: Record<string, string>
}

const DEFAULT_TEMPLATE_VARIABLES = [
  "companyName",
  "consultantName",
  "officeHourTypeLabel",
  "officeHourTitle",
  "programName",
  "agendaName",
  "scheduledDateTimeLabel",
  "applicationScheduleLabel",
  "registrationWindowLabel",
  "locationTypeLabel",
  "detailLink",
  "applicationLink",
  "inputLink",
  "meetingLink",
  "reportLink",
  "officeHourId",
  "arrangedScheduleId",
]

const BIZTALK_OFFICE_HOUR_CONFIRMED_CONTENT = [
  "안녕하세요. MYSC입니다.",
  "",
  "- 기업 : {{companyName}}",
  "- 사업 : {{programName}}",
  "- 주제 : {{agendaName}}",
  "- 일시 : {{scheduledDateTimeLabel}}",
  "- 장소 : {{locationTypeLabel}}",
  "- 링크 : {{detailLink}}",
  "",
  "신청하신 오피스아워의 일정이 확정되었습니다. 변경 및 취소가 필요하실 경우, 홈페이지를 통해 문의 부탁드립니다.",
].join("\n")

const BIZTALK_OFFICE_HOUR_REMINDER_CONTENT = [
  "안녕하세요. MYSC 입니다. ",
  "",
  "- 기업 : {{companyName}}",
  "- 사업 : {{programName}}",
  "- 주제 : {{agendaName}}",
  "- 일시 : {{scheduledDateTimeLabel}}",
  "- 장소 : {{locationTypeLabel}}",
  "- 링크 : {{detailLink}}",
  "",
  "오피스아워 일정 리마인드 드립니다. 현 시점에서 변경 및 취소는 불가능하오니, 반드시 참석 부탁드립니다. 감사합니다.",
].join("\n")

const BIZTALK_CONSULTANT_REQUEST_CONTENT = [
  "신청하신 오피스아워에 대한 담당 컨설턴트의 요청사항(아젠다 관련 문의, 일정 변경 및 취소 등)이 등록되었습니다. '홈페이지 바로가기'를 눌러 내용을 확인해주세요.",
  "",
  "{{detailLink}}",
].join("\n")

const EMAIL_COMPANY_SCHEDULE_CONFIRMED_CONTENT = [
  "안녕하세요. {{companyName}} 님.",
  "",
  "MYSC 오피스아워 일정이 확정되었습니다.",
  "단, 컨설턴트가 상세 내용을 검토하고 별도의 제안을 드릴 수 있습니다.",
  '불가피하게 변경이 필요한 경우, 참여하고 계신 액셀러레이팅 프로그램의 사업관리 담당 매니저에게 별도 연락을 부탁드립니다.',
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

const EMAIL_COMPANY_SCHEDULE_REMINDER_CONTENT = [
  "안녕하세요. {{companyName}}님.",
  "",
  "예정된 MYSC 오피스아워 일정 리마인드 안내드립니다.",
  "",
  "사업 : {{programName}}",
  "주제 : {{agendaName}}",
  "일시 : {{scheduledDateTimeLabel}}",
  "장소 : {{locationTypeLabel}}",
  "접속링크 : {{meetingLink}}",
  "",
  "자세한 내용은 신청 링크 참고 부탁드리며,",
  "당일 일정 변동은 불가능하오니 꼭 참석 부탁드립니다.",
].join("\n")

const EMAIL_COMPANY_APPLICATION_REQUEST_CONTENT = [
  "안녕하세요. {{companyName}}님.",
  "",
  "MYSC 오피스아워 신청 안내드립니다.",
  "",
  "사업명 : {{programName}}",
  "오피스아워명 : {{officeHourTitle}}",
  "신청 일정 : {{applicationScheduleLabel}}",
  "신청 링크 : {{applicationLink}}",
  "",
  "신청은 정해진 기간 내에만 가능하며, 특히 원하시는 시간에 예약하시려면 빠르게 신청해주시기 바랍니다. 늦을 경우 예약이 어려울 수 있습니다.",
  "",
  "자세한 내용은 신청 링크 참고 부탁드리며,",
  "문의사항이 있을 경우 담당 사업팀에 말씀해주세요.",
].join("\n")

const EMAIL_CONSULTANT_SCHEDULE_REGISTRATION_CONTENT = [
  "안녕하세요. {{consultantName}}님.",
  "",
  "MYSC 오피스아워 일정 등록 안내드립니다.",
  "",
  "오피스아워명 : {{officeHourTitle}}",
  "입력 일정 : {{registrationWindowLabel}}",
  "입력 링크 : {{inputLink}}",
  "",
  "※ 입력 기간 내에만 등록/수정이 가능하오니, 반드시 일정을 지켜주세요.",
  "",
  "자세한 내용은 신청 링크 참고 부탁드리며,",
  "문의사항이 있을 경우 본 메일로 회신 부탁드립니다.",
].join("\n")

const EMAIL_CONSULTANT_SCHEDULE_CONFIRMED_CONTENT = [
  "안녕하세요. {{consultantName}}님.",
  "MYSC 오피스아워 일정이 확정되었습니다. ",
  "",
  "기업 : {{companyName}}",
  "사업 : {{programName}}",
  "주제 : {{agendaName}}",
  "일시 : {{scheduledDateTimeLabel}}",
  "장소 : {{locationTypeLabel}}",
  "구분 : {{officeHourTypeLabel}}",
  "",
  "자세한 내용은 링크:{{detailLink}} 을 확인 해 주시고, 확정시간을 기준으로 72시간 내에만 거절이 가능합니다.",
  "일정 변동은 가급적 삼가 주시기를 부탁드리며 그 외의 변경은 홈페이지에서 직접 기업과 소통하실 수 있습니다.",
].join("\n")

const EMAIL_CONSULTANT_REPORT_REMINDER_CONTENT = [
  "안녕하세요. {{consultantName}}님.",
  "진행하신 오피스아워에 대한 보고서 작성 안내드립니다.",
  "보고서는 진행 일자 기준 14일 이내만 입력이 가능하므로, 반드시 일정을 지켜주시기 바랍니다.",
  "",
  "기업 : {{companyName}}",
  "사업 : {{programName}}",
  "주제 : {{agendaName}}",
  "일시 : {{scheduledDateTimeLabel}}",
  "보고서 등록 링크 : {{reportLink}}",
].join("\n")

const EMAIL_TEMPLATE_PLACEHOLDER_CONTENT = [
  "[템플릿 본문 미등록]",
  "다음 템플릿 본문을 전달해주시면 이 자리를 교체합니다.",
].join("\n")

export const DEFAULT_STAGE_EMAIL_TEMPLATES: MessageTemplate[] = [
  {
    id: "office-hour-confirmed",
    title: "오피스아워 일정 확정",
    category: "confirmation",
    channel: "biztalk",
    subject: "[MYSC] 오피스아워 일정 확정",
    content: BIZTALK_OFFICE_HOUR_CONFIRMED_CONTENT,
    variables: DEFAULT_TEMPLATE_VARIABLES,
    biztalkTemplateCode: "officehour_001",
    createdAt: new Date("2026-05-04T00:00:00+09:00"),
    updatedAt: new Date("2026-05-04T00:00:00+09:00"),
  },
  {
    id: "office-hour-reminder",
    title: "오피스아워 일정 리마인드",
    category: "reminder",
    channel: "biztalk",
    subject: "[MYSC] 오피스아워 일정 리마인드",
    content: BIZTALK_OFFICE_HOUR_REMINDER_CONTENT,
    variables: DEFAULT_TEMPLATE_VARIABLES,
    biztalkTemplateCode: "officehour_002",
    createdAt: new Date("2026-05-04T00:00:00+09:00"),
    updatedAt: new Date("2026-05-04T00:00:00+09:00"),
  },
  {
    id: "consultant-request-followup",
    title: "컨설턴트 요청사항 전달",
    category: "followup",
    channel: "biztalk",
    subject: "[MYSC] 컨설턴트 요청사항 전달",
    content: BIZTALK_CONSULTANT_REQUEST_CONTENT,
    variables: DEFAULT_TEMPLATE_VARIABLES,
    biztalkTemplateCode: "officehour_003",
    createdAt: new Date("2026-05-04T00:00:00+09:00"),
    updatedAt: new Date("2026-05-04T00:00:00+09:00"),
  },
  {
    id: "email-consultant-schedule-registration",
    title: "외부 컨설턴트 | 오피스아워 일정 등록 알림",
    category: "reminder",
    channel: "email",
    templateCase: "consultant_schedule_registration",
    subject: "[MYSC] 오피스아워 일정 등록 요청",
    content: EMAIL_CONSULTANT_SCHEDULE_REGISTRATION_CONTENT,
    variables: DEFAULT_TEMPLATE_VARIABLES,
    createdAt: new Date("2026-05-07T00:00:00+09:00"),
    updatedAt: new Date("2026-05-07T00:00:00+09:00"),
  },
  {
    id: "email-consultant-schedule-confirmation",
    title: "외부 컨설턴트 | 오피스아워 일정 확정 알림",
    category: "confirmation",
    channel: "email",
    templateCase: "consultant_schedule_confirmation",
    subject: "[MYSC] 오피스아워 일정 확정",
    content: EMAIL_CONSULTANT_SCHEDULE_CONFIRMED_CONTENT,
    variables: DEFAULT_TEMPLATE_VARIABLES,
    createdAt: new Date("2026-05-07T00:00:00+09:00"),
    updatedAt: new Date("2026-05-07T00:00:00+09:00"),
  },
  {
    id: "email-consultant-report-reminder",
    title: "외부 컨설턴트 | 오피스아워 보고서 리마인드",
    category: "reminder",
    channel: "email",
    templateCase: "consultant_report_reminder",
    subject: "[MYSC] 오피스아워 보고서 리마인드",
    content: EMAIL_CONSULTANT_REPORT_REMINDER_CONTENT,
    variables: DEFAULT_TEMPLATE_VARIABLES,
    createdAt: new Date("2026-05-07T00:00:00+09:00"),
    updatedAt: new Date("2026-05-07T00:00:00+09:00"),
  },
  {
    id: "email-company-application-request",
    title: "기업 | 오피스아워 신청 알림",
    category: "reminder",
    channel: "email",
    templateCase: "company_application_request",
    subject: "[MYSC] 오피스아워 신청 요청",
    content: EMAIL_COMPANY_APPLICATION_REQUEST_CONTENT,
    variables: DEFAULT_TEMPLATE_VARIABLES,
    createdAt: new Date("2026-05-07T00:00:00+09:00"),
    updatedAt: new Date("2026-05-07T00:00:00+09:00"),
  },
  {
    id: "email-company-schedule-confirmation",
    title: "기업 | 오피스아워 일정 확정 안내",
    category: "confirmation",
    channel: "email",
    templateCase: "company_schedule_confirmation",
    subject: "[MYSC] 오피스아워 일정 확정 안내",
    content: EMAIL_COMPANY_SCHEDULE_CONFIRMED_CONTENT,
    variables: DEFAULT_TEMPLATE_VARIABLES,
    createdAt: new Date("2026-05-07T00:00:00+09:00"),
    updatedAt: new Date("2026-05-07T00:00:00+09:00"),
  },
  {
    id: "email-company-schedule-reminder",
    title: "기업 | 오피스아워 일정 리마인드",
    category: "reminder",
    channel: "email",
    templateCase: "company_schedule_reminder",
    subject: "[MYSC] 오피스아워 일정 리마인드",
    content: EMAIL_COMPANY_SCHEDULE_REMINDER_CONTENT,
    variables: DEFAULT_TEMPLATE_VARIABLES,
    createdAt: new Date("2026-05-07T00:00:00+09:00"),
    updatedAt: new Date("2026-05-07T00:00:00+09:00"),
  },
]

const LEGACY_STAGE_TEMPLATE_MIGRATIONS: Record<string, MessageTemplate> = Object.fromEntries(
  DEFAULT_STAGE_EMAIL_TEMPLATES.map((template) => [template.id, template]),
)

const LEGACY_STAGE_TEMPLATE_ALIASES: Record<string, string> = {
  "office-hour-confirmed-generic": "office-hour-confirmed",
  "office-hour-confirmed-regular": "office-hour-reminder",
  "office-hour-confirmed-irregular": "consultant-request-followup",
}

export function normalizeStageTemplates(templates: MessageTemplate[]) {
  let changed = false

  const normalized = templates.map((template) => {
    const canonicalId = LEGACY_STAGE_TEMPLATE_ALIASES[template.id] ?? template.id
    const canonicalTemplate = LEGACY_STAGE_TEMPLATE_MIGRATIONS[canonicalId]
    if (!canonicalTemplate) {
      return template
    }

    const shouldNormalize =
      template.id !== canonicalTemplate.id
      || template.title !== canonicalTemplate.title
      || template.subject !== canonicalTemplate.subject
      || template.content !== canonicalTemplate.content
      || template.category !== canonicalTemplate.category
      || template.channel !== canonicalTemplate.channel
      || template.templateCase !== canonicalTemplate.templateCase
      || template.biztalkTemplateCode !== canonicalTemplate.biztalkTemplateCode

    if (!shouldNormalize) {
      return template
    }

    changed = true
    return {
      ...template,
      id: canonicalTemplate.id,
      title: canonicalTemplate.title,
      category: canonicalTemplate.category,
      channel: canonicalTemplate.channel,
      templateCase: canonicalTemplate.templateCase,
      subject: canonicalTemplate.subject,
      content: canonicalTemplate.content,
      variables: canonicalTemplate.variables,
      biztalkTemplateCode: canonicalTemplate.biztalkTemplateCode,
    }
  })

  return changed ? normalized : templates
}

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

function buildPlaceholderVariableMap(template: MessageTemplate) {
  const allVariables = buildStageEmailVariables(
    template,
    ({
      id: "",
      officeHourTitle: "{{officeHourTitle}}",
      applicantName: "{{companyName}}",
      applicantEmail: "",
      companyName: "{{companyName}}",
      consultant: "{{consultantName}}",
      sessionFormat: "online",
      status: "submitted",
      createdAt: "",
      updatedAt: "",
      type: "regular",
      agenda: "{{agendaName}}",
      scheduledDate: "{{scheduledDate}}",
      scheduledTime: "{{scheduledTime}}",
      requestContent: "",
    } as unknown) as Application,
    "{{programName}}",
  )

  return Object.fromEntries(
    Object.entries(allVariables).map(([key, value]) => [key, value || `{{${key}}}`]),
  )
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

function buildApplicationLink(application: Application) {
  return buildDetailLink(application)
}

function buildApplicationScheduleLabel() {
  return "신청 일정 미연결"
}

function buildRegistrationWindowLabel() {
  return "입력 등록 기간 미연결"
}

function buildInputLink() {
  return "입력 링크 미연결"
}

function buildMeetingLink(application: Application) {
  if (application.sessionFormat === "offline") {
    return "해당 없음"
  }

  return "온라인 접속 링크 미연결"
}

function buildReportLink(application: Application) {
  return buildDetailLink(application)
}

export function buildStageEmailVariables(
  template: MessageTemplate,
  application: Application,
  programName?: string | null,
): StageEmailTemplateVariables {
  return {
    companyName: application.companyName?.trim() || application.applicantName?.trim() || "기업 미지정",
    consultantName: application.consultant?.trim() || "컨설턴트 미지정",
    officeHourTypeLabel: buildOfficeHourTypeLabel(template.id, application),
    officeHourTitle: application.officeHourTitle?.trim() || "오피스아워명 미지정",
    programName: programName?.trim() || "사업 미지정",
    agendaName: application.agenda?.trim() || "아젠다 미지정",
    scheduledDateTimeLabel: buildScheduledDateTimeLabel(application),
    applicationScheduleLabel: buildApplicationScheduleLabel(),
    registrationWindowLabel: buildRegistrationWindowLabel(),
    locationTypeLabel: application.sessionFormat === "offline" ? "오프라인" : "온라인",
    detailLink: buildDetailLink(application),
    applicationLink: buildApplicationLink(application),
    inputLink: buildInputLink(),
    meetingLink: buildMeetingLink(application),
    reportLink: buildReportLink(application),
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

export function buildStageEmailTemplatePreview(template: MessageTemplate): StageEmailPreview {
  const variables = buildPlaceholderVariableMap(template)
  const subject = template.subject
  const text = template.content
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
