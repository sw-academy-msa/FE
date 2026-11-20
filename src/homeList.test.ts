import { describe, expect, it } from 'vitest';
import { HOME_PAGE_SIZE, homePage, newestFirst, pageDots, pageCount, rankByServerOrder } from './homeList';

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

describe('10개씩 스와이프 페이지', () => {
  it('한 페이지 10개, 페이지 수', () => {
    expect(HOME_PAGE_SIZE).toBe(10);
    expect([0, 1, 10, 11, 25].map(pageCount)).toEqual([1, 1, 1, 2, 3]);
  });
  it('주소의 p(1부터) → 페이지 번호(0부터), 범위 밖이나 이상한 값은 첫 페이지 또는 마지막 페이지', () => {
    expect(homePage(null, 3)).toBe(0); expect(homePage('2', 3)).toBe(1); expect(homePage('9', 3)).toBe(2);
    expect(homePage('0', 3)).toBe(0); expect(homePage('abc', 3)).toBe(0); expect(homePage('1.5', 3)).toBe(0);
  });
  it('점은 최대 7개만, 범위 밖에 페이지가 더 있으면 양 끝 점을 작게', () => {
    expect(pageDots(0, 3)).toEqual([{ page: 0, small: false }, { page: 1, small: false }, { page: 2, small: false }]);
    expect(pageDots(0, 10).map(d => d.page)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(pageDots(0, 10).map(d => d.small)).toEqual([false, false, false, false, false, false, true]);
    expect(pageDots(5, 10).map(d => d.page)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(pageDots(5, 10).map(d => d.small)).toEqual([true, false, false, false, false, false, true]);
    expect(pageDots(9, 10).map(d => d.page)).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(pageDots(9, 10)[0].small).toBe(true);
  });
});
