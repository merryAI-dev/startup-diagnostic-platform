import { ProgramKpiDefinition } from "@/redesign/app/lib/types"

export type ProgramMetricDefinition = ProgramKpiDefinition

export type ProgramMetricRow = {
  month: number
  year: number
  values: Record<string, number>
}

export type ProgramMetricRecord = {
  programId: string
  programName: string
  definitions: ProgramMetricDefinition[]
  rows: ProgramMetricRow[]
}

export type PersistedProgramMetricMap = Record<
  string,
  {
    programId: string
    programName: string
    rows: ProgramMetricRow[]
    definitions?: ProgramKpiDefinition[]
  }
>

type ProgramMetricSource = {
  id: string
  name: string
  kpiDefinitions?: ProgramKpiDefinition[]
}

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1)

export function buildProgramMetricFieldKey(programId: string, metricId: string) {
  return `program:${programId}:${metricId}`
}

export function createEmptyProgramMetricRow(year: number, month: number): ProgramMetricRow {
  return {
    month,
    year,
    values: {},
  }
}

export function normalizeProgramMetricRows(value: unknown, year: number): ProgramMetricRow[] {
  if (!Array.isArray(value)) {
    return MONTHS.map((month) => createEmptyProgramMetricRow(year, month))
  }

  const rowsByMonth = new Map<number, ProgramMetricRow>()

  value.forEach((row) => {
    if (!row || typeof row !== "object") {
      return
    }

    const month = typeof row.month === "number" ? row.month : Number(row.month)
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return
    }

    const values =
      row.values && typeof row.values === "object"
        ? Object.fromEntries(
            Object.entries(row.values as Record<string, unknown>).map(([key, item]) => [
              key,
              typeof item === "number" && Number.isFinite(item) ? item : 0,
            ]),
          )
        : {}

    rowsByMonth.set(month, {
      month,
      year: typeof row.year === "number" ? row.year : year,
      values,
    })
  })

  return MONTHS.map((month) => {
    const existing = rowsByMonth.get(month)
    if (existing) {
      return {
        month,
        year,
        values: { ...existing.values },
      }
    }

    return createEmptyProgramMetricRow(year, month)
  })
}

export function normalizeProgramMetricDefinitions(value: unknown): ProgramMetricDefinition[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter(
      (definition): definition is ProgramKpiDefinition =>
        typeof definition?.id === "string" &&
        typeof definition?.label === "string",
    )
    .map((definition) => ({
      id: definition.id,
      label: definition.label.trim() || definition.id,
      description: typeof definition.description === "string" ? definition.description.trim() : "",
      active: definition.active !== false,
    }))
}

export function createProgramMetricRecord(
  programId: string,
  programName: string,
  year: number,
  source?: {
    definitions?: unknown
    rows?: unknown
  } | null,
): ProgramMetricRecord {
  return {
    programId,
    programName: programName.trim() || programId,
    definitions: normalizeProgramMetricDefinitions(source?.definitions),
    rows: normalizeProgramMetricRows(source?.rows, year),
  }
}

export function normalizeProgramMetrics(
  source: PersistedProgramMetricMap | null | undefined,
  participatingPrograms: ProgramMetricSource[],
  year: number,
): Record<string, ProgramMetricRecord> {
  const next: Record<string, ProgramMetricRecord> = {}

  if (source && typeof source === "object") {
    Object.entries(source).forEach(([programId, record]) => {
      if (!record || typeof record !== "object") {
        return
      }

      const normalizedProgramId =
        typeof record.programId === "string" && record.programId.trim().length > 0
          ? record.programId.trim()
          : programId
      const matchedProgram = participatingPrograms.find((program) => program.id === normalizedProgramId)

      next[normalizedProgramId] = createProgramMetricRecord(
        normalizedProgramId,
        typeof record.programName === "string" && record.programName.trim().length > 0
          ? record.programName
          : matchedProgram?.name ?? normalizedProgramId,
        year,
        {
          definitions: matchedProgram?.kpiDefinitions ?? [],
          rows: record.rows,
        },
      )
    })
  }

  participatingPrograms.forEach((program) => {
    const existingRecord = next[program.id]
    if (existingRecord) {
      next[program.id] = {
        ...existingRecord,
        programName: program.name,
        definitions: normalizeProgramMetricDefinitions(program.kpiDefinitions ?? []),
      }
      return
    }

    next[program.id] = createProgramMetricRecord(program.id, program.name, year, {
      definitions: program.kpiDefinitions ?? [],
    })
  })

  return next
}

export function hasProgramMetricContent(record: ProgramMetricRecord): boolean {
  return record.rows.some((row) =>
    Object.values(row.values).some((value) => typeof value === "number" && value !== 0),
  )
}

export function serializeProgramMetrics(records: Record<string, ProgramMetricRecord>) {
  const entries = Object.values(records)
    .filter(hasProgramMetricContent)
    .map((record) => [
      record.programId,
      {
        programId: record.programId,
        programName: record.programName,
        rows: record.rows.map((row) => ({
          month: row.month,
          year: row.year,
          values: { ...row.values },
        })),
      },
    ] as const)

  return entries.length > 0 ? Object.fromEntries(entries) : {}
}
