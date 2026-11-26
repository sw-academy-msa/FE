import { describe, expect, it, vi } from 'vitest';
// client.ts 경로가 import 시점에 window·localStorage를 쓸 수 있다(node 환경에는 없음)
const mem = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {}, localStorage: globalThis.localStorage });
const { adminCouponError, campaignRequest, campaignStatusLabel, DEFAULT_DEFINITION, definitionRequest, definitionsFor } = await import('./api/adminCoupons');
const { ApiError } = await import('./api/client');

const def = (o: Record<string, unknown> = {}) => ({ id: 'd-all', name: '회원 전용', discountType: 'AMOUNT', amount: 3000, rateBps: null, maxDiscount: null, minItemsAmount: 10000, scope: 'ALL', status: 'ACTIVE', version: 1, ...o });
const defs = [def(), def({ id: 'd-prod', scope: 'PRODUCT' }), def({ id: 'd-old', status: 'RETIRED' })];
const campaign = { kind: 'CLAIM' as const, definitionId: 'd-all', ruleCode: '' as const, code: 'WELCOME_1000', totalBudget: '1,000', startsAt: '2026-12-01T00:00', endsAt: '2026-12-31T23:59', demo: false };

describe('쿠폰 정의 요청', () => {
  it('기본 예시는 정액 3,000원, 최소 10,000원, 발급 후 30일(분 단위)', () => {
    const r = definitionRequest({ ...DEFAULT_DEFINITION, name: ' 회원 쿠폰 ' });
    expect(r.errors).toEqual({});
    expect(r.body).toMatchObject({ name: '회원 쿠폰', discountType: 'AMOUNT', amount: 3000, rateBps: null, maxDiscount: null, minItemsAmount: 10000, scope: 'ALL', validityMode: 'RELATIVE', validMinutes: 43200, validFrom: null, validUntil: null, noticeLeadMinutes: null });
  });
  it('정률은 bps와 최대 할인이 필수, 만료 알림은 분으로', () => {
    const r = definitionRequest({ ...DEFAULT_DEFINITION, name: '맞춤', discountType: 'RATE', rate: '10', maxDiscount: '3,000', minItemsAmount: '', scope: 'PRODUCT', noticeHours: '12' });
    expect(r.body).toMatchObject({ amount: null, rateBps: 1000, maxDiscount: 3000, minItemsAmount: 0, scope: 'PRODUCT', noticeLeadMinutes: 720 });
    expect(definitionRequest({ ...DEFAULT_DEFINITION, name: 'x', discountType: 'RATE', rate: '0', maxDiscount: '' }).errors).toMatchObject({ rateBps: expect.any(String), maxDiscount: expect.any(String) });
  });
  it('빈 이름, 0일, 고정 기간 순서 오류는 칸 오류', () => {
    expect(definitionRequest({ ...DEFAULT_DEFINITION, validDays: '0' }).errors).toMatchObject({ name: expect.any(String), validMinutes: '1일 이상 입력해 주세요.' });
    const r = definitionRequest({ ...DEFAULT_DEFINITION, name: 'x', validityMode: 'FIXED', validFrom: '2026-12-02T00:00', validUntil: '2026-12-01T00:00' });
    expect(r.errors).toEqual({ validUntil: '시작보다 뒤로 골라 주세요.' });
  });
});

describe('캠페인 요청', () => {
  it('CLAIM, MEMBER는 전체 상품 정의만, TARGETED는 특정 상품 정의만 고를 수 있다', () => {
    expect(definitionsFor('CLAIM', defs as never).map(d => d.id)).toEqual(['d-all']);
    expect(definitionsFor('MEMBER', defs as never).map(d => d.id)).toEqual(['d-all']);
    expect(definitionsFor('TARGETED', defs as never).map(d => d.id)).toEqual(['d-prod']);
    expect(campaignRequest({ ...campaign, kind: 'MEMBER', definitionId: 'd-prod' }, defs as never).errors.definitionId).toBeTruthy();
  });
  it('본문: 1인 한도 1, 예산 숫자, ISO 시각, 규칙은 맞춤형만', () => {
    const r = campaignRequest(campaign, defs as never);
    expect(r.body).toMatchObject({ code: 'WELCOME_1000', definitionId: 'd-all', kind: 'CLAIM', ruleCode: null, totalBudget: 1000, perAccountLimit: 1, demo: false });
    expect(r.body!.startsAt).toBe(new Date('2026-12-01T00:00').toISOString());
    const t = campaignRequest({ ...campaign, kind: 'TARGETED', definitionId: 'd-prod', ruleCode: 'SALE_OPEN', code: 'SALE_OPEN_DEMO', demo: true }, defs as never);
    expect(t.body).toMatchObject({ kind: 'TARGETED', ruleCode: 'SALE_OPEN', demo: true });
    expect(campaignRequest({ ...campaign, kind: 'TARGETED', definitionId: 'd-prod' }, defs as never).errors.ruleCode).toBeTruthy();
  });
  it('코드 형식, 예산 0, 기간 역순은 칸 오류', () => {
    const r = campaignRequest({ ...campaign, code: 'bad-code', totalBudget: '0', endsAt: '2026-11-01T00:00' }, defs as never);
    expect(Object.keys(r.errors).sort()).toEqual(['code', 'endsAt', 'totalBudget']);
  });
  it('상태 배지', () => {
    expect(campaignStatusLabel('ACTIVE')).toEqual(['진행 중', true]);
    expect(campaignStatusLabel('DRAFT')).toEqual(['준비', false]);
    expect(campaignStatusLabel('PAUSED')).toEqual(['일시정지', false]);
  });
});

describe('서버 오류', () => {
  it('400 violations는 칸으로(request. 접두어 제거)', () => {
    const e = new ApiError('요청값이 올바르지 않습니다.', 400, 'COMMON_INVALID_REQUEST', 't', [{ field: 'code', message: '형식이 올바르지 않습니다.' }]);
    expect(adminCouponError(e, 'campaign')).toEqual({ fields: { code: '형식이 올바르지 않습니다.' }, message: '' });
  });
  it('코드 중복(409 COMMON_DATA_CONFLICT)은 코드 칸, COUPON_INVALID는 시트 안내', () => {
    expect(adminCouponError(new ApiError('충돌', 409, 'COMMON_DATA_CONFLICT'), 'campaign').fields.code).toBe('이미 쓰고 있는 캠페인 코드예요.');
    expect(adminCouponError(new ApiError('x', 400, 'COUPON_INVALID'), 'definition').message).toContain('쿠폰 조건이 맞지 않아요');
  });
});
