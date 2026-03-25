# AGENTS.md

이 프로젝트에서 작업할 때 아래 규칙을 반드시 따른다.

## Core Rules

- Single source of truth를 깨는 fallback를 넣지 않는다.
- 같은 비즈니스 상태를 화면마다 다른 기준으로 읽지 않는다.
- 비즈니스 상태 변경은 공통 util/service/function 한 곳으로만 처리한다.
- 컴포넌트에서 여러 문서를 직접 맞추는 로직을 새로 만들지 않는다.
- 파생 인덱스를 원본처럼 읽지 않는다.
- 데이터가 깨진 상태를 조용히 숨기지 않는다.
- 에러는 드러내고, 문제 상태는 차단하거나 수정한다.
- 구조 변경 시 기존 데이터 백필 필요 여부를 반드시 판단한다.
- 임시 호환 fallback를 넣었다면 제거 계획을 같이 남긴다.
- 성능 최적화 때문에 원본 기준을 깨지 않는다.

## Current Project Rule

- 회사 참여사업의 source of truth는 `companies.programs`다.
- `programs.companyIds`는 파생 인덱스다.
- 참여사업 변경은 공통 membership util만 통해 수행한다.
- 참여사업 관련 비즈니스 판단은 `companies.programs` 기준으로만 한다.

## Working Style

- 문제를 덮는 방향보다 원인을 드러내는 방향으로 구현한다.
- “일단 fallback로 보이게” 처리하지 않는다.
- UI만 맞추는 수정으로 끝내지 말고 데이터 정합성까지 본다.
- 새 쓰기 경로를 추가할 때는 기존 경로와 충돌하지 않는지 먼저 확인한다.

## Reference

- 상세 설계 원칙: [docs/engineering-constitution.md](./docs/engineering-constitution.md)
