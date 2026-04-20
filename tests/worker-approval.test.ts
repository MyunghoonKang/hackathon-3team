import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { injectAttendees, openApprovalAndInject } from '../src/server/worker/approval';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mockUrl = (name: string) =>
  pathToFileURL(join(__dirname, '../src/server/worker/mock', name)).toString();

describe('injectAttendees (approval popup 직접 로드)', () => {
  let browser: Browser;
  let context: BrowserContext;

  beforeAll(async () => {
    browser = await chromium.launch();
    context = await browser.newContext();
  });

  afterAll(async () => {
    await context.close();
    await browser.close();
  });

  it('동석자 1인 → iframe body 에 "동석자: 홍길동" 텍스트 삽입', async () => {
    const page = await context.newPage();
    await page.goto(mockUrl('approval.html'));
    await injectAttendees(page, ['홍길동']);
    const frame = page.frameLocator('#editorView_UBAP001');
    const text = await frame.locator('body').innerText();
    expect(text).toContain('동석자: 홍길동');
    await page.close();
  });

  it('동석자 3인 → 쉼표 구분 단일 행', async () => {
    const page = await context.newPage();
    await page.goto(mockUrl('approval.html'));
    await injectAttendees(page, ['강명훈', '홍길동', '김철수']);
    const frame = page.frameLocator('#editorView_UBAP001');
    const text = await frame.locator('body').innerText();
    expect(text).toContain('동석자: 강명훈, 홍길동, 김철수');
    await page.close();
  });

  it('빈 배열 → "동석자: " 행만 추가 (참석자 없는 경우)', async () => {
    const page = await context.newPage();
    await page.goto(mockUrl('approval.html'));
    await injectAttendees(page, []);
    const frame = page.frameLocator('#editorView_UBAP001');
    const text = await frame.locator('body').innerText();
    expect(text).toContain('동석자:');
    await page.close();
  });
});

describe('openApprovalAndInject (form → popup 전체 흐름)', () => {
  let browser: Browser;
  let context: BrowserContext;

  beforeAll(async () => {
    browser = await chromium.launch();
    context = await browser.newContext();
  });

  afterAll(async () => {
    await context.close();
    await browser.close();
  });

  it('submitFinal=false → popup 반환, submittedAt=null', async () => {
    const formPage = await context.newPage();
    await formPage.goto(mockUrl('form.html'));
    const { popup, submittedAt } = await openApprovalAndInject(context, formPage, {
      attendeeNames: ['테스터'],
      mode: 'mock',
      submitFinal: false,
    });
    expect(submittedAt).toBeNull();
    const frame = popup.frameLocator('#editorView_UBAP001');
    const text = await frame.locator('body').innerText();
    expect(text).toContain('동석자: 테스터');
    await formPage.close();
    await popup.close();
  });

  it('submitFinal=true (mock) → submittedAt 가 Date 반환', async () => {
    const formPage = await context.newPage();
    await formPage.goto(mockUrl('form.html'));
    const { submittedAt } = await openApprovalAndInject(context, formPage, {
      attendeeNames: ['테스터'],
      mode: 'mock',
      submitFinal: true,
    });
    expect(submittedAt).toBeInstanceOf(Date);
    await formPage.close();
  }, 15_000);
});
