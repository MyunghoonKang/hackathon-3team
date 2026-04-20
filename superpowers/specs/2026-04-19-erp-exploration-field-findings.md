# ERP Exploration 조사 결과 · 더존 아마란스 ERP 품의서 필드 & 자동화 플로우

- **작성일:** 2026-04-19
- **조사 방법:** Playwright MCP로 `erp.meissa.ai` 직접 탐색
- **목적:** Plan B (ERP 자동화 구현 계획) 작성에 필요한 UI·API 구조 확정

## 환경

- **URL:** `https://erp.meissa.ai/#/login`
- **회사코드:** `meissa` (고정·disabled input)
- **로그인:** 회사코드 고정, ID/PW 2단계 (아이디 입력 → [다음] → PW 입력 → 로그인)
- **로그인 후 base:** `https://erp.meissa.ai/#/`
- **그리드 라이브러리:** RealGridJS (`window.RealGridJS`, `window.Grids`) — **캔버스 기반이지만 `<gridRootEl>.gridView`로 JS 직접 접근 가능**
- **백엔드 API 패턴:** `POST /personal/APB1020New/0apNNNNN`, `POST /nonprofit/<sub>/0BNNNNNN`, `POST /system/preferenceCommon/0BN00001`
- **일부 페이로드에 클라이언트 암호화 필드** (`@!E!@…==@!E!@` 패턴) — decrypt 되는 엔드포인트와 raw 엔드포인트가 공존하므로 **raw 페이로드를 쓰는 호출을 골라서 재현하는 것이 안전**

## 메뉴 진입

- 경로: 좌측 사이드바 "전자결재" → 좌측 메뉴 "결재작성" → 양식 선택 "법인카드 지출결의서"
- 지출결의서작성 페이지 URL 직접 접근도 가능:
  ```
  /#/HP/APB1020/APB1020?%2F%23%2FHP%2FAPB1020%2FAPB1020=&MicroModuleCode=eap&docWidth=1035&formDTp=APB1020_00001&formId=22
  ```
  - `moduleCode=HP` · `pageCode=APB1020` · `formDTp=APB1020_00001` · `formId=22`

## 폼 구조 (지출결의서작성)

### 지출정보 (상단)
- 회계단위 (disabled): `1000. (주)메이사`
- 회계처리일자: 오늘 (자동)
- 품의서첨부, 첨부파일: optional
- 프로젝트 (form-level): — (비워둠)
- 전표처리구분 (radio): "지출내역별" default
- **제목** (필수·빨간색): `"MM월 DD일 중식/음료 지출"` 패턴 (예: `04월 06일 음료 지출`)
- 자금집행전용: "부"

### 지출내역 테이블 (RealGrid, `data-orbit-id="APB1020WriteGridGrid"`)

버튼 바: **[카드사용내역]** · [계산서내역] · [현금영수증] · [EXCEL▼] · [예금주실명] · [추가] · [삭제]

주요 컬럼 (grid field name):
| field | header | editor |
|-------|--------|--------|
| `cashCd` | (hidden 시 있음) 용도 코드 | text |
| `cashNm` | 용도 | text (코드 입력 후 서버가 auto-resolve) |
| `rmkDc` | 내용 | text (수동) |
| `trCd` + `trNm` | 거래처 | (auto from card lookup) |
| `supAm` / `vatAm` / `sumAm` | 공급가액/부가세/합계액 | number |
| `attrNm` / `vatGroupDc` | 증빙 / 증빙번호 | text |
| `issDt` / `payDt` / `isuDt` | 증빙/지급요청/회계처리일자 | text |
| `deptCd` / `deptNm` | 부서코드/사용부서 | text |
| `pjtCd` / `pjtNm` | 프로젝트 | text |
| `empCd` / `empNm` | 사원 | text |
| `budgetDivCd` / `budgetDivNm` | 예산 회계단위 | (from 모달) |
| `mgtCd` / `mgtNm` | 관리항목 (대분류: 팀 비용 등) | (from 모달) |
| `bottomCd` | 하위 예산 키 (ex. Dev팀=3009) | (from 모달) |
| `budgetAcctCd` / `budgetAcctNm` | 예산과목 (예: 4001 중식대 및 음료커피비) | (from 모달) |
| `validateResult` | "적합" / "부적합" | (auto) |
| `rowValidationMsg` | 검증 메시지 | (auto) |
| `cardCd` | 카드번호 (롯데카드=`5105545000378130`) | |
| `sunginNb` | 승인번호 (유니크) | |
| `cardDt` / `cardSq` | 카드사용일/시퀀스 | |

## 1. 카드사용내역 모달

- 트리거: 지출내역 테이블 위 **[카드사용내역]** 버튼 (`button.OBTButton_root__1g4ov` 중 `textContent==="카드사용내역"`)
- 모달 내 그리드 2개:
  - `data-orbit-id="cardDataGridTab1"` · 탭 "미반영" (default)
  - `data-orbit-id="cardDataGridTab2"` · 탭 "반영완료"
- 필터:
  - 지출일자 범위 (default: 당월 1일 ~ 오늘)
  - 카드번호 (left panel: 카드별 그룹 리스트)
- 관측한 카드 그룹: `신한카드_강명훈(0268)` + `롯데카드_강명훈(8130)` — **우리가 사용할 것은 롯데(8130) 전용**

### 자동화 핵심 API 데이터 구조

`gv = document.getElementById(<gridId>).gridView` → `gv.getDataSource().getJsonRows()` 로 전체 거래 조회 가능. 각 row 주요 필드:

```json
{
  "bankCd": "11", "bankNm": "롯데카드",
  "cardCd": "5105545000378130",
  "cardNm": "롯데카드_강명훈(8130)",
  "issDt": "20260406",
  "issTime": "13:29:26",
  "formatedIssDtTime": "2026-04-06 13:29:26",
  "chainName": "스타벅스코리아",
  "chainRegnb": "2018121515",
  "chainBusiness": "커피전문점",
  "chainAddr": "…",
  "supAm": 4819, "vatAm": 481, "sunginAm": 5300,
  "sunginNb": "68763054",            // 유니크 ID
  "cardTrCd": "90064",
  "decryptCardCd": "5105545000378130",
  "issSq": "14", "cardSq": "14",
  "payDt": "20260515",
  "formatedSunginAm": "5,300", …
}
```

### 매칭 전략 (게임 세션 → 카드 row)
1. `cardCd === "5105545000378130"` (롯데 전용) 으로 필터
2. `issDt` == 게임 세션 날짜 (YYYYMMDD)
3. `formatedIssDtTime` / `issTime` 이 세션 `startedAt` 기준 ±N시간 범위 안
4. `chainName` 이 선택적 거래처 힌트와 fuzzy match (또는 생략)
5. 매칭된 row가 1건이면 고정, 여러 건이면 가장 가까운 시간 선택
6. 선택 후 `sunginNb` 를 DB에 영구 저장 → 향후 재실행 시 이걸로 재매칭 (유니크 · 중복 방지)

### 선택·적용
```js
gv.checkItem(rowIndex, true);
// then click the 확인 button in the modal:
// Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim()==='확인' && b.offsetParent).click()
```

선택 → 확인 → 지출내역 메인 그리드에 행 추가 + 하단 필드 (`증빙일자`=issDt, `지급요청일`=payDt) 자동 채움.

관련 내부 API (관측만 함, 직접 호출 필요할 때 페이로드 참조):
- `POST /personal/APB1020New/0ap00029` — 카드 거래 raw 조회 (tabFg="1", baNbList=[{baNb:"<card>", cardFg:"1"}])
- `POST /personal/APB1020New/0ap00028` / `0ap00030` / `0ap00008` — 연관 조회 (암호화 페이로드 사용)

## 2. 제목 입력

- Selector: `th[scope="row"]` 텍스트 "제목" → closest `<tr>` → `input[type="text"]`
- `input.value` 직접 set 하면 React 상태 미반영 가능. 안전한 방법:
  ```js
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, newValue);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  ```
  또는 Playwright 네이티브 `page.fill(selector, value)` / `page.type(selector, value)`.

## 3. 용도 입력 (`cashCd`)

- 메인 그리드의 용도 셀을 편집 모드로 진입 → 코드 입력 → Enter.
- 우리 회사 표준: **`cashCd = "3001"`** → 서버가 `cashNm = "중식, 음료커피"` 자동 매핑.
- Playwright UI 방식 (권장):
  1. 셀 double-click (또는 `gv.beginUpdateRow(0)`)
  2. 타이핑 `3001`
  3. `Enter` 키
- 결과: `cashCd="3001", cashNm="중식, 음료커피"`, 연관 `mgtCd`/`bottomCd`/`bgtCd` 후보가 서버에서 제안됨. 검증은 `"예산정보를 입력해주세요."` 로 전이.

## 4. 내용 입력 (`rmkDc`)

- 단순 텍스트 셀. 값: `"음료/커피"` (커피) / `"중식"` (점심).
- `gv.getDataSource().setValue(0, 'rmkDc', '음료/커피')` 또는 UI 방식 모두 가능.

## 5. 예산과목 입력 (lookup 모달)

- 트리거: 폼 하단부 "예산과목" 행의 **첫 번째 OBTCodePicker 의 lookup 버튼** 클릭.
  ```js
  const th = [...document.querySelectorAll('th')].find(e => e.textContent.trim()==='예산과목');
  th.closest('tr').querySelector('[data-orbit-component="OBTCodePicker"] button').click();
  ```
- 열린 모달 제목: **"공통 예산잔액 조회"**
  - 회계단위: 1000. (주)메이사 (disabled)
  - 프로젝트 (lookup): 코드 `3009` 입력 → Dev팀
  - 예산과목 (lookup): 코드 `4001` 입력 → 중식대 및 음료커피비
  - 아래 예산정보 패널 자동 채움 (실행예산액/이월/총액/집행액/사용가능여부/예산잔액)
- [확인] 클릭 → 모달 닫히고 메인 grid row 업데이트:
  - `budgetDivCd="1000", budgetDivNm="(주)메이사"`
  - `mgtCd="3000", mgtNm="팀 비용"`
  - `bottomCd="3009"`
  - `budgetAcctCd="4001", budgetAcctNm="중식대 및 음료커피비"`
  - `validateResult="적합"`

### 관련 API
- `POST /system/preferenceCommon/0BN00001` — 메뉴 preference
- `POST /nonprofit/budgetCommon/0BN00004` — init
- `POST /nonprofit/NPCodePicker/0BN00001` (`helpTy="ABGT_BOTTOM_CODE2", name="3009"`) — 프로젝트(bottomCd) 후보 조회
- `POST /nonprofit/NPCodePicker/0BN00001` (`helpTy="ABGT_BUDGET_CODE", name="4001", mgtCd="3000", bottomCd="3009"`) — 예산과목(bgtCd) 후보 조회
- `POST /nonprofit/regulatedDate/0BN00001` — 날짜 검증
- `POST /nonprofit/budgetCommon/0BN00001` — 예산 메타
- `POST /nonprofit/budget/0BN00002` — 예산 잔액 반환

## 6. 결재상신 팝업

- 트리거: 상단 우측 **[결재상신]** 버튼. **새 브라우저 탭**이 열림.
  - URL: `https://erp.meissa.ai/#/popup?MicroModuleCode=eap&appLineId=&approkey=ERP_…&fileList=[…]&formId=22&callComp=UBAP001&popupUUID=<uuid>`
  - `callComp=UBAP001` 이 결재상신 컴포넌트

### 팝업 구조
- **상단 버튼**: [미리보기] [보관] **[상신]** ← 최종 제출
- 결재 양식:
  - 기안부서: `Dev팀` (select, default from 사용자 부서)
  - 기안자: `매니저 강명훈` (read-only)
  - **합의 (결재라인)**: 우측 6 슬롯 — **전결기준(금액) 기반 자동 채움**. 별도 조작 불필요
  - 수신및참조: `경영기획팀` 기본 태그 존재
  - 시행자 / 시행일자: **비워둠**
  - 제목: 자동 반영 (`"04월 06일 음료 지출"`)
- **에디터 (iframe, `#editorView_UBAP001`, src=`/static/dzEditor/editorView.html?ver=1.3.1.5`)**:
  - 전결기준 안내:
    - 일반경비: 100만원 이하(팀리드), 500만원 이하(C-Level), 500만원 초과(CEO)
    - 접대비: 10만원 이하(팀리드), 50만원 이하(C-Level), 50만원 초과(CEO)
    - 특별회식: 50만원 이하(C-Level), 50만원 초과(CEO)
  - 지출 내역 설명 (자유 서술):
    - **참석자 명단을 여기에 타이핑**: `동석자: 강명훈, 홍길동, 김철수` (사유 생략 가능)
  - iframe 접근 방식:
    ```js
    const iframe = document.getElementById('editorView_UBAP001');
    const doc = iframe.contentDocument;
    // dzEditor 객체는 iframe contentWindow 에 존재 (추후 확인 필요)
    ```
- 기본정보 (자동): 총합계, 작성자, 작성부서, 회계단위, 회계일자, 프로젝트
- **첨부파일**: 카드영수증 jpeg 자동 첨부됨 (ex. `지출결의+카드_20260406_14.jpeg`)

### 최종 제출
**[상신] 버튼** 클릭 → ERP에 문서 생성 & 결재라인에 전달.

### 팝업 조작 주의사항
- 새 탭으로 열리므로 Playwright에서 `context.on('page', …)` 로 캐치해야 함.
- 에디터는 iframe이므로 `frameLocator('#editorView_UBAP001').locator('body').type('…')` 식 접근.

## 전체 End-to-End 파이프라인 (Plan B 마일스톤)

1. Playwright 로그인 (ID/PW 2단계)
2. 지출결의서작성 URL 직접 이동 (`/#/HP/APB1020/APB1020?formDTp=APB1020_00001&formId=22`)
3. 카드사용내역 모달 open → gridView API로 매칭 → checkItem → 확인
4. 제목 입력
5. 용도 코드 `3001` + Enter
6. 내용 입력 (`음료/커피` or `중식`)
7. 예산과목 lookup 모달 → 프로젝트 3009 / 예산과목 4001 + 확인
8. validateResult "적합" 확인
9. 결재상신 버튼 → 새 탭 캐치
10. dzEditor iframe에 `동석자: …` 주입
11. (실제 운영 시) [상신] 클릭 — **데모에서는 스크린샷까지만, 또는 보관함으로**

## 남은 TODO / Plan B 작성 시 고려

- [ ] dzEditor 의 iframe 내부 에디터 API 확인 (CKEditor/TinyMCE 계열인지, contentDocument 직접 조작 가능한지)
- [ ] 카드 모달 open 후 그리드 로딩 대기 조건 — `ds.getRowCount() > 0` 폴링?
- [ ] 용도 코드 3001 외에 커피만/중식만 구분이 필요한지 (현재는 통합 코드)
- [ ] 매칭 실패 시 fallback (카드내역에 없음 / 동일 날짜 여러 건) 정책
- [ ] 암호화 필드 페이로드가 필요한 API 호출 회피 방법 (UI 경로로 대체)
- [ ] 모킹 모드 토글 (네트워크 불안정 대비) — 사전 캡처 스크린샷 연출

## 관련 파일/스크린샷 (이 세션)

로컬 Playwright 캐시 디렉토리(`.playwright-mcp/`)에 아래 스크린샷이 생성됨 (보존 여부는 환경 의존):

- `after-login.png` — 로그인 후 대시보드
- `eapproval-home.png` — 전자결재 홈
- `form-picker.png` — 결재작성 양식 선택
- `form-blank.png` — 지출결의서작성 빈 폼
- `card-modal.png` — 카드사용내역 모달
- `form-populated.png` — 카드 선택 후 메인 폼
- `budget-modal.png` — 공통 예산잔액 조회 모달
- `after-budget.png` — 예산 입력 후 (모달 열림 상태)
- `approval-popup.png` — 결재상신 팝업
