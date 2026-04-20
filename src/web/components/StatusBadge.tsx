// 공동 계약 (H+0~2) · 3B 리드 · 4A · 3B 공용
// 시그니처 고정: props.status · props.className (옵션)
// 4A 의 ResultView QUEUED/RUNNING/COMPLETED/FAILED 단계에서도 동일 컴포넌트 사용.
// 라벨·색 추가는 OK. 삭제·rename 금지.

import type { RoomStatus } from '../../shared/protocol';

interface StatusBadgeProps {
  status: RoomStatus;
  className?: string;
}

const LABEL: Record<RoomStatus, string> = {
  PREPARING: '대기 중',
  PLAYING: '게임 중',
  FINISHED: '결과 확정',
  CREDENTIAL_INPUT: '자격증명 입력',
  QUEUED: '상신 예약됨',
  RUNNING: '상신 진행 중',
  COMPLETED: '상신 완료',
  FAILED: '상신 실패',
  ABORTED: '중단됨',
};

const COLOR_VAR: Record<RoomStatus, string> = {
  PREPARING: 'var(--color-status-preparing)',
  PLAYING: 'var(--color-status-playing)',
  FINISHED: 'var(--color-status-finished)',
  CREDENTIAL_INPUT: 'var(--color-status-credential-input)',
  QUEUED: 'var(--color-status-queued)',
  RUNNING: 'var(--color-status-running)',
  COMPLETED: 'var(--color-status-completed)',
  FAILED: 'var(--color-status-failed)',
  ABORTED: 'var(--color-status-aborted)',
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const color = COLOR_VAR[status];
  return (
    <span
      className={className}
      role="status"
      aria-live="polite"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-1) var(--space-3)',
        borderRadius: 'var(--radius-pill)',
        background: 'color-mix(in srgb, ' + color + ' 18%, transparent)',
        color,
        fontSize: '0.8125rem',
        fontWeight: 600,
        letterSpacing: '0.02em',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
        }}
      />
      {LABEL[status]}
    </span>
  );
}

export const STATUS_LABEL = LABEL;
