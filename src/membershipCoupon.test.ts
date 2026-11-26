import { describe, expect, it, vi } from 'vitest';
// store.ts가 import 시점에 window·localStorage를 쓴다(node 환경에는 없음)
const mem = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {}, localStorage: globalThis.localStorage });
const { couponConditionLabel, couponCountLabel, couponDiscountLabel, expiringSoon } = await import('./api/coupons');
const { membershipView } = await import('./api/membership');
const { notificationPath, notificationFromApi } = await import('./api/notifications');
const { amountsFromApi, orderFromApi } = await import('./api/mappers');
const { holdFromApi } = await import('./api/orders');
const { aiEvent, AI_EVENT_NAMES, track, pendingEvents } = await import('./behavior');
const { readBillingReturn } = await import('./membershipBilling');

const base = { state: 'NONE', active: false, entitlementUntil: null, periodEnd: null, autoRenew: false, amount: 0, currency: 'KRW', sourceVersion: 0, cancelRequested: false, updatedAt: null };

describe('쿠폰 표시', () => {
  it('정액과 정률 할인 문구', () => {
    expect(couponDiscountLabel({ discountType: 'AMOUNT', amount: 3000, rateBps: null })).toBe('3,000원 할인');
    expect(couponDiscountLabel({ discountType: 'RATE', amount: null, rateBps: 1000 })).toBe('10% 할인');
  });
  it('조건 줄: 최소 금액, 정률 상한, 범위', () => {
    expect(couponConditionLabel({ discountType: 'AMOUNT', maxDiscount: null, minItemsAmount: 10000, scope: 'ALL' })).toBe('1만 원 이상 구매 시 · 전체 상품');
    expect(couponConditionLabel({ discountType: 'RATE', maxDiscount: 3000, minItemsAmount: 0, scope: 'PRODUCT' })).toBe('금액 조건 없음 · 최대 3,000원 · 지정 상품');
  });
  it('개수는 첫 페이지 기준, 20개가 차면 20장+', () => {
    expect(couponCountLabel(2)).toBe('2장');
    expect(couponCountLabel(20)).toBe('20장+');
  });
  it('만료 임박은 3일 이내만', () => {
    const now = Date.parse('2026-11-26T00:00:00Z');
    expect(expiringSoon('2026-11-28T00:00:00Z', now)).toBe(true);
    expect(expiringSoon('2026-12-05T00:00:00Z', now)).toBe(false);
    expect(expiringSoon(null, now)).toBe(false);
  });
});

describe('멤버십 화면 상태', () => {
  it('자격 기준: 이용 중, 해지 예약, 결제 실패 유예', () => {
    expect(membershipView({ ...base, state: 'ACTIVE', active: true, autoRenew: true })).toBe('active');
    expect(membershipView({ ...base, state: 'ACTIVE', active: true, autoRenew: true, cancelRequested: true })).toBe('cancelScheduled');
    expect(membershipView({ ...base, state: 'CANCEL_SCHEDULED', active: true })).toBe('cancelScheduled');
    expect(membershipView({ ...base, state: 'GRACE', active: true, autoRenew: true })).toBe('grace');
  });
  it('자격이 없으면 금융 상태로 가입 확인 중과 비회원을 나눈다', () => {
    const billing = { subscriptionId: 's', state: 'PENDING', autoRenew: true, periodStart: null, periodEnd: null, entitlementUntil: null, nextChargeAt: null, amount: 4900, currency: 'KRW', version: 1, billingRegistrationRequired: false };
    expect(membershipView(base, billing)).toBe('pending');
    expect(membershipView(base, null)).toBe('none');
    expect(membershipView({ ...base, state: 'EXPIRED' }, { ...billing, state: 'EXPIRED', billingRegistrationRequired: true })).toBe('none');
  });
});

describe('알림 딥링크', () => {
  it('회원제는 멤버십 관리 시트, 쿠폰은 내 쿠폰 시트로 간다', () => {
    expect(notificationPath({ targetType: 'MEMBERSHIP', targetId: 'm1', relatedId: null })).toBe('/my?membership=manage');
    expect(notificationPath({ targetType: 'COUPON', targetId: 'c1', relatedId: null })).toBe('/my?coupons=available');
  });
  it('기존 분기는 그대로', () => {
    expect(notificationPath({ targetType: 'PRODUCT', targetId: 'p1', relatedId: null })).toBe('/product/p1');
    expect(notificationPath({ targetType: 'SELLER_APPLICATION', targetId: 'a1', relatedId: null })).toBe('/apply');
  });
  it('회원제·쿠폰 알림은 구매 묶음', () => {
    const n = { id: 'n', type: 'MEMBERSHIP_PAYMENT_FAILED', title: 't', body: 'b', targetId: 'x', relatedId: null, deadline: null, occurredAt: '2026-11-26T00:00:00Z', createdAt: '2026-11-26T00:00:00Z', readAt: null };
    expect(notificationFromApi({ ...n, targetType: 'MEMBERSHIP' }).kind).toBe('구매');
    expect(notificationFromApi({ ...n, type: 'COUPON_EXPIRING', targetType: 'COUPON' }).kind).toBe('구매');
  });
});

describe('서버 금액 요약 보존', () => {
  const cmd = { orderId: 'o1', orderNumber: 'SD-o1', version: 1, state: 'HELD' as const, delivery: null, productId: 'p1', sellerId: 's', productName: 'n', brandOrStore: 'b', items: [], address: null, unitPrice: 50000, shippingFee: 3000, totalAmount: 47000, dispatchBusinessDays: 2, expiresAt: null, serverTime: '2026-11-26T00:00:00Z', paymentAttemptId: null, confirmedAt: null, carrier: null, trackingNumber: null, failureCode: null, termsVersion: null,
    itemsAmount: 50000, couponIssueId: 'c1', couponState: 'LOCKED', couponRejectCode: null, couponDiscount: 3000, originalShippingFee: 3000, membershipShippingDiscount: 3000, effectiveShippingFee: 0 };
  it('checkout 응답 → Hold.amounts', () => {
    expect(holdFromApi(cmd, 'u').amounts).toEqual({ itemsAmount: 50000, couponIssueId: 'c1', couponState: 'LOCKED', couponRejectCode: undefined, couponDiscount: 3000, originalShippingFee: 3000, membershipShippingDiscount: 3000, effectiveShippingFee: 0, totalAmount: 47000 });
  });
  it('할인 필드가 없는 예전 응답은 amounts가 없다(기존 계산 그대로)', () => {
    expect(amountsFromApi({ totalAmount: 5000 })).toEqual({});
    const d = { orderId: 'o', orderNumber: 'SD-o', productId: 'p', productName: 'n', brandOrStore: 'b', items: [], state: 'CONFIRMED' as const, delivery: null, totalAmount: 5000, createdAt: '2026-01-01T00:00:00Z', sourceVersion: 1, address: null, unitPrice: 2000, shippingFee: 3000, dispatchBusinessDays: 2, expiresAt: null, confirmedAt: null, carrier: null, trackingNumber: null, shippedAt: null, deliveredAt: null };
    expect('amounts' in orderFromApi(d, 'u')).toBe(false);
  });
});

describe('행동 이벤트', () => {
  it('서버 허용 이름 목록과 같다(begin_checkout은 서버가 기록)', () => {
    expect([...AI_EVENT_NAMES].sort()).toEqual(['add_to_wishlist', 'coupon_claim', 'coupon_use', 'remove_from_wishlist', 'search', 'select_item', 'select_promotion', 'sold_out_view', 'view_item', 'view_item_list', 'view_promotion']);
  });
  it('AI 본문은 UUID가 아닌 ID를 빼고 검색어를 자른다', () => {
    const e = aiEvent('search', { productId: 'not-uuid', searchTerm: '  ' + 'a'.repeat(150) }, new Date('2026-11-26T00:00:00Z'));
    expect(e.productId).toBeUndefined(); expect(e.searchTerm).toHaveLength(100); expect(e.occurredAt).toBe('2026-11-26T00:00:00.000Z');
    expect(aiEvent('add_to_wishlist', { productId: '0b9e4b1a-1c2d-4e5f-8a9b-0c1d2e3f4a5b' }).productId).toBe('0b9e4b1a-1c2d-4e5f-8a9b-0c1d2e3f4a5b');
  });
  it('플래그가 꺼져 있거나 분석 동의가 없으면 대기열에 넣지 않는다', () => {
    track('search', { search_term: 'x' }, { searchTerm: 'x' });
    expect(pendingEvents()).toHaveLength(0);
  });
});

describe('카드 인증 귀환 쿼리', () => {
  it('해시 안(#/…?…)과 해시 앞(?…#/…) 모두 읽고, 둘 다 있으면 해시 안을 쓴다', () => {
    expect(readBillingReturn('success', '', '#/membership/billing/success?customerKey=ck&authKey=ak')).toEqual({ ok: true, authKey: 'ak', customerKey: 'ck' });
    expect(readBillingReturn('success', '?customerKey=ck2&authKey=ak2', '#/membership/billing/success')).toEqual({ ok: true, authKey: 'ak2', customerKey: 'ck2' });
    expect(readBillingReturn('success', '?authKey=old', '#/membership/billing/success?authKey=new&customerKey=c').authKey).toBe('new');
  });
  it('실패는 code와 message', () => {
    expect(readBillingReturn('fail', '', '#/membership/billing/fail?code=PAY_PROCESS_CANCELED&message=%EC%B7%A8%EC%86%8C')).toEqual({ ok: false, code: 'PAY_PROCESS_CANCELED', message: '취소' });
  });
});
