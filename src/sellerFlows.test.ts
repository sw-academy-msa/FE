import { afterEach, describe, expect, it } from 'vitest';
import { api } from './api/client';
import { requestCorrection } from './api/admin';
import { applicationFromApi } from './api/seller';
import type { SellerApplicationDto } from './api/types';
import { correctionPatch, correctionProblems, correctionRequestProblem, deadlineOf, reviewSummary } from './sellerFlows';
import type { CorrectionValues } from './sellerFlows';

type Call = { url: string; method: string; body?: unknown; auth: string | null };
function fake(handler: (c: Call) => { status?: number; data?: unknown; error?: { code: string } }) {
  const calls: Call[] = [];
  api.configure({ mock: false, fetch: (async (u: RequestInfo | URL, init?: RequestInit) => {
    const c = { url: String(u), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined, auth: new Headers(init?.headers).get('Authorization') }; calls.push(c);
    const r = handler(c);
    return new Response(JSON.stringify(r.error ? { code: r.error.code, message: 'x' } : { success: true, data: r.data }), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch });
  return calls;
}
afterEach(() => { api.configure({ fetch: undefined }); api.setAccessToken(null); });

const values: CorrectionValues = { displayName: ' 새 스토어 ', name: '홍길동', email: 'h@x.kr', phone: '010-1234-5678', bank: '신한은행', account: '110-123-456789', dispatchPostal: '04066', dispatchAddress: '서울 도로 1', dispatchDetail: '3층', returnPostal: '', returnAddress: '', returnDetail: '' };
const dto = (o: Partial<SellerApplicationDto> = {}): SellerApplicationDto => ({ applicationId: 'ap1', accountId: 'u', attemptNumber: 1, sellerDisplayName: '스토어', contactName: '홍', contactEmail: 'h@x.kr', contactPhone: '01012345678', bankName: '신한', maskedBankAccount: '***789', dispatchAddress: { postalCode: '04066', roadAddress: '서울', detailAddress: null }, returnAddress: { postalCode: '04066', roadAddress: '서울', detailAddress: null }, status: 'PENDING', submittedAt: '2026-01-01T00:00:00Z', reviewedAt: null, reviewedBy: null, rejectionReason: null, certificateReviewed: false, certificateRecheck: false, previousApplicationId: null, ...o } as SellerApplicationDto);

describe('판매자 입점 보완 제출', () => {
  it('서버가 요청한 항목만 제출 본문에 담는다', () => {
    expect(correctionPatch(['STORE_NAME', 'BANK_ACCOUNT', 'DISPATCH_ADDRESS'], values)).toEqual({ sellerDisplayName: '새 스토어', bankAccount: { bankName: '신한은행', number: '110-123-456789' }, dispatchAddress: { postalCode: '04066', roadAddress: '서울 도로 1', detailAddress: '3층' } });
    expect(correctionPatch(['CONTACT'], values)).toEqual({ contact: { name: '홍길동', email: 'h@x.kr', phone: '010-1234-5678' } });
    expect(correctionPatch(['CERTIFICATE'], values)).toEqual({});
  });
  it('요청 항목마다 빈 값과 형식을 확인한다', () => {
    expect(correctionProblems(['CERTIFICATE', 'RETURN_ADDRESS'], values, false)).toEqual({ CERTIFICATE: expect.stringContaining('PDF'), RETURN_ADDRESS: expect.stringContaining('반품 주소') });
    expect(correctionProblems(['BANK_ACCOUNT'], { ...values, account: '12' }, true).BANK_ACCOUNT).toContain('6~30');
    expect(correctionProblems(['CONTACT'], { ...values, phone: '123' }, true).CONTACT).toContain('연락처');
    expect(correctionProblems(['STORE_NAME', 'CONTACT', 'BANK_ACCOUNT', 'DISPATCH_ADDRESS'], values, true)).toEqual({});
  });
  it('보완 요청 항목의 서버 값과 상태를 화면 신청에 남긴다(하드코딩하지 않음)', () => {
    const app = applicationFromApi(dto({ status: 'CHANGES_REQUESTED' }), 'u', { id: 'c', applicationId: 'ap1', deadline: '2026-01-09T00:00:00Z', state: 'OPEN', items: [{ field: 'BANK_ACCOUNT', reason: '예금주 불일치' }], submittedApplicationId: null });
    expect(app).toMatchObject({ status: 'rejected', apiStatus: 'CHANGES_REQUESTED', correctionState: 'OPEN', rejectionItems: [{ code: 'BANK_ACCOUNT', field: '정산 계좌번호', reason: '예금주 불일치' }] });
    expect(applicationFromApi(dto({ status: 'EXPIRED' }), 'u').status).toBe('rejected');
  });
});

describe('운영자 입점 보완 요청', () => {
  it('항목, 사유, 미래 기한을 확인하고 서버 형식(deadline ISO, items)으로 보낸다', async () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(correctionRequestProblem([], deadlineOf('2026-01-08'), now)).toContain('하나 이상');
    expect(correctionRequestProblem([{ field: 'CONTACT', reason: ' ' }], deadlineOf('2026-01-08'), now)).toContain('담당자');
    expect(correctionRequestProblem([{ field: 'CONTACT', reason: '연락 불가' }], deadlineOf('2025-12-31'), now)).toContain('오늘 이후');
    expect(correctionRequestProblem([{ field: 'CONTACT', reason: '연락 불가' }], deadlineOf('2026-01-08'), now)).toBe('');
    expect(deadlineOf('2026-01-08').toISOString()).toBe('2026-01-08T14:59:59.000Z');
    const calls = fake(() => ({ data: { id: 'c', applicationId: 'ap1', deadline: '2026-01-08T14:59:59Z', state: 'OPEN', items: [], submittedApplicationId: null } }));
    await requestCorrection('ap1', deadlineOf('2026-01-08'), [{ field: 'CONTACT', reason: '연락 불가' }]);
    expect(calls[0]).toMatchObject({ method: 'POST', body: { deadline: '2026-01-08T14:59:59.000Z', items: [{ field: 'CONTACT', reason: '연락 불가' }] } });
    expect(calls[0].url).toMatch(/\/api\/v1\/admin\/seller-applications\/ap1\/correction-request$/);
  });
});

describe('판매 제한과 재심사', () => {
  it('판매 제한 상태와 최신 신청으로 안내와 재제출 가능 여부를 정한다', () => {
    expect(reviewSummary({ salesRestricted: true, application: dto({ status: 'PENDING', certificateRecheck: true }), correction: null })).toMatchObject({ title: expect.stringContaining('재심사 중'), canSubmit: false });
    expect(reviewSummary({ salesRestricted: true, application: dto({ status: 'REJECTED', rejectionReason: '서류 불명확' }), correction: null })).toMatchObject({ body: expect.stringContaining('서류 불명확'), canSubmit: true, tone: 'red' });
    expect(reviewSummary({ salesRestricted: true, application: dto({ status: 'CHANGES_REQUESTED' }), correction: null }).canSubmit).toBe(false);
    expect(reviewSummary({ salesRestricted: false, application: dto({ status: 'APPROVED' }), correction: null })).toMatchObject({ tone: 'green', canSubmit: true });
  });
});
