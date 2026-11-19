/**
 * 판매자 도메인(2/2) 주문·배송·문의 — 명세 docs/api-spec.md 7절(12개).
 * 조회(목록·상세·집계·문의)=일반 Gateway(`general`), 쓰기·원본 조회(fulfillment·출고·배송완료·문의 답변)=PurchaseGateway(`purchase`). 모두 SELLER JWT.
 * 변경 작업의 version은 목록·상세의 sourceVersion이 아니라 fulfillment 원본의 version을 쓴다(없으면 409).
 */
import type { Inquiry, Order } from '../domain';
import { api } from './client';
import { allSellerPages } from './sellerPaging';
import { inquiryFromCard, orderInquiryFromApi } from './inquiries';
import { orderFromApi } from './mappers';
import { orderFromCommand, orderFromListItem } from './orders';
import type { SellerSettlementDto, ContentPage, InquiryCardDto, OrderCommandDto, OrderDetailDto, OrderInquiryDto, OrderListItemDto, OrderState, DeliveryState, SellerOrderSummaryDto } from './types';

const general = 'general' as const, purchase = 'purchase' as const;
const enc = encodeURIComponent;
const S = '/v1/seller/orders';
const at = (id: string) => `${S}/${enc(id)}`;
/** 판매자 화면은 sellerId로 주문을 거른다. 응답에는 판매자 id가 없어 호출한 판매자 id를 넣는다 */
const mine = (sellerId: string) => (o: Order): Order => ({ ...o, sellerId });

/* ── 조회 ── */
export interface SellerOrderQuery { keyword?: string; state?: OrderState; delivery?: DeliveryState; createdFrom?: string; createdTo?: string; productId?: string; page?: number; size?: number }
/** GET /v1/seller/orders — 본인 주문 목록(`content`). 목록에는 단가·배송지가 없다 */
export async function listSellerOrders(sellerId: string, q: SellerOrderQuery = {}, signal?: AbortSignal): Promise<Order[]> {
  const rows = await allSellerPages(async page => {
    const r = await api.get<ContentPage<OrderListItemDto>>(S, { service: general, signal, query: { size: 100, ...q, page } });
    return { ...r, rows: r.content };
  }, q.page);
  return rows.filter(d => d.state === 'CONFIRMED').map(d => mine(sellerId)(orderFromListItem(d, '')));
}
/** GET /v1/seller/orders/{id} — 상세(배송지·송장 포함) */
export async function getSellerOrder(id: string, sellerId: string, signal?: AbortSignal): Promise<Order> {
  return mine(sellerId)(orderFromApi(await api.get<OrderDetailDto>(at(id), { service: general, signal }), ''));
}
/** GET /v1/seller/orders/summary — 주문·배송 상태 집계(매출·정산 없음, approximate) */
export const getSellerOrderSummary = (q: { productId?: string; createdFrom?: string; createdTo?: string } = {}, signal?: AbortSignal) =>
  api.get<SellerOrderSummaryDto>(`${S}/summary`, { service: general, signal, query: q });

/** GET /v1/seller/orders/settlement — 월별 정산 금액(구매 확정 기준, 송금 없음). month=YYYY-MM */
export const getSellerSettlement = (month: string, signal?: AbortSignal) => api.get<SellerSettlementDto>(`${S}/settlement`, { service: general, signal, query: { month } });
/**
 * 정산 예정 금액: 그달 구매 확정 금액에서 수수료를 뺀다. 수수료는 상품별로 한정 수량의 90%를 넘게 팔리면 그 상품 금액의 10%(feeFor와 같은 규칙).
 * 상품 수량을 모르면(목록 요약 없음) 수수료를 0으로 본다
 */
export function settlementNet(d: SellerSettlementDto, quantities: Record<string, { total: number; sold: number } | undefined>) {
  // 수수료 판단에 필요한 상품 수량을 아직 모르면(목록 조회 전 등) 금액을 확정하지 않는다
  if (d.products.some(p => !quantities[p.productId])) return undefined;
  const fee = d.products.reduce((n, p) => { const q = quantities[p.productId]!; return n + (q.total > 0 && q.sold * 10 > q.total * 9 ? Math.round(p.amount * 0.1) : 0); }, 0);
  return { gross: d.confirmedAmount, fee, net: d.confirmedAmount - fee };
}

/* ── 출고·배송 (Command) ── */
/** GET /v1/seller/orders/{id}/fulfillment — 출고용 원본. 이 version을 shipment/delivery-completion에 넘긴다 */
export const getFulfillment = (id: string, signal?: AbortSignal) => api.get<OrderCommandDto>(`${at(id)}/fulfillment`, { service: purchase, signal });
/** POST …/shipment — 송장 등록·배송 시작(CONFIRMED+PREPARING만). 같은 택배사+송장 재요청은 멱등 */
export const registerShipment = (id: string, b: { carrier: string; trackingNumber: string; expectedVersion: number }) => api.post<OrderCommandDto>(`${at(id)}/shipment`, b, { service: purchase });
/** POST …/delivery-completion — 수동 배송 완료(CONFIRMED+SHIPPING만, 이미 DELIVERED면 멱등) */
export const completeDelivery = (id: string, expectedVersion: number) => api.post<OrderCommandDto>(`${at(id)}/delivery-completion`, { expectedVersion }, { service: purchase });
/** 출고용 원본 version을 읽어 송장을 등록하고 갱신된 주문을 돌려준다 */
export async function shipOrder(id: string, sellerId: string, carrier: string, trackingNumber: string): Promise<Order> {
  const f = await getFulfillment(id);
  return mine(sellerId)({ ...orderFromCommand(await registerShipment(id, { carrier, trackingNumber, expectedVersion: f.version }), ''), shippedAt: Date.now() });
}
/** 출고용 원본 version을 읽어 배송 완료 처리하고 갱신된 주문을 돌려준다 */
export async function deliverOrder(id: string, sellerId: string): Promise<Order> {
  const f = await getFulfillment(id);
  return mine(sellerId)({ ...orderFromCommand(await completeDelivery(id, f.version), ''), deliveredAt: Date.now() });
}

/* ── 문의 ── */
const asSeller = (sellerId: string) => (q: Inquiry): Inquiry => ({ ...q, sellerId });
/** GET /v1/seller/orders/inquiries — 전체 주문 문의함(`content`) */
export async function listSellerOrderInquiryInbox(sellerId: string, q: { productId?: string; unansweredOnly?: boolean } = {}, signal?: AbortSignal): Promise<Inquiry[]> {
  const rows = await allSellerPages(async page => {
    const r = await api.get<ContentPage<InquiryCardDto>>(`${S}/inquiries`, { service: general, signal, query: { size: 100, ...q, page } });
    return { ...r, rows: r.content };
  });
  return rows.map(d => asSeller(sellerId)(inquiryFromCard(d, '')));
}
/** GET …/{id}/inquiries — 한 주문의 문의 목록 */
export async function listSellerOrderInquiries(orderId: string, sellerId: string, signal?: AbortSignal): Promise<Inquiry[]> {
  const rows = await allSellerPages(async page => {
    const r = await api.get<ContentPage<OrderInquiryDto>>(`${at(orderId)}/inquiries`, { service: general, signal, query: { size: 100, page } });
    return { ...r, rows: r.content };
  });
  return rows.map(d => asSeller(sellerId)(orderInquiryFromApi(d, '')));
}
/** GET …/{id}/inquiries/{inquiryId} — 문의 상세(메시지 전체) */
export async function getSellerOrderInquiry(orderId: string, inquiryId: string, sellerId: string, signal?: AbortSignal): Promise<Inquiry> {
  return asSeller(sellerId)(orderInquiryFromApi(await api.get<OrderInquiryDto>(`${at(orderId)}/inquiries/${enc(inquiryId)}`, { service: general, signal }), ''));
}
/** GET …/{order}/inquiries/{id}/editing — 답변용 원본(version 포함) */
export const getSellerInquiryEditing = (orderId: string, inquiryId: string, signal?: AbortSignal) =>
  api.get<OrderInquiryDto & { version: number }>(`${at(orderId)}/inquiries/${enc(inquiryId)}/editing`, { service: purchase, signal });
/** POST …/{order}/inquiries/{id}/answers — 답변 등록. requestKey가 같으면 같은 답변. 상품 FAQ로 자동 공개되지 않는다 */
export async function answerOrderInquiry(orderId: string, inquiryId: string, body: string, sellerId: string, requestKey = crypto.randomUUID()): Promise<Inquiry> {
  return asSeller(sellerId)(orderInquiryFromApi(await api.post<OrderInquiryDto>(`${at(orderId)}/inquiries/${enc(inquiryId)}/answers`, { requestKey, body }, { service: purchase }), ''));
}
/** GET …/{order}/inquiry-images/{id}/download — 5분 유효 열람 URL(문의에 연결된 사진만) */
export async function getSellerInquiryImageUrl(orderId: string, imageId: string, signal?: AbortSignal): Promise<string> {
  return (await api.get<{ url: string | null }>(`${at(orderId)}/inquiry-images/${enc(imageId)}/download`, { service: purchase, signal })).url ?? '';
}
