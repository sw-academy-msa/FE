import { SellerBankSettingsPage } from './sellerBank';
import { Card as AxCard } from '@astryxdesign/core/Card';
import { SellerStatusTabs } from '../components/SellerStatusTabs';
import { SellerMonthlySales } from '../components/SellerMonthlySales';
import { salesGauge, sellerMonth } from '../sellerMetrics';
import { LogoutButton, SETTINGS_HREF } from './auth';
import { FaqList, SELLER_FAQ_ITEMS } from './account';
import { BankField } from '../components/BankField';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, ChevronRight, FileText, Info, Rocket, ScanSearch, Share2, Truck } from 'lucide-react';
import { activeUser, feeFor, formatPhone, markDelivered, maskName, money, nowOf, orderNo, parseRejection, saleState, salesSoldOut, uid } from '../domain';
import type { Order, Product, SellerSettings } from '../domain';
import { atomic, mutate, useStore } from '../store';
import { endSession } from '../auth';
import { addBusinessDays, dateTime, kstDay, kstShort, kstSlot, openDay, useClock } from '../hooks';
import { Badge, Button, clockLeft, CopyButton, copyText, Toggle, Empty, ErrorBox, Field, Header, InfoRow, LiveStatus, MenuRow, Modal, Note, ORDER_LABELS, ProductImage, ProductSummary, Unavailable, useLeaveGuard, useToast } from '../components/ui';
import { PdfField } from '../components/PdfField';
import { AddressBookFormPage, AddressBookPage } from './sellerAddresses';
import { SalesRestrictionBanner } from './sellerReview';
import type { ProductRevisionDto } from '../api';
import { getSellerSettlement, settlementNet, getProductDispatchAddress, answerOrderInquiry, listSellerOrderInquiries, answerProductInquiry, deleteSellerLogo, deliverOrder, errorMessage, getSalesSummary, getSellerOrder, getSellerInquiryImageUrl, getSellerOrderInquiry, getSellerOrderSummary, getSellerProduct, getSellerProductWithImages, listRevisions, listSellerOrderInquiryInbox, listSellerOrders, listSellerProductInquiries, listSellerProducts, mergeInquiries, mergeOrders, mergeProducts, shipOrder, useLive, fetchSellerLogo, fetchSellerMe, fetchSellerStore, fetchWithdrawalEligibility, updateSellerAddresses, updateSellerContact, updateSellerStore, uploadSellerLogo, useApi, withdrawAccount } from '../api';
import { api, deleteProductDraft } from '../api';
import { productSettlement } from '../api/sellerOrders';
import { USE_MOCK } from '../config';
import { useProductPhotos } from '../productPhotos';
import { retryable } from '../api/live';
import { MembershipCouponSection } from './membershipCoupon';
const hm = (t: number) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
const md = (t: number) => { const d = new Date(t); return `${d.getMonth() + 1}.${d.getDate()} (${'일월화수목금토'[d.getDay()]})`; };
export function SellerSalesPage() {
  const s = useStore(), user = activeUser(s), now = useClock(), month = sellerMonth(now);
  const live = useLive(async signal => user.seller ? listSellerProducts(user.id, {}, signal) : null, (st, rows) => { if (rows) mergeProducts(st, rows); }, [user.id]);
  const orders = useApi(async signal => USE_MOCK || !user.seller ? null : getSellerOrderSummary({}, signal), [user.id]);
  if (!user.seller) return <Unavailable/>;
  const mine = s.products.filter(p => p.sellerId === user.id && p.reviewStatus !== 'DRAFT');
  const ownOrders = s.orders.filter(o => o.sellerId === user.id);
  return <div className="space-y-5">
    <Header title="판매 현황" backTo="/my"/>
    <LiveStatus state={live}/>
    <SellerMonthlySales key={user.id} sellerId={user.id} month={month} products={mine} orders={ownOrders} now={now}/>
    <section className="space-y-3"><h2 className="text-subhead font-bold">주문 처리</h2><div className="grid grid-cols-3 gap-2">{([['배송준비', 'preparingOrders', 'preparing'], ['배송중', 'shippingOrders', 'shipping'], ['배송완료', 'deliveredOrders', 'delivered']] as const).map(([label, key, status]) => <Link key={key} to={`/seller/orders?state=${status}`} className="min-h-11 rounded-element bg-canvas p-3 text-center"><p className="font-number text-title font-bold">{USE_MOCK ? ownOrders.filter(o => o.status === status).length : orders.data?.[key] ?? '-'}</p><p className="muted text-label">{label}</p></Link>)}</div>{!USE_MOCK && <LiveStatus state={orders}/>}</section>
  </div>;
}
export function SellerProductsPage() {
  const s = useStore(), user = activeUser(s), now = useClock(); const [params, setParams] = useSearchParams(); const tab = params.get('state') ?? '전체';
  const [deleting, setDeleting] = useState<string | null>(null), [deleteBusy, setDeleteBusy] = useState(false), [deleteError, setDeleteError] = useState('');
  async function removeDraft() {
    if (!deleting || deleteBusy) return; setDeleteBusy(true); setDeleteError('');
    try { if (!USE_MOCK) await deleteProductDraft(deleting); mutate(st => { st.products = st.products.filter(p => p.id !== deleting); const d = st.drafts[user.id]; if (d?.editingId === deleting || d?.serverId === deleting) delete st.drafts[user.id]; }); setDeleting(null); }
    catch (e) { setDeleteError(errorMessage(e)); } finally { setDeleteBusy(false); }
  }
  const live = useLive(async signal => listSellerProducts(user.id, {}, signal), (st, items) => mergeProducts(st, items), [user.id]);
  const editable = s.products.filter(p => p.sellerId === user.id && p.reviewStatus === 'APPROVED' && p.startsAt > now).map(p => p.id).join(',');
  const revStatus = useApi(async signal => {
    if (USE_MOCK || !editable) return {} as Record<string, ProductRevisionDto>;
    const rows = await Promise.all(editable.split(',').map(async id => [id, (await listRevisions(id, signal).catch(() => [] as ProductRevisionDto[])).sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt))[0]] as const));
    return Object.fromEntries(rows.filter(([, r]) => r));
  }, [editable]);
  if (!user.seller) return <Unavailable/>;
  const products = s.products.filter(p => p.sellerId === user.id && (tab === '전체' || (tab === '판매 심사 중' ? p.reviewStatus === 'IN_REVIEW' : saleState(p, now) === tab)));
  const tabs = ['전체', '판매 중', '판매 예정', '판매 심사 중', '판매 종료'].map(value => ({ value, label: value.replaceAll(' ', '') }));
  return <div>
    <Header title="판매 상품 관리" backTo="/my"/>
    {deleting && <Modal title="작성 중인 상품을 삭제할까요? 되돌릴 수 없어요" onClose={() => { if (!deleteBusy) setDeleting(null); }}><ErrorBox message={deleteError}/><div className="flex gap-2"><Button outline className="min-h-11 flex-1" disabled={deleteBusy} onClick={() => setDeleting(null)}>취소</Button><Button className="min-h-11 flex-1" disabled={deleteBusy} onClick={() => void removeDraft()}>삭제</Button></div></Modal>}
    <SellerStatusTabs label="판매 상품 상태" tabs={tabs} value={tab} onChange={value => setParams(value === '전체' ? {} : { state: value }, { replace: true })}/>
    <LiveStatus state={live}/>
    <div className="space-y-2">{products.map(p => {
      const status = saleState(p, now), draft = p.reviewStatus === 'DRAFT', review = p.reviewStatus === 'IN_REVIEW', rejected = p.reviewStatus === 'REJECTED';
      const localSold = s.orders.filter(o => o.productId === p.id && !['cancelled','refunded'].includes(o.status)).reduce((n, o) => n + o.lines.reduce((a, l) => a + l.quantity, 0), 0);
      const { total, sold } = p.listQuantity ?? { total: p.options.reduce((n, o) => n + o.stock, 0), sold: localSold };
      const gauge = salesGauge(sold, total), soldOut = total > 0 && sold >= total;
      const onSale = status === '판매 중', ended = status === '판매 종료' || soldOut;
      const label = draft ? '작성 중' : review ? '판매심사중' : rejected ? '판매 심사 반려' : soldOut ? '완판' : status;
      const to = draft || status === '판매 예정' ? `/seller/new?edit=${p.id}` : review || rejected ? `/seller/published/${p.id}` : `/seller/product/${p.id}`;
      return <AxCard key={p.id} padding={2} variant="default" className="seller-product-card rounded-dialog">
        <Link to={to} aria-label={`${p.name} ${draft ? '이어서 등록' : review ? '심사 상태 보기' : rejected ? '반려 사유와 수정' : status === '판매 예정' ? '판매 정보 수정' : '판매 결과 보기'}`} className="block min-h-11 space-y-2 rounded-inner outline-offset-2 focus-visible:outline-2 focus-visible:outline-green">
          <div className="flex items-center gap-2"><ProductImage src={p.images[0]} alt={p.name} className="h-16 w-14 shrink-0"/><div className="min-w-0 flex-1 space-y-1"><div className="flex flex-wrap items-center gap-1"><span className={`w-fit rounded-badge px-2 py-1 text-footnote font-bold ${review ? 'bg-warning-soft text-warning' : rejected ? 'bg-red-soft text-red' : onSale && !soldOut ? 'bg-positive-soft text-positive' : 'bg-soft text-muted'}`}>{label}</span>{revStatus.data?.[p.id]?.status === 'IN_REVIEW' && <span className="text-footnote text-warning">수정 심사 중</span>}{revStatus.data?.[p.id]?.status === 'REJECTED' && <span className="text-footnote text-red">수정 반려</span>}</div><p className="break-words text-callout font-semibold">{p.name}</p><p className="font-number text-subhead font-bold">{money(p.price)} <span className="muted text-label font-normal">{total}개 한정</span></p></div><ChevronRight className="h-4 w-4 shrink-0 text-muted"/></div>
          {(onSale || ended) && !draft && !review && !rejected && <><p className="text-label font-bold">{sold} / {total}개 판매</p><div aria-label="판매율" role="progressbar" aria-valuenow={Math.round(gauge.ratio * 100)} aria-valuemin={0} aria-valuemax={100} aria-valuetext={total > 0 ? `${sold} / ${total}개 판매` : '한정 수량 미집계'} className="h-1 rounded-full bg-line"><div className={`h-full rounded-full ${gauge.color}`} style={{ width: `${gauge.ratio * 100}%` }}/></div></>}
          {onSale && !soldOut && <p className="muted text-footnote">{clockLeft(p.endsAt - now)} 남음</p>}
          {status === '판매 예정' && <p className="muted text-label">{openDay(p.startsAt, now)}</p>}
          {draft && <p className="muted text-label">이어서 등록</p>}
          {review && <p className="muted text-label">심사 진행 상태 확인</p>}
        </Link>
        {draft && <div className="mt-1 flex justify-end"><button type="button" className="min-h-11 min-w-11 text-body font-bold text-red" aria-label={`${p.name} 초안 삭제`} onClick={() => { setDeleteError(''); setDeleting(p.id); }}>삭제</button></div>}
      </AxCard>;
    })}</div>
    {!products.length && !live.loading && !live.error && <div className="flex min-h-[60dvh] items-center justify-center"><Empty title={tab === '전체' || tab === '판매 중' ? '판매 중 상품이 없어요' : `${tab} 상품이 없어요`}/></div>}
  </div>;
}
/** 서버 심사 status → 목록 배지 (승인은 판매 예정·판매 중·판매 종료로 보인다) */
const REVIEW_LABEL: Record<NonNullable<Product['reviewStatus']>, string> = { DRAFT: '작성 중', IN_REVIEW: '판매 심사 중', REJECTED: '판매 심사 반려', APPROVED: '승인' };
export function SellerProductPage() {
  const { id } = useParams(); const s = useStore(), user = activeUser(s), now = useClock(), location = useLocation(), navigate = useNavigate(), toast = useToast(); const p = s.products.find(p => p.id === id && (!USE_MOCK || p.sellerId === user.id));
  // 실제 모드: 편집 원본·이미지, 이 상품의 주문, 주문 집계, 수정 심사 이력을 서버에서 받는다(mock은 store 목업 그대로)
  const live = useLive(async signal => (id && user.seller ? { prod: await getSellerProductWithImages(id, signal), orders: await listSellerOrders(user.id, { productId: id }, signal) } : null), (st, r) => { if (!r) return; mergeProducts(st, [r.prod]); mergeOrders(st, r.orders); }, [id]);
  const sum = useApi(async signal => (USE_MOCK || !id || !user.seller ? null : getSellerOrderSummary({ productId: id }, signal)), [id]);
  const revs = useApi(async signal => (USE_MOCK || !id || !user.seller ? null : listRevisions(id, signal)), [id]);
  const month = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(now);
  const settle = useApi(async signal => {
    if (USE_MOCK || !id || !user.seller) return null;
    const [amounts, product] = await Promise.all([getSellerSettlement(month, signal), getSellerProduct(id, signal)]);
    return { amounts, product };
  }, [id, user.id, month]);
  if (!user.seller) return <Unavailable/>;
  if (!p) return retryable(live) ? <LiveStatus state={live}/> : <Unavailable/>;
  const rev = [...(revs.data ?? [])].sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt))[0];
  // 실제 모드: 심사 중·반려 상품은 (알림에서 /seller/product/:id로 들어와도) 심사 결과 화면을 보여 준다
  const status = saleState(p, now), fee = feeFor(s, p), published = location.pathname.includes('/published/') || (!USE_MOCK && (p.reviewStatus === 'IN_REVIEW' || p.reviewStatus === 'REJECTED'));
  const productOrders = s.orders.filter(o => o.productId === p.id && !['cancelled','refunded'].includes(o.status));
  const quantity = settle.data?.product.id === p.id ? settle.data.product.listQuantity : p.listQuantity;
  const totalSold = quantity?.sold ?? sum.data?.confirmedQuantity ?? fee.sold;
  const totalStock = quantity?.total ?? p.live?.initial ?? p.options.reduce((n, o) => n + o.stock, 0);
  const result = USE_MOCK ? { gross: fee.revenue, fee: fee.fee, net: fee.net, rate: fee.initial > 0 && fee.sold * 10 > fee.initial * 9 ? 10 : 0 }
    : settle.data?.product.id === p.id && !settle.loading && !settle.error ? productSettlement(settle.data.amounts, p.id, { total: totalStock, sold: totalSold }) : undefined;
  const resultMoney = (amount: number | undefined) => amount === undefined ? '-' : money(amount);

  // 심사 대기 / 심사 승인 / 심사 반려
  if (published) {
    const approved = USE_MOCK ? !!p.published : p.reviewStatus === 'APPROVED';
    const rejected = USE_MOCK ? !p.published && !!p.rejectionReason : p.reviewStatus === 'REJECTED';
    const dDay = Math.max(0, Math.ceil((p.startsAt - now) / 86_400_000));
    const steps = ['요청 완료', '판매 심사', '판매 예정', '판매 시작'];
    const filled = approved ? 3 : 1;

    // 심사 반려
    if (rejected) {
      // 물품 검수는 판매 심사에 포함 — 검수 미통과 항목도 반려 사유 안에서 '물품 확인'으로 묶어 보여 준다. 서버는 사유 텍스트만 준다
      const MOCK_REJECTION = '[한정 판매가] 쿠팡 판매가가 45,900원으로 내려갔어요. 한정 판매가는 URL 판매가보다 낮아야 해요.\n[물품 확인 · 상품 상태] 등록 사진과 달리 외박스 모서리에 찍힘이 있어요.';
      const rejectionReasons = parseRejection(p.rejectionReason || (USE_MOCK ? MOCK_REJECTION : '반려 사유가 등록되지 않았어요.'));
      const saleItems = rejectionReasons.filter(r => !r.inspection), checkItems = rejectionReasons.filter(r => r.inspection);
      const card = (r: { field: string; reason: string }, i: number) => <div key={i} className="rounded-element border border-line p-4 space-y-3"><div className="flex items-center gap-3"><span className="muted text-body font-bold">{String(i + 1).padStart(2, '0')}</span><span className="text-subhead font-bold">{r.field}</span></div><p className="text-body text-aux whitespace-pre-line">{r.reason}</p></div>;
      return <div className="space-y-5">
        <div className="flex items-center justify-between pt-1">
          <h1 className="text-title font-bold">판매 심사 결과</h1>
          <button onClick={() => navigate('/seller/products')} aria-label="닫기" className="p-1"><svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M17 5L5 17M5 5l12 12" stroke="#222" strokeWidth="1.8" strokeLinecap="round"/></svg></button>
        </div>
        <div className="relative overflow-hidden rounded-dialog">
          <ProductImage src={p.images[0]} alt={p.name} className="h-[180px] w-full object-cover"/>
          <div className="absolute inset-0 flex flex-col items-center justify-end bg-black/65 pb-6 text-white">
            <div className="mb-3 flex h-13.5 w-13.5 items-center justify-center rounded-full border border-red/80"><svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M15 7L7 15M7 7l8 8" stroke="#EF6253" strokeWidth="2" strokeLinecap="round"/></svg></div>
            <p className="text-title-lg font-bold">판매 심사 반려</p>
            <p className="mt-1 text-body text-white/80">{p.brand} {p.name}</p>
          </div>
        </div>
        <div className="space-y-1">
          <h2 className="text-heading font-bold">{rejectionReasons.length}개 항목을</h2>
          <h2 className="text-heading font-bold">확인해 주세요</h2>
          <p className="mt-2 text-body text-aux">입력한 내용은 그대로 저장돼 있어요.</p>
          <p className="text-body text-aux">아래 항목만 고치면 바로 다시 요청할 수 있어요.</p>
        </div>
        <div className="space-y-3">
          {saleItems.map(card)}
          {checkItems.length > 0 && <><div className="flex items-center justify-between pt-2"><h3 className="text-subhead font-bold">물품 확인</h3><span className="rounded-inner bg-[#FDEFED] px-2 py-0.5 text-footnote font-bold text-urgent">{checkItems.length}개 항목 미통과</span></div><p className="text-label text-aux">운영팀이 상품 상태·구성품 등을 직접 확인한 결과예요.</p>{checkItems.map((r, i) => card(r, saleItems.length + i))}</>}
        </div>
        <div className="flex gap-2"><Button outline className="flex-1" onClick={() => navigate('/seller')}>나중에 하기</Button><Button className="flex-1" onClick={() => navigate(`/seller/new?edit=${p.id}`)}>수정하고 다시 요청</Button></div>
      </div>;
    }

    return <div className="space-y-5">
      <div className="flex items-center justify-between pt-1">
        <h1 className="text-title font-bold">판매 심사 결과</h1>
        <button onClick={() => navigate('/seller/products')} aria-label="닫기" className="p-1"><svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M17 5L5 17M5 5l12 12" stroke="#222" strokeWidth="1.8" strokeLinecap="round"/></svg></button>
      </div>
      <div className="relative overflow-hidden rounded-dialog">
        <ProductImage src={p.images[0]} alt={p.name} className="h-[220px] w-full object-cover"/>
        <div className="absolute inset-0 flex flex-col items-center justify-end bg-black/60 pb-6 text-white">
          <p className="text-title-lg font-bold">{approved ? '판매 승인 완료' : '판매 심사 중'}</p>
          <p className="mt-1 text-body text-white/80">{p.brand} {p.name}</p>
        </div>
      </div>
      <div className="space-y-1">
        <h2 className="text-heading font-bold">{approved ? '축하해요!' : '판매 심사를'}</h2>
        <h2 className="text-heading font-bold">{approved ? '판매가 승인됐어요' : '요청했어요'}</h2>
        <p className="mt-2 text-body text-aux">{approved ? (USE_MOCK ? `11월 3일 (화) 21:00부터 3시간 동안 판매가 열려요.` : p.startsAt ? `${kstSlot(p.startsAt)}부터 3시간 동안 판매가 열려요.` : '판매 일정에 맞춰 열려요.') : '영업일 기준 1일 안에 결과를 알림으로 알려드려요.'}</p>
        {approved && <p className="text-body text-aux">판매 30분 전에 알림으로 한 번 더 알려드릴게요.</p>}
        {!approved && <p className="text-body text-aux">승인되면 판매 일정에 맞춰 자동으로 오픈돼요.</p>}
      </div>
      <div className="flex justify-around border-t border-b border-line py-5">
        {(USE_MOCK ? [approved ? [`D-${dDay}`, '판매 시작까지'] : ['11.3 21:00', '판매 시작'], ['50개', '한정 수량'], [money(p.price), '한정 판매가']] : [approved ? [`D-${dDay}`, '판매 시작까지'] : [p.startsAt ? kstShort(p.startsAt) : '-', '판매 시작'], [`${totalStock}개`, '한정 수량'], [money(p.price), '한정 판매가']] as [string, string][]).map(([val, lbl]) => <div key={lbl} className="text-center"><p className="text-headline font-bold">{val}</p><p className="muted mt-1 text-footnote">{lbl}</p></div>)}
      </div>
      <div>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-headline font-bold">진행 현황</h2><span className="text-label font-bold text-aux">{USE_MOCK ? (approved ? `11월 3일 (화) 21:00 오픈` : `10월 26일 (월) 결과 안내`) : approved && p.startsAt ? `${kstSlot(p.startsAt)} 오픈` : ''}</span></div>
        <div className="rounded-element bg-soft px-6 py-5">
          <div className="flex items-start justify-between">
            {steps.map((step, i) => {
              const done = i < filled;
              return <div key={step} className="flex flex-col items-center gap-2" style={{flex:1}}>
                <div className={`h-3 w-3 rounded-full border-2 ${done ? 'border-ink bg-ink' : 'border-border bg-soft'}`}/>
                <p className={`text-center text-footnote ${done ? 'font-bold' : 'text-meta'}`}>{step}</p>
              </div>;
            })}
          </div>
        </div>
      </div>
      {approved && <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-headline font-bold">구매자에게 이렇게 보여요</h2><Link to={`/product/${p.id}`} className="muted flex items-center text-label">미리보기<ChevronRight size={14}/></Link></div>
        <div className="flex gap-3 rounded-element border border-line p-3">
          <ProductImage src={p.images[0]} alt={p.name} className="h-18 w-18 shrink-0 rounded-inner"/>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="muted text-footnote font-bold">{md(p.startsAt).split(' ')[0]} {hm(p.startsAt)} 오픈 · {totalStock}개 한정</p>
            <p className="truncate text-callout">{p.name}</p>
            <p className="font-number text-headline font-bold">{p.reference?.price && p.reference.price > p.price && <span className="mr-1.5 text-green">{Math.round((1 - p.price / p.reference.price) * 100)}%</span>}{money(p.price)}</p>
            {p.reference?.price && p.reference.price > p.price && <p className="muted text-footnote">{p.reference.platform} {money(p.reference.price)}보다 {money(p.reference.price - p.price)} 저렴</p>}
          </div>
        </div>
      </section>}
      <div className="flex gap-2 pt-4"><Button outline to="/seller" className="flex-1">홈</Button><Button to="/seller/products" className="flex-[1.6]">판매 상품 관리</Button></div>
    </div>;
  }

  // 판매자 실시간 판매 현황
  if (status === '판매 중') {
    const secondsLeft = Math.max(0, Math.floor((p.endsAt - now) / 1000));
    const hh = String(Math.floor(secondsLeft/3600)).padStart(2,'0'), mm = String(Math.floor(secondsLeft%3600/60)).padStart(2,'0'), ss = String(secondsLeft%60).padStart(2,'0');
    const recentOrders = productOrders.slice().sort((a,b) => b.createdAt - a.createdAt).slice(0, 10);
    const alarmCount = 226;
    // 판매 종료 시간 전이라도 한정 수량이 모두 결제 확정되면 완판: 카운트다운을 멈추고 진행 중처럼 보이지 않게 한다(결제 대기 수량은 만료되면 돌아오므로 완판으로 보지 않는다)
    const soldOut = salesSoldOut(p.listQuantity) || salesSoldOut({ total: totalStock, sold: totalSold }); // 다시 받은 상품 수량(p)도 본다: 정산 응답은 화면 진입 때 한 번만 받는다
    const endTime = new Date(p.endsAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false});
    return <div className="space-y-5">
      <Header title="판매 현황" action={<button aria-label="상품 링크 공유" onClick={() => copyText(`${window.location.origin}${window.location.pathname}#/product/${p.id}`).then(() => toast('상품 링크를 복사했습니다.')).catch(e => toast(e.message))}><Share2 size={20}/></button>}/>
      <div className="flex items-center gap-3">
        <div className="shrink-0 rounded-inner" style={soldOut ? undefined : {outline:'2px solid #E5484D', outlineOffset:'2px'}}><ProductImage src={p.images[0]} alt={p.name} className="h-14 w-14"/></div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            {soldOut ? <><span className="rounded-badge bg-ink px-2 py-0.5 text-footnote font-bold text-white">완판</span><span className="muted text-footnote font-bold">{endTime} 종료 예정이었어요</span></>
              : <><span className="inline-flex items-center gap-1.5 rounded-badge bg-urgent px-2 py-0.5 text-footnote font-bold text-white"><span className="inline-block h-2 w-2 rounded-full bg-white/40"/><span className="inline-block h-1.5 w-1.5 -ml-2 rounded-full bg-white"/><span>LIVE</span></span>
            <span className="text-footnote font-bold text-urgent">판매 중 · {endTime} 종료</span></>}
          </div>
          <p className="text-callout">{p.name}</p>
          <p className="font-number text-subhead font-bold">{money(p.price)} <span className="muted text-label font-normal">{totalStock}개 한정</span></p>
        </div>
      </div>
      <div className="rounded-dialog bg-soft p-5">
        {soldOut ? <div role="status" className="text-center">
          <p className="text-heading font-bold">완판됐어요</p>
          <p className="mt-1 text-label text-meta">{p.soldOutAt ? `${hm(p.soldOutAt)}에 마지막 수량이 판매됐어요` : `${endTime} 종료 전에 한정 수량이 모두 판매됐어요`}</p>
        </div> : <>
        <p className="text-center text-label text-aux">판매 종료까지</p>
        <div className="mt-2 flex items-baseline justify-center gap-1">
          {([[hh,'시간'],[mm,'분'],[ss,'초']] as [string,string][]).map(([v,u],i) => <span key={u} className="flex items-baseline gap-0.5">{i>0&&<span className="font-number text-display font-bold text-border mx-1">:</span>}<span className="font-number text-display-lg font-bold">{v}</span><span className="muted text-caption">{u}</span></span>)}
        </div>
        <p className="mt-1 text-center text-label text-meta">오늘 {endTime} 종료</p></>}
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex items-baseline justify-between"><span className="font-number text-display font-bold">{totalSold}</span><span className="ml-2 text-callout font-bold text-aux">/ {totalStock}개 판매</span><span className="ml-auto text-callout font-bold text-positive">{totalStock > 0 ? Math.round(totalSold/totalStock*100) : 0}%</span></div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border"><div className="h-2 rounded-full bg-ink" style={{width: totalStock > 0 ? `${(totalSold/totalStock)*100}%` : '0%'}}/></div>
          <div className="mt-2 flex justify-between text-label"><span className="font-bold">남은 수량 {Math.max(0, totalStock - totalSold)}개</span><span className="muted">방금 업데이트</span></div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {([['결제 완료', `${totalSold}건`], ...(USE_MOCK ? [['결제 진행 중', '3명'], ['알림 신청', `${alarmCount}명`]] : [])] as [string,string][]).map(([lbl,val]) => <div key={lbl} className="rounded-element border border-line p-3"><p className="muted text-footnote">{lbl}</p><p className="font-number mt-2 text-headline font-bold">{val}</p></div>)}
      </div>
      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-subhead font-bold">실시간 주문</h2><Link to={`/seller/orders?product=${p.id}`} className="muted text-label">전체 {totalSold}건 ›</Link></div>
        {recentOrders.map(o => {
          const mask = (n: string) => n.replace(/^(.)(.)(.)$/, '$1*$3').replace(/^(.).+(.)$/, (_,a,z) => `${a}*${z}`);
          const t = new Date(o.createdAt); const tStr = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}:${String(t.getSeconds()).padStart(2,'0')}`;
          return <div key={o.id} className="divider flex items-center justify-between py-3 text-label">
            <span className="muted w-15 shrink-0">{tStr}</span>
            <span className="font-bold text-body">{mask(o.address.name)}</span>
            <span className="muted">{o.lines.map(l=>l.name).join(' · ')}</span>
            <span className="font-bold text-positive">결제 완료</span>
          </div>;
        })}
        {!recentOrders.length && <Empty title="아직 주문이 없어요"/>}
      </section>
      {!USE_MOCK && <Button outline className="w-full" to={`/seller/product/${p.id}/faqs`}>FAQ 수정</Button>}
      <div className="space-y-1 rounded-dialog bg-soft p-4"><p className="text-body font-bold">판매가 끝나면 주문 내역을 알림으로 보내드려요</p><p className="text-label text-aux">발송 준비와 송장 등록도 알림에서 바로 이어서 할 수 있어요. 판매 중에는 이 화면에서 실시간 현황만 확인해 주세요.</p></div>
    </div>;
  }

  // 판매자 판매 결과
  if (status === '판매 종료') {
    if (!USE_MOCK && (live.loading || live.error)) return <><Header title="판매 결과"/><LiveStatus state={live}/></>;
    const optSales = p.options.map(o => {
      const sold = productOrders.reduce((n,ord) => n + ord.lines.filter(l => l.optionId === o.id).reduce((a,l) => a + l.quantity, 0), 0);
      return { name: o.name, sold };
    });
    return <div className="space-y-5">
      <Header title="판매 결과"/>
      <div className="flex gap-3">
        <ProductImage src={p.images[0]} alt={p.name} className="h-14 w-14 shrink-0"/>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2"><span className="rounded-badge bg-soft px-2 py-0.5 text-footnote font-bold text-meta">판매 종료</span><span className="muted text-footnote font-bold">{new Date(p.startsAt).toLocaleDateString('ko-KR',{month:'numeric',day:'numeric'})} (일) {new Date(p.startsAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false})} – {new Date(p.endsAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false})}</span></div>
          <p className="text-callout">{p.name}</p>
          <p className="font-number text-subhead font-bold">{money(p.price)} <span className="muted text-label font-normal">{totalStock}개 한정</span></p>
        </div>
      </div>
      <div className="rounded-dialog bg-soft p-5">
        <p className="text-title-lg font-bold">{totalStock > 0 && totalSold >= totalStock ? (USE_MOCK ? `2시간 14분 만에 완판됐어요` : '완판됐어요') : `${totalSold}개가 판매됐어요`}</p>
        {USE_MOCK && <p className="muted mt-1 text-label">오픈 후 23:14에 마지막 수량이 판매됐어요</p>}
        <div className="my-4 h-px bg-border"/>
        <div className="flex items-baseline justify-between">
          <div><span className="font-number text-display font-bold">{totalSold}</span><span className="ml-2 text-callout font-bold text-aux">/ {totalStock}개 판매</span></div>
          <span className="text-callout font-bold text-positive">{totalStock > 0 ? Math.round(totalSold/totalStock*100) : 0}%</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line"><div className="h-2 rounded-full bg-ink" style={{width: totalStock > 0 ? `${Math.min(100, totalSold/totalStock*100)}%` : '0%'}}/></div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {([['구매 확정 금액', resultMoney(result?.gross)], ['정산 예정', resultMoney(result?.net)], ...(USE_MOCK ? [['알림→구매', `${totalStock > 0 ? Math.round(totalSold/226*100) : 0}%`]] : [])] as [string,string][]).map(([lbl,val]) => <div key={lbl} className="rounded-element border border-line p-3"><p className="muted text-footnote">{lbl}</p><p className="font-number mt-2 text-headline font-bold">{val}</p></div>)}
      </div>
      <section className="divider space-y-3 pb-4">
        <div className="flex items-center justify-between"><h2 className="text-subhead font-bold">옵션별 판매</h2><span className="muted text-label">색상 · 사이즈</span></div>
        {optSales.map(o => <div key={o.name} className="divider flex items-center justify-between py-3"><span className="text-body font-bold">{o.name}</span><span className="font-number text-body font-bold">{o.sold}개</span></div>)}
      </section>
      <section className="space-y-3">
        <h2 className="text-subhead font-bold">정산 예정</h2>
        {!USE_MOCK && <p className="muted text-label">{month} 구매 확정 기준, 배송비 제외</p>}
        <InfoRow label="구매 확정 금액" value={resultMoney(result?.gross)}/>
        <InfoRow label={`판매 수수료 (${result?.rate ?? '-'}%)`} value={!result ? '-' : result.fee > 0 ? `−${money(result.fee)}` : '없음'}/>
        <div className="border-t border-line pt-3"><InfoRow label="정산 예정 금액" value={<span className="font-number text-headline font-bold">{resultMoney(result?.net)}</span>} strong/></div>
        {!USE_MOCK && settle.error && <p className="text-label text-red">정산 금액을 불러오지 못했어요. <button type="button" className="underline" onClick={settle.reload}>다시 시도</button></p>}
      </section>
      <div className="rounded-dialog bg-soft p-5 space-y-2">
        <p className="text-body font-bold">구매 확정 후 D+7 영업일에 입금돼요</p>
        <p className="text-label text-aux">반품·환불은 STOCKDROP이 처리하지 않아요. 구매자와 직접 협의해 진행해 주세요.</p>
        <p className="text-label text-aux">정산 내역은 마이페이지 &gt; 정산 계좌에서 볼 수 있어요.</p>
      </div>
      {!USE_MOCK && <Button outline className="w-full" to={`/seller/product/${p.id}/faqs`}>FAQ 수정</Button>}
    </div>;
  }

  // 판매 예정 (기본 상태)
  const secondsLeft2 = Math.max(0, Math.floor((p.startsAt - now) / 1000));
  const hh2 = String(Math.floor(secondsLeft2/3600)).padStart(2,'0'), mm2 = String(Math.floor(secondsLeft2%3600/60)).padStart(2,'0'), ss2 = String(secondsLeft2%60).padStart(2,'0');
  return <div className="space-y-5">
    <Header title="상품 판매 현황" subtitle={`${p.name} · ${status}`}/>
    <ProductSummary product={{ ...p, image: p.images[0] }} amount={p.price}/>
    <div className="rounded-inner bg-canvas p-5"><p className="text-footnote opacity-70">판매 시작까지</p><p className="font-number my-2 text-display font-bold">{hh2}:{mm2}:{ss2}</p><p className="text-caption opacity-70">{dateTime(p.startsAt)} · 자동 시작</p></div>
    <div className="space-y-2"><InfoRow label="판매 시작" value={dateTime(p.startsAt)}/><InfoRow label="판매 종료" value={dateTime(p.endsAt)}/><InfoRow label="최초 판매 수량" value={`${fee.initial}개`}/><InfoRow label="판매가격" value={money(p.price)}/></div>
    {rev && <Note title={rev.status === 'IN_REVIEW' ? '수정 심사 중' : rev.status === 'APPROVED' ? '수정 내용이 승인됐어요' : '수정 심사 반려'}>{rev.status === 'IN_REVIEW' ? '승인되면 구매자 화면에 반영돼요. 심사 중에는 다시 수정 요청할 수 없어요.' : rev.status === 'APPROVED' ? '변경한 내용이 구매자 화면에 반영됐어요.' : rev.reason || '반려 사유가 없어요.'}</Note>}
    {now < p.startsAt ? <Button outline className="w-full" to={`/seller/new?edit=${p.id}`}>상품 정보 수정</Button> : <Note title="핵심 정보는 변경할 수 없어요">판매 시작 후 가격·옵션·최초 수량·종료 시각은 변경할 수 없습니다.</Note>}
    <Button className="w-full" to={`/seller/orders?product=${p.id}`}>주문 관리</Button>
    {!USE_MOCK && <Button outline className="w-full" to={`/seller/product/${p.id}/faqs`}>FAQ 수정</Button>}
  </div>;
}

export function SellerInquiriesPage() {
  const s = useStore(), user = activeUser(s); const [tab, setTab] = useState<'order' | 'product'>('order'); const [onlyUnanswered, setOnlyUnanswered] = useState(false);
  // 실제 모드: 주문 문의함·상품 문의함(+상품명 채우기용 상품 목록)을 서버에서 받는다
  const live = useLive(async signal => (user.seller ? await Promise.all([listSellerProducts(user.id, {}, signal), listSellerOrderInquiryInbox(user.id, {}, signal), listSellerProductInquiries(user.id, {}, signal)]) : null), (st, r) => { if (!r) return; mergeProducts(st, r[0]); mergeInquiries(st, [...r[1], ...r[2]]); }, [user.id]);
  if (!user.seller) return <Unavailable/>; const all = s.inquiries.filter(q => q.sellerId === user.id); const byTab = all.filter(q => tab === 'order' ? !!q.orderId : !q.orderId); const items = onlyUnanswered ? byTab.filter(q => !q.answer) : byTab;
  return <div className="space-y-0"><Header title="문의함" subtitle="고객의 상품·주문 문의에 답변해 주세요."/><LiveStatus state={live}/><SellerStatusTabs label="문의 종류" tabs={[{ value: 'order', label: '주문 문의' }, { value: 'product', label: '상품 문의' }]} value={tab} onChange={value => setTab(value as 'order' | 'product')}/><div className="flex items-center gap-3 py-3 text-body"><label className="flex items-center gap-2"><input type="checkbox" checked={onlyUnanswered} onChange={e => setOnlyUnanswered(e.target.checked)}/>미답변만 보기</label>{onlyUnanswered && <span className="ml-auto font-bold text-red">미답변 {byTab.filter(q => !q.answer).length}건</span>}</div>{items.map(q => <Link key={q.id} to={`/seller/inquiries/${q.id}`} className="divider block space-y-2 py-4"><div className="flex items-center justify-between"><Badge live={!q.answer}>{q.answer ? '답변 완료' : '답변 대기'}</Badge><span className="muted text-caption">{dateTime(q.createdAt)}</span></div><p className="text-subhead font-bold">{q.productName}</p><p className="muted text-caption">{q.kind}</p><p className="line-clamp-2 text-callout leading-relaxed">{q.question}</p></Link>)}{!items.length && !live.loading && <Empty title="해당 조건의 문의가 없어요"/>}</div>;
}
/** 구매자가 주문 문의에 첨부한 사진: 구매자 화면 InquiryImage와 같은 방식으로 판매자용 열람 URL(5분 유효)을 받아 보여 준다 */
function SellerInquiryImage({ orderId, imageId }: { orderId: string; imageId: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => { const c = new AbortController(); getSellerInquiryImageUrl(orderId, imageId, c.signal).then(setSrc, () => {}); return () => c.abort(); }, [orderId, imageId]);
  return <ProductImage src={src} alt="구매자 첨부 사진" className="h-18 w-18 shrink-0"/>;
}
export function SellerInquiryDetailPage() {
  // 입력창은 새로 보낼 답변만 담는다: 이미 보낸 답변(q.answer)으로 채우지 않아 나갔다 들어와도 보낸 내용이 입력창에 남지 않는다. 보낸 답변은 위 대화에 한 번만 보인다
  const { id } = useParams(); const s = useStore(), user = activeUser(s), toast = useToast(); const q = s.inquiries.find(i => i.id === id && i.sellerId === user.id); const [answer, setAnswer] = useState(''), [publicAnswer, setPublic] = useState(q?.public ?? false), [error, setError] = useState(''), [busy, setBusy] = useState(false), sending = useRef(false); // sending: 같은 답변을 두 번 보내지 않게(빠른 두 번 누르기)
  // 작성 중: 보낼 답변을 적었을 때(보내면 입력이 비워진다)
  useLeaveGuard(!!answer.trim());
  // 실제 모드: 주문 문의는 메시지 전체를 상세에서, 스토어에 없으면 문의함을 받아 찾는다(주문 문의면 이어서 상세도 받는다: 문의함 카드는 마지막 메시지만 있어 보낸 답변이 질문처럼 보인다)
  const live = useLive(async signal => {
    if (!user.seller || !id) return null;
    if (q?.orderId) return [await getSellerOrderInquiry(q.orderId, id, user.id, signal)];
    if (q) return null;
    const list = [...await listSellerOrderInquiryInbox(user.id, {}, signal), ...await listSellerProductInquiries(user.id, {}, signal)];
    const found = list.find(i => i.id === id);
    return found?.orderId ? [...list, await getSellerOrderInquiry(found.orderId, id, user.id, signal)] : list;
  }, (st, list) => { if (list) mergeInquiries(st, list); }, [id]);
  useEffect(() => { if (q && !q.orderId) setPublic(q.public); }, [q?.id]);
  if (!user.seller) return <Unavailable message="문의를 찾을 수 없습니다."/>;
  if (!q) return retryable(live) ? <LiveStatus state={live}/> : <Unavailable message="문의를 찾을 수 없습니다."/>;
  const buyer = s.users.find(u => u.id === q.userId); const buyerMasked = buyer?.name.replace(/^(.)(.)(.)$/, '$1*$3') ?? buyer?.name.replace(/^(.).+(.)$/, (_, a, z) => `${a}*${z}`) ?? '구매자';
  return <div className="space-y-4"><Header title="문의 상세"/>{q.orderId && <div className="rounded-inner bg-blue-soft p-3.5 space-y-1"><p className="text-body font-bold">{q.productName}</p><p className="muted text-footnote">구매자 {buyerMasked}</p></div>}<div className="divider space-y-3 pb-5"><div className="flex items-center justify-between"><Badge live={!q.answer}>{q.answer ? '답변 완료' : '답변 대기'}</Badge><span className="muted text-caption">{dateTime(q.createdAt)}</span></div><p className="text-label font-bold">{q.kind}</p>{q.messages?.length ? q.messages.map((m, i) => <p key={i} className={`whitespace-pre-line text-body leading-relaxed ${m.seller ? 'rounded-inner bg-canvas p-3' : ''}`}>{m.seller ? '[판매자] ' : ''}{m.body}</p>) : <><p className="whitespace-pre-line text-body leading-relaxed">{q.question}</p>{q.answer && <p className="whitespace-pre-line rounded-inner bg-canvas p-3 text-body leading-relaxed">[판매자] {q.answer}</p>}</>}{q.orderId && !!q.imageIds?.length && <div className="flex gap-2 overflow-x-auto" aria-label="구매자 첨부 사진">{q.imageIds.map(imageId => <SellerInquiryImage key={imageId} orderId={q.orderId!} imageId={imageId}/>)}</div>}</div><Note>영업일 기준 1일 안에 답변해 주세요. 2영업일 안에 답변이 없으면 StockDrop이 직접 확인하고 구매자에게 연락해요.</Note><form className="space-y-3" onSubmit={async e => { e.preventDefault(); if (sending.current) return; setError(''); const text = answer.trim(); try { if (!text) throw new Error('답변을 입력해 주세요.'); sending.current = true; setBusy(true);
    if (!USE_MOCK) { // 주문 문의=답변 메시지 추가, 상품 문의=답변 작성·수정(문의 version, FAQ 반영 선택). 서버 응답으로 한 번만 반영한다
      const upd = q.orderId ? await answerOrderInquiry(q.orderId, q.id, text, user.id) : await answerProductInquiry(user.id, q.productId, q.id, { expectedVersion: q.version ?? 0, answer: text, publishToFaq: publicAnswer });
      mutate(st => mergeInquiries(st, [upd]));
    } else mutate(state => { const item = state.inquiries.find(i => i.id === id && i.sellerId === user.id); if (!item || !activeUser(state).seller) throw new Error('이 문의에 답변할 권한이 없습니다.'); item.answer = text; item.public = !item.orderId && publicAnswer; if (item.public) { const p = state.products.find(p => p.id === item.productId); if (p) { const old = p.faqs.find(f => f.question === item.question); if (old) { old.answer = item.answer; old.confirmed = true; } else p.faqs.push({ id: uid('faq-'), question: item.question, answer: item.answer, confirmed: true }); } } });
    setAnswer(''); toast('답변을 저장했습니다.'); } catch (e) { setError(errorMessage(e)); /* 실패하면 입력 내용은 그대로 둔다 */ } finally { sending.current = false; setBusy(false); } }}><textarea aria-label="답변 입력" value={answer} onChange={e => setAnswer(e.target.value)} className="field field-box" placeholder={!q.orderId && q.answer ? '새 답변으로 바꾸려면 입력해 주세요.' : '답변을 작성해 주세요.'} maxLength={1500}/>{!q.orderId && q.answer && !answer && <button type="button" className="text-footnote font-bold underline" onClick={() => setAnswer(q.answer ?? '')}>기존 답변 불러와 수정</button>}{!q.orderId && <label className="flex items-center gap-2 text-footnote"><input type="checkbox" checked={publicAnswer} onChange={e => setPublic(e.target.checked)}/>공개 가능한 답변을 상품 FAQ에 반영</label>}<ErrorBox message={error}/>{!!answer.trim() && <div className="seller-action-enter"><Button type="submit" className="w-full" disabled={busy}>{busy ? '등록 중…' : '답변 등록'}</Button></div>}</form></div>;
}

export function SellerOrdersPage() {
  const s = useStore(), user = activeUser(s); const [params, setParams] = useSearchParams();
  const states = ['paid', 'preparing', 'shipping', 'delivered'] as const;
  const tab = states.includes(params.get('state') as typeof states[number]) ? params.get('state')! : 'preparing';
  const productId = params.get('product') ?? undefined;
  const live = useLive(async signal => user.seller ? listSellerOrders(user.id, { productId }, signal) : null, (st, list) => { if (list) mergeOrders(st, list); }, [user.id, productId]);
  const allOrders = s.orders.filter(o => o.sellerId === user.id && (!productId || productId === o.productId));
  const photo = useProductPhotos(allOrders.map(o => o.productId));
  if (!user.seller) return <Unavailable/>;
  const orders = allOrders.filter(o => o.status === tab);
  return <div>
    <Header title="주문 관리"/>
    <SellerStatusTabs label="판매자 주문 상태" tabs={states.map((value, i) => ({ value, label: ['결제완료', '배송준비', '배송중', '배송완료'][i] }))} value={tab} onChange={value => { const next = new URLSearchParams(params); next.set('state', value); setParams(next, { replace: true }); }}/>
    <LiveStatus state={live}/>
    <div className="space-y-2">{orders.map(o => <Link to={`/seller/orders/${o.id}`} key={o.id} aria-label={`${o.product.name} 주문 상세 보기`} className="block min-h-11 rounded-dialog outline-offset-2 focus-visible:outline-2 focus-visible:outline-green">
      <AxCard padding={2} variant="default" className="space-y-2 rounded-dialog">
        <div className="flex flex-wrap items-center justify-between gap-2"><Badge live={o.status === 'delivered'}>{ORDER_LABELS[o.status]}</Badge><span className="muted text-body">{kstShort(o.paidAt ?? o.createdAt)}</span></div>
        <div className="flex items-center gap-2"><ProductImage src={photo(o.productId, o.product.image)} alt={o.product.name} className="h-16 w-14 shrink-0"/><div className="min-w-0 flex-1 space-y-1"><p className="break-words text-subhead font-semibold">{o.product.name}</p><p className="muted break-words text-body">{[...o.lines.map(l => `${l.name} · ${l.quantity}개`), maskName(o.address.name)].filter(Boolean).join(' · ')}</p><p className="font-number text-headline font-bold">{money(o.total)}</p></div><ChevronRight className="h-4 w-4 shrink-0 text-muted"/></div>
      </AxCard>
    </Link>)}</div>
    {!orders.length && !live.loading && !live.error && <Empty title="해당 상태의 주문이 없어요"/>}
  </div>;
}

export function SellerOrderPage() {
  const { id } = useParams(); const s = useStore(), user = activeUser(s), toast = useToast(), now = useClock(); const order = s.orders.find(o => o.id === id && o.sellerId === user.id); const [showTracking, setShowTracking] = useState(false), [confirm, setConfirm] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  // 실제 모드: 주문 상세(배송지·송장)와 이 주문의 문의를 서버에서 받는다
  const live = useLive(async signal => (id && user.seller ? { o: await getSellerOrder(id, user.id, signal), qs: await listSellerOrderInquiries(id, user.id, signal) } : null), (st, r) => { if (r) { mergeOrders(st, [r.o]); mergeInquiries(st, r.qs); } }, [id]);
  // 출고지: 주문에는 없어 상품의 출고지를 받는다(판매 시작 뒤에는 바뀌지 않는다)
  const photo = useProductPhotos([order?.productId]); // 주문 상세에도 상품 사진이 없다
  const dispatch = useApi(async signal => (USE_MOCK || !order?.productId ? null : { productId: order.productId, address: await getProductDispatchAddress(order.productId, signal).catch(() => '') }), [order?.productId]);
  if (!user.seller) return <Unavailable message="판매자 주문을 찾을 수 없습니다."/>;
  if (!order) return retryable(live) ? <LiveStatus state={live}/> : <Unavailable message="판매자 주문을 찾을 수 없습니다."/>;
  // 출고 기한은 상품에 설정한 영업일(토·일 제외)로 계산한다
  const o = order; const paidAt = o.paidAt ?? o.createdAt; const dueStr = o.dispatchDays ? `결제 후 ${o.dispatchDays}영업일 이내 출고 · ${kstDay(addBusinessDays(paidAt, o.dispatchDays))}까지` : '';
  const dispatchFrom = USE_MOCK ? s.sellerSettings[user.id]?.shippingAddress || '성수 물류창고' : (dispatch.data?.productId === o.productId ? dispatch.data.address : ''); const doneAt = o.deliveredAt ?? o.processedAt;
  const needsTracking = ['paid', 'preparing'].includes(o.status); const orderInquiries = s.inquiries.filter(q => q.orderId === o.id && q.sellerId === user.id);
  return <div className="seller-order-detail space-y-5">
    <Header title="주문 상세" subtitle={`주문번호 ${orderNo(o.id)} · ${kstShort(paidAt)} 결제`}/>
    {needsTracking ? <><h1 className="text-heading-lg font-bold tracking-[-.7px]">송장을 등록해 주세요</h1>{dueStr && <p className="text-body text-aux">{dueStr}</p>}</> : <h1 className="text-heading-lg font-bold tracking-[-.7px]">{o.status === 'shipping' ? '상품이 배송 중이에요' : o.status === 'delivered' ? '배송이 완료됐어요' : ORDER_LABELS[o.status]}</h1>}
    <div className="flex gap-3 rounded-inner bg-canvas p-4">
      <ProductImage src={photo(o.productId, o.product.image)} alt={o.product.name} className="h-16 w-16 shrink-0"/>
      <div className="min-w-0 flex-1 space-y-1"><p className="muted text-footnote font-bold">{o.product.brand}</p><p className="text-subhead">{o.product.name}</p><p className="muted text-body">{o.lines.map(l => l.name).join(' / ')} / {o.lines.reduce((n,l)=>n+l.quantity,0)}개</p></div>
    </div>
    <section className="divider space-y-2 pb-4"><h2 className="text-subhead font-bold">주문 및 결제 정보</h2><InfoRow label="상품금액" value={money(o.total - o.shipping)}/><InfoRow label="고정 배송비" value={money(o.shipping)}/><InfoRow label="최종 결제금액" value={<span className="font-bold">{money(o.total)}</span>}/></section>
    <section aria-label="배송지" className="divider space-y-1 pb-4"><h2 className="text-subhead font-bold">배송지</h2><div className="flex flex-wrap items-center gap-x-3"><p className="break-words text-headline font-bold">{o.address.name}</p>{o.address.phone && <a href={`tel:${o.address.phone.replace(/[^+\d]/g, '')}`} className="inline-flex min-h-11 items-center text-subhead font-bold">{formatPhone(o.address.phone)}</a>}</div><p className="muted break-words text-body leading-relaxed">{o.address.address} {o.address.detail}<br/>{o.address.request}</p></section>
    <section className="divider space-y-2 pb-4"><h2 className="text-subhead font-bold">배송 처리</h2>{dispatchFrom && <InfoRow label="출고지" value={dispatchFrom}/>}<InfoRow label="택배사" value={o.carrier || <span className="text-muted">미등록</span>}/><InfoRow label="운송장 번호" value={o.tracking ? <span className="inline-flex items-center gap-1">{o.tracking}<CopyButton value={o.tracking}/></span> : <span className="text-muted">미등록</span>}/></section>
    <Note>송장을 등록하면 구매자에게 배송 중으로 안내돼요. 판매자의 수동 배송완료 처리는 구매확정이나 정산 송금을 의미하지 않습니다.</Note>
    {orderInquiries.length > 0 && <Link to={`/seller/inquiries/${orderInquiries[0].id}`} className="flex items-center gap-3 rounded-inner border border-line p-4"><div className="flex-1 space-y-1"><p className="text-body font-bold">이 주문의 문의</p><p className="muted text-label">{orderInquiries[0].kind} 문의 {orderInquiries.length}건</p></div>{orderInquiries.some(q => !q.answer) && <span className="rounded-badge bg-red-soft px-2 py-0.5 text-footnote font-bold text-red">미답변 {orderInquiries.filter(q => !q.answer).length}</span>}<ChevronRight size={16} className="muted"/></Link>}
    <section className="divider space-y-3 py-3"><h2 className="text-subhead font-bold">배송 진행 내역</h2>{doneAt && <InfoRow label={dateTime(doneAt)} value="배송완료 · 판매자 처리"/>}{o.shippedAt && <InfoRow label={dateTime(o.shippedAt)} value="운송장 등록 · 배송 중"/>}<InfoRow label={dateTime(paidAt)} value="결제 완료"/></section>
    <ErrorBox message={error}/>
    <div className="flex gap-2">
      {o.status === 'shipping' ? <Button className="w-full" onClick={() => setConfirm(true)}>배송완료 확인</Button> : needsTracking ? <><Button outline className="flex-[1]" onClick={() => setConfirm(true)} disabled>배송완료</Button><Button className="flex-[2]" onClick={() => setShowTracking(true)}>송장 등록</Button></> : <Button className="w-full" disabled>{ORDER_LABELS[o.status]}</Button>}
    </div>
    {showTracking && <TrackingModal order={o} onClose={() => setShowTracking(false)} onSaved={() => { setShowTracking(false); toast('운송장을 등록했습니다.'); }}/>}
    {confirm && <DeliveredModal order={o} now={now} onClose={() => setConfirm(false)}/>}
  </div>;
}
function TrackingModal({ order, onClose, onSaved }: { order: Order; onClose: () => void; onSaved: () => void }) {
  const [carrier, setCarrier] = useState(order.carrier || 'CJ대한통운'), [tracking, setTracking] = useState(order.tracking || ''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return <Modal title="송장 등록" onClose={onClose}><div className="space-y-4">
    <div className="rounded-inner bg-canvas p-3 space-y-1">
      <p className="muted text-footnote font-bold">{[`주문번호 ${orderNo(order.id)}`, maskName(order.address.name)].filter(Boolean).join(' · ')}</p>
      <p className="text-callout">{order.product.name} · {order.lines.reduce((n,l)=>n+l.quantity,0)}개</p>
      <p className="muted text-label">{order.lines.map(l=>l.name).join(' / ')}</p>
    </div>
    <Field label="택배사" required><select aria-label="택배사" value={carrier} onChange={e => setCarrier(e.target.value)} className="field">{['CJ대한통운','한진택배','롯데택배','우체국택배'].map(c => <option key={c}>{c}</option>)}</select></Field>
    <Field label="운송장 번호" required><input aria-label="운송장 번호" inputMode="numeric" value={tracking} onChange={e => { setTracking(e.target.value.replace(/\s/g, '')); setError(''); }} className="field" placeholder="송장 번호"/></Field>
    {error && <p className="text-label text-red">{error} 입력한 내용은 그대로 유지돼요.</p>}
    <Note>송장에 적힌 번호를 그대로 입력해 주세요(영문, 숫자, 하이픈). 등록하면 구매자에게 배송 시작 알림이 발송돼요.</Note>
    <ErrorBox message=""/>
    <div className="flex gap-2"><Button outline className="flex-1" disabled={busy} onClick={onClose}>취소</Button><Button className="flex-1" disabled={busy || !tracking.trim()} onClick={async () => { setError(''); setBusy(true); try {
    if (!USE_MOCK) { // 출고용 원본(fulfillment) version으로 송장 등록. 송장은 영문·숫자·하이픈 1~100자
      if (!/^[A-Za-z0-9-]{1,100}$/.test(tracking.trim())) throw new Error('운송장 번호는 영문, 숫자, 하이픈(-)만 쓸 수 있어요. 송장에 적힌 번호를 확인해 주세요.');
      const updated = await shipOrder(order.id, order.sellerId, carrier, tracking.trim()); mutate(st => mergeOrders(st, [updated])); onSaved(); return;
    }
    if (!/^\d[\d-]{7,}$/.test(tracking.trim())) throw new Error('운송장 번호를 확인해 주세요.'); await atomic(state => { const item = state.orders.find(item => item.id === order.id && item.sellerId === state.activeUserId); if (!item || !['paid','preparing'].includes(item.status)) throw new Error('출고 가능한 주문이 아닙니다.'); item.carrier = carrier; item.tracking = tracking.trim(); item.shippedAt = nowOf(state); item.status = 'shipping'; }); onSaved(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>등록하기</Button></div>
  </div></Modal>;
}
function DeliveredModal({ order, now, onClose }: { order: Order; now: number; onClose: () => void }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false); const toast = useToast();
  return <div className="fixed inset-0 z-50 flex items-center justify-center" style={{background: 'rgba(0,0,0,0.45)'}} onClick={e => e.target === e.currentTarget && !busy && onClose()}><div className="mx-4 w-full max-w-[318px] rounded-dialog bg-surface p-5 space-y-4">
    <h2 className="text-title-sm font-bold tracking-[-.4px]">배송완료로 처리할까요?</h2>
    <p className="text-body text-aux">처리하면 구매자에게 배송 완료로 안내돼요.</p>
    <div className="rounded-inner bg-canvas p-3 space-y-1">
      <p className="muted text-label font-bold">{[`주문번호 ${orderNo(order.id)}`, maskName(order.address.name)].filter(Boolean).join(' · ')}</p>
      <p className="text-body">{order.product.name} · {order.lines.map(l=>l.name).join(' / ')} / {order.lines.reduce((n,l)=>n+l.quantity,0)}개</p>
      {order.tracking && <p className="muted text-label">{order.carrier} {order.tracking}</p>}
    </div>
    <p className="text-footnote text-meta leading-relaxed">판매자의 수동 배송완료 처리는 구매확정이나 정산 송금을 의미하지 않습니다.</p>
    <ErrorBox message={error}/>
    <div className="flex gap-2"><Button outline className="flex-1" disabled={busy} onClick={onClose}>취소</Button><Button className="flex-1" disabled={busy} onClick={async () => { setBusy(true); setError(''); try {
    // 배송 완료는 확인 한 번으로 끝난다: 서버 delivery-completion은 expectedVersion만 받아 완료 일시·장소·메모를 받지 않는다(입력란 없음)
    if (!USE_MOCK) { const updated = await deliverOrder(order.id, order.sellerId); mutate(st => mergeOrders(st, [updated])); toast('배송완료로 처리했습니다.'); onClose(); return; }
    await atomic(s => markDelivered(s, s.activeUserId, order.id, nowOf(s))); toast('배송완료로 처리했습니다.'); onClose(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>배송완료 처리</Button></div>
  </div></div>;
}

/** 판매자 권한이 있는 사용자의 마이페이지 — 판매 관리와 구매 메뉴를 한 화면에 둔다(모드 전환 없음). 권한이 없으면 MyPage */
export function SellerMyPage() {
  const s = useStore(), user = activeUser(s);
  // 수치는 서버 집계로 보여 준다(다른 화면에서 받아 둔 일부 데이터로 세면 볼 때마다 달라진다). 받기 전에는 '-'
  const month = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(Date.now());
  const sales = useApi(async signal => (USE_MOCK || !user.seller ? null : getSalesSummary(month, signal)), [user.id, month]);
  const settle = useApi(async signal => (USE_MOCK || !user.seller ? null : getSellerSettlement(month, signal)), [user.id, month]);
  useLive(async signal => (USE_MOCK || !user.seller ? null : listSellerProducts(user.id, {}, signal)), (st, items) => { if (items) mergeProducts(st, items); }, [user.id]);
  if (!user.seller) return <Unavailable/>;
  const settings = s.sellerSettings[user.id];
  const displayName = settings?.displayName ?? user.name;
  const initial = displayName.charAt(0).toUpperCase();
  const products = s.products.filter(p => p.sellerId === user.id);
  const sd = sales.data, ready = USE_MOCK || !!sd;
  const activeDrops = sd ? sd.onSaleCount + sd.scheduledCount : products.filter(p => saleState(p, Date.now()) === '판매 중' || saleState(p, Date.now()) === '판매 예정').length;
  const settlement = s.orders.filter(o => o.sellerId === user.id && !['cancelled','refunded'].includes(o.status)).reduce((n, o) => n + o.total - o.shipping, 0);
  const productCount = sd ? sd.productCount : products.length;
  const net = settle.data ? settlementNet(settle.data, Object.fromEntries(products.map(p => [p.id, p.listQuantity])))?.net : undefined;
  const unanswered = s.inquiries.filter(q => q.sellerId === user.id && !q.answer).length;
  const maskedBank = USE_MOCK ? (settings?.account ? `국민 ****${settings.account.slice(-4)}` : '국민 ****1024') : settings?.account ? `${settings.bank} ${settings.account}`.trim() : '';
  return (
    <div className="space-y-0">
      <Header title="마이페이지" subtitle="스토어 정보와 내 구매·계정을 한 곳에서 관리하세요." back={false}/>
      <Link to="/seller/settings/account" aria-label="계정 설정" className="divider flex items-center gap-3 pb-5">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-dialog bg-ink text-title font-bold text-white">{initial}</div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-headline font-bold">{displayName}</h2>
            <span className="rounded-badge bg-green-soft px-2 py-0.5 text-caption font-bold text-green">승인 판매자</span>
          </div>
          <p className="muted text-label">{user.name} · {user.email}</p>
        </div>
        <ChevronRight size={17} className="muted shrink-0"/>
      </Link>
      <div className="mb-4 flex rounded-inner bg-canvas">
        {([['진행 중 드롭', ready ? `${activeDrops}건` : '-', '/seller/products'], ['이번 달 정산 예정', USE_MOCK ? money(settlement) : net === undefined ? '-' : money(net), '/seller/sales'], ['미답변 문의', `${unanswered}건`, '/seller/inquiries', unanswered > 0]] as [string, string, string, boolean?][]).map(([label, value, to, red], i) => (
          <Link key={label} to={to} className={`flex flex-1 flex-col items-center gap-1 py-4 ${i > 0 ? 'border-l border-line' : ''}`}>
            <span className={`font-number text-subhead font-bold ${red ? 'text-red' : ''}`}>{value}</span>
            <span className="muted text-footnote">{label}</span>
          </Link>
        ))}
      </div>
      <SalesRestrictionBanner/>
      <section className="mb-4">
        <p className="muted mb-2 text-body font-bold">판매 관리</p>
        <MenuRow to="/seller/products" label="판매 상품 관리"><span className="muted mr-1 text-label">{ready ? `${productCount}개` : '-'}</span></MenuRow>
        <MenuRow to="/seller/sales" label="판매 현황"/>
        <MenuRow to="/seller/orders" label="주문 관리"/>
        <MenuRow to="/seller/inquiries" label="문의 답변"><span className={`mr-1 text-label ${unanswered > 0 ? 'text-red' : 'muted'}`}>{unanswered > 0 ? `${unanswered}건 대기` : ''}</span></MenuRow>
      </section>
      <div className="h-2 bg-canvas"/>
      <section className="mb-4">
        <p className="muted mb-2 mt-4 text-body font-bold">판매자 정보</p>
        <MenuRow to="/seller/settings/business" label="사업자 서류 · 담당자 정보"/>
        {!USE_MOCK && <MenuRow to="/seller/review" label="사업자등록증 재심사"/>}
        <MenuRow to="/seller/settings/bank" label="정산 계좌 관리"><span className="muted mr-1 text-label">{maskedBank}</span></MenuRow>
        <MenuRow to="/seller/settings/addresses" label="출고지 · 반품지 관리"/>
      </section>
      <div className="h-2 bg-canvas"/>
      <section className="mb-4">
        <p className="muted mb-2 mt-4 text-body font-bold">내 구매</p>
        <MenuRow to="/orders" label="주문 · 배송 조회"/>
        <MembershipCouponSection/>
        <MenuRow to="/addresses" label="배송지 관리"/>
        <MenuRow to="/inquiries" label="문의 내역"/>
      </section>
      <div className="h-2 bg-canvas"/>
      <section className="mb-4">
        <p className="muted mb-2 mt-4 text-body font-bold">설정</p>
        <MenuRow to={SETTINGS_HREF('/my')} label="알림 설정"/>
        {!USE_MOCK && <MenuRow to="/my/interests" label="관심사와 맞춤 추천"/>}
        <MenuRow to="/seller/support" label="이용 안내 · 고객지원"/>
      </section>
      <div className="text-center"><LogoutButton/></div>
    </div>
  );
}
export function SellerSettingsPage() {
  const { section } = useParams();
  return section === 'bank' ? <SellerBankSettingsPage/> : <SellerSettingsFormPage/>;
}
function SellerSettingsFormPage() {
  const { section } = useParams();
  const s = useStore(), user = activeUser(s), toast = useToast(), navigate = useNavigate();
  const original = s.sellerSettings[user.id];
  const [form, setForm] = useState<SellerSettings>(original ?? { displayName: user.name, bank: '', account: '', holder: user.name, shippingAddress: '', returnAddress: '' });
  const [phone, setPhone] = useState(user.phone), [email, setEmail] = useState(user.email), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const app = s.applications.find(a => a.userId === user.id && a.status === 'approved');
  const saving = useRef(false);
  const [addrTab, setAddrTab] = useState<'ship' | 'return'>('ship');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [sameAsShip, setSameAsShip] = useState(false), [defaultReturn, setDefaultReturn] = useState(false);

  // 실제 모드: 서버의 판매자 정보를 폼에 채운다(mock은 store 값 그대로)
  const me = useApi(async signal => (USE_MOCK ? null : fetchSellerMe(original, signal)), []);
  // 작성 중 판단의 처음 값: 처음 화면 값, 서버 값을 받으면 그 값, 저장하면 저장한 값
  const core = JSON.stringify({ form, phone, email });
  const [baseCore, setBaseCore] = useState(core), [baseIntro, setBaseIntro] = useState('');
  useEffect(() => { if (me.data) { setForm(me.data.settings); setPhone(me.data.contactPhone); setEmail(me.data.contactEmail); setBaseCore(JSON.stringify({ form: me.data.settings, phone: me.data.contactPhone, email: me.data.contactEmail })); } }, [me.data]);

  // 스토어 소개·로고(계정 설정 화면)
  const store = useApi(async signal => (USE_MOCK || section !== 'account' ? null : fetchSellerStore(signal)), [section]);
  const [intro, setIntro] = useState(''), [logoUrl, setLogoUrl] = useState(''), [logoTick, setLogoTick] = useState(0);
  useEffect(() => { if (store.data) { setIntro(store.data.introduction ?? ''); setBaseIntro(store.data.introduction ?? ''); } }, [store.data]);
  // 작성 중: 판매자 정보, 연락처, 이메일, 계좌, 주소, 스토어 소개 중 하나라도 처음 값과 다를 때
  useLeaveGuard(core !== baseCore || intro !== baseIntro);
  useEffect(() => {
    if (!store.data?.hasLogo) { setLogoUrl(''); return; }
    let url = '', alive = true;
    fetchSellerLogo().then(b => { if (alive) { url = URL.createObjectURL(b); setLogoUrl(url); } }, () => {});
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [store.data?.hasLogo, logoTick]);
  async function changeLogo(file?: File) {
    if (!file) return; setError('');
    try { await uploadSellerLogo(file); store.reload(); setLogoTick(n => n + 1); toast('로고를 변경했습니다.'); } catch (e) { setError(errorMessage(e)); }
  }
  async function removeLogo() { setError(''); try { await deleteSellerLogo(); store.reload(); toast('로고를 삭제했습니다.'); } catch (e) { setError(errorMessage(e)); } }

  if (!user.seller) return <Unavailable/>;
  // 판매자 정보 조회 실패: 화면마다 위쪽에 다시 시도를 보여 준다(저장 오류와 구분)
  const loadFail = me.error ? <div className="flex items-center justify-between gap-3 rounded-element bg-red-soft p-3 text-label text-red"><span>판매자 정보를 불러오지 못했어요.</span><button type="button" className="shrink-0 font-bold underline" onClick={me.reload}>다시 시도</button></div> : null;
  // 실제 모드: 출고지·반품지는 판매자 주소록 API로 조회·추가·수정·삭제·기본 지정(mock은 아래 Figma 목업 화면)
  if (!USE_MOCK && section === 'addresses') return <AddressBookPage/>;
  if (!USE_MOCK && (section === 'ship-edit' || section === 'returns')) return <AddressBookFormPage fallback={section === 'returns' ? 'RETURN' : 'DISPATCH'}/>;
  // TODO(api-gap): 반품 택배사·집하 시간·반품/교환 배송비 저장 API 없음

  const change = (key: keyof SellerSettings, value: string) => setForm({ ...form, [key]: value });
  const inputField = (key: 'displayName' | 'bank' | 'account' | 'holder' | 'shippingPostal' | 'shippingAddress' | 'returnPostal' | 'returnAddress', label: string, extra?: { hint?: string; required?: boolean }) =>
    <Field label={label} hint={extra?.hint} required={extra?.required}><input aria-label={label} value={(form[key] as string) ?? ''} onChange={e => change(key, e.target.value)} className="field"/></Field>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); if (saving.current || section === 'business' && (core === baseCore || !USE_MOCK && (!me.data || me.loading || !!me.error))) return; saving.current = true; setError(''); setBusy(true);
    try {
      if (section === 'addresses' && (!form.shippingAddress.trim() || !form.returnAddress.trim())) throw new Error('출고지와 반품지 주소를 입력해 주세요.');
      if (section === 'returns' && !form.returnAddress.trim()) throw new Error('반품지 주소를 입력해 주세요.');
      if (section === 'account' || section === 'business') { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('올바른 이메일을 입력해 주세요.'); }
      if (!USE_MOCK) {
        if (section === 'business') await updateSellerContact({ sellerDisplayName: form.displayName, contactName: user.name, contactEmail: email, contactPhone: phone });
        else if (section === 'addresses' || section === 'returns') await updateSellerAddresses(form);
        else if (section === 'account') { await updateSellerContact({ sellerDisplayName: form.displayName, contactName: user.name, contactEmail: email, contactPhone: phone }); if (store.data) await updateSellerStore(intro); }
      }
      mutate(state => { state.sellerSettings[user.id] = form; const member = state.users.find(u => u.id === user.id)!; member.phone = phone; member.email = email; });
      setBaseCore(core); setBaseIntro(intro);
      toast('변경 내용을 저장했습니다.');
    } catch (e) { setError((e as Error).message); } finally { saving.current = false; setBusy(false); }
  };

  // ── 사업자 서류 · 담당자 정보 ──────────────────────────────
  if (section === 'business') return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <Header title="사업자 서류 · 담당자 정보"/>
      {loadFail}
      <section className="space-y-4">
        <h2 className="text-body font-bold text-muted">사업자 서류</h2>
        <div className="divider flex items-center gap-3 pb-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-element bg-canvas"><FileText size={18} className="muted"/></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><span className="text-callout font-bold">사업자등록증</span><span className="rounded-badge bg-green-soft px-1.5 py-0.5 text-caption font-bold text-green">확인 완료</span></div>
            <p className="muted mt-0.5 text-label">{USE_MOCK ? 'lomfield_biz.pdf · 2026.05.02 업로드' : '입점 신청 때 제출한 PDF'}</p>
          </div>
          {USE_MOCK && <button type="button" className="h-8 shrink-0 rounded-inner border border-line px-2.5 text-label font-bold">보기</button>}
        </div>
        {/* TODO(api-gap): 상호·대표자·등록번호·업태는 서버 응답에 없어 mock 표시 유지 */}
        {form.business && <div className="space-y-1.5 px-2 text-label">
          {form.business.name && <InfoRow label="상호" value={form.business.name}/>}
          {form.business.registrationNumber && <InfoRow label="사업자등록번호" value={form.business.registrationNumber}/>}
          {form.business.representative && <InfoRow label="대표자" value={form.business.representative}/>}
          {form.business.businessType && <InfoRow label="업태 · 종목" value={form.business.businessType}/>}
        </div>}
      </section>
      <div className="-mx-4 h-px bg-line"/>
      <section className="space-y-4">
        <h2 className="text-body font-bold text-muted">담당자 정보</h2>
        <Field label="담당자 이름" required><input aria-label="담당자 이름" className="field-line" value={user.name} readOnly/></Field>
        <Field label="연락처" required hint="출고 · 정산 관련 긴급 연락에 사용돼요."><input aria-label="연락처" className="field-line" value={phone} onChange={e => setPhone(e.target.value)} type="tel"/></Field>
        <Field label="업무 이메일" required><input aria-label="업무 이메일" className="field-line" value={email} onChange={e => setEmail(e.target.value)} type="email"/></Field>
      </section>
      <ErrorBox message={error}/>
      {(core !== baseCore) && <div className="seller-action-enter"><Button type="submit" className="w-full" disabled={busy || !USE_MOCK && (!me.data || me.loading || !!me.error)}>{busy ? '저장 중…' : '저장하기'}</Button></div>}
    </form>
  );

  // ── 출고지 · 반품지 관리 ────────────────────────────────────
  if (section === 'addresses') return (
    <div className="space-y-0">
      <Header title="출고지 · 반품지 관리"/>
      <div className="mb-4 flex border-b border-line">
        {(['ship', 'return'] as const).map((t, i) => (
          <button key={t} onClick={() => setAddrTab(t)} className={`flex-1 border-b-2 py-3 text-body font-bold ${addrTab === t ? 'border-ink' : 'border-transparent muted'}`}>
            {USE_MOCK ? (t === 'ship' ? '출고지 2' : '반품지 1') : t === 'ship' ? '출고지' : '반품지'}
          </button>
        ))}
      </div>
      {addrTab === 'ship' && (
        <div className="space-y-3">
          {(USE_MOCK ? [
            { name: '성수 물류창고', isDefault: true, address: '서울 성동구 성수이로 118, 3층 (04782)', person: '김서윤 · 010-2481-****' },
            { name: '파주 보관센터', isDefault: false, address: '경기 파주시 문발로 242, B동 (10881)', person: '박도현 · 031-944-****' },
          ] : form.shippingAddress ? [{ name: '기본 출고지', isDefault: true, address: form.shippingAddress, person: [user.name, phone].filter(Boolean).join(' · ') }] : []).map(loc => (
            <div key={loc.name} className="rounded-dialog border border-line p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-callout font-bold">{loc.name}</p>
                  {loc.isDefault && <span className="rounded-full bg-canvas px-2 py-0.5 text-caption font-bold">기본</span>}
                </div>
                <div className="flex gap-2">
                  {!loc.isDefault && <button className="muted text-label">기본 설정</button>}
                  <Link to="/seller/settings/ship-edit" className="text-label font-bold">수정</Link>
                  {!loc.isDefault && <button onClick={() => setDeleteConfirm(true)} className="text-label text-red">삭제</button>}
                </div>
              </div>
              <p className="muted text-label">{loc.address}</p>
              <p className="muted text-label">{loc.person}</p>
            </div>
          ))}
          <button className="btn btn-outline w-full">출고지 추가</button>
        </div>
      )}
      {addrTab === 'return' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="muted text-label">반품지를 기본 출고지와 동일하게</p>
            <button onClick={() => { change('returnAddress', form.shippingAddress); setForm(f => ({ ...f, returnPostal: f.shippingPostal })); toast('반품지를 출고지와 동일하게 설정했습니다.'); }} className="muted text-label underline">적용</button>
          </div>
          <div className="rounded-dialog border border-line p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-callout font-bold">{USE_MOCK ? '성수 물류창고' : '기본 반품지'}</p>
                {(USE_MOCK || (!!form.returnAddress && form.returnAddress === form.shippingAddress)) && <span className="rounded-full bg-green-soft px-2 py-0.5 text-caption font-bold text-green">출고지와 동일</span>}
              </div>
              <div className="flex gap-2">
                <Link to="/seller/settings/returns" className="text-label font-bold">수정</Link>
                <button className="text-label text-red">삭제</button>
              </div>
            </div>
            <p className="muted text-label">{USE_MOCK ? '서울 성동구 성수이로 118, 3층 (04782)' : form.returnAddress || '-'}</p>
            <p className="muted text-label">{USE_MOCK ? '김서윤 · 010-2481-****' : [user.name, phone].filter(Boolean).join(' · ')}</p>
          </div>
          <Button outline to="/seller/settings/returns" className="block w-full text-center">반품지 추가</Button>
        </div>
      )}
      {USE_MOCK && <div className="mt-6 rounded-dialog bg-canvas p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-callout font-bold">반품 · 교환 설정</p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-callout">반품지를 기본 출고지와 동일하게</p><p className="muted text-label">성수 물류창고로 반품을 받아요</p></div>
          <Toggle label="반품지를 기본 출고지와 동일하게" checked={!form.returnAddress || form.returnAddress === form.shippingAddress} onChange={on => change('returnAddress', on ? form.shippingAddress ?? '' : '파주 보관센터')}/>
        </div>
      </div>}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{background:'rgba(0,0,0,0.45)'}} onClick={e => e.target === e.currentTarget && setDeleteConfirm(false)}>
          <div className="mx-4 w-full max-w-[318px] rounded-dialog bg-surface p-5 space-y-4">
            <h2 className="text-title-sm font-bold">출고지를 삭제할까요?</h2>
            <p className="text-body text-muted">이 출고지로 지정된 판매 예정 드롭 1건은<br/>기본 출고지(성수 물류창고)로 바뀌어요.</p>
            <div className="rounded-inner bg-canvas p-3 space-y-1">
              <p className="text-body font-bold">파주 보관센터</p>
              <p className="muted text-label">[10881] 경기 파주시 문발로 242, B동</p>
            </div>
            <div className="flex gap-2">
              <Button outline className="flex-1" onClick={() => setDeleteConfirm(false)}>취소</Button>
              <Button className="flex-1" onClick={() => { toast('출고지를 삭제했습니다.'); setDeleteConfirm(false); }}>삭제</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ── 출고지 수정 ──────────────────────────────────────────────
  if (section === 'ship-edit') return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <Header title="출고지 수정"/>
      <Field label="출고지명"><input aria-label="출고지명" className="field" defaultValue={USE_MOCK ? '성수 물류창고' : '기본 출고지'}/></Field>
      <Field label="출고 담당자" required><input aria-label="출고 담당자" className="field" value={user.name} readOnly/></Field>
      <Field label="연락처" required><input aria-label="연락처" className="field" value={phone} onChange={e => setPhone(e.target.value)} type="tel"/></Field>
      <Field label="주소" required>
        <div className="space-y-2">
          <div className="flex gap-2">
            <input aria-label="우편번호" className="field flex-1" defaultValue={USE_MOCK ? '04782' : form.shippingPostal ?? ''} readOnly/>
            <Button outline className="shrink-0 text-label!">주소 검색</Button>
          </div>
          <input aria-label="도로명 주소" className="field" defaultValue={USE_MOCK ? '서울특별시 성동구 성수이로 118' : form.shippingAddress}/>
          <input aria-label="상세 주소" className="field" defaultValue={USE_MOCK ? '3층 물류팀' : form.shippingDetail ?? ''}/>
        </div>
      </Field>
      <Field label="택배 집하 시간">
        <select aria-label="택배 집하 시간" defaultValue="평일 16:00" className="field">
          {['평일 14:00', '평일 15:00', '평일 16:00 · CJ대한통운', '평일 17:00'].map(t => <option key={t}>{t}</option>)}
        </select>
      </Field>
      <label className="flex items-center gap-3">
        <input type="checkbox" className="h-4 w-4" defaultChecked/>
        <div>
          <p className="text-body font-bold">기본 출고지로 설정</p>
          <p className="muted text-footnote">새 드롭 상품의 출고지로 자동 지정돼요</p>
        </div>
      </label>
      <ErrorBox message={error}/>
      <Button type="submit" className="w-full" disabled={busy}>{busy ? '저장 중…' : '저장하기'}</Button>
    </form>
  );

  // ── 반품지 관리 (별도 페이지) ───────────────────────────────
  if (section === 'returns') return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <Header title="반품지 추가"/>
      <div className="flex items-center gap-3 rounded-dialog bg-canvas p-3">
        <div className="flex-1">
          <p className="text-body font-bold">반품지를 기본 출고지와 동일하게</p>
          <p className="muted text-footnote">{USE_MOCK ? '성수 물류창고' : '기본 출고지'} 주소를 그대로 불러와요</p>
        </div>
        <Toggle label="반품지를 기본 출고지와 동일하게" checked={sameAsShip} onChange={on => { setSameAsShip(on); if (on) setForm(f => ({ ...f, returnAddress: f.shippingAddress, returnPostal: f.shippingPostal })); }}/>
      </div>
      <Field label="반품지명" required><input aria-label="반품지명" className="field" value={form.returnAddress ? (USE_MOCK ? '파주 보관센터' : '기본 반품지') : ''} onChange={() => {}} placeholder={USE_MOCK ? '파주 보관센터' : '반품지명'}/></Field>
      <Field label="반품 담당자" required><input aria-label="반품 담당자" className="field" value={user.name} readOnly/></Field>
      <Field label="연락처" required hint="반품 · 교환 관련 연락에 사용돼요."><input aria-label="연락처" className="field" value={phone} onChange={e => setPhone(e.target.value)} type="tel"/></Field>
      <Field label="주소" required>
        <div className="space-y-2">
          <div className="flex gap-2">
            <input aria-label="우편번호" className="field flex-1" value={form.returnPostal ?? ''} onChange={e => change('returnPostal', e.target.value)} placeholder="10881"/>
            <Button outline className="shrink-0 text-label!">주소 검색</Button>
          </div>
          <input aria-label="도로명 주소" className="field" value={form.returnAddress ?? ''} onChange={e => change('returnAddress', e.target.value)} placeholder="경기 파주시 문발로 242"/>
          <input aria-label="상세 주소" className="field" placeholder="B동"/>
        </div>
      </Field>
      <div className="flex items-center gap-3 rounded-dialog bg-canvas p-3">
        <div className="flex-1">
          <p className="text-body font-bold">기본 반품지로 설정</p>
          <p className="muted text-footnote">구매자 반품 접수 시 이 주소로 안내돼요</p>
        </div>
        <Toggle label="기본 반품지로 설정" checked={defaultReturn} onChange={setDefaultReturn}/>
      </div>
      <ErrorBox message={error}/>
      <Button type="submit" className="w-full" disabled={busy}>{busy ? '저장 중…' : '저장하기'}</Button>
    </form>
  );

  // ── 계정 설정 (account) ─────────────────────────────────────
  if (section === 'account') return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <Header title="계정 설정"/>
      {loadFail}
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          {logoUrl ? <img src={logoUrl} alt="스토어 로고" className="h-16 w-16 rounded-dialog object-cover"/> : <div className="grid h-16 w-16 place-items-center rounded-dialog bg-ink text-heading-lg font-bold text-white">{(form.displayName || user.name).trim().charAt(0) || 'S'}</div>}
          {!USE_MOCK && <input id="seller-logo-file" type="file" accept="image/png,image/jpeg" hidden onChange={e => { changeLogo(e.target.files?.[0]); e.target.value = ''; }}/>}
          <button type="button" aria-label="로고 변경" onClick={() => document.getElementById('seller-logo-file')?.click()} className="absolute -bottom-1 -right-1 grid h-6.5 w-6.5 place-items-center rounded-full border border-line bg-surface">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="2.5" width="11" height="8.5" rx="1.5" stroke="#7B7B7B" strokeWidth="1.2"/><path d="M4.5 2.5V2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v.5" stroke="#7B7B7B" strokeWidth="1.2"/><circle cx="6.5" cy="6.75" r="1.75" stroke="#7B7B7B" strokeWidth="1.2"/></svg>
          </button>
        </div>
        <div className="space-y-1">
          <p className="text-callout font-bold">스토어 로고</p>
          <p className="muted text-label">사업자 프로필을 등록할 수 있습니다.</p>
          {logoUrl && <button type="button" className="text-label font-bold underline" onClick={removeLogo}>로고 삭제</button>}
        </div>
      </div>
      <Field label="스토어 이름" required>
        <div className="relative">
          <input aria-label="스토어 이름" className="field-line pr-10" value={form.displayName ?? ''} onChange={e => change('displayName', e.target.value)}/>
          <button type="button" aria-label="지우기" onClick={() => change('displayName', '')} className="absolute right-3 top-1/2 -translate-y-1/2"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#949494" strokeWidth="1.2"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#949494" strokeWidth="1.2" strokeLinecap="round"/></svg></button>
        </div>
        <p className="muted mt-1 text-label">이름 변경은 30일에 한 번 가능해요</p>
      </Field>
      <Field label="스토어 한 줄 소개">
        <div className="relative">
          <input aria-label="스토어 한 줄 소개" className="field-line pr-14" placeholder="오래 입는 기본 니트를 만듭니다" maxLength={40} value={intro} onChange={e => setIntro(e.target.value)}/>
          <span className="muted absolute right-3 top-1/2 -translate-y-1/2 text-label">{intro.length}/40</span>
        </div>
      </Field>
      <ErrorBox message={error}/>
      {(core !== baseCore || intro !== baseIntro) && <div className="seller-action-enter"><Button type="submit" className="w-full" disabled={busy || (!USE_MOCK && (!store.data || store.loading || !!store.error))}>{busy ? '저장 중…' : '저장하기'}</Button></div>}
      {store.error && <LiveStatus state={store}/>}
      <div className="h-px bg-line"/>
      <h2 className="text-body font-bold text-muted">로그인 정보</h2>
      <div className="divider flex items-center justify-between py-4">
        <span className="text-subhead">로그인 이메일</span>
        <div className="flex items-center gap-2">
          <span className="muted text-label">{user.email}</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="4" width="11" height="8" rx="1.5" stroke="#949494" strokeWidth="1.2"/><path d="M3 4V3a3 3 0 0 1 6 0v1" stroke="#949494" strokeWidth="1.2"/></svg>
        </div>
      </div>
      <div className="divider flex items-center justify-between py-4">
        <span className="text-subhead">비밀번호 변경</span>
        <div className="flex items-center gap-2">
          {USE_MOCK && <span className="muted text-label">마지막 변경 2026.08.12</span>}
          <ChevronRight size={16} className="muted"/>
        </div>
      </div>
      <ErrorBox message={error}/>
      <div className="flex gap-4 justify-center pt-2 text-label">
        <LogoutButton/>
        <Link to="/seller/settings/withdraw" className="muted py-4 text-label underline underline-offset-4">계정 탈퇴</Link>
      </div>
    </form>
  );

  // ── 회원 탈퇴 ───────────────────────────────────────────────
  if (section === 'withdraw') return <WithdrawForm/>;
  // 그 밖의 주소(예전 로컬 전용 판매자 알림 설정 등)는 마이페이지로 보낸다. 알림 설정은 공통 화면(SETTINGS_HREF)을 쓴다
  return <Navigate to="/my" replace/>;
}
export function SellerSupportPage() {
  return (
    <div className="space-y-0">
      <Header title="이용 안내 · 고객지원"/>
      <label className="mb-5 flex h-10 items-center gap-2.5 rounded-element bg-canvas px-3.5">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="muted shrink-0"><circle cx="8" cy="8" r="6" stroke="#949494" strokeWidth="1.5"/><path d="M13 13l3 3" stroke="#949494" strokeWidth="1.5" strokeLinecap="round"/></svg>
        <input aria-label="고객지원 검색" placeholder="정산, 출고, 판매 심사 기준 검색" className="min-w-0 flex-1 bg-transparent text-subhead outline-none placeholder:text-muted" readOnly/>
      </label>
      <section className="mb-5 space-y-3">
        <h2 className="text-subhead font-bold">판매 가이드</h2>
        <div className="grid grid-cols-3 gap-2">{([[Rocket, '첫 드롭\n등록하기', '등록부터\n승인까지 5단계'], [ScanSearch, '판매 심사 기준', '반려 없이 통과하는\n사진 · 상태'], [Truck, '출고 · 배송\n규칙', '결제 후 48시간\n내 출고']] as const).map(([Icon, title, desc]) => (
          <div key={title} className="rounded-dialog bg-canvas p-3">
            <Icon size={18} strokeWidth={1.6}/>
            <p className="mt-3 whitespace-pre-line text-body font-bold leading-snug">{title}</p>
            <p className="muted mt-1 whitespace-pre-line text-footnote leading-snug">{desc}</p>
          </div>
        ))}</div>
      </section>
      <div className="mb-5 h-px bg-line"/>
      <section className="mb-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-subhead font-bold">판매자 자주 묻는 질문</h2>
          <Link to="/faq?for=seller" className="muted text-label">전체보기</Link>
        </div>
        <FaqList items={SELLER_FAQ_ITEMS} accent/>
      </section>
      <div className="mb-5 h-px bg-line"/>
      <section className="mb-5 space-y-3">
        <h2 className="text-subhead font-bold">정책</h2>
        {[['판매자 이용약관', '/seller/terms'], ['판매 수수료 안내', '/seller/terms'], ['운영 정책 · 패널티 기준', '/seller/terms']].map(([label, to]) => (
          <Link key={label} to={to} className="divider flex h-13 items-center justify-between">
            <span className="text-body">{label}</span>
            <span className="muted text-label">{label === '판매 수수료 안내' ? '상품별 한정 수량 90% 초과 판매 시 판매 금액의 10%, 그 외 0% (배송비 제외)' : ''}<ChevronRight size={16} className="inline muted ml-1"/></span>
          </Link>
        ))}
      </section>
      <div className="rounded-dialog bg-canvas p-4 space-y-3">
        <p className="text-callout font-bold">원하는 답을 못 찾으셨나요?</p>
        <div className="flex gap-2">
          <Button outline to="/inquiries/compose" className="flex-1 text-label!">1:1 문의하기</Button>
          <Button outline to="/inquiries" className="flex-1 text-label!">내 문의 내역</Button>
        </div>
      </div>
    </div>
  );
}
/** 판매자 약관 체크 상태. '보기'로 약관 페이지에 다녀와도 유지되도록 이 탭이 열려 있는 동안 기억한다 */
const SELLER_TERMS_KEY = 'stockdrop:seller-terms-checks';
export function TermsPage() {
  const navigate = useNavigate();
  const [checks, setChecksState] = useState<Record<string, boolean>>(() => { try { const v = JSON.parse(sessionStorage.getItem(SELLER_TERMS_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } });
  const setChecks = (next: Record<string, boolean>) => { setChecksState(next); try { sessionStorage.setItem(SELLER_TERMS_KEY, JSON.stringify(next)); } catch { /* 저장이 막혀도 화면 상태는 유지 */ } };
  const items: [string, string, boolean][] = [['terms', '판매자 이용약관', true], ['fee', '정산 및 판매 수수료 정책', true], ['operation', '한정 판매 운영 정책', true], ['privacy', '개인정보 수집·이용 동의', true], ['marketing', '판매 알림·혜택 정보 수신', false]];
  const allRequired = items.filter(([,, r]) => r).every(([k]) => checks[k]);
  const allChecked = items.every(([k]) => checks[k]);
  return <div className="space-y-5"><Header title="판매자 약관 동의"/><div className="space-y-2"><p className="text-caption font-bold tracking-[1px]">STOCKDROP PARTNERS</p><h1 className="text-heading font-bold leading-[1.5] tracking-[-1px]">심사 요청 전에<br/>판매자 약관을 확인해 주세요</h1><p className="muted text-label leading-relaxed">한정 수량 선착순 판매는 구매자와의 약속이에요.<br/>운영 정책을 꼭 읽고 동의해 주세요.</p></div><label className="divider flex items-center gap-3 py-3 text-callout font-bold"><input type="checkbox" className="h-5 w-5" checked={allChecked} onChange={() => { const next = !allChecked; const obj: Record<string, boolean> = {}; items.forEach(([k]) => { obj[k] = next; }); setChecks(obj); }}/>전체 동의하기</label>{items.map(([key, label, required]) => <div key={key} className="divider flex items-center gap-2 py-3 text-label"><label className="flex flex-1 items-center gap-3"><input type="checkbox" className="h-4 w-4 shrink-0" checked={checks[key] ?? false} onChange={e => setChecks({ ...checks, [key]: e.target.checked })}/><span>{required ? '필수' : '선택'} {'  '}{label}</span></label><Link to="/legal" className="muted shrink-0 text-footnote underline">보기</Link></div>)}<Note title="한정 판매 운영 정책 요약"><p className="mb-2"><b>01</b> {'  '}판매가 시작되면 한정 수량과 가격을 변경할 수 없어요.</p><p className="mb-2"><b>02</b> {'  '}결제 완료 후 2영업일 이내에 출고해야 해요.</p><p><b>03</b> {'  '}출고 지연·품절 취소가 반복되면 판매가 제한될 수 있어요.</p></Note><Button className="w-full" disabled={!allRequired} onClick={() => navigate('/apply')}>동의하고 심사 요청하기</Button></div>;
}

/** 회원 탈퇴 — 실제 모드: 탈퇴 가능 여부 조회 후 DELETE /v1/accounts/me, 성공하면 로그아웃과 같이 로컬 세션을 끝낸다. mock 모드는 기존 토스트만 */
function WithdrawForm() {
  const toast = useToast(), navigate = useNavigate();
  const [reason, setReason] = useState('사용 빈도가 낮아요'), [password, setPassword] = useState(''), [agree, setAgree] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  // 작성 중: 탈퇴 사유를 바꿨거나 비밀번호, 동의를 입력했을 때
  const leave = useLeaveGuard(reason !== '사용 빈도가 낮아요' || !!password || agree);
  const elig = useApi(signal => (USE_MOCK ? Promise.resolve(null) : fetchWithdrawalEligibility(signal)), []);
  const e = elig.data;
  const canWithdraw = !!e && e.verified && e.canWithdraw; // verified=false면 탈퇴 가능으로 해석하지 않는다
  const count = (n: number | null | undefined) => (n == null ? '확인 불가' : n ? `${n}건` : '없음');
  const rows = e ? [['진행 중인 주문', count(e.activeOrders)], ['정산 대기', count(e.pendingSettlements)], ['판매 중인 드롭', count(e.activeSales)]] : [['진행 중인 주문', '없음'], ['정산 대기 금액', '0원'], ['판매 중인 드롭', '없음']];
  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (USE_MOCK) { toast('탈퇴 처리 중입니다.'); return; }
    if (!agree) { setError('안내 사항 확인에 동의해 주세요.'); return; }
    if (!password) { setError('비밀번호를 입력해 주세요.'); return; }
    setBusy(true); setError('');
    try { await withdrawAccount(password, reason); api.setAccessToken(null); mutate(endSession); toast('탈퇴가 완료되었습니다.'); leave.allowLeave(); navigate('/', { replace: true }); }
    catch (x) { setError(errorMessage(x)); } finally { setBusy(false); }
  };
  return (
    <form className="space-y-5" onSubmit={submit}>
      <Header title="회원 탈퇴"/>
      {!USE_MOCK && <LiveStatus state={elig}/>}
      <h2 className="text-title font-bold">탈퇴 전에 꼭 확인해 주세요.</h2>
      <div className="rounded-dialog bg-canvas p-4 space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-body">{label}</span>
            <span className="muted text-body">{value}</span>
          </div>
        ))}
      </div>
      <Note>진행 중인 거래가 있으면 완료된 뒤에 탈퇴할 수 있어요</Note>
      <div className="space-y-3">
        <p className="text-body font-bold">탈퇴하면 이렇게 돼요</p>
        {['계정 정보, 배송지, 알림 설정이 바로 삭제돼요', '보유한 적립금과 쿠폰은 소멸되고 복구할 수 없어요', '주문·결제 기록은 관계 법령에 따라 5년간 보관돼요', '같은 이메일로는 30일 후에 다시 가입할 수 있어요'].map(text => (
          <div key={text} className="flex items-start gap-2">
            <span className="mt-0.5 text-muted">·</span>
            <p className="text-body leading-relaxed">{text}</p>
          </div>
        ))}
      </div>
      <Field label="탈퇴 사유">
        <select aria-label="탈퇴 사유" className="field" value={reason} onChange={e => setReason(e.target.value)}><option>사용 빈도가 낮아요</option><option>다른 사유</option></select>
      </Field>
      <Field label="비밀번호 확인" required><input aria-label="비밀번호 확인" className="field" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}/></Field>
      <label className="flex items-center gap-3">
        <input type="checkbox" className="h-4 w-4" checked={agree} onChange={e => setAgree(e.target.checked)}/>
        <span className="text-body">안내 사항을 모두 확인했고 탈퇴에 동의해요</span>
      </label>
      <ErrorBox message={error}/>
      <Button type="submit" className="w-full" disabled={busy || (!USE_MOCK && !canWithdraw)}>{busy ? '처리 중…' : '탈퇴하기'}</Button>
    </form>
  );
}
