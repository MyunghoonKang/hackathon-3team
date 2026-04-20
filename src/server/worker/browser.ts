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
