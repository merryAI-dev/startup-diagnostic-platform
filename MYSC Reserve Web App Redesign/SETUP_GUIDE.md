# MYSC Reserve 설정 가이드

## 🔥 Firebase 설정

### 1단계: Firebase 프로젝트 생성

1. [Firebase Console](https://console.firebase.google.com/)에 접속
2. "프로젝트 추가" 클릭
3. 프로젝트 이름: `mysc-reserve` (또는 원하는 이름)
4. Google Analytics 설정 (선택사항)
5. 프로젝트 생성 완료

### 2단계: 웹 앱 추가

1. Firebase 프로젝트 설정 (⚙️ 아이콘) → "프로젝트 설정"
2. "내 앱" 섹션에서 웹 아이콘 (`</>`) 클릭
3. 앱 닉네임 입력: `mysc-reserve-web`
4. Firebase Hosting 설정 안 함 (체크 해제)
5. "앱 등록" 클릭

### 3단계: API 키 복사

등록이 완료되면 다음과 같은 설정 정보가 표시됩니다:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "mysc-reserve.firebaseapp.com",
  projectId: "mysc-reserve",
  storageBucket: "mysc-reserve.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};
```

### 4단계: Firebase 서비스 활성화

#### Authentication
1. 왼쪽 메뉴 → "Authentication" → "시작하기"
2. "Sign-in method" 탭
3. "Google" 제공업체 활성화
4. 프로젝트 지원 이메일 선택
5. "저장" 클릭

#### Firestore Database
1. 왼쪽 메뉴 → "Firestore Database" → "데이터베이스 만들기"
2. 보안 규칙: "테스트 모드로 시작" (개발용)
3. 위치: `asia-northeast3 (Seoul)` 선택
4. "사용 설정" 클릭

#### Storage
1. 왼쪽 메뉴 → "Storage" → "시작하기"
2. 보안 규칙: "테스트 모드로 시작" (개발용)
3. 위치: `asia-northeast3 (Seoul)` 선택
4. "완료" 클릭

---

## 📅 Google Calendar API 설정

### 1단계: Google Cloud Console 설정

1. [Google Cloud Console](https://console.cloud.google.com/)에 접속
2. 위에서 만든 Firebase 프로젝트 선택 (자동 연동됨)
   - 또는 새 프로젝트 생성

### 2단계: Calendar API 활성화

1. 왼쪽 메뉴 → "API 및 서비스" → "라이브러리"
2. 검색창에 "Google Calendar API" 검색
3. "Google Calendar API" 선택
4. "사용" 버튼 클릭

### 3단계: OAuth 동의 화면 구성

1. 왼쪽 메뉴 → "API 및 서비스" → "OAuth 동의 화면"
2. User Type: "외부" 선택 → "만들기"
3. 앱 정보 입력:
   - 앱 이름: `MYSC Reserve`
   - 사용자 지원 이메일: 본인 이메일
   - 개발자 연락처 정보: 본인 이메일
4. "저장 후 계속" 클릭
5. 범위 추가:
   - "범위 추가 또는 삭제" 클릭
   - 다음 범위 추가:
     - `https://www.googleapis.com/auth/calendar`
     - `https://www.googleapis.com/auth/calendar.events`
6. "저장 후 계속" 클릭
7. 테스트 사용자 추가 (개발 중):
   - 본인 이메일 추가
   - "저장 후 계속" 클릭

### 4단계: OAuth 2.0 클라이언트 ID 생성

1. 왼쪽 메뉴 → "API 및 서비스" → "사용자 인증 정보"
2. "+ 사용자 인증 정보 만들기" → "OAuth 2.0 클라이언트 ID"
3. 애플리케이션 유형: "웹 애플리케이션"
4. 이름: `MYSC Reserve Web Client`
5. 승인된 JavaScript 원본:
   ```
   http://localhost:5173
   http://localhost:3000
   ```
6. 승인된 리디렉션 URI:
   ```
   http://localhost:5173
   http://localhost:3000
   ```
7. "만들기" 클릭
8. **클라이언트 ID 복사** (나중에 필요함)

### 5단계: API 키 생성 (선택사항)

1. "API 및 서비스" → "사용자 인증 정보"
2. "+ 사용자 인증 정보 만들기" → "API 키"
3. API 키가 생성됨
4. (권장) "키 제한" 클릭:
   - API 제한 사항 → "키 제한"
   - "Google Calendar API" 선택
   - "저장"

---

## 💻 로컬 환경 설정

### 1단계: 프로젝트 다운로드

Figma Make에서 프로젝트를 다운로드하여 VSCode에서 엽니다.

### 2단계: `.env` 파일 생성

프로젝트 루트 디렉토리에 `.env` 파일을 생성합니다:

```bash
# 프로젝트 루트에서
touch .env
```

### 3단계: `.env` 파일에 API 키 입력

`.env.example` 파일을 참고하여 `.env` 파일에 다음 내용을 입력:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
VITE_FIREBASE_AUTH_DOMAIN=mysc-reserve.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=mysc-reserve
VITE_FIREBASE_STORAGE_BUCKET=mysc-reserve.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef123456

# Google Calendar API
VITE_GOOGLE_CLIENT_ID=123456789012-abcdefghijklmnop.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

**중요**: 위의 값들을 본인의 실제 API 키로 교체하세요!

### 4단계: `.gitignore` 확인

`.env` 파일이 Git에 커밋되지 않도록 `.gitignore`에 포함되어 있는지 확인:

```
# .gitignore
.env
.env.local
.env.*.local
```

### 5단계: 의존성 설치 및 실행

```bash
# 패키지 설치
npm install
# 또는
pnpm install

# 개발 서버 실행
npm run dev
# 또는
pnpm dev
```

---

## 🧪 테스트

### 1. Firebase 연결 테스트

개발 서버 실행 후:
1. 브라우저 콘솔 확인 (F12)
2. Firebase 초기화 오류가 없는지 확인

### 2. Google Calendar 연동 테스트

1. 관리자/컨설턴트 계정으로 로그인:
   - Email: `admin@mysc.co.kr`
   - Password: 아무거나
2. "설정" 메뉴로 이동
3. "Google Calendar 연동하기" 버튼 클릭
4. Google 로그인 및 권한 승인
5. "연동됨" 배지 확인

### 3. 오피스아워 보고서 테스트

1. 관리자 로그인
2. "미작성 보고서" 메뉴 확인
3. "보고서 작성" 버튼 클릭
4. 폼 작성 후 제출

---

## 🔒 보안 규칙 설정 (프로덕션 배포 시)

### Firestore 보안 규칙

Firebase Console → Firestore Database → "규칙" 탭:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 인증된 사용자만 읽기/쓰기 허용
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
    
    // 보고서는 컨설턴트/관리자만 작성 가능
    match /reports/{reportId} {
      allow read: if request.auth != null;
      allow create, update: if request.auth != null && 
        (request.auth.token.role == 'admin' || 
         request.auth.token.role == 'consultant' ||
         request.auth.token.role == 'staff');
    }
  }
}
```

### Storage 보안 규칙

Firebase Console → Storage → "규칙" 탭:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /reports/{userId}/{allPaths=**} {
      // 인증된 사용자만 업로드 가능
      allow write: if request.auth != null && request.auth.uid == userId;
      // 모든 인증된 사용자가 읽기 가능
      allow read: if request.auth != null;
    }
  }
}
```

---

## 📞 문제 해결

### Firebase 초기화 오류
- API 키가 올바른지 확인
- Firebase 프로젝트가 활성화되어 있는지 확인
- `.env` 파일이 프로젝트 루트에 있는지 확인

### Google Calendar 연동 실패
- OAuth 클라이언트 ID가 올바른지 확인
- 승인된 JavaScript 원본에 현재 URL이 포함되어 있는지 확인
- Calendar API가 활성화되어 있는지 확인

### 환경 변수가 로드되지 않음
- 파일 이름이 정확히 `.env`인지 확인 (공백 없음)
- 변수명이 `VITE_` 접두사로 시작하는지 확인
- 개발 서버 재시작 (`Ctrl+C` → 다시 실행)

---

## 📚 참고 자료

- [Firebase 문서](https://firebase.google.com/docs)
- [Google Calendar API 문서](https://developers.google.com/calendar/api/guides/overview)
- [Vite 환경 변수 문서](https://vitejs.dev/guide/env-and-mode.html)
