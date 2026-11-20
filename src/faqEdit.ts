/**
 * 판매 중 상품 FAQ 하나씩 수정(화면: pages/sellerFaq.tsx)의 판단 로직. 화면 없이 테스트할 수 있게 분리했다.
 * 서버(ProductCommandService ProductFaqController, RegistrationRequests.FaqMutation):
 * - POST /seller/products/{id}/faqs, PUT …/faqs/{faqId}, DELETE …/faqs/{faqId}?expectedVersion=
 * - expectedVersion은 상품 version(다르면 409 PRODUCT_STATE), 응답은 상품 전체(새 version)
 * - 판매 심사 중(IN_REVIEW)만 막고(409 PRODUCT_STATE) 작성 중·반려·승인(판매 예정·중·종료) 상품은 바꿀 수 있다. 심사를 다시 받지 않는다
 * - question 1~2000자, answer 1~8000자(앞뒤 공백 제거), confirmed=true만 저장, 개수 제한 없음
 */
import type { Faq } from './domain';

export const FAQ_QUESTION_MAX = 2000, FAQ_ANSWER_MAX = 8000;

/** 입력 확인. 문제가 없으면 '' */
export function faqProblem(question: string, answer: string): string {
  if (!question.trim()) return '질문을 입력해 주세요.';
  if (question.trim().length > FAQ_QUESTION_MAX) return `질문은 ${FAQ_QUESTION_MAX.toLocaleString('ko-KR')}자 이하로 입력해 주세요.`;
  if (!answer.trim()) return '답변을 입력해 주세요.';
  if (answer.trim().length > FAQ_ANSWER_MAX) return `답변은 ${FAQ_ANSWER_MAX.toLocaleString('ko-KR')}자 이하로 입력해 주세요.`;
  return '';
}

/** 구매자 상품 상세(공개 조회 모델)의 FAQ가 판매자 원본과 같은지: 순서와 무관하게 질문과 답변 쌍을 비교한다 */
export function sameFaqs(publicFaqs: Pick<Faq, 'question' | 'answer'>[], sellerFaqs: Pick<Faq, 'question' | 'answer'>[]): boolean {
  const key = (f: Pick<Faq, 'question' | 'answer'>) => `${f.question.trim()}\u0000${f.answer.trim()}`;
  const a = publicFaqs.map(key).sort(), b = sellerFaqs.map(key).sort();
  return a.length === b.length && a.every((k, i) => k === b[i]);
}

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) { reject(new DOMException('요청이 취소됐어요.', 'AbortError')); return; }
  const t = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve(); }, ms);
  const stop = () => { clearTimeout(t); reject(new DOMException('요청이 취소됐어요.', 'AbortError')); };
  signal?.addEventListener('abort', stop, { once: true });
});

/**
 * 공개 조회 모델은 Kafka로 늦게 반영된다(retryProjection과 같은 이유). 바꾼 뒤 구매자 상세를 몇 번 다시 읽어 반영됐는지 알려 준다.
 * 끝내 다르거나 일시 오류면 false(실패로 보지 않고 '잠시 뒤 반영' 안내)
 */
export async function waitForPublicFaqs(load: () => Promise<Pick<Faq, 'question' | 'answer'>[]>, expected: Pick<Faq, 'question' | 'answer'>[], signal?: AbortSignal, delays = [500, 1000, 2500]): Promise<boolean> {
  for (let attempt = 0; ; attempt++) {
    try { if (sameFaqs(await load(), expected)) return true; }
    catch (e) { if ((e as Error).name === 'AbortError') throw e; }
    if (attempt >= delays.length) return false;
    await wait(delays[attempt], signal);
  }
}
