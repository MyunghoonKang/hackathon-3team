import type { Page } from 'playwright';

// 품의서 폼 채움. mock (`mock/form.html`) 과 실 ERP (`erp.meissa.ai` writeform) 양쪽
// 동일 함수로 처리. cardModal.ts 와 동일 패턴 — selector probe 로 환경 분기.
//
// mock DOM 은 ERP Exploration §품의서 폼 의 selector 명을 단순화한 정적 폼:
//   #writeTitle (cbizSbj) · #writePurpose · #writeContent · #budgetCode + #btnBudgetLookup
// 실 ERP 는 RealGrid (`gridView`) + OBTCodePicker 모달 — 셀 더블클릭 + setValue 로 채움.

const CASH_CODE = '3001';
const CONTENT_BY_KIND = { coffee: '음료/커피', lunch: '중식' } as const;
const DEFAULT_PROJECT = '3009';
const DEFAULT_BUDGET = '4001';

export type PurposeKind = keyof typeof CONTENT_BY_KIND;

export interface FillInput {
  title: string;
  purposeKind: PurposeKind;
  // 실 ERP OBTCodePicker 입력값. mock 은 [예산조회] 버튼이 자동 채우므로 무시.
  projectCode?: string;
  budgetCode?: string;
}

// 품의서 제목 기본 포맷 — 4A 의 Scheduler 가 submissionId → scheduledAt → 이 함수로
// title 산출. 로컬 시간 기준 (KST 가정) — date 인자는 호출자가 KST 로 정규화한 Date.
export function defaultTitle(purposeKind: PurposeKind, when: Date): string {
  const mm = String(when.getMonth() + 1).padStart(2, '0');
  const dd = String(when.getDate()).padStart(2, '0');
  const label = purposeKind === 'coffee' ? '음료' : '중식';
  return `${mm}월 ${dd}일 ${label} 지출`;
}

export class FormFillError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormFillError';
  }
}

export async function fillForm(page: Page, input: FillInput): Promise<void> {
  const purposeText = CONTENT_BY_KIND[input.purposeKind];
  const projectCode = input.projectCode ?? DEFAULT_PROJECT;
  const budgetCode = input.budgetCode ?? DEFAULT_BUDGET;

  // 1) 제목 — mock 은 단일 input, 실 ERP 도 같은 name 으로 fallback.
  await page.locator('#writeTitle, input[name="cbizSbj"]').first().fill(input.title);

  // 2) 용도/내용 — mock 은 plain textarea, 실 ERP 는 gridView cashCd + rmkDc.
  const mockPurpose = page.locator('#writePurpose');
  if ((await mockPurpose.count()) > 0) {
    await mockPurpose.fill(purposeText);
    const mockContent = page.locator('#writeContent');
    if ((await mockContent.count()) > 0) {
      await mockContent.fill(purposeText);
    }
  } else {
    await page
      .evaluate(
        ({ cashCode, content }) => {
          const el = document.querySelector('[data-orbit-id="APB1020WriteGridGrid"]') as
            | (Element & {
                gridView?: {
                  beginUpdateRow(idx: number): void;
                  getDataSource(): { setValue(idx: number, key: string, val: string): void };
                  commit?(): void;
                };
              })
            | null;
          const gv = el?.gridView;
          if (!gv) throw new Error('writeform grid not found');
          gv.beginUpdateRow(0);
          gv.getDataSource().setValue(0, 'cashCd', cashCode);
          gv.getDataSource().setValue(0, 'rmkDc', content);
          gv.commit?.();
        },
        { cashCode: CASH_CODE, content: purposeText },
      )
      .catch((e: unknown) => {
        throw new FormFillError(`grid setValue failed: ${String(e)}`);
      });
  }

  // 3) 예산조회 — mock 은 [예산조회] 클릭 시 자동 채움, 실 ERP 는 OBTCodePicker 모달.
  const mockBudgetBtn = page.locator('#btnBudgetLookup');
  if ((await mockBudgetBtn.count()) > 0) {
    await mockBudgetBtn.click();
    await page
      .waitForFunction(
        () => {
          const v = (document.querySelector('#budgetCode') as HTMLInputElement | null)?.value;
          return !!v && v.length > 0;
        },
        null,
        { timeout: 5_000 },
      )
      .catch(() => {
        throw new FormFillError('mock budget lookup did not populate #budgetCode');
      });
  } else {
    await page
      .locator('th:has-text("예산과목")')
      .locator('xpath=ancestor::tr[1]')
      .locator('[data-orbit-component="OBTCodePicker"] button')
      .first()
      .click();
    await page.waitForSelector('.obt-modal:has-text("공통 예산잔액 조회")', { timeout: 15_000 });

    await page
      .locator('.obt-modal :text("프로젝트") >> xpath=following::input[1]')
      .first()
      .fill(projectCode);
    await page.keyboard.press('Enter');

    await page
      .locator('.obt-modal :text("예산과목") >> xpath=following::input[1]')
      .first()
      .fill(budgetCode);
    await page.keyboard.press('Enter');

    await page.locator('.obt-modal button:visible', { hasText: /^확인$/ }).first().click();

    // 검증 결과가 '적합' 으로 떨어질 때까지 대기 — ERP Exploration §폼 §검증 참조.
    await page
      .waitForFunction(
        () => {
          const el = document.querySelector('[data-orbit-id="APB1020WriteGridGrid"]') as
            | (Element & {
                gridView?: { getDataSource(): { getValue(idx: number, key: string): unknown } };
              })
            | null;
          return el?.gridView?.getDataSource().getValue(0, 'validateResult') === '적합';
        },
        null,
        { timeout: 15_000 },
      )
      .catch(() => {
        throw new FormFillError('budget validation did not reach 적합 within 15s');
      });
  }
}
