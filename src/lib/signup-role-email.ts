import type { Role } from "@/types/auth"

const ADMIN_EMAIL_PATTERN = /^[^@\s]+_admin@mysc\.co\.kr$/i

export function isAdminSignupEmail(email: string) {
  return ADMIN_EMAIL_PATTERN.test(email.trim())
}

export function getSignupRoleEmailError(role: Role, email: string) {
  const normalizedEmail = email.trim()
  if (!normalizedEmail) return null

  const adminEmail = isAdminSignupEmail(normalizedEmail)
  if (role === "admin" && !adminEmail) {
    return "관리자 계정은 ${id}_admin@mysc.co.kr 형식으로만 가입할 수 있습니다."
  }
  if (role !== "admin" && adminEmail) {
    return "관리자 이메일 형식(_admin)은 관리자 역할로만 가입할 수 있습니다."
  }
  return null
}
