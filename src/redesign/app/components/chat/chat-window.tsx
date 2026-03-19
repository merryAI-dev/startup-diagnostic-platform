import { Avatar } from "@/redesign/app/components/ui/avatar";
import { Button } from "@/redesign/app/components/ui/button";
import { Input } from "@/redesign/app/components/ui/input";
import { ScrollArea } from "@/redesign/app/components/ui/scroll-area";
import { cn } from "@/redesign/app/components/ui/utils";
import { ChatAttachment, ChatMessage, ChatRoom, User } from "@/redesign/app/lib/types";
import { Download, File, Image as ImageIcon, MoreVertical, Paperclip, Phone, Send, Smile, Video, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

interface ChatWindowProps {
  currentUser: User;
  chatRoom: ChatRoom;
  messages: ChatMessage[];
  onSendMessage: (content: string, attachments?: ChatAttachment[]) => void;
}

export function ChatWindow({
  currentUser,
  chatRoom,
  messages,
  onSendMessage,
}: ChatWindowProps) {
  const [messageText, setMessageText] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (messageText.trim() || attachments.length > 0) {
      onSendMessage(messageText, attachments);
      setMessageText("");
      setAttachments([]);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newAttachments: ChatAttachment[] = files.map(file => ({
      id: `att_${Date.now()}_${Math.random()}`,
      name: file.name,
      url: URL.createObjectURL(file),
      type: file.type.startsWith("image/") ? "image" : "file",
      size: file.size,
    }));
    setAttachments([...attachments, ...newAttachments]);
  };

  const removeAttachment = (id: string) => {
    setAttachments(attachments.filter(att => att.id !== id));
  };

  const groupMessagesByDate = (messages: ChatMessage[]) => {
    const groups: { [key: string]: ChatMessage[] } = {};
    messages.forEach(msg => {
      const dateKey = new Date(msg.createdAt).toLocaleDateString("ko-KR");
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(msg);
    });
    return groups;
  };

  const groupedMessages = groupMessagesByDate(messages);

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 헤더 */}
      <div className="p-4 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10">
              <div className="w-full h-full bg-gradient-to-br from-[#5DADE2] to-[#0A2540] flex items-center justify-center text-white font-semibold">
                {chatRoom.name.charAt(0).toUpperCase()}
              </div>
            </Avatar>
            <div>
              <h3 className="font-semibold text-[#0A2540]">{chatRoom.name}</h3>
              <p className="text-xs text-slate-500">
                {chatRoom.participants.length}명 참여 중
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm">
              <Phone className="size-4" />
            </Button>
            <Button variant="ghost" size="sm">
              <Video className="size-4" />
            </Button>
            <Button variant="ghost" size="sm">
              <MoreVertical className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* 메시지 영역 */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {Object.entries(groupedMessages).map(([date, msgs]) => (
            <div key={date}>
              {/* 날짜 구분선 */}
              <div className="flex items-center justify-center my-4">
                <div className="bg-slate-200 rounded-full px-3 py-1">
                  <span className="text-xs text-slate-600">{date}</span>
                </div>
              </div>

              {/* 메시지들 */}
              {msgs.map((message, index) => {
                const isCurrentUser = message.senderId === currentUser.id;
                const prevMessage = msgs[index - 1];
                const nextMessage = msgs[index + 1];
                const showAvatar =
                  index === 0 || prevMessage?.senderId !== message.senderId;
                const showTime =
                  index === msgs.length - 1 ||
                  nextMessage?.senderId !== message.senderId;

                return (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={cn(
                      "flex gap-2 mb-2",
                      isCurrentUser ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    {/* 아바타 */}
                    <div className="flex-shrink-0">
                      {!isCurrentUser && showAvatar ? (
                        <Avatar className="w-8 h-8">
                          <div className="w-full h-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center text-white text-xs font-semibold">
                            {message.senderName.charAt(0).toUpperCase()}
                          </div>
                        </Avatar>
                      ) : (
                        <div className="w-8 h-8" />
                      )}
                    </div>

                    {/* 메시지 내용 */}
                    <div className={cn("flex flex-col", isCurrentUser ? "items-end" : "items-start")}>
                      {!isCurrentUser && showAvatar && (
                        <span className="text-xs text-slate-600 mb-1 px-1">
                          {message.senderName}
                        </span>
                      )}

                      <div
                        className={cn(
                          "rounded-2xl px-4 py-2 max-w-md",
                          isCurrentUser
                            ? "bg-[#5DADE2] text-white rounded-tr-sm"
                            : "bg-slate-100 text-slate-900 rounded-tl-sm"
                        )}
                      >
                        <p className="text-sm whitespace-pre-wrap break-words">
                          {message.content}
                        </p>

                        {/* 첨부파일 */}
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="mt-2 space-y-2">
                            {message.attachments.map((att) => (
                              <div
                                key={att.id}
                                className={cn(
                                  "flex items-center gap-2 p-2 rounded-lg",
                                  isCurrentUser ? "bg-white/20" : "bg-white"
                                )}
                              >
                                {att.type === "image" ? (
                                  <ImageIcon className="size-4" />
                                ) : (
                                  <File className="size-4" />
                                )}
                                <span className="text-xs flex-1 truncate">{att.name}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={cn(
                                    "h-6 w-6 p-0",
                                    isCurrentUser ? "text-white" : "text-slate-600"
                                  )}
                                >
                                  <Download className="size-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {showTime && (
                        <span className="text-xs text-slate-400 mt-1 px-1">
                          {new Date(message.createdAt).toLocaleTimeString("ko-KR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* 첨부파일 미리보기 */}
      <AnimatePresence>
        {attachments.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="px-4 py-2 bg-slate-50 border-t border-slate-200"
          >
            <div className="flex gap-2 overflow-x-auto">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="relative flex-shrink-0 p-2 bg-white rounded-lg border border-slate-200"
                >
                  <div className="flex items-center gap-2">
                    {att.type === "image" ? (
                      <ImageIcon className="size-4 text-slate-600" />
                    ) : (
                      <File className="size-4 text-slate-600" />
                    )}
                    <span className="text-xs text-slate-700 max-w-[100px] truncate">
                      {att.name}
                    </span>
                  </div>
                  <button
                    onClick={() => removeAttachment(att.id)}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 입력 영역 */}
      <div className="p-4 border-t border-slate-200 bg-white">
        <div className="flex items-end gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            multiple
            className="hidden"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0"
          >
            <Paperclip className="size-5" />
          </Button>

          <div className="flex-1 relative">
            <Input
              placeholder="메시지를 입력하세요..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyPress={handleKeyPress}
              className="pr-10 resize-none"
            />
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2"
            >
              <Smile className="size-5 text-slate-400" />
            </Button>
          </div>

          <Button
            onClick={handleSend}
            disabled={!messageText.trim() && attachments.length === 0}
            className="flex-shrink-0 bg-[#5DADE2] hover:bg-[#5DADE2]/90"
          >
            <Send className="size-4" />
          </Button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Enter로 전송, Shift + Enter로 줄바꿈
        </p>
      </div>
    </div>
  );
}
