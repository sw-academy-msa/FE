/**
 * 주문 화면의 상품 사진. 주문 응답(구매자, 판매자)에는 상품 사진이 없고, 실제 모드 store는 상품을 새로고침 사이에 저장하지 않는다.
 * 그래서 주문 문의, 판매자 주문 목록과 상세처럼 주문만 받아 여는 화면은 사진이 비어 대체 배너만 보였다.
 * 화면에 나온 상품 중 store에 사진이 없는 상품만 공개 상품 상세(GET /v1/products/{id})로 받아 채운다.
 * 같은 상품은 한 번만 요청한다(받는 중이거나 받은 상품은 다시 요청하지 않고, 실패하면 다음에 다시 시도). 목록은 상품 id를 모아 서로 다른 상품만 요청한다.
 */
import { useEffect } from 'react';
import { getProduct, mergeProducts } from './api';
import { USE_MOCK } from './config';
import type { Product } from './domain';
import { getState, mutate, useStore } from './store';

const requested = new Set<string>();
/** 주문 화면에 보일 상품 사진: 주문 사진이 비면 store 상품 사진. 없는 상품은 한 번만 받아 채운다 */
export function useProductPhotos(productIds: (string | undefined)[]): (productId: string | undefined, orderImage?: string) => string {
  const s = useStore();
  const key = [...new Set(productIds.filter((x): x is string => !!x))].sort().join(',');
  useEffect(() => {
    if (USE_MOCK || !key) return;
    const st = getState();
    const missing = key.split(',').filter(id => !requested.has(id) && !st.products.find(p => p.id === id)?.images.length);
    if (!missing.length) return;
    missing.forEach(id => requested.add(id));
    void Promise.all(missing.map(id => getProduct(id).catch(() => { requested.delete(id); return null; }))).then(list => {
      const ok = list.filter((p): p is Product => !!p);
      if (ok.length) mutate(state => mergeProducts(state, ok));
    });
  }, [key]);
  return (productId, orderImage) => orderImage || s.products.find(p => p.id === productId)?.images[0] || '';
}
