import cron, { type ScheduledTask } from 'node-cron';
import type { SubmissionQueue } from './queue';

export interface SchedulerLogger {
  info: (msg: string, meta?: unknown) => void;
  error: (msg: string, meta?: unknown) => void;
}

export interface SchedulerDeps {
  queue: SubmissionQueue;
  runSubmission: (id: string) => Promise<void>;
  logger?: SchedulerLogger;
  stuckThresholdMs?: number;
}

// 분당 스캔 dispatcher.
//
// tick():
//   1. recoverStuck — updatedAt 가 threshold 보다 오래된 RUNNING 을 QUEUED 로 복귀.
//   2. claimNext — due(scheduledAt ≤ now) & QUEUED 1건을 RUNNING 으로 전이.
//   3. runSubmission(id) — fire-and-forget. 워커가 completes/fails 로 상태 갱신.
//
// transitionStatus/broadcastRoomState 는 호출하지 않는다. RoomStatePayload
// 전파는 worker 측(4B) 가 각 단계 시작 시 transitionStatus(RUNNING, { workerStep })
// 를 호출함으로써 이뤄진다.
export class Scheduler {
  private task?: ScheduledTask;
  private readonly stuckThresholdMs: number;

  constructor(private deps: SchedulerDeps) {
    this.stuckThresholdMs = deps.stuckThresholdMs ?? 30 * 60 * 1000;
  }

  start(): void {
    if (this.task) return;
    this.task = cron.schedule('* * * * *', () => {
      void this.tick().catch((e) =>
        this.deps.logger?.error('scheduler tick failed', { err: String(e) }),
      );
    });
  }

  async tick(): Promise<void> {
    this.deps.queue.recoverStuck({ thresholdMs: this.stuckThresholdMs });
    const claimed = this.deps.queue.claimNext(new Date());
    if (!claimed) return;
    this.deps.logger?.info('dispatching submission', { id: claimed.id });
    void this.deps.runSubmission(claimed.id).catch((e) =>
      this.deps.logger?.error('runSubmission threw', { id: claimed.id, err: String(e) }),
    );
  }

  stop(): void {
    this.task?.stop();
    this.task = undefined;
  }
}
