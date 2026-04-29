import {
  fetchSignInMethodsForEmail,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth"
import { auth, isFirebaseConfigured } from "@/firebase/client"
import { createFirebaseNotConfiguredError } from "@/firebase/errors"

function rejectIfFirebaseUnavailable() {
  if (isFirebaseConfigured && auth) {
    return null
  }
  return Promise.reject(createFirebaseNotConfiguredError())
}

export function signInWithEmail(email: string, password: string) {
  const unavailable = rejectIfFirebaseUnavailable()
  if (unavailable) return unavailable
  return signInWithEmailAndPassword(auth, email, password)
}

export function signUpWithEmail(email: string, password: string) {
  const unavailable = rejectIfFirebaseUnavailable()
  if (unavailable) return unavailable
  return createUserWithEmailAndPassword(auth, email, password)
}

export function getSignInMethods(email: string) {
  const unavailable = rejectIfFirebaseUnavailable()
  if (unavailable) return unavailable
  return fetchSignInMethodsForEmail(auth, email.trim())
}

export function requestPasswordReset(email: string) {
  const unavailable = rejectIfFirebaseUnavailable()
  if (unavailable) return unavailable
  auth.languageCode = "ko"
  return sendPasswordResetEmail(auth, email.trim())
}

export function signOutUser() {
  if (!isFirebaseConfigured || !auth) {
    return Promise.resolve()
  }
  return signOut(auth)
}
