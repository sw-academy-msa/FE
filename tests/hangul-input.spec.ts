import { expect, test, type Locator } from '@playwright/test';
import { actor, signInDemo } from './session';

async function compose(input: Locator, text: string, start = false) {
  await input.evaluate((node, { text, start }) => {
    const el = node as HTMLInputElement;
    if (start) el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, text);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: text, isComposing: true }));
  }, { text, start });
}
async function finish(input: Locator, text: string) {
  await input.evaluate((node, text) => {
    const el = node as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, text);
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: text }));
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  }, text);
}
test.beforeEach(async ({ page }) => { await signInDemo(page); });

test('홈 검색은 한글 조합 중 URL을 바꾸지 않고 완료한 검색어 전체를 반영한다', async ({ page }) => {
  const input = page.getByRole('textbox', { name: '상품 검색' });
  await input.focus(); await compose(input, 'ㅍ', true); await compose(input, '패');
  await expect(input).toHaveValue('패');
  expect(new URL(page.url().split('#')[1], 'http://localhost').searchParams.has('q')).toBe(false);
  await finish(input, '패딩');
  await expect(input).toHaveValue('패딩');
  await expect.poll(() => new URL(page.url().split('#')[1], 'http://localhost').searchParams.get('q')).toBe('패딩');
});
test('판매 등록 상품명과 판매 URL은 조합이 완료된 값만 초안에 저장한다', async ({ page }) => {
  await actor(page, 'seller'); await page.goto('/#/seller/new');
  for (const [label, key, partial, completed] of [['상품명', 'name', '패', '패딩 123'], ['타 플랫폼 판매 URL', 'originalUrl', 'https://예', 'https://example.com/패딩123']]) {
    await page.goto(`/#/seller/new?step=${label === '상품명' ? 1 : 3}`); // 상품명은 1단계, 판매 URL은 3단계
    const input = page.getByRole('textbox', { name: label, exact: true });
    await input.fill(''); await input.focus(); await compose(input, partial, true);
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem('stockdrop:v1')!).drafts.seller[key], key)).toBe('');
    await finish(input, completed);
    await expect(input).toHaveValue(completed);
    await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem('stockdrop:v1')!).drafts.seller[key], key)).toBe(completed);
  }
});
test('카테고리 검색은 조합 중 목록을 바꾸지 않고 완료 후 검색한다', async ({ page }) => {
  await actor(page, 'seller'); await page.goto('/#/seller/new?pick=category');
  const dialog = page.getByRole('dialog', { name: '카테고리 선택' }), input = dialog.getByRole('textbox', { name: '카테고리 검색' });
  await input.focus(); await compose(input, '패', true);
  await expect(dialog.getByRole('radio')).toHaveCount(0);
  await finish(input, '패션');
  await expect(input).toHaveValue('패션');
  expect(await dialog.getByRole('radio').count()).toBeGreaterThan(0);
});
test('홈 검색의 빠른 영문과 숫자 입력, 삭제와 URL 복원이 유지된다', async ({ page }) => {
  const input = page.getByRole('textbox', { name: '상품 검색' });
  await input.pressSequentially('abc123', { delay: 0 });
  await expect(input).toHaveValue('abc123');
  await expect.poll(() => new URL(page.url().split('#')[1], 'http://localhost').searchParams.get('q')).toBe('abc123');
  await input.press('ControlOrMeta+A'); await input.press('Backspace');
  await expect(input).toHaveValue('');
  await page.goto('/#/?q=노트'); await expect(input).toHaveValue('노트');
});
test('한 렌더 주기 안에 연속 입력해도 앞 글자가 빠지지 않는다', async ({ page }) => {
  const input = page.getByRole('textbox', { name: '상품 검색' });
  await input.focus();
  await input.evaluate(node => {
    const el = node as HTMLInputElement, set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    for (const char of 'abc123') {
      set.call(el, el.value + char);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: char }));
    }
  });
  await expect(input).toHaveValue('abc123');
});
test('한글 조합 완료와 후속 input이 연속 발생해도 글자가 중복되지 않는다', async ({ page }) => {
  for (const text of ['패딩', '한글 테스트 123']) {
    const input = page.getByRole('textbox', { name: '상품 검색' });
    await input.fill(''); await input.focus(); await compose(input, text.slice(0, -1), true);
    await finish(input, text); await finish(input, text);
    await expect(input).toHaveValue(text);
    await expect.poll(() => new URL(page.url().split('#')[1], 'http://localhost').searchParams.get('q')).toBe(text);
  }
  await actor(page, 'seller'); await page.goto('/#/seller/new');
  for (const [label, text] of [['상품명', '패딩 한 벌 123'], ['타 플랫폼 판매 URL', 'https://예시.kr/패딩123']]) {
    await page.goto(`/#/seller/new?step=${label === '상품명' ? 1 : 3}`);
    const input = page.getByRole('textbox', { name: label, exact: true });
    await input.fill(''); await input.focus(); await compose(input, text.slice(0, -1), true);
    await finish(input, text); await finish(input, text);
    await expect(input).toHaveValue(text);
  }
  await page.goto('/#/seller/new?pick=category');
  const input = page.getByRole('textbox', { name: '카테고리 검색', exact: true });
  await input.focus(); await compose(input, '패', true); await finish(input, '패션'); await finish(input, '패션');
  await expect(input).toHaveValue('패션');
});
