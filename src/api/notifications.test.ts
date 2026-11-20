import { afterEach, describe, expect, it } from 'vitest';
import { ApiError, api } from './client';
import { listProductAlerts, productAlertError, subscribeProductAlert, unsubscribeProductAlert } from './notifications';

type Call = { url: string; method: string; body: unknown };
function fake(data: unknown) {
  const calls: Call[] = [];
  api.configure({ mock: false, fetch: (async (u: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(u), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify({ success: true, code: 'COMMON_SUCCESS', message: '', data }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch });
  return calls;
}
afterEach(() => api.configure({ fetch: undefined }));

describe('상품 알림 API', () => {
  it('목록·상태·신청·취소 경로(일반 Gateway)', async () => {
    let calls = fake([{ productId: 'p1', subscribed: true, createdAt: 'x' }]);
    expect(await listProductAlerts()).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'GET' }); expect(calls[0].url).toMatch(/^\/api\/v1\/notifications\/product-alerts$/);
    calls = fake({ productId: 'p1', subscribed: true, createdAt: 'x' });
    await subscribeProductAlert('p 1'); expect(calls[0]).toMatchObject({ method: 'PUT', body: undefined }); expect(calls[0].url).toMatch(/\/product-alerts\/p%201$/);
    calls = fake(null);
    await unsubscribeProductAlert('p1'); expect(calls[0]).toMatchObject({ method: 'DELETE' }); expect(calls[0].url).toMatch(/\/product-alerts\/p1$/);
  });
  it('거절 코드별 안내 문구', () => {
    expect(productAlertError(new ApiError('x', 400, 'NOTIFICATION_INVALID_REQUEST'))).toContain('본인 상품');
    expect(productAlertError(new ApiError('x', 409, 'NOTIFICATION_CONFLICT'))).toContain('200개');
    expect(productAlertError(new ApiError('x', 404, 'NOTIFICATION_NOT_FOUND'))).toContain('잠시 후');
  });
});
