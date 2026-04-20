import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defaultTitle, fillForm, FormFillError } from '../src/server/worker/formFill';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK_FORM = pathToFileURL(
  join(__dirname, '../src/server/worker/mock/form.html'),
).toString();

describe('fillForm (mock)', () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  it('coffee: 제목 · #writePurpose=음료/커피 · #writeContent · #budgetCode 자동 채움', async () => {
    const page = await browser.newPage();
    await page.goto(MOCK_FORM);
    await fillForm(page, { title: '04월 20일 음료 지출', purposeKind: 'coffee' });
    expect(await page.locator('#writeTitle').inputValue()).toBe('04월 20일 음료 지출');
    expect(await page.locator('#writePurpose').inputValue()).toBe('음료/커피');
    expect(await page.locator('#writeContent').inputValue()).toBe('음료/커피');
    expect(await page.locator('#budgetCode').inputValue()).toBe('B-2026-FOOD-001');
    await page.close();
  });

  it('lunch: purposeKind 분기로 #writePurpose=중식', async () => {
    const page = await browser.newPage();
    await page.goto(MOCK_FORM);
    await fillForm(page, { title: 'lunch test', purposeKind: 'lunch' });
    expect(await page.locator('#writePurpose').inputValue()).toBe('중식');
    expect(await page.locator('#writeContent').inputValue()).toBe('중식');
    await page.close();
  });

  it('budget lookup 비활성화된 mock 변형 → FormFillError (negative case)', async () => {
    const page = await browser.newPage();
    await page.goto(MOCK_FORM);
    // 시뮬레이션: 버튼의 click 핸들러를 떼어내 lookup 이 동작하지 않게 만든다.
    await page.evaluate(() => {
      const btn = document.getElementById('btnBudgetLookup') as HTMLButtonElement | null;
      const fresh = btn?.cloneNode(true) as HTMLButtonElement | null;
      if (btn && fresh) btn.replaceWith(fresh);
    });
    await expect(
      fillForm(page, { title: 'no budget', purposeKind: 'coffee' }),
    ).rejects.toBeInstanceOf(FormFillError);
    await page.close();
  });
});

describe('defaultTitle', () => {
  it('월/일 zero-pad + purposeKind 한국어 라벨', () => {
    const apr20 = new Date(2026, 3, 20);
    expect(defaultTitle('coffee', apr20)).toBe('04월 20일 음료 지출');
    expect(defaultTitle('lunch', apr20)).toBe('04월 20일 중식 지출');
  });

  it('한 자리 월일도 두 자리로', () => {
    const jan5 = new Date(2026, 0, 5);
    expect(defaultTitle('coffee', jan5)).toBe('01월 05일 음료 지출');
  });
});
