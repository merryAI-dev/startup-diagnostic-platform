import { useNavigate } from "react-router-dom"
import { useState } from "react"
import { AdminDashboard } from "../components/dashboard/AdminDashboard"
import { signOutUser } from "../firebase/auth"
import { activateUserProfile } from "../firebase/profile"

export function AdminPage() {
  const navigate = useNavigate()
  const [approvalLoading, setApprovalLoading] = useState(false)
  const [approvalError, setApprovalError] = useState<string | null>(null)

  async function handleLogout() {
    await signOutUser()
    navigate("/login")
  }

  async function handleApprove(uid: string) {
    setApprovalLoading(true)
    setApprovalError(null)
    try {
      await activateUserProfile(uid.trim())
    } catch (err) {
      setApprovalError("승인 처리에 실패했습니다.")
    } finally {
      setApprovalLoading(false)
    }
  }

  return (
    <AdminDashboard
      onLogout={handleLogout}
      onApprove={handleApprove}
      approvalLoading={approvalLoading}
      approvalError={approvalError}
    />
  )
}
