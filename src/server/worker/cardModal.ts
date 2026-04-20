import type { Page } from 'playwright';
import { matchCardRow, type CardRow, type MatchCriteria } from './matcher';

// `[카드사용내역]` 모달 내 grid 에서 게임 세션과 일치하는 단일 row 를 골라 적용한다.
// 실 ERP 는 RealGrid (`gridView.getDataSource().getJsonRows()`) 로 데이터를 들고,
// 목업 (mock/card.html) 은 같은 schema 의 row 를 `<tbody#cardRows tr[data-sungin-nb]>`
// 로 표현한다. row 추출만 분기하고 매칭 로직은 동일한 matcher 를 통과시킨다.

export class NoMatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoMatchError';
  }
}

// 실 ERP 한정 — 지출내역 폼 화면에서 [카드사용내역] 버튼을 눌러 모달을 연다.
// mock 모드에서는 file://.../card.html 로 직접 navigate 하면 되므로 호출 불필요.
export async function openCardModal(page: Page): Promise<void> {
  await page.locator('button').filter({ hasText: /^카드사용내역$/ }).first().click();
  await page.waitForSelector('[data-orbit-id="cardDataGridTab1"]', { timeout: 30_000 });
}

// 모달이 떠 있는 상태에서 jsonRows 추출. gridView 우선, mock <tbody> fallback.
async function extractRows(page: Page): Promise<CardRow[]> {
  const handle = await page.evaluateHandle(() => {
    const gridEl = document.querySelector('[data-orbit-id="cardDataGridTab1"]') as
      | (Element & { gridView?: { getDataSource(): { getJsonRows(): unknown[] } } })
      | null;
    const gv = gridEl?.gridView;
    if (gv && typeof gv.getDataSource === 'function') {
      return gv.getDataSource().getJsonRows();
    }
    const trs = Array.from(
      document.querySelectorAll('tbody#cardRows tr'),
    ) as HTMLTableRowElement[];
    return trs.map((tr) => {
      const cells = tr.querySelectorAll('td');
      const dt = cells[1]?.textContent?.trim() ?? '';
      const num = (s: string | null | undefined) => Number((s ?? '0').replace(/[^0-9-]/g, ''));
      return {
        cardCd: tr.dataset.cardCd ?? '',
        cardNm: cells[0]?.textContent?.trim() ?? '',
        formatedIssDtTime: dt,
        issDt: dt.slice(0, 10).replace(/-/g, ''),
        issTime: dt.slice(11).replace(/:/g, ''),
        chainName: cells[2]?.textContent?.trim() ?? '',
        supAm: num(cells[3]?.textContent),
        vatAm: num(cells[4]?.textContent),
        sunginAm: num(cells[5]?.textContent),
        sunginNb: tr.dataset.sunginNb ?? '',
      };
    });
  });
  const rows = (await handle.jsonValue()) as CardRow[];
  await handle.dispose();
  return rows;
}

// 모달 내에서 매칭된 단일 row 를 선택 + 적용. 매칭된 sunginNb 반환.
// 매칭 실패 시 NoMatchError throw → 호출부에서 FAILED_NO_TXN 으로 분기.
export async function selectCardRow(page: Page, criteria: MatchCriteria): Promise<string> {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-orbit-id="cardDataGridTab1"]') as
        | (Element & { gridView?: { getDataSource(): { getJsonRows(): unknown[] } } })
        | null;
      const gv = el?.gridView;
      if (gv && typeof gv.getDataSource === 'function') {
        return gv.getDataSource().getJsonRows().length > 0;
      }
      return document.querySelectorAll('tbody#cardRows tr').length > 0;
    },
    null,
    { timeout: 30_000, polling: 500 },
  );

  const jsonRows = await extractRows(page);
  const picked = matchCardRow(jsonRows, criteria);
  if (!picked) {
    throw new NoMatchError(
      `no card row for ${criteria.sessionDate} ${criteria.cardCd} (rows=${jsonRows.length})`,
    );
  }

  const idx = jsonRows.findIndex((r) => r.sunginNb === picked.sunginNb);
  await page.evaluate(
    ({ idx, sunginNb }) => {
      const el = document.querySelector('[data-orbit-id="cardDataGridTab1"]') as
        | (Element & { gridView?: { checkItem(idx: number, checked: boolean): void } })
        | null;
      const gv = el?.gridView;
      if (gv && typeof gv.checkItem === 'function') {
        gv.checkItem(idx, true);
        return;
      }
      const tr = document.querySelector(
        `tbody#cardRows tr[data-sungin-nb="${sunginNb}"]`,
      ) as HTMLElement | null;
      tr?.click();
    },
    { idx, sunginNb: picked.sunginNb },
  );

  // 실 ERP 는 [확인] 버튼으로 모달 닫기. mock 은 tr 클릭 즉시 form.html 로 이동하므로
  // 버튼이 없으면 skip.
  const confirmBtn = page.locator('button:visible', { hasText: /^확인$/ }).first();
  if ((await confirmBtn.count()) > 0) {
    await confirmBtn.click().catch(() => {});
  }

  return picked.sunginNb;
}
