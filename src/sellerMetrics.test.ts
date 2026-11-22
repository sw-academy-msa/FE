import { describe, expect, it } from 'vitest';
import { mockSellerSettlement, recentSellerMonths, salesGauge, sellerMonth } from './sellerMetrics';
import type { Order } from './domain';

describe('판매 현황 집계', () => {
  it('연도를 넘어 최근 6개월을 과거부터 나열하고 KST 월 경계를 사용한다', () => {
    expect(recentSellerMonths('2026-02')).toEqual(['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
    expect(sellerMonth(Date.parse('2026-01-31T15:00:00Z'))).toBe('2026-02');
  });
  it('게이지 경계와 초과 수량 및 분모 0을 처리한다', () => {
    expect([0, 32, 33, 79, 80, 100].map(n => salesGauge(n, 100).color)).toEqual(['bg-red', 'bg-red', 'bg-gauge-warning', 'bg-gauge-warning', 'bg-positive', 'bg-positive']);
    expect(salesGauge(200, 100).ratio).toBe(1); expect(salesGauge(2, 0)).toEqual({ ratio: 0, color: 'bg-line' });
  });
  it('배송비와 미확정 주문을 제외하고 결제 월 대신 구매 확정 월로 합친다', () => {
    const now = Date.parse('2026-02-28T00:00:00Z');
    const base = { productId: 'p', product: { name: '상품' }, createdAt: Date.parse('2026-01-01T00:00:00Z'), total: 5000, shipping: 3000, lines: [{ quantity: 2 }], status: 'delivered' } as Order;
    const orders = [{ ...base, purchaseConfirmedAt: Date.parse('2026-01-31T15:00:00Z') }, { ...base, status: 'preparing' }, { ...base, status: 'refunded', purchaseConfirmedAt: now }, { ...base, deliveredAt: now - 86_400_000 }] as Order[];
    const result = mockSellerSettlement(orders, '2026-02', now);
    expect(result).toMatchObject({ confirmedAmount: 2000, confirmedOrders: 1, awaitingAmount: 2000, awaitingOrders: 1 });
    expect(result.products[0]).toMatchObject({ quantity: 2, amount: 2000 });
    expect(mockSellerSettlement(orders, '2026-01', now).confirmedAmount).toBe(0);
  });
});
