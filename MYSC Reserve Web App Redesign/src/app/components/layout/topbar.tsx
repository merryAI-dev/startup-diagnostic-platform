import { Bell, LogOut, User as UserIcon } from "lucide-react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { User } from "../../lib/types";
import logo from "figma:asset/2017306cd6c7e2d88d7647becce86919711e542f.png";

interface TopbarProps {
  user: User;
  onLogout: () => void;
}

export function Topbar({ user, onLogout }: TopbarProps) {
  return (
    <div className="h-16 border-b bg-white flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div>
            <h2 className="font-semibold">MYSC Reserve</h2>
            <p className="text-xs text-muted-foreground">{user.programName}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <UserIcon className="w-5 h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span>{user.companyName}</span>
                <span className="text-xs text-muted-foreground">{user.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>프로필 설정</DropdownMenuItem>
            <DropdownMenuItem>알림 설정</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout}>로그아웃</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}