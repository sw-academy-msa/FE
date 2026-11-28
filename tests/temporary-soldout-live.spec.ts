import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { blockExternal } from './session';
const stocks = JSON.parse(readFileSync(new URL('./fixtures/temporary-soldout.json', import.meta.url), 'utf8')) as { name: string; temporary: boolean; stock: { initialQuantity: number; confirmedQuantity: number; availableQuantity: number; approximate: boolean } }[];
test.skip(process.env.STOCKDROP_REAL_TEST !== 'true', '실제 API 모드 로컬 서버 전용');
test.use({ viewport: { width: 402, height: 874 } });
for (const fixture of stocks) {
  test(fixture.name, async ({ page }) => {
    let released = false;
    await blockExternal(page);
    await page.route('**/__dev/registration-metadata', route => route.fulfill({ status: 204 }));
    await page.route(/\/(?:pg\/)?api\/v1\//, async route => {
      const path = new URL(route.request().url()).pathname;
      const stock = released ? { ...fixture.stock, availableQuantity: 1 } : fixture.stock;
      const product = { id: 'temporary', name: '재고 표시 상품', brandOrStore: '숏패딩', category: '숏패딩', price: 18000, image: null, images: [], status: 'ON_SALE', startsAt: '2020-01-01T00:00:00Z', endsAt: '2099-01-01T00:00:00Z', soldOutAt: null, stock, metadata: { version: 1, occurredAt: '2026-01-01T00:00:00Z', projectedAt: '2026-01-01T00:00:00Z' }, sellerId: 'seller', shippingFee: 3000, perAccountLimit: 1, dispatchBusinessDays: 3, options: [{ id: 'one', label: '기본', availableQuantity: stock.availableQuantity }], dimensions: [], attributes: [], faqs: [] };
      let data: unknown = {};
      if (path.endsWith('/auth/csrf')) data = { headerName: 'X-CSRF', token: 'csrf' };
      else if (path.endsWith('/auth/refresh')) { await route.fulfill({ status: 401, json: { code: 'UNAUTHORIZED' } }); return; }
      else if (path.endsWith('/products/temporary')) data = product;
      else if (path.endsWith('/products')) data = { items: [product], page: 0, totalPages: 1, totalElements: 1 };
      else if (path.endsWith('/categories')) data = ['숏패딩'];
      await route.fulfill({ json: { success: true, data } });
    });
    await page.goto('/#/');
    await page.getByRole('button', { name: '건너뛰기', exact: true }).click();
    await page.getByRole('button', { name: '가입 없이 둘러보기', exact: true }).click();
    const card = page.getByRole('link', { name: /재고 표시 상품/ }).first();
    await expect(card.getByText(fixture.temporary ? '일시 품절' : 'SOLD OUT', { exact: true })).toBeVisible();
    await page.goto('/#/product/temporary');
    await expect(page.getByText(fixture.temporary ? '일시 품절' : 'SOLD OUT', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /선착순 구매하기/ })).toHaveCount(0);
    if (fixture.temporary) {
      await expect(page.getByText('결제 대기 중인 수량이 풀리면 다시 구매할 수 있어요').first()).toBeVisible();
      await page.screenshot({ path: 'test-results/temporary-soldout-after.png', fullPage: true });
      released = true;
      // useLive는 주기 조회가 없어 화면 재진입으로 새 응답을 받는다.
      await page.goto('/#/');
      await page.goto('/#/product/temporary');
      await expect(page.getByRole('button', { name: /선착순 구매하기/ })).toBeEnabled();
      await expect(page.getByText('일시 품절', { exact: true })).toHaveCount(0);
    }
  });
}
