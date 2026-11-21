import { expect, test } from '@playwright/test';
test.skip(process.env.STOCKDROP_REAL_TEST !== 'true', '실제 API 모드 로컬 HTTP 모킹 전용');
test.use({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });

/** 없는 상품 주소(서버 404)는 다시 시도 대신 '상품을 찾을 수 없어요'와 홈으로, 서버 오류(5xx)는 다시 시도 */
test('없는 상품 주소는 상품을 찾을 수 없어요와 홈으로 버튼을 보여 준다', async ({ page }) => {
  await page.route('**/__dev/registration-metadata', route => route.fulfill({ status: 204 }));
  await page.route(/\/api\/v1\/products\/no-such-product$/, route => route.fulfill({ status: 404, json: { success: false, error: { code: 'PRODUCT_NOT_FOUND', message: '요청한 리소스를 찾을 수 없습니다.' } } }));
  await page.goto('/#/product/no-such-product');
  await expect(page.getByRole('heading', { name: '상품을 찾을 수 없어요' })).toBeVisible();
  await expect(page.getByRole('button', { name: '다시 시도' })).toHaveCount(0);
  await page.getByRole('link', { name: '홈으로' }).click();
  await expect(page).not.toHaveURL(/no-such-product/);
});

test('서버 오류(5xx)면 상품 화면은 다시 시도를 보여 준다', async ({ page }) => {
  await page.route('**/__dev/registration-metadata', route => route.fulfill({ status: 204 }));
  await page.route(/\/api\/v1\/products\/broken-product$/, route => route.fulfill({ status: 503, json: { success: false, error: { code: 'UNAVAILABLE', message: '잠시 후 다시 시도해 주세요.' } } }));
  await page.goto('/#/product/broken-product');
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '상품을 찾을 수 없어요' })).toHaveCount(0);
});
