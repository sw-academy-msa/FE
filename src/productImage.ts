/**
 * 상품 사진 표시 규칙(ProductImage가 쓴다).
 * 주소가 없거나(아직 받는 중) 사진을 받는 동안은 흰 칸 가운데 로딩 표시, 실제 사진을 받으면 사진으로 바꾼다.
 * 사진을 못 받으면 흰 칸만 남긴다. 주소가 새로 생기거나 바뀌면 그 주소로 다시 시도한다.
 */
export type ImageState = { loaded: string; failed: string };
export const IMAGE_START: ImageState = { loaded: '', failed: '' };
export type ImageView = { kind: 'photo' | 'blank'; url: string; loading: boolean };

export const imageUrl = (src: string | null | undefined) => (typeof src === 'string' && src.startsWith('/images/') ? `.${src}` : src || '');

export function imageView(src: string | null | undefined, st: ImageState): ImageView {
  const url = imageUrl(src);
  if (url && st.failed !== url) return { kind: 'photo', url, loading: st.loaded !== url };
  return { kind: 'blank', url: '', loading: !url }; // 주소 없음은 받는 중, 실패는 로딩 표시 없이 흰 칸
}
export const onImageLoad = (st: ImageState, url: string): ImageState => (st.loaded === url ? st : { ...st, loaded: url });
export const onImageError = (st: ImageState, url: string): ImageState => (st.failed === url ? st : { ...st, failed: url });
