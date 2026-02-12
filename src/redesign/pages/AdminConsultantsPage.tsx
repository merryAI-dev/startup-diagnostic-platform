import { useMemo, useState } from "react"
import { Check, Clock, Mail, UserPlus, X } from "lucide-react"
import { Badge } from "@/redesign/ui/badge"
import { Button } from "@/redesign/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/redesign/ui/dialog"
import { Input } from "@/redesign/ui/input"
import { Label } from "@/redesign/ui/label"
import { cn } from "@/redesign/ui/utils"
import type { Consultant, ConsultantAvailability } from "@/redesign/types"

const DAYS_OF_WEEK = ["일", "월", "화", "수", "목", "금", "토"]
const TIME_SLOTS = [
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
]

const initialConsultants: Consultant[] = [
  {
    id: "consultant-1",
    name: "김임팩트",
    email: "impact.kim@mysc.co.kr",
    expertise: ["임팩트 측정", "ESG 전략", "지속가능성"],
    bio: "임팩트 측정 및 ESG 전략 수립 경험을 보유한 컨설턴트입니다.",
    status: "active",
    availability: [
      {
        dayOfWeek: 1,
        slots: [
          { start: "09:00", end: "10:00", available: true },
          { start: "10:00", end: "11:00", available: true },
          { start: "14:00", end: "15:00", available: true },
        ],
      },
      {
        dayOfWeek: 3,
        slots: [
          { start: "13:00", end: "14:00", available: true },
          { start: "15:00", end: "16:00", available: true },
        ],
      },
    ],
  },
  {
    id: "consultant-2",
    name: "이비즈",
    email: "biz.lee@mysc.co.kr",
    expertise: ["비즈니스 모델", "전략 기획", "고객 개발"],
    bio: "스타트업 전략 및 고객 개발을 지원합니다.",
    status: "active",
    availability: [
      {
        dayOfWeek: 2,
        slots: [
          { start: "09:00", end: "10:00", available: true },
          { start: "11:00", end: "12:00", available: true },
          { start: "16:00", end: "17:00", available: true },
        ],
      },
    ],
  },
  {
    id: "consultant-3",
    name: "박임팩트",
    email: "park.mysc@mysc.co.kr",
    expertise: ["성과관리", "데이터 분석", "투자유치"],
    bio: "성과관리 체계 구축과 투자유치 전략을 함께 설계합니다.",
    status: "inactive",
    availability: [
      {
        dayOfWeek: 4,
        slots: [
          { start: "10:00", end: "11:00", available: true },
          { start: "14:00", end: "15:00", available: true },
        ],
      },
      {
        dayOfWeek: 5,
        slots: [
          { start: "09:00", end: "10:00", available: true },
          { start: "15:00", end: "16:00", available: true },
        ],
      },
    ],
  },
]

const createEmptyAvailability = (): ConsultantAvailability[] => {
  return DAYS_OF_WEEK.map((_, dayIndex) => ({
    dayOfWeek: dayIndex,
    slots: TIME_SLOTS.map((slot) => ({
      start: slot,
      end: TIME_SLOTS[TIME_SLOTS.indexOf(slot) + 1] ?? "18:00",
      available: false,
    })),
  }))
}

export function AdminConsultantsPage() {
  const [consultants, setConsultants] =
    useState<Consultant[]>(initialConsultants)
  const [selectedConsultant, setSelectedConsultant] =
    useState<Consultant | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false)

  const consultantStats = useMemo(() => {
    const total = consultants.length
    const active = consultants.filter((c) => c.status === "active").length
    const inactive = total - active
    const expertise = new Set(consultants.flatMap((c) => c.expertise)).size
    return { total, active, inactive, expertise }
  }, [consultants])

  const handleToggleSlot = (dayOfWeek: number, slotIndex: number) => {
    if (!selectedConsultant) return

    const updatedAvailability = selectedConsultant.availability.map((day) => {
      if (day.dayOfWeek !== dayOfWeek) return day
      return {
        ...day,
        slots: day.slots.map((slot, index) =>
          index === slotIndex
            ? { ...slot, available: !slot.available }
            : slot
        ),
      }
    })

    setConsultants((prev) =>
      prev.map((consultant) =>
        consultant.id === selectedConsultant.id
          ? { ...consultant, availability: updatedAvailability }
          : consultant
      )
    )
    setSelectedConsultant({
      ...selectedConsultant,
      availability: updatedAvailability,
    })
  }

  const handleAddNewConsultant = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const expertiseValue = String(formData.get("expertise") ?? "")

    const newConsultant: Consultant = {
      id: `consultant-${Date.now()}`,
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      expertise: expertiseValue
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      bio: String(formData.get("bio") ?? ""),
      status: "active",
      availability: createEmptyAvailability(),
    }

    setConsultants((prev) => [newConsultant, ...prev])
    setIsAddDialogOpen(false)
    e.currentTarget.reset()
  }

  const handleToggleStatus = (consultantId: string) => {
    setConsultants((prev) =>
      prev.map((consultant) =>
        consultant.id === consultantId
          ? {
              ...consultant,
              status: consultant.status === "active" ? "inactive" : "active",
            }
          : consultant
      )
    )
  }

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-8 py-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              컨설턴트 관리
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              컨설턴트 정보 및 가용 시간을 관리합니다.
            </p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                컨설턴트 추가
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>새 컨설턴트 추가</DialogTitle>
                <DialogDescription>
                  컨설턴트 정보를 입력하세요.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddNewConsultant} className="space-y-4">
                <div>
                  <Label htmlFor="name">이름</Label>
                  <Input id="name" name="name" required />
                </div>
                <div>
                  <Label htmlFor="email">이메일</Label>
                  <Input id="email" name="email" type="email" required />
                </div>
                <div>
                  <Label htmlFor="expertise">전문 분야 (쉼표로 구분)</Label>
                  <Input
                    id="expertise"
                    name="expertise"
                    placeholder="예: 임팩트 측정, ESG, 지속가능성"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="bio">소개</Label>
                  <Input id="bio" name="bio" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAddDialogOpen(false)}
                  >
                    취소
                  </Button>
                  <Button type="submit">추가</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-white p-4">
            <div className="mb-1 text-sm text-muted-foreground">
              전체 컨설턴트
            </div>
            <div className="text-2xl font-bold">{consultantStats.total}</div>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <div className="mb-1 text-sm text-muted-foreground">
              활성 컨설턴트
            </div>
            <div className="text-2xl font-bold text-green-600">
              {consultantStats.active}
            </div>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <div className="mb-1 text-sm text-muted-foreground">
              비활성 컨설턴트
            </div>
            <div className="text-2xl font-bold text-gray-400">
              {consultantStats.inactive}
            </div>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <div className="mb-1 text-sm text-muted-foreground">전문 분야</div>
            <div className="text-2xl font-bold">
              {consultantStats.expertise}
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {consultants.map((consultant) => (
            <div
              key={consultant.id}
              className="rounded-lg border bg-white p-6"
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <span className="text-lg font-semibold text-primary">
                      {consultant.name.slice(0, 1)}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {consultant.name}
                    </h3>
                    <div className="mt-1 flex items-center gap-2">
                      <Mail className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {consultant.email}
                      </span>
                    </div>
                  </div>
                </div>
                <Badge
                  variant={consultant.status === "active" ? "default" : "secondary"}
                  className={
                    consultant.status === "active"
                      ? "bg-green-100 text-green-700"
                      : ""
                  }
                >
                  {consultant.status === "active" ? "활성" : "비활성"}
                </Badge>
              </div>

              <p className="mb-3 text-sm text-muted-foreground">
                {consultant.bio}
              </p>

              <div className="mb-4">
                <div className="mb-2 text-xs font-semibold text-muted-foreground">
                  전문 분야
                </div>
                <div className="flex flex-wrap gap-1">
                  {consultant.expertise.map((skill) => (
                    <Badge key={skill} variant="outline" className="text-xs">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <div className="mb-2 text-xs font-semibold text-muted-foreground">
                  가용 요일
                </div>
                <div className="flex gap-1">
                  {DAYS_OF_WEEK.map((day, idx) => {
                    const hasAvailability = consultant.availability.some(
                      (availability) => availability.dayOfWeek === idx
                    )
                    return (
                      <div
                        key={day}
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full text-xs",
                          hasAvailability
                            ? "bg-primary text-white"
                            : "bg-gray-100 text-gray-400"
                        )}
                      >
                        {day}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="flex gap-2">
                <Dialog
                  open={
                    isScheduleDialogOpen &&
                    selectedConsultant?.id === consultant.id
                  }
                  onOpenChange={(open) => {
                    setIsScheduleDialogOpen(open)
                    if (open) setSelectedConsultant(consultant)
                  }}
                >
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="flex-1">
                      <Clock className="mr-2 h-4 w-4" />
                      일정 관리
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[80vh] max-w-4xl overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>
                        {consultant.name} - 가용 시간 설정
                      </DialogTitle>
                      <DialogDescription>
                        요일별 가용 시간을 클릭하여 활성화 또는 비활성화할 수
                        있습니다.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6">
                      {selectedConsultant?.availability.map((dayAvailability) => (
                        <div
                          key={dayAvailability.dayOfWeek}
                          className="rounded-lg border p-4"
                        >
                          <h4 className="mb-3 font-semibold">
                            {DAYS_OF_WEEK[dayAvailability.dayOfWeek]}요일
                          </h4>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                            {dayAvailability.slots.map((slot, slotIdx) => (
                              <button
                                key={`${dayAvailability.dayOfWeek}-${slot.start}`}
                                onClick={() =>
                                  handleToggleSlot(
                                    dayAvailability.dayOfWeek,
                                    slotIdx
                                  )
                                }
                                className={cn(
                                  "rounded-lg border p-3 text-sm font-medium transition-colors",
                                  slot.available
                                    ? "border-primary bg-primary text-white"
                                    : "border-gray-200 bg-gray-50 text-gray-400 hover:bg-gray-100"
                                )}
                              >
                                <div className="flex items-center justify-center gap-1">
                                  {slot.available ? (
                                    <Check className="h-3 w-3" />
                                  ) : (
                                    <X className="h-3 w-3" />
                                  )}
                                  <span>{slot.start}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </DialogContent>
                </Dialog>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggleStatus(consultant.id)}
                >
                  {consultant.status === "active" ? "비활성화" : "활성화"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
