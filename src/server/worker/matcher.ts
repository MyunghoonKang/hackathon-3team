// 카드내역 row 매칭 규칙. 순수 함수 — DOM/Playwright 의존 없음.
// 워커 cardModal 단계가 RealGrid jsonRows 또는 mock <tbody> 에서 추출한 동일 schema 의
// row 배열을 받아 게임 세션과 1:1 대응되는 단일 row 를 골라낸다.
//
// ERP Exploration §1 매칭 전략:
//   1) cardCd 일치 (롯데 8130 전용)
//   2) issDt 가 게임 세션 종료일(KST YYYYMMDD) 과 일치
//   3) formatedIssDtTime 이 sessionStartedAt ± toleranceMinutes 안
//   4) 다중 후보 시 가장 가까운 시각 1건
//   5) excludeSunginNbs 의 row 는 후보에서 제외 (이미 상신된 거래 멱등성 가드)

export interface CardRow {
  cardCd: string;
  issDt: string; // YYYYMMDD (KST)
  issTime: string; // HHMMSS 또는 HH:MM:SS — 본 매칭 함수는 사용하지 않음 (formatedIssDtTime 우선)
  formatedIssDtTime: string; // 'YYYY-MM-DD HH:MM:SS' (KST)
  sunginNb: string; // 카드 거래 고유 ID
  supAm: number;
  vatAm: number;
  sunginAm: number;
  cardNm?: string;
  chainName?: string;
  chainBusiness?: string;
  payDt?: string;
}

export interface MatchCriteria {
  cardCd: string;
  sessionDate: string; // YYYYMMDD (KST 기준 게임 세션 종료일)
  sessionStartedAt: Date; // UTC 기준 Date · KST 비교는 +09:00 보정으로 처리
  toleranceMinutes: number;
  excludeSunginNbs?: string[];
}

export function matchCardRow(rows: CardRow[], c: MatchCriteria): CardRow | null {
  const exclude = new Set(c.excludeSunginNbs ?? []);
  const sameCard = rows.filter(
    (r) => r.cardCd === c.cardCd && r.issDt === c.sessionDate && !exclude.has(r.sunginNb),
  );
  if (sameCard.length === 0) return null;

  const target = c.sessionStartedAt.getTime();
  const toleranceMs = c.toleranceMinutes * 60_000;

  const withDelta = sameCard
    .map((r) => ({ r, delta: Math.abs(parseKstTimestamp(r.formatedIssDtTime) - target) }))
    .filter(({ delta }) => delta <= toleranceMs);
  if (withDelta.length === 0) return null;

  withDelta.sort((a, b) => a.delta - b.delta);
  return withDelta[0].r;
}

// 'YYYY-MM-DD HH:MM:SS' (KST) → UTC ms.
// formatedIssDtTime 은 ERP Exploration §1 과 mock seed.ts 양쪽에서 동일 포맷 보장.
function parseKstTimestamp(s: string): number {
  return Date.parse(s.replace(' ', 'T') + '+09:00');
}
