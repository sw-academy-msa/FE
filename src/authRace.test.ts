import { afterEach, expect, it, vi } from 'vitest';
vi.mock('./push', () => ({ disablePush: vi.fn(async () => {}), resyncPush: vi.fn(async () => {}) }));
vi.mock('./analytics', () => ({ applyAnalyticsId: vi.fn(), syncAnalyticsIdentity: vi.fn(async () => null) }));
const mem = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) });
vi.stubGlobal('sessionStorage', { getItem: () => null, removeItem: () => {} });
vi.stubGlobal('window', { addEventListener: () => {} });
vi.stubGlobal('navigator', {});
const { api } = await import('./api');
const { login, logout, signedIn } = await import('./auth');
const { getState } = await import('./store');
afterEach(() => { api.configure({ fetch: undefined }); vi.restoreAllMocks(); });

it('로그아웃이 아직 처리 중일 때 재로그인은 완료를 기다리고 온보딩 상태를 유지한다', async () => {
  let finish!: () => void;
  const post = vi.spyOn(api, 'post').mockImplementation(async path => {
    if (path.endsWith('/logout')) return new Promise<never>(resolve => { finish = () => resolve(null as never); });
    return { accessToken: 'new', accountId: 'seller-real', roles: ['SELLER'] } as never;
  });
  vi.spyOn(api, 'get').mockResolvedValue({ name: '판매자' });
  const signingOut = logout();
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  const signingIn = login('seller@example.com', 'password');
  await new Promise(resolve => setTimeout(resolve, 0));
  const loginStartedEarly = post.mock.calls.some(([path]) => path.endsWith('/login'));
  finish();
  await signingOut; await signingIn;
  expect(loginStartedEarly).toBe(false);
  expect(signedIn(getState())).toBe(true);
  expect(getState().auth?.onboarded).toBe(true);
  expect(api.getAccessToken()).toBe('new');
});
