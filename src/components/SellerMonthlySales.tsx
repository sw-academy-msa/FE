import { useState, type CSSProperties } from 'react';
import type { Order } from '../domain';
import { money } from '../domain';
import { getSellerSettlement, settlementNet, useApi } from '../api';
import { USE_MOCK } from '../config';
import { mockSellerSettlement, recentSellerMonths } from '../sellerMetrics';
import { LiveStatus } from './ui';

export function SellerMonthlySales({ sellerId, month, orders, now }: { sellerId: string; month: string; orders: Order[]; now: number }) {
  const months = recentSellerMonths(month);
  const [selected, setSelected] = useState(month);
  const live = useApi(async signal => ({ month, sellerId, rows: USE_MOCK ? [] : await Promise.all(recentSellerMonths(month).map(m => getSellerSettlement(m, signal))) }), [sellerId, month]);
  const rows = USE_MOCK ? months.map(m => mockSellerSettlement(orders, m, now)) : !live.loading && !live.error && live.data?.month === month && live.data.sellerId === sellerId ? live.data.rows : undefined;
  const selectedMonth = months.includes(selected) ? selected : month;
  const data = rows?.find(r => r.month === selectedMonth);
  const net = data ? settlementNet(data) : undefined;
  const max = Math.max(1, ...rows?.map(r => r.confirmedAmount) ?? []);
  const tile = (label: string, value: string) => <div className="rounded-element bg-canvas p-3"><p className="font-number break-words text-title font-bold">{value}</p><p className="muted mt-1 text-footnote">{label}</p></div>;
  return <section className="space-y-4" aria-label="월별 판매 현황">
    <div><h2 className="text-subhead font-bold">{months[0]} — {month}</h2><p className="muted mt-2 text-body">월별 구매 확정 상품 금액, 배송비 제외</p></div>
    {!USE_MOCK && <LiveStatus state={live}/>}
    {rows && <>
      {!rows.some(r => r.confirmedAmount > 0) && <p className="rounded-dialog bg-soft px-4 py-8 text-center text-subhead font-bold">아직 구매 확정된 판매가 없어요</p>}
      <div role="group" aria-label="월별 구매 확정 금액" className="flex gap-2 rounded-dialog bg-soft p-3">
        {rows.map((r, i) => <button type="button" key={r.month} onClick={() => setSelected(r.month)} aria-pressed={selectedMonth === r.month} aria-label={`${r.month} 구매 확정 ${money(r.confirmedAmount)}, ${r.products.reduce((n, p) => n + p.quantity, 0)}개`} className="min-h-11 min-w-0 flex-1 rounded-inner outline-offset-2 focus-visible:outline-2 focus-visible:outline-green">
          <div className="flex h-48 flex-col justify-end gap-2" aria-hidden="true"><span className="font-number text-caption text-muted">{r.confirmedAmount >= 10_000 ? `${Math.round(r.confirmedAmount / 1000) / 10}만` : `${r.confirmedAmount.toLocaleString('ko-KR')}원`}</span><div className="flex h-40 items-end border-b border-line">{r.confirmedAmount > 0 && <div key={`${month}-${r.confirmedAmount}`} className={`seller-sales-bar w-full rounded-inner ${selectedMonth === r.month ? 'bg-positive' : 'bg-ink'}`} style={{ height: `${r.confirmedAmount / max * 100}%`, '--seller-bar-index': i } as CSSProperties}/>}</div></div>
          <span className={`mt-2 block text-label ${selectedMonth === r.month ? 'font-bold text-ink' : 'text-muted'}`}>{Number(r.month.slice(5))}월</span>
        </button>)}
      </div>
      <div aria-live="polite" aria-atomic="true" className="space-y-3"><h3 className="text-headline font-bold">{selectedMonth} 구매 확정</h3><div className="grid grid-cols-2 gap-2">{tile('판매액', data ? money(data.confirmedAmount) : '-')}{tile('확정 수량', data ? `${data.products.reduce((n, p) => n + p.quantity, 0)}개` : '-')}{tile('수수료 10%', net ? money(net.fee) : '-')}{tile('지급 예정액', net ? money(net.net) : '-')}</div><p className="muted text-body">{data ? `확정 대기 ${data.awaitingOrders}건, ${money(data.awaitingAmount)}` : ''}</p></div>
      <p className="muted text-footnote leading-relaxed">판매 수수료는 월 판매액(구매 확정 기준)의 10%예요. 쿠폰 할인 전 상품 금액을 기준으로 하며 배송비는 제외해요.</p>
    </>}
  </section>;
}
