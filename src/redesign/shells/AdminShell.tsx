import { Toaster } from "sonner"
import { AppContent } from "../app/AppContent"

export function AdminShell() {
  return (
    <>
      <AppContent />
      <Toaster position="top-center" />
    </>
  )
}
