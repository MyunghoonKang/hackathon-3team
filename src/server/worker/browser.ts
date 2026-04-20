import type { Browser, BrowserContext, Page } from 'playwright';

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close(): Promise<void>;
}

// Playwright 런처. headless=false 를 기본으로 해 데모 중 눈으로 확인 가능.
// dynamic import 로 playwright 를 끌어와 package.json 확정 전 scaffold 단계에서도
// 이 모듈의 파싱 자체는 성공하도록 보장 (실행 시에만 의존성 필요).
export async function launchBrowser(opts: { headless: boolean }): Promise<BrowserSession> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: opts.headless });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // tsx/esbuild 가 page.evaluate 콜백을 string 화하면서 삽입하는 `__name` helper 가
  // browser context 에 존재하지 않아 ReferenceError 가 난다. no-op 을 주입해 우회.
  await context.addInitScript(() => {
    (globalThis as unknown as { __name: (x: unknown) => unknown }).__name = (x) => x;
  });
  const page = await context.newPage();
  return {
    browser,
    context,
    page,
    async close() {
      await context.close();
      await browser.close();
    },
  };
}
