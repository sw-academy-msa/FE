/** 서버가 확정한 한도만 사용합니다. 상품 상세의 총 한도로 남은 수량을 추측하지 않습니다. */
export const isPurchaseLimitFailure = (code?: string) => code === 'PRODUCT_PURCHASE_LIMIT_EXCEEDED';
export interface PurchaseLimitDetails { purchaseLimit?: number | null; remainingPurchaseQuantity?: number | null }
export function purchaseLimitNotice(details: PurchaseLimitDetails) {
  const n = details.purchaseLimit, m = details.remainingPurchaseQuantity;
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0 || typeof m !== 'number' || !Number.isInteger(m) || m < 0 || m > n) {
    return { message: '1인 구매 한도를 넘었어요. 이 상품은 이미 구매 가능한 수량만큼 구매하셨어요.', remaining: 0 };
  }
  return { message: m === 0 ? `이 상품은 1인당 ${n}개까지 살 수 있어요. 이미 ${n}개를 구매해서 더 주문할 수 없어요.` : `이 상품은 1인당 ${n}개까지 살 수 있어요. 지금은 ${m}개까지 주문할 수 있어요.`, remaining: m };
}
