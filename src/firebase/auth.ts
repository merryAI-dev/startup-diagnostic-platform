import {
  fetchSignInMethodsForEmail,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth"
import { getFunctions, httpsCallable } from "firebase/functions"
import { auth } from "@/firebase/client"
import { recordTelemetryEvent } from "@/observability/client"

type SendAdminPasswordResetEmailPayload = {
  authEmail: string
  selfService: true
}

type SendAdminPasswordResetEmailResult = {
  ok: boolean
  recoveryEmail: string
  id: string | null
}

export function signInWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password).catch((error) => {
    void recordTelemetryEvent({
      eventType: "auth_error",
      severity: "error",
      action: "sign_in",
      message: error instanceof Error ? error.message : String(error),
      errorCode: typeof error === "object" && error && "code" in error ? String(error.code) : null,
    })
    throw error
  })
}

export function signUpWithEmail(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email, password).catch((error) => {
    void recordTelemetryEvent({
      eventType: "auth_error",
      severity: "error",
      action: "sign_up",
      message: error instanceof Error ? error.message : String(error),
      errorCode: typeof error === "object" && error && "code" in error ? String(error.code) : null,
    })
    throw error
  })
}

export function getSignInMethods(email: string) {
  return fetchSignInMethodsForEmail(auth, email.trim())
}

export function requestPasswordReset(email: string) {
  auth.languageCode = "ko"
  return sendPasswordResetEmail(auth, email.trim()).catch((error) => {
    void recordTelemetryEvent({
      eventType: "auth_error",
      severity: "error",
      action: "password_reset",
      message: error instanceof Error ? error.message : String(error),
      errorCode: typeof error === "object" && error && "code" in error ? String(error.code) : null,
    })
    throw error
  })
}

export async function requestAdminPasswordReset(email: string) {
  const functions = getFunctions(
    auth.app,
    import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "asia-northeast3",
  )
  const callable = httpsCallable<
    SendAdminPasswordResetEmailPayload,
    SendAdminPasswordResetEmailResult
  >(functions, "sendAdminPasswordResetEmail")

  try {
    const result = await callable({
      authEmail: email.trim(),
      selfService: true,
    })
    return result.data
  } catch (error) {
    void recordTelemetryEvent({
      eventType: "auth_error",
      severity: "error",
      action: "admin_password_reset",
      functionName: "sendAdminPasswordResetEmail",
      message: error instanceof Error ? error.message : String(error),
      errorCode: typeof error === "object" && error && "code" in error ? String(error.code) : null,
    })
    throw error
  }
}

export function signOutUser() {
  return signOut(auth)
}
