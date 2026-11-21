import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { blockExternal } from './session';

/** 판매 등록 5단계: 단계 이동(주소 ?step=), 휴대폰 뒤로 가기와 헤더 뒤로, 단계별 필수 검사, 제출 오류 단계 이동, 초안 이어 쓰기, 수정 흐름, 나가기 확인창 */
const stepGroup = (page: Page, n: number) => page.getByRole('group', { name: new RegExp(`판매 등록 ${n}/5단계`) });
const next = (page: Page) => page.getByRole('button', { name: '다음', exact: true }).click();
const confirmDialog = (page: Page) => page.getByRole('dialog', { name: '작성을 그만할까요?' });

test.beforeEach(async ({ page }) => {
  await blockExternal(page); await page.goto('/#/');
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('stockdrop:v1')!); s.activeUserId = 'seller'; s.auth.userId = 'seller'; s.auth.onboarded = true; s.aiOutcome = 'auto'; delete s.drafts.seller; localStorage.setItem('stockdrop:v1', JSON.stringify(s)); });
});
/** 판매 상품 관리에서 + 로 들어와 1단계를 채운다 */
async function fillStep1(page: Page) {
  await page.goto('/#/seller/products'); await page.reload();
  await page.getByRole('link', { name: '상품 등록' }).click(); await expect(stepGroup(page, 1)).toBeVisible();
  await page.getByLabel('상품 사진 업로드').setInputFiles([path.join(process.cwd(), 'public/images/seller-register-1.jpg')]);
  await page.getByLabel('상품명').fill('리넨 셔츠'); await page.getByLabel('짧은 설명').fill('새 상품'); await page.getByLabel('처분 사유').fill('시즌 재고');
}
async function pickCategory(page: Page) {
  await page.getByRole('button', { name: /카테고리를 선택해 주세요/ }).click();
  await page.getByLabel('카테고리 검색').fill('가방'); await page.getByRole('radio', { name: '패션 › 잡화 › 가방' }).check(); await page.getByRole('button', { name: '카테고리 저장' }).click();
  await expect(page.getByRole('dialog', { name: '카테고리 선택' })).toHaveCount(0);
}

test('다음으로 단계를 넘기면 주소에 남고, 휴대폰 뒤로 가기와 헤더 뒤로는 이전 단계로 가며 입력은 그대로다', async ({ page }) => {
  await fillStep1(page);
  await next(page); await expect(page).toHaveURL(/step=2/); await expect(stepGroup(page, 2)).toBeVisible();
  await expect(confirmDialog(page)).toHaveCount(0); // 단계 사이 이동은 나가기 확인창이 없다
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
  await expect(page.getByText(/카테고리를 선택/)).toHaveCount(0); // 다음 단계 칸은 아직 검사하지 않는다
  await page.getByLabel('상품명').fill('리넨 셔츠'); await next(page); await expect(stepGroup(page, 2)).toBeVisible();
  await next(page); await expect(stepGroup(page, 2)).toBeVisible();
  await expect(page.locator('[data-field="category"]').getByRole('alert')).toBeVisible();
  await pickCategory(page); await next(page); await expect(stepGroup(page, 3)).toBeVisible();
});

test('확인 단계에서 심사 요청 때 빠진 칸이 있으면 그 칸이 있는 단계로 옮겨 표시한다', async ({ page }) => {
  await fillStep1(page); await next(page); await pickCategory(page);
  await page.goto('/#/seller/new?step=5'); await expect(stepGroup(page, 5)).toBeVisible();
  await page.getByRole('button', { name: '판매 심사 요청하기' }).click();
  await expect(page).toHaveURL(/step=3/); await expect(stepGroup(page, 3)).toBeVisible();
  await expect(page.locator('[data-field="sourceUrl"]').getByRole('alert')).toBeVisible();
});

test('나갔다 다시 열면 임시 저장한 초안을 마지막 단계부터 이어 쓴다. 등록 흐름을 떠날 때만 확인창이 뜬다', async ({ page }) => {
  await fillStep1(page); await next(page); await pickCategory(page); await next(page); await expect(stepGroup(page, 3)).toBeVisible();
  await page.getByLabel('한정 판매가').fill('9000');
  await page.getByRole('button', { name: '이전 화면' }).click(); await expect(stepGroup(page, 2)).toBeVisible();
  await page.getByRole('button', { name: '이전 화면' }).click(); await expect(stepGroup(page, 1)).toBeVisible();
  await page.getByRole('button', { name: '이전 화면' }).click();
  await expect(confirmDialog(page)).toBeVisible(); await expect(confirmDialog(page)).toContainText('임시 저장');
  await confirmDialog(page).getByRole('button', { name: '계속 작성' }).click(); await expect(stepGroup(page, 1)).toBeVisible();
  await page.getByRole('button', { name: '이전 화면' }).click(); await confirmDialog(page).getByRole('button', { name: '나가기' }).click();
  await expect(page).toHaveURL(/seller\/products/);
  await page.getByRole('link', { name: '상품 등록' }).click();
  await expect(page).toHaveURL(/step=1|seller\/new$/);
  await page.goto('/#/seller/products'); await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('stockdrop:v1')!); s.drafts.seller.wizardStep = 3; localStorage.setItem('stockdrop:v1', JSON.stringify(s)); });
  await page.reload(); await page.goto('/#/seller/new');
  await expect(page).toHaveURL(/step=3/); await expect(stepGroup(page, 3)).toBeVisible();
  await expect(page.getByLabel('한정 판매가')).toHaveValue('9,000');
});

test('판매 정보 수정도 같은 5단계이고 수정 안내는 1단계와 확인 단계에 보인다', async ({ page }) => {
  await page.goto('/#/seller/new?edit=notebook'); await page.reload();
  await expect(page.getByRole('heading', { name: '판매 정보 수정' })).toBeVisible(); await expect(stepGroup(page, 1)).toBeVisible();
  await expect(page.getByText('수정하면 판매 심사를 다시 받아요.', { exact: false })).toBeVisible();
  await next(page); await expect(page).toHaveURL(/edit=notebook.*step=2|step=2.*edit=notebook/);
  await expect(page.getByText('수정하면 판매 심사를 다시 받아요.', { exact: false })).toHaveCount(0);
  await next(page); await expect(stepGroup(page, 3)).toBeVisible(); await expect(page.getByRole('group', { name: '옵션 1단계 종류', exact: true })).toBeVisible();
  await next(page); await expect(stepGroup(page, 4)).toBeVisible();
  await next(page); await expect(stepGroup(page, 5)).toBeVisible();
  await expect(page.getByText('수정하면 판매 심사를 다시 받아요.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: '수정 심사 요청' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
