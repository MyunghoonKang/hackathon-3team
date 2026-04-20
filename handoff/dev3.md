# Dev 3 — Plan A 풀스택 Brief (세션 3A + 3B)

> Dev 3 는 Claude Code 세션 2 개를 병렬 구동한다. **3A = Plan A 엔진**, **3B = Plan A UI**. Plan B UI (CredentialForm 본문, ResultView 의 QUEUED/RUNNING/COMPLETED/FAILED 단계) 는 **4A 가 소유**하므로 본 문서에서 다루지 않는다.

## 범위 요약

- **세션 3A — Plan A 엔진** — Task A1~A9, A16. 스캐폴딩 · `shared/protocol` · DB `sessions` · roomCode · SessionManager · GameRegistry · Upload API · GameRunner · Socket.io · 데모 스크립트.
- **세션 3B — Plan A UI** — Task A10~A13, A15. HomePage · LobbyView · GameView · RoomPage 골격 · ResultView FINISHED 단계 · 연출 (드럼롤 · 룸코드 복사 · 재연결 토스트).
- **범위 밖 (4A 소유):** `CredentialForm.tsx` 본문, `ResultView.tsx` 의 CREDENTIAL_INPUT / QUEUED / RUNNING / COMPLETED / FAILED 단계, `RoomPage.tsx` 의 해당 5 case 분기. Plan A UI (PREPARING / PLAYING / FINISHED) 만 3B 가 만든다.

공통 참조: [`./README.md`](./README.md) · [`./dev4.md`](./dev4.md) · `docs/superpowers/specs/2026-04-20-role-rebalance-design.md` · `docs/superpowers/plans/2026-04-19-game-platform.md` · `docs/design/project/Wireframes.html`.

---

## 공동 계약 세션 (H+0~2, Dev 4 와 동석 · 리드 = 3A)

Contract-First 로 독립 작업을 풀기 위해 **이 2h 안에 다음 7 개 산출물이 첫 커밋 + `main` 머지**되어야 한다. 3A 가 PR 리드, 4A 가 리뷰어로 `src/shared/protocol.ts` · `src/server/db/schema.ts` · `submissionHook.ts` 시그니처 OK 로그를 남긴다. 커밋 메시지: `feat(shared): lock contracts for A/B split`.

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

## 세션 3A — Plan A 엔진

### 필독 문서

- Plan A 전체 (`docs/superpowers/plans/2026-04-19-game-platform.md`)
- [`./README.md`](./README.md) — 팀 DAG · 타임라인 · ERP 안전 규칙
- `docs/superpowers/specs/2026-04-20-role-rebalance-design.md` — 본 재분배 설계 (3A 행 소유권)

### 파일 경로 소유권

`src/server/{index,app,config,io}.ts` · `src/server/{db,session,games}/**` · `src/server/routes/{sessions,games}.ts` · `src/shared/**` · `tests/{roomCode,manager,registry,runner,io}.test.ts` · `tests/shared/**`

> **`src/server/routes/` 는 3A·4A 공유 디렉터리.** 파일명으로 분리한다. 3A 소유는 `sessions.ts` · `games.ts` 만. `credentials.ts` · `submissions.ts` 는 **4A 소유이므로 건드리지 말 것.**
>
> `src/server/db/schema.ts` 는 3A 의 `sessions` + 4A 의 `submissions`·`credentials` 테이블이 공존. 3A 는 공동 계약 때 최초 커밋만 리드하고, 이후 4A 가 자기 테이블만 수정. 마이그레이션 번호는 순차.

### 우선순위 · 선행 토대 (다른 세션 언블록)

| 순서 | Task | 언블록 대상 |
|------|------|------------|
| 1 | **A1** 스캐폴딩 (Vite · tsconfig · package.json) | 3B · 4A · 4B 의 `npm run dev` / TS 기동 |
| 2 | **A2** `src/shared/protocol.ts` (9 RoomStatus · RoomStatePayload · ALLOWED_TRANSITIONS) — 공동 계약 세션에서 처리 | 3B 타입 import, 4A·4B import, Dev 1·2 는 meta 태그만 지키면 됨 |
| 3 | **A3** DB 스키마 · 마이그레이션 (`sessions` 테이블만) | 4A B1 이 extension 만 하면 됨 |
| 4 | **A4** roomCode (중복 회피) | — |
| 5 | **A5** SessionManager (ALLOWED_TRANSITIONS 표 + `transitionStatus` 메서드) | 3B HomePage/RoomPage 실 연동, 4A REST 라우트의 전이 호출 |
| 6 | **A6** GameRegistry · **A7** Upload API (admin 전용 · 사용자 UI 없음) | **Dev 1·2 언블록** — 운영자가 사전 등록 가능. A7 머지 직후 슬랙 thread 에 "admin upload OK" 알림. |
| 7 | **A8** GameRunner (서버 컴퍼레이터) | 4A B12 의 게임훅 결합 대상 |
| 8 | **A9** Socket.io 통합 (`broadcastRoomState` + 단일 `room:state` 채널) | **3B 실 소켓 연동, 4A broadcast 호출** — 머지 직후 슬랙에 "실 소켓 연결 가능" 알림. |
| 9 | **A16** 데모 스크립트 · 리허설 체크리스트 | H+14 이후 통합 리허설 |

**목표:** H+8 안에 A1~A9 완료 → 3B · 4A · 4B 완전 언블록.

### 4A · 4B 와의 계약

- **`src/server/hooks/submissionHook.ts`** — 공동 계약 세션에서 시그니처 고정: `onGameFinished(sessionId: string, loserId: string): Promise<void>`. 3A 는 GameRunner outcome 확정 직후 이 함수만 호출. 실 구현은 4A (B12) 가 교체.
- **REST 엔드포인트 (4A 소유 — 3A 는 호출 안 함, 3B 가 호출)**
  - `POST /api/sessions/:id/credential-input` → 204 (`FINISHED → CREDENTIAL_INPUT` 전이 + broadcast)
  - `POST /api/sessions/:id/submissions` → `{ submissionId, scheduledAt }` (`CREDENTIAL_INPUT → QUEUED` 전이 + broadcast)
  - `POST /api/submissions/:id/run-now` → 202 (`QUEUED → RUNNING` 전이 + broadcast · demo only · mock 모드 or `X-Demo-Confirm: yes` header 필요)
- **Socket.io 단일 채널** — 모든 상태 변화는 `room:state` 로 broadcast. 다른 이벤트명 추가 금지. 3A 의 `broadcastRoomState(io, snap)` 유틸을 4A 도 import 해 사용.
- **상태 전이 책임** — 모든 RoomStatus 전이는 `mgr.transitionStatus()` 한 메서드로만 일어난다. 전이 직후 `broadcastRoomState` 호출. 직접 `snap.status = ...` 로 쓰면 illegal transition 가드 우회 → 금지.

### Dev 1 · 2 와의 계약

- **Admin 등록 플로우:** 게임 HTML 수령 경로는 git 이 아니라 팀 DM 방 thread. Dev 4(4A 혹은 4B 어느 세션이든) 가 `curl -F "game=@<name>.html" http://localhost:3000/api/games` 또는 `cp <name>.html games/` 로 등록 → 해당 thread 에 `✅` 이모지로 완료 시그널. **사용자 UI 에서 업로드 금지** (GameUpload 컴포넌트 만들지 말 것).
- **meta 태그 요구:** 게임 HTML `<head>` 에 5 개 meta 필수 — `title`, `min-players`, `max-players`, `description`, `compare` (`"max"` | `"min"` 만).
- **422 에러 포맷:** meta 누락·잘못된 값 시 422 응답의 `errors` 필드에 누락 필드명을 배열로 명시 → Dev 4 가 thread 에 요약 전달해 Dev 1·2 가 수정본 재전달.
- 업로드 파일 용량 상한 256KB (multer).

### DoD (H+22 기준, 스펙 §4.1 verbatim)

- [ ] A1~A9 머지, 4대 노트북 E2E 성공 (방 생성 → 게임 → 패자 결정, 모두 `/room/XXXX` 한 URL)
- [ ] `SessionManager.transitionStatus` 가 9 RoomStatus ALLOWED_TRANSITIONS 강제 (illegal jump 차단)
- [ ] `broadcastRoomState` 단일 채널 동기화 (폴링 없음)
- [ ] GameRegistry · Upload API · GameRunner 단위 테스트 녹색
- [ ] A16 리허설 체크리스트 1회 실행 OK

### Claude Code 첫 세션 프롬프트 예시 (3A)

```
REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement tasks.

역할 재분배 설계: docs/superpowers/specs/2026-04-20-role-rebalance-design.md §1 의 "3A" 행 범위.
Plan A: docs/superpowers/plans/2026-04-19-game-platform.md 의 Task A1~A9 + A16 만 수행.
파일 경로 소유: src/server/{index,app,config,io}.ts · src/server/{db,session,games}/** ·
src/server/routes/{sessions,games}.ts · src/shared/** · tests/{roomCode,manager,registry,runner,io}.test.ts · tests/shared/**

제약:
- `src/shared/protocol.ts` 는 공동 계약 세션(Task A2 상응)에서 4A 와 합의한 타입을 유지. 추가 필드는 4A 에 사전 알림.
- `src/server/routes/` 디렉터리는 `sessions.ts`·`games.ts` 만 소유. `credentials.ts`·`submissions.ts` 는 4A 소유이므로 건드리지 말 것.
- Task A7 머지 직후 슬랙에 "admin upload OK" 알림 (Dev 1·2 언블록).
- Task A9 머지 직후 슬랙에 "실 소켓 연결 가능" 알림 (3B·4A 언블록).

공동 계약 세션(H+0~2, Dev 4 와 동석)을 3A 가 리드해 `src/shared/protocol.ts` · `src/server/db/schema.ts` · `.env.example` · `src/server/hooks/submissionHook.ts` 시그니처 등 7 개 산출물을 main 에 머지한다. 세부 목록은 dev3.md §공동 계약 세션 참조. 머지 완료 후 Task A1 스캐폴딩으로 진입.

실행 원칙 (context 절약):
- 이 세션에서 **Task 한 개만** 완료하고 push 후 STOP.
- 해당 Task 의 `- [ ]` 체크박스를 `- [x]` 로 갱신해 같은 커밋에 포함.
- `docs/handoff/session-notes.md` 끝에 `[3A] Task AN 완료 — <1줄 요약>` 한 줄 덧붙임 (미해결 이슈 있으면 같이).
- 다음 Task 는 **새 Claude Code 세션 또는 `/clear`** 로 초기화 후 진행. 이어받는 세션은 plan 의 첫 번째 `- [ ]` 를 찾아 그 Task 만 수행.
```

---

## 세션 3B — Plan A UI

### 필독 문서

- Plan A Task 10~15 (`docs/superpowers/plans/2026-04-19-game-platform.md`) — 특히 Task 13 의 RoomPage · ResultView 시그니처
- **UI 와이어프레임:** `docs/design/project/Wireframes.html` — 본인 시각 스펙. 7 화면 × 2 변주, 손글씨 메모. 변주 선택 재량 (작가 추천: HomePage B, ResultView A→B 순차 전환).
- [`./README.md`](./README.md) · `docs/superpowers/specs/2026-04-20-role-rebalance-design.md`

### 파일 경로 소유권

`src/web/pages/**` · `src/web/components/**` (단 `CredentialForm.tsx` · `ResultView.tsx` 제외) · `src/web/styles.css` · `src/web/socket.ts` · `tests/web/**`

> **`src/web/components/{CredentialForm,ResultView}.tsx` 는 3B 소유가 아니다 — 4A 가 소유한다.** 본 두 파일은 건드리지 말 것.
>
> **공동 계약 세션 산출물인 `src/web/styles.css` · `StatusBadge.tsx` · `InlineSpinner.tsx`** 는 공용 시그니처를 지킬 것. 확장만 OK, 삭제·rename 금지. 4A 가 RUNNING 단계에서 import 해 쓴다.

### 의존성

1. **공동 계약 머지 (H+2)** — 이 시점 이후 타입·CSS·StatusBadge·InlineSpinner 가 잠겨 3B 는 바로 착수.
2. **3A A1 머지 (H+2~3)** — Vite · tsconfig · `npm run dev` 기동. 그 전까지는 로컬에서 import 만 준비.
3. **3A A9 머지 (H+8~9)** — mock socket → 실 socket 1 줄 교체. 3A 가 슬랙에 "실 소켓 연결 가능" 알림 후 진행.

A9 머지 전까지는 **mock socket** 으로 UI 만 제작:

```ts
// src/web/socket.ts (초기 mock 버전)
export const socket = {
  on(evt, cb) { /* noop. 실제로는 'room:state' 만 듣는다 */ },
  emit(evt, data) { console.log('[mock]', evt, data); },
  disconnect() {},
};
```

A9 머지 후 실제 `io('/', …)` 로 교체 (1 줄 수정).

### 페이지 / 뷰 구성 · 우선순위

라우트는 `/` (HomePage) 와 `/room/:code` (RoomPage) **단 2 개**. RoomPage 는 `RoomStatus` 에 따라 내부 뷰를 스왑한다.

| 우선순위 | 컴포넌트 | 어느 RoomStatus | 핵심 기능 | 의존 |
|----------|----------|-----------------|----------|------|
| P0 | `HomePage` | (라우트 `/`) | 방 생성 · 방 참여 (이름 + 룸코드) | Session REST API (A8) |
| P0 | `RoomPage` | `/room/:code` 항상 마운트 | RoomStatus → 뷰 스왑 (3 case) | useSession (`room:state` 구독) |
| P0 | `LobbyView` | `PREPARING` | 참가자 목록 · 게임 선택 · 시작 | Socket(A9) + Games REST(A7) |
| P0 | `GameView` | `PLAYING` | iframe + 상단 플레이어 아바타 | GameFrame (A12) |
| P0 | `ResultView` (FINISHED 부분) | `FINISHED` | 패자 발표 서스펜스 · StatusBadge · `CredentialForm` 진입 CTA | Plan A Task 15 |

> **GameUpload 컴포넌트는 만들지 않는다.** 게임 등록은 운영자 admin 도구 전용. LobbyView 에는 `GameSelector` 만.
>
> `CredentialForm` 내부 (ID/PW 폼 본문) 와 ResultView 의 CREDENTIAL_INPUT / QUEUED / RUNNING / COMPLETED / FAILED 단계 본문은 **4A 가 별도 PR** 로 얹는다. 3B 는 FINISHED 단계에서 "CredentialForm 진입 CTA" 자리까지만 만들고 멈춘다.

### 개발 흐름 (권장 · 3B scope)

1. **H+0~2: 공동 계약 세션** — 3A 와 동석. styles.css · StatusBadge · InlineSpinner 시그니처 합의 후 머지.
2. **H+2~6: 디자인 시안 + HomePage (mock socket 기반)** — 5 개 화면 러프 레이아웃, 모두 한국어 텍스트:
   1) HomePage  2) LobbyView (PREPARING)  3) GameView (PLAYING)  4) ResultView – FINISHED (패자 발표 서스펜스)  5) 재연결 토스트 · 에러 토스트 공용 스타일
3. **H+6~10: LobbyView + GameView + RoomPage 골격** — RoomStatus 스위치문 3 case (PREPARING / PLAYING / FINISHED). 사전 등록된 게임 목록은 `GET /api/games` 1 회 페치 (마운트 시점).
4. **H+10~14: ResultView FINISHED 단계** — 패자 발표 연출 (iframe 브리지는 Task A12 참고). StatusBadge 로 FINISHED 라벨 표시. CredentialForm 자리는 자리표시만.
5. **H+14~18: 폴리싱 · 사운드 · 모션** — A15 드럼롤 · 룸 코드 복사 버튼 · 재연결 토스트. A9 머지 후 mock → 실 socket 교체.
6. **H+18~22: 리허설 · 버그 수정**
7. **H+22~24: 데모 대응**

> 이 흐름은 **3B 만 다룬다.** Plan B UI (CredentialForm 본문, ResultView QUEUED/RUNNING/COMPLETED/FAILED) 는 4A 가 H+10~14 에 별도 트랙으로 작업하고, H+14 이후 `RoomPage` 5 case PR 을 3B 골격 위에 얹는다.

### 주의 사항 (중요)

- **`RoomPage.tsx` 는 3 case 만 구현한다 — PREPARING / PLAYING / FINISHED.** 나머지 5 case (CREDENTIAL_INPUT / QUEUED / RUNNING / COMPLETED / FAILED) 는 **4A 가 H+14 이후 별도 PR 로 추가**한다. 스위치 구조는 **확장에 열려 있어야 한다** — 예: `switch (status) { case 'PREPARING': …; case 'PLAYING': …; case 'FINISHED': …; default: return null; }` 형태로 두고, 4A 가 case 를 끼워 넣을 수 있도록. fallthrough · 암묵적 매칭 금지.
- **`CredentialForm.tsx` · `ResultView.tsx` 는 4A 소유.** 파일 생성·수정 금지. 3B 가 FINISHED 본문에서 ResultView 를 렌더할 때는 4A 가 공동 계약 후 스텁으로 먼저 커밋한 파일을 import 만 한다.
- 공용 파일 `styles.css` · `StatusBadge.tsx` · `InlineSpinner.tsx` — **확장만 OK. 삭제·rename 금지.** CSS variable 추가는 자유.
- **디자인 시스템 과설계 금지.** 단일 `styles.css` + CSS 변수 수준. shadcn · Tailwind 설치 비용 대비 효용 애매 → 생략 권장.
- **반응형 제한:** 데모는 노트북 4 대 — 모바일 미지원 OK. 해상도 1280~1920 에서만 안 깨지면 충분.
- **접근성:** 최소한의 label · aria-live 만 유지 (심사 슬라이드에 한 줄).

### 디자인 방향 제안 (본인 재량)

- **톤:** 해커톤이므로 "재미있지만 장난처럼 안 보이게". 다크 테마 + 액센트 1 색 (라임 · 네온 핑크 · 오렌지 중 택 1).
- **타이포:** 한글 Pretendard, 영문·숫자 Inter 혹은 JetBrains Mono (카운트다운·숫자).
- **모션:** 결과 페이지 패자 발표 **0.8~1.2 초 서스펜스 → 확정.** Framer Motion 허용. 단 번들 용량 >200KB 되면 회피.
- **사운드:** 결과 발표 시 "뚜둥" 효과음 권장 (`data:audio/wav;base64,…` 인라인 가능).

### 공유 상태 · 네이밍 규칙

- **전달 경로:** 3A ↔ 3B 는 **git 기반** (브랜치 · 머지 · pull). Dev 1·2 게임 HTML 은 팀 DM thread 로 유통되지만 **3B 는 슬랙 thread 를 직접 건드리지 않는다** — `GET /api/games` 응답으로만 접근.
- 모든 API 요청은 `fetch('/api/...')` — Vite proxy 가 3000 으로 전달.
- 소켓 이벤트는 단일 채널 `room:state` 만. 페이로드는 `RoomStatePayload`. 다른 이벤트명 (`session:update` 등) 사용 금지.
- 컴포넌트 파일명: `PascalCase.tsx`. 페이지는 `src/web/pages/XxxPage.tsx` (HomePage · RoomPage 단 2 개), 공용 뷰·컴포넌트는 `src/web/components/Xxx.tsx`.
- 스타일: 글로벌 `src/web/styles.css` + 필요 시 `XxxView.module.css` (CSS modules).

### 로컬 실행 방법

```bash
# 3A 의 scaffold 수령 = 팀 DM 방에서 "scaffold merged" 통지 후 git pull
git pull origin main
npm install
npm run dev      # 서버(3000) + vite(5173) 동시 기동
# 브라우저에서 http://localhost:5173
```

### DoD (H+22 기준, 스펙 §4.2 verbatim)

- [ ] HomePage · LobbyView · GameView · ResultView **FINISHED 단계까지** 렌더
- [ ] `StatusBadge` · `InlineSpinner` 공용 계약대로 구현
- [ ] `RoomPage` 스위치 3 case (PREPARING / PLAYING / FINISHED) + 4A 의 case 추가 PR 수용 가능한 구조
- [ ] A15 연출 (드럼롤 · 룸코드 복사 · 재연결 토스트)
- [ ] mock socket → 실 소켓 1줄 교체 검증 (A9 머지 후)

### Claude Code 첫 세션 프롬프트 예시 (3B)

```
REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement tasks.

역할 재분배 설계: docs/superpowers/specs/2026-04-20-role-rebalance-design.md §1 의 "3B" 행 범위.
Plan A: docs/superpowers/plans/2026-04-19-game-platform.md 의 Task A10~A13 + A15 만 수행.
파일 경로 소유: src/web/pages/** · src/web/components/** (단 CredentialForm.tsx · ResultView.tsx 제외) ·
src/web/styles.css · src/web/socket.ts · tests/web/**

의존성:
- 공동 계약 세션 머지 후 착수 (StatusBadge · InlineSpinner · styles.css 시그니처 고정 필요).
- 3A A1 머지 후 `npm run dev` 기동 가능.
- 3A A9 머지 후 mock socket → 실 socket 1 줄 교체 (A9 머지 알림 확인).

제약:
- `RoomPage.tsx` 는 PREPARING / PLAYING / FINISHED 3 case 만 구현. 4A 가 H+14 이후 5 case 추가 PR 을 별도로 연다. 스위치 구조는 확장에 열려 있어야 한다 (암묵적 fallthrough 금지).
- `src/web/components/CredentialForm.tsx` · `ResultView.tsx` 는 4A 소유. 건드리지 말 것.
- 공동 계약 세션 산출물인 `src/web/styles.css` · `StatusBadge.tsx` · `InlineSpinner.tsx` 의 공용 시그니처를 지킬 것. 확장만 OK, 삭제·rename 금지.
- 소켓 이벤트는 단일 채널 `room:state` 만 사용. 폴링 코드 작성 금지.

선행: 공동 계약 세션(H+0~2)에서 3A·4A 가 `src/web/styles.css` · `StatusBadge.tsx` · `InlineSpinner.tsx` 공용 시그니처를 확정해 main 에 머지한 뒤 이 세션을 기동한다. 세부 목록은 dev3.md §공동 계약 세션 참조.

Task A10 HomePage 부터 시작 (mock socket 기반).

실행 원칙 (context 절약):
- 이 세션에서 **Task 한 개만** 완료하고 push 후 STOP.
- 해당 Task 의 `- [ ]` 체크박스를 `- [x]` 로 갱신해 같은 커밋에 포함.
- `docs/handoff/session-notes.md` 끝에 `[3B] Task AN 완료 — <1줄 요약>` 한 줄 덧붙임 (미해결 이슈 있으면 같이).
- 다음 Task 는 **새 Claude Code 세션 또는 `/clear`** 로 초기화 후 진행. 이어받는 세션은 plan 의 첫 번째 `- [ ]` 를 찾아 그 Task 만 수행.
```

---

## 막혔을 때

- API 스펙 애매 → 3A (Plan A 엔드포인트) 혹은 4A (Plan B 엔드포인트) 에게 즉시 슬랙 · 구두.
- 사전 등록한 게임이 `GameSelector` 에 안 보임 → `GET /api/games` 응답 + 게임 HTML 의 meta 태그 (게임팀 문제) 확인. UI 에서 업로드하는 경로는 없음.
- 소켓 연결 끊김 연출 → Plan A Task 15 재연결 토스트 참고.
- ResultView 가 갱신 안 됨 → `room:state` 이벤트 페이로드 확인 (브라우저 devtools Network → WS). 폴링 코드를 작성하고 있다면 즉시 제거.
- SessionManager illegal transition 오류 → 3A 의 ALLOWED_TRANSITIONS 표 확인. `snap.status = ...` 직접 할당 금지 — 항상 `mgr.transitionStatus()` 경유.
- **Plan B UI 관련 문제 → Dev 4 (4A) 에게 문의** (CredentialForm, ResultView QUEUED/RUNNING/COMPLETED/FAILED 는 4A 소유).
