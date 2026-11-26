import { describe, expect, it, vi } from 'vitest';
// store.ts가 import 시점에 window·localStorage를 쓴다(node 환경에는 없음)
const mem = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {}, localStorage });
const { AI_MESSAGES, aiStateOf, editBlocker, savedWizardStep, WIZARD_ORDER } = await import('./wizard');

describe('판매 정보 수정 가능 여부(서버 status 기준)', () => {
  const now = Date.parse('2026-11-12T00:00:00Z'), future = Date.parse('2026-11-12T01:30:00Z'), past = Date.parse('2026-11-11T00:00:00Z');
  it('반려·초안은 판매 시작 시각과 무관하게 수정 가능', () => {
    expect(editBlocker({ reviewStatus: 'REJECTED', startsAt: past }, now)).toBeNull();
    expect(editBlocker({ reviewStatus: 'REJECTED', startsAt: 0 }, now)).toBeNull();
    expect(editBlocker({ reviewStatus: 'DRAFT', startsAt: 0 }, now)).toBeNull();
  });
  it('심사 중은 불가, 승인은 판매 시작 전만', () => {
    expect(editBlocker({ reviewStatus: 'IN_REVIEW', startsAt: future }, now)).toContain('심사 중');
    expect(editBlocker({ reviewStatus: 'APPROVED', startsAt: future }, now)).toBeNull();
    expect(editBlocker({ reviewStatus: 'APPROVED', startsAt: past }, now)).toContain('판매 시작 후');
  });
  it('광고 미확정 초안은 편집을 막고 반려 뒤 PAID 취소 대기는 광고 OFF 재심사를 허용한다', () => {
    expect(editBlocker({ reviewStatus: 'DRAFT', startsAt: future, advertising: { requested: true, paymentStatus: 'PENDING' } as never }, now)).toContain('광고 결제 처리 중');
    expect(editBlocker({ reviewStatus: 'REJECTED', startsAt: future, advertising: { requested: true, paymentStatus: 'PAID', cancellationStatus: 'REQUESTED' } as never }, now)).toBeNull();
  });
});

describe('AI 결과(outcome) → 초안 상태', () => {
  const q = [{ suggestionId: 's1', question: '사진 속 흠집은 어느 정도인가요?', reason: '첫 사진 모서리', suggestedAnswer: '판매자 확인 필요' }];
  it('RECOMMENDED는 추천 카테고리·질문만 담는다(신뢰도·대안 없음)', () => {
    expect(aiStateOf('t', { outcome: 'RECOMMENDED', code: 'CLOTHING', category: '의류', questions: q }, 2)).toEqual({ status: 'recommended', signature: 't', category: '', reason: '', result: { code: 'CLOTHING', category: '의류', photos: 2, questions: q } });
  });
  it('NOT_APPLICABLE·UNCLEAR는 실패가 아니라 안내 문구', () => {
    expect(aiStateOf('t', { outcome: 'NOT_APPLICABLE', code: '', category: '', questions: [] }, 1)).toMatchObject({ status: 'uncertain', reason: AI_MESSAGES.NOT_APPLICABLE });
    expect(aiStateOf('t', { outcome: 'UNCLEAR', code: '', category: '', questions: [] }, 1)).toMatchObject({ status: 'uncertain', reason: AI_MESSAGES.UNCLEAR });
    expect(aiStateOf('t', { outcome: 'RECOMMENDED', code: 'X', category: '', questions: [] }, 1)).toMatchObject({ status: 'uncertain', reason: AI_MESSAGES.NO_CATEGORY });
  });
});

describe('판매 등록 단계 이어 쓰기(단계 순서 바뀜)', () => {
  it('지금 순서로 저장한 단계는 그대로 연다', () => {
    for (const n of [1, 2, 3, 4, 5]) expect(savedWizardStep({ wizardStep: n, wizardOrder: WIZARD_ORDER })).toBe(n);
  });
  it('예전 순서(1 기본, 2 카테고리, 3 가격, 4 일정, 5 확인)로 저장한 단계는 같은 화면이 있는 단계로 바꾼다', () => {
    expect([1, 2, 3, 4, 5].map(n => savedWizardStep({ wizardStep: n }))).toEqual([1, 4, 2, 3, 5]);
  });
  it('없거나 이상한 값은 1단계', () => {
    expect(savedWizardStep({})).toBe(1); expect(savedWizardStep({ wizardStep: 9, wizardOrder: WIZARD_ORDER })).toBe(1); expect(savedWizardStep({ wizardStep: 2.5 })).toBe(1);
  });
});
