export type Role = "admin" | "company" | "consultant"
export type AuthProviderType = "password" | "google.com"

export type ConsentType = "privacy" | "marketing"

export type ConsentRecord = {
  consented: boolean
  consentedAt?: unknown
  version: string
  method: string
  userAgent?: string | null
}

export type ConsentSnapshot = {
  privacy?: ConsentRecord
  marketing?: ConsentRecord
}

export type UserProfile = {
  role: Role
  requestedRole?: Role | null
  active: boolean
  email?: string | null
  companyId?: string | null
  authProviders?: AuthProviderType[] | null
  consents?: ConsentSnapshot
}
