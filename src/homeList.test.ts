import { describe, expect, it } from 'vitest';
import { HOME_PAGE_SIZE, homeShown, newestFirst, rankByServerOrder } from './homeList';

const p = (id: string, o: { listRank?: number; publishedAt?: number } = {}) => ({ id, ...o });

describe('홈 상품 최신순', () => {
  it('실제 모드: 서버가 NEWEST(공개 승인 최신순)로 준 순서를 그대로 쓴다', () => {
    const ranked = rankByServerOrder([p('c'), p('a'), p('b')]);
    expect(ranked.map(x => [x.id, x.listRank])).toEqual([['c', 0], ['a', 1], ['b', 2]]);
    expect(newestFirst([p('a', { listRank: 1 }), p('b', { listRank: 2 }), p('c', { listRank: 0 })]).map(x => x.id)).toEqual(['c', 'a', 'b']);
  });
  it('mock 모드: 공개 시각이 늦을수록 앞, 시각이 없는 예시 상품은 원래 순서로 뒤에', () => {
    expect(newestFirst([p('old1'), p('new', { publishedAt: 200 }), p('old2'), p('newer', { publishedAt: 300 })]).map(x => x.id)).toEqual(['newer', 'new', 'old1', 'old2']);
  });
  it('목록에 순위가 없는 상품(상세에서만 받은 것)은 순위 있는 상품 뒤에', () => {
    expect(newestFirst([p('x'), p('a', { listRank: 0 })]).map(x => x.id)).toEqual(['a', 'x']);
  });
});

describe('전체 목록 10개씩', () => {
  it('처음 10개, 더 보기마다 10개씩, 이상한 값은 10개', () => {
    expect(HOME_PAGE_SIZE).toBe(10);
    expect(homeShown(null)).toBe(10);
    expect(homeShown('20')).toBe(20);
    expect(homeShown('25')).toBe(30);
    expect(homeShown('0')).toBe(10); expect(homeShown('abc')).toBe(10); expect(homeShown('-5')).toBe(10);
  });
});
