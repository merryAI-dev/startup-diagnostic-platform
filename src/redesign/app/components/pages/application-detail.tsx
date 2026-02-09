import { ArrowLeft, Calendar, Clock, FileText, MessageSquare, Edit, XCircle } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Textarea } from "../ui/textarea";
import { StatusChip } from "../status-chip";
import { Application, Message } from "../../lib/types";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useState } from "react";
import { FileUpload } from "../file-upload";
import { FileItem } from "../../lib/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";

interface ApplicationDetailProps {
  application: Application;
  messages: Message[];
  onBack: () => void;
  onSendMessage: (content: string, files: FileItem[]) => void;
  onCancelApplication: () => void;
}

export function ApplicationDetail({
  application,
  messages,
  onBack,
  onSendMessage,
  onCancelApplication,
}: ApplicationDetailProps) {
  const [messageContent, setMessageContent] = useState("");
  const [messageFiles, setMessageFiles] = useState<FileItem[]>([]);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

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

  const canCancel = application.status === "pending" || application.status === "review";

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
            <p className="text-sm text-muted-foreground">
              {application.consultant}
            </p>
          </div>
          {canCancel && (
            <Button
              variant="outline"
              onClick={() => setShowCancelDialog(true)}
            >
              <XCircle className="w-4 h-4 mr-2" />
              신청 취소
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="details" className="w-full">
        <TabsList>
          <TabsTrigger value="details">신청 내용</TabsTrigger>
          <TabsTrigger value="messages">
            전달사항 ({messages.length})
          </TabsTrigger>
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

              {/* Attachments */}
              {application.attachments.length > 0 && (
                <div>
                  <h3 className="mb-2">첨부 파일</h3>
                  <div className="space-y-2">
                    {application.attachments.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 p-2 bg-muted rounded"
                      >
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{file}</span>
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
      </Tabs>

      {/* Cancel confirmation dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>신청을 취소하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              이 작업은 되돌릴 수 없습니다. 취소 후 다시 신청하실 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onCancelApplication();
                setShowCancelDialog(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              취소하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
