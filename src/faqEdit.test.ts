import { afterEach, describe, expect, it, vi } from 'vitest';
import { FAQ_ANSWER_MAX, FAQ_QUESTION_MAX, faqProblem, sameFaqs, waitForPublicFaqs } from './faqEdit';

afterEach(() => vi.useRealTimers());
const f = (question: string, answer: string) => ({ question, answer });

describe('판매 중 상품 FAQ 수정', () => {
  it('서버 글자 수 제한(질문 2000자, 답변 8000자)과 빈 값을 확인한다', () => {
    expect(faqProblem(' ', '답')).toContain('질문');
    expect(faqProblem('질문', '  ')).toContain('답변');
    expect(faqProblem('가'.repeat(FAQ_QUESTION_MAX + 1), '답')).toContain('2,000자');
    expect(faqProblem('질문', '가'.repeat(FAQ_ANSWER_MAX + 1))).toContain('8,000자');
    expect(faqProblem(' 사이즈는요? ', ' 정사이즈예요 ')).toBe('');
  });
  it('구매자 상세 FAQ가 판매자 원본과 같은지 순서와 앞뒤 공백 없이 비교한다', () => {
    expect(sameFaqs([f('b', '2'), f('a', '1')], [f('a ', '1'), f('b', '2')])).toBe(true);
    expect(sameFaqs([f('a', '1')], [f('a', '1'), f('b', '2')])).toBe(false);
    expect(sameFaqs([f('a', 'old')], [f('a', 'new')])).toBe(false);
  });
  it('조회 모델 반영이 늦으면 잠시 뒤 다시 읽어 반영을 확인한다', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const p = waitForPublicFaqs(async () => { calls++; return calls < 3 ? [] : [f('a', '1')]; }, [f('a', '1')]);
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe(true);
    expect(calls).toBe(3);
  });
  it('끝내 반영되지 않거나 일시 오류가 이어지면 실패로 보지 않고 false를 돌려준다', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const p = waitForPublicFaqs(async () => { calls++; if (calls === 2) throw new Error('잠시 오류'); return []; }, [f('a', '1')]);
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe(false);
    expect(calls).toBe(4);
  });
  it('화면을 떠나면(취소) 더 기다리지 않는다', async () => {
    const c = new AbortController(); c.abort();
    await expect(waitForPublicFaqs(async () => [], [f('a', '1')], c.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
