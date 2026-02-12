import { Toaster } from "sonner"
import { AppContent } from "@/redesign/app/AppContent"

export function AdminShell() {
  return (
    <>
      <AppContent />
      <Toaster position="top-center" />
    </>
  )
}
