/**
 * 판매자 입점 신청 입력 검사와 실패 안내. 규칙은 Account `SellerApplicationRequest`와 같다.
 * 사용자에게는 어느 칸을 어떻게 고치면 되는지만 알린다. HTTP 상태 코드·서버 오류 코드·영문 검증 문구는 보여 주지 않는다.
 */
import { ApiError } from './api/client';

export type ApplyField = 'certificate' | 'displayName' | 'name' | 'email' | 'phone' | 'bank' | 'account' | 'shippingAddress' | 'returnAddress';
export interface ApplyValues { displayName?: string; name?: string; email?: string; phone?: string; bank?: string; account?: string; shippingPostal?: string; shippingAddress?: string; returnPostal?: string; returnAddress?: string }
export type ApplyProblems = Partial<Record<ApplyField, string>>;

/** 화면 칸 이름(안내 문구의 '확인이 필요한 항목'에 쓴다). 화면 순서와 같다 */
export const APPLY_LABELS: Record<ApplyField, string> = { certificate: '사업자등록증 PDF', displayName: '판매자 표시 이름', name: '담당자 이름', email: '이메일', phone: '연락처', bank: '정산 은행', account: '정산 계좌번호', shippingAddress: '출고지', returnAddress: '반품 주소' };
const ORDER = Object.keys(APPLY_LABELS) as ApplyField[];

/** 칸별로 다시 입력해 달라는 안내. 서버가 형식 오류를 돌려줄 때도 서버 문구 대신 이 문구를 쓴다 */
const FIX: Record<ApplyField, string> = {
  certificate: '사업자등록증 PDF를 다시 첨부해 주세요.',
  displayName: '판매자 표시 이름은 100자 이내로 입력해 주세요.',
  name: '담당자 이름을 100자 이내로 입력해 주세요.',
  email: '이메일 주소를 확인해 주세요. (예: hong@example.com)',
  phone: '연락처를 숫자로 입력해 주세요. (예: 010-1234-5678)',
  bank: '정산 은행을 선택해 주세요.',
  account: '정산 계좌번호는 숫자만 6~30자리로 입력해 주세요. (예: 110123456789)',
  shippingAddress: '출고지를 주소 검색으로 다시 선택해 주세요.',
  returnAddress: '반품 주소를 주소 검색으로 다시 선택해 주세요.',
};

const text = (v?: string) => (v ?? '').trim();
/** 서버 연락처 규칙(0으로 시작, 하이픈 선택) */
const PHONE = /^0[0-9]{1,2}-?[0-9]{3,4}-?[0-9]{4}$/;
/** 띄어쓰기·점·괄호를 지우고 +82는 0으로 바꾼다. 하이픈은 서버가 받으므로 둔다 */
export const normalizePhone = (v?: string) => text(v).replace(/[\s.()]/g, '').replace(/^\+?82-?/, '0').replace(/^00/, '0');
/** 계좌번호는 숫자만 보낸다(하이픈·띄어쓰기 제거) */
export const normalizeAccount = (v?: string) => text(v).replace(/[\s-]/g, '');

/** 제출 전 검사. 빈 객체면 제출할 수 있다 */
export function applicationProblems(f: ApplyValues, hasCertificate: boolean): ApplyProblems {
  const p: ApplyProblems = {};
  if (!hasCertificate) p.certificate = '사업자등록증 PDF를 첨부해 주세요.';
  if (text(f.displayName).length > 100) p.displayName = FIX.displayName;
  if (!text(f.name)) p.name = '담당자 이름을 입력해 주세요.'; else if (text(f.name).length > 100) p.name = FIX.name;
  const email = text(f.email);
  if (!email) p.email = '이메일을 입력해 주세요.'; else if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) p.email = FIX.email;
  const phone = normalizePhone(f.phone);
  if (!phone) p.phone = '연락처를 입력해 주세요.'; else if (!PHONE.test(phone)) p.phone = FIX.phone;
  if (!text(f.bank)) p.bank = FIX.bank;
  const account = normalizeAccount(f.account);
  if (!account) p.account = '정산 계좌번호를 입력해 주세요.'; else if (!/^[0-9]{6,30}$/.test(account)) p.account = FIX.account;
  if (!text(f.shippingAddress)) p.shippingAddress = '출고지를 주소 검색으로 선택해 주세요.'; else if (!/^\d{5}$/.test(text(f.shippingPostal))) p.shippingAddress = '출고지 우편번호가 비어 있어요. 주소 검색으로 다시 선택해 주세요.';
  if (!text(f.returnAddress)) p.returnAddress = '반품 주소를 주소 검색으로 선택해 주세요.'; else if (!/^\d{5}$/.test(text(f.returnPostal))) p.returnAddress = '반품 주소 우편번호가 비어 있어요. 주소 검색으로 다시 선택해 주세요.';
  return p;
}

/** 요약 문구: 확인할 칸 이름을 화면 순서대로. 고치는 방법은 각 칸 아래에 따로 보인다 */
export function problemSummary(p: ApplyProblems): string {
  const keys = ORDER.filter(k => p[k]);
  if (!keys.length) return '';
  return `확인이 필요한 항목이 ${keys.length > 1 ? `${keys.length}개 ` : ''}있어요: ${keys.map(k => APPLY_LABELS[k]).join(', ')}`;
}
/** 문제가 있는 첫 칸(화면 순서) — 그 칸으로 이동한다 */
export const firstProblem = (p: ApplyProblems): ApplyField | undefined => ORDER.find(k => p[k]);

/** 서버 검증 필드 → 화면 칸 */
function fieldOf(serverField: string): ApplyField | undefined {
  const f = serverField.replace(/^application\./, '');
  if (f.startsWith('dispatchAddress')) return 'shippingAddress';
  if (f.startsWith('returnAddress')) return 'returnAddress';
  return ({ sellerDisplayName: 'displayName', contactName: 'name', contactEmail: 'email', contactPhone: 'phone', bankName: 'bank', bankAccountNumber: 'account', certificate: 'certificate' } as Record<string, ApplyField>)[f];
}

/** 제출 실패 → 사용자 안내 문구와 표시할 칸. 서버 문구·상태 코드를 그대로 쓰지 않는다 */
export function applicationFailure(e: unknown): { message: string; fields: ApplyProblems } {
  if (!(e instanceof ApiError)) {
    // 화면에서 만든 한국어 오류(첨부 파일 읽기 실패 등)만 그대로 쓰고, 브라우저 영문 오류(TypeError 등)는 안내 문구로 바꾼다
    return { message: e instanceof Error && /[가-힣]/.test(e.message) ? e.message : '신청을 보내지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.', fields: {} };
  }
  const fields: ApplyProblems = {};
  for (const v of e.violations) { const k = fieldOf(v.field); if (k) fields[k] = FIX[k]; }
  const one = (k: ApplyField, message: string) => { const fields = { [k]: message } as ApplyProblems; return { message: problemSummary(fields), fields }; };
  switch (e.code) {
    case 'NETWORK': return { message: '인터넷 연결이 불안정해 신청을 보내지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.', fields: {} };
    case 'SELLER_ALREADY_APPLIED': return { message: '이미 심사 중이거나 승인된 입점 신청이 있어요. 마이페이지에서 진행 상태를 확인해 주세요.', fields: {} };
    case 'SELLER_BUYER_REQUIRED': return { message: '이메일 인증을 마친 구매자 계정으로 로그인해야 신청할 수 있어요.', fields: {} };
    case 'SELLER_CERTIFICATE_REQUIRED': case 'COMMON_MISSING_PARAMETER':
      return one('certificate', '사업자등록증 파일이 함께 전송되지 않았어요. PDF를 다시 첨부한 뒤 신청해 주세요.');
    case 'SELLER_INVALID_CERTIFICATE': return one('certificate', '사업자등록증을 읽을 수 없어요. 손상되지 않은 PDF 파일로 다시 첨부해 주세요.');
    case 'COMMON_PAYLOAD_TOO_LARGE': return one('certificate', '사업자등록증 PDF는 5MB 이하만 올릴 수 있어요.');
    case 'COMMON_INVALID_REQUEST_BODY': return { message: '신청 정보를 보내지 못했어요. 화면을 새로고침한 뒤 다시 신청해 주세요.', fields: {} };
    case 'COMMON_UNAUTHORIZED': return { message: '로그인이 끝났어요. 다시 로그인한 뒤 신청해 주세요.', fields: {} };
    case 'COMMON_FORBIDDEN': case 'COMMON_CSRF_REJECTED': return { message: '신청 권한을 확인하지 못했어요. 다시 로그인한 뒤 신청해 주세요.', fields: {} };
  }
  if (Object.keys(fields).length) return { message: problemSummary(fields), fields };
  if (e.status === 413) return one('certificate', '사업자등록증 PDF는 5MB 이하만 올릴 수 있어요.');
  if (e.status === 401) return { message: '로그인이 끝났어요. 다시 로그인한 뒤 신청해 주세요.', fields: {} };
  if (e.status === 400) return { message: '입력한 정보 중 형식이 맞지 않는 항목이 있어요. 연락처·이메일·계좌번호를 다시 확인해 주세요.', fields: {} };
  return { message: '지금은 신청을 접수하지 못했어요. 잠시 후 다시 시도해 주세요.', fields: {} };
}
