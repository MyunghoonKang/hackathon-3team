import type { Page, BrowserContext } from 'playwright';

export interface ApprovalInput {
  attendeeNames: string[];
  mode: 'live' | 'mock' | 'dryrun';
  submitFinal: boolean; // true 이면 [상신] 버튼 클릭
}

// iframe body 에 동석자 한 줄 append — mock 과 live 공통 경로.
// live: #editorView_UBAP001 iframe (dzEditor)
// mock: srcdoc iframe — 같은 selector 로 접근 가능
export async function injectAttendees(popup: Page, attendeeNames: string[]): Promise<void> {
  const line = `동석자: ${attendeeNames.join(', ')}`;
  const frame = popup.frameLocator('#editorView_UBAP001');
  const body = frame.locator('body');
  await body.evaluate((b, text) => {
    const p = (b.ownerDocument as Document).createElement('p');
    p.textContent = text;
    b.appendChild(p);
  }, line);
}

export async function openApprovalAndInject(
  context: BrowserContext,
  originPage: Page,
  input: ApprovalInput,
): Promise<{ popup: Page; submittedAt: Date | null }> {
  const popupPromise = context.waitForEvent('page');
  await originPage.locator('button', { hasText: /^결재상신$/ }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');

  if (input.mode === 'live' && !/callComp=UBAP001/.test(popup.url())) {
    throw new Error(`unexpected approval popup URL: ${popup.url()}`);
  }

  await injectAttendees(popup, input.attendeeNames);

  if (!input.submitFinal) {
    return { popup, submittedAt: null };
  }

  await popup.locator('button', { hasText: /^상신$/ }).click();
  // ERP 확인 dialog — dryrun 에서는 절대 호출되지 않음 (submitFinal=false).
  // live 에서만 accept.
  popup.once('dialog', (d) => d.accept());
  await popup.waitForLoadState('networkidle', { timeout: 30_000 });
  return { popup, submittedAt: new Date() };
}
