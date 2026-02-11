export type Role = "admin" | "company" | "consultant"

export type UserProfile = {
  role: Role
  requestedRole?: Role | null
  active: boolean
  email?: string | null
  companyId?: string | null
}
