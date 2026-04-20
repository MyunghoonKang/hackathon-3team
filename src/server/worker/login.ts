import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Page } from 'playwright';
import type { ErpCredential } from '../vault/types';
import type { WorkerMode } from './mode';

// ERP Exploration §로그인 폼 참조 — 2단계 인증:
//   1) 회사코드(disabled) + 사번(userId) → [다음] 버튼
//   2) 비밀번호(password) → [로그인] 버튼
// mock 모드에서는 login.html 이 form.html 로 location 이동, 실 ERP 는 /#/login 에서
// 메인 라우트로 hash 변경 — 둘 다 "login URL 에서 벗어남" 으로 성공 판정.

export interface LoginOptions {
  loginUrl: string;
  companyCode?: string;
  timeoutMs?: number;
}

export class LoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoginError';
  }
}

export async function login(page: Page, cred: ErpCredential, opts: LoginOptions): Promise<void> {
  const timeout = opts.timeoutMs ?? 30_000;
  await page.goto(opts.loginUrl, { waitUntil: 'domcontentloaded', timeout });

  // companyCode 는 실 ERP 에서 disabled. 값 이상 시 즉시 차단.
  if (opts.companyCode) {
    const actual = await page
      .locator('#companyCode')
      .inputValue()
      .catch(() => '');
    if (actual && actual !== opts.companyCode) {
      throw new LoginError(`unexpected company code: ${actual}`);
    }
  }

  await page.locator('input[name="userId"], #userId').fill(cred.loginId);
  await page.getByRole('button', { name: '다음' }).click();

  // password 필드가 DOM 에 노출되기까지 대기 (mock: display:none → block 토글).
  await page.locator('input[name="password"], #password').waitFor({ state: 'visible', timeout });
  await page.locator('input[name="password"], #password').fill(cred.password);
  await page.getByRole('button', { name: '로그인' }).click();

  // URL 이 바뀔 때까지 대기. mock 은 login.html → form.html, 실 ERP 는 /#/login → /#/...
  const startUrl = opts.loginUrl;
  await page
    .waitForURL((url) => url.toString() !== startUrl, { timeout })
    .catch(() => {
      // fallthrough: URL 그대로면 아래에서 LoginError 로 변환.
    });
  await page.waitForLoadState('networkidle', { timeout });

  if (page.url() === startUrl || /\/mock\/login\.html$/.test(page.url()) || /\/#\/login\b/.test(page.url())) {
    throw new LoginError(`still on login page: ${page.url()}`);
  }
}

// worker/index.ts 와 tests/worker-login.test.ts 가 같은 목업 경로를 참조하기 위한 helper.
// import.meta.url 은 dist 실행 시에도 정확한 위치를 가리키므로 cwd 의존 없음.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function mockLoginUrl(): string {
  return pathToFileURL(join(__dirname, 'mock', 'login.html')).toString();
}

export function loginUrlFor(mode: WorkerMode, erpBaseUrl = 'https://erp.meissa.ai'): string {
  return mode === 'mock' ? mockLoginUrl() : `${erpBaseUrl}/#/login`;
}
