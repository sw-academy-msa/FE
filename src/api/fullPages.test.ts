import { afterEach, describe, expect, it } from 'vitest';
import { api } from './client';
import { listAdminApplications, listAdminProductReviews, listAdminRevisions } from './admin';
import { listOrders } from './orders';
import { listInquiryInbox } from './inquiries';
import { allArrayPages, allPages } from './sellerPaging';

type Call = { url: string };
function fake(handler: (url: URL) => unknown) {
  const calls: Call[] = [];
  api.configure({ mock: false, fetch: (async (u: RequestInfo | URL) => {
    calls.push({ url: String(u) });
    return new Response(JSON.stringify({ success: true, code: 'COMMON_SUCCESS', message: '', data: handler(new URL(String(u), 'http://localhost')) }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch });
  return calls;
}
afterEach(() => api.configure({ fetch: undefined }));
const pageOf = (u: URL) => Number(u.searchParams.get('page') ?? 0);

describe('목록 전체 페이지 읽기', () => {
  it('운영자 수정 심사 대기열은 서버 기본 20건에서 멈추지 않고 꽉 찬 페이지면 다음 페이지를 읽는다', async () => {
    const calls = fake(u => { const p = pageOf(u), size = Number(u.searchParams.get('size')); const n = p === 0 ? size : 3; return Array.from({ length: n }, (_, i) => ({ id: `r${p}-${i}` })); });
    const list = await listAdminRevisions();
    expect(list).toHaveLength(103);
    expect(calls.map(c => new URL(c.url, 'http://localhost').searchParams.get('page'))).toEqual(['0', '1']);
    expect(calls.every(c => c.url.includes('size=100') && c.url.includes('status=IN_REVIEW'))).toBe(true);
  });
  it('운영자 입점 신청, 운영자 상품 심사, 구매자 주문, 구매자 문의함은 100건이 넘어도 모든 페이지를 읽는다', async () => {
    const content = (u: URL, row: (id: string) => object) => ({ page: pageOf(u), size: 100, totalPages: 2, totalElements: 150, content: Array.from({ length: pageOf(u) === 0 ? 100 : 50 }, (_, i) => row(`x${pageOf(u)}-${i}`)) });
    fake(u => {
      if (u.pathname.includes('/admin/seller-applications')) return content(u, id => ({ applicationId: id, accountId: id, status: 'PENDING', submittedAt: '2026-01-01T00:00:00Z' }));
      if (u.pathname.includes('/admin/product-reviews')) { const c = content(u, id => ({ id, name: id, status: 'IN_REVIEW', version: 1, startsAt: null, endsAt: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', submittedAt: null })); return { ...c, items: c.content, content: undefined }; }
      if (u.pathname.includes('/orders/inquiries')) return content(u, id => ({ id, orderId: 'o', productId: 'p', productName: '상품', category: '기타', lastMessage: 'm', lastMessageAt: '2026-01-01T00:00:00Z', awaitingSeller: true, createdAt: '2026-01-01T00:00:00Z' }));
      return content(u, id => ({ orderId: id, orderNumber: id, productId: 'p', productName: '상품', brandOrStore: '', items: [], state: 'CONFIRMED', delivery: 'PREPARING', totalAmount: 1, createdAt: '2026-01-01T00:00:00Z', sourceVersion: 1 }));
    });
    expect(await listAdminApplications()).toHaveLength(150);
    expect(await listAdminProductReviews()).toHaveLength(150);
    expect(await listOrders()).toHaveLength(150);
    expect(await listInquiryInbox('u')).toHaveLength(150);
  });
  it('끝없이 이어지는 응답은 50페이지에서 멈추고 실패로 알린다', async () => {
    await expect(allPages(async page => ({ page, totalPages: 999, rows: [page] }))).rejects.toThrow('너무 많아');
    await expect(allArrayPages(async (_p, size) => Array.from({ length: size }, () => 1))).rejects.toThrow('너무 많아');
  });
  it('페이지 정보가 없는 이전 응답은 첫 페이지를 마지막으로 본다', async () => {
    const calls = fake(() => ({ content: [] }));
    expect(await listOrders()).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});
