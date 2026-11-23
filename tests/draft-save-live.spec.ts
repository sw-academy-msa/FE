import { expect, test, type Page } from '@playwright/test';
test.skip(process.env.STOCKDROP_REAL_TEST !== 'true', '실제 API 모드 HTTP fixture 전용');
test.use({ viewport: { width: 402, height: 874 } });
const dialog = (page: Page) => page.getByRole('dialog', { name: '작성 중인 내용을 임시 저장할까요?' });
async function setup(page: Page, rejectPrice = false, deleteCode = '', storedAddress = false) {
  const product: any = { id: 'draft1', sellerId: 'test-seller', status: 'DRAFT', version: 1, name: '서버 초안', description: '설명', brandOrStore: '상점', category: null, sourceUrl: null, price: 12000, shippingFee: 3000, dispatchBusinessDays: 2, perAccountLimit: 2, startsAt: '2099-01-01T03:00:00Z', endsAt: '2099-01-01T06:00:00Z', options: [], optionDimensions: [], attributes: [], faqs: [] };
  let deleted = false; const sent: { path: string; method: string; body: any }[] = [];
  if (storedAddress) product.dispatchAddress = product.returnAddress = { postalCode: '12345', roadAddress: '저장한 창고', detailAddress: '2층' };
  await page.route('**/__dev/registration-metadata', r => r.fulfill({ status: 204 }));
  await page.route(/\/(?:pg\/)?api\/v1\//, async route => {
    const path = new URL(route.request().url()).pathname.replace(/^\/pg/, ''), method = route.request().method(), body = route.request().postDataJSON(); let data: unknown = {};
    if (path.endsWith('/auth/csrf')) data = { headerName: 'X-CSRF', token: 'csrf' };
    else if (/\/auth\/(login|refresh)$/.test(path)) data = { accessToken: 'test-token', accountId: 'test-seller', roles: ['BUYER', 'SELLER'], expiresAt: '2099-01-01T00:00:00Z' };
    else if (path.endsWith('/accounts/me')) data = { id: 'test-seller', name: '판매자', roles: ['SELLER'] };
    else if (path.endsWith('/registration-metadata')) data = { categories: ['의류'], categoryCriteria: [] };
    else if (/address-book\/(DISPATCH|RETURN)$/.test(path)) data = storedAddress ? [{ id: 'default', label: '기본', defaultAddress: true, address: { postalCode: '00000', roadAddress: '다른 창고', detailAddress: '' } }, { id: 'saved', label: '저장한 창고', defaultAddress: false, address: product.dispatchAddress }] : [];
    else if (path.endsWith('/seller/products')) data = { items: deleted ? [] : [product], page: 0, totalPages: 1, totalElements: deleted ? 0 : 1 };
    else if (path.endsWith('/draft1/images')) data = [];
    else if (path.endsWith('/draft1') && method === 'DELETE') { sent.push({ path, method, body }); if (deleteCode) return route.fulfill({ status: 409, json: { code: deleteCode, message: '거절' } }); deleted = true; data = null; }
    else if (path.includes('/draft1/registration/')) {
      sent.push({ path, method, body });
      if (rejectPrice && path.endsWith('/pricing-shipping')) return route.fulfill({ status: 400, json: { code: 'COMMON_INVALID_REQUEST', message: '가격을 확인해 주세요.' } });
      expect(body.expectedVersion).toBe(product.version); product.version++;
      if (path.endsWith('/options')) { product.optionDimensions = body.dimensions; product.options = body.variants.map((v: any, i: number) => ({ id: `o${i}`, label: Object.values(v.selections).join(' / '), ...v, confirmedQuantity: 0, availableQuantity: v.initialQuantity })); }
      else if (path.endsWith('/faqs')) product.faqs = body.faqs;
      else Object.assign(product, body); data = product;
    } else if (path.endsWith('/draft1')) data = product;
    else if (path.endsWith('/revisions')) data = [];
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/#/login?next=%2Fseller%2Fproducts'); await page.getByLabel('이메일', { exact: true }).fill('test@example.com'); await page.getByLabel('비밀번호', { exact: true }).fill('password'); await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.getByRole('link', { name: /이어서 등록$/ }).click(); await expect(page.getByLabel('상품명', { exact: true })).toHaveValue('서버 초안');
  return { product, sent };
}
test('기기 초안 없이도 서버 주소 스냅샷과 맞는 주소록을 선택한다', async ({ page }) => {
  await setup(page, false, '', true);
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('stockdrop:v1:live')!); delete s.drafts['test-seller']; localStorage.setItem('stockdrop:v1:live', JSON.stringify(s)); });
  await page.goto('/#/seller/new?edit=draft1&step=3'); await page.reload();
  await expect(page.getByRole('combobox', { name: '출고지', exact: true })).toHaveValue('saved'); await expect(page.getByRole('combobox', { name: '반품지', exact: true })).toHaveValue('saved');
});
test('서버 초안 저장은 실제 수정 API 여섯 단계를 호출하고 다른 기기에서는 서버 값을 읽는다', async ({ page }) => {
  const { product, sent } = await setup(page); await page.getByLabel('상품명', { exact: true }).fill('저장한 서버 상품');
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('stockdrop:v1:live')!); Object.assign(s.drafts['test-seller'], { price: 15000, shipping: 3500, optionDims: [], stock: { '[]': 8 }, wizardStep: 3, wizardOrder: 2 }); localStorage.setItem('stockdrop:v1:live', JSON.stringify(s)); }); await page.reload(); await expect(page.getByRole('group', { name: /판매 등록 3\/5단계/ })).toBeVisible();
  // 뒤로 가기는 지금 단계 - 1(3 → 2 → 1), 1단계에서 뒤로 가면 나가기 확인창
  for (const n of [2, 1]) { await page.goBack(); await expect(page.getByRole('group', { name: new RegExp(`판매 등록 ${n}/5단계`) })).toBeVisible(); await expect(dialog(page)).toHaveCount(0); }
  await page.goBack(); await expect(dialog(page)).toBeVisible(); await dialog(page).getByRole('button', { name: '임시 저장하고 나가기' }).click(); await expect(dialog(page)).toHaveCount(0);
  expect(sent.filter(x => x.method === 'PUT')).toHaveLength(6); expect(product.price).toBe(15000); expect(product.shippingFee).toBe(3500); expect(product.options[0].initialQuantity).toBe(8);
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('stockdrop:v1:live')!); delete s.drafts['test-seller']; localStorage.setItem('stockdrop:v1:live', JSON.stringify(s)); }); await page.goto('/#/seller/products'); await page.reload(); await page.getByRole('link', { name: /이어서 등록$/ }).click(); await expect(page.getByLabel('상품명', { exact: true })).toHaveValue('저장한 서버 상품');
  await page.goto('/#/seller/new?edit=draft1&step=2'); await expect(page.getByLabel('한정 판매가')).toHaveValue('15,000');
});
test('검증에 막힌 값은 이 기기에서 복원하고 서버에 성공한 단계는 유지한다', async ({ page }) => {
  await setup(page, true); await page.getByLabel('상품명', { exact: true }).fill('미완성 저장'); await page.goBack(); await dialog(page).getByRole('button', { name: '임시 저장하고 나가기' }).click(); await expect(dialog(page)).toHaveCount(0); await page.getByRole('link', { name: /이어서 등록$/ }).click(); await expect(page.getByLabel('상품명', { exact: true })).toHaveValue('미완성 저장');
});
test('삭제 API 배포 뒤 DRAFT 목록 삭제가 DELETE로 반영된다', async ({ page }) => {
  test.skip(process.env.STOCKDROP_DRAFT_DELETE_READY !== 'true', '백엔드 삭제 API 배포 확인 후 실행');
  const { sent } = await setup(page); await page.goBack(); await dialog(page).getByRole('button', { name: '임시 저장하고 나가기' }).click(); await expect(dialog(page)).toHaveCount(0); await page.getByRole('button', { name: /초안 삭제$/ }).click(); const sheet = page.getByRole('dialog', { name: '작성 중인 상품을 삭제할까요? 되돌릴 수 없어요' }); await sheet.getByRole('button', { name: '삭제', exact: true }).click(); await expect(sheet).toHaveCount(0); await expect(page.getByText('서버 초안', { exact: true })).toHaveCount(0); expect(sent.some(x => x.method === 'DELETE')).toBe(true);
});
test('삭제하고 나가기는 서버와 기기 초안을 함께 지운다', async ({ page }) => {
  test.skip(process.env.STOCKDROP_DRAFT_DELETE_READY !== 'true', '백엔드 삭제 API 배포 확인 후 실행');
  const { sent } = await setup(page); await page.getByLabel('상품명', { exact: true }).fill('지울 상품'); await page.goBack(); await dialog(page).getByRole('button', { name: '삭제하고 나가기' }).click(); await expect(dialog(page)).toHaveCount(0); await expect(page.getByText('서버 초안', { exact: true })).toHaveCount(0); expect(sent.filter(x => x.method === 'DELETE')).toHaveLength(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('stockdrop:v1:live')!).drafts['test-seller'])).toBeUndefined();
});
for (const [code, message] of [['PRODUCT_DRAFT_DELETE_NOT_ALLOWED', '작성 중인 상품만 삭제할 수 있어요.'], ['PRODUCT_DRAFT_DELETE_PROTECTED', '심사 이력이 있는 상품이라 삭제할 수 없어요.']]) test(`삭제 거절 ${code}는 별도 안내 후 입력을 유지한다`, async ({ page }) => {
  test.skip(process.env.STOCKDROP_DRAFT_DELETE_READY !== 'true', '백엔드 삭제 API 배포 확인 후 실행');
  await setup(page, false, code); await page.getByLabel('상품명', { exact: true }).fill('남겨 둘 입력'); await page.goBack(); await dialog(page).getByRole('button', { name: '삭제하고 나가기' }).click(); await expect(dialog(page)).toContainText(message); await dialog(page).getByRole('button', { name: '계속 작성' }).click(); await expect(page.getByLabel('상품명', { exact: true })).toHaveValue('남겨 둘 입력');
});
