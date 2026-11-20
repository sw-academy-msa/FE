/**
 * 홈 상품 목록: 새로 올라온 상품이 먼저, 10개씩 좌우로 넘기는 페이지(아래 점 표시).
 * 최신 기준은 공개 승인 시각(ProductQueryService 목록 API 기본 정렬 NEWEST = publishedAt 내림차순, 같으면 id).
 * 목록 카드에는 publishedAt이 없어서 실제 모드는 서버가 준 순서를 listRank로 보관해 그 순서를 쓴다.
 * mock 모드는 공개될 때 적어 둔 publishedAt(예시 상품은 없음 → 원래 순서로 뒤에)을 쓴다.
 */
export const HOME_PAGE_SIZE = 10;
/** 점은 최대 이만큼만 보인다(페이지가 많아도 줄을 넘지 않게) */
export const MAX_DOTS = 7;
type Ranked = { listRank?: number; publishedAt?: number };
const key = (p: Ranked) => p.listRank ?? (p.publishedAt !== undefined ? -p.publishedAt : Number.MAX_SAFE_INTEGER);
/** 새로 올라온 순(같으면 원래 순서 유지) */
export const newestFirst = <T extends Ranked>(list: T[]): T[] => list.map((p, i) => [p, i] as const).sort((a, b) => key(a[0]) - key(b[0]) || a[1] - b[1]).map(([p]) => p);
/** 서버 목록 응답 순서를 순위로 적는다 */
export const rankByServerOrder = <T extends object>(items: T[]): (T & { listRank: number })[] => items.map((p, i) => ({ ...p, listRank: i }));
/** 상품 수 → 페이지 수(상품이 없어도 1) */
export const pageCount = (n: number) => Math.max(1, Math.ceil(n / HOME_PAGE_SIZE));
/** 주소의 보던 페이지(p, 1부터) → 0부터 센 페이지. 상세에 갔다 뒤로 와도 주소에 남아 그대로 */
export function homePage(p: string | null, pages: number): number {
  const v = Number(p);
  return Number.isInteger(v) && v >= 1 ? Math.min(v, pages) - 1 : 0;
}
/** 보일 점: 현재 페이지를 가운데 두고 최대 MAX_DOTS개. 보이는 범위 밖에 페이지가 더 있으면 그쪽 끝 점을 작게 */
export function pageDots(current: number, pages: number): { page: number; small: boolean }[] {
  const n = Math.min(pages, MAX_DOTS), start = Math.max(0, Math.min(current - Math.floor(n / 2), pages - n));
  return Array.from({ length: n }, (_, i) => {
    const page = start + i;
    return { page, small: (i === 0 && start > 0) || (i === n - 1 && start + n < pages) };
  });
}
