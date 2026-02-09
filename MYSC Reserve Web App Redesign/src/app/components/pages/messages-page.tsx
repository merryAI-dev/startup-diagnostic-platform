import { useState } from "react";
import { User, ChatRoom, ChatMessage, ChatAttachment } from "../../lib/types";
import { ChatList } from "../chat/chat-list";
import { ChatWindow } from "../chat/chat-window";
import { MessageSquare } from "lucide-react";

interface MessagesPageProps {
  currentUser: User;
  chatRooms: ChatRoom[];
  messages: ChatMessage[];
  onSendMessage: (roomId: string, content: string, attachments?: ChatAttachment[]) => void;
}

export function MessagesPage({
  currentUser,
  chatRooms,
  messages,
  onSendMessage,
}: MessagesPageProps) {
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);

  const roomMessages = selectedRoom
    ? messages.filter(m => m.chatRoomId === selectedRoom.id)
    : [];

  return (
    <div className="h-full flex bg-slate-50">
      {/* 채팅방 목록 */}
      <div className="w-80 flex-shrink-0">
        <ChatList
          currentUser={currentUser}
          chatRooms={chatRooms}
          onSelectRoom={setSelectedRoom}
          selectedRoomId={selectedRoom?.id}
        />
      </div>

      {/* 채팅 윈도우 */}
      <div className="flex-1 flex items-center justify-center">
        {selectedRoom ? (
          <div className="w-full h-full">
            <ChatWindow
              currentUser={currentUser}
              chatRoom={selectedRoom}
              messages={roomMessages}
              onSendMessage={(content, attachments) =>
                onSendMessage(selectedRoom.id, content, attachments)
              }
            />
          </div>
        ) : (
          <div className="text-center">
            <MessageSquare className="size-20 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-700 mb-2">
              대화를 선택하세요
            </h3>
            <p className="text-slate-500">
              왼쪽에서 채팅방을 선택하거나 새로운 대화를 시작하세요
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
