import { describe, it, expect } from 'vitest';
import { resolveMode, canClickSubmit } from '../src/server/worker/mode';
import { runSubmission, WORKER_STEP_ORDER } from '../src/server/worker/index';
import { MOCK_CARD_ROWS } from '../src/server/worker/mock/seed';

describe('WORKER_MODE 해석', () => {
  it('env 미설정 시 mock 기본값', () => {
    expect(resolveMode({})).toBe('mock');
  });

  it('mock / dryrun / live 3 값 모두 허용', () => {
    expect(resolveMode({ WORKER_MODE: 'mock' })).toBe('mock');
    expect(resolveMode({ WORKER_MODE: 'dryrun' })).toBe('dryrun');
    expect(resolveMode({ WORKER_MODE: 'live' })).toBe('live');
  });

  it('대소문자 섞여도 허용 (대문자 env 실수 방지)', () => {
    expect(resolveMode({ WORKER_MODE: 'LIVE' })).toBe('live');
    expect(resolveMode({ WORKER_MODE: 'DryRun' })).toBe('dryrun');
  });

  it('정의되지 않은 값은 throw', () => {
    expect(() => resolveMode({ WORKER_MODE: 'xyz' })).toThrow(/Invalid WORKER_MODE/);
  });
});

describe('canClickSubmit 안전 게이트', () => {
  it('live + ERP_CONFIRM_SUBMIT=1 조합에서만 true', () => {
    expect(canClickSubmit({ WORKER_MODE: 'live', ERP_CONFIRM_SUBMIT: '1' })).toBe(true);
  });

  it('live 여도 ERP_CONFIRM_SUBMIT 없으면 false', () => {
    expect(canClickSubmit({ WORKER_MODE: 'live' })).toBe(false);
  });

  it('mock 모드에서는 ERP_CONFIRM_SUBMIT 있어도 false', () => {
    expect(canClickSubmit({ WORKER_MODE: 'mock', ERP_CONFIRM_SUBMIT: '1' })).toBe(false);
  });

  it('dryrun 모드에서도 false', () => {
    expect(canClickSubmit({ WORKER_MODE: 'dryrun', ERP_CONFIRM_SUBMIT: '1' })).toBe(false);
  });
});

describe('runSubmission 스텁', () => {
  it('mock 모드 기본으로 FAILED + 미구현 errorLog 반환 (4A 언블록용 스텁)', async () => {
    const prev = process.env.WORKER_MODE;
    process.env.WORKER_MODE = 'mock';
    try {
      const result = await runSubmission('test-submission-1');
      expect(result.status).toBe('FAILED');
      expect(result.errorLog).toMatch(/stub|미구현/);
    } finally {
      if (prev === undefined) delete process.env.WORKER_MODE;
      else process.env.WORKER_MODE = prev;
    }
  });
});

describe('WORKER_STEP_ORDER', () => {
  it('login · cardModal · formFill · approval 순서 고정', () => {
    expect(WORKER_STEP_ORDER).toEqual(['login', 'cardModal', 'formFill', 'approval']);
  });
});

describe('MOCK_CARD_ROWS seed', () => {
  it('최소 1개의 row 존재', () => {
    expect(MOCK_CARD_ROWS.length).toBeGreaterThan(0);
  });

  it('각 row 의 supAm + vatAm 은 sunginAm 과 일치 (B8 매칭 전제조건)', () => {
    for (const row of MOCK_CARD_ROWS) {
      expect(row.supAm + row.vatAm).toBe(row.sunginAm);
    }
  });

  it('sunginNb 는 고유 (dedupe 기준 키)', () => {
    const ids = MOCK_CARD_ROWS.map((r) => r.sunginNb);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
