import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore"
import { db } from "@/firebase/client"
import type { ConsentSnapshot, Role, UserProfile } from "@/types/auth"
import type { CompanyInfoForm, CompanyInfoRecord, InvestmentInput } from "@/types/company"

const collectionName = "profiles"

export type ConsultantSignupInfo = {
  name: string
  organization: string
  email: string
  phone: string
  secondaryEmail: string
  secondaryPhone: string
  fixedMeetingLink: string
  expertise: string
  bio: string
}

function toNumber(value: string) {
  const digits = value.replace(/[^\d]/g, "")
  if (!digits) return null
  return Number(digits)
}

function toDecimalNumber(value: string) {
  const normalized = value.replace(/,/g, "").trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  if (Number.isNaN(parsed)) return null
  return Math.round(parsed * 10) / 10
}

function toIsoDate(value: string) {
  const digits = value.replace(/[^\d]/g, "").slice(0, 8)
  if (digits.length !== 8) return value.trim()
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
}

export function buildCompanyInfoRecord(
  form: CompanyInfoForm,
  investmentRows?: InvestmentInput[]
): CompanyInfoRecord {
  return {
    basic: {
      companyInfo: form.companyInfo,
      ceo: {
        name: form.ceoName,
        email: form.ceoEmail,
        phone: form.ceoPhone,
      },
      foundedAt: form.foundedAt,
      businessNumber: form.businessNumber,
      primaryBusiness: form.primaryBusiness,
      primaryIndustry: form.primaryIndustry,
    },
    locations: {
      headOffice: form.headOffice,
      branchOrLab: form.branchOffice,
    },
    workforce: {
      fullTime: toNumber(form.workforceFullTime),
      contract: toNumber(form.workforceContract),
    },
    finance: {
      revenue: {
        y2025: toDecimalNumber(form.revenue2025),
        y2026: toDecimalNumber(form.revenue2026),
      },
      capitalTotal: toNumber(form.capitalTotal),
    },
    certifications: {
      designation: form.certification,
      tipsLipsHistory: form.tipsLipsHistory,
    },
    investments: (investmentRows ?? []).map((row) => ({
      stage: row.stage,
      date: toIsoDate(row.date),
      postMoney: toDecimalNumber(row.postMoney),
      majorShareholder: row.majorShareholder,
    })),
    fundingPlan: {
      desiredAmount2026: toDecimalNumber(form.desiredInvestment2026),
      preValue: toDecimalNumber(form.desiredPreValue),
    },
    metadata: {
      updatedAt: serverTimestamp(),
      saveType: "final",
    },
  }
}

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
  email?: string | null,
  options?: {
    companyId?: string | null
    companyInfo?: CompanyInfoForm
    investmentRows?: InvestmentInput[]
    consultantInfo?: ConsultantSignupInfo
    active?: boolean
    consents?: ConsentSnapshot
  }
) {
  const companyId =
    requestedRole === "company"
      ? (options?.companyId ?? uid)
      : null

  const ref = doc(db, collectionName, uid)
  const profileData: Record<string, any> = {
    role,
    requestedRole,
    active: options?.active ?? false,
    email: email ?? null,
    companyId,
    createdAt: serverTimestamp(),
  }
  if (options?.consents) {
    profileData.consents = {
      privacy: options.consents.privacy
        ? {
            ...options.consents.privacy,
            consentedAt: serverTimestamp(),
          }
        : undefined,
      marketing: options.consents.marketing
        ? {
            ...options.consents.marketing,
            consentedAt: serverTimestamp(),
          }
        : undefined,
    }
  }
  const signupRequestData: Record<string, any> = {
    uid,
    requestedRole,
    role,
    email: email ?? null,
    companyId,
    status: "pending",
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  }
  if (requestedRole === "company") {
    signupRequestData.companyInfo = options?.companyInfo ?? null
    signupRequestData.investmentRows = options?.investmentRows ?? []
  }
  if (requestedRole === "consultant" && options?.consultantInfo) {
    signupRequestData.consultantInfo = {
      ...options.consultantInfo,
      name: options.consultantInfo.name.trim(),
      organization: options.consultantInfo.organization.trim(),
      email: options.consultantInfo.email.trim(),
      phone: options.consultantInfo.phone.trim(),
      secondaryEmail: options.consultantInfo.secondaryEmail.trim(),
      secondaryPhone: options.consultantInfo.secondaryPhone.trim(),
      fixedMeetingLink: options.consultantInfo.fixedMeetingLink.trim(),
      expertise: options.consultantInfo.expertise.trim(),
      bio: options.consultantInfo.bio.trim(),
    }
  }

  const batch = writeBatch(db)
  batch.set(ref, profileData)
  batch.set(doc(db, "signupRequests", uid), signupRequestData)
  await batch.commit()

  if (options?.consents) {
    const consentEntries = ([
      ["privacy", options.consents.privacy],
      ["marketing", options.consents.marketing],
    ] as const).filter(([, value]) => Boolean(value))

    if (consentEntries.length > 0) {
      await Promise.all(
        consentEntries.map(([type, value]) =>
          addDoc(collection(db, "consents"), {
            userId: uid,
            type,
            consented: value?.consented ?? false,
            version: value?.version ?? "v1.0",
            method: value?.method ?? "unknown",
            userAgent: value?.userAgent ?? null,
            createdAt: serverTimestamp(),
          })
        )
      )
    }
  }
}
