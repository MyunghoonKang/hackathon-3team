// 목업 카드내역 데이터. ERP Exploration §카드내역 row 구조를 축약 재현.
// tests/fixtures/cardRows.json 과 내용을 동기화 유지 — matcher 단위 테스트는 JSON
// 쪽을, 워커 내부는 이 상수를 import.

export interface MockCardRow {
  bankCd: string;
  bankNm: string;
  cardCd: string; // 카드번호 16 자리 (실 ERP 는 마스킹 처리하지만 목업은 평문)
  cardNm: string; // `롯데카드_강명훈(8130)` 형태 · suffix 4자리 매칭 키
  issDt: string; // 승인일 YYYYMMDD
  issTime: string; // 승인시각 HHMMSS
  formatedIssDtTime: string; // `YYYY-MM-DD HH:MM:SS`
  chainName: string;
  chainBusiness: string;
  supAm: number; // 공급가
  vatAm: number; // 부가세
  sunginAm: number; // 합계 (= supAm + vatAm, 불일치 시 매칭 제외)
  sunginNb: string; // 승인번호 (고유 키 — dedupe 기준)
  payDt: string; // 결제예정일
}

export const MOCK_CARD_ROWS: MockCardRow[] = [
  {
    bankCd: '11',
    bankNm: '롯데카드',
    cardCd: '5105545000378130',
    cardNm: '롯데카드_강명훈(8130)',
    issDt: '20260420',
    issTime: '132926',
    formatedIssDtTime: '2026-04-20 13:29:26',
    chainName: '스타벅스코리아',
    chainBusiness: '커피전문점',
    supAm: 4819,
    vatAm: 481,
    sunginAm: 5300,
    sunginNb: '68763054',
    payDt: '20260515',
  },
  {
    bankCd: '11',
    bankNm: '롯데카드',
    cardCd: '5105545000378130',
    cardNm: '롯데카드_강명훈(8130)',
    issDt: '20260420',
    issTime: '123015',
    formatedIssDtTime: '2026-04-20 12:30:15',
    chainName: '김밥천국 강남점',
    chainBusiness: '분식',
    supAm: 31818,
    vatAm: 3182,
    sunginAm: 35000,
    sunginNb: '68759921',
    payDt: '20260515',
  },
  {
    bankCd: '11',
    bankNm: '롯데카드',
    cardCd: '5105545000378130',
    cardNm: '롯데카드_강명훈(8130)',
    issDt: '20260420',
    issTime: '125502',
    formatedIssDtTime: '2026-04-20 12:55:02',
    chainName: '투썸플레이스 역삼점',
    chainBusiness: '커피전문점',
    supAm: 15454,
    vatAm: 1546,
    sunginAm: 17000,
    sunginNb: '68761138',
    payDt: '20260515',
  },
];
