import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { blockExternal } from './session';

/** 판매 등록 5단계(1 기본 → 2 가격 → 3 일정 → 4 카테고리와 AI → 5 결과 확인): 단계 이동, 뒤로 가기, 단계별 검사, 비동기 AI 분석, 초안 이어 쓰기, 수정 흐름, 나가기 확인창 */
const stepGroup = (page: Page, n: number) => page.getByRole('group', { name: new RegExp(`판매 등록 ${n}/5단계`) });
const next = (page: Page) => page.getByRole('button', { name: '다음', exact: true }).click();
const confirmDialog = (page: Page) => page.getByRole('dialog', { name: /작성을 그만할까요|작성 중인 내용을 임시 저장할까요/ });
const aiState = (page: Page) => page.getByLabel('AI 분석 상태');

async function seller(page: Page, aiOutcome = 'auto') {
  await blockExternal(page); await page.goto('/#/');
  await page.evaluate(o => { const s = JSON.parse(localStorage.getItem('stockdrop:v1')!); s.activeUserId = 'seller'; s.auth.userId = 'seller'; s.auth.onboarded = true; s.aiOutcome = o; delete s.drafts.seller; localStorage.setItem('stockdrop:v1', JSON.stringify(s)); }, aiOutcome);
}
test.beforeEach(async ({ page }) => { await seller(page); });
/** 판매 상품 관리에서 + 로 들어와 1단계를 채운다 */
async function fillStep1(page: Page) {
  await page.goto('/#/seller/products'); await page.reload();
  await page.getByRole('button', { name: '이전 화면', exact: true }).click(); await page.getByRole('navigation', { name: '하단 메뉴' }).getByRole('link', { name: '홈', exact: true }).click(); await page.getByRole('link', { name: '판매 등록', exact: true }).click(); await expect(stepGroup(page, 1)).toBeVisible();
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
  await expect(page.getByRole('status').filter({ hasText: 'AI가 사진을 분석하고 있어요' })).toHaveText('AI가 사진을 분석하고 있어요');
  await page.goto('/#/seller/new?step=4');
  await expect(aiState(page).getByText('AI가 사진을 분석하고 있어요')).toBeVisible();
  // 자동 갱신: 끝나면 다시 열지 않아도 추천 카테고리와 질문이 채워진다
  await expect(page.getByRole('status', { name: 'AI 분석 반영 안내' })).toContainText('AI 분석 결과를 반영했어요', { timeout: 15000 });
  await expect(page.getByRole('status', { name: 'AI 분석 반영 안내' }).getByRole('button')).toHaveCount(0); // 완료 상자는 닫기 없이 한 줄
  await expect(aiState(page).getByText('AI가 사진을 분석하고 있어요')).toHaveCount(0);
  await expect(page.locator('[data-field="category"]')).not.toContainText('카테고리를 선택해 주세요');
  await expect(page.locator('[data-field="aiQuestions"]')).toBeVisible();
});

test('분석이 끝나기 전에도 4단계에서 카테고리를 직접 골라 진행하고, 끝나면 고른 카테고리는 그대로 둔다', async ({ page }) => {
  await fillStep1(page); await next(page); await expect(stepGroup(page, 2)).toBeVisible();
  await page.goto('/#/seller/new?step=4'); await expect(aiState(page).getByText('AI가 사진을 분석하고 있어요')).toBeVisible();
  await pickCategory(page);
  const kept = page.getByRole('status', { name: 'AI 분석 반영 안내' });
  await expect(kept).toContainText('직접 고른 카테고리를 그대로 두었어요', { timeout: 15000 });
  await expect(page.locator('[data-field="category"]')).toContainText('패션 › 잡화 › 가방');
  await expect(kept.getByRole('button', { name: '닫기' })).toHaveCount(0); await expect(kept.getByRole('button', { name: 'AI 추천으로 바꾸기' })).toBeVisible();
  // 글자 버튼은 누르는 영역 44px이지만 상자는 크게 늘지 않는다
  expect((await kept.getByRole('button', { name: 'AI 추천으로 바꾸기' }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await kept.boundingBox())!.height).toBeLessThan(90);
});

test('분석이 실패하면 4단계에 사유와 다시 분석, 직접 선택이 보이고 직접 골라 진행할 수 있다', async ({ page }) => {
  await seller(page, 'failed');
  await fillStep1(page); await next(page); await expect(stepGroup(page, 2)).toBeVisible();
  await page.goto('/#/seller/new?step=4');
  await expect(aiState(page).getByRole('alert')).toContainText('AI가 사진을 분석하지 못했어요', { timeout: 15000 });
  await aiState(page).getByRole('button', { name: '다시 분석' }).click();
  await expect(aiState(page).getByText('AI가 사진을 분석하고 있어요')).toBeVisible();
  await expect(aiState(page).getByRole('alert')).toBeVisible({ timeout: 15000 });
  await aiState(page).getByRole('button', { name: '카테고리 직접 선택' }).click();
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
  await expect(confirmDialog(page)).toBeVisible(); await expect(confirmDialog(page)).toContainText('임시 저장한 상품은 판매 상품 관리에서 이어서 등록할 수 있어요.');
  await confirmDialog(page).getByRole('button', { name: '계속 작성' }).click(); await expect(stepGroup(page, 1)).toBeVisible(); await expect(page.getByLabel('상품명')).toHaveValue('리넨 셔츠');
  await page.getByRole('button', { name: '이전 화면' }).click(); await confirmDialog(page).getByRole('button', { name: '삭제하고 나가기' }).click();
  await expect(page).toHaveURL(/#\/$/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('stockdrop:v1')!).drafts.seller)).toBeUndefined();
  await page.getByRole('link', { name: '판매 등록', exact: true }).click(); await expect(stepGroup(page, 1)).toBeVisible();
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

/* ── AI 분석 상태 상자와 사진 변경 뒤 재분석 ── */
const aiDraft = (page: Page) => page.evaluate(() => { const a = JSON.parse(localStorage.getItem('stockdrop:v1')!).drafts.seller?.ai; return a ? { status: a.status, signature: a.signature, name: a.input?.name, photos: a.input?.images?.length } : null; });
const box = (page: Page) => aiState(page).locator('[data-tone]');
const bg = (page: Page) => box(page).evaluate(el => getComputedStyle(el).backgroundColor);
const SECOND_PHOTO = path.join(process.cwd(), 'public/images/seller-register-1.jpg');

test('상자 색은 상태별: 진행 중 회색, 완료 초록, 판매 분류 아님·판단 불가·실패 노랑. 2·3단계도 같은 상자다', async ({ page }) => {
  await fillStep1(page); await next(page); await expect(stepGroup(page, 2)).toBeVisible();
  const top = page.locator('[data-tone]').first();
  await expect(top).toHaveAttribute('data-tone', 'progress'); await expect(top).toHaveText('AI가 사진을 분석하고 있어요');
  expect(await top.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(245, 245, 245)');
  await expect(top).toHaveAttribute('data-tone', 'done', { timeout: 15000 }); await expect(top).toHaveText('AI 분석 결과를 반영했어요');
  await page.goto('/#/seller/new?step=3'); await expect(stepGroup(page, 3)).toBeVisible(); await expect(page.locator('[data-tone="done"]')).toBeVisible();
  await page.goto('/#/seller/new?step=4'); await expect(box(page)).toHaveAttribute('data-tone', 'done');
  expect(await bg(page)).toBe('rgb(238, 248, 243)');
  for (const [o, text] of [['unsupported', '판매 가능한 분류가 아닌 사진으로 보여요'], ['uncertain', '사진이 선명하지 않아 판단하지 못했어요'], ['failed', 'AI가 사진을 분석하지 못했어요']] as const) {
    await seller(page, o); await fillStep1(page); await next(page);
    await page.goto('/#/seller/new?step=4');
    await expect(box(page)).toHaveAttribute('data-tone', 'warn', { timeout: 15000 });
    // 상자 글은 아이콘과 한 줄뿐(설명 줄 없음), 버튼은 유지
    await expect(box(page).locator('p')).toHaveCount(1); await expect(box(page).locator('p')).toHaveText(text);
    expect(await bg(page)).toBe('rgb(255, 247, 224)');
    await expect(box(page).getByRole('button', { name: '사진 바꾸기' })).toBeVisible(); await expect(box(page).getByRole('button', { name: '카테고리 직접 선택' })).toBeVisible();
    for (const b of await box(page).getByRole('button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

/** 사진 바꾸기 뒤 1단계 아래 버튼: '진행 중이던 단계로 돌아가기' 하나뿐(다음, 카테고리로 가기 없음) */
async function onlyReturnButton(page: Page) {
  const bar = page.locator('.safe-bottom');
  await expect(bar.getByRole('button')).toHaveCount(1); await expect(bar.getByRole('button', { name: '진행 중이던 단계로 돌아가기' })).toBeVisible();
  await expect(page.getByRole('button', { name: '다음', exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: '카테고리로 가기' })).toHaveCount(0);
}
/** 분석 상태가 분석 중이 아닐 때까지 기다리며 거친 분석(signature)을 모은다 */
async function analysesUntilSettled(page: Page, from: string | undefined) {
  const seen = new Set<string>();
  await expect.poll(async () => { const a = await aiDraft(page); if (a?.signature && a.signature !== from) seen.add(a.signature); return a?.status; }, { timeout: 20000, intervals: [100] }).not.toBe('analyzing');
  return seen.size;
}
async function fillStep2(page: Page) { await page.getByLabel('타 플랫폼 판매 URL').fill('https://www.coupang.com/vp/products/1'); await page.getByLabel('한정 판매가').fill('9000'); await page.getByRole('button', { name: '기본 수량 증가' }).click(); }
const toStep = async (page: Page, n: number) => { await page.goto(`/#/seller/new?step=${n}`); await expect(stepGroup(page, n)).toBeVisible(); };

test('4단계 판매 분류 아님 뒤 사진 바꾸기 → 1단계 사진 칸, 돌아가기 버튼 하나 → 사진을 바꾸고 돌아가기 → 한 번 다시 분석하고 4단계에 새 결과', async ({ page }) => {
  await seller(page, 'unsupported'); await fillStep1(page); await next(page);
  await toStep(page, 4); await expect(box(page)).toHaveAttribute('data-tone', 'warn', { timeout: 15000 });
  const first = await aiDraft(page);
  await box(page).getByRole('button', { name: '사진 바꾸기' }).click();
  await expect(page).toHaveURL(/step=1/); await expect(page).toHaveURL(/from=ai/); await expect(page).toHaveURL(/back=4/); await expect(stepGroup(page, 1)).toBeVisible();
  await expect(page.locator('[data-field="images"]')).toBeInViewport();
  await onlyReturnButton(page);
  // 새로고침해도 돌아가기 버튼이 남는다. 이번엔 판매 가능한 상품으로 분석되게
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('stockdrop:v1')!); s.aiOutcome = 'auto'; localStorage.setItem('stockdrop:v1', JSON.stringify(s)); });
  await page.reload(); await onlyReturnButton(page);
  await page.getByLabel('상품 사진 업로드').setInputFiles([SECOND_PHOTO]); await expect(page.getByText('2/10')).toBeVisible();
  await page.getByRole('button', { name: '진행 중이던 단계로 돌아가기' }).click();
  await expect(page).toHaveURL(/step=4/); await expect(page).not.toHaveURL(/from=ai/); await expect(stepGroup(page, 4)).toBeVisible();
  expect(await analysesUntilSettled(page, first?.signature)).toBe(1);
  await expect(box(page)).toHaveAttribute('data-tone', 'done'); expect((await aiDraft(page))?.photos).toBe(2);
  await expect(page.locator('[data-field="category"]')).not.toContainText('카테고리를 선택해 주세요');
});

for (const at of [2, 3] as const) test(`${at}단계에서 입력하고 사진 바꾸기 → 입력은 초안에 남고 1단계 버튼 하나 → 사진 바꾸고 돌아가기는 분석 1회와 ${at}단계로, 안 바꾸면 분석 0회`, async ({ page }) => {
  await seller(page, 'unsupported'); await fillStep1(page); await next(page); await expect(stepGroup(page, 2)).toBeVisible();
  if (at === 3) { await fillStep2(page); await next(page); await expect(stepGroup(page, 3)).toBeVisible(); }
  await expect(page.locator('[data-tone="warn"]')).toBeVisible({ timeout: 15000 });
  // 입력 중(포커스가 칸에 있는 채로) 사진 바꾸기를 누른다
  const field = at === 2 ? page.getByLabel('타 플랫폼 판매 URL') : page.getByLabel('배송 안내');
  const value = at === 2 ? 'https://www.coupang.com/vp/products/77' : '제주 추가 배송비 3,000원';
  if (at === 2) await page.getByLabel('한정 판매가').fill('12000');
  await field.fill(value);
  const first = await aiDraft(page);
  await page.locator('[data-tone="warn"]').getByRole('button', { name: '사진 바꾸기' }).click();
  await expect(stepGroup(page, 1)).toBeVisible(); await expect(page).toHaveURL(new RegExp(`back=${at}`));
  const saved = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('stockdrop:v1')!).drafts.seller; return { url: d.originalUrl, price: d.price, notice: d.shippingNotice }; });
  if (at === 2) expect(saved).toMatchObject({ url: value, price: 12000 }); else expect(saved.notice).toBe(value);
  await onlyReturnButton(page);
  // 바꾸지 않고 돌아가기: 분석 요청 없이 출발 단계로, 입력 그대로
  await page.getByRole('button', { name: '진행 중이던 단계로 돌아가기' }).click(); await expect(stepGroup(page, at)).toBeVisible();
  expect(await aiDraft(page)).toEqual(first); await expect(field).toHaveValue(value);
  // 사진을 바꾸고 돌아가기: 분석 1회, 출발 단계로
  await page.locator('[data-tone="warn"]').getByRole('button', { name: '사진 바꾸기' }).click(); await expect(stepGroup(page, 1)).toBeVisible();
  await page.getByLabel('상품 사진 업로드').setInputFiles([SECOND_PHOTO]); await expect(page.getByText('2/10')).toBeVisible();
  await page.getByRole('button', { name: '진행 중이던 단계로 돌아가기' }).click(); await expect(stepGroup(page, at)).toBeVisible();
  expect(await analysesUntilSettled(page, first?.signature)).toBe(1);
  await expect(field).toHaveValue(value);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('돌아가기는 1단계 필수 칸이 비면 머물고 그 칸을 표시한다', async ({ page }) => {
  await seller(page, 'unsupported'); await fillStep1(page); await next(page);
  await expect(page.locator('[data-tone="warn"]')).toBeVisible({ timeout: 15000 });
  await page.locator('[data-tone="warn"]').getByRole('button', { name: '사진 바꾸기' }).click(); await expect(stepGroup(page, 1)).toBeVisible();
  await page.getByLabel('상품명').fill('');
  await page.getByRole('button', { name: '진행 중이던 단계로 돌아가기' }).click();
  await expect(stepGroup(page, 1)).toBeVisible(); await expect(page.locator('[data-field="name"]').getByRole('alert')).toBeVisible(); await expect(page.getByLabel('상품명')).toBeFocused();
});

test('AI 다시 분석은 지금 단계(2단계) 칸이 비어 있어도 분석을 다시 요청하고 칸 오류를 띄우지 않는다. 분석 입력이 비면 1단계 그 칸으로 간다', async ({ page }) => {
  await seller(page, 'failed'); await fillStep1(page); await next(page); await expect(stepGroup(page, 2)).toBeVisible();
  await expect(page.locator('[data-tone="warn"]')).toBeVisible({ timeout: 15000 });
  // 2단계 칸: 판매가 비움, 판매 URL은 고치는 중(올바르지 않은 값)
  await page.getByLabel('타 플랫폼 판매 URL').fill('coupang');
  const first = await aiDraft(page);
  await page.locator('[data-tone="warn"]').getByRole('button', { name: '다시 분석' }).click();
  await expect(stepGroup(page, 2)).toBeVisible();
  expect(await analysesUntilSettled(page, first?.signature)).toBe(1);
  await expect(page.locator('[data-field="price"]').getByRole('alert')).toHaveCount(0); await expect(page.locator('[data-field="options"]').getByRole('alert')).toHaveCount(0);
  // 분석 입력(상품명)이 비면 요청하지 않고 1단계 상품명 칸으로 바로 가서 표시한다
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('stockdrop:v1')!); s.drafts.seller.name = ''; localStorage.setItem('stockdrop:v1', JSON.stringify(s)); });
  await page.reload(); await expect(page.locator('[data-tone="warn"]')).toBeVisible();
  const second = await aiDraft(page);
  await page.locator('[data-tone="warn"]').getByRole('button', { name: '다시 분석' }).click();
  await expect(stepGroup(page, 1)).toBeVisible(); await expect(page.locator('[data-field="name"]').getByRole('alert')).toBeVisible(); await expect(page.getByLabel('상품명')).toBeFocused();
  expect(await aiDraft(page)).toEqual(second); await onlyReturnButton(page);
});

test('뒤로 가기는 언제나 지금 단계 - 1: 3단계 → 사진 바꾸기 → 1단계 → 돌아가기 → 3단계 뒤 헤더 뒤로와 휴대폰 뒤로 모두 2 → 1 → 나가기 확인창', async ({ page }) => {
  for (const how of ['header', 'phone'] as const) {
    await seller(page, 'unsupported'); await fillStep1(page); await next(page);
    await fillStep2(page); await next(page); await expect(stepGroup(page, 3)).toBeVisible();
    await expect(page.locator('[data-tone="warn"]')).toBeVisible({ timeout: 15000 });
    await page.locator('[data-tone="warn"]').getByRole('button', { name: '사진 바꾸기' }).click(); await expect(stepGroup(page, 1)).toBeVisible();
    await page.getByRole('button', { name: '진행 중이던 단계로 돌아가기' }).click(); await expect(stepGroup(page, 3)).toBeVisible();
    const back = () => (how === 'header' ? page.getByRole('button', { name: '이전 화면' }).click() : page.goBack());
    await back(); await expect(stepGroup(page, 2)).toBeVisible(); await expect(confirmDialog(page)).toHaveCount(0);
    await back(); await expect(stepGroup(page, 1)).toBeVisible(); await expect(confirmDialog(page)).toHaveCount(0);
    await onlyNextButton(page);
    await back(); await expect(confirmDialog(page)).toBeVisible();
    await confirmDialog(page).getByRole('button', { name: '계속 작성' }).click(); await expect(stepGroup(page, 1)).toBeVisible();
  }
});
async function onlyNextButton(page: Page) { await expect(page.locator('.safe-bottom').getByRole('button')).toHaveCount(1); await expect(page.getByRole('button', { name: '다음', exact: true })).toBeVisible(); }

test('판단 불가 뒤 1단계에서 사진을 바꾸고 다음을 누르면 다시 분석하고 옛 안내는 사라진다', async ({ page }) => {
  await seller(page, 'unsupported'); await fillStep1(page); await next(page);
  await page.goto('/#/seller/new?step=4'); await expect(box(page)).toContainText('판매 가능한 분류', { timeout: 15000 });
  await page.goto('/#/seller/new?step=1'); await page.getByLabel('상품 사진 업로드').setInputFiles([SECOND_PHOTO]); await expect(page.getByText('2/10')).toBeVisible();
  // 다음을 누르기 전 4단계: 정보가 바뀌었다는 노랑 상자, 옛 안내는 숨는다
  await page.goto('/#/seller/new?step=4'); await expect(box(page)).toHaveText(/^사진이나 정보가 바뀌어 다시 분석이 필요해요/); await expect(box(page)).not.toContainText('판매 가능한 분류');
  await page.goto('/#/seller/new?step=1'); await next(page); await expect(stepGroup(page, 2)).toBeVisible();
  expect((await aiDraft(page))?.status).toBe('analyzing');
  await expect(page.locator('[data-tone]').first()).toHaveAttribute('data-tone', 'progress');
});

test('분석 중에 사진이나 정보를 바꾸면 끝날 때 바뀐 입력으로 한 번 더 분석해 옛 결과를 새 결과로 보이지 않는다', async ({ page }) => {
  await seller(page, 'unsupported'); await fillStep1(page); await next(page); await expect(stepGroup(page, 2)).toBeVisible();
  expect((await aiDraft(page))?.status).toBe('analyzing');
  await page.goto('/#/seller/new?step=1'); await page.getByLabel('상품명').fill('리넨 셔츠 바꿈'); await next(page);
  // 끝난 첫 분석은 옛 이름(리넨 셔츠) 기준이라 바로 다시 분석하고, 마지막 결과는 바뀐 이름 기준이다
  await expect.poll(async () => (await aiDraft(page))?.name, { timeout: 20000 }).toBe('리넨 셔츠 바꿈');
  await expect.poll(async () => (await aiDraft(page))?.status, { timeout: 20000 }).toBe('uncertain');
  await page.goto('/#/seller/new?step=4'); await expect(box(page)).toContainText('판매 가능한 분류'); await expect(box(page)).not.toContainText('분석한 뒤에');
});
