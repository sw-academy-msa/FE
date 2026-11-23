import { test, expect } from '@playwright/test';
import { actor, signInDemo } from './session';
test.use({ viewport: { width: 402, height: 874 } });
test.beforeEach(async ({ page }) => { await signInDemo(page); await actor(page, 'seller'); });
test('담당자 저장은 변경할 때만 보이고 원복과 저장 뒤 숨는다', async ({ page }) => {
  await page.goto('/#/seller/settings/business'); const input = page.getByLabel('업무 이메일', { exact: true }), save = page.getByRole('button', { name: '저장하기', exact: true }); const old = await input.inputValue();
  await expect(save).toHaveCount(0); await input.fill('changed@example.com'); await expect(save).toBeVisible(); await input.fill(old); await expect(save).toHaveCount(0); await input.fill('changed@example.com'); await save.click(); await expect(save).toHaveCount(0); await expect(page.getByText('사업자 정보 변경은 고객지원으로 요청해 주세요.')).toHaveCount(0);
});
test('목업 계좌는 새 입력을 비우고 마지막 저장 값만 일부 마스킹한다', async ({ page }) => {
  await page.goto('/#/seller/settings/bank'); const account = page.getByLabel('계좌번호', { exact: true }), holder = page.getByLabel('예금주', { exact: true }), save = page.getByRole('button', { name: '계좌 변경하기', exact: true });
  await expect(account).toHaveValue(''); await expect(save).toHaveCount(0); const old = await holder.inputValue(); await holder.fill('다른 예금주'); await expect(save).toBeVisible(); await holder.fill(old); await expect(save).toHaveCount(0);
  await account.fill('123456789012'); await holder.fill('합성 예금주'); await save.click(); await expect(save).toHaveCount(0); await expect(account).toHaveValue(''); await expect(page.getByLabel('현재 정산 계좌')).toContainText('********9012'); await expect(page.getByLabel('현재 정산 계좌')).toContainText('합성 예금주');
  expect(await page.evaluate(() => localStorage.getItem('stockdrop:v1'))).not.toContain('123456789012'); await page.reload(); await expect(account).toHaveValue(''); await expect(page.getByLabel('현재 정산 계좌')).toContainText('********9012'); expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
test('주소 목록의 설명 문구를 제거한다', async ({ page }) => { await page.goto('/#/seller/settings/addresses'); await expect(page.getByText(/드롭 상품은 기본 출고지에서 발송/)).toHaveCount(0); });
