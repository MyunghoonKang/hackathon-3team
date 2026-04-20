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

[4B] Task B6 완료 — `src/server/worker/{index,mode,browser,screenshots}.ts` + `mock/{login,card,form}.html` + `mock/seed.ts` + `tests/worker-mock.test.ts` + `tests/fixtures/cardRows.json`. `runSubmission(submissionId): Promise<WorkerResult>` 시그니처 고정(dev4.md 계약 기준 · plan 의 deps 주입형 `(id, deps): Promise<void>` 스텁이 아님에 주의) · 현재는 FAILED+errorLog 반환 스텁이라 4A Scheduler(B5)/run-now(B11) 가 지금부터 import + 호출 가능. browser.ts 는 playwright 를 dynamic import 해 package.json 확정 전에도 파일 파싱 가능. `npm i playwright` / `npx playwright install chromium` 은 3A A1 완료 후 실행 필요 (worker-mock.test.ts 도 그 전까지는 미실행). 브랜치 `worktree-session-4b`.
