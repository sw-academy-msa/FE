import { getAdminProductImageUrl, listAdminProductImages } from './api/admin';

const cache = new Map<string, { expires: number; url: Promise<string> }>();
let lastInvalidated = -Infinity;

/** 여러 이미지 실패 이벤트를 한 번의 갱신으로 합친다. */
export function invalidateAdminReviewThumbnails(now = Date.now()) {
  if (now - lastInvalidated < 15_000) return;
  lastInvalidated = now;
  cache.clear();
}

/** 운영자 계정별 캐시. 상세와 같은 position 순서의 첫 사진만 발급한다. */
export function adminReviewThumbnail(accountId: string, productId: string, now = Date.now()): Promise<string> {
  const key = JSON.stringify([accountId, productId]);
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.url;
  const url = listAdminProductImages(productId).then(metas => {
    const first = [...metas].sort((a, b) => a.position - b.position)[0];
    return first ? getAdminProductImageUrl(productId, first.id) : '';
  }).catch(() => '');
  cache.set(key, { expires: now + 5 * 60_000, url });
  return url;
}
