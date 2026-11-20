/**
 * 홈 대분류 카테고리 탭. 공개 카테고리 카탈로그(GET /api/v1/category-catalog, 인증 불필요)의 대분류를 서버 순서와 이름 그대로 탭으로 쓰고,
 * 상품 카드의 category(세부 이름)를 카탈로그의 categories[].name으로 대분류에 매핑한다. 대분류 자신도 categories 첫 항목이라 대분류 이름으로 등록된 상품도 매핑된다.
 * 카탈로그를 못 받으면(ProductCommand 장애 등) categoryTree.ts MAJOR_NAMES 고정값으로 대분류 탭만 보여 준다(사용자 결정).
 * 이때는 세부 이름을 알 수 없어 상품 category가 대분류 이름과 같을 때만 그 탭에 나온다. 매핑되지 않는 상품은 '전체'에만 나온다.
 */
import { MAJORS, MAJOR_NAMES } from './categoryTree';

export interface CategoryCatalog { majors: { code: string; name: string; categories: { code: string; name: string }[] }[] }
export const ALL_TAB = '전체';
/** 카탈로그를 못 받았을 때의 대체 목록(대분류 이름만) */
export const FALLBACK_CATALOG: CategoryCatalog = { majors: MAJORS.map(code => ({ code, name: MAJOR_NAMES[code], categories: [{ code, name: MAJOR_NAMES[code] }] })) };
export const catalogTabs = (c: CategoryCatalog) => [ALL_TAB, ...c.majors.map(m => m.name)];
/** 상품 category 이름 → 대분류 이름(모르면 undefined) */
export function catalogMajorOf(c: CategoryCatalog): (category: string) => string | undefined {
  const map = new Map<string, string>();
  for (const m of c.majors) for (const x of m.categories) if (!map.has(x.name)) map.set(x.name, m.name);
  return category => map.get(category);
}
