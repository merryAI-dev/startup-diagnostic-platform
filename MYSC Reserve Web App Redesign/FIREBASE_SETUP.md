# Firebase 설정 가이드

이 앱은 Firebase를 선택적으로 사용합니다. **Firebase 없이도 Mock 데이터로 완벽하게 작동**하지만, 실제 운영 환경에서는 Firebase를 설정하는 것을 권장합니다.

## Firebase 없이 사용하기 (개발/테스트)

Firebase를 설정하지 않아도 앱은 정상 작동합니다. 다음 계정으로 로그인하세요:

### 테스트 계정
- **일반 사용자**: `user1@example.com`
- **관리자**: `admin@mysc.com`
- **컨설턴트**: `consultant1@mysc.com`
- **다른 사용자**: `user2@example.com`, `user3@example.com` 등

로그인 시 비밀번호는 입력하지 않아도 됩니다.

---

## Firebase 설정하기 (실제 운영)

### 1단계: Firebase 프로젝트 생성

1. [Firebase Console](https://console.firebase.google.com) 접속
2. "프로젝트 추가" 클릭
3. 프로젝트 이름 입력 (예: `mysc-reserve`)
4. Google Analytics 설정 (선택사항)
5. 프로젝트 생성 완료

### 2단계: 웹 앱 추가

1. Firebase Console에서 생성한 프로젝트 선택
2. 프로젝트 개요 > "앱 추가" > **웹** 아이콘 클릭
3. 앱 닉네임 입력 (예: `MYSC Reserve Web`)
4. Firebase Hosting 설정 (선택사항)
5. "앱 등록" 클릭

### 3단계: Firebase 구성 정보 복사

앱 등록 후 표시되는 Firebase SDK 구성 정보를 확인합니다:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "mysc-reserve.firebaseapp.com",
  projectId: "mysc-reserve",
  storageBucket: "mysc-reserve.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

### 4단계: 환경 변수 설정

1. 프로젝트 루트에 `.env` 파일 생성:
   ```bash
   cp .env.example .env
   ```

2. `.env` 파일을 열고 Firebase 구성 정보 입력:
   ```env
   VITE_FIREBASE_API_KEY=AIzaSy...
   VITE_FIREBASE_AUTH_DOMAIN=mysc-reserve.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=mysc-reserve
   VITE_FIREBASE_STORAGE_BUCKET=mysc-reserve.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
   VITE_FIREBASE_APP_ID=1:123456789:web:abc123
   ```

### 5단계: Firebase Authentication 활성화

1. Firebase Console > **Authentication** 메뉴 선택
2. "시작하기" 클릭
3. **로그인 방법** 탭에서 다음 제공업체 활성화:
   - **이메일/비밀번호**: 사용 설정
   - **Google** (선택사항): 사용 설정

### 6단계: Firestore Database 생성

1. Firebase Console > **Firestore Database** 메뉴 선택
2. "데이터베이스 만들기" 클릭
3. **보안 규칙 시작 모드**:
   - 개발: **테스트 모드**로 시작 (30일 후 만료)
   - 운영: **프로덕션 모드**로 시작 후 규칙 수정
4. 위치 선택: `asia-northeast3 (서울)` 권장
5. "사용 설정" 클릭

### 7단계: Firestore 보안 규칙 설정 (선택사항)

Firestore Database > **규칙** 탭에서 보안 규칙 수정:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 사용자는 자신의 문서만 읽고 쓸 수 있음
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // 관리자는 모든 문서에 접근 가능
    match /{document=**} {
      allow read, write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // 신청서는 인증된 사용자만 읽기/쓰기 가능
    match /applications/{applicationId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null;
    }
  }
}
```

### 8단계: Storage 설정 (파일 업로드용, 선택사항)

1. Firebase Console > **Storage** 메뉴 선택
2. "시작하기" 클릭
3. 보안 규칙 선택 후 "완료" 클릭

---

## Google Calendar 연동 설정 (선택사항)

오피스아워를 Google Calendar와 자동 동기화하려면:

### 1단계: Google Cloud Console 설정

1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. Firebase 프로젝트 선택 (또는 새 프로젝트 생성)
3. **API 및 서비스** > **라이브러리** 메뉴 선택
4. "Google Calendar API" 검색 후 "사용 설정" 클릭

### 2단계: OAuth 2.0 클라이언트 ID 생성

1. **API 및 서비스** > **사용자 인증 정보** 메뉴 선택
2. **사용자 인증 정보 만들기** > **OAuth 클라이언트 ID** 클릭
3. 애플리케이션 유형: **웹 애플리케이션** 선택
4. 이름: `MYSC Reserve Web Client`
5. **승인된 자바스크립트 원본**:
   - `http://localhost:5173` (개발)
   - `https://yourdomain.com` (운영)
6. **승인된 리디렉션 URI**:
   - `http://localhost:5173` (개발)
   - `https://yourdomain.com` (운영)
7. "만들기" 클릭

### 3단계: Client ID 저장

생성된 클라이언트 ID를 `.env` 파일에 추가:

```env
VITE_GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=AIzaSy...
```

---

## 개발 서버 재시작

환경 변수를 변경했다면 개발 서버를 재시작해야 합니다:

```bash
# 개발 서버 중지 (Ctrl+C)
# 개발 서버 재시작
npm run dev
# 또는
pnpm dev
```

---

## 보안 주의사항

⚠️ **중요**: `.env` 파일은 절대 Git에 커밋하지 마세요!

- `.env` 파일은 이미 `.gitignore`에 포함되어 있습니다
- API 키나 비밀 정보를 공개 저장소에 올리지 마세요
- 운영 환경에서는 환경 변수를 서버 설정으로 관리하세요

---

## 문제 해결

### Firebase 초기화 오류

```
⚠️ Firebase 초기화 실패
```

**해결 방법**:
1. `.env` 파일의 모든 값이 올바르게 입력되었는지 확인
2. Firebase Console에서 웹 앱이 정상적으로 등록되었는지 확인
3. 개발 서버를 재시작

### 로그인 오류

```
Firebase: Error (auth/invalid-api-key)
```

**해결 방법**:
1. `VITE_FIREBASE_API_KEY`가 올바른지 확인
2. Firebase Console > 프로젝트 설정에서 API 키 재확인

### Firestore 권한 오류

```
Missing or insufficient permissions
```

**해결 방법**:
1. Firestore Database가 생성되었는지 확인
2. 보안 규칙이 올바르게 설정되었는지 확인
3. 테스트 모드로 시작한 경우 30일 만료 여부 확인

---

## 추가 리소스

- [Firebase 공식 문서](https://firebase.google.com/docs)
- [Firestore 보안 규칙 가이드](https://firebase.google.com/docs/firestore/security/get-started)
- [Firebase Authentication 문서](https://firebase.google.com/docs/auth)
- [Google Calendar API 문서](https://developers.google.com/calendar)

---

## 지원

문제가 계속되면 다음을 확인하세요:

1. Chrome DevTools Console에서 에러 메시지 확인
2. Firebase Console > Usage 탭에서 할당량 확인
3. 브라우저 캐시 및 쿠키 삭제 후 재시도
