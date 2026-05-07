# BizTalk Stage Setup

이 문서는 `live` 프로젝트에 BizTalk용 Cloud Run과 고정 IPv4를 1세트만 두고, `stage`와 `live`가 그 전송 인프라를 공유하는 최소 절차를 정리한다.

## 목적

- Firebase Functions의 비즈니스 상태 처리 경로는 그대로 유지한다.
- BizTalk 호출만 별도 Cloud Run 서비스로 분리한다.
- live Cloud Run의 고정 IPv4, Cloud NAT, Cloud Run egress가 정상 동작하는지 먼저 검증한다.
- stage는 같은 Cloud Run을 호출하되, 기본 정책은 allowlist 번호에 대해서만 실발송을 허용한다.
- 실제 BizTalk API 명세가 확정되기 전까지는 `raw dispatch` 경로로 네트워크와 헤더 구성을 먼저 점검한다.

## 추가된 코드

- Functions callable 점검 엔드포인트:
  - `runBiztalkStageCheck`
- Functions 공통 dispatch helper:
  - [functions/biztalk-dispatch.js](/Users/mysc/Desktop/startup-diagnostic-platform/functions/biztalk-dispatch.js)
- Cloud Run 서비스 소스:
  - [services/biztalk/index.js](/Users/mysc/Desktop/startup-diagnostic-platform/services/biztalk/index.js)

## Functions secrets

stage와 live 각각에 아래 secrets를 넣을 수 있다. 둘 다 같은 Cloud Run을 바라보게 해도 된다.

예시:

```bash
firebase functions:secrets:set BIZTALK_DISPATCH_URL --project startup-diagnosis-platform
firebase functions:secrets:set BIZTALK_DISPATCH_TOKEN --project startup-diagnosis-platform
firebase functions:secrets:set BIZTALK_DISPATCH_URL --project startup-acceleration-platform
firebase functions:secrets:set BIZTALK_DISPATCH_TOKEN --project startup-acceleration-platform
```

- `BIZTALK_DISPATCH_URL`
  - 예시: `https://biztalk-dispatch-xxxxx-an.a.run.app`
- `BIZTALK_DISPATCH_TOKEN`
  - Functions -> Cloud Run 내부 호출용 Bearer token

## Cloud Run 환경 변수

Cloud Run 서비스 `services/biztalk`는 `live` 프로젝트에만 배포하는 것을 권장한다.
배포 시 아래 값을 넣는다.

- `INTERNAL_SHARED_TOKEN`
  - Firebase `BIZTALK_DISPATCH_TOKEN`과 같은 값
- `BIZTALK_MESSAGE_URL`
  - BizTalk 실제 발송 API URL
- `BIZTALK_TOKEN_URL`
  - 기본값: `https://www.biztalk-api.com/v2/auth/getToken`
- `BIZTALK_BS_ID`
  - 비즈톡에서 발급한 BS ID
- `BIZTALK_BS_PW`
  - 비즈톡에서 발급한 BS PW
- `BIZTALK_SENDER_KEY`
  - 발신프로필키(Sender Key)
- `BIZTALK_DEFAULT_TMPLT_CODE`
  - 기본 템플릿 코드
- `BIZTALK_STATIC_HEADERS_JSON`
  - BizTalk 호출에 항상 들어갈 고정 헤더 JSON 문자열
  - BizTalk 외 추가 헤더가 필요할 때만 사용
- `OUTBOUND_IP_ECHO_URL`
  - 선택값
  - 기본값: `https://api.ipify.org?format=json`
- `BIZTALK_UPSTREAM_TIMEOUT_MS`
  - 선택값
  - 기본값: `100000`
  - BizTalk 가이드 권장 timeout 100초 반영
- `BIZTALK_REAL_SEND_MODE`
  - `allowlist_only` 권장
  - 값:
  - `disabled`
  - `live_only`
  - `allowlist_only`
  - `stage_and_live`
- `BIZTALK_TEST_RECIPIENT_ALLOWLIST`
  - `01012345678,01098765432` 형태
  - `allowlist_only` 모드일 때만 실발송 허용 번호
- `STAGE_CALLER_PROJECT_ID`
  - 기본값: `startup-diagnosis-platform`
- `LIVE_CALLER_PROJECT_ID`
  - 기본값: `startup-acceleration-platform`

## Cloud Run API

Cloud Run 서비스는 아래 경로를 제공한다.

- `GET /health`
  - 인증 없이 기본 설정 상태 확인
- `POST /health`
  - 인증 포함 health check
- `POST /probe/outbound-ip`
  - Cloud Run에서 외부로 나갈 때 보이는 IP 확인
- `POST /probe/auth-token`
  - BS ID / BS PW로 BizTalk 인증 토큰 발급 확인
  - 응답에는 마스킹된 token과 expireDate만 반환
- `POST /dispatch/raw`
  - `BIZTALK_MESSAGE_URL`로 JSON payload를 그대로 POST
  - `dryRun: false`일 때는 `BIZTALK_REAL_SEND_MODE` 정책 검사를 통과해야 한다.
  - 요청 body:

```json
{
  "callerProjectId": "startup-diagnosis-platform",
  "dryRun": true,
  "method": "POST",
  "recipients": ["01012345678"],
  "payload": {
    "message": "hello"
  },
  "headers": {
    "X-Custom-Header": "value"
  },
  "query": {
    "foo": "bar"
  }
}
```

`dryRun: true`면 실제 외부 호출 없이 최종 URL, 헤더, payload만 반환한다.

- `POST /dispatch/alimtalk`
  - BizTalk 토큰을 Cloud Run이 직접 발급받아 `bt-token` 헤더를 자동으로 붙인 뒤 알림톡 발송
  - 요청 body 예시:

```json
{
  "callerProjectId": "startup-diagnosis-platform",
  "dryRun": true,
  "recipient": "01012345678",
  "message": "테스트 메시지",
  "tmpltCode": "TEMPLATE_CODE",
  "senderKey": "SENDER_KEY"
}
```

`recipient`, `message`는 필수이며 `tmpltCode`, `senderKey`는 환경변수 기본값으로 대체 가능하다.

## GCP 네트워크 생성 순서

리전은 현재 Functions와 맞춰 `asia-northeast3`를 사용한다.
배포 대상 프로젝트는 `startup-acceleration-platform`을 권장한다.

1. `VPC network > VPC networks`에서 subnet 생성
   - 예시 이름: `biztalk-egress-subnet`
   - IPv4 range: `/26` 이상
   - 예시: `10.8.0.0/26`
2. `VPC network > IP addresses`에서 regional static external IPv4 생성
3. `Network services > Cloud Router` 생성
4. `Network services > Cloud NAT` 생성
   - 방금 만든 static IP 연결
   - 방금 만든 subnet 연결
5. `Cloud Run` 서비스 배포
6. Cloud Run 서비스에서 `Direct VPC egress`
   - Network / subnet 지정
   - `Route all traffic through the VPC`

## Cloud Run 배포 예시

서비스 이름 예시: `biztalk-dispatch`

```bash
gcloud run deploy biztalk-dispatch \
  --project startup-acceleration-platform \
  --region asia-northeast3 \
  --source services/biztalk \
  --set-env-vars INTERNAL_SHARED_TOKEN=REPLACE_ME \
  --set-env-vars BIZTALK_BS_ID=REPLACE_ME \
  --set-env-vars BIZTALK_BS_PW=REPLACE_ME \
  --set-env-vars BIZTALK_SENDER_KEY=REPLACE_ME \
  --set-env-vars BIZTALK_DEFAULT_TMPLT_CODE=REPLACE_ME \
  --set-env-vars BIZTALK_MESSAGE_URL=REPLACE_ME \
  --set-env-vars BIZTALK_STATIC_HEADERS_JSON='{}' \
  --set-env-vars BIZTALK_REAL_SEND_MODE=allowlist_only \
  --set-env-vars BIZTALK_TEST_RECIPIENT_ALLOWLIST=01012345678
```

배포 후 Cloud Run 콘솔에서 VPC egress를 `all-traffic`로 수정한다.

## Smoke test

`runBiztalkStageCheck`는 stage 또는 live 프로젝트에서 `admin` 또는 `staff` 역할만 실행할 수 있다.
Cloud Run은 live 프로젝트에 두고, stage/live 둘 다 같은 URL을 호출하도록 맞춘다.

1. health check

```json
{
  "mode": "health"
}
```

2. outbound IP 확인

```json
{
  "mode": "outbound-ip"
}
```

3. 실제 발송 전 dry run

```json
{
  "mode": "dispatch-raw",
  "dryRun": true,
  "recipients": ["01012345678"],
  "payload": {
    "msg": "stage test"
  }
}
```

4. 토큰 발급 확인

Functions callable 경유:

```json
{
  "mode": "auth-token"
}
```

Cloud Run 직접 호출:

```bash
curl -X POST 'https://SERVICE_URL/probe/auth-token' \
  -H 'Authorization: Bearer INTERNAL_SHARED_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

5. 알림톡 dry run

```bash
curl -X POST 'https://SERVICE_URL/dispatch/alimtalk' \
  -H 'Authorization: Bearer INTERNAL_SHARED_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "callerProjectId":"startup-diagnosis-platform",
    "dryRun":true,
    "recipient":"01012345678",
    "message":"테스트 메시지",
    "tmpltCode":"TEMPLATE_CODE"
  }'
```

6. BizTalk 명세 반영 후 실제 발송

```json
{
  "recipient": "01012345678",
  "message": "테스트 메시지",
  "tmpltCode": "TEMPLATE_CODE"
}
```

권장 정책:

- `BIZTALK_REAL_SEND_MODE=allowlist_only`
- `BIZTALK_TEST_RECIPIENT_ALLOWLIST`에는 본인 테스트 번호만 넣기
- stage에서 먼저 실발송 검증
- 운영 전환 시 `live_only` 또는 더 엄격한 정책으로 변경

## Stage 제거 시

stage 검증이 끝나고 유지비를 줄이려면 아래 리소스를 함께 제거한다.

- stage Cloud Run 서비스
- stage Cloud NAT
- stage Cloud Router
- stage static IPv4
- 필요 시 stage 전용 subnet

주의:

- static IP를 삭제하면 같은 IP를 다시 받는 보장은 없다.
- BizTalk 등록 서버에 stage IP를 올려둔 상태라면 먼저 등록값을 정리해야 한다.
