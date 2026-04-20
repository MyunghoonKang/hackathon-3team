# Handoff 재작성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 역할 재분배 설계(`docs/superpowers/specs/2026-04-20-role-rebalance-design.md`)를 반영해 `docs/handoff/` 하위 문서를 **4 세션 병렬 (3A/3B/4A/4B)** 기준으로 재작성한다. 해커톤 시작 전 팀 4명이 브리프만 읽고 즉시 Claude Code 세션을 띄울 수 있어야 한다.

**Architecture:** 기존 3 파일 구조(`README.md` + `dev3-ui.md` + `dev4-engine.md` + `dev1-2-game-cowork.md`) → 새 3 파일 구조(`README.md` + `dev3.md` + `dev4.md` + `dev1-2-game-cowork.md`) 로 이행. `dev3-ui.md`·`dev4-engine.md` 는 삭제. 각 브리프는 세션 2개에 대한 프롬프트·범위·DoD·블로커를 한 문서 안에 포함.

**Tech Stack:** Markdown 문서. Plan A/B 기존 Task 정의 유지(번호·파일 경로 그대로). 본 플랜이 바꾸는 것은 **누가·어느 세션에서·언제** 만.

---

## 참고 스펙 & 사전 조건

- **설계:** `docs/superpowers/specs/2026-04-20-role-rebalance-design.md` — 본 플랜의 **단일 진실 소스**. Task 안에서 섹션 번호(§1~§8)로 참조.
- **Plan A 유지:** `docs/superpowers/plans/2026-04-19-game-platform.md` (Task A1~A16).
- **Plan B 유지:** `docs/superpowers/plans/2026-04-19-erp-automation.md` (Task B1~B14).
- **UI 시각 스펙:** `docs/design/project/Wireframes.html`.
- **ERP 탐색 결과:** `docs/superpowers/specs/2026-04-19-erp-exploration-field-findings.md`.

## 파일 구조 (after)

```
docs/handoff/
├── README.md                         # [수정] 팀 index · 의존 DAG · 타임라인 · 동기화 · ERP 안전
├── dev3.md                           # [신규] Plan A 풀스택 (세션 3A 엔진 + 3B UI)
├── dev4.md                           # [신규] Plan B 풀스택 (세션 4A 데이터·API·UI + 4B Playwright)
├── dev1-2-game-cowork.md             # [수정] 수령자 표현 갱신
├── games-starter-template.html       # [유지]
└── games-test-harness.html           # [유지]

# 삭제 대상
docs/handoff/dev3-ui.md               # 내용은 dev3.md 로 흡수
docs/handoff/dev4-engine.md           # 내용은 dev4.md 로 흡수
```

---

## Task 1: `docs/handoff/README.md` 재작성

**Files:**
- Modify: `docs/handoff/README.md`

현 README 를 새 4 세션 구조로 재작성. 다음 섹션 **모두 포함**:

1. **Index 표** — 행을 `Dev 1·2 (Cowork)` / `Dev 3 세션 3A·3B (Claude Code)` / `Dev 4 세션 4A·4B (Claude Code)` 로 구성. `dev3-ui.md`·`dev4-engine.md` 링크 제거, `dev3.md`·`dev4.md` 로 대체.
2. **공통 참조** — 기존 링크 유지 + `docs/superpowers/specs/2026-04-20-role-rebalance-design.md` 추가.
3. **의존 DAG** — 스펙 §5 "블로커 해제 시점" 표를 시각화한 DAG 로 교체. 현 README 의 기존 DAG는 삭제.
4. **타임라인** — 스펙 §3 표를 그대로 복사 (Dev 4 단일 컬럼 → 4A·4B 분리, Dev 3 단일 컬럼 → 3A·3B 분리).
5. **동기화 포인트** — 스펙 §6.4 표를 그대로 복사 (H+2/6/10/14/18/22 6개).
6. **저장소 · 전달 규칙** — 현 README §"저장소 · 전달 규칙" 을 유지하되 다음 수정:
   - "Dev 3 (프론트), Dev 4 (엔진)" → "Dev 3 (Plan A), Dev 4 (Plan B)"
   - 브랜치 네이밍 예: `feat/a-<topic>` · `feat/ui-<topic>` · `feat/b-api-<topic>` · `feat/b-worker-<topic>` (스펙 §6.1)
   - 공용 파일 운영 규칙 섹션 추가: 스펙 §6.3 표 복사.
7. **환경변수** — 현 블록 유지 (변화 없음).
8. **ERP 안전 규칙** — 현 4개 항목 유지, "Plan B Task 6 이후" 문구를 "세션 4B 의 B14 실행 시" 로 교체 (스펙 §6.5).

- [ ] **Step 1: 현 README 읽고 보존할 섹션 확인**

Run: `cat docs/handoff/README.md`

보존 대상: §"환경변수", §"ERP 안전 규칙" 본문, §"저장소 · 전달 규칙" 첫 단락.

- [ ] **Step 2: 새 README 전문 작성**

파일 전체를 다음 구조로 덮어쓴다. 각 섹션의 세부 표·DAG 는 스펙에서 복사.

```markdown
# 팀 킥오프 · Handoff Index

24시간 해커톤 PoC — **식후 벌칙게임 + 더존 아마란스 ERP 품의서 자동 상신**. 4인 팀, Claude Code 세션 4개 + Claude Cowork 를 병렬 가동.

## 각자 읽을 문서

| 담당 | 도구 | 세션 | 문서 |
|------|------|------|------|
| Dev 1, 2 | Claude Cowork | — | [`dev1-2-game-cowork.md`](./dev1-2-game-cowork.md) · [`games-starter-template.html`](./games-starter-template.html) · [`games-test-harness.html`](./games-test-harness.html) |
| Dev 3 | Claude Code × 2 | 3A (엔진) · 3B (UI) | [`dev3.md`](./dev3.md) |
| Dev 4 | Claude Code × 2 | 4A (데이터·API·UI) · 4B (Playwright) | [`dev4.md`](./dev4.md) |

## 공통 참조

- **역할 재분배 설계 (이 구조의 원천):** `docs/superpowers/specs/2026-04-20-role-rebalance-design.md`
- 통합 설계: `docs/superpowers/specs/2026-04-19-erp-proposal-game-automation-design.md`
- Plan A (게임 플랫폼): `docs/superpowers/plans/2026-04-19-game-platform.md`
- Plan B (ERP 자동화): `docs/superpowers/plans/2026-04-19-erp-automation.md`
- ERP Exploration: `docs/superpowers/specs/2026-04-19-erp-exploration-field-findings.md`
- UI 와이어프레임: `docs/design/project/Wireframes.html`

## 의존성 DAG

<스펙 §5 표 내용을 DAG 텍스트로 시각화 — 본 플랜 Task 1 Step 2 의 "DAG 복사 블록" 참조>

## 타임라인 (24h)

<스펙 §3 표 그대로 복사. 컬럼: 시각 | 3A | 3B | 4A | 4B | Dev 1·2>

## 저장소 · 전달 규칙

<현 README §"저장소·전달 규칙" 본문 유지 + 브랜치 네이밍 업데이트 + 스펙 §6.3 공용 파일 운영 규칙 표 추가>

## 동기화 포인트

<스펙 §6.4 표 그대로 복사: H+2 / H+6 / H+10 / H+14 / H+18 / H+22>

## 환경변수

<현 README §"환경변수" 블록 유지>

## ERP 안전 규칙 (필독 — 세션 4B B14 실행 시)

<스펙 §6.5 네 항목 그대로>
```

**DAG 복사 블록 (스펙 §5 를 시각화):**

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

- [ ] **Step 3: diff 확인**

Run: `git diff docs/handoff/README.md`
Expected: 기존 DAG·타임라인 블록이 사라지고 새 4 세션 구조로 교체됨. "Dev 4" 단일 컬럼 없음.

- [ ] **Step 4: 링크 유효성 체크**

Run: `grep -oE "\[.+?\]\([^)]+\)" docs/handoff/README.md | grep -oE "\(\./[^)]+\)"`
Expected: `./dev1-2-game-cowork.md`·`./dev3.md`·`./dev4.md`·`./games-*.html` 만 등장. `./dev3-ui.md`·`./dev4-engine.md` 없음.

- [ ] **Step 5: 커밋**

```bash
git add docs/handoff/README.md
git commit -m "docs(handoff): rewrite README for 4-session parallel (3A/3B/4A/4B)

- Team index now references dev3.md/dev4.md (session-aware briefs)
- DAG and timeline redrawn for common-contract → 4-session split
- Branch naming and common-file rules from role-rebalance spec
"
```

---

## Task 2: `docs/handoff/dev3.md` 신규 작성

**Files:**
- Create: `docs/handoff/dev3.md`
- (아직 삭제 안 함: `docs/handoff/dev3-ui.md` — Task 5 에서 삭제)

Plan A 풀스택 브리프. 세션 3A·3B 둘 다 커버. 구조:

1. **범위 요약** — 3A(Task A1~A9, A16) + 3B(Task A10~A13, A15). "Plan B UI 는 4A 소유" 명시.
2. **공동 계약 세션 (H+0~2, Dev 4 와 동석)** — 스펙 §2.1 산출물 7개를 그대로 나열. 리더는 3A.
3. **세션 3A — Plan A 엔진**
   - 필독 문서: Plan A 전체·공통 참조
   - 파일 경로 소유권 (스펙 §1 의 3A 행 그대로)
   - 우선순위/선행 토대 (현 dev4-engine.md §"우선순위 · 선행 토대" 내용을 3A 기준으로 재작성: A1→A2→A3→A4→A5→A6·A7→A8→A9)
   - Dev 4 (4A·4B) 와의 계약: `submissionHook.ts` 시그니처·REST 엔드포인트·Socket.io 이벤트명
   - Dev 1·2 와의 계약: admin 등록 플로우·meta 태그·422 응답
   - DoD (스펙 §4.1 그대로)
   - Claude Code 첫 세션 프롬프트 예시
4. **세션 3B — Plan A UI**
   - 필독 문서: Plan A Task 10~15·Wireframes.html
   - 파일 경로 소유권 (스펙 §1 의 3B 행)
   - 의존성 (3A A1 머지·A9 머지·공동 계약)
   - 개발 흐름 (현 dev3-ui.md §"개발 흐름" 을 3B 범위로 축소 — Plan B UI 항목 제거)
   - 주의 사항: `RoomPage.tsx` 는 3 case 만 (PREPARING/PLAYING/FINISHED), 4A 가 5 case 추가 PR 을 H+14 이후 열도록 구조 유지
   - 디자인 방향 (현 dev3-ui.md §"디자인 방향 제안" 유지)
   - DoD (스펙 §4.2 그대로)
   - Claude Code 첫 세션 프롬프트 예시
5. **막혔을 때** — 현 dev3-ui.md §"막혔을 때" 유지 + "Plan B UI 관련 → Dev 4 (4A)" 추가

**각 세션의 "첫 프롬프트 예시" 블록**

```markdown
### Claude Code 첫 세션 프롬프트 (3A)

\`\`\`
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

Task A1 스캐폴딩부터 시작. 각 커밋 후 멈춰서 결과를 보고해라.
\`\`\`
```

3B 세션 프롬프트도 비슷한 스타일로 작성 (범위만 교체).

- [ ] **Step 1: 현 dev3-ui.md 섹션 중 dev3.md 로 가져올 것 고르기**

Run: `cat docs/handoff/dev3-ui.md`

가져올 부분: §"디자인 방향 제안", §"주의 · 해커톤 축약", §"개발 흐름" (3B 범위로 축소), §"로컬 실행 방법", §"공유 상태·네이밍 규칙", §"막혔을 때".
버릴 부분: Plan B UI 관련 항목, 페이지/뷰 표 중 5~7행(CREDENTIAL_INPUT 이후).

- [ ] **Step 2: dev3.md 전문 작성**

위 Task 2 본문에 정의한 5 섹션 구조로 작성. 총 150~250 줄 예상.

- [ ] **Step 3: 링크 유효성 & 참조 일관성**

Run:
```
grep -oE "(docs/|\./)[A-Za-z0-9/_.-]+\.md" docs/handoff/dev3.md | sort -u
```

Expected: `./dev4.md`·`./README.md`·`docs/superpowers/plans/2026-04-19-game-platform.md`·`docs/superpowers/specs/2026-04-20-role-rebalance-design.md`·`docs/design/project/Wireframes.html` 등장. `./dev3-ui.md`·`./dev4-engine.md` 없음.

- [ ] **Step 4: spec 일관성 체크**

스펙 §4.1·§4.2·§1 의 3A·3B 파일 소유권이 dev3.md 본문과 **일치** 해야 함. 특히:
- `src/server/routes/` 디렉터리의 파일명 분리(`sessions,games` vs `credentials,submissions`)
- `src/web/components/{CredentialForm,ResultView}.tsx` 가 3B 소유에서 **제외** 됨을 명시
- RoomPage 3 case 원칙

- [ ] **Step 5: 커밋**

```bash
git add docs/handoff/dev3.md
git commit -m "docs(handoff): add dev3.md — Plan A full-stack brief (sessions 3A + 3B)"
```

---

## Task 3: `docs/handoff/dev4.md` 신규 작성

**Files:**
- Create: `docs/handoff/dev4.md`

Plan B 풀스택 브리프. 세션 4A·4B 둘 다 커버. 구조:

1. **범위 요약** — 4A(Plan B Task 1~5, 11~13 + Plan B UI) + 4B(Task 6~10, 14). "Dev 4 는 사용자 본인(메이사 소속, 더존 아마란스 접근 권한 보유)" 명시 — B14 라이브 실행 주체.
2. **공동 계약 세션 (H+0~2, Dev 3 와 동석)** — 스펙 §2.1 산출물. 리뷰어 역할이 4A, 특히 `submissionHook.ts` 시그니처·protocol 의 Plan B 필드(submissionId/scheduledAt/workerStep/erpRefNo/errorLog) 확정 담당.
3. **세션 4A — Plan B 데이터·API·UI**
   - 필독 문서: Plan B 전체·ERP Exploration·Wireframes §5~7
   - 파일 경로 소유권 (스펙 §1 의 4A 행)
   - 우선순위: B1·B2(독립) → B3·B4 → B5 → B11·B12 → B13 + Plan B UI (B3 폼 · B11 UI)
   - 3A 와의 계약 (스펙 §2.1 이후 실제 API 엔드포인트)
   - 4B 와의 계약: `runSubmission(submissionId: string): Promise<WorkerResult>` import 만. 워커 내부 변경은 4B 자유.
   - RoomPage 5 case 추가 PR 타이밍 (H+14 이후 3B 가 안정된 뒤)
   - DoD (스펙 §4.3 그대로)
   - Claude Code 첫 세션 프롬프트 예시
4. **세션 4B — Plan B Playwright 워커**
   - 필독 문서: Plan B §Task 6~10, §Task 14, ERP Exploration 전체
   - 파일 경로 소유권 (스펙 §1 의 4B 행)
   - 우선순위: B6(스캐폴딩 + 목업 HTML) → B7 → B8 → B9 → B10 → B14
   - 4A 와의 계약: `runSubmission` export 시그니처·각 step 에서 `transitionStatus(RUNNING, { workerStep })` 호출 (4A 의 broadcast 에 의존)
   - Playwright 안전 규칙 (스펙 §6.5)
   - DoD (스펙 §4.4 그대로)
   - 긴급 차선책 (현 dev4-engine.md §"긴급 차선책" 유지)
   - Claude Code 첫 세션 프롬프트 예시
5. **ERP 라이브 리허설 체크리스트 (B14)** — 사용자 동석 필수. `WORKER_MODE=live` + `ERP_CONFIRM_SUBMIT=1` 두 플래그 동시 세팅 조건. 관측만 하는 세션에서는 마지막에 탭 수동 close (스펙 §6.5).

- [ ] **Step 1: 현 dev4-engine.md 섹션 중 dev4.md 로 가져올 것 고르기**

Run: `cat docs/handoff/dev4-engine.md`

가져올 부분: §"실행 방식 (권장)", §"우선순위 · 선행 토대" (재작성), §"환경변수 초기 세팅", §"ERP 자동화 안전 규칙", §"Dev 3 와의 계약", §"Dev 1, 2 와의 계약", §"유닛 테스트 커버리지 목표", §"긴급 차선책".

- [ ] **Step 2: dev4.md 전문 작성**

위 Task 3 본문 5 섹션 구조. 총 200~300 줄 예상.

- [ ] **Step 3: 프롬프트 예시에 경로 충돌 방지 조항 포함**

각 세션 프롬프트에 다음 문구 필수:
```
경로 소유 외 파일 수정 금지: 4A 는 src/server/worker/** 를 건드리지 않는다 (4B 소유).
                           4B 는 src/web/**·src/server/{vault,submissions,hooks,routes}/** 를 건드리지 않는다.
shared/protocol.ts 에 필드 추가가 필요하면 3A 에 먼저 슬랙으로 알리고 PR.
```

- [ ] **Step 4: spec · Plan B 일관성 체크**

Run:
```
grep -E "B[0-9]+" docs/handoff/dev4.md | sort -u
```

Expected: B1~B14 모두 어느 세션(4A or 4B)에 속하는지 명시됨. 누락된 Task 없음.

스펙 §1·§4.3·§4.4·§6.5 일치 확인.

- [ ] **Step 5: 커밋**

```bash
git add docs/handoff/dev4.md
git commit -m "docs(handoff): add dev4.md — Plan B full-stack brief (sessions 4A + 4B)"
```

---

## Task 4: `docs/handoff/dev1-2-game-cowork.md` 경미 수정

**Files:**
- Modify: `docs/handoff/dev1-2-game-cowork.md`

Dev 1·2 범위 자체는 변경 없음. 수정 포인트:

1. "운영자(Dev 4)" → "운영자(Dev 4 의 4A 또는 4B 어느 세션이든)" — 4A·4B 모두 admin curl 등록 가능.
2. 현 문서 어딘가에 `dev3-ui.md`·`dev4-engine.md` 참조가 있으면 `dev3.md`·`dev4.md` 로 교체.
3. 역할 재분배 설계 참조 추가 (문서 상단 "공통 참조" 블록이 있다면).

- [ ] **Step 1: 현 파일에서 변경 대상 위치 찾기**

Run:
```
grep -n "Dev 4" docs/handoff/dev1-2-game-cowork.md
grep -n "dev3-ui\|dev4-engine" docs/handoff/dev1-2-game-cowork.md
```

- [ ] **Step 2: 찾은 위치만 미니멀 수정**

Edit 로 각 match 에 대해 정확한 문자열 교체.

- [ ] **Step 3: diff 확인**

Run: `git diff docs/handoff/dev1-2-game-cowork.md`
Expected: 3~5줄 수정만. 게임 계약·postMessage 프로토콜·meta 태그 등 본체 변경 없음.

- [ ] **Step 4: 커밋**

```bash
git add docs/handoff/dev1-2-game-cowork.md
git commit -m "docs(handoff): note that either 4A or 4B session can admin-register games"
```

---

## Task 5: 구식 브리프 파일 삭제

**Files:**
- Delete: `docs/handoff/dev3-ui.md`
- Delete: `docs/handoff/dev4-engine.md`

내용은 `dev3.md`·`dev4.md` 로 흡수되었으므로 git history 에서 참조 가능. 24h PoC — redirect 파일 유지는 불필요.

- [ ] **Step 1: 어느 문서에서도 두 파일을 참조하지 않는지 확인**

Run:
```
grep -rn "dev3-ui\|dev4-engine" docs/
```

Expected: 결과 0건. 결과가 있으면 해당 파일을 `dev3.md`·`dev4.md` 로 수정 후 다시 확인.

- [ ] **Step 2: 파일 삭제**

Run:
```
git rm docs/handoff/dev3-ui.md docs/handoff/dev4-engine.md
```

- [ ] **Step 3: 커밋**

```bash
git commit -m "docs(handoff): remove superseded dev3-ui.md / dev4-engine.md (folded into dev3.md / dev4.md)"
```

---

## Task 6: 최종 검증 (mental walkthrough)

**Files:** — (검증만, 수정 없음)

4 가지 시나리오를 "브리프만 읽고 행동 가능한가" 기준으로 검증.

- [ ] **Step 1: Dev 3 3A 세션 시작 시뮬레이션**

Read: `docs/handoff/README.md` + `docs/handoff/dev3.md`

확인:
- 3A 세션이 어떤 Claude Code 프롬프트로 시작되는가 → 프롬프트 블록 존재 ✓
- Task A1 부터 어디까지 하나 → A1~A9 + A16 명시 ✓
- 어느 파일을 건드리면 안 되는가 → 4A·4B·3B 소유 경로 명시 ✓
- 언제 슬랙에 알려야 하나 → A7·A9 머지 직후 ✓
- 공동 계약 세션에서 해야 할 일 → §2.1 산출물 7개 명시 ✓

- [ ] **Step 2: Dev 4 4B 세션 시작 시뮬레이션**

Read: `docs/handoff/dev4.md` (세션 4B 섹션)

확인:
- 4B 가 건드리는 경로 → `src/server/worker/**`·목업 HTML·matcher/worker-mock 테스트 ✓
- `runSubmission` 시그니처 명시 ✓
- B14 실 ERP 리허설 절차 (WORKER_MODE=live · ERP_CONFIRM_SUBMIT=1 · 사용자 동석) ✓

- [ ] **Step 3: 4 세션 동시 가동 시 파일 충돌 가능성 점검**

스펙 §1 소유권 표와 각 dev*.md 프롬프트의 "경로 외 수정 금지" 조항이 일치하는지 확인. 특히:
- `src/server/routes/` 디렉터리 공유: 파일명 분리 명시되어 있는가? ✓
- `src/server/db/schema.ts` 공동 편집 규칙(3A 는 sessions, 4A 는 submissions·credentials): dev3.md·dev4.md 양쪽에 명시되어 있는가? ✓
- `src/web/pages/RoomPage.tsx` 편집 순서(3B 3 case → 4A 5 case PR 별도): 명시되어 있는가? ✓

- [ ] **Step 4: Dev 1·2 Cowork 시나리오**

Read: `docs/handoff/dev1-2-game-cowork.md`

확인:
- 운영자에게 HTML 전달 시 누가 받는지 명확 (4A or 4B 어느 쪽이든 OK) ✓
- meta 태그 · postMessage 계약은 변화 없음 ✓

- [ ] **Step 5: 누락 Task 확인**

Run:
```
grep -cE "A[0-9]+" docs/handoff/dev3.md
grep -cE "B[0-9]+" docs/handoff/dev4.md
```

Expected:
- dev3.md 에 A1~A16 중 3A·3B 담당분(A1~A15, A16 — A14 제외) 모두 등장
- dev4.md 에 B1~B14 전부 등장 (A14 는 Dev 1·2 담당이므로 dev3.md 에 없음)

- [ ] **Step 6: 체크리스트 완료 커밋 (없음)**

검증만 수행. 수정사항이 발견되면 해당 Task 로 되돌아가 수정 후 다시 Task 6 수행.

---

## 완료 기준

- `docs/handoff/README.md` 에 4 세션 DAG·타임라인·동기화 포인트 반영
- `docs/handoff/dev3.md` 존재 (3A + 3B 둘 다 커버)
- `docs/handoff/dev4.md` 존재 (4A + 4B 둘 다 커버)
- `docs/handoff/dev1-2-game-cowork.md` 업데이트 반영
- `docs/handoff/dev3-ui.md`·`dev4-engine.md` 삭제
- 모든 참조 링크 유효 (`grep` 결과 없음)
- Task 6 mental walkthrough 5 Step 전부 ✓

## 본 플랜이 범위 밖으로 두는 것

- **Plan A·Plan B 자체의 Task 본문 변경**: 기존 Task 정의(파일 경로·zod 스키마·TDD 스니펫)는 유지. 본 플랜은 오직 "누가·어느 세션에서" 수행하는지의 메타 레이어만 재작성.
- **공동 계약 세션 H+0~2 의 실제 코드 실행**: 해커톤 당일 Dev 3·4 가 동석해 직접 수행. 산출물 7개는 Plan A Task A1·A2·A3 + Plan B Task B1·B2 의 초반부에 이미 명시되어 있으므로 별도 실행 플랜 불필요.
- **writing-plans 후속**: 본 플랜 자체는 문서 재작성으로 완결. 해커톤 당일 코드 실행은 Plan A / Plan B 를 세션별로 각자 실행.
