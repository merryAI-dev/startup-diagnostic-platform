export type Role = "admin" | "company"

export type UserProfile = {
  role: Role
  requestedRole?: Role | null
  active: boolean
  email?: string | null
}
