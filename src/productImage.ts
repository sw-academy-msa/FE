/**
 * 상품 사진 표시 규칙(ProductImage가 쓴다).
 * 주소가 없거나(아직 받는 중) 사진을 받는 동안은 흰 칸 가운데 로딩 표시, 실제 사진을 받으면 사진으로 바꾼다.
 * 사진을 못 받으면 흰 칸만 남긴다. 주소가 새로 생기거나 바뀌면 그 주소로 다시 시도한다.
 */
export type ImageState = { loaded: string; failed: string };
export const IMAGE_START: ImageState = { loaded: '', failed: '' };
export type ImageView = { kind: 'photo' | 'blank'; url: string; loading: boolean };

export const imageUrl = (src: string | null | undefined) => (typeof src === 'string' && src.startsWith('/images/') ? `.${src}` : src || '');

/**
 * 한 번 보여 준 사진의 주소를 파일 경로(서명값 등 ? 뒤를 뺀 주소)별로 기억한다.
 * 다시 들어가면 서버가 서명값만 다른 새 임시 주소를 주는데, 기억한 주소를 그대로 쓰면 브라우저가 이미 받은 사진을 바로 보여 준다.
 * shortcut: 앱이 켜져 있는 동안(메모리)만 기억한다. 새로고침 뒤에도 바로 보이게 하려면 서버가 고정 주소와 Cache-Control을 줘야 한다
 */
const shown = new Map<string, string>();
const fileOf = (url: string) => url.split('?')[0];
export const rememberShown = (url: string) => { shown.set(fileOf(url), url); };
/** 기억한 주소가 깨지면(만료 등) 잊어서 새 주소로 다시 받는다 */
export const forgetShown = (url: string) => { if (shown.get(fileOf(url)) === url) shown.delete(fileOf(url)); };

export function imageView(src: string | null | undefined, st: ImageState): ImageView {
  const fresh = imageUrl(src), kept = fresh ? shown.get(fileOf(fresh)) : undefined, url = kept || fresh;
  if (url && st.failed !== url) return { kind: 'photo', url, loading: !kept && st.loaded !== url };
  return { kind: 'blank', url: '', loading: !url }; // 주소 없음은 받는 중, 실패는 로딩 표시 없이 흰 칸
}
export const onImageLoad = (st: ImageState, url: string): ImageState => (st.loaded === url ? st : { ...st, loaded: url });
export const onImageError = (st: ImageState, url: string): ImageState => (st.failed === url ? st : { ...st, failed: url });
