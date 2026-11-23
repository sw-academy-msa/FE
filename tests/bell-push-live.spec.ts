import { expect, test, type Page } from '@playwright/test';

// 실제 API 모드 개발 서버에서 가짜 HTTP 응답으로 검증한다. 운영 데이터는 읽거나 변경하지 않는다.
test.skip(process.env.STOCKDROP_REAL_TEST !== 'true', '실제 API 모드 로컬 서버 전용');
// 아이폰 홈 화면 앱(standalone): 서버는 iOS 웹 푸시만 받는다
test.use({ viewport: { width: 402, height: 874 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1' });

type Push = { permission: NotificationPermission; subscribed: boolean; standalone: boolean };
/** 이 기기의 알림 권한, 서비스 워커 푸시 구독, 홈 화면 앱 여부를 바꿀 수 있게 브라우저 API를 흉내 낸다 */
async function fakeDevice(page: Page, init: Push) {
  await page.addInitScript((p: Push) => {
    const w = window as unknown as { __push: Push };
    w.__push = JSON.parse(localStorage.getItem('test:push') || 'null') ?? p;
    Object.defineProperty(navigator, 'standalone', { get: () => w.__push.standalone, configurable: true });
    class FakeNotification { static get permission() { return w.__push.permission; } static requestPermission() { w.__push.permission = 'granted'; return Promise.resolve(w.__push.permission); } }
    (window as unknown as { Notification: unknown }).Notification = FakeNotification;
    const sub = { endpoint: 'https://web.push.apple.com/test', toJSON: () => ({ endpoint: 'https://web.push.apple.com/test', keys: { p256dh: 'p', auth: 'a' } }), unsubscribe: async () => { w.__push.subscribed = false; return true; } };
    const reg = { scope: '/', pushManager: { getSubscription: async () => (w.__push.subscribed ? sub : null), permissionState: async () => (w.__push.permission === 'default' ? 'prompt' : w.__push.permission), subscribe: async () => { w.__push.subscribed = true; return sub; } } };
    Object.defineProperty(navigator, 'serviceWorker', { value: { getRegistration: async () => reg, register: async () => reg, ready: Promise.resolve(reg) }, configurable: true });
  }, init);
  await page.route(/\/(?:pg\/)?api\/v1\//, async route => {
    const path = new URL(route.request().url()).pathname.replace(/^\/pg/, '');
    let data: unknown = {};
    if (path.endsWith('/auth/csrf')) data = { headerName: 'X-CSRF', token: 'csrf' };
    else if (path.endsWith('/auth/login') || path.endsWith('/auth/refresh')) data = { accessToken: 'test-token', accountId: 'real-buyer', roles: ['BUYER'], expiresAt: '2030-01-01T00:00:00Z', tokenType: 'Bearer' };
    else if (path.endsWith('/accounts/me')) data = { id: 'real-buyer', name: '테스트', roles: ['BUYER'] };
    else if (path.endsWith('/notifications/unread-count')) data = { count: 2 };
    else if (path.endsWith('/notifications/push-configuration')) data = { enabled: true, publicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U' };
    else if (path.endsWith('/notifications/push-subscriptions')) data = { id: 'sub1' };
    else if (path.endsWith('/categories')) data = { categories: [] };
    else if (path.endsWith('/products')) data = { items: [], page: 0, size: 100, totalPages: 0, totalElements: 0 };
    await route.fulfill({ json: { success: true, data } });
  });
}
async function signIn(page: Page) {
  await page.goto(`/#/login?next=${encodeURIComponent('/')}`);
  await page.getByRole('textbox', { name: '이메일', exact: true }).fill('buyer@example.com');
  await page.getByLabel('비밀번호', { exact: true }).fill('password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
}
const bell = (page: Page) => page.getByRole('button', { name: /^백그라운드 알림 (켜짐|꺼짐)$/ });
const setPush = (page: Page, p: Partial<Push>) => page.evaluate(next => { const w = window as unknown as { __push: Record<string, unknown> }; Object.assign(w.__push, next); localStorage.setItem('test:push', JSON.stringify(w.__push)); }, p);

test('백그라운드 알림이 켜져 있으면 알림 아이콘을 채우고, 권한을 끄고 앱으로 돌아오면 바로 선 모양으로 바뀐다', async ({ page }) => {
  await fakeDevice(page, { permission: 'granted', subscribed: true, standalone: true });
  await signIn(page);
  await expect(bell(page)).toHaveAttribute('aria-label', '백그라운드 알림 켜짐');
  await expect(bell(page)).toHaveAttribute('data-push', 'on');
  await expect(bell(page).locator('svg')).toHaveAttribute('fill', 'currentColor');
  await expect(page.getByRole('button', { name: '알림 목록' }).getByLabel('안 읽은 알림 2개')).toBeVisible(); // 빨간 점은 알림 목록 아이콘에
  await bell(page).click(); await expect(page.getByText('백그라운드 알림이 켜져 있습니다.')).toBeVisible();
  // 아이폰 설정에서 알림을 끄고 앱으로 돌아온다
  await setPush(page, { permission: 'denied' });
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); });
  await expect(bell(page)).toHaveAttribute('aria-label', '백그라운드 알림 꺼짐');
  await expect(bell(page).locator('svg')).toHaveAttribute('fill', 'none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('알림 권한을 아직 허용하지 않으면 꺼짐이고, 알림 설정에서 허용해 연결하면 홈 아이콘이 켜짐으로 바뀐다', async ({ page }) => {
  await fakeDevice(page, { permission: 'default', subscribed: false, standalone: true });
  await signIn(page);
  await expect(bell(page)).toHaveAttribute('data-push', 'off');
  await page.goto('/#/notifications/settings?mode=settings&next=%2F');
  await page.getByRole('button', { name: '알림 허용하기' }).click();
  await expect(page.getByText('백그라운드 알림을 연결했어요.')).toBeVisible();
  await page.goto('/#/');
  await expect(bell(page)).toHaveAttribute('data-push', 'on');
});

test('다른 탭에서 서버 등록이 실패하면 이 탭의 아이콘도 꺼짐으로 바뀐다', async ({ page, context }) => {
  await fakeDevice(page, { permission: 'granted', subscribed: true, standalone: true });
  await signIn(page);
  await expect(bell(page)).toHaveAttribute('data-push', 'on');
  const other = await context.newPage();
  await other.goto('/#/login');
  await other.evaluate(() => localStorage.setItem('stockdrop:push-last-register', JSON.stringify({ at: Date.now(), ok: false, message: '실패' })));
  await expect(bell(page)).toHaveAttribute('data-push', 'off');
});

test('Safari 탭(홈 화면 앱 아님)은 백그라운드 알림을 받을 수 없어 권한과 구독이 있어도 꺼짐이다', async ({ page }) => {
  await fakeDevice(page, { permission: 'granted', subscribed: true, standalone: false });
  await signIn(page);
  await expect(bell(page)).toHaveAttribute('aria-label', '백그라운드 알림 꺼짐');
});
