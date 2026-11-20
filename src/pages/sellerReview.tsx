/**
 * 판매 제한과 사업자등록증 재심사(실제 모드).
 * - GET /sellers/me/review-status: salesRestricted(판매 제한), application(최신 신청, 재심사 포함), correction(최신 보완 요청)
 * - POST /sellers/me/certificate-reviews: 사업자등록증 PDF 재제출. 서버는 제출하자마자 판매를 제한하고(새 상품 업무 불가) 승인되면 푼다.
 *   최신 신청이 심사 대기(PENDING)나 보완 요청 중(CHANGES_REQUESTED)이면 받지 않는다(ALREADY_APPLIED)
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { DocumentFile } from '../domain';
import { reviewSummary } from '../sellerFlows';
import { errorMessage, fetchReviewStatus, requestCertificateReview, useApi } from '../api';
import { PdfField } from '../components/PdfField';
import { Button, ErrorBox, Header, LiveStatus, Note, useToast } from '../components/ui';
import { getPdf } from '../files';
import { dateTime } from '../hooks';
import { USE_MOCK } from '../config';

/** 판매자 마이페이지 위쪽 안내: 판매가 제한된 경우에만 보인다 */
export function SalesRestrictionBanner() {
  const r = useApi(signal => (USE_MOCK ? Promise.resolve(null) : fetchReviewStatus(signal)), []);
  if (!r.data?.salesRestricted) return null;
  const s = reviewSummary(r.data);
  return <Link to="/seller/review" role="alert" className="mb-4 block space-y-1 rounded-[6px] bg-[var(--red-soft)] p-4">
    <p className="text-[13px] font-bold text-[var(--red)]">판매가 제한돼 있어요 · {s.title}</p>
    <p className="text-[12px] leading-relaxed text-[var(--red)]">{s.body}</p>
    <p className="text-[12px] font-bold text-[var(--red)] underline">재심사 상태 보기</p>
  </Link>;
}

const STATUS_LABEL: Record<string, string> = { PENDING: '심사 대기', APPROVED: '승인', REJECTED: '반려', CHANGES_REQUESTED: '보완 요청', EXPIRED: '보완 기한 만료' };
/** /seller/review — 판매 제한 상태와 사업자등록증 재심사 신청 */
export function SellerReviewPage() {
  const toast = useToast();
  const r = useApi(signal => (USE_MOCK ? Promise.resolve(null) : fetchReviewStatus(signal)), []);
  const [doc, setDoc] = useState<DocumentFile>(), [confirm, setConfirm] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  if (USE_MOCK) return <div className="space-y-4"><Header title="사업자등록증 재심사"/><Note>실제 서버에 연결된 화면에서만 재심사를 신청할 수 있어요.</Note></div>;
  if (!r.data) return <div className="space-y-4"><Header title="사업자등록증 재심사"/><LiveStatus state={r}/></div>;
  const status = r.data, s = reviewSummary(status), a = status.application;
  async function submit() {
    if (!doc) { setError('사업자등록증 PDF를 첨부해 주세요.'); return; }
    setBusy(true); setError('');
    try { await requestCertificateReview(await getPdf(doc.id), doc.name); setConfirm(false); setDoc(undefined); toast('재심사를 신청했어요. 결과는 알림으로 알려드려요.'); r.reload(); }
    catch (e) { setConfirm(false); setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  const tone = s.tone === 'red' ? 'bg-[var(--red-soft)] text-[var(--red)]' : s.tone === 'green' ? 'bg-[var(--green-soft)] text-[var(--green)]' : 'bg-[var(--blue-soft)]';
  return <div className="space-y-5">
    <Header title="사업자등록증 재심사"/>
    <section role="status" aria-label="재심사 상태" className={`space-y-1 rounded-[6px] p-4 ${tone}`}>
      <p className="text-[11px] font-bold">{status.salesRestricted ? '판매 제한 중' : '판매 가능'}</p>
      <p className="text-[15px] font-bold">{s.title}</p>
      <p className="whitespace-pre-line text-[12px] leading-relaxed">{s.body}</p>
    </section>
    {a && <section className="space-y-2">
      <h2 className="text-[15px] font-bold">최근 심사</h2>
      <div className="divider flex items-center justify-between py-3 text-[12px]"><span>{a.certificateRecheck ? '사업자등록증 재심사' : '입점 심사'}</span><span className="font-bold">{STATUS_LABEL[a.status] ?? a.status}</span></div>
      <div className="divider flex items-center justify-between py-3 text-[12px]"><span>제출</span><span>{dateTime(Date.parse(a.submittedAt))}</span></div>
      {a.reviewedAt && <div className="divider flex items-center justify-between py-3 text-[12px]"><span>심사 완료</span><span>{dateTime(Date.parse(a.reviewedAt))}</span></div>}
    </section>}
    {a?.status === 'CHANGES_REQUESTED' && <Link className="btn w-full" to="/apply">보완 요청 확인하기</Link>}
    {s.canSubmit && <section className="space-y-3">
      <h2 className="text-[15px] font-bold">사업자등록증 다시 제출</h2>
      <PdfField value={doc} onChange={file => { setError(''); setDoc(file); }}/>
      <Note title="제출하면 바로 판매가 제한돼요">재심사가 승인될 때까지 새 상품 등록과 판매 업무를 할 수 없어요. 이미 받은 주문의 배송과 문의 답변은 계속할 수 있어요.</Note>
      <ErrorBox message={error}/>
      <Button className="w-full" disabled={!doc || busy} onClick={() => setConfirm(true)}>재심사 신청하기</Button>
    </section>}
    {!s.canSubmit && <ErrorBox message={error}/>}
    {confirm && <div className="fixed inset-0 z-50 flex items-end bg-black/60" role="dialog" aria-label="재심사 신청 확인">
      <div className="mx-auto w-full max-w-[390px] rounded-t-[16px] bg-white px-4 pb-8 pt-2">
        <div className="mx-auto mb-4 h-1 w-8 rounded-full bg-[#DEDEDE]"/>
        <h2 className="mb-1 text-[18px] font-bold">재심사를 신청할까요?</h2>
        <p className="mb-5 text-[13px] text-[#7B7B7B]">신청하면 승인될 때까지 새 판매가 제한돼요.</p>
        <div className="flex gap-2"><Button outline className="w-[86px]" disabled={busy} onClick={() => setConfirm(false)}>취소</Button><Button className="flex-1" disabled={busy} onClick={submit}>{busy ? '신청 중…' : '신청하기'}</Button></div>
      </div>
    </div>}
  </div>;
}
