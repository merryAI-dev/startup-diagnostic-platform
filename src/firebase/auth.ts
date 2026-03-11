import {
  fetchSignInMethodsForEmail,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth"
import { auth } from "@/firebase/client"

export function signInWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password)
}

export function signUpWithEmail(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email, password)
}

export function getSignInMethods(email: string) {
  return fetchSignInMethodsForEmail(auth, email.trim())
}

export function signOutUser() {
  return signOut(auth)
}
