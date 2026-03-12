import { Application } from "@/redesign/app/lib/types"

const DEFAULT_SESSION_DURATION_HOURS = 2

export function getApplicationDurationHours(application: Application) {
  const duration = application.duration
  if (typeof duration === "number" && Number.isFinite(duration) && duration > 0) {
    return duration
  }
  return DEFAULT_SESSION_DURATION_HOURS
}

export function getCompletedHoursByProgram(applications: Application[]) {
  const completedHoursByProgram = new Map<string, number>()

  applications.forEach((application) => {
    if (application.status !== "completed" || !application.programId) return
    const currentHours = completedHoursByProgram.get(application.programId) ?? 0
    completedHoursByProgram.set(
      application.programId,
      currentHours + getApplicationDurationHours(application),
    )
  })

  return completedHoursByProgram
}
