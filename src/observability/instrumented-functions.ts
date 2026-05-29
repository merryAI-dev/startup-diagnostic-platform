import { readFirebaseErrorCode } from "@/firebase/errors"
import { recordTelemetryEvent } from "@/observability/client"

export async function callWithTelemetry<TPayload, TResult>(
  functionName: string,
  callable: (payload: TPayload) => Promise<{ data: TResult }>,
  payload: TPayload,
) {
  const startedAt = performance.now()
  try {
    const result = await callable(payload)
    return result.data
  } catch (error) {
    await recordTelemetryEvent({
      eventType: "function_error",
      severity: "error",
      functionName,
      durationMs: Math.round(performance.now() - startedAt),
      message: error instanceof Error ? error.message : String(error),
      errorCode: readFirebaseErrorCode(error) || null,
    })
    throw error
  }
}

