import { describe, expect, it } from 'vitest';
import { IMAGE_START, forgetShown, imageView, onImageError, onImageLoad, rememberShown } from './productImage';

describe('상품 사진 표시', () => {
  it('사진 주소가 없으면 받는 중으로 보고 흰 칸에 로딩 표시', () => {
    expect(imageView('', IMAGE_START)).toEqual({ kind: 'blank', url: '', loading: true });
    expect(imageView(undefined, IMAGE_START).kind).toBe('blank');
  });
  it('사진을 받는 동안은 로딩, 다 받으면 실제 사진만 보여 준다', () => {
    expect(imageView('https://s3/a.jpg', IMAGE_START)).toEqual({ kind: 'photo', url: 'https://s3/a.jpg', loading: true });
    const st = onImageLoad(IMAGE_START, 'https://s3/a.jpg');
    expect(imageView('https://s3/a.jpg', st)).toEqual({ kind: 'photo', url: 'https://s3/a.jpg', loading: false });
  });
  it('사진을 못 받으면 로딩 표시 없이 흰 칸만 남기고, 같은 오류는 상태를 바꾸지 않는다', () => {
    const st = onImageError(IMAGE_START, 'https://s3/a.jpg');
    expect(imageView('https://s3/a.jpg', st)).toEqual({ kind: 'blank', url: '', loading: false });
    expect(onImageError(st, 'https://s3/a.jpg')).toBe(st);
  });
  it('주소가 나중에 생기거나 바뀌면 다시 시도해서 실제 사진으로 바꾼다', () => {
    let st = onImageError(IMAGE_START, 'https://s3/a.jpg?X-Amz-Signature=1');
    expect(imageView('https://s3/a.jpg?X-Amz-Signature=2', st)).toMatchObject({ kind: 'photo', loading: true });
    st = onImageLoad(st, 'https://s3/a.jpg?X-Amz-Signature=2');
    expect(imageView('https://s3/a.jpg?X-Amz-Signature=2', st)).toMatchObject({ kind: 'photo', loading: false });
    expect(imageView('https://s3/b.jpg', IMAGE_START).kind).toBe('photo');
  });
  it('한 번 보여 준 사진은 서명값만 다른 새 주소가 와도 기억한 주소로 바로 보여 주고, 깨지면 새 주소로 다시 받는다', () => {
    rememberShown('https://s3/k.jpg?X-Amz-Signature=1');
    expect(imageView('https://s3/k.jpg?X-Amz-Signature=2', IMAGE_START)).toEqual({ kind: 'photo', url: 'https://s3/k.jpg?X-Amz-Signature=1', loading: false });
    expect(imageView('https://s3/other.jpg?X-Amz-Signature=2', IMAGE_START).loading).toBe(true);
    const st = onImageError(IMAGE_START, 'https://s3/k.jpg?X-Amz-Signature=1'); forgetShown('https://s3/k.jpg?X-Amz-Signature=1');
    expect(imageView('https://s3/k.jpg?X-Amz-Signature=2', st)).toEqual({ kind: 'photo', url: 'https://s3/k.jpg?X-Amz-Signature=2', loading: true });
  });
  it('/images/ 예시 사진은 배포 경로 기준 상대 주소로 고친다', () => {
    expect(imageView('/images/product.jpg', IMAGE_START).url).toBe('./images/product.jpg');
  });
});
