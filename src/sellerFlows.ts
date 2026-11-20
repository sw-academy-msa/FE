/**
 * 입점 보완, 판매 제한 재심사, 관심사·맞춤 추천 프로필 화면의 판단 로직(화면 없이 테스트할 수 있게 분리).
 * 화면: pages/sellerCorrection.tsx, pages/adminCorrection.tsx, pages/sellerReview.tsx, pages/interests.tsx
 */
import type { AnalyticsProfileDto, CorrectionField, CorrectionPatch, SellerApplicationDto, fetchReviewStatus } from './api';
import { FIELD_LABEL } from './api/seller';
import { kstDay } from './dates';
import { normalizePhone } from './sellerApply';

/** hooks.ts의 dateTime과 같은 형식(hooks.ts는 store를 불러와 여기서 쓰지 않는다) */
const dateTime = (value: number) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(value);

export const CORRECTION_FIELDS: CorrectionField[] = ['CERTIFICATE', 'STORE_NAME', 'CONTACT', 'BANK_ACCOUNT', 'DISPATCH_ADDRESS', 'RETURN_ADDRESS'];
export interface CorrectionValues {
  displayName: string; name: string; email: string; phone: string; bank: string; account: string;
  dispatchPostal: string; dispatchAddress: string; dispatchDetail: string; returnPostal: string; returnAddress: string; returnDetail: string;
}
const PHONE = /^0[0-9]{1,2}-?[0-9]{3,4}-?[0-9]{4}$/;

/** 요청 항목별 입력 확인. 키는 서버 항목 값 */
export function correctionProblems(codes: CorrectionField[], v: CorrectionValues, hasCertificate: boolean): Partial<Record<CorrectionField, string>> {
  const p: Partial<Record<CorrectionField, string>> = {};
  const has = (c: CorrectionField) => codes.includes(c);
  if (has('CERTIFICATE') && !hasCertificate) p.CERTIFICATE = '사업자등록증 PDF를 다시 첨부해 주세요.';
  if (has('STORE_NAME') && (!v.displayName.trim() || v.displayName.trim().length > 100)) p.STORE_NAME = '판매자 표시 이름을 100자 이내로 입력해 주세요.';
  if (has('CONTACT')) {
    if (!v.name.trim() || v.name.trim().length > 100) p.CONTACT = '담당자 이름을 입력해 주세요.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim()) || v.email.trim().length > 320) p.CONTACT = '이메일 형식을 확인해 주세요.';
    else if (!PHONE.test(normalizePhone(v.phone))) p.CONTACT = '연락처를 010-1234-5678 형식으로 입력해 주세요.';
  }
  if (has('BANK_ACCOUNT')) {
    if (!v.bank.trim()) p.BANK_ACCOUNT = '정산 은행을 선택해 주세요.';
    else if (!/^[0-9]{6,30}$/.test(v.account.replace(/\D/g, ''))) p.BANK_ACCOUNT = '계좌번호를 숫자 6~30자리로 입력해 주세요.';
  }
  if (has('DISPATCH_ADDRESS') && (!/^\d{5}$/.test(v.dispatchPostal.trim()) || !v.dispatchAddress.trim())) p.DISPATCH_ADDRESS = '출고지를 주소 검색으로 선택해 주세요.';
  if (has('RETURN_ADDRESS') && (!/^\d{5}$/.test(v.returnPostal.trim()) || !v.returnAddress.trim())) p.RETURN_ADDRESS = '반품 주소를 주소 검색으로 선택해 주세요.';
  return p;
}
/** 요청 항목만 담은 제출 본문 */
export function correctionPatch(codes: CorrectionField[], v: CorrectionValues): CorrectionPatch {
  const has = (c: CorrectionField) => codes.includes(c);
  return {
    ...(has('STORE_NAME') ? { sellerDisplayName: v.displayName.trim() } : {}),
    ...(has('CONTACT') ? { contact: { name: v.name.trim(), email: v.email.trim(), phone: normalizePhone(v.phone) } } : {}),
    ...(has('BANK_ACCOUNT') ? { bankAccount: { bankName: v.bank.trim(), number: v.account } } : {}),
    ...(has('DISPATCH_ADDRESS') ? { dispatchAddress: { postalCode: v.dispatchPostal, roadAddress: v.dispatchAddress, detailAddress: v.dispatchDetail } } : {}),
    ...(has('RETURN_ADDRESS') ? { returnAddress: { postalCode: v.returnPostal, roadAddress: v.returnAddress, detailAddress: v.returnDetail } } : {}),
  };
}


export const ymd = (t: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(t);
/** 마감일(YYYY-MM-DD, 한국 시간) → 그날 23:59:59 KST */
export const deadlineOf = (day: string) => new Date(`${day}T23:59:59+09:00`);

/** 보낼 항목 확인: 1개 이상, 사유 1~500자, 마감은 지금 이후 */
export function correctionRequestProblem(items: { field: CorrectionField; reason: string }[], deadline: Date, now = Date.now()): string {
  if (!items.length) return '보완할 항목을 하나 이상 골라 주세요.';
  const empty = items.find(i => !i.reason.trim());
  if (empty) return `${FIELD_LABEL[empty.field]} 보완 사유를 입력해 주세요.`;
  if (items.some(i => i.reason.trim().length > 500)) return '보완 사유는 500자 이하로 입력해 주세요.';
  if (!Number.isFinite(deadline.getTime()) || deadline.getTime() <= now) return '보완 기한은 오늘 이후 날짜로 골라 주세요.';
  return '';
}


export type ReviewStatus = Awaited<ReturnType<typeof fetchReviewStatus>>;
/** 최신 신청 상태를 판매자에게 보여 줄 문구로 */
export function reviewSummary(r: ReviewStatus): { title: string; body: string; tone: 'red' | 'blue' | 'green'; canSubmit: boolean } {
  const a: SellerApplicationDto | null = r.application;
  const busy = a?.status === 'PENDING' || a?.status === 'CHANGES_REQUESTED';
  if (a?.status === 'CHANGES_REQUESTED') return { title: '보완 요청을 받았어요', body: '입점 심사 화면에서 요청받은 항목을 보완해 주세요. 보완이 승인되면 판매 제한이 풀려요.', tone: 'red', canSubmit: false };
  if (r.salesRestricted && a?.status === 'PENDING') return { title: '사업자등록증 재심사 중이에요', body: '재심사가 끝날 때까지 새 상품 등록과 판매 업무가 제한돼요. 결과는 알림으로 알려드려요.', tone: 'blue', canSubmit: false };
  if (r.salesRestricted && a?.status === 'REJECTED') return { title: '재심사를 통과하지 못했어요', body: a.rejectionReason ? `사유: ${a.rejectionReason}` : '사유를 확인하고 사업자등록증을 다시 제출해 주세요.', tone: 'red', canSubmit: true };
  if (r.salesRestricted) return { title: '판매가 제한돼 있어요', body: '사업자등록증을 다시 제출해 재심사를 받으면 판매 제한이 풀려요.', tone: 'red', canSubmit: !busy };
  return { title: '정상적으로 판매할 수 있어요', body: '사업자 정보가 바뀌었다면 사업자등록증을 다시 제출해 재심사를 받아 주세요.', tone: 'green', canSubmit: !busy };
}


/** 프로필을 화면 문구로: 미참여, 집계 전, 결과 */
export function profileView(p: AnalyticsProfileDto): { kind: 'off' | 'empty' | 'ready'; title: string; body: string } {
  if (!p.analyticsEnabled) return { kind: 'off', title: '맞춤 추천 분석에 참여하지 않았어요', body: '알림 설정에서 맞춤 상품 알림을 켜면 조회 기록을 분석해 관심 카테고리를 알려드려요.' };
  if (!p.categoryName) return { kind: 'empty', title: '아직 분석된 관심 카테고리가 없어요', body: `상품을 둘러보면 다음 집계에 반영돼요.${p.profileAsOf ? ` (${kstDay(Date.parse(p.profileAsOf))} 기준)` : ''}` };
  return { kind: 'ready', title: p.categoryName, body: `최근 ${p.views ?? 0}번 살펴봤어요${p.lastViewedAt ? ` · 마지막 ${dateTime(Date.parse(p.lastViewedAt))}` : ''}` };
}

