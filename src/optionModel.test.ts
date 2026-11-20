import { describe, expect, it } from 'vitest';
import { optionPayload } from './api/sellerProducts';
import type { Draft } from './domain';
import { OPTION_DIM_MAX, blankDraft, comboKey, listingDimensions, listingOptions, optionCombos, optionModel, optionNameProblem } from './domain';

const draft = (o: Partial<Draft>): Draft => ({ ...blankDraft(), ...o });

describe('판매자가 이름을 정하는 옵션 단계', () => {
  it('옵션 없음이면 기본 한 줄이고 서버에는 옵션 기본으로 보낸다', () => {
    const d = draft({ optionDims: [], stock: { [comboKey([])]: 4 } });
    expect(listingOptions(d).map(o => [o.name, o.stock])).toEqual([['기본', 4]]);
    expect(listingDimensions(d)).toEqual([]);
    expect(optionPayload(d)).toEqual({ dimensions: [{ name: '옵션', values: ['기본'] }], variants: [{ selections: { 옵션: '기본' }, initialQuantity: 4 }] });
  });
  it('직접 정한 이름 세 단계를 조합하고 수량이 있는 조합만 보낸다', () => {
    const dims = [{ name: '맛', values: ['딸기', '초코'] }, { name: '용량', values: ['250ml'] }, { name: '포장', values: ['낱개', '박스'] }];
    const d = draft({ optionDims: dims, stock: { [comboKey(['딸기', '250ml', '박스'])]: 3, [comboKey(['초코', '250ml', '낱개'])]: 2 } });
    expect(optionCombos(dims)).toHaveLength(4);
    expect(listingOptions(d).map(o => o.name)).toEqual(['딸기 / 250ml / 낱개', '딸기 / 250ml / 박스', '초코 / 250ml / 낱개', '초코 / 250ml / 박스']);
    expect(listingDimensions(d)).toEqual([{ name: '맛', values: '딸기, 초코' }, { name: '용량', values: '250ml' }, { name: '포장', values: '낱개, 박스' }]);
    expect(optionPayload(d)).toEqual({
      dimensions: [{ name: '맛', values: ['딸기', '초코'] }, { name: '용량', values: ['250ml'] }, { name: '포장', values: ['박스', '낱개'] }],
      variants: [{ selections: { 맛: '딸기', 용량: '250ml', 포장: '박스' }, initialQuantity: 3 }, { selections: { 맛: '초코', 용량: '250ml', 포장: '낱개' }, initialQuantity: 2 }],
    });
    expect(OPTION_DIM_MAX).toBe(3);
  });
  it('값을 넣지 않은 단계가 있으면 조합이 없다', () => {
    expect(optionCombos([{ name: '맛', values: ['딸기'] }, { name: '용량', values: [] }])).toEqual([]);
  });
  it('예전 색상 x 사이즈 초안을 새 구조로 읽는다', () => {
    const old = draft({ axes: { color: true, size: true }, sizeName: '묶음 수량', colors: ['블랙'], sizes: ['3개입', '5개입'], stock: { '블랙|3개입': 5, '블랙|5개입': 0 } });
    expect(optionModel(old)).toEqual({ dims: [{ name: '색상', values: ['블랙'] }, { name: '묶음 수량', values: ['3개입', '5개입'] }], stock: { [comboKey(['블랙', '3개입'])]: 5, [comboKey(['블랙', '5개입'])]: 0 } });
    expect(optionPayload(old).variants).toEqual([{ selections: { 색상: '블랙', '묶음 수량': '3개입' }, initialQuantity: 5 }]);
    expect(optionModel(draft({ axes: { color: true, size: false }, colors: ['크림'], stock: { '크림|': 2 } }))).toEqual({ dims: [{ name: '색상', values: ['크림'] }], stock: { [comboKey(['크림'])]: 2 } });
    expect(optionModel(draft({ axes: { color: false, size: true }, sizes: ['S'], stock: { '|S': 1 } }))).toEqual({ dims: [{ name: '사이즈', values: ['S'] }], stock: { [comboKey(['S'])]: 1 } });
    expect(optionModel(draft({ axes: { color: false, size: false }, stock: { '|': 7 } }))).toEqual({ dims: [], stock: { [comboKey([])]: 7 } });
  });
  it('이름과 값은 비거나 같은 것이 있거나 200자를 넘으면 막는다(서버 기준)', () => {
    expect(optionNameProblem('', [], '옵션 이름')).toBe('옵션 이름을 입력해 주세요.');
    expect(optionNameProblem('맛', ['맛'], '옵션 이름')).toBe('이미 있는 옵션 이름이에요.');
    expect(optionNameProblem('a'.repeat(201), [], '옵션 값')).toBe('옵션 값은 200자까지 입력할 수 있어요.');
    expect(optionNameProblem('a'.repeat(200), ['b'], '옵션 값')).toBe('');
  });
});
