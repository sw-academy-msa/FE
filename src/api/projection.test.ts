import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './client';
import { retryProjection } from './projection';

afterEach(() => vi.useRealTimers());
const notFound = () => new ApiError('문의를 찾을 수 없어요.', 404, 'ORDER_QUERY_NOT_FOUND');

describe('조회 모델 반영 대기', () => {
  it('작성 직후 조회 모델이 404면 잠시 뒤 다시 읽어 사용자가 다시 시도를 누르지 않아도 된다', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const p = retryProjection(async () => { calls++; if (calls < 3) throw notFound(); return 'ok'; });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe('ok');
    expect(calls).toBe(3);
  });
  it('네트워크 단절이나 서버 오류 같은 일시 실패는 한 번만 자동으로 다시 시도한다', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const p = retryProjection(async () => { calls++; throw new ApiError('잠시 후', 503, 'TEMP'); });
    const settled = p.catch(e => e);
    await vi.runAllTimersAsync();
    expect((await settled as ApiError).status).toBe(503);
    expect(calls).toBe(2);
  });
  it('권한 오류 같은 다른 실패와 취소는 기다리지 않고 그대로 알린다', async () => {
    let calls = 0;
    await expect(retryProjection(async () => { calls++; throw new ApiError('권한 없음', 403, 'COMMON_FORBIDDEN'); })).rejects.toMatchObject({ status: 403 });
    expect(calls).toBe(1);
    const c = new AbortController(); c.abort();
    await expect(retryProjection(async () => { throw notFound(); }, c.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('계속 404면 몇 번만 기다리고 마지막 오류를 알린다', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const settled = retryProjection(async () => { calls++; throw notFound(); }).catch(e => e);
    await vi.runAllTimersAsync();
    expect((await settled as ApiError).status).toBe(404);
    expect(calls).toBe(4);
  });
});
