import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

interface SignupProps {
  onSignup: (email: string, password: string, companyName: string, programName: string) => void;
  onNavigateToLogin: () => void;
}

export function Signup({ onSignup, onNavigateToLogin }: SignupProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [programName, setProgramName] = useState("MYSC EMA");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSignup(email, password, companyName, programName);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle>기업 회원가입</CardTitle>
          <CardDescription>
            프로그램 참여 기업 정보를 입력하세요
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">기업명</Label>
              <Input
                id="companyName"
                placeholder="예: 임팩트스타트업"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="programName">프로그램</Label>
              <Input
                id="programName"
                value={programName}
                onChange={(e) => setProgramName(e.target.value)}
                required
              />
            </div>
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
            <div className="space-y-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                placeholder="8자 이상"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <Button type="submit" className="w-full">
              회원가입
            </Button>
            <div className="text-center">
              <button
                type="button"
                onClick={onNavigateToLogin}
                className="text-sm text-primary hover:underline"
              >
                이미 계정이 있으신가요? 로그인
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}