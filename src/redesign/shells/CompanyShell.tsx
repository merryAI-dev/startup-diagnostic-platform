import { Toaster } from "sonner"
import { AppContent } from "@/redesign/app/AppContent"

export function CompanyShell() {
  return (
    <>
      <AppContent roleOverride="user" />
      <Toaster position="top-center" />
    </>
  )
}
