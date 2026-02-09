import { useNavigate } from "react-router-dom"
import { AdminDashboard } from "../../components/dashboard/AdminDashboard"
import { useAuth } from "../../context/AuthContext"
import { signOutUser } from "../../firebase/auth"

export function LegacyAdminDashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  async function handleLogout() {
    await signOutUser()
    navigate("/login")
  }

  if (!user) {
    return null
  }

  return <AdminDashboard user={user} onLogout={handleLogout} />
}
