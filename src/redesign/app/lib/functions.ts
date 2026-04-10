import { httpsCallable } from "firebase/functions";
import { functions, isFirebaseConfigured } from "@/redesign/app/lib/firebase";
import type {
  ApplicationStatus,
  ConsultantAvailability,
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
};

type CancelApplicationResult = {
  applicationId: string;
  outcome: "deleted" | "rejected";
  status?: ApplicationStatus;
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
};

type RunApplicationMaintenanceResult = {
  rejectedCount: number;
  completedCount: number;
  slotCount: number;
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

export type SyncConsultantSchedulingPayload = {
  consultantId?: string;
  availability?: ConsultantAvailability[];
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
  periodStart?: string;
  periodEnd?: string;
  weekdays?: ProgramWeekday[];
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

  const result = await callable(payload);
  return result.data;
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

  const result = await callable(payload);
  return result.data;
}

export async function cancelApplicationViaFunction(applicationId: string) {
  if (!isFirebaseConfigured || !functions) {
    throw new Error("Firebase Functions is not configured");
  }

  const callable = httpsCallable<{ applicationId: string }, CancelApplicationResult>(
    functions,
    "cancelApplication"
  );

  const result = await callable({ applicationId });
  return result.data;
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

  const result = await callable(payload);
  return result.data;
}

export async function runApplicationMaintenanceViaFunction() {
  if (!isFirebaseConfigured || !functions) {
    throw new Error("Firebase Functions is not configured");
  }

  const callable = httpsCallable<Record<string, never>, RunApplicationMaintenanceResult>(
    functions,
    "runApplicationMaintenance"
  );

  const result = await callable({});
  return result.data;
}

export async function approvePendingUserViaFunction(userId: string) {
  if (!isFirebaseConfigured || !functions) {
    throw new Error("Firebase Functions is not configured");
  }

  const callable = httpsCallable<{ userId: string }, ApprovePendingUserResult>(
    functions,
    "approvePendingUser"
  );

  const result = await callable({ userId });
  return result.data;
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

  const result = await callable(payload);
  return result.data;
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

  const result = await callable(payload);
  return result.data;
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

  const result = await callable(payload);
  return result.data;
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

  const result = await callable(payload);
  return result.data;
}
