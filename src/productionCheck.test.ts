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
  it('같은 점검 항목의 새 질문으로 답을 옮기고, 옮길 곳 없는 답은 지운다', () => {
    const prev = [{ suggestionId: 'a', checkCode: 'CARE', question: '세탁 방법은?', reason: '' }, { suggestionId: 'b', checkCode: 'SIZE', question: '실측은?', reason: '' }];
    const next = [{ suggestionId: 'c', checkCode: 'CARE', question: '세탁 및 관리 방법을 알려주세요.', reason: '' }];
    const out = carryAiAnswers([faq('a', '세탁 방법은?', '드라이'), faq('b', '실측은?', '68cm'), { id: 'f1', question: '직접', answer: '답', confirmed: true }], prev, next);
    expect(out).toEqual([{ id: 'faq-c', question: '세탁 및 관리 방법을 알려주세요.', answer: '드라이', confirmed: true, suggestionId: 'c' }, { id: 'f1', question: '직접', answer: '답', confirmed: true }]);
  });
  it('그대로 남는 질문의 답을 옮겨 오는 답이 덮지 않는다', () => {
    const prev = [{ suggestionId: 'a', checkCode: 'CARE', question: 'Q-a', reason: '' }, { suggestionId: 'b', checkCode: 'CARE', question: 'Q-b', reason: '' }];
    const out = carryAiAnswers([faq('a', 'Q-a', 'A'), faq('b', 'Q-b', 'B')], prev, [{ suggestionId: 'b', checkCode: 'CARE', question: 'Q-b', reason: '' }]);
    expect(out).toEqual([faq('b', 'Q-b', 'B')]);
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
