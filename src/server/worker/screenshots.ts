import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';

// 각 submissionId 당 별도 디렉터리. 데모 후 ERP 로그와 대조할 때 경로로 식별한다.
export function makeScreenshotDir(submissionId: string): string {
  const dir = join('data', 'screenshots', submissionId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export async function snap(page: Page, dir: string, name: string): Promise<string> {
  const path = join(dir, `${Date.now()}-${name}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}
