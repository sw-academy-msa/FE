import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { blockExternal } from './session';

/** 판매 등록 5단계(1 기본 → 2 가격 → 3 일정 → 4 카테고리와 AI → 5 결과 확인): 단계 이동, 뒤로 가기, 단계별 검사, 비동기 AI 분석, 초안 이어 쓰기, 수정 흐름, 나가기 확인창 */
const stepGroup = (page: Page, n: number) => page.getByRole('group', { name: new RegExp(`판매 등록 ${n}/5단계`) });
const next = (page: Page) => page.getByRole('button', { name: '다음', exact: true }).click();
const confirmDialog = (page: Page) => page.getByRole('dialog', { name: '작성을 그만할까요?' });
const aiState = (page: Page) => page.getByLabel('AI 분석 상태');

async function seller(page: Page, aiOutcome = 'auto') {
  await blockExternal(page); await page.goto('/#/');
  await page.evaluate(o => { const s = JSON.parse(localStorage.getItem('stockdrop:v1')!); s.activeUserId = 'seller'; s.auth.userId = 'seller'; s.auth.onboarded = true; s.aiOutcome = o; delete s.drafts.seller; localStorage.setItem('stockdrop:v1', JSON.stringify(s)); }, aiOutcome);
}
test.beforeEach(async ({ page }) => { await seller(page); });
/** 판매 상품 관리에서 + 로 들어와 1단계를 채운다 */
async function fillStep1(page: Page) {
  await page.goto('/#/seller/products'); await page.reload();
  await page.getByRole('link', { name: '상품 등록' }).click(); await expect(stepGroup(page, 1)).toBeVisible();
  await page.getByLabel('상품 사진 업로드').setInputFiles([path.join(process.cwd(), 'public/images/seller-register-1.jpg')]);
  await page.getByLabel('상품명').fill('리넨 셔츠'); await page.getByLabel('짧은 설명').fill('새 상품'); await page.getByLabel('처분 사유').fill('시즌 재고');
}
async function pickCategory(page: Page, name = '패션 › 잡화 › 가방') {
  await page.locator('[data-field="category"]').getByRole('button').first().click();
  await page.getByLabel('카테고리 검색').fill(name.split(' › ').at(-1)!); await page.getByRole('radio', { name }).check(); await page.getByRole('button', { name: '카테고리 저장' }).click();
  await expect(page.getByRole('dialog', { name: '카테고리 선택' })).toHaveCount(0);
}

test('1단계 다음은 AI 분석을 요청하고 기다리지 않고 2단계로 간다. 4단계에서 분석 중이 보이고 끝나면 결과가 반영된다', async ({ page }) => {
  await fillStep1(page);
  await next(page); await expect(page).toHaveURL(/step=2/); await expect(stepGroup(page, 2)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AI 상품 분석' })).toHaveCount(0);
  await expect(page.getByText('AI 분석 중이에요. 결과는 4단계에서 확인해요')).toBeVisible();
  await page.goto('/#/seller/new?step=4');
  await expect(aiState(page).getByText('AI가 사진을 분석하고 있어요')).toBeVisible();
  // 자동 갱신: 끝나면 다시 열지 않아도 추천 카테고리와 질문이 채워진다
  await expect(page.getByRole('status', { name: 'AI 분석 반영 안내' })).toContainText('AI 분석 결과를 반영했어요', { timeout: 15000 });
  await expect(aiState(page).getByText('AI가 사진을 분석하고 있어요')).toHaveCount(0);
  await expect(page.locator('[data-field="category"]')).not.toContainText('카테고리를 선택해 주세요');
  await expect(page.locator('[data-field="aiQuestions"]')).toBeVisible();
});

test('분석이 끝나기 전에도 4단계에서 카테고리를 직접 골라 진행하고, 끝나면 고른 카테고리는 그대로 둔다', async ({ page }) => {
  await fillStep1(page); await next(page); await expect(stepGroup(page, 2)).toBeVisible();
  await page.goto('/#/seller/new?step=4'); await expect(aiState(page).getByText('AI가 사진을 분석하고 있어요')).toBeVisible();
  await pickCategory(page);
  await expect(page.getByRole('status', { name: 'AI 분석 반영 안내' })).toContainText('직접 고른 카테고리는 그대로 두었어요', { timeout: 15000 });
  await expect(page.locator('[data-field="category"]')).toContainText('패션 › 잡화 › 가방');
});

test('분석이 실패하면 4단계에 사유와 다시 분석, 직접 선택이 보이고 직접 골라 진행할 수 있다', async ({ page }) => {
  await seller(page, 'failed');
  await fillStep1(page); await next(page); await expect(stepGroup(page, 2)).toBeVisible();
  await page.goto('/#/seller/new?step=4');
  await expect(aiState(page).getByRole('alert')).toContainText('AI가 사진을 분석하지 못했어요', { timeout: 15000 });
  await aiState(page).getByRole('button', { name: '다시 분석' }).click();
  await expect(aiState(page).getByText('AI가 사진을 분석하고 있어요')).toBeVisible();
  await expect(aiState(page).getByRole('alert')).toBeVisible({ timeout: 15000 });
  await aiState(page).getByRole('button', { name: '직접 선택' }).click();
  await page.getByLabel('카테고리 검색').fill('가방'); await page.getByRole('radio', { name: '패션 › 잡화 › 가방' }).check(); await page.getByRole('button', { name: '카테고리 저장' }).click();
  await expect(page.locator('[data-field="category"]')).toContainText('패션 › 잡화 › 가방');
});

test('다음으로 단계를 넘기면 주소에 남고, 휴대폰 뒤로 가기와 헤더 뒤로는 이전 단계로 가며 입력은 그대로다', async ({ page }) => {
  await fillStep1(page);
  await next(page); await expect(page).toHaveURL(/step=2/); await expect(stepGroup(page, 2)).toBeVisible();
  await expect(confirmDialog(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.goBack(); await expect(stepGroup(page, 1)).toBeVisible(); await expect(confirmDialog(page)).toHaveCount(0);
  await expect(page.getByLabel('상품명')).toHaveValue('리넨 셔츠');
  await page.goForward(); await expect(stepGroup(page, 2)).toBeVisible();
  await page.getByRole('button', { name: '이전 화면' }).click(); await expect(stepGroup(page, 1)).toBeVisible(); await expect(confirmDialog(page)).toHaveCount(0);
});

test('다음은 그 단계 필수 칸만 검사해 오류를 보이고 머문다', async ({ page }) => {
  await fillStep1(page); await page.getByLabel('상품명').fill('');
  await next(page);
  await expect(page.getByText('상품명을 입력해 주세요.')).toBeVisible(); await expect(stepGroup(page, 1)).toBeVisible();
  await page.getByLabel('상품명').fill('리넨 셔츠'); await next(page); await expect(stepGroup(page, 2)).toBeVisible();
  await next(page); await expect(stepGroup(page, 2)).toBeVisible();
  await expect(page.locator('[data-field="sourceUrl"]').getByRole('alert')).toBeVisible();
  await expect(page.locator('[data-field="category"]')).toHaveCount(0); // 카테고리는 4단계라 아직 검사하지 않는다
});

test('결과 확인 단계에서 심사 요청 때 빠진 칸이 있으면 그 칸이 있는 단계로 옮겨 표시한다', async ({ page }) => {
  await fillStep1(page); await next(page);
  await page.goto('/#/seller/new?step=4'); await pickCategory(page);
  await page.goto('/#/seller/new?step=5'); await expect(stepGroup(page, 5)).toBeVisible();
  await page.getByRole('button', { name: '판매 심사 요청하기' }).click();
  await expect(page).toHaveURL(/step=2/); await expect(stepGroup(page, 2)).toBeVisible();
  await expect(page.locator('[data-field="sourceUrl"]').getByRole('alert')).toBeVisible();
});

test('나가기를 고르면 초안을 지워 다시 열면 빈 화면, 계속 작성과 새로고침은 이어 쓴다', async ({ page }) => {
  await fillStep1(page); await next(page); await expect(stepGroup(page, 2)).toBeVisible();
  await page.getByLabel('한정 판매가').fill('9000');
  // 새로고침해도 초안과 단계가 남는다
  await page.reload(); await expect(stepGroup(page, 2)).toBeVisible(); await expect(page.getByLabel('한정 판매가')).toHaveValue('9,000');
  await page.getByRole('button', { name: '이전 화면' }).click(); await expect(stepGroup(page, 1)).toBeVisible();
  await page.getByRole('button', { name: '이전 화면' }).click();
  await expect(confirmDialog(page)).toBeVisible(); await expect(confirmDialog(page)).toContainText('지금 나가면 작성 중인 내용이 사라져요.');
  await confirmDialog(page).getByRole('button', { name: '계속 작성' }).click(); await expect(stepGroup(page, 1)).toBeVisible(); await expect(page.getByLabel('상품명')).toHaveValue('리넨 셔츠');
  await page.getByRole('button', { name: '이전 화면' }).click(); await confirmDialog(page).getByRole('button', { name: '나가기' }).click();
  await expect(page).toHaveURL(/seller\/products/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('stockdrop:v1')!).drafts.seller)).toBeUndefined();
  await page.getByRole('link', { name: '상품 등록' }).click(); await expect(stepGroup(page, 1)).toBeVisible();
  await expect(page.getByLabel('상품명')).toHaveValue(''); await expect(page.getByText('0/10')).toBeVisible();
});

test('나갔다가 마지막 단계부터 이어 쓴다(초안의 단계 기억)', async ({ page }) => {
  await fillStep1(page); await next(page); await page.getByLabel('한정 판매가').fill('9000');
  await page.goto('/#/seller/products');
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('stockdrop:v1')!); s.drafts.seller.wizardStep = 2; localStorage.setItem('stockdrop:v1', JSON.stringify(s)); });
  await page.reload(); await page.goto('/#/seller/new');
  await expect(page).toHaveURL(/step=2/); await expect(stepGroup(page, 2)).toBeVisible();
  await expect(page.getByLabel('한정 판매가')).toHaveValue('9,000');
});

test('예전 순서로 저장한 초안의 단계는 같은 화면이 있는 단계로 바꿔 연다', async ({ page }) => {
  await fillStep1(page); await next(page); await expect(stepGroup(page, 2)).toBeVisible();
  await page.goto('/#/seller/products');
  // 예전 순서의 2단계(카테고리) → 지금 4단계, 예전 3단계(가격) → 지금 2단계
  for (const [old, now] of [[2, 4], [3, 2], [4, 3]]) {
    await page.evaluate(n => { const s = JSON.parse(localStorage.getItem('stockdrop:v1')!); s.drafts.seller.wizardStep = n; delete s.drafts.seller.wizardOrder; localStorage.setItem('stockdrop:v1', JSON.stringify(s)); }, old);
    await page.reload(); await page.goto('/#/seller/new');
    await expect(page).toHaveURL(new RegExp(`step=${now}`)); await expect(stepGroup(page, now)).toBeVisible();
    await page.goto('/#/seller/products');
  }
});

test('판매 정보 수정도 같은 5단계이고 수정 안내는 1단계와 결과 확인 단계에 보인다', async ({ page }) => {
  await page.goto('/#/seller/new?edit=notebook'); await page.reload();
  await expect(page.getByRole('heading', { name: '판매 정보 수정' })).toBeVisible(); await expect(stepGroup(page, 1)).toBeVisible();
  await expect(page.getByText('수정하면 판매 심사를 다시 받아요.', { exact: false })).toBeVisible();
  await next(page); await expect(page).toHaveURL(/edit=notebook.*step=2|step=2.*edit=notebook/);
  await expect(page.getByText('수정하면 판매 심사를 다시 받아요.', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('group', { name: '옵션 1단계 종류', exact: true })).toBeVisible();
  await next(page); await expect(stepGroup(page, 3)).toBeVisible();
  await next(page); await expect(stepGroup(page, 4)).toBeVisible();
  await expect(aiState(page).getByText('AI가 사진을 분석하고 있어요')).toHaveCount(0); // 수정은 AI 분석을 저절로 시작하지 않는다
  await next(page); await expect(stepGroup(page, 5)).toBeVisible();
  await expect(page.getByText('수정하면 판매 심사를 다시 받아요.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: '수정 심사 요청' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
