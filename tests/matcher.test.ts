import { describe, it, expect } from 'vitest';
import { matchCardRow, type CardRow } from '../src/server/worker/matcher';
import rows from './fixtures/cardRows.json';

const ROWS = rows as CardRow[];

// fixture (tests/fixtures/cardRows.json · 2026-04-20 KST):
//   - sunginNb '68763054' / 스타벅스코리아  / 13:29:26 KST (= 04:29:26 UTC)
//   - sunginNb '68759921' / 김밥천국 강남점 / 12:30:15 KST (= 03:30:15 UTC)
//   - sunginNb '68761138' / 투썸플레이스    / 12:55:02 KST (= 03:55:02 UTC)
// 모두 cardCd '5105545000378130' (롯데 8130).

describe('matchCardRow', () => {
  it('cardCd 일치 + 가장 가까운 시각 row 선택 (target 13:29 KST → 스타벅스)', () => {
    const hit = matchCardRow(ROWS, {
      cardCd: '5105545000378130',
      sessionDate: '20260420',
      sessionStartedAt: new Date('2026-04-20T04:29:00Z'),
      toleranceMinutes: 60,
    });
    expect(hit?.sunginNb).toBe('68763054');
  });

  it('cardCd 불일치 시 null', () => {
    const hit = matchCardRow(ROWS, {
      cardCd: '0000000000000000',
      sessionDate: '20260420',
      sessionStartedAt: new Date('2026-04-20T04:29:00Z'),
      toleranceMinutes: 60,
    });
    expect(hit).toBeNull();
  });

  it('issDt 불일치 시 null (당일 거래 한정)', () => {
    const hit = matchCardRow(ROWS, {
      cardCd: '5105545000378130',
      sessionDate: '20260419',
      sessionStartedAt: new Date('2026-04-19T04:29:00Z'),
      toleranceMinutes: 60,
    });
    expect(hit).toBeNull();
  });

  it('동일 날짜 다중 후보 중 가장 가까운 시각 선택 (target 13:00 KST → 12:55 투썸)', () => {
    const hit = matchCardRow(ROWS, {
      cardCd: '5105545000378130',
      sessionDate: '20260420',
      sessionStartedAt: new Date('2026-04-20T04:00:00Z'),
      toleranceMinutes: 120,
    });
    expect(hit?.sunginNb).toBe('68761138');
  });

  it('toleranceMinutes 밖이면 null (5분 윈도우 · 가장 가까운 후보도 90분 밖)', () => {
    const hit = matchCardRow(ROWS, {
      cardCd: '5105545000378130',
      sessionDate: '20260420',
      sessionStartedAt: new Date('2026-04-20T01:00:00Z'),
      toleranceMinutes: 5,
    });
    expect(hit).toBeNull();
  });

  it('excludeSunginNbs 의 row 제외 후 차순위 선택 (멱등성 가드)', () => {
    const hit = matchCardRow(ROWS, {
      cardCd: '5105545000378130',
      sessionDate: '20260420',
      sessionStartedAt: new Date('2026-04-20T04:29:00Z'),
      toleranceMinutes: 60,
      excludeSunginNbs: ['68763054'],
    });
    expect(hit?.sunginNb).toBe('68761138');
  });

  it('모든 row 가 excludeSunginNbs 에 포함되면 null', () => {
    const hit = matchCardRow(ROWS, {
      cardCd: '5105545000378130',
      sessionDate: '20260420',
      sessionStartedAt: new Date('2026-04-20T04:29:00Z'),
      toleranceMinutes: 180,
      excludeSunginNbs: ['68763054', '68759921', '68761138'],
    });
    expect(hit).toBeNull();
  });
});
