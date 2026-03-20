import { ArrowLeft, Calendar, Clock, FileText, MessageSquare, Edit, XCircle } from "lucide-react";
import { Button } from "@/redesign/app/components/ui/button";
import { Card, CardContent } from "@/redesign/app/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/redesign/app/components/ui/tabs";
import { Textarea } from "@/redesign/app/components/ui/textarea";
import { Label } from "@/redesign/app/components/ui/label";
import { StatusChip } from "@/redesign/app/components/status-chip";
import { Application, Message } from "@/redesign/app/lib/types";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useEffect, useMemo, useState } from "react";
import { FileUpload } from "@/redesign/app/components/file-upload";
import { FileItem } from "@/redesign/app/lib/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/redesign/app/components/ui/alert-dialog";

interface ApplicationDetailProps {
  application: Application;
  messages: Message[];
  onBack: () => void;
  onSendMessage: (content: string, files: FileItem[]) => void;
  onCancelApplication: () => void;
  onRejectApplication?: (reason: string) => void;
  onUpdateRejectionReason?: (reason: string) => void;
  onUpdateCompanyApplication?: (payload: {
    requestContent: string;
    retainedAttachments: Array<{ name: string; url?: string }>;
    newFiles: FileItem[];
  }) => Promise<boolean>;
  currentUserRole?: string;
  currentConsultantId?: string | null;
  currentConsultantName?: string | null;
}

function normalizeConsultantDisplayName(value?: string | null): string {
  return (value ?? "")
    .replace(/\s*컨설턴트\s*$/u, "")
    .trim()
    .toLowerCase();
}

export function ApplicationDetail({
  application,
  messages,
  onBack,
  onSendMessage,
  onCancelApplication,
  onRejectApplication,
  onUpdateRejectionReason,
  onUpdateCompanyApplication,
  currentUserRole,
  currentConsultantId,
  currentConsultantName,
}: ApplicationDetailProps) {
  const [messageContent, setMessageContent] = useState("");
  const [messageFiles, setMessageFiles] = useState<FileItem[]>([]);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showEditRejectDialog, setShowEditRejectDialog] = useState(false);
  const [editRejectReason, setEditRejectReason] = useState(
    application.rejectionReason ?? ""
  );

  const handleSendMessage = () => {
    if (messageContent.trim()) {
      onSendMessage(messageContent, messageFiles);
      setMessageContent("");
      setMessageFiles([]);
    }
  };

  const messageTemplates = [
    { label: "변경 요청", content: "일정 변경을 요청드립니다.\n\n변경 희망 일시:\n변경 사유:" },
    { label: "자료 추가", content: "추가 자료를 첨부합니다.\n\n첨부 자료 설명:" },
    { label: "사전 질문", content: "미팅 전 사전 질문 드립니다.\n\n질문 내용:" },
  ];

  const isConsultantUser = currentUserRole === "consultant";
  const isCompanyUser = currentUserRole === "user" || currentUserRole === "company";
  const canViewMessageTab = !isCompanyUser && !isConsultantUser;
  const getSessionEndTime = () => {
    const durationHours = application.duration ?? 1;
    if (application.scheduledDate && application.scheduledTime) {
      const start = new Date(`${application.scheduledDate}T${application.scheduledTime}`);
      if (!Number.isNaN(start.getTime())) {
        return new Date(start.getTime() + durationHours * 60 * 60 * 1000);
      }
    }
    if (application.scheduledDate) {
      const fallback = new Date(`${application.scheduledDate}T23:59`);
      if (!Number.isNaN(fallback.getTime())) {
        return fallback;
      }
    }
    return null;
  };
  const isSessionEnded = (() => {
    const endTime = getSessionEndTime();
    return Boolean(endTime && new Date() >= endTime);
  })();
  const isPendingLike =
    application.status === "pending" || application.status === "review";
  const canCancel =
    isCompanyUser
    && isPendingLike
    && !isSessionEnded;
  const shouldShowConsultant = (consultant?: string) =>
    Boolean(consultant && consultant !== "담당자 배정 중");
  const isAssignedToCurrentConsultant = () => {
    if (!isConsultantUser) return false;
    if (currentConsultantId && currentConsultantId === application.consultantId) {
      return true;
    }
    const currentNameKey = normalizeConsultantDisplayName(currentConsultantName);
    return (
      currentNameKey !== "" &&
      currentNameKey === normalizeConsultantDisplayName(application.consultant)
    );
  };
  const isUnassigned =
    !application.consultantId
    && (!application.consultant || application.consultant === "담당자 배정 중");
  const canReject =
    isConsultantUser
    && isPendingLike
    && (isUnassigned || isAssignedToCurrentConsultant())
    && Boolean(onRejectApplication);
  const canEditRejectReason =
    isConsultantUser
    && application.status === "rejected"
    && isAssignedToCurrentConsultant()
    && Boolean(onUpdateRejectionReason);
  const attachmentItems = useMemo(() => {
    const names = application.attachments ?? [];
    const urls = application.attachmentUrls ?? [];
    const items: Array<{ id: string; name: string; url?: string }> = urls.map((url, idx) => ({
      id: `url-${idx}`,
      name: names[idx] || `첨부 파일 ${idx + 1}`,
      url,
    }));
    if (names.length > urls.length) {
      names.slice(urls.length).forEach((name, idx) => {
        items.push({
          id: `name-${idx}`,
          name,
          url: undefined,
        });
      });
    }
    return items;
  }, [application.attachments, application.attachmentUrls]);
  const canEditCompanyApplication =
    isCompanyUser
    && !isSessionEnded
    && (isPendingLike || application.status === "confirmed")
    && Boolean(onUpdateCompanyApplication);
  const [isEditingCompanyApplication, setIsEditingCompanyApplication] = useState(false);
  const [editingRequestContent, setEditingRequestContent] = useState(
    application.requestContent ?? ""
  );
  const [editingRetainedAttachments, setEditingRetainedAttachments] = useState(attachmentItems);
  const [editingNewFiles, setEditingNewFiles] = useState<FileItem[]>([]);
  const [savingCompanyEdit, setSavingCompanyEdit] = useState(false);

  useEffect(() => {
    setEditingRequestContent(application.requestContent ?? "");
    setEditingRetainedAttachments(attachmentItems);
    setEditingNewFiles([]);
    setIsEditingCompanyApplication(false);
  }, [application.id, application.requestContent, attachmentItems]);

  const handleSaveCompanyApplication = async () => {
    if (!onUpdateCompanyApplication || !canEditCompanyApplication) return;
    const trimmedRequestContent = editingRequestContent.trim();
    if (!trimmedRequestContent) {
      return;
    }

    setSavingCompanyEdit(true);
    const ok = await onUpdateCompanyApplication({
      requestContent: trimmedRequestContent,
      retainedAttachments: editingRetainedAttachments.map((item) => ({
        name: item.name,
        url: item.url,
      })),
      newFiles: editingNewFiles,
    });
    setSavingCompanyEdit(false);

    if (!ok) return;
    setIsEditingCompanyApplication(false);
    setEditingNewFiles([]);
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <Button variant="ghost" onClick={onBack} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          돌아가기
        </Button>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h1>{application.officeHourTitle}</h1>
              <StatusChip status={application.status} />
            </div>
            {shouldShowConsultant(application.consultant) && (
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">
                  {application.consultant}
                </p>
                {isConsultantUser && !isAssignedToCurrentConsultant() && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    다른 컨설턴트
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canEditCompanyApplication && (
              <Button
                variant="outline"
                onClick={() => {
                  setEditingRequestContent(application.requestContent ?? "");
                  setEditingRetainedAttachments(attachmentItems);
                  setEditingNewFiles([]);
                  setIsEditingCompanyApplication((prev) => !prev);
                }}
              >
                <Edit className="w-4 h-4 mr-2" />
                {isEditingCompanyApplication ? "수정 취소" : "신청 수정"}
              </Button>
            )}
            {canReject && (
              <Button
                variant="outline"
                onClick={() => setShowRejectDialog(true)}
              >
                <XCircle className="w-4 h-4 mr-2" />
                거절
              </Button>
            )}
            {canEditRejectReason && (
              <Button
                variant="outline"
                onClick={() => {
                  setEditRejectReason(application.rejectionReason ?? "");
                  setShowEditRejectDialog(true);
                }}
              >
                <Edit className="w-4 h-4 mr-2" />
                거절 사유 수정
              </Button>
            )}
            {canCancel && (
              <Button
                variant="outline"
                onClick={() => setShowCancelDialog(true)}
              >
                <XCircle className="w-4 h-4 mr-2" />
                신청 삭제
              </Button>
            )}
          </div>
        </div>
      </div>

      {isCompanyUser ? (
        <div className="rounded-lg border bg-white p-5 space-y-5">
          <div>
            <p className="text-xs text-muted-foreground mb-1">일정 정보</p>
            <div className="text-sm space-y-1.5">
              {application.scheduledDate ? (
                <>
                  <p>
                    {format(new Date(application.scheduledDate), "yyyy년 M월 d일 (E)", {
                      locale: ko,
                    })}
                  </p>
                  <p>{application.scheduledTime}</p>
                </>
              ) : application.periodFrom ? (
                <p>
                  희망 기간:{" "}
                  {format(new Date(application.periodFrom), "M월 d일", { locale: ko })} ~{" "}
                  {format(new Date(application.periodTo!), "M월 d일", { locale: ko })}
                </p>
              ) : (
                <p className="text-muted-foreground">일정 조율 중</p>
              )}
              <p className="text-muted-foreground">
                {application.sessionFormat === "online" ? "온라인" : "오프라인"}
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">아젠다</p>
            <p className="text-sm">{application.agenda}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">요청 내용</p>
            {isEditingCompanyApplication ? (
              <Textarea
                value={editingRequestContent}
                onChange={(e) => setEditingRequestContent(e.target.value)}
                className="min-h-[140px]"
              />
            ) : (
              <p className="text-sm whitespace-pre-wrap">{application.requestContent}</p>
            )}
          </div>

          {(application.status === "rejected" || Boolean(application.rejectionReason)) && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">거절 사유</p>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                {application.rejectionReason?.trim() || "거절 사유가 등록되지 않았습니다."}
              </p>
            </div>
          )}

          {(attachmentItems.length > 0 || isEditingCompanyApplication) && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground mb-1">첨부 파일</p>
              {isEditingCompanyApplication ? (
                <>
                  {editingRetainedAttachments.length > 0 && (
                    <div className="space-y-1">
                      {editingRetainedAttachments.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-md border px-2.5 py-2 text-sm"
                        >
                          {item.url ? (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              download
                              className="text-primary underline underline-offset-2 break-all"
                            >
                              {item.name}
                            </a>
                          ) : (
                            <span className="text-muted-foreground break-all">{item.name}</span>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setEditingRetainedAttachments((prev) =>
                                prev.filter((target) => target.id !== item.id)
                              )
                            }
                          >
                            삭제
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <FileUpload
                    files={editingNewFiles}
                    onFilesChange={setEditingNewFiles}
                    maxFiles={5}
                  />
                </>
              ) : (
                <div className="space-y-1">
                  {attachmentItems.map((item) =>
                    item.url ? (
                      <a
                        key={item.id}
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                        className="block text-sm text-primary underline underline-offset-2 break-all"
                      >
                        • {item.name}
                      </a>
                    ) : (
                      <p key={item.id} className="text-sm text-muted-foreground break-all">
                        • {item.name}
                      </p>
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {isEditingCompanyApplication && (
            <div className="flex justify-end gap-2 border-t pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEditingCompanyApplication(false);
                  setEditingRequestContent(application.requestContent ?? "");
                  setEditingRetainedAttachments(attachmentItems);
                  setEditingNewFiles([]);
                }}
                disabled={savingCompanyEdit}
              >
                취소
              </Button>
              <Button
                type="button"
                onClick={handleSaveCompanyApplication}
                disabled={savingCompanyEdit || editingRequestContent.trim().length === 0}
              >
                {savingCompanyEdit ? "저장 중..." : "저장"}
              </Button>
            </div>
          )}

          <div className="pt-3 border-t text-xs text-muted-foreground space-y-1">
            <p>
              신청일:{" "}
              {format(application.createdAt, "yyyy년 M월 d일 HH:mm", {
                locale: ko,
              })}
            </p>
            {application.projectName && <p>프로젝트: {application.projectName}</p>}
          </div>
        </div>
      ) : (
        <Tabs defaultValue="details" className="w-full">
          <TabsList>
            <TabsTrigger value="details">신청 내용</TabsTrigger>
            {canViewMessageTab && (
              <TabsTrigger value="messages">
                전달사항 ({messages.length})
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <Card>
              <CardContent className="p-6 space-y-6">
                {/* Schedule info */}
                <div>
                  <h3 className="mb-3">일정 정보</h3>
                  <div className="space-y-2 text-sm">
                    {application.scheduledDate ? (
                      <>
                        <div className="flex items-center gap-3">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span>
                            {format(
                              new Date(application.scheduledDate),
                              "yyyy년 M월 d일 (E)",
                              { locale: ko }
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <span>{application.scheduledTime}</span>
                        </div>
                      </>
                    ) : application.periodFrom ? (
                      <div className="flex items-center gap-3">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span>
                          희망 기간:{" "}
                          {format(new Date(application.periodFrom), "M월 d일", {
                            locale: ko,
                          })}{" "}
                          ~{" "}
                          {format(new Date(application.periodTo!), "M월 d일", {
                            locale: ko,
                          })}
                        </span>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">일정 조율 중</p>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="px-2 py-1 bg-muted rounded text-xs">
                        {application.sessionFormat === "online"
                          ? "온라인"
                          : "오프라인"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Agenda */}
                <div>
                  <h3 className="mb-2">아젠다</h3>
                  <p className="text-sm">{application.agenda}</p>
                </div>

                {/* Request content */}
                <div>
                  <h3 className="mb-2">요청 내용</h3>
                  <p className="text-sm whitespace-pre-wrap">
                    {application.requestContent}
                  </p>
                </div>

                {(application.status === "rejected" || Boolean(application.rejectionReason)) && (
                  <div>
                    <h3 className="mb-2">거절 사유</h3>
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                      {application.rejectionReason?.trim() || "거절 사유가 등록되지 않았습니다."}
                    </p>
                  </div>
                )}

                {/* Attachments */}
                {attachmentItems.length > 0 && (
                  <div>
                    <h3 className="mb-2">첨부 파일</h3>
                    <div className="space-y-2">
                      {attachmentItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-2 p-2 bg-muted rounded"
                        >
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          {item.url ? (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              download
                              className="text-sm text-primary underline underline-offset-2 break-all"
                            >
                              {item.name}
                            </a>
                          ) : (
                            <span className="text-sm">{item.name}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Application info */}
                <div className="pt-4 border-t">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      신청일:{" "}
                      {format(application.createdAt, "yyyy년 M월 d일 HH:mm", {
                        locale: ko,
                      })}
                    </span>
                    {application.projectName && (
                      <span>프로젝트: {application.projectName}</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {canViewMessageTab && (
            <TabsContent value="messages" className="space-y-4">
              {/* Message templates */}
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-4">
                  <p className="text-sm mb-3">빠른 메시지</p>
                  <div className="flex gap-2">
                    {messageTemplates.map((template, idx) => (
                      <Button
                        key={idx}
                        variant="outline"
                        size="sm"
                        onClick={() => setMessageContent(template.content)}
                        className="bg-white"
                      >
                        {template.label}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Message thread */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="mb-4">메시지</h3>
                  <div className="space-y-4 mb-6">
                    {messages.length > 0 ? (
                      messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${
                            msg.sender === "user" ? "justify-end" : "justify-start"
                          }`}
                        >
                          <div
                            className={`max-w-[70%] rounded-lg p-3 ${
                              msg.sender === "user"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap">
                              {msg.content}
                            </p>
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-current/20">
                                {msg.attachments.map((file, idx) => (
                                  <div
                                    key={idx}
                                    className="text-xs flex items-center gap-1"
                                  >
                                    <FileText className="w-3 h-3" />
                                    {file}
                                  </div>
                                ))}
                              </div>
                            )}
                            <p className="text-xs opacity-70 mt-2">
                              {format(msg.timestamp, "M월 d일 HH:mm", {
                                locale: ko,
                              })}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        메시지가 없습니다
                      </p>
                    )}
                  </div>

                  {/* New message */}
                  <div className="space-y-3 pt-4 border-t">
                    <Textarea
                      value={messageContent}
                      onChange={(e) => setMessageContent(e.target.value)}
                      placeholder="메시지를 입력하세요..."
                      className="min-h-[100px]"
                    />
                    <FileUpload
                      files={messageFiles}
                      onFilesChange={setMessageFiles}
                      maxFiles={3}
                    />
                    <div className="flex justify-end">
                      <Button onClick={handleSendMessage}>
                        <MessageSquare className="w-4 h-4 mr-2" />
                        전송
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      )}

      {/* Cancel confirmation dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>신청을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              이 작업은 되돌릴 수 없습니다. 삭제하면 신청 내역은 사라집니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onCancelApplication();
                setShowCancelDialog(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject confirmation dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>신청을 거절하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              거절된 신청은 기업에 '거절됨' 상태로 표시됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">거절 사유</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="거절 사유를 입력해주세요"
              className="min-h-[90px]"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (rejectReason.trim().length === 0) return;
                onRejectApplication?.(rejectReason);
                setShowRejectDialog(false);
                setRejectReason("");
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              거절하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit rejection reason dialog */}
      <AlertDialog open={showEditRejectDialog} onOpenChange={setShowEditRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>거절 사유 수정</AlertDialogTitle>
            <AlertDialogDescription>
              기업에게 표시될 거절 사유를 수정합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="edit-reject-reason">거절 사유</Label>
            <Textarea
              id="edit-reject-reason"
              value={editRejectReason}
              onChange={(e) => setEditRejectReason(e.target.value)}
              placeholder="거절 사유를 입력해주세요"
              className="min-h-[90px]"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (editRejectReason.trim().length === 0) return;
                onUpdateRejectionReason?.(editRejectReason);
                setShowEditRejectDialog(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              수정하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
