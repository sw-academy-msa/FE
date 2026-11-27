import type { Product } from '../domain';
import { saleState } from '../domain';

export const TEMPORARY_SOLD_OUT_NOTE = '결제 대기 중인 수량이 풀리면 다시 구매할 수 있어요';
/** 근사치나 확정 수량이 없는 응답은 일시 품절로 단정하지 않는다. */
export function temporarySoldOut(p: Product, now: number): boolean {
  const stock = p.live;
  return saleState(p, now) === '판매 중' && !!stock && !stock.approximate
    && stock.available === 0 && stock.confirmed !== undefined
    && Math.max(0, stock.initial - stock.confirmed - stock.available) > 0;
}
