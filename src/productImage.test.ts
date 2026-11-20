import { describe, expect, it } from 'vitest';
import { FALLBACK_BANNER, IMAGE_START, imageView, onImageError, onImageLoad } from './productImage';

describe('상품 사진 대체 배너', () => {
  it('사진 주소가 없으면 배너를 보여 준다', () => {
    expect(imageView('', IMAGE_START)).toEqual({ kind: 'banner', url: FALLBACK_BANNER, loading: false });
    expect(imageView(undefined, IMAGE_START).kind).toBe('banner');
  });
  it('사진을 받는 동안은 배너를 깔고, 다 받으면 실제 사진만 보여 준다', () => {
    expect(imageView('https://s3/a.jpg', IMAGE_START)).toEqual({ kind: 'photo', url: 'https://s3/a.jpg', loading: true });
    const st = onImageLoad(IMAGE_START, 'https://s3/a.jpg');
    expect(imageView('https://s3/a.jpg', st)).toEqual({ kind: 'photo', url: 'https://s3/a.jpg', loading: false });
  });
  it('사진을 못 받으면 배너로 바꾼다', () => {
    const st = onImageError(IMAGE_START, 'https://s3/a.jpg');
    expect(imageView('https://s3/a.jpg', st)).toEqual({ kind: 'banner', url: FALLBACK_BANNER, loading: false });
  });
  it('주소가 나중에 생기거나 바뀌면 다시 시도해서 실제 사진으로 바꾼다', () => {
    let st = onImageError(IMAGE_START, 'https://s3/a.jpg?X-Amz-Signature=1');
    expect(imageView('https://s3/a.jpg?X-Amz-Signature=2', st)).toMatchObject({ kind: 'photo', loading: true });
    st = onImageLoad(st, 'https://s3/a.jpg?X-Amz-Signature=2');
    expect(imageView('https://s3/a.jpg?X-Amz-Signature=2', st)).toMatchObject({ kind: 'photo', loading: false });
    expect(imageView('', IMAGE_START).kind).toBe('banner');
    expect(imageView('https://s3/b.jpg', IMAGE_START).kind).toBe('photo');
  });
  it('배너까지 못 받으면 빈 자리로 끝내고 다시 배너를 부르지 않는다', () => {
    let st = onImageError(IMAGE_START, 'https://s3/a.jpg');
    st = onImageError(st, FALLBACK_BANNER);
    expect(imageView('https://s3/a.jpg', st)).toEqual({ kind: 'empty', url: '', loading: false });
    expect(imageView('', st).kind).toBe('empty');
    // 빈 자리에서는 더 이상 오류가 나도 상태가 그대로다(무한 반복 없음)
    expect(onImageError(st, FALLBACK_BANNER)).toBe(st);
  });
  it('/images/ 예시 사진은 배포 경로 기준 상대 주소로 고친다', () => {
    expect(imageView('/images/product.jpg', IMAGE_START).url).toBe('./images/product.jpg');
  });
});
