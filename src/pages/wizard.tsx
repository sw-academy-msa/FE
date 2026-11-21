import { useEffect, useRef, useState } from 'react';
import { CompositionInput } from '../components/CompositionInput';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import type { ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Calendar, Check, ChevronDown, ChevronRight, Hash, Image as ImageIcon, Info, Link2, Minus, Package, Plus, ShieldCheck, Sparkles, Timer, X } from 'lucide-react';
import { activeUser, blankDraft, listingDimensions, listingOptions, localDateTime, lookupReference, mockAiAnalysis, money, nowOf, publishDraft, unsupportedInput, OPTION_DIM_MAX, OPTION_TEXT_MAX, comboKey, comboLabel, optionCombos, optionModel, optionNameProblem } from '../domain';
import type { AiQuestion, Draft, OptionDim, Product } from '../domain';
import type { RegistrationMetadataDto } from '../api/types';
import { atomic, getState, mutate, useStore } from '../store';
import { imageData } from '../files';
import { Button, Empty, ErrorBox, Header, LiveStatus, Modal, Note, ProductImage, Unavailable, useLeaveGuard, useToast } from '../components/ui';
import { useClock } from '../hooks';
import { categoryTree } from '../categoryTree';
import { INSPECTION_CHECKS, INSPECTION_PHOTOS, analysisInputOf, analysisStale, aiResultPatch } from '../domain';
import { kstTime } from './checkoutExpired';
import { IMAGE_EXPIRED, QUICK_SCHEDULE, USE_MOCK } from '../config';
import { AiDelayedError } from '../api/sellerProducts';
import { parseServerTime } from '../api';
import { getProductImageUrl, FIELD_LABELS, REVISION_FIELDS, StageError, sourceUrlProblem, MOCK_REGISTRATION_METADATA, PRODUCT_STATE_MESSAGE, SHIPPING_NOTICE_MAX, ATTRIBUTE_VALUE_MAX, attributeName, composeShippingNotice, warnCriteria, analysisProblems, analyzeDraft, criteriaFor, listAddressBook, listingProblems, createProductDraft, deleteProductImage, errorMessage, fieldErrors, isApiError, getRegistrationMetadata, getSellerProductWithImages, mergeProducts, reorderProductImages, submitListing, submitRevisionFromDraft, uploadProductImage, useApi, useLive } from '../api';

/* ── 초안 ─────────────────────────────────────────────────────────────────────── */
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
/** 저장된 상품 → 초안. 옵션 단계는 서버 optionDimensions 이름과 값 그대로(예전 색상 x 사이즈 상품도 같은 이름으로 열린다) */
function fromProduct(p: Product): Draft {
  const split = (v?: string) => (v ?? '').split(',').map(x => x.trim()).filter(Boolean);
  const basic = p.options.length === 1 && p.options[0].name === '기본';
  // 서버 조합 이름은 값 안의 '/'와 역슬래시를 역슬래시로 이스케이프하고 ' / '로 잇는다
  const parts = (label: string) => label.split(' / ').map(x => x.replace(/\\(.)/g, '$1'));
  let optionDims = basic ? [] : p.dimensions.map(x => ({ name: x.name, values: split(x.values) })).filter(x => x.values.length);
  if (!basic && !optionDims.length && p.options.length) optionDims = [{ name: '옵션', values: p.options.map(o => parts(o.name).join(' / ')) }];
  const stock: Record<string, number> = {};
  for (const o of p.options) stock[comboKey(basic ? [] : optionDims.length === 1 ? [parts(o.name).join(' / ')] : parts(o.name))] = o.stock;
  return { ...blankDraft(), editingId: p.id, editingVersion: p.version, name: p.name, brand: p.brand, description: p.description, images: [...p.images], imageIds: p.imageIds && [...p.imageIds], imageSizes: p.imageSizes && [...p.imageSizes], category: p.category, originalUrl: p.originalUrl, extras: structuredClone(p.extras), reason: p.reason, dimensions: structuredClone(p.dimensions), noOptions: basic, options: p.options.map(o => ({ ...o, name: basic ? o.name : parts(o.name).join(' / ') })), price: p.price, shipping: p.shipping, shippingNotice: p.shippingNotice ?? '', dispatchDays: p.dispatchDays, maxPerAccount: p.maxPerAccount, startsAt: p.startsAt ? localDateTime(p.startsAt) : blankDraft().startsAt, faqs: structuredClone(p.faqs), optionDims, stock, reference: p.reference ?? lookupReference(p.originalUrl) };
}
function freshDraft(now: number): Draft { const start = new Date(now + 3_600_000); start.setMinutes(0, 0, 0); return { ...blankDraft(now), startsAt: localDateTime(start.getTime()), optionDims: [], stock: {} }; }
/** 초안 변경 — options·dimensions를 항상 옵션 단계와 수량에서 다시 계산. 예전 구조(색상 x 사이즈) 초안은 처음 고칠 때 같은 이름과 수량의 새 구조로 바꾼다 */
function patchDraft(userId: string, value: Partial<Draft>) {
  mutate(state => {
    const d = state.drafts[userId] ?? freshDraft(nowOf(state));
    if (!d.optionDims) { const m = optionModel(d); d.optionDims = m.dims; d.stock = m.stock; delete d.axes; delete d.sizeName; delete d.colors; delete d.sizes; }
    Object.assign(d, value);
    d.options = listingOptions(d); d.dimensions = listingDimensions(d); d.noOptions = !d.optionDims?.length;
    state.drafts[userId] = d;
  });
}
/**
 * 수정할 수 없는 이유(null = 수정 가능). 실제 API는 서버 status로 판단: DRAFT·REJECTED는 항상(반려 → 수정 → 재심사 요청),
 * APPROVED는 판매 시작(startsAt, UTC epoch) 전만 수정 심사, IN_REVIEW는 불가. mock은 판매 시작 전.
 */
export function editBlocker(p: Pick<Product, 'reviewStatus' | 'startsAt'>, now: number): string | null {
  switch (p.reviewStatus) {
    case 'DRAFT': case 'REJECTED': return null;
    case 'IN_REVIEW': return '심사 중에는 정보를 수정할 수 없어요';
    case 'APPROVED': return now < p.startsAt ? null : '판매 시작 후에는 정보를 수정할 수 없어요';
    case undefined: return now < p.startsAt ? null : '판매 시작 후에는 정보를 수정할 수 없어요';
    default: return '지금은 정보를 수정할 수 없어요';
  }
}
const canEdit = (p: Product, now: number) => !editBlocker(p, now);
/** 실제 모드: 서버 초안 상품이 없으면 만든다(사진 업로드·AI 분석 전에 상품 id가 필요) */
const creating = new Map<string, Promise<string>>();
async function ensureServerDraft(userId: string): Promise<string> {
  const d = getState().drafts[userId], id = d?.editingId ?? d?.serverId;
  if (id) return id;
  // 사진 업로드와 분석이 겹쳐도 초안은 하나만 만든다
  const running = creating.get(userId); if (running) return running;
  const p = createProductDraft().then(x => { patchDraft(userId, { serverId: x.id }); return x.id; }).finally(() => creating.delete(userId));
  creating.set(userId, p); return p;
}
/** 등록 메타데이터(허용 카테고리·점검 기준). 한 번 받아 두고 같이 쓴다. mock은 같은 모양의 목업 */
let metaCache: Promise<RegistrationMetadataDto> | undefined;
const loadMeta = () => (metaCache ??= (USE_MOCK ? Promise.resolve(MOCK_REGISTRATION_METADATA) : getRegistrationMetadata().then(m => { warnCriteria(m); return m; })).catch(e => { metaCache = undefined; throw e; }));
export const useRegistrationMeta = () => useApi(() => loadMeta(), []);

export const AI_MESSAGES = {
  NOT_APPLICABLE: '판매 가능한 분류(의류·패션잡화·문구·생활잡화)에 속하지 않는 상품으로 보여요. 사진을 바꾸거나 카테고리를 직접 선택해 주세요',
  UNCLEAR: '사진이 선명하지 않아 판단하지 못했어요. 상품이 잘 보이는 사진으로 바꿔 주세요',
  NO_CATEGORY: 'AI가 추천한 분류를 등록 카테고리에서 찾지 못했어요. 카테고리를 직접 선택해 주세요',
};
/** 분석 결과(outcome) → 초안 AI 상태. NOT_APPLICABLE·UNCLEAR는 실패가 아니라 안내(등록 화면 카테고리 칸 위에 표시) */
export function aiStateOf(token: string, r: { outcome: string; code: string; category: string; questions: AiQuestion[] }, photos: number): Draft['ai'] {
  const base = { signature: token, category: '', reason: '' };
  if (r.outcome === 'RECOMMENDED' && r.category) return { ...base, status: 'recommended', result: { code: r.code, category: r.category, photos, questions: r.questions } };
  return { ...base, status: 'uncertain', reason: r.outcome === 'NOT_APPLICABLE' ? AI_MESSAGES.NOT_APPLICABLE : r.outcome === 'UNCLEAR' ? AI_MESSAGES.UNCLEAR : AI_MESSAGES.NO_CATEGORY };
}
/** 실제 모드 AI 분석: 서버에 기본 정보 저장 → 분석 요청 → 폴링. 결과가 오면(화면을 떠났어도) 초안에 반영 */
async function analyzeReal(userId: string, token: string, prev: AiQuestion[]) {
  // 결과가 오면 예전 질문에 쓴 답을 같은 점검 항목의 새 질문으로 옮긴다(옮길 곳이 없는 답은 지운다)
  // 실패·지연이면 직전 질문을 계속 보관해 다음 재시도에서도 답을 옮길 수 있게 한다
  const done = (ai: Draft['ai']) => { const d = getState().drafts[userId]; if (d && d.ai.status === 'analyzing' && d.ai.signature === token) patchDraft(userId, aiResultPatch(d, ai, prev)); }; // 결과는 기다리지 않고 바로 반영(이 분석이 아직 진행 중일 때 한 번만)
  const failed: Draft['ai'] = { status: 'failed', signature: token, category: '', reason: '' };
  try {
    const id = await ensureServerDraft(userId), d = getState().drafts[userId];
    const track = (r: { status: string; attempts: number; nextAttemptAt: string | null }) => { const cur = getState().drafts[userId]; if (cur && cur.ai.status === 'analyzing' && cur.ai.signature === token) patchDraft(userId, { ai: { ...cur.ai, retry: r.status === 'RETRY' ? { attempts: r.attempts, nextAttemptAt: r.nextAttemptAt } : undefined } }); };
    done({ ...aiStateOf(token, await analyzeDraft(d, id, { onProgress: track }), d.images.length), input: analysisInputOf(d) });
  } catch (e) {
    // 3분이 지나도 끝나지 않으면 실패가 아니다(서버는 계속 분석한다) — "다시 확인"으로 같은 입력으로 다시 요청하면 기존 결과가 온다
    if (e instanceof AiDelayedError) { done({ status: 'delayed', signature: token, category: '', reason: e.message }); return; }
    done({ ...failed, reason: isApiError(e, 'PRODUCT_STATE') ? PRODUCT_STATE_MESSAGE : errorMessage(e), fields: e instanceof StageError && Object.keys(e.fields).length ? e.fields : undefined }); }
}
/** 화면을 떠나도 계속되는 AI 분석(mock은 목업) */
const ANALYSIS_MS = 2500;
function startAnalysis(userId: string) {
  // 실제 모드: 진행 중인 분석이 있으면 새로 시작하지 않는다(같은 초안에 저장·요청이 겹치면 version만 오른다)
  if (!USE_MOCK && getState().drafts[userId]?.ai.status === 'analyzing') return;
  const cur = getState().drafts[userId]?.ai, token = Date.now().toString(36), prev = cur?.result?.questions ?? cur?.prev ?? [];
  patchDraft(userId, { ai: { status: 'analyzing', signature: token, category: '', reason: '', prev } });
  if (!USE_MOCK) { void analyzeReal(userId, token, prev); return; }
  setTimeout(() => {
    const state = getState(), d = state.drafts[userId];
    if (!d || d.ai.status !== 'analyzing' || d.ai.signature !== token) return;
    // 미리보기 도구의 AI 결과 선택: uncertain = UNCLEAR, unsupported = NOT_APPLICABLE, failed = 요청 실패
    if (state.aiOutcome === 'failed' || !d.images.length) { patchDraft(userId, { ai: { status: 'failed', signature: token, category: '', reason: '' } }); return; }
    const r = mockAiAnalysis(d), outcome = state.aiOutcome === 'uncertain' ? 'UNCLEAR' : state.aiOutcome === 'unsupported' ? 'NOT_APPLICABLE' : 'RECOMMENDED';
    const ai = { ...aiStateOf(token, { ...r, outcome }, d.images.length), input: analysisInputOf(d) };
    patchDraft(userId, aiResultPatch(d, ai, prev));
  }, ANALYSIS_MS);
}
function useDraft() {
  const s = useStore(), user = activeUser(s); const [params] = useSearchParams(); const editId = params.get('edit');
  useEffect(() => {
    if (!user.seller) return;
    mutate(state => {
      const existing = state.drafts[user.id];
      if (editId) { if (USE_MOCK && existing?.editingId !== editId) { const p = state.products.find(p => p.id === editId && p.sellerId === user.id); if (p && nowOf(state) < p.startsAt) state.drafts[user.id] = fromProduct(p); } }
      else if (!existing || existing.editingId) state.drafts[user.id] = freshDraft(nowOf(state));
      else if (!existing.axes && !existing.optionDims) state.drafts[user.id] = { ...existing, optionDims: [], stock: {} };
    });
  }, [editId, user.id, user.seller]);
  const d = s.drafts[user.id];
  const suffix = editId ? `?edit=${encodeURIComponent(editId)}` : '';
  return { s, user, editId, d, suffix, patch: (v: Partial<Draft>) => patchDraft(user.id, v) };
}

/* ── 공통 조각 ──────────────────────────────────────────────────────────────────── */
const Label = ({ children, hint }: { children: ReactNode; hint?: string }) => <p className="text-body font-bold">{children}{hint && <span className="ml-1.5 text-footnote font-normal text-meta">{hint}</span>}</p>;
function Stepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return <div className="flex h-8 items-center rounded-element border border-border"><button type="button" aria-label={`${label} 감소`} disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))} className="grid h-8 w-9 place-items-center disabled:opacity-30"><Minus size={14}/></button><input aria-label={`${label} 수량`} inputMode="numeric" value={value} onChange={e => onChange(Math.max(0, Math.floor(Number(e.target.value.replace(/\D/g, '')) || 0)))} className="w-9 bg-transparent text-center text-callout font-bold outline-none"/><button type="button" aria-label={`${label} 증가`} onClick={() => onChange(value + 1)} className="grid h-8 w-9 place-items-center"><Plus size={14}/></button></div>;
}
function InlineAdd({ label, onAdd, className = '', maxLength }: { label: string; onAdd: (v: string) => void; className?: string; maxLength?: number }) {
  const [open, setOpen] = useState(false), [value, setValue] = useState('');
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={`flex items-center gap-1 text-body text-aux ${className}`}><Plus size={14}/>{label}</button>;
  const submit = () => { if (value.trim()) onAdd(value.trim()); setValue(''); setOpen(false); };
  return <input autoFocus aria-label={label} maxLength={maxLength} value={value} onChange={e => setValue(e.target.value)} onBlur={submit} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } if (e.key === 'Escape') setOpen(false); }} className={`h-9 rounded-element border border-border px-3 text-body outline-none ${className}`} placeholder={label}/>;
}
/** 눌러서 고치는 글자(옵션 이름과 값). onSave가 false면(규칙 위반) 입력을 닫지 않는다 */
function EditText({ value, label, onSave, className = '' }: { value: string; label: string; onSave: (v: string) => boolean; className?: string }) {
  const [edit, setEdit] = useState<string | null>(null);
  if (edit === null) return <button type="button" aria-label={`${label} 고치기`} onClick={() => setEdit(value)} className={`text-left ${className}`}>{value}</button>;
  const done = () => { if (edit.trim() === value || onSave(edit)) setEdit(null); };
  return <input autoFocus aria-label={`${label} 고치기`} maxLength={OPTION_TEXT_MAX} value={edit} onChange={e => setEdit(e.target.value)} onBlur={done} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); done(); } if (e.key === 'Escape') setEdit(null); }} className="h-8 w-32 min-w-0 rounded-element border border-border px-2 text-body outline-none"/>;
}
const dateLabel = (v: string) => { const t = new Date(v); return Number.isFinite(t.getTime()) ? `${t.getMonth() + 1}월 ${t.getDate()}일 (${WEEK[t.getDay()]})` : '날짜 선택'; };
const hhmm = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
const SALE_MS = 3 * 3_600_000;
/* 판매 등록 단계. AI 분석은 사진, 상품명, 짧은 설명, 처분 사유가 있어야 하고 결과가 카테고리와 상품 정보 칸을 정하므로 1단계에 분석까지, 2단계에 카테고리를 둔다 */
const STEP_TITLES = ['사진과 기본 정보', '카테고리와 상품 정보', '가격과 수량', '일정과 배송', '확인과 심사 요청'] as const;
const STEPS = STEP_TITLES.length;
/** 검사 칸 → 그 칸이 있는 단계. 목록에 없는 칸은 마지막(확인) 단계 */
const FIELD_STEP: Record<string, number> = { images: 1, name: 1, description: 1, disposalReason: 1, state: 1, brandOrStore: 1, category: 2, attributes: 2, sourceUrl: 3, price: 3, options: 3, maxPerAccount: 3, startsAt: 4, dispatchDays: 4, shipping: 4, shippingNotice: 4, addresses: 4, aiQuestions: 5, inspection: 5 };
const stepOf = (field: string) => FIELD_STEP[field] ?? STEPS;
/** 등록 화면의 n단계 주소(AI 분석 화면에서 돌아올 때) */
/** AI 분석 화면에서 등록 2단계로 돌아갈 때: 1단계에서 분석을 시작했으면 분석 화면 자리를 2단계로 바꾸고(뒤로 가면 1단계), 2단계에서 열었으면 기록을 되돌린다 */
const WIZARD_STATE = { wizardStep: true };
const stepUrl = (suffix: string, n: number, extra = '') => `/seller/new${suffix}${suffix ? '&' : '?'}step=${n}${extra}`;
const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => hhmm(Math.floor(i / 2), i % 2 * 30));

/* ── 판매 상품 등록 / 판매 정보 수정 ─────────────────────────────────────────────── */
export function WizardPage() {
  const { s, user, editId, d, suffix, patch } = useDraft(); const now = useClock(); const navigate = useNavigate(); const [params, setParams] = useSearchParams(); const toast = useToast();
  // 실제 모드: 수정할 상품의 편집 원본·이미지를 서버에서 받아 초안으로 만든다(mock은 store 상품으로 useDraft가 만든다)
  const live = useLive(async signal => (editId ? getSellerProductWithImages(editId, signal) : null), (st, p) => {
    if (!p) return;
    mergeProducts(st, [p]);
    const m = st.products.find(x => x.id === p.id)!;
    if (canEdit(m, nowOf(st))) st.drafts[user.id] = fromProduct(m);
  }, [editId]);
  const [error, setError] = useState(''), [uploading, setUploading] = useState(false), [progress, setProgress] = useState(''), [photoError, setPhotoError] = useState(''), [retryFiles, setRetryFiles] = useState<File[]>([]), [fieldErr, setFieldErr] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [photo, setPhoto] = useState<number | null>(null), [optErr, setOptErr] = useState(''), [dropDim, setDropDim] = useState<number | 'all' | null>(null);
  const picking = params.get('pick') === 'category', meta = useRegistrationMeta();
  // 초안 사진은 5분짜리 임시 주소라 시간이 지나면 깨진다 → 서버에서 열람 주소를 새로 받아 바꾼다
  const imgIds = d?.imageIds?.join(','), imgOwner = d?.editingId ?? d?.serverId, lastImg = useRef(0);
  useEffect(() => {
    if (USE_MOCK || !imgOwner || !imgIds) return;
    const on = () => { if (Date.now() - lastImg.current < 15_000) return; lastImg.current = Date.now(); const ids = imgIds.split(','); Promise.all(ids.map(i => getProductImageUrl(imgOwner, i).catch(() => ''))).then(urls => { const cur = getState().drafts[user.id]; if (cur?.imageIds?.join(',') === imgIds) patch({ images: urls.map((u, k) => u || cur.images[k]) }); }); };
    window.addEventListener(IMAGE_EXPIRED, on); return () => window.removeEventListener(IMAGE_EXPIRED, on);
  }, [imgOwner, imgIds]);
  // AI 분석이 저장·조건 단계에서 막혔으면 해당 칸 아래에 표시한다
  const aiFields = d?.ai.status === 'failed' ? d.ai.fields : undefined;
  useEffect(() => { if (aiFields) setFieldErr(aiFields); }, [aiFields && JSON.stringify(aiFields)]);
  // 칸 아래 오류는 그 칸을 고치면 바로 지운다(아래 render에서 recheck를 채운다)
  const recheck = useRef<(() => void) | null>(null);
  // 단계 위치(wizardStep)만 바뀐 것은 입력이 바뀐 것이 아니라 오류를 다시 보지 않는다(서버가 준 칸 오류를 단계를 옮기며 지우지 않게)
  const draftCore = d ? JSON.stringify({ ...d, wizardStep: undefined }) : '';
  useEffect(() => { recheck.current?.(); }, [draftCore]);
  // 출고지·반품지: 실제 모드는 판매자 주소록, mock은 판매자 설정의 주소
  const book = useApi(async signal => (USE_MOCK ? null : Promise.all([listAddressBook('DISPATCH', signal), listAddressBook('RETURN', signal)])), []);
  // 작성 중: 이 화면을 연 뒤 초안(상품 정보, 사진 수, 옵션, 판매 조건, FAQ 등)이 처음과 달라졌을 때. 처음 값은 초안이 준비된 때(수정은 서버 원본을 받은 뒤) 잡는다.
  // 등록 흐름 안의 이동(AI 분석, 카테고리 고르기)은 막지 않는다. 새 등록 초안은 이 기기에 저장돼 다시 열면 이어지고, 수정은 다시 열면 원본을 새로 받는다
  const ready = !!d && !!(d.optionDims || d.axes) && (!editId || d.editingId === editId) && (!editId || USE_MOCK || (!live.loading && !live.error));
  const signature = d ? JSON.stringify({ ...d, ai: undefined, images: d.images.length, imageSizes: undefined, step: undefined, wizardStep: undefined }) : '';
  const draftKey = editId ?? 'new';
  const [opened, setOpened] = useState<{ key: string; signature: string } | null>(null);
  useEffect(() => { if (ready && opened?.key !== draftKey) setOpened({ key: draftKey, signature }); }, [ready, draftKey]);
  const leave = useLeaveGuard(opened?.key === draftKey && signature !== opened.signature, { allow: p => p.startsWith('/seller/new'), message: editId ? undefined : '작성한 내용은 이 기기에 임시 저장돼서 다시 판매 등록을 열면 이어서 쓸 수 있어요.' });
  // 단계: 주소(?step=)에 남겨 휴대폰 뒤로 가기가 이전 단계로 간다. 단계 사이 이동은 같은 화면이라 나가기 확인창을 띄우지 않는다
  const location = useLocation();
  const stepParam = Number(params.get('step')), step = Number.isInteger(stepParam) && stepParam >= 1 && stepParam <= STEPS ? stepParam : 1;
  const resumed = useRef(false), focusAfterStep = useRef<string | null>(null);
  // 카테고리 시트: 주소의 ?pick=category(분석 화면의 직접 입력 등)는 먼저 주소에서 지운 뒤 시트를 연다. 시트는 자기 기록을 따로 쌓아 뒤로 가기로 닫히고, 단계 기록은 그대로 남는다
  const [pickerOpen, setPickerOpen] = useState(false), pendingPick = useRef(false);
  useEffect(() => {
    if (picking) { pendingPick.current = true; const next = new URLSearchParams(params); next.delete('pick'); setParams(next, { replace: true, state: location.state }); }
    else if (pendingPick.current) { pendingPick.current = false; setPickerOpen(true); }
  }, [picking]);
  // 다시 열면(주소에 단계가 없으면) 마지막으로 보던 단계부터, 그 뒤로는 지금 단계를 초안에 기억한다
  useEffect(() => {
    if (!ready || !d) return;
    if (!resumed.current) {
      resumed.current = true; const saved = d.wizardStep ?? 1;
      if (!params.get('step') && saved > 1 && saved <= STEPS) { const next = new URLSearchParams(params); next.set('step', String(saved)); setParams(next, { replace: true }); return; }
    }
    if (d.wizardStep !== step) patchDraft(user.id, { wizardStep: step });
  }, [ready, step]);
  // 단계가 바뀌면 맨 위에서 시작한다. 오류 칸으로 옮겨 온 경우는 그 칸으로 스크롤한다
  useEffect(() => {
    const field = focusAfterStep.current; focusAfterStep.current = null;
    if (!field) { window.scrollTo(0, 0); return; }
    const t = setTimeout(() => { const el = document.querySelector<HTMLElement>(`[data-field="${field}"]`); if (el) { el.scrollIntoView({ block: 'center' }); el.querySelector<HTMLElement>('input, textarea, select, button')?.focus({ preventScroll: true }); } });
    return () => clearTimeout(t);
  }, [step]);
  if (!user.seller) return <Unavailable message="승인된 판매자만 상품을 등록할 수 있습니다."/>;
  // 실제 모드: 소유권은 서버가 확인한다(상품 sellerId가 계정 id와 다를 수 있어 비교하지 않는다)
  const editing = editId ? s.products.find(p => p.id === editId && (!USE_MOCK || p.sellerId === user.id)) : undefined;
  // 실제 모드는 서버 편집 원본(status 포함)을 받기 전엔 판단하지 않는다(목록·알림에서 온 status 없는 상품으로 잘못 막던 문제)
  if (editId && !USE_MOCK && (live.loading || live.error || !editing?.reviewStatus)) return <LiveStatus state={live}/>;
  if (editId && (!editing || !canEdit(editing, now))) return <Empty title={editing ? editBlocker(editing, now)! : '상품을 찾을 수 없어요'}><Button to="/seller/products">상품 관리로</Button></Empty>;
  if (!d || !(d.optionDims || d.axes) || (editId && d.editingId !== editId)) return <LiveStatus state={live}/>;
  const { dims, stock } = optionModel(d), combos = optionCombos(dims);
  // 승인 상품 수정 심사: 설명·판매가·배송비·판매 시작·출고지·반품지만 바꾼다(REVISION_FIELDS). 상품명·사진은 읽기 전용, 나머지 칸은 숨긴다
  const revision = editing?.reviewStatus === 'APPROVED';
  const rejected = editing?.reviewStatus === 'REJECTED', startPassed = rejected && !(new Date(d.startsAt).getTime() > now);
  const setStock = (key: string, n: number) => patch({ stock: { ...stock, [key]: n } });
  // 점검 항목 입력은 attributes로 저장한다. 항목명은 질문 문장이 아니라 고정 표시명(구매자 상품 상세에 그대로 보인다)
  const setExtra = (key: string, value: string) => patch({ extras: d.extras.some(e => e.key === key) ? d.extras.map(e => e.key === key ? { ...e, value } : e) : [...d.extras.filter(e => e.key.trim()), { key, value }] });
  const criteria = meta.data ? criteriaFor(meta.data, d.category) : undefined, stale = analysisStale(d), questions = stale ? [] : (d.ai.result?.questions ?? []);
  // AI 질문 답은 상품 FAQ(question=AI 질문 원문, suggestionId)로 저장한다. 카테고리별 입력칸(categoryCriteria)은 attributes 그대로
  // AI 예상 답변은 확인 전 초안(confirmed=false)으로 채워 두고, 판매자가 고치거나 확인을 체크한 답만 FAQ로 저장한다
  const aiFaq = (q: AiQuestion) => d.faqs.find(f => f.suggestionId && f.suggestionId === (q.suggestionId ?? q.question));
  const setAiAnswer = (q: AiQuestion, answer: string, confirmed = true) => { const sid = q.suggestionId ?? q.question; patch({ faqs: d.faqs.some(f => f.suggestionId === sid) ? d.faqs.map(f => (f.suggestionId === sid ? { ...f, answer, confirmed } : f)) : [...d.faqs, { id: `faq-${sid}`, question: q.question, answer, confirmed, suggestionId: sid }] }); };
  const firstTotal = (v: string) => combos.filter(c => c[0] === v).reduce((n, c) => n + (stock[comboKey(c)] ?? 0), 0);
  const total = d.options.reduce((n, o) => n + o.stock, 0);
  const blocked = unsupportedInput(d.name, d.description);
  const reference = d.reference;
  const discount = reference && d.price > 0 && d.price < reference.price ? reference.price - d.price : 0;
  const start = new Date(d.startsAt), startOk = Number.isFinite(start.getTime());
  // 판매 기간은 시작부터 3시간 고정(endsAt = startsAt + 3시간, 서버가 계산). 날짜가 바뀌면 날짜도 보여 준다
  const end = new Date(start.getTime() + SALE_MS), endLabel = startOk ? `${end.getDate() !== start.getDate() ? `${dateLabel(localDateTime(end.getTime()))} ` : ''}${hhmm(end.getHours(), end.getMinutes())}` : '';
  const setDate = (date: string) => { if (!date) return; patch({ startsAt: `${date}T${startOk ? hhmm(start.getHours(), start.getMinutes()) : '21:00'}` }); };
  const setTime = (time: string) => patch({ startsAt: `${(startOk ? localDateTime(start.getTime()) : localDateTime(now)).slice(0, 10)}T${time}` });

  async function upload(picked: File[]) {
    // input.value를 비우면 FileList도 비워지므로 호출한 쪽에서 배열로 복사해 넘긴다
    if (!picked.length) return; setUploading(true); setPhotoError(''); setRetryFiles([]); let left = picked, started = false; // started: 형식 검사를 지나 실제 업로드 중 실패(같은 파일로 다시 시도 가능)
    try {
      if (d.images.length + picked.length > 10) throw new Error('상품 사진은 최대 10장까지 등록할 수 있습니다.');
      for (const f of picked) {
        if (/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name)) throw new Error(`${f.name}: HEIC는 올릴 수 없어요. JPG·PNG·WEBP로 바꿔 주세요.`);
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) throw new Error(`${f.name}: JPG·PNG·WEBP 이미지만 올릴 수 있어요.`);
        if (f.size < 1 || f.size > 10 * 1024 * 1024) throw new Error(`${f.name}: 사진은 10MB 이하여야 해요.`);
      }
      if (USE_MOCK) { const added = await Promise.all(picked.map(imageData)); patch({ images: [...d.images, ...added], imageSizes: [...(d.imageSizes ?? []), ...picked.map(f => f.size)] }); }
      else { // 실제 모드: 선택 즉시 초안 상품을 만들고 사진을 한 장씩 올린다(권한 발급 → S3 PUT → 완료 확인)
        setProgress('준비 중…');
        const id = await ensureServerDraft(user.id), images = [...d.images], ids = [...(d.imageIds ?? [])], sizes = [...(d.imageSizes ?? [])];
        for (const [n, f] of picked.entries()) {
          setProgress(`${n + 1}/${picked.length}장 올리는 중…`); left = picked.slice(n); started = true;
          const u = await uploadProductImage(id, f);
          // 미리보기는 고른 파일로 바로 보여 준다(서버 열람 주소는 올린 직후 잠시 열리지 않아 회색 칸으로 보였다).
          // 새로고침 등으로 이 미리보기가 사라지면 ProductImage가 알리고, 위 IMAGE_EXPIRED 처리에서 서버 주소로 바꾼다
          images.push(URL.createObjectURL(f)); ids.push(u.id); sizes.push(f.size); patch({ images: [...images], imageIds: [...ids], imageSizes: [...sizes] });
        }
      }
    }
    catch (e) { setPhotoError(errorMessage(e)); if (started) setRetryFiles(left); } finally { setUploading(false); setProgress(''); }
  }
  const serverId = d.editingId ?? d.serverId;
  /** 사진 삭제·대표 지정: 실제 모드는 서버에도 반영 */
  async function removePhoto(i: number) {
    try { if (!USE_MOCK && serverId && d.imageIds?.[i]) await deleteProductImage(serverId, d.imageIds[i]); patch({ images: d.images.filter((_, j) => j !== i), ...(d.imageIds ? { imageIds: d.imageIds.filter((_, j) => j !== i) } : {}), ...(d.imageSizes ? { imageSizes: d.imageSizes.filter((_, j) => j !== i) } : {}) }); }
    catch (e) { setPhotoError(errorMessage(e)); }
    setPhoto(null);
  }
  async function coverPhoto(i: number) {
    const ids = d.imageIds && [d.imageIds[i], ...d.imageIds.filter((_, j) => j !== i)];
    try { if (!USE_MOCK && serverId && ids) await reorderProductImages(serverId, ids, ids[0]); patch({ images: [d.images[i], ...d.images.filter((_, j) => j !== i)], ...(ids ? { imageIds: ids } : {}), ...(d.imageSizes ? { imageSizes: [d.imageSizes[i], ...d.imageSizes.filter((_, j) => j !== i)] } : {}) }); }
    catch (e) { setPhotoError(errorMessage(e)); }
    setPhoto(null);
  }
  function openCategory() {
    // 2단계에서 연 분석 화면은 돌아갈 때 기록을 되돌린다(fromStep)
    if (d.ai.status === 'analyzing') navigate(`/seller/new/ai/analyzing${suffix}`, { state: { fromStep: true } });
    else if (d.ai.status === 'failed' || d.ai.status === 'delayed') navigate(`/seller/new/ai/failed${suffix}`, { state: { fromStep: true } });
    else if (d.ai.result) navigate(`/seller/new/ai${suffix}`, { state: { fromStep: true } });
    else setPickerOpen(true);
  }
  /** 제출 전 검사(서버 규칙과 같다). 칸 이름 → 안내 문구 */
  function submitProblems() {
    const settings = s.sellerSettings[user.id];
    const problems = listingProblems(d, { categories: meta.data?.categories ?? [], now, dispatch: USE_MOCK ? !!settings?.shippingAddress : !!book.data?.[0].length, return: USE_MOCK ? !!settings?.returnAddress : !!book.data?.[1].length });
    if (!editId && (d.inspection?.length ?? 0) < INSPECTION_CHECKS.length) problems.inspection = '물품 검수 항목을 모두 확인해 주세요.';
    if (revision) for (const k of Object.keys(problems)) if (!(REVISION_FIELDS as readonly string[]).includes(k)) delete problems[k];
    return problems;
  }
  // 지금 보이는 오류 중 고쳐진 칸은 지운다. 모두 고쳐지면 위쪽 요약 오류도 지운다
  recheck.current = () => {
    const keys = Object.keys(fieldErr); if (!keys.length) return;
    const now = { ...analysisProblems(d, editing?.reviewStatus), ...submitProblems() };
    const left = keys.filter(k => k in now);
    if (left.length === keys.length) return;
    setFieldErr(Object.fromEntries(left.map(k => [k, fieldErr[k]])));
    if (!left.length) setError('');
  };
  /** 빠진 칸으로 스크롤하고 그 칸에 포커스 */
  function showProblems(f: Record<string, string>) {
    setFieldErr(f);
    // 오류 칸이 다른 단계에 있으면 그 단계로 옮겨 가서 표시한다
    const target = Object.keys(f)[0];
    if (target && stepOf(target) !== step) { focusAfterStep.current = target; goStep(stepOf(target)); return; }
    const first = target, el = first && document.querySelector<HTMLElement>(`[data-field="${first}"]`);
    if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.querySelector<HTMLElement>('input, textarea, select, button')?.focus({ preventScroll: true }); }
  }
  /** AI 분석 버튼: 조건이 빠졌으면 빠진 칸을 표시하고, 갖춰졌으면 분석을 시작한다 */
  function runAnalysis() {
    const f = analysisProblems(d, editing?.reviewStatus);
    if (Object.keys(f).length) { showProblems(f); return; }
    setFieldErr({}); startAnalysis(user.id); navigate(`/seller/new/ai/analyzing${suffix}`);
  }
  /** n단계로 간다(기록을 쌓아 뒤로 가기가 이 단계로 돌아온다) */
  function goStep(n: number, replace = false) { const next = new URLSearchParams(params); next.set('step', String(n)); next.delete('pick'); setParams(next, { replace, state: { wizardStep: true } }); }
  /** 다음: 이 단계 필수 칸만 검사하고 넘어간다 */
  function nextStep() {
    const p = Object.fromEntries(Object.entries(submitProblems()).filter(([k]) => stepOf(k) === step));
    if (Object.keys(p).length) { setError('빠진 정보를 확인해 주세요.'); showProblems(p); return; }
    setError(''); setFieldErr({}); goStep(step + 1);
  }
  /** 헤더 뒤로: 이전 단계(이 화면에서 넘어왔으면 기록을 되돌리고, 이어 쓰기로 바로 열었으면 이전 단계로 바꾼다). 1단계는 화면을 나간다 */
  const prevStep = step > 1 ? () => { if ((location.state as { wizardStep?: boolean } | null)?.wizardStep) navigate(-1); else goStep(step - 1, true); } : undefined;
  const closePicker = () => setPickerOpen(false);
  async function submit() {
    setError(''); setFieldErr({});
    // 서버는 업무 규칙 오류(PRODUCT_INVALID)에 violations를 주지 않으므로 제출 전에 같은 규칙으로 먼저 막는다
    const problems = submitProblems();
    if (Object.keys(problems).length) { showProblems(problems); setError('빠진 정보를 확인해 주세요.'); return; }
    setBusy(true);
    try {
      if (USE_MOCK) { const product = await atomic(state => publishDraft(state, state.activeUserId, state.drafts[state.activeUserId], nowOf(state))); leave.allowLeave(); navigate(`/seller/published/${product.id}`, { replace: true }); return; }
      // 실제 모드: 단계별 저장(버전 이어받기) 후 심사 제출. 승인 상품은 수정 심사 제출
      const id = await ensureServerDraft(user.id);
      // 주소록에서 지워진 주소 id는 보내지 않는다(생략하면 서버가 기본 주소를 쓴다)
      const valid = (v: string | undefined, list?: { id: string }[]) => (v && list?.some(a => a.id === v) ? v : undefined);
      const keep = criteria && new Set(criteria.checks.map(c => attributeName(c.code))); // 다른 카테고리 때 입력한 항목은 보내지 않는다
      const dd = { ...d, extras: keep ? d.extras.filter(e => keep.has(e.key)) : d.extras, dispatchAddressId: valid(d.dispatchAddressId, book.data?.[0]), returnAddressId: valid(d.returnAddressId, book.data?.[1]) };
      if (editing?.reviewStatus === 'APPROVED') { await submitRevisionFromDraft(dd, id); mutate(st => { delete st.drafts[user.id]; }); toast('수정 내용을 심사 요청했어요.'); leave.allowLeave(); navigate('/seller/products', { replace: true }); return; }
      const product = await submitListing(dd, id);
      mutate(st => { mergeProducts(st, [product]); delete st.drafts[user.id]; }); leave.allowLeave(); navigate(`/seller/published/${product.id}`, { replace: true });
    }
    catch (e) {
      const f = e instanceof StageError ? e.fields : fieldErrors(e);
      // 화면 검사를 통과했는데 PRODUCT_INVALID면 서버 값과 화면이 어긋난 것: 상품을 다시 받아 화면을 새로 그린다(검수 확인은 유지)
      if (!Object.keys(f).length && (isApiError(e, 'PRODUCT_INVALID') || e instanceof StageError && e.code === 'PRODUCT_INVALID') && serverId) {
        let reloaded = false;
        try {
          const fresh = await getSellerProductWithImages(serverId);
          mutate(st => { mergeProducts(st, [fresh]); const m = st.products.find(x => x.id === fresh.id)!; st.drafts[user.id] = { ...fromProduct(m), editingId: d.editingId, serverId: d.serverId, ai: d.ai, inspection: d.inspection }; });
          reloaded = true;
        } catch { /* 다시 받기 실패: 아래 안내 */ }
        setError(reloaded ? '심사 요청을 처리하지 못했어요. 저장된 정보로 화면을 새로 불러왔으니 내용을 확인한 뒤 다시 요청해 주세요.' : '심사 요청을 처리하지 못했어요. 잠시 후 다시 요청해 주세요. 계속되면 화면을 새로고침해 주세요.');
      } else if (revision && (isApiError(e, 'PRODUCT_STATE') || isApiError(e, 'COMMON_OPTIMISTIC_LOCK_CONFLICT'))) {
        // 편집을 시작한 뒤 상품이 바뀌었거나(다른 수정 승인 등) 이미 심사 중인 수정 요청이 있다. 입력한 내용은 그대로 둔다
        setError('편집하는 사이 상품 정보가 바뀌었거나 이미 심사 중인 수정 요청이 있어요. 상품 관리에서 최신 정보를 확인한 뒤 다시 수정해 주세요.');
      } else { showProblems(f); setError(errorMessage(e)); }
    } finally { setBusy(false); }
  }
  const FieldError = ({ name }: { name: string }) => fieldErr[name] ? <p role="alert" className="mt-1.5 text-label text-red">{fieldErr[name]}</p> : null;
  // 옵션 단계: 판매자가 '직접 추가'로 이름을 정하고 값을 넣는다. 이름과 값은 눌러서 고치고 X로 지운다
  const optCheck = (v: string, others: string[], what: string) => { const p = optionNameProblem(v, others, what); setOptErr(p); return !p; };
  const dimsWith = (i: number, f: (x: OptionDim) => OptionDim) => dims.map((x, j) => (j === i ? f(x) : x));
  // i단계 값을 바꾸거나(문자열) 지운(null) 조합의 수량을 옮긴다. 단계 수가 다른 예전 수량은 그대로 둔다
  const remapStock = (i: number, f: (v: string) => string | null) => Object.fromEntries(Object.entries(stock).flatMap(([k, n]) => { const vals = JSON.parse(k) as string[]; if (vals.length !== dims.length) return [[k, n]]; const nv = f(vals[i]); return nv === null ? [] : [[comboKey(vals.map((x, j) => (j === i ? nv : x))), n]]; }));
  const addDim = (v: string) => { if (dims.length < OPTION_DIM_MAX && optCheck(v, dims.map(x => x.name), '옵션 이름')) patch({ optionDims: [...dims, { name: v.trim(), values: [] }] }); };
  const renameDim = (i: number, v: string) => { if (!optCheck(v, dims.filter((_, j) => j !== i).map(x => x.name), '옵션 이름')) return false; patch({ optionDims: dimsWith(i, x => ({ ...x, name: v.trim() })) }); return true; };
  const addValue = (i: number, v: string) => { if (optCheck(v, dims[i].values, '옵션 값')) patch({ optionDims: dimsWith(i, x => ({ ...x, values: [...x.values, v.trim()] })) }); };
  const renameValue = (i: number, old: string, v: string) => { if (!optCheck(v, dims[i].values.filter(x => x !== old), '옵션 값')) return false; const nv = v.trim(); patch({ optionDims: dimsWith(i, x => ({ ...x, values: x.values.map(y => (y === old ? nv : y)) })), stock: remapStock(i, y => (y === old ? nv : y)) }); return true; };
  const deleteValue = (i: number, v: string) => { setOptErr(''); patch({ optionDims: dimsWith(i, x => ({ ...x, values: x.values.filter(y => y !== v) })), stock: remapStock(i, y => (y === v ? null : y)) }); };
  // 단계를 지우면 그 값과 조합 수량도 지운다. 값이 있으면 먼저 확인한다(값이 없는 단계는 수량에 영향이 없어 바로 지운다)
  const removeDims = (i: number | 'all') => { const gone = i === 'all' ? dims : [dims[i]]; setDropDim(null); setOptErr(''); patch({ optionDims: i === 'all' ? [] : dims.filter((_, j) => j !== i), ...(gone.some(x => x.values.length) ? { stock: {} } : {}) }); };
  const askRemove = (i: number | 'all') => { if ((i === 'all' ? dims : [dims[i]]).some(x => x.values.length)) setDropDim(i); else removeDims(i); };
  const chip = (on: boolean, label: string, onClick: () => void) => <button type="button" aria-pressed={on} onClick={onClick} className={`inline-flex h-8 items-center gap-1 rounded-full px-3.5 text-body ${on ? 'bg-ink font-bold text-white' : 'border border-border text-aux'}`}>{on && <Check size={13} strokeWidth={2.5}/>}{label}</button>;
  const qtyRow = (label: string, key: string, last: boolean) => <div key={key} className={`flex min-h-13 items-center justify-between gap-3 py-2 ${last ? '' : 'border-b border-line'}`}><span className="min-w-0 break-all text-subhead">{label}</span><Stepper label={label} value={stock[key] ?? 0} onChange={n => setStock(key, n)}/></div>;

  // 확인 단계 요약: 각 줄의 수정은 그 단계로 간다
  const summary: [number, string, string][] = [
    [1, '상품 사진', `${d.images.length}장`], [1, '상품명', d.name.trim() || '입력 전'],
    [2, '카테고리', d.category || '선택 전'],
    [3, '한정 판매가', d.price ? money(d.price) : '입력 전'], [3, '총 한정 수량', `${total}개`], ...(!revision ? [[3, '1인 구매 한도', `${d.maxPerAccount}개`]] as [number, string, string][] : []),
    [4, '판매 일정', startOk ? `${dateLabel(d.startsAt)} ${hhmm(start.getHours(), start.getMinutes())} 시작` : '선택 전'], [4, '배송비', d.shipping ? money(d.shipping) : '무료'], ...(!revision ? [[4, '출고 기한', `${d.dispatchDays}영업일`]] as [number, string, string][] : []),
  ];
  const last = step === STEPS;

  return <div className="space-y-6 pb-28">
    <Header title={editId ? '판매 정보 수정' : '한정 판매 등록'} bare onBack={prevStep}/>
    <div className="-mt-4 space-y-2" role="group" aria-label={`판매 등록 ${step}/${STEPS}단계 ${STEP_TITLES[step - 1]}`}>
      <div className="flex items-center justify-between gap-3"><p className="text-body font-bold">{STEP_TITLES[step - 1]}</p><p className="shrink-0 text-label text-meta">{step}/{STEPS}</p></div>
      <ProgressBar value={step} max={STEPS} label={`${step}/${STEPS}단계 ${STEP_TITLES[step - 1]}`} isLabelHidden/>
    </div>
    {(step === 1 || last) && <>
      {editing && <div className="-mt-4 space-y-3">
        {editing.startsAt > 0 && <p className="flex items-center gap-2 text-label text-meta"><span className="rounded-badge bg-soft px-1.5 py-0.5 text-footnote font-bold text-aux">{rejected ? '반려됨' : '판매 예정'}</span>{`${new Date(editing.startsAt).getMonth() + 1}.${new Date(editing.startsAt).getDate()} (${WEEK[new Date(editing.startsAt).getDay()]}) ${hhmm(new Date(editing.startsAt).getHours(), new Date(editing.startsAt).getMinutes())} 오픈`}{editing.notifySubscribers !== undefined && ` · 알림 신청 ${editing.notifySubscribers}명`}</p>}
        {rejected ? <>
          <Note title="반려 사유">{editing.rejectionReason || '반려 사유가 등록되지 않았어요.'}</Note>
          <div className="flex gap-2 rounded-element bg-soft p-3.5"><Info size={15} className="mt-0.5 shrink-0 text-aux"/><p className="text-label leading-[1.5] text-aux">고친 내용을 저장하면 작성 중 상태가 되고, 재심사를 요청하면 다시 심사해요.</p></div>
          {/* 반려 상품의 판매 시작이 지났으면 일정부터 미래 시각으로 바꿔야 재요청할 수 있다 */}
          {startPassed && <div role="alert" className="space-y-2 rounded-element border border-red p-3.5"><p className="text-body font-bold text-red">판매 시작 시각이 지났어요</p><p className="text-label text-aux">판매 일정을 지금보다 뒤로 바꾼 뒤 재심사를 요청해 주세요.</p><Button outline className="w-full text-body!" onClick={() => showProblems({ startsAt: '판매 시작 시각이 지났어요. 지금보다 뒤로 바꿔 주세요.' })}>판매 일정 바꾸기</Button></div>}
        </> : <div className="flex gap-2 rounded-element bg-soft p-3.5"><Info size={15} className="mt-0.5 shrink-0 text-aux"/><p className="text-label leading-[1.5] text-aux">수정하면 판매 심사를 다시 받아요.<br/>심사 중에도 기존 정보로 오픈 일정은 유지돼요.{revision && <><br/>승인 후에는 설명·판매가·배송비·판매 일정·출고지·반품지만 바꿀 수 있어요. 상품명·사진·옵션·수량은 바꿀 수 없어요.</>}</p></div>}
      </div>}

    </>}

    <div key={step} className="step-in space-y-6">
    {step === 1 && <>
      {/* 상품 사진 */}
      <section className="space-y-2.5" data-field="images">
        <Label hint={revision ? '· 승인 후 변경 불가' : '· 필수 · 최대 10장'}>상품 사진</Label>
        <div className="flex gap-2 overflow-x-auto">
          {!revision && d.images.length < 10 && <label className="flex h-20 w-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-element border border-border"><Plus size={20} strokeWidth={1.5}/><span className="text-footnote text-meta">{uploading ? '처리 중' : `${d.images.length}/10`}</span><input aria-label="상품 사진 업로드" type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={uploading} onChange={e => { const picked = Array.from(e.target.files ?? []); e.target.value = ''; void upload(picked); }}/></label>}
          {d.images.map((src, i) => <button type="button" key={src.slice(-24) + i} disabled={revision} onClick={() => setPhoto(i)} className="relative shrink-0"><ProductImage src={src} alt={`상품 사진 ${i + 1}`} className="h-20 w-20"/>{i === 0 && <span className="absolute bottom-1.5 left-1.5 rounded-badge bg-black/70 px-1.5 py-0.5 text-caption font-bold text-white">대표</span>}</button>)}
        </div>
        {progress && <p role="status" className="text-label text-aux">{progress}</p>}
        <ErrorBox message={photoError}/>{!revision && retryFiles.length > 0 && !uploading && <button type="button" onClick={() => void upload(retryFiles)} className="h-9 rounded-element border border-border px-3 text-label font-bold">남은 사진 {retryFiles.length}장 다시 올리기</button>}
        {!revision && <p className="text-footnote text-meta">JPG·PNG·WEBP · 장당 10MB 이하 · 첫 번째 사진이 대표예요</p>}
        <FieldError name="images"/>
      </section>

      <section data-field="name"><Label hint={revision ? '· 승인 후 변경 불가' : '· 필수'}>상품명</Label><CompositionInput aria-label="상품명" className="field-line" readOnly={revision} value={d.name} maxLength={50} onValueChange={value => patch({ name: value })} placeholder="상품명을 입력해 주세요"/><FieldError name="name"/></section>

      {/* AI 분석·심사 제출에 필요한 값(단계 저장 땐 선택). 비워 두면 보내지 않는다 — 임의 문구로 채우지 않는다. Figma에 추가할 칸 */}
      <section data-field="description"><Label hint="· 필수 · 한두 줄이면 돼요">짧은 설명</Label><textarea aria-label="짧은 설명" rows={2} className="field-line min-h-16 resize-y" value={d.description} maxLength={20000} onChange={e => patch({ description: e.target.value })} placeholder="예: 새 상품, 택 그대로, 박스 없음"/><FieldError name="description"/></section>
    {!revision && <>
      <section data-field="disposalReason"><Label hint="· 필수 · 한두 줄이면 돼요">처분 사유</Label><input aria-label="처분 사유" className="field-line" value={d.reason} maxLength={500} onChange={e => patch({ reason: e.target.value })} placeholder="예: 시즌 종료 후 남은 미판매 새 상품"/><FieldError name="disposalReason"/></section>

      <section data-field="state" className="space-y-2">
        <Button outline={!!Object.keys(analysisProblems(d, editing?.reviewStatus)).length} className="flex w-full items-center justify-center gap-1.5 text-callout!" disabled={d.ai.status === 'analyzing' || uploading} onClick={runAnalysis}><Sparkles size={15}/>{d.ai.status === 'analyzing' ? 'AI가 분석하고 있어요' : d.ai.result || d.ai.status === 'uncertain' ? 'AI 분석 다시 하기' : 'AI로 카테고리 분석하기'}</Button>
        <p className="text-label text-meta">사진·상품명·짧은 설명·처분 사유를 입력하면 AI가 카테고리를 추천해요. 분석은 선택이라 건너뛰고 카테고리를 직접 골라도 돼요</p>
        <ul className="space-y-1 rounded-element bg-soft p-3 text-label leading-[1.6] text-aux"><li>· 상품 전체가 보이는 사진과 라벨(소재·사이즈 표기) 사진을 올려 주세요</li><li>· 흠집, 사용감, 포장 상태가 잘 보이게 찍고 처분 사유를 구체적으로 적으면 AI가 구매자 질문과 예상 답변을 더 정확히 만들어요</li><li>· 분석 뒤에 상품명·설명·브랜드·사진 등을 바꾸면 질문을 다시 받아야 해요. 입력을 마친 뒤 분석하면 한 번에 끝나요</li></ul>
        <FieldError name="state"/>
      </section>

    </>}
    </>}

    {step === 2 && <>
    {!revision ? <>
      {stale && <section role="status" className="space-y-2 rounded-element bg-red-soft p-4"><p className="text-body font-bold text-red">정보가 바뀌어 AI 질문을 다시 받아야 해요</p><p className="text-label text-red">분석한 뒤에 상품명·설명·브랜드·카테고리·처분 사유·사진 중 하나가 바뀌었어요. 다시 분석하면 입력이 같을 땐 기존 결과, 다르면 새 분석을 받아요.</p><Button outline className="w-full" disabled={d.ai.status === 'analyzing' || uploading} onClick={runAnalysis}>다시 분석</Button></section>}

      {d.ai.status === 'recommended' && d.ai.result && d.ai.notice && !d.ai.noticeSeen && <div role="status" aria-label="AI 분석 반영 안내" className="space-y-2 rounded-element bg-soft p-4">
        <p className="flex items-center gap-1.5 text-body font-bold"><Sparkles size={14}/>{d.ai.notice === 'applied' ? 'AI 분석 결과를 반영했어요' : '직접 고른 카테고리는 그대로 두었어요'}</p>
        <p className="text-label leading-relaxed text-aux">{d.ai.notice === 'applied' ? `카테고리 ${d.ai.result.category}` : `AI 추천 카테고리는 ${d.ai.result.category}예요`}{d.ai.result.questions.length ? ` · 구매자가 물어볼 만한 질문 ${d.ai.result.questions.length}개는 마지막 확인 단계의 AI 질문에서 답할 수 있어요` : ''}</p>
        <div className="flex gap-3 text-label font-bold">{d.ai.notice === 'kept' && <button type="button" className="underline" onClick={() => patch({ category: d.ai.result!.category, aiCategory: d.ai.result!.category, ai: { ...d.ai, notice: 'applied', noticeSeen: true } })}>AI 추천으로 바꾸기</button>}<button type="button" className="text-aux underline" onClick={() => patch({ ai: { ...d.ai, noticeSeen: true } })}>닫기</button></div>
      </div>}
      <section data-field="category"><Label hint="· AI 추천 또는 직접 선택">카테고리</Label>
        {!d.category && d.ai.status === 'uncertain' && d.ai.reason && <p role="status" className="pb-1 text-label text-aux">{d.ai.reason}</p>}
        <button type="button" onClick={openCategory} className="flex h-12 w-full items-center gap-2 border-b border-line text-left">
          <Sparkles size={16} className="shrink-0"/>
          <span className={`min-w-0 flex-1 truncate text-headline ${d.category ? '' : 'text-placeholder'}`}>{d.category || (d.ai.status === 'analyzing' ? '사진을 분석하고 있어요' : '카테고리를 선택해 주세요')}</span>
          {(d.category || d.ai.result || d.ai.status === 'analyzing' || d.ai.status === 'failed' || d.ai.status === 'delayed') && <span className="flex shrink-0 items-center text-body text-aux">분석 결과<ChevronRight size={16}/></span>}
        </button>
        <FieldError name="category"/>
      </section>

      {/* 카테고리별 점검 기준(registration-metadata categoryCriteria) → 입력칸. 값은 2단계 attributes(항목명+값)로 저장. AI 질문은 칸과 묶지 않고 아래 독립 목록 */}
      {criteria && <section className="space-y-4" data-field="attributes">
        <div><Label hint="· 심사 때 확인해요">카테고리별 상품 정보</Label><p className="mt-1 text-label text-meta">카테고리마다 확인하는 항목이 달라요</p></div>
        {criteria.checks.map(c => { const name = attributeName(c.code); return <div key={c.code}>
          <p className="text-body">{name}</p>
          <input aria-label={name} className="field-line" value={d.extras.find(e => e.key === name)?.value ?? ''} maxLength={ATTRIBUTE_VALUE_MAX} onChange={e => setExtra(name, e.target.value)}/>
        </div>; })}
      </section>}

    </> : <section data-field="category"><Label hint="· 승인 후 변경 불가">카테고리</Label><p className="flex h-12 items-center border-b border-line text-headline text-meta">{d.category || '선택 안 함'}</p></section>}
    </>}

    {step === 3 && <>
    {!revision && <>
      <section className="space-y-3" data-field="sourceUrl">
        <div><Label hint="· 필수">타 플랫폼 판매 URL</Label><p className="mt-1 text-label text-meta">쿠팡·알리 등에서 판매 중인 같은 상품의 링크</p></div>
        <label className="flex h-12 items-center gap-2 border-b border-line"><Link2 size={17} className="shrink-0 text-aux"/><CompositionInput aria-label="타 플랫폼 판매 URL" className="min-w-0 flex-1 bg-transparent text-subhead outline-none placeholder:text-placeholder" value={d.originalUrl} placeholder="https://" onValueChange={value => patch({ originalUrl: value, reference: lookupReference(value) /* TODO(api-gap): 타 플랫폼 가격 조회 API 없음(목업) */ })}/></label>
        {reference && <div className="flex items-center gap-3 rounded-element bg-soft p-3">{reference.image && <ProductImage src={reference.image} alt={reference.title} className="h-12 w-12 shrink-0"/>}<div className="min-w-0 flex-1"><p className="text-footnote font-bold text-meta">{reference.platform}</p><p className="truncate text-body">{reference.title}</p><p className="text-callout font-bold">{money(reference.price)}</p></div><span className="flex shrink-0 items-center gap-1 text-label font-bold text-positive"><Check size={14}/>확인됨</span></div>}
        {(d.extraUrls ?? []).map((url, i) => <label key={i} className="flex h-12 items-center gap-2 border-b border-line"><Link2 size={17} className="shrink-0 text-aux"/><input aria-label={`추가 URL ${i + 1}`} className="min-w-0 flex-1 bg-transparent text-subhead outline-none" value={url} placeholder="https://" onChange={e => patch({ extraUrls: (d.extraUrls ?? []).map((u, j) => j === i ? e.target.value : u) })}/></label>)}
        <button type="button" onClick={() => patch({ extraUrls: [...(d.extraUrls ?? []), ''] })} className="flex items-center gap-1 text-body text-aux"><Plus size={14}/>다른 플랫폼 URL 추가</button>
        {fieldErr.sourceUrl ? <FieldError name="sourceUrl"/> : d.originalUrl.trim() && sourceUrlProblem(d.originalUrl) ? <p className="mt-1.5 text-label text-red">{sourceUrlProblem(d.originalUrl)}</p> : null}
      </section>

    </>}
      <section className="space-y-2.5" data-field="price"><Label hint="· 필수">한정 판매가</Label>
        <label className="flex h-12 items-center border-b border-line"><input aria-label="한정 판매가" inputMode="numeric" className="min-w-0 flex-1 bg-transparent text-headline outline-none placeholder:text-placeholder" value={d.price ? d.price.toLocaleString('ko-KR') : ''} placeholder="0" onChange={e => patch({ price: Number(e.target.value.replace(/\D/g, '')) || 0 })}/><span className="text-callout text-aux">원</span></label>
        {discount > 0 && reference && <p className="flex items-center gap-2 text-label text-aux"><span className="rounded-badge bg-positive-soft px-1.5 py-0.5 text-footnote font-bold text-positive">{Math.round(discount / reference.price * 100)}% 저렴</span>{`${reference.platform} 판매가보다 ${money(discount)} 저렴해요`}</p>}
        <p className="text-label text-meta">{revision && reference ? `등록한 URL의 판매가(${money(reference.price)})보다 낮아야 심사를 요청할 수 있어요` : '등록한 URL의 판매가보다 낮게 정해 주세요. 운영자가 심사 때 URL의 판매가와 비교해요'}</p>
        <FieldError name="price"/>
      </section>

    {!revision ? <>
      <section className="space-y-3" data-field="options"><Label hint="· 필수">옵션별 한정 수량</Label>
        <div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-label text-aux">옵션</span>{chip(!dims.length, '옵션 없음', () => { if (dims.length) askRemove('all'); })}{dims.length < OPTION_DIM_MAX ? <InlineAdd label="직접 추가" maxLength={OPTION_TEXT_MAX} className="h-8 rounded-full border border-border px-3" onAdd={addDim}/> : <span className="text-label text-meta">옵션은 {OPTION_DIM_MAX}단계까지 추가할 수 있어요</span>}</div>
        {dims.map((x, i) => <div key={i} role="group" aria-label={`옵션 ${i + 1}단계 ${x.name}`} className="space-y-2.5 rounded-element border border-line px-3.5 py-3">
          <div className="flex items-center gap-2"><span className="shrink-0 text-footnote text-meta">{i + 1}단계</span><EditText value={x.name} label={`옵션 이름 ${x.name}`} onSave={v => renameDim(i, v)} className="min-w-0 flex-1 break-all text-callout font-bold"/><button type="button" aria-label={`${x.name} 옵션 삭제`} onClick={() => askRemove(i)} className="grid h-8 w-8 shrink-0 place-items-center text-aux"><X size={16}/></button></div>
          <div className="flex flex-wrap items-center gap-2">{x.values.map(v => <span key={v} className="inline-flex h-9 max-w-full items-center gap-0.5 rounded-element border border-border pl-3"><EditText value={v} label={`${x.name} 값 ${v}`} onSave={nv => renameValue(i, v, nv)} className="min-w-0 truncate text-body"/><button type="button" aria-label={`${x.name} 값 ${v} 삭제`} onClick={() => deleteValue(i, v)} className="grid h-8 w-8 shrink-0 place-items-center text-aux"><X size={13}/></button></span>)}<InlineAdd label={`${x.name} 추가`} maxLength={OPTION_TEXT_MAX} className="h-9 rounded-element border border-border px-3" onAdd={v => addValue(i, v)}/></div>
        </div>)}
        {optErr && <p role="alert" className="text-label text-red">{optErr}</p>}
        <div className="rounded-element border border-line px-4">
          {dims.length > 0 && <div className="flex min-h-12 items-center justify-between gap-3 border-b border-line py-2"><p className="min-w-0 break-all text-body font-bold">{dims.map(x => x.name).join(' × ')}별 수량</p><p className="shrink-0 text-body font-bold text-aux">{total}개</p></div>}
          {!dims.length ? qtyRow('기본 수량', comboKey([]), true) : combos.length ? combos.map((vals, k) => qtyRow(comboLabel(vals), comboKey(vals), k === combos.length - 1)) : <p className="py-4 text-body text-meta">옵션 값을 추가하면 조합별 수량을 넣을 수 있어요</p>}
        </div>
        <div className="flex items-center justify-between gap-3 rounded-element bg-soft px-4 py-3.5"><div className="min-w-0"><p className="text-body font-bold">총 한정 수량</p>{dims.length >= 2 && dims[0].values.length > 0 && <p className="mt-0.5 break-all text-label text-meta">{dims[0].values.map(v => `${v} ${firstTotal(v)}`).join(' · ')}</p>}</div><p className="shrink-0 text-title font-bold">{total}개</p></div>
        {dropDim !== null && <Modal title={dropDim === 'all' ? '옵션을 모두 지울까요?' : `'${dims[dropDim]?.name}' 옵션을 지울까요?`} onClose={() => setDropDim(null)}><div className="space-y-4"><p className="text-body text-aux">입력한 옵션 값과 한정 수량도 함께 지워져요.</p><div className="flex gap-2"><Button outline className="flex-1" closeSheet>취소</Button><Button className="flex-1" onClick={() => removeDims(dropDim)}>삭제</Button></div></div></Modal>}
        <p className="text-label text-meta">판매가 시작되면 옵션과 수량을 바꿀 수 없어요</p>
        <FieldError name="options"/>
      </section>

      <section className="space-y-2.5" data-field="maxPerAccount"><div className="flex items-center justify-between"><Label hint="· 필수">1인 구매 한도</Label><Stepper label="1인 구매 한도" value={d.maxPerAccount} onChange={n => patch({ maxPerAccount: n })}/></div>
        <FieldError name="maxPerAccount"/>
      </section>

    </> : <p className="text-label text-meta">옵션과 한정 수량, 1인 구매 한도는 승인 후 바꿀 수 없어요</p>}
    </>}

    {step === 4 && <>
      <section className="space-y-3" data-field="startsAt"><Label hint="· 필수">판매 일정</Label>
        <div className="flex gap-4">
          <label className="relative flex h-12 min-w-0 flex-[1.6] items-center justify-between border-b border-line"><span className="text-headline">{startOk ? dateLabel(d.startsAt) : '날짜 선택'}</span><Calendar size={18} className="text-aux"/><input aria-label="판매 날짜" type="date" className="absolute inset-0 opacity-0" min={localDateTime(now).slice(0, 10)} max={localDateTime(now + 7 * 86_400_000).slice(0, 10)} value={startOk ? localDateTime(start.getTime()).slice(0, 10) : ''} onChange={e => setDate(e.target.value)}/></label>
          <label className="relative flex h-12 min-w-0 flex-1 items-center justify-between border-b border-line"><span className="text-headline">{startOk ? hhmm(start.getHours(), start.getMinutes()) : '시간'}</span><ChevronDown size={18} className="text-aux"/>{QUICK_SCHEDULE ? <input aria-label="판매 시작 시각" type="time" step={60} className="absolute inset-0 opacity-0" value={startOk ? hhmm(start.getHours(), start.getMinutes()) : ''} onChange={e => e.target.value && setTime(e.target.value)}/> : <select aria-label="판매 시작 시각" className="absolute inset-0 opacity-0" value={startOk ? hhmm(start.getHours(), start.getMinutes()) : ''} onChange={e => setTime(e.target.value)}>{TIME_SLOTS.map(t => <option key={t} disabled={startOk && new Date(`${localDateTime(start.getTime()).slice(0, 10)}T${t}`).getTime() <= now}>{t}</option>)}</select>}</label>
        </div>
        {QUICK_SCHEDULE && <button type="button" className="w-full rounded-element border border-dashed border-line py-2.5 text-label font-bold text-aux" onClick={() => patch({ startsAt: localDateTime(Math.ceil((now + 5 * 60_000) / 60_000) * 60_000) })}>테스트: 5분 뒤 시작</button>}
        {startOk && <p className="flex items-center gap-2 rounded-element bg-soft px-4 py-3 text-body font-bold"><Timer size={16}/>{`${hhmm(start.getHours(), start.getMinutes())} 시작 – ${endLabel} 자동 종료 · 3시간 선착순 판매`}</p>}
        <p className="flex items-start gap-1.5 text-label text-aux"><Info size={14} className="mt-0.5 shrink-0"/>운영자 승인 전에 시작 시각이 지나면 승인이 실패해요. 여유 있게 잡아 주세요</p>
        {startOk && start.getTime() <= now && !fieldErr.startsAt ? <p className="mt-1.5 text-label text-red">판매 시작 시각이 지났어요. 지금보다 뒤로 바꿔 주세요.</p> : <FieldError name="startsAt"/>}
      </section>

    {!revision && <>
      <section className="space-y-3" data-field="dispatchDays"><Label hint="· 필수">출고 기한</Label>
        <div className="grid grid-cols-3 gap-2">{[1, 2, 3].map(n => <button type="button" key={n} onClick={() => patch({ dispatchDays: n })} className={`h-10 rounded-element text-body ${d.dispatchDays === n ? 'bg-ink font-bold text-white' : 'border border-border text-aux'}`}>{n}영업일</button>)}</div>
        <FieldError name="dispatchDays"/>
      </section>

    </>}
      {/* 배송비·1인 구매 한도: 서버 필수 값(배송비 ≥ 0, 한도 > 0). Figma에 추가할 칸 */}
      <section className="space-y-2.5" data-field="shipping"><Label hint="· 필수 · 무료면 0">배송비</Label>
        <label className="flex h-12 items-center border-b border-line"><input aria-label="배송비" inputMode="numeric" className="min-w-0 flex-1 bg-transparent text-headline outline-none" value={d.shipping.toLocaleString('ko-KR')} onChange={e => patch({ shipping: Number(e.target.value.replace(/\D/g, '')) || 0 })}/><span className="text-callout text-aux">원</span></label>
        <FieldError name="shipping"/>
      </section>
    {!revision && <>
      {/* 택배사·반품/교환 배송비: 판매자 설정 API가 없어 상품의 shippingNotice 글로 저장한다. 칸을 고치면 아래 글이 다시 만들어지고, 글은 직접 고칠 수 있다 */}
      <section className="space-y-3" data-field="shippingNotice"><div><Label hint="· 구매자에게 안내돼요">택배사 · 반품 배송비</Label></div>
        {(() => {
          const set = (v: Partial<Pick<Draft, 'carrier' | 'returnFee' | 'exchangeFee'>>) => { const n = { carrier: d.carrier ?? '', returnFee: d.returnFee ?? '', exchangeFee: '', ...v }; /* 교환은 지원하지 않아 교환 배송비는 안내하지 않는다 */ patch({ ...n, shippingNotice: composeShippingNotice(n.carrier, n.returnFee, n.exchangeFee) }); };
          const digits = (v: string) => v.replace(/\D/g, '');
          return <>
            <label className="block text-body">택배사<select aria-label="택배사" className="field-line" value={d.carrier ?? ''} onChange={e => set({ carrier: e.target.value })}><option value="">선택 안 함</option>{['CJ대한통운', '한진택배', '롯데택배', '우체국택배'].map(c => <option key={c}>{c}</option>)}</select></label>
            <label className="block text-body">반품 배송비<span className="flex items-center border-b border-line"><input aria-label="반품 배송비" inputMode="numeric" className="min-w-0 flex-1 bg-transparent py-3 text-headline outline-none" value={d.returnFee ? Number(d.returnFee).toLocaleString('ko-KR') : ''} placeholder="3,000" onChange={e => set({ returnFee: digits(e.target.value) })}/><span className="text-callout text-aux">원</span></span></label>
          </>;
        })()}
        <label className="block text-body">배송 안내 글<textarea aria-label="배송 안내" rows={3} className="mt-1 w-full rounded-element border border-border p-3 text-callout outline-none" value={d.shippingNotice ?? ''} onChange={e => patch({ shippingNotice: e.target.value })}/></label>
        <p className={`text-right text-label ${(d.shippingNotice ?? '').length > SHIPPING_NOTICE_MAX ? 'text-[var(--danger,#d32f2f)]' : 'text-meta'}`}>{(d.shippingNotice ?? '').length.toLocaleString('ko-KR')} / {SHIPPING_NOTICE_MAX.toLocaleString('ko-KR')}자</p>
        <FieldError name="shippingNotice"/>
      </section>
    </>}
      <section className="space-y-2.5" data-field="addresses"><Label hint="· 필수">출고지 · 반품지</Label>
        {USE_MOCK ? ([['출고지', s.sellerSettings[user.id]?.shippingAddress], ['반품지', s.sellerSettings[user.id]?.returnAddress]] as const).map(([k, v]) => <div key={k} className="flex justify-between gap-3 text-body"><span className="shrink-0 text-aux">{k}</span><span className="text-right">{v || '등록된 주소가 없어요'}</span></div>)
          : book.data && ([['출고지', 'dispatchAddressId', book.data[0]], ['반품지', 'returnAddressId', book.data[1]]] as const).map(([k, key, list]) => <label key={k} className="flex items-center gap-3 text-body"><span className="w-12 shrink-0 text-aux">{k}</span>
            {/* 선택하지 않으면 서버가 기본 주소를 쓴다 */}
            {list.length ? <select aria-label={k} className="field-line min-w-0 flex-1" value={d[key] && list.some(a => a.id === d[key]) ? d[key] : list.find(a => a.defaultAddress)?.id ?? ''} onChange={e => patch({ [key]: e.target.value })}>{list.map(a => <option key={a.id} value={a.id}>{a.label}{a.defaultAddress ? ' (기본)' : ''} · {a.address.roadAddress}</option>)}</select> : <span>등록된 주소가 없어요</span>}
          </label>)}
        {!USE_MOCK && <LiveStatus state={book}/>}
        <FieldError name="addresses"/>
        <Link to="/seller/settings/addresses" className="text-label text-aux underline">출고지·반품지 관리</Link>
      </section>

    </>}

    {last && <>
    <section className="space-y-1" aria-label="입력한 내용 확인"><Label>입력한 내용</Label>
      {summary.map(([n, label, value]) => <div key={label} className="flex min-h-11 items-center gap-3 border-b border-line"><span className="w-24 shrink-0 text-label text-aux">{label}</span><span className="min-w-0 flex-1 truncate text-body">{value}</span><button type="button" aria-label={`${label} 수정`} onClick={() => goStep(n)} className="h-11 min-w-11 shrink-0 px-1 text-right text-label text-aux underline">수정</button></div>)}
    </section>
    {!revision && <>
      {questions.length > 0 && <section className="space-y-4" data-field="aiQuestions">
        <div><Label hint="· 선택">AI 질문</Label><p className="mt-1 text-label text-meta">구매자가 물어볼 만한 질문이에요. 답하면 상품 FAQ로 구매자에게 공개돼요. 답하지 않아도 판매 심사를 요청할 수 있어요</p></div>
        {questions.map((q, i) => { const f = aiFaq(q), answer = f?.answer ?? '', draft = f?.confirmed === false; return <div key={q.suggestionId ?? i} className="space-y-1.5">
          <p className="flex items-start gap-1 text-body font-bold"><Sparkles size={13} className="mt-[3px] shrink-0"/>{q.question}</p>
          {q.reason && <p className="text-label text-meta">{q.reason}</p>}
          {draft && <span className="inline-flex h-4.5 items-center rounded-inner bg-soft px-2 text-caption font-bold text-aux">AI 예상 답변 · 확인 전</span>}
          <textarea aria-label={`AI 질문 답: ${q.question}`} className="field-line min-h-18 py-2" maxLength={4000} placeholder={q.suggestedAnswer ? undefined : '사진과 설명만으로는 알 수 없어 비워 두었어요. 직접 답해 주세요'} value={answer} onChange={e => setAiAnswer(q, e.target.value)}/>
          {answer.trim() && <label className="flex items-center gap-2 text-label"><input type="checkbox" checked={!draft} onChange={e => setAiAnswer(q, answer, e.target.checked)}/>이 답을 확인했어요</label>}
          <p className="text-footnote text-meta">{draft ? '확인하기 전에는 저장하지 않아요. 내용을 확인하거나 고친 뒤 체크해 주세요' : '이 답은 상품 FAQ로 구매자에게도 공개돼요'}</p>
        </div>; })}
      </section>}

    </>}
      {!editId && <section data-field="inspection" className="space-y-3">
        <div><Label hint="· 판매 심사에 포함">물품 검수</Label><p className="mt-1 text-label text-aux">심사 때 운영팀이 사진으로 실제 상품 상태를 확인해요</p></div>
        <div className="space-y-3 rounded-element bg-soft p-4">
          <p className="text-body font-bold">검수용 사진 안내</p>
          <ul className="space-y-1.5 text-label text-aux">{INSPECTION_PHOTOS.map((t, n) => <li key={t} className="flex items-center gap-2"><span className="grid h-4 w-4 place-items-center rounded-full bg-ink text-caption text-surface">{n + 1}</span>{t}</li>)}</ul>
          <p className="flex items-start gap-1.5 text-label text-meta"><Info size={14} className="mt-0.5 shrink-0"/>위 사진을 위의 상품 사진으로 올려 주세요. 사진은 상품 사진과 같은 곳에 올라가요.</p>
        </div>
        <div className="space-y-1">{INSPECTION_CHECKS.map((t, n) => { const on = !!d.inspection?.includes(n); return <label key={t} className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-line text-body"><input type="checkbox" className="h-5 w-5" checked={on} onChange={() => patch({ inspection: on ? (d.inspection ?? []).filter(x => x !== n) : [...(d.inspection ?? []), n] })}/>{t}</label>; })}</div>
        <FieldError name="inspection"/>
        <p className="flex items-start gap-1.5 text-label text-meta"><Info size={14} className="mt-0.5 shrink-0"/>미통과 시 알림으로 사유를 알려드리고 재등록할 수 있어요.</p>
      </section>}

    </>}
    </div>

    {blocked && <ErrorBox message="지원하지 않는 상품은 등록할 수 없습니다."/>}
    <ErrorBox message={error}/>
    {last && <p className="text-center text-label text-meta">{editId ? '수정 내용은 판매 심사 후 반영돼요 · 영업일 기준 1일 이내' : '판매 심사(물품 확인 포함)는 영업일 기준 1일 이내에 완료돼요'}</p>}
    <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[390px] border-t border-line bg-surface px-4 pt-3 safe-bottom">
      {last ? <Button className="w-full text-subhead!" disabled={busy || uploading || blocked} onClick={submit}>{busy ? '요청 중…' : editId ? (editing?.reviewStatus === 'REJECTED' ? '수정하고 재심사 요청' : '수정 심사 요청') : '판매 심사 요청하기'}</Button> : <Button className="w-full text-subhead!" disabled={uploading} onClick={nextStep}>다음</Button>}
    </div>

    {!revision && photo !== null && d.images[photo] && <Modal title={`상품 사진 ${photo + 1}`} onClose={() => setPhoto(null)}><div className="space-y-3"><ProductImage src={d.images[photo]} alt="선택한 사진" className="aspect-square w-full"/>{photo > 0 && <Button className="w-full" onClick={() => void coverPhoto(photo)}>대표 사진으로 지정</Button>}<Button outline className="w-full" onClick={() => void removePhoto(photo)}>삭제</Button></div></Modal>}
    {pickerOpen && <CategoryPicker value={d.category} recommended={d.ai.result?.category} onClose={closePicker} onSave={category => { patch({ category }); closePicker(); }}/>}
  </div>;
}
/** 카테고리 단계 선택: 대분류 → 중분류 → 세부. 위에 AI 추천(누르면 바로 선택), 검색은 단계와 상관없이 전체에서. 저장 값은 세부 카테고리 서버 원문 */
function CategoryPicker({ value, recommended, onClose, onSave }: { value: string; recommended?: string; onClose: () => void; onSave: (v: string) => void }) {
  const [pick, setPick] = useState(value), [q, setQ] = useState(''), [major, setMajor] = useState<string | null>(null), [group, setGroup] = useState<string | null>(null);
  // 허용 카테고리는 서버 registration-metadata의 categories(이름)에서만 고른다. mock도 같은 모양의 목업
  const meta = useRegistrationMeta();
  const tree = meta.data ? categoryTree(meta.data) : [];
  const searching = !!q.trim(), found = (meta.data?.categories ?? []).filter(c => c.includes(q.trim()));
  const m = tree.find(x => x.code === major), g = m?.groups.find(x => x.label === group);
  const radio = (path: string) => <label key={path} className="divider flex items-center gap-3 py-3 text-body"><input type="radio" name="category" value={path} checked={pick === path} onChange={() => setPick(path)}/>{path}</label>;
  const row = (label: string, count: number, onClick: () => void) => <button key={label} type="button" onClick={onClick} className="divider flex w-full items-center justify-between py-3 text-left text-callout"><span>{label} <span className="muted text-label">{count}</span></span><ChevronRight size={16}/></button>;
  return <Modal title="카테고리 선택" onClose={onClose}><div className="space-y-1">
      <CompositionInput aria-label="카테고리 검색" className="field-line" value={q} onValueChange={setQ} placeholder="카테고리 이름으로 찾기 (전체에서 검색)"/>
    <LiveStatus state={meta}/>
    {recommended && !searching && <button type="button" onClick={() => onSave(recommended)} className="mt-2 flex w-full items-center justify-between rounded-element bg-soft p-3 text-left"><span><span className="block text-footnote font-bold text-positive">AI 추천</span><span className="text-callout font-bold">{recommended}</span></span><span className="text-label">바로 선택</span></button>}
    {!searching && (m || g) && <div className="flex items-center gap-1 pt-2 text-label"><button type="button" aria-label="이전 단계" className="muted" onClick={() => (g ? setGroup(null) : setMajor(null))}><ArrowLeft size={16}/></button><span className="muted">{m!.name}{g ? ` › ${g.label}` : ''}</span></div>}
    <div className="max-h-[50dvh] overflow-y-auto">
      {searching ? found.map(radio)
        : g ? g.items.map(radio)
        : m ? m.groups.map(x => row(x.label, x.items.length, () => setGroup(x.label)))
        : tree.map(x => row(x.name, x.groups.reduce((n, y) => n + y.items.length, 0), () => setMajor(x.code)))}
    </div>
    {searching && meta.data && !found.length && <p className="py-3 text-body text-meta">찾는 카테고리가 없어요</p>}
    {pick && <p className="pt-2 text-label">선택: <b>{pick}</b></p>}
    <Note>지원 목록에서만 선택할 수 있습니다. 등록 대상이 아닌 상품은 다른 카테고리로 우회 등록할 수 없습니다.</Note><Button className="mt-4 w-full" disabled={!pick} onClick={() => onSave(pick)}>카테고리 저장</Button></div></Modal>;
}

/* ── AI 상품 분석 (결과 / 분석 중 / 실패와 재시도) ─────────────────────────────────── */
function AiFrame({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  return <div className="flex min-h-[calc(100dvh-44px)] flex-col"><Header title="AI 상품 분석" bare/><div className="flex-1 space-y-5">{children}</div><div className="pt-8">{footer}</div></div>;
}
function Thumbs({ images }: { images: string[] }) { return <div className="flex gap-2">{(images.length ? images.slice(0, 4) : ['', '']).map((src, i) => <div key={i} className="h-18 w-18 rounded-inner bg-soft" aria-hidden={!src}/>)}</div>; }

export function AiAnalysisPage() {
  const { user, d, suffix, patch } = useDraft(); const navigate = useNavigate(); const location = useLocation(); const meta = useRegistrationMeta();
  if (!user.seller) return <Unavailable message="승인된 판매자만 상품을 등록할 수 있습니다."/>;
  if (!d) return null;
  if (d.ai.status === 'analyzing') return <Navigate to={`/seller/new/ai/analyzing${suffix}`} replace/>;
  if (d.ai.status === 'uncertain') return <Navigate to={stepUrl(suffix, 2)} replace state={WIZARD_STATE}/>;
  if (d.ai.status === 'failed' || !d.ai.result) return <Navigate to={`/seller/new/ai/failed${suffix}`} replace/>;
  const r = d.ai.result, chosen = r.category;
  const fromStep = !!(location.state as { fromStep?: boolean } | null)?.fromStep;
  const back = () => (fromStep ? navigate(-1) : navigate(stepUrl(suffix, 2), { replace: true, state: WIZARD_STATE }));
  return <AiFrame footer={<div className="flex gap-2"><Button outline className="w-32 text-subhead!" onClick={() => { startAnalysis(user.id); navigate(`/seller/new/ai/analyzing${suffix}`, { replace: true }); }}>다시 분석</Button>{d.category === chosen ? <Button className="flex-1 text-subhead!" onClick={back}>등록 화면으로</Button> : <Button className="flex-1 text-subhead!" onClick={() => { patch({ category: chosen, aiCategory: chosen }); back(); }}>이 카테고리로 적용</Button>}</div>}>
    <div className="space-y-2"><div className="relative"><ProductImage src={d.images[0]} alt="분석한 대표 사진" className="h-[240px] w-full"/><span className="absolute left-3 top-3 flex items-center gap-1 rounded-inner bg-black/70 px-2 py-1 text-footnote font-bold text-white"><Sparkles size={12}/>AI 분석 완료</span></div><p className="text-label text-meta">등록한 사진 {r.photos}장을 분석했어요</p></div>
    <div className="space-y-1"><p className="text-label font-bold text-meta">AI 추천 카테고리</p><p className="text-heading font-bold">{r.category}</p></div>
    <section><h2 className="mb-1 text-callout font-bold">카테고리 선택</h2><LiveStatus state={meta}/>
      <div className="flex h-12 items-center gap-3 border-b border-line"><span className="grid h-5 w-5 place-items-center rounded-full border-[1.5px] border-ink"><span className="h-2.5 w-2.5 rounded-full bg-ink"/></span><span className="flex-1 text-callout">{r.category}</span><span className="text-footnote font-bold text-positive">AI 추천</span></div>
      <button type="button" onClick={() => navigate(stepUrl(suffix, 2, '&pick=category'), { replace: true, state: WIZARD_STATE })} className="mt-3 flex items-center text-body text-aux">다른 카테고리 직접 선택<ChevronRight size={15}/></button>
    </section>
    {r.questions.length > 0 && <><div className="-mx-4 h-2 bg-divider"/><section className="space-y-3"><h2 className="text-headline font-bold">구매자가 물어볼 만한 질문</h2><p className="text-label text-aux">등록 화면의 AI 질문에서 예상 답변을 확인하거나 고치면 상품 FAQ로 구매자에게 공개돼요</p>{r.questions.map((q, i) => <div key={i} className="space-y-1 rounded-element border border-line p-3.5"><p className="text-callout font-bold">{q.question}</p>{q.reason && <p className="text-label text-aux">{q.reason}</p>}{q.suggestedAnswer && <p className="text-label"><span className="font-bold">AI 예상 답변</span> {q.suggestedAnswer}</p>}</div>)}</section></>}
    <div className="flex gap-2 rounded-element bg-soft p-4"><Info size={15} className="mt-0.5 shrink-0 text-aux"/><p className="text-label leading-[1.5] text-aux">AI 분석 결과는 판매 심사에서 한 번 더 확인해요.<br/>카테고리가 다르면 목록에서 바꿔 주세요.</p></div>
  </AiFrame>;
}

export function AiAnalyzingPage() {
  const { user, d, suffix } = useDraft(); const navigate = useNavigate();
  // 성공(추천)·판단 불가는 결과가 이미 반영된 등록 화면으로, 실패·지연은 안내 화면으로
  useEffect(() => { if (d && d.ai.status !== 'analyzing') navigate(d.ai.status === 'failed' || d.ai.status === 'delayed' ? `/seller/new/ai/failed${suffix}` : stepUrl(suffix, 2), { replace: true, state: WIZARD_STATE }); }, [d?.ai.status]);
  if (!user.seller) return <Unavailable message="승인된 판매자만 상품을 등록할 수 있습니다."/>;
  if (!d) return null;
  return <AiFrame footer={<Button outline className="w-full text-subhead!" onClick={() => navigate(stepUrl(suffix, 2), { replace: true, state: WIZARD_STATE })}>기다리지 않고 등록 계속하기</Button>}>
    <Thumbs images={d.images}/>
    <span className="grid h-11 w-11 place-items-center rounded-full bg-soft"><Sparkles size={18}/></span>
    <div className="space-y-3"><h1 className="text-heading-lg font-bold leading-[1.45] tracking-[-.7px]">등록한 사진 {d.images.length}장을<br/>분석하고 있어요</h1>{d.ai.retry ? <p role="status" className="text-body text-aux">잠시 후 다시 분석해요{d.ai.retry.nextAttemptAt ? ` (다음 시도 ${kstTime(parseServerTime(d.ai.retry.nextAttemptAt)).slice(0, 5)})` : ''} · {d.ai.retry.attempts}번째 시도 중</p> : <p className="text-body text-aux">보통 10초 안에 끝나요.</p>}</div>
    <div className="h-1 w-full overflow-hidden rounded-full bg-line"><div className="h-1 w-[60%] rounded-full bg-ink"/></div>
    <div className="space-y-3.5">{([['카테고리', 60], ['점검 질문', 44]] as const).map(([label, w]) => <div key={label} className="flex items-center justify-between"><span className="text-label text-muted">{label}</span><span className="h-3 rounded-[2px] bg-soft" style={{ width: `${w}%` }}/></div>)}</div>
    <div className="flex gap-2 rounded-element bg-soft p-4"><Info size={15} className="mt-0.5 shrink-0 text-aux"/><p className="text-label leading-[1.6] text-aux">분석을 기다리지 않아도 돼요. 분석이 끝나면 추천 카테고리와 점검 질문이 등록 화면에 바로 반영돼요. 직접 고른 카테고리는 바꾸지 않아요.</p></div>
  </AiFrame>;
}

export function AiFailedPage() {
  const { user, d, suffix } = useDraft(); const navigate = useNavigate();
  if (!user.seller) return <Unavailable message="승인된 판매자만 상품을 등록할 수 있습니다."/>;
  if (!d) return null;
  const delayed = d.ai.status === 'delayed'; // 3분이 지나도 끝나지 않음 — 실패가 아니다(서버는 계속 분석한다)
  return <AiFrame footer={<div className="flex gap-2"><Button outline className="w-32 text-subhead!" onClick={() => navigate(stepUrl(suffix, 2, '&pick=category'), { replace: true, state: WIZARD_STATE })}>직접 입력하기</Button><Button className="flex-1 text-subhead!" onClick={() => { startAnalysis(user.id); navigate(`/seller/new/ai/analyzing${suffix}`, { replace: true }); }}>{delayed ? '다시 확인' : '다시 분석'}</Button></div>}>
    <Thumbs images={d.images}/>
    <span className="grid h-11 w-11 place-items-center rounded-full bg-red-soft"><AlertCircle size={18} className="text-action"/></span>
    {d.ai.fields && <div role="alert" className="space-y-2 rounded-element bg-red-soft p-4"><p className="text-body font-bold text-red">분석 요청 전에 확인할 정보가 있어요</p>{Object.entries(d.ai.fields).map(([k, v]) => <p key={k} className="text-label text-red">{FIELD_LABELS[k] ?? k} · {v}</p>)}<Button outline className="w-full" onClick={() => navigate(`/seller/new${suffix}`, { replace: true })}>입력 정보 확인하기</Button></div>}
    <div className="space-y-2"><h1 className="text-heading-lg font-bold tracking-[-.7px]">{delayed ? '분석이 지연되고 있어요' : '사진을 분석하지 못했어요'}</h1><p className="text-body text-aux">{delayed ? '나중에 다시 확인해 주세요. 서버는 계속 분석하고 있어요. 다시 확인해도 비용은 들지 않아요.' : d.ai.reason ? d.ai.reason : '사진이 흐리거나 상품이 잘 보이지 않으면 분석이 어려워요.'}</p></div>
    <div className="space-y-2 rounded-element bg-infobar p-4"><p className="text-body font-bold">이렇게 하면 더 잘 분석돼요</p><p className="whitespace-pre-line text-label leading-[1.7] text-aux">{'· 상품 전체가 보이도록 밝은 곳에서 촬영\n· 라벨·택이 보이는 사진을 함께 등록\n· 한 사진에 상품 하나만'}</p></div>
    <div className="flex gap-2 rounded-element bg-soft p-4"><Info size={15} className="mt-0.5 shrink-0 text-aux"/><p className="text-label leading-[1.6] text-aux">AI 분석 없이 카테고리를 직접 선택해도 판매 심사를 요청할 수 있어요. 입력한 내용은 그대로 저장돼 있어요.</p></div>
  </AiFrame>;
}
