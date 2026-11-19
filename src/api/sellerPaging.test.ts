import { describe, expect, it, vi } from 'vitest';
import { allSellerPages } from './sellerPaging';

describe('판매자 전체 페이지 조회', () => {
  it('짧거나 빈 중간 페이지에서도 totalPages까지 받는다', async () => {
    const fetchPage = vi.fn(async (page = 0) => ({ page, totalPages: 3, rows: page === 1 ? [] : [page] }));
    expect(await allSellerPages(fetchPage)).toEqual([0, 2]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });
  it('빈 목록은 한 번만 조회한다', async () => {
    const fetchPage = vi.fn(async () => ({ page: 0, totalPages: 0, rows: [] }));
    expect(await allSellerPages(fetchPage)).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
  it('50페이지를 넘어도 계속되는 응답은 부분 결과 대신 실패한다', async () => {
    const fetchPage = vi.fn(async (page = 0) => ({ page, totalPages: 51, rows: [page] }));
    await expect(allSellerPages(fetchPage)).rejects.toThrow('조회 범위');
    expect(fetchPage).toHaveBeenCalledTimes(50);
  });
  it('반복된 페이지와 잘못된 페이지 정보는 실패한다', async () => {
    await expect(allSellerPages(async () => ({ page: 0, totalPages: 2, rows: [1] }))).rejects.toThrow('페이지 정보');
    await expect(allSellerPages(async () => ({ page: 0, totalPages: NaN, rows: [] }))).rejects.toThrow('페이지 정보');
  });
  it('중간 요청 실패와 취소는 부분 결과 대신 전파한다', async () => {
    const error = new DOMException('Aborted', 'AbortError');
    await expect(allSellerPages(async (page = 0) => {
      if (page === 1) throw error;
      return { page, totalPages: 2, rows: [1] };
    })).rejects.toBe(error);
  });
});
