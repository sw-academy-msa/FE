/**
 * 카테고리에 맞는 추천 옵션 이름. 옵션은 색상 × 한 가지 더(최대 2단계)이고, 판매자는 추천 이름 중 하나를 고르거나 직접 이름을 입력할 수 있다.
 * 카테고리를 나중에 바꿔도 이미 입력한 옵션은 그대로 두고 추천 이름 목록만 바뀐다.
 */
import { groupOf } from './categoryTree';
import { majorOf } from './api/sellerProducts';
import type { RegistrationMetadataDto } from './api/types';

export const COLOR_AXIS = '색상';
export const DEFAULT_SECOND_AXIS = '사이즈';
export interface OptionPreset {
  /** 색상 말고 고를 수 있는 추천 옵션 이름 */ second: string[];
  /** 옵션 이름별 빠른 선택 값 */ quick: Record<string, string[]>;
}
const mm = Array.from({ length: 11 }, (_, i) => String(220 + i * 10));

export function optionPresetFor(category: string, meta?: Pick<RegistrationMetadataDto, 'categoryCriteria'>): OptionPreset {
  const code = category ? meta?.categoryCriteria.find(c => c.name === category)?.code : undefined, major = code ? majorOf(code) : undefined;
  if (major === 'CLOTHING') return { second: ['사이즈'], quick: { 사이즈: ['S', 'M', 'L', 'XL'] } };
  if (major === 'FASHION_ACCESSORIES') return code && groupOf(code) === '신발' ? { second: ['사이즈(mm)'], quick: { '사이즈(mm)': mm } } : { second: ['사이즈'], quick: {} };
  if (major === 'STATIONERY') return { second: ['규격', '묶음 수량'], quick: {} };
  if (major === 'HOUSEHOLD') return { second: ['크기', '용량'], quick: {} };
  return { second: [DEFAULT_SECOND_AXIS], quick: {} }; // 카테고리를 아직 고르지 않았거나 모를 때는 기존 그대로
}
/**
 * 카테고리를 고르면(아직 옵션 값을 넣기 전) 처음 켜 둘 옵션. 의류·신발은 색상 × 사이즈, 그 밖은 옵션 없이 시작한다
 * (문구·생활잡화는 색상·사이즈가 없는 상품이 많다. 필요하면 추천 칩으로 켠다). 카테고리를 모르면 undefined(지금 상태 유지)
 */
export function defaultAxesFor(category: string, meta?: Pick<RegistrationMetadataDto, 'categoryCriteria'>): { color: boolean; size: boolean; sizeName?: string } | undefined {
  const code = category ? meta?.categoryCriteria.find(c => c.name === category)?.code : undefined, major = code ? majorOf(code) : undefined;
  if (!major) return undefined;
  if (major === 'CLOTHING') return { color: true, size: true, sizeName: '사이즈' };
  if (major === 'FASHION_ACCESSORIES' && code && groupOf(code) === '신발') return { color: true, size: true, sizeName: '사이즈(mm)' };
  return { color: false, size: false };
}
