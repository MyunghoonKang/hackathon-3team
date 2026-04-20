import type { Player, RoomStatus } from '../../shared/protocol';

export interface SessionSnapshot {
  id: string;
  roomCode: string;
  status: RoomStatus;
  hostId: string;
  players: Player[];
  selectedGameId: string | null;
  startedAt: number | null;
  createdAt: number;
  loserId: string | null;
  results: { playerId: string; value: number }[] | null;
  submissionId: string | null;
  scheduledAt: number | null;
  workerStep: 'login' | 'cardModal' | 'formFill' | 'approval' | null;
  erpRefNo: string | null;
  errorLog: string | null;
}

export interface CreateSessionInput {
  name: string;
}

export interface JoinSessionInput {
  roomCode: string;
  name: string;
}
