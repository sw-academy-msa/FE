import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronDown, Search } from 'lucide-react';
import { ArrowLeft, Building2, CalendarCheck, Check, Store, UserRound, CheckCircle2, FileText } from 'lucide-react';
import { activeUser, approveApplication, INSPECTION_PREFIX, money, nowOf, saleState, uid } from '../domain';
import type { Address, Application, DocumentFile } from '../domain';
import { atomic, mutate, useStore } from '../store';
import { dateTime, kstShort, kstSlot } from '../hooks';
import { Badge, Button, Chip, ConfirmLeave, Empty, ErrorBox, Field, Header, InfoRow, LiveStatus, MenuRow, Modal, Note, ProductImage, Unavailable, useToast } from '../components/ui';
import { PdfField } from '../components/PdfField';
import { deleteAddress, listAddresses, setDefaultAddress, takeAddressPick, toAddress } from './address';
import type { SavedAddress as ApiAddr } from './address';
import { LogoutButton, SETTINGS_HREF } from './auth';
import { changePassword, restoreSession, validPassword } from '../auth';
import { USE_MOCK } from '../config';
import { applicationFailure, applicationProblems, firstProblem, normalizeAccount, normalizePhone, problemSummary } from '../sellerApply';
import type { ApplyField, ApplyProblems } from '../sellerApply';
import { getMySupportInquiry, isApiError, answerSupportInquiry, createSupportInquiry, listAdminSupportInquiries, listMySupportInquiries, ApiError, apiPut, apiDelete, approveSellerApplication, decideProductReview, errorMessage, getAdminApplication, getAdminProductReviewWithImages, listAdminApplications, listAdminProductReviews, markApplication, mergeAdminApplications, mergeAdminProductList, mergeProducts, rejectSellerApplication, reviewCertificate, fetchMyApplication, mergeApplication, resubmitApplication, submitApplication, updateMyName, addInquiryMessage, getInquiryImageUrl, getOrderInquiry, listInquiryInbox, mergeInquiries, useLive, retryProjection, listOrders, mergeOrderList } from '../api';
import { failTab, getPdf, openPendingTab } from '../files';
import { RevisionList, useRevisionQueue } from './revisions';
import { CorrectionScreen } from './sellerCorrection';
import { CorrectionRequestSheet, SentCorrection } from './adminCorrection';
import { PhotoViewer } from '../components/PhotoViewer';
import { getProductInquiry } from '../api/inquiries';
import { BankField } from '../components/BankField';
function ProfileEditModal({ userId, name: initialName, phone: initialPhone, onClose }: { userId: string; name: string; phone: string; onClose: () => void }) {
  const [name, setName] = useState(initialName), [phone, setPhone] = useState(initialPhone), [error, setError] = useState(''), [busy, setBusy] = useState(false); const toast = useToast();
  return <Modal title="내 정보 수정" onClose={onClose}><form className="space-y-4" onSubmit={async e => { e.preventDefault(); if (!name.trim()) { setError('이름을 입력해 주세요.'); return; } setBusy(true); setError(''); try { if (!USE_MOCK) await updateMyName(name.trim()); /* TODO(api-gap): 연락처 수정 API 없음 — 연락처는 이 기기에만 저장 */ mutate(s => { const u = s.users.find(u => u.id === userId); if (u) { u.name = name.trim(); u.phone = phone.trim(); } }); toast('정보를 수정했습니다.'); onClose(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}><Field label="이름" required><input aria-label="이름" className="field" value={name} onChange={e => setName(e.target.value)} required/></Field><Field label="연락처"><input aria-label="연락처" className="field" value={phone} onChange={e => setPhone(e.target.value)} type="tel"/></Field><p className="muted text-[11px]">이메일은 변경할 수 없습니다.</p><ErrorBox message={error}/><Button type="submit" className="w-full" disabled={busy}>{busy ? '저장 중…' : '저장하기'}</Button></form></Modal>;
}
function PasswordChangeModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState(''), [next, setNext] = useState(''), [confirm, setConfirm] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false); const toast = useToast();
  return <Modal title="비밀번호 변경" onClose={onClose}><form className="space-y-4" onSubmit={async e => { e.preventDefault(); if (next !== confirm) { setError('새 비밀번호가 일치하지 않습니다.'); return; } setBusy(true); setError(''); try { await changePassword(current, next); toast('비밀번호를 변경했습니다.'); onClose(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}><Field label="현재 비밀번호" required><input type="password" aria-label="현재 비밀번호" className="field" value={current} onChange={e => setCurrent(e.target.value)} required autoComplete="current-password"/></Field><Field label="새 비밀번호" required><input type="password" aria-label="새 비밀번호" className="field" value={next} onChange={e => setNext(e.target.value)} required autoComplete="new-password" placeholder="영문·숫자·특수문자 8~32자"/></Field><Field label="새 비밀번호 확인" required><input type="password" aria-label="새 비밀번호 확인" className="field" value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="new-password"/></Field>{confirm && confirm !== next && <p className="text-[11px] text-[var(--red)]">비밀번호가 일치하지 않아요.</p>}<ErrorBox message={error}/><Button type="submit" className="w-full" disabled={busy || !current || !next || next !== confirm || !validPassword(next)}>{busy ? '변경 중…' : '변경하기'}</Button></form></Modal>;
}
export function MyPage() {
  const s = useStore(), user = activeUser(s), navigate = useNavigate(); const app = s.applications.find(a => a.userId === user.id); const [address, setAddress] = useState(false); const [profileEdit, setProfileEdit] = useState(false); const [pwChange, setPwChange] = useState(false); const toast = useToast();
  const roleLabel = app?.status === 'pending' ? '입점 심사 현황 보기' : app?.status === 'rejected' ? '입점 심사 결과 확인하기' : '판매자 입점 신청';
  const shortTs = (ms: number) => { const d = new Date(ms); return `${d.getMonth()+1}.${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`; };
  const shortDt = (ms: number) => { const d = new Date(ms); const days = ['일','월','화','수','목','금','토']; return `${d.getMonth()+1}.${d.getDate()} (${days[d.getDay()]})`; };
  const reviewDate = app ? (app.reviewedAt ?? (app.submittedAt + 2 * 86_400_000)) : 0;
  const deadlineDate = app ? (app.deadlineAt ?? (app.submittedAt + 7 * 86_400_000)) : 0;
  const appStatusDesc = app?.status === 'pending'
    ? `${shortTs(app.submittedAt)} 신청 · ${shortDt(reviewDate)} 결과 안내 예정`
    : app?.status === 'approved'
    ? `${shortTs(app.approvedAt ?? app.submittedAt)} 승인 · 지금 첫 한정 판매를 등록할 수 있어요`
    : app?.status === 'rejected'
    ? `${(app.rejectionItems?.length ?? 0)}개 항목 보완 필요 · ${shortDt(deadlineDate)}까지 제출해 주세요`
    : '';
  const appStepLabel = app?.status === 'pending' ? '입점 심사 중' : app?.status === 'approved' ? '입점 승인' : app?.status === 'rejected' ? '입점 심사 반려' : '';
  return <div className="space-y-5"><Header title="구매자 마이페이지" subtitle="내 주문과 계정 정보를 관리하세요." back={false}/><button className="divider w-full flex items-center gap-3 pb-5 text-left" onClick={() => setProfileEdit(true)}><div className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[4px] bg-[var(--blue-soft)] text-[18px] font-bold">{user.name[0]}</div><div className="min-w-0 flex-1"><h2 className="break-words text-[17px] font-bold">{user.name}</h2><p className="muted mt-1 break-all text-[12px]">{user.email}</p></div><span className="muted text-[11px] shrink-0">수정 ›</span></button><MenuRow to="/orders" label="주문 · 배송 조회"/><section className="note space-y-3"><p className="muted text-[10px]">회원 권한</p><h2 className="text-[22px] font-bold">구매자{user.seller ? ' + 판매자' : ''}</h2><p className="muted text-[12px]">{user.seller ? '개인·사업자 모두 구매할 수 있어요.' : '개인·사업자 모두 구매할 수 있어요.'}</p><p className="muted text-[12px]">판매는 입점 심사 승인 후 시작할 수 있어요.</p>{app && <div className="rounded-[4px] bg-[var(--canvas,#F7F7F7)] p-3 space-y-1"><div className="flex items-center justify-between"><p className="text-[11px] font-bold">판매자 입점 신청</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${app.status === 'approved' ? 'bg-[var(--green-soft)] text-[var(--green)]' : app.status === 'rejected' ? 'bg-[var(--red-soft,#FEF2F2)] text-[var(--red)]' : 'bg-[var(--blue-soft)]'}`}>{appStepLabel}</span></div><p className="muted text-[11px] leading-relaxed">{appStatusDesc}</p></div>}<Button className="w-full" onClick={() => { if (app) navigate('/apply'); else navigate('/seller/terms'); }}>{roleLabel}</Button></section><div><button onClick={() => navigate('/addresses')} className="divider flex h-[52px] w-full items-center justify-between"><span>배송지 관리</span><span className="muted">›</span></button><button onClick={() => navigate(SETTINGS_HREF('/my'))} className="divider flex h-[52px] w-full items-center justify-between"><span>알림 설정</span><span className="muted">›</span></button>{!USE_MOCK && <button onClick={() => navigate('/my/interests')} className="divider flex h-[52px] w-full items-center justify-between"><span>관심사와 맞춤 추천</span><span className="muted">›</span></button>}<button onClick={() => setPwChange(true)} className="divider flex h-[52px] w-full items-center justify-between"><span>비밀번호 변경</span><span className="muted">›</span></button><Link className="divider flex h-[52px] items-center justify-between" to="/support">고객 지원 <span className="muted">›</span></Link></div>{user.admin && <MenuRow to="/admin" label="운영자 · 판매자 신청 검토"/>}<div className="text-center"><LogoutButton/></div>{profileEdit && <ProfileEditModal userId={user.id} name={user.name} phone={user.phone} onClose={() => setProfileEdit(false)}/>}{pwChange && <PasswordChangeModal onClose={() => setPwChange(false)}/>}</div>;
}

interface ApplicationForm { displayName: string; name: string; email: string; phone: string; bank: string; account: string; shippingPostal: string; shippingAddress: string; returnPostal: string; returnAddress: string }
/** localStorage를 못 쓰는 환경에서도 주소 검색에 다녀오는 동안 첨부 PDF를 잃지 않게(새로고침 전까지) */
const keptDoc = new Map<string, DocumentFile>();
export function ApplicationPage() {
  const s = useStore(), user = activeUser(s), navigate = useNavigate(); const previous = s.applications.find(a => a.userId === user.id); const toast = useToast();
  const [showDetail, setShowDetail] = useState(false);
  const [doc, setDoc] = useState<DocumentFile | undefined>(() => { try { return JSON.parse(localStorage.getItem(`application-doc:${user.id}`) || 'null') ?? keptDoc.get(user.id); } catch { return keptDoc.get(user.id); } }); const [form, setForm] = useState<ApplicationForm>(() => { try { return JSON.parse(localStorage.getItem(`application-draft:${user.id}`) || 'null') ?? { displayName: '', name: user.name, email: user.email, phone: user.phone, bank: '신한은행', account: '', shippingPostal: '', shippingAddress: '', returnPostal: '', returnAddress: '' }; } catch { return { displayName: '', name: user.name, email: user.email, phone: user.phone, bank: '신한은행', account: '', shippingPostal: '', shippingAddress: '', returnPostal: '', returnAddress: '' }; } }); const [error, setError] = useState(''); const [applyErr, setApplyErr] = useState<ApplyProblems>({});
  // 주소 검색(Daum) 결과로 출고지·반품 주소와 우편번호를 채운다
  const [applyParams, setApplyParams] = useSearchParams();
  useEffect(() => { const target = applyParams.get('pick'); if (!target) return; const picked = takeAddressPick(); if (picked) setForm(f => { const next = target === 'shipping' ? { ...f, shippingAddress: picked.roadAddress, shippingPostal: picked.postalCode } : { ...f, returnAddress: picked.roadAddress, returnPostal: picked.postalCode }; try { localStorage.setItem(`application-draft:${user.id}`, JSON.stringify(next)); } catch { /* 제출 시 다시 검증 */ } return next; }); setApplyParams({}, { replace: true }); }, [applyParams]);
  function change(key: keyof ApplicationForm, value: string) { const next = { ...form, [key]: value }; setForm(next); try { localStorage.setItem(`application-draft:${user.id}`, JSON.stringify(next)); } catch { /* Main submission still validates storage. */ } }
  // 실제 모드: 내 최신 신청(+보완 요청)을 읽어 store에 반영. 승인이면 토큰에 SELLER 역할이 실리도록 세션을 다시 받는다
  const live = useLive(async signal => { const app = await fetchMyApplication(user.id, signal); if (app?.status === 'approved' && !user.seller) restoreSession().catch(() => {}); return app; }, mergeApplication, [user.id]);
  const [fixDoc, setFixDoc] = useState<DocumentFile>();
  const [reapply, setReapply] = useState(false); // 실제 모드: 반려·보완 기한 만료 뒤 새로 신청하기
  // 실제 모드 보완 요청·반려·기한 만료: 서버 보완 항목 기준 화면(pages/sellerCorrection.tsx). 판매자(재심사 중 보완 요청)는 보완 요청일 때만
  if (!USE_MOCK && previous && !reapply && (previous.apiStatus === 'CHANGES_REQUESTED' || !user.seller && ['REJECTED', 'EXPIRED'].includes(previous.apiStatus ?? ''))) return <><Header title="입점 심사"/><LiveStatus state={live}/><CorrectionScreen app={previous} onReapply={() => setReapply(true)} onSubmitted={() => { mutate(state => { const a = state.applications.find(x => x.userId === user.id); if (a) { a.status = 'pending'; a.apiStatus = 'PENDING'; a.submittedAt = Date.now(); } }); toast('보완 내용을 제출했어요. 다시 심사해 드릴게요.'); live.reload(); }}/></>;
  if (user.seller) {
    const sellerName = s.sellerSettings[user.id]?.displayName ?? user.name;
    const shippingAddr = s.sellerSettings[user.id]?.shippingAddress ?? (s.applications.find(a => a.userId === user.id)?.shippingAddress ?? '');
    return <div className="space-y-5"><Header title="입점 심사"/><div className="grid grid-cols-3 gap-2 text-center text-[11px]"><span>✓ 정보 입력</span><span>✓ 입점 심사</span><b>03 판매 시작</b></div><p className="text-[10px] font-bold tracking-[1px]">WELCOME TO STOCKDROP PARTNERS</p><h1 className="text-[22px] font-bold leading-[1.5] tracking-[-1px]">{sellerName}님,<br/>입점이 승인됐어요</h1><p className="muted text-[12px] leading-relaxed">이제 남은 재고를 3시간 한정 판매로<br/>빠르게 정리할 수 있어요.</p><div className="grid grid-cols-3 gap-2 rounded-[4px] bg-[var(--blue-soft)] p-4 text-center"><div><p className="font-number text-[20px] font-bold">10% / 0%</p><p className="muted text-[10px]">판매 수수료</p><p className="muted text-[10px]">상품별 한정 수량 90% 초과 판매 시 판매 금액의 10%, 그 외 0% (배송비 제외)</p></div><div><p className="font-number text-[20px] font-bold">D+7</p><p className="muted text-[10px]">정산 주기</p></div><div><p className="font-number text-[20px] font-bold">2영업일</p><p className="muted text-[10px]">출고 기한</p></div></div><Note title="판매 시작 전에 확인해 주세요"><p className="mb-2"><b>첫 한정 판매 등록</b><br/><span className="muted">상품, 수량, 판매 시간을 정하고 판매 심사를 요청해요</span></p>{shippingAddr && <p className="mb-2"><b>출고지 · 반품 주소 확인</b><br/><span className="muted">{shippingAddr}</span></p>}<p><b>판매자 알림 설정</b><br/><span className="muted">주문·출고 마감 알림을 받을 번호를 확인해요</span></p></Note><Button className="w-full" onClick={() => { navigate('/seller/new'); }}>첫 한정 판매 등록하기</Button><Button outline className="w-full" onClick={() => { navigate('/'); }}>홈으로</Button></div>;
  }
  if (previous && !reapply) {
    const shortDt = (ms: number) => { const d = new Date(ms); const days = ['일','월','화','수','목','금','토']; return `${d.getMonth()+1}.${d.getDate()} (${days[d.getDay()]})`; };
    const shortTs = (ms: number) => { const d = new Date(ms); return `${d.getMonth()+1}.${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`; };
    const reviewDate = previous.reviewedAt ?? (previous.submittedAt + 2 * 86_400_000);
    const deadlineDate = previous.deadlineAt ?? (previous.submittedAt + 7 * 86_400_000);
    const items = previous.rejectionItems ?? [];
    const fixedCount = items.filter(i => i.fixed).length;
    const allFixed = items.length > 0 && fixedCount === items.length;

    if (previous.status === 'rejected') {
      // 입점 심사 실패 → 사유 확인하기 → 심사 반려(수정)
      const hasUnfixed = items.some(i => !i.fixed);
      const reviewFields = [
        { label: '판매자 표시 이름', status: items.find(i => i.field === '판매자 표시 이름')?.fixed === false ? '보완 필요' : '확인 완료' },
        { label: '담당자', status: items.find(i => i.field === '담당자')?.fixed === false ? '보완 필요' : '확인 완료' },
        { label: '사업자등록증', status: items.some(i => i.field === '사업자등록증 PDF' && !i.fixed) ? '보완 필요' : '확인 완료' },
        { label: '정산 계좌', status: items.some(i => i.field === '정산 계좌번호' && !i.fixed) ? '보완 필요' : '확인 완료' },
        { label: '출고지', status: items.some(i => i.field === '출고지' && !i.fixed) ? '보완 필요' : '확인 완료' },
      ];
      const needCount = reviewFields.filter(f => f.status === '보완 필요').length;

      if (!showDetail) {
        // 입점 심사 실패 overview
        return <div className="space-y-5">
          <Header title="입점 심사"/>
          <div className="grid grid-cols-3 gap-2 text-center text-[11px]"><span>✓ 정보 입력</span><b>02 입점 심사</b><span className="muted">03 판매 시작</span></div>
          <div>
            <h1 className="text-[22px] font-bold leading-[1.5] tracking-[-1px]">입점 심사를<br/>통과하지 못했어요</h1>
            <p className="muted mt-2 text-[12px] leading-relaxed">제출한 정보 중 {needCount}개 항목을 확인하지 못했어요.<br/>사유를 확인하고 보완하면 다시 심사해 드려요.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><p className="muted text-[10px]">심사 완료</p><p className="mt-1 text-[12px] font-bold">{shortDt(reviewDate)}</p></div>
            <div><p className="muted text-[10px]">보완 기한</p><p className="mt-1 text-[12px] font-bold">{shortDt(deadlineDate)}</p></div>
          </div>
          <section className="divider space-y-0 py-2">
            <h2 className="mb-3 text-[15px] font-bold">입점 심사 결과</h2>
            <InfoRow label="신청 번호" value={previous.id}/>
            {reviewFields.map(f => (
              <div key={f.label} className="divider flex items-center justify-between py-3">
                <span className="text-[12px]">{f.label}</span>
                <span className={`text-[11px] font-semibold ${f.status === '보완 필요' ? 'text-[var(--red)]' : 'text-[var(--green)]'}`}>{f.status}</span>
              </div>
            ))}
          </section>
          <Note title="기한 안에 보완하지 않으면 신청이 취소돼요.">취소되면 처음부터 다시 신청해야 해요.</Note>
          <div className="flex gap-2">
            <Link className="btn btn-outline flex-1" to="/support">고객센터 문의</Link>
            <Button className="flex-1" onClick={() => setShowDetail(true)}>사유 확인하기</Button>
          </div>
        </div>;
      }
      return <div className="space-y-5">
        <Header title="입점 심사"/>
        <div className="grid grid-cols-3 gap-2 text-center text-[11px]"><span>✓ 정보 입력</span><b>02 입점 심사</b><span className="muted">03 판매 시작</span></div>
        <div>
          <h1 className="text-[22px] font-bold leading-[1.5] tracking-[-1px]">{items.length}개 항목의<br/>보완이 필요해요</h1>
          <p className="muted mt-2 text-[12px] leading-relaxed">{shortDt(deadlineDate)}까지 보완해 주시면<br/>제출한 날부터 다시 심사를 진행해요.</p>
        </div>
        <section className="space-y-4">
          {items.map((item, idx) => (
            <div key={idx} className={`space-y-3 rounded-[4px] border p-4 ${item.fixed ? 'border-[var(--line)] opacity-60' : 'border-[var(--red)]'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold text-[var(--muted)]">0{idx + 1}</p>
                  <p className="text-[13px] font-bold">{item.field}</p>
                </div>
                {item.fixed
                  ? <span className="shrink-0 rounded-full bg-[var(--green-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--green)]">수정 완료</span>
                  : <button className="shrink-0 rounded-[4px] border border-[var(--ink)] px-3 py-1 text-[11px] font-bold" disabled={!USE_MOCK && item.field === '사업자등록증 PDF' && !fixDoc} onClick={() => mutate(state => { const a = state.applications.find(a => a.userId === user.id); if (a?.rejectionItems) a.rejectionItems[idx].fixed = true; })}>수정하기</button>
                }
              </div>
              <p className="text-[12px] leading-relaxed text-[var(--red)]">{item.reason}</p>
              {!item.fixed && item.field === '사업자등록증 PDF' && <><p className="muted text-[11px]">원본 PDF로 다시 첨부해 주세요.</p>{!USE_MOCK && <PdfField value={fixDoc} onChange={setFixDoc}/>}</>}
            </div>
          ))}
        </section>
        {items.length === 0 && (
          <div className="space-y-3 rounded-[4px] border border-[var(--red)] p-4">
            <p className="text-[13px] font-bold">입점 심사를 통과하지 못했어요</p>
            <p className="muted text-[12px]">{shortDt(deadlineDate)}까지 보완해 주세요.</p>
          </div>
        )}
        <section className="space-y-2">
          <p className="text-[13px] font-bold">확인 완료된 항목</p>
          {['판매자 표시 이름 · 담당자 정보', '정산 은행', '출고지 · 반품 주소'].map(label => (
            <div key={label} className="divider flex items-center justify-between py-3">
              <span className="text-[12px]">{label}</span>
              <span className="text-[11px] font-semibold text-[var(--green)]">확인 완료</span>
            </div>
          ))}
        </section>
        {hasUnfixed
          ? <p className="muted text-center text-[11px]">{items.length}개 항목을 모두 수정하면 제출할 수 있어요</p>
          : null
        }
        <ErrorBox message={error}/><Button className="w-full" disabled={!allFixed && items.length > 0} onClick={async () => { if (!USE_MOCK) { setError(''); try { const has = (f: string) => items.some(i => i.field === f); await resubmitApplication(previous.id, has('담당자') ? { contact: { name: previous.name, email: previous.email, phone: previous.phone } } : {}, has('사업자등록증 PDF') && fixDoc ? await getPdf(fixDoc.id) : undefined, fixDoc?.name); } catch (e) { setError(errorMessage(e)); return; } } mutate(state => { const a = state.applications.find(x => x.userId === user.id); if (a) { a.status = 'pending'; a.submittedAt = Date.now(); } }); }}>심사 다시 요청하기</Button>
      </div>;
    }

    // 입점 심사 대기 (pending) or 심사 실패 fallback display
    const isFailed = (previous as any)._failed;
    return <div className="space-y-5">
      <Header title="입점 심사" subtitle={previous.id}/>
      <LiveStatus state={live}/>
      <div className="grid grid-cols-3 gap-2 text-center text-[11px]"><span>✓ 정보 입력</span><b>02 입점 심사</b><span className="muted">03 판매 시작</span></div>
      <h1 className="text-[22px] font-bold leading-[1.5] tracking-[-1px]">입점 심사가<br/>진행 중이에요</h1>
      <p className="muted text-[12px] leading-relaxed">영업일 기준 1~2일 안에 결과를 알림과<br/>이메일({previous.email})로 알려드려요.</p>
      <div className="grid grid-cols-2 gap-4">
        <div><p className="muted text-[10px]">신청 일시</p><p className="mt-1 text-[12px] font-bold">{shortTs(previous.submittedAt)}</p></div>
        <div><p className="muted text-[10px]">결과 안내 예정</p><p className="mt-1 text-[12px] font-bold">{shortDt(reviewDate)}</p></div>
      </div>
      <section className="divider space-y-3 py-4">
        <h2 className="text-[15px] font-bold">신청 정보</h2>
        <InfoRow label="신청 번호" value={previous.id}/>
        <InfoRow label="판매자 표시 이름" value={previous.displayName || `${previous.name}의 스토어`}/>
        <InfoRow label="담당자" value={`${previous.name} · ${previous.phone}`}/>
        <PdfField value={previous.document} readOnly/>
        <InfoRow label="정산 계좌" value={`${previous.bank} ${previous.account.slice(0, 3)}-***-***${previous.account.slice(-3)}`}/>
        <InfoRow label="출고지" value={previous.shippingAddress}/>
      </section>
      <Note title="심사 중에는 신청 정보를 수정할 수 없어요.">변경이 필요하면 고객센터로 문의해 주세요.</Note>
      <div className="flex gap-2">
        <Link className="btn btn-outline flex-1" to="/support">고객센터 문의</Link>
        <Link className="btn flex-1" to="/">홈으로</Link>
      </div>
    </div>;
  }
  const inputs: [keyof ApplicationForm, string, string?][] = [['displayName', '판매자 표시 이름 · 선택', '예: 나의 상점'], ['name', '담당자 이름', '예: 홍길동'], ['email', '이메일', '예: hong@example.com'], ['phone', '연락처', '예: 01012345678'], ['bank', '정산 은행'], ['account', '정산 계좌번호', '숫자만 · 예: 110123456789'], ['shippingAddress', '출고지'], ['returnAddress', '반품 주소']];
  const searchAddress = (target: 'shipping' | 'return') => navigate(`/address-search?returnTo=${encodeURIComponent(`/apply?pick=${target}`)}`);
  /** 문제가 있는 칸을 표시하고, 화면 위 요약 문구를 띄운 뒤 첫 칸으로 이동한다 */
  function showApply(p: ApplyProblems, message = problemSummary(p)) {
    setApplyErr(p); setError(message);
    const k = firstProblem(p), el = k && document.querySelector<HTMLElement>(`[data-apply="${k}"]`);
    if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.querySelector<HTMLElement>('input, button')?.focus({ preventScroll: true }); }
  }
  /** 제출: 칸에 보이는 실제 값(자동완성으로 채워져 상태에 안 들어간 값 포함)을 먼저 반영하고, 서버와 같은 규칙으로 검사한 뒤 접수한다 */
  async function submitApply(el: HTMLFormElement) {
    setError(''); setApplyErr({});
    const typed = new FormData(el), shown = (k: keyof ApplicationForm) => { const v = typed.get(k); return typeof v === 'string' ? v : form[k] ?? ''; };
    const f: ApplicationForm = { ...form, displayName: shown('displayName'), name: shown('name'), email: shown('email'), phone: shown('phone'), account: shown('account') };
    setForm(f); try { localStorage.setItem(`application-draft:${user.id}`, JSON.stringify(f)); } catch { /* 제출은 계속한다 */ }
    if (s.applications.some(a => a.userId === user.id)) { setError('이미 접수된 입점 신청이 있어요. 마이페이지에서 진행 상태를 확인해 주세요.'); return; }
    const problems = applicationProblems(f, !!doc);
    if (Object.keys(problems).length) { showApply(problems); return; }
    try {
      let pdf: Blob | undefined;
      // 저장해 둔 PDF(IndexedDB)는 사파리에서 업로드 때 빠질 수 있어 내용을 새 파일로 복사해 보낸다
      if (!USE_MOCK) { try { const raw = await getPdf(doc!.id); pdf = new Blob([await raw.arrayBuffer()], { type: 'application/pdf' }); } catch { showApply({ certificate: '첨부한 사업자등록증을 다시 읽지 못했어요. PDF를 다시 첨부해 주세요.' }); return; } }
      const result = USE_MOCK ? { applicationId: uid('app-') } : await submitApplication({ displayName: f.displayName.trim(), name: f.name.trim(), email: f.email.trim(), phone: normalizePhone(f.phone), bank: f.bank, account: normalizeAccount(f.account), shippingPostal: f.shippingPostal, shippingAddress: f.shippingAddress, returnPostal: f.returnPostal, returnAddress: f.returnAddress }, pdf!, doc!.name);
      await atomic(state => { state.applications.unshift({ id: result.applicationId, userId: user.id, displayName: f.displayName, name: f.name, email: f.email, phone: f.phone, document: doc!, bank: f.bank, account: f.account, shippingAddress: f.shippingAddress, returnAddress: f.returnAddress, status: 'pending', submittedAt: nowOf(state) }); }); setReapply(false); localStorage.removeItem(`application-draft:${user.id}`); localStorage.removeItem(`application-doc:${user.id}`); keptDoc.delete(user.id); toast('판매자 신청이 접수되었습니다.'); 
    } catch (e) { const r = applicationFailure(e); showApply(r.fields, r.message); }
  }
  return <form noValidate className="space-y-5" onSubmit={event => { event.preventDefault(); void submitApply(event.currentTarget); }}><Header title="판매자 입점 신청" subtitle="1인 쇼핑몰 개인사업자를 위한 판매자 신청"/><LiveStatus state={live}/><div className="flex gap-4 bg-[var(--hero)] p-5"><div className="flex-1"><p className="text-[9px] font-bold tracking-[1px]">STOCKDROP PARTNERS</p><h2 className="mt-3 text-[22px] font-bold leading-[1.5] tracking-[-1px]">혼자 운영하는 쇼핑몰,<br/>남은 재고를 새 기회로.</h2><p className="muted mt-3 text-[11px] leading-relaxed">사업자등록증을 첨부하고<br/>판매자로 신청해 보세요.</p></div><Store size={52} strokeWidth={1} className="self-center text-[var(--muted)]"/></div><div className="divider grid grid-cols-3 gap-2 pb-5 text-center text-[11px]"><b>01 정보 입력</b><span className="muted">02 입점 심사</span><span className="muted">03 판매 시작</span></div><div data-apply="certificate"><PdfField value={doc} onChange={file => { setApplyErr(x => ({ ...x, certificate: undefined })); setDoc(file); if (file) keptDoc.set(user.id, file); else keptDoc.delete(user.id); try { if (file) localStorage.setItem(`application-doc:${user.id}`, JSON.stringify(file)); else localStorage.removeItem(`application-doc:${user.id}`); } catch { setError('파일 정보를 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.'); } }}/>{applyErr.certificate && <p role="alert" className="mt-1.5 text-[12px] text-[var(--red)]">{applyErr.certificate}</p>}</div>{inputs.map(([key, label, placeholder]) => <div key={key} data-apply={key}><Field label={label} required={key !== 'displayName'} error={applyErr[key as ApplyField]}>{key === 'bank' ? <BankField value={form.bank} onChange={v => change('bank', v)}/> : key === 'shippingAddress' || key === 'returnAddress' ? <input aria-label={label} readOnly value={form[key] ?? ''} placeholder="눌러서 주소 검색" onClick={() => searchAddress(key === 'shippingAddress' ? 'shipping' : 'return')} className="field cursor-pointer"/> : <input aria-label={label} name={key} autoComplete={({ name: 'name', email: 'email', phone: 'tel' } as Record<string, string>)[key] ?? 'off'} inputMode={key === 'phone' || key === 'account' ? 'numeric' : undefined} type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'} value={form[key] ?? ''} onChange={e => { change(key, e.target.value); if (applyErr[key as ApplyField]) setApplyErr(x => ({ ...x, [key]: undefined })); }} placeholder={placeholder} className="field"/>}</Field></div>)}<Note title="사업자등록증 검토 안내">사업자등록증 PDF와 담당자 정보를 확인한 뒤 승인 결과를 안내합니다.</Note><ErrorBox message={error}/><Button className="w-full" type="submit" disabled={!doc}>입점 심사 요청하기</Button>{!doc && <p className="muted mt-2 text-center text-[11px]">사업자등록증 PDF를 먼저 첨부해 주세요</p>}</form>;
}

function DdayBadge({ ts }: { ts: number }) {
  const d = Math.ceil((ts - Date.now()) / 86_400_000);
  if (d > 3 || d < -1) return null;
  const label = d < 0 ? '기한 초과' : d === 0 ? 'D-day' : `기한 D-${d}`;
  return <span className="inline-flex h-[18px] items-center rounded-[4px] bg-[#FDEDED] px-2 text-[11px] font-bold text-[#E5484D]">{label}</span>;
}
function UrlCard({ url, viewed, onView }: { url: string; viewed: boolean; onView: () => void }) {
  const display = url.replace(/^https?:\/\//, '');
  return (
    <div className="rounded-[6px] border border-[var(--line)]">
      <div className="flex items-center gap-3 rounded-t-[6px] bg-[var(--soft)] px-4 py-3">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6.668 10.667C6.954 11.05 7.32 11.367 7.739 11.596C8.159 11.825 8.622 11.961 9.099 11.996C9.576 12.03 10.054 11.961 10.502 11.794C10.95 11.627 11.357 11.365 11.695 11.027L13.695 9.027C14.302 8.399 14.638 7.556 14.631 6.682C14.623 5.808 14.272 4.972 13.654 4.354C13.036 3.736 12.2 3.386 11.326 3.378C10.452 3.37 9.61 3.706 8.981 4.314L7.835 5.454" stroke="#7B7B7B" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><path d="M9.334 10.334C9.047 9.951 8.682 9.634 8.263 9.405C7.843 9.176 7.379 9.04 6.903 9.006C6.426 8.971 5.947 9.04 5.499 9.207C5.052 9.374 4.645 9.636 4.307 9.974L2.307 11.974C1.7 12.603 1.364 13.445 1.371 14.319C1.379 15.193 1.729 16.029 2.347 16.647C2.966 17.265 3.802 17.616 4.676 17.623C5.55 17.631 6.392 17.295 7.02 16.688L8.161 15.547" stroke="#7B7B7B" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
        <span className="min-w-0 flex-1 truncate text-[12px]">{display}</span>
        <a href={url} target="_blank" rel="noopener noreferrer" onClick={onView} className="flex h-[26px] shrink-0 items-center gap-1 rounded-[4px] bg-[var(--ink)] px-3 text-[12px] font-bold text-white">열기</a>
      </div>
    </div>
  );
}
/** 두 심사를 한눈에 구분: 입점 심사(판매자 신청)=파랑, 판매 심사(상품)=주황 */
export const REVIEW_KIND = { store: { label: '입점 심사', cls: 'bg-[#EAF1FF] text-[#2F6FED]', bar: 'border-l-[#2F6FED]' }, sale: { label: '판매 심사', cls: 'bg-[#FFF1E5] text-[#D9730D]', bar: 'border-l-[#D9730D]' } } as const;
export function ReviewKindBadge({ kind }: { kind: keyof typeof REVIEW_KIND }) { return <span className={`inline-flex h-[20px] shrink-0 items-center rounded-[4px] px-2 text-[11px] font-bold ${REVIEW_KIND[kind].cls}`}>{REVIEW_KIND[kind].label}</span>; }
/** 판매 심사 대기: 승인·반려 전 상품 */
const salePending = (p: { published: boolean; rejectionReason?: string; reviewStatus?: string }) => USE_MOCK ? !p.published && !p.rejectionReason : p.reviewStatus === 'IN_REVIEW';
/** 운영자 마이페이지 — 운영자 계정은 구매자 홈·판매 일정·주문 없이 이 화면에서 시작한다 */
export function AdminMyPage() {
  const s = useStore(), user = activeUser(s);
  const apps = useLive(sig => user.admin ? listAdminApplications({}, sig) : Promise.resolve([]), mergeAdminApplications, [user.admin]);
  const reviews = useLive(sig => user.admin ? listAdminProductReviews('IN_REVIEW', sig) : Promise.resolve([]), mergeAdminProductList, [user.admin]);
  if (!user.admin) return <Unavailable message="운영자만 사용할 수 있습니다."/>;
  const storeWaiting = s.applications.filter(a => a.status === 'pending').length, saleWaiting = s.products.filter(salePending).length;
  const count = (n: number, kind: keyof typeof REVIEW_KIND) => <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${n ? REVIEW_KIND[kind].cls : 'bg-[var(--soft)] text-[var(--muted)]'}`}>대기 {n}건</span>;
  return <div className="space-y-5">
    <Header title="운영자 마이페이지" subtitle="입점 심사와 판매 심사를 처리해 주세요." back={false}/>
    <div className="flex items-center gap-3 pb-1"><div className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[4px] bg-[var(--ink)] text-[16px] font-bold text-[var(--surface)]">OP</div><div className="min-w-0 flex-1"><h2 className="break-words text-[17px] font-bold">{user.name}</h2><p className="muted mt-1 break-all text-[12px]">{user.email}</p></div></div>
    <LiveStatus state={apps.error ? apps : reviews}/>
    <div>
      <MenuRow to="/admin/applications" label="입점 심사">{count(storeWaiting, 'store')}</MenuRow>
      <MenuRow to="/admin/products" label="판매 심사">{count(saleWaiting, 'sale')}</MenuRow>
      <MenuRow to="/admin/sellers" label="판매자 목록"/>
      <MenuRow to="/admin/inquiries" label="문의 관리"/>
    </div>
    <div className="text-center"><LogoutButton/></div>
  </div>;
}
/** 판매자 목록 — TODO(api-gap): 운영자 판매자 목록 API가 명세에 없다. 승인된 입점 신청(GET /admin/seller-applications?status=APPROVED)으로 대신 보여 준다(판매 제한 여부 등은 없음) */
export function AdminSellersPage() {
  const s = useStore(), user = activeUser(s);
  const live = useLive(sig => user.admin ? listAdminApplications({ status: 'APPROVED' }, sig) : Promise.resolve([]), mergeAdminApplications, [user.admin]);
  if (!user.admin) return <Unavailable message="운영자만 사용할 수 있습니다."/>;
  const sellers = s.applications.filter(a => a.status === 'approved').sort((a, b) => (b.approvedAt ?? 0) - (a.approvedAt ?? 0));
  return <div>
    <Header title="판매자 목록" subtitle={`입점 심사를 통과한 판매자 ${sellers.length}명`}/>
    {sellers.map(a => <Link key={a.id} to={`/admin/${a.id}`} className="divider flex items-center gap-3 py-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-[4px] bg-[#F5F5F5]"><Store size={20} className="text-[#7B7B7B]"/></div><div className="min-w-0 flex-1"><p className="text-[14px] font-bold">{a.displayName || `${a.name}의 스토어`}</p><p className="muted mt-0.5 text-[12px]">{a.name} · {a.email}</p>{a.approvedAt && <p className="muted text-[11px]">{dateTime(a.approvedAt)} 승인</p>}</div><span className="muted">›</span></Link>)}
    <LiveStatus state={live}/>
    {!live.loading && !live.error && !sellers.length && <Empty title="승인된 판매자가 없어요"/>}
  </div>;
}
/** 문의 관리(StockDrop 1:1 문의) — 운영자 1:1 문의 조회·답변 API(api/support.ts)로 동작한다. mock 모드만 이 기기 저장 */
export function AdminInquiriesPage() {
  const s = useStore(), user = activeUser(s), toast = useToast(); const [open, setOpen] = useState(''), [answer, setAnswer] = useState(''), [busy, setBusy] = useState(false);
  const live = useLive(sig => (USE_MOCK || !user.admin ? Promise.resolve([]) : listAdminSupportInquiries(sig)), mergeInquiries, [user.admin]);
  if (!user.admin) return <Unavailable message="운영자만 사용할 수 있습니다."/>;
  const items = s.inquiries.filter(q => q.sellerId === 'stockdrop').sort((a, b) => Number(!!a.answer) - Number(!!b.answer) || b.createdAt - a.createdAt);
  return <div>
    <Header title="문의 관리" subtitle={`답변 대기 ${items.filter(q => !q.answer).length}건 · 1:1 문의`}/>
    {!USE_MOCK && <LiveStatus state={live}/>}
    {items.map(q => <div key={q.id} className="divider space-y-2 py-4">
      <button className="w-full space-y-1 text-left" aria-expanded={open === q.id} onClick={() => { setOpen(open === q.id ? '' : q.id); setAnswer(''); }}>
        <div className="flex items-center justify-between gap-2"><span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${q.answer ? 'bg-[#EEF8F3] text-[#3FB181]' : 'bg-[var(--soft)] text-[var(--muted)]'}`}>{q.answer ? '답변 완료' : '답변 대기'}</span><span className="muted text-[10px]">{q.kind} · {dateTime(q.createdAt)}</span></div>
        <p className={`text-[13px] ${open === q.id ? 'whitespace-pre-line' : 'truncate'}`}>{q.question}</p>
      </button>
      {open === q.id && (q.answer ? <div className="rounded-[6px] border border-[var(--line)] p-3 text-[12px] leading-relaxed whitespace-pre-line">{q.answer}</div> : <div className="space-y-2"><textarea aria-label="문의 답변" className="field field-box w-full" rows={3} maxLength={1000} value={answer} onChange={e => setAnswer(e.target.value)} placeholder="답변을 입력해 주세요"/><Button className="w-full" disabled={!answer.trim() || busy} onClick={async () => { setBusy(true); try { if (!USE_MOCK) { const r = await answerSupportInquiry(q.id, answer); mutate(st => mergeInquiries(st, [{ ...r, userId: q.userId }])); } else mutate(st => { const it = st.inquiries.find(x => x.id === q.id); if (it) it.answer = answer.trim(); }); setAnswer(''); setOpen(''); toast('답변을 등록했어요. 문의한 분께 알림이 가요.'); } catch (e) { toast(errorMessage(e)); } finally { setBusy(false); } }}>{busy ? '등록 중…' : '답변 등록'}</Button></div>)}
    </div>)}
    {!items.length && <Empty title="받은 문의가 없어요"/>}
  </div>;
}
export function AdminListPage() {
  const s = useStore(), user = activeUser(s); const [tab, setTab] = useState<'pending' | 'approved' | 'correction'>('pending');
  // 실제 모드: 보완 요청을 보낸 신청(CHANGES_REQUESTED)도 따로 모아 보낸 요청을 다시 볼 수 있게 한다
  const inTab = (a: Application, t: 'pending' | 'approved' | 'correction') => t === 'correction' ? a.apiStatus === 'CHANGES_REQUESTED' : a.status === t;
  const live = useLive(sig => user.admin ? listAdminApplications({}, sig) : Promise.resolve([]), mergeAdminApplications, [user.admin]);
  if (!user.admin) return <Unavailable message="운영자만 사용할 수 있습니다."/>;
  const all = s.applications;
  const apps = all.filter(a => inTab(a, tab)).sort((a, b) => a.submittedAt - b.submittedAt);
  const reviewDeadline = (sub: number) => sub + 2 * 86_400_000;
  return (
    <div className={`border-l-4 ${REVIEW_KIND.store.bar} -ml-4 pl-3`}>
      <Header title="입점 심사 목록" subtitle="판매자 신청 · 사업자등록증과 신청 정보를 확인하고 승인해 주세요." action={<ReviewKindBadge kind="store"/>}/>
      <div className="mb-3 flex gap-5 border-b border-[var(--line)]">
        {(USE_MOCK ? ['pending', 'approved'] as const : ['pending', 'correction', 'approved'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`border-b-2 py-3 text-[14px] ${tab === t ? 'border-[var(--ink)] font-bold text-[var(--ink)]' : 'border-transparent text-[#949494]'}`}>
            {t === 'pending' ? '심사 대기' : t === 'correction' ? '보완 요청' : '승인 완료'} {all.filter(a => inTab(a, t)).length}건
          </button>
        ))}
      </div>
      {apps.map(app => (
        <Link key={app.id} to={`/admin/${app.id}`} className="block border-b border-[var(--line)] py-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#949494]">{dateTime(app.submittedAt)} 접수</span>
            <div className="flex items-center gap-2">
              {tab === 'pending' && <DdayBadge ts={reviewDeadline(app.submittedAt)}/>}
              <span className={`inline-flex h-[18px] items-center rounded-[4px] px-2 text-[11px] font-bold ${app.status === 'approved' ? 'bg-[var(--soft)] text-[var(--ink)]' : 'bg-[var(--soft)] text-[var(--ink)]'}`}>
                {app.status === 'pending' ? '심사 대기' : app.apiStatus === 'CHANGES_REQUESTED' ? '보완 요청' : '승인 완료'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[4px] bg-[#F5F5F5]">
              <Store size={20} className="text-[#7B7B7B]"/>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-bold">{app.displayName || `${app.name}의 스토어`}</p>
              <p className="mt-0.5 text-[12px] text-[#7B7B7B]">{app.name} · 개인사업자</p>
            </div>
            <span className="text-[14px] text-[#949494]">›</span>
          </div>
          <p className="text-[11px] text-[#949494]">사업자등록증 PDF · 신청 정보 보기</p>
        </Link>
      ))}
      <LiveStatus state={live}/>
      {!live.loading && !live.error && !apps.length && <Empty title={tab === 'pending' ? '심사 대기 중인 신청이 없어요' : tab === 'correction' ? '보완을 요청한 신청이 없어요' : '승인한 신청이 없어요'}/>}
      <div className="mt-8 rounded-[4px] bg-[var(--soft)] p-4 space-y-1">
        <p className="text-[13px] font-bold">첨부된 사업자등록증 PDF와 신청 정보를 검토합니다.</p>
        <p className="text-[12px] text-[#7B7B7B]">신청 상세에서 사업자등록증을 열람한 뒤<br/>승인하거나 반려해 주세요.</p>
      </div>
    </div>
  );
}
export function AdminDetailPage() {
  const { id } = useParams(); const s = useStore(), user = activeUser(s); const app = s.applications.find(a => a.id === id); const [pdfViewed, setPdfViewed] = useState(false), [urlViewed, setUrlViewed] = useState(false), [confirm, setConfirm] = useState(false), [rejecting, setRejecting] = useState(false), [correcting, setCorrecting] = useState(false), [rejectReason, setRejectReason] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false); const toast = useToast(), navigate = useNavigate();
  // 사업자등록증 미리보기(실제 모드). 서버가 열람 기록을 남기므로 미리보기가 뜨면 열람 완료로 본다
  const [preview, setPreview] = useState<{ url?: string; failed?: boolean }>({});
  useEffect(() => {
    if (USE_MOCK || !app?.id || !user.admin) return;
    let alive = true, url = '';
    reviewCertificate(app.id).then(pdf => { if (!alive) return; url = URL.createObjectURL(pdf.type === 'application/pdf' ? pdf : new Blob([pdf], { type: 'application/pdf' })); setPreview({ url }); setPdfViewed(true); }).catch(() => { if (alive) setPreview({ failed: true }); });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [app?.id, user.admin]);
  const live = useLive(sig => user.admin && id ? getAdminApplication(id, sig) : Promise.resolve(null), (st, a) => { if (a) mergeAdminApplications(st, [a]); }, [id, user.admin]);
  if (!user.admin) return <Unavailable message="운영자만 사용할 수 있습니다."/>;
  if (!app) return live.loading || live.error ? <LiveStatus state={live}/> : <Empty title="신청 정보를 찾을 수 없어요"/>;
  const reviewDeadline = app.submittedAt + 2 * 86_400_000;
  const days = ['일','월','화','수','목','금','토'];
  const dl = new Date(reviewDeadline);
  const dlLabel = `${dl.getMonth()+1}.${dl.getDate()} (${days[dl.getDay()]})`;
  const dDay = Math.ceil((reviewDeadline - Date.now()) / 86_400_000);
  const bothViewed = pdfViewed && (urlViewed || !app.salesUrl);
  // 입점 심사 목록·판매자 목록 어디서 열었든 온 곳으로 돌아간다
  const back = () => { if (window.history.state?.idx > 0) navigate(-1); else navigate('/admin/applications'); };
  return (
    <div className={`pb-32 border-l-4 ${REVIEW_KIND.store.bar} -ml-4 pl-3`}>
      <Header title="입점 심사 상세" back={true} action={<ReviewKindBadge kind="store"/>}/>
      {/* Meta: 심사 중일 때만 결과 안내 기한을 보여 준다 */}
      <div className="mb-4 flex items-center gap-2">
        <span className={`inline-flex h-[18px] items-center rounded-[4px] px-2 text-[11px] font-bold ${app.status === 'approved' ? 'bg-[#EEF8F3] text-[#3FB181]' : 'bg-[var(--soft)] text-[#7B7B7B]'}`}>{app.status === 'approved' ? '승인 완료' : app.apiStatus === 'CHANGES_REQUESTED' ? '보완 요청' : app.apiStatus === 'EXPIRED' ? '보완 기한 만료' : app.status === 'rejected' ? '반려' : '심사 대기'}</span>
        {app.status === 'pending' && <span className="text-[11px] font-bold text-[#E5484D]">결과 안내 기한 {dlLabel} · D-{Math.max(0, dDay)}</span>}
      </div>
      <h1 className="mb-1 text-[20px] font-bold">{app.displayName || `${app.name}의 스토어`}</h1>
      <p className="mb-6 text-[12px] text-[#7B7B7B]">{app.name} · {app.email} · {dateTime(app.submittedAt)} 신청</p>
      {/* PDF Section */}
      <div className="mb-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold">사업자등록증</h2>
          {pdfViewed && <span className="inline-flex h-[18px] items-center rounded-[4px] bg-[#EEF8F3] px-2 text-[11px] font-bold text-[#3FB181]">열람 완료</span>}
        </div>
        {/* 실제 모드: 제출된 PDF를 바로 보여 준다. 미리보기도 서버 열람 기록(certificate-review)을 남긴다. mock은 예시 카드 */}
        {USE_MOCK ? <>
        <div className="flex items-center justify-center rounded-[6px] bg-[var(--soft)] py-6">
          <div className="w-[150px] rounded-[2px] bg-white p-3 shadow-sm space-y-1.5">
            <p className="text-center text-[10px] font-bold">사업자등록증</p>
            <p className="text-center text-[6px] text-[#949494]">( 일반과세자 )</p>
            {([['등록번호', app.business?.registrationNumber], ['상호', app.business?.name], ['대표자', app.business?.representative], ['개업연월일', app.business?.openedAt], ['소재지', app.business?.address], ['업태 · 종목', app.business?.businessType]] as [string, string | undefined][]).filter(([, v]) => v).map(([k,v]) => (
              <div key={k} className="flex gap-2">
                <span className="w-[52px] shrink-0 text-[6px] text-[#949494]">{k}</span>
                <span className="text-[6px]">{v}</span>
              </div>
            ))}
            <p className="mt-2 text-center text-[7px] font-bold text-[#7B7B7B]">성동세무서장</p>
          </div>
        </div>
        </> : <div className="overflow-hidden rounded-[6px] border border-[var(--line)] bg-[var(--soft)]">
          {preview.url ? <iframe title="사업자등록증 미리보기" src={`${preview.url}#view=FitH`} className="block h-[440px] w-full bg-white"/>
            : <p className="py-10 text-center text-[12px] text-[#7B7B7B]">{preview.failed ? '미리보기를 불러오지 못했어요. 아래 ‘열람하기’로 열어 주세요.' : '사업자등록증을 불러오고 있어요.'}</p>}
        </div>}
        {/* File row */}
        <div className="flex items-center gap-3">
          <FileText size={14} className="shrink-0 text-[#7B7B7B]"/>
          <span className="flex-1 text-[12px] text-[#7B7B7B]">{USE_MOCK ? '사업자등록증.pdf · 1쪽 · 1.2MB' : '사업자등록증.pdf'}</span>
          <button className="text-[12px] font-bold text-[var(--ink)]" onClick={async () => { setError(''); const tab = USE_MOCK ? null : openPendingTab(); /* 클릭 직후 탭을 열어 모바일 사파리 팝업 차단을 피한다 */ try { if (USE_MOCK) { app.document && getPdf(app.document.id).catch(() => {}); } else { const pdf = await reviewCertificate(app.id); const url = URL.createObjectURL(pdf.type ? pdf : new Blob([pdf], { type: 'application/pdf' })); if (tab) tab.location.href = url; else window.open(url, '_blank'); } setPdfViewed(true); } catch (e) { const msg = `사업자등록증을 열지 못했어요. ${errorMessage(e)}`; failTab(tab, msg); setError(msg); } }}>열람하기</button>
        </div>
      </div>
      {/* URL Section: 신청서에 판매 URL이 있을 때만 */}
      {app.salesUrl && <div className="mb-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold">타 플랫폼 판매 URL</h2>
          {urlViewed && <span className="inline-flex h-[18px] items-center rounded-[4px] bg-[#EEF8F3] px-2 text-[11px] font-bold text-[#3FB181]">열람 완료</span>}
        </div>
        <UrlCard url={app.salesUrl} viewed={urlViewed} onView={() => setUrlViewed(true)}/>
      </div>}
      {/* 신청 정보 */}
      <h2 className="mb-3 text-[15px] font-bold">신청 정보</h2>
      <div className="mb-6 space-y-4 border-b border-[var(--line)] pb-4">
        {app.business && <div className="space-y-2">
          <p className="text-[11px] font-bold text-[#949494]">사업자</p>
          {app.business.name && <InfoRow label="상호" value={app.business.name}/>}
          {app.business.representative && <InfoRow label="대표자" value={app.business.representative}/>}
          {app.business.registrationNumber && <InfoRow label="등록번호" value={app.business.registrationNumber}/>}
          {app.business.businessType && <InfoRow label="업태 · 종목" value={app.business.businessType}/>}
        </div>}
        <div className="space-y-2">
          <p className="text-[11px] font-bold text-[#949494]">판매자</p>
          <InfoRow label="표시 이름" value={app.displayName || `${app.name}의 스토어`}/>
          <InfoRow label="담당자" value={`${app.name} · ${app.phone}`}/>
          <InfoRow label="이메일" value={app.email}/>
        </div>
        <div className="space-y-2">
          <p className="text-[11px] font-bold text-[#949494]">정산 · 배송</p>
          <InfoRow label="정산 계좌" value={app.bank ? `${app.bank} ${app.account.slice(0, 3)}-***-***${app.account.slice(-3)}` : '—'}/>
          <InfoRow label="출고지" value={app.shippingAddress || '—'}/>
          <InfoRow label="반품지" value={app.returnAddress || '출고지와 같음'}/>
        </div>
      </div>
      <ErrorBox message={error}/>
      {app.status === 'approved'
        ? <><div className="rounded-[4px] bg-[#EEF8F3] p-4"><p className="text-[13px] font-bold text-[#3FB181]">판매자 권한 추가 완료</p><p className="mt-1 text-[12px] text-[#7B7B7B]">승인 일시 {dateTime(app.approvedAt!)} · 처리자 운영자</p></div><Button className="mt-4 w-full" onClick={back}>목록으로</Button></>
        : !USE_MOCK && (app.apiStatus === 'CHANGES_REQUESTED' || app.apiStatus === 'EXPIRED')
        ? <><SentCorrection applicationId={app.id}/><Button outline className="mt-4 w-full" onClick={back}>목록으로</Button></>
        : app.status === 'rejected'
        ? <><Note title="반려 처리됨">{app.rejectionItems?.map(i => i.reason).join(' ') || '반려 사유가 판매자에게 전달됐어요.'}</Note><Button outline className="mt-4 w-full" onClick={back}>목록으로</Button></>
        : <div className="fixed bottom-0 left-1/2 w-full max-w-[390px] -translate-x-1/2 bg-white px-4 safe-bottom pt-3">
            <p className="mb-2 text-center text-[12px] text-[#949494]">{bothViewed ? (app.salesUrl ? '사업자등록증과 판매 URL을 모두 열람했어요' : '사업자등록증을 열람했어요') : (app.salesUrl ? '사업자등록증 PDF와 판매 URL을 먼저 열람해 주세요.' : '사업자등록증 PDF를 먼저 열람해 주세요.')}</p>
            <div className="flex gap-2">
              <Button outline className="w-[80px]" disabled={!bothViewed} onClick={() => setRejecting(true)}>반려</Button>
              {!USE_MOCK && <Button outline className="w-[92px]" disabled={!bothViewed} onClick={() => setCorrecting(true)}>보완 요청</Button>}
              <Button className="flex-1" disabled={!bothViewed} onClick={() => setConfirm(true)}>승인하기</Button>
            </div>
          </div>
      }
      {correcting && <CorrectionRequestSheet applicationId={app.id} onClose={() => setCorrecting(false)} onSent={() => { setCorrecting(false); mutate(state => { const a = state.applications.find(x => x.id === app.id); if (a) { a.status = 'rejected'; a.apiStatus = 'CHANGES_REQUESTED'; } }); toast('보완 요청을 보냈어요. 신청자에게 알림이 가요.'); live.reload(); }}/>}
      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60">
          <div className="mx-auto w-full max-w-[390px] rounded-t-[16px] bg-white px-4 pb-8 pt-2">
            <div className="mx-auto mb-4 h-1 w-8 rounded-full bg-[#DEDEDE]"/>
            <h2 className="mb-1 text-[18px] font-bold">입점 신청을 반려할까요?</h2>
            <p className="mb-4 text-[13px] text-[#7B7B7B]">반려 사유가 신청자에게 그대로 전달돼요.<br/>신청자는 내용을 보완해 다시 요청할 수 있어요.</p>
            <textarea aria-label="입점 반려 사유" className="field field-box mb-4 w-full" maxLength={200} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="반려 사유를 입력해 주세요."/>
            <ErrorBox message={error}/>
            <div className="flex gap-2">
              <Button outline className="w-[86px]" onClick={() => setRejecting(false)} disabled={busy}>취소</Button>
              <Button className="flex-1" disabled={busy || !rejectReason.trim()} onClick={async () => { setBusy(true); setError(''); try { if (!USE_MOCK) { await rejectSellerApplication(app.id, rejectReason); mutate(state => markApplication(state, app.id, 'rejected', Date.now(), rejectReason.trim())); } else await atomic(state => { if (!activeUser(state).admin) throw new Error('운영자만 반려할 수 있습니다.'); const item = state.applications.find(a => a.id === app.id); if (!item || item.status !== 'pending') throw new Error('이미 처리된 신청입니다.'); item.status = 'rejected'; item.rejectedAt = nowOf(state); item.reviewedAt = nowOf(state); item.rejectionItems = [{ field: '입점 심사', reason: rejectReason.trim() }]; }); toast('입점 신청을 반려했습니다.'); navigate('/admin/applications'); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }}>{busy ? '처리 중…' : '반려하기'}</Button>
            </div>
          </div>
        </div>
      )}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60">
          <div className="mx-auto w-full max-w-[390px] rounded-t-[16px] bg-white px-4 pb-8 pt-2">
            <div className="mx-auto mb-4 h-1 w-8 rounded-full bg-[#DEDEDE]"/>
            <h2 className="mb-1 text-[18px] font-bold">판매자로 승인할까요?</h2>
            <p className="mb-5 text-[13px] text-[#7B7B7B]">승인하면 판매자 권한이 추가되고<br/>판매자에게 승인 알림이 가요.</p>
            <div className="mb-5 rounded-[6px] bg-[var(--soft)] px-4 py-3 space-y-1.5">
              <InfoRow label="신청자" value={app.name}/>
              <InfoRow label="표시 이름" value={app.displayName || `${app.name}의 스토어`}/>
              <InfoRow label="제출 서류" value="사업자등록증 PDF 1개"/>
            </div>
            <ErrorBox message={error}/>
            <div className="flex gap-2">
              <Button outline className="w-[86px]" onClick={() => setConfirm(false)} disabled={busy}>취소</Button>
              <Button className="flex-1" disabled={busy} onClick={async () => { setBusy(true); try { if (!USE_MOCK) { await approveSellerApplication(app.id); mutate(state => markApplication(state, app.id, 'approved', Date.now())); } else await atomic(state => approveApplication(state, state.activeUserId, app.id, nowOf(state))); setConfirm(false); toast('판매자로 승인했습니다.'); navigate('/admin/applications'); } catch (e) { setError(errorMessage(e)); setConfirm(false); } finally { setBusy(false); } }}>{busy ? '승인 중…' : '승인하기'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
/** 상품의 판매자 이름: 승인된 입점 신청(계정 id = 상품 sellerId)의 표시 이름. 모르면 undefined(화면에서 숨긴다) */
function sellerOf(s: ReturnType<typeof useStore>, sellerId: string): { name: string } | undefined {
  const app = s.applications.find(a => a.userId === sellerId && a.status === 'approved');
  if (app) return { name: app.displayName || app.name };
  const u = s.users.find(x => x.id === sellerId); return u ? { name: u.name } : undefined;
}
export function AdminProductListPage() {
  const s = useStore(), user = activeUser(s);
  // 심사 대기/승인 완료 탭은 주소에 남겨 상세를 보고 돌아와도 유지한다
  const [params, setParams] = useSearchParams(); const tab: 'pending' | 'approved' = params.get('tab') === 'approved' ? 'approved' : 'pending';
  const setTab = (t: 'pending' | 'approved') => { const next = new URLSearchParams(params); if (t === 'approved') next.set('tab', t); else next.delete('tab'); setParams(next, { replace: true }); };
  const kind = params.get('kind') === 'revision' ? 'revision' : 'new'; // 신규 / 수정 심사 탭
  const revisions = useRevisionQueue(user.admin);
  useLive(sig => user.admin ? listAdminApplications({ status: 'APPROVED' }, sig) : Promise.resolve([]), mergeAdminApplications, [user.admin]); // 판매자 이름(승인된 입점 신청)
  const live = useLive(async sig => user.admin ? (await Promise.all((['IN_REVIEW', 'REJECTED', 'APPROVED'] as const).map(st => listAdminProductReviews(st, sig)))).flat() : [], mergeAdminProductList, [user.admin]);
  if (!user.admin) return <Unavailable message="운영자만 사용할 수 있습니다."/>;
  const products = s.products.filter(p => tab === 'pending' ? !p.published : p.published);
  const pendingCount = s.products.filter(p => !p.published).length;
  const approvedCount = s.products.filter(p => p.published).length;
  return (
    <div className={`border-l-4 ${REVIEW_KIND.sale.bar} -ml-4 pl-3`}>
      <Header title="판매 심사 목록" subtitle="상품 · 판매 정보와 물품 상태를 확인하고 승인해 주세요." back={true} action={<ReviewKindBadge kind="sale"/>}/>
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-[6px] bg-[var(--soft)] p-1 text-[13px]" role="tablist">
        {([['new', '신규', pendingCount], ['revision', '수정', revisions.data?.length ?? 0]] as [string, string, number][]).map(([k, label, cnt]) => (
          <button key={k} role="tab" aria-selected={kind === k} onClick={() => setParams(k === 'new' ? {} : { kind: k })} className={`rounded-[4px] py-2 ${kind === k ? 'bg-[var(--surface)] font-bold' : 'text-[#7B7B7B]'}`}>{label} 대기 {cnt}건</button>
        ))}
      </div>
      {kind === 'revision' ? <><RevisionList items={revisions.data ?? []}/><LiveStatus state={{ loading: revisions.loading, error: revisions.error, reload: revisions.reload }}/></> : <>
      <div className="mb-4 flex gap-5 border-b border-[var(--line)]">
        {([['pending', '심사 대기', pendingCount], ['approved', '승인 완료', approvedCount]] as [string, string, number][]).map(([t, label, cnt]) => (
          <button key={t} onClick={() => setTab(t as 'pending' | 'approved')} className={`border-b-2 py-3 text-[14px] ${tab === t ? 'border-[var(--ink)] font-bold text-[var(--ink)]' : 'border-transparent text-[#949494]'}`}>
            {label} {cnt}건
          </button>
        ))}
      </div>
      {products.map(p => {
        const seller = sellerOf(s, p.sellerId);
        const openLabel = `오픈 ${kstShort(p.startsAt)}`;
        const dDay = Math.ceil((p.startsAt - Date.now()) / 86_400_000);
        return (
          <Link key={p.id} to={`/admin/products/${p.id}`} className="flex gap-3 border-b border-[var(--line)] py-4">
            <ProductImage src={p.images[0]} alt={p.name} className="h-[64px] w-[64px] shrink-0 rounded-[4px]"/>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-[18px] items-center rounded-[4px] bg-[var(--soft)] px-2 text-[11px] font-bold text-[#7B7B7B]">
                  {p.published ? '승인 완료' : p.rejectionReason ? '반려' : '심사 대기'}
                </span>
                {!p.published && !p.rejectionReason && dDay <= 1 && dDay >= 0 && (
                  <span className="text-[11px] font-bold text-[#E5484D]">{openLabel} · D-{dDay}</span>
                )}
                {p.published && <span className="text-[11px] text-[#949494]">{openLabel}</span>}
              </div>
              <p className="text-[13px] font-bold">{p.name}</p>
              <p className="text-[11px] text-[#7B7B7B]">{p.category} · {money(p.price)}</p>
              {seller?.name && <p className="text-[11px] text-[#949494]">{seller.name}</p>}
            </div>
          </Link>
        );
      })}
      <LiveStatus state={live}/>
      {!live.loading && !live.error && !products.length && <Empty title={tab === 'pending' ? '심사 대기 중인 상품이 없어요' : '승인한 상품이 없어요'}/>}
      </>}
    </div>
  );
}
// Rejection reasons matching Figma "상품 반려" screen
// 물품 검수는 판매 심사에 포함: 검수 미통과 항목도 같은 반려 사유로 보낸다(판매자 화면이 '물품 확인'으로 묶어 보여 준다)
/** 운영자가 사진으로 확인하는 검수 항목 — 미통과면 반려 사유의 '물품 확인' 항목으로 보낸다 */
const INSPECTION_ITEMS: [string, string][] = [['정품 여부', '라벨·택·바코드'], ['상품 상태', '정면·하자 부위'], ['구성품', '구성품 전체 사진'], ['수량', '옵션별 수량']];
const REJECT_REASONS = ['한정 판매가', '판매 일정', '타 플랫폼 상품과 다름', '상품 사진 · 정보', ...['정품 여부', '상품 상태', '구성품', '수량'].map(i => INSPECTION_PREFIX + i), '기타'];
export function AdminProductDetailPage() {
  const { id } = useParams(); const s = useStore(), user = activeUser(s), toast = useToast(), navigate = useNavigate();
  const p = s.products.find(p => p.id === id);
  const [reject, setReject] = useState(false);
  const [checkedReasons, setCheckedReasons] = useState<Record<string, boolean>>({});
  const [reasonTexts, setReasonTexts] = useState<Record<string, string>>({});
  const [approveConfirm, setApproveConfirm] = useState(false);
  const [urlViewed, setUrlViewed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [viewer, setViewer] = useState<number | null>(null), [inspected, setInspected] = useState<string[]>([]); // 전체 화면 사진 + 검수 확인 표시
  const seller = p ? sellerOf(s, p.sellerId) : undefined;
  useLive(sig => user.admin ? listAdminApplications({ status: 'APPROVED' }, sig) : Promise.resolve([]), mergeAdminApplications, [user.admin]); // 판매자 이름(승인된 입점 신청)
  const live = useLive(sig => user.admin && id ? getAdminProductReviewWithImages(id, sig) : Promise.resolve(null), (st, x) => { if (x) mergeProducts(st, [x]); }, [id, user.admin]);
  if (!user.admin) return <Unavailable message="운영자만 사용할 수 있습니다."/>;
  if (!p) return live.loading || live.error ? <LiveStatus state={live}/> : <Empty title="상품을 찾을 수 없어요"><Link to="/admin/products" className="btn">심사 목록으로</Link></Empty>;
  const openLabel = `오픈 ${kstShort(p.startsAt)}`;
  const dDay = Math.ceil((p.startsAt - Date.now()) / 86_400_000);
  const totalStock = p.options.reduce((s, o) => s + o.stock, 0);
  const selectedCount = Object.values(checkedReasons).filter(Boolean).length;
  const canSubmitReject = selectedCount > 0 && Object.entries(checkedReasons).filter(([,v]) => v).every(([k]) => reasonTexts[k]?.trim());
  // 상품 반려 화면
  if (reject) {
    const handleReject = async () => {
      setBusy(true); setError('');
      const reasons = REJECT_REASONS.filter(r => checkedReasons[r]).map(r => `[${r}] ${reasonTexts[r]?.trim()}`).join('\n');
      try {
        if (!USE_MOCK) { const r = await decideProductReview(p.id, p.version ?? 0, false, reasons); mutate(state => mergeProducts(state, [r])); }
        else mutate(state => { const item = state.products.find(x => x.id === p.id); if (item) item.rejectionReason = reasons; });
        setReject(false); toast('반려 처리했습니다.'); navigate('/admin/products');
      } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
    };
    return (
      <div className="pb-8">
        <div className="mb-4 flex items-center gap-3">
          <button aria-label="이전 화면" onClick={() => setReject(false)} className="-ml-1 flex h-8 w-8 items-center justify-center"><ArrowLeft size={22}/></button>
          <h1 className="flex-1 text-[18px] font-bold">판매 심사 반려</h1><ReviewKindBadge kind="sale"/>
        </div>
        {/* Product card */}
        <div className="mb-6 flex items-center gap-3 rounded-[6px] bg-[var(--soft)] px-4 py-3">
          <ProductImage src={p.images[0]} alt={p.name} className="h-12 w-12 shrink-0 rounded-[4px]"/>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold">{p.name}</p>
            <p className="text-[12px] text-[#7B7B7B]">{[seller?.name, openLabel].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        {/* Reasons */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-bold">반려 항목</h2>
          {selectedCount > 0 && <span className="text-[12px] text-[#949494]">{selectedCount}개 선택</span>}
        </div>
        <p className="mb-4 text-[12px] text-[#7B7B7B]">선택한 항목과 사유가 판매자에게 그대로 전달돼요.</p>
        {REJECT_REASONS.map(reason => (
          <div key={reason} className="border-b border-[#F2F2F2] pb-4 mb-0">
            <button type="button" role="checkbox" aria-checked={!!checkedReasons[reason]} onClick={() => setCheckedReasons(r => ({ ...r, [reason]: !r[reason] }))} className="flex w-full items-center gap-3 py-3 text-left">
              <span className={`flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[4px] border ${checkedReasons[reason] ? 'border-[var(--ink)] bg-[var(--ink)]' : 'border-[#DEDEDE]'}`}>
                {checkedReasons[reason] && <svg width="12" height="10" viewBox="0 0 10 8" fill="none"><path d="M9 1L3.5 7L1 4.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </span>
              <span className={`text-[14px] ${checkedReasons[reason] ? 'font-bold text-[var(--ink)]' : 'text-[#7B7B7B]'}`}>{reason}</span>
            </button>
            {checkedReasons[reason] && (
              <div className="relative rounded-[6px] border border-[#DEDEDE] p-3">
                <textarea
                  aria-label={`${reason} 반려 사유`}
                  className="w-full resize-none bg-transparent text-[13px] outline-none"
                  rows={3}
                  maxLength={200}
                  value={reasonTexts[reason] ?? ''}
                  onChange={e => setReasonTexts(t => ({ ...t, [reason]: e.target.value }))}
                  placeholder="반려 사유를 입력해 주세요."
                />
                <span className="absolute bottom-2 right-3 text-[11px] text-[#949494]">{(reasonTexts[reason] ?? '').length} / 200</span>
              </div>
            )}
          </div>
        ))}
        {/* Notice */}
        <div className="mt-4 flex gap-2 text-[12px] text-[#949494]">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="mt-0.5 shrink-0"><circle cx="6" cy="6" r="5" stroke="#949494"/><path d="M6 8V6" stroke="#949494" strokeLinecap="round"/><circle cx="6" cy="4" r="0.5" fill="#949494"/></svg>
          <span>판매자가 입력한 내용은 그대로 저장돼요.<br/>선택한 항목만 고치면 바로 다시 요청할 수 있어요.</span>
        </div>
        <ErrorBox message={error}/>
        <Button className="mt-6 w-full" disabled={busy || !canSubmitReject} onClick={handleReject}>
          {busy ? '처리 중…' : `${selectedCount}개 항목으로 제출하기`}
        </Button>
      </div>
    );
  }
  // 상품 승인 화면
  return (
    <div className={`pb-32 border-l-4 ${REVIEW_KIND.sale.bar} -ml-4 pl-3`}>
      <Header title="판매 심사 상세" back={true} action={<ReviewKindBadge kind="sale"/>}/>
      {/* Meta */}
      {p.published
        ? <div className="mb-4 inline-flex h-[18px] items-center rounded-[4px] bg-[#EEF8F3] px-2 text-[11px] font-bold text-[#3FB181]">승인 완료</div>
        : p.rejectionReason
          ? <div className="mb-4 inline-flex h-[18px] items-center rounded-[4px] bg-[var(--soft)] px-2 text-[11px] font-bold text-[#949494]">반려 처리됨</div>
          : <div className="mb-4 flex items-center gap-2">
              <span className="inline-flex h-[18px] items-center rounded-[4px] bg-[var(--soft)] px-2 text-[11px] font-bold text-[#7B7B7B]">심사 대기</span>
              <span className="text-[11px] font-bold text-[#E5484D]">{openLabel} · D-{Math.max(0, dDay)}</span>
            </div>
      }
      <h1 className="mb-1 text-[20px] font-bold">{p.name}</h1>
      <p className="mb-6 text-[12px] text-[#7B7B7B]">{[seller?.name, money(p.price), `${totalStock}개 한정`, `${kstSlot(p.startsAt)} 판매 시작`].filter(Boolean).join(' · ')}</p>
      {/* URL Section */}
      {p.originalUrl && (
        <div className="mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-bold">타 플랫폼 판매 URL</h2>
            {urlViewed && <span className="inline-flex h-[18px] items-center rounded-[4px] bg-[#EEF8F3] px-2 text-[11px] font-bold text-[#3FB181]">열람 완료</span>}
          </div>
          <UrlCard url={p.originalUrl} viewed={urlViewed} onView={() => setUrlViewed(true)}/>
        </div>
      )}
      {/* Photos */}
      <div className="mb-6 space-y-3">
        <h2 className="text-[15px] font-bold">판매 정보</h2>
        <div className="flex gap-2">
          {p.images.slice(0, 4).map((img, i) => (
            <button key={i} type="button" aria-label={`사진 ${i + 1} 크게 보기`} onClick={() => setViewer(i)}><ProductImage src={img} alt={p.name} className="h-[72px] w-[72px] rounded-[4px]"/></button>
          ))}
          {p.images.length > 4 && <button type="button" onClick={() => setViewer(4)} className="muted grid h-[72px] w-[72px] place-items-center rounded-[4px] bg-[var(--soft)] text-[12px]">+{p.images.length - 4}</button>}
        </div>
        <p className="muted text-[11px]">사진을 누르면 크게 보고 검수 항목을 확인할 수 있어요.</p>
      </div>
      {/* FAQ: AI 질문에서 온 항목(suggestionId)은 배지로 구분한다 */}
      {p.faqs.length > 0 && <div className="mb-6 space-y-3" data-testid="admin-faqs">
        <h2 className="text-[15px] font-bold">상품 FAQ <span className="muted text-[12px] font-normal">{p.faqs.length}개</span></h2>
        {p.faqs.map(f => <div key={f.id} className="space-y-1 rounded-[6px] bg-[var(--soft)] p-3">
          {f.suggestionId && <span className="inline-flex h-[18px] items-center rounded-[4px] bg-[var(--ink)] px-2 text-[10px] font-bold text-[var(--surface)]">AI 질문</span>}
          <p className="text-[13px] font-bold">Q. {f.question}</p>
          <p className="whitespace-pre-wrap break-words text-[12px] text-[var(--aux)]">A. {f.answer}</p>
        </div>)}
      </div>}
      {/* Product info */}
      <div className="mb-4 space-y-2 border-b border-[#F2F2F2] pb-4">
        <p className="text-[11px] font-bold text-[#949494]">상품</p>
        <InfoRow label="카테고리" value={p.category}/>
        <InfoRow label="한정 판매가" value={money(p.price)}/>
        <InfoRow label="배송비" value={money(p.shipping)}/>
        <InfoRow label="옵션별 수량" value={p.options.map(o => `${o.name} ${o.stock}`).join(' · ') + ` · 총 ${totalStock}개`}/>
      </div>
      <div className="mb-6 space-y-2 border-b border-[#F2F2F2] pb-4">
        <p className="text-[11px] font-bold text-[#949494]">판매 · 출고</p>
        <InfoRow label="판매 일정" value={`${kstShort(p.startsAt)} – ${kstShort(p.endsAt)}`}/>
        {p.dispatchDays > 0 && <InfoRow label="출고 기한" value={`결제 후 ${p.dispatchDays}영업일 이내`}/>}
        {seller?.name && <InfoRow label="판매자" value={seller.name}/>}
      </div>
      {/* 판매자가 입력한 상품 설명·카테고리별 정보·처분 사유: 심사 때 사진과 함께 확인한다 */}
      <div className="mb-6 space-y-2 border-b border-[#F2F2F2] pb-4">
        <p className="text-[11px] font-bold text-[#949494]">상품 설명</p>
        {p.description && <p className="whitespace-pre-line text-[12px] leading-[1.7]">{p.description}</p>}
        {p.extras.filter(e => e.key && e.value).map((e, i) => <InfoRow key={i} label={e.key} value={e.value}/>)}
        {p.reason && <InfoRow label="재고 처분 사유" value={p.reason}/>}
      </div>
      {p.rejectionReason && <Note title="반려 사유">반려 사유 · {p.rejectionReason}</Note>}
      <ErrorBox message={error}/>
      {viewer !== null && p.images.some(Boolean) && <PhotoViewer images={p.images.filter(Boolean)} start={viewer} onClose={() => setViewer(null)} panel={<div className="space-y-2">
        <p className="text-[13px] font-bold">물품 검수 확인</p>
        {INSPECTION_ITEMS.map(([k, hint]) => <label key={k} className="flex items-start gap-2 text-[12px]"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={inspected.includes(k)} onChange={() => setInspected(v => (v.includes(k) ? v.filter(x => x !== k) : [...v, k]))}/><span><b>{k}</b> <span className="muted">{hint}</span></span></label>)}
        {!p.published && !p.rejectionReason && <div className="flex gap-2 pt-1"><Button outline className="w-[96px]" onClick={() => { setViewer(null); setReject(true); }}>반려</Button><Button className="flex-1" onClick={() => { setViewer(null); setApproveConfirm(true); }}>승인하기</Button></div>}
      </div>}/>}
      {/* CTA */}
      {p.published
        ? <Link className="btn btn-outline w-full" to="/admin/products">심사 목록으로</Link>
        : !p.rejectionReason
          ? <div className="fixed bottom-0 left-1/2 w-full max-w-[390px] -translate-x-1/2 border-t border-[var(--line)] bg-white px-4 safe-bottom pt-3">
              <p className="mb-2 text-center text-[12px] text-[#949494]">승인하면 판매 일정에 맞춰 자동으로 오픈돼요</p>
              <div className="flex gap-2">
                <Button outline className="w-[96px]" onClick={() => setReject(true)}>반려</Button>
                <Button className="flex-1" disabled={busy} onClick={() => setApproveConfirm(true)}>승인하기</Button>
              </div>
            </div>
          : <Link className="btn btn-outline w-full" to="/admin/products">심사 목록으로</Link>
      }
      {/* Approve bottom sheet */}
      {approveConfirm && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60">
          <div className="mx-auto w-full max-w-[390px] rounded-t-[16px] bg-white px-4 pb-8 pt-2">
            <div className="mx-auto mb-4 h-1 w-8 rounded-full bg-[#DEDEDE]"/>
            <h2 className="mb-1 text-[18px] font-bold">판매를 승인할까요?</h2>
            <p className="mb-5 text-[13px] text-[#7B7B7B]">승인하면 판매 일정에 맞춰 자동으로 오픈되고<br/>판매자에게 승인 알림이 가요.</p>
            <div className="mb-4 flex items-center gap-3 rounded-[6px] bg-[var(--soft)] px-4 py-3">
              <div className="flex items-center justify-center rounded-[4px] bg-white p-1.5">
                <CalendarCheck size={16} className="text-[#7B7B7B]"/>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold">{p.name}</p>
                <p className="text-[12px] text-[#7B7B7B]">{openLabel} · {money(p.price)} · {totalStock}개</p>
              </div>
            </div>
            <div className="mb-4 flex items-center gap-2 text-[12px] text-[#949494]">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0"><circle cx="6" cy="6" r="5" stroke="#949494"/><path d="M6 8V6" stroke="#949494" strokeLinecap="round"/><circle cx="6" cy="4" r="0.5" fill="#949494"/></svg>
              <span>승인 후 판매 정보를 바꾸려면 판매자가 다시 심사를 요청해야 해요.</span>
            </div>
            <ErrorBox message={error}/>
            <div className="flex gap-2">
              <Button outline className="flex-1" onClick={() => setApproveConfirm(false)} disabled={busy}>취소</Button>
              <Button className="flex-1" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { if (!USE_MOCK) { const r = await decideProductReview(p.id, p.version ?? 0, true); mutate(state => mergeProducts(state, [r])); } else mutate(state => { const item = state.products.find(x => x.id === p.id); if (item) { item.published = true; delete item.rejectionReason; } }); setApproveConfirm(false); toast('상품을 승인했습니다.'); navigate('/admin/products'); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }}>{busy ? '처리 중…' : <>승인하기 <Check size={16}/></>}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export function SupportPage() {
  const s = useStore(); const [tab, setTab] = useState('전체'); const faqTabs = ['전체', '구매·선착순', '배송·반품', '결제', '판매자'];
  const recentOrder = s.orders.filter(o => o.userId === s.activeUserId).sort((a, b) => b.createdAt - a.createdAt)[0];
  const filtered = FAQ_ITEMS.filter(f => tab === '전체' || f.category === tab);
  const newAnswerCount = s.inquiries.filter(q => q.userId === s.activeUserId && q.sellerId === 'stockdrop' && q.answer).length;
  return (
    <div className="space-y-0">
      <Header title="고객 지원"/>
      {/* 검색 — Figma: F5F5F5 filled, placeholder 15px */}
      <label className="mb-5 flex h-10 items-center gap-2.5 rounded-[6px] bg-[var(--soft)] px-3.5">
        <Search size={18} className="muted shrink-0"/>
        <input aria-label="고객 지원 검색" placeholder="궁금한 내용을 검색해 보세요" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--placeholder)]" readOnly/>
      </label>
      {/* 주문 관련 문의 */}
      {recentOrder && (
        <section className="mb-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-bold">주문 관련 문의</h2>
            <Link to="/orders" className="flex items-center gap-1 text-[12px] text-[var(--muted)]">전체 주문 <span className="text-[10px]">›</span></Link>
          </div>
          <div className="rounded-[6px] border border-[var(--line)] p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-14 w-14 shrink-0 rounded-[4px] bg-[var(--soft)]"/>
              <div className="min-w-0 flex-1 space-y-0.5">
                {USE_MOCK && <p className="text-[11px] font-bold text-[var(--muted)]">배송 중 · 10.25 도착 예정</p>}
                <p className="text-[14px]">{USE_MOCK ? 'LOWFIELD' : recentOrder.product.brand}{(USE_MOCK || recentOrder.product.brand) ? ' · ' : ''}{recentOrder.product.name}</p>
                <p className="text-[12px] text-[#949494]">{USE_MOCK ? '10.24' : kstShort(recentOrder.createdAt).split(' ')[0]} 결제 · {money(recentOrder.total)}</p>
              </div>
            </div>
            <Link to={`/orders/${recentOrder.id}/inquiry`} className="flex w-full items-center justify-center gap-2 rounded-[6px] bg-[var(--soft)] py-2.5 text-[13px] font-bold">
              이 주문 판매자에게 문의
            </Link>
          </div>
          <p className="text-[12px] text-[#949494]">취소·반품·하자·오배송은 해당 주문의 판매자에게 전달돼요.</p>
        </section>
      )}
      {/* 구분선 */}
      <div className="mb-5 h-px bg-[#F2F2F2]"/>
      {/* 자주 묻는 질문 */}
      <section className="mb-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-bold">자주 묻는 질문</h2>
          <Link to="/faq" className="flex items-center gap-1 text-[12px] text-[var(--muted)]">전체 보기 <span className="text-[10px]">›</span></Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {faqTabs.map(t => (
            <button key={t} onClick={() => setTab(t)} className={`inline-flex h-8 items-center rounded-full px-3.5 text-[13px] transition-colors ${tab === t ? 'bg-[var(--ink)] font-bold text-[var(--surface)]' : 'border border-[#DEDEDE] text-[var(--muted)]'}`}>{t}</button>
          ))}
        </div>
        <FaqList items={filtered.slice(0, 3)}/>
      </section>
      {/* 1:1 문의 + 내 문의 내역 */}
      <div className="flex gap-3">
        <Link to="/inquiries/compose" className="flex flex-1 flex-col items-start gap-2 rounded-[6px] bg-[var(--soft)] p-4 space-y-1">
          <span className="text-[14px] font-bold">1:1 문의하기</span>
          <span className="text-[12px] text-[#949494]">계정·결제·앱 오류</span>
        </Link>
        <Link to="/inquiries" className="flex flex-1 flex-col items-start gap-2 rounded-[6px] bg-[var(--soft)] p-4 space-y-1">
          <span className="text-[14px] font-bold">내 문의 내역</span>
          {newAnswerCount > 0
            ? <span className="text-[12px] font-bold text-[#3FB181]">새 답변 {newAnswerCount}건</span>
            : <span className="text-[12px] text-[#949494]">내역 보기</span>}
        </Link>
      </div>
      <p className="mt-4 text-[11px] text-[#949494]">1:1 문의 운영시간 평일 10:00–18:00 · 주말·공휴일 휴무</p>
    </div>
  );
}

export function AddressManagePage() {
  const s = useStore(); const user = activeUser(s); const toast = useToast(); const navigate = useNavigate();
  const [addrs, setAddrs] = useState<ApiAddr[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<ApiAddr | null>(null);

  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const reload = async () => {
    setLoading(true); setError('');
    try {
      const data = await listAddresses();
      setAddrs(data); const def = data.find(a => a.defaultAddress); if (def) mutate(state => { state.addresses[user.id] = toAddress(def); });
    } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const handleSetDefault = async (addr: ApiAddr) => {
    try { await setDefaultAddress(addr.addressId); } catch (e) { toast(errorMessage(e)); return; }
    setAddrs(addrs.map(a => ({ ...a, defaultAddress: a.addressId === addr.addressId })));
    mutate(state => { state.addresses[user.id] = toAddress(addr); });
    toast('기본 배송지로 설정했습니다.');
  };

  const handleDelete = async (addr: ApiAddr) => {
    // 기본 배송지는 다른 배송지가 남아 있으면 서버가 409(ADDRESS_DEFAULT_CHANGE_REQUIRED)로 거절 → 안내 후 닫기
    try { await deleteAddress(addr.addressId); } catch (e) { setConfirmDelete(null); toast(errorMessage(e)); return; }
    setAddrs(addrs.filter(a => a.addressId !== addr.addressId));
    if (addr.defaultAddress) mutate(state => { delete (state.addresses as any)[user.id]; });
    setConfirmDelete(null); toast('배송지를 삭제했습니다.');
  };

  const defaultAddr = addrs.find(a => a.defaultAddress);
  const others = addrs.filter(a => !a.defaultAddress);

  function AddrCard({ addr, isDefault }: { addr: ApiAddr; isDefault: boolean }) {
    return (
      <div className={`rounded-[6px] p-4 space-y-3 border-[1.5px] ${isDefault ? 'border-[var(--ink)]' : 'border-transparent'}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            {/* radio indicator */}
            <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${isDefault ? 'border-[var(--ink)]' : 'border-[#DEDEDE]'}`}>
              {isDefault && <div className="h-2.5 w-2.5 rounded-full bg-[var(--ink)]"/>}
            </div>
            <span className="text-[15px] font-bold">{addr.label || (isDefault ? '집' : '배송지')}</span>
          </div>
          <div className="flex items-center gap-2 text-[12px]">
            {!isDefault && <button onClick={() => handleSetDefault(addr)} className="font-bold text-[var(--ink)]">기본 설정</button>}
            {!isDefault && <div className="h-[10px] w-px bg-[#DEDEDE]"/>}
            <button onClick={() => navigate(`/addresses/${addr.addressId}/edit`)} className="text-[#7B7B7B]">수정</button>
            <div className="h-[10px] w-px bg-[#DEDEDE]"/>
            <button onClick={() => setConfirmDelete(addr)} className="text-[#7B7B7B]">삭제</button>
          </div>
        </div>
        <div className="ml-8 space-y-1">
          <p className="text-[13px] font-bold">{addr.recipientName} · {addr.recipientPhone}</p>
          <p className="text-[13px] text-[#7B7B7B]">{addr.postalCode ? `[${addr.postalCode}] ` : ''}{addr.roadAddress}{addr.detailAddress ? `, ${addr.detailAddress}` : ''}</p>
          {addr.deliveryMemo && (
            <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[var(--soft)] px-3 py-1">
              <span className="text-[12px] text-[#7B7B7B]">{addr.deliveryMemo}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0 pb-24">
      <Header title="배송지 관리" back={true}/>
      {/* InfoBar — Figma: #FBFBFB bg, info icon, 12px text */}
      <div className="-mx-4 mb-4 flex items-center gap-2 bg-[#FBFBFB] px-4 py-3">
        <span className="text-[11px] text-[#949494]">ℹ</span>
        <p className="text-[12px] text-[#7B7B7B]">주문 시 기본 배송지가 자동으로 선택돼요</p>
      </div>
      <LiveStatus state={{ loading, error, reload }}/>
      {!loading && !error && addrs.length === 0 && <Empty title="등록된 배송지가 없어요" message="새 배송지를 추가해 주세요."/>}
      {defaultAddr && (
        <section className="mb-4 space-y-2">
          <p className="text-[12px] font-bold text-[#949494]">기본 배송지</p>
          <AddrCard addr={defaultAddr} isDefault={true}/>
        </section>
      )}
      {others.length > 0 && (
        <section className="space-y-0">
          <div className="flex items-center gap-1 mb-2">
            <p className="text-[12px] font-bold text-[#949494]">다른 배송지</p>
            <span className="text-[12px] font-bold text-[var(--ink)]">{others.length}</span>
          </div>
          {others.map(addr => (
            <div key={addr.addressId} className="border-b border-[#F2F2F2] py-2">
              <AddrCard addr={addr} isDefault={false}/>
            </div>
          ))}
        </section>
      )}
      {/* CTA Bar — Figma: fixed bottom black button */}
      <div className="fixed bottom-0 left-1/2 w-full max-w-[390px] -translate-x-1/2 border-t border-[var(--line)] bg-[var(--surface)] px-4 pt-3 safe-bottom">
        <button onClick={() => navigate('/addresses/new')} className="flex w-full items-center justify-center gap-2 rounded-[6px] bg-[var(--ink)] py-3 text-[15px] font-bold text-[var(--surface)]">
          + 새 배송지 추가
        </button>
      </div>
      {confirmDelete && (
        <Modal title="배송지를 삭제할까요?" onClose={() => setConfirmDelete(null)}>
          <div className="space-y-4">
            <div className="rounded-[6px] bg-[var(--soft)] p-3 space-y-1">
              <p className="text-[13px] font-semibold">{confirmDelete.recipientName} · {confirmDelete.recipientPhone}</p>
              <p className="text-[12px] text-[#7B7B7B]">{confirmDelete.postalCode ? `[${confirmDelete.postalCode}] ` : ''}{confirmDelete.roadAddress}{confirmDelete.detailAddress ? `, ${confirmDelete.detailAddress}` : ''}</p>
              {confirmDelete.deliveryMemo && <p className="text-[12px] text-[#7B7B7B]">{confirmDelete.deliveryMemo}</p>}
            </div>
            <p className="text-[12px] text-[#7B7B7B]">삭제한 배송지는 복구할 수 없어요</p>
            <div className="flex gap-2">
              <Button outline className="flex-1" onClick={() => setConfirmDelete(null)}>취소</Button>
              <Button className="flex-1" onClick={() => handleDelete(confirmDelete)}>삭제</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

type FaqItem = { category?: string; question: string; answer: string };
const FAQ_ITEMS: FaqItem[] = [
  { category: '구매·선착순', question: '선착순 재고는 어떻게 확보하나요?', answer: '판매가 열리는 순간 결제를 먼저 완료한 순서대로 재고가 확보돼요. 장바구니에 담거나 결제 화면에 들어간 것만으로는 재고가 잡히지 않아요. 판매 30분 전 알림을 켜두고 배송지와 결제 수단을 미리 등록해 두면 더 빠르게 결제할 수 있어요.' },
  { category: '구매·선착순', question: '결제 중에 품절되면 어떻게 되나요?', answer: '재고 확보에 실패하면 결제가 진행되지 않으며 금액이 청구되지 않아요. 다음 판매 일정을 확인해 주세요.' },
  { category: '구매·선착순', question: '1인당 몇 개까지 살 수 있나요?', answer: '상품마다 계정당 구매 상한이 설정되어 있어요. 상품 상세에서 확인할 수 있습니다.' },
  { category: '구매·선착순', question: '다른 쇼핑몰보다 정말 저렴한가요?', answer: '미판매 새 상품을 정리하는 판매자가 직접 가격을 설정해요. 기존 판매처보다 저렴한 경우가 많지만, 상품마다 다를 수 있어요.' },
  { category: '배송·반품', question: '판매 알림은 언제 오나요?', answer: '판매 시작 30분 전과 시작 직후에 알림이 발송돼요. 알림 설정에서 원하는 알림을 켜거나 끌 수 있어요.' },
  { category: '결제', question: '어떤 결제 수단을 사용할 수 있나요?', answer: '신용카드·체크카드 결제를 지원합니다. 결제 수단은 마이페이지에서 미리 등록할 수 있어요.' },
  { category: '판매자', question: '판매자가 되려면 어떻게 하나요?', answer: '사업자등록증 PDF와 담당자 정보를 제출하고 운영자 승인을 받으면 판매자가 될 수 있어요.' },
];
/** 판매자 이용안내 FAQ (목업) */
export const SELLER_FAQ_ITEMS: FaqItem[] = [
  { question: '정산은 언제 입금되나요?', answer: '구매 확정된 주문은 정산 주기에 맞춰 등록한 정산 계좌로 입금돼요. 정산 계좌는 마이페이지 › 정산 계좌 관리에서 확인할 수 있어요.' },
  { question: '출고 마감 시간을 넘기면 어떻게 되나요?', answer: '상품에 설정한 출고 기한 안에 송장을 등록해 주세요. 기한을 넘기면 구매자에게 지연 안내가 가고, 반복되면 운영 정책에 따라 판매가 제한될 수 있어요.' },
  { question: '판매 심사에서 반려되면 다시 요청할 수 있나요?', answer: '네. 반려 사유를 확인하고 내용을 고친 뒤 판매 상품 관리에서 다시 심사를 요청할 수 있어요.' },
  { question: '구매자가 반품을 요청하면?', answer: '반품·환불은 STOCKDROP이 처리하지 않아요. 주문 문의로 들어온 요청을 확인하고 구매자와 직접 협의해 반품지 안내와 환불을 진행해 주세요.' },
];

/** FAQ 펼침 목록 — 질문을 누르면 답이 펼쳐진다. FAQ API가 없어 내용은 목업(TODO(api-gap)) */
export function FaqList({ items, accent }: { items: FaqItem[]; accent?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!items.length) return <p className="muted py-4 text-[12px]">해당하는 질문이 없어요.</p>;
  return <div>{items.map((f, i) => <div key={f.question} className="border-b border-[var(--line)]">
    <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-3 py-4 text-left">
      <span className="flex items-start gap-3"><span className={`text-[14px] font-bold ${accent ? 'text-[var(--green)]' : 'text-[var(--muted)]'}`}>Q</span><span className="text-[14px]">{f.question}</span></span>
      <ChevronDown size={16} className={`muted shrink-0 transition-transform ${open === i ? 'rotate-180' : ''}`}/>
    </button>
    {open === i && <p className="muted whitespace-pre-line pb-4 pl-[26px] text-[13px] leading-[1.7]">{f.answer}</p>}
  </div>)}</div>;
}
/** 자주 묻는 질문 전체 — Figma "faq". ?for=seller면 판매자 FAQ */
export function FaqPage() {
  const [params] = useSearchParams(); const seller = params.get('for') === 'seller';
  const [category, setCategory] = useState('전체');
  const categories = ['전체', '구매·선착순', '배송·반품', '결제', '판매자'];
  const items = seller ? SELLER_FAQ_ITEMS : category === '전체' ? FAQ_ITEMS : FAQ_ITEMS.filter(f => f.category === category);
  return (
    <div className="space-y-4">
      <Header title={seller ? '판매자 자주 묻는 질문' : '자주 묻는 질문'} bare/>
      {!seller && <div className="flex flex-wrap gap-2">
        {categories.map(c => <button key={c} onClick={() => setCategory(c)} className={`inline-flex h-8 items-center rounded-full px-3.5 text-[13px] ${category === c ? 'bg-[var(--ink)] font-bold text-[var(--surface)]' : 'border border-[#DEDEDE] text-[var(--muted)]'}`}>{c}</button>)}
      </div>}
      <FaqList items={items} accent={seller}/>
      <div className="rounded-[6px] bg-[var(--soft)] p-4 space-y-2">
        <p className="text-[13px] font-bold">원하는 답을 찾지 못했나요?</p>
        <div className="flex gap-2">
          <Link to="/inquiries/compose" className="btn btn-outline flex-1 text-[12px]">1:1 문의하기</Link>
          <Link to="/inquiries" className="btn btn-outline flex-1 text-[12px]">내 문의 내역</Link>
        </div>
      </div>
    </div>
  );
}

export function InquiryListPage() {
  const s = useStore(); const navigate = useNavigate(); const [tab, setTab] = useState<'전체' | '판매자 문의' | '1:1 문의'>('전체');
  const live = useLive(sig => listInquiryInbox(s.activeUserId, sig), mergeInquiries, [s.activeUserId]);
  const support = useLive(sig => (USE_MOCK ? Promise.resolve([]) : listMySupportInquiries(s.activeUserId, sig)), mergeInquiries, [s.activeUserId]); // 1:1 문의
  const all = s.inquiries.filter(q => q.userId === s.activeUserId);
  const sellerCount = all.filter(q => q.sellerId !== 'stockdrop').length;
  const directCount = all.filter(q => q.sellerId === 'stockdrop').length;
  const filtered = tab === '전체' ? all : tab === '판매자 문의' ? all.filter(q => q.sellerId !== 'stockdrop') : all.filter(q => q.sellerId === 'stockdrop');
  return (
    <div className="space-y-4">
      <Header title="내 문의 내역" back={true} action={<button onClick={() => navigate('/inquiries/compose')} className="text-[12px] underline">문의 작성</button>}/>
      <div className="divider flex gap-5 pb-2">
        {([['전체', all.length], ['판매자 문의', sellerCount], ['1:1 문의', directCount]] as const).map(([t, count]) => (
          <button key={t} onClick={() => setTab(t)} className={`border-b-2 py-2 text-[11px] ${tab === t ? 'border-[var(--ink)] font-bold' : 'muted border-transparent'}`}>{t} {count}</button>
        ))}
      </div>
      <LiveStatus state={live}/>
      {!USE_MOCK && <LiveStatus state={support}/>}
      {filtered.map(q => (
        <Link key={q.id} to={`/inquiries/${q.id}`} className="divider block py-4 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${q.answer ? 'bg-[#EEF8F3] text-[#3FB181]' : 'bg-[var(--soft)] text-[var(--muted)]'}`}>{q.answer ? '답변 완료' : q.sellerId === 'stockdrop' ? '접수됨' : '답변 대기'}</span>
            <span className="muted text-[10px]">{new Date(q.createdAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }).replace('. ', '.').replace('.', '.')}{' '}{new Date(q.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
          </div>
          <p className="text-[13px] font-semibold">{q.sellerId === 'stockdrop' ? `1:1 문의 · ${q.kind}` : `판매자 문의 · ${q.kind}`}</p>
          <p className="muted truncate text-[12px]">{q.question}</p>
          <p className="text-[12px] text-[#949494]">{q.sellerId === 'stockdrop' ? 'StockDrop 운영팀' : q.productName}</p>
        </Link>
      ))}
      {!filtered.length && !live.loading && !live.error && !support.loading && !support.error && <Empty title="문의 내역이 없어요" message="문의 내역은 최근 1년까지 보관돼요."/>}
      {filtered.length > 0 && <p className="pb-4 text-center text-[11px] text-[#949494]">문의 내역은 최근 1년까지 보관돼요</p>}
    </div>
  );
}

/** 문의 첨부 이미지: Query는 URL을 주지 않으므로 download API로 5분 유효 URL을 받아 보여 준다 */
function InquiryImage({ orderId, imageId }: { orderId: string; imageId: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => { const c = new AbortController(); getInquiryImageUrl(orderId, imageId, c.signal).then(setSrc, () => {}); return () => c.abort(); }, [orderId, imageId]);
  return <ProductImage src={src} alt="첨부 사진" className="h-[72px] w-[72px] shrink-0"/>;
}
const NOT_PROJECTED = 'INQUIRY_NOT_PROJECTED';
export function InquiryDetailPage() {
  const { id } = useParams(); const s = useStore(); const navigate = useNavigate();
  const [params] = useSearchParams();
  const productId = params.get('productId'), relatedOrderId = params.get('orderId');
  const [replyText, setReplyText] = useState(''), [replyBusy, setReplyBusy] = useState(false);
  const toast = useToast();
  const q = s.inquiries.find(i => i.id === id && i.userId === s.activeUserId);
  // 상세 API는 주문 id가 필요하다: store에 없으면(직접 진입) 문의함에서 찾아 orderId를 얻는다
  // 방금 보낸 문의는 Kafka 조회 모델에 아직 없어 첫 조회가 404일 수 있다: 오류와 다시 시도를 띄우지 않고 잠시 뒤 자동으로 다시 읽는다
  const live = useLive(sig => retryProjection(async () => {
    // 알림은 문의뿐 아니라 관련 상품/주문 ID도 전달하므로 목록 캐시 없이 조회한다.
    if (!USE_MOCK && id && (productId || q?.productId && !q.orderId && q.sellerId !== 'stockdrop')) {
      return getProductInquiry(productId || q!.productId, id, s.activeUserId, sig);
    }
    if (!USE_MOCK && id && relatedOrderId) return getOrderInquiry(relatedOrderId, id, s.activeUserId, sig);
    if (q?.sellerId === 'stockdrop') return USE_MOCK || !id ? null : getMySupportInquiry(id, s.activeUserId, sig);
    if (!q && !USE_MOCK && id) {
      try { return await getMySupportInquiry(id, s.activeUserId, sig); }
      catch (e) { if (!(isApiError(e) && e.status === 404)) throw e; } // 404: 1:1 문의가 아니다 → 주문 문의에서 찾는다
    }
    const orderId = q?.orderId ?? (await listInquiryInbox(s.activeUserId, sig)).find(i => i.id === id)?.orderId;
    if (orderId && id) return getOrderInquiry(orderId, id, s.activeUserId, sig);
    // 캐시 없이 들어왔는데 어디에서도 못 찾으면 아직 반영 전일 수 있어 다시 읽는다. 끝내 없으면 '찾을 수 없어요'로 보인다
    if (!q && !USE_MOCK && id) throw new ApiError('문의를 찾을 수 없어요.', 404, NOT_PROJECTED);
    return null;
  }, sig).catch(e => { if (isApiError(e) && e.code === NOT_PROJECTED) return null; throw e; }), (st, d) => { if (d) mergeInquiries(st, [d]); }, [id, s.activeUserId, productId, relatedOrderId]);
  if (!q) return live.loading || live.error ? <LiveStatus state={live}/> : <Empty title="문의를 찾을 수 없어요"><Link to="/inquiries" className="btn">문의 목록</Link></Empty>;
  if (q.sellerId === 'stockdrop') return <div className="space-y-5">
    <Header title="문의 상세" back={true}/>
    <div className="flex items-center justify-between"><span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${q.answer ? 'bg-[var(--positive-soft)] text-[var(--positive)]' : 'bg-[var(--blue-soft)] text-[var(--muted)]'}`}>{q.answer ? '답변 완료' : '접수됨'}</span><span className="muted text-[10px]">{q.kind} · {dateTime(q.createdAt)}</span></div>
    <div className="rounded-[6px] bg-[var(--blue-soft)] p-4 space-y-2"><p className="text-[11px] font-bold">{q.productName}</p><p className="text-[13px] leading-[1.8] whitespace-pre-line">{q.question}</p></div>
    {q.answer ? <div className="space-y-2"><p className="text-[12px] font-bold">StockDrop 운영팀 답변</p><div className="rounded-[6px] border border-[var(--line)] p-4"><p className="text-[13px] leading-[1.8] whitespace-pre-line">{q.answer}</p></div></div> : <Note title="답변 대기 중">영업일 기준 1일 내에 답변드릴게요. 2영업일 안에 답변이 없으면 StockDrop이 직접 확인합니다.</Note>}
    {/* 운영 1:1 문의는 추가 메시지 API가 없어 로컬 성공 동작을 노출하지 않는다. */}
    <Note>추가로 궁금한 점은 새 1:1 문의로 남겨 주세요.</Note>
    <Link to="/inquiries/compose" className="btn btn-outline w-full">새 1:1 문의</Link>
  </div>;
  if (q.messages?.length && q.orderId) return <div className="space-y-5"> {/* 실제 API 주문 문의: 메시지 스레드 */}
    <Header title="문의 상세" back={true}/>
    <LiveStatus state={live}/>
    <div className="space-y-0.5"><p className="text-[15px] font-bold">{q.productName.split(' · ')[0]}</p>{q.productName.includes(' · ') && <p className="text-[13px]">{q.productName.split(' · ').slice(1).join(' · ')}{q.quantity ? ` · ${q.quantity}개` : ''}</p>}<p className="muted text-[12px]">주문번호 {q.orderId}</p></div>
    <div className="flex items-center justify-between gap-2"><span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${q.answer ? 'bg-[#EEF8F3] text-[#3FB181]' : 'bg-[var(--soft)] text-[var(--muted)]'}`}>{q.answer ? '답변 완료' : '답변 대기'}</span><span className="muted text-[10px]">{q.kind} · {dateTime(q.createdAt)}</span></div>
    {q.messages.map((m, i) => <div key={i} className={`rounded-[6px] p-4 space-y-1 ${m.seller ? 'border border-[var(--line)]' : 'bg-[var(--soft)]'}`}><p className="text-[11px] font-bold">{m.seller ? '판매자' : '나'} <span className="muted font-normal">{dateTime(m.createdAt)}</span></p><p className="text-[13px] leading-[1.8] whitespace-pre-line">{m.body}</p></div>)}
    {!!q.imageIds?.length && <div className="flex gap-2 overflow-x-auto">{q.imageIds.map(imageId => <InquiryImage key={imageId} orderId={q.orderId!} imageId={imageId}/>)}</div>}
    <Field label="추가 문의"><textarea aria-label="추가 문의" className="field field-box" value={replyText} onChange={e => setReplyText(e.target.value.slice(0, 1000))} placeholder="추가로 궁금한 점을 입력해 주세요" rows={4}/></Field>
    <div className="flex gap-2"><Link className="btn btn-outline flex-1" to="/inquiries">내 문의 내역</Link><Button className="flex-1" disabled={replyBusy || !replyText.trim()} onClick={async () => { setReplyBusy(true); try { const u = await addInquiryMessage(q.orderId!, q.id, replyText.trim(), s.activeUserId); mutate(st => mergeInquiries(st, [u])); setReplyText(''); toast('추가 문의가 접수되었습니다.'); } catch (e) { toast(errorMessage(e)); } finally { setReplyBusy(false); } }}>추가 문의 보내기</Button></div>
  </div>;
  return (
    <div className="space-y-5">
      <Header title="문의 상세" back={true}/>
      {/* 상품 정보 — Figma: 브랜드 · 상품명, 주문번호 */}
      <div className="space-y-0.5">
        {q.productName.includes(' · ') ? <>
          <p className="text-[15px] font-bold">{q.productName.split(' · ')[0]}</p>
          <p className="text-[13px]">{q.productName.split(' · ').slice(1).join(' · ')}{q.quantity ? ` · ${q.quantity}개` : ''}</p>
        </> : <p className="text-[15px] font-bold">{q.productName}</p>}
        {q.orderId && <p className="muted text-[12px]">주문번호 {q.orderId}</p>}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${q.answer ? 'bg-[#EEF8F3] text-[#3FB181]' : 'bg-[var(--soft)] text-[var(--muted)]'}`}>{q.answer ? '답변 완료' : '답변 대기'}</span>
        <span className="muted text-[10px]">{q.kind} · {new Date(q.createdAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }).replace('. ', '.').replace('.', '.')}{' '}{new Date(q.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
      </div>
      <div className="rounded-[6px] bg-[var(--soft)] p-4 space-y-2">
        <p className="text-[13px] leading-[1.8] whitespace-pre-line">{q.question}</p>
      </div>
      {q.answer ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-bold">{q.productName.split(' · ')[0] ?? '판매자'} 답변</p>
            <span className="muted text-[10px]">{new Date(q.createdAt + 86400000).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }).replace('. ', '.').replace('.', '.')}</span>
          </div>
          <div className="rounded-[6px] border border-[var(--line)] p-4 space-y-2">
            <p className="text-[13px] leading-[1.8] whitespace-pre-line">{q.answer}</p>
            {['반품', '하자·파손', '오배송'].includes(q.kind) && <p className="muted text-[10px]">반품·환불은 판매자와 직접 협의해 주세요</p>}
          </div>
          <div className="rounded-[6px] bg-[var(--soft)] p-4 space-y-1">
            <p className="text-[13px] font-semibold">답변으로 해결되지 않았나요?</p>
            <p className="muted text-[12px]">StockDrop 운영팀에 도움을 요청할 수 있어요</p>
          </div>
        </div>
      ) : (
        <Note title="답변 대기 중">판매자가 답변을 등록하면 알림으로 안내해 드릴게요.</Note>
      )}
      <div className="flex gap-2">
        {/* 상품 문의에는 추가 메시지 API가 없다. 기존 질문을 새 질문으로 복제하지 않는다. */}
        {!q.orderId && <Link className="btn btn-outline flex-1" to={`/product/${encodeURIComponent(q.productId)}`}>새 문의는 상품 상세에서 남겨 주세요</Link>}
        {q.orderId && <Button className="flex-1" onClick={() => navigate(`/orders/${q.orderId}`)}>주문 보기</Button>}
      </div>
      <Link to="/inquiries" className="btn btn-outline w-full">문의 목록으로</Link>
    </div>
  );
}

// 1:1 문의 작성 — 실제 모드는 createSupportInquiry(api/support.ts)로 보낸다. mock 모드만 이 기기 저장
export function OpsInquiryComposePage() {
  const navigate = useNavigate(); const s = useStore(); const toast = useToast();
  const [kind, setKind] = useState('계정');
  const [title, setTitle] = useState(''), [content, setContent] = useState(''), [orderId, setOrderId] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [leaving, setLeaving] = useState(false);
  const kinds = ['계정', '결제', '앱 오류', '입점·판매', '기타'];
  const dirty = !!title.trim() || !!content.trim();
  // 관련 주문: 주문 목록을 거치지 않고 바로 들어와도 고를 수 있게 본인 주문을 불러온다(일시 실패는 한 번 자동 재시도)
  const orders = useLive(sig => retryProjection(() => listOrders({}, sig), sig), mergeOrderList, [s.activeUserId]);
  const userOrders = s.orders.filter(o => o.userId === s.activeUserId).slice(0, 10);
  return <form className="space-y-5" onSubmit={async e => { e.preventDefault(); if (!title.trim() || !content.trim()) { setError('제목과 내용을 입력해 주세요.'); return; } setBusy(true); setError(''); try { let newId = uid('q-'); if (!USE_MOCK) { const q = await createSupportInquiry({ kind, title, content, orderId }, s.activeUserId); newId = q.id; mutate(st => mergeInquiries(st, [q])); } else await atomic(state => { state.inquiries.unshift({ id: newId, userId: state.activeUserId, sellerId: 'stockdrop', productId: '', productName: title.trim(), kind, question: content.trim(), orderId: orderId || undefined, public: false, createdAt: nowOf(state) }); }); toast('문의가 접수되었습니다. 평일 10:00–18:00 내에 답변드릴게요.'); navigate(`/inquiries/${newId}`, { replace: true }); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>
    <Header title="1:1 문의하기" action={<button type="button" onClick={() => { if (dirty) setLeaving(true); else navigate(-1); }} className="muted text-[11px]">닫기</button>}/>
    <section className="space-y-3"><p className="label">문의 유형 <span className="muted text-[10px]">· 필수</span></p><div className="flex flex-wrap gap-2">{kinds.map(k => <Chip key={k} selected={kind === k} onClick={() => setKind(k)}>{k}</Chip>)}</div></section>
    <Field label="제목" required><input aria-label="제목" className="field" value={title} onChange={e => setTitle(e.target.value)} placeholder="제목을 입력해 주세요" required/></Field>
    <Field label="문의 내용" required><textarea aria-label="문의 내용" className="field field-box" value={content} onChange={e => setContent(e.target.value.slice(0, 1000))} placeholder="문의 내용을 자세히 적어주세요." rows={5} required/><p className="muted mt-1 text-right text-[10px]">{content.length} / 1000</p></Field>
    <Field label="관련 주문"><p className="muted mb-1 text-[10px]">· 선택</p><select aria-label="관련 주문" className="field" value={orderId} onChange={e => setOrderId(e.target.value)}><option value="">주문을 선택해 주세요</option>{userOrders.map(o => <option key={o.id} value={o.id}>{o.id} · {o.product.name}</option>)}</select>{orders.error && !userOrders.length && <p className="mt-1 text-[11px] text-[var(--red)]">주문 목록을 불러오지 못했어요. <button type="button" className="font-bold underline" onClick={orders.reload}>다시 시도</button></p>}</Field>
    <Note>취소·반품·하자·오배송은 해당 주문의 판매자에게 문의해 주세요. 1:1 문의 운영시간 평일 10:00–18:00 · 주말·공휴일 휴무</Note>
    <ErrorBox message={error}/>
    <Button type="submit" className="w-full" disabled={busy || !title.trim() || !content.trim()}>{busy ? '접수 중…' : '문의 보내기'}</Button>
    {leaving && <ConfirmLeave onLeave={() => navigate(-1)} onStay={() => setLeaving(false)}/>}
  </form>;
}
