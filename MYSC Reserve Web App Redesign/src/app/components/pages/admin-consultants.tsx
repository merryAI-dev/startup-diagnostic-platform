import { useState } from "react";
import { UserPlus, Mail, Check, X, Clock } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Consultant } from "../../lib/types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { cn } from "../ui/utils";

interface AdminConsultantsProps {
  consultants: Consultant[];
  onUpdateConsultant: (id: string, data: Partial<Consultant>) => void;
  onAddConsultant: (data: Omit<Consultant, "id">) => void;
}

const DAYS_OF_WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const TIME_SLOTS = [
  "09:00", "10:00", "11:00", "12:00", 
  "13:00", "14:00", "15:00", "16:00", "17:00"
];

export function AdminConsultants({ 
  consultants,
  onUpdateConsultant,
  onAddConsultant
}: AdminConsultantsProps) {
  const [selectedConsultant, setSelectedConsultant] = useState<Consultant | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);

  const handleToggleSlot = (dayOfWeek: number, slotIndex: number) => {
    if (!selectedConsultant) return;

    const updatedAvailability = [...selectedConsultant.availability];
    const dayAvailability = updatedAvailability.find(a => a.dayOfWeek === dayOfWeek);
    
    if (dayAvailability) {
      dayAvailability.slots[slotIndex] = {
        ...dayAvailability.slots[slotIndex],
        available: !dayAvailability.slots[slotIndex].available
      };
    }

    onUpdateConsultant(selectedConsultant.id, { availability: updatedAvailability });
    setSelectedConsultant({ ...selectedConsultant, availability: updatedAvailability });
  };

  const handleAddNewConsultant = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const newConsultant: Omit<Consultant, "id"> = {
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      expertise: (formData.get("expertise") as string).split(",").map(e => e.trim()),
      bio: formData.get("bio") as string,
      status: "active",
      availability: [],
    };

    onAddConsultant(newConsultant);
    setIsAddDialogOpen(false);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">컨설턴트 관리</h1>
            <p className="text-sm text-muted-foreground mt-1">
              컨설턴트 정보 및 가용 시간을 관리합니다
            </p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="w-4 h-4 mr-2" />
                컨설턴트 추가
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>새 컨설턴트 추가</DialogTitle>
                <DialogDescription>
                  컨설턴트 정보를 입력하세요
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
                  <Input id="expertise" name="expertise" placeholder="예: 임팩트 측정, ESG, 지속가능성" required />
                </div>
                <div>
                  <Label htmlFor="bio">소개</Label>
                  <Textarea id="bio" name="bio" rows={3} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    취소
                  </Button>
                  <Button type="submit">추가</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-muted-foreground mb-1">전체 컨설턴트</div>
          <div className="text-2xl font-bold">{consultants.length}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-muted-foreground mb-1">활성 컨설턴트</div>
          <div className="text-2xl font-bold text-green-600">
            {consultants.filter(c => c.status === "active").length}
          </div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-muted-foreground mb-1">비활성 컨설턴트</div>
          <div className="text-2xl font-bold text-gray-400">
            {consultants.filter(c => c.status === "inactive").length}
          </div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-muted-foreground mb-1">전문 분야</div>
          <div className="text-2xl font-bold">
            {new Set(consultants.flatMap(c => c.expertise)).size}
          </div>
        </div>
      </div>

      {/* Consultants Grid */}
      <div className="grid grid-cols-2 gap-6">
        {consultants.map((consultant) => (
          <div key={consultant.id} className="bg-white rounded-lg border p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-lg font-semibold text-primary">
                    {consultant.name[0]}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{consultant.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Mail className="w-3 h-3 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{consultant.email}</span>
                  </div>
                </div>
              </div>
              <Badge 
                variant={consultant.status === "active" ? "default" : "secondary"}
                className={consultant.status === "active" ? "bg-green-100 text-green-700" : ""}
              >
                {consultant.status === "active" ? "활성" : "비활성"}
              </Badge>
            </div>

            <p className="text-sm text-muted-foreground mb-3">{consultant.bio}</p>

            <div className="mb-4">
              <div className="text-xs font-semibold text-muted-foreground mb-2">전문 분야</div>
              <div className="flex flex-wrap gap-1">
                {consultant.expertise.map((skill, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <div className="text-xs font-semibold text-muted-foreground mb-2">가용 요일</div>
              <div className="flex gap-1">
                {DAYS_OF_WEEK.map((day, idx) => {
                  const hasAvailability = consultant.availability.some(a => a.dayOfWeek === idx);
                  return (
                    <div
                      key={idx}
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs",
                        hasAvailability 
                          ? "bg-primary text-white" 
                          : "bg-gray-100 text-gray-400"
                      )}
                    >
                      {day}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2">
              <Dialog 
                open={isScheduleDialogOpen && selectedConsultant?.id === consultant.id} 
                onOpenChange={(open) => {
                  setIsScheduleDialogOpen(open);
                  if (open) setSelectedConsultant(consultant);
                }}
              >
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="flex-1">
                    <Clock className="w-4 h-4 mr-2" />
                    일정 관리
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{consultant.name} - 가용 시간 설정</DialogTitle>
                    <DialogDescription>
                      요일별 가용 시간을 클릭하여 활성화/비활성화할 수 있습니다
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="space-y-6">
                    {selectedConsultant?.availability.map((dayAvailability, dayIdx) => (
                      <div key={dayIdx} className="border rounded-lg p-4">
                        <h4 className="font-semibold mb-3">
                          {DAYS_OF_WEEK[dayAvailability.dayOfWeek]}요일
                        </h4>
                        <div className="grid grid-cols-6 gap-2">
                          {dayAvailability.slots.map((slot, slotIdx) => (
                            <button
                              key={slotIdx}
                              onClick={() => handleToggleSlot(dayAvailability.dayOfWeek, slotIdx)}
                              className={cn(
                                "p-3 rounded-lg border text-sm font-medium transition-colors",
                                slot.available
                                  ? "bg-primary text-white border-primary"
                                  : "bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100"
                              )}
                            >
                              <div className="flex items-center justify-center gap-1">
                                {slot.available ? (
                                  <Check className="w-3 h-3" />
                                ) : (
                                  <X className="w-3 h-3" />
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
                onClick={() => onUpdateConsultant(consultant.id, { 
                  status: consultant.status === "active" ? "inactive" : "active" 
                })}
              >
                {consultant.status === "active" ? "비활성화" : "활성화"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
