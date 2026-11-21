import { expect, test, type Page } from '@playwright/test';
import { signInDemo, actor, editState } from './session';
const dialog = (page: Page) => page.getByRole('dialog', { name: '작성 중인 내용을 임시 저장할까요?' });
async function begin(page: Page) { await signInDemo(page); await actor(page, 'seller'); await page.goto('/#/seller/products'); await page.reload(); await page.getByRole('link', { name: '상품 등록' }).click(); await expect(page).toHaveURL(/new/); }
async function leave(page: Page) { if (page.url().includes('/apply')) await page.getByRole('button', { name: '이전 화면', exact: true }).click(); else await page.goBack(); await expect(dialog(page)).toBeVisible(); }

test('임시 저장한 모든 단계 값과 마지막 단계를 목록 이어 쓰기로 복원하고 삭제한다', async ({ page }) => {
  await begin(page); await page.getByLabel('상품명', { exact: true }).fill('임시 셔츠');
  await editState(page, s => { Object.assign(s.drafts.seller, { wizardStep: 4, wizardOrder: 2, price: 12300, shipping: 3200, maxPerAccount: 3, dispatchDays: 2, startsAt: '2030-01-02T15:00', carrier: '택배사', returnFee: '3000', shippingNotice: '반품 안내', category: '의류', extras: [{ key: '소재', value: '면' }], optionDims: [{ name: '색상', values: ['카키'] }], stock: { '["카키"]': 7 }, faqs: [{ id: 'faq-one', question: '질문', answer: '답변', confirmed: true }] }); });
  await leave(page); await dialog(page).getByRole('button', { name: '임시 저장하고 나가기' }).click(); await expect(page).toHaveURL(/(?:my|products|\/)$/);
  await page.goto('/#/seller/products'); await page.reload(); const row = page.locator('.divider').filter({ has: page.getByText('임시 셔츠', { exact: true }) }).first();
  await expect(row.getByText('작성 중', { exact: true })).toBeVisible(); await row.getByRole('link', { name: '이어서 등록' }).click();
  await expect(page).toHaveURL(/step=4/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('stockdrop:v1')!).drafts.seller);
  expect(saved).toMatchObject({ name: '임시 셔츠', price: 12300, shipping: 3200, maxPerAccount: 3, carrier: '택배사', returnFee: '3000', startsAt: '2030-01-02T15:00', wizardStep: 4, stock: { '["카키"]': 7 } }); expect(saved.faqs[0].answer).toBe('답변');
  await leave(page); await dialog(page).getByRole('button', { name: '삭제하고 나가기' }).click(); await expect(page).toHaveURL(/(?:my|products|\/)$/);
  await page.goto('/#/seller/products'); await page.reload(); await expect(page.getByText('임시 셔츠', { exact: true })).toHaveCount(0);
});
test('서버 초안 생성 전 삭제 선택과 계속 작성, 목록 삭제 확인은 각각 한 번 동작한다', async ({ page }) => {
  await begin(page); await page.getByLabel('상품명', { exact: true }).fill('초기 초안'); await leave(page);
  await expect(dialog(page).getByRole('button')).toHaveCount(3); await dialog(page).getByRole('button', { name: '계속 작성' }).click(); await expect(page.getByLabel('상품명', { exact: true })).toHaveValue('초기 초안');
  await leave(page); await dialog(page).getByRole('button', { name: '삭제하고 나가기' }).click(); await expect(page).toHaveURL(/(?:my|products|\/)$/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('stockdrop:v1')!).drafts.seller)).toBeUndefined();
  await page.goto('/#/seller/products'); await page.reload(); await page.getByRole('link', { name: '상품 등록' }).click(); await page.getByLabel('상품명', { exact: true }).fill('목록 삭제 초안'); await leave(page); await dialog(page).getByRole('button', { name: '임시 저장하고 나가기' }).click(); await expect(page).toHaveURL(/(?:my|products|\/)$/);
  await page.goto('/#/seller/products'); await page.reload(); const row = page.locator('.divider').filter({ has: page.getByText('목록 삭제 초안', { exact: true }) }).first(); await row.getByRole('button', { name: '삭제', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: '작성 중인 상품을 삭제할까요? 되돌릴 수 없어요' }); await expect(confirm).toBeVisible(); await confirm.getByRole('button', { name: '삭제', exact: true }).click(); await expect(confirm).toHaveCount(0); await expect(page.getByText('목록 삭제 초안', { exact: true })).toHaveCount(0);
});
test('입점 신청은 3버튼으로 기기 저장을 유지하거나 삭제한다', async ({ page }) => {
  await signInDemo(page); await page.goto('/#/apply'); await page.getByLabel('판매자 표시 이름 · 선택', { exact: true }).fill('임시 상점'); await leave(page); await dialog(page).getByRole('button', { name: '임시 저장하고 나가기' }).click(); await expect(page).toHaveURL(/(?:my|products|\/)$/);
  await page.goto('/#/apply'); await expect(page.getByLabel('판매자 표시 이름 · 선택', { exact: true })).toHaveValue('임시 상점'); await leave(page); await dialog(page).getByRole('button', { name: '삭제하고 나가기' }).click(); await expect(page).toHaveURL(/(?:my|products|\/)$/);
  expect(await page.evaluate(() => localStorage.getItem('application-draft:buyer'))).toBeNull(); expect(await page.evaluate(() => localStorage.getItem('application-doc:buyer'))).toBeNull();
});
