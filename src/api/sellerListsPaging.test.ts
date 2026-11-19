import { afterEach, describe, expect, it } from 'vitest';
import { api } from './client';
import { listSellerOrderInquiries, listSellerOrderInquiryInbox } from './sellerOrders';
import { listSellerProductInquiries, listSellerProducts } from './sellerProducts';

afterEach(() => api.configure({ fetch: undefined }));

describe('판매자 상품과 문의 집계용 목록', () => {
  it.each(['products', 'productInquiries', 'orderInquiries', 'orderInbox'] as const)('%s 101건을 끝까지 받는다', async kind => {
    const pages: number[] = [];
    api.configure({ mock: false, fetch: (async (url: RequestInfo | URL) => {
      const query = new URL(String(url), 'http://localhost').searchParams;
      const page = Number(query.get('page') ?? 0); pages.push(page);
      expect(query.get('size')).toBe('100');
      const rows = Array.from({ length: page === 0 ? 100 : 1 }, (_, i) => ({
        id: `i${page * 100 + i}`, productId: 'p1', orderId: 'o1', buyerId: 'b1', name: '상품', status: 'APPROVED', version: 1,
        totalQuantity: 200, soldQuantity: 200, question: '질문', answer: null, messages: [], category: '배송',
        awaitingSeller: true, lastMessage: '질문', createdAt: '2030-01-01T00:00:00Z',
      }));
      const key = kind === 'products' || kind === 'productInquiries' ? 'items' : 'content';
      return new Response(JSON.stringify({ success: true, code: 'COMMON_SUCCESS', data: { [key]: rows, page, size: 100, totalPages: 2, totalElements: 101 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch });
    const list = await (kind === 'products' ? listSellerProducts('s1') : kind === 'productInquiries' ? listSellerProductInquiries('s1') : kind === 'orderInquiries' ? listSellerOrderInquiries('o1', 's1') : listSellerOrderInquiryInbox('s1'));
    expect(list).toHaveLength(101);
    expect(list.every(x => x.sellerId === 's1')).toBe(true);
    expect(pages).toEqual([0, 1]);
  });
});
