/**
 * 상품 알림 신청(상품 카드·판매 일정·상품 상세의 '알림 받기'). 신청한 상품의 판매 시작·가격 인하·수량 임박 알림을 받는다.
 * 실제 모드는 Notification 서버(GET·PUT·DELETE /v1/notifications/product-alerts)에 저장하고, mock은 이 기기에만 저장한다.
 *
 * 신청 목록은 화면 사이에 하나로 공유한다(홈에서 신청한 뒤 상세로 가도 같은 값). 규칙:
 * - 목록을 확인하기 전(조회 중·실패)에는 신청·취소를 보내지 않는다. 실패했으면 다시 조회한다.
 * - 같은 상품은 앞선 요청이 끝날 때까지 다음 요청을 보내지 않는다(신청·취소 순서 뒤바뀜 방지).
 * - 변경이 시작된 뒤 도착한 예전 목록 응답은 버린다.
 */
import { useEffect, useSyncExternalStore } from 'react';
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

type Status = 'idle' | 'loading' | 'ready' | 'failed';
interface AlertState { account?: string; ids: string[]; status: Status; busy: string[] }
let state: AlertState = { ids: USE_MOCK ? readNotified() : [], status: USE_MOCK ? 'ready' : 'idle', busy: [] };
let generation = 0; // 신청·취소가 끝날 때마다 늘린다. 조회 시작 때 값과 다르면 그 응답은 예전 것
const listeners = new Set<() => void>();
const set = (patch: Partial<AlertState>) => { state = { ...state, ...patch }; listeners.forEach(l => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** 계정의 신청 목록을 받는다. 이미 받았거나 받는 중이면 다시 보내지 않는다(force는 실패 후 재시도) */
async function load(account: string, force = false) {
  if (!force && state.account === account && (state.status === 'loading' || state.status === 'ready')) return;
  const started = generation;
  set({ account, status: 'loading', ...(state.account === account ? {} : { ids: [], busy: [] }) });
  try {
    const list = await listProductAlerts();
    if (state.account !== account) return; // 그사이 로그아웃·계정 전환
    if (started !== generation) { void load(account, true); return; } // 조회 중에 신청·취소가 끝났다: 예전 응답을 버리고 다시 받는다
    set({ ids: list.filter(a => a.subscribed).map(a => a.productId), status: 'ready' });
  } catch {
    if (state.account === account) set({ status: 'failed' });
  }
}

export function useNotified() {
  const s = useStore(), navigate = useNavigate(), location = useLocation(), toast = useToast();
  const snap = useSyncExternalStore(subscribe, () => state, () => state);
  const account = !USE_MOCK && signedIn(s) ? s.auth?.userId : undefined;
  useEffect(() => {
    if (USE_MOCK) return;
    if (account) void load(account);
    else if (state.account) set({ account: undefined, ids: [], status: 'idle', busy: [] });
  }, [account]);
  const toggle = async (id: string) => {
    if (USE_MOCK) { const next = state.ids.includes(id) ? state.ids.filter(x => x !== id) : [...state.ids, id]; saveNotified(next); set({ ids: next }); return; }
    if (!account) { navigate(loginHref(location.pathname + location.search)); return; }
    if (state.status !== 'ready') {
      toast(state.status === 'failed' ? '알림 신청 상태를 불러오지 못했어요. 다시 확인하고 있으니 잠시 후 눌러 주세요.' : '알림 신청 상태를 확인하고 있어요. 잠시 후 눌러 주세요.');
      if (state.status === 'failed') void load(account, true);
      return;
    }
    if (state.busy.includes(id)) return; // 같은 상품의 앞선 요청이 끝나기 전
    const on = state.ids.includes(id);
    set({ busy: [...state.busy, id], ids: on ? state.ids.filter(x => x !== id) : [...state.ids, id] });
    try {
      if (on) await unsubscribeProductAlert(id); else await subscribeProductAlert(id);
      toast(on ? '상품 알림을 취소했어요.' : '상품 알림을 신청했어요. 알림 설정의 ‘상품 알림’이 켜져 있어야 받을 수 있어요.');
    } catch (e) {
      if (state.account === account) set({ ids: on ? [...state.ids.filter(x => x !== id), id] : state.ids.filter(x => x !== id) });
      toast(productAlertError(e));
    } finally {
      generation++;
      if (state.account === account) set({ busy: state.busy.filter(x => x !== id) });
    }
  };
  return [snap.ids, toggle, { loading: snap.status === 'loading', failed: snap.status === 'failed', busy: snap.busy }] as const;
}
