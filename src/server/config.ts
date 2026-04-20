// 환경변수 로더. 공동 계약 .env.example 의 키를 그대로 읽고 검증.
// 테스트는 loadConfig() 를 쓰지 않고 직접 Buffer.alloc(32, ...) 으로 키를 주입한다.

export type WorkerMode = 'mock' | 'dryrun' | 'live';

export interface AppConfig {
  port: number;
  dbPath: string;
  gamesDir: string;
  vaultKey: Buffer;
  workerMode: WorkerMode;
  erpBaseUrl: string;
  erpCompanyCode: string;
  erpConfirmSubmit: boolean;
}

const WORKER_MODES: readonly WorkerMode[] = ['mock', 'dryrun', 'live'];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const masterKeyHex = env.VAULT_MASTER_KEY ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(masterKeyHex)) {
    throw new Error(
      'VAULT_MASTER_KEY missing or not 32-byte hex. Generate with: openssl rand -hex 32',
    );
  }
  const mode = (env.WORKER_MODE ?? 'mock') as WorkerMode;
  if (!WORKER_MODES.includes(mode)) {
    throw new Error(`WORKER_MODE must be one of ${WORKER_MODES.join('|')}, got: ${mode}`);
  }

  return {
    port: Number(env.PORT ?? 3000),
    dbPath: env.DB_PATH ?? 'data/sqlite.db',
    gamesDir: env.GAMES_DIR ?? 'games',
    vaultKey: Buffer.from(masterKeyHex, 'hex'),
    workerMode: mode,
    erpBaseUrl: env.ERP_BASE_URL ?? 'https://erp.meissa.ai',
    erpCompanyCode: env.ERP_COMPANY_CODE ?? 'meissa',
    erpConfirmSubmit: env.ERP_CONFIRM_SUBMIT === '1',
  };
}
