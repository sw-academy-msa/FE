import { api } from './client';
import { readTossParams } from './tossReturn';

/** 광고는 PurchaseGateway와 별도 저장소를 사용하며 구매 주문 승인 함수는 호출하지 않는다. */
export interface AdvertisingSummary { requested: boolean; applicationId: string | null; submissionId: string | null; amount: number | null; currency: string | null; paymentStatus: string | null; cancellationStatus: string | null; paidAt: string | null; canceledAt: string | null; paymentUpdatedAt: string | null; fulfillmentStatus: string | null; campaignId: string | null; snsUrl: string | null }
export interface AdvertisingQuote { productVersion: number; formulaVersion: string; unitPrice: number; quantity: number; amount: number; currency: string; enabled: boolean; termsVersion: string }
export interface AdvertisingSubmission { applicationId: string; submissionId: string; intentStatus: string; paymentStatus: string; amount: number; expiresAt: string; paymentAttemptId: string | null; checkoutReady: boolean; cancellationStatus: string }
export interface AdvertisingPayment { paymentId: string; applicationId: string; submissionId: string; productId: string; amount: number; currency: string; paymentStatus: string; cancellationRequested: boolean }
export interface AdvertisingCheckout { paymentId: string; applicationId: string; tossOrderId: string; amount: number; currency: string; clientKey: string; expiresAt: string; successUrl: string; failUrl: string; state: string }
const options = { service: 'purchase' as const };
const productPath = (id: string) => `/v1/seller/products/${encodeURIComponent(id)}`;
const paymentPath = (id: string) => `/v1/payments/advertising/${encodeURIComponent(id)}`;
export const advertisingQuote = (id: string) => api.get<AdvertisingQuote>(`${productPath(id)}/advertising-quote`, options);
export const prepareAdvertising = (id: string, version: number, key: string) => api.post<AdvertisingSubmission>(`${productPath(id)}/advertising-submissions`, { expectedVersion: version, termsVersion: 'advertising-v1', advertisingAgreed: true }, { ...options, headers: { 'Idempotency-Key': key } });
export const advertisingSubmission = (id: string, application: string) => api.get<AdvertisingSubmission>(`${productPath(id)}/advertising-submissions/${encodeURIComponent(application)}`, options);
export const abandonAdvertising = (id: string, application: string) => api.post<AdvertisingSubmission>(`${productPath(id)}/advertising-submissions/${encodeURIComponent(application)}/abandon`, {}, { ...options, headers: { 'Idempotency-Key': application } });
export const advertisingPayment = (id: string) => api.get<AdvertisingPayment>(paymentPath(id), options);
export const advertisingCheckout = (id: string) => api.get<AdvertisingCheckout>(`${paymentPath(id)}/checkout`, options);
/** paymentId 자체를 멱등 UUID로 사용해 저장소 유실과 다른 탭에서도 같은 키로 접수한다. */
export const completeAdvertising = (id: string, paymentKey: string, tossOrderId: string) => api.post<AdvertisingPayment>(`${paymentPath(id)}/completion`, { paymentKey, tossOrderId }, { ...options, headers: { 'Idempotency-Key': id } });
export const advertisingPaymentId = (order: string | null) => order && /^AD-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(order) ? order.slice(3) : null;
const RETURN_KEY = 'stockdrop:advertising:toss-return', CONTEXT_KEY = 'stockdrop:advertising:context';
export interface AdvertisingContext { productId: string; applicationId: string; paymentId?: string }
export type AdvertisingReturn = ReturnType<typeof readTossParams> & { result: 'success' | 'fail' };
const read = <T>(key: string): T | null => { try { return JSON.parse(sessionStorage.getItem(key) ?? 'null'); } catch { return null; } };
const write = (key: string, value: unknown) => { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* 저장 실패 시 AD 주문번호와 서버 원본으로 복구한다. */ } };
let volatileContext: AdvertisingContext | null = null, volatileReturn: AdvertisingReturn | null = null;
export const rememberAdvertising = (context: AdvertisingContext) => { volatileContext = context; write(CONTEXT_KEY, context); };
export const readAdvertisingContext = () => read<AdvertisingContext>(CONTEXT_KEY) ?? volatileContext;
export const readAdvertisingReturn = () => read<AdvertisingReturn>(RETURN_KEY) ?? volatileReturn;
/** 라우터와 분석 초기화 전에 공급자 쿼리를 보관하고 주소에서 즉시 제거한다. */
export function captureAdvertisingReturn() {
  const result = location.hash.split('?')[0].match(/^#\/seller\/advertising\/toss\/(success|fail)$/)?.[1];
  if (!result) return;
  const params = readTossParams(location);
  if (params.orderId || params.paymentKey || params.code) { volatileReturn = { ...params, result: result === 'fail' ? 'fail' : 'success' }; write(RETURN_KEY, volatileReturn); }
  if (location.search || location.hash.includes('?')) history.replaceState(history.state, '', `${location.pathname}#/seller/advertising/toss/${result}`);
}
export function advertisingLabel(a?: AdvertisingSummary) {
  if (!a?.requested) return '광고 미신청';
  if (a.cancellationStatus === 'REQUESTED' || a.cancellationStatus === 'RETRYING') return '광고비 취소 처리 중';
  return ({ PENDING: '광고 결제 확인 중', PAID: '광고 결제 완료', CANCELED: '광고비 취소 완료', FAILED: '광고 결제 실패' } as Record<string, string>)[a.paymentStatus ?? ''] ?? '광고 결제 확인 중';
}
