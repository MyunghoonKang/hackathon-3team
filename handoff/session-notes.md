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
  - src/ tests/ games/ drizzle/ 및 package*·tsconfig*·*config.ts·index.html·.env.example 삭제.
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
  - src/server/db/migrate.ts: drizzle-kit 대신 간이 마이그레이터 (__migrations 테이블 체크인).
  - src/web/main.tsx + App.tsx + index.html (styles.css import).
  - .gitignore: data/ · *.db · .claude/ · dist/ · node_modules/.
  - 검증: db:migrate 0001_init.sql 적용 OK · /api/health 200 · vite build 232KB OK · typecheck 깨끗.
  - 다음 단계: B1 DB 마이그레이션 이미 포함됨 → B2 CredentialVault (AES-256-GCM round-trip) 로 직행.

[4A] 2026-04-20 — Task B2 완료 — AES-256-GCM CredentialVault round-trip OK (7 tests pass).
  - src/server/vault/{crypto,types,vault}.ts · src/server/db/client.ts · src/server/config.ts · tests/vault.test.ts.
  - loginId/password 각각 독립 IV(12B) · authTag(16B). iv 컬럼=base64(iv_L||iv_P)=24B, auth_tag=base64(tag_L||tag_P)=32B 로 패킹 저장 → 스키마 변경 없이 GCM nonce-reuse 회피.
  - sessionId UNIQUE, onConflictDoUpdate 로 재저장 허용. 잘못된 키 → authTag mismatch throw 검증됨.
  - createDb(':memory:') 는 drizzle/*.sql 자동 실행 (테스트 편의). 실제 서버는 기존 migrate.ts 유지.
  - .env.example 은 공동 계약에서 이미 VAULT_MASTER_KEY 포함 → 추가 수정 없음.
  - 다음 단계: B3 `POST /api/credentials` + `…/credential-input` REST + CredentialForm.tsx 본문.

[4A] 2026-04-20 — Task B3 완료 — POST /api/credentials + CredentialForm 본문 (6 tests pass, total 13 B-track tests).
  - src/shared/protocol.ts: credentialInputSchema (zod) + createCredentialRequestSchema (sessionId 확장) 추가. CredentialInput 은 z.infer 로 재정의 (기존 interface 호환).
  - src/server/app.ts 신설: buildApp({ vaultKey, inMemory?, dbPath?, db? }) → { app, db, vault }. 기존 index.ts 는 buildApp 호출 + socket.io 기동으로 축약.
  - src/server/routes/credentials.ts: POST / · createCredentialRequestSchema 검증 · vault.save(sessionId, {userId, loginId, password}) · 204. FK 위반 시 409 session_not_found.
  - tests/credentials-route.test.ts: supertest 기반 6 케이스 — 204 round-trip, overwrite, 400(빈 body·빈 필드·password>128), 409(FK).
  - src/web/components/CredentialForm.tsx: props {sessionId, loserId} · 사번/ID/PW 3 필드 · POST /api/credentials → POST /api/sessions/:id/submissions 2-step. 성공 시 navigation 없음(room:state 수신으로 자연스럽게 언마운트).
  - 플랜의 `sessionId in path` vs `body` 차이 해결: CreateCredentialRequest 인터페이스(이미 protocol.ts 에 lock 됨) 가 body 에 sessionId 포함하도록 명시 → 그대로 구현.
  - 미완 / 이월: `POST /api/sessions/:id/credential-input` (FINISHED → CREDENTIAL_INPUT 전이 + broadcast) 는 SessionManager(A5) · io 인스턴스 필요 → B11 submissions.ts 라우터에서 함께 구현 예정 (플랜 Step 3 §450 선택지 준수).
  - supertest / @types/supertest devDep 추가 (package.json).
  - 다음 단계: B4 SubmissionQueue 상태머신.

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

[4B] 2026-04-20 — Task B7 완료 — ERP 2단계 로그인 모듈(`src/server/worker/login.ts`) + integration 테스트(`tests/worker-login.test.ts`) 녹색 (6 tests pass).
  - `login(page, cred, opts)`: `goto` → companyCode 검증 → `#userId` fill → [다음] → password 필드 visible 대기 → fill → [로그인] → URL 변경 대기. 실패 시 `LoginError` throw.
  - `loginUrlFor(mode, erpBaseUrl?)`: mock → `file://.../worker/mock/login.html` · dryrun/live → `${erpBaseUrl}/#/login`. erpBaseUrl 기본값 `https://erp.meissa.ai`.
  - `worker/index.ts` 는 login · loginUrlFor · launchBrowser · LoginError 를 re-export 만 수행. runSubmission orchestration(submissionId → sessions → credentials 로 cred 조회 + launchBrowser + login 호출)은 4A 의 B4(SubmissionQueue)/B11(/run-now) + 3A SessionManager 가 붙은 뒤 추가. plan Step 7.3 의 `deps` 주입형 패턴은 dev4.md 계약상 허용 안 됨 → 4A 가 Scheduler/run-now 에서 worker/index.ts 의 login·launchBrowser 를 직접 import 해 조립하는 방식 권장.
  - transitionStatus(RUNNING, { workerStep:'login' }) broadcast 는 worker 가 직접 수행하지 않음 — 4A/3A 의 SessionManager singleton 이 확정되어야 함. B8 머지 시점에 worker 가 step 콜백을 받는 시그니처를 재검토 필요.
  - `npm i --save-dev playwright` + `npx playwright install chromium` 실행 완료. `npm test` 26/26 통과 · `npm run typecheck` 깨끗.
  - 다음 단계: B8 카드매칭 — `src/server/worker/{matcher,cardModal,navigate}.ts` + `tests/matcher.test.ts`. plan §Task 8 참조. 브랜치 `feat/b-worker-login`.

[3A] Task A4 완료 — roomCode 생성기 (32^4 alphabet, crypto.randomInt, 재시도 50회)
