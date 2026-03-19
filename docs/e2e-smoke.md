# E2E Smoke Test

이 프로젝트는 Playwright 기반 preview smoke E2E를 지원합니다.

기본 원칙:
- 기존 관리자 계정 1개만 필요합니다.
- 테스트가 `consultant`와 `company` 계정을 매번 새로 생성합니다.
- 테스트 데이터가 Firebase preview 프로젝트에 남습니다. `e2e-` 접두사 이메일로 생성되므로 preview에서만 돌리는 게 맞습니다.

## 실행 전제

- Cloud Functions / rules가 preview Firebase에 배포되어 있어야 합니다.
- `.env` 또는 환경 변수에 preview Firebase 연결 값이 있어야 합니다.
- 관리자 계정은 아래 둘 중 하나로 제공됩니다.
  - `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`
  - 또는 기존 `.env`의 `MIGRATION_ADMIN_EMAIL`, `MIGRATION_ADMIN_PASSWORD`

## 실행 방식

로컬 앱을 띄워 현재 코드로 검증:

```bash
npm run test:e2e
```

브라우저 보면서 실행:

```bash
npm run test:e2e:headed
```

이미 preview URL에 배포된 프론트로 검증:

```bash
E2E_BASE_URL=https://<preview-url> npm run test:e2e
```

## 테스트 계정 정리

반복 실행 후 preview에 `e2e-...` 계정이 누적되면 아래 스크립트로 정리합니다.

드라이런:

```bash
npm run cleanup:test-accounts -- --sample 10
```

실제 삭제:

```bash
npm run cleanup:test-accounts -- --commit
```

기본값은 `e2e-` 이메일 prefix 기준입니다. 다른 prefix나 특정 이메일만 지우려면:

```bash
npm run cleanup:test-accounts -- --email-prefix smoke-
npm run cleanup:test-accounts -- --emails e2e-company-1@example.com,e2e-consultant-1@example.com --commit
```

정리 범위:
- Firebase Auth 사용자
- `profiles`, `users`, `consultants`, `signupRequests`, `consents`, `companies`
- 테스트 계정이 만든 `officeHourApplications`, `reports`, `notifications`
- 삭제된 테스트 신청이 점유하던 `officeHourSlots`는 다른 활성 신청이 없을 때 `open`으로 복구

주의:
- Firestore 보안 규칙을 우회하므로 preview 프로젝트에서만 실행하는 게 맞습니다.
- 서비스 계정이 있으면 우선 사용합니다.
- 서비스 계정이 없어도 현재 머신에서 `firebase login` 되어 있으면 그 토큰으로 fallback 실행합니다.

## 시나리오

테스트는 아래 흐름을 한 번에 검증합니다.

1. 컨설턴트 회원가입
2. 관리자 승인
3. 관리자 아젠다 매칭
4. 컨설턴트 스케줄 전체 오픈
5. 회사 회원가입
6. 관리자 승인
7. 회사 정기 예약 신청
8. 컨설턴트 수락/확정
9. 회사 대시보드에서 확정 일정 확인

## 실패 시 먼저 볼 것

- `programs` 컬렉션에 실제 선택 가능한 사업이 있는지
- `agendas` 컬렉션에 활성 아젠다가 있는지
- preview 프로젝트에 정기 오피스아워 슬롯이 있는지
- 관리자 계정이 실제 `admin` 승인 계정인지
