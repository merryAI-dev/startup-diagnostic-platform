import { useNavigate } from "react-router-dom"
import { CompanyDashboard } from "@/components/dashboard/CompanyDashboard"
import { signOutUser } from "@/firebase/auth"
import { useAuth } from "@/context/AuthContext"

export function CompanyPage() {
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
