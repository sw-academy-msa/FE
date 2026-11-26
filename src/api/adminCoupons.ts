/**
 * 운영자 쿠폰 관리(CouponService 관리자 API) — 일반 Gateway(`general`), 모두 ADMIN JWT.
 * 계약: CouponService AdminCouponDefinitionController, AdminCampaignController, DefinitionRequest, CampaignRequest,
 * CouponDefinitionServiceImpl.create, CampaignServiceImpl.create 검증 규칙.
 * - 정의는 만든 뒤 고치지 않는다(조건을 바꾸려면 종료하고 새로 만든다). 목록 data는 배열.
 * - 캠페인은 초안(DRAFT)으로 만들어지고 활성화해야 발급된다. 1인 한도는 1만 받는다.
 * - CLAIM, MEMBER는 전체 상품(ALL) 정의만, TARGETED는 특정 상품(PRODUCT) 정의와 규칙 코드 4개 중 하나만 받는다.
 * - 캠페인 응답에는 정의 ID와 규칙 코드가 없다(CampaignResponse). 발급 내역은 통계(stats)만 있다.
 */
import { api } from './client';
import { ApiError } from './client';
import { errorMessage, fieldErrors } from './errors';
import type { CampaignDto, CouponDefinitionDto } from './coupons';

const service = 'general' as const;
const enc = encodeURIComponent;
const DEFS = '/v1/admin/coupons/definitions';
const CAMPAIGNS = '/v1/admin/coupons/campaigns';

export type CampaignKind = 'CLAIM' | 'TARGETED' | 'MEMBER';
export type RuleCode = 'SALE_OPEN' | 'CHECKOUT_ABANDON' | 'SOLD_OUT_SIMILAR' | 'CATEGORY_NEW';
export interface DefinitionBody { name: string; discountType: 'AMOUNT' | 'RATE'; amount: number | null; rateBps: number | null; maxDiscount: number | null; minItemsAmount: number | null; scope: 'ALL' | 'PRODUCT'; validityMode: 'FIXED' | 'RELATIVE'; validFrom: string | null; validUntil: string | null; validMinutes: number | null; noticeLeadMinutes: number | null }
export interface CampaignBody { code: string; definitionId: string; kind: CampaignKind; ruleCode: RuleCode | null; totalBudget: number; perAccountLimit: 1; startsAt: string; endsAt: string; demo: boolean }
export interface CampaignStatsDto { issued: number; used: number; released: number; expired: number; discountTotal: number }

export const listCouponDefinitions = (signal?: AbortSignal) => api.get<CouponDefinitionDto[]>(DEFS, { service, signal }).then(r => r ?? []);
export const createCouponDefinition = (body: DefinitionBody) => api.post<CouponDefinitionDto>(DEFS, body, { service });
export const retireCouponDefinition = (id: string) => api.post<CouponDefinitionDto>(`${DEFS}/${enc(id)}/retire`, undefined, { service });
export const listCampaigns = (signal?: AbortSignal) => api.get<CampaignDto[]>(CAMPAIGNS, { service, signal }).then(r => r ?? []);
export const createCampaign = (body: CampaignBody) => api.post<CampaignDto>(CAMPAIGNS, body, { service });
export const activateCampaign = (id: string) => api.post<CampaignDto>(`${CAMPAIGNS}/${enc(id)}/activate`, undefined, { service });
export const pauseCampaign = (id: string) => api.post<CampaignDto>(`${CAMPAIGNS}/${enc(id)}/pause`, undefined, { service });
/** 받기형 광고 알림 요청은 캠페인당 한 번만 접수한다. */
export const sendCampaignNotification = (id: string) => api.post<CampaignDto>(`${CAMPAIGNS}/${enc(id)}/notifications`, undefined, { service });
export const getCampaignStats = (id: string, signal?: AbortSignal) => api.get<CampaignStatsDto>(`${CAMPAIGNS}/${enc(id)}/stats`, { service, signal });

/* ── 화면 문구 ── */
export const KIND_LABEL: Record<CampaignKind, string> = { CLAIM: '받기형', TARGETED: '맞춤형', MEMBER: '회원 쿠폰' };
export const KIND_FULL: Record<string, string> = { CLAIM: '선착순 받기(CLAIM)', TARGETED: 'AI 대상(TARGETED)', MEMBER: '회원 구독(MEMBER)' };
export const RULE_LABEL: Record<RuleCode, string> = { SALE_OPEN: '판매 오픈', CHECKOUT_ABANDON: '결제 이탈', SOLD_OUT_SIMILAR: '품절 유사 상품', CATEGORY_NEW: '관심 카테고리 신상품' };
export const RULES = Object.keys(RULE_LABEL) as RuleCode[];
/** 캠페인 상태 배지: [문구, 진행 중(초록)인지] */
export const campaignStatusLabel = (status: string): [string, boolean] => status === 'ACTIVE' ? ['진행 중', true] : status === 'PAUSED' ? ['일시정지', false] : status === 'DRAFT' ? ['준비', false] : [status, false];
export const definitionStatusLabel = (status: string): [string, boolean] => status === 'ACTIVE' ? ['사용 중', true] : status === 'RETIRED' ? ['종료', false] : [status, false];
/** 캠페인 종류가 받을 수 있는 정의 범위(서버 규칙과 같다) */
export const scopeFor = (kind: CampaignKind): 'ALL' | 'PRODUCT' => kind === 'TARGETED' ? 'PRODUCT' : 'ALL';
export const definitionsFor = (kind: CampaignKind, defs: CouponDefinitionDto[]) => defs.filter(d => d.status === 'ACTIVE' && d.scope === scopeFor(kind));

/* ── 입력 → 요청 본문(서버 검증을 화면에서 먼저 확인) ── */
const digits = (s: string) => s.replace(/[^\d]/g, '');
const num = (s: string) => { const d = digits(s); return d ? Number(d) : null; };
/** datetime-local 값(이 기기 시간대) → ISO(UTC). 비었거나 틀리면 null */
export const isoFromLocal = (v: string) => { if (!v) return null; const t = new Date(v).getTime(); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
/** ms → datetime-local 값 */
export const localInput = (ms: number) => { const d = new Date(ms), p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

export interface DefinitionForm { name: string; discountType: 'AMOUNT' | 'RATE'; amount: string; rate: string; maxDiscount: string; minItemsAmount: string; scope: 'ALL' | 'PRODUCT'; validityMode: 'FIXED' | 'RELATIVE'; validFrom: string; validUntil: string; validDays: string; noticeHours: string }
/** 회원 쿠폰 기본 예시: 정액 3,000원, 최소 상품 금액 10,000원, 발급 후 30일 */
export const DEFAULT_DEFINITION: DefinitionForm = { name: '', discountType: 'AMOUNT', amount: '3000', rate: '', maxDiscount: '', minItemsAmount: '10000', scope: 'ALL', validityMode: 'RELATIVE', validFrom: '', validUntil: '', validDays: '30', noticeHours: '' };
export function definitionRequest(f: DefinitionForm): { body?: DefinitionBody; errors: Record<string, string> } {
  const e: Record<string, string> = {};
  const name = f.name.trim();
  if (!name) e.name = '이름을 입력해 주세요.'; else if (name.length > 60) e.name = '60자 이내로 입력해 주세요.';
  const amount = num(f.amount), max = num(f.maxDiscount), min = num(f.minItemsAmount);
  const rate = f.rate.trim() ? Number(f.rate.trim()) : NaN;
  if (f.discountType === 'AMOUNT' && !(amount && amount > 0)) e.amount = '1원 이상 입력해 주세요.';
  if (f.discountType === 'RATE') {
    if (!(rate > 0 && rate <= 100) || Math.round(rate * 100) !== rate * 100) e.rateBps = '0.01~100 사이로 입력해 주세요.';
    if (!(max && max > 0)) e.maxDiscount = '1원 이상 입력해 주세요.';
  }
  const from = isoFromLocal(f.validFrom), until = isoFromLocal(f.validUntil), days = num(f.validDays), hours = num(f.noticeHours);
  if (f.validityMode === 'FIXED') {
    if (!from) e.validFrom = '시작 시각을 골라 주세요.';
    if (!until) e.validUntil = '끝 시각을 골라 주세요.';
    else if (from && Date.parse(from) >= Date.parse(until)) e.validUntil = '시작보다 뒤로 골라 주세요.';
  } else if (!(days && days > 0)) e.validMinutes = '1일 이상 입력해 주세요.';
  if (f.noticeHours.trim() && !(hours && hours > 0)) e.noticeLeadMinutes = '1시간 이상 입력하거나 비워 주세요.';
  if (Object.keys(e).length) return { errors: e };
  return { errors: e, body: {
    name, discountType: f.discountType,
    amount: f.discountType === 'AMOUNT' ? amount : null,
    rateBps: f.discountType === 'RATE' ? Math.round(rate * 100) : null,
    maxDiscount: f.discountType === 'RATE' ? max : null,
    minItemsAmount: min ?? 0, scope: f.scope, validityMode: f.validityMode,
    validFrom: f.validityMode === 'FIXED' ? from : null, validUntil: f.validityMode === 'FIXED' ? until : null,
    validMinutes: f.validityMode === 'RELATIVE' ? days! * 1440 : null,
    noticeLeadMinutes: hours ? hours * 60 : null,
  } };
}

export interface CampaignForm { kind: CampaignKind; definitionId: string; ruleCode: RuleCode | ''; code: string; totalBudget: string; startsAt: string; endsAt: string; demo: boolean }
export const CODE_PATTERN = /^[A-Z0-9_]{1,40}$/;
export function campaignRequest(f: CampaignForm, defs: CouponDefinitionDto[]): { body?: CampaignBody; errors: Record<string, string> } {
  const e: Record<string, string> = {};
  const code = f.code.trim();
  if (!CODE_PATTERN.test(code)) e.code = '영문 대문자, 숫자, 밑줄(_)로 40자 이내로 입력해 주세요.';
  const def = definitionsFor(f.kind, defs).find(d => d.id === f.definitionId);
  if (!def) e.definitionId = f.kind === 'TARGETED' ? '특정 상품 범위의 쿠폰 정의를 골라 주세요.' : '전체 상품 범위의 쿠폰 정의를 골라 주세요.';
  if (f.kind === 'TARGETED' && !f.ruleCode) e.ruleCode = '맞춤 규칙을 골라 주세요.';
  const budget = num(f.totalBudget);
  if (!(budget && budget > 0)) e.totalBudget = '1장 이상 입력해 주세요.';
  else if (budget > 2_147_483_647) e.totalBudget = '너무 큰 수예요.';
  const starts = isoFromLocal(f.startsAt), ends = isoFromLocal(f.endsAt);
  if (!starts) e.startsAt = '시작 시각을 골라 주세요.';
  if (!ends) e.endsAt = '끝 시각을 골라 주세요.';
  else if (starts && Date.parse(starts) >= Date.parse(ends)) e.endsAt = '시작보다 뒤로 골라 주세요.';
  if (Object.keys(e).length) return { errors: e };
  return { errors: e, body: { code, definitionId: def!.id, kind: f.kind, ruleCode: f.kind === 'TARGETED' ? f.ruleCode as RuleCode : null, totalBudget: budget!, perAccountLimit: 1, startsAt: starts!, endsAt: ends!, demo: f.demo } };
}

/** 서버 오류 → 칸별 오류와 시트 안내(400 violations는 칸, 나머지는 코드별 문구) */
export function adminCouponError(e: unknown, kind: 'definition' | 'campaign'): { fields: Record<string, string>; message: string } {
  const fields = Object.fromEntries(Object.entries(fieldErrors(e)).map(([k, v]) => [k.split('.').pop() ?? k, v]));
  if (Object.keys(fields).length) return { fields, message: '' };
  if (e instanceof ApiError) {
    if (e.code === 'COMMON_DATA_CONFLICT' && kind === 'campaign') return { fields: { code: '이미 쓰고 있는 캠페인 코드예요.' }, message: '' };
    if (e.code === 'COUPON_NOT_FOUND' && kind === 'campaign') return { fields: { definitionId: '쿠폰 정의를 찾을 수 없어요. 목록을 새로 고친 뒤 다시 골라 주세요.' }, message: '' };
    if (e.code === 'COUPON_INVALID') return { fields: {}, message: kind === 'campaign' ? '캠페인 조건이 맞지 않아요. 종류와 정의 범위, 규칙, 기간을 확인해 주세요.' : '쿠폰 조건이 맞지 않아요. 할인, 적용 범위, 사용 기간을 확인해 주세요.' };
    if (e.status === 403) return { fields: {}, message: '운영자만 할 수 있어요.' };
  }
  return { fields: {}, message: errorMessage(e) };
}
/** 활성화, 일시정지, 종료 실패 안내(토스트) */
export function adminActionError(e: unknown) {
  if (e instanceof ApiError && (e.code === 'CAMPAIGN_NOT_FOUND' || e.code === 'COUPON_NOT_FOUND')) return '대상을 찾을 수 없어요. 목록을 새로 고쳐 주세요.';
  if (e instanceof ApiError && e.code === 'COMMON_OPTIMISTIC_LOCK_CONFLICT') return '다른 요청이 먼저 바꿨어요. 목록을 새로 고쳐 주세요.';
  return errorMessage(e);
}
