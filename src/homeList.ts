/**
 * 홈 상품 목록: 새로 올라온 상품이 먼저, '더 보기'로 10개씩.
 * 최신 기준은 공개 승인 시각(ProductQueryService 목록 API 기본 정렬 NEWEST = publishedAt 내림차순, 같으면 id).
 * 목록 카드에는 publishedAt이 없어서 실제 모드는 서버가 준 순서를 listRank로 보관해 그 순서를 쓴다.
 * mock 모드는 공개될 때 적어 둔 publishedAt(예시 상품은 없음 → 원래 순서로 뒤에)을 쓴다.
 */
export const HOME_PAGE_SIZE = 10;
type Ranked = { listRank?: number; publishedAt?: number };
const key = (p: Ranked) => p.listRank ?? (p.publishedAt !== undefined ? -p.publishedAt : Number.MAX_SAFE_INTEGER);
/** 새로 올라온 순(같으면 원래 순서 유지) */
export const newestFirst = <T extends Ranked>(list: T[]): T[] => list.map((p, i) => [p, i] as const).sort((a, b) => key(a[0]) - key(b[0]) || a[1] - b[1]).map(([p]) => p);
/** 서버 목록 응답 순서를 순위로 적는다 */
export const rankByServerOrder = <T extends object>(items: T[]): (T & { listRank: number })[] => items.map((p, i) => ({ ...p, listRank: i }));
/** 주소의 보던 개수(n) → 보여 줄 개수(10의 배수, 최소 10). 상세에 갔다 뒤로 와도 주소에 남아 그대로 */
export function homeShown(n: string | null): number {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.ceil(v / HOME_PAGE_SIZE) * HOME_PAGE_SIZE : HOME_PAGE_SIZE;
}
