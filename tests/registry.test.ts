import { describe, it, expect, beforeEach } from 'vitest';
import { GameRegistry } from '../src/server/games/registry';

describe('GameRegistry', () => {
  let reg: GameRegistry;
  beforeEach(() => {
    reg = new GameRegistry({ dir: './games', watch: false });
  });

  it('loads game meta from number-guess.html', async () => {
    await reg.scan();
    const all = reg.list();
    const g = all.find(x => x.filename === 'number-guess.html');
    expect(g).toBeDefined();
    expect(g!.title).toBe('숫자 맞추기');
    expect(g!.compare).toBe('max');
    expect(g!.minPlayers).toBe(2);
    expect(g!.maxPlayers).toBe(8);
  });

  it('rejects HTML file missing required meta', async () => {
    const fs = await import('node:fs/promises');
    await fs.writeFile('./games/invalid.html', '<html><body></body></html>');
    await reg.scan();
    expect(reg.list().find(x => x.filename === 'invalid.html')).toBeUndefined();
    await fs.unlink('./games/invalid.html');
  });

  it('emits game:added event on scan', async () => {
    const seen: string[] = [];
    reg.on('added', g => seen.push(g.filename));
    await reg.scan();
    expect(seen).toContain('number-guess.html');
  });
});
