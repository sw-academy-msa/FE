import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import path from 'node:path';
import { blockExternal } from './session';

// 판매자 계정으로 기본 목업을 연 상태에서 시작한다
async function addOption(page: Page, name: string) { await page.getByRole('button', { name: '직접 추가', exact: true }).click(); await page.getByLabel('직접 추가', { exact: true }).fill(name); await page.keyboard.press('Enter'); }
async function addValue(page: Page, dim: string, v: string) { await page.getByRole('button', { name: dim + ' 추가', exact: true }).click(); await page.getByLabel(dim + ' 추가', { exact: true }).fill(v); await page.keyboard.press('Enter'); }
const group = (page: Page, i: number, name: string) => page.getByRole('group', { name: '옵션 ' + i + '단계 ' + name, exact: true });
const qty = (page: Page, label: string) => page.getByLabel(label + ' 수량', { exact: true });

test.beforeEach(async ({ page }) => {
  await blockExternal(page);
  await page.goto('/#/');
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('stockdrop:v1')!);
    s.activeUserId = 'seller'; s.auth.userId = 'seller'; s.auth.onboarded = true; s.aiOutcome = 'auto'; delete s.drafts.seller;
    localStorage.setItem('stockdrop:v1', JSON.stringify(s));
  });
});

test('판매 상품 등록 5단계 → AI 분석 적용 → 판매 심사 요청 → 심사 대기', async ({ page }) => {
  await page.goto('/#/seller/new'); await page.reload();
  await expect(page.getByRole('heading', { name: '한정 판매 등록' })).toBeVisible();
  const stepGroup = (n: number) => page.getByRole('group', { name: new RegExp(`판매 등록 ${n}/5단계`) });
  const next = () => page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(stepGroup(1)).toBeVisible();

  // 1단계: 사진과 기본 정보. 비어 있으면 다음에서 이 단계 칸만 알려 준다
  await next();
  await expect(page.getByText('상품 사진을 1장 이상 올려 주세요.')).toBeVisible(); await expect(stepGroup(1)).toBeVisible();
  const images = ['seller-register-1.jpg', 'seller-register-2.jpg'].map(f => path.join(process.cwd(), 'public/images', f));
  await page.getByLabel('상품 사진 업로드').setInputFiles(images);
  await expect(page.getByText('2/10')).toBeVisible();
  await page.getByLabel('상품명').fill('울 블렌드 오버핏 니트 (차콜)');
  // 설명·처분 사유가 비어 있으면 AI 분석 버튼이 빠진 칸을 알려 준다
  await page.getByRole('button', { name: 'AI로 카테고리 분석하기' }).click();
  await expect(page.getByText('짧은 설명을 입력해 주세요.')).toBeVisible();
  await expect(page.getByText('처분 사유를 입력해 주세요.')).toBeVisible();
  await expect(page.getByText('분석은 선택이라 건너뛰고')).toBeVisible(); await expect(page.getByText('상품 전체가 보이는 사진과 라벨')).toBeVisible();
  await page.getByLabel('짧은 설명').fill('새 상품, 택 그대로');
  await page.getByLabel('처분 사유').fill('시즌 종료 후 남은 재고');
  await page.getByRole('button', { name: 'AI로 카테고리 분석하기' }).click();
  await expect(page.getByRole('heading', { name: 'AI 상품 분석' })).toBeVisible();
  // 분석이 끝나면 2단계(카테고리)로 돌아와 결과가 바로 반영된다
  await expect(page.getByRole('status', { name: 'AI 분석 반영 안내' })).toContainText('AI 분석 결과를 반영했어요');
  await expect(page).toHaveURL(/step=2/); await expect(stepGroup(2)).toBeVisible();
  await expect(page.getByRole('button', { name: '이 카테고리로 적용' })).toHaveCount(0);
  await expect(page.getByText('패션 › 상의 › 니트/스웨터', { exact: true })).toBeVisible();
  // 점검 기준 입력칸은 질문 문장이 아닌 고정 표시명 그대로
  await page.getByLabel('소재·혼용률', { exact: true }).fill('울 80%');
  await next(); await expect(stepGroup(3)).toBeVisible();

  // 3단계: 가격과 수량
  await page.getByLabel('타 플랫폼 판매 URL').fill('coupang.com/vp/products/7348215906');
  await expect(page.getByText('http:// 또는 https://로 시작하는 주소를 입력해 주세요.')).toBeVisible();
  await page.getByLabel('타 플랫폼 판매 URL').fill('https://coupang.com/vp/products/7348215906');
  await expect(page.getByText('확인됨')).toBeVisible();
  await page.getByLabel('한정 판매가').fill('49000');
  await expect(page.getByText('45% 저렴')).toBeVisible();
  // 옵션은 옵션 없음으로 시작하고 판매자가 이름을 정해 직접 추가한다
  await addOption(page, '색상'); await addValue(page, '색상', '차콜');
  await addOption(page, '사이즈'); await addValue(page, '사이즈', 'S');
  await next(); await expect(page.getByText('옵션별 한정 수량을 1개 이상 입력해 주세요.').or(page.getByRole('alert').filter({ hasText: '수량' }))).toBeVisible(); await expect(stepGroup(3)).toBeVisible();
  for (let i = 0; i < 5; i++) await page.getByLabel('차콜 / S 증가').click();
  await expect(page.getByText('차콜 5')).toBeVisible();
  await next(); await expect(stepGroup(4)).toBeVisible();

  // 4단계: 택배사·반품 배송비 → 배송 안내 글 자동 작성(교환은 지원하지 않아 교환 배송비 칸 없음)
  await page.getByLabel('택배사').selectOption('CJ대한통운'); await page.getByLabel('반품 배송비').fill('3000'); await expect(page.getByLabel('교환 배송비')).toHaveCount(0);
  await expect(page.getByLabel('배송 안내')).toHaveValue('CJ대한통운 / 반품 배송비 3,000원');
  await next(); await expect(stepGroup(5)).toBeVisible();

  // 5단계: 요약과 AI 질문(AI 예상 답변은 확인 전 초안, 판매자가 확인하거나 고친 답만 FAQ로 저장)
  await expect(page.getByText('입력한 내용')).toBeVisible();
  await expect(page.getByText(/구매자가 물어볼 만한 질문이에요/)).toBeVisible();
  const draftAnswer = page.getByRole('textbox', { name: /AI 질문 답: 시즌 종료 재고/ }); await expect(draftAnswer).toHaveValue(/창고에 보관하던 재고/);
  await expect(page.getByText('AI 예상 답변 · 확인 전')).toBeVisible(); await expect(page.getByText(/확인하기 전에는 저장하지 않아요/)).toBeVisible();
  const confirm = page.getByRole('checkbox', { name: '이 답을 확인했어요' });
  await confirm.check(); await expect(page.getByText('AI 예상 답변 · 확인 전')).toHaveCount(0); await confirm.uncheck(); await expect(page.getByText('AI 예상 답변 · 확인 전')).toBeVisible();
  const aiAnswer = page.getByRole('textbox', { name: /AI 질문 답: 사진의 색감/ }); await expect(aiAnswer).toHaveValue(''); await expect(aiAnswer).toHaveAttribute('placeholder', /직접 답해 주세요/);
  await aiAnswer.fill('자연광에서 찍어 실제 색과 비슷해요'); await expect(page.getByText('이 답은 상품 FAQ로 구매자에게도 공개돼요')).toBeVisible();

  // 요약의 수정은 그 단계로 간다. 분석 뒤에 정보가 바뀌면 2단계에 다시 분석 안내가 뜨고 AI 질문은 숨는다
  await page.getByRole('button', { name: '상품명 수정' }).click(); await expect(stepGroup(1)).toBeVisible();
  await page.getByLabel('상품명').fill('울 블렌드 오버핏 니트 (차콜) 수정');
  await next(); await expect(page.getByText('정보가 바뀌어 AI 질문을 다시 받아야 해요')).toBeVisible();
  await page.goBack(); await expect(stepGroup(1)).toBeVisible();
  await page.getByLabel('상품명').fill('울 블렌드 오버핏 니트 (차콜)');
  await page.goto('/#/seller/new?step=5'); await expect(aiAnswer).toHaveValue('자연광에서 찍어 실제 색과 비슷해요');

  // 물품 검수: 모두 확인하지 않으면 심사 요청이 막힌다
  await page.getByRole('button', { name: '판매 심사 요청하기' }).click();
  await expect(page.getByText('물품 검수 항목을 모두 확인해 주세요.')).toBeVisible();
  for (const c of await page.getByRole('checkbox', { name: /새 상품이에요|구성품이 모두|사용한 흔적|사진이 지금/ }).all()) await c.check();
  await page.getByRole('button', { name: '판매 심사 요청하기' }).click();
  await expect(page.getByRole('heading', { name: '판매 심사 결과' })).toBeVisible();

  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('stockdrop:v1')!));
  const p = s.products.find((p: { name: string }) => p.name === '울 블렌드 오버핏 니트 (차콜)');
  expect(p.category).toBe('패션 › 상의 › 니트/스웨터');
  expect(p.brand).toBe('아틀리에 노트');
  expect(p.options).toEqual([expect.objectContaining({ name: '차콜 / S', stock: 5 })]);
  expect(p.faqs).toEqual([expect.objectContaining({ question: '사진의 색감이 실제와 비슷한가요?', answer: '자연광에서 찍어 실제 색과 비슷해요', suggestionId: 'mock-suggestion-2' })]);
  expect(p.extras).toEqual([{ key: '소재·혼용률', value: '울 80%' }]);
  expect(p.shippingNotice).toBe('CJ대한통운 / 반품 배송비 3,000원');
});

test('옵션은 옵션 없음과 직접 추가만으로 시작하고, 이름 세 단계까지 추가와 고치기와 삭제를 한다', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto('/#/seller/new?step=3'); await page.reload();
  const options = page.locator('[data-field="options"]');
  await expect(options.getByRole('button', { name: '옵션 없음', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(options.getByRole('button', { name: '직접 추가', exact: true })).toBeVisible();
  // 색상, 카테고리 추천 칩, 빠른 선택은 처음부터 없다
  for (const n of ['색상', '사이즈', '사이즈(mm)', '규격', '묶음 수량', '크기', '용량']) await expect(options.getByRole('button', { name: n, exact: true })).toHaveCount(0);
  await expect(options.getByText('빠른 선택')).toHaveCount(0);
  await expect(options.getByRole('group')).toHaveCount(0);
  await expect(page.getByText('기본 수량')).toBeVisible();

  // 이름은 판매자가 정한다. 같은 이름은 막는다
  await addOption(page, '맛'); await expect(group(page, 1, '맛')).toBeVisible();
  await addOption(page, '맛'); await expect(page.getByRole('alert')).toHaveText('이미 있는 옵션 이름이에요.');
  await addOption(page, '용량');
  await addValue(page, '맛', '딸기'); await addValue(page, '맛', '초코'); await addValue(page, '용량', '250ml');
  await addValue(page, '맛', '딸기'); await expect(page.getByRole('alert')).toHaveText('이미 있는 옵션 값이에요.');
  await expect(page.getByText('맛 × 용량별 수량')).toBeVisible();
  // 수량은 직접 입력하거나 버튼으로 고친다
  await qty(page, '딸기 / 250ml').fill('12');
  await page.getByLabel('초코 / 250ml 증가').click(); await page.getByLabel('초코 / 250ml 증가').click();
  await expect(page.getByText('딸기 12 · 초코 2')).toBeVisible();
  await expect(page.getByText('14개').first()).toBeVisible();

  // 두 단계일 때 이름과 값을 눌러 고친다(수량은 그대로 따라간다)
  await page.getByRole('button', { name: '맛 값 딸기 고치기' }).click();
  await page.getByLabel('맛 값 딸기 고치기').fill('바나나'); await page.keyboard.press('Enter');
  await expect(qty(page, '바나나 / 250ml')).toHaveValue('12');
  await page.getByRole('button', { name: '옵션 이름 용량 고치기' }).click();
  await page.getByLabel('옵션 이름 용량 고치기').fill('맛'); await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toHaveText('이미 있는 옵션 이름이에요.');
  await page.getByLabel('옵션 이름 용량 고치기').fill('사이즈'); await page.keyboard.press('Enter');
  await expect(group(page, 2, '사이즈')).toBeVisible(); await expect(page.getByText('맛 × 사이즈별 수량')).toBeVisible();

  // 세 단계까지. 세 단계에서도 값과 수량을 고칠 수 있다
  await addOption(page, '포장'); await addValue(page, '포장', '박스');
  await expect(options.getByRole('button', { name: '직접 추가', exact: true })).toHaveCount(0);
  await expect(page.getByText('옵션은 3단계까지 추가할 수 있어요')).toBeVisible();
  await qty(page, '바나나 / 250ml / 박스').fill('3');
  await page.getByRole('button', { name: '포장 값 박스 고치기' }).click();
  await page.getByLabel('포장 값 박스 고치기').fill('선물 상자'); await page.keyboard.press('Enter');
  await expect(qty(page, '바나나 / 250ml / 선물 상자')).toHaveValue('3');
  await page.getByRole('button', { name: '옵션 이름 포장 고치기' }).click();
  await page.getByLabel('옵션 이름 포장 고치기').fill('포장 방식'); await page.keyboard.press('Enter');
  await expect(group(page, 3, '포장 방식')).toBeVisible();
  // 긴 값도 402px 화면을 넘지 않는다
  await addValue(page, '포장 방식', '아주 긴 포장 설명이 들어간 옵션 값 예시입니다 화면을 넘지 않아야 해요');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  // 값 삭제는 그 값의 수량도 지운다
  await page.getByRole('button', { name: '포장 방식 값 선물 상자 삭제' }).click();
  await expect(qty(page, '바나나 / 250ml / 선물 상자')).toHaveCount(0);
  await page.getByRole('button', { name: /^포장 방식 값 아주 긴 .* 삭제$/ }).click();
  await expect(page.getByText('옵션 값을 추가하면 조합별 수량을 넣을 수 있어요')).toBeVisible();
  // 값이 없는 단계는 바로 지워지고 앞 단계 수량은 그대로다
  await page.getByRole('button', { name: '포장 방식 옵션 삭제' }).click();
  await expect(qty(page, '바나나 / 250ml')).toHaveValue('12');
  // 값이 있는 단계를 지우면 확인한 뒤 값과 수량을 함께 지운다
  await page.getByRole('button', { name: '맛 옵션 삭제' }).click();
  await expect(page.getByRole('dialog', { name: "'맛' 옵션을 지울까요?" })).toBeVisible();
  await page.getByRole('button', { name: '취소', exact: true }).click(); await expect(group(page, 1, '맛')).toBeVisible();
  await page.getByRole('button', { name: '맛 옵션 삭제' }).click(); await page.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(group(page, 1, '사이즈')).toBeVisible(); await expect(qty(page, '250ml')).toHaveValue('0');
  // 옵션 없음을 누르면 확인 뒤 모두 지운다
  await options.getByRole('button', { name: '옵션 없음', exact: true }).click(); await page.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(options.getByRole('group')).toHaveCount(0); await expect(page.getByText('기본 수량')).toBeVisible();
  await expect(options.getByRole('button', { name: '옵션 없음', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('저장된 상품과 예전 색상 x 사이즈 초안을 열면 같은 이름과 수량으로 보이고 그대로 저장된다', async ({ page }) => {
  // 저장된 상품(종류 x 구성 두 단계, 첫 단계가 색상이 아님)
  await page.goto('/#/seller/new?edit=notebook&step=3'); await page.reload();
  await expect(group(page, 1, '종류')).toBeVisible(); await expect(group(page, 2, '구성')).toBeVisible();
  await expect(qty(page, '무지 / 2권 세트')).toHaveValue('18'); await expect(qty(page, '도트 / 2권 세트')).toHaveValue('12');
  // 예전 로컬 초안(색상 x 이름 정한 두 번째 단계, 수량 키 '색상|값')
  await page.goto('/#/seller/products');
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('stockdrop:v1')!);
    s.drafts.seller = { ...s.drafts.seller, editingId: undefined, optionDims: undefined, axes: { color: true, size: true }, sizeName: '묶음 수량', colors: ['블랙'], sizes: ['3개입', '5개입'], stock: { '블랙|3개입': 5, '블랙|5개입': 1 } };
    localStorage.setItem('stockdrop:v1', JSON.stringify(s));
  });
  await page.reload(); await page.goto('/#/seller/new?step=3');
  await expect(group(page, 1, '색상')).toBeVisible(); await expect(group(page, 2, '묶음 수량')).toBeVisible();
  await expect(qty(page, '블랙 / 3개입')).toHaveValue('5'); await expect(qty(page, '블랙 / 5개입')).toHaveValue('1');
  await page.getByLabel('블랙 / 5개입 증가').click();
  const d = await page.evaluate(() => JSON.parse(localStorage.getItem('stockdrop:v1')!).drafts.seller);
  expect(d.optionDims).toEqual([{ name: '색상', values: ['블랙'] }, { name: '묶음 수량', values: ['3개입', '5개입'] }]);
  expect(d.axes).toBeUndefined();
  expect(d.options.map((o: { name: string; stock: number }) => [o.name, o.stock])).toEqual([['블랙 / 3개입', 5], ['블랙 / 5개입', 2]]);
  expect(d.dimensions).toEqual([{ name: '색상', values: '블랙' }, { name: '묶음 수량', values: '3개입, 5개입' }]);
});
