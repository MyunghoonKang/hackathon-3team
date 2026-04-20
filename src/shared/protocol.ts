// 공동 계약 (H+0~2) · 3A 리드 · 4A 리뷰어 합의
// 변경 규칙: 추가만 OK. 삭제·rename 은 양 Dev 동의 + 별도 PR.

// ---------------------------------------------------------------------------
// RoomStatus · 9 enum
// ---------------------------------------------------------------------------

export const ROOM_STATUSES = [
  'PREPARING',
  'PLAYING',
  'FINISHED',
  'CREDENTIAL_INPUT',
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'ABORTED',
] as const;

export type RoomStatus = (typeof ROOM_STATUSES)[number];

// ALLOWED_TRANSITIONS
// Plan A: PREPARING → PLAYING → FINISHED
// Plan B: FINISHED → CREDENTIAL_INPUT → QUEUED → RUNNING → {COMPLETED, FAILED}
// FAILED 는 QUEUED 로 재큐 허용 (재시도). COMPLETED · ABORTED 는 terminal.
// ABORTED 는 어디서든 진입 가능한 비상 탈출구.
export const ALLOWED_TRANSITIONS: Readonly<Record<RoomStatus, readonly RoomStatus[]>> = {
  PREPARING: ['PLAYING', 'ABORTED'],
  PLAYING: ['FINISHED', 'ABORTED'],
  FINISHED: ['CREDENTIAL_INPUT', 'ABORTED'],
  CREDENTIAL_INPUT: ['QUEUED', 'ABORTED'],
  QUEUED: ['RUNNING', 'ABORTED'],
  RUNNING: ['COMPLETED', 'FAILED', 'ABORTED'],
  COMPLETED: [],
  FAILED: ['QUEUED', 'ABORTED'],
  ABORTED: [],
};

export function isAllowedTransition(from: RoomStatus, to: RoomStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------
// Player · Game meta
// ---------------------------------------------------------------------------

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
}

export type CompareRule = 'max' | 'min';

export interface GameMeta {
  id: string;
  title: string;
  minPlayers: number;
  maxPlayers: number;
  description: string;
  compare: CompareRule;
}

// Dev 1·2 가 게임 HTML <head> 에 넣어야 할 meta 태그 이름.
// GameRegistry (A6) 파싱 + 422 errors 필드 참조 키로 사용.
export const GAME_META_KEYS = [
  'game:title',
  'game:min-players',
  'game:max-players',
  'game:description',
  'game:compare',
] as const;

export type GameMetaKey = (typeof GAME_META_KEYS)[number];

export interface GameResult {
  playerId: string;
  value: number;
}

// ---------------------------------------------------------------------------
// RoomStatePayload · 단일 socket 채널 'room:state' 페이로드
// ---------------------------------------------------------------------------

export type WorkerStep = 'login' | 'cardModal' | 'formFill' | 'approval';

export const WORKER_STEPS = ['login', 'cardModal', 'formFill', 'approval'] as const satisfies readonly WorkerStep[];

export interface RoomStatePayload {
  sessionId: string;
  roomCode: string;
  status: RoomStatus;
  players: Player[];
  hostId: string;
  game?: GameMeta;

  // Plan A 게임 결과 (FINISHED 에서 채워짐)
  loserId?: string;
  results?: GameResult[];

  // Plan B 필드 (CREDENTIAL_INPUT 이후 채워짐)
  submissionId?: string;
  scheduledAt?: string; // ISO 8601 UTC
  workerStep?: WorkerStep; // RUNNING 단계에서만 세팅
  erpRefNo?: string; // COMPLETED 에서 세팅
  errorLog?: string; // FAILED 에서 세팅

  updatedAt: string; // ISO 8601 UTC
}

// ---------------------------------------------------------------------------
// Credential input schema (validation 은 zod 사용 사이트에서 import)
// ---------------------------------------------------------------------------

export interface CredentialInput {
  userId: string; // 메이사 사번
  loginId: string; // 더존 아마란스 로그인 ID
  password: string; // 평문. 서버에서 Vault(AES-256-GCM) 암호화 후 폐기.
}

// zod 등 런타임 검증은 각 라우트에서 이 타입을 기준으로 구성.
export const CREDENTIAL_FIELD_RULES = {
  userId: { minLength: 1, maxLength: 32 },
  loginId: { minLength: 1, maxLength: 64 },
  password: { minLength: 1, maxLength: 128 },
} as const;

// ---------------------------------------------------------------------------
// REST 응답 타입
// ---------------------------------------------------------------------------

export interface CreateSessionRequest {
  hostName: string;
}

export interface CreateSessionResponse {
  sessionId: string;
  roomCode: string;
  hostId: string;
}

export interface JoinSessionRequest {
  name: string;
}

export interface JoinSessionResponse {
  sessionId: string;
  roomCode: string;
  playerId: string;
}

export interface ListGamesResponse {
  games: GameMeta[];
}

export interface UploadGameErrorResponse {
  errors: string[]; // 누락된 meta 키 또는 잘못된 compare 값 목록
}

export interface CreateCredentialRequest extends CredentialInput {
  sessionId: string;
}

export interface CreateSubmissionResponse {
  submissionId: string;
  scheduledAt: string; // ISO · 다음 영업일 09:00 Asia/Seoul
}

// Worker → API 반환 형식 (4B 의 runSubmission 결과)
export interface WorkerResult {
  status: 'COMPLETED' | 'FAILED';
  erpRefNo?: string;
  errorLog?: string;
}

// ---------------------------------------------------------------------------
// Socket event constants
// ---------------------------------------------------------------------------

// 단일 broadcast 채널. 다른 이벤트명 추가 금지 (공동 계약 고정).
export const SOCKET_EVENT_ROOM_STATE = 'room:state';

// 이전 run 버그 방지: 3B ResultView · CredentialForm 이 RoomStatePayload 를
// 받을 때 prop 네이밍은 `snap` (전체) · `me` (내 playerId) 고정.
// `state` / `myPlayerId` 쓰지 말 것.
export interface ViewProps {
  snap: RoomStatePayload;
  me: string; // 내 playerId
}
