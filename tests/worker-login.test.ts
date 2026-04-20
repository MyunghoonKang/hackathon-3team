import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { login, loginUrlFor, LoginError, mockLoginUrl } from '../src/server/worker/login';

// ERP 2단계 로그인 통합 테스트 — src/server/worker/mock/login.html 을 file:// 로 띄워
// Playwright 가 사번 → [다음] → 비밀번호 → [로그인] 흐름을 성공적으로 통과하는지 검증.

describe('worker/login (mock HTML)', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
  }, 60_000);

  beforeAll(async () => {
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser?.close();
  });

  it('2단계 로그인 성공 시 form.html 로 이동', async () => {
    await login(
      page,
      { userId: '100001', loginId: 'alice', password: 'pw1234' },
      { loginUrl: mockLoginUrl() },
    );
    expect(page.url()).toMatch(/form\.html$/);
  });

  it('비밀번호 누락 → 페이지에 머무르고 LoginError', async () => {
    const emptyPage = await browser.newPage();
    await expect(
      login(
        emptyPage,
        { userId: '100001', loginId: 'alice', password: '' },
        { loginUrl: mockLoginUrl(), timeoutMs: 3_000 },
      ),
    ).rejects.toBeInstanceOf(LoginError);
    await emptyPage.close();
  });

  it('companyCode 불일치 시 LoginError 로 조기 차단', async () => {
    const ccPage = await browser.newPage();
    await expect(
      login(
        ccPage,
        { userId: '100001', loginId: 'alice', password: 'pw1234' },
        { loginUrl: mockLoginUrl(), companyCode: 'wrong-co', timeoutMs: 3_000 },
      ),
    ).rejects.toBeInstanceOf(LoginError);
    await ccPage.close();
  });
});

describe('loginUrlFor 모드 분기', () => {
  it('mock 모드는 file:// 의 login.html 로 해석', () => {
    expect(loginUrlFor('mock')).toMatch(/^file:\/\/.*\/mock\/login\.html$/);
  });

  it('live · dryrun 은 ERP_BASE_URL + /#/login', () => {
    expect(loginUrlFor('live')).toBe('https://erp.meissa.ai/#/login');
    expect(loginUrlFor('dryrun')).toBe('https://erp.meissa.ai/#/login');
  });

  it('erpBaseUrl 오버라이드 가능', () => {
    expect(loginUrlFor('live', 'https://sandbox.example.com')).toBe('https://sandbox.example.com/#/login');
  });
});
