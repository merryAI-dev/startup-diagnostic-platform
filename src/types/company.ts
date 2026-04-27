export type InvestmentInput = {
  stage: string
  date: string
  postMoney: string
  majorShareholder: string
}

export type CompanyInfoForm = {
  companyType: string
  companyInfo: string
  representativeSolution: string
  sdgPriority1: string
  sdgPriority2: string
  ceoName: string
  ceoEmail: string
  ceoPhone: string
  ceoBirthDate: string
  ceoAge: string
  ceoGender: string
  ceoNationality: string
  hasCoRepresentative: string
  coRepresentativeName: string
  coRepresentativeBirthDate: string
  coRepresentativeGender: string
  coRepresentativeTitle: string
  founderSerialNumber: string
  website: string
  foundedAt: string
  businessNumber: string
  primaryBusiness: string
  primaryIndustry: string
  headOffice: string
  branchOffice: string
  targetCountries: string
  workforceFullTime: string
  workforceContract: string
  revenue2025: string
  revenue2026: string
  capitalTotal: string
  certification: string
  tipsLipsHistory: string
  exportVoucherHeld: string
  exportVoucherAmount: string
  exportVoucherUsageRate: string
  innovationVoucherHeld: string
  innovationVoucherAmount: string
  innovationVoucherUsageRate: string
  myscExpectation: string
  desiredInvestment2026: string
  desiredPreValue: string
}

export type CompanyInfoRecord = {
  basic: {
    companyType: string
    companyInfo: string
    representativeSolution: string
    ceo: {
      name: string
      email: string
      phone: string
      birthDate: string
      age: number | null
      gender: string
      nationality: string
      coRepresentative: {
        enabled: boolean
        name: string
        birthDate: string
        gender: string
        title: string
      }
    }
    founderSerialNumber: number | null
    website: string
    foundedAt: string
    businessNumber: string
    primaryBusiness: string
    primaryIndustry: string
  }
  locations: {
    headOffice: string
    branchOrLab: string
  }
  workforce: {
    fullTime: number | null
    contract: number | null
  }
  finance: {
    revenue: {
      y2025: number | null
      y2026: number | null
    }
    capitalTotal: number | null
  }
  certifications: {
    designation: string
    tipsLipsHistory: string
  }
  impact: {
    sdgPriority1: string
    sdgPriority2: string
    myscExpectation: string
  }
  globalExpansion: {
    targetCountries: string[]
  }
  investments: {
    stage: string
    date: string
    postMoney: number | null
    majorShareholder: string
  }[]
  vouchers: {
    exportVoucherHeld: string
    exportVoucherAmount: string
    exportVoucherUsageRate: string
    innovationVoucherHeld: string
    innovationVoucherAmount: string
    innovationVoucherUsageRate: string
  }
  fundingPlan: {
    desiredAmount2026: number | null
    preValue: number | null
  }
  metadata: {
    createdAt?: unknown
    updatedAt?: unknown
    saveType?: "draft" | "final"
  }
}

export const DEFAULT_FORM: CompanyInfoForm = {
  companyType: "법인",
  companyInfo: "",
  representativeSolution: "",
  sdgPriority1: "",
  sdgPriority2: "",
  ceoName: "",
  ceoEmail: "",
  ceoPhone: "",
  ceoBirthDate: "",
  ceoAge: "",
  ceoGender: "",
  ceoNationality: "",
  hasCoRepresentative: "",
  coRepresentativeName: "",
  coRepresentativeBirthDate: "",
  coRepresentativeGender: "",
  coRepresentativeTitle: "",
  founderSerialNumber: "",
  website: "",
  foundedAt: "",
  businessNumber: "",
  primaryBusiness: "",
  primaryIndustry: "",
  headOffice: "",
  branchOffice: "",
  targetCountries: "",
  workforceFullTime: "",
  workforceContract: "",
  revenue2025: "",
  revenue2026: "",
  capitalTotal: "",
  certification: "",
  tipsLipsHistory: "",
  exportVoucherHeld: "",
  exportVoucherAmount: "",
  exportVoucherUsageRate: "",
  innovationVoucherHeld: "",
  innovationVoucherAmount: "",
  innovationVoucherUsageRate: "",
  myscExpectation: "",
  desiredInvestment2026: "",
  desiredPreValue: "",
}
