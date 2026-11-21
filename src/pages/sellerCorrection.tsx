/**
 * 입점 보완 제출(판매 신청자, 실제 모드). 운영자가 요청한 항목만 입력받아 POST /seller-applications/{id}/resubmissions로 보낸다.
 * 서버(SellerCorrectionSubmissionRequest)는 요청 항목과 보낸 항목이 정확히 같아야 받으므로 요청받지 않은 항목은 보내지 않는다.
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Application, DocumentFile } from '../domain';
import type { CorrectionField } from '../api';
import { FIELD_LABEL, errorMessage, resubmitApplication } from '../api';
import { BankField } from '../components/BankField';
import { PdfField } from '../components/PdfField';
import { Button, ErrorBox, Field, Note, useLeaveGuard } from '../components/ui';
import { getPdf } from '../files';
import { CORRECTION_FIELDS, correctionPatch, correctionProblems } from '../sellerFlows';
import type { CorrectionValues } from '../sellerFlows';
import { takeAddressPick } from './address';

const draftKey = (id: string) => `stockdrop:correction-draft:${id}`;
const initial = (app: Application): CorrectionValues => ({ displayName: app.displayName, name: app.name, email: app.email, phone: app.phone, bank: app.bank, account: '', dispatchPostal: '', dispatchAddress: '', dispatchDetail: '', returnPostal: '', returnAddress: '', returnDetail: '' });

/** 요청 항목마다 입력란을 두고 실제로 보낸다. 제출에 성공하면 onSubmitted(서버가 새 신청을 심사 대기로 만든다) */
export function CorrectionForm({ app, codes, onSubmitted }: { app: Application; codes: CorrectionField[]; onSubmitted: () => void }) {
  const navigate = useNavigate(); const [params, setParams] = useSearchParams();
  // 주소 검색 화면을 다녀와도 입력이 남게 이 탭에 임시 저장한다(계좌번호는 저장하지 않는다)
  const [v, setV] = useState<CorrectionValues>(() => { try { return { ...initial(app), ...JSON.parse(sessionStorage.getItem(draftKey(app.id)) || '{}'), account: '' }; } catch { return initial(app); } });
  const [doc, setDoc] = useState<DocumentFile>(), [problems, setProblems] = useState<Partial<Record<CorrectionField, string>>>({}), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const save = (next: CorrectionValues) => { setV(next); try { sessionStorage.setItem(draftKey(app.id), JSON.stringify({ ...next, account: '' })); } catch { /* 저장 차단: 화면 값만 유지 */ } };
  const set = (k: keyof CorrectionValues, value: string) => save({ ...v, [k]: value });
  // 작성 중: 처음 연 값(이 창에 남아 있던 입력 포함)과 다르거나 서류를 붙였을 때. 계좌번호와 서류는 이 창에도 남지 않는다
  const [start] = useState(() => JSON.stringify(v));
  const leave = useLeaveGuard(JSON.stringify(v) !== start || !!doc, { message: '적은 내용은 다시 들어오면 이어서 쓸 수 있지만, 계좌번호와 첨부한 서류는 다시 넣어야 해요.' });
  useEffect(() => {
    const target = params.get('pick'); if (target !== 'dispatch' && target !== 'return') return;
    const picked = takeAddressPick();
    if (picked) save(target === 'dispatch' ? { ...v, dispatchPostal: picked.postalCode, dispatchAddress: picked.roadAddress } : { ...v, returnPostal: picked.postalCode, returnAddress: picked.roadAddress });
    const next = new URLSearchParams(params); next.delete('pick'); setParams(next, { replace: true });
  }, [params]);
  const search = (target: 'dispatch' | 'return') => navigate(`/address-search?returnTo=${encodeURIComponent(`/apply?fix=1&pick=${target}`)}`);
  const has = (c: CorrectionField) => codes.includes(c);
  const reason = (c: CorrectionField) => app.rejectionItems?.find(i => i.code === c)?.reason;
  async function submit() {
    const p = correctionProblems(codes, v, !!doc); setProblems(p); setError('');
    if (Object.keys(p).length) { setError('보완할 항목을 확인해 주세요.'); return; }
    setBusy(true);
    try {
      await resubmitApplication(app.id, correctionPatch(codes, v), has('CERTIFICATE') && doc ? await getPdf(doc.id) : undefined, doc?.name);
      try { sessionStorage.removeItem(draftKey(app.id)); } catch { /* 무시 */ }
      leave.allowLeave(); onSubmitted();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  const card = (c: CorrectionField, body: ReactNode) => <section key={c} className="space-y-3 rounded-inner border border-red p-4" aria-label={`${FIELD_LABEL[c]} 보완`}>
    <p className="text-body font-bold">{FIELD_LABEL[c]}</p>
    {reason(c) && <p className="whitespace-pre-line text-label leading-relaxed text-red">{reason(c)}</p>}
    {body}
    {problems[c] && <p role="alert" className="text-label text-red">{problems[c]}</p>}
  </section>;
  const addressInputs = (kind: 'dispatch' | 'return') => { const postal = kind === 'dispatch' ? v.dispatchPostal : v.returnPostal, road = kind === 'dispatch' ? v.dispatchAddress : v.returnAddress, detail = kind === 'dispatch' ? v.dispatchDetail : v.returnDetail, label = kind === 'dispatch' ? '출고지' : '반품 주소';
    return <div className="space-y-2">
      <input aria-label={`${label} 주소`} readOnly value={road ? `(${postal}) ${road}` : ''} placeholder="눌러서 주소 검색" onClick={() => search(kind)} className="field cursor-pointer"/>
      <input aria-label={`${label} 상세 주소`} value={detail} onChange={e => set(kind === 'dispatch' ? 'dispatchDetail' : 'returnDetail', e.target.value)} maxLength={200} placeholder="상세 주소(선택)" className="field"/>
    </div>; };
  return <div className="space-y-4">
    {has('CERTIFICATE') && card('CERTIFICATE', <><p className="muted text-footnote">원본 PDF로 다시 첨부해 주세요.</p><PdfField value={doc} onChange={setDoc}/></>)}
    {has('STORE_NAME') && card('STORE_NAME', <input aria-label="판매자 표시 이름" value={v.displayName} maxLength={100} onChange={e => set('displayName', e.target.value)} className="field"/>)}
    {has('CONTACT') && card('CONTACT', <div className="space-y-2">
      <input aria-label="담당자 이름" value={v.name} maxLength={100} onChange={e => set('name', e.target.value)} className="field" autoComplete="name"/>
      <input aria-label="담당자 이메일" type="email" value={v.email} maxLength={320} onChange={e => set('email', e.target.value)} className="field" autoComplete="email"/>
      <input aria-label="담당자 연락처" type="tel" inputMode="numeric" value={v.phone} onChange={e => set('phone', e.target.value)} className="field" autoComplete="tel"/>
    </div>)}
    {has('BANK_ACCOUNT') && card('BANK_ACCOUNT', <div className="space-y-2">
      <BankField value={v.bank} onChange={b => set('bank', b)}/>
      <Field label="계좌번호"><input aria-label="정산 계좌번호" inputMode="numeric" value={v.account} onChange={e => setV({ ...v, account: e.target.value })} className="field" placeholder={app.account ? `기존 ${app.account}` : '숫자만 입력'}/></Field>
      <p className="muted text-footnote">보안을 위해 계좌번호는 다시 입력해 주세요.</p>
    </div>)}
    {has('DISPATCH_ADDRESS') && card('DISPATCH_ADDRESS', addressInputs('dispatch'))}
    {has('RETURN_ADDRESS') && card('RETURN_ADDRESS', addressInputs('return'))}
    <section className="space-y-2">
      <p className="text-body font-bold">확인 완료된 항목</p>
      {CORRECTION_FIELDS.filter(c => !has(c)).map(c => <div key={c} className="divider flex items-center justify-between py-3"><span className="text-label">{FIELD_LABEL[c]}</span><span className="text-footnote font-semibold text-green">확인 완료</span></div>)}
      {CORRECTION_FIELDS.every(has) && <p className="muted text-label">모든 항목의 보완이 필요해요.</p>}
    </section>
    <Note>요청받은 항목만 바뀌고, 나머지는 처음 신청한 내용 그대로 다시 심사돼요.</Note>
    <ErrorBox message={error}/>
    <Button className="w-full" disabled={busy} onClick={submit}>{busy ? '보내는 중…' : '보완해서 다시 심사 요청하기'}</Button>
  </div>;
}

const day = (t?: number) => { if (!t) return '-'; const d = new Date(t); return `${d.getMonth() + 1}.${d.getDate()} (${'일월화수목금토'[d.getDay()]})`; };
/**
 * 실제 모드 입점 심사 결과 화면.
 * - 보완 요청(CHANGES_REQUESTED): 서버가 요청한 항목만 '보완 필요', 나머지는 '확인 완료'. 사유 확인하기 → CorrectionForm
 * - 반려(REJECTED)·보완 기한 만료(EXPIRED): 보완 제출은 받지 않으므로 사유를 보여 주고 새로 신청하게 한다
 */
export function CorrectionScreen({ app, onSubmitted, onReapply }: { app: Application; onSubmitted: () => void; onReapply: () => void }) {
  const [params] = useSearchParams(); const [detail, setDetail] = useState(() => params.has('fix')); // 주소 검색에서 돌아오면 바로 입력 화면
  const codes = (app.rejectionItems ?? []).map(i => i.code).filter((c): c is CorrectionField => !!c && (CORRECTION_FIELDS as string[]).includes(c));
  const steps = <div className="grid grid-cols-3 gap-2 text-center text-footnote"><span>✓ 정보 입력</span><b>02 입점 심사</b><span className="muted">03 판매 시작</span></div>;
  const open = app.apiStatus === 'CHANGES_REQUESTED' && (app.correctionState ?? 'OPEN') === 'OPEN' && codes.length > 0;
  if (!open) {
    const expired = app.apiStatus === 'EXPIRED' || app.correctionState === 'EXPIRED';
    const reasons = (app.rejectionItems ?? []).filter(i => i.reason);
    return <div className="space-y-5">
      {steps}
      <div><h1 className="text-heading font-bold leading-[1.5] tracking-[-1px]">{expired ? <>보완 기한이 지나<br/>신청이 취소됐어요</> : <>입점 심사를<br/>통과하지 못했어요</>}</h1>
        <p className="muted mt-2 text-label leading-relaxed">{expired ? '처음부터 다시 신청하면 새로 심사해 드려요.' : '사유를 확인하고 내용을 고쳐 새로 신청해 주세요.'}</p></div>
      {reasons.length > 0 && <section className="space-y-2">{reasons.map((r, i) => <div key={i} className="rounded-inner border border-line p-4"><p className="text-body font-bold">{r.field}</p><p className="mt-1 whitespace-pre-line text-label leading-relaxed text-red">{r.reason}</p></div>)}</section>}
      <div className="flex gap-2"><Button outline className="flex-1" to="/support">고객센터 문의</Button><Button className="flex-1" onClick={onReapply}>다시 신청하기</Button></div>
    </div>;
  }
  if (!detail) return <div className="space-y-5">
    {steps}
    <div><h1 className="text-heading font-bold leading-[1.5] tracking-[-1px]">입점 심사에서<br/>보완을 요청했어요</h1>
      <p className="muted mt-2 text-label leading-relaxed">제출한 정보 중 {codes.length}개 항목의 보완이 필요해요.<br/>기한 안에 보완하면 다시 심사해 드려요.</p></div>
    <div className="grid grid-cols-2 gap-4">
      <div><p className="muted text-caption">심사 완료</p><p className="mt-1 text-label font-bold">{day(app.reviewedAt)}</p></div>
      <div><p className="muted text-caption">보완 기한</p><p className="mt-1 text-label font-bold">{day(app.deadlineAt)}</p></div>
    </div>
    <section className="divider space-y-0 py-2">
      <h2 className="mb-3 text-subhead font-bold">입점 심사 결과</h2>
      {CORRECTION_FIELDS.map(c => <div key={c} className="divider flex items-center justify-between py-3"><span className="text-label">{FIELD_LABEL[c]}</span><span className={`text-footnote font-semibold ${codes.includes(c) ? 'text-red' : 'text-green'}`}>{codes.includes(c) ? '보완 필요' : '확인 완료'}</span></div>)}
    </section>
    <Note title="기한 안에 보완하지 않으면 신청이 취소돼요.">취소되면 처음부터 다시 신청해야 해요.</Note>
    <div className="flex gap-2"><Button outline className="flex-1" to="/support">고객센터 문의</Button><Button className="flex-1" onClick={() => setDetail(true)}>사유 확인하기</Button></div>
  </div>;
  return <div className="space-y-5">
    {steps}
    <div><h1 className="text-heading font-bold leading-[1.5] tracking-[-1px]">{codes.length}개 항목의<br/>보완이 필요해요</h1>
      <p className="muted mt-2 text-label leading-relaxed">{day(app.deadlineAt)}까지 보완해 주시면<br/>제출한 날부터 다시 심사를 진행해요.</p></div>
    <CorrectionForm app={app} codes={codes} onSubmitted={onSubmitted}/>
  </div>;
}
