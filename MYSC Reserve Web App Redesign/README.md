# MYSC Reserve - 오피스아워 신청/관리 시스템

현대적인 B2B SaaS UI로 디자인된 오피스아워 예약 및 관리 웹 애플리케이션입니다.

## 🎯 주요 기능

### 기업 사용자
- 📅 **캘린더 기반 대시보드**: 전체 일정을 한눈에 파악
- 🔄 **정기/비정기 오피스아워 신청**: 유연한 예약 시스템
- 👥 **컨설턴트 디렉토리**: 전문가 프로필 및 이력 조회
- 💬 **실시간 커뮤니케이션**: 컨설턴트와 메시지 교환
- 📊 **신청 내역 관리**: 상태별 필터링 및 검색

### 관리자/컨설턴트
- 📈 **인터랙티브 대시보드**: 5가지 차트 뷰 및 실시간 필터링
- 🎯 **사업별 프로그램 관리**: 6개 사업 시스템 (농식품, 해양수산, 경기도, 환경, 사회서비스, 교육)
- 📝 **오피스아워 보고서 시스템**: 
  - 세션 완료 후 자동 팝업 알림
  - 필수 항목: 일시, 장소, 주제, 참석자, 내용, 팔로업, 사진, 만족도
  - 미작성 보고서 추적 (기한 초과 관리)
- 📅 **Google Calendar 연동**: 가능한 시간 자동 동기화
- 🔐 **권한 기반 시스템**: Admin, Consultant, Staff 역할 관리

## 🚀 빠른 시작

### 1. 환경 설정

프로젝트를 다운로드한 후 루트 디렉토리에 `.env` 파일을 생성하세요:

```bash
cp .env.example .env
```

### 2. API 키 설정

`.env` 파일을 열어 Firebase 및 Google Calendar API 키를 입력하세요:

```env
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=mysc-reserve.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=mysc-reserve
VITE_FIREBASE_STORAGE_BUCKET=mysc-reserve.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id_here
VITE_FIREBASE_APP_ID=your_app_id_here

VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
VITE_GOOGLE_API_KEY=your_google_api_key_here
```

📖 **자세한 설정 방법은 [SETUP_GUIDE.md](./SETUP_GUIDE.md)를 참고하세요.**

### 3. 패키지 설치

```bash
npm install
# 또는
pnpm install
```

### 4. 개발 서버 실행

```bash
npm run dev
# 또는
pnpm dev
```

브라우저에서 `http://localhost:5173` 으로 접속하세요.

## 🔑 테스트 계정

- **관리자**: `admin@mysc.co.kr` (전체 권한)
- **컨설턴트**: `consultant@mysc.co.kr` (농식품, 경기도 담당)
- **실무진**: `staff@mysc.co.kr` (해양수산, 환경 담당)
- **일반 사용자**: `user@example.com`

**비밀번호는 아무거나 입력하세요** (Mock 로그인).

### 💡 보고서 시스템 테스트하기

**컨설턴트 계정으로 로그인하면 즉시 보고서 작성 팝업이 표시됩니다!**

완료된 세션이 있으면 자동으로 보고서 작성을 요청하는 팝업��� 뜹니다.

자세한 테스트 방법은 [TEST_GUIDE.md](./TEST_GUIDE.md)를 참고하세요.

## 📋 사업 프로그램

1. **농식품** (녹색) - 목표 120시간
2. **해양수산** (파란색) - 목표 100시간
3. **경기도** (보라색) - 목표 150시간
4. **환경** (청록색) - 목표 80시간
5. **사회서비스** (분홍색) - 목표 90시간
6. **교육** (주황색) - 목표 110시간

## 🏗️ 기술 스택

- **Frontend**: React 18, TypeScript
- **Styling**: Tailwind CSS v4
- **UI Components**: Radix UI, shadcn/ui
- **Charts**: Recharts
- **Date Handling**: date-fns
- **Backend**: Firebase (Auth, Firestore, Storage)
- **Calendar**: Google Calendar API
- **Build Tool**: Vite
- **Icons**: Lucide React

## 📁 프로젝트 구조

```
src/
├── app/
│   ├── components/
│   │   ├── auth/           # 로그인/회원가입
│   │   ├── layout/         # 레이아웃 컴포넌트
│   │   ├── pages/          # 페이지 컴포넌트
│   │   ├── report/         # 보고서 시스템
│   │   ├── settings/       # 설정 컴포넌트
│   │   └── ui/             # 공통 UI 컴포넌트
│   ├── hooks/              # 커스텀 훅
│   ├── lib/
│   │   ├── data.ts         # Mock 데이터
│   │   ├── types.ts        # TypeScript 타입 정의
│   │   └── firebase.ts     # Firebase 설정
│   └── App.tsx             # 메인 앱
└── styles/                 # 전역 스타일
```

## 🎨 디자인 특징

- **노션 스타일** 전문적인 UI
- **캘린더 중심** 직관적인 일정 관리
- **반응형 디자인** 데스크톱/태블릿 최적화
- **다크 모드 지원** (추후 구현 가능)
- **접근성** WCAG 가이드라인 준수

## 🔒 보안

- Firebase Authentication을 통한 사용자 인증
- 역할 기반 접근 제어 (RBAC)
- 환경 변수를 통한 API 키 관리
- Firestore 보안 규칙 적용 (프로덕션)

## 📝 주요 개선 사항

### v2.0 (2026-02-06)
- ✅ 오피스아워 보고서 자동 작성 팝업
- ✅ 미작성 보고서 추적 시스템
- ✅ Google Calendar 연동
- ✅ Firebase 백엔드 통합
- ✅ 사업별 통계 및 진행률 관리
- ✅ 만족도 기반 평가 시스템

## 🤝 기여

이 프로젝트는 MYSC의 내부 도구입니다.

## 📄 라이선스

Proprietary - MYSC

## 📞 지원

문의사항은 dev@mysc.co.kr로 연락주세요.

---

Made with ❤️ by MYSC Team