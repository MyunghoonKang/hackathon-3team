# Dev 4 — Plan B 풀스택 Brief (세션 4A + 4B)

> Dev 4 는 Claude Code 세션 2 개를 병렬 구동한다. **4A = Plan B 데이터·API·UI**, **4B = Plan B Playwright 워커**. **Dev 4 는 사용자 본인(메이사 소속, 더존 아마란스 `erp.meissa.ai` 접근 권한 보유)** — 따라서 B14 실 ERP 라이브 실행 주체는 오직 Dev 4 뿐이다.

## 범위 요약

- **세션 4A — Plan B 데이터·API·UI** — Plan B Task B1~B5, B11~B13 + Plan B UI (`CredentialForm.tsx` 본문, `ResultView.tsx` 의 QUEUED/RUNNING/COMPLETED/FAILED 단계 본문). DB 마이그레이션 · CredentialVault · SubmissionQueue · Scheduler · REST 라우트 · 게임훅 · E2E mock.
- **세션 4B — Plan B Playwright 워커** — Plan B Task B6~B10, B14. 워커 스캐폴딩 + 목업 HTML 3 종 · 로그인 · 카드매칭 · 폼채움 · 결재상신 · **실 ERP 라이브 리허설 (사용자 본인 동석)**.
- **범위 밖 (3A · 3B 소유):** Plan A 엔진 전체 · Plan A UI (HomePage · LobbyView · GameView · ResultView FINISHED 단계) · `RoomPage` 의 PREPARING/PLAYING/FINISHED 3 case 골격.

공통 참조: [`./README.md`](./README.md) · [`./dev3.md`](./dev3.md) · `docs/superpowers/specs/2026-04-20-role-rebalance-design.md` · `docs/superpowers/plans/2026-04-19-erp-automation.md` · `docs/superpowers/specs/2026-04-19-erp-exploration-field-findings.md` · `docs/design/project/Wireframes.html`.

---

## 공동 계약 세션 (H+0~2, Dev 3 와 동석 · 리뷰어 = 4A)

Contract-First 로 독립 작업을 풀기 위해 **이 2h 안에 다음 7 개 산출물이 첫 커밋 + `main` 머지**되어야 한다. 3A 가 PR 리드, 4A 가 리뷰어로 `src/shared/protocol.ts` 의 Plan B 필드(`submissionId` · `scheduledAt` · `workerStep` · `erpRefNo` · `errorLog`) + `src/server/db/schema.ts` 의 `submissions` · `credentials` 테이블 + `src/server/hooks/submissionHook.ts` 시그니처를 승인하고 OK 로그를 남긴다. 커밋 메시지: `feat(shared): lock contracts for A/B split`.

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

---

## 세션 4A — Plan B 데이터·API·UI

### 필독 문서

- Plan B 전체 (`docs/superpowers/plans/2026-04-19-erp-automation.md`)
- ERP Exploration 조사 결과 (`docs/superpowers/specs/2026-04-19-erp-exploration-field-findings.md`) — 필드 셀렉터·카드매칭 규칙·상신 조건
- UI 와이어프레임 (`docs/design/project/Wireframes.html`) — 특히 **화면 5 (CredentialForm) · 화면 6 (ResultView RUNNING) · 화면 7 (ResultView COMPLETED/FAILED)**
- [`./README.md`](./README.md) · `docs/superpowers/specs/2026-04-20-role-rebalance-design.md` — 본 재분배 설계 (4A 행 소유권)

### 파일 경로 소유권

`src/server/{vault,submissions,hooks}/**` · `src/server/routes/{credentials,submissions}.ts` · `src/web/components/{CredentialForm,ResultView}.tsx` · `tests/{db,vault,queue,scheduling,e2e-mock}.test.ts`

> **`src/server/worker/**` 는 4B 소유** — import 만 하고 내부는 건드리지 말 것. 워커 진입점은 `runSubmission(submissionId: string): Promise<WorkerResult>` 한 함수만 사용.
>
> **`src/web/pages/**` · `src/web/components/**` 대부분은 3B 소유.** 4A 가 소유하는 UI 는 `CredentialForm.tsx` · `ResultView.tsx` **단 두 파일만**. `src/web/pages/RoomPage.tsx` 에 5 case 를 얹는 PR 은 별도 작업 (아래 RoomPage 타이밍 참조).
>
> **`src/server/{index,app,config,io}.ts` · `src/server/{db,session,games}/**` 는 3A 소유.** 4A 는 자기 테이블(`submissions` · `credentials`) 마이그레이션만 수정. `sessions` 테이블은 건드리지 말 것.

### 우선순위 · 개발 흐름

공동 계약 머지 직후 시작. Plan B UI (B3 폼 본문 · B11 UI 단계) 는 데이터 트랙 사이에 인터리브.

| 순서 | Task | 의존 |
|------|------|------|
| 1 | **B1** DB 마이그레이션 (`submissions` · `credentials` — 공동 계약에서 공유 스키마 초안 확정됨) · **B2** CredentialVault (AES-256-GCM round-trip) | 공동 계약 머지 후 독립 착수 |
| 2 | **B3** `POST /api/credentials` + `…/credential-input` REST · `CredentialForm.tsx` 본문 | B1·B2 |
| 3 | **B4** SubmissionQueue 상태머신 | B1 |
| 4 | **B5** Scheduler (분당 polling · 다음 영업일 09:00 Asia/Seoul) | B4 · 4B B6 의 `runSubmission` import |
| 5 | **B11** `POST /api/sessions/:id/submissions` + `…/run-now` REST · **ResultView QUEUED/RUNNING/COMPLETED/FAILED 본문** | B4 · B5 · 3B RoomPage 안정 (H+14 이후) |
| 6 | **B12** 게임훅 — `submissionHook.ts` 구현을 GameRunner outcome 에 연결 | 3A A8 머지 |
| 7 | **B13** E2E mock 녹색 (`WORKER_MODE=mock` 으로 데모 시나리오 1회 성공) | 4B B10 머지 |

**REST 엔드포인트 (4A 소유, status 전이 + broadcast 한 번에 수행)**

- `POST /api/credentials` → 204 (vault 에 암호화 저장)
- `POST /api/sessions/:id/credential-input` → 204 (`FINISHED → CREDENTIAL_INPUT` 전이 + `broadcastRoomState`)
- `POST /api/sessions/:id/submissions` → `{ submissionId, scheduledAt }` (`CREDENTIAL_INPUT → QUEUED` 전이 + broadcast)
- `POST /api/submissions/:id/run-now` → 202 (`QUEUED → RUNNING` 전이 + broadcast · demo only · mock 모드 or `X-Demo-Confirm: yes` header 필요)
- `GET /api/submissions/:id` (디버그 전용 — UI 는 폴링하지 않는다. UI 갱신은 `room:state` socket 으로만)

**상태 전이 책임** — 모든 RoomStatus 전이는 `mgr.transitionStatus()` 한 메서드로만 일어난다. 전이 직후 3A 의 `broadcastRoomState(io, snap)` 유틸을 import 해 호출. 직접 `snap.status = ...` 로 쓰면 illegal transition 가드 우회 → 금지.

### 4B 와의 계약

- 4A 는 **`runSubmission(submissionId: string): Promise<WorkerResult>` 를 `src/server/worker/index.ts` 에서 import** 한다. Scheduler (B5) · run-now 엔드포인트 (B11) 양쪽에서 호출.
- 4A 는 **워커 내부 절대 건드리지 않는다** — 4B 가 워커 플로우를 통제. 로그인 재시도 · 셀렉터 fallback · Playwright 실행은 4B 의 책임.
- 4B 는 각 워커 단계 시작 시 `transitionStatus(RUNNING, { workerStep })` 를 호출해 4A 의 broadcast 경로로 흐르게 한다. `workerStep` 값 (`login` · `cardModal` · `formFill` · `approval`) 은 ResultView 가 InlineSpinner 레이블로 표시.
- 워커 결과는 `WorkerResult = { status: 'COMPLETED' | 'FAILED', erpRefNo?: string, errorLog?: string }`. 4A 는 이를 받아 최종 전이 (`RUNNING → COMPLETED` 또는 `RUNNING → FAILED`) + broadcast.

### RoomPage 5 case 추가 PR 타이밍

- 3B 가 `RoomPage.tsx` 의 3 case (PREPARING / PLAYING / FINISHED) 골격을 먼저 머지. 4A 는 **H+14 이후 3B RoomPage 가 안정된 뒤에만** 5 case (CREDENTIAL_INPUT / QUEUED / RUNNING / COMPLETED / FAILED) 추가 PR 을 연다.
- PR 범위는 `RoomPage.tsx` 의 스위치 case 추가 + 4A 소유 `CredentialForm` · `ResultView` 본문 import 만. 3B 공용 컴포넌트 수정 금지.

### DoD (H+22 기준, 스펙 §4.3 verbatim)

- [ ] B1 migration (submissions · credentials), B2 Vault round-trip (AES-256-GCM)
- [ ] B3 `POST /api/credentials` + `…/credential-input` + `…/submissions` → FINISHED → CREDENTIAL_INPUT → QUEUED 전이 + broadcast
- [ ] B4 SubmissionQueue 상태머신, B5 Scheduler (분당 · 다음 영업일 09:00 Asia/Seoul)
- [ ] `RoomPage` 에 CREDENTIAL_INPUT / QUEUED / RUNNING / COMPLETED / FAILED 5 case PR (3B 골격 위에 얹기)
- [ ] `CredentialForm` 본문 · `ResultView` 단계별 본문 (StatusBadge · InlineSpinner 사용)
- [ ] B12 게임훅 — `submissionHook.ts` 구현을 GameRunner outcome 에 연결
- [ ] B13 E2E mock 녹색 (`WORKER_MODE=mock` 으로 데모 시나리오 1회 성공)

### Claude Code 첫 세션 프롬프트 예시 (4A)

```
REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement tasks.

역할 재분배 설계: docs/superpowers/specs/2026-04-20-role-rebalance-design.md §1 의 "4A" 행 범위.
Plan B: docs/superpowers/plans/2026-04-19-erp-automation.md 의 Task B1~B5 + B11~B13 + Plan B UI (CredentialForm 본문, ResultView 의 QUEUED/RUNNING/COMPLETED/FAILED 단계) 만 수행.
파일 경로 소유: src/server/{vault,submissions,hooks}/** · src/server/routes/{credentials,submissions}.ts ·
src/web/components/{CredentialForm,ResultView}.tsx · tests/{db,vault,queue,scheduling,e2e-mock}.test.ts

제약:
- `src/server/worker/**` 는 4B 소유. 내부 절대 수정 금지. 워커는 `runSubmission(submissionId): Promise<WorkerResult>` 한 함수만 import.
- `src/web/pages/**` · `src/web/components/**` 중 `{CredentialForm,ResultView}.tsx` 외 파일은 3B 소유. 건드리지 말 것.
- `src/server/{index,app,config,io}.ts` · `src/server/{db,session,games}/**` 는 3A 소유. DB 스키마는 `submissions` + `credentials` 테이블만 추가, `sessions` 테이블 수정 금지.
- 모든 RoomStatus 전이는 `mgr.transitionStatus()` 만 사용 + 직후 `broadcastRoomState` 호출. 직접 `snap.status = ...` 금지.
- `RoomPage.tsx` 5 case 추가 PR 은 H+14 이후 3B RoomPage 골격이 안정된 뒤에만 열기.

공동 계약 세션(H+0~2)에서 4A 가 리뷰어로 protocol.ts 의 Plan B 필드(submissionId · scheduledAt · workerStep · erpRefNo · errorLog) + submissionHook.ts 시그니처를 확정하고, 3A 의 PR 에 OK 후 이 세션이 B1 부터 진입. 세부 목록은 dev4.md §공동 계약 세션 참조.

Task B1 부터 시작.

실행 원칙 (context 절약):
- 이 세션에서 **Task 한 개만** 완료하고 push 후 STOP.
- 해당 Task 의 `- [ ]` 체크박스를 `- [x]` 로 갱신해 같은 커밋에 포함.
- `docs/handoff/session-notes.md` 끝에 `[4A] Task BN 완료 — <1줄 요약>` 한 줄 덧붙임 (미해결 이슈 있으면 같이).
- 다음 Task 는 **새 Claude Code 세션 또는 `/clear`** 로 초기화 후 진행. 이어받는 세션은 plan 의 첫 번째 `- [ ]` 를 찾아 그 Task 만 수행.
```

---

## 세션 4B — Plan B Playwright 워커

### 필독 문서

- Plan B §Task 6~10 + §Task 14 (`docs/superpowers/plans/2026-04-19-erp-automation.md`)
- ERP Exploration 조사 결과 full (`docs/superpowers/specs/2026-04-19-erp-exploration-field-findings.md`) — 로그인 폼 · 카드내역 테이블 · 품의서 폼 셀렉터 · 상신 버튼 위치
- [`./README.md`](./README.md) · `docs/superpowers/specs/2026-04-20-role-rebalance-design.md`

### 파일 경로 소유권

`src/server/worker/**` (목업 HTML 포함) · `tests/{matcher,worker-mock}.test.ts` · `tests/fixtures/cardRows.json`

> **`src/web/**` 전부 · `src/server/{vault,submissions,hooks,routes}/**` · `src/server/{index,app,config,io}.ts` · `src/server/{db,session,games}/**` 는 모두 4B 의 범위 밖.** 건드리지 말 것.
>
> 목업 HTML 3 종 (`src/server/worker/mock/login.html` · `card.html` · `form.html`) 은 ERP Exploration 의 실 DOM 을 축약 재현 — 레이아웃 세부는 Plan B §Task 6 참조.

### 우선순위 · 개발 흐름

| 순서 | Task | 비고 |
|------|------|------|
| 1 | **B6** 워커 스캐폴딩 + 목업 HTML 3 종 + `WORKER_MODE` 토글 | 공동 계약 머지 직후 착수. `runSubmission` export 스텁 먼저 커밋해 4A 언블록 |
| 2 | **B7** 로그인 단계 (`workerStep='login'` + `transitionStatus(RUNNING, { workerStep })` 호출) | 목업 로그인 HTML 기반 integration 테스트 |
| 3 | **B8** 카드매칭 (`workerStep='cardModal'`) | `tests/fixtures/cardRows.json` 사용. `matcher.test.ts` 에서 단위 커버 |
| 4 | **B9** 품의서 폼채움 (`workerStep='formFill'`) | 필드 매핑은 ERP Exploration §폼 필드 섹션 참조 |
| 5 | **B10** 결재상신 (`workerStep='approval'`) | **mock 모드에서는 최종 [상신] 버튼 클릭 금지.** `ERP_CONFIRM_SUBMIT=1` + live 모드에서만 실제 클릭 |
| 6 | **B14** 실 ERP 라이브 리허설 | **사용자 본인(Dev 4) 동석 · H+22 이후**. 아래 §ERP 라이브 리허설 체크리스트 준수 |

### 4A 와의 계약

- **export 시그니처 고정:** `src/server/worker/index.ts` 에서 `runSubmission(submissionId: string): Promise<WorkerResult>` 를 export. `WorkerResult = { status: 'COMPLETED' | 'FAILED', erpRefNo?: string, errorLog?: string }`.
- 4A 는 Scheduler (B5) 와 `/run-now` 라우트 (B11) 에서 이 함수를 호출. 워커 진입점은 이 함수 하나뿐.
- **각 단계 시작 시 `transitionStatus(RUNNING, { workerStep })` 호출** — 4A 의 broadcast 경로로 흘러가 ResultView 가 InlineSpinner 레이블을 갱신. `workerStep` 값은 `login` · `cardModal` · `formFill` · `approval` 네 가지.
- 워커는 `snap.status` 를 직접 쓰지 않는다. 항상 `mgr.transitionStatus()` 경유 (illegal transition 가드 필수).

### Playwright 안전 규칙 (스펙 §6.5 verbatim)

1. **자격증명** — 사용자(매니저) 가 브라우저에 직접 타이핑. 코드·채팅에 하드코딩/로그 금지.
2. **쓰기 동작** — `WORKER_MODE=live` + `ERP_CONFIRM_SUBMIT=1` 동시 세팅 + 사용자 동석 확인 후에만 `[상신]`.
3. **Playwright `headless=false` 유지** — 무슨 일이 일어나는지 눈으로 확인 가능.
4. **B14 실행 주체는 Dev 4(사용자 본인) 만.** Dev 3 은 관측만.

### DoD (H+22 기준, 스펙 §4.4 verbatim)

- [x] B6 워커 스캐폴딩 + 목업 HTML 3종 + `WORKER_MODE` 토글
- [x] B7 로그인 (목업 HTML 기반 Playwright integration 테스트 녹색) · [ ] B8 카드매칭 · [ ] B9 폼채움 · [ ] B10 결재상신 (각 단계 시작 시 `transitionStatus(RUNNING, { workerStep })` 호출 → 4A broadcast)
- [ ] `runSubmission(submissionId: string): Promise<WorkerResult>` export (4A 가 import)
- [ ] 단위 테스트 (`matcher.test.ts` · `worker-mock.test.ts`) 녹색
- [ ] B14 실 ERP 라이브 리허설: 사용자 동석, 폼 채움까지 OK, `[상신]` 은 데모 당일 `ERP_CONFIRM_SUBMIT=1` + 수동 확인 후

### 긴급 차선책

- Playwright 가 실 ERP 에서 새 CAPTCHA·2FA 마주침 → Plan B §6.4 `FAILED_UNEXPECTED_UI` 로 분기 + **모킹 모드 데모**. 심사 슬라이드에서 "실서비스 구조·목업 재현"을 강조.
- 카드내역이 데모 당일 아직 반영 안됨 → 사전 저장된 `tests/fixtures/cardRows.json` 으로 목업 흐름 재생.
- 스케줄러가 못 돌 지경 → `POST /api/submissions/:id/run-now` 로 수동 트리거해 데모.

### Claude Code 첫 세션 프롬프트 예시 (4B)

```
REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement tasks.

역할 재분배 설계: docs/superpowers/specs/2026-04-20-role-rebalance-design.md §1 의 "4B" 행 범위.
Plan B: docs/superpowers/plans/2026-04-19-erp-automation.md 의 Task B6~B10 + B14 만 수행.
파일 경로 소유: src/server/worker/** (목업 HTML 포함) · tests/{matcher,worker-mock}.test.ts · tests/fixtures/cardRows.json

제약:
- `src/web/**` 전부 금지. `src/server/{vault,submissions,hooks,routes}/**` · `src/server/{index,app,config,io}.ts` · `src/server/{db,session,games}/**` 도 금지. 4A/3A 가 각각 소유.
- 워커 진입점: `src/server/worker/index.ts` 에서 `runSubmission(submissionId: string): Promise<WorkerResult>` 를 export. 4A 가 import 한다. 시그니처 변경 금지.
- 각 워커 단계(login · cardModal · formFill · approval) 시작 시 반드시 `transitionStatus(RUNNING, { workerStep })` 호출. 직접 `snap.status = ...` 금지.
- ERP 안전: mock 모드에서는 최종 [상신] 버튼 클릭 금지. B14 라이브는 사용자 본인 동석 + `WORKER_MODE=live` + `ERP_CONFIRM_SUBMIT=1` 동시 세팅 + 수동 확인 후에만.
- Playwright 는 `headless=false` 유지. 관측-only 세션은 마지막에 탭 수동 close.

선행: 공동 계약 세션(H+0~2)에서 protocol.ts 와 submissionHook.ts 시그니처가 main 에 머지된 뒤 이 세션을 기동. 세부 목록은 dev4.md §공동 계약 세션 참조.

Task B6 부터 시작 (스캐폴딩 + 목업 HTML 3 종 + `runSubmission` export 스텁을 먼저 커밋해 4A 언블록).

실행 원칙 (context 절약):
- 이 세션에서 **Task 한 개만** 완료하고 push 후 STOP.
- 해당 Task 의 `- [ ]` 체크박스를 `- [x]` 로 갱신해 같은 커밋에 포함.
- `docs/handoff/session-notes.md` 끝에 `[4B] Task BN 완료 — <1줄 요약>` 한 줄 덧붙임 (미해결 이슈 있으면 같이).
- 다음 Task 는 **새 Claude Code 세션 또는 `/clear`** 로 초기화 후 진행. 이어받는 세션은 plan 의 첫 번째 `- [ ]` 를 찾아 그 Task 만 수행.
```

---

## ERP 라이브 리허설 체크리스트 (B14)

B14 는 4B 세션의 마지막 Task 이지만, 실행 맥락이 mock Playwright 와 전혀 달라 별도 섹션으로 둔다. **실행 주체는 Dev 4 (사용자 본인) 만.** 3A · 3B 는 관측 금지 (자격증명 노출 방지).

### 전제 조건

- [ ] B6~B10 머지 완료 · mock 모드 E2E (B13) 녹색.
- [ ] H+22 이후 시점 · 사용자가 물리적으로 동석 · 노트북 화면을 직접 볼 수 있는 위치.
- [ ] `.env` 에 `WORKER_MODE=live` **AND** `ERP_CONFIRM_SUBMIT=1` 두 플래그 동시 세팅. 둘 중 하나라도 빠지면 최종 [상신] 버튼 스킵.
- [ ] Playwright `headless=false`. 창이 보이는지 육안 확인.

### 실행 절차

1. 사용자가 브라우저에 `erp.meissa.ai` 로그인 ID/PW 를 **직접 타이핑**. 코드·채팅에 하드코딩/로그 금지.
2. 워커가 로그인 성공 시점부터 카드매칭 → 폼채움까지 진행하는 것을 육안으로 관측.
3. 최종 [상신] 버튼 앞에서 워커 일시정지 · 사용자 화면 확인 · 사용자가 명시적 구두/타이핑 확인 후 click.
4. `erpRefNo` 수령 로그 확인.

### 사후 정리

- [ ] **관측-only 세션 (로그인만 하고 상신 스킵한 경우) 은 마지막에 Playwright 탭을 수동 close 로 롤백.** 자동 logout 에 의존하지 않고 브라우저 탭 자체를 닫아 세션 쿠키까지 폐기한다.
- [ ] 상신 성공한 경우 ERP 내 품의서 목록에서 `erpRefNo` 매칭 확인 후 데모용 스크린샷 1 장.
- [ ] `.env` 의 `ERP_CONFIRM_SUBMIT=1` 을 데모 종료 후 즉시 주석 처리 / 삭제. `.env` 가 `.gitignore` 에 포함돼 있는지 `git check-ignore -v .env` 로 검증 (`.gitignore:<line>:.env` 형태가 나와야 함). 추가로 `grep -R "ERP_CONFIRM_SUBMIT" .` 로 다른 config 파일에 플래그가 실수로 하드코딩되지 않았는지 점검.

### 실패 시

- 로그인 CAPTCHA·2FA 튀면 §긴급 차선책 의 `FAILED_UNEXPECTED_UI` 분기로 전환 · mock 모드로 데모.
- 카드내역 미반영 시 `tests/fixtures/cardRows.json` 재생으로 연출.
- 어떤 경우든 **세션이 실패해도 [상신] 은 실행하지 않는다** — 중복 상신 방지.

---

## 막혔을 때

- Plan A 엔진 관련 질문 (SessionManager · broadcast · DB sessions) → 3A.
- Plan A UI 관련 질문 (RoomPage 골격 · StatusBadge · InlineSpinner) → 3B.
- 4A ↔ 4B 간 `runSubmission` 시그니처 변경 필요 → 두 세션 사이 명시적 동기화 후에만. 기본은 공동 계약 시점에 고정된 상태 유지.
- 게임 HTML 수령 (Dev 1·2) → 4A · 4B 중 먼저 반응하는 세션이 `curl -F "game=@<name>.html" http://localhost:3000/api/games` 등록 → thread 에 ✅ 이모지.
- ERP 셀렉터 변경 감지 → ERP Exploration 문서 재확인 · 필요 시 사용자 본인이 `erp.meissa.ai` 접속해 DOM 확인 후 목업 HTML 과 matcher 갱신.
