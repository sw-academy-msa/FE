import { describe, expect, it } from 'vitest';
import { ApiError } from './api/client';
import { applicationFailure, applicationProblems, firstProblem, normalizeAccount, normalizePhone, problemSummary } from './sellerApply';

const ok = { displayName: '', name: '홍길동', email: 'hong@example.com', phone: '010-1234-5678', bank: '신한은행', account: '110-123-456789', shippingPostal: '04524', shippingAddress: '서울 중구 세종대로 110', returnPostal: '04524', returnAddress: '서울 중구 세종대로 111' };
/** 사용자 문구에 기술 용어가 섞이지 않았는지 */
const plain = (m: string) => { expect(m).not.toMatch(/HTTP|\b[45]\d\d\b|COMMON_|SELLER_|NOTIFICATION_|violation|must|Error/i); expect(m).toMatch(/[가-힣]/); };

describe('입점 신청 입력 검사', () => {
  it('모두 맞으면 문제 없음(하이픈·띄어쓰기 허용)', () => {
    expect(applicationProblems(ok, true)).toEqual({});
    expect(applicationProblems({ ...ok, phone: '010 1234 5678', account: '110 123 456789' }, true)).toEqual({});
  });
  it('빈 칸은 칸 이름을 알려 주고, 첫 칸은 화면 순서', () => {
    const p = applicationProblems({ ...ok, name: ' ', phone: undefined, returnAddress: '' }, false);
    expect(Object.keys(p).sort()).toEqual(['certificate', 'name', 'phone', 'returnAddress'].sort());
    expect(firstProblem(p)).toBe('certificate');
    expect(problemSummary(p)).toBe('확인이 필요한 항목이 4개 있어요: 사업자등록증 PDF, 담당자 이름, 연락처, 반품 주소');
    expect(problemSummary({ phone: '연락처를 입력해 주세요.' })).toBe('확인이 필요한 항목이 있어요: 연락처');
  });
  it('서버와 같은 형식 규칙', () => {
    expect(applicationProblems({ ...ok, phone: '1234' }, true).phone).toContain('예: 010-1234-5678');
    expect(applicationProblems({ ...ok, email: 'hong@' }, true).email).toContain('예: hong@example.com');
    expect(applicationProblems({ ...ok, account: '12a45' }, true).account).toContain('6~30자리');
    expect(applicationProblems({ ...ok, shippingPostal: '' }, true).shippingAddress).toContain('우편번호');
  });
  it('연락처·계좌번호 정리', () => {
    expect(normalizePhone(' +82 10-1234-5678 ')).toBe('010-1234-5678');
    expect(normalizePhone('(010) 1234.5678')).toBe('01012345678');
    expect(normalizeAccount('110-123 456789')).toBe('110123456789');
  });
});

describe('입점 신청 실패 안내', () => {
  it('서버 형식 오류는 칸 이름으로, 서버 문구는 쓰지 않는다', () => {
    const r = applicationFailure(new ApiError('요청값이 올바르지 않습니다.', 400, 'COMMON_INVALID_REQUEST', 't', [{ field: 'contactPhone', message: 'must match "^0..."' }, { field: 'dispatchAddress.postalCode', message: 'must not be blank' }]));
    expect(Object.keys(r.fields).sort()).toEqual(['phone', 'shippingAddress']);
    expect(r.message).toBe('확인이 필요한 항목이 2개 있어요: 연락처, 출고지'); plain(r.fields.phone!);
  });
  it('코드별 안내와 알 수 없는 오류', () => {
    const cases: [number, string][] = [[400, 'COMMON_MISSING_PARAMETER'], [400, 'SELLER_CERTIFICATE_REQUIRED'], [400, 'SELLER_INVALID_CERTIFICATE'], [413, 'COMMON_PAYLOAD_TOO_LARGE'], [409, 'SELLER_ALREADY_APPLIED'], [403, 'SELLER_BUYER_REQUIRED'], [401, 'COMMON_UNAUTHORIZED'], [403, 'COMMON_CSRF_REJECTED'], [400, 'COMMON_INVALID_REQUEST_BODY'], [400, 'COMMON_INVALID_REQUEST'], [413, 'HTTP_413'], [502, 'HTTP_502'], [500, 'COMMON_INTERNAL_SERVER_ERROR'], [0, 'NETWORK']];
    for (const [status, code] of cases) plain(applicationFailure(new ApiError('Bad Request', status, code)).message);
    const missing = applicationFailure(new ApiError('x', 400, 'COMMON_MISSING_PARAMETER'));
    expect(missing.message).toBe('확인이 필요한 항목이 있어요: 사업자등록증 PDF'); expect(missing.fields.certificate).toContain('다시 첨부');
  });
  it('브라우저 영문 오류는 안내 문구로, 화면 한국어 오류는 그대로', () => {
    plain(applicationFailure(new TypeError('Failed to fetch')).message);
    expect(applicationFailure(new Error('첨부 파일을 찾을 수 없어요.')).message).toBe('첨부 파일을 찾을 수 없어요.');
  });
});
