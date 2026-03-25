import {
  Firestore,
  doc,
  getDoc,
  query,
  collection,
  getDocs,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore"

type CompanyProgramRecord = {
  id: string
  programs?: string[]
  ownerUid?: string | null
}

function normalizeStringArray(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  )
}

function buildCompanyAliasMap(companies: CompanyProgramRecord[]) {
  const map = new Map<string, string>()

  companies.forEach((company) => {
    map.set(company.id, company.id)
    if (company.ownerUid) {
      map.set(company.ownerUid, company.id)
    }
  })

  return map
}

function normalizeCompanyIds(companyIds: string[], companies: CompanyProgramRecord[]) {
  const aliasMap = buildCompanyAliasMap(companies)
  return normalizeStringArray(companyIds).map((companyId) => aliasMap.get(companyId) ?? companyId)
}

export function getCompanyIdsByProgram(companies: CompanyProgramRecord[], programId: string) {
  return companies
    .filter((company) => company.programs?.includes(programId))
    .map((company) => company.id)
}

export async function replaceCompanyPrograms(params: {
  db: Firestore
  companyId: string
  nextProgramIds: string[]
  companyName?: string | null
}) {
  const { db, companyId, nextProgramIds, companyName } = params
  const companyRef = doc(db, "companies", companyId)
  const companySnap = await getDoc(companyRef)
  const companyData = companySnap.exists() ? companySnap.data() : {}
  const ownerUid =
    typeof companyData.ownerUid === "string" && companyData.ownerUid.trim().length > 0
      ? companyData.ownerUid.trim()
      : null
  const currentProgramIds = Array.isArray(companyData.programs)
    ? companyData.programs.filter((value): value is string => typeof value === "string")
    : []
  const normalizedNextProgramIds = normalizeStringArray(nextProgramIds)
  const affectedProgramIds = normalizeStringArray([
    ...currentProgramIds,
    ...normalizedNextProgramIds,
  ])
  const aliases = Array.from(new Set([companyId, ownerUid].filter((value): value is string => Boolean(value))))
  const programSnaps = await Promise.all(
    affectedProgramIds.map((programId) => getDoc(doc(db, "programs", programId))),
  )
  const batch = writeBatch(db)

  batch.set(
    companyRef,
    {
      ...(companyName !== undefined ? { name: companyName || null } : {}),
      programs: normalizedNextProgramIds,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )

  affectedProgramIds.forEach((programId, index) => {
    const programSnap = programSnaps[index]
    const programData = programSnap?.exists() ? programSnap.data() : {}
    const currentCompanyIds = Array.isArray(programData.companyIds)
      ? programData.companyIds.filter((value): value is string => typeof value === "string")
      : []
    const nextCompanyIds = currentCompanyIds.filter((value) => !aliases.includes(value))

    if (normalizedNextProgramIds.includes(programId)) {
      nextCompanyIds.push(companyId)
    }

    batch.set(
      doc(db, "programs", programId),
      {
        companyIds: normalizeStringArray(nextCompanyIds),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  })

  await batch.commit()
  return true
}

export async function replaceProgramCompanies(params: {
  db: Firestore
  programId: string
  nextCompanyIds: string[]
  companies: CompanyProgramRecord[]
}) {
  const { db, programId, nextCompanyIds, companies } = params
  const normalizedNextCompanyIds = normalizeCompanyIds(nextCompanyIds, companies)
  const programRef = doc(db, "programs", programId)
  const [programSnap, currentCompanySnap] = await Promise.all([
    getDoc(programRef),
    getDocs(query(collection(db, "companies"), where("programs", "array-contains", programId))),
  ])
  const currentMappedCompanyIds = currentCompanySnap.docs.map((docSnap) => docSnap.id)
  const currentProgramData = programSnap.exists() ? programSnap.data() : {}
  const currentProgramCompanyIds = Array.isArray(currentProgramData.companyIds)
    ? currentProgramData.companyIds.filter((value): value is string => typeof value === "string")
    : []
  const aliasMap = buildCompanyAliasMap(companies)
  const affectedCompanyIds = normalizeStringArray([
    ...currentMappedCompanyIds,
    ...currentProgramCompanyIds.map((companyId) => aliasMap.get(companyId) ?? companyId),
    ...normalizedNextCompanyIds,
  ])
  const companyById = new Map(companies.map((company) => [company.id, company]))
  const batch = writeBatch(db)

  batch.set(
    programRef,
    {
      companyIds: normalizedNextCompanyIds,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )

  affectedCompanyIds.forEach((companyId) => {
    const company = companyById.get(companyId)
    if (!company) return
    const currentPrograms = Array.isArray(company.programs)
      ? company.programs.filter((value): value is string => typeof value === "string")
      : []
    const nextPrograms = currentPrograms.filter((currentProgramId) => currentProgramId !== programId)

    if (normalizedNextCompanyIds.includes(companyId)) {
      nextPrograms.push(programId)
    }

    batch.set(
      doc(db, "companies", companyId),
      {
        programs: normalizeStringArray(nextPrograms),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  })

  await batch.commit()
  return true
}
