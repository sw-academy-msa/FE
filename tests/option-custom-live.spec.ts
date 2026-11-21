import { expect, test, type Page } from '@playwright/test';

// 실제 API 모드 개발 서버에서 가짜 HTTP 응답으로 옵션 저장 요청 본문을 확인한다
test.skip(process.env.STOCKDROP_REAL_TEST !== 'true', '실제 API 모드 로컬 서버 전용');
test.use({ viewport: { width: 402, height: 874 } });

const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const meta = { categories: ['니트'], categoryCriteria: [{ code: 'CLOTHING', name: '니트', checks: [] }] };
const address = (type: string) => ({ id: `${type}-1`, type, label: '창고', contactName: '홍길동', contactPhone: '01012345678', address: { postalCode: '06236', roadAddress: '서울 강남구 테헤란로 1', detailAddress: '1층' }, defaultAddress: true });
type Opts = { status?: string; options?: unknown[]; optionDimensions?: unknown[]; rejectSubmit?: boolean };

async function setup(page: Page, o: Opts = {}) {
  const sent: { options?: { dimensions: unknown[]; variants: unknown[] } } = {};
  await page.route('**/__dev/registration-metadata', route => route.fulfill({ status: 204 }));
  const product = () => ({ id: 'p1', sellerId: 'real-seller', version: 4, status: o.status ?? 'DRAFT', name: '울 니트', description: '새 상품', sourceUrl: 'https://shop.example.com/p/1', category: '니트', price: 10000, shippingFee: 3000, dispatchBusinessDays: 2, perAccountLimit: 2, shippingNotice: null, purchaseNotice: null, disposalReason: '시즌 재고', startsAt: '2099-01-01T03:00:00Z', endsAt: '2099-01-01T06:00:00Z', reviewReason: o.status === 'REJECTED' ? '사진을 바꿔 주세요' : null, options: o.options ?? [], brandOrStore: '스토어', attributes: [], optionDimensions: o.optionDimensions ?? [], dispatchAddress: null, returnAddress: null, addressesCapturedAt: null, faqs: [] });
  await page.route(/\/(?:pg\/)?api\/v1\//, async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace(/^\/pg/, ''), method = route.request().method();
    let data: unknown = {};
    if (path.endsWith('/auth/csrf')) data = { headerName: 'X-CSRF', token: 'csrf' };
    else if (path.endsWith('/auth/login') || path.endsWith('/auth/refresh')) data = { accessToken: 'test-token', accountId: 'real-seller', roles: ['BUYER', 'SELLER'], expiresAt: '2030-01-01T00:00:00Z', tokenType: 'Bearer' };
    else if (path.endsWith('/accounts/me')) data = { id: 'real-seller', name: '테스트 판매자', roles: ['SELLER'] };
    else if (/address-book\/DISPATCH$/.test(path)) data = [address('DISPATCH')];
    else if (/address-book\/RETURN$/.test(path)) data = [address('RETURN')];
    else if (path.endsWith('/seller/products/registration-metadata')) data = meta;
    else if (path.endsWith('/seller/products/p1/images')) data = [{ id: 'img1', objectKey: 'k', contentType: 'image/jpeg', sizeBytes: 1000, position: 0, representative: true }];
    else if (path.includes('/seller/products/p1/images/') && path.endsWith('/download-url')) data = { downloadUrl: PIXEL };
    else if (path.endsWith('/seller/products/p1/registration/options') && method === 'PUT') { sent.options = route.request().postDataJSON(); data = product(); }
    else if (path.endsWith('/seller/products/p1/review-submissions') && o.rejectSubmit) return route.fulfill({ status: 400, json: { code: 'COMMON_INVALID_REQUEST', message: '요청값이 올바르지 않습니다.', violations: [{ field: 'price', message: '판매가는 타 플랫폼 판매가보다 낮아야 해요.' }] } });
    else if (path.endsWith('/seller/products/p1/review-submissions')) data = { ...product(), status: 'IN_REVIEW' };
    else if (path.startsWith('/api/v1/seller/products/p1')) data = product();
    else if (path.endsWith('/seller/products')) data = method === 'POST' ? product() : { items: [], page: 0, size: 100, totalPages: 0, totalElements: 0 };
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto(`/#/login?next=${encodeURIComponent('/seller/new')}`);
  await page.getByRole('textbox', { name: '이메일', exact: true }).fill('seller@example.com');
  await page.getByLabel('비밀번호', { exact: true }).fill('password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '한정 판매 등록' })).toBeVisible();
  return sent;
}
async function addOption(page: Page, name: string) { await page.getByRole('button', { name: '직접 추가', exact: true }).click(); await page.getByLabel('직접 추가', { exact: true }).fill(name); await page.keyboard.press('Enter'); }
async function addValue(page: Page, dim: string, v: string) { await page.getByRole('button', { name: `${dim} 추가`, exact: true }).click(); await page.getByLabel(`${dim} 추가`, { exact: true }).fill(v); await page.keyboard.press('Enter'); }
const qty = (page: Page, label: string) => page.getByLabel(`${label} 수량`, { exact: true });

test('직접 정한 옵션 이름 세 단계를 서버 옵션 저장 요청에 그대로 보낸다', async ({ page }) => {
  const sent = await setup(page);
  // 사진과 기본 정보까지 채운 서버 초안 p1에서 시작한다
  await page.evaluate(({ px, start }) => {
    const key = 'stockdrop:v1:live', s = JSON.parse(localStorage.getItem(key)!);
    const d = s.drafts['real-seller'];
    s.drafts['real-seller'] = { ...d, serverId: 'p1', name: '울 니트', description: '새 상품', reason: '시즌 재고', images: [px], imageIds: ['img1'], imageSizes: [1000], category: '니트', originalUrl: 'https://shop.example.com/p/1', price: 10000, shipping: 3000, dispatchDays: 2, startsAt: start, inspection: [0, 1, 2, 3], faqs: [] };
    localStorage.setItem(key, JSON.stringify(s));
  }, { px: PIXEL, start: '2099-01-01T12:00' });
  await page.reload();
  await expect(page.getByLabel('상품명')).toHaveValue('울 니트');
  await page.goto('/#/seller/new?step=3'); // 옵션은 3단계
  await expect(page.getByRole('button', { name: '색상', exact: true })).toHaveCount(0);
  await addOption(page, '컬러'); await addValue(page, '컬러', '블랙'); await addValue(page, '컬러', '화이트');
  await addOption(page, '사이즈'); await addValue(page, '사이즈', 'M');
  await addOption(page, '소재'); await addValue(page, '소재', '면/폴리');
  await qty(page, '블랙 / M / 면/폴리').fill('4');
  await qty(page, '화이트 / M / 면/폴리').fill('2');
  await page.getByRole('button', { name: '컬러 값 화이트 고치기' }).click(); await page.getByLabel('컬러 값 화이트 고치기').fill('아이보리'); await page.keyboard.press('Enter');
  await page.goto('/#/seller/new?step=5');
  await page.getByRole('button', { name: '판매 심사 요청하기' }).click();
  await expect.poll(() => sent.options).toBeTruthy();
  expect(sent.options).toEqual({ expectedVersion: 4,
    dimensions: [{ name: '컬러', values: ['블랙', '아이보리'] }, { name: '사이즈', values: ['M'] }, { name: '소재', values: ['면/폴리'] }],
    variants: [{ selections: { 컬러: '블랙', 사이즈: 'M', 소재: '면/폴리' }, initialQuantity: 4 }, { selections: { 컬러: '아이보리', 사이즈: 'M', 소재: '면/폴리' }, initialQuantity: 2 }] });
});

test('반려된 예전 색상 x 사이즈 상품을 열면 같은 이름과 수량으로 보이고 옵션 id를 유지해 저장한다', async ({ page }) => {
  const sent = await setup(page, { status: 'REJECTED',
    optionDimensions: [{ name: '색상', values: ['면/마'] }, { name: '사이즈', values: ['S', 'M'] }],
    options: [{ id: 'o1', label: '면\\/마 / S', initialQuantity: 3, reservedQuantity: 0, confirmedQuantity: 0 }, { id: 'o2', label: '면\\/마 / M', initialQuantity: 5, reservedQuantity: 0, confirmedQuantity: 0 }] });
  await page.goto('/#/seller/new?edit=p1&step=3');
  await expect(page.getByRole('group', { name: '옵션 1단계 색상', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: '옵션 2단계 사이즈', exact: true })).toBeVisible();
  await expect(qty(page, '면/마 / S')).toHaveValue('3'); await expect(qty(page, '면/마 / M')).toHaveValue('5');
  await qty(page, '면/마 / M').fill('6');
  await page.goto('/#/seller/new?edit=p1&step=5');
  await page.getByRole('button', { name: /수정하고 재심사/ }).click();
  await expect.poll(() => sent.options).toBeTruthy();
  expect(sent.options).toEqual({ expectedVersion: 4,
    dimensions: [{ name: '색상', values: ['면/마'] }, { name: '사이즈', values: ['S', 'M'] }],
    variants: [{ id: 'o1', selections: { 색상: '면/마', 사이즈: 'S' }, initialQuantity: 3 }, { id: 'o2', selections: { 색상: '면/마', 사이즈: 'M' }, initialQuantity: 6 }] });
});

test('판매 등록 5단계: 심사 요청 때 서버가 칸 오류를 주면 그 칸이 있는 단계로 옮겨 표시한다', async ({ page }) => {
  await setup(page, { rejectSubmit: true });
  await page.evaluate(({ px, start }) => {
    const key = 'stockdrop:v1:live', s = JSON.parse(localStorage.getItem(key)!);
    const d = s.drafts['real-seller'];
    s.drafts['real-seller'] = { ...d, serverId: 'p1', name: '울 니트', description: '새 상품', reason: '시즌 재고', images: [px], imageIds: ['img1'], imageSizes: [1000], category: '니트', originalUrl: 'https://shop.example.com/p/1', price: 10000, shipping: 3000, dispatchDays: 2, startsAt: start, inspection: [0, 1, 2, 3], faqs: [] };
    localStorage.setItem(key, JSON.stringify(s));
  }, { px: PIXEL, start: '2099-01-01T12:00' });
  await page.reload();
  await page.goto('/#/seller/new?step=3'); await page.getByLabel('기본 수량 증가').click(); await page.getByLabel('기본 수량 증가').click();
  await page.goto('/#/seller/new?step=5');
  await page.getByRole('button', { name: '판매 심사 요청하기' }).click();
  await expect(page).toHaveURL(/step=3/);
  await expect(page.getByRole('group', { name: /판매 등록 3\/5단계/ })).toBeVisible();
  await expect(page.locator('[data-field="price"]').getByRole('alert')).toHaveText('판매가는 타 플랫폼 판매가보다 낮아야 해요.');
});
