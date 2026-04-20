import { describe, it, expect } from 'vitest';
import { GameRunner } from '../src/server/games/runner';

describe('GameRunner', () => {
  it('collects submissions and picks loser by max rule', () => {
    const r = new GameRunner('sess1', ['p1', 'p2', 'p3'], 'max');
    r.submit('p1', 5);
    r.submit('p2', 20);
    r.submit('p3', 8);
    expect(r.isComplete()).toBe(true);
    const outcome = r.resolve();
    expect(outcome.loserId).toBe('p2');   // max loses
    expect(outcome.results).toHaveLength(3);
  });

  it('picks loser by min rule', () => {
    const r = new GameRunner('s', ['a', 'b'], 'min');
    r.submit('a', 1);
    r.submit('b', 2);
    expect(r.resolve().loserId).toBe('a'); // min loses
  });

  it('rejects duplicate submission from same player', () => {
    const r = new GameRunner('s', ['a', 'b'], 'max');
    r.submit('a', 5);
    expect(() => r.submit('a', 100)).toThrow(/duplicate/i);
  });

  it('rejects submission from unknown player', () => {
    const r = new GameRunner('s', ['a', 'b'], 'max');
    expect(() => r.submit('z', 1)).toThrow(/not a participant/i);
  });

  it('is not complete until all players submit', () => {
    const r = new GameRunner('s', ['a', 'b', 'c'], 'max');
    r.submit('a', 1);
    r.submit('b', 2);
    expect(r.isComplete()).toBe(false);
    r.submit('c', 3);
    expect(r.isComplete()).toBe(true);
  });

  it('tiebreak: random pick among tied extremes', () => {
    const r = new GameRunner('s', ['a', 'b'], 'max');
    r.submit('a', 10);
    r.submit('b', 10);
    const outcome = r.resolve();
    expect(['a', 'b']).toContain(outcome.loserId);
  });

  it('missingPlayers() reports who has not submitted', () => {
    const r = new GameRunner('s', ['a', 'b', 'c'], 'max');
    r.submit('b', 1);
    expect(r.missingPlayers()).toEqual(['a', 'c']);
  });
});
