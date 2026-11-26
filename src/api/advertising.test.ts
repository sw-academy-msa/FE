import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';
import { advertisingPaymentId, advertisingQuote, advertisingLabel, completeAdvertising, prepareAdvertising, captureAdvertisingReturn, readAdvertisingReturn } from './advertising';
vi.mock('./client', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
const payment = '97acde7b-6b2f-4cc5-86d7-815ca6dd7295';
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
describe('광고 전용 금융 계약', () => {
  it('광고 UUID만 복구하고 구매 주문 파서를 사용하지 않는다', () => {
    expect(advertisingPaymentId(`AD-${payment}`)).toBe(payment);
    expect(advertisingPaymentId(`SD-${payment}`)).toBeNull();
    expect(advertisingPaymentId('AD-invalid')).toBeNull();
  });
  it('원본 준비는 판매자 Product, 승인은 Payment로 분리하며 구매 금액을 보내지 않는다', async () => {
    await advertisingQuote('product-1'); await prepareAdvertising('product-1', 3, payment);
    await completeAdvertising(payment, 'synthetic-key', `AD-${payment}`);
    expect(api.get).toHaveBeenCalledWith('/v1/seller/products/product-1/advertising-quote', { service: 'purchase' });
    expect(api.post).toHaveBeenLastCalledWith(`/v1/payments/advertising/${payment}/completion`, { paymentKey: 'synthetic-key', tossOrderId: `AD-${payment}` }, { service: 'purchase', headers: { 'Idempotency-Key': payment } });
  });
  it('해시 앞뒤 쿼리를 정리하고 구매 저장소에는 공급자 키를 넣지 않는다', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('sessionStorage', { setItem: (k: string, v: string) => values.set(k, v), getItem: (k: string) => values.get(k) ?? null });
    vi.stubGlobal('location', { pathname: '/', search: `?paymentKey=synthetic-key&orderId=AD-${payment}&amount=200000`, hash: '#/seller/advertising/toss/success?amount=200001' });
    const replace = vi.fn(); vi.stubGlobal('history', { state: null, replaceState: replace });
    captureAdvertisingReturn();
    expect(readAdvertisingReturn()).toMatchObject({ amount: 200001, paymentKey: 'synthetic-key' });
    expect(replace).toHaveBeenCalledWith(null, '', '/#/seller/advertising/toss/success');
    expect([...values.keys()]).toEqual(['stockdrop:advertising:toss-return']);
  });
  it('미신청과 취소 대기를 유료 완료로 표시하지 않는다', () => {
    expect(advertisingLabel()).toBe('광고 미신청');
    expect(advertisingLabel({ requested: true, paymentStatus: 'PAID', cancellationStatus: 'REQUESTED' } as Parameters<typeof advertisingLabel>[0])).toBe('광고비 취소 처리 중');
  });
});
