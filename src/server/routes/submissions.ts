import { Router, type Response } from 'express';
import type { Server as IOServer } from 'socket.io';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { SubmissionQueue } from '../submissions/queue';
import {
  IllegalTransitionError,
  SessionNotFoundError,
  type SessionManager,
} from '../session/manager';
import { broadcastRoomState } from '../io';
import { nextBusinessDayNineAm } from '../submissions/scheduling';
import type { WorkerMode } from '../config';
import * as schema from '../db/schema';
import type { CreateSubmissionResponse } from '../../shared/protocol';

// B11 라우트. 전부 mgr.transitionStatus() → broadcastRoomState(io, snap) 순서 고정.
// snap.status 직접 수정 금지 (illegal transition 가드 우회 사고 방지).
//
// Endpoints:
//   POST /api/sessions/:id/credential-input   → 204  (FINISHED → CREDENTIAL_INPUT + broadcast)
//   POST /api/sessions/:id/submissions        → 200  (CREDENTIAL_INPUT → QUEUED + broadcast)
//       body { loserId? } — loserId 는 CredentialForm 호환용 optional.
//   POST /api/submissions/:id/run-now         → 202  (QUEUED → RUNNING + fire-and-forget runSubmission)
//       mock 모드 or X-Demo-Confirm: yes header 필수.
//   GET  /api/submissions/:id                 → 200  (디버그 전용 — UI 는 room:state 만 구독)

export interface SubmissionsRouterDeps {
  db: BetterSQLite3Database<typeof schema>;
  mgr: SessionManager;
  queue: SubmissionQueue;
  io: IOServer | null;
  workerMode: WorkerMode;
  runSubmission: (id: string) => Promise<unknown>;
  now?: () => Date;
}

export function submissionsRouter(deps: SubmissionsRouterDeps): Router {
  const r = Router();
  const now = () => deps.now?.() ?? new Date();

  r.post('/sessions/:id/credential-input', (req, res) => {
    try {
      const snap = deps.mgr.transitionStatus({
        sessionId: req.params.id,
        to: 'CREDENTIAL_INPUT',
      });
      broadcastRoomState(deps.io, snap);
      res.status(204).end();
    } catch (e) {
      handleTransitionError(res, e);
    }
  });

  r.post('/sessions/:id/submissions', (req, res) => {
    const sessionId = req.params.id;

    // 이전 run 버그 가드 — mgr 이 A5 미완으로 sessions persist 를 누락했어도
    // FOREIGN KEY 터지지 않도록 이중 upsert. mgr.register() 경로를 탔다면 no-op.
    try {
      deps.db
        .insert(schema.sessions)
        .values({
          id: sessionId,
          roomCode: sessionId,
          status: 'CREDENTIAL_INPUT',
          hostId: 'unknown',
          createdAt: now(),
          updatedAt: now(),
        })
        .onConflictDoNothing()
        .run();
    } catch {
      /* swallow — primary upsert는 mgr.persist */
    }

    let scheduledAt: Date;
    let submissionId: string;
    try {
      scheduledAt = nextBusinessDayNineAm(now());
      submissionId = deps.queue.enqueue({ sessionId, scheduledAt });
    } catch (e) {
      if (e instanceof Error && /FOREIGN KEY/i.test(e.message)) {
        res.status(409).json({ error: 'session_not_found' });
        return;
      }
      throw e;
    }

    try {
      const snap = deps.mgr.transitionStatus({
        sessionId,
        to: 'QUEUED',
        patch: { submissionId, scheduledAt: scheduledAt.toISOString() },
      });
      broadcastRoomState(deps.io, snap);
      const body: CreateSubmissionResponse = {
        submissionId,
        scheduledAt: scheduledAt.toISOString(),
      };
      res.status(200).json(body);
    } catch (e) {
      handleTransitionError(res, e);
    }
  });

  r.post('/submissions/:id/run-now', (req, res) => {
    const demoConfirm = req.get('x-demo-confirm') === 'yes';
    if (deps.workerMode !== 'mock' && !demoConfirm) {
      res.status(422).json({
        error: 'run_now_gated',
        message: 'mock 모드 또는 X-Demo-Confirm: yes 헤더가 필요합니다.',
      });
      return;
    }

    const row = deps.queue.loadForRun(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'submission_not_found' });
      return;
    }

    try {
      const snap = deps.mgr.transitionStatus({
        sessionId: row.sessionId,
        to: 'RUNNING',
        patch: { workerStep: 'login', submissionId: row.id },
      });
      broadcastRoomState(deps.io, snap);
    } catch (e) {
      handleTransitionError(res, e);
      return;
    }

    // fire-and-forget (Lessons §Task 11 DoD 준수: { ok: true } 스텁만 반환 금지).
    deps.runSubmission(row.id).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[run-now] runSubmission threw', { id: row.id, err: String(err) });
    });

    res.status(202).json({ ok: true, submissionId: row.id });
  });

  r.get('/submissions/:id', (req, res) => {
    const row = deps.queue.loadForRun(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'submission_not_found' });
      return;
    }
    res.status(200).json(row);
  });

  return r;
}

function handleTransitionError(res: Response, e: unknown): void {
  if (e instanceof IllegalTransitionError) {
    res
      .status(409)
      .json({ error: 'illegal_transition', from: e.from, to: e.to, message: e.message });
    return;
  }
  if (e instanceof SessionNotFoundError) {
    res.status(404).json({ error: 'session_not_found' });
    return;
  }
  throw e;
}
