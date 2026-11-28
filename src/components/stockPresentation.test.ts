import { describe, expect, it } from 'vitest';
import type { Product } from '../domain';
import { temporarySoldOut } from './stockPresentation';
const product = (live?: Product['live'], overrides: Partial<Product> = {}) => ({ published: true, startsAt: 0, endsAt: 1000, live, ...overrides }) as Product;
describe('일시 품절 표시', () => {
  it.each([
    [{ initial: 10, confirmed: 9, available: 0 }, true],
    [{ initial: 10, confirmed: 10, available: 0 }, false],
    [{ initial: 10, confirmed: 11, available: 0 }, false],
    [{ initial: 10, confirmed: 9, available: 1 }, false],
    [{ initial: 10, confirmed: 9, available: 0, approximate: true }, false],
    [{ initial: 10, available: 0 }, false],
    [undefined, false],
  ] as [Product['live'], boolean][])('재고 %j이면 %s', (live, expected) => {
    expect(temporarySoldOut(product(live), 500)).toBe(expected);
  });
  it('판매 시간 밖과 비공개는 기존 표시 유지', () => {
    const live = { initial: 10, confirmed: 9, available: 0 };
    expect(temporarySoldOut(product(live), -1)).toBe(false);
    expect(temporarySoldOut(product(live), 1000)).toBe(false);
    expect(temporarySoldOut(product(live, { published: false }), 500)).toBe(false);
  });
});
