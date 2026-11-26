/**
 * 쿠폰(CouponService) — 일반 Gateway(`general`). 금액 계산은 order-command가 하고, 여기서는 표시용 값만 읽는다.
 * 내 쿠폰 목록 data는 배열이며 전체 개수를 주지 않는다(첫 페이지 길이로만 'N장', 가득 차면 'N장+').
 */
import { api } from './client';
import { errorMessage, isApiError } from './errors';

const service = 'general' as const;
const enc = encodeURIComponent;
export type CouponStatus = 'ISSUED' | 'LOCKED' | 'USED' | 'EXPIRED' | 'REVOKED';
export type CouponTab = 'AVAILABLE' | 'USED' | 'EXPIRED';
export interface CouponDto { issueId: string; name: string; discountType: 'AMOUNT' | 'RATE' | string; amount: number | null; rateBps: number | null; maxDiscount: number | null; minItemsAmount: number; scope: string; productId: string | null; validUntil: string | null; status: CouponStatus | string }
export interface ApplicableCouponDto { coupon: CouponDto; estimatedDiscount: number }
export interface CampaignDto { id: string; code: string; kind: string; totalBudget: number; issuedCount: number; status: string; startsAt: string; endsAt: string; demo: boolean; notificationSentAt?: string | null }
export interface CouponDefinitionDto { id: string; name: string; discountType: string; amount: number | null; rateBps: number | null; maxDiscount: number | null; minItemsAmount: number; scope: string; status: string; version: number }
export interface PublicCampaignDto { campaign: CampaignDto; definition: CouponDefinitionDto; remaining: number; claimed: boolean | null }

export const COUPON_PAGE_SIZE = 20;
/** GET /v1/coupons/me — AVAILABLE에는 사용 중(LOCKED)도 들어온다 */
export const listMyCoupons = (status: CouponTab, page = 0, signal?: AbortSignal) =>
  api.get<CouponDto[]>('/v1/coupons/me', { service, signal, query: { status, page, size: COUPON_PAGE_SIZE } }).then(r => r ?? []);
/** GET /v1/coupons/me/applicable — 예상 할인은 표시용이고 주문 잠금 때 다시 판단한다 */
export const listApplicableCoupons = (productId: string, itemsAmount: number, signal?: AbortSignal) =>
  api.get<ApplicableCouponDto[]>('/v1/coupons/me/applicable', { service, signal, query: { productId, itemsAmount } }).then(r => r ?? []);
/** GET /v1/coupons/campaigns/{code} — 비로그인도 조회. claimed는 로그인했을 때만 채운다 */
export const getCampaign = (code: string, signal?: AbortSignal) => api.get<PublicCampaignDto>(`/v1/coupons/campaigns/${enc(code)}`, { service, signal });
/** POST /v1/coupons/campaigns/{code}/claims — 이미 받았으면 기존 발급(200), 새로 받으면 201. 응답은 발급 쿠폰 그대로 */
export const claimCampaign = (code: string) => api.post<CouponDto>(`/v1/coupons/campaigns/${enc(code)}/claims`, undefined, { service });

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
/** '3,000원 할인' 또는 '10% 할인' */
export const couponDiscountLabel = (c: Pick<CouponDto, 'discountType' | 'amount' | 'rateBps'>) =>
  c.discountType === 'RATE' && c.rateBps ? `${Number((c.rateBps / 100).toFixed(2))}% 할인` : `${won(c.amount ?? 0)} 할인`;
/** 조건 줄: '1만 원 이상 구매 시 · 최대 3,000원 · 전체 상품' */
export function couponConditionLabel(c: Pick<CouponDto, 'discountType' | 'maxDiscount' | 'minItemsAmount' | 'scope'>) {
  const min = c.minItemsAmount > 0 ? (c.minItemsAmount % 10000 === 0 ? `${(c.minItemsAmount / 10000).toLocaleString('ko-KR')}만 원 이상 구매 시` : `${won(c.minItemsAmount)} 이상 구매 시`) : '금액 조건 없음';
  const max = c.discountType === 'RATE' && c.maxDiscount ? `최대 ${won(c.maxDiscount)}` : '';
  const scope = c.scope === 'PRODUCT' ? '지정 상품' : c.scope === 'ALL' ? '전체 상품' : '';
  return [min, max, scope].filter(Boolean).join(' · ');
}
/** 만료까지 3일 이내 */
export const expiringSoon = (validUntil: string | null, now = Date.now()) => { const t = validUntil ? Date.parse(validUntil) : NaN; return Number.isFinite(t) && t > now && t - now <= 3 * 86_400_000; };
/** 받기 실패 안내 */
export function claimError(e: unknown) {
  if (isApiError(e) && e.status === 404) return '받을 수 없는 쿠폰이에요. 캠페인이 끝났거나 주소가 잘못됐어요.';
  if (isApiError(e) && e.status === 409) return '쿠폰이 모두 소진됐거나 지금은 받을 수 없어요.';
  return errorMessage(e);
}
/** 첫 페이지 길이로 만든 개수 문구(전체 개수 API가 없다) */
export const couponCountLabel = (n: number) => (n >= COUPON_PAGE_SIZE ? `${COUPON_PAGE_SIZE}장+` : `${n}장`);
