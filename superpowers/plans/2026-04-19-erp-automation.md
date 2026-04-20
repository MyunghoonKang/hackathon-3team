# ERP 자동화 Implementation Plan (Plan B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan A(게임 플랫폼)에서 결정된 패자의 계정으로 더존 아마란스 ERP에 법인카드 지출결의서를 자동 상신하는 자격증명 볼트·제출 큐·스케줄러·Playwright 워커 파이프라인을 구축한다.

**Architecture:** Plan A 서버에 `CredentialVault`(AES-256-GCM) · `SubmissionQueue`(상태머신) · `Scheduler`(node-cron, 분당 스캔) · `AutomationWorker`(Playwright-Node)를 추가한다. 워커는 ERP Exploration에서 확정된 UI·그리드 API 경로로 ERP를 조작하되, 카드내역 매칭·폼 채우기·결재상신 팝업 단계를 독립 모듈로 분리해 각각 로컬 목업 HTML에 대해 먼저 검증한다. 데모 안전장치로 환경변수 `WORKER_MODE=mock|live|dryrun` 3단 토글을 둔다.

**Tech Stack:** Plan A 기존 스택 + `playwright` (Chromium) · `node-cron` · Node 내장 `crypto` · `date-fns-tz`(Asia/Seoul 계산) · Vitest (단위 테스트) · 로컬 목업 HTML (통합 테스트)

---

## 참고 스펙 & 사전 조건

- 설계: `docs/superpowers/specs/2026-04-19-erp-proposal-game-automation-design.md` (§4.4 워커 · §4.5 DB · §6.4 에러 · §6.6 데모 리스크)
- ERP 필드: `docs/superpowers/specs/2026-04-19-erp-exploration-field-findings.md` (전체 필드·API·매칭 전략)
- **UI 와이어프레임 (Claude Design):** `docs/design/project/Wireframes.html` — Task 3 (CredentialForm)·Task 11 (ResultView의 QUEUED/RUNNING/COMPLETED/FAILED 단계) 시각 스펙. 화면 5~7 참조.
- **사전 조건:** Plan A가 Task 1~7까지 완료되어 있어 Express + Socket.io 서버, SQLite/Drizzle, 세션·게임 런너, React 프론트가 구동 가능한 상태여야 한다. 패자가 결정된 직후의 훅(`runner.ts`의 outcome broadcast 시점)에 Plan B의 `SubmissionQueue.enqueue()`를 호출해 연결한다.
- **ERP 안전 규칙 (사용자 feedback 메모리):** 실 ERP 쓰기 동작(상신/저장)은 사용자 확인 없이 절대 수행 금지. 본 플랜의 `live` 모드 최종 단계는 항상 `--confirm` 플래그 또는 UI 확인 버튼을 요구한다.

## 파일 구조

Plan A의 `src/server/` 아래에 다음을 추가·수정한다.

```
src/
├── server/
│   ├── db/
│   │   ├── schema.ts                # [수정] submissions, credentials 테이블 추가
│   │   └── migrations/              # [생성] drizzle-kit generate 산출물
│   ├── vault/
│   │   ├── crypto.ts                # AES-256-GCM encrypt/decrypt
│   │   ├── vault.ts                 # CredentialVault (DB + crypto)
│   │   └── types.ts                 # Credential 타입
│   ├── submissions/
│   │   ├── queue.ts                 # SubmissionQueue (enqueue/claim/complete/fail)
│   │   ├── scheduler.ts             # node-cron 분당 스캔 + 워커 디스패치
│   │   ├── scheduling.ts            # 다음 영업일 09:00 Asia/Seoul 계산
│   │   └── types.ts                 # SubmissionStatus enum + payload 타입
│   ├── worker/
│   │   ├── index.ts                 # 워커 엔트리 (runSubmission)
│   │   ├── mode.ts                  # WORKER_MODE 환경변수 파서
│   │   ├── browser.ts               # Playwright 브라우저 풀
│   │   ├── login.ts                 # ERP 로그인
│   │   ├── navigate.ts              # 지출결의서작성 이동
│   │   ├── cardModal.ts             # 카드사용내역 모달 + 매칭
│   │   ├── formFill.ts              # 제목/용도/내용/예산 채우기
│   │   ├── approval.ts              # 결재상신 팝업 + dzEditor
│   │   ├── matcher.ts               # 카드 row 매칭 규칙 (순수 함수)
│   │   ├── mock/
│   │   │   ├── erp-login.html
│   │   │   ├── erp-writeform.html
│   │   │   ├── erp-approval.html
│   │   │   └── seed.ts              # 목업에 주입할 카드 데이터
│   │   └── screenshots.ts           # 각 단계 스크린샷 저장 유틸
│   └── routes/
│       ├── credentials.ts           # [생성] POST /api/credentials
│       └── submissions.ts           # [생성] POST /api/submissions/:id/run 등
├── web/
│   └── components/
│       ├── CredentialForm.tsx       # [수정] Plan A Task 13 스텁의 alert을 실제 vault+enqueue 호출로 교체
│       └── ResultView.tsx           # [수정] QUEUED/RUNNING/COMPLETED/FAILED 단계의 본문 렌더 (Plan A 골격에 디테일 추가)
├── shared/
│   └── protocol.ts                  # [수정] credentials · submissions zod 스키마 추가
├── tests/
│   ├── vault.test.ts
│   ├── queue.test.ts
│   ├── scheduling.test.ts
│   ├── matcher.test.ts
│   ├── worker-mock.test.ts          # 목업 HTML에 대해 전체 파이프라인
│   └── fixtures/
│       └── cardRows.json
└── .env.example                     # [수정] VAULT_MASTER_KEY, WORKER_MODE, ERP_* 추가
```

**원칙**
- 워커는 각 단계를 **순수 함수 + 브라우저 컨텍스트 인자**로 분리. `matcher.ts`처럼 DOM 밖에서 검증 가능한 로직은 따로 빼서 Vitest로 빠르게 검증.
- `mock/` 폴더의 정적 HTML은 ERP Exploration의 실제 DOM selector를 그대로 흉내내서 **동일 코드가 `live`/`mock` 두 모드에서 모두 통과**하게 만든다.
- 자격증명은 메모리에 필요한 순간(`worker/index.ts` 내부 decrypt)에만 평문화. 로그·스크린샷에 절대 노출 금지.

---

## Task 1: DB 스키마 확장 (`submissions`, `credentials`)

**Files:**
- Modify: `src/server/db/schema.ts`
- Create: `src/server/db/migrations/0002_submissions_credentials.sql` (drizzle-kit 생성)
- Test: `tests/db.test.ts` (새 테이블 CRUD round-trip)

- [ ] **Step 1.1: 실패하는 스키마 테스트 작성**

```typescript
// tests/db.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from '../src/server/db/client';
import { submissions, credentials } from '../src/server/db/schema';

describe('submissions/credentials schema', () => {
  const db = createDb(':memory:');

  it('submissions insert+select round-trip', async () => {
    await db.insert(submissions).values({
      id: 's1', sessionId: 'sess1', loserUserId: 'u1',
      status: 'QUEUED', scheduledAt: new Date('2026-04-20T00:00:00Z'),
      sunginNb: null, erpRefNo: null, errorLog: null,
    });
    const [row] = await db.select().from(submissions);
    expect(row.status).toBe('QUEUED');
    expect(row.sessionId).toBe('sess1');
  });

  it('credentials upsert replaces existing blob', async () => {
    const enc = Buffer.from('aa', 'hex');
    await db.insert(credentials).values({ userId: 'u1', ciphertext: enc, iv: enc, authTag: enc });
    await db.insert(credentials).values({ userId: 'u1', ciphertext: Buffer.from('bb','hex'), iv: enc, authTag: enc })
      .onConflictDoUpdate({ target: credentials.userId, set: { ciphertext: Buffer.from('bb','hex') } });
    const rows = await db.select().from(credentials);
    expect(rows).toHaveLength(1);
    expect(rows[0].ciphertext.toString('hex')).toBe('bb');
  });
});
```

- [ ] **Step 1.2: 테스트 실행 — 컴파일 실패해야 정상**

Run: `npx vitest run tests/db.test.ts`
Expected: FAIL — `submissions` / `credentials` 심볼 없음

- [ ] **Step 1.3: `src/server/db/schema.ts` 에 테이블 추가**

```typescript
import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';

export const submissions = sqliteTable('submissions', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  loserUserId: text('loser_user_id').notNull(),
  status: text('status', {
    enum: ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED_AUTH', 'FAILED_NO_TXN', 'FAILED_UNEXPECTED_UI', 'FAILED_OTHER', 'ABORTED'],
  }).notNull(),
  mode: text('mode', { enum: ['live', 'mock', 'dryrun'] }).notNull().default('mock'),
  scheduledAt: integer('scheduled_at', { mode: 'timestamp_ms' }).notNull(),
  claimedAt: integer('claimed_at', { mode: 'timestamp_ms' }),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  sunginNb: text('sungin_nb'),             // 매칭된 카드 승인번호
  erpRefNo: text('erp_ref_no'),            // 상신 성공 시 ERP 응답 번호
  errorLog: text('error_log'),
  screenshotDir: text('screenshot_dir'),
  attendeeNames: text('attendee_names').notNull(), // JSON array
  titleOverride: text('title_override'),
  purposeKind: text('purpose_kind', { enum: ['coffee', 'lunch'] }).notNull().default('lunch'),
});

export const credentials = sqliteTable('credentials', {
  userId: text('user_id').primaryKey(),
  ciphertext: blob('ciphertext', { mode: 'buffer' }).notNull(),
  iv: blob('iv', { mode: 'buffer' }).notNull(),
  authTag: blob('auth_tag', { mode: 'buffer' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
});
```

- [ ] **Step 1.4: 마이그레이션 생성 + 실행**

```bash
npx drizzle-kit generate
npx tsx src/server/db/migrate.ts
```
Expected: `data/sqlite.db` 에 두 테이블 생성

- [ ] **Step 1.5: 테스트 재실행 → PASS**

Run: `npx vitest run tests/db.test.ts`
Expected: PASS

- [ ] **Step 1.6: 커밋**

```bash
git add src/server/db/schema.ts src/server/db/migrations tests/db.test.ts
git commit -m "feat(db): add submissions and credentials tables"
```

---

## Task 2: `CredentialVault` (AES-256-GCM)

**Files:**
- Create: `src/server/vault/crypto.ts`, `src/server/vault/vault.ts`, `src/server/vault/types.ts`
- Modify: `.env.example`, `src/server/config.ts` (`VAULT_MASTER_KEY` 로딩)
- Test: `tests/vault.test.ts`

- [x] **Step 2.1: 실패하는 벌트 라운드트립 테스트**

```typescript
// tests/vault.test.ts
import { describe, it, expect } from 'vitest';
import { createDb } from '../src/server/db/client';
import { CredentialVault } from '../src/server/vault/vault';

const KEY = Buffer.alloc(32, 7); // 32바이트 테스트 키

describe('CredentialVault', () => {
  it('encrypts, stores, and decrypts credentials', async () => {
    const db = createDb(':memory:');
    const vault = new CredentialVault(db, KEY);
    await vault.save('u1', { loginId: 'alice', password: 'p@ss!' });
    const out = await vault.load('u1');
    expect(out).toEqual({ loginId: 'alice', password: 'p@ss!' });
  });

  it('different calls produce different ciphertexts (random IV)', async () => {
    const db = createDb(':memory:');
    const vault = new CredentialVault(db, KEY);
    await vault.save('u1', { loginId: 'a', password: 'b' });
    const first = await db.query.credentials.findFirst();
    await vault.save('u1', { loginId: 'a', password: 'b' });
    const second = await db.query.credentials.findFirst();
    expect(first!.ciphertext.equals(second!.ciphertext)).toBe(false);
  });

  it('returns null when record missing', async () => {
    const db = createDb(':memory:');
    const vault = new CredentialVault(db, KEY);
    expect(await vault.load('missing')).toBeNull();
  });

  it('throws on wrong key (auth tag mismatch)', async () => {
    const db = createDb(':memory:');
    const vaultA = new CredentialVault(db, KEY);
    await vaultA.save('u1', { loginId: 'a', password: 'b' });
    const vaultB = new CredentialVault(db, Buffer.alloc(32, 9));
    await expect(vaultB.load('u1')).rejects.toThrow();
  });
});
```

- [x] **Step 2.2: 테스트 실행 → FAIL (모듈 없음)**

Run: `npx vitest run tests/vault.test.ts`

- [x] **Step 2.3: `src/server/vault/crypto.ts` 작성**

```typescript
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGO = 'aes-256-gcm';

export function encrypt(key: Buffer, plaintext: string): { ciphertext: Buffer; iv: Buffer; authTag: Buffer } {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

export function decrypt(key: Buffer, ciphertext: Buffer, iv: Buffer, authTag: Buffer): string {
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
```

- [x] **Step 2.4: `src/server/vault/types.ts`**

```typescript
export interface ErpCredential {
  loginId: string;
  password: string;
}
```

- [x] **Step 2.5: `src/server/vault/vault.ts`**

```typescript
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { credentials } from '../db/schema';
import { encrypt, decrypt } from './crypto';
import type { ErpCredential } from './types';

export class CredentialVault {
  constructor(private db: BetterSQLite3Database<any>, private key: Buffer) {
    if (key.length !== 32) throw new Error('VAULT_MASTER_KEY must be 32 bytes');
  }

  async save(userId: string, cred: ErpCredential): Promise<void> {
    const { ciphertext, iv, authTag } = encrypt(this.key, JSON.stringify(cred));
    await this.db
      .insert(credentials)
      .values({ userId, ciphertext, iv, authTag, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: credentials.userId,
        set: { ciphertext, iv, authTag, updatedAt: new Date() },
      });
  }

  async load(userId: string): Promise<ErpCredential | null> {
    const row = await this.db.query.credentials.findFirst({ where: eq(credentials.userId, userId) });
    if (!row) return null;
    const json = decrypt(this.key, row.ciphertext, row.iv, row.authTag);
    return JSON.parse(json) as ErpCredential;
  }
}
```

- [x] **Step 2.6: `.env.example` + `config.ts` 갱신**

```
# .env.example 추가
VAULT_MASTER_KEY=<hex-encoded 32-byte key, generate with: openssl rand -hex 32>
WORKER_MODE=mock
ERP_BASE_URL=https://erp.meissa.ai
ERP_COMPANY_CODE=meissa
```

`src/server/config.ts` 에 `vaultKey: Buffer.from(process.env.VAULT_MASTER_KEY!, 'hex')` 추가.

- [x] **Step 2.7: 테스트 PASS 확인 + 커밋**

```bash
npx vitest run tests/vault.test.ts
git add src/server/vault .env.example src/server/config.ts tests/vault.test.ts
git commit -m "feat(vault): add AES-256-GCM credential vault"
```

---

## Task 3: 자격증명 등록 API + `CredentialForm` 본문 채우기

**Files:**
- Create: `src/server/routes/credentials.ts`
- Modify: `src/server/app.ts` (라우트 마운트), `src/shared/protocol.ts` (zod 스키마), `src/web/components/CredentialForm.tsx` (Plan A Task 13 의 스텁을 본문 채움)
- Test: `tests/credentials-route.test.ts` (supertest)

> **변경 사항 (UX 통합):** CredentialPage 라우트는 더 이상 존재하지 않는다. Plan A Task 13에서 만든 `CredentialForm` 컴포넌트가 `ResultView` 내부에 인라인으로 노출되며, 본 Task에서 alert 스텁을 실제 vault 저장 + queue enqueue 호출로 채운다. 호출이 성공하면 서버가 RoomStatus를 `CREDENTIAL_INPUT → QUEUED`로 transition한 뒤 `room:state`를 broadcast하므로, 이 컴포넌트는 별도의 navigation을 수행하지 않는다.

- [ ] **Step 3.1: 공용 스키마 추가 (`src/shared/protocol.ts`)**

```typescript
export const credentialInputSchema = z.object({
  userId: z.string().min(1),
  loginId: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});
export type CredentialInput = z.infer<typeof credentialInputSchema>;
```

- [ ] **Step 3.2: 실패하는 라우트 테스트**

```typescript
// tests/credentials-route.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/server/app';

describe('POST /api/credentials', () => {
  it('stores credentials and returns 204', async () => {
    const { app, vault } = await buildApp({ inMemory: true, vaultKey: Buffer.alloc(32, 1) });
    const res = await request(app)
      .post('/api/credentials')
      .send({ userId: 'u1', loginId: 'alice', password: 'secret' });
    expect(res.status).toBe(204);
    expect(await vault.load('u1')).toEqual({ loginId: 'alice', password: 'secret' });
  });

  it('400 on invalid body', async () => {
    const { app } = await buildApp({ inMemory: true, vaultKey: Buffer.alloc(32, 1) });
    const res = await request(app).post('/api/credentials').send({ userId: '' });
    expect(res.status).toBe(400);
  });
});
```

Run: `npx vitest run tests/credentials-route.test.ts` → FAIL

- [ ] **Step 3.3: `src/server/routes/credentials.ts`**

```typescript
import { Router } from 'express';
import type { CredentialVault } from '../vault/vault';
import { credentialInputSchema } from '../../shared/protocol';

export function credentialsRouter(vault: CredentialVault): Router {
  const r = Router();
  r.post('/', async (req, res) => {
    const parsed = credentialInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { userId, loginId, password } = parsed.data;
    await vault.save(userId, { loginId, password });
    res.status(204).end();
  });
  return r;
}
```

- [ ] **Step 3.4: `src/server/app.ts` 에서 `app.use('/api/credentials', credentialsRouter(vault))` 마운트**

- [ ] **Step 3.5: 테스트 PASS 확인**

Run: `npx vitest run tests/credentials-route.test.ts` → PASS

- [ ] **Step 3.6: Plan A Task 13의 `CredentialForm` 본문 와이어링**

기존 alert 스텁을 다음 두 호출로 교체. `props.sessionId`·`props.loserId`는 이미 `ResultView`가 `RoomStatePayload`에서 전달.

```tsx
// src/web/components/CredentialForm.tsx
import { useState } from 'react';

export function CredentialForm({ sessionId, loserId }: { sessionId: string; loserId: string }) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      // 1) vault 저장
      const saveRes = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: loserId, loginId, password }),
      });
      if (!saveRes.ok) throw new Error(await saveRes.text());

      // 2) submission enqueue. 서버가 SessionManager.transitionStatus(QUEUED, { submissionId, scheduledAt })
      //    호출 후 broadcastRoomState 로 broadcast → 모든 클라이언트의 ResultView가 자동으로 QUEUED 표시.
      const enqueue = await fetch(`/api/sessions/${sessionId}/submissions`, { method: 'POST' });
      if (!enqueue.ok) throw new Error(await enqueue.text());
      // navigation 없음. room:state 가 곧 들어오면서 폼이 사라지고 QUEUED 뷰로 자동 전환됨.
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="credential-form">
      <h2>ERP 자격증명 입력 (패자)</h2>
      <p>회사코드 <code>meissa</code> 는 자동 입력됩니다. ID/PW만 주세요.</p>
      <label>ID<input value={loginId} onChange={e => setLoginId(e.target.value)} autoComplete="off" required /></label>
      <label>PW<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required /></label>
      {error && <p role="alert">{error}</p>}
      <button disabled={busy}>{busy ? '저장 중…' : '저장하고 상신 예약'}</button>
    </form>
  );
}
```

> 추가로, 사용자가 `FINISHED` 상태에서 "ERP 자격증명 입력하기" CTA를 누른 시점에 `POST /api/sessions/:id/credential-input` (또는 동일한 의미의 endpoint)을 호출해 `FINISHED → CREDENTIAL_INPUT` 전이를 일으키는 것이 자연스럽다. 이 호출은 Step 11.2의 `submissions.ts` 라우터에 함께 추가하거나 별도 라우트로 분리한다 (구현 시 선택).

- [ ] **Step 3.7: 커밋**

```bash
git add src/server/routes/credentials.ts src/server/app.ts src/shared/protocol.ts \
        src/web/components/CredentialForm.tsx tests/credentials-route.test.ts
git commit -m "feat(credentials): vault + POST /api/credentials + CredentialForm wiring"
```

---

## Task 4: `SubmissionQueue` 상태머신

**Files:**
- Create: `src/server/submissions/queue.ts`, `src/server/submissions/types.ts`
- Test: `tests/queue.test.ts`

- [ ] **Step 4.1: 실패하는 큐 테스트**

```typescript
// tests/queue.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createDb } from '../src/server/db/client';
import { SubmissionQueue } from '../src/server/submissions/queue';

describe('SubmissionQueue', () => {
  it('enqueue creates QUEUED row', async () => {
    const db = createDb(':memory:');
    const q = new SubmissionQueue(db);
    const id = await q.enqueue({
      sessionId: 's', loserUserId: 'u1',
      scheduledAt: new Date('2026-04-20T00:00:00Z'),
      attendeeNames: ['강명훈', '홍길동'],
      purposeKind: 'lunch', mode: 'mock',
    });
    const row = await db.query.submissions.findFirst();
    expect(row?.status).toBe('QUEUED');
    expect(row?.id).toBe(id);
  });

  it('claimNext returns due item and marks RUNNING atomically', async () => {
    const db = createDb(':memory:');
    const q = new SubmissionQueue(db);
    await q.enqueue({
      sessionId: 's', loserUserId: 'u1',
      scheduledAt: new Date('2026-04-19T00:00:00Z'),
      attendeeNames: ['a'], purposeKind: 'coffee', mode: 'mock',
    });
    const claimed = await q.claimNext(new Date('2026-04-19T09:00:00Z'));
    expect(claimed?.status).toBe('RUNNING');
    expect(await q.claimNext(new Date('2026-04-19T09:00:00Z'))).toBeNull();
  });

  it('claimNext skips items scheduled in the future', async () => {
    const db = createDb(':memory:');
    const q = new SubmissionQueue(db);
    await q.enqueue({
      sessionId: 's', loserUserId: 'u1',
      scheduledAt: new Date('2026-04-20T09:00:00Z'),
      attendeeNames: ['a'], purposeKind: 'lunch', mode: 'mock',
    });
    expect(await q.claimNext(new Date('2026-04-19T09:00:00Z'))).toBeNull();
  });

  it('complete/fail transition RUNNING correctly', async () => {
    const db = createDb(':memory:');
    const q = new SubmissionQueue(db);
    const id = await q.enqueue({
      sessionId: 's', loserUserId: 'u1',
      scheduledAt: new Date(0), attendeeNames: [], purposeKind: 'lunch', mode: 'mock',
    });
    await q.claimNext(new Date());
    await q.complete(id, { erpRefNo: 'ERP-1', sunginNb: '68763054' });
    const row = await db.query.submissions.findFirst();
    expect(row?.status).toBe('COMPLETED');
    expect(row?.erpRefNo).toBe('ERP-1');
  });

  it('recover resets stuck RUNNING items older than threshold', async () => {
    const db = createDb(':memory:');
    const q = new SubmissionQueue(db);
    const id = await q.enqueue({
      sessionId: 's', loserUserId: 'u1',
      scheduledAt: new Date(0), attendeeNames: [], purposeKind: 'lunch', mode: 'mock',
    });
    await q.claimNext(new Date(Date.now() - 60 * 60 * 1000)); // 1h ago
    const reset = await q.recoverStuck({ thresholdMs: 30 * 60 * 1000 });
    expect(reset).toBe(1);
    const row = await db.query.submissions.findFirst();
    expect(row?.status).toBe('QUEUED');
  });
});
```

Run: `npx vitest run tests/queue.test.ts` → FAIL

- [ ] **Step 4.2: `src/server/submissions/types.ts`**

```typescript
export type SubmissionStatus =
  | 'QUEUED' | 'RUNNING' | 'COMPLETED'
  | 'FAILED_AUTH' | 'FAILED_NO_TXN' | 'FAILED_UNEXPECTED_UI' | 'FAILED_OTHER' | 'ABORTED';

export type WorkerMode = 'live' | 'mock' | 'dryrun';

export interface EnqueueInput {
  sessionId: string;
  loserUserId: string;
  scheduledAt: Date;
  attendeeNames: string[];
  purposeKind: 'coffee' | 'lunch';
  mode: WorkerMode;
  titleOverride?: string | null;
}

export interface CompleteInput {
  erpRefNo?: string | null;
  sunginNb?: string | null;
  screenshotDir?: string | null;
}

export interface FailInput {
  status: Exclude<SubmissionStatus, 'QUEUED' | 'RUNNING' | 'COMPLETED'>;
  errorLog: string;
  screenshotDir?: string | null;
}
```

- [ ] **Step 4.3: `src/server/submissions/queue.ts`**

```typescript
import { and, eq, lt, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { submissions } from '../db/schema';
import type { EnqueueInput, CompleteInput, FailInput } from './types';

export class SubmissionQueue {
  constructor(private db: BetterSQLite3Database<any>) {}

  async enqueue(input: EnqueueInput): Promise<string> {
    const id = randomUUID();
    await this.db.insert(submissions).values({
      id,
      sessionId: input.sessionId,
      loserUserId: input.loserUserId,
      status: 'QUEUED',
      mode: input.mode,
      scheduledAt: input.scheduledAt,
      attendeeNames: JSON.stringify(input.attendeeNames),
      titleOverride: input.titleOverride ?? null,
      purposeKind: input.purposeKind,
    });
    return id;
  }

  async claimNext(now: Date): Promise<{ id: string; status: 'RUNNING' } | null> {
    // atomic single-row transition (SQLite serializes writes)
    const candidate = await this.db
      .select({ id: submissions.id })
      .from(submissions)
      .where(and(eq(submissions.status, 'QUEUED'), lt(submissions.scheduledAt, new Date(now.getTime() + 1))))
      .limit(1);
    if (candidate.length === 0) return null;
    const { id } = candidate[0];
    const updated = await this.db
      .update(submissions)
      .set({ status: 'RUNNING', claimedAt: now })
      .where(and(eq(submissions.id, id), eq(submissions.status, 'QUEUED')))
      .returning({ id: submissions.id });
    if (updated.length === 0) return null; // race lost
    return { id, status: 'RUNNING' };
  }

  async complete(id: string, out: CompleteInput): Promise<void> {
    await this.db.update(submissions)
      .set({ status: 'COMPLETED', completedAt: new Date(), erpRefNo: out.erpRefNo ?? null, sunginNb: out.sunginNb ?? null, screenshotDir: out.screenshotDir ?? null })
      .where(eq(submissions.id, id));
  }

  async fail(id: string, f: FailInput): Promise<void> {
    await this.db.update(submissions)
      .set({ status: f.status, completedAt: new Date(), errorLog: f.errorLog, screenshotDir: f.screenshotDir ?? null })
      .where(eq(submissions.id, id));
  }

  async recoverStuck({ thresholdMs }: { thresholdMs: number }): Promise<number> {
    const cutoff = new Date(Date.now() - thresholdMs);
    const res = await this.db.update(submissions)
      .set({ status: 'QUEUED', claimedAt: null })
      .where(and(eq(submissions.status, 'RUNNING'), lt(submissions.claimedAt, cutoff)))
      .returning({ id: submissions.id });
    return res.length;
  }

  async loadForRun(id: string) {
    return await this.db.query.submissions.findFirst({ where: eq(submissions.id, id) });
  }
}
```

- [ ] **Step 4.4: 테스트 PASS → 커밋**

```bash
npx vitest run tests/queue.test.ts
git add src/server/submissions tests/queue.test.ts
git commit -m "feat(submissions): add state-machine queue with recovery"
```

---

## Task 5: 다음 영업일 09:00 스케줄 계산 + `Scheduler`

**Files:**
- Create: `src/server/submissions/scheduling.ts`, `src/server/submissions/scheduler.ts`
- Modify: `package.json` (`date-fns-tz`, `node-cron`), `src/server/index.ts` (Scheduler start)
- Test: `tests/scheduling.test.ts`

- [ ] **Step 5.1: 실패하는 스케줄 계산 테스트**

```typescript
// tests/scheduling.test.ts
import { describe, it, expect } from 'vitest';
import { nextBusinessDayNineAm } from '../src/server/submissions/scheduling';

describe('nextBusinessDayNineAm (Asia/Seoul)', () => {
  it('weekday evening → next day 09:00 KST', () => {
    // 2026-04-20 (Mon) 20:00 KST = 2026-04-20T11:00Z
    const at = nextBusinessDayNineAm(new Date('2026-04-20T11:00:00Z'));
    expect(at.toISOString()).toBe('2026-04-21T00:00:00.000Z'); // 09:00 KST = 00:00Z
  });

  it('Friday evening → next Monday 09:00 KST', () => {
    // 2026-04-24 (Fri) 20:00 KST
    const at = nextBusinessDayNineAm(new Date('2026-04-24T11:00:00Z'));
    expect(at.toISOString()).toBe('2026-04-27T00:00:00.000Z');
  });

  it('Saturday → Monday', () => {
    const at = nextBusinessDayNineAm(new Date('2026-04-25T11:00:00Z'));
    expect(at.toISOString()).toBe('2026-04-27T00:00:00.000Z');
  });

  it('weekday 08:00 KST → same day 09:00 KST', () => {
    // 2026-04-21 (Tue) 08:00 KST = 2026-04-20T23:00Z
    const at = nextBusinessDayNineAm(new Date('2026-04-20T23:00:00Z'));
    expect(at.toISOString()).toBe('2026-04-21T00:00:00.000Z');
  });
});
```

Run: `npx vitest run tests/scheduling.test.ts` → FAIL

- [ ] **Step 5.2: `src/server/submissions/scheduling.ts`**

```typescript
import { zonedTimeToUtc, utcToZonedTime } from 'date-fns-tz';
import { addDays, setHours, setMinutes, setSeconds, setMilliseconds, getDay } from 'date-fns';

const TZ = 'Asia/Seoul';

export function nextBusinessDayNineAm(now: Date = new Date()): Date {
  const kstNow = utcToZonedTime(now, TZ);
  let candidate = setMilliseconds(setSeconds(setMinutes(setHours(kstNow, 9), 0), 0), 0);
  // 이미 오늘 09:00 지났거나 주말이면 다음 영업일로
  if (candidate.getTime() <= kstNow.getTime()) candidate = addDays(candidate, 1);
  while (getDay(candidate) === 0 || getDay(candidate) === 6) candidate = addDays(candidate, 1);
  return zonedTimeToUtc(candidate, TZ);
}
```

- [ ] **Step 5.3: 테스트 PASS 확인**

Run: `npx vitest run tests/scheduling.test.ts` → PASS

- [ ] **Step 5.4: `src/server/submissions/scheduler.ts`**

```typescript
import cron from 'node-cron';
import type { SubmissionQueue } from './queue';

export interface SchedulerDeps {
  queue: SubmissionQueue;
  runSubmission: (id: string) => Promise<void>;
  logger?: { info: (m: string, meta?: any) => void; error: (m: string, meta?: any) => void };
}

export class Scheduler {
  private task?: cron.ScheduledTask;
  constructor(private deps: SchedulerDeps) {}

  start(): void {
    this.task = cron.schedule('* * * * *', () => this.tick().catch((e) =>
      this.deps.logger?.error('scheduler tick failed', { err: String(e) }),
    ));
  }

  async tick(): Promise<void> {
    await this.deps.queue.recoverStuck({ thresholdMs: 30 * 60 * 1000 });
    const claimed = await this.deps.queue.claimNext(new Date());
    if (!claimed) return;
    this.deps.logger?.info('dispatching submission', { id: claimed.id });
    // fire-and-forget; runSubmission must update queue status
    this.deps.runSubmission(claimed.id).catch((e) =>
      this.deps.logger?.error('runSubmission threw', { id: claimed.id, err: String(e) }),
    );
  }

  stop(): void { this.task?.stop(); }
}
```

- [ ] **Step 5.5: `src/server/index.ts` 에서 Scheduler 기동**

```typescript
import { Scheduler } from './submissions/scheduler';
import { runSubmission } from './worker';
const scheduler = new Scheduler({ queue, runSubmission: (id) => runSubmission(id, { vault, queue }), logger: console });
scheduler.start();
```

- [ ] **Step 5.6: 커밋**

```bash
git add src/server/submissions tests/scheduling.test.ts src/server/index.ts package.json
git commit -m "feat(scheduler): next-business-day 09:00 KST cron dispatcher"
```

---

## Task 6: 워커 스캐폴딩 + `WORKER_MODE` 토글 + 목업 HTML

**Files:**
- Create: `src/server/worker/index.ts`, `src/server/worker/mode.ts`, `src/server/worker/browser.ts`, `src/server/worker/screenshots.ts`
- Create: `src/server/worker/mock/erp-login.html`, `erp-writeform.html`, `erp-approval.html`, `seed.ts`
- Test: `tests/worker-mock.test.ts` (기본 라우팅만)

- [x] **Step 6.1: `src/server/worker/mode.ts`**

```typescript
import type { WorkerMode } from '../submissions/types';

export function resolveMode(env: NodeJS.ProcessEnv): WorkerMode {
  const v = (env.WORKER_MODE ?? 'mock').toLowerCase();
  if (v === 'live' || v === 'mock' || v === 'dryrun') return v;
  throw new Error(`Invalid WORKER_MODE: ${v}`);
}
```

- [x] **Step 6.2: 목업 HTML 3개 — ERP Exploration selector 그대로 흉내**

`src/server/worker/mock/erp-login.html`:
```html
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>ERP Login (mock)</title></head>
<body>
  <form id="loginForm">
    <input id="companyCode" value="meissa" disabled>
    <input id="userId" name="userId" placeholder="ID">
    <button id="nextBtn" type="button">다음</button>
    <input id="password" name="password" type="password" placeholder="PW" style="display:none">
    <button id="loginBtn" type="button" style="display:none">로그인</button>
  </form>
  <script>
    document.getElementById('nextBtn').addEventListener('click', () => {
      document.getElementById('password').style.display = '';
      document.getElementById('loginBtn').style.display = '';
    });
    document.getElementById('loginBtn').addEventListener('click', () => {
      window.location.href = 'erp-writeform.html';
    });
  </script>
</body></html>
```

`src/server/worker/mock/erp-writeform.html` — 제목 input, 용도 셀 편집기, 예산 lookup 버튼, [카드사용내역] 버튼, [결재상신] 버튼을 모두 포함하고, `window.Grids` 를 흉내낸 스텁 객체를 제공. (코드 전체는 `seed.ts` 가 `innerHTML` 로 주입)

`src/server/worker/mock/erp-approval.html` — `<iframe id="editorView_UBAP001" src="about:blank">` + [상신] 버튼 + 합의 슬롯 placeholder.

- [x] **Step 6.3: `src/server/worker/mock/seed.ts` — 목업용 카드 데이터**

```typescript
export const MOCK_CARD_ROWS = [
  {
    bankCd: '11', bankNm: '롯데카드',
    cardCd: '5105545000378130',
    cardNm: '롯데카드_강명훈(8130)',
    issDt: '20260406', issTime: '13:29:26',
    formatedIssDtTime: '2026-04-06 13:29:26',
    chainName: '스타벅스코리아', chainBusiness: '커피전문점',
    supAm: 4819, vatAm: 481, sunginAm: 5300,
    sunginNb: '68763054', payDt: '20260515',
  },
  // … lunch 변형 1~2건 추가
];
```

- [x] **Step 6.4: `src/server/worker/browser.ts` — Playwright 런처**

```typescript
import { chromium, type Browser, type BrowserContext } from 'playwright';

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  close(): Promise<void>;
}

export async function launchBrowser(opts: { headless: boolean }): Promise<BrowserSession> {
  const browser = await chromium.launch({ headless: opts.headless });
  const context = await browser.newContext();
  return { browser, context, close: async () => { await context.close(); await browser.close(); } };
}
```

- [x] **Step 6.5: `src/server/worker/screenshots.ts`**

```typescript
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';

export function makeScreenshotDir(submissionId: string): string {
  const dir = join('data', 'screenshots', submissionId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export async function snap(page: Page, dir: string, name: string): Promise<string> {
  const path = join(dir, `${Date.now()}-${name}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}
```

- [x] **Step 6.6: `src/server/worker/index.ts` — 전체 파이프라인 엔트리 (stub)**

```typescript
import { resolveMode } from './mode';
import { launchBrowser } from './browser';
import { makeScreenshotDir } from './screenshots';
import type { SubmissionQueue } from '../submissions/queue';
import type { CredentialVault } from '../vault/vault';

export interface RunDeps { queue: SubmissionQueue; vault: CredentialVault }

export async function runSubmission(id: string, deps: RunDeps): Promise<void> {
  const mode = resolveMode(process.env);
  const sub = await deps.queue.loadForRun(id);
  if (!sub) return;
  const dir = makeScreenshotDir(id);

  if (mode === 'dryrun') {
    await deps.queue.complete(id, { erpRefNo: `DRYRUN-${id}`, sunginNb: null, screenshotDir: dir });
    return;
  }

  const session = await launchBrowser({ headless: mode === 'live' });
  try {
    // 이후 Task 7~11 에서 채움
    await deps.queue.fail(id, { status: 'FAILED_OTHER', errorLog: 'not implemented', screenshotDir: dir });
  } finally {
    await session.close();
  }
}
```

- [x] **Step 6.7: Playwright 설치 + 스모크 테스트** (테스트 파일만 선커밋 · `npm i playwright` 는 3A A1 package.json 확정 후)

```bash
npm i playwright
npx playwright install chromium
```

```typescript
// tests/worker-mock.test.ts
import { describe, it, expect } from 'vitest';
import { resolveMode } from '../src/server/worker/mode';

describe('WORKER_MODE resolver', () => {
  it('defaults to mock', () => expect(resolveMode({})).toBe('mock'));
  it('accepts live/dryrun/mock', () => {
    expect(resolveMode({ WORKER_MODE: 'live' })).toBe('live');
    expect(resolveMode({ WORKER_MODE: 'dryrun' })).toBe('dryrun');
  });
  it('throws on junk', () => expect(() => resolveMode({ WORKER_MODE: 'xyz' })).toThrow());
});
```

- [x] **Step 6.8: 커밋**

```bash
git add src/server/worker package.json tests/worker-mock.test.ts
git commit -m "feat(worker): scaffold + mock HTML + mode toggle (live/mock/dryrun)"
```

---

## Task 7: ERP 로그인 모듈

**Files:**
- Create: `src/server/worker/login.ts`
- Modify: `src/server/worker/index.ts` (호출)
- Test: `tests/worker-login.test.ts` (목업 HTML 대상)

- [ ] **Step 7.1: 실패하는 로그인 테스트 (목업 기반)**

```typescript
// tests/worker-login.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { login } from '../src/server/worker/login';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK = pathToFileURL(join(__dirname, '../src/server/worker/mock/erp-login.html')).toString();

describe('login (mock)', () => {
  let browser: Browser, page: Page;
  beforeAll(async () => { browser = await chromium.launch(); page = await browser.newPage(); });
  afterAll(async () => { await browser.close(); });

  it('types ID, clicks 다음, types PW, clicks 로그인, navigates to writeform', async () => {
    await page.goto(MOCK);
    await login(page, { loginId: 'alice', password: 'pw' }, { loginUrl: MOCK });
    expect(page.url()).toContain('erp-writeform.html');
  });
});
```

Run: `npx vitest run tests/worker-login.test.ts` → FAIL

- [ ] **Step 7.2: `src/server/worker/login.ts`**

```typescript
import type { Page } from 'playwright';
import type { ErpCredential } from '../vault/types';

export interface LoginOptions {
  loginUrl: string;                // ex. https://erp.meissa.ai/#/login or mock file URL
  companyCode?: string;            // default: 'meissa'
  timeoutMs?: number;              // default: 30_000
}

export async function login(page: Page, cred: ErpCredential, opts: LoginOptions): Promise<void> {
  const timeout = opts.timeoutMs ?? 30_000;
  await page.goto(opts.loginUrl, { waitUntil: 'domcontentloaded', timeout });

  // 회사코드는 disabled — 단순 확인만
  const cc = await page.locator('#companyCode').inputValue().catch(() => '');
  if (opts.companyCode && cc && cc !== opts.companyCode) {
    throw new Error(`Unexpected company code: ${cc}`);
  }

  await page.locator('input[name="userId"], #userId').fill(cred.loginId);
  await page.getByRole('button', { name: '다음' }).click();
  await page.locator('input[name="password"], #password').fill(cred.password);
  await page.getByRole('button', { name: '로그인' }).click();

  // login 성공 판정: URL 이 /#/login 에서 벗어나거나 writeform 으로 이동
  await page.waitForLoadState('networkidle', { timeout });
  if (/\/#\/login\b/.test(page.url()) && !page.url().endsWith('erp-login.html')) {
    throw new LoginError(`still on login page: ${page.url()}`);
  }
}

export class LoginError extends Error {}
```

- [ ] **Step 7.3: `worker/index.ts` 에서 로그인 호출**

```typescript
// 기존 stub을 아래로 교체
const cred = await deps.vault.load(sub.loserUserId);
if (!cred) return deps.queue.fail(id, { status: 'FAILED_AUTH', errorLog: 'no credential', screenshotDir: dir });
const page = await session.context.newPage();
try {
  await login(page, cred, { loginUrl: loginUrlFor(mode) });
} catch (e) {
  await snap(page, dir, 'login-fail');
  return deps.queue.fail(id, { status: 'FAILED_AUTH', errorLog: String(e), screenshotDir: dir });
}
```

`loginUrlFor`: `mode==='mock' ? file://.../mock/erp-login.html : 'https://erp.meissa.ai/#/login'`.

- [ ] **Step 7.4: 테스트 PASS + 커밋**

```bash
npx vitest run tests/worker-login.test.ts
git add src/server/worker/login.ts src/server/worker/index.ts tests/worker-login.test.ts
git commit -m "feat(worker): ERP 2-step login automation"
```

---

## Task 8: 카드내역 모달 + 매칭 규칙

**Files:**
- Create: `src/server/worker/matcher.ts`, `src/server/worker/cardModal.ts`, `src/server/worker/navigate.ts`
- Test: `tests/matcher.test.ts` (순수 함수), `tests/worker-cardmodal.test.ts` (목업)

- [ ] **Step 8.1: 매칭 규칙 단위 테스트 (ERP Exploration §1 기준)**

```typescript
// tests/matcher.test.ts
import { describe, it, expect } from 'vitest';
import { matchCardRow, type CardRow } from '../src/server/worker/matcher';
import rows from './fixtures/cardRows.json' assert { type: 'json' };

describe('matchCardRow', () => {
  it('filters by cardCd (롯데 8130) and returns unique match', () => {
    const hit = matchCardRow(rows as CardRow[], {
      cardCd: '5105545000378130',
      sessionDate: '20260406',
      sessionStartedAt: new Date('2026-04-06T04:29:00Z'), // 13:29 KST
      toleranceMinutes: 60,
    });
    expect(hit?.sunginNb).toBe('68763054');
  });

  it('returns null when no row matches cardCd', () => {
    const hit = matchCardRow(rows as CardRow[], {
      cardCd: '0000000000000000',
      sessionDate: '20260406',
      sessionStartedAt: new Date('2026-04-06T04:29:00Z'),
      toleranceMinutes: 60,
    });
    expect(hit).toBeNull();
  });

  it('picks closest time when multiple rows on same day', () => {
    const many: CardRow[] = [
      { ...(rows[0] as any), sunginNb: 'A', issTime: '12:00:00', formatedIssDtTime: '2026-04-06 12:00:00' },
      { ...(rows[0] as any), sunginNb: 'B', issTime: '13:29:00', formatedIssDtTime: '2026-04-06 13:29:00' },
      { ...(rows[0] as any), sunginNb: 'C', issTime: '15:00:00', formatedIssDtTime: '2026-04-06 15:00:00' },
    ];
    const hit = matchCardRow(many, {
      cardCd: '5105545000378130', sessionDate: '20260406',
      sessionStartedAt: new Date('2026-04-06T04:30:00Z'), toleranceMinutes: 120,
    });
    expect(hit?.sunginNb).toBe('B');
  });

  it('rejects if previous sunginNb already submitted (idempotency)', () => {
    const hit = matchCardRow(rows as CardRow[], {
      cardCd: '5105545000378130', sessionDate: '20260406',
      sessionStartedAt: new Date('2026-04-06T04:29:00Z'), toleranceMinutes: 60,
      excludeSunginNbs: ['68763054'],
    });
    expect(hit).toBeNull();
  });
});
```

Fixture `tests/fixtures/cardRows.json` = ERP Exploration §1 JSON 예시 + 2~3건 추가.

Run: `npx vitest run tests/matcher.test.ts` → FAIL

- [ ] **Step 8.2: `src/server/worker/matcher.ts`**

```typescript
export interface CardRow {
  cardCd: string;
  issDt: string;             // YYYYMMDD
  issTime: string;           // HH:MM:SS
  formatedIssDtTime: string; // 'YYYY-MM-DD HH:MM:SS' (assume KST)
  sunginNb: string;
  supAm: number;
  vatAm: number;
  sunginAm: number;
  chainName?: string;
  payDt?: string;
}

export interface MatchCriteria {
  cardCd: string;
  sessionDate: string;           // YYYYMMDD
  sessionStartedAt: Date;        // UTC
  toleranceMinutes: number;
  excludeSunginNbs?: string[];
}

export function matchCardRow(rows: CardRow[], c: MatchCriteria): CardRow | null {
  const exclude = new Set(c.excludeSunginNbs ?? []);
  const sameCard = rows.filter(r => r.cardCd === c.cardCd && r.issDt === c.sessionDate && !exclude.has(r.sunginNb));
  if (sameCard.length === 0) return null;

  const target = c.sessionStartedAt.getTime();
  const toleranceMs = c.toleranceMinutes * 60_000;

  const withDelta = sameCard
    .map(r => ({ r, delta: Math.abs(Date.parse(`${r.formatedIssDtTime.replace(' ', 'T')}+09:00`) - target) }))
    .filter(({ delta }) => delta <= toleranceMs);
  if (withDelta.length === 0) return null;

  withDelta.sort((a, b) => a.delta - b.delta);
  return withDelta[0].r;
}
```

- [ ] **Step 8.3: 테스트 PASS 확인**

Run: `npx vitest run tests/matcher.test.ts` → PASS

- [ ] **Step 8.4: `src/server/worker/navigate.ts`**

```typescript
import type { Page } from 'playwright';
export async function openWriteForm(page: Page, baseUrl: string): Promise<void> {
  const url = `${baseUrl}/#/HP/APB1020/APB1020?formDTp=APB1020_00001&formId=22`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-orbit-id="APB1020WriteGridGrid"]', { timeout: 30_000 });
}
```

- [ ] **Step 8.5: `src/server/worker/cardModal.ts`**

```typescript
import type { Page } from 'playwright';
import { matchCardRow, type CardRow, type MatchCriteria } from './matcher';

export async function openCardModal(page: Page): Promise<void> {
  await page.locator('button').filter({ hasText: '카드사용내역' }).first().click();
  await page.waitForSelector('[data-orbit-id="cardDataGridTab1"]', { timeout: 30_000 });
}

export async function selectCardRow(page: Page, criteria: MatchCriteria): Promise<string> {
  // gridView 가 JSON rows 를 제공할 때까지 폴링
  const rows = await page.waitForFunction(() => {
    const el: any = document.querySelector('[data-orbit-id="cardDataGridTab1"]');
    const gv = el?.gridView;
    if (!gv) return null;
    const rows = gv.getDataSource().getJsonRows();
    return rows.length > 0 ? rows : null;
  }, null, { timeout: 30_000, polling: 500 });

  const jsonRows = (await rows.jsonValue()) as CardRow[];
  const picked = matchCardRow(jsonRows, criteria);
  if (!picked) throw new NoMatchError(`no card row for ${criteria.sessionDate} ${criteria.cardCd}`);

  const idx = jsonRows.findIndex(r => r.sunginNb === picked.sunginNb);
  await page.evaluate(({ idx }) => {
    const el: any = document.querySelector('[data-orbit-id="cardDataGridTab1"]');
    el.gridView.checkItem(idx, true);
  }, { idx });

  // 확인 버튼
  await page.locator('button:visible', { hasText: /^확인$/ }).first().click();
  return picked.sunginNb;
}

export class NoMatchError extends Error {}
```

- [ ] **Step 8.6: `worker/index.ts` 통합 + 커밋**

```typescript
import { openWriteForm } from './navigate';
import { openCardModal, selectCardRow, NoMatchError } from './cardModal';

await openWriteForm(page, baseUrlFor(mode));
await openCardModal(page);
try {
  var sunginNb = await selectCardRow(page, {
    cardCd: '5105545000378130',
    sessionDate: ymd(session.startedAt),
    sessionStartedAt: session.startedAt,
    toleranceMinutes: 180,
    excludeSunginNbs: await deps.queue.allSuccessfulSunginNbs(), // 멱등성
  });
} catch (e) {
  const status = e instanceof NoMatchError ? 'FAILED_NO_TXN' : 'FAILED_UNEXPECTED_UI';
  return deps.queue.fail(id, { status, errorLog: String(e), screenshotDir: dir });
}
```

```bash
git add src/server/worker tests/matcher.test.ts tests/fixtures
git commit -m "feat(worker): card row matching + gridView-based modal automation"
```

---

## Task 9: 폼 채우기 (제목/용도/내용/예산)

**Files:**
- Create: `src/server/worker/formFill.ts`
- Test: `tests/worker-formfill.test.ts` (목업)

- [ ] **Step 9.1: `src/server/worker/formFill.ts`**

```typescript
import type { Page } from 'playwright';

export interface FillInput {
  title: string;                 // ex. '04월 06일 음료 지출'
  purposeKind: 'coffee' | 'lunch';
  projectCode: string;           // '3009'
  budgetCode: string;            // '4001'
}

const CASH_CODE = '3001';                     // 중식, 음료커피
const CONTENT = { coffee: '음료/커피', lunch: '중식' } as const;

export async function fillForm(page: Page, input: FillInput): Promise<void> {
  // 1) 제목
  const titleInput = page.locator('th[scope="row"]:has-text("제목")').locator('xpath=ancestor::tr[1]').locator('input[type="text"]').first();
  await titleInput.fill(input.title);

  // 2) 용도 (cashCd=3001): 셀 더블클릭 → 타이핑 → Enter
  const grid = page.locator('[data-orbit-id="APB1020WriteGridGrid"]');
  await grid.locator('[data-col="cashCd"], [data-column-name="cashNm"]').first().dblclick().catch(async () => {
    // 편집 진입이 DOM 구조 의존이라 fallback: gridView API 로 beginUpdateRow
    await page.evaluate(() => {
      const el: any = document.querySelector('[data-orbit-id="APB1020WriteGridGrid"]');
      el.gridView.beginUpdateRow(0);
    });
  });
  await page.keyboard.type(CASH_CODE);
  await page.keyboard.press('Enter');

  // 3) 내용 (rmkDc): gridView API 로 값 직접 세팅 (ERP Exploration 권장)
  await page.evaluate((content) => {
    const el: any = document.querySelector('[data-orbit-id="APB1020WriteGridGrid"]');
    el.gridView.getDataSource().setValue(0, 'rmkDc', content);
  }, CONTENT[input.purposeKind]);

  // 4) 예산 lookup 모달
  await page.locator('th:has-text("예산과목")').locator('xpath=ancestor::tr[1]').locator('[data-orbit-component="OBTCodePicker"] button').first().click();
  await page.waitForSelector('.obt-modal:has-text("공통 예산잔액 조회")', { timeout: 15_000 });

  // 프로젝트 3009
  const projectInput = page.locator('.obt-modal [data-field="projectCode"], .obt-modal :text("프로젝트") >> xpath=following::input[1]');
  await projectInput.fill(input.projectCode);
  await page.keyboard.press('Enter');

  // 예산과목 4001
  const budgetInput = page.locator('.obt-modal [data-field="budgetAcctCd"], .obt-modal :text("예산과목") >> xpath=following::input[1]');
  await budgetInput.fill(input.budgetCode);
  await page.keyboard.press('Enter');

  // 확인 클릭
  await page.locator('.obt-modal button:visible', { hasText: /^확인$/ }).click();

  // 검증 "적합" 대기
  await page.waitForFunction(() => {
    const el: any = document.querySelector('[data-orbit-id="APB1020WriteGridGrid"]');
    const v = el?.gridView?.getDataSource().getValue(0, 'validateResult');
    return v === '적합';
  }, null, { timeout: 15_000 });
}

export function defaultTitle(purposeKind: 'coffee' | 'lunch', when: Date): string {
  const mm = String(when.getMonth() + 1).padStart(2, '0');
  const dd = String(when.getDate()).padStart(2, '0');
  return `${mm}월 ${dd}일 ${purposeKind === 'coffee' ? '음료' : '중식'} 지출`;
}
```

- [ ] **Step 9.2: 목업 기반 통합 테스트 작성**

`tests/worker-formfill.test.ts` — erp-writeform.html 을 로드해 `fillForm({ title: 'TEST', purposeKind: 'coffee', projectCode: '3009', budgetCode: '4001' })` 실행 후 `gridView.getJsonRows()[0]` 의 `cashCd`·`rmkDc`·`budgetAcctCd`·`validateResult` 를 검증.

```typescript
import { describe, it, expect } from 'vitest';
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { fillForm } from '../src/server/worker/formFill';

const URL = pathToFileURL(join(process.cwd(), 'src/server/worker/mock/erp-writeform.html')).toString();

describe('fillForm (mock)', () => {
  it('populates title, cashCd=3001, rmkDc, budget 3009/4001 and yields 적합', async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(URL);
    await fillForm(page, { title: '04월 06일 음료 지출', purposeKind: 'coffee', projectCode: '3009', budgetCode: '4001' });
    const row = await page.evaluate(() => {
      const el: any = document.querySelector('[data-orbit-id="APB1020WriteGridGrid"]');
      return el.gridView.getDataSource().getJsonRows()[0];
    });
    expect(row.cashCd).toBe('3001');
    expect(row.rmkDc).toBe('음료/커피');
    expect(row.budgetAcctCd).toBe('4001');
    expect(row.validateResult).toBe('적합');
    await browser.close();
  }, 30_000);
});
```

- [ ] **Step 9.3: `worker/index.ts` 통합**

```typescript
import { fillForm, defaultTitle } from './formFill';
const title = sub.titleOverride ?? defaultTitle(sub.purposeKind, new Date(sub.scheduledAt));
await fillForm(page, { title, purposeKind: sub.purposeKind, projectCode: '3009', budgetCode: '4001' });
await snap(page, dir, 'form-filled');
```

- [ ] **Step 9.4: 커밋**

```bash
git add src/server/worker/formFill.ts tests/worker-formfill.test.ts src/server/worker/index.ts
git commit -m "feat(worker): fill title + cash/content + budget lookup"
```

---

## Task 10: 결재상신 팝업 + dzEditor 참석자 주입

**Files:**
- Create: `src/server/worker/approval.ts`
- Test: `tests/worker-approval.test.ts` (목업)

- [ ] **Step 10.1: `src/server/worker/approval.ts`**

```typescript
import type { Page, BrowserContext } from 'playwright';

export interface ApprovalInput {
  attendeeNames: string[];
  mode: 'live' | 'mock' | 'dryrun';
  submitFinal: boolean;            // true 이면 [상신] 클릭
}

export async function openApprovalAndInject(
  context: BrowserContext,
  originPage: Page,
  input: ApprovalInput,
): Promise<{ popup: Page; submittedAt: Date | null }> {
  // 새 탭 캐치: context.waitForEvent('page')
  const popupPromise = context.waitForEvent('page');
  await originPage.locator('button', { hasText: /^결재상신$/ }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  if (input.mode === 'live' && !/callComp=UBAP001/.test(popup.url())) {
    throw new Error(`unexpected approval popup URL: ${popup.url()}`);
  }

  // dzEditor iframe 에 동석자 명단 주입
  const frame = popup.frameLocator('#editorView_UBAP001');
  const body = frame.locator('body');
  const attendeesLine = `동석자: ${input.attendeeNames.join(', ')}`;
  // 기존 안내 텍스트 뒤에 한 줄 append
  await body.evaluate((b, line) => {
    const p = b.ownerDocument!.createElement('p');
    p.textContent = line;
    b.appendChild(p);
  }, attendeesLine);

  if (!input.submitFinal) {
    return { popup, submittedAt: null };
  }

  // 최종 상신
  await popup.locator('button', { hasText: /^상신$/ }).click();
  // ERP 가 확인 dialog 를 띄울 수 있음 — 자동 승인은 LIVE 에서 금지, DRYRUN 에서만 수락
  popup.once('dialog', d => d.accept());
  await popup.waitForLoadState('networkidle', { timeout: 30_000 });
  return { popup, submittedAt: new Date() };
}
```

- [ ] **Step 10.2: 목업 테스트**

`tests/worker-approval.test.ts` — erp-approval.html 로드 후 호출, iframe body 텍스트에 `동석자: …` 가 포함되는지 검증.

- [ ] **Step 10.3: `worker/index.ts` 통합**

```typescript
import { openApprovalAndInject } from './approval';

const submitFinal = mode === 'live'
  ? !!process.env.ERP_CONFIRM_SUBMIT   // 반드시 명시적 플래그 요구
  : mode === 'mock';                   // mock 은 안전하게 submit까지 수행 (데모용)

const { submittedAt } = await openApprovalAndInject(session.context, page, {
  attendeeNames: JSON.parse(sub.attendeeNames) as string[],
  mode,
  submitFinal,
});
await snap(page, dir, 'approval-done');

await deps.queue.complete(id, {
  sunginNb,
  erpRefNo: submittedAt ? `ERP-${submittedAt.getTime()}` : null,
  screenshotDir: dir,
});
```

- [ ] **Step 10.4: 커밋**

```bash
git add src/server/worker/approval.ts src/server/worker/index.ts tests/worker-approval.test.ts
git commit -m "feat(worker): approval popup + dzEditor attendee injection"
```

---

## Task 11: REST 수동 트리거 + RoomStatus 전이 트리거

**Files:**
- Create: `src/server/routes/submissions.ts`
- Modify: `src/server/io.ts` (워커 진행 단계마다 `broadcastRoomState` 호출 추가)
- Test: `tests/submissions-route.test.ts`

> **변경 사항 (UX 통합):** 별도의 `ResultPage.tsx`는 존재하지 않는다. 모든 상태 표시는 Plan A Task 13의 `ResultView`가 단일 socket 채널 `room:state` 만 구독해 처리한다. 따라서 본 Task에서는 **REST 라우트가 SessionManager.transitionStatus + broadcastRoomState 를 호출**하기만 하면 프론트는 자동으로 갱신된다. (폴링 불필요)

- [ ] **Step 11.1: `POST /api/sessions/:id/submissions`**

세션의 패자·참석자·시간으로 `SubmissionQueue.enqueue()` 호출. scheduledAt 은 `nextBusinessDayNineAm()`.
이어서 `mgr.transitionStatus({ sessionId, to: 'QUEUED', patch: { submissionId, scheduledAt: scheduledAt.getTime() } })` 호출 후 `broadcastRoomState(io, snap)`.
응답: `{ submissionId, scheduledAt }`.

- [ ] **Step 11.2: `POST /api/submissions/:id/run-now` (데모용)**

`WORKER_MODE === 'mock'` 또는 요청 헤더 `X-Demo-Confirm: yes` 일 때만 즉시 `runSubmission` 트리거. live 에서는 422 반환. 트리거 직전에 `transitionStatus(QUEUED → RUNNING, { workerStep: 'login' })` + broadcast.

- [ ] **Step 11.3: 워커 진행 단계 broadcast — `worker/index.ts`에서 각 단계 시작 시**

```typescript
mgr.transitionStatus({ sessionId, to: 'RUNNING', patch: { workerStep: 'cardModal' } });
broadcastRoomState(io, mgr.getById(sessionId)!);
```

`login → cardModal → formFill → approval` 순으로 4번 호출. 워커 종료 시점에 성공이면 `transitionStatus(COMPLETED, { erpRefNo })`, 실패면 `transitionStatus(FAILED, { errorLog })`. 두 경우 모두 broadcast.

- [ ] **Step 11.4: `POST /api/sessions/:id/credential-input` — `FINISHED → CREDENTIAL_INPUT` 전이용 작은 라우트** (Step 3.6 주석 참조)

- [ ] **Step 11.5: 라우트 테스트 작성 + 통과 확인**

- [ ] **Step 11.6: 커밋**

```bash
git add src/server/routes/submissions.ts src/server/io.ts src/server/worker/index.ts tests/submissions-route.test.ts
git commit -m "feat(api): submissions routes + worker step broadcast via room:state"
```

---

## Task 12: 게임 결과 → 상태 전이 (Plan A 훅)

**Files:**
- Modify: `src/server/io.ts` (`game:start`/`player:submit` 핸들러는 이미 `mgr.finishGame(...)` 호출 + `broadcastRoomState`. 본 Task에서는 enqueue를 분리된 `/api/sessions/:id/submissions` 라우트로 위임하고, 이 라우트가 `transitionStatus(QUEUED, ...)` 까지 묶어서 처리)
- Test: `tests/runner-enqueue.test.ts`

> **변경 사항 (UX 통합):** Plan A에서 `mgr.finishGame()`이 이미 `FINISHED` 전이 + `loserId/results` 캡처를 수행하고 `broadcastRoomState` 까지 emit한다. 따라서 게임 outcome 시점에 자동으로 enqueue 하지 않는다 — 패자가 직접 `CredentialForm`을 제출해 자격증명을 입력해야 `CREDENTIAL_INPUT → QUEUED` 로 진행된다 (Step 11.1). 게임 종료 → 자동 큐잉 흐름이 없어 사용자 동의 없이 ERP가 호출되는 사고를 원천적으로 차단한다.

- [ ] **Step 12.1: 게임 종료 직후 자동 enqueue 가 일어나지 않음을 확인하는 테스트**

```typescript
// tests/runner-enqueue.test.ts (의도가 변경됨)
import { describe, it, expect } from 'vitest';

describe('game outcome → no auto submission', () => {
  it('finishGame transitions to FINISHED but does NOT enqueue submission', async () => {
    const { mgr, queue, simulateGameOutcome } = await setupHarness();
    const session = mgr.createSession({ name: 'Alice' });
    // ... join + selectGame + startGame + 모두 submit
    await simulateGameOutcome(session.id);
    expect(mgr.getById(session.id)!.status).toBe('FINISHED');
    expect(await queue.list({ sessionId: session.id })).toHaveLength(0);
  });

  it('POST /api/sessions/:id/submissions enqueues + transitions to QUEUED', async () => {
    const { app, mgr, queue } = await setupHarness();
    const session = mgr.createSession({ name: 'Alice' });
    // ... 패자가 finalized 된 상태로 강제 (테스트 헬퍼)
    const r = await request(app).post(`/api/sessions/${session.id}/submissions`).send();
    expect(r.status).toBe(200);
    expect(mgr.getById(session.id)!.status).toBe('QUEUED');
    expect(await queue.list({ sessionId: session.id })).toHaveLength(1);
  });
});
```

- [ ] **Step 12.2: 통합 테스트 PASS 확인**

- [ ] **Step 12.3: 커밋**

```bash
git add src/server/io.ts tests/runner-enqueue.test.ts
git commit -m "feat(integration): outcome → FINISHED only; enqueue deferred to credential submit"
```

---

## Task 13: End-to-End 드라이런 + 모킹 데모 경로

**Files:**
- Create: `tests/e2e-mock.test.ts` (전 모듈 조합)
- Create: `scripts/demo-dryrun.ts` (손으로 실행해 라이브 시연 리허설)

- [ ] **Step 13.1: `tests/e2e-mock.test.ts`**

목업 HTML 3종 + 인메모리 DB + vault + queue + scheduler 틱 1회를 연결해, `runSubmission` 이 `COMPLETED` 로 끝나는지 확인. `sunginNb` 가 DB 에 저장되는지, 스크린샷 디렉토리가 만들어지는지 검증.

```typescript
import { describe, it, expect } from 'vitest';
import { buildTestServer } from './helpers/buildTestServer';

describe('e2e (mock)', () => {
  it('game outcome → submission completes via scheduler tick', async () => {
    const t = await buildTestServer({ mode: 'mock' });
    await t.simulateGameOutcome({ loserId: 'u1', attendees: ['u1','u2'], purposeKind: 'coffee' });
    await t.vault.save('u1', { loginId: 'alice', password: 'pw' });
    await t.scheduler.tick();                         // claim + dispatch
    await t.awaitCompletion();                        // polls queue for terminal state
    const sub = await t.queue.loadForRun(t.lastSubmissionId);
    expect(sub?.status).toBe('COMPLETED');
    expect(sub?.sunginNb).toBe('68763054');
  }, 60_000);
});
```

- [ ] **Step 13.2: `scripts/demo-dryrun.ts`**

환경변수 `WORKER_MODE=dryrun` 로 실제 ERP 로그인까지만 수행하고 폼 편집 없이 스크린샷 남기고 종료. 데모 당일 사전 리허설용.

```typescript
import 'dotenv/config';
import { buildServerRuntime } from '../src/server/runtime';
import { runSubmission } from '../src/server/worker';

const runtime = await buildServerRuntime();
const submissionId = await runtime.queue.enqueue({
  sessionId: 'demo', loserUserId: process.env.DEMO_USER_ID!,
  scheduledAt: new Date(0),
  attendeeNames: ['강명훈', '홍길동'],
  purposeKind: 'coffee', mode: 'dryrun',
});
await runSubmission(submissionId, runtime);
console.log('dryrun complete:', submissionId);
```

- [ ] **Step 13.3: 수동 실행 + 결과 기록**

```bash
export WORKER_MODE=dryrun
export DEMO_USER_ID=<실제 유저 id, 사전 /api/credentials 저장 필요>
npx tsx scripts/demo-dryrun.ts
ls data/screenshots/<id>/
```

- [ ] **Step 13.4: 커밋**

```bash
git add tests/e2e-mock.test.ts scripts/demo-dryrun.ts
git commit -m "test(e2e): full mock pipeline + live dryrun rehearsal script"
```

---

## Task 14: 실 ERP 라이브 리허설 (사용자 동석 필수)

> **⚠️ 실 ERP 쓰기 작업. 사용자가 옆에서 모니터링하지 않으면 실행 금지. feedback memory §ERP browser session safety 준수.**

**Files:** (코드 변경 없음 — 운영 절차)

- [ ] **Step 14.1: 사전 체크리스트**
  - 실 메이사 법인카드로 커피 1건 결제 완료 (데모 전날)
  - `/api/credentials` 로 본인 ID/PW 저장 완료
  - 환경변수 `WORKER_MODE=live`, `ERP_CONFIRM_SUBMIT` **미설정** (= 상신 버튼은 누르지 않음)
  - `headless=false` 유지

- [ ] **Step 14.2: 실행**

```bash
export WORKER_MODE=live
npx tsx scripts/demo-dryrun.ts    # 같은 스크립트, 하지만 mode=live 로 enqueue 되게 인자 추가
```

- [ ] **Step 14.3: 각 단계 관측**
  - 로그인 → 지출결의서작성 이동 → 카드모달 → 폼 채움 → 결재상신 팝업 오픈 → dzEditor 동석자 라인 삽입됨
  - **[상신] 은 누르지 않고 팝업 탭 수동 close** (사용자가 직접)
  - 스크린샷 디렉토리로 재현 가능성 확보

- [ ] **Step 14.4: 결과 기록**
  - 성공: 데모 시 `ERP_CONFIRM_SUBMIT=1` 붙여 실제 상신 가능
  - 실패: 캡처된 스크린샷 + `errorLog` 로 원인 분류 → 필요한 Task 로 돌아가 selector 보강

---

## 타임라인 (Plan A Task 7 이후 착수, ~14시간)

| 시간 | 작업 |
|------|------|
| H+0~1 | Task 1, 2 (DB + Vault) |
| H+1~3 | Task 3, 4, 5 (API + Queue + Scheduler) |
| H+3~5 | Task 6, 7 (워커 기반 + 로그인, 목업 통과) |
| H+5~8 | Task 8 (카드 매칭, 순수 함수 우선) |
| H+8~10 | Task 9 (폼 채우기) |
| H+10~11 | Task 10 (결재상신/dzEditor) |
| H+11~12 | Task 11, 12 (라우트 + 프론트 + 게임 훅) |
| H+12~13 | Task 13 (E2E mock) |
| H+13~14 | Task 14 (라이브 리허설) |

## 팀 분담

| 담당 | Plan B Task |
|------|-------------|
| Dev 1, 2 (게임 제작·업로드) | — Plan A Task 14 에 집중. Plan B 는 관여 없음 |
| Dev 3 (플랫폼 UI) | Task 3 (`CredentialForm` 본문 채우기 — Plan A Task 13 스텁 와이어링), Task 11 의 프론트 (`ResultView`의 QUEUED/RUNNING/COMPLETED/FAILED 단계별 표시 — Plan A Task 13 의 스위치문 디테일 추가) |
| Dev 4 (백엔드·핵심 엔진) | **Plan B 전 영역** — Task 1, 2, 3 (서버 API), 4, 5, 6, 7, 8, 9, 10, 11 (서버 라우트), 12, 13, 14 |

- **Dev 4 선행 필수:** Task 1 (DB 스키마)·Task 2 (Vault)·Task 4 (Queue)는 Dev 3 이 `CredentialForm`/`ResultView` 를 실제 API 에 물리기 전에 선행. 그 전까지 Dev 3 은 목 응답으로 UI 먼저 제작.
- **UI 계약 먼저 고정:** Dev 4 는 Task 3 시작 시점에 `POST /api/credentials` 요청 스키마(zod), `POST /api/sessions/:id/submissions` 응답 스키마, 그리고 `RoomStatePayload`(Plan A Task 2)의 신규 필드(`submissionId`/`scheduledAt`/`workerStep`/`erpRefNo`/`errorLog`) 를 shared/protocol 에 선 push → Dev 3 는 동일 타입으로 폼/뷰 작성. `room:state` socket 채널이 단일 source of truth 이므로 폴링 코드는 작성하지 않는다.
- **Dev 4 병목 리스크:** Plan B 의 Playwright 워커(Task 6~10)가 본 과제의 단일 최대 난이도. 목업 HTML(Task 6) 은 ERP Exploration findings 의 DOM 을 흉내내는 단순 정적 작업이므로, Plan A Task 14 를 먼저 끝낸 Dev 1/2 에게 "목업 HTML 세팅"만 선택적으로 위임 가능 — **본 배분의 유일한 이월 여유**.
- **Task 14 (라이브 리허설)** 은 Dev 4 가 진행하되, 사용자(본인) 동석 하에 수행 — feedback memory §ERP browser session safety 준수.

## 백로그 / 확정 후 처리

- 영수증 이미지 첨부 자동화 — ERP Exploration 에서 `지출결의+카드_…jpeg` 가 자동 붙는 것으로 관측됨. 필요시 수동 업로드 경로 추가
- 카드내역 모달의 "반영완료" 탭도 조회해 중복 여부 교차 확인
- 암호화 페이로드 raw 경로 매핑 — UI 경유로 막히면 직접 API 호출 경로 연구 (ERP Exploration §1 관련 API 리스트)
- 감사 로그(`audit_logs` 테이블) — 누가 누구의 계정으로 언제 상신했는지. 데모에선 skip, 실배포 필수
- SSO/Vault 전환 설계 슬라이드 (§9)

---

## Self-Review 결과

- **스펙 커버리지:** §4.4 워커(Task 6~10), §4.5 DB(Task 1), §5 Phase 3-4 플로우(Task 4,5,12), §6.4 에러(Task 7~10 의 status 분기), §6.5 큐 리커버리(Task 4.1 마지막 케이스), §6.6 모킹 모드(Task 6 + 13) 전 항목 대응.
- **ERP Exploration 커버리지:** 2단계 로그인(Task 7), URL 직접이동(Task 8.4), RealGrid JSON API(Task 8.5), cashCd 3001(Task 9), 예산 3009/4001 lookup(Task 9), 새 탭 결재상신 + dzEditor(Task 10), 매칭 `cardCd`+`issDt`+`sunginNb`(Task 8.2) 포함.
- **타입 일관성:** `WorkerMode`/`SubmissionStatus`/`EnqueueInput`/`CompleteInput` 을 Task 4 에 정의한 시그니처가 Task 5,6,11,12 에서 그대로 사용됨. 매칭 함수는 `matchCardRow` 단일 이름으로 고정.
- **안전 가드:** `live` + 상신은 `ERP_CONFIRM_SUBMIT` 환경변수 + Task 14 수동 리허설 두 단계 게이트. 추가로 게임 종료 직후 자동 enqueue 가 일어나지 않으며, **패자가 명시적으로 자격증명을 제출**해야 `CREDENTIAL_INPUT → QUEUED` 로 진입한다 (Task 12 변경).
- **UX 통합:** Plan A Task 13의 `ResultView`가 `room:state` 단일 채널을 구독해 9개 RoomStatus 모두를 표시하므로 Plan B 측에 별도 `ResultPage.tsx` / `CredentialPage.tsx` 가 존재하지 않는다 — Plan A 와의 라우팅·상태 모델이 일관됨.

---

## Lessons from 2026-04-20 E2E Simulation

실제 브라우저 워크스루에서 발견된 Plan B 측 이슈. 재작성 시 아래 DoD 체크박스를 각 Task 에 **필수 추가** (`dce28ef` 수정 참고).

### Task 4 (SubmissionQueue) + Task 11 (REST) 추가 DoD
- [ ] **`submissions.sessionId` FK 보장 경로** — in-memory `SessionManager` 가 DB persist 하지 않을 수 있으므로, `POST /api/sessions/:id/submissions` 핸들러는 `queue.enqueue` 직전에 `sessions` 테이블을 **upsert** (`db.insert(sessions).values({...}).onConflictDoNothing().run()`) 해야 `FOREIGN KEY constraint failed` 방지. Plan A Task 5 의 `persist` 옵션이 제대로 구현되면 이 upsert 는 불필요하지만, 이중 가드로 유지.
- [ ] `tests/submissions-route.test.ts` — sessions 테이블이 비어 있는 상태에서 enqueue 호출 → 에러 없이 통과하는 케이스 포함.

### Task 11 (REST 수동 트리거) 추가 DoD
- [ ] **`POST /api/submissions/:id/run-now` 가 실제로 `runSubmission(submissionId)` 을 호출**. `{ ok: true }` 스텁만 반환하면 안 됨 (시뮬에서 UI 가 QUEUED 에 고착). 구현 패턴:
  ```ts
  res.status(202).json({ ok: true, submissionId });
  // fire-and-forget
  runSubmission(submissionId).catch(err => console.error('[run-now]', err));
  ```
- [ ] 호출 직전 `mgr.transitionStatus(sessionId, 'RUNNING', { workerStep: 'login' })` + `broadcastRoomState` 수행. UI 가 RUNNING 진입을 볼 수 있어야 한다.

### Task 3 (CredentialForm) 추가 DoD
- [ ] `CredentialForm` prop 시그니처는 `{ sessionId: string, loserId: string }` 로 공동 계약 세션에서 lock. ResultView 에서 이 형태로 호출됨을 전제.

### Task 13 (E2E 드라이런) 추가 DoD
- [ ] **브라우저 2 탭 수동 E2E 체크리스트** — `tests/e2e-mock.test.ts` 녹색만으로는 부족. HomePage → Lobby → Game → Result → Credential → QUEUED → (run-now) → RUNNING → COMPLETED 전체 완주를 Playwright headed 또는 수동 브라우저로 1회 이상 확인. Props naming·mount race·FK 는 TDD 가 못 잡는 영역.
