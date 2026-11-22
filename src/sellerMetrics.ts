import type { Order } from './domain';
import type { SellerSettlementDto } from './api/types';

export const sellerMonth = (time: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(time);
export function recentSellerMonths(month: string) {
  const [year, m] = month.split('-').map(Number);
  return Array.from({ length: 6 }, (_, i) => {
    const date = new Date(Date.UTC(year, m - 6 + i, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}
export function salesGauge(sold: number, total: number) {
  const ratio = total > 0 ? Math.max(0, Math.min(1, sold / total)) : 0;
  return { ratio, color: total <= 0 ? 'bg-line' : ratio < .33 ? 'bg-red' : ratio < .8 ? 'bg-gauge-warning' : 'bg-positive' };
}
/** 목업도 구매 확정 월과 상품 금액을 기준으로 한다. 결제 시각을 대신 쓰지 않는다. */
export function mockSellerSettlement(orders: Order[], month: string, now: number): SellerSettlementDto {
  const result: SellerSettlementDto = { month, confirmedOrders: 0, confirmedAmount: 0, awaitingOrders: 0, awaitingAmount: 0, products: [] };
  for (const order of orders) {
    if (['cancelled', 'refunded'].includes(order.status)) continue;
    const autoAt = order.deliveredAt === undefined ? undefined : order.deliveredAt + 7 * 86_400_000;
    const confirmedAt = order.purchaseConfirmedAt ?? (autoAt !== undefined && autoAt <= now ? autoAt : undefined);
    const amount = Math.max(0, order.total - order.shipping);
    if (confirmedAt !== undefined && confirmedAt <= now && sellerMonth(confirmedAt) === month) {
      result.confirmedOrders++; result.confirmedAmount += amount;
      let product = result.products.find(p => p.productId === order.productId);
      if (!product) { product = { productId: order.productId, productName: order.product.name, orders: 0, quantity: 0, amount: 0 }; result.products.push(product); }
      product.orders++; product.quantity += order.lines.reduce((n, l) => n + l.quantity, 0); product.amount += amount;
    } else if (confirmedAt === undefined && order.status === 'delivered' && sellerMonth(order.deliveredAt ?? order.createdAt) === month) {
      result.awaitingOrders++; result.awaitingAmount += amount;
    }
  }
  return result;
}
