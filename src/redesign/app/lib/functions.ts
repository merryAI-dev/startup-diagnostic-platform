import { httpsCallable } from "firebase/functions";
import { functions, isFirebaseConfigured } from "@/redesign/app/lib/firebase";
import { callWithTelemetry } from "@/observability/instrumented-functions";
import type { CompanyInfoRecord } from "@/types/company";
import type {
  ApplicationStatus,
  ConsultantAvailability,
  ConsultantMonthlyAvailability,
  ConsultantMonthlyAvailabilityMeta,
  ProgramKpiDefinition,
  ProgramWeekday,
  SessionFormat,
} from "@/redesign/app/lib/types";

export type SubmitRegularApplicationPayload = {
  officeHourId: string;
  officeHourTitle: string;
  programId?: string | null;
  agendaId: string;
  scheduledDate: string;
  scheduledTime: string;
  sessionFormat: SessionFormat;
  requestContent: string;
  attachmentNames: string[];
  attachmentUrls: string[];
};

type SubmitRegularApplicationResult = {
  applicationId: string;
  pendingConsultantIds: string[];
  consultantId?: string;
  calendarSyncStatus?: "synced" | "error" | "deleted" | "skipped";
  calendarSyncError?: string;
};

export type TransitionApplicationAction = "claim" | "confirm" | "reject" | "reopen";

export type TransitionApplicationPayload = {
  applicationId: string;
  action: TransitionApplicationAction;
  rejectionReason?: string | null;
};

type TransitionApplicationResult = {
  applicationId: string;
  status: ApplicationStatus;
  consultant?: string;
  consultantId?: string;
  rejectionReason?: string;
  calendarSyncStatus?: "synced" | "error" | "deleted" | "skipped";
  calendarSyncError?: string;
};

export type CancelApplicationPayload = {
  applicationId: string;
  cancellationReason?: string | null;
};

type CancelApplicationResult = {
  applicationId: string;
  outcome: "cancelled";
  status?: ApplicationStatus;
  calendarSyncStatus?: "synced" | "error" | "deleted" | "skipped";
  calendarSyncError?: string;
};

export type UpdateCompanyApplicationPayload = {
  applicationId: string;
  requestContent: string;
  attachmentNames: string[];
  attachmentUrls: string[];
  scheduledDate?: string | null;
  scheduledTime?: string | null;
};

type UpdateCompanyApplicationResult = {
  applicationId: string;
  status: ApplicationStatus;
  scheduleChanged: boolean;
  calendarSyncStatus?: "synced" | "error" | "deleted" | "skipped";
  calendarSyncError?: string;
};

type RunApplicationMaintenanceResult = {
  rejectedCount: number;
  completedCount: number;
  slotCount: number;
};

type SyncIrregularCalendarSessionsResult = {
  syncedCount: number;
  cancelledCount: number;
  skippedCount: number;
  errorCount: number;
  calendarId: string;
  timeMin: string;
  timeMax: string;
};

type ApprovePendingUserResult = {
  userId: string;
  role: "admin" | "company" | "consultant";
  companyId?: string | null;
};

type UpdateCompanyProgramsPayload = {
  companyId: string;
  programIds: string[];
  companyName?: string | null;
};

type UpdateCompanyProgramsResult = {
  companyId: string;
  programIds: string[];
};

export type SaveManagedCompanyInfoPayload = {
  companyId: string;
  companyInfo: CompanyInfoRecord;
  saveType: "draft" | "final";
};

type SaveManagedCompanyInfoResult = {
  companyId: string;
  saveType: "draft" | "final";
};

export type SyncConsultantSchedulingPayload = {
  consultantId?: string;
  monthlyAvailability?: ConsultantMonthlyAvailability;
  monthlyAvailabilityMeta?: ConsultantMonthlyAvailabilityMeta;
  agendaIds?: string[];
  status?: "active" | "inactive";
};

type SyncConsultantSchedulingResult = {
  consultantId: string;
  status: "active" | "inactive";
  agendaIds: string[];
  slotCount: number;
  closedSlotCount: number;
};

export type SyncProgramDefinitionPayload = {
  programId: string;
  name?: string;
  description?: string;
  color?: string;
  targetHours?: number;
  completedHours?: number;
  maxApplications?: number;
  usedApplications?: number;
  internalTicketLimit?: number;
  externalTicketLimit?: number;
  companyLimit?: number;
  allowedAgendaIds?: string[];
  managerUid?: string | null;
  periodStart?: string;
  periodEnd?: string;
  weekdays?: ProgramWeekday[];
  kpiDefinitions?: ProgramKpiDefinition[];
};

type SyncProgramDefinitionResult = {
  programId: string;
  slotCount: number;
  closedSlotCount: number;
  applicationCount: number;
};

export type GenerateCompanyAnalysisReportPayload = {
  companyName: string;
  companyInfo: unknown;
  assessmentSummary: unknown;
  assessmentDetails: Array<{
    sectionTitle: string;
    subsectionTitle: string;
    questionText: string;
    answerLabel: string;
    reason: string;
    score: number;
  }>;
};

type GenerateCompanyAnalysisReportResult = {
  report: {
    businessProblemDefinition: string;
    businessItemOverview: string;
    businessRevenueModel: string;
    businessExpansionPlan: string;
    summaryOverview: string;
    summarySolution: string;
    summaryCommercialization: string;
    summaryScalability: string;
    summaryFunding: string;
    summaryTeamOrganization: string;
    summarySustainability: string;
    improvementCommercialization: string;
    improvementScalability: string;
    improvementFunding: string;
    acPriority1: string;
    acPriority2: string;
    acPriority3: string;
    milestone56: string;
    milestone78: string;
    milestone910: string;
  };
  meta: {
    model: string;
    generatedAt: string;
  };
};

export type BiztalkStageCheckMode = "health" | "outbound-ip" | "auth-token" | "dispatch-raw";

export type RunBiztalkStageCheckPayload = {
  mode?: BiztalkStageCheckMode;
  dryRun?: boolean;
  payload?: Record<string, unknown>;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  recipients?: string[];
};

export type RunBiztalkStageCheckResult = {
  ok: boolean;
  [key: string]: unknown;
};

export type SendBiztalkTestAlimtalkPayload = {
  recipient: string;
  message: string;
  msgIdx?: string;
  title?: string;
  tmpltCode?: string;
  senderKey?: string;
  attach?: {
    button: Array<{
      name: string;
      type: string;
    }>;
  };
  dryRun?: boolean;
};

export type SendBiztalkTestAlimtalkResult = {
  ok: boolean;
  [key: string]: unknown;
};

export type QueryBiztalkAlimtalkResultsPayload = {
  dryRun?: boolean;
  method?: "GET" | "POST";
  payload?: Record<string, unknown>;
  query?: Record<string, string>;
};

export type QueryBiztalkAlimtalkResultsResult = {
  ok: boolean;
  [key: string]: unknown;
};

export type SendStageTestEmailPayload = {
  fromEmail: string;
  replyTo?: string | null;
  recipients: string[];
  subject: string;
  text: string;
  html?: string;
};

export type SendStageTestEmailResult = {
  ok: boolean;
  sentCount: number;
  deliveries: Array<{
    to: string;
    id: string | null;
  }>;
};

export type SendAdminPasswordResetEmailPayload = {
  authEmail: string;
};

export type SendAdminPasswordResetEmailResult = {
  ok: boolean;
  recoveryEmail: string;
  id: string | null;
};

export type SendStageSlackDmTestPayload = {
  userId: string;
  text: string;
};

export type SendStageSlackDmTestResult = {
  ok: boolean;
  channel: string | null;
  ts: string | null;
};

export type SendStageSlackChannelAvailabilityTestPayload = {
  channelId: string;
  monthKey: string;
};

export type SendStageSlackChannelAvailabilityTestResult = {
  ok: boolean;
  channel: string | null;
  ts: string | null;
  monthKey: string;
  missingCount: number;
  missingConsultants: Array<{
    id: string;
    name: string;
    email: string;
  }>;
  skippedMissingScopeCount: number;
};

export async function submitRegularApplicationViaFunction(
  payload: SubmitRegularApplicationPayload
) {
  if (!isFirebaseConfigured || !functions) {
    throw new Error("Firebase Functions is not configured");
  }

  const callable = httpsCallable<
    SubmitRegularApplicationPayload,
    SubmitRegularApplicationResult
  >(functions, "submitRegularApplication");

  return callWithTelemetry("submitRegularApplication", callable, payload);
}

export async function transitionApplicationStatusViaFunction(
  payload: TransitionApplicationPayload
) {
  if (!isFirebaseConfigured || !functions) {
    throw new Error("Firebase Functions is not configured");
  }

  const callable = httpsCallable<
    TransitionApplicationPayload,
    TransitionApplicationResult
  >(functions, "transitionApplicationStatus");

  return callWithTelemetry("transitionApplicationStatus", callable, payload);
}

export async function cancelApplicationViaFunction(payload: CancelApplicationPayload) {
  if (!isFirebaseConfigured || !functions) {
    throw new Error("Firebase Functions is not configured");
  }

  const callable = httpsCallable<CancelApplicationPayload, CancelApplicationResult>(
    functions,
    "cancelApplication"
  );

  return callWithTelemetry("cancelApplication", callable, payload);
}

export async function updateCompanyApplicationViaFunction(
  payload: UpdateCompanyApplicationPayload
) {
  if (!isFirebaseConfigured || !functions) {
    throw new Error("Firebase Functions is not configured");
  }

  const callable = httpsCallable<
    UpdateCompanyApplicationPayload,
    UpdateCompanyApplicationResult
  >(functions, "updateCompanyApplication");

  return callWithTelemetry("updateCompanyApplication", callable, payload);
}

export async function runApplicationMaintenanceViaFunction() {
  if (!isFirebaseConfigured || !functions) {
    throw new Error("Firebase Functions is not configured");
  }

  const callable = httpsCallable<Record<string, never>, RunApplicationMaintenanceResult>(
    functions,
    "runApplicationMaintenance"
  );

  return callWithTelemetry("runApplicationMaintenance", callable, {});
}

export async function syncIrregularCalendarSessionsViaFunction() {
  if (!isFirebaseConfigured || !functions) {
    throw new Error("Firebase Functions is not configured");
  }

  const callable = httpsCallable<Record<string, never>, SyncIrregularCalendarSessionsResult>(
    functions,
    "syncIrregularCalendarSessions"
  );

  return callWithTelemetry("syncIrregularCalendarSessions", callable, {});
}

export async function approvePendingUserViaFunction(userId: string) {
  if (!isFirebaseConfigured || !functions) {
    throw new Error("Firebase Functions is not configured");
  }

  const callable = httpsCallable<{ userId: string }, ApprovePendingUserResult>(
    functions,
    "approvePendingUser"
  );

  return callWithTelemetry("approvePendingUser", callable, { userId });
}

export async function updateCompanyProgramsViaFunction(
  payload: UpdateCompanyProgramsPayload
) {
  if (!isFirebaseConfigured || !functions) {
    throw new Error("Firebase Functions is not configured");
  }

  const callable = httpsCallable<
    UpdateCompanyProgramsPayload,
    UpdateCompanyProgramsResult
  >(functions, "updateCompanyPrograms");

  return callWithTelemetry("updateCompanyPrograms", callable, payload);
}

export async function saveManagedCompanyInfoViaFunction(
  payload: SaveManagedCompanyInfoPayload
) {
  if (!isFirebaseConfigured || !functions) {
    throw new Error("Firebase Functions is not configured");
  }

  const callable = httpsCallable<
    SaveManagedCompanyInfoPayload,
    SaveManagedCompanyInfoResult
  >(functions, "saveManagedCompanyInfo");

  return callWithTelemetry("saveManagedCompanyInfo", callable, payload);
}

export async function syncConsultantSchedulingViaFunction(
  payload: SyncConsultantSchedulingPayload
) {
  if (!isFirebaseConfigured || !functions) {
    throw new Error("Firebase Functions is not configured");
  }

  const callable = httpsCallable<
    SyncConsultantSchedulingPayload,
    SyncConsultantSchedulingResult
  >(functions, "syncConsultantScheduling");

  return callWithTelemetry("syncConsultantScheduling", callable, payload);
}

export async function syncProgramDefinitionViaFunction(
  payload: SyncProgramDefinitionPayload
) {
  if (!isFirebaseConfigured || !functions) {
    throw new Error("Firebase Functions is not configured");
  }

  const callable = httpsCallable<
    SyncProgramDefinitionPayload,
    SyncProgramDefinitionResult
  >(functions, "syncProgramDefinition");

  return callWithTelemetry("syncProgramDefinition", callable, payload);
}

export async function generateCompanyAnalysisReportViaFunction(
  payload: GenerateCompanyAnalysisReportPayload
) {
  if (!isFirebaseConfigured || !functions) {
    throw new Error("Firebase Functions is not configured");
  }

  const callable = httpsCallable<
    GenerateCompanyAnalysisReportPayload,
    GenerateCompanyAnalysisReportResult
  >(functions, "generateCompanyAnalysisReport");

  return callWithTelemetry("generateCompanyAnalysisReport", callable, payload);
}

export async function runBiztalkStageCheckViaFunction(
  payload: RunBiztalkStageCheckPayload = {}
) {
  if (!isFirebaseConfigured || !functions) {
    throw new Error("Firebase Functions is not configured");
  }

  const callable = httpsCallable<
    RunBiztalkStageCheckPayload,
    RunBiztalkStageCheckResult
  >(functions, "runBiztalkStageCheck")

  return callWithTelemetry("runBiztalkStageCheck", callable, payload)
}

export async function sendBiztalkTestAlimtalkViaFunction(
  payload: SendBiztalkTestAlimtalkPayload
) {
  if (!isFirebaseConfigured || !functions) {
    throw new Error("Firebase Functions is not configured");
  }

  const callable = httpsCallable<
    SendBiztalkTestAlimtalkPayload,
    SendBiztalkTestAlimtalkResult
  >(functions, "sendBiztalkTestAlimtalk")

  return callWithTelemetry("sendBiztalkTestAlimtalk", callable, payload)
}

export async function queryBiztalkAlimtalkResultsViaFunction(
  payload: QueryBiztalkAlimtalkResultsPayload = {}
) {
  if (!isFirebaseConfigured || !functions) {
    throw new Error("Firebase Functions is not configured");
  }

  const callable = httpsCallable<
    QueryBiztalkAlimtalkResultsPayload,
    QueryBiztalkAlimtalkResultsResult
  >(functions, "queryBiztalkAlimtalkResults")

  return callWithTelemetry("queryBiztalkAlimtalkResults", callable, payload)
}

export async function sendStageTestEmailViaFunction(
  payload: SendStageTestEmailPayload
) {
  if (!isFirebaseConfigured || !functions) {
    throw new Error("Firebase Functions is not configured");
  }

  const callable = httpsCallable<
    SendStageTestEmailPayload,
    SendStageTestEmailResult
  >(functions, "sendStageTestEmail")

  return callWithTelemetry("sendStageTestEmail", callable, payload)
}

export async function sendAdminPasswordResetEmailViaFunction(
  payload: SendAdminPasswordResetEmailPayload
) {
  if (!isFirebaseConfigured || !functions) {
    throw new Error("Firebase Functions is not configured");
  }

  const callable = httpsCallable<
    SendAdminPasswordResetEmailPayload,
    SendAdminPasswordResetEmailResult
  >(functions, "sendAdminPasswordResetEmail")

  return callWithTelemetry("sendAdminPasswordResetEmail", callable, payload)
}

export async function sendStageSlackDmTestViaFunction(
  payload: SendStageSlackDmTestPayload
) {
  if (!isFirebaseConfigured || !functions) {
    throw new Error("Firebase Functions is not configured");
  }

  const callable = httpsCallable<
    SendStageSlackDmTestPayload,
    SendStageSlackDmTestResult
  >(functions, "sendStageSlackDmTest")

  return callWithTelemetry("sendStageSlackDmTest", callable, payload)
}

export async function sendStageSlackChannelAvailabilityTestViaFunction(
  payload: SendStageSlackChannelAvailabilityTestPayload
) {
  if (!isFirebaseConfigured || !functions) {
    throw new Error("Firebase Functions is not configured");
  }

  const callable = httpsCallable<
    SendStageSlackChannelAvailabilityTestPayload,
    SendStageSlackChannelAvailabilityTestResult
  >(functions, "sendStageSlackChannelAvailabilityTest")

  return callWithTelemetry("sendStageSlackChannelAvailabilityTest", callable, payload)
}
