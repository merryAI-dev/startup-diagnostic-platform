import { getApp, getApps, initializeApp } from "firebase/app"
import type { Auth } from "firebase/auth"
import { getAuth } from "firebase/auth"
import type { Firestore } from "firebase/firestore"
import { getFirestore } from "firebase/firestore"
import type { FirebaseStorage } from "firebase/storage"
import { getStorage } from "firebase/storage"


const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
}

export const isFirebaseConfigured =
  firebaseConfig.apiKey !== "" &&
  firebaseConfig.apiKey !== "your_api_key_here"

const app = isFirebaseConfigured
  ? (getApps().length === 0 ? initializeApp(firebaseConfig) : getApp())
  : null

export const auth = (app ? getAuth(app) : null) as Auth
export const db = (app ? getFirestore(app) : null) as Firestore
export const storage = (app ? getStorage(app) : null) as FirebaseStorage

if (!isFirebaseConfigured) {
  console.info("Firebase API key not set - running without Firebase client services.")
}
