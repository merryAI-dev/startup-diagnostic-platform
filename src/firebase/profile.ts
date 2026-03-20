import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore"
import { db } from "@/firebase/client"
import type { ConsentSnapshot, Role, SignupRequest, UserProfile } from "@/types/auth"
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

function normalizeConsentRecord(record?: ConsentSnapshot[keyof ConsentSnapshot]) {
  if (!record) return undefined
  const normalized: Record<string, unknown> = {
    consented: Boolean(record.consented),
    version: record.version,
    method: record.method,
    userAgent: record.userAgent ?? null,
  }

  if (record.consented) {
    normalized.consentedAt = record.consentedAt ?? serverTimestamp()
  }

  return normalized
}

function normalizeConsentSnapshot(consents?: ConsentSnapshot) {
  if (!consents) return undefined

  const privacy = normalizeConsentRecord(consents.privacy)
  const marketing = normalizeConsentRecord(consents.marketing)

  return {
    ...(privacy ? { privacy } : {}),
    ...(marketing ? { marketing } : {}),
  }
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

function toTargetCountries(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3)
}

export function buildCompanyInfoRecord(
  form: CompanyInfoForm,
  investmentRows?: InvestmentInput[]
): CompanyInfoRecord {
  return {
    basic: {
      companyType: form.companyType,
      companyInfo: form.companyInfo,
      representativeSolution: form.representativeSolution,
      ceo: {
        name: form.ceoName,
        email: form.ceoEmail,
        phone: form.ceoPhone,
        age: toNumber(form.ceoAge),
        gender: form.ceoGender,
        nationality: form.ceoNationality,
        coRepresentative: {
          enabled: form.hasCoRepresentative === "예",
          name:
            form.hasCoRepresentative === "예" ? form.coRepresentativeName : "",
          birthDate:
            form.hasCoRepresentative === "예"
              ? form.coRepresentativeBirthDate
              : "",
          gender:
            form.hasCoRepresentative === "예"
              ? form.coRepresentativeGender
              : "",
          title:
            form.hasCoRepresentative === "예" ? form.coRepresentativeTitle : "",
        },
      },
      founderSerialNumber: toNumber(form.founderSerialNumber),
      website: form.website,
      foundedAt: form.foundedAt,
      businessNumber:
        form.companyType === "예비창업" ? "" : form.businessNumber,
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
    impact: {
      sdgPriority1: form.sdgPriority1,
      sdgPriority2: form.sdgPriority2,
      myscExpectation: form.myscExpectation,
    },
    globalExpansion: {
      targetCountries: toTargetCountries(form.targetCountries),
    },
    investments: (investmentRows ?? []).map((row) => ({
      stage: row.stage,
      date: toIsoDate(row.date),
      postMoney: toDecimalNumber(row.postMoney),
      majorShareholder: row.majorShareholder,
    })),
    vouchers: {
      exportVoucherHeld: form.exportVoucherHeld,
      exportVoucherAmount: form.exportVoucherAmount,
      exportVoucherUsageRate: form.exportVoucherUsageRate,
      innovationVoucherHeld: form.innovationVoucherHeld,
      innovationVoucherAmount: form.innovationVoucherAmount,
      innovationVoucherUsageRate: form.innovationVoucherUsageRate,
    },
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

export async function getSignupRequest(uid: string) {
  const ref = doc(db, "signupRequests", uid)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) {
    return null
  }
  return snapshot.data() as SignupRequest
}

export async function createSignupRequest(
  uid: string,
  role: Role,
  requestedRole: Role | null,
  email?: string | null,
  options?: {
    companyId?: string | null
    companyInfo?: CompanyInfoForm
    programIds?: string[]
    investmentRows?: InvestmentInput[]
    consultantInfo?: ConsultantSignupInfo
    consents?: ConsentSnapshot
  }
) {
  const companyId =
    requestedRole === "company"
      ? (options?.companyId ?? uid)
      : null

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
  const normalizedConsents = normalizeConsentSnapshot(options?.consents)
  if (normalizedConsents) {
    signupRequestData.consents = normalizedConsents
  }
  if (requestedRole === "company") {
    signupRequestData.companyInfo = options?.companyInfo ?? null
    signupRequestData.programIds = options?.programIds ?? []
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

  await setDoc(doc(db, "signupRequests", uid), signupRequestData, { merge: true })
}
