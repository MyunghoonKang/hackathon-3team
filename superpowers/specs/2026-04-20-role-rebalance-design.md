# 역할 재분배 설계 — Plan A/B 병렬 + 세션 파일 경로 분할

**작성일:** 2026-04-20
**대상:** 4인 해커톤 팀 (Dev 1, 2, 3, 4) — 24h PoC
**문제 배경:** 현 handoff(2026-04-19) 는 Dev 4 가 Plan A 엔진(Task 1~9, 16) + Plan B 전체(Task 1~14 중 12개) = **22 Task** 를 단일 담당. Dev 3 은 7 Task. 비중이 3배 차이. Dev 3·4 는 Claude Code 세션을 여러 개 띄워 병렬 작업이 가능하므로, Plan A·B 를 Dev 축으로 쪼개고 각자 세션 2개로 병렬화한다.

**관련 문서:**
- `docs/handoff/README.md` — 기존 팀 handoff (본 설계가 대체)
- `docs/handoff/dev3-ui.md` · `docs/handoff/dev4-engine.md` — 기존 브리프 (개편 필요)
- `docs/superpowers/plans/2026-04-19-game-platform.md` — Plan A (Task 정의 유지)
- `docs/superpowers/plans/2026-04-19-erp-automation.md` — Plan B (Task 정의 유지)
- `docs/superpowers/specs/2026-04-19-erp-proposal-game-automation-design.md` — 통합 설계 (유지)
- `docs/design/project/Wireframes.html` — UI 시각 스펙 (유지)

---

## 1. 역할 축

| Dev | 담당 | Claude 세션 | 파일 경로 소유권 |
|-----|------|-------------|------------------|
| **Dev 3** | Plan A 풀스택 | **3A** · 3B | **3A**: `src/server/{index,app,config,io}.ts` · `src/server/{db,session,games}/**` · `src/server/routes/{sessions,games}.ts` · `src/shared/**` · `tests/{roomCode,manager,registry,runner,io}.test.ts` · `tests/shared/**` |
| | | 3A · **3B** | **3B**: `src/web/pages/**` · `src/web/components/**` (단 `CredentialForm.tsx` · `ResultView.tsx` 제외) · `src/web/styles.css` · `src/web/socket.ts` · `tests/web/**` |
| **Dev 4** | Plan B 풀스택 | **4A** · 4B | **4A**: `src/server/{vault,submissions,hooks}/**` · `src/server/routes/{credentials,submissions}.ts` · `src/web/components/{CredentialForm,ResultView}.tsx` · `tests/{db,vault,queue,scheduling,e2e-mock}.test.ts` |
| | | 4A · **4B** | **4B**: `src/server/worker/**` (목업 HTML 포함) · `tests/{matcher,worker-mock}.test.ts` · `tests/fixtures/cardRows.json` |
| **Dev 1·2** | 게임 HTML | — | `games/**` — 운영자(Dev 4) 가 admin 수령·등록 |

**디렉터리 기준:** `src/server/routes/` 는 3A·4A 공유이지만 **파일명으로 분리** (`sessions.ts`·`games.ts` ↔ `credentials.ts`·`submissions.ts`). 마이그레이션 `drizzle/` 역시 순차 번호로 파일명 분리.

**핵심 원칙**
1. **파일 경로가 겹치지 않는다.** 세션 분할의 최우선 원칙.
2. **Plan A·B 병렬 시작.** Contract-First 로 H+2 공동 계약 머지 후 완전 분리.
3. **Plan B UI 소유권은 Dev 4.** `CredentialForm` 본문 · `ResultView` 의 QUEUED/RUNNING/COMPLETED/FAILED 단계는 4A 가 소유. 3B 는 Plan A UI(FINISHED 까지) 만.

**경계 접점 (공용)**
- `src/shared/protocol.ts` — 3A 소유. 4A·4B 는 import only. 추가 필드는 3A 에 사전 알림 후 PR.
- `src/server/db/schema.ts` — 3A(`sessions`) + 4A(`submissions`·`credentials`). 마이그레이션 파일 순차 번호.
- `src/web/pages/RoomPage.tsx` — 3B 소유. FINISHED 이후 status 분기는 4A 가 별도 PR 로 case 추가.
- `src/web/styles.css` + CSS variables + `StatusBadge`·`InlineSpinner` — 공동 계약에서 합의 후 3B 소유.
- `src/server/hooks/submissionHook.ts` — 4A 소유. 3A 는 공동 계약으로 고정된 시그니처만 호출.

---

## 2. 공동 계약 세션 (H+0~2, Dev 3·4 동석)

Contract-First 로 독립 작업을 풀려면 **이 2h 안에 다음 파일들이 첫 커밋 + `main` 머지** 되어야 한다.

### 2.1 산출물

1. **`src/shared/protocol.ts`** (전부 확정)
   - `RoomStatus` 9 enum (PREPARING · PLAYING · FINISHED · CREDENTIAL_INPUT · QUEUED · RUNNING · COMPLETED · FAILED · ABORTED)
   - `RoomStatePayload` (submissionId · scheduledAt · workerStep · erpRefNo · errorLog 포함)
   - `credentialInputSchema` (userId · loginId · password)
   - `ALLOWED_TRANSITIONS` 표
   - REST 응답 타입 · 게임 SDK meta 스펙

2. **`src/server/db/schema.ts`** — `sessions` + `submissions` + `credentials` 3 테이블 한 번에
   - 마이그레이션: `drizzle/0001_init.sql` (단일). 이후 4A 가 필요 시 `0002_*.sql`~.

3. **`src/web/styles.css`** — CSS variables (color primary/accent · spacing · radius · shadow) + Pretendard/Inter 폰트 link.

4. **`src/web/components/StatusBadge.tsx`** — 9 RoomStatus 한국어 라벨 + 색 매핑 (스텁 OK, 시그니처 고정).

5. **`src/web/components/InlineSpinner.tsx`** — 4A 의 RUNNING 단계용 진행 인디케이터 시그니처.

6. **`src/server/hooks/submissionHook.ts`** — Plan A GameRunner → Plan B enqueue 결합 지점. 함수 시그니처만 고정: `onGameFinished(sessionId: string, loserId: string): Promise<void>`. 초기 구현은 no-op, 4A 가 B12 에서 교체.

7. **`.env.example`** — 3A 의 `PORT`/`DB_PATH`/`GAMES_DIR` + 4A·4B 의 `VAULT_MASTER_KEY`/`WORKER_MODE`/`ERP_BASE_URL`/`ERP_COMPANY_CODE`/`ERP_CONFIRM_SUBMIT`(주석) 한 번에.

### 2.2 세션 규칙

- 세션 3A 가 PR 리드, 4A 가 리뷰어로 `src/shared/protocol.ts` · `src/server/db/schema.ts` · `submissionHook.ts` 시그니처 OK 로그 남김.
- 커밋 메시지: `feat(shared): lock contracts for A/B split`.
- 2h 안에 `main` 머지 → 각자 흩어짐.

### 2.3 계약 변경 규칙 (H+2 이후)

- `src/shared/protocol.ts`: **추가만 OK.** 소유자 3A 에게 사전 알림 필수. 삭제·rename 은 양 Dev 동의.
- DB 스키마: 4A 의 Plan B 테이블 수정은 자유. `sessions` 테이블 수정은 3A 만.

---

## 3. 타임라인 (24h · 4 세션 + 게임팀)

| 시각 | 3A (Plan A 엔진) | 3B (Plan A UI) | 4A (Plan B 데이터·API·UI) | 4B (Plan B Playwright) | Dev 1·2 |
|------|------------------|-----------------|----------------------------|-------------------------|---------|
| H+0~2 | **공동 계약 세션 (Dev 3·4 동석)** | | | | 게임 아이디어 3종 + 하네스 |
| H+2~6 | A4 roomCode · A5 SessionManager | A10 HomePage (mock socket) | B1 DB migration · B2 Vault | B6 워커 스캐폴딩 + 목업 HTML 3종 | 게임 1호 |
| H+6~10 | A6 Registry · A7 Upload · A8 Runner · A9 Socket | A11 LobbyView · A12 GameFrame | B3 API + 폼 본문 · B4 Queue | B7 로그인 · B8 카드매칭 | 게임 2호 · 수령 thread |
| H+10~14 | 통합 지원 · 버그 | A13 RoomPage · A15 ResultView FINISHED | B5 Scheduler · B11 REST · B12 게임훅 | B9 폼채움 · B10 결재상신 | 게임 3호 · 수령 thread |
| H+14~18 | A16 데모 스크립트 | 폴리싱 · 사운드 · 모션 | **B11 UI (QUEUED/RUNNING/COMPLETED/FAILED) · B13 E2E mock** | 워커 안정화 · 스크린샷 유틸 | 여유 게임 |
| H+18~22 | 통합 리허설 | 리허설 | 통합 테스트 · 데모 스크립트 | 워커 타이밍 튜닝 | 데모 대기 |
| H+22~24 | 폴리싱 | 폴리싱 | **B14 실 ERP 라이브 (사용자 동석)** | B14 백업 · 로그 | 데모 |

**현행 handoff 대비 변경**
- Dev 4 의 22 Task → 4A 11 Task / 4B 8 Task 로 갈라짐 (세션당 유효 분량 ≤11 Task).
- Dev 3 의 7 Task → 3A 10 Task / 3B 5 Task 로 갈라짐.
- H+8 블로커 해제가 H+10 경으로 약간 밀리지만, Plan B 가 H+2 부터 병렬 시작 → 전체 완료 앞당겨짐.
- Plan B UI (B3 폼 · B11 단계표시) 는 4A 소유. 3B 는 Plan A UI 만.

---

## 4. 세션별 DoD (H+22 기준)

### 4.1 세션 3A — Plan A 엔진

- [ ] A1~A9 머지, 4대 노트북 E2E 성공 (방 생성 → 게임 → 패자 결정, 모두 `/room/XXXX` 한 URL)
- [ ] `SessionManager.transitionStatus` 가 9 RoomStatus ALLOWED_TRANSITIONS 강제 (illegal jump 차단)
- [ ] `broadcastRoomState` 단일 채널 동기화 (폴링 없음)
- [ ] GameRegistry · Upload API · GameRunner 단위 테스트 녹색
- [ ] A16 리허설 체크리스트 1회 실행 OK

### 4.2 세션 3B — Plan A UI

- [ ] HomePage · LobbyView · GameView · ResultView **FINISHED 단계까지** 렌더
- [ ] `StatusBadge` · `InlineSpinner` 공용 계약대로 구현
- [ ] `RoomPage` 스위치 3 case (PREPARING / PLAYING / FINISHED) + 4A 의 case 추가 PR 수용 가능한 구조
- [ ] A15 연출 (드럼롤 · 룸코드 복사 · 재연결 토스트)
- [ ] mock socket → 실 소켓 1줄 교체 검증 (A9 머지 후)

### 4.3 세션 4A — Plan B 데이터·API·UI

- [ ] B1 migration (submissions · credentials), B2 Vault round-trip (AES-256-GCM)
- [ ] B3 `POST /api/credentials` + `…/credential-input` + `…/submissions` → FINISHED → CREDENTIAL_INPUT → QUEUED 전이 + broadcast
- [ ] B4 SubmissionQueue 상태머신, B5 Scheduler (분당 · 다음 영업일 09:00 Asia/Seoul)
- [ ] `RoomPage` 에 CREDENTIAL_INPUT / QUEUED / RUNNING / COMPLETED / FAILED 5 case PR (3B 골격 위에 얹기)
- [ ] `CredentialForm` 본문 · `ResultView` 단계별 본문 (StatusBadge · InlineSpinner 사용)
- [ ] B12 게임훅 — `submissionHook.ts` 구현을 GameRunner outcome 에 연결
- [ ] B13 E2E mock 녹색 (`WORKER_MODE=mock` 으로 데모 시나리오 1회 성공)

### 4.4 세션 4B — Plan B Playwright 워커

- [ ] B6 워커 스캐폴딩 + 목업 HTML 3종 + `WORKER_MODE` 토글
- [ ] B7 로그인 · B8 카드매칭 · B9 폼채움 · B10 결재상신 (각 단계 시작 시 `transitionStatus(RUNNING, { workerStep })` 호출 → 4A broadcast)
- [ ] `runSubmission(submissionId: string): Promise<WorkerResult>` export (4A 가 import)
- [ ] 단위 테스트 (`matcher.test.ts` · `worker-mock.test.ts`) 녹색
- [ ] B14 실 ERP 라이브 리허설: 사용자 동석, 폼 채움까지 OK, `[상신]` 은 데모 당일 `ERP_CONFIRM_SUBMIT=1` + 수동 확인 후

---

## 5. 블로커 해제 시점

| 이벤트 | 해제되는 것 |
|--------|-------------|
| 공동 계약 머지 (H+2) | 3B · 4A · 4B 전원 착수 |
| 3A A1 머지 (H+2~3) | 3B · 4A · 4B 실제 Vite · TS 기동 |
| 3A A7 머지 (H+7~8) | Dev 1·2 게임 admin 등록 가능 |
| 3A A9 머지 (H+8~9) | 3B · 4A 실 소켓 연결 |
| 4B B6 머지 (H+5~6) | 4A B11 의 `runSubmission` import |
| 4A B12 머지 (H+12) | Plan A 결승 → Plan B enqueue 자동 연결 |
| 4B B10 머지 (H+13~14) | 4A B13 E2E mock 녹색 가능 |

---

## 6. 병합 · 충돌 회피 · ERP 안전

### 6.1 브랜치 네이밍

- 3A: `feat/a-<topic>` (예: `feat/a-session-manager`)
- 3B: `feat/ui-<topic>` (예: `feat/ui-lobby`)
- 4A: `feat/b-api-<topic>`
- 4B: `feat/b-worker-<topic>`

### 6.2 머지 규칙

- 24h PoC — "녹색 테스트 + 빠른 eyes-on → 바로 머지" 유지.
- PR 은 `main` 에 rebase 후 squash 머지. 장기 브랜치 금지.
- 공동 계약 파일(§2.1) 변경은 별도 PR + 양 Dev 승인.

### 6.3 공용 파일 운영 규칙

| 파일 | 기본 소유 | 수정 규칙 |
|------|-----------|-----------|
| `src/shared/protocol.ts` | 3A | 추가만 OK · Dev 4 는 PR 전 슬랙에서 3A 에 "추가 필드 X" 알림. 삭제·rename 금지 |
| `src/server/db/schema.ts` | 3A(sessions) + 4A(submissions·credentials) | 4A 는 자기 테이블만 수정. 마이그레이션 파일 번호는 순차 |
| `src/web/pages/RoomPage.tsx` | 3B | 3B 가 PREPARING/PLAYING/FINISHED 3 case 머지 → 4A 가 CREDENTIAL_INPUT/QUEUED/RUNNING/COMPLETED/FAILED 5 case 를 별도 PR 로 추가. 4A PR 은 3B RoomPage 가 H+14 이후 안정된 뒤 열기 |
| `src/web/styles.css` | 3B | CSS variable 추가만 OK (4A 가 색·간격 필요 시 var 추가 PR) |
| `.env.example` | 공동 계약 후 3A | 이후 변수 추가는 PR 에서 append — 충돌 시 양쪽 append 병합 |
| `src/server/hooks/submissionHook.ts` | 4A | 3A 는 시그니처 호출만 (공동 계약에서 고정) |

### 6.4 동기화 포인트 (4 세션 기준)

| 시각 | 체크 |
|------|------|
| H+2 | 공동 계약 머지 확인 → 각자 흩어짐 |
| H+6 | 3A A1~A5 / 4A B1~B2 / 4B B6 기본 합격 — 공용 토대 OK? |
| H+10 | 3A A9 머지 · 실 소켓 · B5 Scheduler 기동 · Dev 1·2 게임 1개 admin 등록됨 |
| H+14 | 3B ResultView FINISHED · 4A B11 UI PR 열림 · 4B B10 통과 (목업) |
| H+18 | 전 구간 통합 (`main` 에서 4개 브랜치 만남) · E2E mock 데모 시나리오 성공 |
| H+22 | 라이브 리허설 준비 — B14 는 사용자 동석 대기 |

### 6.5 ERP 안전 규칙 (4B B14 적용)

1. **자격증명** — 사용자(매니저) 가 브라우저에 직접 타이핑. 코드·채팅에 하드코딩/로그 금지.
2. **쓰기 동작** — `WORKER_MODE=live` + `ERP_CONFIRM_SUBMIT=1` 동시 세팅 + 사용자 동석 확인 후에만 `[상신]`.
3. **Playwright `headless=false` 유지** — 무슨 일이 일어나는지 눈으로 확인 가능.
4. **B14 실행 주체는 Dev 4(사용자 본인) 만.** Dev 3 은 관측만.

---

## 7. Dev 1·2 (게임팀) — 변화 없음

- 범위: Plan A Task 14 (샘플 게임 3종~N종).
- 블로커 해제: 3A Task A7 (Upload API) 머지 (H+7~8).
- 그 전까지는 `games-test-harness.html` 로 로컬 검증.
- 전달: 팀 DM 방 thread 에 HTML 첨부 → Dev 4(4A 혹은 4B 어느 세션이든) 가 `curl -F "game=@<name>.html" http://localhost:3000/api/games` 로 등록 → thread 에 ✅ 이모지.
- 422 반환 시 thread 에 `errors` 요약 → 동일 thread 에서 수정본 재전달.

---

## 8. 긴급 차선책

- **Playwright 가 실 ERP 에서 새 CAPTCHA/2FA 마주침** → Plan B §6.4 `FAILED_UNEXPECTED_UI` 분기 + 모킹 모드 데모. 심사 슬라이드에 "실서비스 구조 · 목업 재현" 강조.
- **카드내역이 데모 당일 미반영** → 사전 저장된 `tests/fixtures/cardRows.json` 으로 목업 흐름 재생.
- **스케줄러가 못 돌 지경** → `POST /api/submissions/:id/run-now` 로 수동 트리거.
- **공동 계약 세션 지연** (H+2 에 머지 못함) → 3A 가 단독으로 공동 계약 파일을 먼저 커밋하고, 4A·4B 는 계약 확정된 shared/protocol.ts 만 보고 시작 (ㄴ 옵션 폴백).

---

## 9. 후속 작업

본 설계안 승인 후:
1. `docs/handoff/README.md` · `dev3-ui.md` · `dev4-engine.md` 를 본 설계 기준으로 재작성. 새 구조 = `README.md` + **`dev3.md`** (세션 3A·3B 통합) + **`dev4.md`** (세션 4A·4B 통합) + `dev1-2-game-cowork.md`. 4 세션을 2 브리프에 담는 이유: Dev 당 한 파일에서 자기 몫 전부 확인 가능 · 문서 수 최소화. 각 브리프 안에서 세션별 프롬프트·DoD·파일 소유권 블록은 별도 섹션으로 분리.
2. 공동 계약 세션 H+0~2 산출물은 Plan A Task A1·A2·A3 + Plan B Task B1·B2 초반부에 이미 명시되어 있어 별도 실행 플랜 불필요. 구현 계획(writing-plans)은 handoff 재작성에 집중.

---

## 10. Lessons from 2026-04-20 E2E Simulation (post-hackathon learnings)

사용자가 Dev 3/4 를 가상 플레이한 24h PoC 시뮬 결과, **TDD 18/18 녹색에도 실제 브라우저에서 6건 통합 버그** 가 드러났다. 재해커톤 시 아래 원칙을 §2 공동 계약과 §4 DoD 에 흡수한다.

### 10.1 공동 계약 산출물에 추가 (§2.1 갱신 권고)

기존 7개 산출물 → 8개. 추가 항목:

8. **UI 컴포넌트 props 시그니처 lock** — 3B 가 만들 `RoomPage` 의 switch 분기가 4A 소유 `ResultView` / `CredentialForm` 을 호출할 때 prop 이름이 공동 계약에 있어야 한다. 시뮬에서 `<ResultView snap={session} me={me} />` (3B) vs `function ResultView({ state, myPlayerId }: ...)` (4A) 불일치로 런타임 에러 발생. 확정 시그니처:
   - `ResultView({ state: RoomStatePayload, myPlayerId: string })`
   - `CredentialForm({ sessionId: string, loserId: string })`
   - `LobbyView({ snap: RoomStatePayload, me: string })`
   - `GameView({ snap: RoomStatePayload, me: string })`

### 10.2 각 세션 DoD 체크박스 강화

- **3A**: `SessionManager.persist` 옵션은 **실제로 DB insert/update 하는 구현**까지 포함. flag 선언만 두면 4A 의 `submissions.sessionId` FK 가 즉시 깨진다.
- **3B**:
  - `useSession` 은 component-local `useState` 금지 → module-level store + subscription.
  - `src/web/socket.ts` 를 실 `io()` 로 1줄 교체했는지 grep 으로 검증.
  - `GameView` 는 `game:begin` 이벤트 listener 만 믿지 말고 REST fallback(`GET /api/games`) 제공.
- **4A**:
  - `/api/submissions/:id/run-now` 가 실제 `runSubmission` 호출을 포함 (스텁 금지).
  - `queue.enqueue` 직전 `sessions` 테이블 upsert (이중 가드).
- **통합**: 각 세션 완료 시 **2 탭 수동 E2E 스모크** 필수. TDD 녹색 ≠ E2E 녹색. 시뮬에서 TDD 82/82 통과에도 브라우저에선 6건 실패.

### 10.3 프롬프트 "실행 원칙" 에 추가 (dev3.md · dev4.md)

기존 "Task 1 완료 후 push+STOP" 에 다음 한 줄 추가:

> - **스모크 검증**: `src/web/**` 또는 `src/server/routes/**` 를 수정한 Task 는 `npm run dev` 로 서버 기동 후 해당 엔드포인트/화면에 요청 1회 보내 200/렌더 확인까지 해야 Task 완료.

### 10.4 참고 커밋

- `dce28ef` — 시뮬 발견 6 버그 일괄 패치.
- `docs/handoff/session-notes.md` — 전체 시뮬 로그 + 미해결 항목(run-now 스텁).
