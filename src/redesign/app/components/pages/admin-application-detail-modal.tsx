import { useState } from "react";
import { Calendar, Clock, MapPin, FileText, User, X, CheckCircle2, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { StatusChip } from "../status-chip";
import { Badge } from "../ui/badge";
import { Application, ApplicationStatus } from "../../lib/types";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Separator } from "../ui/separator";
import { toast } from "sonner";

interface AdminApplicationDetailModalProps {
  application: Application;
  onClose: () => void;
  onUpdateStatus: (id: string, status: ApplicationStatus) => void;
  onUpdateApplication: (id: string, data: Partial<Application>) => void;
}

export function AdminApplicationDetailModal({
  application,
  onClose,
  onUpdateStatus,
  onUpdateApplication,
}: AdminApplicationDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedConsultant, setEditedConsultant] = useState(application.consultant);
  const [editedDate, setEditedDate] = useState(application.scheduledDate || "");
  const [editedTime, setEditedTime] = useState(application.scheduledTime || "");

  const handleSaveEdit = () => {
    onUpdateApplication(application.id, {
      consultant: editedConsultant,
      scheduledDate: editedDate,
      scheduledTime: editedTime,
    });
    setIsEditing(false);
    toast.success("신청 정보가 업데이트되었습니다");
  };

  const handleStatusChange = (newStatus: ApplicationStatus) => {
    onUpdateStatus(application.id, newStatus);
    toast.success(`상태가 '${getStatusLabel(newStatus)}'로 변경되었습니다`);
  };

  const getStatusLabel = (status: ApplicationStatus) => {
    const labels = {
      pending: "신청중",
      review: "검토중",
      confirmed: "확정",
      cancelled: "취소",
      completed: "완료",
    };
    return labels[status];
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <DialogTitle>{application.officeHourTitle}</DialogTitle>
              <div className="flex items-center gap-2">
                <StatusChip status={application.status} />
                <Badge variant="outline">
                  {application.type === "regular" ? "정기" : "비정기"}
                </Badge>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Status Management */}
          <div className="space-y-3">
            <Label>상태 관리</Label>
            <div className="flex gap-2 flex-wrap">
              {application.status !== "review" && application.status !== "completed" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleStatusChange("review")}
                  disabled={application.status === "cancelled"}
                >
                  검토 시작
                </Button>
              )}
              {application.status !== "confirmed" && application.status !== "completed" && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => handleStatusChange("confirmed")}
                  disabled={application.status === "cancelled"}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  확정
                </Button>
              )}
              {application.status === "confirmed" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleStatusChange("completed")}
                >
                  완료 처리
                </Button>
              )}
              {application.status !== "cancelled" && application.status !== "completed" && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleStatusChange("cancelled")}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  취소
                </Button>
              )}
            </div>
          </div>

          <Separator />

          {/* Edit Mode Toggle */}
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">신청 정보</h3>
            {!isEditing ? (
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                수정
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                  취소
                </Button>
                <Button size="sm" onClick={handleSaveEdit}>
                  저장
                </Button>
              </div>
            )}
          </div>

          {/* Application Details */}
          <div className="space-y-4">
            {isEditing ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="consultant">담당 컨설턴트</Label>
                  <Input
                    id="consultant"
                    value={editedConsultant}
                    onChange={(e) => setEditedConsultant(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="date">일정 날짜</Label>
                    <Input
                      id="date"
                      type="date"
                      value={editedDate}
                      onChange={(e) => setEditedDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="time">시간</Label>
                    <Input
                      id="time"
                      type="time"
                      value={editedTime}
                      onChange={(e) => setEditedTime(e.target.value)}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">담당 컨설턴트</p>
                    <p className="text-sm font-medium">{application.consultant}</p>
                  </div>
                </div>

                {application.scheduledDate && (
                  <>
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Calendar className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">일정 날짜</p>
                        <p className="text-sm font-medium">
                          {format(new Date(application.scheduledDate), "yyyy년 M월 d일 (E)", {
                            locale: ko,
                          })}
                        </p>
                      </div>
                    </div>

                    {application.scheduledTime && (
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Clock className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">시간</p>
                          <p className="text-sm font-medium">{application.scheduledTime}</p>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {application.periodFrom && (
                  <div className="flex items-start gap-3 col-span-2">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Calendar className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">희망 기간</p>
                      <p className="text-sm font-medium">
                        {format(new Date(application.periodFrom), "M월 d일", { locale: ko })} ~{" "}
                        {format(new Date(application.periodTo!), "M월 d일", { locale: ko })}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <MapPin className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">진행 방식</p>
                    <p className="text-sm font-medium">
                      {application.sessionFormat === "online" ? "온라인" : "오프라인"}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Request Details */}
          <div className="space-y-4">
            <h3 className="font-semibold">신청 내용</h3>
            
            <div className="space-y-2">
              <Label>안건</Label>
              <div className="p-3 bg-accent rounded-lg">
                <p className="text-sm">{application.agenda}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>요청 내용</Label>
              <div className="p-3 bg-accent rounded-lg">
                <p className="text-sm whitespace-pre-wrap">{application.requestContent}</p>
              </div>
            </div>

            {application.attachments.length > 0 && (
              <div className="space-y-2">
                <Label>첨부 파일</Label>
                <div className="space-y-2">
                  {application.attachments.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-2 bg-accent rounded-lg"
                    >
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{file}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {application.projectName && (
              <div className="space-y-2">
                <Label>프로젝트명</Label>
                <div className="p-3 bg-accent rounded-lg">
                  <p className="text-sm">{application.projectName}</p>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Metadata */}
          <div className="space-y-2">
            <h3 className="font-semibold">신청 정보</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">신청일:</span>{" "}
                <span className="font-medium">
                  {format(new Date(application.createdAt), "yyyy년 M월 d일 HH:mm", { locale: ko })}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">최종 수정:</span>{" "}
                <span className="font-medium">
                  {format(new Date(application.updatedAt), "yyyy년 M월 d일 HH:mm", { locale: ko })}
                </span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
