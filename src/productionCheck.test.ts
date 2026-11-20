import { describe, expect, it } from 'vitest';
import { carryAiAnswers, formatPhone, maskName, orderNo } from './domain';
import type { Faq } from './domain';
import { addBusinessDays, kstDay, openDay } from './dates';
import { faqsToSave } from './api/sellerProducts';
import { blankDraft } from './domain';

const kst = (s: string) => Date.parse(`${s}+09:00`);

describe('영업일·오픈 표시', () => {
  it('목요일 결제 + 2영업일 = 다음 주 월요일(주말 제외)', () => { expect(kstDay(addBusinessDays(kst('2026-11-19T15:10:00'), 2))).toBe('11.23 (월)'); });
  it('금요일 결제 + 1영업일 = 월요일', () => { expect(kstDay(addBusinessDays(kst('2026-11-20T10:00:00'), 1))).toBe('11.23 (월)'); });
  it('오늘 오픈이면 D-1이 아니라 오늘', () => { expect(openDay(kst('2026-11-19T18:00:00'), kst('2026-11-19T16:00:00'))).toBe('오늘 18:00 오픈'); });
  it('내일 오픈은 D-1', () => { expect(openDay(kst('2026-11-20T09:00:00'), kst('2026-11-19T23:00:00'))).toMatch(/^D-1 · 11.20 \(금\) 09:00 오픈$/); });
});

describe('표시 형식', () => {
  it('주문번호는 앞 10자리 대문자', () => { expect(orderNo('f518ddb9-74a8-41d1-9312-df247b7f86b0')).toBe('F518DDB974'); });
  it('연락처 하이픈', () => { expect(formatPhone('01000000000')).toBe('010-0000-0000'); expect(formatPhone('0212345678')).toBe('02-1234-5678'); expect(formatPhone('abc')).toBe('abc'); });
  it('이름 가리기', () => { expect(maskName('테스트')).toBe('테*트'); expect(maskName('홍길')).toBe('홍*'); expect(maskName('')).toBe(''); });
});

describe('다시 분석한 뒤 AI 질문 답', () => {
  const faq = (sid: string, q: string, a: string): Faq => ({ id: `faq-${sid}`, question: q, answer: a, confirmed: true, suggestionId: sid });
  it('같은 문구의 새 질문으로 답을 옮기고, 옮길 곳 없는 답은 지운다', () => {
    const next = [{ suggestionId: 'c', question: '흠집이 있나요?', reason: '' }];
    const out = carryAiAnswers([faq('a', '흠집이 있나요? ', '작은 흠집'), faq('b', '포장은?', '새 박스'), { id: 'f1', question: '직접', answer: '답', confirmed: true }], next);
    expect(out).toEqual([{ id: 'faq-c', question: '흠집이 있나요?', answer: '작은 흠집', confirmed: true, suggestionId: 'c' }, { id: 'f1', question: '직접', answer: '답', confirmed: true }]);
  });
  it('그대로 남는 질문의 답을 옮겨 오는 답이 덮지 않는다', () => {
    const out = carryAiAnswers([faq('a', 'Q-b', 'A'), faq('b', 'Q-b', 'B')], [{ suggestionId: 'b', question: 'Q-b', reason: '' }]);
    expect(out).toEqual([faq('b', 'Q-b', 'B')]);
  });
  it('확인 전 AI 예상 답변은 옮기지 않고 새 예상 답변으로 다시 채운다', () => {
    const draft: Faq = { ...faq('a', 'Q', '예전 초안'), confirmed: false };
    const out = carryAiAnswers([draft], [{ suggestionId: 'n', question: 'Q', reason: '', suggestedAnswer: '새 초안' }, { suggestionId: 'm', question: 'Q2', reason: '' }]);
    expect(out).toEqual([{ id: 'faq-n', question: 'Q', answer: '새 초안', confirmed: false, suggestionId: 'n' }]);
  });
  it('확인 전 AI 예상 답변은 저장하지 않고, 확인한 답만 저장한다', () => {
    const d = { ...blankDraft(), faqs: [{ ...faq('s1', 'Q1', 'AI 초안'), confirmed: false }, faq('s2', 'Q2', '확인한 답')], ai: { status: 'recommended' as const, signature: '', category: '', reason: '', result: { code: 'CLOTHING', category: '숏패딩', photos: 1, questions: [{ suggestionId: 's1', question: 'Q1', reason: '' }, { suggestionId: 's2', question: 'Q2', reason: '' }] } } };
    expect(faqsToSave(d).map(f => f.suggestionId)).toEqual(['s2']);
  });
  it('지금 분석에 없는 질문의 답은 저장하지 않는다(서버가 거절)', () => {
    const d = { ...blankDraft(), faqs: [faq('old', 'Q', 'A'), faq('cur', 'Q2', 'A2')], ai: { status: 'recommended' as const, signature: '', category: '', reason: '', result: { code: 'CLOTHING', category: '숏패딩', photos: 1, questions: [{ suggestionId: 'cur', question: 'Q2', reason: '' }] } } };
    expect(faqsToSave(d).map(f => f.suggestionId)).toEqual(['cur']);
  });
  it('분석 결과를 모르는 초안은 서버 답을 그대로 둔다', () => {
    const d = { ...blankDraft(), faqs: [faq('x', 'Q', 'A')] };
    expect(faqsToSave(d).map(f => f.suggestionId)).toEqual(['x']);
  });
});

describe('정산 예정 금액', () => {
  it('한정 수량 90% 넘게 팔린 상품만 10% 수수료', async () => {
    const { settlementNet } = await import('./api/sellerOrders');
    const d = { month: '2026-11', confirmedOrders: 3, confirmedAmount: 30000, awaitingOrders: 0, awaitingAmount: 0, products: [{ productId: 'a', productName: 'A', orders: 2, quantity: 2, amount: 20000 }, { productId: 'b', productName: 'B', orders: 1, quantity: 1, amount: 10000 }] };
    expect(settlementNet(d, { a: { total: 10, sold: 10 }, b: { total: 10, sold: 9 } })).toEqual({ gross: 30000, fee: 2000, net: 28000 });
    expect(settlementNet(d, {})).toBeUndefined(); // 수량을 모르면 금액을 확정하지 않는다
  });
});
