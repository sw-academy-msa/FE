import { createContext, isValidElement, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button as AxButton } from '@astryxdesign/core/Button';
import { BottomSheet as AxBottomSheet } from '@astryxdesign/core/BottomSheet';
import { Dialog as AxDialog } from '@astryxdesign/core/Dialog';
import type { ButtonHTMLAttributes, CSSProperties, MouseEvent, ReactNode } from 'react';
import { Link, NavLink, useBlocker, useHref, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, Timer, X, Home, CalendarDays, Package, UserRound, ChevronRight, Info, Copy } from 'lucide-react';
import type { Product, Order } from '../domain';
import { money, saleState, stockTotal } from '../domain';
import { IMAGE_EXPIRED } from '../config';
import { FALLBACK_BANNER, FALLBACK_BG, IMAGE_START, imageView, onImageError, onImageLoad } from '../productImage';
import { useStore } from '../store';
import { SHEET_EXIT_MS } from '../theme/stockdrop';
const ToastContext = createContext<(message: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 4000); return () => clearTimeout(timer); }, [message]);
  return <ToastContext.Provider value={text => setMessage(text)}>{children}{message && <div className="toast-wrap"><div role="status" className="toast">{message}</div></div>}</ToastContext.Provider>;
}
export const useToast = () => useContext(ToastContext);
/** 버튼 안 글자를 이어 붙인다. Astryx Button은 label을 접근 이름(aria-label)으로 쓰므로 보이는 글자와 같게 맞춘다 */
const textOf = (node: ReactNode): string => node == null || typeof node === 'boolean' ? '' : typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(textOf).join('') : isValidElement<{ children?: ReactNode }>(node) ? textOf(node.props.children) : '';
/**
 * 공통 버튼(Astryx Button). 기본은 검정, outline은 흰 바탕 테두리, buy는 빨강. disabled는 지금처럼 진짜 disabled로 둬서 Enter 제출과 :disabled 스타일을 지킨다.
 * closeSheet가 있으면 감싼 시트(Modal, BottomSheet)를 닫는다.
 * to가 있으면 화면 이동 링크(<a href>)로 그린다(예전 btn 클래스를 붙인 Link). state, replace는 react-router Link와 같다
 */
export function Button({ children, outline, buy, className = '', disabled, type = 'button', to, state, replace, closeSheet, onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { outline?: boolean; buy?: boolean; to?: string; state?: unknown; replace?: boolean; closeSheet?: boolean }) {
  const navigate = useNavigate(), href = useHref(to ?? '.'), sheetClose = useContext(SheetClose);
  const label = props['aria-label'] ?? (textOf(children).trim() || '버튼');
  const native = { disabled } as Record<string, unknown>;
  const link = to !== undefined && !disabled;
  const click = (e: MouseEvent<HTMLButtonElement>) => {
    onClick?.(e);
    // closeSheet: 시트 안 "취소" 같은 버튼. 시트가 내려가는 움직임을 마친 뒤 시트의 onClose가 불린다
    if (closeSheet && sheetClose && !e.defaultPrevented) { sheetClose(); return; }
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault(); navigate(to, { state, replace });
  };
  return <AxButton {...props} {...native} label={label} type={type as 'button' | 'submit' | 'reset'} href={link ? href : undefined} onClick={click} variant={outline ? 'secondary' : buy ? 'buy' : 'primary'} size="lg" isDisabled={disabled} className={`ax-btn ${className}`}>{children}</AxButton>;
}

export function Field({ label, hint, required, error, children }: { label: string; hint?: string; required?: boolean; error?: string; children: ReactNode }) { return <div><span className="label">{label}{required && <span className="muted ml-1 text-caption">· 필수</span>}</span>{children}{error && <p role="alert" className="mt-2 text-label text-red">{error}</p>}{hint && <p className="muted mt-2 text-caption leading-relaxed">{hint}</p>}</div>; }
export function Note({ title, children, green = false }: { title?: string; children: ReactNode; green?: boolean }) { return <div className={`note ${green ? 'bg-green-soft!' : ''}`}>{title && <h3 className="mb-1 font-bold">{title}</h3>}<div className="muted">{children}</div></div>; }
export function ErrorBox({ message }: { message: string }) { return message ? <div role="alert" className="rounded-inner bg-red-soft p-3 text-label leading-relaxed text-red">{message}</div> : null; }
/** 서버 조회 상태(useLive): 불러오는 중 / 실패 + 다시 시도. 둘 다 아니면 아무것도 그리지 않는다 */
export function LiveStatus({ state, label = '불러오는 중이에요…' }: { state: { loading: boolean; error: string; reload: () => void }; label?: string }) {
  if (state.error) return <div className="space-y-2 py-4"><ErrorBox message={state.error}/><Button outline className="w-full" onClick={state.reload}>다시 시도</Button></div>;
  return state.loading ? <p role="status" className="muted py-8 text-center text-label">{label}</p> : null;
}
export function Empty({ title, message, children }: { title: string; message?: string; children?: ReactNode }) { return <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 py-12 text-center"><Package size={32} className="muted" strokeWidth={1}/><h2 className="text-headline font-bold">{title}</h2>{message && <p className="muted max-w-[280px] text-label leading-relaxed">{message}</p>}{children}</div>; }
/** backTo: 뒤로 가기 버튼이 이전 기록 대신 갈 화면(탭 전환 기록이 쌓이는 화면 등) */
export function Header({ title, subtitle, back = true, action, bare = false, backTo, onBack }: { title: string; subtitle?: string; back?: boolean; action?: ReactNode; bare?: boolean; backTo?: string; onBack?: () => void }) {
  const navigate = useNavigate();
  return <header className={bare ? 'mb-5 pb-3' : 'divider mb-5 pb-3'}><div className="flex min-h-9.5 items-center gap-3">{back && <button type="button" aria-label="이전 화면" onClick={() => onBack ? onBack() : backTo ? navigate(backTo, { replace: true }) : window.history.state?.idx > 0 ? navigate(-1) : navigate('/')} className="-ml-1 grid h-9 w-9 shrink-0 place-items-center"><ArrowLeft size={20}/></button>}<h1 className="min-w-0 flex-1 text-title font-bold tracking-[-.5px]">{title}</h1>{action}</div>{subtitle && <p className="muted mt-1 text-footnote leading-relaxed">{subtitle}</p>}</header>;
}
export function Badge({ children, live = false, red = false }: { children: ReactNode; live?: boolean; red?: boolean }) { return <span className={`inline-flex w-fit items-center rounded-badge px-2 py-1 text-caption font-semibold ${live ? 'bg-green-soft text-green' : red ? 'bg-red-soft text-red' : 'bg-blue-soft text-ink'}`}>{children}</span>; }
export function InfoRow({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) { return <div className="flex items-start justify-between gap-4 py-1"><span className="muted shrink-0 text-label">{label}</span><span className={`min-w-0 text-right text-label leading-relaxed ${strong ? 'font-bold' : ''}`}>{value}</span></div>; }
export function MenuRow({ label, to, children }: { label: string; to: string; children?: ReactNode }) { return <Link to={to} className="divider flex min-h-13 items-center gap-3"><span className="min-w-0 flex-1 text-body">{label}</span>{children}<ChevronRight size={17} className="muted"/></Link>; }
const signedUrl = (u: string) => /[?&]X-Amz-(Expires|Signature)=/i.test(u);
export function ProductImage({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  const reported = useRef('');
  const [st, setSt] = useState(IMAGE_START);
  const view = imageView(src, st);
  // 서명 주소가 만료됐거나, 이 탭에서 만든 미리보기(blob:)가 새로고침으로 사라졌으면 새 주소를 받도록 알린다
  const report = (url: string) => { if ((signedUrl(url) || url.startsWith('blob:')) && reported.current !== url) { reported.current = url; window.dispatchEvent(new Event(IMAGE_EXPIRED)); } };
  // 배너까지 못 받으면 예전처럼 빈 자리만 보여 준다(내 상품 대신 다른 상품 사진이 보이지 않게)
  if (view.kind === 'empty') return <div role="img" aria-label={alt} className={`block rounded-inner bg-soft ${className}`}/>;
  // 주소가 없거나 받는 중이거나 못 받았으면 STOCKDROP 배너를 칸 크기 그대로 contain으로 보여 준다(바탕색이 배너와 같아 잘리거나 늘지 않는다)
  const banner = view.kind === 'banner';
  const style: CSSProperties | undefined = banner ? { objectFit: 'contain', backgroundColor: FALLBACK_BG } : view.loading ? { backgroundColor: FALLBACK_BG, backgroundImage: `url(${FALLBACK_BANNER})`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' } : undefined;
  return <img key={view.url} src={view.url} alt={alt} data-fallback={banner ? 'banner' : view.loading ? 'loading' : undefined} style={style}
    onLoad={() => setSt(x => onImageLoad(x, view.url))} onError={() => { if (!banner) report(view.url); setSt(x => onImageError(x, view.url)); }}
    className={`block rounded-inner bg-blue-soft object-cover ${className}`} loading={banner ? undefined : 'lazy'}/>;
}
export function ProductSummary({ product, option, amount }: { product: { name: string; brand: string; image: string }; option?: ReactNode; amount?: number }) { return <div className="divider flex items-center gap-3 pb-4"><ProductImage src={product.image} alt={product.name} className="h-21.5 w-19 shrink-0"/><div className="min-w-0 flex-1 space-y-1.5"><p className="muted text-caption">{product.brand}</p><p className="text-callout font-semibold">{product.name}</p>{option && <div className="muted whitespace-pre-line text-footnote leading-relaxed">{option}</div>}{amount !== undefined && <p className="font-number text-callout font-bold">{money(amount)}</p>}</div></div>; }
const pad = (n: number) => String(n).padStart(2, '0');
export const clockLeft = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}`; };
export const openLabel = (t: number, now: number) => { const d = new Date(t), n = new Date(now); const same = d.toDateString() === n.toDateString(); return `${same ? '오늘' : `${d.getMonth() + 1}월 ${d.getDate()}일`} ${pad(d.getHours())}:${pad(d.getMinutes())} 오픈`; };
export const soldOutLabel = (p: Product) => { if (!p.soldOutAt) return '판매 종료'; const m = Math.max(1, Math.round((p.soldOutAt - p.startsAt) / 60_000)); return `${m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`} 만에 완판됐어요`; };
export function ProductCard({ product: p, now, availableCount, notified, onNotify }: { product: Product; now: number; availableCount?: number; notified?: boolean; onNotify?: () => void }) {
  const status = saleState(p, now);
  const total = stockTotal(p), left = availableCount ?? total;
  const soldOut = (status === '판매 중' && availableCount === 0) || (status === '판매 종료' && !!p.soldOutAt);
  const urgent = status === '판매 중' && !soldOut && p.endsAt - now <= 3_600_000;
  // 내가 재고를 확보해 결제 중이거나 이미 산 상품은 품절 대신 내 상태를 보여 준다
  const st = useStore(), mine = st.activeUserId;
  const myHold = !!mine && st.holds.some(h => h.userId === mine && h.productId === p.id && (h.status === 'pending' || h.status === 'reserved' && (h.expiresAt ?? Infinity) > now));
  const myOrder = !!mine && !myHold && st.orders.some(o => o.userId === mine && o.productId === p.id && !['cancelled', 'refunded'].includes(o.status));
  const pct = total ? Math.min(100, Math.max(0, (1 - left / total) * 100)) : 0;
  return <Link to={`/product/${p.id}`} className="block min-w-0">
    <div className="relative">
      <ProductImage src={p.images[0]} alt={p.name} className={`aspect-square w-full ${soldOut && !myHold ? 'opacity-50' : ''}`}/>
      {status === '판매 중' && !soldOut && <span className="absolute left-2 top-2 flex items-center gap-1 rounded-inner bg-black/75 px-1.5 py-1 text-footnote font-bold tabular-nums text-white"><Timer size={12}/>{clockLeft(p.endsAt - now)}</span>}
      {status === '판매 예정' && <span className="absolute left-2 top-2 flex items-center gap-1 rounded-inner bg-black/75 px-1.5 py-1 text-footnote font-bold text-white"><Bell size={12}/>{openLabel(p.startsAt, now)}</span>}
      {urgent && <span className="absolute bottom-2 left-2 rounded-inner bg-urgent px-1.5 py-1 text-footnote font-bold text-white">마감 임박</span>}
      {myHold ? <span className="absolute inset-x-2 bottom-2 rounded-inner bg-ink px-2 py-1.5 text-center text-label font-bold text-white">확보한 재고 · 결제 이어하기</span>
        : myOrder && soldOut ? <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-inner bg-ink px-3 py-1.5 text-label font-bold text-white">구매 완료</span>
        : soldOut && <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-inner bg-sold-out px-3 py-1.5 text-label font-bold text-white">SOLD OUT</span>}
    </div>
    <p className="mt-2.5 text-footnote font-bold text-aux">{p.brand}</p>
    <h3 className={`mt-0.5 text-callout ${soldOut ? 'text-meta' : ''}`}>{p.name}</h3>
    <p className={`mt-0.5 text-headline font-bold ${soldOut ? 'text-meta' : ''}`}>{money(p.price)}</p>
    {status === '판매 중' && !soldOut && <><div className="mt-2 h-1 w-full rounded-full bg-line"><div className={`h-1 rounded-full ${urgent ? 'bg-urgent' : 'bg-ink'}`} style={{ width: `${pct}%` }}/></div><p className={`mt-1.5 text-label ${urgent ? 'font-bold text-urgent' : 'text-aux'}`}>{urgent ? `서두르세요! ${left}개 남음` : `${total}개 중 ${left}개 남음`}</p></>}
    {status === '판매 예정' && <><p className="mt-2 text-label text-aux">{total}개 한정 · 1인 {p.maxPerAccount}개</p>{onNotify && <button type="button" onClick={e => { e.preventDefault(); onNotify(); }} className={`mt-2 flex h-8 w-full items-center justify-center gap-1 rounded-inner text-label font-bold ${notified ? 'bg-ink text-white' : 'border border-border'}`}><Bell size={13}/>{notified ? '알림 설정됨' : '오픈 알림 받기'}</button>}</>}
    {/* 판매 중에도 신청한 상품은 가격 인하·수량 임박 알림을 받으므로 끌 수 있게 둔다 */}
    {status === '판매 중' && notified && onNotify && <button type="button" onClick={e => { e.preventDefault(); onNotify(); }} className="mt-2 flex h-8 w-full items-center justify-center gap-1 rounded-inner border border-border text-label font-bold"><Bell size={13}/>상품 알림 끄기</button>}
    {soldOut && <p className="mt-2 text-label text-aux">{soldOutLabel(p)}</p>}
    {status === '판매 종료' && !soldOut && <p className="mt-2 text-label text-aux">판매 종료</p>}
  </Link>;
}
export function Progress({ step }: { step: number }) { return <div aria-label={`상품 등록 ${step} / 7단계`} className="mb-5 flex gap-[5px]">{Array.from({ length: 7 }, (_, i) => <div key={i} className={`h-1 flex-1 rounded-[2px] ${i < step ? 'bg-ink' : 'bg-line'}`}/>)}</div>; }
export const ORDER_LABELS: Record<Order['status'], string> = { paid: '결제 완료', preparing: '배송 준비', shipping: '배송 중', delivered: '배송 완료', cancelled: '취소 완료', refunded: '환불 완료' };
export function DeliveryProgress({ status }: { status: Order['status'] }) { const active = ['paid', 'preparing', 'shipping', 'delivered'].indexOf(status); return <div className="divider grid grid-cols-4 gap-1 pb-5">{['결제 완료', '배송 준비', '배송 중', '배송 완료'].map((label, i) => <div key={label} className="flex flex-col items-center gap-2"><span className={`font-number grid h-7.5 w-7.5 place-items-center rounded-full text-footnote ${i <= active ? 'bg-ink text-surface' : 'bg-blue-soft text-muted'}`}>{i < active || status === 'delivered' && i === active ? '✓' : i + 1}</span><span className={`text-caption ${i === active ? 'font-bold' : 'muted'}`}>{label}</span></div>)}</div>; }
/**
 * 열린 창(모달·시트·사진 보기)을 브라우저 뒤로 가기(아이폰 스와이프 포함)로 닫는다.
 * 열 때 같은 주소로 기록을 하나 쌓고, 뒤로 가기가 오면 페이지 대신 창만 닫는다. 버튼으로 닫으면 쌓은 기록을 되돌린다
 */
export function useCloseOnBack(onClose: () => void, restoreOnUnmount = true) {
  const close = useRef(onClose); close.current = onClose;
  const restore = useRef(restoreOnUnmount); restore.current = restoreOnUnmount;
  useEffect(() => {
    const id = Math.random().toString(36).slice(2); let popped = false;
    window.history.pushState({ ...(window.history.state ?? {}), sdModal: id }, '');
    const onPop = () => { popped = true; close.current(); };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (!popped && window.history.state?.sdModal === id) {
        if (restore.current) window.history.back();
        else { const state = { ...window.history.state }; delete state.sdModal; window.history.replaceState(state, ''); }
      }
    };
  }, []);
}
/** 열 때 포커스가 있던 곳을 기억했다가 닫힌 뒤(부모가 시트를 지운 뒤 포함) 되돌린다 */
function useFocusReturn() {
  const [opener] = useState(() => ({ current: document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null }));
  useEffect(() => () => { const el = opener.current; if (el?.isConnected) setTimeout(() => { if (el.isConnected && !document.querySelector('dialog[open]')) el.focus({ preventScroll: true }); }); }, [opener]);
  return opener;
}
/** 지워지는 시트 판의 그림 복제를 아래로 내려 보낸다(transform과 opacity만, 테마 모션 토큰 시간과 곡선) */
function slideAwayCopy(sheet: HTMLElement | null) {
  if (!sheet?.isConnected || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const rect = sheet.getBoundingClientRect(); if (!rect.height || rect.top >= window.innerHeight) return;
  const root = getComputedStyle(document.documentElement);
  const easing = root.getPropertyValue('--ease-exit').trim() || 'ease-in';
  const scrim = document.createElement('div'), copy = sheet.cloneNode(true) as HTMLElement;
  for (const el of [scrim, copy]) { el.setAttribute('aria-hidden', 'true'); el.inert = true; el.dataset.sheetCopy = ''; }
  copy.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
  Object.assign(scrim.style, { position: 'fixed', inset: '0', zIndex: '1000', pointerEvents: 'none', background: 'var(--color-overlay)' });
  Object.assign(copy.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, maxHeight: 'none', margin: '0', transform: 'none', zIndex: '1001', pointerEvents: 'none', overflow: 'hidden' });
  document.body.append(scrim, copy);
  const options = { duration: SHEET_EXIT_MS, easing, fill: 'forwards' as const };
  scrim.animate([{ opacity: 1 }, { opacity: 0 }], options);
  copy.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${window.innerHeight - rect.top}px)` }], options).finished.catch(() => {}).finally(() => { scrim.remove(); copy.remove(); });
}
/** 아래에서 올라오는 창(Astryx BottomSheet). Esc, 바깥 누르기, 아래로 밀기, 뒤로 가기로 닫히고 닫으면 포커스가 연 버튼으로 돌아간다 */
function Sheet({ label, onClose, restoreOnUnmount = true, padding, children }: { label: string; onClose: () => void; restoreOnUnmount?: boolean; padding: 4 | 5; children: ReactNode }) {
  // 닫기(X, Esc, 바깥 누르기, 아래로 끌기, 뒤로 가기)는 먼저 시트를 내려 보내고, 다 내려간 뒤 부모에게 알린다
  const [open, setOpen] = useState(true);
  const closing = useRef(false), done = useRef(onClose); done.current = onClose;
  const panel = useRef<HTMLDivElement>(null);
  const requestClose = useRef(() => {
    if (closing.current) return; closing.current = true;
    // 시트가 다 내려가 dialog가 실제로 닫히는 순간(close 이벤트) 알린다. 이벤트가 오지 않을 때를 대비해 시간으로도 한 번 더 확인한다
    let finished = false; const finish = () => { if (finished) return; finished = true; done.current(); };
    const dialog = panel.current?.closest('dialog');
    if (!dialog || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setOpen(false); setTimeout(finish); return; }
    dialog.addEventListener('close', finish, { once: true });
    setOpen(false); setTimeout(finish, SHEET_EXIT_MS + 400);
  }).current;
  useCloseOnBack(requestClose, restoreOnUnmount);
  const opener = useFocusReturn();
  // 페이지가 시트를 바로 지울 때(시트 안 "취소", 처리 뒤 닫기, 화면 이동 등)도 내려가는 움직임을 보여 준다:
  // 지워지기 직전 시트 판을 그림만 복제해(누를 수 없고 읽히지 않음) 같은 자리에서 아래로 내려 보내고 지운다
  useLayoutEffect(() => () => { if (!closing.current) slideAwayCopy(panel.current); }, []);
  // 시트가 열린 동안 문서와 body 스크롤을 잠그고, 닫으면 원래대로(이미 잠겨 있었으면 그대로) 둔다
  useEffect(() => {
    const roots = [document.documentElement, document.body].map(element => ({ element, locked: element.classList.contains('overflow-hidden') }));
    roots.forEach(({ element }) => element.classList.add('overflow-hidden'));
    return () => roots.forEach(({ element, locked }) => { if (!locked) element.classList.remove('overflow-hidden'); });
  }, []);
  return <SheetClose.Provider value={requestClose}><AxBottomSheet ref={panel} label={label} onOpenChange={next => { if (!next) requestClose(); }} isOpen={open} finalFocusRef={opener} height="hug" padding={padding} className="mx-auto max-w-[390px] border-0 text-ink">{children}</AxBottomSheet></SheetClose.Provider>;
}
/** 시트 안의 닫기 버튼이 내려가는 움직임과 함께 닫도록 */
const SheetClose = createContext<(() => void) | null>(null);
function SheetCloseButton({ onClose, className, iconClassName }: { onClose: () => void; className: string; iconClassName?: string }) { const close = useContext(SheetClose) ?? onClose; return <button aria-label="닫기" onClick={close} className={className}><X size={20} className={iconClassName}/></button>; }
export function Modal({ title, children, onClose, restoreOnUnmount = true }: { title: string; children: ReactNode; onClose: () => void; restoreOnUnmount?: boolean }) {
  return <Sheet label={title} onClose={onClose} restoreOnUnmount={restoreOnUnmount} padding={5}><div className="mb-5 mt-3 flex items-center justify-between gap-4"><h2 className="min-w-0 break-words text-title font-bold">{title}</h2><SheetCloseButton onClose={onClose} className="grid h-11 w-11 shrink-0 place-items-center -mr-2"/></div>{children}</Sheet>;
}
/** 하단 탭으로 들어온 화면인지 — 탭으로 열면 Figma대로 뒤로 가기 없음, 마이페이지·결제 완료·알림 등에서 열면 뒤로 가기 */
export const useFromTab = () => !!(useLocation().state as { tab?: boolean } | null)?.tab;
export function BottomNav() {
  const items = [['/', '홈', Home], ['/schedule', '판매 일정', CalendarDays], ['/orders', '주문', Package], ['/my', '마이', UserRound]] as const;
  return <nav aria-label="하단 메뉴" className="fixed bottom-0 left-1/2 z-30 w-full max-w-[390px] -translate-x-1/2 border-t border-line bg-surface px-1 pb-[max(14px,env(safe-area-inset-bottom))] pt-2"><div className="flex">{items.map(([to, label, Icon]) => <NavLink end key={to} to={to} state={{ tab: true }} className={({ isActive }) => `flex min-h-11 flex-1 flex-col items-center justify-center gap-1 text-[9px] ${isActive ? 'font-bold text-ink' : 'text-muted'}`}><Icon size={20} strokeWidth={1.5}/>{label}</NavLink>)}</div></nav>;
}
export async function copyText(text: string) { if (!navigator.clipboard) throw new Error('클립보드를 사용할 수 없습니다. 번호를 길게 눌러 복사해 주세요.'); await navigator.clipboard.writeText(text); }
export function CopyButton({ value }: { value: string }) { const toast = useToast(); return <button aria-label="복사" className="grid h-8 w-8 place-items-center" onClick={() => copyText(value).then(() => toast('복사했습니다.')).catch(e => toast(e.message))}><Copy size={16} className="muted"/></button>; }
export function Unavailable({ message = '접근할 수 없는 화면입니다.' }: { message?: string }) { return <><Header title="접근 안내"/><Empty title={message} message="이 화면을 사용할 수 있는 계정으로 전환해 주세요."><Button to="/my">마이페이지로</Button></Empty></>; }
export function Loading({ text = '확인하고 있어요…' }: { text?: string }) { return <div className="muted flex items-center justify-center gap-2 py-10 text-label"><Info size={16}/>{text}</div>; }

/** 바텀시트 — 상단 모서리 16, 손잡이, 뒤 배경 어둡게(Astryx BottomSheet) */
export function BottomSheet({ title, children, onClose }: { title?: string; children: ReactNode; onClose: () => void }) {
  return <Sheet label={title ?? '선택'} onClose={onClose} padding={4}>{title && <div className="-mx-4 mb-4 mt-1 flex items-center justify-between border-b border-line px-4 pb-3"><h2 className="text-headline font-bold">{title}</h2><SheetCloseButton onClose={onClose} className="-mr-3 grid h-11 w-11 place-items-center" iconClassName="muted"/></div>}{children}</Sheet>;
}

/** 수량 증감 — 계정당 최대 수 적용 */
export function QuantityStepper({ value, min = 0, max, onChange }: { value: number; min?: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="inline-flex items-center gap-3">
      <button aria-label="수량 감소" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} className="grid h-8 w-8 place-items-center rounded-full border border-border text-title font-bold disabled:opacity-30">−</button>
      <span className="font-number w-6 text-center text-subhead font-bold">{value}</span>
      <button aria-label="수량 증가" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} className="grid h-8 w-8 place-items-center rounded-full border border-border text-title font-bold disabled:opacity-30">+</button>
    </div>
  );
}

/** 칩 — 선택 시 ink 바탕 흰 글자, 기본 흰 바탕 border */
export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={selected} className={`inline-flex h-8 items-center rounded-full px-3.5 text-label font-medium transition-colors ${selected ? 'bg-ink text-surface' : 'border border-border bg-surface text-ink'}`}>
      {children}
    </button>
  );
}

/**
 * 가운데 대화상자(Astryx Dialog, native dialog). 폭 318, 모서리 8, 안쪽 여백 24, 그림자 없음은 지금 디자인 그대로.
 * onDismiss가 있으면 Esc로 닫히고(form), dismissOnBackdrop이면 바깥 누르기로도 닫힌다(info). 없으면 버튼으로만 닫힌다(required)
 */
function CenterDialog({ title, onDismiss, dismissOnBackdrop = false, children }: { title: string; onDismiss?: () => void; dismissOnBackdrop?: boolean; children: ReactNode }) {
  return <AxDialog isOpen onOpenChange={open => { if (!open) onDismiss?.(); }} purpose={!onDismiss ? 'required' : dismissOnBackdrop ? 'info' : 'form'} width={318} maxHeight="92dvh" padding={6} aria-label={title} className="max-w-[calc(100%-32px)] rounded-dialog bg-surface text-ink shadow-none">
    <div className="space-y-4"><h2 className="text-headline font-bold">{title}</h2>{children}</div>
  </AxDialog>;
}

/** 확인창 기본 문구. 나가기를 고르면 그 화면의 입력(임시 저장 포함)은 남지 않는다(지우는 화면은 useLeaveGuard의 onLeave로 지운다) */
export const LEAVE_MESSAGE = '지금 나가면 작성 중인 내용이 사라져요.';
/** 주소 검색처럼 입력을 맡겨 두고 다녀오는 화면(돌아오면 입력이 이어진다) */
const LEAVE_OK = ['/address-search'];
type LeaveGuard = { dirty: boolean; bypass: boolean; message?: string; allow?: (pathname: string) => boolean; onLeave?: () => void };
/** 지금 화면에 걸린 작성 중 표시. react-router는 막는 함수(useBlocker)를 하나만 지원해서, 화면들은 여기에 등록하고 LeaveGuardHost 하나가 막는다 */
const leaveGuards = new Set<LeaveGuard>();
const stopping = (next: string, current: string) => { if (next === current || LEAVE_OK.includes(next)) return undefined; return [...leaveGuards].reverse().find(g => g.dirty && !g.bypass && !g.allow?.(next)); };
/**
 * 작성 중 나가기 확인. dirty(처음 값과 달라짐)인 동안 화면을 떠나려 하면 ConfirmLeave를 띄운다(App의 LeaveGuardHost가 띄운다).
 * - 막는 이동: 헤더 뒤로와 닫기, 휴대폰과 브라우저 뒤로 가기(popstate), 하단 탭과 화면 안 링크, navigate(): react-router useBlocker
 * - 같은 주소 안의 이동(시트가 쌓은 기록을 뒤로 가기로 닫기, ?pick= 같은 검색값)과 주소 검색 다녀오기, allow(다음 주소)가 true인 이동은 막지 않는다
 * - 새로고침과 탭 닫기: 브라우저 기본 경고(beforeunload)
 * - 저장이나 제출이 끝난 뒤 이동하기 직전에 allowLeave()를 부르면 막지 않는다
 * 계속 작성이면 주소와 입력이 그대로 남는다
 */
/** onLeave: 확인창에서 나가기를 골랐을 때만(새로고침, 단계 이동, 앱 종료는 아님) 이동 뒤에 부른다. 예: 판매 등록 초안 지우기 */
export function useLeaveGuard(dirty: boolean, { message, allow, onLeave }: { message?: string; allow?: (pathname: string) => boolean; onLeave?: () => void } = {}) {
  const [guard] = useState<LeaveGuard>(() => ({ dirty, bypass: false }));
  guard.dirty = dirty; guard.message = message; guard.allow = allow; guard.onLeave = onLeave;
  useEffect(() => { leaveGuards.add(guard); return () => { leaveGuards.delete(guard); }; }, [guard]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { if (guard.bypass) return; e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, guard]);
  const allowLeave = useCallback(() => { guard.bypass = true; }, [guard]);
  return { allowLeave };
}
/** 앱에 하나: 등록된 작성 중 화면이 있으면 이동을 멈추고 ConfirmLeave를 띄운다. 나가기면 원래 하려던 이동을 그대로 하고, 계속 작성이면 머문다 */
export function LeaveGuardHost() {
  const [message, setMessage] = useState<string>();
  const blocking = useRef<LeaveGuard | undefined>(undefined);
  const blocker = useBlocker(useCallback(({ currentLocation, nextLocation }: { currentLocation: { pathname: string }; nextLocation: { pathname: string } }) => {
    const g = stopping(nextLocation.pathname, currentLocation.pathname); blocking.current = g; if (g) setMessage(g.message); return !!g;
  }, []));
  return blocker.state === 'blocked' ? <ConfirmLeave message={message} onLeave={() => { const g = blocking.current; blocker.proceed(); g?.onLeave?.(); }} onStay={() => blocker.reset()}/> : null;
}

/** 작성 중 나가기 확인 대화상자. Esc는 계속 작성. message: 화면마다 사실에 맞는 안내(기본은 저장되지 않음) */
export function ConfirmLeave({ onLeave, onStay, message = LEAVE_MESSAGE }: { onLeave: () => void; onStay: () => void; message?: string }) {
  return <CenterDialog title="작성을 그만할까요?" onDismiss={onStay}>
    <p className="muted text-body leading-relaxed">{message}</p>
    <div className="flex gap-2">
      <Button outline className="flex-1" onClick={onLeave}>나가기</Button>
      <Button className="flex-1" onClick={onStay}>계속 작성</Button>
    </div>
  </CenterDialog>;
}

/** 처리 실패와 재시도 — 입력 내용 유지 (Figma: 가운데 대화상자, 뒤 화면 어둡게). Esc는 이전으로(있을 때) */
export function RetryError({ message, onRetry, onBack }: { message: string; onRetry: () => void; onBack?: () => void }) {
  return <CenterDialog title="요청을 처리하지 못했어요" onDismiss={onBack}>
    <p className="muted text-body leading-relaxed">{message || '일시적인 오류로 문의가 접수되지 않았어요. 입력한 내용은 그대로 남아 있어요.'}</p>
    <div className="flex gap-2">
      {onBack && <Button outline className="flex-1" onClick={onBack}>이전으로</Button>}
      <Button className="flex-1" onClick={onRetry}>다시 시도</Button>
    </div>
  </CenterDialog>;
}

/** 로그인 필요 대화상자 — 로그인 후 returnTo로 복귀. Esc와 바깥 누르기로 닫힌다 */
export function LoginRequired({ returnTo, onClose }: { returnTo: string; onClose: () => void }) {
  return <CenterDialog title="로그인이 필요해요" onDismiss={onClose} dismissOnBackdrop>
    <p className="muted text-body leading-relaxed">로그인하면 보고 있던 상품으로 바로 돌아와요.</p>
    <div className="space-y-2">
      <Button to={`/login?next=${encodeURIComponent(returnTo)}`} className="w-full">로그인</Button>
      <Button outline to={`/signup?next=${encodeURIComponent(returnTo)}`} className="w-full">이메일로 회원가입</Button>
      <button onClick={onClose} className="muted w-full py-2 text-label">닫기</button>
    </div>
  </CenterDialog>;
}

/** 토글 스위치 — 48×28, 켜짐 #222222 */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-label={label} aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-ink' : 'bg-border'}`}><span className={`absolute top-[3px] h-5.5 w-5.5 rounded-full bg-white shadow-sm transition-all ${checked ? 'left-[23px]' : 'left-[3px]'}`}/></button>;
}
