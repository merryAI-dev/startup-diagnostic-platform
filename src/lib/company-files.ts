export type CompanyFileKind = "attachment" | "logo"

export function normalizeCompanyFileKind(value: unknown): CompanyFileKind {
  return value === "logo" ? "logo" : "attachment"
}

export function getCompanyFileExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? ""
}

export function isCompanyLogoPreviewable(name: string): boolean {
  return ["png", "jpg", "jpeg", "svg", "webp", "gif"].includes(
    getCompanyFileExtension(name)
  )
}
