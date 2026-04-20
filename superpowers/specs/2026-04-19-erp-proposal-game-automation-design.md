# ERP 품의서 자동화 · 벌칙게임 플랫폼 (Design)

- **작성일:** 2026-04-19
- **대상:** 24시간 해커톤 PoC (팀 최대 8명)
- **심사 기준:** 실용성, 재미
- **데모 환경:** 로컬 PC 여러 대

## 1. 문제 & 목적

사원들은 회사 개인법인카드로 중·석식 또는 커피를 결제한 뒤 반드시 사내 ERP(**더존 아마란스**)에 품의서를 올려야 한다. 여러 명이 함께 식사한 경우에도 더치페이 대신 한 명이 결제하고, 품의서에 함께 식사한 사람 명단을 수동으로 기재한다.

ERP에 접속해 카드사용내역을 일일이 검색하고 품의서를 작성하는 공수가 크다.

**제품 가설:** 식사 후 참여자들이 간단한 벌칙게임을 하고, 진 사람의 계정으로 서버가 ERP에 자동 상신한다. 게임으로 "결제자 + 품의서 작성자" 선정을 재미 요소로 전환하고, 실제 상신은 Playwright로 자동화한다.

## 2. 핵심 결정 요약

| 항목          | 결정                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------- |
| ERP 타겟      | 더존 아마란스 (웹, ID/PW 로그인)                                                                |
| 카드내역 지연 | 결제 다음 영업일 조회 가능 — "식사 당일 게임 → 다음 날 상신" 2단계 플로우                       |
| 벌칙게임 유형 | 단일 플레이어 턴제 + 동시 입력형 (실시간 멀티플레이 제외)                                       |
| 게임 확장     | HTML 파일 업로드 + iframe + postMessage 계약 (팀원/사용자가 게임 추가 가능)                     |
| 세션 참여     | 룸 코드 방식 (한 명이 방 생성, 나머지는 4자리 코드로 참여)                                      |
| 자격증명 처리 | 패자가 게임 직후 ID/PW 입력 → 서버에서 AES-256-GCM 암호화 저장 → 다음 영업일 09:00 자동 상신    |
| 데모 전략     | 데모 전날 실결제 → 당일 실제 카드내역으로 상신 시연 + 플랜 B로 "모킹 모드" 토글                 |
| 기술 스택     | Node + TypeScript 풀스택 · Express + Socket.io · React/Svelte + Vite · SQLite · Playwright-Node |
| 아키텍처      | 통합 웹앱 + 백그라운드 자동화 워커 (단일 레포 / 단일 프로세스)                                  |

## 3. 아키텍처

```
┌──────────────────────────────────────────────────────────────┐
│                    Players' Browsers (4 PCs)                   │
│   Lobby UI + Game iframe ×4                                    │
└────────────────┬─────────────────────────────────────────────┘
                 │  WebSocket (Socket.io)
                 ▼
┌──────────────────────────────────────────────────────────────┐
│          Server (Node + Express + Socket.io)                  │
│   SessionManager · GameRegistry · SubmissionQueue · Scheduler │
│   CredentialVault                                             │
│          │                                      │             │
│          ▼                                      ▼             │
│   SQLite                            Automation Worker         │
│   (sessions, participants,          (Playwright-Node)         │
│    games, submissions,                                        │
│    credentials)                                               │
└────────────────────────────────────────────────┬──────────────┘
                                                 ▼
                                    더존 아마란스 ERP
                                    (login → 카드내역 → 품의서 상신)
```

### 핵심 흐름

1. 방 생성 → 룸 코드 발급 → 3명 참여
2. 게임 선택 → 모두의 iframe에 게임 로드 → 각자 플레이 후 `submit(value)` 전송
3. 서버가 모든 `submit`을 수집 → 게임 메타의 `compare` 규칙으로 패자 결정 → `outcome` broadcast
4. 패자가 자격증명 입력 → 암호화 저장 + 다음 영업일 09:00 예약
5. 스케줄 시각에 Playwright 워커가 ERP 로그인 → 카드내역 조회 → 품의서 상신

## 4. 컴포넌트 상세

### 4.1 프론트엔드

- `HomePage` — 방 생성 / 방 참여 진입
- `LobbyPage` — 참가자 목록, 게임 선택, 게임 업로드, 시작 버튼
- `GamePage` — iframe 렌더 + 상단 플레이어 아바타/상태
- `ResultPage` — 패자 발표 연출 (사운드/애니), "품의서 상신 예약하기" CTA
- `CredentialPage` — 패자 전용. ID/PW 입력, 예약 시각 표시
- `AdminPage` (옵션) — 등록 게임 목록, 상신 큐 현황, 로그

### 4.2 백엔드

- `SessionManager` — 룸 코드 생성(4자리 영숫자), 참가자 join/leave, 상태머신 `LOBBY → PLAYING → FINISHED`
- `GameRegistry` — `/games/*.html` 폴더 스캔 + `POST /api/games` 업로드 API. `<meta>` 태그에서 메타데이터 파싱
- `GameRunner` — 세션에 게임 할당, iframe URL 발급, postMessage 이벤트 중계
- `SubmissionQueue` — 결과 수신 시 `submissions` 레코드 생성, `scheduledAt`에 다음 영업일 09:00 세팅
- `Scheduler` — `node-cron` 기반 분당 큐 스캔 → `scheduledAt ≤ now` 건 워커 트리거
- `CredentialVault` — AES-256-GCM. 마스터 키는 환경변수. 복호화는 워커 실행 시점에만

### 4.3 게임 플러그인 SDK

**설계 원칙 (서버 컴퍼레이터 모델):** 각 플레이어는 자신의 PC에서 독립된 iframe을 실행한다. iframe은 본인의 결과 `value`만 계산해 보내고, **서버가 모든 제출값을 수집·비교해 패자를 결정**한다. iframe은 다른 참가자의 상태를 알 필요가 없다.

**메타데이터 선언 (게임 HTML 파일 내)**

```html
<meta name="game:title" content="숫자 맞추기" />
<meta name="game:min-players" content="2" />
<meta name="game:max-players" content="8" />
<meta
  name="game:description"
  content="1-100 중 고른 숫자가 정답에서 가장 먼 사람 패배"
/>
<meta name="game:compare" content="max" />
<!-- max | min : 해당 방향의 극값이 패자 -->
```

**postMessage 계약**

```
# Host → iframe
{ type: "init", playerId: "p2", players: [{id, name}], sessionId, seed: "..." }
{ type: "start" }
{ type: "outcome", loserId: "p3", results: [{playerId, value}] }  // 서버 판정 후

# iframe → Host
{ type: "ready" }                        // init 수신 후
{ type: "submit", value: <number> }      // 이 플레이어의 결과값 (수치 하나)
```

**제약**

- iframe `sandbox="allow-scripts"` — 네트워크/쿠키 접근 차단
- 결정적 랜덤이 필요한 게임은 `init.seed`를 사용해 모든 참가자가 동일 조건
- 60초 내 `submit` 미수신 시 host가 타임아웃 처리 (미제출자는 자동 패자 후보)
- iframe은 한 번의 `submit`만 전송. 중복 시 첫 번째만 유효
- `compare: max` → 제출값 중 최댓값을 낸 플레이어가 패자. `min`이면 최솟값
- 동점 발생 시 서버가 랜덤 tiebreak

### 4.4 자동화 워커

- 입력: `submissionId` → DB에서 복호화 자격증명, 참가자 목록, 세션 메타 조회
- 단계: `login()` → `findTransactions(date)` → `fillProposalForm({amount, merchant, attendees, purpose})` → `submit()` → 스크린샷 저장 → 결과 DB 기록
- 성공 시 `status=COMPLETED` + ERP 참조번호 저장
- 실패 시 `status=FAILED_*` + 에러 스택

### 4.5 DB 스키마 (SQLite · Drizzle 또는 Prisma)

```
users          (id, name, employeeNo?)
sessions       (id, roomCode, state, createdAt, startedAt?, approxAmount?)
participants   (sessionId, userId, joinedAt, isLoser)
games          (id, filename, meta, uploadedAt)
submissions    (id, sessionId, loserId, status, scheduledAt,
                erpRefNo?, errorLog?, screenshotPath?)
credentials    (userId, encryptedBlob, iv, updatedAt)
```

## 5. 데이터 흐름

### Phase 1-2 · 실시간 (게임)

- Host가 `POST /session` → 룸 코드 발급
- 나머지는 Socket.io로 join → 참가자 목록 broadcast
- 게임 선택 & Start → 모든 클라이언트 iframe 로드 (각자에게 `init(playerId, seed)` 전송)
- 각 iframe이 `submit(value)` 전송 → 서버가 전원 제출 대기
- 전원 제출 또는 60초 타임아웃 시 서버가 `compare` 규칙으로 패자 결정 → `outcome` broadcast

### Phase 3-4 · 예약 → 다음 날 실행

- 패자 자격증명 입력 → AES-GCM 암호화 저장
- `submissions`에 `scheduledAt = D+1 09:00` 로 insert
- 다음 날 `node-cron`이 분당 스캔 → 워커 트리거
- Playwright가 ERP login → 카드내역 조회 → 품의서 작성 → 상신
- 결과 DB 반영 후 패자에게 알림 (socket 연결 중이면 즉시, 아니면 데모에서는 생략)

### 관측 포인트

- **iframe 타임아웃 (60초)** — 게임 먹통 방지
- **카드내역 매칭** — 세션 생성 시 `startedAt` + `approxAmount`를 기록 → 다음 날 가장 근접한 카드 행 선택 (정확한 매칭 규칙은 ERP Exploration 확정 후 재논의)
- **멱등성** — `status` 전이(QUEUED → RUNNING → COMPLETED/FAILED)로 중복 상신 방지

## 6. 에러 처리 & 복원력

### 6.1 WebSocket 끊김

- 클라이언트: Socket.io 기본 재연결 (exponential backoff, 5회)
- 서버: 끊긴 참가자는 `DISCONNECTED` 마킹 후 30초 유예. 게임 중 끊김은 세션 `ABORTED` (PoC 한계)

### 6.2 게임 iframe

- 60초 내 일부 플레이어가 `submit` 미제출 시: 서버가 미제출자를 패자 후보로 처리 (또는 세션 `ABORTED` · 구현 시 선택)
- 메시지 스키마 검증 (zod 등): 무효 메시지 무시 + 로그
- iframe 크래시: `allow-scripts`만 허용하므로 host 보호. load 실패 감지 시 교체 안내

### 6.3 패자 결정 방어

- 제출 `value`가 수치가 아니거나 이상치면 해당 플레이어 무효 처리
- 중복 `submit`: 첫 번째만 유효
- 동점 tiebreak: 서버 랜덤 (seed 사용 가능)

### 6.4 자격증명 / ERP 자동화

- **로그인 실패** → `FAILED_AUTH` + 패자에게 재입력 안내
- **2FA/캡차 신규 등장** → `FAILED_UNEXPECTED_UI` + 스크린샷, 수동 처리 플래그
- **카드내역 미등록 (0건)** → 1시간 뒤 재시도 (최대 3회) → `FAILED_NO_TXN`
- **DOM 변경** → 각 단계 selector fallback 리스트 + 스크린샷. 실패 시 멱등 중단
- **ERP 세션 만료** → 각 요청 전 로그인 상태 체크, 만료 감지 시 재로그인

### 6.5 예약 큐 / 스케줄러

- 워커 크래시: `RUNNING` 상태로 30분 이상 정체 시 Scheduler가 `QUEUED` 되돌림
- 서버 재기동: `RUNNING` → `QUEUED` 일괄 리셋
- 중복 실행 방지: `UPDATE ... WHERE status='QUEUED'` 조건부 업데이트로 atomic lock

### 6.6 데모 당일 리스크

- **사전 체크리스트:** 전날 오후 결제 1건 / 아마란스 접속 테스트 / 카드내역 로드 확인 / CredentialVault 라운드트립 테스트
- **플랜 B:** ERP 불안정 대비 **모킹 모드** 토글. 환경변수로 Playwright 대신 사전 캡처 스크린샷을 연출 재생
- **네트워크:** 유선 또는 공용 WiFi, host PC에서 서버 기동

## 7. 테스트 & 검증 전략

### 7.1 자동화 테스트 (시간 허락 시)

- `GameRegistry` meta 파싱 (Vitest)
- 룸 코드 충돌률 (1만 생성 시 중복 검사)
- `CredentialVault` 라운드트립 (암호화 → 저장 → 복호화)
- `postMessage` 스키마 검증 (zod)
- iframe 타임아웃 (fake timers)

### 7.2 Playwright 개발용 아마란스 목업

- 실제 ERP 매번 접속 대신 **로컬 아마란스 목업**: 정적 HTML 3개 (로그인/카드내역/품의서)
- 실제 DOM selector 기반으로 작성, 목업도 동일 구조로 맞춤
- 개발자 1명이 실제 DOM 캡처 + 목업 작성 (2-3시간) → 나머지 개발은 목업에서

### 7.3 24시간 마일스톤

| 시간          | 작업                                                                            |
| ------------- | ------------------------------------------------------------------------------- |
| H0-3          | 스캐폴딩 (Node/Express/Socket.io + Vite + SQLite), 룸 코드·참여·socket          |
| H3-8          | 게임 플러그인 로더 + iframe 샌드박스 + postMessage, 샘플 게임 1개 (숫자 맞추기) |
| H6-12 (병렬)  | Playwright로 아마란스 로그인 + 카드내역 조회                                    |
| H12-16 (병렬) | 샘플 게임 2개 추가 (운 1 + 실력 1) + 결과/패자 UI 연출                          |
| H12-18        | 품의서 폼 자동화 (ERP Exploration 확정 후 시작) + CredentialVault + 큐/스케줄러 |
| H18-22        | 통합 + end-to-end 리허설. 실제 카드내역으로 상신 테스트                         |
| H22-24        | 데모 시나리오 스크립트 + 폴리싱 + 플랜 B 확인                                   |

### 7.4 데모 당일 인수 기준

1. 4대 PC가 같은 룸에 접속, 참가자 목록 실시간 동기화
2. iframe 게임 플레이 후 패자 자동 결정
3. 즉석 신규 게임 HTML 업로드 → 즉시 사용 가능
4. 패자 자격증명 입력 → 예약 완료 UI
5. "즉시 실행" 버튼 → 실제 아마란스 상신 성공 화면 노출
6. 플랜 B: 모킹 모드로도 5번이 재현됨

## 8. 팀 병렬 작업 제안

| 역할                    | 담당                                      |
| ----------------------- | ----------------------------------------- |
| 프론트 UI · 연출        | 2명 (홈/로비/결과 + 샘플 게임 2-3개 작성) |
| 세션 · 소켓 · 데이터    | 1명 (룸 코드, 참가자, 상신 큐, DB)        |
| Playwright · ERP 자동화 | 1명 (로그인 → 카드내역 → 품의서 흐름)     |

## 9. 보안 · 프로덕션 전환 시 필요 사항 (심사 발표 슬라이드용)

- 서버 자격증명 보관은 PoC 한정. 실배포 시 **SSO/SAML 연동** 또는 **HashiCorp Vault 등 시크릿 관리**로 전환 필요
- 사용자 인증 (현재는 이름 입력만) → 사내 SSO 연동
- 감사 로그: 누가 누구의 계정으로 무엇을 상신했는지 추적 가능한 감사 로그 필수
- 2FA / 디바이스 바인딩 고려

## 10. 백로그 / 확정 전 항목

- **ERP Exploration · 아마란스 품의서 필드 세부** — 사용자가 chrome-dev-tool로 직접 시연·설명 예정. 필수 필드, 사용목적/적요 템플릿, 참석자 명단 형식, 계정과목, 영수증 첨부, 결재라인 구조 확정 후 `fillProposalForm` 스펙 작성
- **카드내역 매칭 규칙** — ERP Exploration 확정 시 동시 확정 (금액 전액 매칭 / 시간대 허용 오차 / 동일 가맹점 중복 처리)
- **영수증 처리** — ERP Exploration 확정 시 스코프 결정 (앱에서 사진 업로드 받을지, PoC에서는 생략할지)
