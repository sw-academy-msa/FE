/**
 * 회원제와 쿠폰 화면 조각. 기존 화면(마이페이지, 상품 상세, 옵션 선택, 결제, 주문 상세)에 끼워 넣기만 한다.
 * 플래그(features.ts MEMBERSHIP_COUPON)가 꺼져 있으면 아무것도 그리지 않는다. 금액은 서버 값만 쓰고 화면에서 할인액을 만들지 않는다(옵션 시트의 예상 할인만 서버 예상값).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Ticket, Truck } from 'lucide-react';
import { Badge, Button, Empty, ErrorBox, InfoRow, LiveStatus, Modal, Spinner, useToast } from '../components/ui';
import { api } from '../api/client';
import { errorMessage } from '../api/errors';
import { useApi } from '../api/hooks';
import { claimCampaign, claimError, couponConditionLabel, couponCountLabel, couponDiscountLabel, expiringSoon, getCampaign, listApplicableCoupons, listMyCoupons, COUPON_PAGE_SIZE } from '../api/coupons';
import type { ApplicableCouponDto, CouponDto, CouponTab } from '../api/coupons';
import { getMembership, getMembershipBilling, getMembershipConfiguration, membershipView, requestMembershipCancellation } from '../api/membership';
import type { MembershipBillingDto, MembershipDto, MembershipView } from '../api/membership';
import { MEMBERSHIP_COUPON, PENDING_CONTRACTS } from '../features';
import { membershipTermsFor } from '../membershipTerms';
import { trackBeginCheckout, trackCouponClaim, trackCouponUse, trackItemList, trackSearch, trackSelectItem, trackSelectPromotion, trackSoldOut, trackViewPromotion } from '../behavior';
import type { TrackProduct } from '../behavior';
import { loginHref, signedIn } from '../auth';
import { money } from '../domain';
import type { OrderAmounts, Product } from '../domain';
import { useStore } from '../store';

/* ── 날짜(한국 시간) ── */
const KST = 'Asia/Seoul';
const parts = (iso: string) => Object.fromEntries(new Intl.DateTimeFormat('ko-KR', { timeZone: KST, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map(p => [p.type, p.value]));
/** 2026.12.25 */
export const ymd = (iso: string | null | undefined) => { if (!iso || !Number.isFinite(Date.parse(iso))) return '-'; const p = parts(iso); return `${p.year}.${p.month.padStart(2, '0')}.${p.day.padStart(2, '0')}`; };
/** 12월 25일 */
export const md = (iso: string | null | undefined) => { if (!iso || !Number.isFinite(Date.parse(iso))) return '-'; const p = parts(iso); return `${p.month}월 ${p.day}일`; };
/** 2026.11.29 23:59 */
const ymdhm = (iso: string | null | undefined) => { if (!iso || !Number.isFinite(Date.parse(iso))) return '-'; const p = parts(iso); return `${ymd(iso)} ${p.hour}:${p.minute}`; };

/* ── 멤버십 상태(화면 사이 공유, 계정별 1회 조회) ── */
interface MembershipSnap { account?: string; status: 'idle' | 'loading' | 'ready' | 'failed'; membership?: MembershipDto; billing?: MembershipBillingDto | null; error: string }
let snap: MembershipSnap = { status: 'idle', error: '' };
const listeners = new Set<() => void>();
const setSnap = (patch: Partial<MembershipSnap>) => { snap = { ...snap, ...patch }; listeners.forEach(l => l()); };
async function loadMembership(account: string, force = false) {
  if (!force && snap.account === account && (snap.status === 'loading' || snap.status === 'ready')) return;
  setSnap({ account, status: 'loading', error: '', ...(snap.account === account ? {} : { membership: undefined, billing: undefined }) });
  try {
    const membership = await getMembership();
    // 자격이 없을 때만 금융 상태를 본다(가입 확인 중 판단). 실패해도 비회원 카드로 보여 준다
    const billing = membership.active ? null : await getMembershipBilling().catch(() => null);
    if (snap.account === account) setSnap({ status: 'ready', membership, billing });
  } catch (e) { if (snap.account === account) setSnap({ status: 'failed', error: errorMessage(e) }); }
}
/** 로그인한 구매자(운영자 제외)의 계정 ID */
function useBuyerAccount() {
  const s = useStore();
  if (!MEMBERSHIP_COUPON || !signedIn(s) || s.users.find(u => u.id === s.activeUserId)?.admin) return undefined;
  return s.activeUserId;
}
export function useMembership() {
  const account = useBuyerAccount();
  const cur = useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, () => snap, () => snap);
  useEffect(() => { if (account) void loadMembership(account); }, [account]);
  const mine = account && cur.account === account ? cur : undefined;
  return { account, loading: !mine || mine.status === 'loading' || mine.status === 'idle', error: mine?.status === 'failed' ? mine.error : '', membership: mine?.membership, billing: mine?.billing, view: mine?.membership ? membershipView(mine.membership, mine.billing) : undefined, reload: () => { if (account) void loadMembership(account, true); } };
}

/* ── 공통 조각 ── */
const CHEVRON = <ChevronRight size={17} className="muted shrink-0" aria-hidden/>;
function RowButton({ label, right, onClick }: { label: string; right?: ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="divider flex min-h-13 w-full items-center gap-3 text-left"><span className="min-w-0 flex-1 text-body">{label}</span>{right && <span className="muted shrink-0 text-label">{right}</span>}{CHEVRON}</button>;
}
const MEMBER_COUPON_TEXT = '매달 3,000원 쿠폰';
const MEMBER_COUPON_DETAIL = '1만 원 이상 구매 시';

/* ── 마이페이지: 멤버십 카드 + 내 쿠폰 행 + 시트(가입, 관리, 내 쿠폰) ── */
type Sheet = '' | 'join' | 'manage' | 'coupons';
/** 주문·배송 조회 바로 아래에 넣는다. 알림 딥링크: ?membership=manage|join, ?coupons=available|used|expired */
export function MembershipCouponSection() {
  const ms = useMembership(); const [params, setParams] = useSearchParams();
  const [sheet, setSheet] = useState<Sheet>(''), [couponTab, setCouponTab] = useState<CouponTab>('AVAILABLE');
  const first = useApi(signal => (ms.account ? listMyCoupons('AVAILABLE', 0, signal) : Promise.resolve([] as CouponDto[])), [ms.account]);
  useEffect(() => {
    if (!ms.account) return;
    const m = params.get('membership'), c = params.get('coupons');
    if (!m && !c) return;
    if (m) setSheet(m === 'join' ? 'join' : 'manage');
    else { setCouponTab(c === 'used' ? 'USED' : c === 'expired' ? 'EXPIRED' : 'AVAILABLE'); setSheet('coupons'); }
    const next = new URLSearchParams(params); next.delete('membership'); next.delete('coupons'); setParams(next, { replace: true });
  }, [ms.account, params]);
  if (!ms.account) return null;
  // 관리 시트를 비회원이 열면(알림 등) 가입 시트로
  const shown: Sheet = sheet === 'manage' && ms.view === 'none' ? 'join' : sheet;
  const close = () => setSheet('');
  const list = first.data ?? [];
  const usable = list.filter(c => c.status === 'ISSUED');
  const soon = usable.filter(c => expiringSoon(c.validUntil)).length;
  const couponRight = first.loading ? '' : first.error ? '다시 보기' : list.length ? `${couponCountLabel(usable.length)}${soon ? ` · 곧 만료 ${soon}장` : ''}` : '0장';
  return <>
    <MembershipCard ms={ms} onJoin={() => setSheet('join')} onManage={() => setSheet('manage')}/>
    <RowButton label="내 쿠폰" right={couponRight} onClick={() => { setCouponTab('AVAILABLE'); setSheet('coupons'); }}/>
    {shown === 'join' && <MembershipJoinSheet onClose={close}/>}
    {shown === 'manage' && ms.membership && <MembershipManageSheet ms={ms} couponRight={couponRight} onCoupons={() => { setCouponTab('AVAILABLE'); setSheet('coupons'); }} onClose={close}/>}
    {shown === 'manage' && !ms.membership && <Modal title="멤버십 관리" onClose={close}><LiveStatus state={{ loading: ms.loading, error: ms.error, reload: ms.reload }}/></Modal>}
    {shown === 'coupons' && <MyCouponsSheet initialTab={couponTab} onClose={() => { close(); first.reload(); }}/>}
  </>;
}

function MembershipCard({ ms, onJoin, onManage }: { ms: ReturnType<typeof useMembership>; onJoin: () => void; onManage: () => void }) {
  const config = useApi(signal => (ms.view === 'none' ? getMembershipConfiguration(signal) : Promise.resolve(null)), [ms.view]);
  const label = <p className="muted text-caption">STOCKDROP 멤버십</p>;
  if (ms.error && !ms.membership) return <section className="note space-y-3">{label}<p className="text-label">멤버십 상태를 확인하지 못했어요.</p><Button outline className="w-full" onClick={ms.reload}>다시 시도</Button></section>;
  if (!ms.membership) return <section className="note space-y-3" aria-busy="true">{label}<div className="flex justify-center py-3"><Spinner/></div></section>;
  const m = ms.membership, view = ms.view as MembershipView, price = m.amount || config.data?.amount || 0;
  if (view === 'none') return <section className="note space-y-3" aria-label="STOCKDROP 멤버십">{label}<h2 className="text-heading font-bold leading-snug">{config.data ? <>월 {money(config.data.amount)}으로<br/></> : null}배송비 걱정 없이</h2><div><InfoRow label="배송비" value="모든 주문 무료"/><InfoRow label="회원 전용 쿠폰" value={MEMBER_COUPON_TEXT}/></div><Button className="w-full" onClick={onJoin}>혜택 확인하고 가입하기</Button></section>;
  if (view === 'pending') return <section className="note space-y-3" aria-label="STOCKDROP 멤버십">{label}<h2 className="text-heading font-bold">가입을 확인하고 있어요</h2><p className="muted text-label">카드 등록은 끝났어요. 혜택이 반영되기까지 잠시 걸릴 수 있어요.</p><Button outline className="w-full" onClick={ms.reload}>새로고침</Button></section>;
  if (view === 'grace') return <section className="note space-y-3" aria-label="STOCKDROP 멤버십">{label}<div className="flex flex-wrap items-center gap-2"><h2 className="text-heading font-bold">결제에 실패했어요</h2><Badge red>유예 중</Badge></div><div><InfoRow label="혜택 유지" value={`${ymd(m.entitlementUntil)}까지`}/></div><p className="muted text-label">결제를 다시 시도하고 있어요. 유예 기간이 끝날 때까지 결제되지 않으면 혜택이 멈춰요.</p>{PENDING_CONTRACTS.cardReRegister && <Button className="w-full" disabled>카드 다시 등록하기</Button>}<Button outline className="w-full" onClick={onManage}>멤버십 관리</Button></section>;
  if (view === 'cancelScheduled') return <section className="note space-y-3" aria-label="STOCKDROP 멤버십">{label}<div className="flex flex-wrap items-center gap-2"><h2 className="text-heading font-bold">{md(m.entitlementUntil)}까지 이용</h2><Badge>해지 예약</Badge></div><div><InfoRow label="다음 결제" value="없음"/><InfoRow label="이용 기한" value={`${ymd(m.entitlementUntil)}까지`}/></div><p className="muted text-label">기한까지 무료배송과 받은 쿠폰을 그대로 쓸 수 있어요.</p>{PENDING_CONTRACTS.resumeCancel && <Button outline className="w-full" disabled>해지 취소하기</Button>}<Button outline className="w-full" onClick={onManage}>멤버십 관리</Button></section>;
  return <section className="note space-y-3" aria-label="STOCKDROP 멤버십">{label}<h2 className="text-heading font-bold">멤버십 이용 중</h2><p className="text-label">무료배송 · 회원 전용 쿠폰</p><div><InfoRow label="다음 결제" value={`${md(m.periodEnd)}${price ? ` · ${money(price)}` : ''}`}/></div><Button className="w-full" onClick={onManage}>멤버십 관리</Button></section>;
}

/** 15 가입 시트: 요금과 약관 버전은 서버 configuration, 약관 본문은 FE 고정 문구(같은 버전만). 카드 등록은 귀환 처리 계약이 오면 연결 */
function MembershipJoinSheet({ onClose }: { onClose: () => void }) {
  const config = useApi(signal => getMembershipConfiguration(signal), []);
  const [agreed, setAgreed] = useState(false);
  const terms = membershipTermsFor(config.data?.termsVersion);
  return <Modal title="STOCKDROP 멤버십" onClose={onClose}><div className="space-y-4">
    <h3 className="text-heading font-bold leading-snug">자주 만나는 드롭,<br/>배송비 부담 없이.</h3>
    {config.data ? <div className="rounded-inner bg-soft p-4"><p className="font-number text-title font-bold">월 {money(config.data.amount)}</p><p className="muted mt-2 text-label">매월 같은 날 정기결제돼요.</p></div> : <LiveStatus state={config}/>}
    <div><div className="divider flex min-h-13 items-center justify-between gap-3"><span className="text-body">무료배송</span><span className="muted text-label">모든 주문 배송비 0원</span></div><div className="divider flex min-h-13 items-center justify-between gap-3"><span className="text-body">회원 전용 쿠폰</span><span className="muted text-right text-label">{MEMBER_COUPON_TEXT}<br/>{MEMBER_COUPON_DETAIL}</span></div></div>
    <p className="muted text-footnote">쿠폰별 적용 상품과 사용 조건은 다를 수 있어요.</p>
    {config.data && !terms && <ErrorBox message="약관을 확인하지 못했어요. 잠시 후 다시 시도해 주세요."/>}
    {terms && <><label className="flex items-start gap-3 text-label leading-relaxed"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-1 h-4 w-4"/>[필수] 멤버십 이용약관 및 정기결제 동의</label>
      <details className="muted text-footnote"><summary>이용약관 · 요금 및 해지 안내 보기</summary><p className="mt-2 whitespace-pre-wrap leading-relaxed">{terms.title}{'\n'}{terms.body}</p></details></>}
    <p className="muted text-footnote leading-relaxed">카드를 등록하면 첫 이용료가 결제됩니다.<br/>해지 후에도 이용 기한까지 혜택을 받을 수 있어요.</p>
    <Button className="w-full" disabled={!agreed || !terms || !PENDING_CONTRACTS.billingAuth}>동의하고 카드 등록하기</Button>
    {!PENDING_CONTRACTS.billingAuth && <p className="muted text-center text-footnote">카드 등록은 곧 열려요.</p>}
    <Button outline className="w-full" closeSheet>다음에 하기</Button>
  </div></Modal>;
}

/** 16 관리 시트 + 해지 확인(같은 시트 안 단계) */
function MembershipManageSheet({ ms, couponRight, onCoupons, onClose }: { ms: ReturnType<typeof useMembership>; couponRight: string; onCoupons: () => void; onClose: () => void }) {
  const m = ms.membership!, view = ms.view as MembershipView; const toast = useToast();
  const [asking, setAsking] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const title = view === 'grace' ? '결제에 실패했어요' : view === 'cancelScheduled' ? `${md(m.entitlementUntil)}까지 이용` : view === 'pending' ? '가입을 확인하고 있어요' : '멤버십 이용 중';
  async function cancel() {
    setBusy(true); setError('');
    try {
      const r = await requestMembershipCancellation();
      // 202는 접수일 뿐. 자격 claim을 새로 받고 상태를 다시 읽는다
      if (r.refreshRequired) await api.refresh().catch(() => undefined);
      ms.reload(); setAsking(false); toast('해지를 접수했어요. 반영까지 잠시 걸릴 수 있어요.');
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  if (asking) return <Modal title="정기결제를 해지할까요?" onClose={() => !busy && onClose()}><div className="space-y-4"><p className="muted text-label leading-relaxed">해지하면 다음 정기결제가 진행되지 않아요. {ymd(m.entitlementUntil)}까지는 무료배송과 받은 쿠폰을 그대로 쓸 수 있어요.</p><ErrorBox message={error}/><div className="flex gap-2"><Button outline className="flex-1" disabled={busy} onClick={() => setAsking(false)}>취소</Button><Button className="flex-1" disabled={busy} onClick={cancel}>{busy ? '해지 중…' : '해지하기'}</Button></div></div></Modal>;
  return <Modal title="멤버십 관리" onClose={onClose}><div className="space-y-4">
    <div className="rounded-inner bg-soft p-4"><div className="flex flex-wrap items-center gap-2"><h3 className="text-title font-bold">{title}</h3>{view === 'grace' && <Badge red>유예 중</Badge>}{view === 'cancelScheduled' && <Badge>해지 예약</Badge>}</div><p className="mt-2 text-label">무료배송 · 회원 전용 쿠폰</p></div>
    <div className="divider pb-3"><InfoRow label="월 이용료" value={m.amount ? money(m.amount) : '-'}/>{view === 'active' && <InfoRow label="다음 결제일" value={ymd(m.periodEnd)}/>}<InfoRow label={view === 'grace' ? '혜택 유지' : '이용 기한'} value={`${ymd(m.entitlementUntil)}까지`}/><InfoRow label="정기결제" value={view === 'active' ? '이용 중' : view === 'cancelScheduled' ? '해지 예약' : view === 'grace' ? '다시 시도 중' : '확인 중'}/></div>
    <RowButton label="내 쿠폰 보기" right={couponRight} onClick={onCoupons}/>
    {ms.error && <ErrorBox message={ms.error}/>}
    <Button className="w-full" closeSheet>확인</Button>
    {(view === 'active' || view === 'grace') && !m.cancelRequested && <><Button outline className="w-full" onClick={() => setAsking(true)}>정기결제 해지하기</Button><p className="muted text-footnote leading-relaxed">해지하면 다음 정기결제가 중단돼요.<br/>남은 이용 기간 동안 혜택은 유지됩니다.</p></>}
    {view === 'cancelScheduled' && PENDING_CONTRACTS.resumeCancel && <Button outline className="w-full" disabled>해지 취소하기</Button>}
  </div></Modal>;
}

/* ── 17 내 쿠폰 시트(탭 3개, 20개씩 더 보기) ── */
const TABS: [CouponTab, string][] = [['AVAILABLE', '사용 가능'], ['USED', '사용 완료'], ['EXPIRED', '만료']];
function MyCouponsSheet({ initialTab, onClose }: { initialTab: CouponTab; onClose: () => void }) {
  const [tab, setTab] = useState<CouponTab>(initialTab);
  return <Modal title="내 쿠폰" onClose={onClose}><div className="space-y-4">
    <div role="group" aria-label="쿠폰 상태" className="divider flex pb-2">{TABS.map(([t, label]) => <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)} className={`min-h-11 min-w-0 flex-1 whitespace-nowrap border-b-2 text-subhead ${tab === t ? 'border-ink font-bold text-ink' : 'muted border-transparent font-normal'}`}>{label}</button>)}</div>
    <CouponList key={tab} tab={tab}/>
    <p className="muted text-footnote leading-relaxed">쿠폰은 주문당 1장 사용할 수 있어요.<br/>상품과 수량을 고른 뒤 쿠폰을 선택해 주세요.</p>
    <Button className="w-full" closeSheet>닫기</Button>
  </div></Modal>;
}
function CouponList({ tab }: { tab: CouponTab }) {
  const [pages, setPages] = useState<CouponDto[][]>([]), [page, setPage] = useState(0);
  const cur = useApi(signal => listMyCoupons(tab, page, signal), [tab, page]);
  useEffect(() => { if (cur.data) setPages(p => { const next = p.slice(0, page); next[page] = cur.data!; return next; }); }, [cur.data]);
  const items = pages.flat();
  const more = (pages[pages.length - 1]?.length ?? 0) >= COUPON_PAGE_SIZE;
  if (!items.length) return cur.loading || cur.error ? <LiveStatus state={cur}/> : <Empty title={tab === 'AVAILABLE' ? '사용 가능한 쿠폰이 없어요' : tab === 'USED' ? '사용한 쿠폰이 없어요' : '만료된 쿠폰이 없어요'}/>;
  return <div>
    <ul aria-label="쿠폰 목록">{items.map(c => <li key={c.issueId}><CouponItem coupon={c} tab={tab}/></li>)}</ul>
    {cur.error ? <div className="pt-3"><LiveStatus state={cur}/></div> : more && <Button outline className="mt-3 w-full" disabled={cur.loading} onClick={() => setPage(pages.length)}>{cur.loading ? '불러오는 중…' : '더 보기'}</Button>}
  </div>;
}
function CouponItem({ coupon: c, tab }: { coupon: CouponDto; tab: CouponTab }) {
  const locked = c.status === 'LOCKED';
  if (tab !== 'AVAILABLE') return <div className="divider space-y-1 py-4"><div className="flex flex-wrap items-center gap-2"><p className="text-body font-bold">{c.name} · {couponDiscountLabel(c)}</p><Badge>{tab === 'USED' ? '사용 완료' : '만료'}</Badge></div><p className="muted text-footnote">{couponConditionLabel(c)}{c.validUntil ? ` · ${ymd(c.validUntil)}까지` : ''}</p></div>;
  return <div className={`divider space-y-1 py-4 ${locked ? 'opacity-50' : ''}`} aria-disabled={locked || undefined}>
    <div className="flex flex-wrap items-center gap-2"><p className="muted text-label">{c.name}</p>{locked ? <Badge>사용 중</Badge> : expiringSoon(c.validUntil) && <Badge>{daysLeft(c.validUntil)}</Badge>}</div>
    <p className="text-title font-bold">{couponDiscountLabel(c)}</p>
    {locked ? <p className="muted text-label">결제 대기 중인 주문에 쓰고 있어요. 결제하지 않으면 다시 쓸 수 있어요.</p> : <><p className="text-label">{couponConditionLabel(c)}</p><p className="muted text-footnote">{ymdhm(c.validUntil)}까지</p></>}
  </div>;
}
const daysLeft = (iso: string | null) => { const d = Math.ceil(((iso ? Date.parse(iso) : 0) - Date.now()) / 86_400_000); return d <= 1 ? '오늘 만료' : `${d}일 후 만료`; };

/* ── 19 상품 상세: 가격 아래 조건부 혜택 행, ?campaign=CODE면 쿠폰 받기 ── */
export function ProductBenefits({ product: p, hidden }: { product: Product; hidden: boolean }) {
  const s = useStore(), navigate = useNavigate(); const ms = useMembership(); const [params] = useSearchParams(); const toast = useToast();
  const code = (params.get('campaign') ?? '').trim().toUpperCase();
  const validCode = /^[A-Z0-9_]{1,40}$/.test(code) ? code : '';
  const loggedIn = signedIn(s);
  const applicable = useApi(signal => (ms.account && !hidden ? listApplicableCoupons(p.id, p.price, signal) : Promise.resolve([] as ApplicableCouponDto[])), [ms.account, p.id, p.price, hidden]);
  const campaign = useApi(signal => (MEMBERSHIP_COUPON && validCode && !hidden ? getCampaign(validCode, signal) : Promise.resolve(null)), [validCode, hidden, ms.account]);
  const [claimed, setClaimed] = useState<CouponDto>(), [claiming, setClaiming] = useState(false), [listOpen, setListOpen] = useState(false);
  const promoName = campaign.data ? `${campaign.data.definition.name} ${couponDiscountLabel(campaign.data.definition)}` : '';
  const promoSent = useRef('');
  useEffect(() => { if (campaign.data && promoSent.current !== validCode) { promoSent.current = validCode; trackViewPromotion(validCode, promoName, p.id); } }, [campaign.data]);
  if (!MEMBERSHIP_COUPON || hidden) return null;
  const rows: ReactNode[] = [];
  const memberFree = ms.view && ms.view !== 'none' && ms.view !== 'pending' && ms.membership?.active;
  if (loggedIn && ms.account && memberFree && p.shipping > 0) rows.push(<div key="ship" className="flex min-h-11 items-center gap-3 text-label"><Truck size={17} aria-hidden/><span>멤버십 회원이라 이 상품 배송비 무료</span></div>);
  else if (loggedIn && ms.account && ms.view === 'none' && p.shipping > 0) rows.push(<button key="join" type="button" onClick={() => navigate('/my?membership=join')} className="flex min-h-11 w-full items-center gap-3 text-left text-label"><Truck size={17} aria-hidden/><span className="min-w-0 flex-1">멤버십 가입 시 배송비 무료</span>{CHEVRON}</button>);
  const list = applicable.data ?? [];
  if (ms.account && list.length) { const best = Math.max(...list.map(a => a.estimatedDiscount)); rows.push(<button key="coupon" type="button" onClick={() => setListOpen(true)} className="flex min-h-11 w-full items-center gap-3 text-left text-label"><Ticket size={17} aria-hidden/><span className="min-w-0 flex-1">쓸 수 있는 쿠폰 {list.length}장{best > 0 ? ` · 최대 ${money(best)} 할인` : ''}</span>{CHEVRON}</button>); }
  if (!loggedIn) rows.push(<button key="login" type="button" onClick={() => navigate(loginHref(`/product/${p.id}${validCode ? `?campaign=${validCode}` : ''}`))} className="flex min-h-11 w-full items-center gap-3 text-left text-label"><span className="min-w-0 flex-1">로그인하고 쓸 수 있는 쿠폰 확인하기</span>{CHEVRON}</button>);
  async function claim() {
    if (!loggedIn) { navigate(loginHref(`/product/${p.id}?campaign=${validCode}`)); return; }
    trackSelectPromotion(validCode, promoName, p.id);
    setClaiming(true);
    try { const c = await claimCampaign(validCode); setClaimed(c); trackCouponClaim(validCode, c.issueId); toast('쿠폰을 받았어요. 구매하기에서 쓸 수 있어요.'); campaign.reload(); applicable.reload(); }
    catch (e) { toast(claimError(e)); } finally { setClaiming(false); }
  }
  const camp = campaign.data;
  const open = camp && camp.campaign.status === 'ACTIVE' && Date.parse(camp.campaign.endsAt) > Date.now();
  const got = !!claimed || camp?.claimed === true;
  return <>
    {rows.length > 0 && <div className="note divide-y divide-line py-1!" aria-label="구매 혜택">{rows}</div>}
    {validCode && camp && <div className="note flex items-center justify-between gap-3" aria-label="쿠폰 받기"><span className="min-w-0 text-label">{camp.definition.name} {couponDiscountLabel(camp.definition)}{open && !got ? ` · 남은 수량 ${camp.remaining.toLocaleString('ko-KR')}장` : ''}</span>{got ? <Badge>받음</Badge> : open && camp.remaining > 0 ? <button type="button" disabled={claiming} onClick={claim} className="min-h-11 shrink-0 rounded-element bg-surface px-3 text-label font-bold">{claiming ? '받는 중…' : '받기'}</button> : <Badge>{open ? '소진' : '종료'}</Badge>}</div>}
    {validCode && campaign.error && !campaign.notFound && <p className="muted text-footnote">쿠폰 정보를 불러오지 못했어요. <button type="button" className="underline" onClick={campaign.reload}>다시 시도</button></p>}
    {listOpen && <Modal title="쓸 수 있는 쿠폰" onClose={() => setListOpen(false)}><div className="space-y-4"><p className="muted text-label">{p.name} · 1개 · 상품금액 {money(p.price)} 기준</p><ul>{list.map(a => <li key={a.coupon.issueId} className="divider flex items-start justify-between gap-3 py-4"><div className="min-w-0"><p className="text-body font-bold">{a.coupon.name} · {couponDiscountLabel(a.coupon)}</p><p className="muted mt-1 text-footnote">{couponConditionLabel(a.coupon)} · {ymd(a.coupon.validUntil)}까지</p></div>{a.estimatedDiscount > 0 && <span className="shrink-0 text-label font-bold">−{money(a.estimatedDiscount)}</span>}</li>)}</ul><p className="muted text-footnote">구매하기에서 수량을 고른 뒤 쿠폰을 선택할 수 있어요.</p><Button className="w-full" closeSheet>닫기</Button></div></Modal>}
  </>;
}

/* ── 13 옵션 시트: 주문 생성 전 쿠폰 선택(같은 시트 안 고르기 단계) ── */
const PENDING_COUPON = 'stockdrop:pending-coupon';
/** 배송지 등록으로 갔다 돌아올 때 고른 쿠폰을 잠시 보관(주문 생성 때 서버가 다시 검증) */
export const rememberPendingCoupon = (productId: string, issueId: string | undefined) => { try { if (issueId) sessionStorage.setItem(PENDING_COUPON, JSON.stringify({ productId, issueId })); else sessionStorage.removeItem(PENDING_COUPON); } catch { /* 저장 차단 시 쿠폰 없이 진행 */ } };
const takePendingCoupon = (productId: string) => { try { const v = JSON.parse(sessionStorage.getItem(PENDING_COUPON) || 'null'); sessionStorage.removeItem(PENDING_COUPON); return v?.productId === productId && typeof v.issueId === 'string' ? v.issueId as string : undefined; } catch { return undefined; } };
export function useOrderCoupon(p: Product, itemsAmount: number, count: number) {
  const ms = useMembership();
  const [selected, setSelected] = useState<string | undefined>(() => (MEMBERSHIP_COUPON ? takePendingCoupon(p.id) : undefined));
  const [picking, setPicking] = useState(false);
  const [amount, setAmount] = useState(itemsAmount);
  useEffect(() => { const t = setTimeout(() => setAmount(itemsAmount), 300); return () => clearTimeout(t); }, [itemsAmount]);
  const list = useApi(signal => (ms.account && amount > 0 ? listApplicableCoupons(p.id, amount, signal) : Promise.resolve([] as ApplicableCouponDto[])), [ms.account, p.id, amount]);
  const options = amount === itemsAmount ? list.data ?? [] : [];
  // 수량이 바뀌어 더는 쓸 수 없는 쿠폰은 선택을 푼다(서버 목록 기준)
  useEffect(() => { if (selected && list.data && !list.loading && amount === itemsAmount && !list.data.some(a => a.coupon.issueId === selected)) setSelected(undefined); }, [list.data, list.loading]);
  const chosen = options.find(a => a.coupon.issueId === selected);
  const enabled = !!ms.account;
  const memberShip = ms.membership?.active && ms.view !== 'pending' ? p.shipping : 0;
  const discount = chosen?.estimatedDiscount ?? 0;
  const issueId = enabled ? selected : undefined;
  const row = !enabled ? null : <button type="button" onClick={() => setPicking(true)} className="divider flex min-h-13 w-full items-center gap-3 py-3 text-left" aria-label="쿠폰 선택">
    <span className="text-body font-medium">쿠폰</span>
    <span className="min-w-0 flex-1 text-right">{list.loading && !list.data ? <span className="muted text-label">확인 중…</span> : list.error ? <span className="muted text-label">쿠폰을 불러오지 못했어요</span> : chosen ? <><span className="block text-label font-bold">{chosen.coupon.name} {couponDiscountLabel(chosen.coupon)}</span><span className="muted block text-caption">사용 가능 {options.length}장</span></> : <span className="muted text-label">{count ? (options.length ? `사용 안 함 · 사용 가능 ${options.length}장` : '사용 가능한 쿠폰 없음') : '수량을 먼저 선택해 주세요'}</span>}</span>
    {CHEVRON}
  </button>;
  const rows = !enabled ? null : <>{discount > 0 && <InfoRow label="예상 쿠폰 할인" value={`−${money(discount)}`}/>}{memberShip > 0 && count > 0 && <InfoRow label="멤버십 배송 할인" value={`−${money(memberShip)}`}/>}</>;
  const note = enabled && count > 0 && options.length > 0 ? <p className="muted text-footnote">수량에 따라 할인금액이 달라질 수 있어요. 주문 후 최종 결제금액을 확인해 주세요.</p> : null;
  const step = <CouponPickStep product={p} itemsAmount={itemsAmount} count={count} options={options} loading={list.loading} error={list.error} reload={list.reload} selected={selected} onBack={() => setPicking(false)} onPick={id => { setSelected(id); setPicking(false); }}/>;
  return {
    enabled, picking: enabled && picking, row, rows, note, step, issueId, discount: enabled ? discount + (count > 0 ? memberShip : 0) : 0,
    /** 배송지 등록으로 이동하기 전 */ remember: () => rememberPendingCoupon(p.id, issueId),
    /** 주문 생성(재고 확보 접수) 직후 */ ordered: () => { trackBeginCheckout(p, count, chosen?.coupon.name); if (issueId) trackCouponUse(issueId, p.id, chosen?.coupon.name ?? ''); },
  };
}
function CouponPickStep({ product: p, itemsAmount, count, options, loading, error, reload, selected, onBack, onPick }: { product: Product; itemsAmount: number; count: number; options: ApplicableCouponDto[]; loading: boolean; error: string; reload: () => void; selected?: string; onBack: () => void; onPick: (id: string | undefined) => void }) {
  const [sel, setSel] = useState<string | undefined>(selected);
  const radio = (on: boolean) => <span className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${on ? 'border-ink bg-ink' : 'border-line'}`}/>;
  return <div className="space-y-4">
    <button type="button" onClick={onBack} className="muted -ml-1 flex min-h-11 items-center gap-1 text-label"><ChevronLeft size={16} aria-hidden/>옵션 선택으로</button>
    <p className="muted text-label">{p.name} · {count}개 · 상품금액 {money(itemsAmount)} 기준</p>
    <div role="radiogroup" aria-label="쿠폰">
      <button type="button" role="radio" aria-checked={!sel} onClick={() => setSel(undefined)} className="divider flex w-full items-start gap-3 py-4 text-left">{radio(!sel)}<div><p className="text-body font-semibold">사용 안 함</p><p className="muted mt-1 text-footnote">쿠폰 없이 구매해요</p></div></button>
      {options.map(a => <button key={a.coupon.issueId} type="button" role="radio" aria-checked={sel === a.coupon.issueId} onClick={() => setSel(a.coupon.issueId)} className="divider flex w-full items-start gap-3 py-4 text-left">{radio(sel === a.coupon.issueId)}<div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-body font-semibold">{a.coupon.name} · {couponDiscountLabel(a.coupon)}</p>{expiringSoon(a.coupon.validUntil) && <Badge>곧 만료</Badge>}</div><p className="muted mt-1 text-footnote">{couponConditionLabel(a.coupon)} · {md(a.coupon.validUntil)}까지</p></div>{a.estimatedDiscount > 0 && <span className="shrink-0 text-label font-bold">−{money(a.estimatedDiscount)}</span>}</button>)}
    </div>
    {loading && !options.length && <div className="flex justify-center py-3"><Spinner/></div>}
    {error && <LiveStatus state={{ loading, error, reload }}/>}
    {!loading && !error && !options.length && <p className="muted text-label">이 상품에 쓸 수 있는 쿠폰이 없어요.</p>}
    <p className="muted text-footnote leading-relaxed">예상 할인이에요. 주문을 만들 때 서버에서 다시 확인해요.<br/>쿠폰은 주문당 1장만 쓸 수 있어요.</p>
    <Button className="w-full" onClick={() => onPick(sel)}>{sel ? '이 쿠폰 사용하기' : '쿠폰 없이 진행하기'}</Button>
  </div>;
}

/* ── 14, 18 결제와 주문 상세: 서버 금액 요약 ── */
/** 할인(쿠폰, 멤버십 배송)이 하나라도 있을 때만 그린다. 없으면 기존 세 줄을 그대로 쓴다 */
export const hasDiscount = (a?: OrderAmounts) => !!a && (a.couponDiscount > 0 || a.membershipShippingDiscount > 0);
export function AmountRows({ amounts: a, couponLabel = '쿠폰 할인' }: { amounts: OrderAmounts; couponLabel?: string }) {
  const original = a.originalShippingFee ?? 0, effective = a.effectiveShippingFee ?? Math.max(0, original - a.membershipShippingDiscount);
  return <>
    {a.itemsAmount !== undefined && <InfoRow label="상품금액" value={money(a.itemsAmount)}/>}
    {a.couponDiscount > 0 && <InfoRow label={couponLabel} value={`−${money(a.couponDiscount)}`}/>}
    <InfoRow label="기본 배송비" value={money(original)}/>
    {a.membershipShippingDiscount > 0 && <InfoRow label="멤버십 배송 할인" value={`−${money(a.membershipShippingDiscount)}`}/>}
    <InfoRow label="실제 배송비" value={money(effective)}/>
  </>;
}
const REJECT_TEXT: Record<string, string> = { COUPON_EXPIRED: '쿠폰 유효기간이 지났어요', COUPON_MIN_AMOUNT: '최소 주문 금액을 채우지 못했어요', COUPON_SCOPE_MISMATCH: '이 상품에 쓸 수 없는 쿠폰이에요', COUPON_SELF_PRODUCT: '본인 상품에는 쓸 수 없어요', COUPON_NOT_AVAILABLE: '이미 사용 중이거나 쓸 수 없는 쿠폰이에요', COUPON_NOT_OWNED: '내 쿠폰이 아니에요', COUPON_NOT_FOUND: '쿠폰을 찾을 수 없어요' };
/** 결제 화면 '적용 쿠폰' 읽기 전용 행과 쿠폰 미적용 안내(확보 뒤에는 쿠폰을 바꿀 수 없다) */
export function CheckoutCoupon({ amounts: a }: { amounts?: OrderAmounts }) {
  if (!MEMBERSHIP_COUPON || !a?.couponIssueId) return null;
  const state = a.couponState;
  const value = state === 'LOCKED' && a.couponDiscount > 0 ? `${money(a.couponDiscount)} 할인` : state === 'REJECTED' || state === 'SKIPPED' ? '적용 안 됨' : '확인 중';
  return <div className="space-y-2"><div className="divider flex min-h-13 items-center justify-between gap-3"><span className="text-body">적용 쿠폰</span><span className="muted text-label">{value}</span></div>
    {(state === 'REJECTED' || state === 'SKIPPED') && <p className="muted text-footnote">{(a.couponRejectCode && REJECT_TEXT[a.couponRejectCode]) || '쿠폰을 확인하지 못했어요'}. 쿠폰 없이 결제돼요. 쿠폰은 다시 쓸 수 있어요.</p>}</div>;
}

/* ── 목록, 품절 행동 이벤트(홈에 끼워 넣는 훅과 조각) ── */
/** 홈 목록: 검색어가 잠시 멈추면 search, 목록이 바뀌면 view_item_list, 상품 링크를 누르면 select_item */
export function useListTracking(listId: string, listName: string, query: string, items: TrackProduct[]) {
  const ids = items.slice(0, 20).map(p => p.id).join(',');
  const itemsRef = useRef(items); itemsRef.current = items;
  useEffect(() => { if (!MEMBERSHIP_COUPON || !query.trim()) return; const t = setTimeout(() => trackSearch(query), 800); return () => clearTimeout(t); }, [query]);
  useEffect(() => { if (!MEMBERSHIP_COUPON || !ids) return; const t = setTimeout(() => trackItemList(listId, listName, itemsRef.current), 800); return () => clearTimeout(t); }, [ids]);
  useEffect(() => {
    if (!MEMBERSHIP_COUPON) return;
    const on = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href*="/product/"]'); if (!a) return;
      const id = decodeURIComponent((a.getAttribute('href') ?? '').split('/product/')[1]?.split(/[?#/]/)[0] ?? '');
      const index = itemsRef.current.findIndex(p => p.id === id); if (index >= 0) trackSelectItem(listId, listName, itemsRef.current[index], index);
    };
    document.addEventListener('click', on, true); return () => document.removeEventListener('click', on, true);
  }, [listId, listName]);
}
/** 품절 화면을 본 순간 1회 */
export function SoldOutSeen({ product }: { product: TrackProduct }) {
  useEffect(() => { trackSoldOut(product); }, [product.id]);
  return null;
}
