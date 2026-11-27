import { isPurchaseLimitFailure, purchaseLimitNotice } from '../purchaseLimit';
import type { PurchaseLimitDetails } from '../purchaseLimit';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Timer, Camera, ChevronDown, Info, Search, Bell, List as ListIcon, ExternalLink, Clock3, Plus, Minus, Truck, CheckCircle2, ChevronRight, PackageCheck, Calendar } from 'lucide-react';
import { Drawer, DrawerHeader } from '@astryxdesign/core/Drawer';
import { clockLeft, useFromTab, LiveStatus, Badge, BottomSheet, Button, Chip, CopyButton, DeliveryProgress, Empty, ErrorBox, Field, Header, InfoRow, Modal, Note, ORDER_LABELS, ProductCard, ProductImage, ProductSummary, useLeaveGuard, useToast } from '../components/ui';
import { CATEGORIES, categoryGroup, activeUser, purchaseBlock, PURCHASE_BLOCK_TEXT, available, stockLeft, stockTotal, beginPayment, DomainError, formatPhone, money, nowOf, orderNo, reserve, resolvePayment, saleState, uid } from '../domain';
import type { Address, Hold, Product, Order } from '../domain';
import { atomic, getState, mutate, useStore } from '../store';
import { externalHref, imageData } from '../files';
import { addBusinessDays, countdown, dateTime, kstDay, kstSlot, shortDate, useClock } from '../hooks';
import { loginHref, signedIn } from '../auth';
import { trackViewItem } from '../analytics';
import { addressLine, listAddresses, toAddress } from './address';
import { ExpiredCheckout } from './checkoutExpired';
import { confirmPurchase, changeShippingAddress, createOrder, createOrderInquiry, createProductInquiry, listProductInquiries, retryWhileUnavailable, errorMessage, getCheckout, getCheckoutTerms, getOrder, getProduct, isApiError, fetchUnreadCount, listNotifications, listOrders, getCategoryCatalog, markAllNotificationsRead, markNotificationRead, notificationPath, useApi, listProducts, mergeCheckout, mergeInquiries, mergeOrderList, mergeOrders, mergeProducts, openTossPayment, uploadInquiryImage, deleteInquiryImage, useLive, retryProjection } from '../api';
import type { CheckoutTermsDto, InboxItem } from '../api';
import { USE_MOCK } from '../config';
import { CompositionInput } from '../components/CompositionInput';
import { Card as AxCard } from '@astryxdesign/core/Card';
import { useNotified } from '../productAlerts';
import { useBackgroundPush } from '../pushStatus';
import { homePage, newestFirst, pageCount, rankByServerOrder } from '../homeList';
import { HomePager } from '../components/HomePager';
import { useProductPhotos } from '../productPhotos';
import { FALLBACK_CATALOG, catalogMajorOf, catalogTabs } from '../categoryCatalog';
import type { SavedAddress } from './address';
import { retryable } from '../api/live';
import { BrandLogo } from '../components/BrandLogo';
import { AmountRows, CheckoutCoupon, ProductBenefits, SoldOutSeen, hasDiscount, useListTracking, useOrderCoupon } from './membershipCoupon';

/** 홈 — 구매자 홈. 판매자 권한이 있으면 Figma "판매자 홈"처럼 판매 등록 버튼이 함께 보인다 */
export function HomePage() {
  const s = useStore(), now = useClock(); const [params, setParams] = useSearchParams(); const [notified, toggleNotify] = useNotified();
  // shortcut: 공개 상품을 한 번에 100개까지만 받아 기존처럼 화면에서 거른다(마감 임박, 판매 종료처럼 서버 조건과 다른 필터가 있어서).
  // 서버 기본 정렬 NEWEST(공개 승인 최신순) 응답 순서를 listRank로 보관해 새로 올라온 상품을 먼저 보여 준다. 이번 응답에 없는 상품의 예전 순위는 지운다
  const live = useLive(signal => listProducts({ size: 100, sort: 'NEWEST' }, signal), (state, r) => { for (const x of state.products) delete x.listRank; mergeProducts(state, rankByServerOrder(r.items)); });
  const query = params.get('q') ?? '', category = params.get('category') ?? '전체', filter = params.get('state') ?? '전체';
  const setParam = (key: string, value: string) => { const next = new URLSearchParams(params); if (key !== 'p') next.delete('p'); /* 검색어, 카테고리, 상태를 바꾸면 첫 페이지로 */ if (!value || value === '전체') next.delete(key); else next.set(key, value); setParams(next, { replace: true }); };
  const left = (p: Product) => stockLeft(s, p, now);
  const isUrgent = (p: Product) => saleState(p, now) === '판매 중' && p.endsAt - now <= 3_600_000 && left(p) > 0;
  // 카테고리 탭: 실제 모드는 공개 카테고리 카탈로그(GET /category-catalog)의 대분류를 서버 순서와 이름 그대로 쓰고, 상품 category(세부 이름)를 카탈로그로 대분류에 매핑한다.
  // 카탈로그를 못 받으면 고정 대분류(FALLBACK_CATALOG)로 탭을 보여 준다(이때는 category가 대분류 이름과 같은 상품만 그 탭에). 매핑 안 되는 상품은 '전체'에만. mock 모드는 목업 묶음(categoryGroup)
  const cats = useApi(signal => (USE_MOCK ? Promise.resolve(null) : getCategoryCatalog(signal).then(c => ({ c, fallback: false }), () => ({ c: FALLBACK_CATALOG, fallback: true }))), []);
  const majorOf = cats.data ? catalogMajorOf(cats.data.c) : () => undefined;
  const baseTabs = USE_MOCK ? ['전체', ...CATEGORIES] : cats.data ? catalogTabs(cats.data.c) : ['전체'];
  const categoryTabs = [...baseTabs, ...(category !== '전체' && !baseTabs.includes(category) && (USE_MOCK || cats.data) ? [category] : [])]; // 예전 주소의 세부 이름도 탭으로 남긴다
  const inCategory = (p: Product) => category === '전체' || (USE_MOCK ? categoryGroup(p.category) === category : majorOf(p.category) === category || p.category === category);
  const products = newestFirst(s.products.filter(p => p.published && inCategory(p) &&(filter === '전체' || (filter === '마감 임박' ? isUrgent(p) : saleState(p, now) === filter)) && `${p.name} ${p.brand} ${p.category}`.toLowerCase().includes(query.toLowerCase())));
  // 8개씩(HOME_PAGE_SIZE) 좌우로 넘기는 페이지. 보던 페이지는 주소(p, 1부터)에 남겨 상세에 갔다 뒤로 와도 그대로
  const page = homePage(params.get('p'), pageCount(products.length));
  const showHero = !query && category === '전체' && filter === '전체';
  const urgent = s.products.filter(p => p.published && isUrgent(p));
  const seller = signedIn(s) && !!s.users.find(u => u.id === s.activeUserId)?.seller;
  const unreadState = useApi(signal => (!USE_MOCK && signedIn(s) ? fetchUnreadCount(signal) : Promise.resolve(0)), [s.activeUserId]), unread = unreadState.data ?? 0;
  // 알림 목록은 오른쪽에서 밀려 들어와 화면 전체를 덮는 패널. 열림은 주소(?inbox=1)에 남겨, 알림을 눌러 간 화면에서 뒤로 오면 패널로 돌아온다
  // 로그인 전에는 알림함 주소로 보내 로그인부터 한다
  const inboxOpen = params.get('inbox') === '1', toast = useToast(), goTo = useNavigate(), homeLoc = useLocation();
  const openInbox = () => { if (!USE_MOCK && !signedIn(s)) { goTo('/notifications'); return; } const next = new URLSearchParams(params); next.set('inbox', '1'); setParams(next, { state: { inbox: true } }); };
  const closeInbox = () => {
    unreadState.reload(); // 패널에서 읽은 만큼 빨간 점을 다시 센다
    if ((homeLoc.state as { inbox?: boolean } | null)?.inbox) { goTo(-1); return; } // 직접 연 패널은 기록 하나를 되돌려 닫는다(뒤로 가기와 같다)
    const next = new URLSearchParams(params); next.delete('inbox'); setParams(next, { replace: true });
  };
  useListTracking(query ? 'search_results' : 'home_new', query ? '검색 결과' : '새로 올라온 상품', query, products); // 회원제·쿠폰 플래그와 분석 동의가 있을 때만 보낸다
  const pushOn = useBackgroundPush(signedIn(s)); // 아이콘을 채우면 이 기기의 백그라운드 알림이 켜진 상태(기준은 알림 설정 화면과 같다)
  return <div className="space-y-4">
    <header className="flex items-center justify-between pt-1"><h1 className="text-ink"><span className="sr-only">STOCKDROP</span><BrandLogo width={88}/></h1><div className="flex items-center"><button type="button" aria-label={`백그라운드 알림 ${pushOn ? '켜짐' : '꺼짐'}`} data-push={pushOn ? 'on' : 'off'} onClick={() => toast(pushOn ? '백그라운드 알림이 켜져 있습니다.' : '백그라운드 알림이 꺼져 있습니다. 마이 > 알림 설정에서 켤 수 있어요.')} className="grid h-9 w-9 place-items-center"><Bell size={21} strokeWidth={1.6} fill={pushOn ? 'currentColor' : 'none'} aria-hidden/></button><button type="button" aria-label="알림 목록" onClick={openInbox} className="relative grid h-9 w-9 place-items-center"><ListIcon size={21} strokeWidth={1.6} aria-hidden/>{unread > 0 && <span aria-label={`안 읽은 알림 ${unread}개`} className="absolute right-0 top-0 h-2 w-2 rounded-full bg-red ring-2 ring-surface"/>}</button></div></header><Drawer isOpen={inboxOpen} onOpenChange={open => { if (!open) closeInbox(); }} label="알림 목록" width="100%" experimental={{ isFullWidthOnMobile: true }} padding={3}>{/* 홈 화면 앱은 상태 표시줄 밑까지 그리므로(black-translucent) 그 높이만큼 비우고 검게 칠한다. 안 비우면 제목이 겹치고 닫기 버튼이 눌리지 않는다 */}<div aria-hidden className="fixed inset-x-0 top-0 z-10 h-[env(safe-area-inset-top)] bg-[#0E0E0F]"/><div className="pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]"><DrawerHeader title="알림" onOpenChange={open => { if (!open) closeInbox(); }}/>{inboxOpen && <NotificationsPage onClose={closeInbox}/>}</div></Drawer>
    <label className="flex h-12 items-center gap-2.5 rounded-element bg-soft px-4"><Search size={18} className="text-meta"/><CompositionInput aria-label="상품 검색" value={query} onValueChange={value => setParam('q', value)} placeholder="상품명·카테고리·판매처 검색" className="min-w-0 flex-1 bg-transparent text-callout outline-none placeholder:text-placeholder"/></label>
    <div role="group" aria-label="상품 카테고리" className={`-mx-4 flex overflow-x-auto border-b border-line px-4 ${categoryTabs.length <= 5 ? 'justify-between' : 'gap-5'}`}>{categoryTabs.map(c => <button key={c} onClick={() => setParam('category', c)} className={`shrink-0 whitespace-nowrap border-b-2 pb-2.5 text-callout ${category === c ? 'border-ink font-bold' : 'border-transparent text-aux'}`}>{c}</button>)}{cats.loading && <span className="sr-only" role="status">카테고리를 불러오는 중</span>}</div>
    {(cats.error || cats.data?.fallback) && <p className="text-label text-meta">카테고리를 불러오지 못해 대분류만 보여요. <button type="button" className="font-bold underline" onClick={cats.reload}>다시 시도</button></p>}
    <div className="flex gap-1.5 overflow-x-auto">{['전체', '마감 임박', '판매 중', '판매 예정', '판매 종료'].map(f => <button key={f} onClick={() => setParam('state', f)} className={`flex h-7.5 shrink-0 items-center gap-1 rounded-inner px-2.5 text-label ${filter === f ? 'bg-ink font-bold text-white' : f === '마감 임박' ? 'bg-soft font-bold text-urgent' : 'bg-soft text-aux'}`}>{f === '마감 임박' && <span className={`h-1.5 w-1.5 rounded-full ${filter === f ? 'bg-white' : 'bg-urgent'}`}/>}{f}</button>)}</div>
    {showHero && <div className="rounded-element bg-ink px-4.5 py-5 text-white"><p className="text-caption font-bold">STOCKDROP 시간 한정 판매</p><h2 className="mt-1.5 text-heading font-bold tracking-[-.6px]">단 3시간, 한정 판매</h2></div>}
    {showHero && urgent.length > 0 && <section className="space-y-3 pt-3"><div className="flex items-center justify-between"><h2 className="flex items-center gap-1.5 text-title font-bold"><Timer size={19} className="text-urgent"/>곧 마감돼요</h2><span className="text-label text-aux">마감 임박 {urgent.length}</span></div>
      {urgent.slice(0, 1).map(p => { const total = stockTotal(p), l = left(p); return <Link key={p.id} to={`/product/${p.id}`} className="block"><div className="relative"><ProductImage src={p.images[0]} alt={p.name} className="h-[240px] w-full"/><span className="absolute left-3 top-3 rounded-inner bg-urgent px-2 py-1 text-footnote font-bold text-white">마감 임박</span><span className="absolute right-3 top-3 flex items-center gap-1 rounded-inner bg-black/75 px-2 py-1 text-label font-bold tabular-nums text-white"><Timer size={13}/>{clockLeft(p.endsAt - now)} 남음</span></div><p className="mt-3 text-label font-bold text-aux">{p.brand}</p><div className="mt-1 flex items-center justify-between"><h3 className="text-headline">{p.name}</h3><p className="text-title font-bold">{money(p.price)}</p></div><div className="mt-2 flex items-center justify-between"><p className="text-body font-bold text-urgent">서두르세요! {l}개 남았어요</p><p className="text-label text-meta">{total}개 중 {total - l}개 판매</p></div><div className="mt-2 h-1 w-full rounded-full bg-line"><div className="h-1 rounded-full bg-urgent" style={{ width: `${total ? (total - l) / total * 100 : 0}%` }}/></div></Link>; })}
    </section>}
    <div className="flex items-end justify-between pt-6"><div><h2 className="text-title font-bold">{query ? `검색 결과 ${products.length}개` : '새로 올라온 상품'}</h2><p className="mt-1 text-label text-meta">의류 · 패션잡화 · 문구 · 생활잡화</p></div>{showHero && <button className="text-label text-aux" onClick={() => setParam('state', '판매 예정')}>더보기</button>}</div>
    {products.length ? <HomePager items={products} page={page} onPage={i => setParam('p', i ? String(i + 1) : '')} render={p => <ProductCard key={p.id} product={p} now={now} availableCount={left(p)} notified={notified.includes(p.id)} onNotify={() => toggleNotify(p.id)}/>}/> : live.loading || live.error ? <LiveStatus state={live}/> : (!query && filter === '전체' && category !== '전체' ? <Empty title={`아직 ${category} 상품이 없어요`} message="새 상품이 올라오면 여기에 보여요. 다른 카테고리도 둘러보세요."><Button outline onClick={() => setParam('category', '전체')}>전체 상품 보기</Button></Empty> : <Empty title="검색 결과가 없어요" message="검색어나 카테고리를 바꿔 보세요."><Button outline onClick={() => setParams({})}>필터 초기화</Button></Empty>)}
    <p className="py-4 text-footnote text-meta">미판매 새 상품만 판매합니다. 중고·전시·하자 상품은 제외돼요.</p>
    {seller && <Link to="/seller/new" className="fixed bottom-[calc(88px+env(safe-area-inset-bottom,0px))] right-[max(16px,calc(50%-179px))] z-30 flex h-12 items-center gap-2 rounded-full bg-ink pl-3 pr-5 text-subhead font-bold text-white shadow-lg"><span className="grid h-6 w-6 place-items-center rounded-full bg-positive"><Plus size={16} strokeWidth={2.5}/></span>판매 등록</Link>}
  </div>;
}

/** 판매 스케줄 응답 목업 (Product Query 일정 API 연동 전) — Figma "판매 스케줄" 예시 값. 오늘 날짜 기준 시각(분) */
const SCHEDULE_MOCK: { productId: string; name: string; category: string; price: number; image: string; start: number }[] = [
  { productId: 'cardigan', name: '소프트 코튼 가디건', category: '의류 / 상의', price: 39000, image: './images/schedule-1.jpg', start: 21 * 60 + 40 },
  { productId: 'ecobag', name: '데일리 코튼 에코백', category: '패션잡화 / 가방', price: 18000, image: './images/schedule-2.jpg', start: 21 * 60 + 40 },
  { productId: 'basket', name: '모듈 수납 바구니', category: '생활잡화 / 수납용품', price: 12900, image: './images/schedule-3.jpg', start: 23 * 60 },
  { productId: 'notebook', name: 'A5 데일리 노트', category: '문구 / 노트', price: 8500, image: './images/schedule-4.jpg', start: 23 * 60 + 30 },
];
const DAY_MS = 86_400_000, SALE_MS = 10_800_000;
const hm = (t: number) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
export function SchedulePage() {
  const s = useStore(), now = useClock(), fromTab = useFromTab(), navigate = useNavigate(); const [notified, toggleNotify] = useNotified(); const [weekOffset, setWeekOffset] = useState<0 | 1>(0);
  const today = new Date(now); today.setHours(0, 0, 0, 0); const todayMs = today.getTime();
  const [selected, setSelected] = useState<number | 'all'>(todayMs);
  const monday = todayMs - ((today.getDay() + 6) % 7) * DAY_MS + weekOffset * 7 * DAY_MS;
  const days = Array.from({ length: 7 }, (_, i) => monday + i * DAY_MS);
  const thisMonday = todayMs - ((today.getDay() + 6) % 7) * DAY_MS;
  // 이번 주·다음 주(14일) 판매 시작 상품. 일정 API(/v1/products/schedule)는 날짜별 개수만 줘서 목록 API로 받는다
  const live = useLive(signal => listProducts({ startsFrom: thisMonday, startsTo: thisMonday + 14 * DAY_MS, size: 100 }, signal), (state, r) => mergeProducts(state, r.items), [thisMonday]);
  const items = USE_MOCK ? SCHEDULE_MOCK.map(m => ({ ...m, startsAt: todayMs + m.start * 60_000, endsAt: todayMs + m.start * 60_000 + SALE_MS }))
    : s.products.filter(p => p.published).map(p => ({ productId: p.id, name: p.name, category: p.category, price: p.price, image: p.images[0] ?? '', startsAt: p.startsAt, endsAt: p.endsAt }));
  const inRange = (t: number) => selected === 'all' ? t >= monday && t < monday + 7 * DAY_MS : t >= selected && t < selected + DAY_MS;
  const visible = items.filter(i => inRange(i.startsAt) && i.endsAt > now);
  const selling = visible.filter(i => i.startsAt <= now), upcoming = visible.filter(i => i.startsAt > now);
  const md = (t: number) => `${new Date(t).getMonth() + 1}.${new Date(t).getDate()}`;
  const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
  const leftLabel = (end: number) => { const m = Math.max(0, Math.floor((end - now) / 60_000)); return `${Math.floor(m / 60)}시간 ${m % 60}분 남음`; };
  const row = (i: typeof items[number], live: boolean, last: boolean) => <Link key={i.productId} to={`/product/${i.productId}`} className={`flex gap-3.5 py-4 ${last ? '' : 'border-b border-line'}`}>
    <ProductImage src={i.image} alt={i.name} className="h-24 w-24 shrink-0"/>
    <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
      <div><div className="flex items-center gap-2"><span className={`rounded-badge px-1.5 py-0.5 text-footnote font-bold ${live ? 'bg-positive-soft text-positive' : 'bg-soft text-aux'}`}>{live ? '판매 중' : '오픈 예정'}</span><span className="text-label font-bold">{live ? `${hm(i.startsAt)} – ${hm(i.endsAt)}` : `${hm(i.startsAt)} 오픈`}</span></div><p className="mt-1.5 text-subhead font-bold">{i.name}</p><p className="mt-0.5 text-label text-meta">{i.category}</p></div>
      <div className="flex items-center justify-between"><p className="text-subhead font-bold">{money(i.price)}</p>{live ? <span className="flex items-center gap-2 text-label text-aux"><span className="flex items-center gap-1"><Timer size={13}/>{leftLabel(i.endsAt)}</span>{notified.includes(i.productId) && <button type="button" aria-label="상품 알림 끄기" onClick={e => { e.preventDefault(); void toggleNotify(i.productId); }} className="flex h-7 items-center gap-1 rounded-[14px] border border-border px-2.5 text-label font-bold"><Bell size={12}/>알림 끄기</button>}</span> : <button type="button" onClick={e => { e.preventDefault(); toggleNotify(i.productId); }} className={`flex h-7 items-center gap-1 rounded-[14px] px-2.5 text-label font-bold ${notified.includes(i.productId) ? 'bg-ink text-white' : 'border border-border'}`}><Bell size={12}/>{notified.includes(i.productId) ? '알림 설정됨' : '알림 받기'}</button>}</div>
    </div>
  </Link>;
  const group = (label: string, list: typeof items, live: boolean) => list.length ? <section key={label}><p className="pt-2 text-label font-bold text-meta">{label} <span className="text-ink">{list.length}</span></p>{list.map((i, k) => row(i, live, k === list.length - 1))}</section> : null;
  return <div>
    <header className="flex items-start gap-3 pt-1">{!fromTab && <button aria-label="이전 화면" onClick={() => window.history.state?.idx > 0 ? navigate(-1) : navigate('/')} className="-ml-1 grid h-9 w-9 shrink-0 place-items-center"><ArrowLeft size={20}/></button>}<div><h1 className="text-title-lg font-bold">판매 일정</h1><p className="mt-1 text-label text-aux">모든 판매는 오픈 후 3시간 동안만 진행돼요</p></div></header>
    <div className="-mx-4 mt-4 flex items-center justify-between border-b border-line px-4"><div className="flex gap-5">{(['이번 주', '다음 주'] as const).map((t, i) => <button key={t} onClick={() => { setWeekOffset(i as 0 | 1); setSelected(i ? 'all' : todayMs); }} className={`border-b-2 pb-2.5 text-subhead ${weekOffset === i ? 'border-ink font-bold' : 'border-transparent text-meta'}`}>{t}</button>)}</div><div className="flex items-center gap-2 pb-2"><span className="text-label text-meta">{md(days[0])} – {md(days[6])}</span><Link to="/schedule/calendar" className="flex h-7 items-center gap-1 rounded-inner border border-border px-2 text-label font-bold"><CalendarDays size={13}/>전체 일정</Link></div></div>
    <div className="flex items-center gap-1 py-3"><button onClick={() => setSelected('all')} className={`w-10 shrink-0 text-body font-bold ${selected === 'all' ? 'text-ink' : 'text-aux'}`}>전체</button>{days.map(t => { const isToday = t === todayMs, on = selected === t, past = t < todayMs; return <button key={t} onClick={() => setSelected(t)} aria-label={`${md(t)} ${WEEKDAY[new Date(t).getDay()]}요일`} className={`flex h-13.5 flex-1 flex-col items-center justify-center rounded-element ${on ? 'bg-ink text-white' : ''}`}><span className={`text-footnote ${on ? 'font-bold' : 'text-meta'}`}>{isToday ? '오늘' : WEEKDAY[new Date(t).getDay()]}</span><span className={`text-headline font-bold ${on ? '' : past ? 'text-placeholder' : ''}`}>{new Date(t).getDate()}</span></button>; })}</div>
    <div className="-mx-4 h-2 bg-divider"/>
    <div className="flex items-center justify-between pb-2 pt-5"><h2 className="text-headline font-bold">{selected === 'all' ? `${md(days[0])} – ${md(days[6])}` : `${new Date(selected).getMonth() + 1}월 ${new Date(selected).getDate()}일 ${WEEKDAY[new Date(selected).getDay()]}요일`}</h2><span className="text-label text-meta">판매 {visible.length}개</span></div>
    {visible.length ? <>{group('지금 판매 중', selling, true)}<div className="h-4"/>{group('오픈 예정', upcoming, false)}</> : live.loading || live.error ? <LiveStatus state={live}/> : <Empty title="선택한 날의 판매 일정이 없어요" message="다른 요일을 선택하거나 전체 일정을 확인해 보세요."/>}
  </div>;
}

function ProductPhotos({ product: p }: { product: Product }) {
  const [selected, setSelected] = useState(0);
  return <><ProductImage src={p.images[selected] ?? p.images[0]} alt={p.name} className="aspect-square w-full rounded-none!"/>
    {p.images.length > 1 && <div className="flex max-w-full gap-2 overflow-x-auto" aria-label="상품 사진 목록">{p.images.map((src, index) => <button key={src} type="button" aria-label={`상품 사진 ${index + 1} 보기`} aria-pressed={selected === index} onClick={() => setSelected(index)} className="h-16 w-16 shrink-0 rounded border border-line"><ProductImage src={src} alt={`상품 사진 ${index + 1}`} className="h-full w-full"/></button>)}</div>}</>;
}
function ProductFaqs({ faqs }: { faqs: Product['faqs'] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const confirmed = faqs.filter(f => f.confirmed), current = confirmed.find(f => f.id === selected);
  if (!confirmed.length) return null;
  return <section className="divider space-y-3 py-4"><h2 className="text-subhead font-bold">판매자 확인 FAQ</h2>
    <div className="space-y-2">{confirmed.map(f => <button key={f.id} type="button" aria-haspopup="dialog" aria-expanded={current?.id === f.id} onClick={() => setSelected(f.id)} className="flex w-full min-w-0 items-center justify-between gap-3 rounded-element border border-line px-3 py-3 text-left text-body"><span className="min-w-0 break-words">{f.question}</span><ChevronRight size={16} className="shrink-0" aria-hidden="true"/></button>)}</div>
    {current && <Modal title={current.question} onClose={() => setSelected(null)}><p className="whitespace-pre-line break-words text-body leading-relaxed">{current.answer}</p></Modal>}
  </section>;
}
export function ProductPage() {
  const { id } = useParams(); const s = useStore(), now = useClock(), toast = useToast(); const p = s.products.find(p => p.id === id);
  const viewed = useRef(''); // 상세 응답을 받은 뒤 상품당 1회 (사진 주소 만료로 다시 받아도 중복 전송 없음)
  const live = useLive(async signal => { const d = await getProduct(id ?? '', signal); if (viewed.current !== d.id) { viewed.current = d.id; trackViewItem(d); } return d; }, (state, d) => mergeProducts(state, [d]), [id]); const navigate = useNavigate(); const loc = useLocation(); const [rebuy] = useState<RebuyFailure | undefined>(() => (loc.state as { rebuy?: RebuyFailure } | null)?.rebuy); const [optionsOpen, setOptionsOpen] = useState(!!rebuy); const [extPopup, setExtPopup] = useState(false);
  useEffect(() => { if (rebuy) navigate(loc.pathname, { replace: true, state: null }); }, []);
  const [resume] = useState<Record<string, number> | undefined>(() => { try { const v = JSON.parse(sessionStorage.getItem(PENDING_BUY) || 'null'); sessionStorage.removeItem(PENDING_BUY); return v?.productId === id ? v.quantities : undefined; } catch { return undefined; } });
  useEffect(() => { if (resume) setOptionsOpen(true); }, []);
  const [alerts, toggleAlert] = useNotified(), notified = alerts.includes(id ?? ''); // Hook은 early return 위에 둔다(조건부 호출 금지)
  // 목록에서 받은 요약(옵션 없음)만 있으면 상세가 올 때까지 기다린다
  if (!p || !p.published || (p.live && !p.options.length)) return retryable(live) ? <LiveStatus state={live}/> : <Empty title="상품을 찾을 수 없어요"><Button to="/">홈으로</Button></Empty>;
  const status = saleState(p, now), qty = stockLeft(s, p, now);
  const block = signedIn(s) ? purchaseBlock(s, p) : null; // 판매자 본인 상품·운영자는 옵션 선택·결제로 못 넘어간다
  // 이 상품을 이미 샀거나 재고를 확보해 결제 중이면 품절 안내 대신 내 주문·결제로 안내한다
  const myOrder = s.orders.find(o => o.userId === s.activeUserId && o.productId === p.id && !['cancelled', 'refunded'].includes(o.status));
  const myHold = s.holds.find(h => h.userId === s.activeUserId && h.productId === p.id && (h.status === 'pending' || h.status === 'reserved' && (h.expiresAt ?? Infinity) > now));
  const soldOut = status !== '판매 예정' && qty <= 0; const hms = (t: number) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const headerTitle = status === '판매 예정' ? '판매 대기' : soldOut ? '구매 결과' : '상품 상세';
  return <div className="space-y-4"><Header title={headerTitle} subtitle={status === '판매 예정' ? '오픈 예정' : '결제가 완료된 주문부터 확정돼요'}/><ProductPhotos key={`photos-${p.id}`} product={p}/>
    {!soldOut && <div className="flex items-center justify-between gap-3"><Badge live={status === '판매 중'}>{status === '판매 예정' ? '오픈 예정' : status}</Badge><p className="text-footnote text-red">{status === '판매 중' ? `마감까지 ${countdown(p.endsAt, now)}` : status === '판매 예정' ? `${p.category} · 3시간 한정` : '신규 구매가 종료되었어요'}</p></div>}
    {status === '판매 예정' && <div className="space-y-3"><div className="rounded-inner bg-blue-soft p-5 text-center"><p className="muted mb-2 text-footnote">판매 시작까지</p><p className="font-number text-display font-bold">{countdown(p.startsAt, now)}</p><p className="muted mt-2 text-caption">{dateTime(p.startsAt)} 오픈</p></div><button type="button" aria-pressed={notified} onClick={() => void toggleAlert(p.id)} className={`flex w-full items-center justify-between rounded-element border px-4 py-3 text-left ${notified ? 'border-ink bg-ink text-surface' : 'border-line'}`}><div><p className="text-body font-bold">상품 알림 받기</p><p className={`mt-0.5 text-footnote ${notified ? 'opacity-70' : 'muted'}`}>판매 시작·가격 인하·수량 임박 때 알려드려요</p></div><span className={`text-footnote font-semibold ${notified ? '' : 'text-muted'}`}>{notified ? '알림 설정됨' : '신청하기'}</span></button></div>}
    {status === '판매 중' && notified && <button type="button" onClick={() => void toggleAlert(p.id)} className="flex w-full items-center justify-between rounded-element border border-line px-4 py-3 text-left"><div><p className="text-body font-bold">상품 알림 받는 중</p><p className="muted mt-0.5 text-footnote">가격 인하·수량 임박 때 알려드려요</p></div><span className="text-footnote font-semibold text-muted">알림 끄기</span></button>}
    {myHold ? <div className="space-y-2 rounded-inner bg-ink p-5 text-center text-surface"><p className="text-callout font-bold">{myHold.status === 'pending' ? '결제 결과를 확인하고 있어요' : '확보한 재고가 있어요'}</p><p className="text-footnote opacity-70">{myHold.status === 'pending' ? '결제 화면에서 결과를 확인해 주세요.' : `${countdown(myHold.expiresAt, now)} 안에 결제를 완료해 주세요`}</p></div>
      : soldOut && myOrder ? <div className="space-y-2 rounded-inner bg-blue-soft p-5 text-center"><p className="text-headline font-bold">구매에 성공한 상품이에요</p><p className="muted text-footnote">배송 상황은 주문 상세에서 확인할 수 있어요</p></div>
      : soldOut && <div className="space-y-3 rounded-inner bg-blue-soft p-5 text-center"><p className="font-number text-display-sm font-extrabold tracking-[-1px]">SOLD OUT</p><p className="text-callout font-bold">선착순 판매 종료됐어요</p><p className="muted text-footnote">선착순 마감되었습니다. 다음 판매를 노려보세요</p></div>}
    {soldOut && <div className="grid grid-flow-col auto-cols-fr divide-x divide-line rounded-element border border-line py-3 text-center"><div><p className="text-headline font-bold tabular-nums">{hms(p.startsAt)}</p><p className="mt-0.5 text-footnote text-meta">오픈</p></div>{p.soldOutAt !== undefined && <div><p className="text-headline font-bold tabular-nums">{hms(p.soldOutAt)}</p><p className="mt-0.5 text-footnote text-meta">선착순 마감</p></div>}{p.participants !== undefined && <div><p className="text-headline font-bold">{p.participants.toLocaleString('ko-KR')}명</p><p className="mt-0.5 text-footnote text-meta">함께 도전</p></div>}</div>}
    <Note title={status === '판매 예정' ? '게시 즉시 공개 · 구매는 시작 시각부터' : '3시간 한정 선착순'}>{status === '판매 예정' ? '판매 시작 전에는 상품 탐색만 가능합니다. 구매하거나 재고를 확보할 수 없습니다.' : '옵션 선택은 재고 확보가 아닙니다. 구매하기로 확보에 성공하면 5분 안에 결제를 완료해 주세요.'}</Note>
    <p className="text-label font-bold">{[p.category, p.brand].filter(Boolean).join(' · ')}</p><h1 className="text-heading tracking-[-.5px]">{p.name}</h1><p className="muted text-caption">미판매 새 상품 · 중고·전시·하자 상품 제외</p>
    <a href={externalHref(p.originalUrl, p.id)} className="divider flex w-full items-center gap-3 py-3 text-left" onClick={event => { event.preventDefault(); setExtPopup(true); }}><ExternalLink size={18}/><div><p className="text-label font-semibold">기존 판매처에서 상품 보기</p><p className="muted mt-1 text-caption">외부 판매처의 가격과 판매조건은 직접 확인해 주세요.</p><p className="mt-1 break-all text-footnote">{p.originalUrl}</p></div></a>
    <div><p className="font-number text-heading-lg font-bold">{money(p.price)}</p><p className="muted mt-2 text-footnote">고정 배송비 {money(p.shipping)} · 최종 결제금액은 수량 선택 후 표시</p></div>
    <ProductBenefits product={p} hidden={!!block || soldOut || status === '판매 종료'}/>
    {soldOut && <SoldOutSeen product={p}/>}
    <div className="divider space-y-2 py-4"><InfoRow label="판매 시작" value={dateTime(p.startsAt)}/><InfoRow label="판매 종료" value={`${dateTime(p.endsAt)} · 3시간 후 자동 종료`}/><InfoRow label="출고 예정" value={`결제 후 ${p.dispatchDays}영업일 이내`}/><InfoRow label="계정당 구매 상한" value={`최대 ${p.maxPerAccount}개`}/></div>
    <InfoRow label="총 한정 수량" value={`${stockTotal(p)}개`}/>
    <h2 className="text-subhead font-bold">옵션별 구매 가능 수량</h2>{p.options.map(o => <div key={o.id} className="divider flex items-center justify-between gap-3 py-3"><span className="text-body">{o.name}</span><span className="text-label text-green">{status === '판매 중' ? `${available(s, p, o.id, now)}개` : status === '판매 예정' ? `${available(s, p, o.id, now)}개 · 판매 시작 후 구매 가능` : `${available(s, p, o.id, now)}개 · 판매 종료`}</span></div>)}
    {p.shippingNotice && <section className="space-y-2"><h2 className="text-subhead font-bold">배송 안내</h2><p className="whitespace-pre-line break-words text-label">{p.shippingNotice}</p></section>}
    {p.purchaseNotice && <section className="space-y-2"><h2 className="text-subhead font-bold">구매 안내</h2><p className="whitespace-pre-line break-words text-label">{p.purchaseNotice}</p></section>}
    <section className="space-y-3 py-3"><h2 className="text-subhead font-bold">상품 정보</h2><p className="whitespace-pre-line text-label leading-[1.8]">{p.description}</p>{p.dimensions.map((d, i) => <InfoRow key={`dimension-${i}`} label={d.name} value={d.values}/>)}{p.extras.map((e, i) => <InfoRow key={i} label={e.key} value={e.value}/>)}<InfoRow label="재고 처분 사유" value={p.reason}/></section>
    <ProductFaqs key={`faqs-${p.id}`} faqs={p.faqs}/>
<p className="muted text-caption leading-relaxed">교환은 지원하지 않습니다. 반품·환불은 STOCKDROP이 처리하지 않으며, 주문 내역의 판매자 문의로 판매자와 직접 협의해 주세요.</p>
    <ProductInquirySection product={p} blocked={!!block}/>
    {soldOut && <section className="space-y-3"><h2 className="text-subhead font-bold">{myOrder ? '비슷한 상품' : '놓친 상품과 비슷한 상품'}</h2><div className="grid grid-cols-2 gap-x-2 gap-y-4">{s.products.filter(r => r.published && r.id !== p.id && r.category === p.category && r.endsAt > now).slice(0, 4).map(r => <ProductCard key={r.id} product={r} now={now}/>)}</div>{s.products.some(r => r.published && r.id !== p.id && r.category === p.category && r.endsAt > now) && <Button outline className="w-full" to={`/?category=${encodeURIComponent(categoryGroup(p.category) ?? '')}`}>전체보기</Button>}</section>}
    <div className="sticky bottom-19 z-20 -mx-4 border-t border-line bg-surface px-4 py-3">{block ? <div className="space-y-2 text-center"><p className="text-body font-bold">{PURCHASE_BLOCK_TEXT[block]}</p>{block === 'own' ? <Button className="w-full" to={`/seller/product/${p.id}`}>판매 현황 보기</Button> : <Button outline className="w-full" to="/admin">운영자 마이페이지</Button>}</div> : myHold ? <Button className="w-full" to={`/checkout/${myHold.id}`}>{myHold.status === 'pending' ? '결제 결과 확인하기' : `${countdown(myHold.expiresAt, now)} 안에 결제 이어하기`}</Button> : soldOut && myOrder ? <Button className="w-full" to={`/orders/${myOrder.id}`}>주문 상세 보기</Button> : soldOut ? <div className="flex gap-2"><Button className="flex-1" to="/">홈으로</Button><Button outline className="flex-1" to={`/?category=${encodeURIComponent(categoryGroup(p.category) ?? '')}`}>비슷한 상품 보기</Button></div> : <Button buy className="w-full" disabled={status !== '판매 중' || qty <= 0} onClick={() => signedIn(s) ? setOptionsOpen(true) : navigate(loginHref(`/product/${p.id}`))}>{status === '판매 예정' ? '판매 시작 전 · 구매할 수 없어요' : status === '판매 종료' ? '판매가 종료되었습니다' : qty <= 0 ? '일시 품절 · 재고를 확인해 주세요' : `남은 ${qty}개 · 선착순 구매하기`}</Button>}</div>
    {optionsOpen && !block && <OptionSheet product={p} initial={rebuy} resume={resume} onClose={() => setOptionsOpen(false)}/>}
    {extPopup && <Modal title="외부 사이트로 이동할까요?" onClose={() => setExtPopup(false)}><div className="space-y-4"><p className="muted text-label">STOCKDROP을 벗어나 판매처 페이지가 새 창으로 열려요.</p><div className="rounded-inner bg-blue-soft p-3"><p className="text-label font-bold">{p.brand}</p><p className="muted mt-1 break-all text-caption">{p.originalUrl}</p></div><p className="muted text-caption">판매처의 가격·배송·교환 조건은 STOCKDROP과 다를 수 있어요.</p><div className="flex gap-2"><Button outline className="flex-1" closeSheet>취소</Button><Button className="flex-1" onClick={() => { window.open(externalHref(p.originalUrl, p.id), '_blank', 'noopener,noreferrer'); setExtPopup(false); }}>이동하기</Button></div></div></Modal>}
  </div>;
}

/** 상품 상세의 상품 문의: 기존 생성 API로 새 문의를 남기고 본인 문의만 보여 준다. 상품 문의에는 추가 메시지 API가 없어 새 문의로만 묻는다. */
function ProductInquirySection({ product: p, blocked }: { product: Product; blocked: boolean }) {
  const s = useStore(), toast = useToast(), navigate = useNavigate(); const live = signedIn(s) && !blocked;
  const [question, setQuestion] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const mine = useLive(signal => USE_MOCK || !live ? Promise.resolve([]) : listProductInquiries(p.id, s.activeUserId, signal), (st, items) => mergeInquiries(st, items), [p.id, s.activeUserId, live]);
  const items = s.inquiries.filter(i => i.productId === p.id && !i.orderId && i.userId === s.activeUserId && i.sellerId !== 'stockdrop').sort((a, b) => b.createdAt - a.createdAt);
  // 작성 중: 상품 문의를 적었을 때(보내면 입력이 비워진다)
  useLeaveGuard(!blocked && !!question.trim());
  if (blocked) return null; // 판매자 본인 상품과 운영자는 문의하지 않는다
  async function submit() {
    const text = question.trim(); if (!text || busy) return; setError(''); setBusy(true);
    try {
      if (USE_MOCK) mutate(st => { st.inquiries.unshift({ id: uid('q-'), userId: st.activeUserId, sellerId: p.sellerId, productId: p.id, productName: p.name, kind: '상품 문의', question: text, public: false, createdAt: nowOf(st) }); });
      else { const q = await createProductInquiry(p.id, text, s.activeUserId); mutate(st => mergeInquiries(st, [q])); }
      setQuestion(''); toast('문의가 판매자에게 전달되었습니다.');
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <section className="divider space-y-3 py-4">
    <h2 className="text-subhead font-bold">상품 문의</h2>
    {!signedIn(s) ? <Button outline className="w-full" to={loginHref(`/product/${p.id}`)}>로그인하고 문의하기</Button> : <>
      <Field label="문의 내용" hint="판매자가 답변하면 알림으로 안내해 드려요. 내 문의는 나만 볼 수 있어요." error={error}><textarea aria-label="상품 문의 내용" className="field field-box" rows={3} maxLength={2000} value={question} onChange={e => setQuestion(e.target.value.slice(0, 2000))} placeholder="상품에 대해 궁금한 점을 입력해 주세요"/></Field>
      <Button outline className="w-full" disabled={busy || !question.trim()} onClick={submit}>{busy ? '보내는 중…' : '문의 남기기'}</Button>
      {mine.error ? <LiveStatus state={mine}/> : items.length > 0 && <div className="space-y-2"><p className="text-label font-bold">내 문의</p>{items.map(i => <button key={i.id} onClick={() => navigate(`/inquiries/${encodeURIComponent(i.id)}?productId=${encodeURIComponent(p.id)}`)} className="flex w-full items-center justify-between gap-3 rounded-element border border-line p-3 text-left"><span className="line-clamp-1 text-label">{i.question}</span><span className={`shrink-0 rounded px-2 py-0.5 text-caption font-semibold ${i.answer ? 'bg-positive-soft text-positive' : 'bg-blue-soft text-muted'}`}>{i.answer ? '답변 완료' : '답변 대기'}</span></button>)}</div>}
    </>}
  </section>;
}

/** 같은 상품·옵션·수량으로 새 주문(재고 확보)을 시작하고 결제 화면 id를 돌려준다. 실제 모드는 addressId가 없으면 기본 배송지 */
export async function startOrder(p: Product, quantities: Record<string, number>, addressId?: string, couponIssueId?: string): Promise<string> {
  const block = purchaseBlock(getState(), p); if (block) throw new DomainError(PURCHASE_BLOCK_TEXT[block], 'forbidden');
  if (USE_MOCK) return (await atomic(state => reserve(state, state.activeUserId, p.id, quantities, nowOf(state)))).id;
  // 실제 API: 주문 생성(202 접수) → 결제 화면에서 HELD 확인
  let id = addressId;
  if (!id) { const addr = await listAddresses(); const a = addr.find(x => x.defaultAddress) ?? addr[0]; if (!a) throw new Error('배송지를 먼저 등록해 주세요.'); id = a.addressId; }
  const d = await createOrder({ productId: p.id, addressId: id, items: Object.entries(quantities).filter(([, q]) => q > 0).map(([optionId, quantity]) => ({ optionId, quantity })), ...(couponIssueId ? { couponIssueId } : {}) });
  mutate(st => mergeCheckout(st, { ...d, productId: d.productId ?? p.id }));
  return d.orderId;
}
/** 다시 구매하기 실패 시 상품 화면의 옵션 시트에 띄울 안내(재고 확보 실패 화면) */
export interface RebuyFailure extends PurchaseLimitDetails { failureCode?: string; quantities: Record<string, number>; error: string; failedOptionId: string | null }

/** 배송지가 없어 새 배송지 입력으로 갔다가 돌아오면 이어서 구매할 상품·수량 (sessionStorage) */
const PENDING_BUY = 'stockdrop:pending-buy';
function OptionSheet({ product: p, onClose, initial, resume }: { product: Product; onClose: () => void; initial?: RebuyFailure; resume?: Record<string, number> }) {
  const s = useStore(), now = useClock(), navigate = useNavigate(); const [quantities, setQuantities] = useState<Record<string, number>>(initial?.quantities ?? resume ?? {}); const [error, setError] = useState(initial?.error ?? ''), [busy, setBusy] = useState(false), [existing, setExisting] = useState(''), [failedOptionId, setFailedOptionId] = useState<string | null>(initial?.failedOptionId ?? null), [stockFailed, setStockFailed] = useState(!!initial); const [preparing, setPreparing] = useState<'' | 'retrying' | 'failed'>(''); const open = useRef(true); useEffect(() => () => { open.current = false; }, []);
  const limit = initial && isPurchaseLimitFailure(initial.failureCode) ? purchaseLimitNotice(initial) : null;
  const count = Object.values(quantities).reduce((a, b) => a + b, 0);
  const coupon = useOrderCoupon(p, p.price * count, count); // 회원제·쿠폰 플래그가 꺼져 있으면 아무것도 그리지 않고 할인 0
  async function buy() { setError(''); setExisting(''); setFailedOptionId(null); setStockFailed(false); setBusy(true); try {
    // 배송지가 하나도 없으면 재고 확보(5분 타이머) 전에 새 배송지부터 받는다. 저장 후 이 상품으로 돌아와 이어서 구매
    if (!(await listAddresses()).length) { sessionStorage.setItem(PENDING_BUY, JSON.stringify({ productId: p.id, quantities })); coupon.remember(); onClose(); navigate(`/addresses/new?returnTo=${encodeURIComponent(`/product/${p.id}`)}`, { state: { reason: 'checkout' } }); return; }
    setPreparing('');
    // 판매 시작 직후 ORDER_UNAVAILABLE(외부 연동 준비 전, 503)은 실패 화면 대신 '판매를 준비하고 있어요' — 2.5초 뒤 두 번까지 자동 재시도
    const orderId = await retryWhileUnavailable(() => startOrder(p, quantities, undefined, coupon.issueId), () => { setPreparing('retrying'); return open.current; });
    if (orderId === undefined) return; // 기다리는 사이 시트를 닫았다
    coupon.ordered();
    setPreparing(''); onClose(); navigate(`/checkout/${orderId}`); } catch (e) { if (isApiError(e, 'ORDER_UNAVAILABLE')) { setPreparing('failed'); return; } setPreparing(''); const err = e as DomainError; const block = isApiError(e) && e.status === 403 ? purchaseBlock(getState(), p) : null; setError(block ? PURCHASE_BLOCK_TEXT[block] : err.message); /* 명세에 본인 상품·운영자 구매 전용 에러 코드가 없다: 403(COMMON_FORBIDDEN)이면 계정 상태로 같은 안내 */ if (err.code?.startsWith('existing:')) setExisting(err.code.slice(9)); if (err.code === 'stock') { const name = err.message.split(' 재고가')[0]; setFailedOptionId(p.options.find(o => o.name === name)?.id ?? null); } } finally { setBusy(false); } }
  useEffect(() => { if (resume) void buy(); }, []);
  const hasFailure = !limit && (!!failedOptionId || stockFailed), failedName = p.options.find(o => o.id === failedOptionId)?.name;
  return <Modal title={coupon.picking ? '쿠폰 선택' : '옵션 선택'} onClose={onClose}><div className="space-y-4">{coupon.picking ? coupon.step : <>{limit && <div role="alert" className="rounded-inner bg-red-soft p-3"><p className="text-body font-bold text-red">1인 구매 한도를 넘었어요</p><p className="text-label text-red leading-relaxed mt-1">{limit.message}</p></div>}{hasFailure && <div className="rounded-inner bg-red-soft p-3"><p className="text-body font-bold text-red">재고를 확보하지 못했어요</p><p className="text-label text-red leading-relaxed mt-1">{failedName ? `${failedName}의 남은 수량이 부족해요.` : '재고를 확보하지 못했어요.'} 수량을 다시 선택해 주세요. 결제는 진행되지 않았어요.</p></div>}<ProductSummary product={{ ...p, image: p.images[0] }}/><Note title="선착순 진행 중">마감까지 {countdown(p.endsAt, now)} · 계정당 최대 {p.maxPerAccount}개까지 구매할 수 있어요.</Note><div><p className="label mb-2">옵션 <span className="muted text-caption">· 필수</span></p><p className="muted mb-3 text-footnote">{p.options.length > 1 ? '옵션별 수량을 선택해 주세요' : '수량을 선택해 주세요'}</p>{p.options.map(o => { const avail = available(s, p, o.id, now); const failed = failedOptionId === o.id; return <div key={o.id} className={`space-y-2 py-3 divider${failed ? ' rounded-inner border border-red px-3' : ''}`}><div className="flex items-center justify-between gap-2"><span className="text-body font-medium">{o.name}</span>{failed ? <span className="rounded-full bg-red-soft px-2 py-0.5 text-caption font-semibold text-red">품절</span> : <span className="muted text-caption">남은 {avail}개</span>}</div><div className="flex items-center justify-end gap-2"><button aria-label={`${o.name} 수량 감소`} className="grid h-9 w-9 place-items-center rounded border border-line" disabled={!quantities[o.id]} onClick={() => setQuantities({ ...quantities, [o.id]: Math.max(0, (quantities[o.id] ?? 0) - 1) })}><Minus size={15}/></button><output aria-label={`${o.name} 선택 수량`} className="w-7 text-center">{quantities[o.id] ?? 0}</output><button aria-label={`${o.name} 수량 추가`} className="grid h-9 w-9 place-items-center rounded border border-line" disabled={failed || count >= Math.min(p.maxPerAccount, limit?.remaining ?? p.maxPerAccount) || (quantities[o.id] ?? 0) >= avail} onClick={() => setQuantities({ ...quantities, [o.id]: (quantities[o.id] ?? 0) + 1 })}><Plus size={15}/></button></div>{failed && <p className="text-footnote text-red">남은 {avail}개 · 선택 수량을 줄여 주세요</p>}</div>; })}</div>{preparing === 'retrying' && <div role="status" className="rounded-inner bg-blue-soft p-3"><p className="text-body font-bold">판매를 준비하고 있어요</p><p className="muted mt-1 text-label">잠시 후 자동으로 다시 시도할게요.</p></div>}{preparing === 'failed' && <div role="alert" className="space-y-2 rounded-inner bg-soft p-3"><p className="text-body font-bold">잠시 후 다시 시도해 주세요</p><p className="muted text-label">판매를 준비하는 중이에요. 결제는 진행되지 않았어요.</p><Button outline className="w-full" disabled={busy} onClick={buy}>다시 시도</Button></div>}<ErrorBox message={error}/>{existing && <Button to={`/checkout/${existing}`} className="w-full" onClick={onClose}>진행 중인 주문으로 이동</Button>}{hasFailure && <div className="flex gap-2"><Button outline className="flex-1" onClick={() => { setFailedOptionId(null); setStockFailed(false); }}>옵션 다시 선택</Button><Button className="flex-1" disabled={!count || busy} onClick={buy}>남은 옵션으로 구매하기</Button></div>}{coupon.row}{coupon.note}<InfoRow label={`상품금액 (${count}개)`} value={money(p.price * count)} strong/><InfoRow label="고정 배송비" value={money(p.shipping)}/>{coupon.rows}<InfoRow label="합계" value={count ? money(p.price * count + p.shipping - coupon.discount) : '-'} strong/><p className="muted text-caption leading-relaxed">옵션 선택은 재고 확보가 아닙니다. 구매하기로 확보에 성공하면 5분 안에 결제를 완료해 주세요.</p>{limit?.remaining === 0 ? <Button className="w-full" onClick={onClose}>확인</Button> : !hasFailure && <Button className="sticky bottom-0 w-full shadow-[0_-8px_16px_var(--surface)]" disabled={!count || busy || !!limit && count > limit.remaining || saleState(p, now) !== '판매 중'} onClick={buy}>{busy ? '재고를 확인하고 있어요…' : '구매하기'}</Button>}</>}</div></Modal>;
}

const DUPLICATE = 'PRODUCT_DUPLICATE';
/** 재고 관련 실패만 '재고 확보 실패' 안내로. 그 밖(PAYMENT_NOT_COMPLETED 등 결제 단계)은 '결제 실패와 취소' 화면 */
export const isStockFailure = (code: string) => /STOCK|SOLD_OUT/.test(code);
const FAILURE_REASON: Record<string, string> = { PAYMENT_NOT_COMPLETED: '결제가 승인되지 않았어요', AMOUNT_MISMATCH: '결제 금액이 주문 금액과 달라 결제를 진행하지 않았어요', PAY_PROCESS_CANCELED: '결제창을 닫아 결제가 진행되지 않았어요', EXPIRED: '재고 확보 시간이 지났어요' };
/** Figma 03 "결제 실패와 취소" — held: 아직 재고 확보 중(남은 시간 안에 다시 결제 가능). 아니면 주문이 실패로 끝나 재고가 반환된 상태 */
function PaymentFailed({ hold, product: p, now, reason, held = false, title, onRetry }: { hold: Hold; product: Product; now: number; reason: string; held?: boolean; title?: string; onRetry?: () => void }) {
  const amount = hold.amounts?.totalAmount ?? hold.lines.reduce((n, l) => n + l.quantity * p.price, 0) + p.shipping; // 서버 금액이 있으면 그 값(쿠폰, 멤버십 할인 반영)
  return <div className="space-y-4">{!held && <Header title="주문 / 결제"/>}<h2 className="text-heading font-bold">{title ?? '결제가 완료되지 않았어요'}</h2><p className="muted text-body leading-relaxed">결제가 승인되지 않아 금액이 빠져나가지 않아요.</p>
    <section className="space-y-2 rounded-inner bg-soft p-4"><h3 className="mb-2 text-body font-bold">결제 정보</h3><InfoRow label="사유" value={reason}/><InfoRow label="주문번호" value={hold.id}/><InfoRow label="최종 결제금액" value={money(amount)}/></section>
    {!held && <ProductSummary product={{ ...p, image: p.images[0] }} option={hold.lines.map(l => `${l.name} / ${l.quantity}개`).join('\n')}/>}
    <section className="space-y-2 rounded-inner bg-soft p-4"><h3 className="mb-2 text-body font-bold">현재 확보 상태</h3>{held ? <><div className="flex items-center justify-between"><span className="muted text-label">재고 확보 중</span><span className="text-label font-semibold text-green">{countdown(hold.expiresAt, now)} 안에 결제</span></div><p className="muted mt-1 text-footnote">남은 시간 안에 다시 결제하면 같은 수량으로 구매할 수 있어요. 새로고침·재시도로 확보 시간이 연장되지 않습니다.</p></> : <><div className="flex items-center justify-between"><span className="muted text-label">확보한 재고를 반환했어요</span></div><p className="muted mt-1 text-footnote">다시 구매하려면 상품에서 새로 주문해 주세요.</p></>}</section>
    {onRetry ? <div className="flex gap-2"><Button outline className="flex-1" to="/orders">주문 상태</Button><Button className="flex-1" onClick={onRetry}>다시 결제하기</Button></div> : <div className="flex gap-2"><Button outline className="flex-1" to={`/product/${p.id}`}>상품으로 돌아가기</Button><Button className="flex-1" to="/orders">주문 상태</Button></div>}</div>;
}
export function CheckoutPage() {
  const { id } = useParams(); const s = useStore(), now = useClock(), navigate = useNavigate(), toast = useToast(); const user = activeUser(s); const hold = s.holds.find(h => h.id === id && h.userId === user.id); const p = s.products.find(p => p.id === hold?.productId); const [terms, setTerms] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [selecting, setSelecting] = useState(false);
  const [savedAddrs, setSavedAddrs] = useState<SavedAddress[]>([]); const here = `/checkout/${id}`; const editHref = () => { const cur = savedAddrs.find(a => a.roadAddress === address.address && a.recipientName === address.name); return cur ? `/addresses/${cur.addressId}/edit?returnTo=${encodeURIComponent(here)}` : `/addresses/new?returnTo=${encodeURIComponent(here)}`; };
  const keep = (useLocation().state as { keep?: { address: Address; addrId?: string } } | null)?.keep; // 다시 구매하기에서 넘어온 이전 배송지
  const [address, setAddress] = useState<Address>(() => keep?.address ?? s.addresses[user.id] ?? { name: user.name, phone: user.phone, address: '', detail: '', request: '' });
  const [addrId, setAddrId] = useState<string | undefined>(keep?.addrId), [termsDoc, setTermsDoc] = useState<CheckoutTermsDto>(), [params, setParams] = useSearchParams(); const sent = useRef(false);
  useEffect(() => { if (hold?.orderId) navigate(`/orders/${hold.orderId}?complete=1`, { replace: true }); }, [hold?.orderId, navigate]);
  useEffect(() => { listAddresses().then(data => { if (!data.length) return; setSavedAddrs(data); const current = keep?.address ?? s.addresses[user.id]; const picked = data.find(a => keep?.addrId && a.addressId === keep.addrId) ?? data.find(a => current && a.roadAddress === current.address && a.recipientName === current.name) ?? data.find(a => a.defaultAddress) ?? data[0]; if (keep?.address && !data.some(a => a.addressId === keep.addrId)) return; setAddress(toAddress(picked)); setAddrId(picked.addressId); }).catch(() => {}); }, []);
  // 실제 API: 결제 화면 원본(checkout) + 상품 + 약관을 불러온다. 결제 진행 중(pending)이면 2초마다 다시 확인
  const live = useLive(async signal => { const d = await getCheckout(id!, signal); return { d, prod: d.productId ? await getProduct(d.productId, signal) : undefined }; }, (st, r) => { mergeCheckout(st, r.d); if (r.prod) mergeProducts(st, [r.prod]); }, [id]);
  useEffect(() => { if (!USE_MOCK) getCheckoutTerms().then(setTermsDoc).catch(() => {}); }, []);
  // 결제 진행 중(pending)이거나 만료 시각을 아직 못 받았으면 2초 뒤 다시 조회한다
  const waiting = hold?.status === 'pending' || hold?.status === 'reserved' && hold.expiresAt === undefined;
  useEffect(() => { if (USE_MOCK || !waiting || busy || live.loading) return; const t = setTimeout(live.reload, 2000); return () => clearTimeout(t); }, [waiting, busy, live.loading]);
  // 실패(FAILED)는 만료가 아니다. 만료 화면은 실제로 만료됐을 때만
  const failure = hold?.failureCode;
  const payFailure = (useLocation().state as { payFailure?: { code: string; message?: string } } | null)?.payFailure;
  const expired = !!hold && !failure && (hold.status === 'released' || hold.status === 'reserved' && hold.expiresAt !== undefined && hold.expiresAt <= now);
  // 재고 관련 실패는 상품 화면의 '재고 확보 실패' 안내로 보낸다 (같은 옵션·수량으로 다시 고를 수 있게)
  useEffect(() => { if (!hold || !failure || !isStockFailure(failure) && !isPurchaseLimitFailure(failure)) return; navigate(`/product/${hold.productId}`, { replace: true, state: { rebuy: { quantities: Object.fromEntries(hold.lines.map(l => [l.optionId, l.quantity])), error: '', failedOptionId: null, failureCode: failure, purchaseLimit: hold.purchaseLimit, remainingPurchaseQuantity: hold.remainingPurchaseQuantity } satisfies RebuyFailure } }); }, [failure]);
  // 실제 모드: 만료 화면의 남은 수량이 최신이도록 만료되는 순간 상품을 한 번 다시 받는다
  const expiredShown = useRef(false);
  useEffect(() => { if (!expired || USE_MOCK || expiredShown.current) return; expiredShown.current = true; live.reload(); }, [expired]);
  if (failure === DUPLICATE) return <Empty title="이미 이 상품을 주문했어요" message="주문 내역에서 확인해 주세요."><Button to="/orders">주문 내역</Button></Empty>;
  if (!hold || !p) return retryable(live) ? <LiveStatus state={live}/> : <Empty title="진행 중인 주문이 없어요"><Button to="/">상품 둘러보기</Button></Empty>;
  // 결제창에서 실패·취소하고 돌아왔고 아직 재고 확보 중이면 같은 주문으로 다시 결제할 수 있다
  if (payFailure && !failure && hold.status === 'reserved') return <PaymentFailed hold={hold} product={p} now={now} held={!expired} title={payFailure.code === 'PAY_PROCESS_CANCELED' ? '결제를 취소했어요' : undefined} reason={payFailure.message || FAILURE_REASON[payFailure.code] || `결제를 완료하지 못했어요 (${payFailure.code})`} onRetry={() => navigate(`/checkout/${id}`, { replace: true, state: null })}/>;
  if (failure) return isStockFailure(failure) || isPurchaseLimitFailure(failure) ? <LiveStatus state={{ loading: true, error: '', reload: () => {} }}/> : <PaymentFailed hold={hold} product={p} now={now} reason={FAILURE_REASON[failure] ?? `결제를 완료하지 못했어요 (${failure})`}/>;
  if (expired) {
    const remaining = USE_MOCK ? p.options.reduce((n, o) => n + available(s, p, o.id, now), 0) : p.live?.available;
    // 만료된 주문은 다시 열지 않는다: 같은 상품·옵션·수량으로 새 주문을 시작하고, 실패하면 옵션 시트(재고 확보 실패)로 보낸다. 입력한 배송지는 그대로 넘긴다
    const rebuy = async () => {
      const quantities = Object.fromEntries(hold.lines.map(l => [l.optionId, l.quantity]));
      setError(''); setBusy(true);
      try { const orderId = await startOrder(p, quantities, addrId); navigate(`/checkout/${orderId}`, { replace: true, state: { keep: { address, addrId } } }); }
      catch (e) {
        const msg = errorMessage(e), name = msg.split(' 재고가')[0];
        navigate(`/product/${p.id}`, { state: { rebuy: { quantities, error: msg, failedOptionId: p.options.find(o => o.name === name)?.id ?? null } satisfies RebuyFailure } });
      } finally { setBusy(false); }
    };
    return <ExpiredCheckout hold={hold} product={p} remaining={remaining} busy={busy} error={error} onRebuy={rebuy}/>;
  }
  async function pay() {
    setError(''); setBusy(true);
    try {
      const latest = getState();
      if (!address.name.trim() || !address.phone.trim() || !address.address.trim()) throw new Error('배송지를 먼저 입력해 주세요.');
      if (!USE_MOCK) { // 실제 API: 배송지 확정(직전 version) → 토스 결제창(이동). 결과는 돌아온 뒤 위 effect가 처리
        let cur = await getCheckout(id!); // 승인 금액은 서버가 계산한 totalAmount를 쓴다(화면 계산값 사용 안 함)
        if (addrId) { cur = await changeShippingAddress(id!, addrId, cur.version); mutate(st => mergeCheckout(st, cur)); }
        if (cur.totalAmount == null) throw new Error('결제 금액을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
        await openTossPayment({ orderId: id!, orderName: cur.productName ?? p!.name, amount: cur.totalAmount, tossOrderId: cur.tossOrderId });
        return;
      }
      await atomic(state => beginPayment(state, state.activeUserId, id!, nowOf(state)));
      await new Promise(resolve => setTimeout(resolve, 700));
      const result = await atomic(state => resolvePayment(state, state.activeUserId, id!, latest.paymentOutcome, address, nowOf(state)));
      if (result) navigate(`/orders/${result.id}?complete=1`, { replace: true });
      else if (latest.paymentOutcome === 'failure') setError('결제가 완료되지 않았어요');
      else toast('결제 결과를 확인하고 있어요. 확인 전에는 재고를 반환하지 않습니다.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const headerSubtitle = hold.status === 'pending' ? '결제 결과를 확인하고 있어요' : '재고 확보 성공 · 5분 안에 결제를 완료하세요';
  return <div className="space-y-5"><Header title="주문 / 결제" subtitle={headerSubtitle}/>{hold.status === 'pending' ? <div className="rounded-element bg-ink p-4 text-surface"><p className="mb-2 text-footnote opacity-70">결제 결과를 확인하고 있어요</p><p className="font-number text-display font-bold">확인 중</p><p className="mt-2 text-caption opacity-70">잠시만 기다려 주세요. 확인 중에는 결제를 다시 요청하지 않아요.</p></div> : <div className="rounded-element bg-ink p-4 text-surface"><p className="mb-2 text-footnote opacity-70">선착순 재고 확보 성공</p><p className="font-number text-display font-bold">{countdown(hold.expiresAt, now)}</p><p className="mt-2 text-caption opacity-70">새로고침·재시도로 확보 시간이 연장되지 않습니다.</p></div>}<ProductSummary product={{ ...p, image: p.images[0] }} option={hold.lines.map(l => `${l.name} / ${l.quantity}개`).join('\n')} amount={hold.lines.reduce((n, l) => n + l.quantity * p.price, 0)}/><section className="divider space-y-3 pb-5"><div className="flex items-center justify-between"><h2 className="text-subhead font-bold">배송지</h2><div className="flex gap-3">{savedAddrs.length > 0 && <button className="text-footnote underline" onClick={() => setSelecting(true)}>변경</button>}<button className="text-footnote underline" onClick={() => navigate(editHref())}>수정</button></div></div>{address.address ? <><p className="text-label">{address.name} · {formatPhone(address.phone)}</p><p className="muted text-label leading-relaxed">{address.address}{address.detail ? ` ${address.detail}` : ''}{(address as any).request ? <><br/>{(address as any).request}</> : null}</p></> : <button className="text-label text-red underline" onClick={() => navigate(editHref())}>배송지를 입력해 주세요</button>}</section><CheckoutCoupon amounts={hold.amounts}/><div className="space-y-2">{hasDiscount(hold.amounts) ? <AmountRows amounts={hold.amounts!}/> : <><InfoRow label="상품금액" value={money(hold.amounts?.itemsAmount ?? hold.lines.reduce((n, l) => n + l.quantity * p.price, 0))}/><InfoRow label="고정 배송비" value={money(hold.amounts?.originalShippingFee ?? p.shipping)}/></>}<InfoRow label="최종 결제금액" value={money(hold.amounts?.totalAmount ?? hold.lines.reduce((n, l) => n + l.quantity * p.price, 0) + p.shipping)} strong/></div>{error === '결제가 완료되지 않았어요' ? <PaymentFailed hold={hold} product={p} now={now} reason="사용자가 결제를 취소함" held/> : <><Note title="안전한 결제">선택한 상품과 최종 결제금액을 확인해 주세요. 결제 승인 후 주문이 확정됩니다.</Note><label className="flex items-start gap-3 text-label leading-relaxed"><input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} className="mt-1 h-4 w-4"/>주문 내용과 판매조건을 확인했으며 결제에 동의합니다.</label>{termsDoc && <details className="muted text-footnote"><summary>{termsDoc.title}</summary><p className="mt-2 whitespace-pre-wrap leading-relaxed">{termsDoc.content}</p></details>}{error && error !== '결제가 완료되지 않았어요' && <ErrorBox message={error}/>}{<Button className="w-full" disabled={busy || (!terms && hold.status !== 'pending')} onClick={pay}>{busy ? '결제 결과 확인 중…' : hold.status === 'pending' ? '결제 결과 다시 확인' : `${countdown(hold.expiresAt, now)} 안에 결제하기`}</Button>}</>}
    {selecting && <AddressSelectSheet addresses={savedAddrs} selectedId={addrId} expiresAt={hold.expiresAt} now={now} onClose={() => setSelecting(false)} onAdd={() => { setSelecting(false); navigate(`/addresses/new?returnTo=${encodeURIComponent(here)}`); }} onPick={a => { setAddress(toAddress(a)); setAddrId(a.addressId); setSelecting(false); }}/>}
  </div>;
}
/** 결제 배송지 선택 — Figma "결제 배송지 선택". 목록에서 고르거나 새 배송지 추가, 남은 결제 시간은 계속 보인다 */
function AddressSelectSheet({ addresses, selectedId, expiresAt, now, onClose, onAdd, onPick }: { addresses: SavedAddress[]; selectedId?: string; expiresAt?: number; now: number; onClose: () => void; onAdd: () => void; onPick: (a: SavedAddress) => void }) {
  const [sel, setSel] = useState(selectedId ?? addresses.find(a => a.defaultAddress)?.addressId); const left = countdown(expiresAt, now);
  return <BottomSheet title="배송지 선택" onClose={onClose}><div>
    <p className="mb-2 text-footnote text-red">{left} 안에 결제를 완료하세요</p>
    {addresses.map(a => <button key={a.addressId} aria-pressed={sel === a.addressId} onClick={() => setSel(a.addressId)} className="divider flex w-full items-start gap-3 py-4 text-left"><span className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${sel === a.addressId ? 'border-ink bg-ink' : 'border-line'}`}/><div><div className="flex items-center gap-2"><p className="text-label font-semibold">{a.label || '배송지'}</p>{a.defaultAddress && <span className="rounded-full bg-blue-soft px-2 py-0.5 text-caption font-semibold">기본</span>}</div><p className="mt-1 text-label">{a.recipientName} · {a.recipientPhone}</p><p className="muted text-footnote">{addressLine(a)}</p></div></button>)}
    <button className="mt-2 flex w-full items-center justify-center gap-2 rounded-inner border border-line py-3 text-label" onClick={onAdd}><Plus size={15}/>새 배송지 추가</button>
    <p className="mt-3 text-center text-footnote text-red">결제 시간은 계속 흘러가요 · {left} 남음</p>
    <Button className="mt-3 w-full" disabled={!sel} onClick={() => { const a = addresses.find(x => x.addressId === sel); if (a) onPick(a); }}>이 주소로 배송</Button>
  </div></BottomSheet>;
}
export function OrdersPage() {
  const s = useStore(), now = useClock(), fromTab = useFromTab(); const live = useLive(signal => listOrders({}, signal), mergeOrderList); const [tab, setTab] = useState('전체');
  const orders = s.orders.filter(o => o.userId === s.activeUserId), shippingCount = orders.filter(o => o.status === 'shipping').length;
  const activeHolds = s.holds.filter(h => h.userId === s.activeUserId && (h.status === 'pending' || h.status === 'reserved' && (h.expiresAt ?? Infinity) > now));
  const tabs = ['전체', '배송준비', '배송중', '배송완료', '취소/환불'];
  const matches = (o: Order) => tab === '전체' || tab === '배송준비' && ['paid', 'preparing'].includes(o.status) || tab === '배송중' && o.status === 'shipping' || tab === '배송완료' && o.status === 'delivered' || tab === '취소/환불' && ['cancelled', 'refunded'].includes(o.status);
  const filtered = orders.filter(matches), photo = useProductPhotos(filtered.map(o => o.productId));
  const cardClass = 'block min-h-11 rounded-dialog outline-offset-2 focus-visible:outline-2 focus-visible:outline-green';
  return <><Header title="주문 / 배송" back={!fromTab}/>
    <div role="group" aria-label="주문 상태" className="divider mb-3 flex pb-2">{tabs.map(t => <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)} className={`min-h-11 min-w-0 flex-1 whitespace-nowrap border-b-2 text-subhead ${tab === t ? 'border-ink font-bold text-ink' : 'muted border-transparent font-normal'}`}>{t}</button>)}</div>
    {shippingCount > 0 && <div className="mb-3 flex items-center gap-3 rounded-dialog bg-positive-soft p-3"><Truck aria-hidden className="h-5 w-5 shrink-0"/><p className="text-body font-bold">배송 중인 주문이 {shippingCount}건 있어요</p></div>}
    <div className="space-y-2">
      {activeHolds.map(h => <Link key={h.id} to={`/checkout/${h.id}`} className={cardClass} aria-label={`${h.status === 'pending' ? '결제 결과 확인' : '이어서 결제'}: ${s.products.find(p => p.id === h.productId)?.name ?? '확보한 주문'}`}><AxCard padding={2} variant="default"><div className="flex items-center gap-2"><ProductImage src={s.products.find(p => p.id === h.productId)?.images[0] ?? ""} alt={s.products.find(p => p.id === h.productId)?.name ?? "확보한 상품"} className="h-16 w-14 shrink-0"/><div className="min-w-0 flex-1"><b className="text-label">{h.status === 'pending' ? '결제 결과 확인 중' : '확보한 주문 이어서 결제'}</b><p className="muted mt-1 break-words text-footnote">{s.products.find(p => p.id === h.productId)?.name} · {h.status === 'pending' ? '결제 완료 여부를 확인해 주세요.' : `${countdown(h.expiresAt, now)} 남음`}</p></div><ChevronRight aria-hidden className="h-4 w-4 shrink-0"/></div></AxCard></Link>)}
      {filtered.map(o => <Link key={o.id} to={`/orders/${o.id}`} className={cardClass} aria-label={`${o.product.name} ${ORDER_LABELS[o.status]} 주문 상세 보기`}><AxCard padding={2} variant="default"><div className="space-y-2">
        <Badge live={['shipping', 'delivered'].includes(o.status)}>{ORDER_LABELS[o.status]}</Badge>
        <div className="flex items-center gap-2"><ProductImage src={photo(o.productId, o.product.image)} alt={o.product.name} className="h-16 w-14 shrink-0"/><div className="min-w-0 flex-1 space-y-1"><p className="muted break-words text-footnote">{o.product.brand}</p><p className="break-words text-callout font-semibold">{o.product.name}</p><p className="muted break-words text-label">{o.lines.map(l => `${l.name} ${l.quantity}개`).join(' · ')}</p><p className="font-number text-subhead font-bold">{money(o.total)}</p></div><ChevronRight aria-hidden className="h-4 w-4 shrink-0"/></div>
        <p className="muted text-footnote">{shortDate(o.createdAt)} 주문</p>
      </div></AxCard></Link>)}
    </div>
    {!filtered.length && !activeHolds.length && (live.loading || live.error ? <LiveStatus state={live}/> : <Empty title="주문 내역이 없어요"><Button to="/">상품 둘러보기</Button></Empty>)}
  </>;
}

// 구매 확정은 confirmPurchase로 서버에 보낸다. TODO(api-gap): 주문 취소·환불 API는 명세에 없다(반품·환불은 플랫폼이 처리하지 않고 판매자 문의로 협의) — 취소/환불 상태 표시는 목업 유지
export function OrderDetailPage() {
  const { id } = useParams(); const [params, setParams] = useSearchParams(); const s = useStore(), user = activeUser(s); const o = s.orders.find(o => o.id === id && o.userId === user.id); const navigate = useNavigate(); const tracking = params.has('tracking');
  // 결제 완료 축하 화면은 결제 직후 한 번만. 주소의 complete를 바로 지워 뒤로 가기로 다시 보이지 않게 한다
  const [complete, setComplete] = useState(() => params.has('complete'));
  const [confirming, setConfirming] = useState(false), [confirmAsk, setConfirmAsk] = useState(false); const toast = useToast();
  useEffect(() => { if (params.has('complete')) { const next = new URLSearchParams(params); next.delete('complete'); setParams(next, { replace: true }); } }, []);
  // 결제 직후엔 조회 모델이 아직 없어 404일 수 있다 — 구매 실패로 보지 않고 checkout에서 받은 주문을 그대로 쓴다
  // 주문 응답에는 상품 사진이 없다. 토스에서 돌아온 결제 완료처럼 새로 열린 페이지는 저장소에 상품이 없어 사진이 비므로, 상품 상세(공개)를 받아 채운다
  const live = useLive(async signal => {
    let d: Order | null; try { d = await getOrder(id!, getState().activeUserId, signal); } catch (e) { if (isApiError(e) && e.status === 404) d = null; else throw e; }
    const pid = d?.productId || getState().orders.find(x => x.id === id)?.productId, has = !!getState().products.find(p => p.id === pid)?.images.length;
    const prod = pid && !has ? await getProduct(pid, signal).catch(() => undefined) : undefined; // 사진을 못 받아도 주문은 보여 준다
    return { d, prod };
  }, (st, r) => { if (r.prod) mergeProducts(st, [r.prod]); if (r.d) mergeOrders(st, [r.d]); }, [id]);
  if (!o) return retryable(live) ? <LiveStatus state={live}/> : <Empty title="주문을 찾을 수 없어요"><Button to="/orders">주문 목록</Button></Empty>;
  // 실제로 일어난 일만 보여 준다: 결제 → 송장 등록(배송 출발) → 판매자 배송 완료 처리
  const paidAt = o.paidAt ?? o.createdAt, doneAt = o.deliveredAt ?? o.processedAt;
  const events: [number, string, string][] = [...(o.purchaseConfirmedAt ? [[o.purchaseConfirmedAt, '구매 확정', '구매를 확정했어요'] as [number, string, string]] : []), ...(doneAt ? [[doneAt, '배송 완료', '판매자가 배송 완료로 처리했어요'] as [number, string, string]] : []), ...(o.shippedAt ? [[o.shippedAt, '배송 출발', [o.carrier, o.tracking && `송장 ${o.tracking}`].filter(Boolean).join(' · ')] as [number, string, string]] : []), [paidAt, '결제 완료', '주문이 확정되었어요']];
  const deliveredStr = doneAt ? `${kstSlot(doneAt)} 배송 완료` : '';
  const dispatchStr = o.dispatchDays ? `${kstDay(addBusinessDays(paidAt, o.dispatchDays))}까지 출고 예정 · 결제 후 ${o.dispatchDays}영업일 이내` : '';
  return <div className="space-y-5"><Header title={complete ? '결제 완료' : '주문 · 배송 상세'} subtitle={complete ? '배송이 곧 시작돼요' : `주문번호 ${orderNo(o.id)}`}/>{complete ? <div className="space-y-4"><CheckCircle2 size={38} className="text-green"/><h1 className="text-[25px] font-bold">축하해요!</h1><p className="text-callout">선착순 구매에 성공했어요</p>{dispatchStr && <p className="muted text-footnote">{dispatchStr}</p>}<p className="muted text-footnote">배송이 시작되면 알려드릴게요</p><p className="text-body font-bold">배송 현황</p><DeliveryProgress status={o.status}/><section className="space-y-2 rounded-inner bg-blue-soft p-4"><h3 className="mb-2 text-body font-bold">주문 정보</h3><InfoRow label="주문번호" value={orderNo(o.id)}/><InfoRow label="결제 금액" value={money(o.total)}/><InfoRow label="결제 방법" value="카드 결제"/></section><section className="space-y-2 rounded-inner bg-blue-soft p-4"><h3 className="mb-2 text-body font-bold">배송지</h3><p className="text-label">{o.address.name ? `${o.address.name} · ${o.address.address}` : '배송지 정보 없음'}</p></section></div> : <><h2 className="text-heading-lg font-bold tracking-[-.7px]">{o.status === 'delivered' ? '배송이 완료됐어요' : o.status === 'shipping' ? '상품이 배송 중이에요' : ['cancelled', 'refunded'].includes(o.status) ? ORDER_LABELS[o.status] : o.status === 'preparing' ? '상품을 준비하고 있어요' : '결제가 완료되었어요'}</h2>{deliveredStr && <p className="muted text-body">{deliveredStr}</p>}<DeliveryProgress status={o.status}/></>}
    <ProductSummary product={{ ...o.product, image: o.product.image || s.products.find(p => p.id === o.productId)?.images[0] || '' }} option={o.lines.map(l => `${l.name} / ${l.quantity}개`).join('\n')} amount={o.lines.reduce((n, l) => n + l.quantity * o.product.price, 0)}/>
    {o.status === 'delivered' ? <Note green title={deliveredStr || '배송 완료'}><p className="mb-1">판매자가 배송 완료로 처리했어요. 상품을 받지 못했다면 판매자에게 문의해 주세요.</p>{o.tracking && <p className="mt-1">{o.carrier} · 송장 {o.tracking}</p>}{USE_MOCK && o.processedAt && <p className="muted mt-1 text-footnote">10월 28일에 자동으로 구매 확정돼요</p>}</Note> : o.status === 'shipping' ? <Note title="상품이 이동중이에요">운송장을 조회하여 배송 현황을 확인할 수 있습니다.<br/>{o.carrier} · {o.tracking}</Note> : <Note title="판매자가 상품을 준비하고 있어요">운송장이 등록되면 배송 정보를 확인할 수 있습니다.</Note>}
    <section className="space-y-2"><h3 className="mb-3 text-subhead font-bold">주문 및 결제 정보</h3>{o.tracking && <><InfoRow label="택배사" value={o.carrier}/><InfoRow label="운송장 번호" value={<span className="inline-flex items-center gap-1">{o.tracking}<CopyButton value={o.tracking}/></span>}/></>}{hasDiscount(o.amounts) ? <AmountRows amounts={o.amounts!} couponLabel="쿠폰 할인"/> : <><InfoRow label="상품금액" value={money(o.amounts?.itemsAmount ?? o.total - o.shipping)}/><InfoRow label="고정 배송비" value={money(o.shipping)}/></>}<InfoRow label="최종 결제금액" value={money(o.total)} strong/><InfoRow label="결제 방법" value="카드 결제"/></section>
    <section className="divider space-y-3 py-4"><h3 className="text-subhead font-bold">배송지</h3><p className="text-label">{o.address.name} · {formatPhone(o.address.phone)}</p><p className="muted text-label leading-relaxed">{o.address.address}{o.address.detail ? ` ${o.address.detail}` : ''}</p>{o.address.request && <p className="muted text-label">요청사항 · {o.address.request}</p>}</section>
    {!complete && <section><h3 className="mb-3 text-subhead font-bold">주문 진행 내역</h3>{events.map(([time, title, desc], i) => <div key={i} className="divider flex gap-3 py-3"><PackageCheck size={17} className={i ? 'muted' : 'text-green'}/><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><b className="text-label">{title}</b><span className="muted text-caption">{dateTime(time)}</span></div><p className="muted mt-1 text-footnote">{desc}</p></div></div>)}</section>}
    {o.status === 'delivered' && !complete ? <section className="space-y-3 rounded-inner bg-blue-soft p-4">{o.purchaseConfirmedAt
        ? <><h3 className="text-body font-bold">구매를 확정했어요</h3><p className="muted text-label">{kstSlot(o.purchaseConfirmedAt)} 구매 확정. 상품에 문제가 있으면 판매자에게 문의해 주세요.</p><Button outline className="w-full" onClick={() => navigate(`/orders/${o.id}/inquiry`)}>판매자 문의</Button></>
        : <><h3 className="text-body font-bold">상품을 잘 받으셨나요?</h3><p className="muted text-label">문제가 없으면 구매를 확정해 주세요.{doneAt ? ` 확정하지 않으면 ${kstDay(doneAt + 7 * 86_400_000)}에 자동으로 확정돼요.` : ''} 하자·오배송·반품·환불은 STOCKDROP이 처리하지 않아요. 판매자 문의로 판매자와 직접 협의해 주세요.</p><div className="flex gap-2"><Button outline className="flex-1" onClick={() => navigate(`/orders/${o.id}/inquiry`)}>판매자에게 문의</Button><Button className="flex-1" disabled={confirming} onClick={() => setConfirmAsk(true)}>구매 확정</Button></div></>}</section> : <><Note title="상품을 확인해 주세요">취소·반품·환불·하자·오배송은 STOCKDROP이 처리하지 않아요. 판매자 문의로 판매자와 직접 협의해 주세요. 교환은 지원하지 않습니다.</Note><Button outline className="w-full" onClick={() => navigate(`/orders/${o.id}/inquiry`)}>판매자 문의 · 반품 문의</Button></>}{complete ? <><Button className="w-full" to="/">쇼핑 계속하기</Button><Button outline className="w-full" onClick={() => { setComplete(false); setParams({}, { replace: true }); }}>상세 배송조회</Button></> : <Button className="w-full" to="/orders">주문 목록으로</Button>}
    {confirmAsk && <Modal title="구매를 확정할까요?" onClose={() => !confirming && setConfirmAsk(false)}><div className="space-y-4"><p className="muted text-label leading-relaxed">확정하면 판매자 정산 대상이 돼요. 상품에 문제가 없는지 확인해 주세요. 반품·환불이 필요하면 확정하기 전에 판매자와 직접 협의해 주세요.</p><div className="flex gap-2"><Button outline className="flex-1" disabled={confirming} onClick={() => setConfirmAsk(false)}>취소</Button><Button className="flex-1" disabled={confirming} onClick={async () => { setConfirming(true); try { if (!USE_MOCK) { const u = await confirmPurchase(o.id, user.id); mutate(st => mergeOrders(st, [u])); } else mutate(st => { const it = st.orders.find(x => x.id === o.id); if (it) it.purchaseConfirmedAt = Date.now(); }); setConfirmAsk(false); toast('구매를 확정했어요.'); } catch (e) { toast(errorMessage(e)); } finally { setConfirming(false); } }}>{confirming ? '확정 중…' : '구매 확정'}</Button></div></div></Modal>}
  </div>;
}
/** 판매자에게 문의 — Figma "문의" (전체 화면) */
const INQUIRY_KINDS = ['하자·파손', '배송 지연', '오배송', '반품', '기타']; // 교환은 지원하지 않는다
/** 작성 중인 문의(유형·내용)는 이 탭에 임시 저장해 화면을 나갔다 와도 남긴다. 보내면 지운다(사진은 저장하지 않는다) */
const inquiryDraftKey = (orderId?: string) => `stockdrop:inquiry-draft:${orderId ?? ''}`;
function readInquiryDraft(orderId?: string): { kind?: string; question?: string } { try { return JSON.parse(sessionStorage.getItem(inquiryDraftKey(orderId)) || '{}'); } catch { return {}; } }
export function OrderInquiryPage() {
  const { id } = useParams(); const s = useStore(), user = activeUser(s), navigate = useNavigate(), toast = useToast();
  const order = s.orders.find(o => o.id === id && o.userId === user.id);
  const photo = useProductPhotos([order?.productId]); // 주문 응답에는 상품 사진이 없다
  const [kind, setKind] = useState(() => { const k = readInquiryDraft(id).kind; return k && INQUIRY_KINDS.includes(k) ? k : '하자·파손'; }), [question, setQuestion] = useState(() => readInquiryDraft(id).question ?? ''), [images, setImages] = useState<string[]>([]), [files, setFiles] = useState<File[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { try { if (question.trim()) sessionStorage.setItem(inquiryDraftKey(id), JSON.stringify({ kind, question })); else sessionStorage.removeItem(inquiryDraftKey(id)); } catch { /* 저장 차단: 화면 값만 유지 */ } }, [id, kind, question]);
  // 작성 중: 처음 연 값(이 창에 남아 있던 글 포함)과 유형이나 내용이 다르거나 사진을 붙였을 때. 글은 이 창에 남고 사진은 남지 않는다
  const [start] = useState({ kind, question });
  // 작성 중: 글, 사진, 처음과 다른 유형이 있으면(이 창에 남아 있던 글로 다시 열었어도) 묻는다. 나가기를 고르면 이 창에 남긴 글도 지운다(새로고침과 다시 열기는 이어 쓴다)
  const leave = useLeaveGuard(!!question.trim() || images.length > 0 || kind !== start.kind || kind !== '하자·파손', { onLeave: () => { try { sessionStorage.removeItem(inquiryDraftKey(id)); } catch { /* 저장 차단 */ } } });
  // 새로고침·알림 등으로 바로 들어오면 store에 주문이 없다: 주문을 불러와 주문 번호를 보여 준다(조회 모델 반영 지연·일시 실패는 자동 재시도)
  const known = !!order;
  const live = useLive(sig => known || !id ? Promise.resolve(null) : retryProjection(() => getOrder(id, getState().activeUserId, sig), sig).catch(e => { if (isApiError(e) && e.status === 404) return null; throw e; }), (st, d) => { if (d) mergeOrders(st, [d]); }, [id, user.id]);
  if (!order) return retryable(live) ? <LiveStatus state={live}/> : <Empty title="주문을 찾을 수 없어요"><Button to="/orders">주문 목록</Button></Empty>;
  const quantity = order.lines.reduce((n, l) => n + l.quantity, 0);
  const sent = () => { try { sessionStorage.removeItem(inquiryDraftKey(id)); } catch { /* 무시 */ } };
  async function attach(fl: FileList | null) { if (!fl?.length) return; try { if (images.length + fl.length > 5) throw new Error('사진은 최대 5장까지 첨부할 수 있어요.'); const added = await Promise.all([...fl].map(imageData)); setImages([...images, ...added]); setFiles([...files, ...fl]); } catch (e) { setError((e as Error).message); } }
  async function submit() {
    if (!question.trim()) { setError('문의 내용을 입력해 주세요.'); return; }
    setBusy(true);
    try {
      if (!USE_MOCK) { // 실제 API: 이미지 3단계 업로드 후 imageIds로 등록. 실패하면 올린 이미지를 폐기
        const uploaded: string[] = [];
        try {
          for (const f of files) uploaded.push(await uploadInquiryImage(order!.id, f));
          const q = await createOrderInquiry(order!.id, { category: kind, body: question.trim(), imageIds: uploaded }, user.id);
          mutate(st => mergeInquiries(st, [q]));
          sent(); toast('문의가 판매자에게 전달되었습니다.'); leave.allowLeave(); navigate(`/inquiries/${q.id}`, { replace: true }); return;
        } catch (e) { await Promise.all(uploaded.map(id => deleteInquiryImage(order!.id, id).catch(() => {}))); throw e; }
      }
      const inquiryId = uid('q-');
      mutate(st => { st.inquiries.unshift({ id: inquiryId, userId: st.activeUserId, sellerId: order!.sellerId, productId: order!.productId, orderId: order!.id, productName: `${order!.product.brand} · ${order!.product.name}`, quantity, kind, question: question.trim(), images, public: false, createdAt: nowOf(st) }); });
      sent(); toast('문의가 판매자에게 전달되었습니다.'); leave.allowLeave(); navigate(`/inquiries/${inquiryId}`, { replace: true });
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  const label = (text: string, hint: string) => <p className="mb-2.5 text-body font-bold">{text}<span className="ml-1.5 text-footnote font-normal text-meta">{hint}</span></p>;
  return <form className="space-y-7 pb-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
    <Header title="판매자에게 문의" bare/>
    <div className="-mt-2 flex items-center gap-3 rounded-element bg-soft p-3.5"><ProductImage src={photo(order.productId, order.product.image)} alt={order.product.name} className="h-12 w-12 shrink-0"/><div className="min-w-0 space-y-0.5"><p className="text-footnote font-bold text-meta">{order.product.brand}</p><p className="text-callout">{order.product.name} · {quantity}개</p><p className="text-label text-meta">주문번호 {order.id}</p></div></div>
    <div>{label('문의 유형', '· 필수')}<label className="relative block"><select aria-label="문의 유형" value={kind} onChange={e => setKind(e.target.value)} className="h-12 w-full appearance-none rounded-element border border-line bg-surface px-4 text-callout outline-none">{INQUIRY_KINDS.map(k => <option key={k}>{k}</option>)}</select><ChevronDown size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"/></label></div>
    <div>{label('문의 내용', '· 필수')}<div className="rounded-element border border-line p-4"><textarea aria-label="문의 내용" className="h-21 w-full resize-none bg-transparent text-callout leading-[1.7] outline-none" value={question} onChange={e => { setError(''); setQuestion(e.target.value.slice(0, 1000)); }}/><p className="text-right text-footnote text-meta">{question.length} / 1000</p></div></div>
    <div>{label('사진 첨부', '· 선택 · 최대 5장')}<div className="flex gap-2 overflow-x-auto"><label className="flex h-18 w-18 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-element border border-border"><Camera size={18}/><span className="text-footnote text-meta">{images.length}/5</span><input aria-label="사진 첨부" type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={images.length >= 5} onChange={e => { void attach(e.target.files); e.target.value = ''; }}/></label>{images.map((src, i) => <button type="button" key={i} aria-label={`사진 ${i + 1} 삭제`} onClick={() => { setImages(images.filter((_, j) => j !== i)); setFiles(files.filter((_, j) => j !== i)); }}><ProductImage src={src} alt={`첨부 사진 ${i + 1}`} className="h-18 w-18"/></button>)}</div><p className="mt-3 text-label text-meta">하자·오배송은 사진이 있으면 더 빠르게 처리돼요</p></div>
    <div className="flex gap-2 rounded-element bg-soft p-4"><Info size={15} className="mt-0.5 shrink-0 text-aux"/><p className="text-label leading-[1.5] text-aux">판매자는 영업일 기준 1일 안에 답변해요.<br/>2영업일 안에 답변이 없으면 StockDrop이<br/>직접 확인하고 연락드려요.</p></div>
    <ErrorBox message={error}/>
    <Button type="submit" className="w-full text-subhead!" disabled={busy}>문의 보내기</Button>
  </form>;
}

export function CalendarPage() {
  const s = useStore(), now = useClock();
  const [viewDate, setViewDate] = useState(() => new Date(now));
  const year = viewDate.getFullYear(), month = viewDate.getMonth();
  const monthStart = new Date(year, month, 1).getTime(), nextMonthStart = new Date(year, month + 1, 1).getTime();
  const live = useLive(signal => listProducts({ startsFrom: monthStart, startsTo: nextMonthStart, size: 100 }, signal), (state, r) => mergeProducts(state, r.items), [monthStart]);
  const published = s.products.filter(p => p.published);
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday-based
  const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
  const cells = Array.from({ length: totalCells }, (_, i) => {
    const d = i - startOffset + 1;
    return d >= 1 && d <= lastDay.getDate() ? d : null;
  });
  function hasSale(day: number) {
    const start = new Date(year, month, day).getTime();
    const end = start + 86_400_000;
    return published.some(p => p.startsAt >= start && p.startsAt < end);
  }
  function salesOnDay(day: number) {
    const start = new Date(year, month, day).getTime();
    const end = start + 86_400_000;
    return published.filter(p => p.startsAt >= start && p.startsAt < end);
  }
  const today = new Date(now);
  const isToday = (day: number) => day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  const [selected, setSelected] = useState<number | null>(null);
  const prevMonth = () => { setSelected(null); setViewDate(new Date(year, month - 1, 1)); };
  const nextMonth = () => { setSelected(null); setViewDate(new Date(year, month + 1, 1)); };
  const selectedSales = selected ? salesOnDay(selected) : [];
  return (
    <div className="space-y-4">
      <Header title="전체 일정" subtitle="판매 있는 날 · 오늘 · 이번 주 일정은 다음 주까지 공개돼요" back={true}/><LiveStatus state={live}/>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <button type="button" onClick={prevMonth} className="muted px-2 py-2 text-footnote">← 이전달</button>
          <b className="text-body">{year}년 {month + 1}월</b>
          <button type="button" onClick={nextMonth} className="muted px-2 py-2 text-footnote">다음달 →</button>
        </div>
        <div className="grid grid-cols-7 gap-0">
          {['월','화','수','목','금','토','일'].map(d => (
            <div key={d} className="py-2 text-center text-footnote font-semibold text-muted">{d}</div>
          ))}
          {cells.map((day, i) => (
            <button
              key={i}
              type="button"
              disabled={!day}
              onClick={() => day && setSelected(selected === day ? null : day)}
              className={`relative flex flex-col items-center py-2 text-label ${!day ? '' : 'hover:bg-blue-soft'} ${day && isToday(day) ? 'font-bold text-red' : ''} ${day && selected === day ? 'rounded bg-ink text-surface!' : ''}`}
            >
              {day && <span>{day}</span>}
              {day && hasSale(day) && (
                <span className={`mt-0.5 h-1 w-1 rounded-full ${selected === day ? 'bg-surface' : 'bg-ink'}`}/>
              )}
            </button>
          ))}
        </div>
      </div>
      {selected && (() => {
        const dayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
        const selDate = new Date(year, month, selected);
        const firstOpen = selectedSales.length ? new Date(Math.min(...selectedSales.map(p => p.startsAt))).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : null;
        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between py-1">
              <h2 className="text-callout font-bold">{month + 1}월 {selected}일 {dayNames[selDate.getDay()]}</h2>
              {selectedSales.length > 0 && <span className="muted text-footnote">판매 {selectedSales.length}개 · 첫 오픈 {firstOpen}</span>}
            </div>
            {selectedSales.length ? selectedSales.sort((a, b) => a.startsAt - b.startsAt).map(p => (
              <Link key={p.id} to={`/product/${p.id}`} className="divider flex items-center gap-3 py-3">
                <Calendar size={16} className="muted shrink-0"/>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="rounded bg-blue-soft px-1.5 py-0.5 text-caption font-semibold">오픈 예정</span>
                    <span className="muted text-caption">{new Date(p.startsAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })} 오픈</span>
                  </div>
                  <p className="text-label font-semibold">{p.brand}</p>
                  <p className="muted text-footnote">{p.name}</p>
                </div>
                <ChevronRight size={16} className="muted shrink-0"/>
              </Link>
            )) : <p className="muted text-label">이 날에 예정된 판매가 없어요.</p>}
          </div>
        );
      })()}
      <p className="muted text-caption">판매 상품 확인하기 버튼을 눌러 상세 일정을 확인하세요.</p>
    </div>
  );
}

interface Notification { id: string; type: '구매' | '상품' | '맞춤 추천' | '판매'; title: string; desc: string; time: string; read?: boolean; path?: string }

const NOTIFICATION_PAGE = 50;
/** onClose가 있으면 홈의 오른쪽 패널(Drawer) 안: 제목은 패널이 그린다. 알림을 누르면 그 화면으로 이동하고, 뒤로 오면 패널로 돌아온다 */
export function NotificationsPage({ onClose }: { onClose?: () => void } = {}) {
  const s = useStore(), now = useClock();
  const [tab, setTab] = useState<'전체' | '구매' | '상품' | '판매'>('전체');
  const tabs = activeUser(s).seller ? (['전체', '구매', '상품', '판매'] as const) : (['전체', '구매', '상품'] as const);
  const navigate = useNavigate(), toast = useToast();
  // 실제 모드: 서버 알림함 (mock 모드는 호출 없이 빈 목록 → 아래 목업을 쓴다)
  // 알림은 계속 쌓이므로 전체를 한 번에 읽지 않고 50건씩 '더 보기'로 이어 읽는다(서버 목록에는 totalPages가 없어 꽉 찬 페이지면 다음이 있다고 본다)
  const inbox = useApi(signal => (USE_MOCK ? Promise.resolve([] as InboxItem[]) : listNotifications(0, NOTIFICATION_PAGE, signal)), [s.activeUserId]);
  const [more, setMore] = useState<{ items: InboxItem[]; next: number; hasMore?: boolean; busy: boolean }>({ items: [], next: 1, busy: false });
  const loaded = [...(inbox.data ?? []), ...more.items];
  const canLoadMore = !USE_MOCK && !inbox.loading && !inbox.error && (more.hasMore ?? (inbox.data?.length ?? 0) >= NOTIFICATION_PAGE);
  async function loadMore() {
    if (more.busy) return;
    setMore(m => ({ ...m, busy: true }));
    try {
      const page = await listNotifications(more.next, NOTIFICATION_PAGE);
      setMore(m => ({ items: [...m.items, ...page.filter(n => !loaded.some(x => x.id === n.id))], next: m.next + 1, hasMore: page.length >= NOTIFICATION_PAGE, busy: false }));
    } catch (e) { setMore(m => ({ ...m, busy: false })); toast(errorMessage(e)); }
  }
  const [readIds, setReadIds] = useState<string[]>([]);
  const open = (n: Notification) => { if (!n.read) { setReadIds(r => [...r, n.id]); markNotificationRead(n.id).catch(() => {}); } if (n.path) navigate(n.path); };
  const readAll = () => markAllNotificationsRead().then(() => setReadIds(loaded.map(n => n.id))).catch(e => toast(errorMessage(e)));

  const userOrders = s.orders.filter(o => o.userId === s.activeUserId);
  const [alertIds] = useNotified(); // mock 알림: 알림 받기를 누른 상품
  const alertProducts = s.products.filter(p => alertIds.includes(p.id) && p.published);

  const raw: Array<{ id: string; type: '구매' | '상품' | '맞춤 추천'; title: string; desc: string; ts: number }> = [
    ...userOrders.flatMap(o => {
      if (o.status === 'delivered' && o.deliveredAt)
        return [{ id: `o-${o.id}-d`, type: '구매' as const, title: '배송 완료', desc: `${o.product.name} 배송이 완료되었어요.`, ts: o.deliveredAt }];
      if (o.status === 'shipping' && o.shippedAt)
        return [{ id: `o-${o.id}-s`, type: '구매' as const, title: '배송 시작', desc: `${o.product.name}이 출고되었어요.`, ts: o.shippedAt }];
      return [{ id: `o-${o.id}-p`, type: '구매' as const, title: '구매 확정', desc: `${o.product.name} 주문이 확정되었습니다.`, ts: o.createdAt }];
    }),
    ...alertProducts.flatMap(p => {
      const state = saleState(p, now);
      const avail = p.options.reduce((n, o) => n + available(s, p, o.id, now), 0);
      const total = p.options.reduce((n, o) => n + o.stock, 0);
      const items: typeof raw = [];
      if (state === '판매 중') {
        items.push({ id: `b-${p.id}-on`, type: '상품', title: '판매 시작', desc: `알림 받기한 상품 '${p.name}'의 판매가 막 시작됐어요.`, ts: p.startsAt });
        if (avail > 0 && avail <= Math.ceil(total * 0.3))
          items.push({ id: `b-${p.id}-low`, type: '상품', title: '재고 임박', desc: `관심 상품의 재고가 얼마 남지 않았어요. 지금 확인해보세요.`, ts: p.startsAt + 60_000 });
      }
      if (state === '판매 예정')
        items.push({ id: `b-${p.id}-up`, type: '맞춤 추천', title: '맞춤 추천', desc: `회원님이 좋아할 것 같은 ${p.name}이 판매 중이에요.`, ts: p.startsAt - 3_600_000 });
      return items;
    }),
  ].sort((a, b) => b.ts - a.ts);

  const notifications: Notification[] = USE_MOCK ? raw.map(n => ({ ...n, time: dateTime(n.ts) })) : [...loaded].sort((a, b) => b.ts - a.ts).map(n => ({ id: n.id, type: n.kind, title: n.title, desc: n.desc, time: dateTime(n.ts), read: n.read || readIds.includes(n.id), path: notificationPath(n) }));
  const filtered = tab === '전체' ? notifications : notifications.filter(n => n.type === tab || (tab === '상품' && n.type === '맞춤 추천'));

  return (
    <div className="space-y-4">
      {!onClose && <Header title="알림" back={true}/>}
      <div className={`divider flex pb-2 gap-5`}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`border-b-2 py-2 text-label ${tab === t ? 'border-ink font-bold' : 'muted border-transparent'}`}>{t}</button>
        ))}
      </div>
      {!USE_MOCK && <LiveStatus state={inbox}/>}
      {!USE_MOCK && notifications.some(n => n.read === false) && <button className="muted text-footnote underline" onClick={readAll}>모두 읽음</button>}
      {filtered.length ? filtered.map(n => (
        <article key={n.id} className={`divider py-4 space-y-1 ${n.path ? 'cursor-pointer' : ''}`} {...(n.path ? { role: 'button', tabIndex: 0, onClick: () => open(n), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') open(n); } } : {})}>
          <div className="flex items-center justify-between">
            <span className={`rounded px-2 py-0.5 text-caption font-semibold ${n.type === '맞춤 추천' ? 'bg-[var(--green-soft,#EEF8F3)] text-green' : 'bg-blue-soft'}`}>{n.type}</span>
            <span className="muted text-caption">{n.time}</span>
          </div>
          <p className={`text-body ${n.read === false ? 'font-bold' : 'font-semibold'}`}>{n.title}{n.read === false && <span className="ml-1 text-red">·</span>}</p>
          <p className="muted text-label leading-relaxed">{n.desc}</p>
        </article>
      )) : !USE_MOCK && inbox.loading ? null : (
        <Empty title="새로운 알림이 없어요" message="상품 상세에서 알림 받기를 누르면 판매 소식을 알려드려요."/>
      )}
      {canLoadMore && <Button outline className="w-full" disabled={more.busy} onClick={loadMore}>{more.busy ? '불러오는 중…' : '알림 더 보기'}</Button>}
    </div>
  );
}
