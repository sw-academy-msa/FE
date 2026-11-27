import { describe, expect, it } from 'vitest';
import { isPurchaseLimitFailure, purchaseLimitNotice } from './purchaseLimit';
describe('구매 한도 안내', () => {
  it('재고 부족과 결제 실패를 한도 초과로 분류하지 않는다', () => {
    expect(isPurchaseLimitFailure('PRODUCT_STOCK')).toBe(false);
    expect(isPurchaseLimitFailure('PAYMENT_NOT_COMPLETED')).toBe(false);
    expect(isPurchaseLimitFailure('PRODUCT_PURCHASE_LIMIT_EXCEEDED')).toBe(true);
  });
  it('모두 구매했으면 확인만 가능하도록 남은 수량을 0으로 준다', () => {
    expect(purchaseLimitNotice({ purchaseLimit: 1, remainingPurchaseQuantity: 0 })).toEqual({ message: '이 상품은 1인당 1개까지 살 수 있어요. 이미 1개를 구매해서 더 주문할 수 없어요.', remaining: 0 });
  });
  it('일부 남았으면 주문 가능한 수량을 안내한다', () => {
    expect(purchaseLimitNotice({ purchaseLimit: 3, remainingPurchaseQuantity: 1 })).toEqual({ message: '이 상품은 1인당 3개까지 살 수 있어요. 지금은 1개까지 주문할 수 있어요.', remaining: 1 });
  });
  it('누락되거나 잘못된 숫자는 추측하지 않는다', () => {
    for (const d of [{}, { purchaseLimit: 2 }, { purchaseLimit: 2, remainingPurchaseQuantity: 3 }]) {
      expect(purchaseLimitNotice(d)).toEqual({ message: '1인 구매 한도를 넘었어요. 이 상품은 이미 구매 가능한 수량만큼 구매하셨어요.', remaining: 0 });
    }
  });
});
