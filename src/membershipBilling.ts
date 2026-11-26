/**
 * 멤버십 카드 인증(토스 빌링): 세션 생성 → SDK requestBillingAuth → #/membership/billing/success|fail 귀환 → completion.
 * authKey, customerKey는 로그, 분석, 저장소, 다른 URL에 남기지 않는다. sessionStorage에는 sessionId와 completion 멱등 키만 둔다.
 * 일반 주문 결제(tossReturn.ts payment-attempts)와 섞지 않는다.
 */
import { createMembershipSession } from './api/membership';

export type BillingPurpose = 'join' | 'card';
export interface PendingBilling { sessionId: string; completionKey: string; purpose: BillingPurpose; billingVersion?: number }
const KEY = 'stockdrop:membership-billing';
export function readPendingBilling(): PendingBilling | undefined { try { const v = JSON.parse(sessionStorage.getItem(KEY) || 'null'); return v && typeof v.sessionId === 'string' && typeof v.completionKey === 'string' ? v : undefined; } catch { return undefined; } }
export const clearPendingBilling = () => { try { sessionStorage.removeItem(KEY); } catch { /* 저장 차단 */ } };
const savePending = (p: PendingBilling) => { try { sessionStorage.setItem(KEY, JSON.stringify(p)); } catch { /* 저장 차단 시 귀환 뒤 다시 시도 안내 */ } };

/** 귀환 주소의 결과. 해시 안(#/…?…) 값을 먼저, 없으면 해시 앞(?…#/…) 값을 읽는다 */
export interface BillingReturn { ok: boolean; authKey?: string; customerKey?: string; code?: string; message?: string }
export function readBillingReturn(result: string, search: string, hash: string): BillingReturn {
  const inHash = new URLSearchParams(hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '');
  const before = new URLSearchParams(search);
  const get = (k: string) => inHash.get(k) ?? before.get(k) ?? undefined;
  if (result === 'success') return { ok: true, authKey: get('authKey'), customerKey: get('customerKey') };
  return { ok: false, code: get('code'), message: get('message') };
}
/** 읽은 즉시 주소에서 쿼리를 지운다 */
export const cleanBillingUrl = (result: string) => history.replaceState(null, '', location.pathname + '#/membership/billing/' + result);

/** 로그인이 풀려 로그인 화면에 다녀오는 동안만 메모리에 둔다(새로고침하면 사라져 다시 시도 안내) */
let held: BillingReturn | undefined;
export const holdBillingReturn = (r: BillingReturn | undefined) => { held = r; };
export const takeHeldBillingReturn = () => { const r = held; held = undefined; return r; };

const SDK = 'https://js.tosspayments.com/v2/standard';
function loadToss(): Promise<any> {
  const w = window as any;
  if (w.TossPayments) return Promise.resolve(w.TossPayments);
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = SDK; s.onload = () => res(w.TossPayments); s.onerror = () => rej(new Error('카드 등록 창을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')); document.head.appendChild(s); });
}
/** 세션을 만들고 토스 카드 인증 창으로 이동한다(돌아오지 않고 페이지가 바뀐다). URL은 서버가 준 값 그대로 */
export async function startBillingAuth(purpose: BillingPurpose, config: { planVersion: string; termsVersion: string }, billingVersion?: number) {
  const session = await createMembershipSession(crypto.randomUUID(), config);
  savePending({ sessionId: session.sessionId, completionKey: crypto.randomUUID(), purpose, billingVersion });
  const Toss = await loadToss();
  await Toss(session.clientKey).payment({ customerKey: session.customerKey }).requestBillingAuth({ method: 'CARD', successUrl: session.successUrl, failUrl: session.failUrl });
}
