import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore"
import { db } from "./client"
import type { Role, UserProfile } from "../types/auth"

const collectionName = "profiles"

export async function getUserProfile(uid: string) {
  const ref = doc(db, collectionName, uid)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) {
    return null
  }
  return snapshot.data() as UserProfile
}

export async function createUserProfile(
  uid: string,
  role: Role,
  requestedRole: Role | null,
  email?: string | null
) {
  let companyId: string | null = null
  if (requestedRole === "company") {
    const companyRef = await addDoc(collection(db, "companies"), {
      ownerUid: uid,
      name: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    companyId = companyRef.id
  }
  const ref = doc(db, collectionName, uid)
  await setDoc(ref, {
    role,
    requestedRole,
    active: false,
    email: email ?? null,
    companyId,
    createdAt: serverTimestamp(),
  })
}

export async function activateUserProfile(uid: string) {
  const ref = doc(db, collectionName, uid)
  await updateDoc(ref, {
    active: true,
    activatedAt: serverTimestamp(),
  })
}

export async function updateProfileRole(uid: string, role: Role) {
  const ref = doc(db, collectionName, uid)
  await updateDoc(ref, {
    role,
  })
}
