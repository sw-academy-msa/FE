import { expect, test, type Page } from '@playwright/test';
import { actor, signInDemo } from './session';

/** 작성 중 나가기 확인창(useLeaveGuard): 입력한 내용이 있을 때 뒤로 가기, 헤더 뒤로와 닫기, 하단 탭과 링크 이동을 막고 묻는다 */
const confirmDialog = (page: Page) => page.getByRole('dialog', { name: '작성을 그만할까요?' });
test.beforeEach(async ({ page }) => { await signInDemo(page); });
/** 주소창으로 연 뒤 새로고침해 라우터가 이 기록을 자기 것으로 표시하게 한다(앱 안에서 들어온 것과 같게. 해시만 바꾼 기록은 라우터가 막을 수 없다) */
async function open(page: Page, url: string) { await page.goto(url); await page.reload(); await page.locator('main').waitFor(); }
async function toCompose(page: Page) { await open(page, '/#/support'); await page.getByRole('link', { name: '1:1 문의하기' }).click(); await expect(page).toHaveURL(/#\/inquiries\/compose$/); }

test('1:1 문의: 입력 후 뒤로 가기는 확인창, 계속 작성이면 입력 유지, 닫기와 나가기면 이전 화면', async ({ page }) => {
  await toCompose(page);
  await page.getByRole('textbox', { name: '제목' }).fill('배송 문의');
  await page.goBack();
  await expect(confirmDialog(page)).toBeVisible(); await expect(page).toHaveURL(/#\/inquiries\/compose$/);
  await confirmDialog(page).getByRole('button', { name: '계속 작성' }).click();
  await expect(confirmDialog(page)).toHaveCount(0); await expect(page.getByRole('textbox', { name: '제목' })).toHaveValue('배송 문의'); await expect(page).toHaveURL(/#\/inquiries\/compose$/);
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(confirmDialog(page)).toBeVisible();
  await confirmDialog(page).getByRole('button', { name: '나가기' }).click();
  await expect(page).toHaveURL(/#\/support$/); await expect(confirmDialog(page)).toHaveCount(0);
});

test('입력이 없으면 확인창 없이 바로 나간다', async ({ page }) => {
  await toCompose(page);
  await page.goBack();
  await expect(page).toHaveURL(/#\/support$/); await expect(confirmDialog(page)).toHaveCount(0);
});

test('보내기(저장) 성공 뒤의 이동은 확인창 없이 진행된다', async ({ page }) => {
  await toCompose(page);
  await page.getByRole('textbox', { name: '제목' }).fill('결제 문의'); await page.getByRole('textbox', { name: '문의 내용' }).fill('결제가 두 번 된 것 같아요.');
  await page.getByRole('button', { name: '문의 보내기' }).click();
  await expect(page).toHaveURL(/#\/inquiries\/q-/); await expect(confirmDialog(page)).toHaveCount(0);
});

test('판매 등록: 입력 후 뒤로 가기는 기본 안내 확인창(나가면 초안이 지워진다), 계속 작성이면 입력 유지, 나가기면 이전 화면', async ({ page }) => {
  await actor(page, 'seller'); await open(page, '/#/seller/products');
  await page.getByRole('link', { name: '상품 등록' }).click(); await expect(page).toHaveURL(/#\/seller\/new$/);
  await page.getByLabel('상품명').fill('리넨 셔츠');
  await page.goBack();
  await expect(confirmDialog(page)).toBeVisible(); await expect(confirmDialog(page)).toContainText('지금 나가면 작성 중인 내용이 사라져요.');
  await confirmDialog(page).getByRole('button', { name: '계속 작성' }).click();
  await expect(page).toHaveURL(/#\/seller\/new$/); await expect(page.getByLabel('상품명')).toHaveValue('리넨 셔츠');
  await page.getByRole('button', { name: '이전 화면' }).click();
  await expect(confirmDialog(page)).toBeVisible();
  await confirmDialog(page).getByRole('button', { name: '나가기' }).click();
  await expect(page).toHaveURL(/#\/seller\/products$/);
});

test('시트가 열려 있으면 뒤로 가기는 시트만 닫고, 하단 탭 이동은 확인창을 띄운다', async ({ page }) => {
  await open(page, '/#/'); await page.locator('a[href="#/product/ecobag"]').first().click(); await expect(page).toHaveURL(/#\/product\/ecobag$/);
  await page.getByRole('textbox', { name: '상품 문의 내용' }).fill('사이즈가 궁금해요');
  await page.getByRole('button', { name: /남은.*선착순 구매하기/ }).click();
  const sheet = page.getByRole('dialog', { name: '옵션 선택' }); await expect(sheet).toBeVisible();
  await page.goBack();
  await expect(sheet).toHaveCount(0); await expect(confirmDialog(page)).toHaveCount(0); await expect(page).toHaveURL(/#\/product\/ecobag$/);
  await page.getByRole('navigation', { name: '하단 메뉴' }).getByRole('link', { name: '주문' }).click();
  await expect(confirmDialog(page)).toBeVisible();
  await confirmDialog(page).getByRole('button', { name: '계속 작성' }).click();
  await expect(page).toHaveURL(/#\/product\/ecobag$/); await expect(page.getByRole('textbox', { name: '상품 문의 내용' })).toHaveValue('사이즈가 궁금해요');
  await page.goBack(); await expect(confirmDialog(page)).toBeVisible();
  await confirmDialog(page).getByRole('button', { name: '나가기' }).click();
  await expect(page).toHaveURL(/#\/$/);
});
