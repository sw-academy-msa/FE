/**
 * 상품 알림 신청(상품 카드·상품 상세의 '알림 받기'). 신청한 상품의 판매 시작·가격 인하·수량 임박 알림을 받는다.
 * 실제 모드는 Notification 서버(GET·PUT·DELETE /v1/notifications/product-alerts)에 저장하고, mock은 이 기기에만 저장한다.
 * 로그인하지 않았으면 로그인 화면으로 보낸다. 실패하면 화면 표시를 되돌리고 이유를 토스트로 알린다.
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { listProductAlerts, productAlertError, subscribeProductAlert, unsubscribeProductAlert } from './api';
import { loginHref, signedIn } from './auth';
import { useToast } from './components/ui';
import { USE_MOCK } from './config';
import { useStore } from './store';

const NOTIFY_KEY = 'stockdrop:notified-products';
/** mock 신청 목록. 처음 열면 예시 상품 하나가 신청된 상태로 보인다 */
export function readNotified(): string[] { try { const v = JSON.parse(localStorage.getItem(NOTIFY_KEY) || 'null'); return Array.isArray(v) ? v : ['basket']; } catch { return []; } }
function saveNotified(ids: string[]) { try { localStorage.setItem(NOTIFY_KEY, JSON.stringify(ids)); } catch { /* 저장 차단 시 화면 상태만 유지 */ } }

export function useNotified() {
  const s = useStore(), navigate = useNavigate(), location = useLocation(), toast = useToast();
  const live = !USE_MOCK && signedIn(s), account = live ? s.auth?.userId : undefined;
  const [ids, setIds] = useState<string[]>(() => (USE_MOCK ? readNotified() : []));
  useEffect(() => {
    if (USE_MOCK) return;
    if (!account) { setIds([]); return; }
    const c = new AbortController();
    listProductAlerts(c.signal).then(list => setIds(list.filter(a => a.subscribed).map(a => a.productId))).catch(() => { /* 목록을 못 받으면 신청 전 상태로 보인다 */ });
    return () => c.abort();
  }, [account]);
  const toggle = async (id: string) => {
    const on = ids.includes(id), flip = (prev: string[]) => (on ? prev.filter(x => x !== id) : [...prev.filter(x => x !== id), id]);
    if (USE_MOCK) { setIds(prev => { const next = flip(prev); saveNotified(next); return next; }); return; }
    if (!account) { navigate(loginHref(location.pathname)); return; }
    setIds(flip);
    try {
      if (on) await unsubscribeProductAlert(id); else await subscribeProductAlert(id);
      toast(on ? '상품 알림을 취소했어요.' : '판매 시작·가격 인하·수량 임박 때 알려드릴게요.');
    } catch (e) {
      setIds(prev => (on ? [...prev.filter(x => x !== id), id] : prev.filter(x => x !== id)));
      toast(productAlertError(e));
    }
  };
  return [ids, toggle] as const;
}
