import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "@/redesign/app/lib/firebase";
import { ConsultantAvailability, User } from "@/redesign/app/lib/types";
import type { CompanyInfoForm, CompanyInfoRecord } from "@/types/company";

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  signIn: (email: string, password?: string) => Promise<void>;
  signUp: (payload: SignupPayload) => Promise<void>;
  signOut: () => Promise<void>;
  updateUserRole: (userId: string, role: string) => Promise<void>;
}

type SignupPayload =
  | {
      role: "company";
      email: string;
      password: string;
      programName: string;
      companyInfo: CompanyInfoForm;
    }
  | {
      role: "consultant";
      email: string;
      password: string;
      consultantInfo: ConsultantSignupInfo;
    };

type ConsultantSignupInfo = {
  name: string;
  organization: string;
  email: string;
  phone: string;
  secondaryEmail: string;
  secondaryPhone: string;
  fixedMeetingLink: string;
  expertise: string;
  bio: string;
};

function toNumber(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return null;
  return Number(digits);
}

function toSignedNumber(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized || normalized === "-") return null;
  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function toDecimalNumber(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) return null;
  return Math.round(parsed * 10) / 10;
}

function buildCompanyInfoRecord(form: CompanyInfoForm): CompanyInfoRecord {
  return {
    basic: {
      companyType: form.companyType,
      companyInfo: form.companyInfo,
      representativeSolution: form.representativeSolution,
      ceo: {
        name: form.ceoName,
        email: form.ceoEmail,
        phone: form.ceoPhone,
        birthDate: form.ceoBirthDate,
        age: toNumber(form.ceoAge),
        gender: form.ceoGender,
        nationality: form.ceoNationality,
        coRepresentative: {
          enabled: form.hasCoRepresentative === "예",
          name:
            form.hasCoRepresentative === "예" ? form.coRepresentativeName : "",
          birthDate:
            form.hasCoRepresentative === "예"
              ? form.coRepresentativeBirthDate
              : "",
          gender:
            form.hasCoRepresentative === "예"
              ? form.coRepresentativeGender
              : "",
          title:
            form.hasCoRepresentative === "예" ? form.coRepresentativeTitle : "",
        },
      },
      founderSerialNumber: toNumber(form.founderSerialNumber),
      foundedAt: form.foundedAt,
      businessNumber:
        form.companyType === "예비창업" ? "" : form.businessNumber,
      primaryBusiness: form.primaryBusiness,
      primaryIndustry: form.primaryIndustry,
      website: form.website,
    },
    locations: {
      headOffice: form.headOffice,
      branchOrLab: form.branchOffice,
    },
    workforce: {
      fullTime: toNumber(form.workforceFullTime),
      contract: toNumber(form.workforceContract),
    },
    finance: {
      revenue: {
        y2025: toDecimalNumber(form.revenue2025),
        y2026: toDecimalNumber(form.revenue2026),
      },
      capitalTotal: toSignedNumber(form.capitalTotal),
    },
    certifications: {
      designation: form.certification,
      tipsLipsHistory: form.tipsLipsHistory,
    },
    impact: {
      sdgPriority1: form.sdgPriority1,
      sdgPriority2: form.sdgPriority2,
      myscExpectation: form.myscExpectation,
    },
    globalExpansion: {
      targetCountries: [],
    },
    investments: [],
    vouchers: {
      exportVoucherHeld: form.exportVoucherHeld,
      exportVoucherAmount: form.exportVoucherAmount,
      exportVoucherUsageRate: form.exportVoucherUsageRate,
      innovationVoucherHeld: form.innovationVoucherHeld,
      innovationVoucherAmount: form.innovationVoucherAmount,
      innovationVoucherUsageRate: form.innovationVoucherUsageRate,
    },
    fundingPlan: {
      desiredAmount2026: toDecimalNumber(form.desiredInvestment2026),
      preValue: toDecimalNumber(form.desiredPreValue),
    },
    metadata: {
      updatedAt: serverTimestamp(),
      saveType: "final",
    },
  };
}

function buildDefaultAvailability(): ConsultantAvailability[] {
  const scheduleDays = [2, 4];
  const timeSlots = Array.from({ length: 9 }, (_, index) => {
    const startHour = 9 + index;
    const endHour = startHour + 1;
    return {
      start: `${String(startHour).padStart(2, "0")}:00`,
      end: `${String(endHour).padStart(2, "0")}:00`,
      available: false,
    };
  });
  return scheduleDays.map((day) => ({
    dayOfWeek: day,
    slots: timeSlots,
  }));
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
      setUser(null);
      setFirebaseUser(null);
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setFirebaseUser(firebaseUser);
      
      if (firebaseUser) {
        const appUser = await loadUserFromFirestore(firebaseUser);
        setUser(appUser);
      } else {
        setUser(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 로그인 (Firebase 전용)
  const signIn = async (email: string, password?: string) => {
    if (!isFirebaseConfigured || !auth) {
      throw new Error("Firebase가 설정되지 않았습니다");
    }
    if (!password) {
      throw new Error("Password is required for Firebase authentication");
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const appUser = await loadUserFromFirestore(userCredential.user);

      if (!appUser) {
        throw new Error("User data not found in Firestore");
      }

      if (db) {
        await setDoc(doc(db, "users", userCredential.user.uid), {
          lastLoginAt: new Date().toISOString(),
        }, { merge: true });
      }
    } catch (error: any) {
      console.error("Firebase login error:", error);
      throw new Error(error.message || "로그인에 실패했습니다");
    }
  };

  // 회원가입 (Firebase 전용)
  const signUp = async (payload: SignupPayload) => {
    if (!isFirebaseConfigured || !auth || !db) {
      throw new Error("Firebase가 설정되지 않았습니다");
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        payload.email,
        payload.password
      );

      let newUser: Omit<User, "id">;

      if (payload.role === "company") {
        const companyName = payload.companyInfo.companyInfo.trim();
        newUser = {
          email: payload.email,
          companyName,
          programName: payload.programName,
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

        const companyInfo = buildCompanyInfoRecord(payload.companyInfo);
        await setDoc(
          doc(db, "companies", userCredential.user.uid, "companyInfo", "info"),
          {
            ...companyInfo,
            metadata: {
              ...companyInfo.metadata,
              createdAt: serverTimestamp(),
            },
          },
          { merge: true }
        );
        await setDoc(
          doc(db, "companies", userCredential.user.uid),
          {
            name: companyName || null,
            ownerUid: userCredential.user.uid,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        const consultantName = payload.consultantInfo.name.trim();
        const consultantEmail = payload.consultantInfo.email.trim();
        const organization = payload.consultantInfo.organization.trim();
        newUser = {
          email: payload.email,
          companyName: organization || "컨설턴트",
          programName: "컨설턴트",
          role: "consultant",
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

        await setDoc(
          doc(db, "consultants", userCredential.user.uid),
          {
            name: consultantName,
            title: "컨설턴트",
            email: consultantEmail || payload.email,
            phone: payload.consultantInfo.phone.trim() || null,
            organization: organization || null,
            secondaryEmail: payload.consultantInfo.secondaryEmail.trim() || null,
            secondaryPhone: payload.consultantInfo.secondaryPhone.trim() || null,
            fixedMeetingLink: payload.consultantInfo.fixedMeetingLink.trim() || null,
            expertise: payload.consultantInfo.expertise
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            bio: payload.consultantInfo.bio.trim() || `${consultantName} 컨설턴트`,
            status: "active",
            availability: buildDefaultAvailability(),
            joinedDate: new Date().toISOString(),
          },
          { merge: true }
        );
      }

      await setDoc(doc(db, "users", userCredential.user.uid), newUser);

      const appUser: User = {
        id: userCredential.user.uid,
        ...newUser,
      };
      
      setUser(appUser);
      
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
