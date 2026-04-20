import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  isAllowedTransition,
  type RoomStatePayload,
  type RoomStatus,
} from '../../shared/protocol';
import * as schema from '../db/schema';

// 3A 가 A5 에서 풀 구현할 예정. 지금은 4A 가 B11 라우트 언블록용으로 선제 조립.
// 제공 API (3A A5 머지 시 교체 대상):
//   - register(snap): 초기 snap 등록 + sessions DB persist (FK 보장)
//   - getById(sessionId): snap 조회
//   - transitionStatus({ sessionId, to, patch? }): ALLOWED_TRANSITIONS 검증 후 mutate + persist
//
// 이전 run 버그 흡수: SessionManager.persist 옵션이 빠져 sessions 테이블 empty 상태로
// submissions.sessionId FK 가 터졌음. 여기선 register/transition 마다 sessions 를
// upsert 해 무조건 row 가 존재하도록 강제.

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: RoomStatus,
    public readonly to: RoomStatus,
  ) {
    super(`illegal transition ${from} → ${to}`);
    this.name = 'IllegalTransitionError';
  }
}

export class SessionNotFoundError extends Error {
  constructor(public readonly sessionId: string) {
    super(`session not found: ${sessionId}`);
    this.name = 'SessionNotFoundError';
  }
}

export interface TransitionInput {
  sessionId: string;
  to: RoomStatus;
  patch?: Partial<RoomStatePayload>;
}

export class SessionManager {
  private snaps = new Map<string, RoomStatePayload>();
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  register(snap: RoomStatePayload): void {
    this.snaps.set(snap.sessionId, snap);
    this.persist(snap);
  }

  getById(sessionId: string): RoomStatePayload | null {
    return this.snaps.get(sessionId) ?? null;
  }

  transitionStatus({ sessionId, to, patch }: TransitionInput): RoomStatePayload {
    const snap = this.snaps.get(sessionId);
    if (!snap) throw new SessionNotFoundError(sessionId);
    if (!isAllowedTransition(snap.status, to)) {
      throw new IllegalTransitionError(snap.status, to);
    }
    const next: RoomStatePayload = {
      ...snap,
      ...(patch ?? {}),
      status: to,
      updatedAt: new Date().toISOString(),
    };
    this.snaps.set(sessionId, next);
    this.persist(next);
    return next;
  }

  private persist(snap: RoomStatePayload): void {
    const now = new Date();
    this.db
      .insert(schema.sessions)
      .values({
        id: snap.sessionId,
        roomCode: snap.roomCode,
        status: snap.status,
        hostId: snap.hostId,
        gameId: snap.game?.id ?? null,
        loserId: snap.loserId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.sessions.id,
        set: {
          status: snap.status,
          loserId: snap.loserId ?? null,
          gameId: snap.game?.id ?? null,
          updatedAt: now,
        },
      })
      .run();
  }
}
