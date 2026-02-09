import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Alert, AlertDescription } from "../ui/alert";
import { Shield } from "lucide-react";

interface LoginProps {
  onLogin: (email: string) => void;
  onNavigateToSignup: () => void;
}

export function Login({ onLogin, onNavigateToSignup }: LoginProps) {
  const [email, setEmail] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(email);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle>로그인</CardTitle>
          <CardDescription>
            기업 계정으로 로그인하세요
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="mb-4 bg-blue-50 border-blue-200">
            <Shield className="w-4 h-4 text-primary" />
            <AlertDescription className="text-xs text-muted-foreground">
              <div className="space-y-1">
                <p className="font-semibold text-gray-700 mb-2">테스트 계정 (이메일만 입력):</p>
                <p><strong>user1@startup.com</strong> - 농식품 프로그램</p>
                <p><strong>consultant1@mysc.co.kr</strong> - 컨설턴트</p>
              </div>
            </AlertDescription>
          </Alert>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                type="email"
                placeholder="company@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full">
              로그인
            </Button>
            <div className="text-center">
              <button
                type="button"
                onClick={onNavigateToSignup}
                className="text-sm text-primary hover:underline"
              >
                계정이 없으신가요? 회원가입
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}