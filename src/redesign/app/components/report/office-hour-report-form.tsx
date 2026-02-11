import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Application, OfficeHourReport } from "../../lib/types";
import { X, Upload, Star, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface OfficeHourReportFormProps {
  application: Application;
  open: boolean;
  onClose: () => void;
  deadlineInfo?: {
    deadline: Date;
    daysLeft: number;
    isOverdue: boolean;
    overdueDays: number;
  } | null;
  initialReport?: OfficeHourReport | null;
  submitLabel?: string;
  onSubmit: (report: Omit<OfficeHourReport, "id" | "createdAt" | "updatedAt" | "completedAt">) => void;
}

export function OfficeHourReportForm({ 
  application, 
  open, 
  onClose, 
  deadlineInfo,
  initialReport,
  submitLabel,
  onSubmit 
}: OfficeHourReportFormProps) {
  const buildFormState = () => {
    if (initialReport) {
      return {
        date: initialReport.date || application.scheduledDate || "",
        location: initialReport.location || "",
        topic: initialReport.topic || application.agenda,
        participants:
          initialReport.participants && initialReport.participants.length > 0
            ? initialReport.participants
            : [""],
        content: initialReport.content || "",
        followUp: initialReport.followUp || "",
        duration: initialReport.duration || application.duration || 2,
        satisfaction: initialReport.satisfaction || 5,
      };
    }
    return {
      date: application.scheduledDate || "",
      location: application.sessionFormat === "online" ? "온라인 (Zoom/Google Meet)" : "",
      topic: application.agenda,
      participants: [""],
      content: "",
      followUp: "",
      duration: application.duration || 2,
      satisfaction: 5,
    };
  };

  const [formData, setFormData] = useState(buildFormState);
  const [photos, setPhotos] = useState<string[]>(initialReport?.photos ?? []);

  useEffect(() => {
    if (!open) return;
    setFormData(buildFormState());
    setPhotos(initialReport?.photos ?? []);
  }, [open, initialReport, application]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      // Mock upload - in real app would upload to Firebase Storage
      const newPhotos = Array.from(files).map(file => URL.createObjectURL(file));
      setPhotos([...photos, ...newPhotos]);
      toast.success(`${files.length}개의 사진이 업로드되었습니다`);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const handleAddParticipant = () => {
    setFormData({
      ...formData,
      participants: [...formData.participants, ""],
    });
  };

  const handleParticipantChange = (index: number, value: string) => {
    const newParticipants = [...formData.participants];
    newParticipants[index] = value;
    setFormData({
      ...formData,
      participants: newParticipants,
    });
  };

  const handleRemoveParticipant = (index: number) => {
    if (formData.participants.length > 1) {
      setFormData({
        ...formData,
        participants: formData.participants.filter((_, i) => i !== index),
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.content.trim()) {
      toast.error("세션 내용을 입력해주세요");
      return;
    }

    if (!formData.followUp.trim()) {
      toast.error("팔로업 계획을 입력해주세요");
      return;
    }

    setIsSubmitting(true);

    try {
      const report: Omit<OfficeHourReport, "id" | "createdAt" | "updatedAt" | "completedAt"> = {
        applicationId: application.id,
        consultantId: initialReport?.consultantId || application.consultantId || "",
        consultantName: initialReport?.consultantName || application.consultant,
        date: formData.date,
        location: formData.location,
        topic: formData.topic,
        participants: formData.participants.filter(p => p.trim() !== ""),
        content: formData.content,
        followUp: formData.followUp,
        photos: photos,
        duration: formData.duration,
        satisfaction: formData.satisfaction,
        programId: application.programId || "",
      };

      await onSubmit(report);
      toast.success("오피스아워 보고서가 작성되었습니다");
      onClose();
    } catch (error) {
      toast.error("보고서 작성 중 오류가 발생했습니다");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) onClose();
    }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
          <div>
            <DialogTitle className="text-2xl whitespace-nowrap overflow-hidden text-ellipsis">
              {initialReport ? "오피스아워 보고서 수정" : "오피스아워 보고서 작성"}
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {application.officeHourTitle}
            </p>
            {!initialReport && (
              <p className="text-xs text-amber-700 mt-1">
                세션 종료 후 3일 이내 보고서를 작성해야 합니다.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-lg border border-amber-200">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm font-medium whitespace-nowrap">
                  {deadlineInfo
                    ? deadlineInfo.isOverdue
                      ? `기한 초과 ${deadlineInfo.overdueDays}일`
                      : `D-${Math.max(0, deadlineInfo.daysLeft)}`
                    : "작성 필수"}
                </span>
            </div>
          </div>
        </div>
        </DialogHeader>

        {deadlineInfo && !initialReport && (
          <div
            className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
              deadlineInfo.isOverdue
                ? "border-red-200 bg-red-50 text-red-700"
                : deadlineInfo.daysLeft <= 1
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-slate-200 bg-slate-50 text-slate-700"
            }`}
          >
            {deadlineInfo.isOverdue
              ? `보고서 제출 기한이 ${deadlineInfo.overdueDays}일 지났습니다. 빠르게 작성해주세요.`
              : `보고서 제출 마감까지 ${Math.max(0, deadlineInfo.daysLeft)}일 남았습니다.`}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          {/* 일시 */}
          <div className="space-y-2">
            <Label htmlFor="date">일시 *</Label>
            <Input
              id="date"
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              required
            />
          </div>

          {/* 장소 */}
          <div className="space-y-2">
            <Label htmlFor="location">장소 *</Label>
            <Input
              id="location"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="예: 온라인 (Zoom), MYSC 오피스, 카페"
              required
            />
          </div>

          {/* 주제 */}
          <div className="space-y-2">
            <Label htmlFor="topic">주제 *</Label>
            <Input
              id="topic"
              value={formData.topic}
              onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
              placeholder="세션의 주요 주제"
              required
            />
          </div>

          {/* 참석자 */}
          <div className="space-y-2">
            <Label>참석자 *</Label>
            {formData.participants.map((participant, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={participant}
                  onChange={(e) => handleParticipantChange(index, e.target.value)}
                  placeholder="참석자 이름"
                  required
                />
                {formData.participants.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleRemoveParticipant(index)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddParticipant}
            >
              + 참석자 추가
            </Button>
          </div>

          {/* 진행 시간 */}
          <div className="space-y-2">
            <Label htmlFor="duration">실제 진행 시간 (시간) *</Label>
            <Input
              id="duration"
              type="number"
              step="0.5"
              min="0.5"
              max="8"
              value={formData.duration}
              onChange={(e) => setFormData({ ...formData, duration: parseFloat(e.target.value) })}
              required
            />
          </div>

          {/* 내용 */}
          <div className="space-y-2">
            <Label htmlFor="content">세션 내용 *</Label>
            <Textarea
              id="content"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="논의된 주요 내용, 핵심 질문, 제공된 피드백 등을 상세히 작성해주세요"
              rows={6}
              required
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              최소 100자 이상 작성을 권장합니다
            </p>
          </div>

          {/* 팔로업 */}
          <div className="space-y-2">
            <Label htmlFor="followUp">팔로업 계획 *</Label>
            <Textarea
              id="followUp"
              value={formData.followUp}
              onChange={(e) => setFormData({ ...formData, followUp: e.target.value })}
              placeholder="후속 조치, 기업에서 해야 할 액션 아이템, 다음 세션 계획 등"
              rows={4}
              required
              className="resize-none"
            />
          </div>

          {/* 만족도 */}
          <div className="space-y-2">
            <Label>기업 만족도 *</Label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  key={rating}
                  type="button"
                  onClick={() => setFormData({ ...formData, satisfaction: rating })}
                  className={`p-2 transition-all ${
                    rating <= formData.satisfaction
                      ? "text-yellow-500"
                      : "text-gray-300"
                  }`}
                >
                  <Star
                    className="w-8 h-8"
                    fill={rating <= formData.satisfaction ? "currentColor" : "none"}
                  />
                </button>
              ))}
              <span className="ml-2 text-sm text-muted-foreground">
                {formData.satisfaction}점
              </span>
            </div>
          </div>

          {/* 사진 업로드 */}
          <div className="space-y-2">
            <Label>세션 사진 (선택)</Label>
            <div className="border-2 border-dashed rounded-lg p-6">
              <input
                type="file"
                id="photos"
                accept="image/*"
                multiple
                onChange={handlePhotoUpload}
                className="hidden"
              />
              <label
                htmlFor="photos"
                className="flex flex-col items-center cursor-pointer"
              >
                <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                <span className="text-sm text-muted-foreground">
                  클릭하여 사진 업로드
                </span>
              </label>
            </div>

            {photos.length > 0 && (
              <div className="grid grid-cols-4 gap-3 mt-3">
                {photos.map((photo, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={photo}
                      alt={`Session ${index + 1}`}
                      className="w-full h-24 object-cover rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(index)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? "저장 중..." : (submitLabel ?? "보고서 제출")}
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            * 표시된 항목은 필수 입력 사항입니다
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
