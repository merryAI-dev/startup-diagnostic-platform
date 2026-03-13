import { useEffect, useState } from "react";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/redesign/app/components/ui/dialog";
import { Button } from "@/redesign/app/components/ui/button";
import { Label } from "@/redesign/app/components/ui/label";
import { Input } from "@/redesign/app/components/ui/input";
import { Textarea } from "@/redesign/app/components/ui/textarea";
import { Application, OfficeHourReport } from "@/redesign/app/lib/types";
import { isFirebaseConfigured, storage } from "@/redesign/app/lib/firebase";
import { X, Upload, AlertCircle } from "lucide-react";
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

const MIN_REPORT_SECTION_LENGTH = 50;
const COMPANY_STATUS_HEADER = "기업의 현황";
const ADVISORY_CONTENT_HEADER = "자문내용";

function buildReportContent(companyStatus: string, advisoryContent: string) {
  return `[${COMPANY_STATUS_HEADER}]\n${companyStatus.trim()}\n\n[${ADVISORY_CONTENT_HEADER}]\n${advisoryContent.trim()}`;
}

function parseReportContent(raw: string) {
  const text = raw.trim();
  if (!text) {
    return {
      companyStatus: "",
      advisoryContent: "",
    };
  }

  const companyStatusMatch = text.match(/\[기업의 현황\]\s*([\s\S]*?)(?:\n\s*\[자문내용\]|$)/u);
  const advisoryContentMatch = text.match(/\[자문내용\]\s*([\s\S]*)$/u);

  if (!companyStatusMatch && !advisoryContentMatch) {
    return {
      companyStatus: text,
      advisoryContent: "",
    };
  }

  return {
    companyStatus: companyStatusMatch?.[1]?.trim() ?? "",
    advisoryContent: advisoryContentMatch?.[1]?.trim() ?? "",
  };
}

function isStorageFileUrl(value: string) {
  return (
    value.startsWith("http://")
    || value.startsWith("https://")
    || value.startsWith("gs://")
  );
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
    const parsedContent = parseReportContent(initialReport?.content ?? "");
    if (initialReport) {
      return {
        date: initialReport.date || application.scheduledDate || "",
        location: initialReport.location || "",
        topic: initialReport.topic || application.agenda,
        participants:
          initialReport.participants && initialReport.participants.length > 0
            ? initialReport.participants
            : [""],
        content: parsedContent.companyStatus,
        advisoryContent: parsedContent.advisoryContent,
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
      advisoryContent: "",
      followUp: "",
      duration: application.duration || 2,
      satisfaction: 5,
    };
  };

  const [formData, setFormData] = useState(buildFormState);
  const [photos, setPhotos] = useState<string[]>(initialReport?.photos ?? []);
  const [pendingPhotos, setPendingPhotos] = useState<Array<{ file: File; previewUrl: string }>>([]);

  useEffect(() => {
    if (!open) {
      setPendingPhotos((prev) => {
        prev.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        return [];
      });
      return;
    }
    setFormData(buildFormState());
    setPhotos(initialReport?.photos ?? []);
    setPendingPhotos([]);
  }, [open, initialReport, application]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const contentLength = formData.content.trim().length;
  const advisoryContentLength = formData.advisoryContent.trim().length;
  const followUpLength = formData.followUp.trim().length;
  const isContentValid = contentLength >= MIN_REPORT_SECTION_LENGTH;
  const isAdvisoryContentValid = advisoryContentLength >= MIN_REPORT_SECTION_LENGTH;
  const isFollowUpValid = followUpLength >= MIN_REPORT_SECTION_LENGTH;

  const removeStoredPhotos = async (photoUrls: string[]) => {
    if (!isFirebaseConfigured || !storage || photoUrls.length === 0) {
      return 0;
    }
    const storageInstance = storage;
    const targets = photoUrls.filter((url) => isStorageFileUrl(url));
    if (targets.length === 0) return 0;

    const results = await Promise.all(
      targets.map(async (url) => {
        try {
          await deleteObject(ref(storageInstance, url));
          return true;
        } catch {
          return false;
        }
      })
    );
    return results.filter((ok) => !ok).length;
  };

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const newItems = Array.from(files).map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      setPendingPhotos((prev) => [...prev, ...newItems]);
      setPhotos((prev) => [...prev, ...newItems.map((item) => item.previewUrl)]);
      toast.success(`${files.length}개의 사진이 추가되었습니다`);
      event.target.value = "";
    }
  };

  const handleRemovePhoto = (index: number) => {
    const targetUrl = photos[index];
    if (!targetUrl) return;
    setPhotos(photos.filter((_, i) => i !== index));
    setPendingPhotos((prev) => {
      const next = prev.filter((item) => item.previewUrl !== targetUrl);
      const removed = prev.find((item) => item.previewUrl === targetUrl);
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return next;
    });
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
    
    if (!isContentValid) {
      toast.error(`기업의 현황을 ${MIN_REPORT_SECTION_LENGTH}자 이상 입력해주세요`);
      return;
    }

    if (!isAdvisoryContentValid) {
      toast.error(`자문내용을 ${MIN_REPORT_SECTION_LENGTH}자 이상 입력해주세요`);
      return;
    }

    if (!isFollowUpValid) {
      toast.error(`팔로업 계획을 ${MIN_REPORT_SECTION_LENGTH}자 이상 입력해주세요`);
      return;
    }

    setIsSubmitting(true);

    try {
      let uploadedPhotoUrls: string[] = [];
      if (pendingPhotos.length > 0) {
        if (isFirebaseConfigured && storage) {
          const storageInstance = storage;
          const uploadBase = `reports/${application.id}/${Date.now()}`;
          uploadedPhotoUrls = await Promise.all(
            pendingPhotos.map(async (item, index) => {
              const fileRef = ref(storageInstance, `${uploadBase}-${index}-${item.file.name}`);
              await uploadBytes(fileRef, item.file);
              return getDownloadURL(fileRef);
            })
          );
        } else {
          uploadedPhotoUrls = pendingPhotos.map((item) => item.previewUrl);
        }
      }

      const pendingPreviewUrls = new Set(pendingPhotos.map((item) => item.previewUrl));
      const retainedPhotos = photos.filter((url) => !pendingPreviewUrls.has(url));
      const finalPhotos = [...retainedPhotos, ...uploadedPhotoUrls];
      const removedExistingPhotos = (initialReport?.photos ?? []).filter(
        (url) => !finalPhotos.includes(url)
      );

      const report: Omit<OfficeHourReport, "id" | "createdAt" | "updatedAt" | "completedAt"> = {
        applicationId: application.id,
        consultantId: initialReport?.consultantId || application.consultantId || "",
        consultantName: initialReport?.consultantName || application.consultant,
        date: formData.date,
        location: formData.location,
        topic: formData.topic,
        participants: formData.participants.filter(p => p.trim() !== ""),
        content: buildReportContent(formData.content, formData.advisoryContent),
        followUp: formData.followUp,
        photos: finalPhotos,
        duration: formData.duration,
        satisfaction: formData.satisfaction,
        programId: application.programId || "",
      };

      await onSubmit(report);
      const failedPhotoDeletes = await removeStoredPhotos(removedExistingPhotos);
      if (failedPhotoDeletes > 0) {
        toast.error(`사진 ${failedPhotoDeletes}개 삭제에 실패했습니다.`);
      }
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
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-5">
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
            className={`mx-6 mt-4 shrink-0 rounded-lg border px-4 py-3 text-sm ${
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

        <form onSubmit={handleSubmit} className="mt-4 flex min-h-0 flex-1 flex-col min-w-0">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 pb-6">
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

            {/* 기업의 현황 */}
            <div className="space-y-2">
              <Label htmlFor="content">기업의 현황 *</Label>
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="기업의 현재 상황, 진행 상태, 핵심 이슈를 구체적으로 작성해주세요"
                rows={6}
                required
                className="resize-none min-w-0 w-full [field-sizing:fixed] overflow-x-hidden [overflow-wrap:anywhere]"
              />
              <p className={`text-xs ${isContentValid ? "text-emerald-600" : "text-rose-600"}`}>
                {contentLength}/{MIN_REPORT_SECTION_LENGTH}자
              </p>
            </div>

            {/* 자문내용 */}
            <div className="space-y-2">
              <Label htmlFor="advisoryContent">자문내용 *</Label>
              <Textarea
                id="advisoryContent"
                value={formData.advisoryContent}
                onChange={(e) => setFormData({ ...formData, advisoryContent: e.target.value })}
                placeholder="자문 시 전달한 핵심 피드백, 제안, 실행 가이드를 작성해주세요"
                rows={6}
                required
                className="resize-none min-w-0 w-full [field-sizing:fixed] overflow-x-hidden [overflow-wrap:anywhere]"
              />
              <p className={`text-xs ${isAdvisoryContentValid ? "text-emerald-600" : "text-rose-600"}`}>
                {advisoryContentLength}/{MIN_REPORT_SECTION_LENGTH}자
              </p>
            </div>

            {/* 팔로업 계획 */}
            <div className="space-y-2">
              <Label htmlFor="followUp">팔로업 계획 *</Label>
              <Textarea
                id="followUp"
                value={formData.followUp}
                onChange={(e) => setFormData({ ...formData, followUp: e.target.value })}
                placeholder="후속 조치, 기업에서 해야 할 액션 아이템, 다음 세션 계획 등을 작성해주세요"
                rows={4}
                required
                className="resize-none min-w-0 w-full [field-sizing:fixed] overflow-x-hidden [overflow-wrap:anywhere]"
              />
              <p className={`text-xs ${isFollowUpValid ? "text-emerald-600" : "text-rose-600"}`}>
                {followUpLength}/{MIN_REPORT_SECTION_LENGTH}자
              </p>
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
          </div>

          <div className="shrink-0 border-t px-6 py-4">
            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={isSubmitting || !isContentValid || !isAdvisoryContentValid || !isFollowUpValid}
                className="flex-1"
              >
                {isSubmitting ? "저장 중..." : (submitLabel ?? "보고서 제출")}
              </Button>
            </div>

            <p className="mt-3 text-center text-xs text-muted-foreground">
              * 표시된 항목은 필수 입력 사항입니다
            </p>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
