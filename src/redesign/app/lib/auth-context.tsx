import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "./firebase";
import { User } from "./types";
import { initialUsers } from "./data";

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  signIn: (email: string, password?: string) => Promise<void>;
  signUp: (email: string, password: string, companyName: string, programName: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateUserRole: (userId: string, role: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Firebase 사용자 → 앱 사용자 변환
  const loadUserFromFirestore = async (firebaseUser: FirebaseUser): Promise<User | null> => {
    if (!db) return null;

    try {
      const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        return {
          id: firebaseUser.uid,
          email: firebaseUser.email || "",
          companyName: userData.companyName || "",
          programName: userData.programName || "",
          role: userData.role || "user",
          permissions: userData.permissions || {
            canViewAllApplications: false,
            canManageConsultants: false,
            canManagePrograms: false,
          },
          status: userData.status || "active",
          programs: userData.programs || [],
          createdAt: userData.createdAt || new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
        };
      }
      
      return null;
    } catch (error) {
      console.error("Error loading user from Firestore:", error);
      return null;
    }
  };

  // Firebase Auth State 변경 감지
  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      // Firebase 미설정시 로컬스토리지에서 로드
      const savedUser = localStorage.getItem("mysc-user");
      if (savedUser) {
        try {
          const parsedUser = JSON.parse(savedUser);
          // Date 객체가 포함되어 있을 수 있으므로 문자열로 변환
          const sanitizedUser = {
            ...parsedUser,
            createdAt: typeof parsedUser.createdAt === 'string' 
              ? parsedUser.createdAt 
              : (parsedUser.createdAt instanceof Date 
                  ? parsedUser.createdAt.toISOString() 
                  : new Date().toISOString()),
            lastLoginAt: typeof parsedUser.lastLoginAt === 'string'
              ? parsedUser.lastLoginAt
              : (parsedUser.lastLoginAt instanceof Date
                  ? parsedUser.lastLoginAt.toISOString()
                  : new Date().toISOString()),
          };
          setUser(sanitizedUser);
        } catch (error) {
          console.error("Error parsing saved user:", error);
          // 파싱 에러 시 localStorage 클리어
          localStorage.removeItem("mysc-user");
        }
      }
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setFirebaseUser(firebaseUser);
      
      if (firebaseUser) {
        const appUser = await loadUserFromFirestore(firebaseUser);
        setUser(appUser);
        if (appUser) {
          localStorage.setItem("mysc-user", JSON.stringify(appUser));
        }
      } else {
        setUser(null);
        localStorage.removeItem("mysc-user");
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 로그인 (Firebase 또는 Mock)
  const signIn = async (email: string, password?: string) => {
    if (isFirebaseConfigured && auth) {
      // Firebase 로그인
      if (!password) {
        throw new Error("Password is required for Firebase authentication");
      }
      
      try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const appUser = await loadUserFromFirestore(userCredential.user);
        
        if (!appUser) {
          throw new Error("User data not found in Firestore");
        }
        
        // Firestore에 마지막 로그인 시간 업데이트
        if (db) {
          await setDoc(doc(db, "users", userCredential.user.uid), {
            lastLoginAt: new Date().toISOString(),
          }, { merge: true });
        }
        
      } catch (error: any) {
        console.error("Firebase login error:", error);
        throw new Error(error.message || "로그인에 실패했습니다");
      }
    } else {
      // Mock 로그인 (비밀번호 없이 이메일만)
      const mockUser = initialUsers.find(u => u.email === email);
      if (mockUser) {
        // Date 객체를 문자열로 변환
        const userToSave = {
          ...mockUser,
          createdAt: typeof mockUser.createdAt === 'string' 
            ? mockUser.createdAt 
            : mockUser.createdAt.toISOString(),
          lastLoginAt: typeof mockUser.lastLoginAt === 'string'
            ? mockUser.lastLoginAt
            : mockUser.lastLoginAt.toISOString(),
        };
        setUser(userToSave);
        localStorage.setItem("mysc-user", JSON.stringify(userToSave));
      } else {
        throw new Error("등록되지 않은 이메일입니다");
      }
    }
  };

  // 회원가입 (Firebase 전용)
  const signUp = async (email: string, password: string, companyName: string, programName: string) => {
    if (!isFirebaseConfigured || !auth || !db) {
      throw new Error("Firebase가 설정되지 않았습니다");
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Firestore에 사용자 정보 저장
      const newUser: Omit<User, "id"> = {
        email,
        companyName,
        programName,
        role: "user",
        permissions: {
          canViewAllApplications: false,
          canManageConsultants: false,
          canManagePrograms: false,
        },
        status: "active",
        programs: [],
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };
      
      await setDoc(doc(db, "users", userCredential.user.uid), newUser);
      
      const appUser: User = {
        id: userCredential.user.uid,
        ...newUser,
      };
      
      setUser(appUser);
      localStorage.setItem("mysc-user", JSON.stringify(appUser));
      
    } catch (error: any) {
      console.error("Firebase signup error:", error);
      throw new Error(error.message || "회원가입에 실패했습니다");
    }
  };

  // 로그아웃
  const signOut = async () => {
    if (isFirebaseConfigured && auth) {
      await firebaseSignOut(auth);
    }
    setUser(null);
    setFirebaseUser(null);
    localStorage.removeItem("mysc-user");
  };

  // 사용자 역할 업데이트 (관리자 전용)
  const updateUserRole = async (userId: string, role: string) => {
    if (!isFirebaseConfigured || !db) {
      throw new Error("Firebase가 설정되지 않았습니다");
    }

    try {
      await setDoc(doc(db, "users", userId), {
        role,
        permissions: getRolePermissions(role),
      }, { merge: true });
      
      // 현재 사용자가 업데이트된 사용자인 경우 로컬 상태 업데이트
      if (user?.id === userId) {
        const updatedUser = {
          ...user,
          role,
          permissions: getRolePermissions(role),
        };
        setUser(updatedUser);
        localStorage.setItem("mysc-user", JSON.stringify(updatedUser));
      }
    } catch (error) {
      console.error("Error updating user role:", error);
      throw error;
    }
  };

  const value = {
    user,
    firebaseUser,
    loading,
    signIn,
    signUp,
    signOut,
    updateUserRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// 역할별 권한 매핑
function getRolePermissions(role: string) {
  switch (role) {
    case "admin":
      return {
        canViewAllApplications: true,
        canManageConsultants: true,
        canManagePrograms: true,
      };
    case "consultant":
    case "staff":
      return {
        canViewAllApplications: true,
        canManageConsultants: false,
        canManagePrograms: false,
      };
    default:
      return {
        canViewAllApplications: false,
        canManageConsultants: false,
        canManagePrograms: false,
      };
  }
}