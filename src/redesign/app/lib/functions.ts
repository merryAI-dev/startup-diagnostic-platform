import { httpsCallable } from "firebase/functions";
import { functions, isFirebaseConfigured } from "@/redesign/app/lib/firebase";
import type { ApplicationStatus, SessionFormat } from "@/redesign/app/lib/types";

export const isServerRegularApplicationSubmitEnabled =
  import.meta.env.VITE_USE_SERVER_REGULAR_APPLICATION_SUBMIT === "true";
export const isServerApplicationTransitionEnabled =
  import.meta.env.VITE_USE_SERVER_APPLICATION_TRANSITIONS === "true";

export type SubmitRegularApplicationPayload = {
  officeHourId: string;
  officeHourSlotId?: string | null;
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
  slotId: string;
};

export type TransitionApplicationAction = "claim" | "confirm" | "reject";

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
  slotIdsUpdated?: string[];
};

type CancelApplicationResult = {
  applicationId: string;
  outcome: "deleted" | "rejected";
  status?: ApplicationStatus;
  slotIdsUpdated?: string[];
};

type RunApplicationMaintenanceResult = {
  rejectedCount: number;
  completedCount: number;
  slotCount: number;
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
