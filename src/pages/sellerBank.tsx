import { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, Info } from 'lucide-react';
import { BankField } from '../components/BankField';
import { Button, ErrorBox, Field, Header, InfoRow, LiveStatus, Unavailable, useLeaveGuard, useToast } from '../components/ui';
import { activeUser, type SellerSettings } from '../domain';
import { fetchSellerMe, updateSellerBank, errorMessage, useApi } from '../api';
import { USE_MOCK } from '../config';
import { mutate, useStore } from '../store';
import { maskedBankAccount } from '../bankAccount';

export function SellerBankSettingsPage() {
  const s = useStore(), user = activeUser(s), toast = useToast();
  const original = s.sellerSettings[user.id];
  const [current, setCurrent] = useState<SellerSettings>({ ...(original ?? { displayName: user.name, bank: '', holder: '', shippingAddress: '', returnAddress: '' }), account: maskedBankAccount(original?.account) });
  const draft = (settings?: SellerSettings) => ({ bank: settings?.bank ?? '', account: '', holder: settings?.holder ?? '' });
  const [form, setForm] = useState(() => draft(original)), [base, setBase] = useState(() => draft(original));
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [needsRefresh, setNeedsRefresh] = useState(false);
  const sending = useRef(false);
  const me = useApi(signal => USE_MOCK ? Promise.resolve(null) : fetchSellerMe(original, signal), [user.id]);
  const apply = (settings: SellerSettings) => {
    const safe = { ...settings, account: maskedBankAccount(settings.account) };
    mutate(state => { state.sellerSettings[user.id] = safe; });
    setCurrent(safe); setForm(draft(safe)); setBase(draft(safe));
  };
  useEffect(() => { if (me.data) { const safe = { ...me.data.settings, account: maskedBankAccount(me.data.settings.account) }; setCurrent(safe); setForm(draft(safe)); setBase(draft(safe)); } }, [me.data]);
  const dirty = JSON.stringify(form) !== JSON.stringify(base);
  useLeaveGuard(dirty);
  const unavailable = !USE_MOCK && (!me.data || me.loading || !!me.error);
  async function refresh() {
    if (sending.current) return; sending.current = true; setBusy(true);
    try { apply((await fetchSellerMe(current)).settings); setNeedsRefresh(false); setError(''); toast('최신 계좌 정보를 불러왔습니다.'); }
    catch { setError('계좌 변경은 저장됐지만 최신 정보를 불러오지 못했어요. 다시 조회해 주세요.'); }
    finally { sending.current = false; setBusy(false); }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (sending.current || !dirty || unavailable || needsRefresh) return;
    sending.current = true; setBusy(true); setError('');
    try {
      const clean = { bank: form.bank.trim(), account: form.account.replace(/-/g, ''), holder: form.holder.trim() };
      if (!/^\d{6,30}$/.test(clean.account)) throw new Error('계좌번호는 숫자만 6~30자리로 입력해 주세요.');
      if (!clean.bank || !clean.holder) throw new Error('은행과 예금주를 입력해 주세요.');
      if (clean.bank.length > 50 || clean.holder.length > 100) throw new Error('은행은 50자, 예금주는 100자 이내로 입력해 주세요.');
      if (USE_MOCK) { apply({ ...current, ...clean, account: maskedBankAccount(clean.account) }); toast('변경 내용을 저장했습니다.'); }
      else {
        await updateSellerBank(clean);
        // PUT 성공 이후에는 원문을 폐기하고 재조회만 허용한다. GET 실패로 PUT를 반복하지 않는다.
        setForm({ ...clean, account: '' }); setBase({ ...clean, account: '' });
        setNeedsRefresh(true);
        try { apply((await fetchSellerMe(current)).settings); setNeedsRefresh(false); toast('변경 내용을 저장했습니다.'); }
        catch { setError('계좌 변경은 저장됐지만 최신 정보를 불러오지 못했어요. 다시 조회해 주세요.'); }
      }
    } catch (e) { setError(errorMessage(e)); }
    finally { sending.current = false; setBusy(false); }
  }
  if (!user.seller) return <Unavailable/>;
  return <form className="space-y-5" onSubmit={save}>
    <Header title="정산 계좌 관리"/>
    <h2 className="text-body font-bold text-muted">현재 정산 계좌</h2>
    {!USE_MOCK && <LiveStatus state={me}/>}
    <section aria-label="현재 정산 계좌" className="rounded-dialog bg-canvas p-5">
      <div className="flex items-center justify-between"><p className="muted text-body">{current?.bank || '-'}</p>{USE_MOCK && <span className="flex items-center gap-1 rounded-badge bg-surface px-2 py-0.5 text-caption font-bold text-green"><Check size={11}/>인증 완료</span>}</div>
      <p className="font-number text-heading font-bold mt-1 break-all">{current?.account || '-'}</p>
      {current?.holder && <p className="muted text-footnote mt-1">예금주 {current.holder}</p>}
    </section>
    {USE_MOCK && <div className="space-y-2"><InfoRow label="정산 주기" value="월별 (구매 확정 기준)"/><InfoRow label="다음 정산 예정일" value="2026.11.11 (수)"/><InfoRow label="정산 예정 금액" value={<span className="font-bold">1,284,000원</span>}/><button type="button" className="flex items-center pt-1 text-body font-bold">정산 내역 보기<ChevronRight size={15}/></button></div>}
    <div className="-mx-4 h-px bg-line"/><h2 className="text-body font-bold text-muted">계좌 변경</h2>
    <fieldset disabled={busy || unavailable || needsRefresh} className="space-y-5">
      <Field label="은행" required><BankField label="은행" value={form.bank} onChange={bank => setForm(f => ({ ...f, bank }))}/></Field>
      <Field label="계좌번호" required><input aria-label="계좌번호" className="field-line" inputMode="numeric" autoComplete="off" value={form.account} onChange={e => setForm(f => ({ ...f, account: e.target.value }))} placeholder="'-' 없이 숫자만 입력"/></Field>
      <Field label="예금주" required hint="사업자등록증의 상호 또는 대표자명과 같아야 해요"><input aria-label="예금주" className="field-line" value={form.holder} onChange={e => setForm(f => ({ ...f, holder: e.target.value }))}/></Field>
    </fieldset>
    <p className="muted text-label">은행이나 예금주만 바꿔도 계좌번호 전체를 다시 입력해 주세요.</p>
    <div className="flex gap-2 rounded-element bg-canvas p-4 text-label text-aux"><Info size={15} className="mt-px shrink-0"/><p>변경한 계좌는 다음 정산부터 적용돼요.</p></div>
    <ErrorBox message={error}/>
    {needsRefresh && <Button type="button" outline className="w-full min-h-11" disabled={busy} onClick={() => void refresh()}>계좌 다시 조회</Button>}
    {dirty && !needsRefresh && <div className="seller-action-enter"><Button type="submit" className="w-full" disabled={busy || unavailable}>{busy ? '저장 중…' : '계좌 변경하기'}</Button></div>}
  </form>;
}
