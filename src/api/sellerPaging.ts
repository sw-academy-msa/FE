/** 페이지를 모두 읽는다. 부분 목록을 돌려주지 않고, 서버 페이지 정보가 이상하거나 50페이지(size 100이면 5,000건)를 넘으면 조회 실패로 표시한다. */
function readAll<T>(messages: { invalid: string; tooMany: string }) {
  return async (fetchPage: (page: number | undefined) => Promise<{ page: number; totalPages: number; rows: T[] }>, start?: number): Promise<T[]> => {
    const out: T[] = [];
    const first = start ?? 0;
    for (let offset = 0; offset < 50; offset++) {
      const page = first + offset;
      const r = await fetchPage(offset === 0 ? start : page);
      if (r.page !== page || !Number.isInteger(r.totalPages) || r.totalPages < 0) throw new Error(messages.invalid);
      out.push(...r.rows);
      if (page + 1 >= r.totalPages) return out;
    }
    throw new Error(messages.tooMany);
  };
}

/** 판매자 집계는 부분 목록을 반환하지 않는다. 서버 오류나 과도한 페이지는 조회 실패로 표시한다. */
export function allSellerPages<T>(fetchPage: (page: number | undefined) => Promise<{ page: number; totalPages: number; rows: T[] }>, start?: number): Promise<T[]> {
  return readAll<T>({ invalid: '판매자 목록의 페이지 정보가 올바르지 않아요.', tooMany: '판매자 목록의 조회 범위를 초과했어요.' })(fetchPage, start);
}

/** 구매자·운영자 목록용 전체 페이지 읽기(page는 0부터). 100건 넘는 목록이 첫 페이지에서 잘리지 않게 한다 */
export function allPages<T>(fetchPage: (page: number) => Promise<{ page: number; totalPages: number; rows: T[] }>): Promise<T[]> {
  return readAll<T>({ invalid: '목록의 페이지 정보가 올바르지 않아요.', tooMany: '목록이 너무 많아 한 번에 불러올 수 없어요.' })(page => fetchPage(page ?? 0));
}

/** 페이지 정보 없이 배열만 주는 목록(운영자 수정 심사 대기열): 꽉 찬 페이지면 다음 페이지를 읽는다. 상한은 50페이지 */
export async function allArrayPages<T>(fetchPage: (page: number, size: number) => Promise<T[]>, size = 100): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < 50; page++) {
    const rows = await fetchPage(page, size);
    out.push(...rows);
    if (rows.length < size) return out;
  }
  throw new Error('목록이 너무 많아 한 번에 불러올 수 없어요.');
}

/** 응답의 page·totalPages가 빠졌으면(이전 응답 형식) 이 페이지를 마지막으로 본다 */
export const pageInfo = <T>(r: { page?: number; totalPages?: number }, page: number, rows: T[]) => ({ page: r.page ?? page, totalPages: r.totalPages ?? page + 1, rows });
