import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { actor, editState, signInDemo } from './session';
test.beforeEach(async ({ page }) => { await signInDemo(page); });

/** 지금 보이는 페이지의 상품 카드 순서(상품 id) */
const cardIds = (page: Page) => page.getByTestId('home-products').locator('[data-current] a[href^="#/product/"]').evaluateAll(as => [...new Set(as.map(a => a.getAttribute('href')!.replace('#/product/', '')))]);
const pager = (page: Page) => page.getByRole('navigation', { name: '상품 페이지' });
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

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

test('전체 목록은 8개씩 좌우로 넘기는 페이지이고 아래 점으로 표시하며, 상세에 갔다 오면 보던 페이지, 탭을 바꾸면 첫 페이지', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  // 같은 카테고리 상품 25개를 더한다(새로 올라온 순서: n25가 가장 최근)
  await editState(page, s => { const base = s.products.find((x: any) => x.id === 'cardigan'); for (let i = 1; i <= 25; i++) s.products.push({ ...structuredClone(base), id: `n${i}`, name: `새 상품 ${i}`, publishedAt: 1_000_000 + i }); });
  await page.goto('/#/');
  const all = await page.evaluate(() => JSON.parse(localStorage.getItem('stockdrop:v1')!).products.filter((p: any) => p.published).length);
  const pages = Math.ceil(all / 8);
  await expect.poll(async () => (await cardIds(page)).length).toBe(8);
  expect((await cardIds(page)).slice(0, 3)).toEqual(['n25', 'n24', 'n23']);
  // 점: 페이지 수만큼(최대 7), 첫 점이 현재
  const dots = pager(page).getByRole('button', { name: /^\d+페이지$/ });
  await expect(dots).toHaveCount(Math.min(7, pages));
  await expect(pager(page).getByRole('button', { name: '1페이지' })).toHaveAttribute('aria-current', 'page');
  await expect(pager(page).getByRole('button', { name: '이전 페이지' })).toBeDisabled();
  expect(await noOverflow(page)).toBe(true);

  // 손으로 옆으로 밀면(가로 스크롤) 다음 8개, 주소에 p=2
  await page.getByTestId('home-products').evaluate(el => el.scrollBy({ left: el.clientWidth + 16 }));
  await expect(page).toHaveURL(/[?&]p=2/);
  await expect(pager(page).getByRole('button', { name: '2페이지' })).toHaveAttribute('aria-current', 'page');
  await expect.poll(async () => (await cardIds(page))[0]).toBe('n17');
  // 세로 스크롤은 그대로(페이지가 바뀌지 않는다)
  await page.mouse.wheel(0, 400); await page.waitForTimeout(300); await expect(page).toHaveURL(/[?&]p=2/);

  // 다음 버튼(키보드)과 점 누르기
  await pager(page).getByRole('button', { name: '다음 페이지' }).focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/[?&]p=3/); await expect.poll(async () => (await cardIds(page))[0]).toBe('n9');
  await page.waitForTimeout(800); await expect(page).toHaveURL(/[?&]p=3/); // 넘기는 중에 앞 페이지로 되돌아가지 않는다
  await pager(page).getByRole('button', { name: '1페이지' }).click();
  await expect(page).not.toHaveURL(/[?&]p=/); await expect.poll(async () => (await cardIds(page))[0]).toBe('n25');
  await page.waitForTimeout(800); await expect(page).not.toHaveURL(/[?&]p=/);
  await pager(page).getByRole('button', { name: '2페이지' }).click(); await expect(page).toHaveURL(/[?&]p=2/);
  await expect.poll(() => page.getByTestId('home-products').evaluate(el => Math.round(el.scrollLeft / (el.clientWidth + 16)))).toBe(1);

  // 상세에 갔다가 뒤로 오면 보던 페이지 그대로
  await page.getByTestId('home-products').locator('[data-current] a[href="#/product/n14"]').first().click(); await expect(page).toHaveURL(/#\/product\/n14/);
  await page.goBack(); await expect(page).toHaveURL(/[?&]p=2/);
  await expect.poll(() => cardIds(page)).toContain('n14');
  await expect.poll(() => page.getByTestId('home-products').evaluate(el => Math.round(el.scrollLeft / (el.clientWidth + 16)))).toBe(1);

  // 카테고리 탭을 바꾸면 첫 페이지로
  await page.getByRole('group', { name: '상품 카테고리' }).getByRole('button', { name: '의류', exact: true }).click();
  await expect(page).not.toHaveURL(/[?&]p=/);
  await expect.poll(async () => (await cardIds(page)).length).toBe(8);
  expect(await noOverflow(page)).toBe(true);
});
