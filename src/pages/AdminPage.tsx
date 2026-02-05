import { useNavigate } from "react-router-dom"
import { AdminDashboard } from "../components/dashboard/AdminDashboard"
import { signOutUser } from "../firebase/auth"
import { useAuth } from "../context/AuthContext"

export function AdminPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  async function handleLogout() {
    await signOutUser()
    navigate("/login")
  }

  if (!user) {
    return null
  }

  return (
    <AdminDashboard
      user={user}
      onLogout={handleLogout}
    />
  )
}
