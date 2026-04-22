import { OfficeHourReport } from "@/redesign/app/lib/types"

export function getCompletedHoursByProgram(reports: OfficeHourReport[]) {
  const completedHoursByProgram = new Map<string, number>()

  reports.forEach((report) => {
    if (!report.programId) return
    const duration = report.duration
    const normalizedDuration =
      typeof duration === "number" && Number.isFinite(duration) && duration > 0 ? duration : 0
    const currentHours = completedHoursByProgram.get(report.programId) ?? 0
    completedHoursByProgram.set(report.programId, currentHours + normalizedDuration)
  })

  return completedHoursByProgram
}
