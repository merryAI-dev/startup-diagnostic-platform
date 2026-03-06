import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { onAuthStateChanged, type User } from "firebase/auth"
import { auth } from "@/firebase/client"
import { getUserProfile } from "@/firebase/profile"
import type { UserProfile } from "@/types/auth"

type AuthState = {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  async function refreshProfile() {
    if (!auth.currentUser) {
      setProfile(null)
      return
    }
    try {
      const nextProfile = await getUserProfile(auth.currentUser.uid)
      setProfile(nextProfile)
    } catch {
      setProfile(null)
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser)
      if (nextUser) {
        try {
          const nextProfile = await getUserProfile(nextUser.uid)
          setProfile(nextProfile)
        } catch {
          setProfile(null)
        }
      } else {
        setProfile(null)
      }
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  const value = useMemo(
    () => ({ user, profile, loading, refreshProfile }),
    [user, profile, loading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider")
  }
  return ctx
}
