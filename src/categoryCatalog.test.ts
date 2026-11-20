import { describe, expect, it } from 'vitest';
import { FALLBACK_CATALOG, catalogMajorOf, catalogTabs } from './categoryCatalog';

const catalog = { majors: [
  { code: 'CLOTHING', name: '의류', categories: [{ code: 'CLOTHING', name: '의류' }, { code: 'CLOTHING_JUMPER_03', name: '숏패딩' }] },
  { code: 'FASHION_ACCESSORIES', name: '패션잡화', categories: [{ code: 'FASHION_ACCESSORIES', name: '패션잡화' }] },
  { code: 'STATIONERY', name: '문구', categories: [{ code: 'STATIONERY', name: '문구' }, { code: 'STATIONERY_WRITING_01', name: '볼펜' }] },
  { code: 'HOUSEHOLD', name: '일반 생활잡화', categories: [{ code: 'HOUSEHOLD', name: '일반 생활잡화' }] },
] };

describe('홈 대분류 카테고리 탭', () => {
  it('탭은 전체 + 서버 대분류 이름을 서버 순서 그대로(상품이 없어도)', () => {
    expect(catalogTabs(catalog)).toEqual(['전체', '의류', '패션잡화', '문구', '일반 생활잡화']);
  });
  it('상품 카드의 세부 카테고리 이름을 대분류로 바꾼다(대분류 이름 자체도), 모르는 이름은 undefined', () => {
    const of = catalogMajorOf(catalog);
    expect(of('숏패딩')).toBe('의류'); expect(of('의류')).toBe('의류'); expect(of('볼펜')).toBe('문구');
    expect(of('없는 이름')).toBeUndefined(); expect(of('')).toBeUndefined();
  });
  it('카탈로그를 못 받으면 고정 대분류 이름으로 탭을 만들고, 매핑은 상품 카테고리가 대분류 이름과 같을 때만', () => {
    expect(catalogTabs(FALLBACK_CATALOG)).toEqual(['전체', '의류', '패션잡화', '문구', '일반 생활잡화']);
    const of = catalogMajorOf(FALLBACK_CATALOG);
    expect(of('의류')).toBe('의류'); expect(of('숏패딩')).toBeUndefined();
  });
});
