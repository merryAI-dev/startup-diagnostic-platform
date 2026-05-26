import {
  fetchSignInMethodsForEmail,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth"
import { getFunctions, httpsCallable } from "firebase/functions"
import { auth } from "@/firebase/client"

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
  return signInWithEmailAndPassword(auth, email, password)
}

export function signUpWithEmail(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email, password)
}

export function getSignInMethods(email: string) {
  return fetchSignInMethodsForEmail(auth, email.trim())
}

export function requestPasswordReset(email: string) {
  auth.languageCode = "ko"
  return sendPasswordResetEmail(auth, email.trim())
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

  const result = await callable({
    authEmail: email.trim(),
    selfService: true,
  })
  return result.data
}

export function signOutUser() {
  return signOut(auth)
}
