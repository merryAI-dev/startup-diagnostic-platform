export const FIREBASE_NOT_CONFIGURED_CODE = "auth/firebase-not-configured"

export function createFirebaseNotConfiguredError() {
  return {
    code: FIREBASE_NOT_CONFIGURED_CODE,
    message: "Firebase environment variables are not configured.",
  }
}

export function readFirebaseErrorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code
  }

  return ""
}
