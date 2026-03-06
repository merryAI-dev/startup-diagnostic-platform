import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore"
import { db } from "@/firebase/client"
import type { ConsentSnapshot, Role, UserProfile } from "@/types/auth"
import type { CompanyInfoForm, CompanyInfoRecord, InvestmentInput } from "@/types/company"

const collectionName = "profiles"

type ConsultantSignupInfo = {
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

function buildCompanyInfoRecord(
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
      date: row.date,
      postMoney: toNumber(row.postMoney),
      majorShareholder: row.majorShareholder,
    })),
    fundingPlan: {
      desiredAmount2026: toNumber(form.desiredInvestment2026),
      preValue: toNumber(form.desiredPreValue),
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
  let companyId: string | null = null
  if (requestedRole === "company") {
    const providedCompanyId = options?.companyId ?? null
    if (providedCompanyId) {
      companyId = providedCompanyId
      const companyName = options?.companyInfo?.companyInfo?.trim() || null
      await setDoc(
        doc(db, "companies", companyId),
        {
          ownerUid: uid,
          name: companyName,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
      if (options?.companyInfo) {
        const companyInfo = buildCompanyInfoRecord(
          options.companyInfo,
          options.investmentRows
        )
        await setDoc(
          doc(db, "companies", companyId, "companyInfo", "info"),
          {
            ...companyInfo,
            metadata: {
              ...companyInfo.metadata,
              createdAt: serverTimestamp(),
            },
          },
          { merge: true }
        )
      }
    } else {
      const companyName = options?.companyInfo?.companyInfo?.trim() || null
      const companyRef = await addDoc(collection(db, "companies"), {
        ownerUid: uid,
        name: companyName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      companyId = companyRef.id
      if (options?.companyInfo) {
        const companyInfo = buildCompanyInfoRecord(
          options.companyInfo,
          options.investmentRows
        )
        await setDoc(
          doc(db, "companies", companyId, "companyInfo", "info"),
          {
            ...companyInfo,
            metadata: {
              ...companyInfo.metadata,
              createdAt: serverTimestamp(),
            },
          },
          { merge: true }
        )
      }
    }
  } else if (requestedRole === "consultant" && options?.consultantInfo) {
    const consultantName = options.consultantInfo.name.trim()
    const consultantPrimaryEmail =
      (email ?? "").trim()
      || options.consultantInfo.email.trim()
      || null
    await setDoc(
      doc(db, "consultants", uid),
      {
        name: consultantName,
        title: "컨설턴트",
        email: consultantPrimaryEmail,
        phone: options.consultantInfo.phone.trim() || null,
        organization: options.consultantInfo.organization.trim() || null,
        secondaryEmail: options.consultantInfo.secondaryEmail.trim() || null,
        secondaryPhone: options.consultantInfo.secondaryPhone.trim() || null,
        fixedMeetingLink: options.consultantInfo.fixedMeetingLink.trim() || null,
        expertise: options.consultantInfo.expertise
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        bio: options.consultantInfo.bio.trim() || `${consultantName} 컨설턴트`,
        status: "active",
        joinedDate: serverTimestamp(),
      },
      { merge: true }
    )
  }
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
  await setDoc(ref, profileData)

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
