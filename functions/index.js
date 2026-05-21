"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const {
  COMPANY_ANALYSIS_REPORT_SCHEMA,
  COMPANY_ANALYSIS_SYSTEM_INSTRUCTION,
  buildCompanyAnalysisUserPrompt,
} = require("./ai/company-report-prompt");
const { dispatchBiztalkService } = require("./biztalk-dispatch");
const { generateStructuredJson } = require("./ai/gemini");
const regularOfficeHourPolicy = require("./regular-office-hour-policy.cjs");

initializeApp();

const db = getFirestore();
const REGION = process.env.FUNCTION_REGION || "asia-northeast3";
const FIREBASE_PROJECT_ID = normalizeString(process.env.GCLOUD_PROJECT || process.env.GCLOUD_PROJECT_NUMBER);
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const SLACK_SIGNUP_REQUEST_WEBHOOK_URL = defineSecret("SLACK_SIGNUP_REQUEST_WEBHOOK_URL");
const SLACK_BOT_TOKEN = defineSecret("SLACK_BOT_TOKEN");
const BIZTALK_DISPATCH_URL = defineSecret("BIZTALK_DISPATCH_URL");
const BIZTALK_DISPATCH_TOKEN = defineSecret("BIZTALK_DISPATCH_TOKEN");
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const GOOGLE_CALENDAR_CLIENT_ID = defineSecret("GOOGLE_CALENDAR_CLIENT_ID");
const GOOGLE_CALENDAR_CLIENT_SECRET = defineSecret("GOOGLE_CALENDAR_CLIENT_SECRET");
const GOOGLE_CALENDAR_REFRESH_TOKEN = defineSecret("GOOGLE_CALENDAR_REFRESH_TOKEN");
const GOOGLE_CALENDAR_TARGET_CALENDAR_ID = defineSecret("GOOGLE_CALENDAR_TARGET_CALENDAR_ID");
const ACTIVE_APPLICATION_STATUSES = new Set(["confirmed", "completed"]);
const RESERVED_APPLICATION_STATUSES = new Set(["confirmed"]);
const AUTO_UNASSIGNABLE_REASON = "해당 시간대에 배정 가능한 컨설턴트가 없어 자동 거절되었습니다.";
const APPROVAL_ROLE_VALUES = new Set(["admin", "company", "consultant"]);
const CONSULTANT_SCOPE_VALUES = new Set(["internal", "external"]);
const APPLICATION_CHANGE_WINDOW_MS = 72 * 60 * 60 * 1000;
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API_BASE_URL = "https://www.googleapis.com/calendar/v3";
const STAGE_FIREBASE_PROJECT_ID = "startup-diagnosis-platform";
const LIVE_FIREBASE_PROJECT_ID = "startup-acceleration-platform";
const IRREGULAR_CALENDAR_SESSION_COLLECTION = "officeHourCalendarSessions";
const IRREGULAR_CALENDAR_TITLE_PREFIX = "[비정기]";
const IRREGULAR_CALENDAR_SYNC_LOOKBACK_DAYS = 120;
const IRREGULAR_CALENDAR_SYNC_LOOKAHEAD_DAYS = 180;
const DEFAULT_NOTIFICATION_DETAIL_BASE_URL = "https://startup-diagnostic-platform.vercel.app";
const DEFAULT_NOTIFICATION_EMAIL_FROM_ADDRESS = "no-reply@test.mysc.co.kr";
const INTERNAL_CONSULTANT_NOTICE_SLACK_CHANNEL_ID = "C0B1WE3PVFC";
const OFFICE_HOUR_CONFIRMED_BIZTALK_TEMPLATE_CODE = "officehour_001";
const OFFICE_HOUR_CONFIRMED_BIZTALK_ATTACH = {
  button: [{ name: "채널 추가", type: "AC" }],
};
const OFFICE_HOUR_CONFIRMED_BIZTALK_TITLE_TEMPLATE = "{{agendaName}} 일정 확정";
const OFFICE_HOUR_CONFIRMED_BIZTALK_MESSAGE_TEMPLATE = [
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
].join("\n");
const OFFICE_HOUR_CONFIRMED_CONSULTANT_EMAIL_SUBJECT = "[MYSC] 오피스아워 일정 확정";
const OFFICE_HOUR_CONFIRMED_CONSULTANT_EMAIL_TEMPLATE = [
  "안녕하세요. {{consultantName}}님.",
  "MYSC 오피스아워 일정이 확정되었습니다.",
  "",
  "기업 : {{companyName}}",
  "사업 : {{programName}}",
  "주제 : {{agendaName}}",
  "일시 : {{scheduledDateTimeLabel}}",
  "장소 : {{locationTypeLabel}}",
  "구분 : {{officeHourTypeLabel}}",
  "",
  "자세한 내용은 링크: {{detailLink}} 를 확인해주시고, 확정시간을 기준으로 72시간 내에만 거절이 가능합니다.",
  "일정 변동은 가급적 삼가 주시기를 부탁드리며 그 외의 변경은 홈페이지에서 직접 기업과 소통하실 수 있습니다.",
].join("\n");
const OFFICE_HOUR_CONFIRMED_INTERNAL_SLACK_TEMPLATE = [
  "[MYSC] 오피스아워 일정 확정",
  "",
  "컨설턴트 : {{consultantName}}",
  "기업 : {{companyName}}",
  "사업 : {{programName}}",
  "주제 : {{agendaName}}",
  "일시 : {{scheduledDateTimeLabel}}",
  "장소 : {{locationTypeLabel}}",
  "구분 : {{officeHourTypeLabel}}",
  "링크 : {{detailLink}}",
].join("\n");
const OFFICE_HOUR_CONFIRMED_COMPANY_EMAIL_SUBJECT = "[MYSC] 오피스아워 일정 확정 안내";
const OFFICE_HOUR_CONFIRMED_COMPANY_EMAIL_TEMPLATE = [
  "안녕하세요. {{companyName}} 님.",
  "",
  "MYSC 오피스아워 일정이 확정되었습니다.",
  "단, 컨설턴트가 상세 내용을 검토하고 별도의 제안을 드릴 수 있습니다.",
  "불가피하게 변경이 필요한 경우, 참여하고 계신 액셀러레이팅 프로그램의 사업관리 담당 매니저에게 별도 연락을 부탁드립니다.",
  "",
  "구분 : {{officeHourTypeLabel}}",
  "사업 : {{programName}}",
  "주제 : {{agendaName}}",
  "일시 : {{scheduledDateTimeLabel}}",
  "장소 : {{locationTypeLabel}}",
  "",
  "자세한 내용은 링크: {{detailLink}} 참고 부탁드립니다.",
  "당일 변경은 불가하며, 예정시간 이후에는 취소가 불가합니다.",
].join("\n");
const IRREGULAR_OFFICE_HOUR_CONFIRMED_CONSULTANT_EMAIL_SUBJECT =
  "[MYSC] 비정기 오피스아워 일정 안내";
const IRREGULAR_OFFICE_HOUR_CONFIRMED_CONSULTANT_EMAIL_TEMPLATE = [
  "안녕하세요. {{consultantName}}님.",
  "",
  "MYSC 비정기 오피스아워 일정이 등록되어 안내드립니다.",
  "",
  "기업 : {{companyName}}",
  "사업 : {{programName}}",
  "주제 : {{agendaName}}",
  "일시 : {{scheduledDateTimeLabel}}",
  "장소 : {{locationTypeLabel}}",
  "",
  "구글 캘린더 초대와 함께 세부 일정을 확인 부탁드립니다.",
].join("\n");

const CONSULTANT_SCHEDULE_OPEN_WEEK_NUMBER =
  regularOfficeHourPolicy.CONSULTANT_SCHEDULE_OPEN_WEEK_NUMBER ?? 3;
const COMPANY_APPLICATION_OPEN_WEEK_NUMBER =
  regularOfficeHourPolicy.COMPANY_APPLICATION_OPEN_WEEK_NUMBER ?? 4;
const IRREGULAR_OFFICE_HOUR_CONFIRMED_COMPANY_EMAIL_SUBJECT =
  "[MYSC] 비정기 오피스아워 일정 안내";
const IRREGULAR_OFFICE_HOUR_CONFIRMED_COMPANY_EMAIL_TEMPLATE = [
  "안녕하세요. {{companyName}}님.",
  "",
  "MYSC 비정기 오피스아워 일정이 등록되어 안내드립니다.",
  "",
  "사업 : {{programName}}",
  "주제 : {{agendaName}}",
  "일시 : {{scheduledDateTimeLabel}}",
  "장소 : {{locationTypeLabel}}",
  "",
  "구글 캘린더 초대와 함께 세부 일정을 확인 부탁드립니다.",
].join("\n");
const OFFICE_HOUR_REMINDER_BIZTALK_TEMPLATE_CODE = "officehour_002";
const OFFICE_HOUR_REMINDER_BIZTALK_ATTACH = {
  button: [{ name: "채널 추가", type: "AC" }],
};
const OFFICE_HOUR_REMINDER_BIZTALK_TITLE_TEMPLATE = "{{agendaName}} 일정 리마인드";
const OFFICE_HOUR_REMINDER_BIZTALK_MESSAGE_TEMPLATE = [
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
].join("\n");
const OFFICE_HOUR_REMINDER_CONSULTANT_EMAIL_SUBJECT = "[MYSC] 오피스아워 일정 리마인드";
const OFFICE_HOUR_REMINDER_CONSULTANT_EMAIL_TEMPLATE = [
  "안녕하세요. {{consultantName}}님.",
  "",
  "예정된 MYSC 오피스아워 일정 리마인드 안내드립니다.",
  "",
  "기업 : {{companyName}}",
  "사업 : {{programName}}",
  "주제 : {{agendaName}}",
  "일시 : {{scheduledDateTimeLabel}}",
  "장소 : {{locationTypeLabel}}",
  "링크 : {{detailLink}}",
  "",
  "당일 일정 변동은 불가능하오니 꼭 참석 부탁드립니다.",
].join("\n");
const OFFICE_HOUR_REMINDER_INTERNAL_SLACK_TEMPLATE = [
  "[MYSC] 오피스아워 일정 리마인드",
  "",
  "컨설턴트 : {{consultantName}}",
  "기업 : {{companyName}}",
  "사업 : {{programName}}",
  "주제 : {{agendaName}}",
  "일시 : {{scheduledDateTimeLabel}}",
  "장소 : {{locationTypeLabel}}",
  "링크 : {{detailLink}}",
].join("\n");
const OFFICE_HOUR_REMINDER_COMPANY_EMAIL_SUBJECT = "[MYSC] 오피스아워 일정 리마인드";
const OFFICE_HOUR_REMINDER_COMPANY_EMAIL_TEMPLATE = [
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
].join("\n");
const OFFICE_HOUR_SCHEDULE_REGISTRATION_CONSULTANT_EMAIL_SUBJECT =
  "[MYSC] 오피스아워 일정 등록 안내";
const OFFICE_HOUR_SCHEDULE_REGISTRATION_CONSULTANT_EMAIL_TEMPLATE = [
  "안녕하세요. {{consultantName}}님.",
  "",
  "MYSC 오피스아워 일정 등록 안내드립니다.",
  "",
  "대상 월 : {{targetMonthLabel}}",
  "입력 기간 : {{registrationWindowLabel}}",
  "입력 링크 : {{inputLink}}",
  "",
  "※ 입력 기간 내에만 등록/수정이 가능하오니, 반드시 일정을 지켜주세요.",
].join("\n");
const OFFICE_HOUR_APPLICATION_ALERT_COMPANY_EMAIL_SUBJECT =
  "[MYSC] 오피스아워 신청 안내";
const OFFICE_HOUR_APPLICATION_ALERT_COMPANY_EMAIL_TEMPLATE = [
  "안녕하세요. {{companyName}}님.",
  "",
  "MYSC 오피스아워 신청 안내드립니다.",
  "",
  "신청 일정 : {{applicationScheduleLabel}}",
  "신청 링크 : {{applicationLink}}",
  "",
  "신청은 정해진 기간 내에만 가능하며, 원하시는 일정이 있다면 빠르게 신청해주시기 바랍니다.",
  "문의사항이 있을 경우 담당 사업팀에 말씀해주세요.",
].join("\n");
const OFFICE_HOUR_REPORT_REMINDER_CONSULTANT_EMAIL_SUBJECT =
  "[MYSC] 오피스아워 보고서 작성 리마인드";
const OFFICE_HOUR_REPORT_REMINDER_CONSULTANT_EMAIL_TEMPLATE = [
  "안녕하세요. {{consultantName}}님.",
  "",
  "진행하신 오피스아워의 보고서가 아직 등록되지 않아 안내드립니다.",
  "",
  "기업 : {{companyName}}",
  "사업 : {{programName}}",
  "주제 : {{agendaName}}",
  "일시 : {{scheduledDateTimeLabel}}",
  "보고서 등록 링크 : {{reportLink}}",
].join("\n");
const OFFICE_HOUR_REPORT_REMINDER_INTERNAL_SLACK_TEMPLATE = [
  "[MYSC] 오피스아워 보고서 작성 리마인드",
  "",
  "컨설턴트 : {{consultantName}}",
  "기업 : {{companyName}}",
  "사업 : {{programName}}",
  "주제 : {{agendaName}}",
  "일시 : {{scheduledDateTimeLabel}}",
  "보고서 등록 링크 : {{reportLink}}",
].join("\n");
const OFFICE_HOUR_REJECTED_COMPANY_EMAIL_SUBJECT = "[MYSC] 오피스아워 신청 취소 안내";
const OFFICE_HOUR_REJECTED_COMPANY_EMAIL_TEMPLATE = [
  "안녕하세요. {{companyName}} 님.",
  "",
  "신청하신 오피스아워 일정이 컨설턴트에 의해 취소되었습니다.",
  "",
  "구분 : {{officeHourTypeLabel}}",
  "사업 : {{programName}}",
  "주제 : {{agendaName}}",
  "일시 : {{scheduledDateTimeLabel}}",
  "취소 사유 : {{rejectionReason}}",
  "",
  "자세한 내용은 링크: {{detailLink}} 확인 및 사업팀 소통 부탁드립니다.",
].join("\n");

const OFFICE_HOUR_CANCELLED_CONSULTANT_EMAIL_SUBJECT = "[MYSC] 오피스아워 일정 취소 안내";
const OFFICE_HOUR_CANCELLED_CONSULTANT_EMAIL_TEMPLATE = [
  "안녕하세요. {{consultantName}}님.",
  "",
  "신청하신 오피스아워 일정이 취소되었습니다.",
  "",
  "기업 : {{companyName}}",
  "사업 : {{programName}}",
  "주제 : {{agendaName}}",
  "일시 : {{scheduledDateTimeLabel}}",
  "취소 사유 : {{cancellationReason}}",
  "",
  "자세한 내용은 홈페이지 확인 후 사업팀 소통 부탁드립니다.",
].join("\n");
const DEFAULT_COMPANY_FORM = {
  companyType: "법인",
  companyInfo: "",
  representativeSolution: "",
  sdgPriority1: "",
  sdgPriority2: "",
  ceoName: "",
  ceoEmail: "",
  ceoPhone: "",
  ceoAge: "",
  ceoGender: "",
  ceoNationality: "",
  hasCoRepresentative: "",
  coRepresentativeName: "",
  coRepresentativeBirthDate: "",
  coRepresentativeGender: "",
  coRepresentativeTitle: "",
  founderSerialNumber: "",
  website: "",
  foundedAt: "",
  businessNumber: "",
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
  myscExpectation: "",
  desiredInvestment2026: "",
  desiredPreValue: "",
};

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeApplicationStatus(value) {
  const normalized = normalizeString(value);
  if (normalized === "review") return "pending";
  return normalized || "pending";
}

function normalizeApprovalRole(value, fallback = "company") {
  const normalized = normalizeString(value);
  return APPROVAL_ROLE_VALUES.has(normalized) ? normalized : fallback;
}

function normalizeConsultantScope(value) {
  const normalized = normalizeString(value);
  return CONSULTANT_SCOPE_VALUES.has(normalized) ? normalized : "";
}

function getApprovalRoleLabel(value) {
  switch (normalizeApprovalRole(value, "")) {
    case "admin":
      return "관리자";
    case "company":
      return "기업";
    case "consultant":
      return "컨설턴트";
    default:
      return "미확인";
  }
}

function formatFirestoreDateTime(value) {
  const date =
    value && typeof value.toDate === "function"
      ? value.toDate()
      : value instanceof Date
        ? value
        : null;

  if (!date || Number.isNaN(date.getTime())) {
    return "(missing)";
  }

  const formatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  return `${formatter.format(date)} KST`;
}

function toJsDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object") {
    if (typeof value.toDate === "function") {
      const parsed = value.toDate();
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof value.toMillis === "function") {
      const parsed = new Date(value.toMillis());
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof value.seconds === "number") {
      const millis = value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
      const parsed = new Date(millis);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }
  return null;
}

function getApplicationChangeDeadline(application) {
  const createdAt = toJsDate(application?.createdAt);
  if (!createdAt) return null;
  return new Date(createdAt.getTime() + APPLICATION_CHANGE_WINDOW_MS);
}

function isApplicationChangeWindowOpen(application, now = new Date()) {
  const deadline = getApplicationChangeDeadline(application);
  if (!deadline) return false;
  return now.getTime() <= deadline.getTime();
}

function normalizeEmail(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized || !normalized.includes("@")) return "";
  return normalized;
}

function normalizeEmailArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => normalizeEmail(item))
        .filter(Boolean)
    )
  );
}

function isStageProject() {
  return FIREBASE_PROJECT_ID === STAGE_FIREBASE_PROJECT_ID;
}

function isLiveProject() {
  return FIREBASE_PROJECT_ID === LIVE_FIREBASE_PROJECT_ID;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeStringRecord(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [normalizeString(key), normalizeString(item)])
      .filter(([key, item]) => Boolean(key) && Boolean(item))
  );
}

function getBiztalkDispatchConfig() {
  const url = normalizeString(BIZTALK_DISPATCH_URL.value());
  const token = normalizeString(BIZTALK_DISPATCH_TOKEN.value());

  if (!url || !token) {
    return null;
  }

  return { url, token };
}

async function callBiztalkDispatch(path, payload) {
  const config = getBiztalkDispatchConfig();
  if (!config) {
    throw new Error("BizTalk dispatch service is not configured.");
  }

  return dispatchBiztalkService(config, path, payload);
}

function normalizePhoneNumber(value) {
  const digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
  return digits;
}

function normalizePhoneNumberArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => normalizePhoneNumber(item))
        .filter(Boolean)
    )
  );
}

function getGoogleCalendarConfig() {
  const clientId = normalizeString(GOOGLE_CALENDAR_CLIENT_ID.value());
  const clientSecret = normalizeString(GOOGLE_CALENDAR_CLIENT_SECRET.value());
  const refreshToken = normalizeString(GOOGLE_CALENDAR_REFRESH_TOKEN.value());
  const calendarId = normalizeString(GOOGLE_CALENDAR_TARGET_CALENDAR_ID.value());

  if (!clientId || !clientSecret || !refreshToken || !calendarId) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    refreshToken,
    calendarId,
  };
}

function getGoogleCalendarSendUpdatesMode() {
  return "all";
}

async function getGoogleCalendarAccessToken(config) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Google OAuth token request failed: ${response.status} ${message}`);
  }

  const data = await response.json();
  const accessToken = normalizeString(data?.access_token);
  if (!accessToken) {
    throw new Error("Google OAuth token response did not include access_token");
  }

  return accessToken;
}

async function googleCalendarRequest(config, params) {
  const accessToken = await getGoogleCalendarAccessToken(config);
  const queryString = params.query ? `?${new URLSearchParams(params.query).toString()}` : "";
  const response = await fetch(
    `${GOOGLE_CALENDAR_API_BASE_URL}${params.path}${queryString}`,
    {
      method: params.method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(params.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(params.body ? { body: JSON.stringify(params.body) } : {}),
    }
  );

  if (response.status === 204) {
    return null;
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Google Calendar API request failed: ${response.status} ${message}`);
  }

  return response.json();
}

function buildCalendarParticipantLabel(preferredName, email) {
  return normalizeString(preferredName) || normalizeEmail(email) || "";
}

function isValidCalendarAttendeeEmail(value) {
  const normalized = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized);
}

function buildRegularGoogleCalendarTitle(context) {
  const programName = normalizeString(context.programDoc?.name) || "사업 미지정";
  const agendaName = normalizeString(context.agendaDoc?.name) || "아젠다 미지정";
  const companyName =
    normalizeString(context.companyDoc?.name) ||
    normalizeString(context.application.companyName) ||
    "기업 미지정";
  const consultantLabel = buildCalendarParticipantLabel(
    context.consultantDoc?.name || context.consultantProfile?.name || context.consultantProfile?.displayName,
    context.consultantEmail
  );
  const pmLabel = buildCalendarParticipantLabel(
    context.pmProfile?.name || context.pmProfile?.displayName,
    context.pmEmail
  );
  const companyLabel = buildCalendarParticipantLabel(
    context.companyProfile?.name || context.companyProfile?.displayName,
    context.companyEmail
  );
  const participantSuffix = [consultantLabel, pmLabel, companyLabel].filter(Boolean).join(", ");

  return `[정기]${programName}_${agendaName}_${companyName}${participantSuffix ? `(${participantSuffix})` : ""}`;
}

function buildRegularGoogleCalendarDescription(context) {
  const lines = [
    `사업: ${normalizeString(context.programDoc?.name) || "사업 미지정"}`,
    `아젠다: ${normalizeString(context.agendaDoc?.name) || "아젠다 미지정"}`,
    `기업: ${normalizeString(context.companyDoc?.name) || normalizeString(context.application.companyName) || "기업 미지정"}`,
    `컨설턴트: ${
      buildCalendarParticipantLabel(
        context.consultantDoc?.name || context.consultantProfile?.name || context.consultantProfile?.displayName,
        context.consultantEmail
      ) || "미지정"
    }`,
    `PM: ${
      buildCalendarParticipantLabel(
        context.pmProfile?.name || context.pmProfile?.displayName,
        context.pmEmail
      ) || "미지정"
    }`,
    `기업 담당자: ${
      buildCalendarParticipantLabel(
        context.companyProfile?.name || context.companyProfile?.displayName,
        context.companyEmail
      ) || "미지정"
    }`,
  ];

  const requestContent = normalizeString(context.application.requestContent);
  if (requestContent) {
    lines.push("", "[신청 내용]", requestContent);
  }

  return lines.join("\n");
}

function getRegularApplicationCalendarEventDateRange(application) {
  const scheduledDate = normalizeString(application?.scheduledDate);
  const scheduledTime = normalizeTimeKey(application?.scheduledTime);
  if (!scheduledDate || !scheduledTime) {
    throw new Error("Regular application is missing scheduled date/time");
  }

  const start = new Date(`${scheduledDate}T${scheduledTime}:00+09:00`);
  if (Number.isNaN(start.getTime())) {
    throw new Error("Failed to parse regular application scheduled date/time");
  }

  const durationHours = getApplicationDurationHours(application, null);
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

async function writeGoogleCalendarSyncState(applicationId, patch) {
  const payload = {
    "googleCalendar.updatedAt": FieldValue.serverTimestamp(),
  };

  if (Object.prototype.hasOwnProperty.call(patch, "status")) {
    payload["googleCalendar.status"] = patch.status;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "calendarId")) {
    payload["googleCalendar.calendarId"] = patch.calendarId || FieldValue.delete();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "eventId")) {
    payload["googleCalendar.eventId"] = patch.eventId || FieldValue.delete();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "title")) {
    payload["googleCalendar.title"] = patch.title || FieldValue.delete();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "attendeeEmails")) {
    payload["googleCalendar.attendeeEmails"] = Array.isArray(patch.attendeeEmails)
      ? patch.attendeeEmails
      : FieldValue.delete();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "warningMessages")) {
    payload["googleCalendar.warningMessages"] = Array.isArray(patch.warningMessages)
      ? patch.warningMessages
      : FieldValue.delete();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "lastError")) {
    payload["googleCalendar.lastError"] = patch.lastError || FieldValue.delete();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "syncedAt")) {
    payload["googleCalendar.syncedAt"] = patch.syncedAt;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "deletedAt")) {
    payload["googleCalendar.deletedAt"] = patch.deletedAt;
  }

  await db.collection("officeHourApplications").doc(applicationId).update(payload);
}

async function loadOfficeHourApplicationContext(applicationId) {
  const applicationSnap = await db.collection("officeHourApplications").doc(applicationId).get();
  if (!applicationSnap.exists) {
    return null;
  }

  const application = {
    id: applicationSnap.id,
    ...(applicationSnap.data() || {}),
  };

  const programId = normalizeString(application.programId);
  const agendaId = normalizeString(application.agendaId);
  const companyId = normalizeString(application.companyId);
  const companyUserUid = normalizeString(application.createdByUid);
  const consultantId = normalizeString(application.consultantId);

  const programRef = programId ? db.collection("programs").doc(programId) : null;
  const agendaRef = agendaId ? db.collection("agendas").doc(agendaId) : null;
  const companyRef = companyId ? db.collection("companies").doc(companyId) : null;
  const companyProfileRef = companyUserUid ? db.collection("profiles").doc(companyUserUid) : null;
  const consultantProfileRef = consultantId ? db.collection("profiles").doc(consultantId) : null;
  const consultantRef = consultantId ? db.collection("consultants").doc(consultantId) : null;

  const [
    programSnap,
    agendaSnap,
    companySnap,
    companyProfileSnap,
    consultantProfileSnap,
    consultantSnap,
  ] = await Promise.all([
    programRef ? programRef.get() : Promise.resolve(null),
    agendaRef ? agendaRef.get() : Promise.resolve(null),
    companyRef ? companyRef.get() : Promise.resolve(null),
    companyProfileRef ? companyProfileRef.get() : Promise.resolve(null),
    consultantProfileRef ? consultantProfileRef.get() : Promise.resolve(null),
    consultantRef ? consultantRef.get() : Promise.resolve(null),
  ]);

  const programDoc = programSnap?.exists ? { id: programSnap.id, ...(programSnap.data() || {}) } : null;
  const pmUid = normalizeString(programDoc?.managerUid);
  const pmProfileSnap = pmUid ? await db.collection("profiles").doc(pmUid).get() : null;

  const companyProfile = companyProfileSnap?.exists ? companyProfileSnap.data() || {} : {};
  const consultantProfile = consultantProfileSnap?.exists ? consultantProfileSnap.data() || {} : {};
  const consultantDoc = consultantSnap?.exists ? consultantSnap.data() || {} : {};
  const pmProfile = pmProfileSnap?.exists ? pmProfileSnap.data() || {} : {};

  return {
    application,
    programDoc,
    agendaDoc: agendaSnap?.exists ? { id: agendaSnap.id, ...(agendaSnap.data() || {}) } : null,
    companyDoc: companySnap?.exists ? { id: companySnap.id, ...(companySnap.data() || {}) } : null,
    companyProfile,
    consultantProfile,
    consultantDoc,
    pmProfile,
    pmUid,
    pmEmail: normalizeEmail(pmProfile?.email),
    companyEmail: normalizeEmail(companyProfile?.email) || normalizeEmail(application.applicantEmail),
    consultantEmail:
      normalizeEmail(consultantProfile?.email) ||
      normalizeEmail(consultantDoc?.email) ||
      normalizeEmail(consultantDoc?.secondaryEmail) ||
      normalizeEmail(application?.consultantEmail),
  };
}

async function loadRegularApplicationCalendarContext(applicationId) {
  const context = await loadOfficeHourApplicationContext(applicationId);
  if (!context) {
    return null;
  }

  if (normalizeString(context.application?.type) !== "regular") {
    return null;
  }

  return context;
}

function collectRegularApplicationCalendarWarnings(context) {
  const warnings = [];
  if (!context.programDoc) {
    warnings.push("program-document-missing");
  }
  if (!context.agendaDoc) {
    warnings.push("agenda-document-missing");
  }
  if (!context.companyDoc) {
    warnings.push("company-document-missing");
  }
  if (!context.pmUid) {
    warnings.push("program-manager-unassigned");
  }
  if (context.pmUid && !context.pmEmail) {
    warnings.push("program-manager-email-missing");
  }
  if (!context.companyEmail) {
    warnings.push("company-email-missing");
  }
  if (!context.consultantEmail) {
    warnings.push("consultant-email-missing");
  }
  return warnings;
}

async function upsertRegularApplicationGoogleCalendarEvent(applicationId) {
  const context = await loadRegularApplicationCalendarContext(applicationId);
  if (!context) {
    return { status: "skipped" };
  }

  if (normalizeApplicationStatus(context.application.status) !== "confirmed") {
    return deleteRegularApplicationGoogleCalendarEvent(applicationId);
  }

  const config = getGoogleCalendarConfig();
  if (!config) {
    const errorMessage = "Google Calendar sync failed: required secrets are not configured";
    await writeGoogleCalendarSyncState(applicationId, {
      status: "error",
      lastError: errorMessage,
    });
    return { status: "error", error: errorMessage };
  }

  try {
    const warningMessages = collectRegularApplicationCalendarWarnings(context);
    if (warningMessages.length > 0) {
      console.warn("upsertRegularApplicationGoogleCalendarEvent warnings", {
        applicationId,
        warningMessages,
      });
    }
    const { start, end } = getRegularApplicationCalendarEventDateRange(context.application);
    const title = buildRegularGoogleCalendarTitle(context);
    const attendeeEmails = [
      context.pmEmail,
      context.companyEmail,
      context.consultantEmail,
    ].filter((email) => isValidCalendarAttendeeEmail(email));
    const uniqueAttendeeEmails = Array.from(new Set(attendeeEmails));
    const existingEventId = normalizeString(context.application.googleCalendar?.eventId);

    const eventPayload = {
      summary: title,
      description: buildRegularGoogleCalendarDescription(context),
      start: {
        dateTime: start,
        timeZone: "Asia/Seoul",
      },
      end: {
        dateTime: end,
        timeZone: "Asia/Seoul",
      },
      ...(uniqueAttendeeEmails.length > 0
        ? { attendees: uniqueAttendeeEmails.map((email) => ({ email })) }
        : {}),
      location: normalizeString(context.application.sessionFormat) === "offline" ? "오프라인" : "온라인",
      extendedProperties: {
        private: {
          applicationId,
          applicationType: "regular",
        },
      },
    };

    const event = existingEventId
      ? await googleCalendarRequest(config, {
          method: "PATCH",
          path: `/calendars/${encodeURIComponent(config.calendarId)}/events/${encodeURIComponent(existingEventId)}`,
          query: { sendUpdates: getGoogleCalendarSendUpdatesMode() },
          body: eventPayload,
        })
      : await googleCalendarRequest(config, {
          method: "POST",
          path: `/calendars/${encodeURIComponent(config.calendarId)}/events`,
          query: { sendUpdates: getGoogleCalendarSendUpdatesMode() },
          body: eventPayload,
        });

    const eventId = normalizeString(event?.id);
    if (!eventId) {
      throw new Error("Google Calendar sync failed: event id is missing in API response");
    }

    await writeGoogleCalendarSyncState(applicationId, {
      status: "synced",
      calendarId: config.calendarId,
      eventId,
      title,
      attendeeEmails: uniqueAttendeeEmails,
      warningMessages,
      lastError: "",
      syncedAt: FieldValue.serverTimestamp(),
      deletedAt: FieldValue.delete(),
    });

    return {
      status: "synced",
      eventId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("upsertRegularApplicationGoogleCalendarEvent failed", {
      applicationId,
      errorMessage,
      errorStack: error instanceof Error ? error.stack : null,
    });
    await writeGoogleCalendarSyncState(applicationId, {
      status: "error",
      lastError: errorMessage,
    });
    return {
      status: "error",
      error: errorMessage,
    };
  }
}

async function deleteRegularApplicationGoogleCalendarEvent(applicationId) {
  const context = await loadRegularApplicationCalendarContext(applicationId);
  if (!context) {
    return { status: "skipped" };
  }

  const existingEventId = normalizeString(context.application.googleCalendar?.eventId);
  if (!existingEventId) {
    return { status: "skipped" };
  }

  const config = getGoogleCalendarConfig();
  if (!config) {
    const errorMessage = "Google Calendar delete failed: required secrets are not configured";
    await writeGoogleCalendarSyncState(applicationId, {
      status: "error",
      lastError: errorMessage,
    });
    return { status: "error", error: errorMessage };
  }

  try {
    await googleCalendarRequest(config, {
      method: "DELETE",
      path: `/calendars/${encodeURIComponent(config.calendarId)}/events/${encodeURIComponent(existingEventId)}`,
      query: { sendUpdates: getGoogleCalendarSendUpdatesMode() },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes("404")) {
      console.error("deleteRegularApplicationGoogleCalendarEvent failed", {
        applicationId,
        errorMessage,
        errorStack: error instanceof Error ? error.stack : null,
      });
      await writeGoogleCalendarSyncState(applicationId, {
        status: "error",
        lastError: errorMessage,
      });
      return {
        status: "error",
        error: errorMessage,
      };
    }
  }

  await writeGoogleCalendarSyncState(applicationId, {
    status: "deleted",
    eventId: "",
    attendeeEmails: null,
    warningMessages: null,
    lastError: "",
    deletedAt: FieldValue.serverTimestamp(),
  });
  return { status: "deleted" };
}

function normalizeCalendarMatchKey(value) {
  return normalizeString(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[.,·ㆍ"'`~!@#$%^&*+=:;<>?()[\]{}|\\/]/gu, "")
    .replace(/[-_]/gu, "")
    .replace(/\s+/gu, "")
    .trim();
}

function normalizeCalendarCompanyKey(value) {
  return normalizeCalendarMatchKey(value)
    .replace(/주식회사/gu, "")
    .replace(/유한회사/gu, "")
    .replace(/합자회사/gu, "")
    .replace(/합명회사/gu, "")
    .replace(/co?ltd/gu, "")
    .replace(/colimited/gu, "")
    .replace(/inc/gu, "")
    .replace(/corp/gu, "")
    .replace(/corporation/gu, "")
    .replace(/ltd/gu, "")
    .replace(/limited/gu, "")
    .replace(/llc/gu, "")
    .trim();
}

function appendNameIndexEntries(index, key, item) {
  if (!key) return;
  const current = index.get(key) || [];
  current.push(item);
  index.set(key, current);
}

function buildNameIndex(items, getNames, normalizer = normalizeCalendarMatchKey) {
  const index = new Map();
  items.forEach((item) => {
    getNames(item)
      .map((name) => normalizer(name))
      .filter(Boolean)
      .forEach((key) => appendNameIndexEntries(index, key, item));
  });
  return index;
}

function dedupeById(items) {
  const seen = new Set();
  return items.filter((item) => {
    const id = normalizeString(item?.id);
    if (!id || seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}

function findIndexedNameMatches(index, rawName, normalizer = normalizeCalendarMatchKey) {
  const key = normalizer(rawName);
  if (!key) return [];
  return dedupeById(index.get(key) || []);
}

function getSingleMatch(items) {
  if (items.length === 1) {
    return {
      status: "matched",
      item: items[0],
    };
  }
  if (items.length > 1) {
    return {
      status: "ambiguous",
      item: null,
    };
  }
  return {
    status: "unmatched",
    item: null,
  };
}

function getSeoulDateTimeKeysForDate(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    timeKey: `${values.hour}:${values.minute}`,
  };
}

function parseGoogleCalendarEventBoundary(boundary, fallbackTimeKey = "00:00") {
  const dateTime = normalizeString(boundary?.dateTime);
  if (dateTime) {
    const parsed = new Date(dateTime);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const dateKey = normalizeString(boundary?.date);
  if (!dateKey) return null;
  return parseSeoulDateTime(dateKey, fallbackTimeKey);
}

function inferCalendarSessionFormat(rawLocation) {
  const normalized = normalizeString(rawLocation).toLowerCase();
  if (!normalized) return "online";
  if (
    normalized.includes("zoom") ||
    normalized.includes("meet") ||
    normalized.includes("teams") ||
    normalized.includes("online") ||
    normalized.includes("온라인") ||
    normalized.includes("webex")
  ) {
    return "online";
  }
  return "offline";
}

function parseIrregularCalendarTitle(rawTitle) {
  const summary = normalizeString(rawTitle);
  if (!summary.startsWith(IRREGULAR_CALENDAR_TITLE_PREFIX)) {
    return null;
  }

  const withoutPrefix = normalizeString(summary.slice(IRREGULAR_CALENDAR_TITLE_PREFIX.length));
  const participantMatch = withoutPrefix.match(/^(.*)\(([^()]*)\)\s*$/u);
  const body = normalizeString(participantMatch?.[1] ?? withoutPrefix);
  const participantLabels = normalizeString(participantMatch?.[2])
    ? participantMatch[2]
        .split(",")
        .map((value) => normalizeString(value))
        .filter(Boolean)
    : [];
  const segments = body.split("_").map((value) => normalizeString(value));
  const [programName = "", agendaName = "", ...companyNameParts] = segments;

  return {
    body,
    programName,
    agendaName,
    companyName: companyNameParts.join("_"),
    participantLabels,
  };
}

async function googleCalendarListAllEvents(config, query) {
  const items = [];
  let pageToken = "";

  do {
    const response = await googleCalendarRequest(config, {
      method: "GET",
      path: `/calendars/${encodeURIComponent(config.calendarId)}/events`,
      query: {
        ...query,
        ...(pageToken ? { pageToken } : {}),
      },
    });

    if (Array.isArray(response?.items)) {
      items.push(...response.items);
    }
    pageToken = normalizeString(response?.nextPageToken);
  } while (pageToken);

  return items;
}

async function loadIrregularCalendarSyncReferenceData() {
  const [programsSnap, agendasSnap, companiesSnap, consultantsSnap, profilesSnap] = await Promise.all([
    db.collection("programs").get(),
    db.collection("agendas").get(),
    db.collection("companies").get(),
    db.collection("consultants").get(),
    db.collection("profiles").get(),
  ]);

  const programs = programsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
  const agendas = agendasSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
  const companies = companiesSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
  const consultants = consultantsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
  const profiles = profilesSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));

  const programsById = new Map(programs.map((item) => [item.id, item]));
  const companiesById = new Map(companies.map((item) => [item.id, item]));
  const profilesById = new Map(profiles.map((item) => [item.id, item]));

  const programNameIndex = buildNameIndex(programs, (item) => [item.name]);
  const agendaNameIndex = buildNameIndex(agendas, (item) => [item.name]);
  const companyNameIndex = buildNameIndex(
    companies,
    (item) => [
      item.name,
      item.normalizedName,
      ...(Array.isArray(item.aliases) ? item.aliases : []),
    ],
    normalizeCalendarCompanyKey
  );

  const consultantByEmail = new Map();
  consultants.forEach((consultant) => {
    [consultant.email, consultant.secondaryEmail]
      .map((value) => normalizeEmail(value))
      .filter(Boolean)
      .forEach((email) => {
        const next = consultantByEmail.get(email) || [];
        next.push(consultant);
        consultantByEmail.set(email, next);
      });
  });

  const adminProfilesByEmail = new Map();
  const companyProfilesByEmail = new Map();
  profiles.forEach((profile) => {
    const email = normalizeEmail(profile.email);
    if (!email) return;
    const role = normalizeString(profile.role);
    if (role === "admin") {
      const next = adminProfilesByEmail.get(email) || [];
      next.push(profile);
      adminProfilesByEmail.set(email, next);
    }
    if (role === "company") {
      const next = companyProfilesByEmail.get(email) || [];
      next.push(profile);
      companyProfilesByEmail.set(email, next);
    }
  });

  return {
    programsById,
    companiesById,
    profilesById,
    programNameIndex,
    agendaNameIndex,
    companyNameIndex,
    consultantByEmail,
    adminProfilesByEmail,
    companyProfilesByEmail,
  };
}

function buildIrregularCalendarMatchWarnings(sessionDoc) {
  const warnings = [];
  if (sessionDoc.programMatchStatus === "unmatched") {
    warnings.push("일치하는 사업명이 없습니다.");
  } else if (sessionDoc.programMatchStatus === "ambiguous") {
    warnings.push("사업명이 여러 개로 매칭됩니다.");
  }

  if (sessionDoc.agendaMatchStatus === "unmatched") {
    warnings.push("일치하는 아젠다가 없습니다.");
  } else if (sessionDoc.agendaMatchStatus === "ambiguous") {
    warnings.push("아젠다가 여러 개로 매칭됩니다.");
  }

  if (sessionDoc.companyMatchStatus === "unmatched") {
    warnings.push("일치하는 기업명이 없습니다.");
  } else if (sessionDoc.companyMatchStatus === "ambiguous") {
    warnings.push("기업명이 여러 개로 매칭됩니다.");
  }

  if (!sessionDoc.consultantId) {
    warnings.push("참석자 이메일 기준으로 컨설턴트를 찾지 못했습니다.");
  }
  if (!sessionDoc.managerEmail) {
    warnings.push("담당 PM 정보를 확인하지 못했습니다.");
  }
  return warnings;
}

function buildIrregularCalendarSessionDoc(event, config, referenceData, now) {
  const rawTitle = normalizeString(event?.summary);
  const parsedTitle = parseIrregularCalendarTitle(rawTitle);
  if (!parsedTitle) {
    return null;
  }

  const startAt = parseGoogleCalendarEventBoundary(event?.start);
  const endAt = parseGoogleCalendarEventBoundary(event?.end);
  if (!startAt || !endAt) {
    throw new Error("Irregular calendar event is missing start/end dateTime");
  }

  const attendeeEntries = Array.isArray(event?.attendees) ? event.attendees : [];
  const attendeeEmails = Array.from(
    new Set(attendeeEntries.map((item) => normalizeEmail(item?.email)).filter(Boolean))
  );
  const attendeeLabels = Array.from(
    new Set(
      [
        ...attendeeEntries.map((item) =>
          buildCalendarParticipantLabel(item?.displayName, normalizeEmail(item?.email))
        ),
        ...parsedTitle.participantLabels,
      ].filter(Boolean)
    )
  );

  const programMatch = getSingleMatch(
    findIndexedNameMatches(referenceData.programNameIndex, parsedTitle.programName)
  );
  const agendaMatch = getSingleMatch(
    findIndexedNameMatches(referenceData.agendaNameIndex, parsedTitle.agendaName)
  );

  const titleCompanyMatch = getSingleMatch(
    findIndexedNameMatches(
      referenceData.companyNameIndex,
      parsedTitle.companyName,
      normalizeCalendarCompanyKey
    )
  );

  const consultantMatch = getSingleMatch(
    dedupeById(
      attendeeEmails.flatMap((email) => referenceData.consultantByEmail.get(email) || [])
    )
  );

  const companyProfileMatch = getSingleMatch(
    dedupeById(
      attendeeEmails.flatMap((email) => referenceData.companyProfilesByEmail.get(email) || [])
    )
  );

  const companyFromAttendee =
    companyProfileMatch.status === "matched"
      ? referenceData.companiesById.get(normalizeString(companyProfileMatch.item?.companyId)) || null
      : null;

  const companyDoc =
    titleCompanyMatch.item || companyFromAttendee || null;
  const companyMatchStatus =
    titleCompanyMatch.status === "matched"
      ? "matched"
      : companyFromAttendee
        ? "matched"
        : titleCompanyMatch.status;
  const companyMatchSource =
    titleCompanyMatch.status === "matched"
      ? "title"
      : companyFromAttendee
        ? "attendee"
        : "none";

  const matchedProgram = programMatch.item || null;
  const matchedAgenda = agendaMatch.item || null;
  const managerProfileFromProgram = matchedProgram
    ? referenceData.profilesById.get(normalizeString(matchedProgram.managerUid)) || null
    : null;
  const adminAttendeeMatch = getSingleMatch(
    dedupeById(
      attendeeEmails.flatMap((email) => referenceData.adminProfilesByEmail.get(email) || [])
    )
  );
  const resolvedManagerProfile = managerProfileFromProgram || adminAttendeeMatch.item || null;
  const managerEmail = normalizeEmail(resolvedManagerProfile?.email);
  const managerName = buildCalendarParticipantLabel(
    resolvedManagerProfile?.name || resolvedManagerProfile?.displayName,
    managerEmail
  );

  const consultantEmail =
    consultantMatch.status === "matched"
      ? normalizeEmail(consultantMatch.item?.email || consultantMatch.item?.secondaryEmail)
      : "";
  const consultantName = buildCalendarParticipantLabel(
    consultantMatch.item?.name,
    consultantEmail
  );

  const rawLocation = normalizeString(event?.location);
  const { dateKey, timeKey } = getSeoulDateTimeKeysForDate(startAt);
  const durationHoursRaw = (endAt.getTime() - startAt.getTime()) / (60 * 60 * 1000);
  const duration =
    Number.isFinite(durationHoursRaw) && durationHoursRaw > 0
      ? Math.round(durationHoursRaw * 100) / 100
      : 1;

  const sessionDoc = {
    source: "google-calendar",
    sessionType: "irregular",
    calendarId: config.calendarId,
    eventId: normalizeString(event?.id),
    sourceStatus: normalizeString(event?.status) === "cancelled" ? "cancelled" : "active",
    rawTitle,
    rawDescription: normalizeString(event?.description) || null,
    rawLocation: rawLocation || null,
    rawAttendeeEmails: attendeeEmails,
    attendeeLabels,
    sessionFormat: inferCalendarSessionFormat(rawLocation),
    parsedProgramName: parsedTitle.programName || null,
    parsedAgendaName: parsedTitle.agendaName || null,
    parsedCompanyName: parsedTitle.companyName || null,
    programMatchStatus: programMatch.status,
    programMatchSource: programMatch.item ? "title" : "none",
    agendaMatchStatus: agendaMatch.status,
    agendaMatchSource: agendaMatch.item ? "title" : "none",
    companyMatchStatus,
    companyMatchSource,
    programId: matchedProgram?.id || null,
    programName: normalizeString(matchedProgram?.name) || parsedTitle.programName || null,
    agendaId: matchedAgenda?.id || null,
    agendaName: normalizeString(matchedAgenda?.name) || parsedTitle.agendaName || null,
    companyId: companyDoc?.id || null,
    companyName:
      normalizeString(companyDoc?.name) ||
      parsedTitle.companyName ||
      normalizeString(companyProfileMatch.item?.companyName) ||
      null,
    companyProfileUid:
      companyProfileMatch.status === "matched" ? normalizeString(companyProfileMatch.item?.id) : null,
    consultantId: consultantMatch.item?.id || null,
    consultantName: consultantName || null,
    consultantEmail: consultantEmail || null,
    managerUid: normalizeString(resolvedManagerProfile?.id) || null,
    managerName: managerName || null,
    managerEmail: managerEmail || null,
    scheduledDate: dateKey,
    scheduledTime: timeKey,
    scheduledStartAt: startAt,
    scheduledEndAt: endAt,
    duration,
    sourceCreatedAt: toJsDate(event?.created) || startAt,
    sourceUpdatedAt: toJsDate(event?.updated) || now,
    lastSyncedAt: now,
  };

  const matchWarnings = buildIrregularCalendarMatchWarnings(sessionDoc);

  return {
    ...sessionDoc,
    matchWarnings,
    manualReviewRequired: matchWarnings.length > 0,
  };
}

async function syncIrregularCalendarSessionsCore(now = new Date()) {
  const config = getGoogleCalendarConfig();
  if (!config) {
    throw new Error("Google Calendar sync failed: required secrets are not configured");
  }

  const referenceData = await loadIrregularCalendarSyncReferenceData();
  const timeMin = new Date(now.getTime() - IRREGULAR_CALENDAR_SYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const timeMax = new Date(now.getTime() + IRREGULAR_CALENDAR_SYNC_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
  const events = await googleCalendarListAllEvents(config, {
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    showDeleted: "true",
    maxResults: "2500",
  });

  let syncedCount = 0;
  let cancelledCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const event of events) {
    const eventId = normalizeString(event?.id);
    if (!eventId) {
      skippedCount += 1;
      continue;
    }

    const rawTitle = normalizeString(event?.summary);
    const isIrregularEvent = rawTitle.startsWith(IRREGULAR_CALENDAR_TITLE_PREFIX);
    if (!isIrregularEvent) {
      skippedCount += 1;
      continue;
    }

    try {
      const nextDoc = buildIrregularCalendarSessionDoc(event, config, referenceData, now);
      if (!nextDoc) {
        skippedCount += 1;
        continue;
      }

      await db
        .collection(IRREGULAR_CALENDAR_SESSION_COLLECTION)
        .doc(eventId)
        .set(
          {
            ...nextDoc,
            ...(nextDoc.sourceStatus === "cancelled"
              ? { deletedAt: now }
              : { deletedAt: FieldValue.delete() }),
          },
          { merge: true }
        );

      if (nextDoc.sourceStatus !== "cancelled") {
        const claim = await claimIrregularCalendarSessionConfirmationDispatch(eventId);
        if (claim.ok) {
          const dispatchResult = await dispatchIrregularCalendarSessionConfirmationEmails(eventId);
          if (dispatchResult.ok) {
            await writeIrregularCalendarSessionConfirmationState(eventId, {
              status: "completed",
              channels: dispatchResult.channels,
              message: "",
              sentAt: FieldValue.serverTimestamp(),
            });
          } else {
            await writeIrregularCalendarSessionConfirmationState(eventId, {
              status: dispatchResult.status || "error",
              channels: dispatchResult.channels || null,
              message: dispatchResult.message || dispatchResult.reason || "unknown-error",
            });
          }
        }
      }

      if (nextDoc.sourceStatus === "cancelled") {
        cancelledCount += 1;
      } else {
        syncedCount += 1;
      }
    } catch (error) {
      errorCount += 1;
      console.error("syncIrregularCalendarSessionsCore failed for event", {
        eventId,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : null,
      });
    }
  }

  return {
    syncedCount,
    cancelledCount,
    skippedCount,
    errorCount,
    calendarId: config.calendarId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
  };
}

function toSlackFieldValue(value) {
  const normalized = normalizeString(value);
  return normalized || "(missing)";
}

function normalizeSlackMemberId(value) {
  const normalized = normalizeString(value).toUpperCase();
  if (!/^[UW][A-Z0-9]{8,}$/u.test(normalized)) {
    return "";
  }
  return normalized;
}

function normalizeSlackDmTarget(value) {
  const normalized = normalizeString(value).toUpperCase();
  if (!/^[DUW][A-Z0-9]{8,}$/u.test(normalized)) {
    return "";
  }
  return normalized;
}

function normalizeSlackChannelId(value) {
  const normalized = normalizeString(value).toUpperCase();
  if (!/^[CG][A-Z0-9]{8,}$/u.test(normalized)) {
    return "";
  }
  return normalized;
}

function buildSignupRequestSlackPayload(signupRequest) {
  const requestedRole = normalizeApprovalRole(
    signupRequest.requestedRole || signupRequest.role || "",
    ""
  );
  const loginEmail = normalizeString(signupRequest.email);
  const fields = [
    {
      type: "mrkdwn",
      text: `*이메일*\n${toSlackFieldValue(loginEmail)}`,
    },
    {
      type: "mrkdwn",
      text: `*요청 역할*\n${getApprovalRoleLabel(requestedRole)} \`${toSlackFieldValue(requestedRole)}\``,
    },
    {
      type: "mrkdwn",
      text: `*가입 요청 시각*\n${formatFirestoreDateTime(signupRequest.createdAt)}`,
    },
  ];

  return {
    text: `새 가입 승인 요청: ${toSlackFieldValue(loginEmail)}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "새 가입 승인 요청",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${toSlackFieldValue(loginEmail)}`,
        },
      },
      {
        type: "section",
        fields,
      },
    ],
  };
}

async function postSlackWebhook(webhookUrl, payload) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Slack webhook failed (${response.status}): ${responseText || "empty response"}`);
  }
}

async function postSlackApi(path, token, payload) {
  const response = await fetch(`https://slack.com/api/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  const body = await parseUpstreamResponse(response);
  if (!response.ok) {
    throw new Error(`Slack API failed (${response.status}): ${JSON.stringify(body || {})}`);
  }
  if (!body || body.ok !== true) {
    throw new Error(`Slack API returned an error: ${JSON.stringify(body || {})}`);
  }
  return body;
}

async function sendSlackDirectMessage({ token, userId, text }) {
  return postSlackApi("chat.postMessage", token, {
    channel: userId,
    text,
  });
}

async function sendSlackChannelMessage({ token, channelId, text }) {
  return postSlackApi("chat.postMessage", token, {
    channel: channelId,
    text,
  });
}

function buildInternalConsultantAvailabilityAlertText({
  monthKey,
  missingConsultants,
  totalConsultantCount = 0,
  skippedMissingScopeCount,
  labelPrefix = "",
}) {
  const normalizedTotal = Number.isInteger(totalConsultantCount)
    ? Math.max(totalConsultantCount, 0)
    : 0;
  const missingCount = Array.isArray(missingConsultants) ? missingConsultants.length : 0;
  const submittedCount = Math.max(normalizedTotal - missingCount, 0);
  const header = `${labelPrefix}${monthKey} 가능시간 등록 현황: ${normalizedTotal}명중 ${submittedCount}명 등록 / ${missingCount}명 미등록`;
  const lines =
    missingCount > 0
      ? missingConsultants.map((consultant) => {
          const email = normalizeString(consultant.email) || "이메일 미입력";
          return `- ${normalizeString(consultant.name) || consultant.id} <${email}>`;
        })
      : ["- 모두 제출 완료"];

  if (skippedMissingScopeCount > 0) {
    lines.push(
      "",
      `주의: scope 미설정 활성 컨설턴트 ${skippedMissingScopeCount}명은 집계에서 제외됨`
    );
  }

  return [header, ...lines].join("\n");
}

function buildStageSlackAvailabilityAlertText({
  monthKey,
  missingConsultants,
  totalConsultantCount,
  skippedMissingScopeCount,
}) {
  return buildInternalConsultantAvailabilityAlertText({
    monthKey,
    missingConsultants,
    totalConsultantCount,
    skippedMissingScopeCount,
    labelPrefix: "[stage] ",
  });
}

function formatSeoulDateLabel(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function buildSeoulWeekRangeLabel(startDate, endDate) {
  const startLabel = formatSeoulDateLabel(startDate);
  const endLabel = formatSeoulDateLabel(endDate);
  if (!startLabel || !endLabel) {
    return "";
  }
  return `${startLabel} ~ ${endLabel}`;
}

function addDaysToDate(date, amount) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + amount);
  return next;
}

function buildConsultantTargetMonthLabel(monthKey) {
  if (!regularOfficeHourPolicy.isMonthKey(monthKey)) {
    return monthKey || "대상 월 미지정";
  }
  const [yearRaw, monthRaw] = monthKey.split("-");
  return `${Number(yearRaw)}년 ${Number(monthRaw)}월`;
}

function resolveConsultantSlackDmTarget(consultantDoc) {
  return normalizeSlackDmTarget(consultantDoc?.slackUserId);
}

function buildCompanyRegularApplicationLink() {
  return DEFAULT_NOTIFICATION_DETAIL_BASE_URL;
}

function buildConsultantScheduleInputLink() {
  return DEFAULT_NOTIFICATION_DETAIL_BASE_URL;
}

function buildConsultantReportLink() {
  return DEFAULT_NOTIFICATION_DETAIL_BASE_URL;
}

async function claimNotificationBatchRun(batchKey, runValue, fieldName = "lastDateKey") {
  const normalizedBatchKey = normalizeString(batchKey);
  const normalizedRunValue = normalizeString(runValue);
  const normalizedFieldName = normalizeString(fieldName);

  if (!normalizedBatchKey || !normalizedRunValue || !normalizedFieldName) {
    throw new Error("claimNotificationBatchRun requires batchKey, runValue, and fieldName");
  }

  return db.runTransaction(async (transaction) => {
    const ref = db.collection("notificationSchedulerRuns").doc(normalizedBatchKey);
    const snap = await transaction.get(ref);
    const currentValue = normalizeString(snap.data()?.[normalizedFieldName]);
    if (currentValue === normalizedRunValue) {
      return false;
    }

    transaction.set(
      ref,
      {
        [normalizedFieldName]: normalizedRunValue,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return true;
  });
}

function buildHtmlFallbackFromText(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "";
  }

  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#111827;white-space:pre-wrap;">${normalized
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;")
    .replace(
      /(https?:\/\/[^\s]+)/g,
      (url) => `<a href="${url}" style="color:#0f766e;text-decoration:underline;">${url}</a>`
    )}</div>`;
}

async function parseUpstreamResponse(response) {
  const contentType = normalizeString(response.headers.get("content-type")).toLowerCase();

  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    const text = await response.text();
    return text || null;
  } catch {
    return null;
  }
}

async function sendResendEmail({ apiKey, fromEmail, replyTo, to, subject, text, html }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json; charset=utf-8",
      "user-agent": "startup-diagnostic-platform-functions/1.0",
    },
    body: JSON.stringify({
      from: `MYSC <${fromEmail}>`,
      to: [to],
      subject,
      text,
      html: html || buildHtmlFallbackFromText(text),
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  const body = await parseUpstreamResponse(response);
  if (!response.ok) {
    throw new Error(`Resend send failed (${response.status}): ${JSON.stringify(body || {})}`);
  }

  return body;
}

function renderTemplateString(template, variables) {
  if (typeof template !== "string") {
    return "";
  }

  return template.replace(/\{\{\s*([a-zA-Z0-9]+)\s*\}\}/g, (_match, key) => {
    const replacement = variables?.[key];
    return typeof replacement === "string" ? replacement : "";
  });
}

function buildNotificationDetailLink(application) {
  return DEFAULT_NOTIFICATION_DETAIL_BASE_URL;
}

function buildOfficeHourRejectionDetailLink(application) {
  return buildNotificationDetailLink(application);
}

function buildNotificationMeetingLink(application) {
  if (normalizeString(application?.sessionFormat) === "offline") {
    return "해당 없음";
  }

  return "온라인 접속 링크 미연결";
}

function buildNotificationScheduledDateTimeLabel(application) {
  const dateKey = normalizeString(application?.scheduledDate);
  const timeKey = normalizeTimeKey(application?.scheduledTime);

  if (!isDateKey(dateKey)) {
    return [dateKey, timeKey].filter(Boolean).join(" ").trim();
  }

  const isoDateTime = `${dateKey}T${timeKey || "00:00"}:00+09:00`;
  const parsed = new Date(isoDateTime);
  if (Number.isNaN(parsed.getTime())) {
    return [dateKey, timeKey].filter(Boolean).join(" ").trim();
  }

  const formatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    ...(timeKey
      ? {
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }
      : {}),
  });

  return formatter.format(parsed);
}

function buildOfficeHourTypeLabel(application) {
  return normalizeString(application?.type) === "irregular"
    ? "비정기 오피스아워"
    : "정기 오피스아워";
}

function buildBiztalkMessageIndex(prefix, identifier) {
  const normalizedPrefix = normalizeString(prefix).toLowerCase() || "msg";
  const normalizedIdentifier = normalizeString(identifier).replace(/[^a-zA-Z0-9]/g, "");
  const compactIdentifier = normalizedIdentifier.slice(-12) || "unknown";
  const compactTimestamp = Date.now().toString(36);
  return `${normalizedPrefix}-${compactIdentifier}-${compactTimestamp}`.slice(0, 39);
}

async function loadRegularApplicationNotificationContext(applicationId) {
  const context = await loadOfficeHourApplicationContext(applicationId);
  if (!context) {
    return null;
  }

  const companyId = normalizeString(context.application?.companyId || context.companyDoc?.id);
  const companyInfoSnap = companyId
    ? await db.collection("companies").doc(companyId).collection("companyInfo").doc("info").get()
    : null;

  return {
    ...context,
    companyInfoDoc: companyInfoSnap?.exists ? companyInfoSnap.data() || {} : {},
  };
}

function buildRegularApplicationNotificationVariables(context) {
  const application = context.application || {};
  return {
    companyName:
      normalizeString(application.companyName) ||
      normalizeString(application.applicantName) ||
      normalizeString(context.companyDoc?.name) ||
      "기업 미지정",
    consultantName:
      normalizeString(application.consultant) ||
      normalizeString(context.consultantDoc?.name) ||
      "컨설턴트 미지정",
    officeHourTypeLabel: buildOfficeHourTypeLabel(application),
    officeHourTitle: normalizeString(application.officeHourTitle) || "오피스아워명 미지정",
    programName: normalizeString(context.programDoc?.name) || "사업 미지정",
    agendaName:
      normalizeString(application.agenda) ||
      normalizeString(context.agendaDoc?.name) ||
      "아젠다 미지정",
    scheduledDateTimeLabel: buildNotificationScheduledDateTimeLabel(application),
    locationTypeLabel: normalizeString(application.sessionFormat) === "offline" ? "오프라인" : "온라인",
    detailLink: buildNotificationDetailLink(application),
    meetingLink: buildNotificationMeetingLink(application),
  };
}

function buildRejectionNotificationVariables(context, rejectionReason) {
  const base = buildRegularApplicationNotificationVariables(context);
  return {
    ...base,
    detailLink: buildOfficeHourRejectionDetailLink(context.application),
    rejectionReason: rejectionReason || "사유 미입력",
  };
}

function buildCancellationNotificationVariables(context, cancellationReason) {
  return {
    ...buildRegularApplicationNotificationVariables(context),
    cancellationReason: cancellationReason || "사유 미입력",
  };
}

function buildConsultantScheduleRegistrationVariables({ consultant, monthKey, registrationWindowLabel }) {
  return {
    consultantName: normalizeString(consultant?.name) || "컨설턴트",
    targetMonthLabel: buildConsultantTargetMonthLabel(monthKey),
    registrationWindowLabel: registrationWindowLabel || "입력 기간 미지정",
    inputLink: buildConsultantScheduleInputLink(),
  };
}

function buildCompanyApplicationAlertVariables({ companyName, applicationScheduleLabel }) {
  return {
    companyName: companyName || "기업",
    applicationScheduleLabel: applicationScheduleLabel || "신청 기간 미지정",
    applicationLink: buildCompanyRegularApplicationLink(),
  };
}

function buildReportReminderVariables(context) {
  return {
    ...buildRegularApplicationNotificationVariables(context),
    reportLink: buildConsultantReportLink(),
  };
}

function buildIrregularCalendarNotificationVariables({ sessionDoc, programDoc }) {
  const application = {
    id: normalizeString(sessionDoc?.id),
    type: "irregular",
    officeHourTitle: normalizeString(sessionDoc?.rawTitle) || "비정기 오피스아워",
    companyName: normalizeString(sessionDoc?.companyName) || "기업 미지정",
    consultant: normalizeString(sessionDoc?.consultantName) || "컨설턴트 미지정",
    sessionFormat: normalizeString(sessionDoc?.sessionFormat) === "offline" ? "offline" : "online",
    agenda: normalizeString(sessionDoc?.agendaName) || "아젠다 미지정",
    scheduledDate: normalizeString(sessionDoc?.scheduledDate),
    scheduledTime: normalizeTimeKey(sessionDoc?.scheduledTime),
  };

  return {
    companyName: application.companyName,
    consultantName: application.consultant,
    officeHourTypeLabel: buildOfficeHourTypeLabel(application),
    officeHourTitle: application.officeHourTitle,
    programName:
      normalizeString(sessionDoc?.programName) || normalizeString(programDoc?.name) || "사업 미지정",
    agendaName: application.agenda,
    scheduledDateTimeLabel: buildNotificationScheduledDateTimeLabel(application),
    locationTypeLabel: application.sessionFormat === "offline" ? "오프라인" : "온라인",
    meetingLink: buildNotificationMeetingLink(application),
  };
}

async function loadOfficeHourApplicationNotificationContext(applicationId) {
  const context = await loadOfficeHourApplicationContext(applicationId);
  if (!context) {
    return null;
  }

  const companyId = normalizeString(context.application?.companyId || context.companyDoc?.id);
  const companyInfoSnap = companyId
    ? await db.collection("companies").doc(companyId).collection("companyInfo").doc("info").get()
    : null;

  return {
    ...context,
    companyInfoDoc: companyInfoSnap?.exists ? companyInfoSnap.data() || {} : {},
  };
}

async function loadIrregularCalendarSessionNotificationContext(sessionId) {
  const sessionSnap = await db.collection(IRREGULAR_CALENDAR_SESSION_COLLECTION).doc(sessionId).get();
  if (!sessionSnap.exists) {
    return null;
  }

  const sessionDoc = { id: sessionSnap.id, ...(sessionSnap.data() || {}) };
  const programId = normalizeString(sessionDoc.programId);
  const companyProfileUid = normalizeString(sessionDoc.companyProfileUid);

  const [programSnap, companyProfileSnap] = await Promise.all([
    programId ? db.collection("programs").doc(programId).get() : null,
    companyProfileUid ? db.collection("profiles").doc(companyProfileUid).get() : null,
  ]);

  return {
    sessionDoc,
    programDoc: programSnap?.exists ? { id: programSnap.id, ...(programSnap.data() || {}) } : null,
    companyProfileDoc: companyProfileSnap?.exists ? companyProfileSnap.data() || {} : null,
  };
}

async function claimIrregularCalendarSessionConfirmationDispatch(sessionId) {
  return db.runTransaction(async (transaction) => {
    const sessionRef = db.collection(IRREGULAR_CALENDAR_SESSION_COLLECTION).doc(sessionId);
    const sessionSnap = await transaction.get(sessionRef);
    if (!sessionSnap.exists) {
      return { ok: false, reason: "session-not-found" };
    }

    const session = sessionSnap.data() || {};
    if (normalizeString(session.sourceStatus) === "cancelled") {
      return { ok: false, reason: "session-cancelled" };
    }

    const confirmationState = session.notificationState?.confirmation || {};
    if (confirmationState.sentAt || normalizeString(confirmationState.status) === "completed") {
      return { ok: false, reason: "already-sent" };
    }
    if (normalizeString(confirmationState.status) === "dispatching") {
      return { ok: false, reason: "already-dispatching" };
    }

    transaction.set(
      sessionRef,
      {
        notificationState: {
          confirmation: {
            status: "dispatching",
            dispatchRequestedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            lastError: FieldValue.delete(),
          },
        },
      },
      { merge: true }
    );

    return { ok: true };
  });
}

async function writeIrregularCalendarSessionConfirmationState(sessionId, patch) {
  const payload = {};

  if (Object.prototype.hasOwnProperty.call(patch, "status")) {
    payload["notificationState.confirmation.status"] = patch.status || FieldValue.delete();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "channels")) {
    payload["notificationState.confirmation.channels"] = isPlainObject(patch.channels)
      ? patch.channels
      : FieldValue.delete();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "message")) {
    payload["notificationState.confirmation.lastError"] = patch.message || FieldValue.delete();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "sentAt")) {
    payload["notificationState.confirmation.sentAt"] = patch.sentAt || FieldValue.delete();
  }
  payload["notificationState.confirmation.updatedAt"] = FieldValue.serverTimestamp();

  await db.collection(IRREGULAR_CALENDAR_SESSION_COLLECTION).doc(sessionId).set(payload, { merge: true });
}

async function claimRegularApplicationConfirmationDispatch(applicationId) {
  return db.runTransaction(async (transaction) => {
    const applicationRef = db.collection("officeHourApplications").doc(applicationId);
    const applicationSnap = await transaction.get(applicationRef);
    if (!applicationSnap.exists) {
      return { ok: false, reason: "application-not-found" };
    }

    const application = applicationSnap.data() || {};
    if (normalizeApplicationStatus(application.status) !== "confirmed") {
      return { ok: false, reason: "application-not-confirmed" };
    }

    const confirmationState = application.notificationState?.confirmation || {};
    if (confirmationState.sentAt || normalizeString(confirmationState.status) === "completed") {
      return { ok: false, reason: "already-sent" };
    }
    if (normalizeString(confirmationState.status) === "dispatching") {
      return { ok: false, reason: "already-dispatching" };
    }

    transaction.set(
      applicationRef,
      {
        notificationState: {
          confirmation: {
            status: "dispatching",
            dispatchRequestedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            lastError: FieldValue.delete(),
          },
        },
      },
      { merge: true },
    );

    return { ok: true };
  });
}

async function writeRegularApplicationConfirmationState(applicationId, patch) {
  const payload = {};

  if (Object.prototype.hasOwnProperty.call(patch, "status")) {
    payload["notificationState.confirmation.status"] = patch.status || FieldValue.delete();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "channels")) {
    payload["notificationState.confirmation.channels"] = isPlainObject(patch.channels)
      ? patch.channels
      : FieldValue.delete();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "message")) {
    payload["notificationState.confirmation.lastError"] = patch.message || FieldValue.delete();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "sentAt")) {
    payload["notificationState.confirmation.sentAt"] = patch.sentAt || FieldValue.delete();
  }
  payload["notificationState.confirmation.updatedAt"] = FieldValue.serverTimestamp();

  await db.collection("officeHourApplications").doc(applicationId).set(payload, { merge: true });
}

async function dispatchIrregularCalendarSessionConfirmationEmails(sessionId) {
  try {
    const context = await loadIrregularCalendarSessionNotificationContext(sessionId);
    if (!context) {
      return {
        ok: false,
        status: "skipped",
        reason: "session-not-found",
      };
    }

    const sessionDoc = context.sessionDoc || {};
    const consultantEmail = normalizeEmail(sessionDoc.consultantEmail);
    const companyEmail = normalizeEmail(context.companyProfileDoc?.email);
    const variables = buildIrregularCalendarNotificationVariables(context);
    const channels = {
      consultantEmail: {
        status: "skipped",
        reason: "not-attempted",
      },
      companyEmail: {
        status: "skipped",
        reason: "not-attempted",
      },
    };

    const apiKey = normalizeString(RESEND_API_KEY.value());
    if (!apiKey) {
      return {
        ok: false,
        status: "skipped",
        reason: "resend-not-configured",
      };
    }

    const tasks = [];

    tasks.push((async () => {
      if (!consultantEmail) {
        channels.consultantEmail = {
          status: "skipped",
          reason: "consultant-email-missing",
        };
        return;
      }

      const responseBody = await sendResendEmail({
        apiKey,
        fromEmail: DEFAULT_NOTIFICATION_EMAIL_FROM_ADDRESS,
        to: consultantEmail,
        subject: IRREGULAR_OFFICE_HOUR_CONFIRMED_CONSULTANT_EMAIL_SUBJECT,
        text: renderTemplateString(
          IRREGULAR_OFFICE_HOUR_CONFIRMED_CONSULTANT_EMAIL_TEMPLATE,
          variables
        ),
      });

      channels.consultantEmail = {
        status: "sent",
        recipient: consultantEmail,
        deliveryId: normalizeString(responseBody?.id) || null,
      };
    })().catch((error) => {
      channels.consultantEmail = {
        status: "error",
        recipient: consultantEmail || null,
        message: error instanceof Error ? error.message : String(error),
      };
    }));

    tasks.push((async () => {
      if (!companyEmail) {
        channels.companyEmail = {
          status: "skipped",
          reason: "company-email-missing",
        };
        return;
      }

      const responseBody = await sendResendEmail({
        apiKey,
        fromEmail: DEFAULT_NOTIFICATION_EMAIL_FROM_ADDRESS,
        to: companyEmail,
        subject: IRREGULAR_OFFICE_HOUR_CONFIRMED_COMPANY_EMAIL_SUBJECT,
        text: renderTemplateString(
          IRREGULAR_OFFICE_HOUR_CONFIRMED_COMPANY_EMAIL_TEMPLATE,
          variables
        ),
      });

      channels.companyEmail = {
        status: "sent",
        recipient: companyEmail,
        deliveryId: normalizeString(responseBody?.id) || null,
      };
    })().catch((error) => {
      channels.companyEmail = {
        status: "error",
        recipient: companyEmail || null,
        message: error instanceof Error ? error.message : String(error),
      };
    }));

    await Promise.all(tasks);

    const channelResults = Object.values(channels);
    const hasSentChannel = channelResults.some((channel) => channel?.status === "sent");
    if (!hasSentChannel) {
      return {
        ok: false,
        status: "skipped",
        reason: "no-deliverable-irregular-email-targets",
        channels,
      };
    }

    return {
      ok: true,
      status: "completed",
      channels,
    };
  } catch (error) {
    console.error("dispatchIrregularCalendarSessionConfirmationEmails failed", {
      sessionId,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : null,
    });
    return {
      ok: false,
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function writeOfficeHourSameDayReminderState(applicationId, patch) {
  const payload = {
    notificationState: {
      sameDayReminder: {
        updatedAt: FieldValue.serverTimestamp(),
        ...(Object.prototype.hasOwnProperty.call(patch, "status") ? { status: patch.status } : {}),
        ...(Object.prototype.hasOwnProperty.call(patch, "dispatchDateKey")
          ? { dispatchDateKey: patch.dispatchDateKey }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(patch, "sentDateKey")
          ? { sentDateKey: patch.sentDateKey }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(patch, "channels")
          ? { channels: patch.channels }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(patch, "message")
          ? { lastError: patch.message || FieldValue.delete() }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(patch, "schedulerTriggeredAt")
          ? { schedulerTriggeredAt: patch.schedulerTriggeredAt }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(patch, "dispatchRequestedAt")
          ? { dispatchRequestedAt: patch.dispatchRequestedAt }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(patch, "sentAt")
          ? { sentAt: patch.sentAt }
          : {}),
      },
    },
  };

  await db.collection("officeHourApplications").doc(applicationId).set(payload, { merge: true });
}

async function writeOfficeHourReportReminderState(applicationId, patch) {
  const payload = {
    notificationState: {
      reportReminder: {
        updatedAt: FieldValue.serverTimestamp(),
        ...(Object.prototype.hasOwnProperty.call(patch, "status") ? { status: patch.status } : {}),
        ...(Object.prototype.hasOwnProperty.call(patch, "dispatchDateKey")
          ? { dispatchDateKey: patch.dispatchDateKey }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(patch, "sentDateKey")
          ? { sentDateKey: patch.sentDateKey }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(patch, "channels")
          ? { channels: patch.channels }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(patch, "message")
          ? { lastError: patch.message || FieldValue.delete() }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(patch, "dispatchRequestedAt")
          ? { dispatchRequestedAt: patch.dispatchRequestedAt }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(patch, "sentAt")
          ? { sentAt: patch.sentAt }
          : {}),
      },
    },
  };

  await db.collection("officeHourApplications").doc(applicationId).set(payload, { merge: true });
}

async function claimOfficeHourSameDayReminderDispatch(applicationId, todayDateKey) {
  return db.runTransaction(async (transaction) => {
    const applicationRef = db.collection("officeHourApplications").doc(applicationId);
    const applicationSnap = await transaction.get(applicationRef);
    if (!applicationSnap.exists) {
      return { ok: false, reason: "application-not-found" };
    }

    const application = applicationSnap.data() || {};
    if (normalizeString(application.scheduledDate) !== todayDateKey) {
      return { ok: false, reason: "scheduled-date-mismatch" };
    }
    if (normalizeApplicationStatus(application.status) !== "confirmed") {
      return { ok: false, reason: "application-not-confirmed" };
    }

    const reminderState = application.notificationState?.sameDayReminder || {};
    const sentDateKey = normalizeString(reminderState.sentDateKey);
    const dispatchDateKey = normalizeString(reminderState.dispatchDateKey);
    if (sentDateKey === todayDateKey || dispatchDateKey === todayDateKey) {
      return { ok: false, reason: "already-dispatched-today" };
    }

    transaction.set(
      applicationRef,
      {
        notificationState: {
          sameDayReminder: {
            status: "dispatching",
            dispatchDateKey: todayDateKey,
            dispatchRequestedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            lastError: FieldValue.delete(),
          },
        },
      },
      { merge: true }
    );

    return { ok: true };
  });
}

async function dispatchOfficeHourSameDayReminderNotifications(applicationId) {
  try {
    const context = await loadOfficeHourApplicationNotificationContext(applicationId);
    if (!context) {
      return {
        ok: false,
        status: "skipped",
        reason: "application-not-found",
      };
    }

    const consultantScope = normalizeString(context.consultantDoc?.scope);
    const consultantEmail =
      normalizeEmail(context.consultantDoc?.email) ||
      normalizeEmail(context.consultantDoc?.secondaryEmail) ||
      normalizeEmail(context.consultantEmail);
    const consultantSlackTarget = resolveConsultantSlackDmTarget(context.consultantDoc);
    const companyEmail = normalizeEmail(context.companyEmail);
    const companyPhone = normalizePhoneNumber(context.companyInfoDoc?.basic?.ceo?.phone);
    const variables = buildRegularApplicationNotificationVariables(context);
    const companyBiztalkMsgIdx = buildBiztalkMessageIndex("ohr", applicationId);

    const channels = {
      consultantEmail: {
        status: "skipped",
        reason:
          consultantScope === "external" || consultantScope === "internal"
            ? "not-attempted"
            : "consultant-scope-not-supported",
      },
      consultantSlackDm: {
        status: "skipped",
        reason: consultantScope === "internal" ? "not-attempted" : "consultant-scope-not-internal",
      },
      companyEmail: {
        status: "skipped",
        reason: "not-attempted",
      },
      companyBiztalk: {
        status: "skipped",
        reason: "not-attempted",
      },
    };

    const tasks = [];

    if (consultantScope === "external" || consultantScope === "internal") {
      tasks.push((async () => {
        if (!consultantEmail) {
          channels.consultantEmail = {
            status: "skipped",
            reason: "consultant-email-missing",
          };
          return;
        }

        const apiKey = normalizeString(RESEND_API_KEY.value());
        if (!apiKey) {
          channels.consultantEmail = {
            status: "skipped",
            reason: "resend-not-configured",
          };
          return;
        }

        const responseBody = await sendResendEmail({
          apiKey,
          fromEmail: DEFAULT_NOTIFICATION_EMAIL_FROM_ADDRESS,
          to: consultantEmail,
          subject: OFFICE_HOUR_REMINDER_CONSULTANT_EMAIL_SUBJECT,
          text: renderTemplateString(
            OFFICE_HOUR_REMINDER_CONSULTANT_EMAIL_TEMPLATE,
            variables
          ),
        });

        channels.consultantEmail = {
          status: "sent",
          recipient: consultantEmail,
          deliveryId: normalizeString(responseBody?.id) || null,
        };
      })().catch((error) => {
        channels.consultantEmail = {
          status: "error",
          recipient: consultantEmail || null,
          message: error instanceof Error ? error.message : String(error),
        };
      }));
    }

    if (consultantScope === "internal") {
      tasks.push((async () => {
        const token = normalizeString(SLACK_BOT_TOKEN.value());
        if (!token || !consultantSlackTarget) {
          channels.consultantSlackDm = {
            status: "skipped",
            reason: !token ? "slack-token-missing" : "consultant-slack-user-id-missing",
          };
          return;
        }

        const text = renderTemplateString(OFFICE_HOUR_REMINDER_INTERNAL_SLACK_TEMPLATE, variables);
        const result = consultantSlackTarget.startsWith("D")
          ? await sendSlackChannelMessage({
              token,
              channelId: consultantSlackTarget,
              text,
            })
          : await sendSlackDirectMessage({
              token,
              userId: consultantSlackTarget,
              text,
            });

        channels.consultantSlackDm = {
          status: "sent",
          userId: consultantSlackTarget,
          channel: normalizeString(result.channel) || null,
          ts: normalizeString(result.ts) || null,
        };
      })().catch((error) => {
        channels.consultantSlackDm = {
          status: "error",
          userId: consultantSlackTarget || null,
          message: error instanceof Error ? error.message : String(error),
        };
      }));
    }

    tasks.push((async () => {
      if (!companyEmail) {
        channels.companyEmail = {
          status: "skipped",
          reason: "company-email-missing",
        };
        return;
      }

      const apiKey = normalizeString(RESEND_API_KEY.value());
      if (!apiKey) {
        channels.companyEmail = {
          status: "skipped",
          reason: "resend-not-configured",
        };
        return;
      }

      const responseBody = await sendResendEmail({
        apiKey,
        fromEmail: DEFAULT_NOTIFICATION_EMAIL_FROM_ADDRESS,
        to: companyEmail,
        subject: OFFICE_HOUR_REMINDER_COMPANY_EMAIL_SUBJECT,
        text: renderTemplateString(
          OFFICE_HOUR_REMINDER_COMPANY_EMAIL_TEMPLATE,
          variables
        ),
      });

      channels.companyEmail = {
        status: "sent",
        recipient: companyEmail,
        deliveryId: normalizeString(responseBody?.id) || null,
      };
    })().catch((error) => {
      channels.companyEmail = {
        status: "error",
        recipient: companyEmail || null,
        message: error instanceof Error ? error.message : String(error),
      };
    }));

    tasks.push((async () => {
      if (!companyPhone) {
        channels.companyBiztalk = {
          status: "skipped",
          reason: "company-phone-missing",
          msgIdx: companyBiztalkMsgIdx,
        };
        return;
      }

      if (!getBiztalkDispatchConfig()) {
        channels.companyBiztalk = {
          status: "skipped",
          reason: "biztalk-not-configured",
          msgIdx: companyBiztalkMsgIdx,
        };
        return;
      }

      const title = renderTemplateString(
        OFFICE_HOUR_REMINDER_BIZTALK_TITLE_TEMPLATE,
        variables
      );
      const message = renderTemplateString(
        OFFICE_HOUR_REMINDER_BIZTALK_MESSAGE_TEMPLATE,
        variables
      );
      const result = await callBiztalkDispatch("/dispatch/alimtalk", {
        callerProjectId: FIREBASE_PROJECT_ID,
        dryRun: false,
        recipient: companyPhone,
        message,
        msgIdx: companyBiztalkMsgIdx,
        title,
        tmpltCode: OFFICE_HOUR_REMINDER_BIZTALK_TEMPLATE_CODE,
        attach: OFFICE_HOUR_REMINDER_BIZTALK_ATTACH,
      });

      channels.companyBiztalk = {
        status: "sent",
        recipient: companyPhone,
        msgIdx: companyBiztalkMsgIdx,
        templateCode: OFFICE_HOUR_REMINDER_BIZTALK_TEMPLATE_CODE,
        title,
        message,
        targetUrl: normalizeString(result?.targetUrl) || null,
        dispatchOk: typeof result?.ok === "boolean" ? result.ok : null,
        upstreamStatus: Number.isFinite(result?.upstreamStatus) ? result.upstreamStatus : null,
        responseCode:
          normalizeString(
            result?.upstreamBody?.responseCode || result?.code || result?.responseCode
          ) || null,
        upstreamResponseCount: Array.isArray(result?.upstreamBody?.response)
          ? result.upstreamBody.response.length
          : null,
        upstreamBody: isPlainObject(result?.upstreamBody) ? result.upstreamBody : result?.upstreamBody || null,
      };
    })().catch((error) => {
      channels.companyBiztalk = {
        status: "error",
        recipient: companyPhone || null,
        msgIdx: companyBiztalkMsgIdx,
        templateCode: OFFICE_HOUR_REMINDER_BIZTALK_TEMPLATE_CODE,
        message: error instanceof Error ? error.message : String(error),
      };
    }));

    await Promise.all(tasks);

    return {
      ok: true,
      status: "completed",
      consultantScope: consultantScope || null,
      channels,
    };
  } catch (error) {
    console.error("dispatchOfficeHourSameDayReminderNotifications failed", {
      applicationId,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : null,
    });
    return {
      ok: false,
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runOfficeHourSameDayReminderDispatchCore(now = new Date()) {
  const { dateKey } = getCurrentSeoulDateTimeKeys(now);
  const applicationsSnap = await db
    .collection("officeHourApplications")
    .where("scheduledDate", "==", dateKey)
    .get();

  let sentCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const results = [];

  for (const applicationSnap of applicationsSnap.docs) {
    const applicationId = applicationSnap.id;
    const application = applicationSnap.data() || {};

    if (normalizeApplicationStatus(application.status) !== "confirmed") {
      skippedCount += 1;
      results.push({ applicationId, status: "skipped", reason: "application-not-confirmed" });
      continue;
    }

    const claim = await claimOfficeHourSameDayReminderDispatch(applicationId, dateKey);
    if (!claim.ok) {
      skippedCount += 1;
      results.push({ applicationId, status: "skipped", reason: claim.reason });
      continue;
    }

    const dispatchResult = await dispatchOfficeHourSameDayReminderNotifications(applicationId);
    if (dispatchResult.ok) {
      sentCount += 1;
      await writeOfficeHourSameDayReminderState(applicationId, {
        status: "completed",
        dispatchDateKey: dateKey,
        sentDateKey: dateKey,
        channels: dispatchResult.channels,
        message: "",
        schedulerTriggeredAt: now.toISOString(),
        sentAt: FieldValue.serverTimestamp(),
      });
      results.push({ applicationId, status: "completed" });
      continue;
    }

    errorCount += 1;
    await writeOfficeHourSameDayReminderState(applicationId, {
      status: "error",
      dispatchDateKey: dateKey,
      channels: dispatchResult.channels || null,
      message: dispatchResult.message || "unknown-error",
      schedulerTriggeredAt: now.toISOString(),
    });
    results.push({
      applicationId,
      status: "error",
      message: dispatchResult.message || "unknown-error",
    });
  }

  console.info(
    "sendOfficeHourSameDayReminders summary",
    JSON.stringify({
      dateKey,
      sentCount,
      skippedCount,
      errorCount,
      results,
    })
  );

  return {
    dateKey,
    sentCount,
    skippedCount,
    errorCount,
    results,
  };
}

async function dispatchConsultantScheduleRegistrationAlerts(now = new Date()) {
  const weekInfo = regularOfficeHourPolicy.getOfficeHourWeekInfo(now);
  const { dateKey } = getCurrentSeoulDateTimeKeys(now);

  if (
    !weekInfo ||
    !regularOfficeHourPolicy.shouldDispatchConsultantScheduleRegistrationAlert(now)
  ) {
    return {
      status: "skipped",
      reason: "outside-registration-week",
      dateKey,
    };
  }

  const claimed = await claimNotificationBatchRun(
    "consultant-schedule-registration-alerts",
    dateKey
  );
  if (!claimed) {
    return {
      status: "skipped",
      reason: "already-sent-today",
      dateKey,
    };
  }

  const targetMonthKey = regularOfficeHourPolicy.getNextMonthKey(now);
  const registrationWindowLabel = buildSeoulWeekRangeLabel(
    weekInfo.weekStart,
    addDaysToDate(weekInfo.weekStart, 6)
  );
  const consultantsSnap = await db.collection("consultants").where("status", "==", "active").get();
  const consultants = consultantsSnap.docs
    .map((doc) => normalizeConsultantDoc(doc))
    .filter((consultant) => normalizeString(consultant.scope) === "external");

  const apiKey = normalizeString(RESEND_API_KEY.value());
  let sentCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const results = [];

  for (const consultant of consultants) {
    const email =
      normalizeEmail(consultant.email) || normalizeEmail(consultant.secondaryEmail);
    if (!email) {
      skippedCount += 1;
      results.push({ consultantId: consultant.id, status: "skipped", reason: "consultant-email-missing" });
      continue;
    }
    if (!apiKey) {
      skippedCount += 1;
      results.push({ consultantId: consultant.id, status: "skipped", reason: "resend-not-configured" });
      continue;
    }

    const variables = buildConsultantScheduleRegistrationVariables({
      consultant,
      monthKey: targetMonthKey,
      registrationWindowLabel,
    });

    try {
      const responseBody = await sendResendEmail({
        apiKey,
        fromEmail: DEFAULT_NOTIFICATION_EMAIL_FROM_ADDRESS,
        to: email,
        subject: OFFICE_HOUR_SCHEDULE_REGISTRATION_CONSULTANT_EMAIL_SUBJECT,
        text: renderTemplateString(
          OFFICE_HOUR_SCHEDULE_REGISTRATION_CONSULTANT_EMAIL_TEMPLATE,
          variables
        ),
      });
      sentCount += 1;
      results.push({
        consultantId: consultant.id,
        status: "sent",
        recipient: email,
        deliveryId: normalizeString(responseBody?.id) || null,
      });
    } catch (error) {
      errorCount += 1;
      results.push({
        consultantId: consultant.id,
        status: "error",
        recipient: email,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.info(
    "dispatchConsultantScheduleRegistrationAlerts summary",
    JSON.stringify({
      dateKey,
      targetMonthKey,
      registrationWindowLabel,
      sentCount,
      skippedCount,
      errorCount,
      results,
    })
  );

  return {
    status: "completed",
    dateKey,
    targetMonthKey,
    sentCount,
    skippedCount,
    errorCount,
    results,
  };
}

async function dispatchInternalConsultantAvailabilityReminders(now = new Date()) {
  const weekInfo = regularOfficeHourPolicy.getOfficeHourWeekInfo(now);
  const { dateKey } = getCurrentSeoulDateTimeKeys(now);

  if (!weekInfo || weekInfo.weekOfMonth !== CONSULTANT_SCHEDULE_OPEN_WEEK_NUMBER) {
    return {
      status: "skipped",
      reason: "outside-registration-week",
      dateKey,
    };
  }

  const claimed = await claimNotificationBatchRun(
    "internal-consultant-availability-reminders",
    dateKey
  );
  if (!claimed) {
    return {
      status: "skipped",
      reason: "already-sent-today",
      dateKey,
    };
  }

  const token = normalizeString(SLACK_BOT_TOKEN.value());
  if (!token) {
    return {
      status: "skipped",
      reason: "slack-token-missing",
      dateKey,
    };
  }

  const channelId = normalizeSlackChannelId(INTERNAL_CONSULTANT_NOTICE_SLACK_CHANNEL_ID);
  if (!channelId) {
    return {
      status: "skipped",
      reason: "invalid-slack-channel-id",
      dateKey,
    };
  }

  const monthKey = regularOfficeHourPolicy.getNextMonthKey(now);
  const consultantsSnap = await db.collection("consultants").where("status", "==", "active").get();
  const normalizedConsultants = consultantsSnap.docs.map((doc) => normalizeConsultantDoc(doc));
  const internalConsultants = normalizedConsultants.filter(
    (consultant) => normalizeString(consultant.scope) === "internal"
  );
  const skippedMissingScopeCount = normalizedConsultants.filter(
    (consultant) => !normalizeString(consultant.scope)
  ).length;
  const missingConsultants = internalConsultants
    .filter((consultant) => !consultant.monthlyAvailabilityMeta?.[monthKey])
    .map((consultant) => ({
      id: consultant.id,
      name: normalizeString(consultant.name) || "이름 미입력",
      email: normalizeString(consultant.email),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  const text = buildInternalConsultantAvailabilityAlertText({
    monthKey,
    missingConsultants,
    totalConsultantCount: internalConsultants.length,
    skippedMissingScopeCount,
  });
  const result = await sendSlackChannelMessage({
    token,
    channelId,
    text,
  });

  const summary = {
    status: "completed",
    dateKey,
    monthKey,
    totalInternalConsultantCount: internalConsultants.length,
    submittedCount: Math.max(internalConsultants.length - missingConsultants.length, 0),
    missingCount: missingConsultants.length,
    skippedMissingScopeCount,
    channel: normalizeString(result.channel) || null,
    ts: normalizeString(result.ts) || null,
  };
  console.info(
    "dispatchInternalConsultantAvailabilityReminders summary",
    JSON.stringify(summary)
  );
  return summary;
}

async function dispatchInternalConsultantAvailabilitySubmittedNotification({
  consultant,
  monthKey,
  monthlyAvailability = [],
}) {
  const token = normalizeString(SLACK_BOT_TOKEN.value());
  const channelId = normalizeSlackChannelId(INTERNAL_CONSULTANT_NOTICE_SLACK_CHANNEL_ID);
  if (!token || !channelId) {
    return {
      status: "skipped",
      reason: !token ? "slack-token-missing" : "invalid-slack-channel-id",
    };
  }

  const consultantName = normalizeString(consultant?.name) || normalizeString(consultant?.id) || "컨설턴트";
  const consultantEmail = normalizeEmail(consultant?.email) || "이메일 미입력";
  const scheduleLines = Array.isArray(monthlyAvailability)
    ? monthlyAvailability
        .map((day) => {
          const dateKey = normalizeString(day?.dateKey);
          const availableTimes = Array.isArray(day?.slots)
            ? day.slots
                .filter((slot) => slot?.available === true)
                .map((slot) => normalizeTimeKey(slot.start))
                .filter(Boolean)
            : [];
          const date = parseDateKey(dateKey);
          if (!date || availableTimes.length === 0) {
            return "";
          }
          const dateParts = new Intl.DateTimeFormat("ko-KR", {
            timeZone: "Asia/Seoul",
            month: "long",
            day: "numeric",
            weekday: "short",
          }).formatToParts(date);
          const monthText = dateParts.find((part) => part.type === "month")?.value || "";
          const dayText = dateParts.find((part) => part.type === "day")?.value || "";
          const weekday = dateParts.find((part) => part.type === "weekday")?.value || "";
          return `  - ${monthText} ${dayText}일(${weekday}): ${availableTimes.join(", ")}`;
        })
        .filter(Boolean)
    : [];
  const text = [
    `${buildConsultantTargetMonthLabel(monthKey)} 일정등록 완료`,
    `- 컨설턴트: ${consultantName} <${consultantEmail}>`,
    `- 등록 시간:`,
    ...(scheduleLines.length > 0 ? scheduleLines : ["  - 등록된 가능 시간이 없습니다."]),
    `- 등록 시각: ${formatSeoulDateLabel(new Date())}`,
  ].join("\n");

  const result = await sendSlackChannelMessage({
    token,
    channelId,
    text,
  });

  return {
    status: "sent",
    channel: normalizeString(result.channel) || null,
    ts: normalizeString(result.ts) || null,
  };
}

function summarizeMonthlyAvailability(availability) {
  if (!Array.isArray(availability)) {
    return {
      activeDateCount: 0,
      availableSlotCount: 0,
    };
  }

  return availability.reduce(
    (acc, day) => {
      if (!Array.isArray(day?.slots)) {
        return acc;
      }

      const availableSlotCount = day.slots.filter((slot) => slot?.available === true).length;
      return {
        activeDateCount: acc.activeDateCount + (availableSlotCount > 0 ? 1 : 0),
        availableSlotCount: acc.availableSlotCount + availableSlotCount,
      };
    },
    {
      activeDateCount: 0,
      availableSlotCount: 0,
    }
  );
}

async function dispatchCompanyOfficeHourApplicationAlerts(now = new Date()) {
  const { dateKey } = getCurrentSeoulDateTimeKeys(now);
  const applicationWindow = regularOfficeHourPolicy.getCompanyApplicationWindow(now);

  if (
    !applicationWindow ||
    !regularOfficeHourPolicy.shouldDispatchCompanyApplicationAlert(now)
  ) {
    return {
      status: "skipped",
      reason: "outside-application-week",
      dateKey,
    };
  }

  const claimed = await claimNotificationBatchRun(
    "company-office-hour-application-alerts",
    dateKey
  );
  if (!claimed) {
    return {
      status: "skipped",
      reason: "already-sent-today",
      dateKey,
    };
  }

  const apiKey = normalizeString(RESEND_API_KEY.value());
  if (!apiKey) {
    return {
      status: "skipped",
      reason: "resend-not-configured",
      dateKey,
    };
  }

  const applicationScheduleLabel = buildSeoulWeekRangeLabel(
    applicationWindow.startDate,
    applicationWindow.endDate
  );
  const companiesSnap = await db.collection("companies").get();

  let sentCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const results = [];

  for (const companySnap of companiesSnap.docs) {
    const company = companySnap.data() || {};
    const companyId = companySnap.id;
    if (company.active === false) {
      skippedCount += 1;
      results.push({ companyId, status: "skipped", reason: "company-inactive" });
      continue;
    }
    const programIds = normalizeStringArray(company.programs);
    if (programIds.length === 0) {
      skippedCount += 1;
      results.push({ companyId, status: "skipped", reason: "company-programs-empty" });
      continue;
    }

    const ownerUid = normalizeString(company.ownerUid);
    if (!ownerUid) {
      skippedCount += 1;
      results.push({ companyId, status: "skipped", reason: "company-owner-missing" });
      continue;
    }

    const profileSnap = await db.collection("profiles").doc(ownerUid).get();
    const profile = profileSnap.data() || {};
    if (profile.active === false || normalizeString(profile.role) !== "company") {
      skippedCount += 1;
      results.push({ companyId, status: "skipped", reason: "company-profile-inactive" });
      continue;
    }
    const email = normalizeEmail(profile.email);
    if (!email) {
      skippedCount += 1;
      results.push({ companyId, status: "skipped", reason: "company-email-missing" });
      continue;
    }

    const variables = buildCompanyApplicationAlertVariables({
      companyName: normalizeString(company.name) || "기업",
      applicationScheduleLabel,
    });

    try {
      const responseBody = await sendResendEmail({
        apiKey,
        fromEmail: DEFAULT_NOTIFICATION_EMAIL_FROM_ADDRESS,
        to: email,
        subject: OFFICE_HOUR_APPLICATION_ALERT_COMPANY_EMAIL_SUBJECT,
        text: renderTemplateString(
          OFFICE_HOUR_APPLICATION_ALERT_COMPANY_EMAIL_TEMPLATE,
          variables
        ),
      });
      sentCount += 1;
      results.push({
        companyId,
        status: "sent",
        recipient: email,
        deliveryId: normalizeString(responseBody?.id) || null,
      });
    } catch (error) {
      errorCount += 1;
      results.push({
        companyId,
        status: "error",
        recipient: email,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.info(
    "dispatchCompanyOfficeHourApplicationAlerts summary",
    JSON.stringify({
      dateKey,
      targetMonthKey: applicationWindow.targetMonthKey,
      applicationWindowKind: applicationWindow.kind,
      applicationScheduleLabel,
      sentCount,
      skippedCount,
      errorCount,
      results,
    })
  );

  return {
    status: "completed",
    dateKey,
    targetMonthKey: applicationWindow.targetMonthKey,
    applicationWindowKind: applicationWindow.kind,
    applicationScheduleLabel,
    sentCount,
    skippedCount,
    errorCount,
    results,
  };
}

async function claimOfficeHourReportReminderDispatch(applicationId, todayDateKey) {
  return db.runTransaction(async (transaction) => {
    const applicationRef = db.collection("officeHourApplications").doc(applicationId);
    const applicationSnap = await transaction.get(applicationRef);
    if (!applicationSnap.exists) {
      return { ok: false, reason: "application-not-found" };
    }

    const application = applicationSnap.data() || {};
    const reminderState = application.notificationState?.reportReminder || {};
    if (normalizeString(reminderState.sentDateKey)) {
      return { ok: false, reason: "already-sent" };
    }
    if (normalizeString(reminderState.dispatchDateKey) === todayDateKey) {
      return { ok: false, reason: "already-dispatching-today" };
    }

    transaction.set(
      applicationRef,
      {
        notificationState: {
          reportReminder: {
            status: "dispatching",
            dispatchDateKey: todayDateKey,
            dispatchRequestedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            lastError: FieldValue.delete(),
          },
        },
      },
      { merge: true }
    );

    return { ok: true };
  });
}

async function dispatchOfficeHourReportReminderNotifications(applicationId) {
  try {
    const context = await loadOfficeHourApplicationNotificationContext(applicationId);
    if (!context) {
      return {
        ok: false,
        status: "skipped",
        reason: "application-not-found",
      };
    }

    const consultantScope = normalizeString(context.consultantDoc?.scope);
    const consultantEmail =
      normalizeEmail(context.consultantDoc?.email) ||
      normalizeEmail(context.consultantDoc?.secondaryEmail) ||
      normalizeEmail(context.consultantEmail);
    const consultantSlackTarget = resolveConsultantSlackDmTarget(context.consultantDoc);
    const variables = buildReportReminderVariables(context);
    const channels = {
      consultantEmail: {
        status: "skipped",
        reason: consultantScope === "external" ? "not-attempted" : "consultant-scope-not-external",
      },
      consultantSlackDm: {
        status: "skipped",
        reason: consultantScope === "internal" ? "not-attempted" : "consultant-scope-not-internal",
      },
    };
    const tasks = [];

    if (consultantScope === "external") {
      tasks.push((async () => {
        if (!consultantEmail) {
          channels.consultantEmail = {
            status: "skipped",
            reason: "consultant-email-missing",
          };
          return;
        }
        const apiKey = normalizeString(RESEND_API_KEY.value());
        if (!apiKey) {
          channels.consultantEmail = {
            status: "skipped",
            reason: "resend-not-configured",
          };
          return;
        }

        const responseBody = await sendResendEmail({
          apiKey,
          fromEmail: DEFAULT_NOTIFICATION_EMAIL_FROM_ADDRESS,
          to: consultantEmail,
          subject: OFFICE_HOUR_REPORT_REMINDER_CONSULTANT_EMAIL_SUBJECT,
          text: renderTemplateString(
            OFFICE_HOUR_REPORT_REMINDER_CONSULTANT_EMAIL_TEMPLATE,
            variables
          ),
        });

        channels.consultantEmail = {
          status: "sent",
          recipient: consultantEmail,
          deliveryId: normalizeString(responseBody?.id) || null,
        };
      })().catch((error) => {
        channels.consultantEmail = {
          status: "error",
          recipient: consultantEmail || null,
          message: error instanceof Error ? error.message : String(error),
        };
      }));
    }

    if (consultantScope === "internal") {
      tasks.push((async () => {
        const token = normalizeString(SLACK_BOT_TOKEN.value());
        if (!token || !consultantSlackTarget) {
          channels.consultantSlackDm = {
            status: "skipped",
            reason: !token ? "slack-token-missing" : "consultant-slack-user-id-missing",
          };
          return;
        }

        const text = renderTemplateString(OFFICE_HOUR_REPORT_REMINDER_INTERNAL_SLACK_TEMPLATE, variables);
        const result = consultantSlackTarget.startsWith("D")
          ? await sendSlackChannelMessage({
              token,
              channelId: consultantSlackTarget,
              text,
            })
          : await sendSlackDirectMessage({
              token,
              userId: consultantSlackTarget,
              text,
            });

        channels.consultantSlackDm = {
          status: "sent",
          userId: consultantSlackTarget,
          channel: normalizeString(result.channel) || null,
          ts: normalizeString(result.ts) || null,
        };
      })().catch((error) => {
        channels.consultantSlackDm = {
          status: "error",
          userId: consultantSlackTarget || null,
          message: error instanceof Error ? error.message : String(error),
        };
      }));
    }

    await Promise.all(tasks);

    return {
      ok: true,
      status: "completed",
      consultantScope: consultantScope || null,
      channels,
    };
  } catch (error) {
    console.error("dispatchOfficeHourReportReminderNotifications failed", {
      applicationId,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : null,
    });
    return {
      ok: false,
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runOfficeHourReportReminderDispatchCore(now = new Date()) {
  const { dateKey } = getCurrentSeoulDateTimeKeys(now);
  const claimed = await claimNotificationBatchRun("office-hour-report-reminders", dateKey);
  if (!claimed) {
    return {
      dateKey,
      status: "skipped",
      reason: "already-ran-today",
    };
  }

  const thresholdDate = parseDateKey(dateKey);
  if (!thresholdDate) {
    throw new Error(`Invalid Seoul date key: ${dateKey}`);
  }
  const reminderThresholdDate = addDaysToDate(thresholdDate, -7);
  const reminderThresholdDateKey = regularOfficeHourPolicy.formatDateKey(reminderThresholdDate);

  const [applicationsSnap, reportsSnap] = await Promise.all([
    db.collection("officeHourApplications").where("scheduledDate", "<=", reminderThresholdDateKey).get(),
    db.collection("reports").get(),
  ]);
  const reportedApplicationIds = new Set(
    reportsSnap.docs.map((doc) => normalizeString(doc.data()?.applicationId)).filter(Boolean)
  );

  let sentCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const results = [];

  for (const applicationSnap of applicationsSnap.docs) {
    const applicationId = applicationSnap.id;
    const application = applicationSnap.data() || {};

    if (!ACTIVE_APPLICATION_STATUSES.has(normalizeApplicationStatus(application.status))) {
      skippedCount += 1;
      results.push({ applicationId, status: "skipped", reason: "application-not-active" });
      continue;
    }
    if (reportedApplicationIds.has(applicationId)) {
      skippedCount += 1;
      results.push({ applicationId, status: "skipped", reason: "report-already-submitted" });
      continue;
    }

    const claim = await claimOfficeHourReportReminderDispatch(applicationId, dateKey);
    if (!claim.ok) {
      skippedCount += 1;
      results.push({ applicationId, status: "skipped", reason: claim.reason });
      continue;
    }

    const dispatchResult = await dispatchOfficeHourReportReminderNotifications(applicationId);
    if (dispatchResult.ok) {
      sentCount += 1;
      await writeOfficeHourReportReminderState(applicationId, {
        status: "completed",
        dispatchDateKey: dateKey,
        sentDateKey: dateKey,
        channels: dispatchResult.channels,
        message: "",
        sentAt: FieldValue.serverTimestamp(),
      });
      results.push({ applicationId, status: "completed" });
      continue;
    }

    errorCount += 1;
    await writeOfficeHourReportReminderState(applicationId, {
      status: "error",
      dispatchDateKey: dateKey,
      channels: dispatchResult.channels || null,
      message: dispatchResult.message || "unknown-error",
    });
    results.push({
      applicationId,
      status: "error",
      message: dispatchResult.message || "unknown-error",
    });
  }

  console.info(
    "runOfficeHourReportReminderDispatchCore summary",
    JSON.stringify({
      dateKey,
      reminderThresholdDateKey,
      sentCount,
      skippedCount,
      errorCount,
      results,
    })
  );

  return {
    dateKey,
    reminderThresholdDateKey,
    sentCount,
    skippedCount,
    errorCount,
    results,
  };
}

async function dispatchRegularApplicationConfirmationNotifications(applicationId) {
  try {
    const context = await loadRegularApplicationNotificationContext(applicationId);
    if (!context) {
      return {
        ok: false,
        status: "skipped",
        reason: "application-not-found",
      };
    }

    const consultantScope = normalizeString(context.consultantDoc?.scope);
    const consultantEmail =
      normalizeEmail(context.consultantDoc?.email) ||
      normalizeEmail(context.consultantDoc?.secondaryEmail) ||
      normalizeEmail(context.consultantEmail);
    const consultantSlackTarget = resolveConsultantSlackDmTarget(context.consultantDoc);
    const companyEmail = normalizeEmail(context.companyEmail);
    const companyPhone = normalizePhoneNumber(context.companyInfoDoc?.basic?.ceo?.phone);
    const variables = buildRegularApplicationNotificationVariables(context);
    const companyBiztalkMsgIdx = buildBiztalkMessageIndex("ohc", applicationId);

    const channels = {
      consultantEmail: {
        status: "skipped",
        reason:
          consultantScope === "external" || consultantScope === "internal"
            ? "not-attempted"
            : "consultant-scope-not-supported",
      },
      consultantSlackDm: {
        status: "skipped",
        reason: consultantScope === "internal" ? "not-attempted" : "consultant-scope-not-internal",
      },
      companyEmail: {
        status: "skipped",
        reason: "not-attempted",
      },
      companyBiztalk: {
        status: "skipped",
        reason: "not-attempted",
      },
    };

    const tasks = [];

    if (consultantScope === "external" || consultantScope === "internal") {
      tasks.push((async () => {
        if (!consultantEmail) {
          channels.consultantEmail = {
            status: "skipped",
            reason: "consultant-email-missing",
          };
          return;
        }

        const apiKey = normalizeString(RESEND_API_KEY.value());
        if (!apiKey) {
          channels.consultantEmail = {
            status: "skipped",
            reason: "resend-not-configured",
          };
          return;
        }

        const responseBody = await sendResendEmail({
          apiKey,
          fromEmail: DEFAULT_NOTIFICATION_EMAIL_FROM_ADDRESS,
          to: consultantEmail,
          subject: OFFICE_HOUR_CONFIRMED_CONSULTANT_EMAIL_SUBJECT,
          text: renderTemplateString(
            OFFICE_HOUR_CONFIRMED_CONSULTANT_EMAIL_TEMPLATE,
            variables
          ),
        });

        channels.consultantEmail = {
          status: "sent",
          recipient: consultantEmail,
          deliveryId: normalizeString(responseBody?.id) || null,
        };
      })().catch((error) => {
        channels.consultantEmail = {
          status: "error",
          recipient: consultantEmail || null,
          message: error instanceof Error ? error.message : String(error),
        };
      }));
    }

    if (consultantScope === "internal") {
      tasks.push((async () => {
        const token = normalizeString(SLACK_BOT_TOKEN.value());
        if (!token || !consultantSlackTarget) {
          channels.consultantSlackDm = {
            status: "skipped",
            reason: !token ? "slack-token-missing" : "consultant-slack-user-id-missing",
          };
          return;
        }

        const text = renderTemplateString(OFFICE_HOUR_CONFIRMED_INTERNAL_SLACK_TEMPLATE, variables);
        const result = consultantSlackTarget.startsWith("D")
          ? await sendSlackChannelMessage({
              token,
              channelId: consultantSlackTarget,
              text,
            })
          : await sendSlackDirectMessage({
              token,
              userId: consultantSlackTarget,
              text,
            });

        channels.consultantSlackDm = {
          status: "sent",
          userId: consultantSlackTarget,
          channel: normalizeString(result.channel) || null,
          ts: normalizeString(result.ts) || null,
        };
      })().catch((error) => {
        channels.consultantSlackDm = {
          status: "error",
          userId: consultantSlackTarget || null,
          message: error instanceof Error ? error.message : String(error),
        };
      }));
    }

    tasks.push((async () => {
      if (!companyEmail) {
        channels.companyEmail = {
          status: "skipped",
          reason: "company-email-missing",
        };
        return;
      }

      const apiKey = normalizeString(RESEND_API_KEY.value());
      if (!apiKey) {
        channels.companyEmail = {
          status: "skipped",
          reason: "resend-not-configured",
        };
        return;
      }

      const responseBody = await sendResendEmail({
        apiKey,
        fromEmail: DEFAULT_NOTIFICATION_EMAIL_FROM_ADDRESS,
        to: companyEmail,
        subject: OFFICE_HOUR_CONFIRMED_COMPANY_EMAIL_SUBJECT,
        text: renderTemplateString(
          OFFICE_HOUR_CONFIRMED_COMPANY_EMAIL_TEMPLATE,
          variables
        ),
      });

      channels.companyEmail = {
        status: "sent",
        recipient: companyEmail,
        deliveryId: normalizeString(responseBody?.id) || null,
      };
    })().catch((error) => {
      channels.companyEmail = {
        status: "error",
        recipient: companyEmail || null,
        message: error instanceof Error ? error.message : String(error),
      };
    }));

    tasks.push((async () => {
      if (!companyPhone) {
        channels.companyBiztalk = {
          status: "skipped",
          reason: "company-phone-missing",
          msgIdx: companyBiztalkMsgIdx,
        };
        return;
      }

      if (!getBiztalkDispatchConfig()) {
        channels.companyBiztalk = {
          status: "skipped",
          reason: "biztalk-not-configured",
          msgIdx: companyBiztalkMsgIdx,
        };
        return;
      }

      const title = renderTemplateString(
        OFFICE_HOUR_CONFIRMED_BIZTALK_TITLE_TEMPLATE,
        variables
      );
      const message = renderTemplateString(
        OFFICE_HOUR_CONFIRMED_BIZTALK_MESSAGE_TEMPLATE,
        variables
      );
      const result = await callBiztalkDispatch("/dispatch/alimtalk", {
        callerProjectId: FIREBASE_PROJECT_ID,
        dryRun: false,
        recipient: companyPhone,
        message,
        msgIdx: companyBiztalkMsgIdx,
        title,
        tmpltCode: OFFICE_HOUR_CONFIRMED_BIZTALK_TEMPLATE_CODE,
        attach: OFFICE_HOUR_CONFIRMED_BIZTALK_ATTACH,
      });

      channels.companyBiztalk = {
        status: "sent",
        recipient: companyPhone,
        msgIdx: companyBiztalkMsgIdx,
        templateCode: OFFICE_HOUR_CONFIRMED_BIZTALK_TEMPLATE_CODE,
        title,
        message,
        targetUrl: normalizeString(result?.targetUrl) || null,
        dispatchOk: typeof result?.ok === "boolean" ? result.ok : null,
        upstreamStatus: Number.isFinite(result?.upstreamStatus) ? result.upstreamStatus : null,
        responseCode:
          normalizeString(
            result?.upstreamBody?.responseCode || result?.code || result?.responseCode
          ) || null,
        upstreamResponseCount: Array.isArray(result?.upstreamBody?.response)
          ? result.upstreamBody.response.length
          : null,
        upstreamBody: isPlainObject(result?.upstreamBody) ? result.upstreamBody : result?.upstreamBody || null,
      };
    })().catch((error) => {
      channels.companyBiztalk = {
        status: "error",
        recipient: companyPhone || null,
        msgIdx: companyBiztalkMsgIdx,
        templateCode: OFFICE_HOUR_CONFIRMED_BIZTALK_TEMPLATE_CODE,
        message: error instanceof Error ? error.message : String(error),
      };
    }));

    await Promise.all(tasks);

    return {
      ok: true,
      status: "completed",
      consultantScope: consultantScope || null,
      channels,
    };
  } catch (error) {
    console.error("dispatchRegularApplicationConfirmationNotifications failed", {
      applicationId,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : null,
    });
    return {
      ok: false,
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function dispatchRegularApplicationRejectionNotifications(applicationId, rejectionReason) {
  try {
    const context = await loadRegularApplicationNotificationContext(applicationId);
    if (!context) {
      return {
        ok: false,
        status: "skipped",
        reason: "application-not-found",
      };
    }

    const companyEmail = normalizeEmail(context.companyEmail);
    const variables = buildRejectionNotificationVariables(context, rejectionReason);
    const channels = {
      companyEmail: {
        status: "skipped",
        reason: "not-attempted",
      },
    };

    const apiKey = normalizeString(RESEND_API_KEY.value());
    if (!apiKey) {
      channels.companyEmail = {
        status: "skipped",
        reason: "resend-not-configured",
      };

      return {
        ok: false,
        status: "skipped",
        reason: "resend-not-configured",
        channels,
      };
    }

    if (!companyEmail) {
      channels.companyEmail = {
        status: "skipped",
        reason: "company-email-missing",
      };

      return {
        ok: false,
        status: "skipped",
        reason: "company-email-missing",
        channels,
      };
    }

    const responseBody = await sendResendEmail({
      apiKey,
      fromEmail: DEFAULT_NOTIFICATION_EMAIL_FROM_ADDRESS,
      to: companyEmail,
      subject: OFFICE_HOUR_REJECTED_COMPANY_EMAIL_SUBJECT,
      text: renderTemplateString(OFFICE_HOUR_REJECTED_COMPANY_EMAIL_TEMPLATE, variables),
    });

    channels.companyEmail = {
      status: "sent",
      recipient: companyEmail,
      deliveryId: normalizeString(responseBody?.id) || null,
    };

    return {
      ok: true,
      status: "completed",
      channels,
    };
  } catch (error) {
    console.error("dispatchRegularApplicationRejectionNotifications failed", {
      applicationId,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : null,
    });
    return {
      ok: false,
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function dispatchRegularApplicationCancellationNotifications(applicationId, cancellationReason) {
  try {
    const context = await loadRegularApplicationNotificationContext(applicationId);
    if (!context) {
      return {
        ok: false,
        status: "skipped",
        reason: "application-not-found",
      };
    }

    const consultantEmail =
      normalizeEmail(context.consultantEmail) || normalizeEmail(context.application?.consultantEmail);
    if (!consultantEmail) {
      return {
        ok: false,
        status: "skipped",
        reason: "consultant-email-missing",
      };
    }

    const apiKey = normalizeString(RESEND_API_KEY.value());
    if (!apiKey) {
      return {
        ok: false,
        status: "skipped",
        reason: "resend-not-configured",
      };
    }

    const variables = buildCancellationNotificationVariables(context, cancellationReason);
    const responseBody = await sendResendEmail({
      apiKey,
      fromEmail: DEFAULT_NOTIFICATION_EMAIL_FROM_ADDRESS,
      to: consultantEmail,
      subject: OFFICE_HOUR_CANCELLED_CONSULTANT_EMAIL_SUBJECT,
      text: renderTemplateString(OFFICE_HOUR_CANCELLED_CONSULTANT_EMAIL_TEMPLATE, variables),
    });

    return {
      ok: true,
      status: "completed",
      deliveryId: normalizeString(responseBody?.id) || null,
    };
  } catch (error) {
    console.error("dispatchRegularApplicationCancellationNotifications failed", {
      applicationId,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : null,
    });
    return {
      ok: false,
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function sanitizeConsentRecord(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const version = normalizeString(value.version);
  const method = normalizeString(value.method);
  const sanitized = {
    consented: value.consented === true,
    version: version || "v1.0",
    method: method || "unknown",
    userAgent: normalizeString(value.userAgent) || null,
  };

  if (value.consentedAt) {
    sanitized.consentedAt = value.consentedAt;
  }

  return sanitized;
}

function sanitizeConsentSnapshot(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const terms = sanitizeConsentRecord(value.terms);
  const privacy = sanitizeConsentRecord(value.privacy);
  const marketing = sanitizeConsentRecord(value.marketing);
  const serviceNotifications = sanitizeConsentRecord(value.serviceNotifications);

  if (!terms && !privacy && !marketing && !serviceNotifications) {
    return null;
  }

  return {
    ...(terms ? { terms } : {}),
    ...(privacy ? { privacy } : {}),
    ...(marketing ? { marketing } : {}),
    ...(serviceNotifications ? { serviceNotifications } : {}),
  };
}

function normalizeTimeKey(value) {
  const trimmed = normalizeString(value);
  if (!trimmed) return "";
  const [hourRaw, minuteRaw] = trimmed.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return trimmed;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getCurrentSeoulDateTimeKeys(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    timeKey: `${values.hour}:${values.minute}`,
  };
}

function isPastScheduledStart(dateKey, timeKey, now = new Date()) {
  const normalizedDate = normalizeString(dateKey);
  const normalizedTime = normalizeTimeKey(timeKey);
  if (!normalizedDate || !normalizedTime) return true;
  const { dateKey: currentDateKey, timeKey: currentTimeKey } = getCurrentSeoulDateTimeKeys(now);
  if (normalizedDate < currentDateKey) return true;
  if (normalizedDate > currentDateKey) return false;
  return normalizedTime < currentTimeKey;
}

function normalizeConsultantDisplayName(value) {
  const normalized = normalizeString(value).replace(/\s*컨설턴트\s*$/u, "").toLowerCase();
  if (normalized === "담당자 배정 중" || normalized === "담당자 배정중") {
    return "";
  }
  return normalized;
}

function sanitizeAiPayload(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAiPayload(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeAiPayload(item)])
    );
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }
  return null;
}

function toNumber(value) {
  const digits = normalizeString(value).replace(/[^\d]/g, "");
  if (!digits) return null;
  return Number(digits);
}

function toDecimalNumber(value) {
  const normalized = normalizeString(value).replace(/,/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) return null;
  return Math.round(parsed * 10) / 10;
}

function toNonNegativeInteger(value, fallback = 0) {
  if (value === undefined) return fallback;
  const parsed =
    typeof value === "number" && Number.isFinite(value) ? value : toNumber(value);
  if (parsed == null || !Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function toIsoDate(value) {
  const digits = normalizeString(value).replace(/[^\d]/g, "").slice(0, 8);
  if (digits.length !== 8) return normalizeString(value);
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function toTargetCountries(value) {
  return normalizeString(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function toPendingCompanyForm(value) {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_COMPANY_FORM };
  }

  const source = value;
  return {
    ...DEFAULT_COMPANY_FORM,
    companyType: normalizeString(source.companyType) || DEFAULT_COMPANY_FORM.companyType,
    companyInfo: normalizeString(source.companyInfo),
    representativeSolution: normalizeString(source.representativeSolution),
    sdgPriority1: normalizeString(source.sdgPriority1),
    sdgPriority2: normalizeString(source.sdgPriority2),
    ceoName: normalizeString(source.ceoName),
    ceoEmail: normalizeString(source.ceoEmail),
    ceoPhone: normalizeString(source.ceoPhone),
    ceoAge: normalizeString(source.ceoAge),
    ceoGender: normalizeString(source.ceoGender),
    ceoNationality: normalizeString(source.ceoNationality),
    hasCoRepresentative: normalizeString(source.hasCoRepresentative),
    coRepresentativeName: normalizeString(source.coRepresentativeName),
    coRepresentativeBirthDate: normalizeString(source.coRepresentativeBirthDate),
    coRepresentativeGender: normalizeString(source.coRepresentativeGender),
    coRepresentativeTitle: normalizeString(source.coRepresentativeTitle),
    founderSerialNumber: normalizeString(source.founderSerialNumber),
    website: normalizeString(source.website),
    foundedAt: normalizeString(source.foundedAt),
    businessNumber: normalizeString(source.businessNumber),
    primaryBusiness: normalizeString(source.primaryBusiness),
    primaryIndustry: normalizeString(source.primaryIndustry),
    headOffice: normalizeString(source.headOffice),
    branchOffice: normalizeString(source.branchOffice),
    targetCountries: normalizeString(source.targetCountries),
    workforceFullTime: normalizeString(source.workforceFullTime),
    workforceContract: normalizeString(source.workforceContract),
    revenue2025: normalizeString(source.revenue2025),
    revenue2026: normalizeString(source.revenue2026),
    capitalTotal: normalizeString(source.capitalTotal),
    certification: normalizeString(source.certification),
    tipsLipsHistory: normalizeString(source.tipsLipsHistory),
    exportVoucherHeld: normalizeString(source.exportVoucherHeld),
    exportVoucherAmount: normalizeString(source.exportVoucherAmount),
    exportVoucherUsageRate: normalizeString(source.exportVoucherUsageRate),
    innovationVoucherHeld: normalizeString(source.innovationVoucherHeld),
    innovationVoucherAmount: normalizeString(source.innovationVoucherAmount),
    innovationVoucherUsageRate: normalizeString(source.innovationVoucherUsageRate),
    myscExpectation: normalizeString(source.myscExpectation),
    desiredInvestment2026: normalizeString(source.desiredInvestment2026),
    desiredPreValue: normalizeString(source.desiredPreValue),
  };
}

function toPendingInvestmentRows(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    stage: normalizeString(item?.stage),
    date: normalizeString(item?.date),
    postMoney: normalizeString(item?.postMoney),
    majorShareholder: normalizeString(item?.majorShareholder),
  }));
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(values.map((value) => normalizeString(value)).filter(Boolean))
  );
}

async function assertManagedCompanyEditor(uid, companyId) {
  const [profileSnap, companySnap] = await Promise.all([
    db.collection("profiles").doc(uid).get(),
    db.collection("companies").doc(companyId).get(),
  ]);

  if (!profileSnap.exists) {
    throw new HttpsError("permission-denied", "프로필을 찾을 수 없습니다.");
  }
  if (!companySnap.exists) {
    throw new HttpsError("not-found", "회사를 찾을 수 없습니다.");
  }

  const profile = profileSnap.data() || {};
  const company = companySnap.data() || {};
  const role = normalizeApprovalRole(profile.role, "");
  const isActive = profile.active !== false;

  if (!isActive || (role !== "admin" && role !== "consultant")) {
    throw new HttpsError("permission-denied", "기업 정보를 수정할 권한이 없습니다.");
  }

  const companyProgramIds = normalizeStringArray(company.programs);
  if (companyProgramIds.length === 0) {
    throw new HttpsError("permission-denied", "담당 사업에 연결된 기업만 수정할 수 있습니다.");
  }

  const programSnaps = await Promise.all(
    companyProgramIds.map((programId) => db.collection("programs").doc(programId).get())
  );
  const hasManagedProgram = programSnaps.some((programSnap) => {
    if (!programSnap.exists) return false;
    return normalizeString(programSnap.data()?.managerUid) === uid;
  });

  if (!hasManagedProgram) {
    throw new HttpsError("permission-denied", "담당 기업만 수정할 수 있습니다.");
  }

  return { company };
}

function getAffectedProgramIds(currentProgramIds, nextProgramIds) {
  return Array.from(
    new Set([
      ...normalizeStringArray(currentProgramIds),
      ...normalizeStringArray(nextProgramIds),
    ])
  );
}

async function loadProgramDocsForSyncInTransaction(transaction, programIds) {
  if (!Array.isArray(programIds) || programIds.length === 0) {
    return new Map();
  }

  const programRefs = programIds.map((programId) => db.collection("programs").doc(programId));
  const programSnaps = await Promise.all(programRefs.map((ref) => transaction.get(ref)));
  const programDataById = new Map();

  programSnaps.forEach((programSnap, index) => {
    const programId = programIds[index];
    programDataById.set(programId, programSnap.exists ? programSnap.data() || {} : {});
  });

  return programDataById;
}

function syncCompanyProgramsInTransaction(transaction, params) {
  const companyId = normalizeString(params.companyId);
  const ownerUid = normalizeString(params.ownerUid);
  const currentProgramIds = normalizeStringArray(params.currentProgramIds);
  const nextProgramIds = normalizeStringArray(params.nextProgramIds);
  const affectedProgramIds = getAffectedProgramIds(currentProgramIds, nextProgramIds);

  if (!companyId || affectedProgramIds.length === 0) {
    return;
  }

  const aliases = Array.from(new Set([companyId, ownerUid].filter(Boolean)));
  const programDataById =
    params.programDataById instanceof Map ? params.programDataById : new Map();

  affectedProgramIds.forEach((programId) => {
    const programRef = db.collection("programs").doc(programId);
    const programData = programDataById.get(programId) || {};
    const currentCompanyIds = normalizeStringArray(programData.companyIds);
    const nextCompanyIds = currentCompanyIds.filter((value) => !aliases.includes(value));

    if (nextProgramIds.includes(programId)) {
      nextCompanyIds.push(companyId);
    }

    transaction.set(
      programRef,
      {
        companyIds: normalizeStringArray(nextCompanyIds),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

exports.notifySlackOnSignupRequestCreated = onDocumentCreated(
  {
    document: "signupRequests/{userId}",
    region: REGION,
    secrets: [SLACK_SIGNUP_REQUEST_WEBHOOK_URL],
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      console.error("notifySlackOnSignupRequestCreated missing snapshot", {
        eventId: event.id,
        userId: event.params?.userId || null,
      });
      return;
    }

    const signupRequest = snapshot.data() || {};
    const userId = normalizeString(event.params?.userId) || snapshot.id;
    const status = normalizeString(signupRequest.status) || "pending";

    if (status !== "pending") {
      console.warn("Skipping signup request Slack notification for non-pending request", {
        eventId: event.id,
        userId,
        status,
      });
      return;
    }

    const webhookUrl = normalizeString(SLACK_SIGNUP_REQUEST_WEBHOOK_URL.value());
    if (!webhookUrl) {
      console.error("SLACK_SIGNUP_REQUEST_WEBHOOK_URL is not configured", {
        eventId: event.id,
        userId,
      });
      return;
    }

    const payload = buildSignupRequestSlackPayload(signupRequest);
    await postSlackWebhook(webhookUrl, payload);
  }
);

exports.runBiztalkStageCheck = onCall(
  {
    region: REGION,
    timeoutSeconds: 30,
    memory: "256MiB",
    secrets: [BIZTALK_DISPATCH_URL, BIZTALK_DISPATCH_TOKEN],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    if (!isStageProject() && !isLiveProject()) {
      throw new HttpsError("failed-precondition", "BizTalk 점검은 stage 또는 live 프로젝트에서만 실행할 수 있습니다.");
    }

    const uid = request.auth.uid;
    const profileSnap = await db.collection("profiles").doc(uid).get();
    const role = normalizeString(profileSnap.data()?.role);
    if (!["admin", "staff"].includes(role)) {
      throw new HttpsError("permission-denied", "BizTalk 점검 권한이 없습니다.");
    }

    const mode = normalizeString(request.data?.mode) || "health";
    const dryRun = request.data?.dryRun === true;

    try {
      switch (mode) {
        case "health":
          return await callBiztalkDispatch("/health", {
            projectId: FIREBASE_PROJECT_ID,
          });
        case "outbound-ip":
          return await callBiztalkDispatch("/probe/outbound-ip", {
            projectId: FIREBASE_PROJECT_ID,
          });
        case "auth-token":
          return await callBiztalkDispatch("/probe/auth-token", {
            projectId: FIREBASE_PROJECT_ID,
          });
        case "dispatch-raw":
          return await callBiztalkDispatch("/dispatch/raw", {
            callerProjectId: FIREBASE_PROJECT_ID,
            dryRun,
            payload: isPlainObject(request.data?.payload) ? request.data.payload : {},
            headers: normalizeStringRecord(request.data?.headers),
            query: normalizeStringRecord(request.data?.query),
            recipients: normalizePhoneNumberArray(request.data?.recipients),
          });
        default:
          throw new HttpsError("invalid-argument", "지원하지 않는 BizTalk 점검 모드입니다.");
      }
    } catch (error) {
      console.error("runBiztalkStageCheck failed", {
        uid,
        mode,
        dryRun,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : null,
      });
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", "BizTalk 점검 호출에 실패했습니다.");
    }
  }
);

exports.sendBiztalkTestAlimtalk = onCall(
  {
    region: REGION,
    timeoutSeconds: 60,
    memory: "256MiB",
    secrets: [BIZTALK_DISPATCH_URL, BIZTALK_DISPATCH_TOKEN],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    if (!isStageProject() && !isLiveProject()) {
      throw new HttpsError("failed-precondition", "BizTalk 테스트 발송은 stage 또는 live 프로젝트에서만 실행할 수 있습니다.");
    }

    const uid = request.auth.uid;
    const profileSnap = await db.collection("profiles").doc(uid).get();
    const role = normalizeString(profileSnap.data()?.role);
    if (!["admin", "staff"].includes(role)) {
      throw new HttpsError("permission-denied", "BizTalk 테스트 발송 권한이 없습니다.");
    }

    const recipient = normalizePhoneNumber(request.data?.recipient);
    const message = typeof request.data?.message === "string" ? request.data.message.trim() : "";
    const msgIdx = normalizeString(request.data?.msgIdx);
    const title = normalizeString(request.data?.title);
    const tmpltCode = normalizeString(request.data?.tmpltCode);
    const senderKey = normalizeString(request.data?.senderKey);
    const attach =
      request.data?.attach && typeof request.data.attach === "object" ? request.data.attach : undefined;
    const dryRun = request.data?.dryRun !== false;

    if (!recipient) {
      throw new HttpsError("invalid-argument", "recipient is required.");
    }
    if (!message) {
      throw new HttpsError("invalid-argument", "message is required.");
    }

    try {
      return await callBiztalkDispatch("/dispatch/alimtalk", {
        callerProjectId: FIREBASE_PROJECT_ID,
        dryRun,
        recipient,
        message,
        ...(msgIdx ? { msgIdx } : {}),
        ...(title ? { title } : {}),
        ...(tmpltCode ? { tmpltCode } : {}),
        ...(senderKey ? { senderKey } : {}),
        ...(attach ? { attach } : {}),
      });
    } catch (error) {
      console.error("sendBiztalkTestAlimtalk failed", {
        uid,
        dryRun,
        recipient,
        hasMsgIdx: Boolean(msgIdx),
        hasTitle: Boolean(title),
        hasSenderKey: Boolean(senderKey),
        hasTemplateCode: Boolean(tmpltCode),
        hasAttach: Boolean(attach),
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : null,
      });
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", "BizTalk 테스트 발송에 실패했습니다.");
    }
  }
);

exports.queryBiztalkAlimtalkResults = onCall(
  {
    region: REGION,
    timeoutSeconds: 60,
    memory: "256MiB",
    secrets: [BIZTALK_DISPATCH_URL, BIZTALK_DISPATCH_TOKEN],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    if (!isStageProject() && !isLiveProject()) {
      throw new HttpsError("failed-precondition", "BizTalk 결과 조회는 stage 또는 live 프로젝트에서만 실행할 수 있습니다.");
    }

    const uid = request.auth.uid;
    const profileSnap = await db.collection("profiles").doc(uid).get();
    const role = normalizeString(profileSnap.data()?.role);
    if (!["admin", "staff"].includes(role)) {
      throw new HttpsError("permission-denied", "BizTalk 결과 조회 권한이 없습니다.");
    }

    const dryRun = request.data?.dryRun === true;
    const method = normalizeString(request.data?.method || "POST").toUpperCase();
    const payload = isPlainObject(request.data?.payload) ? request.data.payload : {};
    const query = normalizeStringRecord(request.data?.query);

    try {
      return await callBiztalkDispatch("/results/alimtalk", {
        callerProjectId: FIREBASE_PROJECT_ID,
        dryRun,
        method,
        payload,
        query,
      });
    } catch (error) {
      console.error("queryBiztalkAlimtalkResults failed", {
        uid,
        dryRun,
        method,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : null,
      });
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", "BizTalk 결과 조회에 실패했습니다.");
    }
  }
);

exports.sendStageTestEmail = onCall(
  {
    region: REGION,
    timeoutSeconds: 60,
    memory: "256MiB",
    secrets: [RESEND_API_KEY],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    if (!isStageProject() && !isLiveProject()) {
      throw new HttpsError("failed-precondition", "이메일 테스트 발송은 stage 또는 live 프로젝트에서만 실행할 수 있습니다.");
    }

    const uid = request.auth.uid;
    const profileSnap = await db.collection("profiles").doc(uid).get();
    const role = normalizeString(profileSnap.data()?.role);
    if (!["admin", "staff", "consultant"].includes(role)) {
      throw new HttpsError("permission-denied", "이메일 테스트 발송 권한이 없습니다.");
    }

    const apiKey = normalizeString(RESEND_API_KEY.value());
    if (!apiKey) {
      throw new HttpsError("failed-precondition", "RESEND_API_KEY is not configured.");
    }

    const fromEmail = normalizeEmail(request.data?.fromEmail);
    const replyTo = normalizeEmail(request.data?.replyTo);
    const recipients = normalizeEmailArray(request.data?.recipients);
    const subject = normalizeString(request.data?.subject);
    const text = typeof request.data?.text === "string" ? request.data.text.trim() : "";
    const html = typeof request.data?.html === "string" ? request.data.html.trim() : "";

    if (!fromEmail) {
      throw new HttpsError("invalid-argument", "fromEmail is required.");
    }
    if (recipients.length === 0) {
      throw new HttpsError("invalid-argument", "At least one recipient is required.");
    }
    if (!subject) {
      throw new HttpsError("invalid-argument", "subject is required.");
    }
    if (!text && !html) {
      throw new HttpsError("invalid-argument", "Either text or html is required.");
    }

    try {
      const deliveries = [];
      for (const to of recipients) {
        const responseBody = await sendResendEmail({
          apiKey,
          fromEmail,
          replyTo,
          to,
          subject,
          text,
          html,
        });
        deliveries.push({
          to,
          id: normalizeString(responseBody?.id) || null,
        });
      }

      return {
        ok: true,
        sentCount: deliveries.length,
        deliveries,
      };
    } catch (error) {
      console.error("sendStageTestEmail failed", {
        uid,
        recipients,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : null,
      });
      throw new HttpsError(
        "internal",
        error instanceof Error ? error.message : "이메일 테스트 발송에 실패했습니다."
      );
    }
  }
);

exports.sendStageSlackDmTest = onCall(
  {
    region: REGION,
    timeoutSeconds: 60,
    memory: "256MiB",
    secrets: [SLACK_BOT_TOKEN],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    if (!isStageProject()) {
      throw new HttpsError("failed-precondition", "Slack DM 테스트는 stage 프로젝트에서만 실행할 수 있습니다.");
    }

    const uid = request.auth.uid;
    const profileSnap = await db.collection("profiles").doc(uid).get();
    const role = normalizeString(profileSnap.data()?.role);
    if (!["admin", "staff", "consultant"].includes(role)) {
      throw new HttpsError("permission-denied", "Slack DM 테스트 권한이 없습니다.");
    }

    const token = normalizeString(SLACK_BOT_TOKEN.value());
    if (!token) {
      throw new HttpsError("failed-precondition", "SLACK_BOT_TOKEN is not configured.");
    }

    const userId = normalizeSlackMemberId(request.data?.userId);
    const text = normalizeString(request.data?.text);
    if (!userId) {
      throw new HttpsError("invalid-argument", "A valid Slack user ID is required.");
    }
    if (!text) {
      throw new HttpsError("invalid-argument", "text is required.");
    }

    try {
      const result = await sendSlackDirectMessage({
        token,
        userId,
        text,
      });

      return {
        ok: true,
        channel: normalizeString(result.channel) || null,
        ts: normalizeString(result.ts) || null,
      };
    } catch (error) {
      console.error("sendStageSlackDmTest failed", {
        uid,
        userId,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : null,
      });
      throw new HttpsError(
        "internal",
        error instanceof Error ? error.message : "Slack DM 테스트 발송에 실패했습니다."
      );
    }
  }
);

exports.sendStageSlackChannelAvailabilityTest = onCall(
  {
    region: REGION,
    timeoutSeconds: 60,
    memory: "256MiB",
    secrets: [SLACK_BOT_TOKEN],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    if (!isStageProject()) {
      throw new HttpsError("failed-precondition", "Slack 채널 테스트는 stage 프로젝트에서만 실행할 수 있습니다.");
    }

    const uid = request.auth.uid;
    const profileSnap = await db.collection("profiles").doc(uid).get();
    const role = normalizeString(profileSnap.data()?.role);
    if (!["admin", "staff", "consultant"].includes(role)) {
      throw new HttpsError("permission-denied", "Slack 채널 테스트 권한이 없습니다.");
    }

    const token = normalizeString(SLACK_BOT_TOKEN.value());
    if (!token) {
      throw new HttpsError("failed-precondition", "SLACK_BOT_TOKEN is not configured.");
    }

    const channelId = normalizeSlackChannelId(request.data?.channelId);
    const monthKey = normalizeString(request.data?.monthKey);
    if (!channelId) {
      throw new HttpsError("invalid-argument", "A valid Slack channel ID is required.");
    }
    if (!regularOfficeHourPolicy.isMonthKey(monthKey)) {
      throw new HttpsError("invalid-argument", "A valid monthKey (YYYY-MM) is required.");
    }

    try {
      const consultantsSnap = await db
        .collection("consultants")
        .where("status", "==", "active")
        .get();

      const normalizedConsultants = consultantsSnap.docs.map((doc) => normalizeConsultantDoc(doc));
      const skippedMissingScopeCount = normalizedConsultants.filter(
        (consultant) => !normalizeString(consultant.scope)
      ).length;
      const missingConsultants = normalizedConsultants
        .filter((consultant) => normalizeString(consultant.scope) === "internal")
        .filter((consultant) => !consultant.monthlyAvailabilityMeta?.[monthKey])
        .map((consultant) => ({
          id: consultant.id,
          name: normalizeString(consultant.name) || "이름 미입력",
          email: normalizeString(consultant.email),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "ko"));

      const text = buildStageSlackAvailabilityAlertText({
        monthKey,
        missingConsultants,
        totalConsultantCount: normalizedConsultants.filter(
          (consultant) => normalizeString(consultant.scope) === "internal"
        ).length,
        skippedMissingScopeCount,
      });

      const result = await sendSlackChannelMessage({
        token,
        channelId,
        text,
      });

      return {
        ok: true,
        channel: normalizeString(result.channel) || null,
        ts: normalizeString(result.ts) || null,
        monthKey,
        totalConsultantCount: normalizedConsultants.filter(
          (consultant) => normalizeString(consultant.scope) === "internal"
        ).length,
        missingCount: missingConsultants.length,
        missingConsultants,
        skippedMissingScopeCount,
      };
    } catch (error) {
      console.error("sendStageSlackChannelAvailabilityTest failed", {
        uid,
        channelId,
        monthKey,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : null,
      });
      throw new HttpsError(
        "internal",
        error instanceof Error ? error.message : "Slack 채널 테스트 발송에 실패했습니다."
      );
    }
  }
);

exports.updateCompanyPrograms = onCall(
  {
    region: REGION,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const uid = request.auth.uid;
    const companyId = normalizeString(request.data?.companyId);
    const companyName = normalizeString(request.data?.companyName) || null;
    const nextProgramIds = normalizeStringArray(request.data?.programIds);

    if (!companyId) {
      throw new HttpsError("invalid-argument", "회사 ID가 필요합니다.");
    }

    const profileRef = db.collection("profiles").doc(uid);
    const companyRef = db.collection("companies").doc(companyId);

    return db.runTransaction(async (transaction) => {
      const [profileSnap, companySnap] = await Promise.all([
        transaction.get(profileRef),
        transaction.get(companyRef),
      ]);

      if (!profileSnap.exists) {
        throw new HttpsError("permission-denied", "프로필을 찾을 수 없습니다.");
      }
      if (!companySnap.exists) {
        throw new HttpsError("not-found", "회사를 찾을 수 없습니다.");
      }

      const profile = profileSnap.data() || {};
      const company = companySnap.data() || {};
      const role = normalizeApprovalRole(profile.role, "");
      const requestedRole = normalizeApprovalRole(profile.requestedRole, "");
      const isAdmin = role === "admin";
      const isActive = profile.active !== false;
      const ownerUid = normalizeString(company.ownerUid);
      const profileCompanyId = normalizeString(profile.companyId);
      const isCompanyMember =
        isActive &&
        (role === "company" || requestedRole === "company") &&
        (profileCompanyId === companyId || ownerUid === uid);

      if (!isAdmin && !isCompanyMember) {
        throw new HttpsError("permission-denied", "참여사업을 변경할 권한이 없습니다.");
      }

      const currentProgramIds = normalizeStringArray(company.programs);
      const affectedProgramIds = getAffectedProgramIds(currentProgramIds, nextProgramIds);
      const programDataById = await loadProgramDocsForSyncInTransaction(
        transaction,
        affectedProgramIds
      );

      transaction.set(
        companyRef,
        {
          ...(companyName !== null ? { name: companyName } : {}),
          programs: nextProgramIds,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      syncCompanyProgramsInTransaction(transaction, {
        companyId,
        ownerUid: ownerUid || uid,
        currentProgramIds,
        nextProgramIds,
        programDataById,
      });

      return {
        companyId,
        programIds: nextProgramIds,
      };
    });
  }
);

exports.saveManagedCompanyInfo = onCall(
  {
    region: REGION,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const companyId = normalizeString(request.data?.companyId);
    const companyInfo = request.data?.companyInfo;
    const saveType = request.data?.saveType === "draft" ? "draft" : "final";

    if (!companyId) {
      throw new HttpsError("invalid-argument", "회사 ID가 필요합니다.");
    }
    if (!companyInfo || typeof companyInfo !== "object" || Array.isArray(companyInfo)) {
      throw new HttpsError("invalid-argument", "기업 정보 payload가 필요합니다.");
    }

    await assertManagedCompanyEditor(request.auth.uid, companyId);

    const companyInfoRef = db.collection("companies").doc(companyId).collection("companyInfo").doc("info");
    const existingInfoSnap = await companyInfoRef.get();
    const existingInfo = existingInfoSnap.exists ? existingInfoSnap.data() || {} : {};
    const existingMetadata =
      existingInfo.metadata && typeof existingInfo.metadata === "object" ? existingInfo.metadata : {};
    const payloadMetadata =
      companyInfo.metadata && typeof companyInfo.metadata === "object" ? companyInfo.metadata : {};
    const nextCompanyName = normalizeString(companyInfo?.basic?.companyInfo) || null;

    await companyInfoRef.set(
      {
        ...companyInfo,
        metadata: {
          ...existingMetadata,
          ...payloadMetadata,
          saveType,
          createdAt: existingMetadata.createdAt || FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedByUid: request.auth.uid,
        },
      },
      { merge: true }
    );

    await db.collection("companies").doc(companyId).set(
      {
        name: nextCompanyName,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      companyId,
      saveType,
    };
  }
);

function buildCompanyInfoRecord(form, investmentRows) {
  return {
    basic: {
      companyType: form.companyType,
      companyInfo: form.companyInfo,
      representativeSolution: form.representativeSolution,
      ceo: {
        name: form.ceoName,
        email: form.ceoEmail,
        phone: form.ceoPhone,
        age: toNumber(form.ceoAge),
        gender: form.ceoGender,
        nationality: form.ceoNationality,
        coRepresentative: {
          enabled: form.hasCoRepresentative === "예",
          name: form.hasCoRepresentative === "예" ? form.coRepresentativeName : "",
          birthDate: form.hasCoRepresentative === "예" ? form.coRepresentativeBirthDate : "",
          gender: form.hasCoRepresentative === "예" ? form.coRepresentativeGender : "",
          title: form.hasCoRepresentative === "예" ? form.coRepresentativeTitle : "",
        },
      },
      founderSerialNumber: toNumber(form.founderSerialNumber),
      website: form.website,
      foundedAt: form.foundedAt,
      businessNumber: form.companyType === "예비창업" ? "" : form.businessNumber,
      primaryBusiness: form.primaryBusiness,
      primaryIndustry: form.primaryIndustry,
    },
    locations: {
      headOffice: form.headOffice,
      branchOrLab: form.branchOffice,
    },
    workforce: {
      fullTime: toNumber(form.workforceFullTime),
      contract: toNumber(form.workforceContract),
    },
    finance: {
      revenue: {
        y2025: toDecimalNumber(form.revenue2025),
        y2026: toDecimalNumber(form.revenue2026),
      },
      capitalTotal: toNumber(form.capitalTotal),
    },
    certifications: {
      designation: form.certification,
      tipsLipsHistory: form.tipsLipsHistory,
    },
    impact: {
      sdgPriority1: form.sdgPriority1,
      sdgPriority2: form.sdgPriority2,
      myscExpectation: form.myscExpectation,
    },
    globalExpansion: {
      targetCountries: toTargetCountries(form.targetCountries),
    },
    investments: (investmentRows ?? []).map((row) => ({
      stage: row.stage,
      date: toIsoDate(row.date),
      postMoney: toDecimalNumber(row.postMoney),
      majorShareholder: row.majorShareholder,
    })),
    vouchers: {
      exportVoucherHeld: form.exportVoucherHeld,
      exportVoucherAmount: form.exportVoucherAmount,
      exportVoucherUsageRate: form.exportVoucherUsageRate,
      innovationVoucherHeld: form.innovationVoucherHeld,
      innovationVoucherAmount: form.innovationVoucherAmount,
      innovationVoucherUsageRate: form.innovationVoucherUsageRate,
    },
    fundingPlan: {
      desiredAmount2026: toDecimalNumber(form.desiredInvestment2026),
      preValue: toDecimalNumber(form.desiredPreValue),
    },
    metadata: {
      updatedAt: FieldValue.serverTimestamp(),
      saveType: "final",
    },
  };
}

function buildDefaultConsultantAvailability() {
  const scheduleDays = [2, 4];
  const timeSlots = Array.from({ length: 9 }, (_, index) => {
    const startHour = 9 + index;
    const endHour = startHour + 1;
    return {
      start: `${String(startHour).padStart(2, "0")}:00`,
      end: `${String(endHour).padStart(2, "0")}:00`,
    };
  });

  return scheduleDays.map((dayOfWeek) => ({
    dayOfWeek,
    slots: timeSlots.map((slot) => ({
      start: slot.start,
      end: slot.end,
      available: false,
    })),
  }));
}

function buildDefaultConsultantAvailabilityForDays(scheduleDays, dateKeys = []) {
  const timeSlots = Array.from({ length: 9 }, (_, index) => {
    const startHour = 9 + index;
    const endHour = startHour + 1;
    return {
      start: `${String(startHour).padStart(2, "0")}:00`,
      end: `${String(endHour).padStart(2, "0")}:00`,
    };
  });

  if (Array.isArray(dateKeys) && dateKeys.length > 0) {
    return dateKeys.map((dateKey) => {
      const parsedDate = regularOfficeHourPolicy.parseDateKey(dateKey);
      return {
        dayOfWeek: parsedDate ? parsedDate.getDay() : 0,
        dateKey,
        slots: timeSlots.map((slot) => ({
          start: slot.start,
          end: slot.end,
          available: false,
        })),
      };
    });
  }

  return scheduleDays.map((dayOfWeek) => ({
    dayOfWeek,
    slots: timeSlots.map((slot) => ({
      start: slot.start,
      end: slot.end,
      available: false,
    })),
  }));
}

function buildDefaultConsultantMonthlyAvailability() {
  return buildDefaultConsultantAvailabilityForDays(regularOfficeHourPolicy.ALL_DAY_NUMBERS);
}

function buildDefaultConsultantMonthlyAvailabilityForMonth(monthKey) {
  const regularDateKeys = regularOfficeHourPolicy.getRegularOfficeHourDateKeysForDayNumbers(
    monthKey,
    regularOfficeHourPolicy.ALL_DAY_NUMBERS
  );
  return buildDefaultConsultantAvailabilityForDays(
    regularOfficeHourPolicy.ALL_DAY_NUMBERS,
    regularDateKeys
  );
}

function sanitizeConsultantAvailabilityWithDefaults(value, defaults, useDateKeyMatching = false) {
  if (!Array.isArray(value) || value.length === 0) {
    return defaults;
  }

  return defaults.map((defaultDay) => {
    const matchedDay = value.find((item) => {
      if (useDateKeyMatching && isDateKey(defaultDay?.dateKey)) {
        return normalizeString(item?.dateKey) === defaultDay.dateKey;
      }
      return item?.dayOfWeek === defaultDay.dayOfWeek;
    });
    if (!matchedDay || !Array.isArray(matchedDay.slots)) {
      return defaultDay;
    }

    return {
      dayOfWeek: defaultDay.dayOfWeek,
      ...(isDateKey(defaultDay.dateKey) ? { dateKey: defaultDay.dateKey } : {}),
      slots: defaultDay.slots.map((defaultSlot) => {
        const matchedSlot = matchedDay.slots.find(
          (slot) =>
            normalizeTimeKey(slot?.start) === defaultSlot.start &&
            normalizeTimeKey(slot?.end) === defaultSlot.end
        );

        return matchedSlot
          ? {
              start: defaultSlot.start,
              end: defaultSlot.end,
              available: matchedSlot.available === true,
            }
          : defaultSlot;
      }),
    };
  });
}

function sanitizeConsultantAvailability(value) {
  return sanitizeConsultantAvailabilityWithDefaults(value, buildDefaultConsultantAvailability());
}

function sanitizeConsultantMonthlyAvailability(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([monthKey]) => regularOfficeHourPolicy.isMonthKey(monthKey))
      .map(([monthKey, availability]) => [
        monthKey,
        (() => {
          const defaults = buildDefaultConsultantMonthlyAvailabilityForMonth(monthKey);
          return sanitizeConsultantAvailabilityWithDefaults(
            availability,
            defaults,
            true
          );
        })(),
      ])
  );
}

function sanitizeConsultantMonthlyAvailabilityForScope(value, scope) {
  const scopeDayNumbers = scope ? regularOfficeHourPolicy.getScopeDayNumbers(scope) : null;
  if (!Array.isArray(scopeDayNumbers) || scopeDayNumbers.length === 0) {
    return sanitizeConsultantMonthlyAvailability(value);
  }

  const normalizedMonthMap = sanitizeConsultantMonthlyAvailability(value);
  return Object.fromEntries(
    Object.entries(normalizedMonthMap).map(([monthKey, availability]) => {
      if (!Array.isArray(availability)) {
        return [monthKey, []];
      }

      const allowedDateKeys = new Set(
        regularOfficeHourPolicy.getRegularOfficeHourDateKeysForDayNumbers(monthKey, scopeDayNumbers),
      );

      return [
        monthKey,
        availability.filter((entry) => isDateKey(entry?.dateKey) && allowedDateKeys.has(entry.dateKey)),
      ];
    }),
  );
}

function sanitizeConsultantMonthlyAvailabilityForConsultant(value, consultant) {
  const scope = consultant?.scope === "external" ? "external" : consultant?.scope === "internal" ? "internal" : null;
  return sanitizeConsultantMonthlyAvailabilityForScope(value, scope);
}

function sanitizeConsultantMonthlyAvailabilityMeta(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([monthKey, meta]) => {
        if (!regularOfficeHourPolicy.isMonthKey(monthKey)) {
          return false;
        }
        return meta && typeof meta === "object" && !Array.isArray(meta);
      })
      .map(([monthKey, meta]) => {
        const normalizedSubmittedByUid = normalizeString(meta.submittedByUid);
        return [
          monthKey,
          {
            status: "submitted",
            ...(meta.submittedAt ? { submittedAt: meta.submittedAt } : {}),
            ...(normalizedSubmittedByUid ? { submittedByUid: normalizedSubmittedByUid } : {}),
          },
        ];
      })
  );
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizeString(value));
}

function parseSeoulDateTime(dateKey, timeKey = "00:00") {
  const normalizedDate = normalizeString(dateKey);
  const normalizedTime = normalizeTimeKey(timeKey);
  if (!normalizedDate || !normalizedTime) return null;
  const parsed = new Date(`${normalizedDate}T${normalizedTime}:00+09:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateKey(value) {
  if (!isDateKey(value)) return null;
  // Use midday in Seoul to keep the calendar date stable even when the runtime timezone is UTC.
  return parseSeoulDateTime(value, "12:00");
}

function getProgramWeekdayNumbers(weekdays) {
  const source = Array.isArray(weekdays) && weekdays.length > 0 ? weekdays : ["TUE", "THU"];
  const numbers = [];
  source.forEach((weekday) => {
    if (weekday === "TUE") numbers.push(2);
    if (weekday === "WED") numbers.push(3);
    if (weekday === "THU") numbers.push(4);
  });
  return numbers;
}

function sanitizeProgramWeekdays(value, fallback = ["TUE", "THU"]) {
  const normalized = Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((item) => normalizeString(item))
            .filter((item) => item === "TUE" || item === "WED" || item === "THU")
        )
      )
    : [];
  return normalized.length > 0 ? normalized : fallback;
}

function sanitizeProgramKpiDefinitions(value, fallback = []) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const seenIds = new Set();
  const sanitized = value
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      id: normalizeString(item.id),
      label: normalizeString(item.label),
      description: normalizeString(item.description),
      active: item.active !== false,
    }))
    .filter((item) => item.id && item.label)
    .filter((item) => {
      if (seenIds.has(item.id)) {
        return false;
      }
      seenIds.add(item.id);
      return true;
    });

  return sanitized;
}

function buildRegularOfficeHourTitle(programName) {
  return `${normalizeString(programName) || "사업"} 정기 오피스아워`;
}

function isProgramDateAvailable(programDoc, dateKey) {
  const targetDate = parseDateKey(dateKey);
  const startDate = parseDateKey(normalizeString(programDoc?.periodStart));
  const endDate = parseDateKey(normalizeString(programDoc?.periodEnd));
  if (!targetDate || !startDate || !endDate) {
    return false;
  }
  if (targetDate.getTime() < startDate.getTime() || targetDate.getTime() > endDate.getTime()) {
    return false;
  }
  return regularOfficeHourPolicy.isRegularOfficeHourDateForScope(dateKey);
}

function isProgramRegularOfficeHourDateAvailable(programDoc, agendaScope, dateKey) {
  if (!isProgramDateAvailable(programDoc, dateKey)) {
    return false;
  }
  return regularOfficeHourPolicy.isRegularOfficeHourDateForScope(dateKey, agendaScope);
}

function buildRegularSlotId(programId, consultantId, dateKey, timeKey) {
  return [
    "regular",
    normalizeString(programId),
    normalizeString(consultantId),
    normalizeString(dateKey),
    normalizeTimeKey(timeKey),
  ]
    .join("_")
    .replace(/:/g, "-");
}

function isSessionFormat(value) {
  return value === "online" || value === "offline";
}

function getApplicationDurationHours(application, slotDoc) {
  const raw = Number(application?.duration ?? slotDoc?.duration ?? 1);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

function getSessionStatusTransitionTime(application, slotDoc) {
  const dateKey = normalizeString(application?.scheduledDate || slotDoc?.date);
  const timeKey = normalizeTimeKey(application?.scheduledTime || slotDoc?.startTime);
  if (dateKey && timeKey) {
    return parseSeoulDateTime(dateKey, timeKey);
  }

  if (dateKey) {
    return parseSeoulDateTime(dateKey, "23:59");
  }

  return null;
}

function getSessionEndTime(application, slotDoc) {
  const dateKey = normalizeString(application?.scheduledDate || slotDoc?.date);
  const timeKey = normalizeTimeKey(application?.scheduledTime || slotDoc?.startTime);
  if (dateKey && timeKey) {
    const start = parseSeoulDateTime(dateKey, timeKey);
    if (start) {
      if (slotDoc?.endTime) {
        const end = parseSeoulDateTime(dateKey, slotDoc.endTime);
        if (end) {
          return end;
        }
      }

      const durationHours = getApplicationDurationHours(application, slotDoc);
      return new Date(start.getTime() + durationHours * 60 * 60 * 1000);
    }
  }

  if (dateKey) {
    const fallback = parseSeoulDateTime(dateKey, "23:59");
    if (fallback) {
      return fallback;
    }
  }

  return null;
}

function hasSessionStarted(application, slotDoc, now = new Date()) {
  const transitionTime = getSessionStatusTransitionTime(application, slotDoc);
  return Boolean(transitionTime && now >= transitionTime);
}

function isConsultantAvailableAt(consultant, dateKey, time) {
  if (!isDateKey(dateKey) || !time) return false;
  const targetDate = parseDateKey(dateKey);
  if (!targetDate) return false;
  const dayOfWeek = targetDate.getDay();
  const monthKey = regularOfficeHourPolicy.getMonthKeyFromDateKey(dateKey);
  if (!monthKey) return false;
  const monthlyAvailability = sanitizeConsultantMonthlyAvailability(consultant.monthlyAvailability);
  const availabilityList = Array.isArray(monthlyAvailability[monthKey])
    ? monthlyAvailability[monthKey]
    : buildDefaultConsultantMonthlyAvailabilityForMonth(monthKey);
  const dayAvailability =
    availabilityList.find((item) => normalizeString(item?.dateKey) === dateKey);
  if (!dayAvailability || !Array.isArray(dayAvailability.slots)) return false;
  return dayAvailability.slots.some(
    (slot) => normalizeTimeKey(slot?.start) === time && slot?.available === true
  );
}

function getAgendaScope(agendaDoc) {
  return agendaDoc?.scope === "external" ? "external" : "internal";
}

function getProgramTicketValue(programDoc, companyDoc, scope) {
  const overrides =
    companyDoc?.programTicketOverrides && typeof companyDoc.programTicketOverrides === "object"
      ? companyDoc.programTicketOverrides
      : {};
  const overrideValue = overrides?.[programDoc.id]?.[scope];
  if (typeof overrideValue === "number") {
    return overrideValue;
  }
  if (scope === "internal") {
    return typeof programDoc.internalTicketLimit === "number" ? programDoc.internalTicketLimit : 0;
  }
  return typeof programDoc.externalTicketLimit === "number" ? programDoc.externalTicketLimit : 0;
}

function buildRegularOfficeHourId(programId, scheduledDate) {
  const normalizedProgramId = normalizeString(programId);
  const normalizedDate = normalizeString(scheduledDate);
  if (!normalizedProgramId || !isDateKey(normalizedDate)) {
    return "";
  }
  return `${normalizedProgramId}:unassigned:${normalizedDate.slice(0, 7)}`;
}

function getApplicationProgramId(application) {
  return (
    normalizeString(application?.programId) ||
    normalizeString(application?.officeHourId).split(":")[0] ||
    ""
  );
}

function normalizeConsultantDoc(consultantSnap) {
  const data = consultantSnap.data() || {};
  const scope = data?.scope === "external" ? "external" : data?.scope === "internal" ? "internal" : null;
  return {
    id: consultantSnap.id,
    ...data,
    monthlyAvailability: sanitizeConsultantMonthlyAvailabilityForScope(
      data.monthlyAvailability,
      scope,
    ),
    monthlyAvailabilityMeta: sanitizeConsultantMonthlyAvailabilityMeta(data.monthlyAvailabilityMeta),
  };
}

async function getFutureConfirmedApplicationsForConsultant(consultant) {
  const consultantId = normalizeString(consultant?.id);
  const consultantName = normalizeString(consultant?.name);
  const queries = [];

  if (consultantId) {
    queries.push(
      db.collection("officeHourApplications").where("consultantId", "==", consultantId).where("status", "==", "confirmed").get()
    );
  }
  if (consultantName) {
    queries.push(
      db.collection("officeHourApplications").where("consultant", "==", consultantName).where("status", "==", "confirmed").get()
    );
  }

  const snapshots = await Promise.all(queries);
  const deduped = new Map();

  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((doc) => {
      if (!deduped.has(doc.id)) {
        deduped.set(doc.id, {
          id: doc.id,
          ...(doc.data() || {}),
        });
      }
    });
  });

  return Array.from(deduped.values()).filter((application) => {
    if (normalizeApplicationStatus(application.status) !== "confirmed") {
      return false;
    }
    return !hasSessionStarted(application, null);
  });
}

async function assertConsultantSchedulingChangeAllowed(params) {
  const { currentConsultant, nextConsultant } = params;
  const futureConfirmedApplications = await getFutureConfirmedApplicationsForConsultant(currentConsultant);

  if (futureConfirmedApplications.length === 0) {
    return;
  }

  if (normalizeString(nextConsultant?.status || "active") !== "active") {
    throw new HttpsError(
      "failed-precondition",
      "확정된 일정이 있는 컨설턴트는 비활성화할 수 없습니다."
    );
  }

  const hasAvailabilityConflict = futureConfirmedApplications.some((application) => {
    const scheduledDate = normalizeString(application?.scheduledDate);
    const scheduledTime = normalizeTimeKey(application?.scheduledTime);
    if (!scheduledDate || !scheduledTime) {
      return false;
    }
    return !isConsultantAvailableAt(nextConsultant, scheduledDate, scheduledTime);
  });

  if (hasAvailabilityConflict) {
    throw new HttpsError(
      "failed-precondition",
      "확정된 일정이 있는 시간은 제거할 수 없습니다."
    );
  }
}

async function syncConsultantSchedulingCore(params) {
  const {
    consultantId,
    actorUid,
    actorRole,
    authEmail,
    authDisplayName,
    monthlyAvailability,
    monthlyAvailabilityMeta,
    agendaIds,
    status,
  } = params;

  const consultantRef = db.collection("consultants").doc(consultantId);
  const profileRef = db.collection("profiles").doc(consultantId);

  const [consultantSnap, profileSnap] = await Promise.all([
    consultantRef.get(),
    profileRef.get(),
  ]);

  if (!consultantSnap.exists && !(actorRole === "consultant" && actorUid === consultantId)) {
    throw new HttpsError("not-found", "컨설턴트 정보를 찾을 수 없습니다.");
  }

  const currentConsultant = consultantSnap.exists
    ? normalizeConsultantDoc(consultantSnap)
    : {
        id: consultantId,
        name: normalizeString(authDisplayName) || normalizeString(authEmail).split("@")[0] || "컨설턴트",
        title: "컨설턴트",
        email: authEmail || `${consultantId}@pending.local`,
        expertise: [],
        bio: `${normalizeString(authDisplayName) || "컨설턴트"} 컨설턴트`,
        status: "active",
        agendaIds: [],
        availability: buildDefaultConsultantAvailability(),
        monthlyAvailability: {},
        monthlyAvailabilityMeta: {},
      };

  const nextStatus =
    status === undefined
      ? normalizeString(currentConsultant.status || "active") || "active"
      : (status === "inactive" ? "inactive" : "active");
  const nextAgendaIds =
    agendaIds === undefined ? normalizeStringArray(currentConsultant.agendaIds) : normalizeStringArray(agendaIds);
  const nextMonthlyAvailability =
    monthlyAvailability === undefined
      ? sanitizeConsultantMonthlyAvailabilityForConsultant(
          currentConsultant.monthlyAvailability,
          currentConsultant
        )
      : sanitizeConsultantMonthlyAvailabilityForConsultant(monthlyAvailability, currentConsultant);
  const currentMonthlyAvailabilityMeta = sanitizeConsultantMonthlyAvailabilityMeta(
    currentConsultant.monthlyAvailabilityMeta
  );
  const providedMonthlyAvailabilityMeta =
    monthlyAvailabilityMeta === undefined
      ? undefined
      : sanitizeConsultantMonthlyAvailabilityMeta(monthlyAvailabilityMeta);
  const nextMonthlyAvailabilityMeta =
    providedMonthlyAvailabilityMeta === undefined
      ? currentMonthlyAvailabilityMeta
      : {
          ...currentMonthlyAvailabilityMeta,
          ...Object.fromEntries(
            Object.keys(providedMonthlyAvailabilityMeta).map((monthKey) => [
              monthKey,
              {
                status: "submitted",
                submittedAt: FieldValue.serverTimestamp(),
                submittedByUid: actorUid,
              },
            ])
          ),
        };

  const nextConsultant = {
    ...currentConsultant,
    status: nextStatus,
    agendaIds: nextAgendaIds,
    monthlyAvailability: nextMonthlyAvailability,
    monthlyAvailabilityMeta: nextMonthlyAvailabilityMeta,
  };

  const normalizedCurrentMonthlyAvailability = sanitizeConsultantMonthlyAvailabilityForConsultant(
    currentConsultant.monthlyAvailability,
    currentConsultant
  );

  const changedMonthlyAvailabilityKeys = Array.from(
    new Set([
      ...Object.keys(normalizedCurrentMonthlyAvailability),
      ...Object.keys(nextMonthlyAvailability),
    ])
  ).filter((monthKey) => {
    const currentValue = JSON.stringify(normalizedCurrentMonthlyAvailability[monthKey] ?? []);
    const nextValue = JSON.stringify(nextMonthlyAvailability[monthKey] ?? []);
    return currentValue !== nextValue;
  });
  const notificationMonthKeys =
    providedMonthlyAvailabilityMeta === undefined
      ? []
      : Object.keys(providedMonthlyAvailabilityMeta).filter(
          (monthKey) => !Object.prototype.hasOwnProperty.call(currentMonthlyAvailabilityMeta, monthKey)
        );

  if (changedMonthlyAvailabilityKeys.length > 0) {
    const invalidMonthKey = changedMonthlyAvailabilityKeys.find(
      (monthKey) => !regularOfficeHourPolicy.canConsultantEditMonthlyAvailability(monthKey, new Date())
    );
    if (invalidMonthKey) {
      throw new HttpsError(
      "failed-precondition",
        `컨설턴트 가능 시간은 매월 ${CONSULTANT_SCHEDULE_OPEN_WEEK_NUMBER}주차에 다음 달 일정만 수정할 수 있습니다.`
      );
    }
  }

  await assertConsultantSchedulingChangeAllowed({
    currentConsultant,
    nextConsultant,
  });

  const operations = [];
  const { id: _consultantDocId, ...consultantDocData } = currentConsultant;
  operations.push({
    type: "set",
    ref: consultantRef,
    data: {
      ...consultantDocData,
      status: nextStatus,
      agendaIds: nextAgendaIds,
      monthlyAvailability: nextMonthlyAvailability,
      monthlyAvailabilityMeta: nextMonthlyAvailabilityMeta,
      updatedAt: FieldValue.serverTimestamp(),
      ...(consultantSnap.exists
        ? {}
        : {
            name: normalizeString(currentConsultant.name) || "컨설턴트",
            title: normalizeString(currentConsultant.title) || "컨설턴트",
            email: normalizeString(currentConsultant.email) || `${consultantId}@pending.local`,
            expertise: Array.isArray(currentConsultant.expertise) ? currentConsultant.expertise : [],
            bio: normalizeString(currentConsultant.bio) || "컨설턴트",
            joinedDate: FieldValue.serverTimestamp(),
          }),
    },
    merge: true,
  });

  if (status !== undefined && profileSnap.exists) {
    operations.push({
      type: "set",
      ref: profileRef,
      data: {
        active: nextStatus === "active",
        updatedAt: FieldValue.serverTimestamp(),
      },
      merge: true,
    });
  }

  if (agendaIds !== undefined) {
    const currentAgendaIds = normalizeStringArray(currentConsultant.agendaIds);
    const impactedAgendaIds = Array.from(new Set([...currentAgendaIds, ...nextAgendaIds]));

    if (impactedAgendaIds.length > 0) {
      const agendaSnaps = await Promise.all(
        impactedAgendaIds.map((agendaId) => db.collection("agendas").doc(agendaId).get())
      );

      agendaSnaps.forEach((agendaSnap) => {
        if (!agendaSnap.exists) return;

        const currentPriorityIds = normalizeStringArray(agendaSnap.data()?.priorityConsultantIds);
        const hasConsultant = nextAgendaIds.includes(agendaSnap.id);
        const nextPriorityIds = hasConsultant
          ? currentPriorityIds.includes(consultantId)
            ? currentPriorityIds
            : [...currentPriorityIds, consultantId]
          : currentPriorityIds.filter((id) => id !== consultantId);

        if (JSON.stringify(nextPriorityIds) === JSON.stringify(currentPriorityIds)) {
          return;
        }

        operations.push({
          type: "set",
          ref: agendaSnap.ref,
          data: {
            priorityConsultantIds: nextPriorityIds,
            updatedAt: FieldValue.serverTimestamp(),
          },
          merge: true,
        });
      });
    }
  }

  for (let index = 0; index < operations.length; index += 500) {
    const batch = db.batch();
    operations.slice(index, index + 500).forEach((operation) => {
      batch.set(operation.ref, operation.data, { merge: operation.merge === true });
    });
    await batch.commit();
  }

  if (
    normalizeString(currentConsultant.scope) === "internal" &&
    notificationMonthKeys.length > 0
  ) {
    for (const monthKey of notificationMonthKeys) {
      try {
        const notificationResult = await dispatchInternalConsultantAvailabilitySubmittedNotification({
          consultant: currentConsultant,
          monthKey,
          monthlyAvailability: nextMonthlyAvailability[monthKey],
        });
        console.info(
          "dispatchInternalConsultantAvailabilitySubmittedNotification summary",
          JSON.stringify({
            consultantId,
            monthKey,
            notificationResult,
          })
        );
      } catch (error) {
        console.error("dispatchInternalConsultantAvailabilitySubmittedNotification failed", {
          consultantId,
          monthKey,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : null,
        });
      }
    }
  }

  return {
    consultantId,
    status: nextStatus,
    agendaIds: nextAgendaIds,
    slotCount: 0,
    closedSlotCount: 0,
  };
}

async function syncProgramDefinitionCore(params) {
  const { programId, patch } = params;
  const programRef = db.collection("programs").doc(programId);

  const [programSnap, applicationSnap] = await Promise.all([
    programRef.get(),
    db.collection("officeHourApplications").where("programId", "==", programId).get(),
  ]);

  if (!programSnap.exists) {
    throw new HttpsError("not-found", "사업 정보를 찾을 수 없습니다.");
  }

  const currentProgram = {
    id: programSnap.id,
    ...(programSnap.data() || {}),
  };
  const nextName =
    patch.name === undefined
      ? normalizeString(currentProgram.name) || "사업"
      : normalizeString(patch.name) || normalizeString(currentProgram.name) || "사업";
  const nextDescription =
    patch.description === undefined
      ? normalizeString(currentProgram.description) || `${nextName} 사업`
      : normalizeString(patch.description) || `${nextName} 사업`;
  const nextInternalTicketLimit = toNonNegativeInteger(
    patch.internalTicketLimit,
    toNonNegativeInteger(currentProgram.internalTicketLimit, 0)
  );
  const nextExternalTicketLimit = toNonNegativeInteger(
    patch.externalTicketLimit,
    toNonNegativeInteger(currentProgram.externalTicketLimit, 0)
  );
  const nextProgram = {
    ...currentProgram,
    ...patch,
    name: nextName,
    description: nextDescription,
    targetHours: toNonNegativeInteger(patch.targetHours, toNonNegativeInteger(currentProgram.targetHours, 0)),
    completedHours: toNonNegativeInteger(
      patch.completedHours,
      toNonNegativeInteger(currentProgram.completedHours, 0)
    ),
    maxApplications: toNonNegativeInteger(
      patch.maxApplications,
      nextInternalTicketLimit + nextExternalTicketLimit
    ),
    usedApplications: toNonNegativeInteger(
      patch.usedApplications,
      toNonNegativeInteger(currentProgram.usedApplications, 0)
    ),
    internalTicketLimit: nextInternalTicketLimit,
    externalTicketLimit: nextExternalTicketLimit,
    companyLimit: toNonNegativeInteger(
      patch.companyLimit,
      toNonNegativeInteger(currentProgram.companyLimit, 0)
    ),
    allowedAgendaIds:
      patch.allowedAgendaIds === undefined
        ? normalizeStringArray(currentProgram.allowedAgendaIds)
        : normalizeStringArray(patch.allowedAgendaIds),
    managerUid:
      patch.managerUid === undefined
        ? normalizeString(currentProgram.managerUid) || null
        : normalizeString(patch.managerUid) || null,
    periodStart:
      patch.periodStart === undefined ? normalizeString(currentProgram.periodStart) || undefined : normalizeString(patch.periodStart) || undefined,
    periodEnd:
      patch.periodEnd === undefined ? normalizeString(currentProgram.periodEnd) || undefined : normalizeString(patch.periodEnd) || undefined,
    weekdays:
      patch.weekdays === undefined
        ? sanitizeProgramWeekdays(currentProgram.weekdays)
        : sanitizeProgramWeekdays(patch.weekdays, sanitizeProgramWeekdays(currentProgram.weekdays)),
    kpiDefinitions:
      patch.kpiDefinitions === undefined
        ? sanitizeProgramKpiDefinitions(currentProgram.kpiDefinitions)
        : sanitizeProgramKpiDefinitions(
            patch.kpiDefinitions,
            sanitizeProgramKpiDefinitions(currentProgram.kpiDefinitions)
          ),
  };

  const regularApplications = applicationSnap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
    .filter((application) => normalizeString(application?.type || "regular") === "regular");
  const baseTitle = buildRegularOfficeHourTitle(nextProgram.name);

  const operations = [];
  const { id: _programDocId, ...programDocData } = nextProgram;
  operations.push({
    ref: programRef,
    data: {
      ...programDocData,
      updatedAt: FieldValue.serverTimestamp(),
    },
  });

  regularApplications.forEach((application) => {
    operations.push({
      ref: db.collection("officeHourApplications").doc(application.id),
      data: {
        officeHourTitle: baseTitle,
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
  });

  for (let index = 0; index < operations.length; index += 500) {
    const batch = db.batch();
    operations.slice(index, index + 500).forEach((operation) => {
      batch.set(operation.ref, operation.data, { merge: true });
    });
    await batch.commit();
  }

  return {
    programId,
    slotCount: 0,
    closedSlotCount: 0,
    applicationCount: regularApplications.length,
  };
}

function isApplicationAssignedToConsultant(application, consultant) {
  if (normalizeString(application?.consultantId) === consultant.id) {
    return true;
  }
  if (getApplicationPendingConsultantIds(application).includes(consultant.id)) {
    return true;
  }

  const assignedName = normalizeConsultantDisplayName(application?.consultant);
  const consultantName = normalizeConsultantDisplayName(consultant?.name);
  return assignedName !== "" && consultantName !== "" && assignedName === consultantName;
}

function getApplicationPendingConsultantIds(application) {
  const explicitPendingIds = Array.isArray(application?.pendingConsultantIds)
    ? application.pendingConsultantIds
        .map((value) => normalizeString(value))
        .filter(Boolean)
    : [];
  return Array.from(new Set(explicitPendingIds)).sort();
}

function sortConsultantsByAgendaPriority(consultants, agendaDoc) {
  const priorityIds = normalizeStringArray(agendaDoc?.priorityConsultantIds);
  if (priorityIds.length === 0) {
    throw new HttpsError(
      "failed-precondition",
      `${normalizeString(agendaDoc?.name) || "선택한"} 아젠다의 담당 컨설턴트 우선순위가 설정되지 않았습니다.`
    );
  }

  const normalizedConsultantIds = Array.from(
    new Set(consultants.map((consultant) => normalizeString(consultant?.id)).filter(Boolean))
  );
  const missingPriorityIds = normalizedConsultantIds.filter(
    (consultantId) => !priorityIds.includes(consultantId)
  );
  if (missingPriorityIds.length > 0) {
    throw new HttpsError(
      "failed-precondition",
      `${normalizeString(agendaDoc?.name) || "선택한"} 아젠다의 담당 컨설턴트 우선순위 설정이 누락되었습니다.`
    );
  }

  const consultantById = new Map(consultants.map((consultant) => [consultant.id, consultant]));
  return priorityIds
    .map((consultantId) => consultantById.get(consultantId))
    .filter(Boolean);
}

function getManualReopenPendingConsultantIds(application, preferredConsultantId = "") {
  const explicitPendingIds = getApplicationPendingConsultantIds(application);
  if (explicitPendingIds.length > 0) {
    return explicitPendingIds;
  }

  const normalizedPreferredConsultantId = normalizeString(preferredConsultantId);
  if (normalizedPreferredConsultantId) {
    return [normalizedPreferredConsultantId];
  }

  const consultantId = normalizeString(application?.consultantId);
  if (consultantId) {
    return [consultantId];
  }

  return [];
}

function isApplicationBlockingConsultantAtSameTime(application, consultant, agendaId = "") {
  const normalizedStatus = normalizeApplicationStatus(application?.status);
  if (!ACTIVE_APPLICATION_STATUSES.has(normalizedStatus)) {
    return false;
  }

  const pendingConsultantIds = getApplicationPendingConsultantIds(application);
  if (normalizedStatus === "pending" && pendingConsultantIds.length > 0) {
    return pendingConsultantIds.includes(consultant.id);
  }

  const consultantId = normalizeString(application?.consultantId);
  if (consultantId) {
    return consultantId === consultant.id;
  }
  const consultantNameKey = normalizeConsultantDisplayName(consultant?.name);
  return (
    consultantNameKey !== "" &&
    normalizeConsultantDisplayName(application?.consultant) === consultantNameKey
  );
}

async function consultantCanHandleApplication(transaction, consultant, application) {
  const consultantAgendaIds = Array.isArray(consultant?.agendaIds)
    ? consultant.agendaIds.map((item) => normalizeString(item)).filter(Boolean)
    : [];
  if (consultantAgendaIds.length === 0) {
    return false;
  }

  const agendaId = normalizeString(application?.agendaId);
  if (agendaId && consultantAgendaIds.includes(agendaId)) {
    return true;
  }

  const agendaName = normalizeString(application?.agenda).toLowerCase();
  if (!agendaName) {
    return false;
  }

  const agendaRefs = consultantAgendaIds.map((id) => db.collection("agendas").doc(id));
  const agendaSnaps = await Promise.all(agendaRefs.map((ref) => transaction.get(ref)));

  return agendaSnaps.some((snap) => {
    if (!snap.exists) return false;
    return normalizeString(snap.data()?.name).toLowerCase() === agendaName;
  });
}

async function hasConsultantScheduleConflict(transaction, consultant, application, excludedApplicationId) {
  const scheduledDate = normalizeString(application?.scheduledDate);
  const scheduledTime = normalizeTimeKey(application?.scheduledTime);
  if (!scheduledDate || !scheduledTime) {
    return false;
  }

  const sameTimeQuery = db
    .collection("officeHourApplications")
    .where("scheduledDate", "==", scheduledDate)
    .where("scheduledTime", "==", scheduledTime);
  const sameTimeSnap = await transaction.get(sameTimeQuery);
  const consultantNameKey = normalizeConsultantDisplayName(consultant?.name);

  return sameTimeSnap.docs.some((doc) => {
    if (doc.id === excludedApplicationId) return false;

    const candidate = doc.data() || {};
    const status = normalizeApplicationStatus(candidate.status);
    if (status !== "confirmed" && status !== "completed") {
      return false;
    }

    const consultantId = normalizeString(candidate.consultantId);
    if (consultantId) {
      return consultantId === consultant.id;
    }

    return (
      consultantNameKey !== "" &&
      normalizeConsultantDisplayName(candidate.consultant) === consultantNameKey
    );
  });
}

async function getAssignableConsultantsForApplication(
  transaction,
  application,
  excludedApplicationId,
  reservedConsultant = null
) {
  const scheduledDate = normalizeString(application?.scheduledDate);
  const scheduledTime = normalizeTimeKey(application?.scheduledTime);
  const agendaId = normalizeString(application?.agendaId);
  if (!scheduledDate || !scheduledTime || !agendaId) {
    return [];
  }

  const linkedConsultantsQuery = db
    .collection("consultants")
    .where("status", "==", "active")
    .where("agendaIds", "array-contains", agendaId);
  const [linkedConsultantsSnap, sameTimeApplicationsSnap] = await Promise.all([
    transaction.get(linkedConsultantsQuery),
    transaction.get(
      db
        .collection("officeHourApplications")
        .where("scheduledDate", "==", scheduledDate)
        .where("scheduledTime", "==", scheduledTime)
    ),
  ]);

  if (linkedConsultantsSnap.empty) {
    return [];
  }
  const pendingConsultantIds = getApplicationPendingConsultantIds(application);
  const hasAssignedConsultant =
    pendingConsultantIds.length > 0 ||
    Boolean(normalizeString(application?.consultantId)) ||
    Boolean(normalizeConsultantDisplayName(application?.consultant));

  return linkedConsultantsSnap.docs
    .map((doc) => normalizeConsultantDoc(doc))
    .filter((consultant) => {
      if (!isConsultantAvailableAt(consultant, scheduledDate, scheduledTime)) {
        return false;
      }
      if (hasAssignedConsultant && !isApplicationAssignedToConsultant(application, consultant)) {
        return false;
      }

      const consultantNameKey = normalizeConsultantDisplayName(consultant?.name);
      if (reservedConsultant?.id && reservedConsultant.id === consultant.id) {
        return false;
      }
      if (
        !reservedConsultant?.id &&
        normalizeConsultantDisplayName(reservedConsultant?.name) !== "" &&
        normalizeConsultantDisplayName(reservedConsultant?.name) === consultantNameKey
      ) {
        return false;
      }

      return !sameTimeApplicationsSnap.docs.some((doc) => {
        if (doc.id === excludedApplicationId) return false;

        return isApplicationBlockingConsultantAtSameTime(doc.data() || {}, consultant, agendaId);
      });
    });
}

async function rejectUnassignableSameTimePendingApplications(
  transaction,
  application,
  excludedApplicationId,
  reservedConsultant = null
) {
  const scheduledDate = normalizeString(application?.scheduledDate);
  const scheduledTime = normalizeTimeKey(application?.scheduledTime);
  if (!scheduledDate || !scheduledTime) {
    return [];
  }

  const sameTimeApplicationsSnap = await transaction.get(
    db
      .collection("officeHourApplications")
      .where("scheduledDate", "==", scheduledDate)
      .where("scheduledTime", "==", scheduledTime)
  );

  const rejectedIds = [];

  for (const doc of sameTimeApplicationsSnap.docs) {
    if (doc.id === excludedApplicationId) continue;

    const candidate = doc.data() || {};
    if (normalizeApplicationStatus(candidate.status) !== "pending") {
      continue;
    }

    const assignableConsultants = await getAssignableConsultantsForApplication(
      transaction,
      candidate,
      doc.id,
      reservedConsultant
    );
    if (assignableConsultants.length > 0) {
      continue;
    }

    transaction.update(doc.ref, {
      status: "rejected",
      rejectionReason: AUTO_UNASSIGNABLE_REASON,
      updatedAt: FieldValue.serverTimestamp(),
    });
    rejectedIds.push(doc.id);
  }

  return rejectedIds;
}

async function runApplicationMaintenanceCore() {
  const candidateSnap = await db
    .collection("officeHourApplications")
    .where("status", "==", "confirmed")
    .get();

  if (candidateSnap.empty) {
    return {
      rejectedCount: 0,
      completedCount: 0,
      slotCount: 0,
    };
  }

  const now = new Date();
  let rejectedCount = 0;
  let completedCount = 0;
  for (const candidateDoc of candidateSnap.docs) {
    const result = await db.runTransaction(async (transaction) => {
      const applicationRef = candidateDoc.ref;
      const applicationSnap = await transaction.get(applicationRef);
      if (!applicationSnap.exists) {
        return { outcome: "skipped" };
      }

      const application = applicationSnap.data() || {};
      const currentStatus = normalizeApplicationStatus(application.status);
      if (currentStatus !== "confirmed") {
        return { outcome: "skipped" };
      }

      if (!hasSessionStarted(application, null, now)) {
        return { outcome: "skipped" };
      }

      transaction.update(applicationRef, {
        status: "completed",
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { outcome: "completed" };
    });

    if (result.outcome === "rejected") {
      rejectedCount += 1;
    } else if (result.outcome === "completed") {
      completedCount += 1;
    }
  }

  return {
    rejectedCount,
    completedCount,
    slotCount: 0,
  };
}

exports.submitRegularApplication = onCall(
  {
    region: REGION,
    timeoutSeconds: 60,
    memory: "256MiB",
    secrets: [
      GOOGLE_CALENDAR_CLIENT_ID,
      GOOGLE_CALENDAR_CLIENT_SECRET,
      GOOGLE_CALENDAR_REFRESH_TOKEN,
      GOOGLE_CALENDAR_TARGET_CALENDAR_ID,
      RESEND_API_KEY,
      SLACK_BOT_TOKEN,
      BIZTALK_DISPATCH_URL,
      BIZTALK_DISPATCH_TOKEN,
    ],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const uid = request.auth.uid;
    const authEmail = normalizeString(request.auth.token?.email);
    const payload = request.data ?? {};

    const officeHourId = normalizeString(payload.officeHourId);
    const officeHourTitle = normalizeString(payload.officeHourTitle);
    const programId = normalizeString(payload.programId);
    const agendaId = normalizeString(payload.agendaId);
    const scheduledDate = normalizeString(payload.scheduledDate);
    const scheduledTime = normalizeTimeKey(payload.scheduledTime);
    const sessionFormat = normalizeString(payload.sessionFormat);
    const requestContent = normalizeString(payload.requestContent);
    const attachmentNames = Array.isArray(payload.attachmentNames)
      ? payload.attachmentNames.map((item) => normalizeString(item)).filter(Boolean)
      : [];
    const attachmentUrls = Array.isArray(payload.attachmentUrls)
      ? payload.attachmentUrls.map((item) => normalizeString(item)).filter(Boolean)
      : [];

    if (!officeHourId) {
      throw new HttpsError("invalid-argument", "오피스아워 정보를 확인할 수 없습니다.");
    }
    if (!agendaId) {
      throw new HttpsError("invalid-argument", "아젠다 정보가 필요합니다.");
    }
    if (!isDateKey(scheduledDate)) {
      throw new HttpsError("invalid-argument", "신청 날짜 형식이 올바르지 않습니다.");
    }
    if (!scheduledTime) {
      throw new HttpsError("invalid-argument", "신청 시간을 확인할 수 없습니다.");
    }
    if (!isSessionFormat(sessionFormat)) {
      throw new HttpsError("invalid-argument", "진행 형태 값이 올바르지 않습니다.");
    }
    if (!requestContent) {
      throw new HttpsError("invalid-argument", "요청 내용을 입력해주세요.");
    }
    if (isPastScheduledStart(scheduledDate, scheduledTime)) {
      throw new HttpsError("failed-precondition", "이미 지난 시간은 신청할 수 없습니다.");
    }

    const result = await db.runTransaction(async (transaction) => {
      const profileRef = db.collection("profiles").doc(uid);
      const agendaRef = db.collection("agendas").doc(agendaId);

      const [profileSnap, agendaSnap] = await Promise.all([
        transaction.get(profileRef),
        transaction.get(agendaRef),
      ]);

      if (!profileSnap.exists) {
        throw new HttpsError("failed-precondition", "프로필 정보를 찾을 수 없습니다.");
      }

      const profile = profileSnap.data() || {};
      if (profile.active !== true || profile.role !== "company") {
        throw new HttpsError("permission-denied", "승인된 기업 계정만 신청할 수 있습니다.");
      }

      const companyId = normalizeString(profile.companyId || uid);
      if (!companyId) {
        throw new HttpsError("failed-precondition", "회사 식별자가 없습니다.");
      }

      if (!agendaSnap.exists) {
        throw new HttpsError("failed-precondition", "선택한 아젠다 정보를 찾지 못했습니다.");
      }

      const agendaDoc = agendaSnap.data() || {};
      if (agendaDoc.active === false) {
        throw new HttpsError("failed-precondition", "비활성 아젠다는 신청할 수 없습니다.");
      }

      const companyRef = db.collection("companies").doc(companyId);
      const companySnap = await transaction.get(companyRef);
      const companyDoc = companySnap.exists ? companySnap.data() || {} : {};

      const programIdsFromCompany = Array.isArray(companyDoc.programs)
        ? companyDoc.programs.map((item) => normalizeString(item)).filter(Boolean)
        : [];
      const effectiveProgramId = normalizeString(programId);
      if (programIdsFromCompany.length === 0) {
        throw new HttpsError("failed-precondition", "신청 가능한 사업 정보를 확인할 수 없습니다.");
      }

      const programRefs = programIdsFromCompany.map((id) => db.collection("programs").doc(id));
      const programSnaps = await Promise.all(programRefs.map((ref) => transaction.get(ref)));
      const programDocs = programSnaps
        .filter((snap) => snap.exists)
        .map((snap) => ({ id: snap.id, ...snap.data() }));

      if (effectiveProgramId && !programDocs.some((program) => program.id === effectiveProgramId)) {
        throw new HttpsError("failed-precondition", "기업에 연결되지 않은 사업입니다.");
      }
      if (!effectiveProgramId) {
        throw new HttpsError("failed-precondition", "신청할 사업 정보를 확인할 수 없습니다.");
      }

      const targetProgramDoc = programDocs.find((program) => program.id === effectiveProgramId);
      if (!targetProgramDoc) {
        throw new HttpsError("failed-precondition", "신청할 사업 정보를 찾을 수 없습니다.");
      }
      const allowedAgendaIds = normalizeStringArray(targetProgramDoc.allowedAgendaIds);
      if (!allowedAgendaIds.includes(agendaId)) {
        throw new HttpsError("failed-precondition", "선택한 사업에서 신청할 수 없는 아젠다입니다.");
      }

      const agendaScope = getAgendaScope(agendaDoc);
      if (!regularOfficeHourPolicy.canCompanyApplyForRegularDate(scheduledDate, new Date())) {
        throw new HttpsError(
          "failed-precondition",
          `정기 오피스아워 신청은 매월 ${COMPANY_APPLICATION_OPEN_WEEK_NUMBER}주차에 다음 달 일정만 신청할 수 있습니다.`
        );
      }
      if (!isProgramRegularOfficeHourDateAvailable(targetProgramDoc, agendaScope, scheduledDate)) {
        throw new HttpsError("failed-precondition", "사업 운영일이 아니어서 신청할 수 없습니다.");
      }
      const totalTickets = programDocs.reduce(
        (sum, programDoc) => sum + getProgramTicketValue(programDoc, companyDoc, agendaScope),
        0
      );

      const companyApplicationsQuery = db
        .collection("officeHourApplications")
        .where("companyId", "==", companyId);
      const companyApplicationsSnap = await transaction.get(companyApplicationsQuery);

      let reservedCount = 0;
      let completedCount = 0;

      companyApplicationsSnap.docs.forEach((doc) => {
        const data = doc.data() || {};
        const normalizedStatus = normalizeApplicationStatus(data.status);
        let scope = null;
        if (data.type === "irregular" && typeof data.isInternal === "boolean") {
          scope = data.isInternal ? "internal" : "external";
        } else if (normalizeString(data.agendaId) === agendaId) {
          scope = agendaScope;
        } else {
          scope = null;
        }
        if (scope !== agendaScope) return;
        if (normalizedStatus === "completed") {
          completedCount += 1;
        } else if (RESERVED_APPLICATION_STATUSES.has(normalizedStatus)) {
          reservedCount += 1;
        }
      });

      const remainingTickets = Math.max(0, totalTickets - reservedCount - completedCount);
      if (remainingTickets <= 0) {
        throw new HttpsError(
          "failed-precondition",
          agendaScope === "internal"
            ? "내부 티켓이 모두 소진되어 신청할 수 없습니다."
            : "외부 티켓이 모두 소진되어 신청할 수 없습니다."
        );
      }

      const hasApplicantConflict = companyApplicationsSnap.docs.some((doc) => {
        const data = doc.data() || {};
        const normalizedStatus = normalizeApplicationStatus(data.status);
        if (!RESERVED_APPLICATION_STATUSES.has(normalizedStatus)) {
          return false;
        }
        if (normalizeString(data.scheduledDate) !== scheduledDate) {
          return false;
        }
        return normalizeTimeKey(data.scheduledTime) === scheduledTime;
      });
      if (hasApplicantConflict) {
        throw new HttpsError(
          "failed-precondition",
          "이미 같은 시간에 신청한 일정이 있어 중복 신청할 수 없습니다."
        );
      }

      const linkedConsultantsQuery = db
        .collection("consultants")
        .where("status", "==", "active")
        .where("agendaIds", "array-contains", agendaId);
      const linkedConsultantsSnap = await transaction.get(linkedConsultantsQuery);
      if (linkedConsultantsSnap.empty) {
        throw new HttpsError("failed-precondition", "선택한 아젠다에 연결된 활성 컨설턴트가 없습니다.");
      }
      const linkedConsultantEntries = linkedConsultantsSnap.docs.map((doc) => normalizeConsultantDoc(doc));
      const orderedLinkedConsultants = sortConsultantsByAgendaPriority(
        linkedConsultantEntries,
        agendaDoc
      );

      const sameTimeApplicationsQuery = db
        .collection("officeHourApplications")
        .where("scheduledDate", "==", scheduledDate)
        .where("scheduledTime", "==", scheduledTime);
      const sameTimeApplicationsSnap = await transaction.get(sameTimeApplicationsQuery);

      const assignableConsultants = linkedConsultantsSnap.docs.filter((doc) => {
        const consultant = { id: doc.id, ...doc.data() };
        if (!isConsultantAvailableAt(consultant, scheduledDate, scheduledTime)) {
          return false;
        }

        return !sameTimeApplicationsSnap.docs.some((applicationDoc) => {
          return isApplicationBlockingConsultantAtSameTime(
            applicationDoc.data() || {},
            consultant,
            agendaId
          );
        });
      });

      if (assignableConsultants.length === 0) {
        throw new HttpsError(
          "failed-precondition",
          "선택한 시간에 현재 배정 가능한 컨설턴트가 없어 신청할 수 없습니다."
        );
      }

      const assignableConsultantIds = new Set(assignableConsultants.map((doc) => doc.id));
      const assignedConsultant = orderedLinkedConsultants.find((consultant) =>
        assignableConsultantIds.has(consultant.id)
      );
      if (!assignedConsultant) {
        throw new HttpsError(
          "failed-precondition",
          "선택한 시간에 현재 배정 가능한 컨설턴트가 없어 신청할 수 없습니다."
        );
      }

      const applicationRef = db.collection("officeHourApplications").doc();
      const createdAt = FieldValue.serverTimestamp();
      const companyName =
        normalizeString(companyDoc.name) ||
        normalizeString(profile.companyName) ||
        "회사명 미입력";
      const assignedConsultantEmail =
        normalizeEmail(assignedConsultant.email) ||
        normalizeEmail(assignedConsultant.secondaryEmail);

      transaction.set(applicationRef, {
        type: "regular",
        status: "confirmed",
        officeHourId,
        companyId,
        programId: effectiveProgramId || null,
        officeHourTitle:
          officeHourTitle ||
          `${normalizeString(targetProgramDoc.name) || "사업"} 정기 오피스아워`,
        agendaId,
        companyName,
        consultant: normalizeString(assignedConsultant.name) || "담당자 배정 중",
        consultantId: assignedConsultant.id,
        ...(assignedConsultantEmail ? { consultantEmail: assignedConsultantEmail } : {}),
        sessionFormat,
        agenda: normalizeString(agendaDoc.name) || "미지정",
        requestContent,
        attachments: attachmentNames,
        ...(attachmentUrls.length > 0 ? { attachmentUrls } : {}),
        applicantName: companyName,
        applicantEmail: authEmail || normalizeString(profile.email) || "",
        createdByUid: uid,
        scheduledDate,
        scheduledTime,
        createdAt,
        updatedAt: createdAt,
      });

      return {
        applicationId: applicationRef.id,
        pendingConsultantIds: [],
        consultantId: assignedConsultant.id,
      };
    });

    const calendarSync = await upsertRegularApplicationGoogleCalendarEvent(result.applicationId);
    const notificationClaim = await claimRegularApplicationConfirmationDispatch(result.applicationId);
    let notificationDispatch = {
      ok: false,
      status: "skipped",
      reason: notificationClaim.reason || "claim-failed",
      claim: notificationClaim,
    };

    if (notificationClaim.ok) {
      const dispatchResult = await dispatchRegularApplicationConfirmationNotifications(result.applicationId);
      notificationDispatch = {
        ...dispatchResult,
        claim: notificationClaim,
      };
      if (dispatchResult.ok) {
        await writeRegularApplicationConfirmationState(result.applicationId, {
          status: "completed",
          channels: dispatchResult.channels,
          sentAt: FieldValue.serverTimestamp(),
        });
      } else {
        await writeRegularApplicationConfirmationState(result.applicationId, {
          status: dispatchResult.status || "error",
          channels: dispatchResult.channels || null,
          message:
            dispatchResult.message || dispatchResult.reason || "unknown-error",
        });
      }
    }

    if (!notificationClaim.ok) {
      console.info(
        "submitRegularApplication confirmation claim-skip",
        JSON.stringify({
          applicationId: result.applicationId,
          claimReason: notificationClaim.reason,
        })
      );
    }

    console.info(
      "submitRegularApplication notificationDispatch",
      JSON.stringify({
        applicationId: result.applicationId,
        notificationDispatch,
      })
    );

    return {
      ...result,
      calendarSyncStatus: calendarSync.status,
      ...(calendarSync.error ? { calendarSyncError: calendarSync.error } : {}),
      notificationDispatch,
    };
  }
);

exports.updateCompanyApplication = onCall(
  {
    region: REGION,
    timeoutSeconds: 30,
    memory: "256MiB",
    secrets: [
      GOOGLE_CALENDAR_CLIENT_ID,
      GOOGLE_CALENDAR_CLIENT_SECRET,
      GOOGLE_CALENDAR_REFRESH_TOKEN,
      GOOGLE_CALENDAR_TARGET_CALENDAR_ID,
    ],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const uid = request.auth.uid;
    const payload = request.data ?? {};
    const applicationId = normalizeString(payload.applicationId);
    const requestContent = normalizeString(payload.requestContent);
    const attachmentNames = Array.isArray(payload.attachmentNames)
      ? payload.attachmentNames.map((item) => normalizeString(item)).filter(Boolean)
      : [];
    const attachmentUrls = Array.isArray(payload.attachmentUrls)
      ? payload.attachmentUrls.map((item) => normalizeString(item)).filter(Boolean)
      : [];
    const requestedScheduledDate = normalizeString(payload.scheduledDate);
    const requestedScheduledTime = normalizeTimeKey(payload.scheduledTime);

    if (!applicationId) {
      throw new HttpsError("invalid-argument", "신청 식별자가 필요합니다.");
    }
    if (!requestContent) {
      throw new HttpsError("invalid-argument", "요청 내용을 입력해주세요.");
    }

    const result = await db.runTransaction(async (transaction) => {
      const profileRef = db.collection("profiles").doc(uid);
      const applicationRef = db.collection("officeHourApplications").doc(applicationId);

      const [profileSnap, applicationSnap] = await Promise.all([
        transaction.get(profileRef),
        transaction.get(applicationRef),
      ]);

      if (!profileSnap.exists) {
        throw new HttpsError("failed-precondition", "프로필 정보를 찾을 수 없습니다.");
      }
      if (!applicationSnap.exists) {
        throw new HttpsError("not-found", "신청 정보를 찾을 수 없습니다.");
      }

      const profile = profileSnap.data() || {};
      if (profile.active !== true || normalizeString(profile.role) !== "company") {
        throw new HttpsError("permission-denied", "기업 계정만 신청을 수정할 수 있습니다.");
      }

      const application = applicationSnap.data() || {};
      const applicationOwnerUid = normalizeString(application.createdByUid);
      if (!applicationOwnerUid || applicationOwnerUid !== uid) {
        throw new HttpsError("permission-denied", "본인이 신청한 건만 수정할 수 있습니다.");
      }

      const currentStatus = normalizeApplicationStatus(application.status);
      if (currentStatus !== "confirmed") {
        throw new HttpsError("failed-precondition", "확정된 신청만 수정할 수 있습니다.");
      }
      if (hasSessionStarted(application)) {
        throw new HttpsError("failed-precondition", "진행 시간이 지난 신청은 수정할 수 없습니다.");
      }
      if (!isApplicationChangeWindowOpen(application, new Date())) {
        throw new HttpsError(
          "failed-precondition",
          "신청 후 72시간이 지나 수정할 수 없습니다."
        );
      }

      const nextScheduledDate = requestedScheduledDate || normalizeString(application.scheduledDate);
      const nextScheduledTime = requestedScheduledTime || normalizeTimeKey(application.scheduledTime);
      const scheduleChanged =
        (requestedScheduledDate && requestedScheduledDate !== normalizeString(application.scheduledDate)) ||
        (requestedScheduledTime && requestedScheduledTime !== normalizeTimeKey(application.scheduledTime));

      if ((requestedScheduledDate && !requestedScheduledTime) || (!requestedScheduledDate && requestedScheduledTime)) {
        throw new HttpsError("invalid-argument", "날짜와 시간을 함께 입력해주세요.");
      }

      if (scheduleChanged) {
        if (normalizeString(application.type) !== "regular") {
          throw new HttpsError(
            "failed-precondition",
            "정기 오피스아워 신청만 일정과 시간을 수정할 수 있습니다."
          );
        }
        if (!isDateKey(nextScheduledDate) || !nextScheduledTime) {
          throw new HttpsError("invalid-argument", "변경할 일정 형식이 올바르지 않습니다.");
        }
        if (isPastScheduledStart(nextScheduledDate, nextScheduledTime)) {
          throw new HttpsError("failed-precondition", "이미 지난 시간으로는 변경할 수 없습니다.");
        }

        const companyId = normalizeString(application.companyId || profile.companyId || uid);
        const agendaId = normalizeString(application.agendaId);
        const programId = normalizeString(application.programId);
        if (!companyId || !agendaId || !programId) {
          throw new HttpsError("failed-precondition", "신청의 사업 또는 아젠다 정보를 확인할 수 없습니다.");
        }

        const companyRef = db.collection("companies").doc(companyId);
        const agendaRef = db.collection("agendas").doc(agendaId);
        const programRef = db.collection("programs").doc(programId);
        const [companySnap, agendaSnap, programSnap] = await Promise.all([
          transaction.get(companyRef),
          transaction.get(agendaRef),
          transaction.get(programRef),
        ]);

        if (!companySnap.exists) {
          throw new HttpsError("failed-precondition", "회사 정보를 찾을 수 없습니다.");
        }
        if (!agendaSnap.exists) {
          throw new HttpsError("failed-precondition", "아젠다 정보를 찾을 수 없습니다.");
        }
        if (!programSnap.exists) {
          throw new HttpsError("failed-precondition", "사업 정보를 찾을 수 없습니다.");
        }

        const companyDoc = companySnap.data() || {};
        const agendaDoc = agendaSnap.data() || {};
        const programDoc = { id: programSnap.id, ...(programSnap.data() || {}) };
        const agendaScope = getAgendaScope(agendaDoc);
        const companyPrograms = Array.isArray(companyDoc.programs)
          ? companyDoc.programs.map((item) => normalizeString(item)).filter(Boolean)
          : [];

        if (!companyPrograms.includes(programId)) {
          throw new HttpsError("failed-precondition", "기업에 연결되지 않은 사업입니다.");
        }
        if (agendaDoc.active === false) {
          throw new HttpsError("failed-precondition", "비활성 아젠다는 신청할 수 없습니다.");
        }
        if (!isProgramRegularOfficeHourDateAvailable(programDoc, agendaScope, nextScheduledDate)) {
          throw new HttpsError("failed-precondition", "사업 운영일이 아니어서 변경할 수 없습니다.");
        }

        const companyApplicationsSnap = await transaction.get(
          db.collection("officeHourApplications").where("companyId", "==", companyId)
        );
        const hasApplicantConflict = companyApplicationsSnap.docs.some((doc) => {
          if (doc.id === applicationId) return false;
          const data = doc.data() || {};
          if (!RESERVED_APPLICATION_STATUSES.has(normalizeApplicationStatus(data.status))) {
            return false;
          }
          if (normalizeString(data.scheduledDate) !== nextScheduledDate) {
            return false;
          }
          return normalizeTimeKey(data.scheduledTime) === nextScheduledTime;
        });
        if (hasApplicantConflict) {
          throw new HttpsError(
            "failed-precondition",
            "이미 같은 시간에 신청한 일정이 있어 중복 신청할 수 없습니다."
          );
        }

        const applicationForScheduling = {
          ...application,
          scheduledDate: nextScheduledDate,
          scheduledTime: nextScheduledTime,
          consultant: "담당자 배정 중",
          consultantId: "",
          pendingConsultantIds: [],
        };
        const assignableConsultants = await getAssignableConsultantsForApplication(
          transaction,
          applicationForScheduling,
          applicationId
        );
        if (assignableConsultants.length === 0) {
          throw new HttpsError(
            "failed-precondition",
            "선택한 시간에 현재 배정 가능한 컨설턴트가 없어 변경할 수 없습니다."
          );
        }
        const orderedAssignableConsultants = sortConsultantsByAgendaPriority(
          assignableConsultants,
          agendaDoc
        );
        const assignedConsultant = orderedAssignableConsultants[0];
        if (!assignedConsultant) {
          throw new HttpsError(
            "failed-precondition",
            "선택한 시간에 현재 배정 가능한 컨설턴트가 없어 변경할 수 없습니다."
          );
        }
        const reassignedConsultantEmail =
          normalizeEmail(assignedConsultant.email) ||
          normalizeEmail(assignedConsultant.secondaryEmail);

        transaction.update(applicationRef, {
          requestContent,
          attachments: attachmentNames,
          attachmentUrls,
          scheduledDate: nextScheduledDate,
          scheduledTime: nextScheduledTime,
          officeHourId: buildRegularOfficeHourId(programId, nextScheduledDate) || application.officeHourId,
          officeHourSlotId: FieldValue.delete(),
          status: "confirmed",
          consultant: normalizeString(assignedConsultant.name) || "컨설턴트",
          consultantId: assignedConsultant.id,
          ...(reassignedConsultantEmail ? { consultantEmail: reassignedConsultantEmail } : {}),
          pendingConsultantIds: FieldValue.delete(),
          reservedConsultantId: FieldValue.delete(),
          rejectionReason: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        return {
          applicationId,
          status: "confirmed",
          scheduleChanged: true,
        };
      }

      transaction.update(applicationRef, {
        requestContent,
        attachments: attachmentNames,
        attachmentUrls,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        applicationId,
        status: currentStatus,
        scheduleChanged: false,
      };
    });

    const calendarSync = await upsertRegularApplicationGoogleCalendarEvent(result.applicationId);
    return {
      ...result,
      calendarSyncStatus: calendarSync.status,
      ...(calendarSync.error ? { calendarSyncError: calendarSync.error } : {}),
    };
  }
);

exports.cancelApplication = onCall(
  {
    region: REGION,
    timeoutSeconds: 30,
    memory: "256MiB",
    secrets: [
      GOOGLE_CALENDAR_CLIENT_ID,
      GOOGLE_CALENDAR_CLIENT_SECRET,
      GOOGLE_CALENDAR_REFRESH_TOKEN,
      GOOGLE_CALENDAR_TARGET_CALENDAR_ID,
      RESEND_API_KEY,
    ],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const uid = request.auth.uid;
    const payload = request.data ?? {};
    const applicationId = normalizeString(payload.applicationId);
    const cancellationReason = normalizeString(payload.cancellationReason);

    if (!applicationId) {
      throw new HttpsError("invalid-argument", "신청 식별자가 필요합니다.");
    }

    const result = await db.runTransaction(async (transaction) => {
        const profileRef = db.collection("profiles").doc(uid);
        const applicationRef = db.collection("officeHourApplications").doc(applicationId);

        const [profileSnap, applicationSnap] = await Promise.all([
          transaction.get(profileRef),
          transaction.get(applicationRef),
        ]);

      if (!profileSnap.exists) {
        throw new HttpsError("failed-precondition", "프로필 정보를 찾을 수 없습니다.");
      }
      if (!applicationSnap.exists) {
        throw new HttpsError("not-found", "신청 정보를 찾을 수 없습니다.");
      }

      const profile = profileSnap.data() || {};
      const actorRole = normalizeString(profile.role);
      const application = applicationSnap.data() || {};
      const currentStatus = normalizeApplicationStatus(application.status);

      if (currentStatus !== "confirmed") {
        throw new HttpsError("failed-precondition", "취소할 수 있는 상태가 아닙니다.");
      }

      const applicationOwnerUid = normalizeString(application.createdByUid);
      const profileCompanyId = normalizeString(profile.companyId);
      const applicationCompanyId = normalizeString(application.companyId);
      const canCancelAsCompany =
        actorRole === "company" &&
        ((applicationOwnerUid && applicationOwnerUid === uid) ||
          (profileCompanyId && applicationCompanyId && profileCompanyId === applicationCompanyId));
      const canCancelAsAdmin = actorRole === "admin";
      if (canCancelAsCompany && !cancellationReason) {
        throw new HttpsError("invalid-argument", "취소 사유를 입력해주세요.");
      }

      if (!canCancelAsCompany && !canCancelAsAdmin) {
        throw new HttpsError("permission-denied", "신청을 취소할 권한이 없습니다.");
      }
      if (!canCancelAsAdmin && !isApplicationChangeWindowOpen(application, new Date())) {
        throw new HttpsError(
          "failed-precondition",
          "신청 후 72시간이 지나 취소할 수 없습니다."
        );
      }

      if (hasSessionStarted(application)) {
        throw new HttpsError("failed-precondition", "진행 시간이 지난 신청은 취소할 수 없습니다.");
      }

      transaction.update(applicationRef, {
        status: "cancelled",
        ...(canCancelAsCompany
          ? { cancellationReason }
          : { cancellationReason: FieldValue.delete() }),
        cancelledByRole: actorRole,
        cancelledByUid: uid,
        cancelledByName:
          normalizeString(profile.name) ||
          normalizeString(profile.companyName) ||
          normalizeEmail(profile.email) ||
          uid,
        cancelledByEmail: normalizeEmail(profile.email) || FieldValue.delete(),
        cancelledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        applicationId,
        outcome: "cancelled",
        status: "cancelled",
        sendConsultantCancellationNotification: canCancelAsCompany,
        actorRole,
      };
    });

    const cancellationNotificationDispatch = result.sendConsultantCancellationNotification
      ? await dispatchRegularApplicationCancellationNotifications(
          result.applicationId,
          cancellationReason,
        )
      : null;

    const calendarSync = await deleteRegularApplicationGoogleCalendarEvent(result.applicationId);
    return {
      ...result,
      cancellationNotificationDispatch,
      calendarSyncStatus: calendarSync.status,
      ...(calendarSync.error ? { calendarSyncError: calendarSync.error } : {}),
    };
  }
);

exports.approvePendingUser = onCall(
  {
    region: REGION,
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const adminUid = request.auth.uid;
    const targetUserId = normalizeString(request.data?.userId);
    let approvalStage = "validate-request";
    let approvedRoleForLog = "unknown";

    if (!targetUserId) {
      throw new HttpsError("invalid-argument", "승인할 사용자 식별자가 필요합니다.");
    }

    try {
      return await db.runTransaction(async (transaction) => {
        approvalStage = "load-documents";
        const adminProfileRef = db.collection("profiles").doc(adminUid);
        const profileRef = db.collection("profiles").doc(targetUserId);
        const signupRequestRef = db.collection("signupRequests").doc(targetUserId);

        const [adminProfileSnap, profileSnap, signupRequestSnap] = await Promise.all([
          transaction.get(adminProfileRef),
          transaction.get(profileRef),
          transaction.get(signupRequestRef),
        ]);

        if (!adminProfileSnap.exists) {
          throw new HttpsError("failed-precondition", "관리자 프로필을 찾을 수 없습니다.");
        }

        const adminProfile = adminProfileSnap.data() || {};
        if (normalizeString(adminProfile.role) !== "admin" || adminProfile.active !== true) {
          throw new HttpsError("permission-denied", "계정 승인 권한이 없습니다.");
        }

        if (!profileSnap.exists && !signupRequestSnap.exists) {
          throw new HttpsError("not-found", "승인 대상 정보를 찾을 수 없습니다.");
        }

        const profile = profileSnap.exists ? profileSnap.data() || {} : {};
        const signupRequest = signupRequestSnap.exists ? signupRequestSnap.data() || {} : {};
        const approvedRole = normalizeApprovalRole(
          signupRequest.requestedRole || profile.requestedRole || signupRequest.role || profile.role,
          "company"
        );
        approvedRoleForLog = approvedRole;
        const fallbackEmail =
          normalizeString(signupRequest.email) || normalizeString(profile.email) || null;
        const sanitizedConsents = sanitizeConsentSnapshot(signupRequest.consents);

        let approvedCompanyId = null;

        if (approvedRole === "consultant") {
          approvalStage = "prepare-consultant-doc";
          const consultantRef = db.collection("consultants").doc(targetUserId);
          const consultantSnap = await transaction.get(consultantRef);
          const existingConsultant = consultantSnap.exists ? consultantSnap.data() || {} : {};
          const source =
            (signupRequest.consultantInfo && typeof signupRequest.consultantInfo === "object"
              ? signupRequest.consultantInfo
              : null) ||
            (profile.pendingConsultantInfo && typeof profile.pendingConsultantInfo === "object"
              ? profile.pendingConsultantInfo
              : null) ||
            {};

          const phone = normalizeString(source.phone);
          const scope = normalizeConsultantScope(source.scope);
          const organization = normalizeString(source.organization);
          const secondaryEmail = normalizeString(source.secondaryEmail);
          const secondaryPhone = normalizeString(source.secondaryPhone);
          const slackUserId = normalizeSlackDmTarget(source.slackUserId || existingConsultant.slackUserId);
          const fixedMeetingLink = normalizeString(source.fixedMeetingLink);
          if (!scope) {
            throw new HttpsError(
              "failed-precondition",
              "컨설턴트 구분(내부/외부)이 없어 승인할 수 없습니다. 가입 정보를 다시 확인해주세요."
            );
          }
          const consultantName =
            normalizeString(source.name) ||
            (fallbackEmail ? fallbackEmail.split("@")[0] : "") ||
            "컨설턴트";
          const consultantEmail =
            fallbackEmail ||
            normalizeString(source.email) ||
            `${targetUserId}@pending.local`;
          const consultantExpertise = normalizeString(source.expertise)
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);

          transaction.set(
            consultantRef,
            {
              name: consultantName,
              title: "컨설턴트",
              email: consultantEmail,
              expertise: consultantExpertise,
              bio: normalizeString(source.bio) || `${consultantName} 컨설턴트`,
              status: "active",
              joinedDate: existingConsultant.joinedDate || FieldValue.serverTimestamp(),
              availability: sanitizeConsultantAvailability(existingConsultant.availability),
              monthlyAvailability: sanitizeConsultantMonthlyAvailabilityForScope(
                existingConsultant.monthlyAvailability,
                scope
              ),
              monthlyAvailabilityMeta: sanitizeConsultantMonthlyAvailabilityMeta(
                existingConsultant.monthlyAvailabilityMeta
              ),
              scope,
              ...(phone ? { phone } : {}),
              ...(organization ? { organization } : {}),
              ...(secondaryEmail ? { secondaryEmail } : {}),
              ...(secondaryPhone ? { secondaryPhone } : {}),
              ...(slackUserId ? { slackUserId } : {}),
              ...(fixedMeetingLink ? { fixedMeetingLink } : {}),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }

        if (approvedRole === "company") {
          approvalStage = "prepare-company-doc";
          approvedCompanyId =
            normalizeString(signupRequest.companyId) ||
            normalizeString(profile.companyId) ||
            targetUserId;

          const pendingCompanyForm = toPendingCompanyForm(
            signupRequest.companyInfo && typeof signupRequest.companyInfo === "object"
              ? signupRequest.companyInfo
              : profile.pendingCompanyInfo
          );
          const pendingInvestmentRows = toPendingInvestmentRows(
            Array.isArray(signupRequest.investmentRows)
              ? signupRequest.investmentRows
              : profile.pendingInvestmentRows
          );
          const companyInfoRecord = buildCompanyInfoRecord(pendingCompanyForm, pendingInvestmentRows);
          const companyName = normalizeString(pendingCompanyForm.companyInfo) || null;
          const approvedProgramIds = Array.isArray(signupRequest.programIds)
            ? signupRequest.programIds.map((value) => normalizeString(value)).filter(Boolean)
            : [];
          const companyRef = db.collection("companies").doc(approvedCompanyId);
          const companySnap = await transaction.get(companyRef);
          const existingCompany = companySnap.exists ? companySnap.data() || {} : {};
          const currentProgramIds = normalizeStringArray(existingCompany.programs);
          const affectedProgramIds = getAffectedProgramIds(currentProgramIds, approvedProgramIds);
          const programDataById = await loadProgramDocsForSyncInTransaction(
            transaction,
            affectedProgramIds
          );
          const companyInfoRef = db
            .collection("companies")
            .doc(approvedCompanyId)
            .collection("companyInfo")
            .doc("info");

          approvalStage = "write-company-doc";
          transaction.set(
            companyRef,
            {
              ownerUid: targetUserId,
              name: companyName,
              programs: approvedProgramIds,
              createdAt: profile.createdAt || signupRequest.createdAt || FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          syncCompanyProgramsInTransaction(transaction, {
            companyId: approvedCompanyId,
            ownerUid: targetUserId,
            currentProgramIds,
            nextProgramIds: approvedProgramIds,
            programDataById,
          });
          approvalStage = "write-company-info-doc";
          transaction.set(
            companyInfoRef,
            {
              ...companyInfoRecord,
              metadata: {
                ...companyInfoRecord.metadata,
                createdAt: FieldValue.serverTimestamp(),
              },
            },
            { merge: true }
          );
        }

        approvalStage = "write-profile-doc";
        transaction.set(
          profileRef,
          {
            role: approvedRole,
            requestedRole: approvedRole,
            active: true,
            email: fallbackEmail,
            companyId: approvedRole === "company" ? approvedCompanyId : null,
            ...(sanitizedConsents ? { consents: sanitizedConsents } : {}),
            activatedAt: FieldValue.serverTimestamp(),
            approvedAt: FieldValue.serverTimestamp(),
            approvedByUid: adminUid,
            createdAt: profile.createdAt || signupRequest.createdAt || FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        if (signupRequestSnap.exists) {
          approvalStage = "delete-signup-request";
          transaction.delete(signupRequestRef);
        }

        approvalStage = "complete";
        return {
          userId: targetUserId,
          role: approvedRole,
          companyId: approvedRole === "company" ? approvedCompanyId : null,
        };
      });
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      console.error("approvePendingUser failed", {
        adminUid,
        targetUserId,
        approvalStage,
        approvedRole: approvedRoleForLog,
        message: error?.message || String(error),
        stack: error?.stack || null,
      });
      throw new HttpsError("internal", "계정 승인 처리 중 서버 오류가 발생했습니다.");
    }
  }
);

exports.generateCompanyAnalysisReport = onCall(
  {
    region: REGION,
    timeoutSeconds: 60,
    memory: "512MiB",
    secrets: [GEMINI_API_KEY],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const uid = request.auth.uid;
    const payload = request.data ?? {};
    const companyName = normalizeString(payload.companyName);
    const companyInfo = sanitizeAiPayload(payload.companyInfo);
    const assessmentSummary = sanitizeAiPayload(payload.assessmentSummary);
    const assessmentDetails = Array.isArray(payload.assessmentDetails)
      ? sanitizeAiPayload(payload.assessmentDetails)
      : [];

    if (!companyName) {
      throw new HttpsError("invalid-argument", "companyName is required");
    }
    if (!companyInfo || typeof companyInfo !== "object" || Array.isArray(companyInfo)) {
      throw new HttpsError("invalid-argument", "companyInfo is required");
    }

    const profileSnap = await db.collection("profiles").doc(uid).get();
    if (!profileSnap.exists) {
      throw new HttpsError("failed-precondition", "프로필 정보를 찾을 수 없습니다.");
    }

    const profile = profileSnap.data() || {};
    if (normalizeString(profile.role) !== "admin" || profile.active !== true) {
      throw new HttpsError("permission-denied", "AI 보고서 생성 권한이 없습니다.");
    }

    const apiKey = GEMINI_API_KEY.value();
    if (!apiKey) {
      throw new HttpsError("failed-precondition", "GEMINI_API_KEY is not configured");
    }

    try {
      const userPrompt = buildCompanyAnalysisUserPrompt({
        companyName,
        companyInfo,
        assessmentSummary,
        assessmentDetails,
      });

      const report = await generateStructuredJson({
        apiKey,
        model: "gemini-2.5-flash",
        systemInstruction: COMPANY_ANALYSIS_SYSTEM_INSTRUCTION,
        userPrompt,
        responseSchema: COMPANY_ANALYSIS_REPORT_SCHEMA,
      });

      return {
        report,
        meta: {
          model: "gemini-2.5-flash",
          generatedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error("generateCompanyAnalysisReport failed", {
        uid,
        companyName,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : null,
      });
      throw new HttpsError("internal", "AI 보고서 생성에 실패했습니다.");
    }
  }
);

exports.runApplicationMaintenance = onCall(
  {
    region: REGION,
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const uid = request.auth.uid;
    const profileSnap = await db.collection("profiles").doc(uid).get();
    if (!profileSnap.exists) {
      throw new HttpsError("failed-precondition", "프로필 정보를 찾을 수 없습니다.");
    }

    const actorRole = normalizeString(profileSnap.data()?.role);
    if (actorRole !== "admin" && actorRole !== "consultant") {
      throw new HttpsError("permission-denied", "상태 동기화 권한이 없습니다.");
    }

    return runApplicationMaintenanceCore();
  }
);

exports.syncConsultantScheduling = onCall(
  {
    region: REGION,
    timeoutSeconds: 60,
    memory: "256MiB",
    secrets: [SLACK_BOT_TOKEN],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const uid = request.auth.uid;
    const authEmail = normalizeString(request.auth.token?.email);
    const authDisplayName =
      normalizeString(request.auth.token?.name) || normalizeString(request.auth.token?.displayName);
    const payload = request.data ?? {};

    const profileSnap = await db.collection("profiles").doc(uid).get();
    if (!profileSnap.exists) {
      throw new HttpsError("failed-precondition", "프로필 정보를 찾을 수 없습니다.");
    }

    const actorRole = normalizeString(profileSnap.data()?.role);
    const requestedConsultantId = normalizeString(payload.consultantId) || uid;
    const monthlyAvailabilityProvided = Object.prototype.hasOwnProperty.call(
      payload,
      "monthlyAvailability"
    );
    const monthlyAvailabilityMetaProvided = Object.prototype.hasOwnProperty.call(
      payload,
      "monthlyAvailabilityMeta"
    );
    const agendaIdsProvided = Object.prototype.hasOwnProperty.call(payload, "agendaIds");
    const statusProvided = Object.prototype.hasOwnProperty.call(payload, "status");

    if (monthlyAvailabilityMetaProvided && !monthlyAvailabilityProvided) {
      throw new HttpsError(
        "invalid-argument",
        "월별 가능 시간 제출 상태는 가능 시간 저장과 함께만 수정할 수 있습니다."
      );
    }
    if (monthlyAvailabilityProvided && !monthlyAvailabilityMetaProvided) {
      throw new HttpsError(
        "invalid-argument",
        "월별 가능 시간 저장에는 제출 상태 정보가 함께 필요합니다."
      );
    }

    if (actorRole === "consultant") {
      if (requestedConsultantId !== uid) {
        throw new HttpsError("permission-denied", "본인 스케줄만 수정할 수 있습니다.");
      }
      if (agendaIdsProvided || statusProvided) {
        throw new HttpsError("permission-denied", "컨설턴트는 가능 시간만 수정할 수 있습니다.");
      }
      if (!monthlyAvailabilityProvided) {
        throw new HttpsError("invalid-argument", "수정할 가능 시간을 확인할 수 없습니다.");
      }
    } else if (actorRole !== "admin") {
      throw new HttpsError("permission-denied", "컨설턴트 운영 정보 수정 권한이 없습니다.");
    }

    return syncConsultantSchedulingCore({
      consultantId: requestedConsultantId,
      actorUid: uid,
      actorRole,
      authEmail,
      authDisplayName,
      monthlyAvailability: monthlyAvailabilityProvided ? payload.monthlyAvailability : undefined,
      monthlyAvailabilityMeta: monthlyAvailabilityMetaProvided ? payload.monthlyAvailabilityMeta : undefined,
      agendaIds: agendaIdsProvided ? payload.agendaIds : undefined,
      status: statusProvided ? payload.status : undefined,
    });
  }
);

exports.syncProgramDefinition = onCall(
  {
    region: REGION,
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const profileSnap = await db.collection("profiles").doc(request.auth.uid).get();
    if (!profileSnap.exists) {
      throw new HttpsError("failed-precondition", "프로필 정보를 찾을 수 없습니다.");
    }

    const profile = profileSnap.data() || {};
    if (normalizeString(profile.role) !== "admin" || profile.active !== true) {
      throw new HttpsError("permission-denied", "사업 정보 수정 권한이 없습니다.");
    }

    const programId = normalizeString(request.data?.programId);
    if (!programId) {
      throw new HttpsError("invalid-argument", "사업 식별자가 필요합니다.");
    }

    const payload = request.data ?? {};

    return syncProgramDefinitionCore({
      programId,
      patch: {
        ...(Object.prototype.hasOwnProperty.call(payload, "name") ? { name: payload.name } : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "description")
          ? { description: payload.description }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "color") ? { color: payload.color } : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "targetHours")
          ? { targetHours: payload.targetHours }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "completedHours")
          ? { completedHours: payload.completedHours }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "maxApplications")
          ? { maxApplications: payload.maxApplications }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "usedApplications")
          ? { usedApplications: payload.usedApplications }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "internalTicketLimit")
          ? { internalTicketLimit: payload.internalTicketLimit }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "externalTicketLimit")
          ? { externalTicketLimit: payload.externalTicketLimit }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "companyLimit")
          ? { companyLimit: payload.companyLimit }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "allowedAgendaIds")
          ? { allowedAgendaIds: payload.allowedAgendaIds }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "managerUid")
          ? { managerUid: payload.managerUid }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "periodStart")
          ? { periodStart: payload.periodStart }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "periodEnd")
          ? { periodEnd: payload.periodEnd }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "weekdays") ? { weekdays: payload.weekdays } : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "kpiDefinitions")
          ? { kpiDefinitions: payload.kpiDefinitions }
          : {}),
      },
    });
  }
);

exports.scheduledApplicationMaintenance = onSchedule(
  {
    region: REGION,
    schedule: "10 * * * *",
    timeZone: "Asia/Seoul",
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async () => {
    return runApplicationMaintenanceCore();
  }
);

exports.sendOfficeHourSameDayReminders = onSchedule(
  {
    region: REGION,
    schedule: "0 9 * * *",
    timeZone: "Asia/Seoul",
    timeoutSeconds: 300,
    memory: "256MiB",
    secrets: [
      RESEND_API_KEY,
      SLACK_BOT_TOKEN,
      BIZTALK_DISPATCH_URL,
      BIZTALK_DISPATCH_TOKEN,
    ],
  },
  async () => {
    return runOfficeHourSameDayReminderDispatchCore();
  }
);

exports.sendConsultantScheduleRegistrationAlerts = onSchedule(
  {
    region: REGION,
    schedule: "0 9 * * 1",
    timeZone: "Asia/Seoul",
    timeoutSeconds: 300,
    memory: "256MiB",
    secrets: [RESEND_API_KEY],
  },
  async () => {
    return dispatchConsultantScheduleRegistrationAlerts();
  }
);

exports.sendInternalConsultantAvailabilityReminders = onSchedule(
  {
    region: REGION,
    schedule: "0 9 * * *",
    timeZone: "Asia/Seoul",
    timeoutSeconds: 300,
    memory: "256MiB",
    secrets: [SLACK_BOT_TOKEN],
  },
  async () => {
    return dispatchInternalConsultantAvailabilityReminders();
  }
);

exports.sendCompanyOfficeHourApplicationAlerts = onSchedule(
  {
    region: REGION,
    schedule: "0 9 * * 1",
    timeZone: "Asia/Seoul",
    timeoutSeconds: 300,
    memory: "256MiB",
    secrets: [RESEND_API_KEY],
  },
  async () => {
    return dispatchCompanyOfficeHourApplicationAlerts();
  }
);

exports.sendPilotJuneCompanyOfficeHourApplicationAlerts = onSchedule(
  {
    region: REGION,
    schedule: "0 9 29 5 *",
    timeZone: "Asia/Seoul",
    timeoutSeconds: 300,
    memory: "256MiB",
    secrets: [RESEND_API_KEY],
  },
  async () => {
    return dispatchCompanyOfficeHourApplicationAlerts();
  }
);

exports.sendOfficeHourReportReminders = onSchedule(
  {
    region: REGION,
    schedule: "0 9 * * *",
    timeZone: "Asia/Seoul",
    timeoutSeconds: 300,
    memory: "256MiB",
    secrets: [RESEND_API_KEY, SLACK_BOT_TOKEN],
  },
  async () => {
    return runOfficeHourReportReminderDispatchCore();
  }
);

exports.syncIrregularCalendarSessions = onCall(
  {
    region: REGION,
    timeoutSeconds: 120,
    memory: "256MiB",
    secrets: [
      GOOGLE_CALENDAR_CLIENT_ID,
      GOOGLE_CALENDAR_CLIENT_SECRET,
      GOOGLE_CALENDAR_REFRESH_TOKEN,
      GOOGLE_CALENDAR_TARGET_CALENDAR_ID,
      RESEND_API_KEY,
    ],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const profileSnap = await db.collection("profiles").doc(request.auth.uid).get();
    if (!profileSnap.exists) {
      throw new HttpsError("failed-precondition", "프로필 정보를 찾을 수 없습니다.");
    }

    const role = normalizeString(profileSnap.data()?.role);
    if (!["admin", "consultant", "staff"].includes(role)) {
      throw new HttpsError("permission-denied", "캘린더 동기화 권한이 없습니다.");
    }

    return syncIrregularCalendarSessionsCore(new Date());
  }
);

exports.syncRegularApplicationCalendar = onCall(
  {
    region: REGION,
    timeoutSeconds: 120,
    memory: "256MiB",
    secrets: [
      GOOGLE_CALENDAR_CLIENT_ID,
      GOOGLE_CALENDAR_CLIENT_SECRET,
      GOOGLE_CALENDAR_REFRESH_TOKEN,
      GOOGLE_CALENDAR_TARGET_CALENDAR_ID,
      RESEND_API_KEY,
    ],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const applicationId = normalizeString(request.data?.applicationId);
    if (!applicationId) {
      throw new HttpsError("invalid-argument", "신청 식별자가 필요합니다.");
    }

    const profileSnap = await db.collection("profiles").doc(request.auth.uid).get();
    if (!profileSnap.exists) {
      throw new HttpsError("failed-precondition", "프로필 정보를 찾을 수 없습니다.");
    }

    const role = normalizeString(profileSnap.data()?.role);
    if (!["admin", "staff"].includes(role)) {
      throw new HttpsError("permission-denied", "정기 캘린더 재동기화 권한이 없습니다.");
    }

    const result = await upsertRegularApplicationGoogleCalendarEvent(applicationId);
    return {
      applicationId,
      ...result,
    };
  }
);

exports.transitionApplicationStatus = onCall(
  {
    region: REGION,
    timeoutSeconds: 30,
    memory: "256MiB",
    secrets: [
      GOOGLE_CALENDAR_CLIENT_ID,
      GOOGLE_CALENDAR_CLIENT_SECRET,
      GOOGLE_CALENDAR_REFRESH_TOKEN,
      GOOGLE_CALENDAR_TARGET_CALENDAR_ID,
      RESEND_API_KEY,
    ],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const uid = request.auth.uid;
    const payload = request.data ?? {};
    const applicationId = normalizeString(payload.applicationId);
    const action = normalizeString(payload.action);
    const rejectionReason = normalizeString(payload.rejectionReason);
    const now = new Date();

    if (!applicationId) {
      throw new HttpsError("invalid-argument", "신청 식별자가 필요합니다.");
    }
    if (!action) {
      throw new HttpsError("invalid-argument", "처리할 작업을 확인할 수 없습니다.");
    }

    try {
      const result = await db.runTransaction(async (transaction) => {
      const profileRef = db.collection("profiles").doc(uid);
      const applicationRef = db.collection("officeHourApplications").doc(applicationId);

      const [profileSnap, applicationSnap] = await Promise.all([
        transaction.get(profileRef),
        transaction.get(applicationRef),
      ]);

      if (!profileSnap.exists) {
        throw new HttpsError("failed-precondition", "프로필 정보를 찾을 수 없습니다.");
      }
      if (!applicationSnap.exists) {
        throw new HttpsError("not-found", "신청 정보를 찾을 수 없습니다.");
      }

      const profile = profileSnap.data() || {};
      const actorRole = normalizeString(profile.role);
      const application = applicationSnap.data() || {};
      const currentStatus = normalizeApplicationStatus(application.status);

      if (action === "claim" || action === "confirm") {
        if (hasSessionStarted(application)) {
          throw new HttpsError("failed-precondition", "진행 시간이 지나 처리할 수 없습니다.");
        }
      }

	      if (action === "reopen" && actorRole === "admin") {
	        if (!["confirmed", "rejected"].includes(currentStatus)) {
	          throw new HttpsError("failed-precondition", "수락 대기로 되돌릴 수 있는 상태가 아닙니다.");
	        }

          const pendingConsultantIds = getManualReopenPendingConsultantIds(application);
          if (pendingConsultantIds.length === 0) {
            throw new HttpsError(
              "failed-precondition",
              "기존 요청 대상 컨설턴트를 확인할 수 없어 수락 대기로 되돌릴 수 없습니다."
            );
          }

	          transaction.update(applicationRef, {
	          status: "pending",
	          consultant: "담당자 배정 중",
	          consultantId: FieldValue.delete(),
            consultantEmail: FieldValue.delete(),
            pendingConsultantIds,
	          reservedConsultantId: FieldValue.delete(),
            officeHourSlotId: FieldValue.delete(),
	          rejectionReason: FieldValue.delete(),
	          updatedAt: FieldValue.serverTimestamp(),
	        });

        return {
          applicationId,
          status: "pending",
          consultant: "담당자 배정 중",
          consultantId: "",
        };
      }

	      if (action === "claim" || action === "confirm" || action === "reject" || action === "reopen") {
        if (actorRole !== "consultant") {
          throw new HttpsError("permission-denied", "컨설턴트만 처리할 수 있습니다.");
        }

        const consultantRef = db.collection("consultants").doc(uid);
        const consultantSnap = await transaction.get(consultantRef);
        if (!consultantSnap.exists) {
          throw new HttpsError(
            "failed-precondition",
            "컨설턴트 정보를 uid 기준으로 찾을 수 없습니다."
          );
        }

        const consultant = normalizeConsultantDoc(consultantSnap);
        if (normalizeString(consultant.status || "active") !== "active") {
          throw new HttpsError("failed-precondition", "비활성 컨설턴트는 처리할 수 없습니다.");
        }
	        const isUnassigned =
	          !normalizeString(application.consultantId) &&
	          (!normalizeString(application.consultant) ||
	            normalizeString(application.consultant) === "담당자 배정 중");
	        const isAssignedToCurrent = isApplicationAssignedToConsultant(application, consultant);
          const pendingConsultantIds = getApplicationPendingConsultantIds(application);
          const isPendingTargetedToCurrent = pendingConsultantIds.includes(consultant.id);

	        if (action === "claim" || action === "confirm") {
	          if (currentStatus !== "pending" || !isUnassigned) {
	            throw new HttpsError("failed-precondition", "담당 수락할 수 있는 상태가 아닙니다.");
	          }
            if (pendingConsultantIds.length > 0 && !isPendingTargetedToCurrent) {
	            throw new HttpsError("failed-precondition", "요청 대상 컨설턴트만 이 신청을 처리할 수 있습니다.");
            }
	          if (!(await consultantCanHandleApplication(transaction, consultant, application))) {
	            throw new HttpsError("failed-precondition", "배정된 아젠다와 일치하지 않습니다.");
	          }
          if (await hasConsultantScheduleConflict(transaction, consultant, application, applicationId)) {
            throw new HttpsError("failed-precondition", "이미 동일한 시간에 확정된 일정이 있습니다.");
          }
          if (
            normalizeString(application.scheduledDate) &&
            normalizeTimeKey(application.scheduledTime) &&
            !isConsultantAvailableAt(
              consultant,
              normalizeString(application.scheduledDate),
              normalizeTimeKey(application.scheduledTime)
            )
          ) {
            throw new HttpsError("failed-precondition", "컨설턴트 설정상 가능한 시간이 아닙니다.");
          }

	          const autoRejectedIds = await rejectUnassignableSameTimePendingApplications(
            transaction,
            application,
            applicationId,
            consultant
          );
          const consultantEmail = normalizeEmail(consultant.email) ||
            normalizeEmail(consultant.secondaryEmail);

	          transaction.update(applicationRef, {
	            status: "confirmed",
	            consultant: normalizeString(consultant.name) || "컨설턴트",
	            consultantId: consultant.id,
              consultantEmail: consultantEmail || FieldValue.delete(),
              pendingConsultantIds: FieldValue.delete(),
	            reservedConsultantId: FieldValue.delete(),
	            officeHourSlotId: FieldValue.delete(),
	            updatedAt: FieldValue.serverTimestamp(),
	            rejectionReason: FieldValue.delete(),
	          });

          return {
            applicationId,
            status: "confirmed",
            consultant: normalizeString(consultant.name) || "컨설턴트",
            consultantId: consultant.id,
            autoRejectedIds,
          };
        }

        if (action === "reopen") {
	          if (!["confirmed", "rejected"].includes(currentStatus) || !isAssignedToCurrent) {
	            throw new HttpsError("failed-precondition", "수락 대기로 되돌릴 수 있는 상태가 아닙니다.");
	          }

            const nextPendingConsultantIds = getManualReopenPendingConsultantIds(
              application,
              consultant.id
            );
            if (nextPendingConsultantIds.length === 0) {
              throw new HttpsError(
                "failed-precondition",
                "기존 요청 대상 컨설턴트를 확인할 수 없어 수락 대기로 되돌릴 수 없습니다."
              );
            }

	          transaction.update(applicationRef, {
	            status: "pending",
	            consultant: "담당자 배정 중",
	            consultantId: FieldValue.delete(),
	            consultantEmail: FieldValue.delete(),
              pendingConsultantIds: nextPendingConsultantIds,
	            reservedConsultantId: FieldValue.delete(),
              officeHourSlotId: FieldValue.delete(),
	            rejectionReason: FieldValue.delete(),
	            updatedAt: FieldValue.serverTimestamp(),
	          });

          return {
            applicationId,
            status: "pending",
            consultant: "담당자 배정 중",
            consultantId: "",
          };
        }

        if (!rejectionReason) {
          throw new HttpsError("invalid-argument", "거절 사유를 입력해주세요.");
        }
        const canRejectPending =
          currentStatus === "pending" || currentStatus === "review";
        const canRejectConfirmed = currentStatus === "confirmed";

        if (!canRejectPending && !canRejectConfirmed) {
          throw new HttpsError("failed-precondition", "거절할 수 있는 상태가 아닙니다.");
        }
        if (!isApplicationChangeWindowOpen(application, now)) {
          throw new HttpsError(
            "failed-precondition",
            "신청 후 72시간이 지나 거절할 수 없습니다."
          );
        }

        if (canRejectPending) {
          if (!isUnassigned && !isAssignedToCurrent) {
            throw new HttpsError("failed-precondition", "거절할 수 있는 상태가 아닙니다.");
          }
          if (pendingConsultantIds.length > 0 && !isPendingTargetedToCurrent && !isAssignedToCurrent) {
            throw new HttpsError(
              "failed-precondition",
              "요청 대상 컨설턴트만 이 신청을 처리할 수 있습니다."
            );
          }
        }

        if (canRejectConfirmed) {
          if (!isAssignedToCurrent) {
            throw new HttpsError("failed-precondition", "거절할 수 있는 상태가 아닙니다.");
          }
          if (hasSessionStarted(application, now)) {
            throw new HttpsError(
              "failed-precondition",
              "진행 시간이 지난 신청은 거절할 수 없습니다."
            );
          }
        }

        transaction.update(applicationRef, {
          status: "rejected",
          consultant: normalizeString(consultant.name) || "컨설턴트",
          consultantId: FieldValue.delete(),
          consultantEmail: FieldValue.delete(),
          pendingConsultantIds: FieldValue.delete(),
          reservedConsultantId: FieldValue.delete(),
          officeHourSlotId: FieldValue.delete(),
          rejectionReason,
          updatedAt: FieldValue.serverTimestamp(),
        });

        return {
          applicationId,
          status: "rejected",
          consultant: normalizeString(consultant.name) || "컨설턴트",
          consultantId: consultant.id,
          rejectionReason,
        };
      }

        throw new HttpsError("invalid-argument", "지원하지 않는 상태 변경 작업입니다.");
      });

      const nextStatus = normalizeApplicationStatus(result.status);
      const rejectionNotificationDispatch =
        nextStatus === "rejected" && result.rejectionReason
          ? await dispatchRegularApplicationRejectionNotifications(
              result.applicationId,
              result.rejectionReason,
            )
          : null;
      const calendarSync =
        nextStatus === "confirmed"
          ? await upsertRegularApplicationGoogleCalendarEvent(result.applicationId)
          : await deleteRegularApplicationGoogleCalendarEvent(result.applicationId);

      return {
        ...result,
        calendarSyncStatus: calendarSync.status,
        ...(rejectionNotificationDispatch ? { rejectionNotificationDispatch } : {}),
        ...(calendarSync.error ? { calendarSyncError: calendarSync.error } : {}),
      };
    } catch (error) {
      console.error("transitionApplicationStatus failed", {
        uid,
        applicationId,
        action,
        rejectionReason,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : null,
      });
      throw error;
    }
  }
);
