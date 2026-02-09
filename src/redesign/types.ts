export type ConsultantAvailabilitySlot = {
  start: string
  end: string
  available: boolean
}

export type ConsultantAvailability = {
  dayOfWeek: number
  slots: ConsultantAvailabilitySlot[]
}

export type Consultant = {
  id: string
  name: string
  email: string
  expertise: string[]
  bio: string
  status: "active" | "inactive"
  availability: ConsultantAvailability[]
}
