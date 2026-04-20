# Session Notes

각 Claude Code 세션이 Task 완료 시 한 줄씩 덧붙인다. 다음 세션이 이 파일을 읽어 현재 진행 상황을 파악한다.

**형식:** `[세션] Task XN 완료 — <1줄 요약>` (미해결 이슈·결정 사항 있으면 같이)

**예:**

```
[3A] Task A4 완료 — roomCode 생성기 · 32^4 alphabet · 중복 테스트 포함
[4A] Task B2 완료 — AES-256-GCM CredentialVault round-trip OK
[4B] Task B6 완료 — 목업 HTML 3종 + WORKER_MODE 토글 + runSubmission 스텁 export
```

**중단·블로커가 있을 때:**

```
[4B] Task B8 진행 중 — 카드매칭 실패 (중복 승인번호). 4A 에게 row 중복 해결 정책 문의 필요.
```

---

## 로그

<!-- 새 항목은 이 아래에 append -->

[integrator] 2026-04-20 — main 통합 완료 (c401055).

- feat/b-worker-scaffold (4A+4B: B1~B13) → b94d085 로 non-ff merge.
- feat/ui-polish (3B: A10~A15) → c401055 로 non-ff merge.
- 충돌 2건 (CredentialForm.tsx · ResultView.tsx): 4A 본문 버전 유지(3B 스텁 폐기).
- RoomPage.tsx 는 3B 의 `default → ResultView` 패턴으로 9 status 전부 커버 → 4A 의 별도 5 case PR 불필요.
- 남은 작업: B14 실 ERP 라이브 리허설 (사용자 동석, H+22 이후).

[integrator] 2026-04-20 — E2E 브라우저 시뮬레이션 결과: 6 개 버그 발견·패치.
발견된 버그:

- **[3B]** `src/web/socket.ts` — A9 머지 후 실 socket 으로 1줄 교체 DoD 누락. mock 상태로 push됨.
- **[3B]** `src/web/hooks/useSession.ts` — component-local state 라 navigate 시 session 손실. HomePage→RoomPage 직후 "방 정보 로딩 중..." 고착.
- **[3B]** `src/web/components/GameView.tsx` — `game:begin` 이벤트가 listener 등록 전 도달하는 race. "게임 로딩 중..." 고착.
- **[3B]** `src/web/pages/RoomPage.tsx` — ResultView 호출 시 props naming 불일치 (snap/me ↔ state/myPlayerId).
- **[3A]** `src/server/session/manager.ts` — `persist?: boolean` 옵션만 선언하고 DB insert 로직 누락. sessions 테이블 empty → FK 실패 원인.
- **[4A]** `src/server/routes/submissions.ts` — `submissions.sessionId` FK 대비 sessions upsert 없음 (FOREIGN KEY constraint failed). 또한 `/run-now` 가 `runSubmission` 호출 없이 스텁 응답만.
- **[A14]** `games/number-guess.html` — Dev 1·2 범위. `<h1>TBD in Task 9</h1>` 스텁만 존재. `docs/handoff/games-starter-template.html` 로 치환함.

적용 패치 (단일 커밋 예정): socket.ts 교체 · useSession 전역 store · GameView REST fallback · RoomPage prop rename · submissions 라우트 sessions upsert · games/number-guess.html 교체.

미해결: 4A 의 `/run-now` 실제 runSubmission 호출 연결. scheduler 가 2026-04-20 09:00 KST 에 자동 실행하므로 데모 때 해당 시각 대기 or run-now 스텁 교체 필요.

시뮬 검증 단계 (LM66 방): HomePage → LobbyView (호스트+게스트 2인) → GameView (iframe 플레이) → ResultView FINISHED (명훈 7점, 지우 13점 패자) → CredentialForm → QUEUED "다음 영업일 09:00 KST" 까지 완주. RUNNING/COMPLETED 는 run-now 미구현으로 미검증.

[integrator] 2026-04-20 — 재해커톤 준비를 위해 docs 외 전부 리셋.

- src/ tests/ games/ drizzle/ 및 package*·tsconfig*·\*config.ts·index.html·.env.example 삭제.
- node_modules/ · .playwright-mcp/ · data/ · .env 등 untracked 도 제거.
- origin 에서 feat/ui-polish · feat/b-worker-scaffold 브랜치 삭제 → main 1개만 유지.
- 유지: docs/ · requirements.md · .git/ · CLAUDE.md · .claude/ · .superpowers/.
- 복구 시 `git checkout 352b996 -- <path>` 또는 해당 머지 커밋에서 cherry-pick.
- Plan A/B 의 Lessons 섹션과 spec §10 이 재해커톤의 추가 DoD 체크리스트. 다음 run 에서는 이를 공동 계약 세션에 흡수.

[공동계약] 2026-04-20 — 공동 계약 세션 산출물 7종 생성 (아직 커밋 전, 로컬 working tree).

- src/shared/protocol.ts: RoomStatus 9 enum · ALLOWED_TRANSITIONS · RoomStatePayload(Plan B 필드 포함) · CredentialInput · WorkerResult · SOCKET_EVENT_ROOM_STATE · ViewProps(snap/me 고정).
- src/server/db/schema.ts + drizzle/0001_init.sql: sessions·submissions·credentials 3 테이블. FK 주석에 이전 run manager.persist 누락 버그 경고.
- src/web/styles.css: 다크+라임 토큰 · 9 RoomStatus 색 변수 · Pretendard/Inter import.
- src/web/components/StatusBadge.tsx · InlineSpinner.tsx: 9 RoomStatus 한국어 라벨 · 4 workerStep 라벨.
- src/server/hooks/submissionHook.ts: onGameFinished(sessionId, loserId) no-op 시그니처.
- .env.example: PORT/DB_PATH/GAMES_DIR/VAULT_MASTER_KEY/WORKER_MODE/ERP_BASE_URL/ERP_COMPANY_CODE/ERP_CONFIRM_SUBMIT(주석).
- 이전 run 버그 흡수: ViewProps prop 네이밍 잠금(snap/me) · submissions FK 보장 규칙 주석 · SessionManager persist=true 기본값 규칙 문서화.
- 다음 단계: 3A A1 스캐폴딩(Vite·tsconfig·package.json) 후 `feat(shared): lock contracts for A/B split` 로 일괄 커밋 · main 머지.

[4A] 2026-04-20 — Task A1 스캐폴딩 선점 완료 (Dev 3 세션 부재로 4A 가 대신 처리).

- package.json (type:module, dev:server·dev:web·dev·build:web·db:migrate·typecheck·test scripts) + npm i 완료.
- tsconfig.json (server+shared+tests) / tsconfig.web.json (web+shared) 분리. strict + noUncheckedIndexedAccess.
- vite.config.ts: 5173 → 3000 proxy (/api · /socket.io ws · /games).
- drizzle.config.ts: schema=src/server/db/schema.ts · dialect=sqlite · out=drizzle.
- src/server/index.ts: express+socket.io Hello World · /api/health.
- src/server/db/migrate.ts: drizzle-kit 대신 간이 마이그레이터 (\_\_migrations 테이블 체크인).
- src/web/main.tsx + App.tsx + index.html (styles.css import).
- .gitignore: data/ · \*.db · .claude/ · dist/ · node_modules/.
- 검증: db:migrate 0001_init.sql 적용 OK · /api/health 200 · vite build 232KB OK · typecheck 깨끗.
- 다음 단계: B1 DB 마이그레이션 이미 포함됨 → B2 CredentialVault (AES-256-GCM round-trip) 로 직행.

[4A] 2026-04-20 — Task B2 완료 — AES-256-GCM CredentialVault round-trip OK (7 tests pass).

- src/server/vault/{crypto,types,vault}.ts · src/server/db/client.ts · src/server/config.ts · tests/vault.test.ts.
- loginId/password 각각 독립 IV(12B) · authTag(16B). iv 컬럼=base64(iv_L||iv_P)=24B, auth_tag=base64(tag_L||tag_P)=32B 로 패킹 저장 → 스키마 변경 없이 GCM nonce-reuse 회피.
- sessionId UNIQUE, onConflictDoUpdate 로 재저장 허용. 잘못된 키 → authTag mismatch throw 검증됨.
- createDb(':memory:') 는 drizzle/\*.sql 자동 실행 (테스트 편의). 실제 서버는 기존 migrate.ts 유지.
- .env.example 은 공동 계약에서 이미 VAULT_MASTER_KEY 포함 → 추가 수정 없음.
- 다음 단계: B3 `POST /api/credentials` + `…/credential-input` REST + CredentialForm.tsx 본문.

[4A] 2026-04-20 — Task B3 완료 — POST /api/credentials + CredentialForm 본문 (6 tests pass, total 13 B-track tests).

[4A] 2026-04-20 — Task B4 완료 — SubmissionQueue 상태머신 (11 tests pass).
  - src/server/submissions/{types,queue}.ts 신설. 플랜의 별도 SubmissionStatus enum / claimedAt / mode·attendees 필드는 실제 schema(공동 계약)와 어긋나 schema-진실 원칙으로 적용 — RoomStatus enum + attempts/updatedAt 만 사용.
  - API: enqueue(input) · claimNext(now) · complete(id, {erpRefNo}) · fail(id, {errorLog}) · updateWorkerStep(id, step) · recoverStuck({thresholdMs, now?}) · loadForRun(id) · countByStatus().
  - 동시성: 후보 SELECT 후 `WHERE id=? AND status='QUEUED'` 조건부 UPDATE → SQLite write 직렬화 + WAL 로 race-free. claim 시 attempts++, workerStep/errorLog clear.
  - recoverStuck: RUNNING & updatedAt ≤ (now - thresholdMs) → QUEUED 로 복귀. claimNext 가 updatedAt 을 `now` 인자로 stamp 해서 테스트 가능 (실시간 의존 X).
  - 큐 자체는 broadcast 안 함. 호출자(Scheduler/B11/workerHook)가 transitionStatus + broadcastRoomState 로 RoomStatePayload(submissionId · scheduledAt · workerStep · erpRefNo · errorLog) 전파 책임.
  - 테스트(tests/queue.test.ts) 11 케이스: enqueue · claim QUEUED→RUNNING + attempts++ · idempotent claim · 미래 scheduledAt skip · 가장 오래된 due 우선 · complete · fail · updateWorkerStep · recoverStuck stuck reset · recoverStuck recent untouched · loadForRun.
  - 다음 단계: B5 Scheduler (분당 polling + nextBusinessDayNineAm Asia/Seoul) · runSubmission 호출.

[4A] 2026-04-20 — Task B5 완료 — Scheduler (분당 · 다음 영업일 09:00 KST) + scheduling.ts (7 tests pass).
  - src/server/submissions/{scheduling,scheduler}.ts 신설. node-cron 3.0.3 · date-fns-tz 2.0.1 · date-fns 2.30.0 추가.
  - nextBusinessDayNineAm(now): utcToZonedTime(TZ=Asia/Seoul) → 오늘 09:00 set → 지났으면 +1d → 주말 skip → zonedTimeToUtc. 스펙의 4 케이스 (평일밤/금요일/토요일/평일 08시) 모두 통과.
  - Scheduler.tick(): recoverStuck(기본 threshold 30min) → claimNext(now) → runSubmission fire-and-forget. start() 는 cron '* * * * *' 등록, stop() 은 취소. broadcast 는 워커 몫이라 여기선 안 건드림.
  - src/server/index.ts: buildApp 반환 db 위에 SubmissionQueue · Scheduler 기동. runSubmission 은 4B 워커가 아직 없을 수 있으므로 dynamic `import('./worker/index.js')` 로 로드 → 실패·부재 시 no-op placeholder (서버는 계속 뜸).
  - 테스트 추가: tests/scheduling.test.ts 에 Scheduler.tick 3 케이스 (due 1건 dispatch · 없을 때 skip · stuck recovery 후 재dispatch).
  - 전체 typecheck/테스트 grn (77 pass, 9 files). npm 취약점 4건(moderate) — 데모 후 정리 대상, 여기선 건드리지 않음.
  - 다음 단계: B11 `POST /api/sessions/:id/submissions` + `/run-now` + ResultView QUEUED/RUNNING/COMPLETED/FAILED 본문. B11 은 3B RoomPage 안정(H+14 이후) 뒤에 합치는 게 플랜.

[4B] Task B6 완료 — `src/server/worker/{index,mode,browser,screenshots}.ts` + `mock/{login,card,form}.html` + `mock/seed.ts` + `tests/worker-mock.test.ts` + `tests/fixtures/cardRows.json`. `runSubmission(submissionId): Promise<WorkerResult>` 시그니처 고정(dev4.md 계약 기준 · plan 의 deps 주입형 `(id, deps): Promise<void>` 스텁이 아님에 주의) · 현재는 FAILED+errorLog 반환 스텁이라 4A Scheduler(B5)/run-now(B11) 가 지금부터 import + 호출 가능. browser.ts 는 playwright 를 dynamic import 해 package.json 확정 전에도 파일 파싱 가능. `npm i playwright` / `npx playwright install chromium` 은 3A A1 완료 후 실행 필요 (worker-mock.test.ts 도 그 전까지는 미실행). 브랜치 `worktree-session-4b`.

[4A] 2026-04-20 — Task B11 완료 — submissions REST 4종 + SessionManager stub + broadcastRoomState + ResultView 본문 (12 tests pass, total 151).
  - `src/server/session/manager.ts` 신설 (3A 의 A5 미착수 대행 — 이전 run `persist` 누락 버그 흡수: register/transition 마다 sessions 테이블 upsert 보장). `transitionStatus` 가 `isAllowedTransition` 검증 → snap mutate → DB persist. 3A A5 머지 시 교체 대상.
  - `src/server/io.ts` 신설 — `broadcastRoomState(io|null, snap)` 유틸 (io=null 이면 no-op → 테스트 호환). 모든 RoomStatus 전이 직후 호출.
  - `src/server/routes/submissions.ts` 신설. 4 엔드포인트:
      · `POST /api/sessions/:id/credential-input` → 204 (FINISHED→CREDENTIAL_INPUT + broadcast)
      · `POST /api/sessions/:id/submissions` → 200 `{submissionId, scheduledAt}` (CREDENTIAL_INPUT→QUEUED + broadcast) · sessions 테이블 `onConflictDoNothing` upsert 로 FK 이중 가드
      · `POST /api/submissions/:id/run-now` → 202 (QUEUED→RUNNING + fire-and-forget `runSubmission(id)`) · mock 모드 or `X-Demo-Confirm: yes` header 필수 · Lessons §Task 11 DoD 준수 (`{ok:true}` 스텁만 반환 금지).
      · `GET /api/submissions/:id` → 디버그.
    에러: IllegalTransitionError→409 · SessionNotFoundError→404 · FK→409 session_not_found.
  - `src/server/app.ts` buildApp 확장 — `io`/`workerMode`/`runSubmission`/`now` 주입 옵션 + `mgr`·`queue` 반환. `/api` 밑에 submissionsRouter mount.
  - `src/server/index.ts` 재조립 — socket.io 를 buildApp 이전에 생성해 io 주입, Scheduler 는 queue 를 buildApp 결과에서 받음. worker `runSubmission` dynamic import 유지 (부재 시 no-op).
  - `src/web/components/ResultView.tsx` 신설 — FINISHED/CREDENTIAL_INPUT/QUEUED/RUNNING/COMPLETED/FAILED 6 case (프롬프트의 Plan B 4단계 + FINISHED/CREDENTIAL_INPUT 까지 포함). ViewProps(snap/me) 고정. CredentialForm 은 FINISHED 및 CREDENTIAL_INPUT 에서 패자에게만 렌더. RUNNING 은 InlineSpinner+workerStep.
  - 테스트(`tests/submissions-route.test.ts`) 12 케이스: credential-input 204/404/409 · submissions 200+enqueue/FK upsert gap/409 illegal · run-now mock 202+fire · live 422 gated · live with header 202+fire · 404 missing · GET /submissions/:id 200/404.
  - 확인: `npm run typecheck` 깨끗 · `npm test` 151 pass (내부 B 트랙 12 신규). playwright 미설치 상태였어서 `npm install` 로 복구.
  - 미완 / 이월: (1) worker 측 `transitionStatus(RUNNING→COMPLETED/FAILED)` 콜백은 4B B10 머지 시점에 붙음. 현재 run-now 는 RUNNING 까지만 전이, worker 가 종료 시 mgr 없이는 상태 못 바꿈. (2) `RoomPage` 5 case 추가 PR 은 3B RoomPage 골격 이후. (3) SessionManager 는 3A A5 본 구현으로 교체 필요.
  - 다음 단계: B12 게임훅 (submissionHook.ts → GameRunner outcome) · 3A A8 머지 대기.

[4B] 2026-04-20 — Task B7 완료 — ERP 2단계 로그인 모듈(`src/server/worker/login.ts`) + integration 테스트(`tests/worker-login.test.ts`) 녹색 (6 tests pass).
  - `login(page, cred, opts)`: `goto` → companyCode 검증 → `#userId` fill → [다음] → password 필드 visible 대기 → fill → [로그인] → URL 변경 대기. 실패 시 `LoginError` throw.
  - `loginUrlFor(mode, erpBaseUrl?)`: mock → `file://.../worker/mock/login.html` · dryrun/live → `${erpBaseUrl}/#/login`. erpBaseUrl 기본값 `https://erp.meissa.ai`.
  - `worker/index.ts` 는 login · loginUrlFor · launchBrowser · LoginError 를 re-export 만 수행. runSubmission orchestration(submissionId → sessions → credentials 로 cred 조회 + launchBrowser + login 호출)은 4A 의 B4(SubmissionQueue)/B11(/run-now) + 3A SessionManager 가 붙은 뒤 추가. plan Step 7.3 의 `deps` 주입형 패턴은 dev4.md 계약상 허용 안 됨 → 4A 가 Scheduler/run-now 에서 worker/index.ts 의 login·launchBrowser 를 직접 import 해 조립하는 방식 권장.
  - transitionStatus(RUNNING, { workerStep:'login' }) broadcast 는 worker 가 직접 수행하지 않음 — 4A/3A 의 SessionManager singleton 이 확정되어야 함. B8 머지 시점에 worker 가 step 콜백을 받는 시그니처를 재검토 필요.
  - `npm i --save-dev playwright` + `npx playwright install chromium` 실행 완료. `npm test` 26/26 통과 · `npm run typecheck` 깨끗.
  - 다음 단계: B8 카드매칭 — `src/server/worker/{matcher,cardModal,navigate}.ts` + `tests/matcher.test.ts`. plan §Task 8 참조. 브랜치 `feat/b-worker-login`.

[3A] Task A4 완료 — roomCode 생성기 (32^4 alphabet, crypto.randomInt, 재시도 50회)

[4B] Task B8 완료 — `src/server/worker/matcher.ts` (순수 함수 `matchCardRow(rows, criteria)` · ERP Exploration §1 매칭 전략: cardCd + issDt + ±toleranceMinutes 안 가장 가까운 시각 + excludeSunginNbs 멱등성 가드) + `src/server/worker/cardModal.ts` (`openCardModal` · `selectCardRow` · `NoMatchError` · gridView 우선 + mock `<tbody#cardRows>` fallback 양쪽 지원) + `tests/matcher.test.ts` (7 케이스: cardCd 일치/불일치 · issDt 불일치 · 다중 후보 closest · tolerance 밖 · exclude 후 차순위 · 전부 exclude). worker/index.ts 통합(`cardModal` re-export)은 B7 와 동일 패턴으로 별도 commit 권장. 4A 와의 계약 변경 없음. 브랜치 `feat/b-worker-cardmodal` (origin/main 위에 cherry-pick — 이전 `feat/b-worker-scaffold` 의 stale b25c432 를 여기서 정착).

[4B] Task B9 완료 — `src/server/worker/formFill.ts` (`fillForm(page, input)` · `defaultTitle(kind, when)` · `FormFillError` · `PurposeKind` · `FillInput`) + `tests/worker-formfill.test.ts` (mock coffee/lunch/budget-lookup-disabled negative + defaultTitle 포맷 2 케이스). cardModal.ts 와 동일 dual-selector 패턴 — `#writePurpose` count probe 로 mock(plain textarea) vs 실 ERP(gridView cashCd/rmkDc setValue) 분기. 예산조회는 mock `#btnBudgetLookup` 클릭 자동 채움 / 실 ERP OBTCodePicker 모달 처리 (project=3009 · budget=4001 기본). worker/index.ts 에 re-export 추가 (Step 7.3 와 동일 패턴 — orchestration 은 4A 영역). B8 (cardModal · #1 머지됨) 와 독립 PR. 테스트 미실행 (이 환경에 node_modules 없음 — main 머지 후 `npm test` 자동 검증 가정). 4A 계약 변경 없음. 브랜치 `feat/b-worker-formfill`.

[3A] Task A5 완료 — SessionManager (인메모리 + DB persist · 이중 API · 15 tests pass · FK 버그 재발 방지)
  - src/server/session/{manager,types}.ts. dev4 가 B11 언블록용으로 선제 조립한 SessionManager 스텁(register/getById/transitionStatus · RoomStatePayload 기반)을 **풀 구현으로 대체** — 기존 stub API 는 호환 유지 (submissions-route.test 9건 그대로 green).
  - Constructor overload: `new SessionManager(db)` (dev4 호출형, persist=true 자동) / `new SessionManager({ persist?, db? })` (plan 호출형). persist 기본값 `true`. persist=true 면서 db 누락이면 throw.
  - Plan API 추가: createSession(name) / join(roomCode,name) / selectGame(host-only) / startGame(host-only + PREPARING→PLAYING) / finishGame(PLAYING→FINISHED + loserId/results) / transitionStatus(ALLOWED_TRANSITIONS 가드).
  - DB persist: createSession=insert, join/selectGame/startGame/finishGame/transitionStatus=update. sessions 테이블에 있는 컬럼(id,roomCode,status,hostId,gameId,loserId,createdAt,updatedAt)만 write. players/results/submissionId/scheduledAt/workerStep/erpRefNo/errorLog 는 메모리 스냅샷에만.
  - 이전 run 의 FK 폭발 버그 흡수: SessionManager.persist 옵션만 선언해놓고 실 insert 누락 → 이번엔 `db.insert(sessions).values(...).run()` 실제 실행. submissions.sessionId FK 참조 대상 row 항상 존재 보장.
  - Unified snap: 내부 저장소는 `UnifiedSnap` (RoomStatePayload 전체 + SessionSnapshot 전용 id/selectedGameId/startedAt/createdAt) 하나. dev4 route 의 `broadcastRoomState(io, snap)` 와 plan 테스트의 `.selectedGameId`/`.startedAt` 모두 같은 객체에서 접근. scheduledAt 은 ISO string (wire 계약) 로 통일.
  - 테스트: tests/manager.test.ts 8/8 (plan verbatim), tests/manager.persist.test.ts 7/7 (실 insert/update 검증 + default persist=true 에서 db 없이 throw + persist=false 에서 DB 미기록). 전체 77 pass / 3 skip / 1 fail(=worker-login, playwright chromium 미설치 — 본 태스크 무관). typecheck 깨끗.
  - 다음 단계: 3A A6 GameRegistry. B11 라우트는 새 SessionManager 로 그대로 동작.
[4B] 2026-04-20 — Task B8 완료 — cardModal 모듈(matcher.ts·cardModal.ts·matcher.test.ts) 본체는 이전 PR(#1, 5cfd143)에서 머지됨. 이 세션은 마무리 작업: src/server/worker/index.ts 에 cardModal/matcher re-export 추가(login·fillForm 패턴 일치) + dev4.md DoD [x] B8·matcher/worker-mock 단위 테스트 녹색 갱신. 검증: matcher 7/7, worker-mock 13/13 pass. 중복 승인번호 정책은 matcher 의 `excludeSunginNbs` 로 멱등성 가드(이미 상신된 sunginNb 재선택 차단) — 4A 의 SubmissionQueue 가 prior submissions 의 erpRefNo→sunginNb 를 옵션으로 주입할 위치를 orchestration 단계에서 결정. workerStep='cardModal' transitionStatus 호출은 runSubmission orchestration(별도 PR) 에서 cardModal 진입 시 호출 예정.

[3B] 2026-04-20 — Task A10 완료 — HomePage · useSession(module-level store) · RoomPage 스텁 · 라우팅.
  - 병렬 진행: 3A 세션이 `hackathon-3team/` 에서 A5→A6, 이쪽(3B)은 `hackathon-3team-3b/` 워크트리. server/web 소유권 분리라 파일 충돌 無.
  - src/web/socket.ts: `io({ autoConnect: false })`. A9(server session handler) 머지 전까지 emit ack 미도달 — hang 정상. A9 머지 후 자동 동작.
  - src/web/hooks/useSession.ts: **모듈 레벨 store + useSyncExternalStore 구독** — 이전 run 의 "HomePage→RoomPage navigate 후 session null" 버그 정면 대응 (DoD §10 lessons). 컴포넌트 local useState 금지.
  - toPayload(raw): 서버 ack 응답의 `id`↔`sessionId` 키명 drift 방어 + 필수 필드 런타임 검증. 풀 zod 스키마는 protocol.ts 수정 리스크라 보류.
  - src/web/pages/HomePage.tsx: 이름·룸코드 입력 · 방 만들기/참여 · 성공 시 /room/:code nav · 에러 토스트 · busy 가드.
  - src/web/pages/RoomPage.tsx: 스텁. useSession 구독 → 참가자 요약. LobbyView/GameView/ResultView 스왑은 A11~A13.
  - src/web/App.tsx: `/` HomePage, `/room/:code` RoomPage, `*` 404. main.tsx 의 BrowserRouter 유지.
  - src/web/styles.css: HomePage/RoomPage 스타일 append only. 공동 계약 디자인 토큰 손 안 댐.
  - 의존성: socket.io-client 추가 (npm i). package.json/package-lock.json 변경.
  - 검증: `tsc -p tsconfig.web.json --noEmit` 0 error. server 쪽 `matcher.ts(51,10)` 에러는 4B 소유 · 본 태스크 무관. 수동 2탭 검증은 A9 머지 후 재실행 예정.
  - 다음 단계: 3B A11 LobbyView · A12 GameView. A9 머지 알림 수신 시 재연결 시나리오 확인.

[4A] 2026-04-20 — Task B12 완료 — submissionHook 실 구현 (FINISHED→CREDENTIAL_INPUT 전이 + broadcast, 6 tests pass).
  - src/server/hooks/submissionHook.ts: 공동 계약 시그니처 `onGameFinished(sessionId, loserId): Promise<void>` 유지하면서 의존성 주입형 팩토리 `createSubmissionHook({ mgr, io })` 추가. 모듈 레벨 `onGameFinished` 는 `registerSubmissionHook(deps)` 로 1회 바인딩 후 실 전이 수행. `resetSubmissionHookForTests` 는 테스트 격리용.
  - src/server/app.ts: buildApp 끝에서 `createSubmissionHook({ mgr, io })` + `registerSubmissionHook` 호출. BuiltApp 에 `submissionHook` 필드 노출 → 3A 의 GameRunner 가 `import { onGameFinished } from './hooks/submissionHook'` 로 호출하면 자동 작동.
  - 동작: `mgr.transitionStatus(FINISHED→CREDENTIAL_INPUT, patch:{loserId})` → `broadcastRoomState(io, snap)`. illegal transition / SessionNotFoundError 는 호출자에게 전파.
  - tests/submission-hook.test.ts 6 케이스: 정상 전이+broadcast · io=null no-op · PREPARING 호출 → IllegalTransitionError · 미존재 sessionId → SessionNotFoundError · register 전 모듈 호출 = warn-only · register 후 모듈 호출 = 실 전이.
  - 검증: 신규 6/6 + submission-hook 외 4A 영역 회귀 없음. 전체 290/293 (실패 3은 4B worker-formfill budget lookup Playwright 타임아웃 — 본 태스크 무관, 기존 상태). typecheck: 4B `worker/matcher.ts:51` 1 에러는 본 태스크 직전 main 에서 동일 (4B 영역).
  - 다음 단계: B13 E2E mock 녹색 — 4B B10(결재상신) 머지 후 진입. RoomPage 5 case PR 도 3B RoomPage 골격(A10 머지됨) 위에 얹을 수 있는 시점.

[3A] Task A5 follow-up — getById clone + join PREPARING guard (review fixes, +2 tests)

[3B] 2026-04-20 — Task A11 완료 — PlayerList · GameSelector · LobbyView + RoomPage PREPARING 연결.
  - 계속 `hackathon-3team-3b/` 워크트리에서 3B 트랙 병렬 진행. 이 커밋 작성 중 main 은 `c0ee1b9` (3A A5 follow-up) 까지 전진 — 내 워크트리 server/tests/handoff 는 `git checkout HEAD -- ...` 로 재동기화, src/web 영역만 추가.
  - src/web/components/PlayerList.tsx: `players` · `hostId` · `loserId?` · `highlightMe?`. 접속끊김(connected=false) · 패자 · 본인 강조 클래스 3종. FINISHED 단계에서 ResultView 가 재사용할 수 있도록 loserId prop 미리 공개.
  - src/web/components/GameSelector.tsx: `GET /api/games` 호출 · 응답 형태 배열/`{games:[]}` 양쪽 허용 · A6/A7 미머지 시 404 fallback 하고 hint 문구 표시. select disabled 는 host 여부로 제어.
  - src/web/components/LobbyView.tsx: ViewProps(snap/me) 공동 계약 네이밍. `selectedGameId` 는 `snap.game?.id` 로 취득 (UnifiedSnap 의 selectedGameId 와 동일 — protocol.ts 건드리지 않음). start 버튼은 host + game 선택 + min/max players 만족 때만 활성. `socket.emit('game:select')` / `game:start` 는 ack 에러만 표시 (서버 A9 이전엔 hang 정상). 룸코드 복사 버튼(A15 스펙 선행) · `navigator.clipboard` 실패 시 토스트.
  - src/web/pages/RoomPage.tsx: PREPARING case 에서 LobbyView 렌더. 나머지 status 는 "후속 Task (A12/A13) 에서 구현" 플레이스홀더. `session/me` null 가드 유지 — useSession 이 socket ack 전엔 session null.
  - src/web/styles.css: Lobby · PlayerList · GameSelector 스타일 append. 공동 계약 토큰(font/color/space/radius) 전부 재사용, 새 토큰 추가 없음.
  - 검증: web typecheck 0 error. A9 머지 전이라 2탭 라이브 검증 skip.
  - 다음 단계: A12 GameFrame + useGameFrame (iframe postMessage 브리지). protocol.ts 에 `HostToIframe`/`IframeToHost` 가 없어 web 로컬로 정의하거나 공동 계약 추가 필요 — 4A 와 조율 포인트.
