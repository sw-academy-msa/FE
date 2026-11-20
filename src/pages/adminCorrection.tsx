/**
 * 운영자 입점 보완 요청(실제 모드). POST/GET /admin/seller-applications/{id}/correction-request.
 * 서버(RequestSellerCorrections): deadline(미래 시각), items 1~6개(field 중복 불가, reason 공백 불가 500자 이하). 심사 대기(PENDING) 신청만 받는다.
 */
import { useState } from 'react';
import type { CorrectionField, CorrectionRequestDto } from '../api';
import { FIELD_LABEL, errorMessage, getCorrectionRequest, requestCorrection, useApi } from '../api';
import { Button, ErrorBox, LiveStatus } from '../components/ui';
import { dateTime } from '../hooks';
import { CORRECTION_FIELDS, correctionRequestProblem, deadlineOf, ymd } from '../sellerFlows';

const STATE_LABEL: Record<string, string> = { OPEN: '보완 대기', SUBMITTED: '보완 제출됨', EXPIRED: '기한 만료' };
/** 보완 요청 보내기(아래에서 올라오는 시트) */
export function CorrectionRequestSheet({ applicationId, onClose, onSent }: { applicationId: string; onClose: () => void; onSent: (r: CorrectionRequestDto) => void }) {
  const [reasons, setReasons] = useState<Partial<Record<CorrectionField, string>>>({});
  const [day, setDay] = useState(() => ymd(Date.now() + 7 * 86_400_000));
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const picked = CORRECTION_FIELDS.filter(f => reasons[f] !== undefined);
  async function send() {
    const items = picked.map(field => ({ field, reason: (reasons[field] ?? '').trim() }));
    const deadline = deadlineOf(day);
    const problem = correctionRequestProblem(items, deadline); setError(problem); if (problem) return;
    setBusy(true);
    try { onSent(await requestCorrection(applicationId, deadline, items)); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-end bg-black/60" role="dialog" aria-label="보완 요청">
    <div className="mx-auto max-h-[90dvh] w-full max-w-[390px] overflow-y-auto rounded-t-[16px] bg-white px-4 pb-8 pt-2">
      <div className="mx-auto mb-4 h-1 w-8 rounded-full bg-[#DEDEDE]"/>
      <h2 className="mb-1 text-[18px] font-bold">보완을 요청할까요?</h2>
      <p className="mb-4 text-[13px] text-[#7B7B7B]">고를 항목과 사유가 신청자에게 그대로 전달돼요.<br/>신청자는 고른 항목만 고쳐서 다시 제출할 수 있어요.</p>
      <div className="space-y-3">
        {CORRECTION_FIELDS.map(f => <div key={f} className="rounded-[6px] border border-[var(--line)] p-3">
          <label className="flex items-center gap-2 text-[13px] font-bold"><input type="checkbox" checked={reasons[f] !== undefined} onChange={e => setReasons(r => { const next = { ...r }; if (e.target.checked) next[f] = ''; else delete next[f]; return next; })}/>{FIELD_LABEL[f]}</label>
          {reasons[f] !== undefined && <textarea aria-label={`${FIELD_LABEL[f]} 보완 사유`} className="field field-box mt-2 w-full" rows={2} maxLength={500} value={reasons[f]} onChange={e => setReasons(r => ({ ...r, [f]: e.target.value }))} placeholder="보완이 필요한 이유를 입력해 주세요."/>}
        </div>)}
        <label className="block"><span className="label">보완 기한</span><input aria-label="보완 기한" type="date" className="field" min={ymd(Date.now() + 86_400_000)} value={day} onChange={e => setDay(e.target.value)}/></label>
        <p className="muted text-[11px]">기한 날짜의 23:59(한국 시간)까지 보완하지 않으면 신청이 자동으로 취소돼요.</p>
      </div>
      <div className="mt-4"><ErrorBox message={error}/></div>
      <div className="mt-4 flex gap-2">
        <Button outline className="w-[86px]" onClick={onClose} disabled={busy}>취소</Button>
        <Button className="flex-1" disabled={busy || !picked.length} onClick={send}>{busy ? '보내는 중…' : `${picked.length}개 항목 보완 요청`}</Button>
      </div>
    </div>
  </div>;
}

/** 보낸 보완 요청 보기 */
export function SentCorrection({ applicationId }: { applicationId: string }) {
  const r = useApi(signal => getCorrectionRequest(applicationId, signal), [applicationId]);
  if (!r.data) return <LiveStatus state={r}/>;
  const c = r.data;
  return <section className="mb-6 space-y-3" aria-label="보낸 보완 요청">
    <div className="flex items-center justify-between"><h2 className="text-[15px] font-bold">보낸 보완 요청</h2><span className="rounded-[4px] bg-[var(--soft)] px-2 py-0.5 text-[11px] font-bold text-[#7B7B7B]">{STATE_LABEL[c.state] ?? c.state}</span></div>
    <p className="text-[12px] text-[#7B7B7B]">보완 기한 {dateTime(Date.parse(c.deadline))}</p>
    {c.items.map(i => <div key={i.field} className="rounded-[6px] border border-[var(--line)] p-3"><p className="text-[13px] font-bold">{FIELD_LABEL[i.field] ?? i.field}</p><p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-[#7B7B7B]">{i.reason}</p></div>)}
  </section>;
}
