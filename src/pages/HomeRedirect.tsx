import { Navigate } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import { LoadingScreen } from "../components/auth/RouteGuards"

export function HomeRedirect() {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return <LoadingScreen />
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }
  if (!profile) {
    return <Navigate to="/signup" replace />
  }
  if (!profile.active) {
    return <Navigate to="/pending" replace />
  }
  return (
    <Navigate
      to={profile.role === "admin" ? "/admin" : "/company"}
      replace
    />
  )
}
