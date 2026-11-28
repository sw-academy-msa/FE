import { createContext, isValidElement, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button as AxButton } from '@astryxdesign/core/Button';
import { BottomSheet as AxBottomSheet } from '@astryxdesign/core/BottomSheet';
import { Dialog as AxDialog } from '@astryxdesign/core/Dialog';
import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { Link, NavLink, useBlocker, useHref, useLocation, useNavigate, useViewTransitionState } from 'react-router-dom';
import { Bell, Timer, X, Package, Info, Copy, Check } from 'lucide-react';
import { Icon } from './icons';
import type { Product, Order } from '../domain';
import { money, saleState, stockTotal } from '../domain';
import { temporarySoldOut, TEMPORARY_SOLD_OUT_NOTE } from './stockPresentation';
import { IMAGE_EXPIRED } from '../config';
import { IMAGE_START, imageView, onImageError, onImageLoad } from '../productImage';
import { useStore } from '../store';
import { TAB_REFRESH } from '../splash';
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
 * 공통 버튼(Astryx Button). 기본은 주색(파랑), outline은 흰 바탕 테두리, buy도 주색(시안 buy). disabled는 지금처럼 진짜 disabled로 둬서 Enter 제출과 :disabled 스타일을 지킨다.
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

/** 한 번 움직이는 효과(오류 흔들림 sd-shake, 알림 종 흔들림 sd-ring). 움직임 줄이기 설정이면 움직이지 않는다 */
function play(el: Element | null, name: string) { if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; el.classList.remove(name); void (el as HTMLElement).getBoundingClientRect(); el.classList.add(name); }
const shake = (el: HTMLElement | null) => play(el, 'sd-shake');
/** 상품 알림을 켜는 순간 종 아이콘을 흔든다(알림 신청 동작은 그대로) */
export const ringBell = (button: Element) => play(button.querySelector('svg'), 'sd-ring');
let focusQueued = false;
/** 새로 틀린 칸들 중 화면 맨 위 칸의 입력으로 포커스를 옮긴다. 이미 입력칸에 있으면(입력 중) 옮기지 않는다 */
function focusFirstInvalid() {
  if (focusQueued) return; focusQueued = true;
  requestAnimationFrame(() => {
    focusQueued = false;
    const a = document.activeElement;
    if (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement) return;
    document.querySelector<HTMLElement>('[data-invalid] :is(input, textarea, select)')?.focus();
  });
}
/** 오류가 새로 생기거나 바뀌면 흔들고(focus면 첫 틀린 칸으로 포커스). 화면이 열릴 때부터 있던 오류는 그대로 둔다 */
function useErrorCue(error: string | undefined, ref: { current: HTMLElement | null }, focus: boolean) {
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (!error) return;
    shake(ref.current); if (focus) focusFirstInvalid();
  }, [error, ref, focus]);
}
export function Field({ label, hint, required, error, children }: { label: string; hint?: string; required?: boolean; error?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useErrorCue(error, ref, true);
  return <div ref={ref} data-invalid={error ? '' : undefined}><span className="label">{label}{required && <span className="muted ml-1.5 text-label font-medium">· 필수</span>}</span>{children}{error && <p role="alert" className="mt-2 text-label text-red">{error}</p>}{hint && <p className="muted mt-2 text-caption leading-relaxed">{hint}</p>}</div>;
}
export function Note({ title, children, green = false }: { title?: string; children: ReactNode; green?: boolean }) { return <div className={`note ${green ? 'bg-green-soft!' : ''}`}>{title && <h3 className="mb-1 font-bold">{title}</h3>}<div className="muted">{children}</div></div>; }
export function ErrorBox({ message }: { message: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useErrorCue(message, ref, false);
  return message ? <div ref={ref} role="alert" className="rounded-inner bg-red-soft p-3 text-label leading-relaxed text-red">{message}</div> : null;
}
/** iOS식 12선 로딩 표시. 12개 선이 한 칸씩(steps) 돌아 끝으로 갈수록 흐려진다. 색은 부모 글자색(기본 보조색) */
export function Spinner({ size = 22, className = 'text-muted' }: { size?: number; className?: string }) {
  return <svg role="progressbar" aria-label="불러오는 중" width={size} height={size} viewBox="0 0 24 24" className={`ios-spinner ${className}`}>
    {Array.from({ length: 12 }, (_, i) => <line key={i} x1="12" y1="2.5" x2="12" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity={(i + 1) / 12} transform={`rotate(${i * 30} 12 12)`}/>)}
  </svg>;
}
/** 서버 조회 상태(useLive): 불러오는 중(가운데 로딩 표시, label은 읽기용) / 실패 + 다시 시도. 둘 다 아니면 아무것도 그리지 않는다 */
export function LiveStatus({ state, label = '불러오는 중이에요…' }: { state: { loading: boolean; error: string; reload: () => void }; label?: string }) {
  if (state.error) return <div className="space-y-2 py-4"><ErrorBox message={state.error}/><Button outline className="w-full" onClick={state.reload}>다시 시도</Button></div>;
  return state.loading ? <div role="status" aria-label={label} className="grid place-items-center py-8"><Spinner/></div> : null;
}
export function Empty({ title, message, children }: { title: string; message?: string; children?: ReactNode }) { return <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 py-12 text-center"><Package size={32} className="muted" strokeWidth={1}/><h2 className="text-headline font-bold">{title}</h2>{message && <p className="muted max-w-[280px] text-label leading-relaxed">{message}</p>}{children}</div>; }
/** backTo: 뒤로 가기 버튼이 이전 기록 대신 갈 화면(탭 전환 기록이 쌓이는 화면 등) */
export function Header({ title, subtitle, back = true, action, bare = false, backTo, onBack }: { title: string; subtitle?: string; back?: boolean; action?: ReactNode; bare?: boolean; backTo?: string; onBack?: () => void }) {
  const navigate = useNavigate();
  return <header className={bare ? 'mb-5 pb-3' : 'divider mb-5 pb-3'}><div className="flex min-h-9.5 items-center gap-3">{back && <button type="button" aria-label="이전 화면" onClick={() => onBack ? onBack() : backTo ? navigate(backTo, { replace: true }) : window.history.state?.idx > 0 ? navigate(-1) : navigate('/')} className="press -ml-3 grid h-11 w-11 shrink-0 place-items-center"><Icon name="Back" size={24}/></button>}<h1 className="min-w-0 flex-1 text-title font-bold tracking-[-.5px]">{title}</h1>{action}</div>{subtitle && <p className="muted mt-1 text-footnote leading-relaxed">{subtitle}</p>}</header>;
}
export function Badge({ children, live = false, red = false }: { children: ReactNode; live?: boolean; red?: boolean }) { return <span className={`inline-flex w-fit items-center rounded-badge px-2 py-1 text-caption font-semibold ${live ? 'bg-green-soft text-green' : red ? 'bg-red-soft text-red' : 'bg-blue-soft text-text'}`}>{children}</span>; }
/** 정보 한 줄(시안 결제 금액 Row): 이름 14 보조색, 값 14 굵게. strong은 합계 줄(위 구분선, 값 20 가장 굵게) */
export function InfoRow({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) { return <div className={`flex items-center justify-between gap-4 ${strong ? 'mt-1 border-t border-line pt-4' : 'py-2'}`}><span className="muted shrink-0 text-callout">{label}</span><span className={`min-w-0 text-right leading-relaxed ${strong ? 'text-title-lg font-black' : 'text-callout font-semibold'}`}>{value}</span></div>; }
/** 메뉴 한 줄(시안 2단계 · 마이 하위 화면 Row): 높이 60, 16 굵게 */
export function MenuRow({ label, to, children }: { label: string; to: string; children?: ReactNode }) { return <Link to={to} className="divider flex min-h-15 items-center gap-2.5"><span className="min-w-0 flex-1 text-headline font-semibold">{label}</span>{children}<Icon name="Caret" size={18} className="muted shrink-0"/></Link>; }
const signedUrl = (u: string) => /[?&]X-Amz-(Expires|Signature)=/i.test(u);
export function ProductImage({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  const reported = useRef('');
  const [st, setSt] = useState(IMAGE_START);
  const view = imageView(src, st);
  // 서명 주소가 만료됐거나, 이 탭에서 만든 미리보기(blob:)가 새로고침으로 사라졌으면 새 주소를 받도록 알린다
  const report = (url: string) => { if ((signedUrl(url) || url.startsWith('blob:')) && reported.current !== url) { reported.current = url; window.dispatchEvent(new Event(IMAGE_EXPIRED)); } };
  // 받기 전(주소 없음·받는 중)에는 흰 칸 가운데 로딩 표시, 못 받으면 흰 칸만 남긴다
  const box = `relative block overflow-hidden rounded-inner bg-surface ${className}`;
  const spinner = view.loading && <span aria-hidden className="absolute inset-0 grid place-items-center"><Spinner/></span>;
  if (view.kind === 'blank') return <span role="img" aria-label={alt} data-fallback={view.loading ? 'loading' : 'blank'} className={box}>{spinner}</span>;
  return <span className={box}>
    <img key={view.url} src={view.url} alt={alt} data-fallback={view.loading ? 'loading' : undefined} loading="lazy"
      onLoad={() => setSt(x => onImageLoad(x, view.url))} onError={() => { report(view.url); setSt(x => onImageError(x, view.url)); }}
      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${view.loading ? 'opacity-0' : 'opacity-100'}`}/>
    {spinner}
  </span>;
}
/** 상품 요약 줄(시안 주문 결제 Product): 사진 76, 이름 17 굵게, 옵션 13, 금액 18 가장 굵게 */
export function ProductSummary({ product, option, amount }: { product: { name: string; brand: string; image: string }; option?: ReactNode; amount?: number }) { return <div className="flex items-center gap-3.5 pb-2"><ProductImage src={product.image} alt={product.name} className="h-19 w-19 shrink-0"/><div className="min-w-0 flex-1 space-y-1"><p className="text-title-sm font-bold">{product.name}</p>{option && <div className="whitespace-pre-line text-body font-medium leading-relaxed text-muted">{option}</div>}{amount !== undefined && <p className="text-title font-black">{money(amount)}</p>}</div></div>; }
const pad = (n: number) => String(n).padStart(2, '0');
export const clockLeft = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}`; };
export const openLabel = (t: number, now: number) => { const d = new Date(t), n = new Date(now); const same = d.toDateString() === n.toDateString(); return `${same ? '오늘' : `${d.getMonth() + 1}월 ${d.getDate()}일`} ${pad(d.getHours())}:${pad(d.getMinutes())} 오픈`; };
export const soldOutLabel = (p: Product) => { if (!p.soldOutAt) return '판매 종료'; const m = Math.max(1, Math.round((p.soldOutAt - p.startsAt) / 60_000)); return `${m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`} 만에 완판됐어요`; };
/** 금액 올라가기(판매자 매출): 0에서 값까지 0.6초 동안 센다. 화면에는 숫자 하나만 그리고, 세는 동안 aria-busy. 움직임 줄이기면 바로 값 */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? value : 0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(value); return; }
    const start = performance.now(); let frame = 0;
    const step = (t: number) => { const k = Math.min(1, (t - start) / 600); setShown(Math.round(value * (1 - (1 - k) ** 3))); if (k < 1) frame = requestAnimationFrame(step); };
    frame = requestAnimationFrame(step); return () => cancelAnimationFrame(frame);
  }, [value]);
  return <span aria-busy={shown !== value}>{format(shown)}</span>;
}
/** 숫자가 바뀌면 그 자리 숫자만 아래에서 올라온다(숫자 굴러가기). 글자 자체는 그대로라 읽기·검색 결과가 같다 */
export function RollingText({ text }: { text: string }) { return <>{[...text].map((ch, i) => /\d/.test(ch) ? <span key={`${i}-${ch}`} className="sd-roll">{ch}</span> : ch)}</>; }
export function ProductCard({ product: p, now, availableCount, notified, onNotify }: { product: Product; now: number; availableCount?: number; notified?: boolean; onNotify?: () => void }) {
  const status = saleState(p, now);
  const total = stockTotal(p), left = availableCount ?? total;
  const soldOut = (status === '판매 중' && availableCount === 0) || (status === '판매 종료' && !!p.soldOutAt);
  const temporary = temporarySoldOut(p, now);
  const urgent = status === '판매 중' && !soldOut && p.endsAt - now <= 3_600_000;
  // 내가 재고를 확보해 결제 중이거나 이미 산 상품은 품절 대신 내 상태를 보여 준다
  const st = useStore(), mine = st.activeUserId;
  const myHold = !!mine && st.holds.some(h => h.userId === mine && h.productId === p.id && (h.status === 'pending' || h.status === 'reserved' && (h.expiresAt ?? Infinity) > now));
  const myOrder = !!mine && !myHold && st.orders.some(o => o.userId === mine && o.productId === p.id && !['cancelled', 'refunded'].includes(o.status));
  const pct = total ? Math.min(100, Math.max(0, (1 - left / total) * 100)) : 0;
  // 시안 최종 색 · 홈 새로 올라온 상품 줄: 사진 112(아래 시간 띠), 카테고리·이름·가격, 오른쪽 알림 종(44). 예전 카드의 상태 표시와 문구는 그대로 둔다
  const bell = (label: string, on: boolean) => <button type="button" aria-label={label} onClick={e => { e.preventDefault(); if (!on) ringBell(e.currentTarget); onNotify?.(); }} className={`press grid h-11 w-11 shrink-0 place-items-center rounded-full ${on ? 'text-ink' : 'text-text'}`}><Icon name={on ? 'AlertOn' : 'AlertOff'} size={24}/></button>;
  // 확대 전환: 이 상품 상세로 가는 동안 사진에 이름을 붙여 상세 큰 사진으로 이어지게 한다
  const zooming = useViewTransitionState(`/product/${p.id}`);
  return <Link to={`/product/${p.id}`} viewTransition className="flex min-w-0 items-center gap-4 border-b border-line py-4">
    <div className="relative h-28 w-28 shrink-0" style={{ viewTransitionName: zooming ? 'product-photo' : undefined }}>
      <ProductImage src={p.images[0]} alt={p.name} className={`h-28 w-28 ${soldOut && !myHold ? 'opacity-50' : ''}`}/>
      {status === '판매 중' && !soldOut && <span className="absolute inset-x-1.5 bottom-1.5 flex h-7 items-center justify-center gap-1 rounded-[14px] bg-overlay text-label font-bold tabular-nums text-white"><Timer size={12}/><span><RollingText text={clockLeft(p.endsAt - now)}/></span></span>}
      {status === '판매 예정' && <span className="absolute inset-x-1.5 bottom-1.5 flex h-7 items-center justify-center gap-[5px] rounded-[14px] bg-overlay text-footnote font-medium text-white">{openLabel(p.startsAt, now)}</span>}
      {urgent && <span className="absolute left-1.5 top-1.5 rounded-pill bg-urgent px-2 py-0.5 text-footnote font-bold text-white">마감 임박</span>}
      {myHold ? <span className="absolute inset-x-1.5 top-1/2 -translate-y-1/2 rounded-inner bg-ink px-1 py-1.5 text-center text-footnote font-bold leading-tight text-white">확보한 재고 · 결제 이어하기</span>
        : myOrder && soldOut ? <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-inner bg-ink px-3 py-1.5 text-label font-bold text-white">구매 완료</span>
        : soldOut && <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-inner bg-sold-out px-3 py-1.5 text-label font-bold text-white">{temporary ? '일시 품절' : 'SOLD OUT'}</span>}
    </div>
    <div className="min-w-0 flex-1 space-y-2.5">
      <div className="space-y-[3px]">
        <p className="text-label font-medium text-muted">{p.category}</p>
        <h3 className={`text-headline font-semibold leading-[21px] ${soldOut ? 'text-meta' : ''}`}>{p.name}</h3>
        <p className={`text-[19px] font-extrabold ${soldOut ? 'text-meta' : ''}`}>{money(p.price)}</p>
      </div>
      {status === '판매 중' && !soldOut && <div className="space-y-1.5"><div className="h-1 w-full rounded-[2px] bg-line"><div className={`h-1 rounded-[2px] ${urgent ? 'bg-urgent' : 'bg-ink'}`} style={{ width: `${pct}%` }}/></div><p className={`text-label ${urgent ? 'font-bold text-urgent' : 'text-muted'}`}><RollingText text={urgent ? `서두르세요! ${left}개 남음` : `${total}개 중 ${left}개 남음`}/></p></div>}
      {status === '판매 예정' && <p className="text-label text-muted">{total}개 한정 · 1인 {p.maxPerAccount}개</p>}
      {soldOut && <p className="text-label text-muted">{temporary ? TEMPORARY_SOLD_OUT_NOTE : soldOutLabel(p)}</p>}
      {status === '판매 종료' && !soldOut && <p className="text-label text-muted">판매 종료</p>}
    </div>
    {status === '판매 예정' && onNotify && bell(notified ? '알림 설정됨' : '오픈 알림 받기', !!notified)}
    {/* 판매 중에도 신청한 상품은 가격 인하·수량 임박 알림을 받으므로 끌 수 있게 둔다 */}
    {status === '판매 중' && notified && onNotify && bell('상품 알림 끄기', true)}
  </Link>;
}
export function Progress({ step }: { step: number }) { return <div aria-label={`상품 등록 ${step} / 7단계`} className="mb-5 flex gap-[5px]">{Array.from({ length: 7 }, (_, i) => <div key={i} className={`h-1 flex-1 rounded-[2px] ${i < step ? 'bg-ink' : 'bg-line'}`}/>)}</div>; }
export const ORDER_LABELS: Record<Order['status'], string> = { paid: '결제 완료', preparing: '배송 준비', shipping: '배송 중', delivered: '배송 완료', cancelled: '취소 완료', refunded: '환불 완료' };
/** 배송 현황(시안 배송 현황 · 상태별): 회색 상자 안 네 단계. 지난 단계는 흰 원, 지금 단계는 주색 큰 원, 이후는 회색 원. 단계 사이 선은 지난 곳까지 주색 */
const DELIVERY_STEPS = [['결제 완료', 'Payments'], ['배송 준비', 'Inventory'], ['배송 중', 'Shipping'], ['배송 완료', 'DeliveredHome']] as const;
export function DeliveryProgress({ status }: { status: Order['status'] }) {
  const active = ['paid', 'preparing', 'shipping', 'delivered'].indexOf(status);
  const line = (on: boolean, hidden: boolean) => <span className={`h-[3px] flex-1 ${hidden ? '' : on ? 'bg-ink' : 'bg-border'}`}/>;
  return <div className="flex rounded-card bg-soft px-2 pb-4.5 pt-5.5">{DELIVERY_STEPS.map(([label, icon], i) => <div key={label} aria-current={i === active ? 'step' : undefined} className="flex flex-1 flex-col items-center gap-2.5">
    <div className="flex h-14 w-full items-center">{line(i <= active, i === 0)}<span className="grid h-11 w-11 place-items-center">{i === active ? <span className="grid h-10 w-10 place-items-center rounded-full bg-ink text-white"><Icon name={icon} size={22}/></span> : <span className={`grid h-9 w-9 place-items-center rounded-full ${i < active ? 'border border-line bg-surface text-text' : 'bg-line text-placeholder'}`}><Icon name={icon} size={20}/></span>}</span>{line(i < active, i === DELIVERY_STEPS.length - 1)}</div>
    <span className={`text-body ${i === active ? 'font-extrabold text-text' : i < active ? 'font-semibold text-aux-strong' : 'font-medium text-placeholder'}`}>{label}</span>
  </div>)}</div>;
}
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
  return <SheetClose.Provider value={requestClose}><AxBottomSheet ref={panel} label={label} onOpenChange={next => { if (!next) requestClose(); }} isOpen={open} finalFocusRef={opener} height="hug" padding={padding} className="mx-auto max-w-[390px] border-0 text-text">{children}</AxBottomSheet></SheetClose.Provider>;
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
  const { pathname } = useLocation();
  // 지금 보고 있는 탭을 다시 누르면 맨 위로 올리고 그 화면을 새로 그려 데이터를 다시 받는다
  const items = [['/', '홈', 'Home'], ['/schedule', '판매 일정', 'Calendar'], ['/orders', '주문', 'Package'], ['/my', '마이', 'User']] as const;
  // 마이 하위 화면(/my/membership, /my/selling 등)도 마이 탭이 선택된 상태
  const on = (to: string) => to === pathname || (to === '/my' && pathname.startsWith('/my/'));
  const active = items.findIndex(([to]) => on(to));
  // 시안 Tab Bar: 높이 66 알약, 선택 칸(tint)이 고른 탭으로 미끄러진다. 바닥에서 max(14px, 안전 영역)
  return <nav aria-label="하단 메뉴" className="fixed bottom-0 left-1/2 z-30 w-full max-w-[390px] -translate-x-1/2 px-4 pb-[max(14px,env(safe-area-inset-bottom))]"><div className="tab-bar relative flex h-16.5 rounded-pill border border-border p-[5px]">
    {active >= 0 && <span aria-hidden className="tab-indicator absolute inset-y-[5px] left-[5px] w-[calc((100%-10px)/4)] rounded-pill bg-tint" style={{ transform: `translateX(${active * 100}%)` }}/>}
    {items.map(([to, label, icon]) => <NavLink end={to !== '/my'} key={to} to={to} state={{ tab: true }} onClick={e => { if (pathname === to) { e.preventDefault(); window.scrollTo(0, 0); window.dispatchEvent(new Event(TAB_REFRESH)); } }} className={({ isActive }) => `relative flex h-14 flex-1 flex-col items-center justify-center gap-[3px] text-[11px] ${isActive ? 'font-extrabold text-ink' : 'font-medium text-text'}`}>{({ isActive }) => <><Icon name={`${icon}${isActive ? 'On' : 'Off'}`} size={25}/>{label}</>}</NavLink>)}
  </div></nav>;
}
export async function copyText(text: string) { if (!navigator.clipboard) throw new Error('클립보드를 사용할 수 없습니다. 번호를 길게 눌러 복사해 주세요.'); await navigator.clipboard.writeText(text); }
/** 복사 버튼: 복사하면 잠시 체크 표시로 바뀐다 */
export function CopyButton({ value }: { value: string }) {
  const toast = useToast(); const [done, setDone] = useState(false);
  useEffect(() => { if (!done) return; const t = setTimeout(() => setDone(false), 1500); return () => clearTimeout(t); }, [done]);
  return <button aria-label="복사" className="press grid h-8 w-8 place-items-center" onClick={() => copyText(value).then(() => { setDone(true); toast('복사했습니다.'); }).catch(e => toast(e.message))}>{done ? <Check size={16} className="text-ink"/> : <Copy size={16} className="muted"/>}</button>;
}
export function Unavailable({ message = '접근할 수 없는 화면입니다.' }: { message?: string }) { return <><Header title="접근 안내"/><Empty title={message} message="이 화면을 사용할 수 있는 계정으로 전환해 주세요."><Button to="/my">마이페이지로</Button></Empty></>; }
export function Loading({ text = '확인하고 있어요…' }: { text?: string }) { return <div className="muted flex items-center justify-center gap-2 py-10 text-label"><Info size={16}/>{text}</div>; }

/** 바텀시트 — 상단 모서리 28, 손잡이, 뒤 배경 어둡게(Astryx BottomSheet) */
export function BottomSheet({ title, children, onClose }: { title?: string; children: ReactNode; onClose: () => void }) {
  return <Sheet label={title ?? '선택'} onClose={onClose} padding={4}>{title && <div className="-mx-4 mb-4 mt-1 flex items-center justify-between border-b border-line px-4 pb-3"><h2 className="text-headline font-bold">{title}</h2><SheetCloseButton onClose={onClose} className="-mr-3 grid h-11 w-11 place-items-center" iconClassName="muted"/></div>}{children}</Sheet>;
}

/** 수량 증감 — 계정당 최대 수 적용 */
export function QuantityStepper({ value, min = 0, max, onChange }: { value: number; min?: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="inline-flex items-center gap-3">
      <button aria-label="수량 감소" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} className="press grid h-8 w-8 place-items-center rounded-full border border-border text-title font-bold disabled:opacity-30">−</button>
      <span className="font-number w-6 text-center text-subhead font-bold">{value}</span>
      <button aria-label="수량 증가" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} className="press grid h-8 w-8 place-items-center rounded-full border border-border text-title font-bold disabled:opacity-30">+</button>
    </div>
  );
}

/** 칩(시안 Chip): 높이 44 알약. 선택은 주색 바탕 흰 글자, 기본은 흰 바탕 테두리 */
export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={selected} className={`press inline-flex h-11 items-center rounded-pill px-4 text-callout transition-colors ${selected ? 'bg-ink font-bold text-surface' : 'border border-border bg-surface font-medium text-aux-strong'}`}>
      {children}
    </button>
  );
}

/**
 * 가운데 대화상자(Astryx Dialog, native dialog). 폭 318, 모서리 28(시안 Popup), 안쪽 여백 24, 그림자 없음.
 * onDismiss가 있으면 Esc로 닫히고(form), dismissOnBackdrop이면 바깥 누르기로도 닫힌다(info). 없으면 버튼으로만 닫힌다(required)
 */
function CenterDialog({ title, onDismiss, dismissOnBackdrop = false, children }: { title: string; onDismiss?: () => void; dismissOnBackdrop?: boolean; children: ReactNode }) {
  return <AxDialog isOpen onOpenChange={open => { if (!open) onDismiss?.(); }} purpose={!onDismiss ? 'required' : dismissOnBackdrop ? 'info' : 'form'} width={318} maxHeight="92dvh" padding={6} aria-label={title} className="max-w-[calc(100%-32px)] rounded-dialog bg-surface text-text shadow-none">
    <div className="space-y-4"><h2 className="text-headline font-bold">{title}</h2>{children}</div>
  </AxDialog>;
}

/** 확인창 기본 문구. 나가기를 고르면 그 화면의 입력(임시 저장 포함)은 남지 않는다(지우는 화면은 useLeaveGuard의 onLeave로 지운다) */
export const LEAVE_MESSAGE = '지금 나가면 작성 중인 내용이 사라져요.';
/** 주소 검색처럼 입력을 맡겨 두고 다녀오는 화면(돌아오면 입력이 이어진다) */
const LEAVE_OK = ['/address-search'];
type LeaveActions = { onSave?: () => void | Promise<void>; onDelete?: () => void | Promise<void> };
type LeaveGuard = LeaveActions & { dirty: boolean; bypass: boolean; message?: string; allow?: (pathname: string) => boolean; onLeave?: () => void };
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
export function useLeaveGuard(dirty: boolean, { message, allow, onLeave, onSave, onDelete }: LeaveActions & { message?: string; allow?: (pathname: string) => boolean; onLeave?: () => void } = {}) {
  const [guard] = useState<LeaveGuard>(() => ({ dirty, bypass: false }));
  guard.dirty = dirty; guard.message = message; guard.allow = allow; guard.onLeave = onLeave; guard.onSave = onSave; guard.onDelete = onDelete;
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
  return blocker.state === 'blocked' ? <ConfirmLeave message={message} onSave={blocking.current?.onSave ? async () => { await blocking.current?.onSave?.(); blocker.proceed?.(); } : undefined} onDelete={blocking.current?.onDelete ? async () => { await blocking.current?.onDelete?.(); blocker.proceed?.(); } : undefined} onLeave={() => { const g = blocking.current; blocker.proceed(); g?.onLeave?.(); }} onStay={() => blocker.reset()}/> : null;
}

/** 작성 중 나가기 확인 대화상자. Esc는 계속 작성. message: 화면마다 사실에 맞는 안내(기본은 저장되지 않음) */
export function ConfirmLeave({ onLeave, onStay, onSave, onDelete, message }: LeaveActions & { onLeave: () => void; onStay: () => void; message?: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const choice = !!onSave && !!onDelete;
  async function run(action: () => void | Promise<void>) { if (busy) return; setBusy(true); setError(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : '처리하지 못했어요. 다시 시도해 주세요.'); } finally { setBusy(false); } }
  return <CenterDialog title={choice ? '작성 중인 내용을 임시 저장할까요?' : '작성을 그만할까요?'} onDismiss={() => { if (!busy) onStay(); }}>
    <p className="muted text-body leading-relaxed">{message ?? (choice ? '임시 저장하면 다시 들어와 이어서 작성할 수 있어요.' : LEAVE_MESSAGE)}</p>
    <ErrorBox message={error}/>
    {choice ? <div className="flex flex-col gap-2">
      <Button className="min-h-11 w-full" disabled={busy} onClick={() => void run(onSave!)}>임시 저장하고 나가기</Button>
      <Button outline className="min-h-11 w-full" disabled={busy} onClick={() => void run(onDelete!)}>삭제하고 나가기</Button>
      <Button outline className="min-h-11 w-full" disabled={busy} onClick={onStay}>계속 작성</Button>
    </div> : <div className="flex gap-2">
      <Button outline className="flex-1" onClick={onLeave}>나가기</Button>
      <Button className="flex-1" onClick={onStay}>계속 작성</Button>
    </div>}
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

/** 토글 스위치(시안 Toggle) — 52×32, 손잡이 26, 켜짐 주색, 꺼짐 테두리 색 */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-label={label} aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-8 w-13 shrink-0 rounded-full transition-colors ${checked ? 'bg-ink' : 'bg-border'}`}><span className={`absolute top-[3px] h-6.5 w-6.5 rounded-full bg-surface transition-all ${checked ? 'left-[23px]' : 'left-[3px]'}`}/></button>;
}
