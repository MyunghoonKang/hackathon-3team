/**
 * shared game mode 지원 테스트
 * - registry: game:mode 메타 파싱
 * - io: player:submit 에서 playerId override (shared 모드)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { Server as IOServer } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import * as fs from 'node:fs/promises';
import { GameRegistry } from '../src/server/games/registry';
import { SessionManager } from '../src/server/session/manager';
import { attachIo } from '../src/server/io';
import { createDb } from '../src/server/db/client';

// ─── Registry 테스트 ───────────────────────────────────────────

describe('GameRegistry — game:mode', () => {
  const tmpSeparated = './games/zz_test_separated.html';
  const tmpShared    = './games/zz_test_shared.html';
  const tmpNoMode    = './games/zz_test_nomode.html';

  const base = (mode?: string) => `
    <html><head>
      <meta name="game:title" content="테스트게임" />
      <meta name="game:min-players" content="2" />
      <meta name="game:max-players" content="8" />
      <meta name="game:description" content="설명" />
      <meta name="game:compare" content="max" />
      ${mode ? `<meta name="game:mode" content="${mode}" />` : ''}
    </head><body></body></html>
  `;

  beforeEach(async () => {
    await fs.writeFile(tmpSeparated, base('separated'));
    await fs.writeFile(tmpShared,    base('shared'));
    await fs.writeFile(tmpNoMode,    base());          // mode 태그 없음
  });

  afterEach(async () => {
    await Promise.all([
      fs.unlink(tmpSeparated).catch(() => {}),
      fs.unlink(tmpShared).catch(() => {}),
      fs.unlink(tmpNoMode).catch(() => {}),
    ]);

  });

  it('reads mode=separated from meta tag', async () => {
    const reg = new GameRegistry({ dir: './games', watch: false });
    await reg.scan();
    const g = reg.list().find(x => x.filename === 'zz_test_separated.html');
    expect(g?.mode).toBe('separated');
  });

  it('reads mode=shared from meta tag', async () => {
    const reg = new GameRegistry({ dir: './games', watch: false });
    await reg.scan();
    const g = reg.list().find(x => x.filename === 'zz_test_shared.html');
    expect(g?.mode).toBe('shared');
  });

  it('defaults mode to separated when meta tag is absent', async () => {
    const reg = new GameRegistry({ dir: './games', watch: false });
    await reg.scan();
    const g = reg.list().find(x => x.filename === 'zz_test_nomode.html');
    expect(g?.mode).toBe('separated');
  });
});

// ─── Socket.IO player:submit playerId override 테스트 ─────────

describe('io — player:submit playerId override (shared game)', () => {
  let httpServer: ReturnType<typeof createServer>;
  let ioServer: IOServer;
  let mgr: SessionManager;
  let registry: GameRegistry;
  let port: number;

  const vaultKey = Buffer.alloc(32, 0x42);

  beforeEach(async () => {
    const db = createDb(':memory:');
    mgr = new SessionManager(db);

    registry = new GameRegistry({ dir: './games', watch: false });
    await registry.scan();

    httpServer = createServer();
    ioServer = new IOServer(httpServer, { cors: { origin: '*' } });
    attachIo(ioServer, { mgr, registry });

    await new Promise<void>(resolve => httpServer.listen(0, resolve));
    port = (httpServer.address() as { port: number }).port;
  });

  afterEach(async () => {
    await new Promise<void>(resolve => ioServer.close(() => resolve()));
    await new Promise<void>(resolve => httpServer.close(() => resolve()));
  });

  function connect(): ClientSocket {
    return ioc(`http://localhost:${port}`, { forceNew: true });
  }

  it('separated: submit uses socket owner playerId', async () => {
    // 방 생성 + 게임 선택 + 시작 흐름
    const gameId = registry.list().find(g => g.mode === 'separated')?.id;
    if (!gameId) return; // 게임 없으면 skip

    const hostSocket = connect();
    const guestSocket = connect();

    try {
      // 호스트가 방 생성
      const snap = await new Promise<any>(resolve =>
        hostSocket.emit('session:create', { name: '호스트' }, (res: any) => resolve(res.session))
      );

      // 게스트가 참여
      await new Promise<any>(resolve =>
        guestSocket.emit('session:join', { roomCode: snap.roomCode, name: '게스트' }, (res: any) => resolve(res))
      );

      // 게임 선택 + 시작
      await new Promise<any>(resolve =>
        hostSocket.emit('game:select', { gameId }, (res: any) => resolve(res))
      );
      await new Promise<any>(resolve =>
        hostSocket.emit('game:start', {}, (res: any) => resolve(res))
      );

      // 각자 자기 값 제출 (playerId 없이)
      const hostResult  = await new Promise<any>(resolve =>
        hostSocket.emit('player:submit', { value: 10 }, (res: any) => resolve(res))
      );
      const guestResult = await new Promise<any>(resolve =>
        guestSocket.emit('player:submit', { value: 5 }, (res: any) => resolve(res))
      );

      expect(hostResult.ok).toBe(true);
      expect(guestResult.ok).toBe(true);
    } finally {
      hostSocket.disconnect();
      guestSocket.disconnect();
    }
  });

  it('shared: one socket can submit on behalf of another player', async () => {
    const gameId = registry.list()[0]?.id;
    if (!gameId) return;

    const hostSocket  = connect();
    const guestSocket = connect();

    try {
      const snap = await new Promise<any>(resolve =>
        hostSocket.emit('session:create', { name: '호스트' }, (res: any) => resolve(res.session))
      );
      const joinRes = await new Promise<any>(resolve =>
        guestSocket.emit('session:join', { roomCode: snap.roomCode, name: '게스트' }, (res: any) => resolve(res))
      );
      const guestId = joinRes.playerId as string;

      await new Promise<any>(resolve =>
        hostSocket.emit('game:select', { gameId }, (res: any) => resolve(res))
      );
      await new Promise<any>(resolve =>
        hostSocket.emit('game:start', {}, (res: any) => resolve(res))
      );

      // 호스트가 게스트 대신 제출 (shared 룰렛 시나리오)
      const proxyResult = await new Promise<any>(resolve =>
        hostSocket.emit('player:submit', { value: 1, playerId: guestId }, (res: any) => resolve(res))
      );
      expect(proxyResult.ok).toBe(true);

      // 호스트 자신도 제출 → 전원 완료 → 패자 결정
      const hostResult = await new Promise<any>(resolve =>
        hostSocket.emit('player:submit', { value: 0 }, (res: any) => resolve(res))
      );
      expect(hostResult.ok).toBe(true);
    } finally {
      hostSocket.disconnect();
      guestSocket.disconnect();
    }
  });
});
