import { expect, test, type Page } from '@playwright/test';
import { actor, signInDemo } from './session';

/** React가 콘솔에 남기는 key 경고(같은 부모 안 key 중복, key 없음)가 화면마다 0개인지 */
const KEY_WARNING = /same key|unique "key" prop/;
async function keyWarnings(page: Page, urls: string[]) {
  const found: string[] = [];
  page.on('console', m => { if (KEY_WARNING.test(m.text())) found.push(`${page.url()} ${m.text().slice(0, 160)}`); });
  for (const url of urls) { await page.goto(url); await page.reload(); await page.locator('main').waitFor(); await page.waitForTimeout(400); }
  return found;
}
test.beforeEach(async ({ page }) => { await signInDemo(page); });

test('구매자 화면: 상품 상세 포함 key 경고 0', async ({ page }) => {
  expect(await keyWarnings(page, ['/#/', '/#/product/ecobag', '/#/product/cardigan', '/#/schedule', '/#/schedule/calendar', '/#/orders', '/#/notifications', '/#/my', '/#/my/interests', '/#/support', '/#/faq', '/#/inquiries', '/#/addresses', '/#/apply'])).toEqual([]);
});
test('판매자 화면 key 경고 0', async ({ page }) => {
  await actor(page, 'seller');
  expect(await keyWarnings(page, ['/#/my', '/#/seller/products', '/#/seller/sales', '/#/seller/new', '/#/seller/orders', '/#/seller/inquiries', '/#/seller/settings/business', '/#/seller/settings/bank', '/#/seller/settings/addresses', '/#/seller/settings/account', '/#/seller/support', '/#/seller/terms'])).toEqual([]);
});
test('운영자 화면 key 경고 0', async ({ page }) => {
  await actor(page, 'admin');
  expect(await keyWarnings(page, ['/#/admin', '/#/admin/applications', '/#/admin/sellers', '/#/admin/inquiries', '/#/admin/products', '/#/product/ecobag'])).toEqual([]);
});
