import { test, expect } from '@playwright/test';
import { actor, editState, signInDemo } from './session';
test.use({ viewport: { width: 402, height: 874 } });
test.beforeEach(async ({ page }) => { await signInDemo(page); await actor(page, 'seller'); });
test('계정 저장 버튼은 변경 때만 나오며 원복과 저장 후 숨는다', async ({ page }) => {
  await page.goto('/#/seller/settings/account'); const save = page.getByRole('button', { name: '저장하기', exact: true }); const intro = page.getByLabel('스토어 한 줄 소개');
  await expect(save).toHaveCount(0); await intro.fill('오래 입는 옷'); await expect(save).toBeVisible(); await intro.fill(''); await expect(save).toHaveCount(0);
  await intro.fill('새 소개'); await save.click(); await expect(save).toHaveCount(0); const name = page.getByLabel('스토어 이름', { exact: true }); const old = await name.inputValue(); await name.fill('다른 상점'); await expect(save).toBeVisible(); await name.fill(old); await expect(save).toHaveCount(0);
});
test('판매 카드, 심사중 탭과 게이지 및 초안 삭제를 유지한다', async ({ page }) => {
  await editState(page, s => { s.products.filter((p: any) => p.sellerId === 'seller').slice(0, 3).forEach((p: any, i: number) => { p.startsAt = Date.now() - 1000; p.endsAt = Date.now() + 3600000; p.reviewStatus = 'APPROVED'; p.listQuantity = { total: 100, sold: [32, 33, 80][i] }; }); const p = structuredClone(s.products[0]); p.id = 'draft-card'; p.name = '작성 초안'; p.reviewStatus = 'DRAFT'; p.published = false; s.products.push(p); const q = structuredClone(p); q.id = 'review-card'; q.name = '심사중 셔츠'; q.reviewStatus = 'IN_REVIEW'; s.products.push(q); });
  await page.goto('/#/seller/products'); await expect(page.getByText('아틀리에 노트', { exact: true })).toHaveCount(0); await expect(page.getByRole('link', { name: '상품 등록', exact: true })).toHaveCount(0);
  const gauges = page.getByRole('progressbar', { name: '판매율' }); await expect(gauges).toHaveCount(4); expect(await gauges.evaluateAll(es => es.slice(0, 3).map(e => getComputedStyle(e.firstElementChild!).backgroundColor))).toEqual(['rgb(185, 32, 26)', 'rgb(231, 185, 63)', 'rgb(11, 110, 86)']);
  await page.getByRole('button', { name: '판매심사중', exact: true }).click(); await expect(page.getByRole('link', { name: '심사중 셔츠 심사 상태 보기' })).toHaveAttribute('href', /seller\/published\/review-card/);
  await page.getByRole('button', { name: '전체', exact: true }).click(); await expect(page.getByRole('link', { name: '작성 초안 이어서 등록' })).toHaveAttribute('href', /edit=draft-card/);
  await page.getByRole('button', { name: '작성 초안 초안 삭제' }).click(); await page.getByRole('dialog').getByRole('button', { name: '삭제', exact: true }).click(); await expect(page.getByText('작성 초안', { exact: true })).toHaveCount(0);
  const group = page.getByRole('group', { name: '판매 상품 상태' }); expect(await group.getByRole('button').evaluateAll(es => es.every(e => getComputedStyle(e).textAlign === 'center' && e.getBoundingClientRect().height >= 44))).toBe(true);
  await page.getByRole('link', { name: /판매 결과 보기$/ }).first().click(); await expect(page).toHaveURL(/seller\/product/);
});
test('주문 관리 4탭과 상세 연락처, 문의함 두 분류와 조건부 답변', async ({ page }) => {
  await page.goto('/#/seller/orders'); const tabs = page.getByRole('group', { name: '판매자 주문 상태' }); await expect(tabs.getByRole('button')).toHaveText(['결제완료', '배송준비', '배송중', '배송완료']); await expect(tabs.getByRole('button', { name: '배송준비', exact: true })).toHaveAttribute('aria-pressed', 'true'); await expect(page.getByText(/주문번호/)).toHaveCount(0);
  await page.getByRole('link', { name: /주문 상세 보기$/ }).first().click(); const address = page.getByRole('region', { name: '배송지', exact: true }); await expect(address.getByRole('link')).toHaveAttribute('href', /^tel:/); expect(await address.getByRole('link').evaluate(e => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await page.goto('/#/seller/inquiries'); await expect(page.getByRole('group', { name: '문의 종류' }).getByRole('button')).toHaveText(['주문 문의', '상품 문의']); await page.getByRole('link', { name: /소프트 코튼 가디건/ }).click(); await expect(page.getByText(/주문번호/)).toHaveCount(0); await expect(page.getByRole('link', { name: '문의 목록으로' })).toHaveCount(0); const answer = page.getByRole('textbox', { name: '답변 입력' }); const submit = page.getByRole('button', { name: '답변 등록', exact: true }); await expect(submit).toHaveCount(0); await answer.fill('확인하겠습니다'); await expect(submit).toBeVisible(); await answer.fill(' '); await expect(submit).toHaveCount(0);
});
test('최근 6개월 그래프 선택과 순서, 빈 상태와 홈 등록 유지', async ({ page }) => {
  await editState(page, s => { s.orders.filter((o: any) => o.sellerId === 'seller').forEach((o: any, i: number) => { o.purchaseConfirmedAt = new Date(new Date().getFullYear(), new Date().getMonth() - i, 15).getTime(); o.status = 'delivered'; }); });
  await page.goto('/#/seller/sales'); const chart = page.getByRole('region', { name: '월별 판매 현황' }); await expect(chart.getByRole('button')).toHaveCount(6); expect(await chart.locator('.seller-sales-bar').evaluateAll(es => es.map(e => getComputedStyle(e).animationDelay))).toEqual(['0.6s', '0.8s', '1s']); await chart.getByRole('button').first().click(); await expect(chart.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
  await page.emulateMedia({ reducedMotion: 'reduce' }); expect(await chart.locator('.seller-sales-bar').first().evaluate(e => getComputedStyle(e).animationName)).toBe('none');
  await editState(page, s => { s.orders = []; }); await expect(page.getByText('아직 구매 확정된 판매가 없어요')).toBeVisible(); await page.goto('/#/my'); await expect(page.getByRole('link', { name: '새 한정 판매 등록' })).toHaveCount(0); await page.goto('/#/'); await expect(page.getByRole('link', { name: '판매 등록', exact: true })).toBeVisible();
  await editState(page, s => { s.products = []; }); await page.goto('/#/seller/products?state=판매%20중'); await expect(page.getByRole('heading', { name: '판매 중 상품이 없어요' })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
