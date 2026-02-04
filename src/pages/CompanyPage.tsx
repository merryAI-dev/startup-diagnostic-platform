import { useNavigate } from "react-router-dom"
import { CompanyDashboard } from "../components/dashboard/CompanyDashboard"
import { signOutUser } from "../firebase/auth"

export function CompanyPage() {
  const navigate = useNavigate()

  async function handleLogout() {
    await signOutUser()
    navigate("/login")
  }

  return <CompanyDashboard onLogout={handleLogout} />
}
