import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  ALLOWED_TRANSITIONS,
  isAllowedTransition,
  type GameResult,
  type Player,
  type RoomStatePayload,
  type RoomStatus,
  type WorkerStep,
} from '../../shared/protocol';
import * as schema from '../db/schema';
import { generateRoomCode } from './roomCode';
import type { CreateSessionInput, JoinSessionInput, SessionSnapshot } from './types';

// SessionManager · A5
// -----------------------------------------------------------------------------
// 이중 API: (1) plan A5 의 풀 팩토리 (createSession/join/selectGame/startGame/
// finishGame) — 3A 가 소켓 핸들러·REST 라우트에서 사용. (2) B11 이 선제 조립한
// register/getById/transitionStatus — RoomStatePayload 입출력.
//
// 두 API 가 같은 Snapshot 을 공유. 내부 저장소는 `UnifiedSnap` 하나.
// `getById` 는 UnifiedSnap 을 그대로 반환하므로 RoomStatePayload 의 필드도
// 전부 접근 가능하고(SessionSnapshot + sessionId + updatedAt), SessionSnapshot
// 의 추가 필드(`selectedGameId`/`startedAt`/...)도 접근 가능.
//
// 이전 run 버그 재발 방지: 기본값 persist=true. persist=true 일 때 db 미지정은
// throw. createSession/join/선택/finish/transition 모두 실제 DB insert/update.

export type DrizzleDb = BetterSQLite3Database<typeof schema>;

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: RoomStatus,
    public readonly to: RoomStatus,
  ) {
    super(`illegal transition: ${from} → ${to}. Allowed: ${(ALLOWED_TRANSITIONS[from] ?? []).join(', ') || '(none)'}`);
    this.name = 'IllegalTransitionError';
  }
}

export class SessionNotFoundError extends Error {
  constructor(public readonly sessionId: string) {
    super(`session not found: ${sessionId}`);
    this.name = 'SessionNotFoundError';
  }
}

export interface SessionManagerOptions {
  /** Defaults to `true`. When true, a `db` is required. */
  persist?: boolean;
  db?: DrizzleDb;
}

export interface TransitionPatch {
  submissionId?: string;
  scheduledAt?: string | number;
  workerStep?: WorkerStep;
  erpRefNo?: string;
  errorLog?: string;
  loserId?: string;
}

export interface TransitionInput {
  sessionId: string;
  to: RoomStatus;
  patch?: TransitionPatch;
}

export interface SelectGameInput {
  sessionId: string;
  actorId: string;
  gameId: string;
}

export interface StartGameInput {
  sessionId: string;
  actorId: string;
}

export interface FinishGameInput {
  sessionId: string;
  loserId: string;
  results: GameResult[];
}

// Unified snapshot shape — superset of SessionSnapshot and RoomStatePayload.
// Matches RoomStatePayload exactly (optional undefined for late-arriving
// fields) so that `broadcastRoomState(io, snap)` typechecks without a cast,
// and adds SessionSnapshot-only extras (`id`, `selectedGameId`, `startedAt`,
// `createdAt`). `scheduledAt` is always stored as an ISO string (the wire
// contract) — numeric epoch-ms inputs from the plan-API patch are converted.
export interface UnifiedSnap extends RoomStatePayload {
  id: string; // SessionSnapshot field (mirror of sessionId)
  selectedGameId: string | null;
  startedAt: number | null;
  createdAt: number;
}

export class SessionManager {
  private readonly snaps = new Map<string, UnifiedSnap>();
  private readonly byRoomCode = new Map<string, string>();
  private readonly persist: boolean;
  private readonly db: DrizzleDb | undefined;

  // Constructor supports both dev4's `new SessionManager(db)` (used by
  // app.ts/B11 routes) and the plan's `new SessionManager({ persist?, db? })`.
  constructor(arg?: DrizzleDb | SessionManagerOptions) {
    if (arg && isDrizzleDb(arg)) {
      this.db = arg;
      this.persist = true;
    } else {
      const opts = (arg ?? {}) as SessionManagerOptions;
      this.persist = opts.persist ?? true;
      this.db = opts.db;
      if (this.persist && !this.db) {
        throw new Error(
          'SessionManager: persist=true requires a `db` (drizzle BetterSQLite3Database). '
            + 'Pass { persist: false } for in-memory-only mode, or supply { db }.'
        );
      }
    }
  }

  // ---------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------

  getById(sessionId: string): UnifiedSnap | null {
    const s = this.snaps.get(sessionId);
    return s ? { ...s } : null;
  }

  getByRoomCode(roomCode: string): UnifiedSnap | null {
    const id = this.byRoomCode.get(roomCode);
    return id ? this.getById(id) : null;
  }

  // ---------------------------------------------------------------------
  // Dev4 B11 API — register RoomStatePayload directly
  // ---------------------------------------------------------------------

  register(snap: RoomStatePayload): UnifiedSnap {
    const unified: UnifiedSnap = {
      id: snap.sessionId,
      sessionId: snap.sessionId,
      roomCode: snap.roomCode,
      status: snap.status,
      hostId: snap.hostId,
      players: snap.players,
      selectedGameId: snap.game?.id ?? null,
      startedAt: null,
      createdAt: Date.now(),
      updatedAt: snap.updatedAt ?? new Date().toISOString(),
      ...(snap.game !== undefined ? { game: snap.game } : {}),
      ...(snap.loserId !== undefined ? { loserId: snap.loserId } : {}),
      ...(snap.results !== undefined ? { results: snap.results } : {}),
      ...(snap.submissionId !== undefined ? { submissionId: snap.submissionId } : {}),
      ...(snap.scheduledAt !== undefined ? { scheduledAt: snap.scheduledAt } : {}),
      ...(snap.workerStep !== undefined ? { workerStep: snap.workerStep } : {}),
      ...(snap.erpRefNo !== undefined ? { erpRefNo: snap.erpRefNo } : {}),
      ...(snap.errorLog !== undefined ? { errorLog: snap.errorLog } : {}),
    };
    this.snaps.set(unified.id, unified);
    this.byRoomCode.set(unified.roomCode, unified.id);
    this.upsertRow(unified);
    return unified;
  }

  // ---------------------------------------------------------------------
  // Plan API — full lifecycle
  // ---------------------------------------------------------------------

  createSession(input: CreateSessionInput): UnifiedSnap {
    const id = randomUUID();
    const roomCode = generateRoomCode(new Set(this.byRoomCode.keys()));
    const now = Date.now();
    const host: Player = {
      id: randomUUID(),
      name: input.name,
      isHost: true,
      connected: true,
    };
    const snap: UnifiedSnap = {
      id,
      sessionId: id,
      roomCode,
      status: 'PREPARING',
      hostId: host.id,
      players: [host],
      selectedGameId: null,
      startedAt: null,
      createdAt: now,
      updatedAt: new Date(now).toISOString(),
      // loserId/results/submissionId/scheduledAt/workerStep/erpRefNo/errorLog
      // stay unset (undefined) — RoomStatePayload-compatible optional fields.
    };
    this.snaps.set(id, snap);
    this.byRoomCode.set(roomCode, id);

    if (this.persist && this.db) {
      const nowDate = new Date(now);
      this.db
        .insert(schema.sessions)
        .values({
          id,
          roomCode,
          status: 'PREPARING',
          hostId: host.id,
          createdAt: nowDate,
          updatedAt: nowDate,
        })
        .run();
    }
    return snap;
  }

  join(input: JoinSessionInput): UnifiedSnap {
    const id = this.byRoomCode.get(input.roomCode);
    const snap = id ? this.snaps.get(id) : undefined;
    if (!snap) {
      throw new Error(`Session not found for room code ${input.roomCode}`);
    }
    if (snap.status !== 'PREPARING') {
      throw new Error(`session already started (status=${snap.status}); not in PREPARING`);
    }
    const player: Player = {
      id: randomUUID(),
      name: input.name,
      isHost: false,
      connected: true,
    };
    snap.players.push(player);
    snap.updatedAt = new Date().toISOString();
    this.touchDb(snap.id);
    return snap;
  }

  selectGame(input: SelectGameInput): UnifiedSnap {
    const snap = this.requireSession(input.sessionId);
    this.requireHost(snap, input.actorId);
    snap.selectedGameId = input.gameId;
    snap.updatedAt = new Date().toISOString();

    if (this.persist && this.db) {
      this.db
        .update(schema.sessions)
        .set({ gameId: input.gameId, updatedAt: new Date() })
        .where(eq(schema.sessions.id, snap.id))
        .run();
    }
    return snap;
  }

  startGame(input: StartGameInput): UnifiedSnap {
    const snap = this.requireSession(input.sessionId);
    this.requireHost(snap, input.actorId);
    if (!isAllowedTransition(snap.status, 'PLAYING')) {
      throw new IllegalTransitionError(snap.status, 'PLAYING');
    }
    snap.status = 'PLAYING';
    snap.startedAt = Date.now();
    snap.updatedAt = new Date().toISOString();

    if (this.persist && this.db) {
      this.db
        .update(schema.sessions)
        .set({ status: 'PLAYING', updatedAt: new Date() })
        .where(eq(schema.sessions.id, snap.id))
        .run();
    }
    return snap;
  }

  finishGame(input: FinishGameInput): UnifiedSnap {
    const snap = this.requireSession(input.sessionId);
    if (!isAllowedTransition(snap.status, 'FINISHED')) {
      throw new IllegalTransitionError(snap.status, 'FINISHED');
    }
    snap.status = 'FINISHED';
    snap.loserId = input.loserId;
    snap.results = input.results;
    snap.updatedAt = new Date().toISOString();

    if (this.persist && this.db) {
      this.db
        .update(schema.sessions)
        .set({
          status: 'FINISHED',
          loserId: input.loserId,
          updatedAt: new Date(),
        })
        .where(eq(schema.sessions.id, snap.id))
        .run();
    }
    return snap;
  }

  transitionStatus({ sessionId, to, patch }: TransitionInput): UnifiedSnap {
    const snap = this.snaps.get(sessionId);
    if (!snap) throw new SessionNotFoundError(sessionId);
    if (!isAllowedTransition(snap.status, to)) {
      throw new IllegalTransitionError(snap.status, to);
    }
    snap.status = to;
    if (patch) {
      if (patch.submissionId !== undefined) snap.submissionId = patch.submissionId;
      if (patch.scheduledAt !== undefined) {
        snap.scheduledAt =
          typeof patch.scheduledAt === 'number'
            ? new Date(patch.scheduledAt).toISOString()
            : patch.scheduledAt;
      }
      if (patch.workerStep !== undefined) snap.workerStep = patch.workerStep;
      if (patch.erpRefNo !== undefined) snap.erpRefNo = patch.erpRefNo;
      if (patch.errorLog !== undefined) snap.errorLog = patch.errorLog;
      if (patch.loserId !== undefined) snap.loserId = patch.loserId;
    }
    snap.updatedAt = new Date().toISOString();

    if (this.persist && this.db) {
      this.db
        .update(schema.sessions)
        .set({
          status: snap.status,
          loserId: snap.loserId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(schema.sessions.id, snap.id))
        .run();
    }
    return snap;
  }

  // Convenience helper for B11 route — returns the snap as a strict
  // RoomStatePayload (used by `broadcastRoomState`).  UnifiedSnap already
  // satisfies that shape structurally, but this formalises the assignment.
  toRoomStatePayload(snap: UnifiedSnap): RoomStatePayload {
    return snap;
  }

  // 4B 워커가 RUNNING 단계 내부에서 workerStep 만 갱신할 때 사용.
  // transitionStatus 는 RUNNING→RUNNING self-loop 를 차단하므로 별도 메서드 필요.
  // status 자체는 변경하지 않으며, snap 의 workerStep + updatedAt 만 갱신.
  updateWorkerStep(sessionId: string, workerStep: WorkerStep): UnifiedSnap {
    const snap = this.requireSession(sessionId);
    if (snap.status !== 'RUNNING') {
      throw new Error(
        `updateWorkerStep requires RUNNING status, got ${snap.status} for session ${sessionId}`,
      );
    }
    snap.workerStep = workerStep;
    snap.updatedAt = new Date().toISOString();
    this.touchDb(snap.id);
    return snap;
  }

  // ---------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------

  private requireSession(sessionId: string): UnifiedSnap {
    const snap = this.snaps.get(sessionId);
    if (!snap) throw new SessionNotFoundError(sessionId);
    return snap;
  }

  private requireHost(snap: UnifiedSnap, actorId: string): void {
    if (snap.hostId !== actorId) {
      throw new Error('host only: this action requires the room host');
    }
  }

  private touchDb(sessionId: string): void {
    if (!this.persist || !this.db) return;
    this.db
      .update(schema.sessions)
      .set({ updatedAt: new Date() })
      .where(eq(schema.sessions.id, sessionId))
      .run();
  }

  // For `register(snap)` — upserts the sessions row (dev4 B11 path expects
  // FK-safe insert even when the session was never createSession()'d).
  private upsertRow(snap: UnifiedSnap): void {
    if (!this.persist || !this.db) return;
    const now = new Date();
    this.db
      .insert(schema.sessions)
      .values({
        id: snap.id,
        roomCode: snap.roomCode,
        status: snap.status,
        hostId: snap.hostId,
        gameId: snap.selectedGameId ?? null,
        loserId: snap.loserId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.sessions.id,
        set: {
          status: snap.status,
          gameId: snap.selectedGameId ?? null,
          loserId: snap.loserId ?? null,
          updatedAt: now,
        },
      })
      .run();
  }
}

// Duck-type test: drizzle BetterSQLite3Database has `insert`/`update`/`select`
// methods. SessionManagerOptions does not. This lets the constructor accept
// either shape without breaking either call site.
function isDrizzleDb(x: unknown): x is DrizzleDb {
  return (
    !!x
    && typeof x === 'object'
    && typeof (x as { insert?: unknown }).insert === 'function'
    && typeof (x as { update?: unknown }).update === 'function'
  );
}
