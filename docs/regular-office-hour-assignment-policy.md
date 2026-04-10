# Regular Office Hour Assignment Policy

## Source Of Truth

- `officeHourApplications.pendingConsultantIds`:
  `pending`/`review` 상태에서 요청을 받은 컨설턴트 목록의 source of truth다.
- `officeHourApplications.consultantId`:
  실제 수락/확정된 담당 컨설턴트의 source of truth다.
- `consultants.agendaIds`, `consultants.availability`:
  특정 날짜/시간에 실제로 요청 가능하거나 배정 가능한지 계산하는 원본이다.
- `reservedConsultantId`, `officeHourSlotId`:
  과거 단일 예약/슬롯 모델의 레거시 필드다. 신규 정책의 source of truth로 쓰지 않는다.

## Matching Policy

- 하나의 아젠다에는 여러 컨설턴트가 매핑될 수 있다.
- 한 컨설턴트는 여러 아젠다를 맡을 수 있다.
- 기업이 특정 아젠다, 특정 날짜/시간의 정기 오피스아워를 신청하면 그 시점에 가능한 컨설턴트를 계산한다.
- 가능한 컨설턴트가 1명이면 그 컨설턴트만 요청 대상이다.
- 가능한 컨설턴트가 여러 명이면 그 여러 명 모두에게 동시에 요청이 간다.
- 이때 `consultantId`는 아직 비워둔다.
- 이때 `pendingConsultantIds`에 요청 대상 컨설턴트 전체를 저장한다.

## Time Blocking Policy

- 어떤 컨설턴트가 특정 날짜/시간의 pending 요청 대상(`pendingConsultantIds`)에 포함되면,
  그 컨설턴트는 같은 날짜/시간의 다른 어떤 요청도 받을 수 없는 것으로 계산한다.
- 이 규칙은 사업이 달라도, 아젠다가 달라도 동일하게 적용한다.
- 즉 동일 날짜/시간에 물리적으로 한 컨설턴트가 여러 요청을 동시에 받을 수 없다는 제약을 원본 계산에서 반드시 반영한다.
- 기업 신청 단계에서도 이 계산을 매번 다시 수행한다.
- 따라서 특정 날짜/시간에 가능한 컨설턴트가 0명이면 신청 자체가 되면 안 된다.

## Open Slot Policy

- 시간 슬롯의 `open` 여부는 저장된 파생 슬롯 상태로 판단하지 않는다.
- 특정 날짜/시간에 대해:
  - 해당 아젠다를 맡고 있고
  - 그 시간에 availability가 열려 있으며
  - 같은 날짜/시간의 다른 pending/confirmed/completed 신청 때문에 막히지 않은
  컨설턴트가 1명 이상 있으면 그 시간은 `open`으로 본다.
- 즉 `open` 여부는 신청 시점의 원본 데이터 계산 결과다.
- 대개의 경우 사용자는 시간 선택 단계에서 이미 막힌 시간을 보지 않거나 선택할 수 없어야 한다.
- 하지만 비슷한 시점의 다른 신청이 직전에 먼저 들어와 컨설턴트를 점유할 수 있으므로,
  제출 버튼을 누르는 시점에도 서버가 같은 계산을 다시 수행해야 한다.
- 제출 시점 재계산 결과 가능한 컨설턴트가 0명이면 최종 제출을 실패시켜야 한다.

## Consultant Response Policy

- 컨설턴트가 수락하면 그때 `consultantId`가 확정된다.
- 수락 시 `pendingConsultantIds` 기반의 동시 요청 상태는 종료한다.
- 확정 후에는 실제 배정된 `consultantId` 기준으로만 그 시간대가 막힌다.
- 컨설턴트가 거절하면 해당 신청은 더 이상 pending으로 유지하지 않고 종료한다.
- 수락이든 거절이든 한 번 응답이 발생하면 pending 요청으로 잡아둔 슬롯은 다시 열려야 한다.
- 단, 수락된 경우에는 실제 확정 일정이 생기므로 수락한 컨설턴트의 같은 시간대는 confirmed 일정으로 계속 막힌다.

## Schedule Change Policy

- 기업이 일정/시간을 바꾸면 기존 pending 대상 계산 결과는 폐기한다.
- 변경된 날짜/시간 기준으로 가능한 컨설턴트를 다시 계산한다.
- 그 결과가 0명이면 변경할 수 없다.
- 그 결과가 1명 이상이면 `pendingConsultantIds`를 새로 쓰고 `consultantId`는 다시 비운다.

## Post-Request Change Policy

- 신청이 생성된 뒤에는 `pendingConsultantIds`를 “그 시점에 요청을 받은 컨설턴트 스냅샷”으로 본다.
- 이후 사업 추가/삭제, 아젠다 추가/삭제, 컨설턴트 availability 변경, 컨설턴트 활성 상태 변경이 생겨도
  기존 `pending` 신청을 자동으로 다시 계산하거나 자동으로 날리지 않는다.
- 자동 재계산/자동 거절은 정책 복잡도와 부작용이 커지므로 기본 정책에서 제외한다.
- 대신:
  - 관련 변경을 저장할 때 영향받는 신청이 있음을 사용자에게 경고할 수 있다.
  - 기존 `pending` 신청은 관리자/컨설턴트가 계속 확인하고 수동으로 처리할 수 있어야 한다.
  - 수락 대기 리스트에서도 기존 요청 대상이면 숨기지 않는다.
- 핵심은 “자동으로 사라지지 않게 유지”와 “수동 컨트롤 가능 상태 유지”다.

## Manual Reopen Policy

- 관리자 또는 담당 컨설턴트가 `confirmed`/`rejected` 신청을 수동으로 `pending`으로 되돌릴 수 있다.
- 이때는 “현재 다시 가능한 컨설턴트”를 자동 재계산하지 않는다.
- 수동 reopen은 마지막 담당 컨설턴트 또는 기존 요청 대상 스냅샷을 그대로 `pendingConsultantIds`로 복원한다.
- 즉 reopen도 자동 재매칭이 아니라 수동 복원으로 본다.

## No Derived Slot Requirement

- 위 정책을 만족시키기 위해 `officeHourSlots` 같은 선생성 슬롯 문서를 source of truth로 둘 필요는 없다.
- 판단 원본은 `officeHourApplications`, `consultants.availability`, `consultants.agendaIds`, `programs`다.
- 신청 가능 여부와 시간 차단 여부는 매번 원본으로 계산한다.
- 캐시나 파생 인덱스가 있더라도 이 정책 판단의 기준이 되면 안 된다.

## Legacy Compatibility

- 신규 read/write 경로에서는 `reservedConsultantId`, `officeHourSlotId`를 해석하지 않는다.
- 기존 데이터 정리는 백필로만 처리한다.

## Backfill Decision

- 기존 `pending/review` 데이터 중 `pendingConsultantIds`가 없고
  `reservedConsultantId` 또는 `officeHourSlotId`만 있는 문서는 백필 대상이다.
- 백필 스크립트는 [backfill-pending-consultant-ids.mjs](/Users/mysc/Desktop/startup-diagnostic-platform/scripts/backfill-pending-consultant-ids.mjs)다.
- 이 스크립트는:
  - `pendingConsultantIds`를 채우고
  - `reservedConsultantId`, `officeHourSlotId`를 제거한다.
- 레거시 필드 읽기 fallback는 제거했으므로, 운영 반영 전 백필이 선행되어야 한다.
