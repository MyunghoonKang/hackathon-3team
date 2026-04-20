import type { Server as IOServer, Socket } from 'socket.io';
import type { SessionManager } from './session/manager';
import type { GameRegistry } from './games/registry';
import { GameRunner } from './games/runner';
import {
  SOCKET_EVENT_ROOM_STATE,
  type RoomStatePayload,
  SocketCreateSession,
  SocketJoin,
  SocketSelectGame,
  SocketSubmitResult,
} from '../shared/protocol';
import { randomUUID } from 'node:crypto';

// 공동 계약: 모든 RoomStatus 전이는 mgr.transitionStatus() 직후 이 유틸로 broadcast.
// 채널 'room:state' 단일 — 다른 이벤트명 추가 금지.
// io=null 허용 (테스트/서버 미기동 시 no-op). 프로덕션은 index.ts 에서 주입.
export function broadcastRoomState(
  io: IOServer | null,
  snap: RoomStatePayload,
): void {
  if (!io) return;
  io.to(snap.sessionId).emit(SOCKET_EVENT_ROOM_STATE, snap);
}

interface Ctx { mgr: SessionManager; registry: GameRegistry; }
interface SocketMeta { sessionId: string; playerId: string; }

const runners = new Map<string, GameRunner>();
const socketMeta = new WeakMap<Socket, SocketMeta>();

export function attachIo(io: IOServer, ctx: Ctx): void {
  io.on('connection', socket => {
    socket.on('session:create', (raw, ack) => {
      const parsed = SocketCreateSession.safeParse(raw);
      if (!parsed.success) return ack?.({ error: 'invalid' });
      const snap = ctx.mgr.createSession(parsed.data);
      socketMeta.set(socket, { sessionId: snap.sessionId, playerId: snap.hostId });
      socket.join(snap.sessionId);
      broadcastRoomState(io, snap);
      ack?.({ ok: true, session: snap });
    });

    socket.on('session:join', (raw, ack) => {
      const parsed = SocketJoin.safeParse(raw);
      if (!parsed.success) return ack?.({ error: 'invalid' });
      try {
        const snap = ctx.mgr.join(parsed.data);
        const me = snap.players[snap.players.length - 1]!;
        socketMeta.set(socket, { sessionId: snap.sessionId, playerId: me.id });
        socket.join(snap.sessionId);
        broadcastRoomState(io, snap);
        ack?.({ ok: true, session: snap, playerId: me.id });
      } catch (e: unknown) {
        ack?.({ error: (e as Error).message });
      }
    });

    socket.on('game:select', (raw, ack) => {
      const parsed = SocketSelectGame.safeParse(raw);
      if (!parsed.success) return ack?.({ error: 'invalid' });
      const m = socketMeta.get(socket);
      if (!m) return ack?.({ error: 'no session' });
      try {
        const snap = ctx.mgr.selectGame({ sessionId: m.sessionId, actorId: m.playerId, gameId: parsed.data.gameId });
        broadcastRoomState(io, snap);
        ack?.({ ok: true });
      } catch (e: unknown) {
        ack?.({ error: (e as Error).message });
      }
    });

    socket.on('game:start', (_raw, ack) => {
      const m = socketMeta.get(socket);
      if (!m) return ack?.({ error: 'no session' });
      try {
        const snap = ctx.mgr.startGame({ sessionId: m.sessionId, actorId: m.playerId });
        const game = snap.selectedGameId ? ctx.registry.get(snap.selectedGameId) : undefined;
        if (!game) throw new Error('game not found');
        if (snap.players.length < game.minPlayers) throw new Error(`need at least ${game.minPlayers} players`);
        const runner = new GameRunner(snap.sessionId, snap.players.map(p => p.id), game.compare);
        runners.set(snap.sessionId, runner);
        const seed = randomUUID();
        broadcastRoomState(io, snap);
        io.to(snap.sessionId).emit('game:begin', { session: snap, game, seed });
        ack?.({ ok: true });
      } catch (e: unknown) {
        ack?.({ error: (e as Error).message });
      }
    });

    socket.on('player:submit', (raw, ack) => {
      const parsed = SocketSubmitResult.safeParse(raw);
      if (!parsed.success) return ack?.({ error: 'invalid' });
      const m = socketMeta.get(socket);
      if (!m) return ack?.({ error: 'no session' });
      const runner = runners.get(m.sessionId);
      if (!runner) return ack?.({ error: 'no active game' });
      try {
        runner.submit(m.playerId, parsed.data.value);
        if (runner.isComplete()) {
          const outcome = runner.resolve();
          const snap = ctx.mgr.finishGame({
            sessionId: m.sessionId,
            loserId: outcome.loserId,
            results: outcome.results,
          });
          runners.delete(m.sessionId);
          broadcastRoomState(io, snap);
        } else {
          const sessionSnap = ctx.mgr.getById(m.sessionId);
          io.to(m.sessionId).emit('game:progress', {
            submittedCount: sessionSnap ? sessionSnap.players.length - runner.missingPlayers().length : 0,
            total: sessionSnap?.players.length ?? 0,
          });
        }
        ack?.({ ok: true });
      } catch (e: unknown) {
        ack?.({ error: (e as Error).message });
      }
    });

    socket.on('disconnect', () => {
      const m = socketMeta.get(socket);
      if (m) socket.leave(m.sessionId);
    });
  });
}
