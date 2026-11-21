import { expect, test, type Page } from '@playwright/test';
import { actor, editState, signInDemo } from './session';

/**
 * 작성 중 나가기 점검: 입력 → 확인창(작성 중인 내용이 사라져요) → 나가기 → 다시 들어오면 빈 화면.
 * 계속 작성은 입력이 남는다(leave-guard.spec.ts). 입점 신청과 판매자 정정은 이 기기에 계속 저장하는 예외라 여기서 다루지 않는다
 */
const confirmDialog = (page: Page) => page.getByRole('dialog', { name: '작성을 그만할까요?' });
const MESSAGE = '지금 나가면 작성 중인 내용이 사라져요.';
async function open(page: Page, url: string) { await page.goto(url); await page.reload(); await page.locator('main').waitFor(); }
/** 헤더 뒤로(이전 화면)로 떠나 확인창에서 나가기를 고른다 */
async function leaveByBack(page: Page) {
  await page.getByRole('button', { name: '이전 화면' }).first().click();
  await expect(confirmDialog(page)).toBeVisible(); await expect(confirmDialog(page)).toContainText(MESSAGE);
  await confirmDialog(page).getByRole('button', { name: '나가기' }).click(); await expect(confirmDialog(page)).toHaveCount(0);
}
test.beforeEach(async ({ page }) => {
  await signInDemo(page);
  // 답변 전 1:1 문의 하나(고객 추가 문의, 운영자 답변 화면용)
  await editState(page, st => { st.inquiries.unshift({ id: 'q-ops', userId: 'buyer', sellerId: 'stockdrop', productId: '', productName: '계정 문의', kind: '계정', question: '로그인이 자꾸 풀려요', public: false, createdAt: Date.now() }); st.inquiries.unshift({ id: 'q-thread', userId: 'buyer', sellerId: 'seller', productId: 'ecobag', orderId: 'SD-2026-001', productName: '아틀리에 노트 · 데일리 코튼 에코백', kind: '하자·파손', question: '포장이 찢어졌어요', messages: [{ seller: false, body: '포장이 찢어졌어요', createdAt: Date.now() }], public: false, createdAt: Date.now() }); });
});

const buyerForms: [string, string, string, string][] = [
  ['1:1 문의 작성', '/#/inquiries/compose', '제목', '배송 문의'],
  ['고객 문의 상세 추가 문의', '/#/inquiries/q-thread', '추가 문의', '한 번 더 문의해요'],
  ['배송지 추가', '/#/addresses/new', '받는 분', '홍길동'],
];
for (const [name, url, label, text] of buyerForms) test(`${name}: 나가기 뒤 다시 들어오면 빈 칸`, async ({ page }) => {
  await open(page, url);
  const box = page.getByLabel(label, { exact: true }); await expect(box).toBeVisible(); await box.fill(text);
  await leaveByBack(page); await expect(page).not.toHaveURL(new RegExp(url.replace('/#', '#').replace(/[/?]/g, m => '\\' + m) + '$'));
  await open(page, url); await expect(page.getByLabel(label, { exact: true })).toHaveValue('');
});

test('주문 문의: 새로고침은 이어 쓰고, 나가기를 고르면 이 창에 남긴 글도 지운다', async ({ page }) => {
  await open(page, '/#/orders/SD-2026-001/inquiry');
  const box = page.getByLabel('문의 내용', { exact: true }); await box.fill('포장이 찢어져 왔어요');
  await page.reload(); await expect(page.getByLabel('문의 내용', { exact: true })).toHaveValue('포장이 찢어져 왔어요');
  await leaveByBack(page);
  await open(page, '/#/orders/SD-2026-001/inquiry'); await expect(page.getByLabel('문의 내용', { exact: true })).toHaveValue('');
});

test('상품 문의: 하단 탭으로 떠날 때 확인창, 나가기 뒤 다시 들어오면 빈 칸', async ({ page }) => {
  await open(page, '/#/product/ecobag');
  await page.getByRole('textbox', { name: '상품 문의 내용' }).fill('사이즈가 궁금해요');
  await page.getByRole('navigation', { name: '하단 메뉴' }).getByRole('link', { name: '주문' }).click();
  await expect(confirmDialog(page)).toContainText(MESSAGE); await confirmDialog(page).getByRole('button', { name: '나가기' }).click();
  await open(page, '/#/product/ecobag'); await expect(page.getByRole('textbox', { name: '상품 문의 내용' })).toHaveValue('');
});

test('회원가입과 비밀번호 재설정: 나가기 뒤 다시 들어오면 빈 칸', async ({ page }) => {
  await editState(page, s => { s.auth.userId = null; s.activeUserId = ''; });
  for (const url of ['/#/signup', '/#/reset-password']) {
    await open(page, url);
    const email = page.getByRole('textbox', { name: '이메일', exact: true }); await email.fill('someone@example.com');
    await leaveByBack(page);
    await open(page, url); await expect(page.getByRole('textbox', { name: '이메일', exact: true })).toHaveValue('');
  }
});

test('판매자 설정, 판매자 답변, 탈퇴: 나가기 뒤 다시 들어오면 처음 값', async ({ page }) => {
  await actor(page, 'seller');
  await open(page, '/#/seller/settings/business');
  const phone = page.getByLabel('연락처', { exact: true }); const before = await phone.inputValue(); await phone.fill('01099998888');
  await leaveByBack(page);
  await open(page, '/#/seller/settings/business'); await expect(page.getByLabel('연락처', { exact: true })).toHaveValue(before);
  await open(page, '/#/seller/inquiries/q-seed');
  await page.getByLabel('답변 입력', { exact: true }).fill('손잡이는 60cm예요');
  await leaveByBack(page);
  await open(page, '/#/seller/inquiries/q-seed'); await expect(page.getByLabel('답변 입력', { exact: true })).toHaveValue('');
  await open(page, '/#/seller/settings/withdraw');
  await page.getByLabel('비밀번호 확인', { exact: true }).fill('password1!');
  await leaveByBack(page);
  await open(page, '/#/seller/settings/withdraw'); await expect(page.getByLabel('비밀번호 확인', { exact: true })).toHaveValue('');
});

test('운영자 문의 답변: 나가기 뒤 다시 들어오면 빈 칸', async ({ page }) => {
  await actor(page, 'admin');
  await open(page, '/#/admin/inquiries');
  await page.getByRole('button', { name: /로그인이 자꾸 풀려요/ }).click();
  await page.getByLabel('문의 답변').fill('확인해 볼게요');
  await leaveByBack(page);
  await open(page, '/#/admin/inquiries'); await page.getByRole('button', { name: /로그인이 자꾸 풀려요/ }).click();
  await expect(page.getByLabel('문의 답변')).toHaveValue('');
});

test('판매 정보 수정: 나가기를 고르면 수정 중이던 초안을 지워 다시 열면 원래 값', async ({ page }) => {
  await actor(page, 'seller');
  await open(page, '/#/seller/new?edit=notebook');
  const name = page.getByLabel('상품명'); const before = await name.inputValue(); await name.fill(before + ' 수정');
  await leaveByBack(page);
  await open(page, '/#/seller/new?edit=notebook'); await expect(page.getByLabel('상품명')).toHaveValue(before);
});
