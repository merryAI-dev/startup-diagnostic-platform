export type InvestmentInput = {
  stage: string
  date: string
  postMoney: string
  majorShareholder: string
}

export type CompanyInfoForm = {
  companyInfo: string
  ceoName: string
  ceoEmail: string
  ceoPhone: string
  foundedAt: string
  businessNumber: string
  primaryBusiness: string
  primaryIndustry: string
  headOffice: string
  branchOffice: string
  workforceFullTime: string
  workforceContract: string
  revenue2025: string
  revenue2026: string
  capitalTotal: string
  certification: string
  tipsLipsHistory: string
  desiredInvestment2026: string
  desiredPreValue: string
}

export type CompanyInfoRecord = {
  basic: {
    companyInfo: string
    ceo: {
      name: string
      email: string
      phone: string
    }
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
  investments: {
    stage: string
    date: string
    postMoney: number | null
    majorShareholder: string
  }[]
  fundingPlan: {
    desiredAmount2026: number | null
    preValue: number | null
  }
  metadata: {
    createdAt?: unknown
    updatedAt?: unknown
  }
}

export const DEFAULT_FORM: CompanyInfoForm = {
  companyInfo: "",
  ceoName: "",
  ceoEmail: "",
  ceoPhone: "",
  foundedAt: "",
  businessNumber: "",
  primaryBusiness: "",
  primaryIndustry: "",
  headOffice: "",
  branchOffice: "",
  workforceFullTime: "",
  workforceContract: "",
  revenue2025: "",
  revenue2026: "",
  capitalTotal: "",
  certification: "",
  tipsLipsHistory: "",
  desiredInvestment2026: "",
  desiredPreValue: "",
}
