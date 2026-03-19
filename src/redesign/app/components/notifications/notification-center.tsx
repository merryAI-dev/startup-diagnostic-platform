import { useState } from "react";
import { Notification } from "@/redesign/app/lib/types";
import { Bell, X, Check, CheckCheck, Trash2, Filter, Mail, Calendar, AlertCircle, MessageSquare, UserCheck } from "lucide-react";
import { Button } from "@/redesign/app/components/ui/button";
import { Badge } from "@/redesign/app/components/ui/badge";
import { ScrollArea } from "@/redesign/app/components/ui/scroll-area";
import { Separator } from "@/redesign/app/components/ui/separator";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/redesign/app/components/ui/utils";

interface NotificationCenterProps {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDelete: (id: string) => void;
  onNavigate: (link: string) => void;
}

const notificationIcons = {
  application_approved: { icon: CheckCheck, color: "text-emerald-600", bg: "bg-emerald-50" },
  application_rejected: { icon: X, color: "text-red-600", bg: "bg-red-50" },
  message: { icon: MessageSquare, color: "text-blue-600", bg: "bg-blue-50" },
  report_reminder: { icon: AlertCircle, color: "text-amber-600", bg: "bg-amber-50" },
  meeting_upcoming: { icon: Calendar, color: "text-purple-600", bg: "bg-purple-50" },
  meeting_cancelled: { icon: X, color: "text-slate-600", bg: "bg-slate-50" },
  consultant_assigned: { icon: UserCheck, color: "text-indigo-600", bg: "bg-indigo-50" },
  general: { icon: Bell, color: "text-slate-600", bg: "bg-slate-50" },
};

export function NotificationCenter({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
  onNavigate,
}: NotificationCenterProps) {
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const filteredNotifications = notifications.filter(n => 
    filter === "all" || !n.isRead
  ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "방금 전";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}분 전`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}시간 전`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}일 전`;
    return date.toLocaleDateString("ko-KR");
  };

  return (
    <div className="w-96 bg-white border-l border-slate-200 flex flex-col h-full shadow-lg">
      {/* 헤더 */}
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Bell className="size-5 text-[#0A2540]" />
            <h3 className="font-semibold text-[#0A2540]">알림</h3>
            {unreadCount > 0 && (
              <Badge className="bg-[#5DADE2] text-white">{unreadCount}</Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onMarkAllAsRead}
              className="text-xs text-[#5DADE2] hover:text-[#0A2540]"
            >
              모두 읽음
            </Button>
          )}
        </div>

        {/* 필터 */}
        <div className="flex gap-2">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("all")}
            className={cn(
              "flex-1",
              filter === "all" && "bg-[#5DADE2] hover:bg-[#5DADE2]/90"
            )}
          >
            전체
          </Button>
          <Button
            variant={filter === "unread" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("unread")}
            className={cn(
              "flex-1",
              filter === "unread" && "bg-[#5DADE2] hover:bg-[#5DADE2]/90"
            )}
          >
            읽지 않음
          </Button>
        </div>
      </div>

      {/* 알림 목록 */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          <AnimatePresence>
            {filteredNotifications.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-12 text-center"
              >
                <Mail className="size-12 text-slate-300 mb-3" />
                <p className="text-slate-500 text-sm">
                  {filter === "unread" ? "읽지 않은 알림이 없습니다" : "알림이 없습니다"}
                </p>
              </motion.div>
            ) : (
              filteredNotifications.map((notification, index) => {
                const iconConfig =
                  notificationIcons[
                    notification.type as keyof typeof notificationIcons
                  ] ?? notificationIcons.general;
                const Icon = iconConfig.icon;

                return (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    transition={{ duration: 0.2, delay: index * 0.05 }}
                    className={cn(
                      "mb-2 rounded-lg border transition-all cursor-pointer group",
                      notification.isRead
                        ? "bg-white border-slate-200 hover:border-slate-300"
                        : "bg-blue-50 border-blue-200 hover:border-blue-300"
                    )}
                    onClick={() => {
                      if (!notification.isRead) {
                        onMarkAsRead(notification.id);
                      }
                      if (notification.link) {
                        onNavigate(notification.link);
                      }
                    }}
                  >
                    <div className="p-3">
                      <div className="flex items-start gap-3">
                        {/* 아이콘 */}
                        <div className={cn("p-2 rounded-lg flex-shrink-0", iconConfig.bg)}>
                          <Icon className={cn("size-4", iconConfig.color)} />
                        </div>

                        {/* 내용 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h4 className={cn(
                              "text-sm font-semibold line-clamp-1",
                              notification.isRead ? "text-slate-700" : "text-[#0A2540]"
                            )}>
                              {notification.title}
                            </h4>
                            {notification.priority === "high" && (
                              <Badge variant="destructive" className="text-xs flex-shrink-0">
                                중요
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 line-clamp-2 mb-2">
                            {notification.content}
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">
                              {getTimeAgo(notification.createdAt)}
                            </span>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {!notification.isRead && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onMarkAsRead(notification.id);
                                  }}
                                  className="h-6 px-2 text-xs"
                                >
                                  <Check className="size-3" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDelete(notification.id);
                                }}
                                className="h-6 px-2 text-xs text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  );
}
