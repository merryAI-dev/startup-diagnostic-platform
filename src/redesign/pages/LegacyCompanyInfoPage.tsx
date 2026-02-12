import { useNavigate } from "react-router-dom"
import { CompanyDashboard } from "@/components/dashboard/CompanyDashboard"
import { useAuth } from "@/context/AuthContext"
import { signOutUser } from "@/firebase/auth"

export function LegacyCompanyInfoPage() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()

  async function handleLogout() {
    await signOutUser()
    navigate("/login")
  }

  if (!user || !profile?.companyId) {
    return null
  }

  return (
    <CompanyDashboard
      onLogout={handleLogout}
      companyId={profile.companyId}
      user={user}
    />
  )
}
