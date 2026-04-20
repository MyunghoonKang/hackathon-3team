# Dev 1, 2 — 게임 제작 Brief (Claude Cowork)

> **이 문서 자체가 Cowork 세션의 입력 프롬프트로 그대로 쓰이게 작성됐다.** 필요한 계약·템플릿·테스트 방법을 한 문서 안에 담았으니, 저장소를 열지 않고도 Cowork 안에서 게임을 완성할 수 있다.

(여기서부터 복사)
--- 

## 0. 무엇을 만드나

식후 4명이 본인 노트북에서 각자 iframe 게임을 플레이한다. 게임은 **단일 HTML 파일** 한 장이며, 본인 결과값(숫자 하나)만 서버로 보낸다. 서버가 전체 값을 비교해 패자 1명을 뽑는다. 패자가 ERP 품의서를 올리게 된다.

**너의 목표:** 재미있는 단일 HTML 게임 3~N개를 만들고, 운영자(Dev 4 의 4A 또는 4B 어느 세션이든)에게 전달해 admin 도구로 사전 등록되게 한다. 사용자 UI에는 업로드 화면이 없으므로 등록은 운영자만 한다 (`POST /api/games` 또는 `cp games/`).

## 1. 게임 계약 (반드시 준수)

### 1-1. 파일 형태
- **단일 `.html` 파일.** 외부 CSS/JS import 금지. 모든 코드는 `<style>` 과 `<script>` 로 인라인.
- 파일명: `kebab-case.html` (예: `number-guess.html`, `reaction-click.html`).
- iframe 샌드박스는 `allow-scripts` 만 허용됨 — **네트워크·쿠키·로컬스토리지 접근 불가**. 오로지 `postMessage` 로만 외부와 통신.

### 1-2. 메타데이터 태그 (필수)

```html
<meta name="game:title" content="숫자 맞추기">
<meta name="game:min-players" content="2">
<meta name="game:max-players" content="8">
<meta name="game:description" content="1-100 중 고른 숫자가 정답에서 가장 먼 사람 패배">
<meta name="game:compare" content="max">
```

- `game:compare` = `"max"` 이면 **제출값이 가장 큰 플레이어가 패자**, `"min"` 이면 가장 작은 플레이어가 패자. 게임 설계 시 미리 정하고 문서화.

### 1-3. postMessage 프로토콜

**Host → iframe (받기만 함)**
```js
{ type: "init", playerId: "p2", players: [{id:"p1",name:"강명훈"}, ...], sessionId: "abcd", seed: "xyz" }
{ type: "start" }                                              // 카운트다운/신호
{ type: "outcome", loserId: "p3", results: [{playerId, value}] }  // 본 게임 종료 후 수신 (선택적 렌더)
```

**iframe → Host (보내기)**
```js
window.parent.postMessage({ type: "ready" }, "*");              // init 수신 후 즉시
window.parent.postMessage({ type: "submit", value: <number> }, "*");  // 플레이어 결과. 정수 또는 실수 1개
```

**규칙**
- `submit` 은 **1회만 전송**. 중복 전송해도 첫 것만 유효.
- `init` 수신 60초 내 `submit` 하지 않으면 자동 패자 후보로 취급.
- `init.seed` 는 결정적 랜덤이 필요할 때(모두가 동일 목표/순서를 보게 할 때) 사용. `Math.random()` 대신 seed 기반 PRNG 권장.
- `compare: "max"` 에서 값이 클수록 "못함" 을 의미해야 한다 (예: 반응속도 ms, 정답과의 차이 등). `"min"` 이면 반대.
- 동점은 서버가 랜덤으로 tiebreak 하므로 별도 처리 불필요.

### 1-4. 금지

- `fetch`, `XMLHttpRequest`, WebSocket, `localStorage`, cookie — **모두 작동하지 않음**. 시도하지 말 것.
- 외부 폰트/이미지 URL — CSP 위반 가능. 필요하면 data URL 로 인라인.
- `alert` / `confirm` / `prompt` — iframe 에서 차단될 수 있음. 자체 UI 로 대체.

## 2. 스타터 템플릿 (Copy-Paste)

[games-starter-template.html](./games-starter-template.html) 을 복사해 시작. Cowork 세션에서는 내용을 **그대로 붙여넣고 "이 템플릿을 이러이러한 게임으로 고쳐줘"** 라고 지시하면 된다.

## 3. 로컬 테스트 방법

플랫폼 서버 없이 단독으로 검증하려면 [games-test-harness.html](./games-test-harness.html) 를 쓴다.

1. 하네스 HTML 을 다운로드하고 같은 폴더에 네 게임 HTML 을 둔다.
2. 브라우저로 하네스를 연다. 화면에 4개 iframe 이 뜬다.
3. 상단 "게임 URL" 에 네 게임 파일명을 입력 → [로드].
4. 각 iframe 에서 플레이 → `submit` 이 호출되면 하단 로그에 기록된다.
5. 전원 제출되면 하네스가 `compare` 규칙대로 패자를 계산해 `outcome` 을 모든 iframe 에 broadcast.

**확인 항목**
- [ ] meta 태그 5개 모두 존재
- [ ] `init` 수신 후 `ready` 전송
- [ ] 60초 안에 `submit` 1회 전송
- [ ] 중복 `submit` 없음 (하네스 로그에 2회 이상 뜨지 않음)
- [ ] `outcome` 수신 시 본인이 패자인지 표시 (선택)

## 4. 게임 아이디어 풀 (골라서 만들어도 되고 바꿔도 됨)

| # | 이름 | 유형 | compare | value 의미 |
|---|------|------|---------|-----------|
| 1 | 숫자 맞추기 | 운·심리 | `max` | 내 숫자와 seed 정답의 절대차 |
| 2 | 반응속도 | 실력 | `max` | "지금!" 신호 후 버튼까지 ms |
| 3 | 동전 기억 | 기억력 | `max` | 틀린 개수 |
| 4 | 이모지 타자 | 순발력 | `max` | 5단어 타이핑 걸린 ms |
| 5 | 룰렛 (서스펜스용) | 순수 운 | `max` | seed 기반 라운드별 랜덤 결과 |
| 6 | 침묵 게임 | 셀프 통제 | `max` | 30초 동안 마우스 움직인 총 픽셀 |
| 7 | 가위바위보 (다인) | 운 | `max` | 본인이 진 횟수 |
| 8 | "말 잇기" 단어 수 | 실력 | `min` | 입력한 유효 단어 개수 (적을수록 패) |

**재미 요소 원칙**
- 플레이 시간 **30~90초**. 그 이상이면 데모 지연.
- 첫 화면에 **카운트다운 or 긴장감 있는 신호** — 5명이 동시에 같은 게임을 플레이하는 재미를 살린다.
- 소리/진동/컬러 피드백 강하게. `<audio>` 대신 `data:audio/wav;base64,…` 로 내장.
- "내가 지겠는데?" 싶은 **마지막 3초 긴장감** 이 있는 게임이 심사에 잘 먹힌다.

## 5. Cowork 프롬프트 예시

```
나는 4인 해커톤의 게임 제작자다. 아래 계약을 100% 지키는 단일 HTML 게임을 만들고 싶다.

[이 문서의 §1 전체를 붙여넣기]

만들 게임: "반응속도" — 랜덤 1~5초 후 화면이 초록색으로 바뀌면, 클릭. 클릭까지 걸린 ms 를 submit. compare는 max (느릴수록 패).

요구:
- 단일 HTML (외부 import 금지)
- meta 태그 5개
- 카운트다운 → 랜덤 대기 → "지금!" 초록 화면 → 클릭 → submit
- 대기 전 클릭하면 패널티 (+3000ms)
- 결과 대기 중에는 "기다리는 중..." 스피너
- outcome 수신 시 본인이 패자면 💀, 아니면 🎉

먼저 전체 HTML 을 아티팩트로 내보내고, 그 후 개선 제안을 해라.
```

---
(여기까지)

## 6. 제출 (Slack 팀 DM 방)

> ⚠️ 이 프로젝트는 **git 을 쓰지 않는다.** 모든 산출물·핸드오프는 **팀 DM 방**으로 주고받는다. 사용자 UI(LobbyView)에도 "게임 업로드" 버튼이 없다 — 게임은 운영자(Dev 4 의 4A 또는 4B 어느 세션이든)가 admin 도구로 사전 등록한다.

### 6-1. 최초 전달

1. `§3` 하네스로 계약 위반 없음을 먼저 확인한다 (`§3` 체크리스트 5개 전부 ✅).
2. **팀 DM 방**에 완성된 HTML 파일을 **새 메시지로 첨부**한다. 메시지 본문에 다음을 함께 적는다:

   ```
   🎮 게임 제출: <파일명>.html
   - 제목: <game:title>
   - compare: <max|min> / value 의미: <설명>
   - 최소~최대 인원: <min>~<max>
   - 하네스 검증: ✅ (meta 5개 / ready / submit 1회 / outcome 수신)
   ```

3. 이 메시지가 **해당 게임 전용 thread** 의 시작점이 된다. 이후 모든 수정·논의는 이 thread 안에서만 오간다.
4. 운영자(Dev 4)가 admin 등록을 끝내면 thread 에 **`✅` 이모지 하나**를 찍는다. 그게 "등록 완료" 시그널.

### 6-2. 수정·재전달

- 같은 thread 안에 **수정본 HTML 을 재첨부**한다. **파일명은 그대로 유지** (버전 suffix 금지 — `v2` 같은 거 붙이지 말 것).
- 메시지에는 "수정: <무엇을 바꿨는지 1줄>" 만 짧게. Dev 4 가 다시 등록하고 다시 `✅`.
- thread 외부(메인 채널)에 재첨부하지 말 것 — Dev 4 가 어떤 파일이 최신인지 헷갈린다.

### 6-3. 반려

- meta 태그 누락·postMessage 계약 위반 등으로 Dev 4 가 거절하면 thread 안에 반려 사유를 남긴다. 수정 후 `§6-2` 경로로 재전달.
- 반려 대부분은 **meta 태그 5개 누락**. `game:title`, `game:min-players`, `game:max-players`, `game:description`, `game:compare` 전부 확인.

### 6-4. 등록 후 데모 흐름 (참고)

1. 호스트가 새 방을 생성하면 LobbyView 의 `GameSelector` 드롭다운에 네 게임이 노출된다.
2. 호스트가 게임 선택 → "시작!" → 4명 모두 GameView 로 전환 → 플레이 → 패자 발표.

## 7. 심사 연출 아이디어

- **라이브 사전 등록**: 심사 중에 Cowork 로 즉석 5분짜리 게임을 만들어 운영자가 `curl -F game=@new.html` 또는 `cp new.html games/` 로 등록 → 호스트가 새 방을 만들면 즉시 `GameSelector`에 노출 → 심사위원 앞에서 바로 플레이. "재미" + "실용성" (플러그인 확장성) 두 축을 한 번에 보여줌. Dev 2 의 H+22 이후 카드. (사용자 UI에 업로드 화면이 없으므로, 호스트 화면 옆에서 운영자가 admin 등록을 시연)
- **심사위원 참여 모드**: 5인 플레이 가능하게 `max-players=8` 로 열어두고 심사위원 입장 초대 → 심사위원이 지면 극적 리액션.

## 8. 질문·블로커

- 계약 확인은 이 문서 §1 또는 `docs/superpowers/specs/2026-04-19-erp-proposal-game-automation-design.md` §4.3 를 본다.
- 게임이 호스트 화면에 어떻게 끼워지는지 시각 확인 → `docs/design/project/Wireframes.html` §3 GameView (탭 3) 참고. iframe 영역 크기와 HUD 배치 결정에 도움.
- 업로드 반려 (meta 누락 등) → thread 안에서 Dev 4 가 사유를 남긴다. 수정 후 `§6-2` 경로로 재전달.
- iframe sandbox 때문에 막히면 → 팀 DM 방에 즉시 알림. SDK 한계일 수 있음.
- 심사까지 여유 있으면 Plan B Task 6 의 `src/server/worker/mock/*.html` 정리도 게임 제작팀이 지원 가능 (선택 과제).
