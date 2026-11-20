/**
 * 상품 사진 대체 배너 규칙(ProductImage가 쓴다).
 * 주소가 없거나, 받는 중이거나, 못 받으면 STOCKDROP 배너를 보여 주고, 실제 사진을 받으면 사진으로 바꾼다.
 * 주소가 새로 생기거나 바뀌면 그 주소로 다시 시도한다. 배너까지 못 받으면 빈 자리로 끝낸다(오류 반복 없음).
 */
export const FALLBACK_BANNER = './icon-512.png';
/** 배너 그림의 바탕색(사진 칸 비율이 달라도 배너 둘레가 이어져 보이게) */
export const FALLBACK_BG = '#0E0E0F';
export type ImageState = { loaded: string; failed: string; bannerFailed: boolean };
export const IMAGE_START: ImageState = { loaded: '', failed: '', bannerFailed: false };
export type ImageView = { kind: 'photo' | 'banner' | 'empty'; url: string; loading: boolean };

export const imageUrl = (src: string | null | undefined) => (typeof src === 'string' && src.startsWith('/images/') ? `.${src}` : src || '');

export function imageView(src: string | null | undefined, st: ImageState): ImageView {
  const url = imageUrl(src);
  if (url && st.failed !== url) return { kind: 'photo', url, loading: st.loaded !== url };
  if (st.bannerFailed) return { kind: 'empty', url: '', loading: false };
  return { kind: 'banner', url: FALLBACK_BANNER, loading: false };
}
export const onImageLoad = (st: ImageState, url: string): ImageState => (url === FALLBACK_BANNER || st.loaded === url ? st : { ...st, loaded: url });
export function onImageError(st: ImageState, url: string): ImageState {
  if (url === FALLBACK_BANNER) return st.bannerFailed ? st : { ...st, bannerFailed: true };
  return st.failed === url ? st : { ...st, failed: url };
}
