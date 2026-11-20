/**
 * 홈 화면 앱(아이폰 standalone, 안드로이드 PWA)에서 토스 결제창을 앱 화면 안이 아니라 Safari나 Chrome으로 연다.
 * 흐름: 앱 결제 화면(배송지 확정) → '브라우저에서 결제하기' → 브라우저가 ?payStart=주문id 로 열림 → 결제 시작 화면(#/payments/toss/start)
 *   → (브라우저에 로그인이 없으면 로그인, 이후엔 브라우저 쿠키로 유지) → 주문 상태와 금액 확인 → 토스 결제창(같은 탭)
 *   → successUrl/failUrl(브라우저) → 승인 요청(requestKey로 한 번만)과 확정 확인 → '앱으로 돌아가 주세요'
 *   → 앱은 다시 보일 때(visibilitychange, focus, pageshow) 주문 상태를 다시 조회해 결제 완료, 실패, 만료 화면을 보여 준다.
 * 아이폰은 Safari에서 끝난 결제가 앱으로 자동 복귀하지 않아 사용자가 앱으로 돌아와야 한다. 일반 브라우저는 지금처럼 같은 탭.
 */
export const PAY_START_PARAM = 'payStart';
export const TOSS_START_PATH = '/payments/toss/start';

export const isStandaloneApp = () => typeof window !== 'undefined' && ((navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true);
const iosMajor = (ua: string) => { const m = /(?:iPhone|iPad|iPod).*? OS (\d+)_/.exec(ua); return m ? Number(m[1]) : 0; };
const isAndroid = (ua: string) => /Android/i.test(ua);

/** 브라우저에서 열 결제 시작 주소. 해시(#)를 쓰지 않는다(안드로이드 intent 주소의 #Intent와 겹친다) */
export const payStartUrl = (origin: string, pathname: string, orderId: string) => `${origin}${pathname}?${PAY_START_PARAM}=${encodeURIComponent(orderId)}`;
/** 브라우저가 시작 주소로 열렸을 때 바꿀 해시(없으면 null) */
export function payStartHash(search: string): string | null {
  const id = new URLSearchParams(search).get(PAY_START_PARAM);
  return id ? `#${TOSS_START_PATH}?order=${encodeURIComponent(id)}` : null;
}
/** 시스템 브라우저로 여는 주소: iOS 17 이상 x-safari-https, 안드로이드 Chrome intent, 그 밖은 그대로(새 창) */
export function externalBrowserUrl(url: string, ua: string): string {
  if (iosMajor(ua) >= 17) return `x-safari-${url}`;
  if (isAndroid(ua)) { const u = new URL(url); return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(':', '')};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`; }
  return url;
}
/** 사용자 동작(클릭) 안에서 바로 부른다(비동기 뒤에 열면 팝업 차단) */
export function openInSystemBrowser(url: string, ua = navigator.userAgent) {
  const ext = externalBrowserUrl(url, ua);
  if (ext !== url) window.location.href = ext; else window.open(url, '_blank');
}

/* ── 상태 보관 ── */
const read = (st: Storage | undefined, k: string) => { try { return st?.getItem(k) ?? null; } catch { return null; } };
const write = (st: Storage | undefined, k: string, v: string | null) => { try { if (v === null) st?.removeItem(k); else st?.setItem(k, v); } catch { /* 저장 못 해도 서버 상태로 확인한다 */ } };
const ss = () => (typeof sessionStorage === 'undefined' ? undefined : sessionStorage);
/** 브라우저 쪽: 앱에서 넘어온 결제(결과를 보여 준 뒤 앱으로 돌아가라고 안내) */
const HANDOFF_KEY = 'stockdrop:toss-handoff';
export const markHandoff = (orderId: string | null) => write(ss(), HANDOFF_KEY, orderId);
export const handoffOrder = () => read(ss(), HANDOFF_KEY);
/** 앱 쪽: 이 주문을 브라우저에서 결제 중(돌아오면 다시 조회) */
const externalKey = (orderId: string) => `stockdrop:toss-external:${orderId}`;
export const markExternal = (orderId: string, on: boolean) => write(ss(), externalKey(orderId), on ? '1' : null);
export const isExternal = (orderId: string) => read(ss(), externalKey(orderId)) === '1';
