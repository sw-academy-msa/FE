import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { actor, editState, signInDemo } from './session';
test.beforeEach(async ({ page }) => { await signInDemo(page); });

/** 홈 '새로 올라온 상품' 목록의 카드 순서(상품 id) */
const cardIds = (page: Page) => page.getByTestId('home-products').locator('a[href^="#/product/"]').evaluateAll(as => [...new Set(as.map(a => a.getAttribute('href')!.replace('#/product/', '')))]);

test('관리자가 새로 승인한 상품이 홈 목록 맨 위에 온다(mock은 공개 승인 시각 기준)', async ({ page }) => {
  // 예시 상품 하나를 심사 대기로 돌린 뒤 운영자가 승인한다
  await editState(page, s => { const p = s.products.find((x: any) => x.id === 'basket'); p.published = false; delete p.publishedAt; p.startsAt = Date.now() + 3_600_000; p.endsAt = p.startsAt + 10_800_000; delete p.soldOutAt; });
  await page.goto('/#/'); expect(await cardIds(page)).not.toContain('basket');
  await actor(page, 'admin'); await page.goto('/#/admin/products/basket');
  await page.getByRole('button', { name: '승인하기', exact: true }).click(); await page.getByRole('button', { name: '승인하기', exact: true }).last().click();
  await expect(page).toHaveURL(/#\/admin\/products$/);
  await actor(page, 'buyer'); await page.goto('/#/');
  await expect.poll(() => cardIds(page)).toContain('basket');
  expect((await cardIds(page))[0]).toBe('basket');
  // 카테고리 탭 안에서도 새 상품이 먼저
  await page.getByRole('group', { name: '상품 카테고리' }).getByRole('button', { name: '생활잡화', exact: true }).click();
  expect((await cardIds(page))[0]).toBe('basket');
});

test('전체 목록은 10개씩 보여 주고 더 보기로 10개씩 늘리며, 탭을 바꾸면 처음 10개, 상세에 갔다 오면 보던 개수 그대로', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  // 같은 카테고리 상품 25개를 더한다(새로 올라온 순서: n25가 가장 최근)
  await editState(page, s => { const base = s.products.find((x: any) => x.id === 'cardigan'); for (let i = 1; i <= 25; i++) s.products.push({ ...structuredClone(base), id: `n${i}`, name: `새 상품 ${i}`, publishedAt: 1_000_000 + i }); });
  await page.goto('/#/');
  const grid = page.getByTestId('home-products');
  await expect.poll(async () => (await cardIds(page)).length).toBe(10);
  expect((await cardIds(page)).slice(0, 3)).toEqual(['n25', 'n24', 'n23']);
  await page.getByRole('button', { name: /^더 보기/ }).click();
  await expect.poll(async () => (await cardIds(page)).length).toBe(20);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  // 상세에 갔다가 뒤로 오면 20개 그대로
  await grid.locator('a[href="#/product/n8"]').first().click(); await expect(page).toHaveURL(/#\/product\/n8/);
  await page.goBack(); await expect.poll(async () => (await cardIds(page)).length).toBe(20);
  await page.getByRole('button', { name: /^더 보기/ }).click();
  const all = await page.evaluate(() => JSON.parse(localStorage.getItem('stockdrop:v1')!).products.filter((p: any) => p.published).length);
  await expect.poll(async () => (await cardIds(page)).length).toBe(Math.min(30, all));
  if (all <= 30) await expect(page.getByRole('button', { name: /^더 보기/ })).toHaveCount(0);
  // 카테고리 탭을 바꾸면 처음 10개로
  await page.getByRole('group', { name: '상품 카테고리' }).getByRole('button', { name: '의류', exact: true }).click();
  await expect.poll(async () => (await cardIds(page)).length).toBe(10);
  await page.getByRole('group', { name: '상품 카테고리' }).getByRole('button', { name: '전체', exact: true }).click();
  await expect.poll(async () => (await cardIds(page)).length).toBe(10);
});
