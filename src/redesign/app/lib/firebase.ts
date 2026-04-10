import {
  initializeApp,
  getApps,
  getApp,
  FirebaseApp,
} from "firebase/app";
import {
  getAuth,
  Auth,
  GoogleAuthProvider,
} from "firebase/auth";
import {
  getFirestore,
  Firestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  CACHE_SIZE_UNLIMITED,
  connectFirestoreEmulator,
} from "firebase/firestore";
import {
  connectFunctionsEmulator,
  Functions,
  getFunctions,
} from "firebase/functions";
import { getStorage, FirebaseStorage } from "firebase/storage";

// ──────────────────────────────────────────────
// Firebase Configuration
// ──────────────────────────────────────────────
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "mysc-reserve.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "mysc-reserve",
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    "mysc-reserve.appspot.com",
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

// Firebase가 실제로 설정되어 있는지 판별
const isFirebaseConfigured =
  !!firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== "" &&
  firebaseConfig.apiKey !== "your_api_key_here";
const disableFirestorePersistence =
  import.meta.env.VITE_DISABLE_FIRESTORE_PERSISTENCE === "true";

// ──────────────────────────────────────────────
// Initialize Firebase App
// ──────────────────────────────────────────────
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let functions: Functions | null = null;
let googleProvider: GoogleAuthProvider | null = null;

if (isFirebaseConfigured) {
  try {
    if (getApps().length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }

    // ── Auth ──
    auth = getAuth(app);

    // ── Firestore (500-user optimized) ──
    if (disableFirestorePersistence) {
      db = getFirestore(app);
    } else {
      try {
        db = initializeFirestore(app, {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
            cacheSizeBytes: CACHE_SIZE_UNLIMITED,
          }),
        });
      } catch {
        // 이미 초기화된 경우 기존 인스턴스 사용
        db = getFirestore(app);
      }
    }

    // Emulator 연결 (개발 모드)
    if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true") {
      connectFirestoreEmulator(db, "localhost", 8080);
    }

    // ── Storage ──
    storage = getStorage(app);

    // ── Functions ──
    functions = getFunctions(
      app,
      import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "asia-northeast3"
    );

    // ── Google Auth Provider ──
    googleProvider = new GoogleAuthProvider();

    if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true") {
      connectFunctionsEmulator(functions, "localhost", 5001);
    }

    console.log("✅ Firebase initialized (Offline persistence + Multi-tab)");
  } catch (error) {
    console.warn("⚠️ Firebase initialization error:", error);
  }
} else {
  console.info("ℹ️ Firebase API key not set — running in Mock mode");
}

// ──────────────────────────────────────────────
// Firestore Collection Names
// ──────────────────────────────────────────────
export const COLLECTIONS = {
  USERS: "users",
  APPLICATIONS: "applications",
  CALENDAR_EVENTS: "calendarEvents",
  NOTIFICATIONS: "notifications",
  CHAT_ROOMS: "chatRooms",
  CHAT_MESSAGES: "chatMessages",
  GOALS: "goals",
  TEAM_MEMBERS: "teamMembers",
  CONSULTANTS: "consultants",
  PROGRAMS: "programs",
  AGENDAS: "agendas",
  OFFICE_HOUR_APPLICATIONS: "officeHourApplications",
  REPORTS: "reports",
  MESSAGES: "messages",
  TEMPLATES: "messageTemplates",
  AI_RECOMMENDATIONS: "aiRecommendations",
  // Sub-collections
  ACTIVITY_LOG: "activityLog",
} as const;

// ──────────────────────────────────────────────
// Firestore 인덱스 권장 사항 (README 출력)
// ──────────────────────────────────────────────
export const RECOMMENDED_INDEXES = [
  { collection: "applications", fields: ["status", "createdAt"] },
  { collection: "applications", fields: ["programId", "status"] },
  { collection: "calendarEvents", fields: ["userId", "start"] },
  { collection: "calendarEvents", fields: ["start", "end"] },
  { collection: "notifications", fields: ["userId", "isRead", "createdAt"] },
  { collection: "chatMessages", fields: ["chatRoomId", "createdAt"] },
  { collection: "goals", fields: ["status", "priority"] },
];

export { app, auth, db, storage, functions, googleProvider, isFirebaseConfigured };
export default app;
