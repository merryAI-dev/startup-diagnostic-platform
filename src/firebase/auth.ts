import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  type User,
} from "firebase/auth"
import { auth } from "./client"

const googleProvider = new GoogleAuthProvider()

export function signInWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password)
}

export function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider)
}

export function signUpWithEmail(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email, password)
}

export function sendVerificationEmail(user: User) {
  return sendEmailVerification(user)
}

export function signOutUser() {
  return signOut(auth)
}
