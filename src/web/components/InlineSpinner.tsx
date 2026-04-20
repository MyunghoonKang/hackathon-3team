// 공동 계약 (H+0~2) · 3B 리드 · 4A RUNNING 단계에서 workerStep 레이블 사용
// 시그니처 고정: props.label (옵션) · props.size (옵션)
// 삭제·rename 금지.

import type { WorkerStep } from '../../shared/protocol';

interface InlineSpinnerProps {
  label?: string;
  size?: number;
  step?: WorkerStep;
  className?: string;
}

const STEP_LABEL: Record<WorkerStep, string> = {
  login: '로그인 중',
  cardModal: '카드 내역 매칭 중',
  formFill: '품의서 폼 채우는 중',
  approval: '결재 상신 중',
};

export function InlineSpinner({ label, size = 18, step, className }: InlineSpinnerProps) {
  const effectiveLabel = label ?? (step ? STEP_LABEL[step] : '진행 중');
  return (
    <span
      className={className}
      role="status"
      aria-live="polite"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        color: 'var(--color-text-muted)',
        fontSize: '0.9rem',
      }}
    >
      <span
        aria-hidden
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          border: `2px solid color-mix(in srgb, var(--color-primary) 35%, transparent)`,
          borderTopColor: 'var(--color-primary)',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <span>{effectiveLabel}</span>
    </span>
  );
}

export const WORKER_STEP_LABEL = STEP_LABEL;
