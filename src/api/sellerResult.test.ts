import { describe, expect, it } from 'vitest';
import { productSettlement } from './sellerOrders';
import { sellerProductFromApi } from './sellerProducts';
import { mergeProducts, productFromApi } from './products';
import { emptyState } from '../domain';
import type { ProductDetailDto, SellerProductDto, SellerSettlementDto } from './types';

const settlement: SellerSettlementDto = { month: '2026-11', confirmedOrders: 1, confirmedAmount: 2000, awaitingOrders: 1, awaitingAmount: 100,
  products: [{ productId: 'p1', productName: '패딩', orders: 1, quantity: 1, amount: 2000 }] };

describe('상품별 구매 확정 정산', () => {
  it('상품 금액 2000원과 배송비 3000원 주문은 서버 정산 2000원으로 수수료 200원과 정산 1800원을 계산한다', () => {
    expect(productSettlement(settlement, 'p1')).toEqual({ gross: 2000, fee: 200, net: 1800, rate: 10 });
  });
  it('구매 미확정 상품과 다른 상품의 금액은 정산에 넣지 않는다', () => {
    expect(productSettlement(settlement, 'unconfirmed')).toEqual({ gross: 0, fee: 0, net: 0, rate: 10 });
  });
  it('상품 금액의 원 미만 수수료를 버리고 나머지를 지급한다', () => {
    const d = { ...settlement, products: [{ ...settlement.products[0], amount: 2019 }] };
    expect(productSettlement(d, 'p1')).toEqual({ gross: 2019, fee: 201, net: 1818, rate: 10 });
  });
  it('수량과 무관하게 고정 10%를 적용한다', () => {
    expect(productSettlement(settlement, 'p1').rate).toBe(10);
  });
});

it('공개 상세의 남은 옵션 재고가 0이어도 판매자 최초 수량과 판매 수량은 유지한다', () => {
  const p = sellerProductFromApi({ id: 'p1', sellerId: 's1', status: 'APPROVED', options: [
    { id: 'o1', label: '카키', initialQuantity: 1, confirmedQuantity: 0, reservedQuantity: 1, availableQuantity: 0 },
  ] } as SellerProductDto);
  expect(p.listQuantity).toEqual({ total: 1, sold: 0 });
  const s = emptyState(); mergeProducts(s, [p]);
  mergeProducts(s, [productFromApi({ id: 'p1', sellerId: 's1', startsAt: '', endsAt: '', options: [{ id: 'o1', label: '카키', availableQuantity: 0 }], stock: { initialQuantity: 1, confirmedQuantity: 0, availableQuantity: 0 } } as ProductDetailDto)]);
  expect(s.products[0].options[0].stock).toBe(0);
  expect(s.products[0].listQuantity).toEqual({ total: 1, sold: 0 });
});
