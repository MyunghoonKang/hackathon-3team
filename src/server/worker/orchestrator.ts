import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Server as IOServer } from 'socket.io';
import type { BrowserContext, Page } from 'playwright';

import * as schema from '../db/schema';
import { broadcastRoomState } from '../io';
import type { SessionManager } from '../session/manager';
import type { SubmissionQueue } from '../submissions/queue';
import type { CredentialVault } from '../vault/vault';
import type { ErpCredential } from '../vault/types';
import type { WorkerResult, WorkerStep } from '../../shared/protocol';

import { launchBrowser } from './browser';
import { selectCardRow } from './cardModal';
import { defaultTitle, fillForm, type PurposeKind } from './formFill';
import { login, loginUrlFor } from './login';
import { canClickSubmit, type WorkerMode } from './mode';
import { openApprovalAndInject } from './approval';
import { makeScreenshotDir, snap } from './screenshots';
import { MOCK_CARD_ROWS } from './mock/seed';
import type { MatchCriteria } from './matcher';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 4B 풀 오케스트레이션. login → cardModal → formFill → approval 5단계.
// 호출자(Scheduler · /run-now) 는 결과(WorkerResult) 를 무시 — 본 함수가 직접
// queue.complete/fail + mgr.transitionStatus + broadcastRoomState 까지 책임진다.
//
// mode 분기:
//   mock   : file:// 목업 HTML, MOCK_CARD_ROWS 를 ?rows= base64 로 주입, submitFinal=true
//   dryrun : 실 ERP 까지 진입하되 [상신] 스킵 (submitFinal=false)
//   live   : 실 ERP 전체 흐름. canClickSubmit(env) 게이트 통과 시에만 [상신]

export interface WorkerDeps {
  db: BetterSQLite3Database<typeof schema>;
  queue: SubmissionQueue;
  mgr: SessionManager;
  io: IOServer | null;
  vault: CredentialVault;
  mode: WorkerMode;
  env?: NodeJS.ProcessEnv;
  erpBaseUrl?: string;
  erpCompanyCode?: string;
  headless?: boolean;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

function mockCardUrl(rows: unknown[]): string {
  const base = pathToFileURL(join(__dirname, 'mock', 'card.html')).toString();
  const encoded = Buffer.from(JSON.stringify(rows), 'utf-8').toString('base64');
  return `${base}?rows=${encoded}`;
}

// mock 시나리오 고정 매칭 — MOCK_CARD_ROWS[0] (스타벅스, 2026-04-20 13:29:26).
// live/dryrun 은 세션 메타데이터 기반 매칭이 필요하지만 현재 스키마에 카드 정보가
// 저장되지 않으므로 동일 기본값으로 시도한다. 매칭 실패 시 NoMatchError → FAILED.
function buildMockCriteria(): MatchCriteria {
  const seed = MOCK_CARD_ROWS[0];
  if (!seed) throw new Error('MOCK_CARD_ROWS is empty — seed.ts 확인 필요');
  return {
    cardCd: seed.cardCd,
    sessionDate: seed.issDt,
    sessionStartedAt: new Date(seed.formatedIssDtTime.replace(' ', 'T') + '+09:00'),
    toleranceMinutes: 60,
  };
}

function buildLiveCriteria(scheduledAt: Date): MatchCriteria {
  // KST 기준 YYYYMMDD
  const kst = new Date(scheduledAt.getTime() + 9 * 60 * 60_000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return {
    cardCd: '5105545000378130',
    sessionDate: `${y}${m}${d}`,
    sessionStartedAt: scheduledAt,
    toleranceMinutes: 24 * 60,
  };
}

function attendeeNamesFor(deps: WorkerDeps, sessionId: string, loserId: string | undefined): string[] {
  const snap = deps.mgr.getById(sessionId);
  if (!snap) return [];
  return snap.players
    .filter((p) => p.id !== loserId)
    .map((p) => p.name);
}

async function pushWorkerStep(
  deps: WorkerDeps,
  submissionId: string,
  sessionId: string,
  step: WorkerStep,
): Promise<void> {
  deps.queue.updateWorkerStep(submissionId, step);
  try {
    const updated = deps.mgr.updateWorkerStep(sessionId, step);
    broadcastRoomState(deps.io, updated);
  } catch (e) {
    // mgr 에 세션이 없거나 RUNNING 이 아닌 경우(서버 재기동 직후 등) — 큐만 갱신하고 진행.
    // eslint-disable-next-line no-console
    console.warn('[worker] mgr.updateWorkerStep failed', { sessionId, step, err: String(e) });
  }
}

export async function executeSubmission(
  deps: WorkerDeps,
  submissionId: string,
): Promise<WorkerResult> {
  const env = deps.env ?? process.env;
  const screenshotDir = makeScreenshotDir(submissionId);

  const subRow = deps.queue.loadForRun(submissionId);
  if (!subRow) {
    return { status: 'FAILED', errorLog: `submission not found: ${submissionId}` };
  }

  const sessionRow = deps.db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.id, subRow.sessionId))
    .get();
  if (!sessionRow) {
    return finalizeFailure(deps, submissionId, subRow.sessionId, `session not found: ${subRow.sessionId}`);
  }

  let cred: ErpCredential | null;
  try {
    cred = deps.vault.load(subRow.sessionId);
  } catch (e) {
    return finalizeFailure(deps, submissionId, subRow.sessionId, `vault.load failed: ${String(e)}`);
  }
  if (!cred) {
    return finalizeFailure(deps, submissionId, subRow.sessionId, 'ERP credential missing for session');
  }

  const purposeKind: PurposeKind = 'coffee';
  const title = defaultTitle(purposeKind, subRow.scheduledAt);
  const attendees = attendeeNamesFor(deps, subRow.sessionId, sessionRow.loserId ?? undefined);

  const submitFinal =
    deps.mode === 'mock' ? true : deps.mode === 'live' ? canClickSubmit(env) : false;

  const session = await launchBrowser({ headless: deps.headless ?? false });
  let browserClosed = false;
  const closeBrowser = async () => {
    if (browserClosed) return;
    browserClosed = true;
    await session.close().catch(() => {});
  };

  try {
    // 1. login
    await pushWorkerStep(deps, submissionId, subRow.sessionId, 'login');
    await login(session.page, cred, {
      loginUrl: loginUrlFor(deps.mode, deps.erpBaseUrl),
      companyCode: deps.erpCompanyCode,
    });
    await snap(session.page, screenshotDir, 'after-login').catch(() => {});

    // 2. cardModal
    await pushWorkerStep(deps, submissionId, subRow.sessionId, 'cardModal');
    const criteria = deps.mode === 'mock' ? buildMockCriteria() : buildLiveCriteria(subRow.scheduledAt);
    const erpRefNo = await openCardAndPick(session.page, deps.mode, criteria);
    await snap(session.page, screenshotDir, 'after-card-pick').catch(() => {});

    // 3. formFill
    await pushWorkerStep(deps, submissionId, subRow.sessionId, 'formFill');
    if (deps.mode === 'mock') {
      // selectCardRow 가 tr.click() 후 form.html 로 redirect — 도착까지 대기.
      await session.page.waitForURL(/form\.html(?:$|\?)/, { timeout: 15_000 });
    }
    await fillForm(session.page, { title, purposeKind });
    await snap(session.page, screenshotDir, 'after-fill').catch(() => {});

    // 4. approval
    await pushWorkerStep(deps, submissionId, subRow.sessionId, 'approval');
    const { popup, submittedAt } = await openApprovalAndInject(
      session.context as BrowserContext,
      session.page,
      { attendeeNames: attendees, mode: deps.mode, submitFinal },
    );
    await snap(popup, screenshotDir, 'after-approval').catch(() => {});

    if (submitFinal && !submittedAt) {
      throw new Error('approval submit reported no submittedAt');
    }

    await closeBrowser();
    return finalizeSuccess(deps, submissionId, subRow.sessionId, erpRefNo);
  } catch (e) {
    await closeBrowser();
    return finalizeFailure(deps, submissionId, subRow.sessionId, errorToLog(e));
  }
}

async function openCardAndPick(
  page: Page,
  mode: WorkerMode,
  criteria: MatchCriteria,
): Promise<string> {
  if (mode === 'mock') {
    await page.goto(mockCardUrl(MOCK_CARD_ROWS), { waitUntil: 'domcontentloaded' });
    return selectCardRow(page, criteria);
  }
  // live/dryrun: form 화면에서 [카드사용내역] 클릭 → modal → 매칭.
  await page.locator('button').filter({ hasText: /^카드사용내역$/ }).first().click();
  await page.waitForSelector('[data-orbit-id="cardDataGridTab1"]', { timeout: 30_000 });
  return selectCardRow(page, criteria);
}

function finalizeSuccess(
  deps: WorkerDeps,
  submissionId: string,
  sessionId: string,
  erpRefNo: string,
): WorkerResult {
  deps.queue.complete(submissionId, { erpRefNo });
  try {
    const updated = deps.mgr.transitionStatus({
      sessionId,
      to: 'COMPLETED',
      patch: { erpRefNo, submissionId },
    });
    broadcastRoomState(deps.io, updated);
  } catch (e) {
    // mgr 에 세션 미등록(서버 재기동 등) 시에도 큐는 이미 COMPLETED. 로그만 남김.
    // eslint-disable-next-line no-console
    console.warn('[worker] mgr.transitionStatus(COMPLETED) failed', { sessionId, err: String(e) });
  }
  return { status: 'COMPLETED', erpRefNo };
}

function finalizeFailure(
  deps: WorkerDeps,
  submissionId: string,
  sessionId: string,
  errorLog: string,
): WorkerResult {
  deps.queue.fail(submissionId, { errorLog });
  try {
    const updated = deps.mgr.transitionStatus({
      sessionId,
      to: 'FAILED',
      patch: { errorLog, submissionId },
    });
    broadcastRoomState(deps.io, updated);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[worker] mgr.transitionStatus(FAILED) failed', { sessionId, err: String(e) });
  }
  return { status: 'FAILED', errorLog };
}

function errorToLog(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}
