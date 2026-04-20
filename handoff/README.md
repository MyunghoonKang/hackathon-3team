# 팀 킥오프 · Handoff Index

24시간 해커톤 PoC — **식후 벌칙게임 + 더존 아마란스 ERP 품의서 자동 상신**. 4인 팀, Claude Code 세션 4개 + Claude Cowork 를 병렬 가동.

## 각자 읽을 문서

| 담당 | 도구 | 세션 | 문서 |
|------|------|------|------|
| Dev 1, 2 | Claude Cowork | — | [`dev1-2-game-cowork.md`](./dev1-2-game-cowork.md) · [`games-starter-template.html`](./games-starter-template.html) · [`games-test-harness.html`](./games-test-harness.html) |
| Dev 3 | Claude Code × 2 | 3A (엔진) · 3B (UI) | [`dev3.md`](./dev3.md) |
| Dev 4 | Claude Code × 2 | 4A (데이터·API·UI) · 4B (Playwright) | [`dev4.md`](./dev4.md) |

## 공통 참조

- 설계 스펙: `docs/superpowers/specs/2026-04-19-erp-proposal-game-automation-design.md`
- **역할 재분배 설계 (현행 handoff 의 근거):** `docs/superpowers/specs/2026-04-20-role-rebalance-design.md`
- Plan A (게임 플랫폼): `docs/superpowers/plans/2026-04-19-game-platform.md`
- Plan B (ERP 자동화): `docs/superpowers/plans/2026-04-19-erp-automation.md`
- ERP Exploration 조사 결과 (Plan B 입력): `docs/superpowers/specs/2026-04-19-erp-exploration-field-findings.md`
- **UI 와이어프레임 (Claude Design):** `docs/design/project/Wireframes.html` (7 화면 × 2 변주, 손글씨 메모) · 원본 README `docs/design/README.md` · 작업 대화 `docs/design/chats/chat1.md`

## 의존성 DAG

```
공동 계약 (H+2)
  ├─→ 3A(A1~A9,16) ──┐
  │     ↓ A1 머지     │
  │     ├─→ 3B(A10~13,15)  ← mock→실 소켓: A9 머지 후
  │     ├─→ A7 머지 → Dev 1·2 게임 admin 등록
  │     └─→ A9 머지 → 4A 실소켓 broadcast
  │
  ├─→ 4A(B1~5,11~13) ──→ B12 가 3A GameRunner outcome hook 에 연결
  │     └─→ B3 API 머지 → CredentialForm 소유권 3B → 4A PR
  │
  └─→ 4B(B6~10,14) ───→ B6 → runSubmission() export → 4A B11 import
        └─→ B10 머지 → 4A B13 E2E mock 녹색
```

## 타임라인 (24h)

| 시각 | 3A (Plan A 엔진) | 3B (Plan A UI) | 4A (Plan B 데이터·API·UI) | 4B (Plan B Playwright) | Dev 1·2 |
|------|------------------|-----------------|----------------------------|-------------------------|---------|
| H+0~2 | **공동 계약 세션 (Dev 3·4 동석)** | | | | 게임 아이디어 3종 + 하네스 |
| H+2~6 | A4 roomCode · A5 SessionManager | A10 HomePage (mock socket) | B1 DB migration · B2 Vault | B6 워커 스캐폴딩 + 목업 HTML 3종 | 게임 1호 |
| H+6~10 | A6 Registry · A7 Upload · A8 Runner · A9 Socket | A11 LobbyView · A12 GameFrame | B3 API + 폼 본문 · B4 Queue | B7 로그인 · B8 카드매칭 | 게임 2호 · 수령 thread |
| H+10~14 | 통합 지원 · 버그 | A13 RoomPage · A15 ResultView FINISHED | B5 Scheduler · B11 REST · B12 게임훅 | B9 폼채움 · B10 결재상신 | 게임 3호 · 수령 thread |
| H+14~18 | A16 데모 스크립트 | 폴리싱 · 사운드 · 모션 | **B11 UI (QUEUED/RUNNING/COMPLETED/FAILED) · B13 E2E mock** | 워커 안정화 · 스크린샷 유틸 | 여유 게임 |
| H+18~22 | 통합 리허설 | 리허설 | 통합 테스트 · 데모 스크립트 | 워커 타이밍 튜닝 | 데모 대기 |
| H+22~24 | 폴리싱 | 폴리싱 | **B14 실 ERP 라이브 (사용자 동석)** | B14 백업 · 로그 | 데모 |

## 저장소 · 전달 규칙

- **핸드오프·산출물 전달은 git 이 아니라 팀 DM 방(Slack)을 통해 이뤄진다.** 모든 팀원은 팀 DM 방을 기본 통신 경로로 삼는다.
- **Dev 1, 2 (게임 제작자):** git 을 쓰지 않는다. 완성 HTML 을 팀 DM 방에 첨부 → 파일별 thread 로 묶어 관리 → Dev 4 가 thread 에 `✅` 찍으면 admin 등록 완료. 상세는 [`dev1-2-game-cowork.md §6`](./dev1-2-game-cowork.md).
- **Dev 3 (Plan A), Dev 4 (Plan B):** 코드 작업은 로컬 저장소에서 한다. 기본 브랜치 `main`. 세션별 브랜치 네이밍 예: `feat/a-<topic>` (3A) · `feat/ui-<topic>` (3B) · `feat/b-api-<topic>` (4A) · `feat/b-worker-<topic>` (4B). 커밋 스타일 `feat(…)` · `docs(…)` · `chore(…)` 유지.
- **머지 원칙 (Dev 3·4 한정):** 24h 해커톤이므로 승인 지연 금지 — **녹색 테스트 + 빠른 eyes-on → 바로 머지**. 공동 계약 파일(`src/shared/protocol.ts` 등) 변경은 별도 PR + 양 Dev 승인.

### 공용 파일 운영 규칙

| 파일 | 기본 소유 | 수정 규칙 |
|------|-----------|-----------|
| `src/shared/protocol.ts` | 3A | 추가만 OK · Dev 4 는 PR 전 슬랙에서 3A 에 "추가 필드 X" 알림. 삭제·rename 금지 |
| `src/server/db/schema.ts` | 3A(sessions) + 4A(submissions·credentials) | 4A 는 자기 테이블만 수정. 마이그레이션 파일 번호는 순차 |
| `src/web/pages/RoomPage.tsx` | 3B | 3B 가 PREPARING/PLAYING/FINISHED 3 case 머지 → 4A 가 CREDENTIAL_INPUT/QUEUED/RUNNING/COMPLETED/FAILED 5 case 를 별도 PR 로 추가. 4A PR 은 3B RoomPage 가 H+14 이후 안정된 뒤 열기 |
| `src/web/styles.css` | 3B | CSS variable 추가만 OK (4A 가 색·간격 필요 시 var 추가 PR) |
| `.env.example` | 공동 계약 후 3A | 이후 변수 추가는 PR 에서 append — 충돌 시 양쪽 append 병합 |
| `src/server/hooks/submissionHook.ts` | 4A | 3A 는 시그니처 호출만 (공동 계약에서 고정) |

## 동기화 포인트

| 시각 | 체크 |
|------|------|
| H+2 | 공동 계약 머지 확인 → 각자 흩어짐 |
| H+6 | 3A A1~A5 / 4A B1~B2 / 4B B6 기본 합격 — 공용 토대 OK? |
| H+10 | 3A A9 머지 · 실 소켓 · B5 Scheduler 기동 · Dev 1·2 게임 1개 admin 등록됨 |
| H+14 | 3B ResultView FINISHED · 4A B11 UI PR 열림 · 4B B10 통과 (목업) |
| H+18 | 전 구간 통합 (`main` 에서 4개 브랜치 만남) · E2E mock 데모 시나리오 성공 |
| H+22 | 라이브 리허설 준비 — B14 는 사용자 동석 대기 |

## 환경변수 (Dev 4 가 `.env.example` 에 반영. 각자 로컬에 `.env` 생성)

```
PORT=3000
DB_PATH=data/sqlite.db
GAMES_DIR=games
VAULT_MASTER_KEY=<openssl rand -hex 32>
WORKER_MODE=mock        # mock | dryrun | live — 데모 당일만 live
ERP_BASE_URL=https://erp.meissa.ai
ERP_COMPANY_CODE=meissa
# ERP_CONFIRM_SUBMIT=1  # 실 상신 허용 플래그. 데모 시 사용자 확인 후에만 설정
```

## ERP 안전 규칙 (필독 — 세션 4B 의 B14 실행 시)

1. **자격증명** — 사용자(매니저) 가 브라우저에 직접 타이핑. 코드·채팅에 하드코딩/로그 금지.
2. **쓰기 동작** — `WORKER_MODE=live` + `ERP_CONFIRM_SUBMIT=1` 동시 세팅 + 사용자 동석 확인 후에만 `[상신]`.
3. **Playwright `headless=false` 유지** — 무슨 일이 일어나는지 눈으로 확인 가능.
4. **B14 실행 주체는 Dev 4(사용자 본인) 만.** Dev 3 은 관측만.
