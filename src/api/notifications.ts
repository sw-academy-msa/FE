/**
 * 알림함 도메인 — 명세 docs/api-spec.md 5절 중 알림함 5개. 일반 Gateway(`general`). (웹 푸시 API는 다루지 않는다)
 * 목록 응답은 data.content만 있고 totalPages가 없다.
 */
import { api } from './client';
import { errorMessage, isApiError } from './errors';
import { ms } from './mappers';
import type { NotificationDto, NotificationPage } from './types';

const service = 'general' as const;
const BASE = '/v1/notifications';

export type NotificationKind = '구매' | '상품' | '맞춤 추천' | '판매';
export interface InboxItem { id: string; kind: NotificationKind; title: string; desc: string; ts: number; read: boolean; targetType: NotificationDto['targetType']; targetId: string; relatedId?: string | null }

export function notificationFromApi(d: NotificationDto): InboxItem {
  // 판매자에게 온 알림(입점·상품 심사·판매 주문)은 '판매'로 묶어 구매 알림과 섞이지 않게 한다
  const kind: NotificationKind = (d.type ?? '').includes('PERSONALIZED') ? '맞춤 추천' : d.targetType.startsWith('SELLER_') ? '판매' : ['ORDER', 'SUPPORT_INQUIRY', 'PRODUCT_INQUIRY', 'ORDER_INQUIRY'].includes(d.targetType) ? '구매' : '상품';
  return { id: d.id, kind, title: d.title ?? '', desc: d.body ?? '', ts: ms(d.occurredAt) ?? Date.parse(d.createdAt), read: !!d.readAt, targetType: d.targetType, targetId: d.targetId, relatedId: d.relatedId };
}
/** 알림 대상 → 앱 경로. SELLER_APPLICATION은 전용 화면이 없어 /apply로 보낸다 */
export function notificationPath(n: Pick<InboxItem, 'targetType' | 'targetId' | 'relatedId'>): string {
  const id = encodeURIComponent(n.targetId);
  switch (n.targetType) {
    case 'PRODUCT': return `/product/${id}`;
    case 'ORDER': return `/orders/${id}`;
    case 'SELLER_ORDER': return `/seller/orders/${id}`;
    case 'SELLER_PRODUCT': case 'SELLER_PRODUCT_REVISION': return `/seller/product/${id}`;
    case 'SUPPORT_INQUIRY': return `/inquiries/${id}`;
    // 관련 ID로 직접 조회하여 새로고침이나 목록의 첫 페이지 밖 문의도 찾는다.
    case 'PRODUCT_INQUIRY': return n.relatedId ? `/inquiries/${id}?productId=${encodeURIComponent(n.relatedId)}` : '/inquiries';
    case 'ORDER_INQUIRY': return n.relatedId ? `/inquiries/${id}?orderId=${encodeURIComponent(n.relatedId)}` : '/inquiries';
    case 'SELLER_PRODUCT_INQUIRY': case 'SELLER_ORDER_INQUIRY': return '/seller/inquiries';
    default: return '/apply'; // 추측(명세 없음): 입점 신청 상태는 /apply에서 본다
  }
}

/** GET /v1/notifications — 최신순. 조회해도 읽음 상태는 바뀌지 않는다 */
export async function listNotifications(page = 0, size = 50, signal?: AbortSignal): Promise<InboxItem[]> {
  return (await api.get<NotificationPage<NotificationDto>>(BASE, { service, signal, query: { page, size } })).content.map(notificationFromApi);
}
/** GET /v1/notifications/unread-count */
export async function fetchUnreadCount(signal?: AbortSignal): Promise<number> { return (await api.get<{ count: number }>(`${BASE}/unread-count`, { service, signal })).count; }
/** GET /v1/notifications/{id} — 읽음 처리는 하지 않는다 */
export async function getNotification(id: string, signal?: AbortSignal): Promise<InboxItem> { return notificationFromApi(await api.get<NotificationDto>(`${BASE}/${encodeURIComponent(id)}`, { service, signal })); }
/** PATCH /v1/notifications/{id}/read — changed: 처음 1, 이미 읽음 0 */
export const markNotificationRead = (id: string) => api.patch<{ changed: number }>(`${BASE}/${encodeURIComponent(id)}/read`, undefined, { service });
/** PATCH /v1/notifications/read-all */
export const markAllNotificationsRead = () => api.patch<{ changed: number }>(`${BASE}/read-all`, undefined, { service });

/* ── 상품 알림: 상품 상세의 '알림 받기'. 신청한 상품의 판매 시작·가격 인하·수량 임박 알림을 받는다 ──
 * 계정의 판매 시작 알림 설정(notification-settings saleStart)이 꺼져 있으면 신청해 둬도 보내지 않는다.
 * 판매자 본인 상품·판매가 끝난 상품은 400, 계정당 200개를 넘으면 409, 아직 알림 대상으로 등록되지 않은 상품은 404 */
export interface ProductAlertDto { productId: string; subscribed: boolean; createdAt: string | null }
const alertAt = (productId: string) => `${BASE}/product-alerts/${encodeURIComponent(productId)}`;
/** GET /v1/notifications/product-alerts — 신청한 상품 목록(data 자체가 배열) */
export const listProductAlerts = (signal?: AbortSignal) => api.get<ProductAlertDto[]>(`${BASE}/product-alerts`, { service, signal });
/** GET /v1/notifications/product-alerts/{productId} — 신청하지 않았으면 subscribed=false */
export const getProductAlert = (productId: string, signal?: AbortSignal) => api.get<ProductAlertDto>(alertAt(productId), { service, signal });
/** PUT /v1/notifications/product-alerts/{productId} — 이미 신청했어도 성공(멱등) */
export const subscribeProductAlert = (productId: string) => api.put<ProductAlertDto>(alertAt(productId), undefined, { service });
/** DELETE /v1/notifications/product-alerts/{productId} — 신청하지 않았어도 성공(멱등) */
export const unsubscribeProductAlert = (productId: string) => api.delete<null>(alertAt(productId), { service });
/** 서버 거절 코드 → 안내 문구 */
export function productAlertError(e: unknown): string {
  if (isApiError(e, 'NOTIFICATION_INVALID_REQUEST')) return '본인 상품이거나 판매가 끝난 상품은 알림을 신청할 수 없어요.';
  if (isApiError(e, 'NOTIFICATION_CONFLICT')) return '알림은 상품 200개까지 신청할 수 있어요. 다른 상품 알림을 취소한 뒤 다시 신청해 주세요.';
  if (isApiError(e, 'NOTIFICATION_NOT_FOUND')) return '아직 알림을 신청할 수 없는 상품이에요. 잠시 후 다시 시도해 주세요.';
  return errorMessage(e);
}
