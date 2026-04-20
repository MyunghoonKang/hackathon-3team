import type { WorkerStep } from '../../shared/protocol';

// 큐 입력 — sessionId(FK) + scheduledAt(다음 영업일 09:00 KST 등) 만 있으면 충분.
// 패자명·참석자·purpose 등 ERP 폼 데이터는 워커가 sessions row 와 게임 결과를
// 통해 조립한다. 큐 자체는 "언제 누가 어떤 세션에 대해 처리되어야 하는가" 만 책임.
export interface EnqueueInput {
  sessionId: string;
  scheduledAt: Date;
}

export interface ClaimedSubmission {
  id: string;
  status: 'RUNNING';
  attempts: number;
}

export interface CompleteInput {
  erpRefNo?: string | null;
}

export interface FailInput {
  errorLog: string;
}

export type { WorkerStep };
