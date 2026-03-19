import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { onAuthStateChanged, type User } from "firebase/auth"
import { auth } from "@/firebase/client"
import { getSignupRequest, getUserProfile } from "@/firebase/profile"
import type { SignupRequest, UserProfile } from "@/types/auth"

type AuthState = {
  user: User | null
  profile: UserProfile | null
  signupRequest: SignupRequest | null
  loading: boolean
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [signupRequest, setSignupRequest] = useState<SignupRequest | null>(null)
  const [loading, setLoading] = useState(true)

  async function refreshProfile() {
    if (!auth.currentUser) {
      setProfile(null)
      setSignupRequest(null)
      return
    }
    try {
      const [nextProfile, nextSignupRequest] = await Promise.all([
        getUserProfile(auth.currentUser.uid),
        getSignupRequest(auth.currentUser.uid),
      ])
      setProfile(nextProfile)
      setSignupRequest(nextSignupRequest)
    } catch {
      setProfile(null)
      setSignupRequest(null)
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser)
      if (nextUser) {
        try {
          const [nextProfile, nextSignupRequest] = await Promise.all([
            getUserProfile(nextUser.uid),
            getSignupRequest(nextUser.uid),
          ])
          setProfile(nextProfile)
          setSignupRequest(nextSignupRequest)
        } catch {
          setProfile(null)
          setSignupRequest(null)
        }
      } else {
        setProfile(null)
        setSignupRequest(null)
      }
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  const value = useMemo(
    () => ({ user, profile, signupRequest, loading, refreshProfile }),
    [user, profile, signupRequest, loading]
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
