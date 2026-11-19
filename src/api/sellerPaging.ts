/** 판매자 집계는 부분 목록을 반환하지 않는다. 서버 오류나 과도한 페이지는 조회 실패로 표시한다. */
export async function allSellerPages<T>(fetchPage: (page: number | undefined) => Promise<{ page: number; totalPages: number; rows: T[] }>, start?: number): Promise<T[]> {
  const out: T[] = [];
  const first = start ?? 0;
  for (let offset = 0; offset < 50; offset++) {
    const page = first + offset;
    const r = await fetchPage(offset === 0 ? start : page);
    if (r.page !== page || !Number.isInteger(r.totalPages) || r.totalPages < 0) {
      throw new Error('판매자 목록의 페이지 정보가 올바르지 않아요.');
    }
    out.push(...r.rows);
    if (page + 1 >= r.totalPages) return out;
  }
  throw new Error('판매자 목록의 조회 범위를 초과했어요.');
}
