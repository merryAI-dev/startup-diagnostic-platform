# 운영 로그 DevOps 가이드

## 목적

이 시스템은 원본 로그를 먼저 쌓고, 어드민이 읽을 수 있는 형태로 웹뷰, 버튼 클릭, 체류시간, 유저별 에러 지점을 보여준다.

## 수집 항목

- 웹뷰: `page_view` 이벤트로 route별 조회 수를 기록한다.
- 화면 체류시간: `route_dwell` 이벤트로 route별 머문 시간을 기록한다.
- 세션 체류시간: `session_start`, `session_end`, `telemetrySessions.durationMs`로 기록한다.
- 버튼/링크/폼: `button_click`, `link_click`, `form_submit` 이벤트로 클릭 여부와 액션명을 기록한다.
- 유저 에러: `client_error`, `promise_rejection`, `react_error`, `function_error`, `auth_error` 이벤트로 기록한다.
- 유저 ID: 로그인 상태에서는 Firebase callable의 `request.auth.uid`를 서버에서 기록한다. 클라이언트가 임의로 보낸 uid는 사용하지 않는다.

## Firestore 컬렉션

- `telemetryEvents`: append-only 원본 로그.
- `telemetrySessions`: 세션별 요약. uid, anonymousId, firstRoute, lastRoute, 체류시간, 클릭 수, 에러 수를 본다.
- `telemetryDailyRollups`: 일별 집계. 대시보드 최적화와 장기 추세 확인용이다.

## 어드민 확인 경로

어드민 로그인 후 `/admin/admin-observability`로 이동한다.

화면에서 확인할 수 있는 것:
- 전체 웹뷰 수
- 클릭/제출 수
- 평균 세션 체류시간
- 평균 화면 체류시간
- 에러 수
- 에러 그룹별 발생 수와 영향 유저 수
- 버튼/링크/폼 액션별 클릭 수
- uid, anonymousId, sessionId 기준 필터

## 장애 triage 절차

1. `운영 로그 > 에러 그룹`에서 발생 수가 높은 항목을 연다.
2. 원본 로그 drawer에서 `uid`, `sessionId`, `route`, `functionName`, `errorCode`를 확인한다.
3. uid 필터로 같은 유저의 세션 흐름을 확인한다.
4. `functionName`이 있으면 Firebase Functions 로그에서 같은 시간대의 서버 로그를 대조한다.
5. 이슈를 만들 때 `eventType`, `route`, `functionName`, `errorCode`, `stackHash`, 영향을 받은 uid 수를 함께 적는다.

## 개인정보 원칙

- 비밀번호, 폼 입력값, 요청 내용 전문, 첨부파일 URL, 전화번호는 저장하지 않는다.
- 버튼 클릭은 텍스트/aria-label/data-observability-action만 저장한다.
- stack trace는 짧은 preview와 hash만 저장한다.
- Firestore rules는 클라이언트 직접 쓰기를 막고, 읽기는 admin만 허용한다.

## 보관 정책 권장

- 원본 이벤트: 30-90일.
- 세션 요약: 180일.
- 일별 rollup: 1년.

장기 분석이 필요해지면 Firestore TTL과 BigQuery export를 추가한다.

## 확장 기준

지금 구조는 Firebase-native가 맞다. 다음 조건 중 하나가 생기면 Pub/Sub 또는 BigQuery를 추가한다.

- 이벤트 쓰기가 Firestore 비용/쿼리 한계를 압박한다.
- 90일 이상 원본 로그 보관이 필요하다.
- 운영 대시보드 외에 제품 분석, 퍼널 분석, 장기 cohort 분석이 필요하다.
- 여러 시스템이 같은 로그 스트림을 소비해야 한다.

Kafka/K8s는 현재 Vercel + Firebase Functions 구조에서는 1차 선택지가 아니다. 장기 실행 백엔드 서비스와 다중 consumer streaming이 실제 요구가 될 때 검토한다.

