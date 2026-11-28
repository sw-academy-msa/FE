import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { activeUser, money } from '../domain';
import { useStore } from '../store';
import { dateTime } from '../hooks';
import { Button, Empty, ErrorBox, Header, LiveStatus, Modal, Note, Unavailable, useToast } from '../components/ui';
import { decideRevision, errorMessage, getAdminProductReview, getAdminRevision, listAdminRevisions, useApi } from '../api';
import type { ProductRevisionDto } from '../api';
import { USE_MOCK } from '../config';

/** 수정 심사의 "수정 후" 값(백엔드 ProductRevisionRequest). 상품명·사진·옵션·수량은 수정 대상이 아니라 없다 */
const ch = (r: ProductRevisionDto) => r.changes as { description?: string; purchaseNotice?: string | null; shippingFee?: number; price?: number; startsAt?: string };
const addr = (a?: { postalCode: string; roadAddress: string; detailAddress: string | null }) => (a ? `(${a.postalCode}) ${a.roadAddress}${a.detailAddress ? ` ${a.detailAddress}` : ''}` : '');

/** 운영자 판매 심사 목록의 「수정」 탭 — 수정 심사 대기 목록(응답이 배열이라 건수는 길이) */
export function useRevisionQueue(enabled: boolean) {
  return useApi(async signal => (USE_MOCK || !enabled ? [] : listAdminRevisions('IN_REVIEW', signal)), [enabled]);
}
export function RevisionList({ items }: { items: ProductRevisionDto[] }) {
  if (!items.length) return <Empty title="수정 심사 대기 중인 상품이 없어요"/>;
  return <>{items.map(r => <Link key={r.id} to={`/admin/revisions/${r.productId}/${r.id}`} className="block space-y-1 border-b border-line py-4">
    <span className="inline-flex h-4.5 items-center rounded-inner bg-soft px-2 text-footnote font-bold text-aux">수정 심사 대기</span>
    <p className="text-body font-bold">{ch(r).price === undefined ? '판매 정보 수정' : `판매가 ${money(ch(r).price!)}`}{ch(r).shippingFee === undefined ? '' : ` · 배송비 ${money(ch(r).shippingFee!)}`}</p>
    <p className="text-footnote text-meta">요청 {dateTime(Date.parse(r.submittedAt))}{ch(r).startsAt ? ` · 오픈 ${dateTime(Date.parse(ch(r).startsAt!))}` : ''}</p>
  </Link>)}</>;
}

function Row({ label, before, after }: { label: string; before?: ReactNode; after: ReactNode }) {
  const same = before !== undefined && before === after;
  return <div className="space-y-1.5 border-b border-line py-3">
    <p className="flex items-center gap-2 text-label font-bold">{label}{!same && before !== undefined && <span className="rounded-badge bg-warning-soft px-1.5 text-caption text-warning">변경</span>}{same && <span className="muted text-caption font-normal">변경 없음</span>}</p>
    <div className="grid grid-cols-2 gap-2 text-label">
      <div className="rounded-inner bg-soft p-2"><p className="muted mb-1 text-caption">변경 전</p><div className="whitespace-pre-wrap break-words">{before === undefined ? <span className="muted">확인할 수 없어요</span> : before || '-'}</div></div>
      <div className={`rounded-inner p-2 ${same ? 'bg-soft' : 'bg-positive-soft'}`}><p className="muted mb-1 text-caption">변경 후</p><div className="whitespace-pre-wrap break-words">{after || '-'}</div></div>
    </div>
  </div>;
}

/** 수정 심사 상세 — 응답에는 변경 전 값이 없어 현재 승인된 상품을 조회해 나란히 보여 준다. 그것도 못 받으면 변경 후 값만 보인다 */
export function AdminRevisionDetailPage() {
  const { productId = '', revisionId = '' } = useParams(); const user = activeUser(useStore()), navigate = useNavigate(), toast = useToast();
  const [reject, setReject] = useState(false), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const data = useApi(async signal => {
    if (USE_MOCK || !user.admin) return null;
    const rev = await getAdminRevision(productId, revisionId, signal);
    const product = await getAdminProductReview(productId, signal).catch(() => null);
    return { rev, product };
  }, [productId, revisionId, user.admin]);
  if (!user.admin) return <Unavailable message="운영자만 사용할 수 있습니다."/>;
  const d = data.data;
  if (!d) return data.loading || data.error ? <LiveStatus state={{ loading: data.loading, error: data.error, reload: data.reload }}/> : <Empty title="수정 심사를 찾을 수 없어요"><Button to="/admin/products?kind=revision">심사 목록으로</Button></Empty>;
  // 처리가 끝난 회차는 현재 상품이 이미 바뀐 뒤라 '변경 전'으로 쓸 수 없다(확인할 수 없음으로 표시). 심사 대기 회차만 현재 상품과 비교한다
  const { rev } = d, p = rev.status === 'IN_REVIEW' ? d.product : null, a = ch(rev), pending = rev.status === 'IN_REVIEW';
  const decide = async (approved: boolean) => {
    if (busy) return; if (!approved && !reason.trim()) return setError('반려 사유를 입력해 주세요.');
    setBusy(true); setError('');
    try { await decideRevision(productId, revisionId, rev.version, approved, reason); toast(approved ? '수정 내용을 승인했어요.' : '수정 내용을 반려했어요.'); navigate('/admin/products?kind=revision', { replace: true }); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const start = (v?: string | number) => (v === undefined || v === '' ? '' : dateTime(typeof v === 'number' ? v : Date.parse(v)));
  return <div className="space-y-3">
    <Header title="수정 심사 상세" subtitle={pending ? '바뀐 항목을 확인하고 승인해 주세요.' : rev.status === 'APPROVED' ? '승인된 수정 심사예요.' : '반려된 수정 심사예요.'}/>
    {pending && !p && <Note title="변경 전 값을 불러오지 못했어요">현재 승인된 상품을 조회하지 못해 변경 후 값만 보여요.</Note>}
    <div>
      <Row label="상품 설명" before={p?.description} after={a.description ?? ''}/>
      <Row label="판매가" before={p ? money(p.price) : undefined} after={a.price === undefined ? '' : money(a.price)}/>
      <Row label="배송비" before={p ? money(p.shipping) : undefined} after={a.shippingFee === undefined ? '' : money(a.shippingFee)}/>
      {a.purchaseNotice && <Row label="구매 안내" after={a.purchaseNotice}/>}
      <Row label="판매 시작" before={p ? start(p.startsAt) : undefined} after={start(a.startsAt)}/>
      <Row label="출고지" after={addr(rev.shipping?.dispatchAddress)}/>
      <Row label="반품지" after={addr(rev.shipping?.returnAddress)}/>
    </div>
    <p className="muted text-footnote">상품명·사진·옵션·최초 수량은 수정 대상이 아니에요.</p>
    {!pending && rev.reason && <Note title="반려 사유">{rev.reason}</Note>}
    {pending && <div className="flex gap-3 pb-6"><Button outline className="flex-1" onClick={() => { setError(''); setReject(true); }}>반려</Button><Button className="flex-1" disabled={busy} onClick={() => decide(true)}>{busy ? '처리 중…' : '승인'}</Button></div>}
    {error && !reject && <ErrorBox message={error}/>}
    {reject && <Modal title="수정 내용 반려" onClose={() => setReject(false)}>
      <textarea aria-label="반려 사유" className="min-h-24 w-full rounded-element border border-line p-3 text-body" maxLength={2000} placeholder="반려 사유를 입력해 주세요" value={reason} onChange={e => setReason(e.target.value)}/>
      <ErrorBox message={error}/>
      <div className="mt-4 flex gap-3"><Button outline className="flex-1" closeSheet>취소</Button><Button className="flex-1" disabled={busy} onClick={() => decide(false)}>{busy ? '처리 중…' : '반려하기'}</Button></div>
    </Modal>}
  </div>;
}
