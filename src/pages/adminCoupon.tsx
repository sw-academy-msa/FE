/**
 * 운영자 마이페이지 '쿠폰 관리'(시안 20 tbEWq, 20-1 lLrFb). 기존 메뉴 아래에 펼치는 묶음 하나만 더한다.
 * 플래그(features.ts MEMBERSHIP_COUPON)가 꺼져 있으면 아무것도 그리지 않는다.
 * 캠페인(CLAIM, TARGETED, MEMBER)과 쿠폰 정의를 만들고, 캠페인 활성화와 일시정지, 발급 내역(통계), 정의 종료를 한다.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Badge, Button, Chip, ErrorBox, Field, InfoRow, LiveStatus, Modal, Toggle, useToast } from '../components/ui';
import { useApi } from '../api/hooks';
import { couponConditionLabel, couponDiscountLabel } from '../api/coupons';
import type { CampaignDto, CouponDefinitionDto } from '../api/coupons';
import { activateCampaign, adminActionError, adminCouponError, campaignRequest, campaignStatusLabel, createCampaign, createCouponDefinition, DEFAULT_DEFINITION, definitionRequest, definitionsFor, definitionStatusLabel, getCampaignStats, KIND_FULL, KIND_LABEL, listCampaigns, listCouponDefinitions, localInput, pauseCampaign, retireCouponDefinition, RULE_LABEL, RULES } from '../api/adminCoupons';
import type { CampaignForm, CampaignKind, DefinitionForm } from '../api/adminCoupons';
import { sendCampaignNotification } from '../api/adminCoupons';
import { MEMBERSHIP_COUPON } from '../features';
import { money } from '../domain';
import { ymd } from './membershipCoupon';

const period = (a: string, b: string) => `${ymd(a)} – ${ymd(b)}`;
const shortPeriod = (a: string, b: string) => `${ymd(a).slice(5)}–${ymd(b).slice(5)}`;
const won = (n: number | null | undefined) => (n == null ? '-' : money(n));

/** 운영자 마이페이지 메뉴 끝에 붙는 '쿠폰 관리' 펼침 행 */
export function AdminCouponSection() {
  const [open, setOpen] = useState(false);
  if (!MEMBERSHIP_COUPON) return null;
  return <>
    <button type="button" aria-expanded={open} onClick={() => setOpen(v => !v)} className="divider flex min-h-13 w-full items-center gap-3 text-left">
      <span className={`min-w-0 flex-1 text-body ${open ? 'font-bold' : ''}`}>쿠폰 관리</span>
      {open ? <ChevronUp size={17} className="muted"/> : <ChevronDown size={17} className="muted"/>}
    </button>
    {open && <AdminCoupons/>}
  </>;
}

function AdminCoupons() {
  const [tab, setTab] = useState<'campaigns' | 'definitions'>('campaigns');
  const campaigns = useApi(listCampaigns, []), defs = useApi(listCouponDefinitions, []);
  const [sheet, setSheet] = useState<'' | 'campaign' | 'definition'>('');
  const list = tab === 'campaigns' ? campaigns : defs;
  return <div className="pb-2 pt-4">
    <div className="flex gap-2"><Chip selected={tab === 'campaigns'} onClick={() => setTab('campaigns')}>캠페인</Chip><Chip selected={tab === 'definitions'} onClick={() => setTab('definitions')}>쿠폰 정의</Chip></div>
    <div className="mt-2">
      <LiveStatus state={list}/>
      {tab === 'campaigns' && campaigns.data && (campaigns.data.length ? [...campaigns.data].sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt)).map(c => <CampaignItem key={c.id} campaign={c} onChanged={campaigns.reload}/>) : <p className="muted py-6 text-center text-label">아직 만든 캠페인이 없어요.</p>)}
      {tab === 'definitions' && defs.data && (defs.data.length ? defs.data.map(d => <DefinitionItem key={d.id} definition={d} onChanged={defs.reload}/>) : <p className="muted py-6 text-center text-label">아직 만든 쿠폰 정의가 없어요.</p>)}
    </div>
    <Button className="mt-4 w-full" onClick={() => setSheet(tab === 'campaigns' ? 'campaign' : 'definition')}>{tab === 'campaigns' ? '캠페인 만들기' : '쿠폰 정의 만들기'}</Button>
    <p className="muted mt-3 text-caption leading-relaxed">일시정지, 활성화, 정의 종료는 영향 설명이 있는 확인 시트를 거쳐요.</p>
    {sheet === 'definition' && <DefinitionSheet onClose={() => setSheet('')} onCreated={() => { defs.reload(); setTab('definitions'); }}/>}
    {sheet === 'campaign' && <CampaignSheet definitions={defs.data ?? []} definitionsLoading={defs.loading} onClose={() => setSheet('')} onCreated={() => { campaigns.reload(); setTab('campaigns'); }}/>}
  </div>;
}

/** 펼침 목록 한 줄: 제목 + 배지, 요약 줄, 펼친 상세 */
function ItemRow({ title, badge, live, lines, open, onToggle, children }: { title: string; badge: string; live: boolean; lines: ReactNode[]; open: boolean; onToggle: () => void; children: ReactNode }) {
  return <div className="divider py-4">
    <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full items-start gap-3 text-left">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><p className="break-all text-callout font-bold">{title}</p><Badge live={live}>{badge}</Badge></div>
        {lines.map((l, i) => <p key={i} className={`mt-1 ${i === 0 ? 'muted text-footnote' : 'text-label'}`}>{l}</p>)}
      </div>
      {open ? <ChevronUp size={17} className="muted mt-1 shrink-0"/> : <ChevronDown size={17} className="muted mt-1 shrink-0"/>}
    </button>
    {open && <div className="mt-3 rounded-inner bg-soft p-3.5">{children}</div>}
  </div>;
}

function CampaignItem({ campaign: c, onChanged }: { campaign: CampaignDto; onChanged: () => void }) {
  const [notify, setNotify] = useState(false), [sent, setSent] = useState(false);
  const [open, setOpen] = useState(false), [confirm, setConfirm] = useState(false), [stats, setStats] = useState(false);
  const [label, live] = campaignStatusLabel(c.status);
  const active = c.status === 'ACTIVE';
  return <ItemRow title={c.code} badge={label} live={live} open={open} onToggle={() => setOpen(v => !v)}
    lines={[`${KIND_FULL[c.kind] ?? c.kind} · ${shortPeriod(c.startsAt, c.endsAt)}${c.demo ? ' · 시연용' : ''}`, `발급 ${c.issuedCount.toLocaleString('ko-KR')} / 예산 ${c.totalBudget.toLocaleString('ko-KR')}`]}>
    <InfoRow label="캠페인 코드" value={c.code}/>
    <InfoRow label="종류" value={KIND_FULL[c.kind] ?? c.kind}/>
    <InfoRow label="1인 한도" value="1장"/>
    <InfoRow label="기간" value={period(c.startsAt, c.endsAt)}/>
    <InfoRow label="시연용" value={c.demo ? '예' : '아니요'}/>
    {c.kind === 'CLAIM' && <Button outline className="mt-3 w-full" disabled={sent || !!c.notificationSentAt || !active || Date.parse(c.startsAt) > Date.now() || Date.parse(c.endsAt) <= Date.now() || c.issuedCount >= c.totalBudget} onClick={() => setNotify(true)}>{sent || c.notificationSentAt ? '알림 보냄' : '알림 보내기'}</Button>}
    {notify && <ConfirmSheet title="쿠폰 알림을 보낼까요?" action="알림 보내기" done="알림 발송을 요청했어요."
      run={() => sendCampaignNotification(c.id)} onClose={() => setNotify(false)} onDone={() => { setSent(true); onChanged(); }}>
      광고성 정보 수신에 동의한 구매자에게 쿠폰 받기 알림을 보내요. 같은 캠페인의 알림은 한 번만 보낼 수 있어요.
    </ConfirmSheet>}
    <div className="mt-3 flex gap-2">
      <Button outline className="flex-1" onClick={() => setConfirm(true)}>{active ? '일시정지' : '활성화'}</Button>
      <Button outline className="flex-1" onClick={() => setStats(true)}>발급 내역</Button>
    </div>
    {confirm && <ConfirmSheet title={active ? '캠페인을 일시정지할까요?' : '캠페인을 활성화할까요?'} action={active ? '일시정지' : '활성화'} done={active ? '일시정지했어요.' : '활성화했어요.'}
      run={() => active ? pauseCampaign(c.id) : activateCampaign(c.id)} onClose={() => setConfirm(false)} onDone={onChanged}>
      {active ? <>새 발급을 멈춰요. 이미 받은 쿠폰은 그대로 쓸 수 있어요. 다시 활성화하면 발급을 이어 가요.</>
        : <>발급 기간({period(c.startsAt, c.endsAt)}) 안에서 발급을 시작해요. {c.kind === 'CLAIM' ? '링크로 들어온 구매자가 쿠폰을 받을 수 있어요.' : c.kind === 'MEMBER' ? '멤버십 결제가 되면 회원에게 자동으로 발급돼요.' : 'AI 대상 이벤트가 오면 맞춤 쿠폰을 발급해요.'}</>}
    </ConfirmSheet>}
    {stats && <StatsSheet campaign={c} onClose={() => setStats(false)}/>}
  </ItemRow>;
}

function StatsSheet({ campaign: c, onClose }: { campaign: CampaignDto; onClose: () => void }) {
  const st = useApi(sig => getCampaignStats(c.id, sig), [c.id]);
  return <Modal title="발급 내역" onClose={onClose}>
    <p className="muted mb-3 break-all text-label">{c.code} · {KIND_LABEL[c.kind as CampaignKind] ?? c.kind}</p>
    <LiveStatus state={st}/>
    {st.data && <div className="divider pb-3">
      <InfoRow label="예산" value={`${c.totalBudget.toLocaleString('ko-KR')}장`}/>
      <InfoRow label="발급" value={`${st.data.issued.toLocaleString('ko-KR')}장`}/>
      <InfoRow label="사용" value={`${st.data.used.toLocaleString('ko-KR')}장`}/>
      <InfoRow label="사용 취소로 돌려줌" value={`${st.data.released.toLocaleString('ko-KR')}장`}/>
      <InfoRow label="만료" value={`${st.data.expired.toLocaleString('ko-KR')}장`}/>
      <InfoRow label="할인 합계" value={money(st.data.discountTotal)} strong/>
    </div>}
    <p className="muted mt-3 text-caption leading-relaxed">받은 사람별 목록은 제공하지 않아요. 할인 합계는 플랫폼이 부담한 쿠폰 할인이에요.</p>
    <Button outline closeSheet className="mt-4 w-full">닫기</Button>
  </Modal>;
}

function DefinitionItem({ definition: d, onChanged }: { definition: CouponDefinitionDto; onChanged: () => void }) {
  const [open, setOpen] = useState(false), [confirm, setConfirm] = useState(false);
  const [label, live] = definitionStatusLabel(d.status);
  return <ItemRow title={d.name} badge={label} live={live} open={open} onToggle={() => setOpen(v => !v)}
    lines={[`${couponDiscountLabel(d)} · ${couponConditionLabel(d)}`, `버전 ${d.version}`]}>
    <InfoRow label="할인" value={couponDiscountLabel(d)}/>
    {d.discountType === 'RATE' && <InfoRow label="최대 할인" value={won(d.maxDiscount)}/>}
    <InfoRow label="최소 상품 금액" value={won(d.minItemsAmount)}/>
    <InfoRow label="적용 범위" value={d.scope === 'PRODUCT' ? '특정 상품(맞춤형 캠페인용)' : '전체 상품(받기형, 회원 쿠폰용)'}/>
    {d.status === 'ACTIVE' && <Button outline className="mt-3 w-full" onClick={() => setConfirm(true)}>정의 종료</Button>}
    {confirm && <ConfirmSheet title="쿠폰 정의를 종료할까요?" action="종료" done="정의를 종료했어요." run={() => retireCouponDefinition(d.id)} onClose={() => setConfirm(false)} onDone={onChanged}>
      이 정의로는 새 캠페인을 만들 수 없어요. 이미 발급한 쿠폰의 조건은 그대로 남아요. 되돌릴 수 없어요.
    </ConfirmSheet>}
  </ItemRow>;
}

/** 영향 설명이 있는 확인 시트. 실패는 토스트로 알리고 시트는 남긴다 */
function ConfirmSheet({ title, action, done, run, onClose, onDone, children }: { title: string; action: string; done: string; run: () => Promise<unknown>; onClose: () => void; onDone: () => void; children: ReactNode }) {
  const toast = useToast(); const [busy, setBusy] = useState(false);
  const go = async () => { if (busy) return; setBusy(true); try { await run(); toast(done); onDone(); onClose(); } catch (e) { toast(adminActionError(e)); } finally { setBusy(false); } };
  return <Modal title={title} onClose={onClose}>
    <p className="muted text-body leading-relaxed">{children}</p>
    <div className="mt-5 flex gap-2"><Button outline closeSheet className="flex-1">취소</Button><Button className="flex-1" disabled={busy} onClick={() => void go()}>{busy ? '처리 중…' : action}</Button></div>
  </Modal>;
}

/* ── 입력 칸 ── */
function UnitInput({ label, value, onChange, unit, placeholder, error, numeric = true, readOnly = false }: { label: string; value: string; onChange: (v: string) => void; unit?: string; placeholder?: string; error?: string; numeric?: boolean; readOnly?: boolean }) {
  return <label className={`flex h-12 items-center gap-2 border-b ${error ? 'border-red' : 'border-line'}`}>
    <input aria-label={label} readOnly={readOnly} inputMode={numeric ? 'numeric' : undefined} className="min-w-0 flex-1 bg-transparent text-headline outline-none placeholder:text-placeholder" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}/>
    {unit && <span className="shrink-0 text-callout text-aux">{unit}</span>}
  </label>;
}
const amountText = (v: string) => { const d = v.replace(/[^\d]/g, '').slice(0, 12); return d ? Number(d).toLocaleString('ko-KR') : ''; };
const DateInput = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => <input aria-label={label} type="datetime-local" className="field" value={value} onChange={e => onChange(e.target.value)}/>;

function DefinitionSheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<DefinitionForm>(DEFAULT_DEFINITION), [errors, setErrors] = useState<Record<string, string>>({}), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const set = (v: Partial<DefinitionForm>) => { setF(x => ({ ...x, ...v })); setErrors(e => { const n = { ...e }; for (const k of Object.keys(v)) { delete n[k]; delete n[k === 'rate' ? 'rateBps' : k === 'validDays' ? 'validMinutes' : k === 'noticeHours' ? 'noticeLeadMinutes' : k]; } return n; }); };
  const submit = async () => {
    if (busy) return; setMessage('');
    const r = definitionRequest(f); setErrors(r.errors); if (!r.body) return;
    setBusy(true);
    try { await createCouponDefinition(r.body); toast('쿠폰 정의를 만들었어요.'); onCreated(); onClose(); }
    catch (e) { const x = adminCouponError(e, 'definition'); setErrors(x.fields); setMessage(x.message); }
    finally { setBusy(false); }
  };
  return <Modal title="쿠폰 정의 만들기" onClose={onClose}>
    <div className="space-y-5">
      <Field label="이름" required error={errors.name}><UnitInput label="이름" numeric={false} value={f.name} onChange={v => set({ name: v.slice(0, 60) })} placeholder="예: 회원 전용 3,000원 쿠폰" error={errors.name}/></Field>
      <Field label="할인 방식"><div className="flex gap-2"><Chip selected={f.discountType === 'AMOUNT'} onClick={() => set({ discountType: 'AMOUNT' })}>정액</Chip><Chip selected={f.discountType === 'RATE'} onClick={() => set({ discountType: 'RATE' })}>정률</Chip></div></Field>
      {f.discountType === 'AMOUNT'
        ? <Field label="할인 금액" required error={errors.amount}><UnitInput label="할인 금액" unit="원" value={amountText(f.amount)} onChange={v => set({ amount: v })} placeholder="3,000" error={errors.amount}/></Field>
        : <div className="grid grid-cols-2 gap-3">
          <Field label="할인율" required error={errors.rateBps}><UnitInput label="할인율" unit="%" value={f.rate} onChange={v => set({ rate: v.replace(/[^\d.]/g, '').slice(0, 6) })} placeholder="10" error={errors.rateBps}/></Field>
          <Field label="최대 할인" required error={errors.maxDiscount}><UnitInput label="최대 할인" unit="원" value={amountText(f.maxDiscount)} onChange={v => set({ maxDiscount: v })} placeholder="3,000" error={errors.maxDiscount}/></Field>
        </div>}
      <Field label="최소 상품 금액" hint="비우면 0원으로 저장돼요." error={errors.minItemsAmount}><UnitInput label="최소 상품 금액" unit="원" value={amountText(f.minItemsAmount)} onChange={v => set({ minItemsAmount: v })} placeholder="0" error={errors.minItemsAmount}/></Field>
      <Field label="적용 범위" hint={f.scope === 'ALL' ? '받기형, 회원 쿠폰 캠페인에 써요.' : '맞춤형 캠페인에 써요. 대상 상품은 맞춤 이벤트가 정해요.'}><div className="flex gap-2"><Chip selected={f.scope === 'ALL'} onClick={() => set({ scope: 'ALL' })}>전체 상품</Chip><Chip selected={f.scope === 'PRODUCT'} onClick={() => set({ scope: 'PRODUCT' })}>특정 상품</Chip></div></Field>
      <Field label="사용 기간"><div className="flex gap-2"><Chip selected={f.validityMode === 'FIXED'} onClick={() => set({ validityMode: 'FIXED' })}>고정 기간</Chip><Chip selected={f.validityMode === 'RELATIVE'} onClick={() => set({ validityMode: 'RELATIVE' })}>발급 후 기간</Chip></div></Field>
      {f.validityMode === 'RELATIVE'
        ? <Field label="발급 후" hint="분 단위로 바꿔서 저장해요." error={errors.validMinutes}><UnitInput label="발급 후 사용 기간" unit="일" value={f.validDays} onChange={v => set({ validDays: v.replace(/[^\d]/g, '').slice(0, 4) })} placeholder="30" error={errors.validMinutes}/></Field>
        : <>
          <Field label="사용 시작" required error={errors.validFrom}><DateInput label="사용 시작" value={f.validFrom} onChange={v => set({ validFrom: v })}/></Field>
          <Field label="사용 끝" required error={errors.validUntil}><DateInput label="사용 끝" value={f.validUntil} onChange={v => set({ validUntil: v })}/></Field>
        </>}
      <Field label="만료 알림" error={errors.noticeLeadMinutes}><UnitInput label="만료 알림" unit="시간 전" value={f.noticeHours} onChange={v => set({ noticeHours: v.replace(/[^\d]/g, '').slice(0, 4) })} placeholder="비우면 24시간 전" error={errors.noticeLeadMinutes}/></Field>
      <p className="muted text-caption leading-relaxed">한 번 만든 정의는 고치지 않아요. 조건을 바꾸려면 종료하고 새로 만들어요.</p>
      <ErrorBox message={message}/>
      <div className="space-y-2"><Button className="w-full" disabled={busy} onClick={() => void submit()}>{busy ? '만드는 중…' : '만들기'}</Button><Button outline closeSheet className="w-full">취소</Button></div>
    </div>
  </Modal>;
}

const KINDS: CampaignKind[] = ['CLAIM', 'TARGETED', 'MEMBER'];
function CampaignSheet({ definitions, definitionsLoading, onClose, onCreated }: { definitions: CouponDefinitionDto[]; definitionsLoading: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<CampaignForm>(() => { const now = Date.now(); return { kind: 'CLAIM', definitionId: '', ruleCode: '', code: '', totalBudget: '', startsAt: localInput(now), endsAt: localInput(now + 30 * 86_400_000), demo: false }; });
  const [errors, setErrors] = useState<Record<string, string>>({}), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const set = (v: Partial<CampaignForm>) => {
    const codeChanged = 'kind' in v || 'ruleCode' in v || 'demo' in v;
    setF(x => {
      const next = { ...x, ...v };
      if ('kind' in v) next.demo = false;
      if (next.kind === 'TARGETED') next.code = next.ruleCode ? next.ruleCode + (next.demo ? '_DEMO' : '_NORMAL') : '';
      else if ('kind' in v) next.code = '';
      return next;
    });
    setErrors(e => { const n = { ...e }; for (const k of Object.keys(v)) delete n[k]; if (codeChanged) delete n.code; return n; });
  };
  const options = definitionsFor(f.kind, definitions);
  const radio = (on: boolean) => <span className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${on ? 'border-ink bg-ink' : 'border-line'}`}/>;
  const submit = async () => {
    if (busy) return; setMessage('');
    const r = campaignRequest(f, definitions); setErrors(r.errors); if (!r.body) return;
    setBusy(true);
    try { await createCampaign(r.body); toast('캠페인을 만들었어요. 활성화하면 발급을 시작해요.'); onCreated(); onClose(); }
    catch (e) { const x = adminCouponError(e, 'campaign'); setErrors(x.fields); setMessage(x.message); }
    finally { setBusy(false); }
  };
  return <Modal title="캠페인 만들기" onClose={onClose}>
    <div className="space-y-5">
      <Field label="종류" hint={f.kind === 'CLAIM' ? '링크(?campaign=코드)로 들어온 구매자가 직접 받아요.' : f.kind === 'MEMBER' ? '멤버십 결제가 될 때마다 회원에게 자동으로 발급돼요.' : 'AI 대상 이벤트(규칙)가 오면 그 상품용 쿠폰을 발급해요.'}>
        <div className="flex flex-wrap gap-2">{KINDS.map(k => <Chip key={k} selected={f.kind === k} onClick={() => set({ kind: k, definitionId: '', ruleCode: k === 'TARGETED' ? f.ruleCode : '' })}>{KIND_LABEL[k]}</Chip>)}</div>
      </Field>
      <Field label="쿠폰 정의" required error={errors.definitionId}>
        {definitionsLoading ? <p className="muted py-3 text-label">불러오는 중이에요…</p> : options.length
          ? <div role="radiogroup" aria-label="쿠폰 정의">{options.map(d => <button key={d.id} type="button" role="radio" aria-checked={f.definitionId === d.id} onClick={() => set({ definitionId: d.id })} className="divider flex w-full items-start gap-3 py-3 text-left">{radio(f.definitionId === d.id)}<div className="min-w-0 flex-1"><p className="break-all text-body font-semibold">{d.name} · {couponDiscountLabel(d)}</p><p className="muted mt-1 text-footnote">{couponConditionLabel(d)} · 버전 {d.version}</p></div></button>)}</div>
          : <p className="muted py-3 text-label leading-relaxed">{f.kind === 'TARGETED' ? '특정 상품' : '전체 상품'} 범위의 사용 중인 정의가 없어요. 쿠폰 정의 탭에서 먼저 만들어 주세요.</p>}
      </Field>
      {f.kind === 'TARGETED' && <Field label="맞춤 규칙" required error={errors.ruleCode}><div className="flex flex-wrap gap-2">{RULES.map(r => <Chip key={r} selected={f.ruleCode === r} onClick={() => set({ ruleCode: r })}>{RULE_LABEL[r]}</Chip>)}</div></Field>}
      <Field label="캠페인 코드" required hint={f.kind === 'TARGETED' ? '맞춤형은 AI가 이 코드로 쿠폰을 요청해서 자동으로 정해져요.' : '영문 대문자, 숫자, 밑줄(_) 40자까지. 받기형은 링크에 그대로 써요.'} error={errors.code}><UnitInput label="캠페인 코드" numeric={false} readOnly={f.kind === 'TARGETED'} value={f.code} onChange={v => set({ code: v.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 40) })} placeholder={f.kind === 'MEMBER' ? '예: MEMBER_MONTHLY' : f.kind === 'TARGETED' ? '예: SALE_OPEN_DEMO' : '예: WELCOME_1000'} error={errors.code}/></Field>
      <Field label="예산" required hint="발급할 총 장수예요. 1인 한도는 1장이에요." error={errors.totalBudget}><UnitInput label="예산" unit="장" value={amountText(f.totalBudget)} onChange={v => set({ totalBudget: v })} placeholder="1,000" error={errors.totalBudget}/></Field>
      <Field label="시작" required error={errors.startsAt}><DateInput label="캠페인 시작" value={f.startsAt} onChange={v => set({ startsAt: v })}/></Field>
      <Field label="끝" required error={errors.endsAt}><DateInput label="캠페인 끝" value={f.endsAt} onChange={v => set({ endsAt: v })}/></Field>
      {f.kind === 'TARGETED' && <div className="flex items-center justify-between gap-4"><div><p className="text-body">시연용</p><p className="muted mt-1 text-caption leading-relaxed">켜면 시연 이벤트와 허용된 시연 계정에만 발급돼요.</p></div><Toggle label="시연용" checked={f.demo} onChange={v => set({ demo: v })}/></div>}
      <p className="muted text-caption leading-relaxed">만들면 준비 상태예요. 목록에서 활성화해야 발급을 시작해요.</p>
      <ErrorBox message={message}/>
      <div className="space-y-2"><Button className="w-full" disabled={busy} onClick={() => void submit()}>{busy ? '만드는 중…' : '만들기'}</Button><Button outline closeSheet className="w-full">취소</Button></div>
    </div>
  </Modal>;
}
