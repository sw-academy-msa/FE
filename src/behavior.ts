/**
 * 행동 이벤트: GA4와 AI(POST /v1/ai/events) 이중 전송. 분석 참여(가명 analyticsId)를 확인했을 때만 보낸다.
 * - 회원제·쿠폰 플래그(MEMBERSHIP_COUPON)가 꺼져 있으면 새 이벤트는 아무것도 보내지 않는다.
 * - AI는 로그인한 구매자(운영자 제외)만, 서버 허용 이름만 보낸다(begin_checkout은 서버가 주문 이벤트로 직접 기록해 GA만).
 * - 재시도는 같은 clientEventId로 한 번. 동의 철회, 로그아웃, 계정 전환 때 대기열을 비운다. 전송 실패가 화면 동작을 막지 않는다.
 * - 개인 식별 정보는 보내지 않는다. GA user_id는 기존 가명 ID 설정(analytics.ts)만 쓴다.
 */
import { api } from './api/client';
import { analyticsConsented, gaEvent, onAnalyticsConsent } from './analytics';
import { MEMBERSHIP_COUPON } from './features';
import { getState } from './store';
import { signedIn } from './auth';

export const AI_EVENT_NAMES = ['search', 'view_item', 'view_item_list', 'select_item', 'add_to_wishlist', 'remove_from_wishlist', 'view_promotion', 'select_promotion', 'coupon_claim', 'coupon_use', 'sold_out_view'] as const;
const AI_NAMES = new Set<string>(AI_EVENT_NAMES);
export interface AiFields { productId?: string; searchTerm?: string; listId?: string; promotionId?: string; couponIssueId?: string }
interface AiEvent extends AiFields { clientEventId: string; name: string; occurredAt: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BATCH = 20, FLUSH_MS = 1500, RETRY_MS = 5000;

let queue: { account: string; event: AiEvent; tries: number }[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
onAnalyticsConsent(() => { queue = []; if (timer) { clearTimeout(timer); timer = undefined; } });

/** 로그인한 구매자(운영자 아님)의 계정 ID */
function buyerAccount(): string | undefined {
  const s = getState();
  if (!signedIn(s)) return undefined;
  return s.users.find(u => u.id === s.activeUserId)?.admin ? undefined : s.activeUserId;
}
/** AI 본문 정리: UUID가 아닌 ID와 빈 값은 빼고 검색어는 100자까지 */
export function aiEvent(name: string, fields: AiFields = {}, now = new Date()): AiEvent {
  const e: AiEvent = { clientEventId: crypto.randomUUID(), name, occurredAt: now.toISOString() };
  if (fields.productId && UUID.test(fields.productId)) e.productId = fields.productId;
  if (fields.couponIssueId && UUID.test(fields.couponIssueId)) e.couponIssueId = fields.couponIssueId;
  if (fields.searchTerm?.trim()) e.searchTerm = fields.searchTerm.trim().slice(0, 100);
  if (fields.listId) e.listId = fields.listId.slice(0, 100);
  if (fields.promotionId) e.promotionId = fields.promotionId.slice(0, 100);
  return e;
}
/** 지금 보낼 수 있는 상태인지(플래그, 동의) */
export const trackingEnabled = () => MEMBERSHIP_COUPON && analyticsConsented();

/** 이벤트 하나를 GA와 AI로 보낸다. ga가 null이면 GA는 생략, ai가 null이면 AI는 생략 */
export function track(name: string, ga: Record<string, unknown> | null, ai: AiFields | null = {}) {
  if (!trackingEnabled()) return;
  if (ga) gaEvent(name, ga);
  const account = buyerAccount();
  if (ai && account && AI_NAMES.has(name)) { queue.push({ account, event: aiEvent(name, ai), tries: 0 }); schedule(FLUSH_MS); }
}
function schedule(ms: number) { if (!timer) timer = setTimeout(() => { timer = undefined; void flush(); }, ms); }
/** 대기열을 계정별 20개씩 보낸다. 계정이 바뀌었거나 동의가 없어졌으면 버린다 */
export async function flush() {
  const account = buyerAccount();
  if (!trackingEnabled() || !account) { queue = []; return; }
  const batch = queue.filter(q => q.account === account).slice(0, MAX_BATCH);
  queue = queue.filter(q => q.account === account && !batch.includes(q));
  if (!batch.length) return;
  try { await api.post<null>('/v1/ai/events', { events: batch.map(q => q.event) }, { service: 'general' }); }
  catch (e) {
    const status = (e as { status?: number }).status ?? 0;
    // 네트워크와 5xx만 같은 clientEventId로 한 번 더. 400·401·403은 다시 보내도 같다
    const retry = batch.filter(q => q.tries < 1 && (status === 0 || status >= 500)).map(q => ({ ...q, tries: q.tries + 1 }));
    if (retry.length) { queue = [...retry, ...queue]; schedule(RETRY_MS); return; }
  }
  if (queue.length) schedule(FLUSH_MS);
}
/** 테스트용 */
export const pendingEvents = () => queue.map(q => q.event);

/* ── GA 항목 모양 ── */
export interface TrackProduct { id: string; name: string; category: string; price: number }
export const gaItem = (p: TrackProduct, extra: Record<string, unknown> = {}) => ({ item_id: p.id, item_name: p.name, item_category: p.category, price: p.price, ...extra });

/** 상품 알림 신청 성공 = add_to_wishlist, 취소 성공 = remove_from_wishlist (GA + AI) */
export function trackWishlist(p: TrackProduct | undefined, productId: string, on: boolean) {
  const name = on ? 'add_to_wishlist' : 'remove_from_wishlist';
  track(name, p ? { currency: 'KRW', value: p.price, items: [gaItem(p)] } : { currency: 'KRW', items: [{ item_id: productId }] }, { productId });
}
/** 검색어 입력이 잠시 멈췄을 때 1회 */
export const trackSearch = (term: string) => { if (term.trim()) track('search', { search_term: term.trim().slice(0, 100) }, { searchTerm: term }); };
export function trackItemList(listId: string, listName: string, items: TrackProduct[]) {
  if (!items.length) return;
  track('view_item_list', { item_list_id: listId, item_list_name: listName, items: items.slice(0, 20).map((p, i) => gaItem(p, { index: i })) }, { listId });
}
export function trackSelectItem(listId: string, listName: string, p: TrackProduct, index: number) {
  track('select_item', { item_list_id: listId, item_list_name: listName, items: [gaItem(p, { index })] }, { listId, productId: p.id });
}
/** 주문 생성(재고 확보 접수) 직후. AI는 서버가 HELD 이벤트로 기록해 GA만 */
export function trackBeginCheckout(p: TrackProduct, quantity: number, couponName?: string) {
  track('begin_checkout', { currency: 'KRW', value: p.price * quantity, ...(couponName ? { coupon: couponName } : {}), items: [gaItem(p, { quantity })] }, null);
}
export const trackSoldOut = (p: TrackProduct) => track('sold_out_view', { items: [gaItem(p)] }, { productId: p.id });
export const trackViewPromotion = (code: string, name: string, productId?: string) => track('view_promotion', { promotion_id: code, promotion_name: name }, { promotionId: code, productId });
export const trackSelectPromotion = (code: string, name: string, productId?: string) => track('select_promotion', { promotion_id: code, promotion_name: name }, { promotionId: code, productId });
export const trackCouponClaim = (code: string, issueId: string) => track('coupon_claim', { promotion_id: code, coupon_issue_id: issueId }, { promotionId: code, couponIssueId: issueId });
export const trackCouponUse = (issueId: string, productId: string, couponName: string) => track('coupon_use', { coupon: couponName, coupon_issue_id: issueId, item_id: productId }, { couponIssueId: issueId, productId });
