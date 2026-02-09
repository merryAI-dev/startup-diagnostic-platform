import { ChatRoom, User } from "../../lib/types";
import { Search, Plus, Users, MessageSquare, Clock } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { Avatar } from "../ui/avatar";
import { cn } from "../ui/utils";
import { useState } from "react";

interface ChatListProps {
  currentUser: User;
  chatRooms: ChatRoom[];
  onSelectRoom: (room: ChatRoom) => void;
  selectedRoomId?: string;
}

export function ChatList({
  currentUser,
  chatRooms,
  onSelectRoom,
  selectedRoomId,
}: ChatListProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredRooms = chatRooms.filter(room =>
    room.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "방금";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}분`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}시간`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}일`;
    return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  };

  return (
    <div className="h-full bg-white border-r border-slate-200 flex flex-col">
      {/* 헤더 */}
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[#0A2540]">메시지</h2>
          <Button size="sm" className="bg-[#5DADE2] hover:bg-[#5DADE2]/90">
            <Plus className="size-4 mr-1" />
            새 대화
          </Button>
        </div>

        {/* 검색 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            placeholder="대화 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* 채팅방 목록 */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {filteredRooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <MessageSquare className="size-12 text-slate-300 mb-3" />
              <p className="text-slate-500 text-sm">
                {searchQuery ? "검색 결과가 없습니다" : "대화 목록이 비어있습니다"}
              </p>
            </div>
          ) : (
            filteredRooms.map((room) => {
              const isSelected = room.id === selectedRoomId;
              const hasUnread = room.unreadCount > 0;

              return (
                <button
                  key={room.id}
                  onClick={() => onSelectRoom(room)}
                  className={cn(
                    "w-full p-3 rounded-lg text-left transition-all mb-1",
                    isSelected
                      ? "bg-[#5DADE2]/10 border-2 border-[#5DADE2]"
                      : hasUnread
                      ? "bg-blue-50 hover:bg-blue-100 border-2 border-transparent"
                      : "hover:bg-slate-50 border-2 border-transparent"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* 아바타 */}
                    <div className="relative flex-shrink-0">
                      <Avatar className="w-12 h-12">
                        <div className="w-full h-full bg-gradient-to-br from-[#5DADE2] to-[#0A2540] flex items-center justify-center text-white font-semibold">
                          {room.type === "group" ? (
                            <Users className="size-6" />
                          ) : (
                            room.name.charAt(0).toUpperCase()
                          )}
                        </div>
                      </Avatar>
                      {hasUnread && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-xs font-bold">
                            {room.unreadCount > 9 ? "9+" : room.unreadCount}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 내용 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3
                          className={cn(
                            "font-semibold text-sm truncate",
                            hasUnread ? "text-[#0A2540]" : "text-slate-700"
                          )}
                        >
                          {room.name}
                        </h3>
                        {room.lastMessage && (
                          <span className="text-xs text-slate-500 flex-shrink-0 ml-2">
                            {getTimeAgo(room.lastMessage.createdAt)}
                          </span>
                        )}
                      </div>

                      {room.lastMessage && (
                        <p
                          className={cn(
                            "text-xs truncate",
                            hasUnread ? "text-slate-700 font-medium" : "text-slate-500"
                          )}
                        >
                          {room.lastMessage.senderName}: {room.lastMessage.content}
                        </p>
                      )}

                      {/* 태그 */}
                      <div className="flex items-center gap-2 mt-2">
                        {room.type === "support" && (
                          <Badge variant="outline" className="text-xs">
                            <MessageSquare className="size-3 mr-1" />
                            고객 지원
                          </Badge>
                        )}
                        {room.applicationId && (
                          <Badge variant="outline" className="text-xs">
                            신청 관련
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* 하단 정보 */}
      <div className="p-3 border-t border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span className="flex items-center gap-1">
            <MessageSquare className="size-3" />
            {chatRooms.length}개의 대화
          </span>
          <span className="flex items-center gap-1">
            <Badge className="bg-red-500 text-white text-xs">
              {chatRooms.reduce((sum, room) => sum + room.unreadCount, 0)}
            </Badge>
            읽지 않음
          </span>
        </div>
      </div>
    </div>
  );
}
