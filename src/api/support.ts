/**
 * 운영팀 1:1 문의(Account). 화면은 기존 문의 타입(Inquiry, sellerId='stockdrop')을 그대로 쓰므로 여기서 변환한다.
 * 작성·내 문의: BUYER/SELLER, 목록·답변: ADMIN
 */
import type { Inquiry } from '../domain';
import { api } from './client';

const account = 'account' as const;
const enc = encodeURIComponent;
type Category = 'ACCOUNT' | 'PAYMENT' | 'APP_ERROR' | 'SELLING' | 'ETC';
export interface SupportInquiryDto { id: string; accountId: string | null; category: Category; title: string; body: string; orderId: string | null; status: 'WAITING' | 'ANSWERED'; answer: string | null; answeredAt: string | null; createdAt: string }
interface SupportPage { content: SupportInquiryDto[]; page: number; size: number; totalElements: number; totalPages: number }

/** 화면 문의 유형 ↔ 서버 분류 */
export const SUPPORT_KINDS: Record<string, Category> = { 계정: 'ACCOUNT', 결제: 'PAYMENT', '앱 오류': 'APP_ERROR', '입점·판매': 'SELLING', 기타: 'ETC' };
const kindOf = (c: Category) => Object.entries(SUPPORT_KINDS).find(([, v]) => v === c)?.[0] ?? '기타';

/** 서버 문의 → 화면 Inquiry. 본인 조회는 accountId가 없어 호출한 사용자 id를 넣는다 */
export function supportFromApi(d: SupportInquiryDto, userId: string): Inquiry {
  return { id: d.id, userId: d.accountId ?? userId, sellerId: 'stockdrop', productId: '', productName: d.title, kind: kindOf(d.category), question: d.body, answer: d.answer ?? undefined, public: false, createdAt: Date.parse(d.createdAt), orderId: d.orderId ?? undefined };
}

/** POST /v1/support-inquiries */
export async function createSupportInquiry(b: { kind: string; title: string; content: string; orderId?: string }, userId: string): Promise<Inquiry> {
  const d = await api.post<SupportInquiryDto>('/v1/support-inquiries', { category: SUPPORT_KINDS[b.kind] ?? 'ETC', title: b.title.trim(), body: b.content.trim(), orderId: b.orderId || undefined }, { service: account });
  return supportFromApi(d, userId);
}
/** GET /v1/support-inquiries — 내 1:1 문의(최근 순) */
export async function listMySupportInquiries(userId: string, signal?: AbortSignal): Promise<Inquiry[]> {
  return (await api.get<SupportPage>('/v1/support-inquiries', { service: account, signal, query: { size: 100 } })).content.map(d => supportFromApi(d, userId));
}
/** GET /v1/admin/support-inquiries — 운영자 전체 목록(최근 순) */
export async function listAdminSupportInquiries(signal?: AbortSignal): Promise<Inquiry[]> {
  return (await api.get<SupportPage>('/v1/admin/support-inquiries', { service: account, signal, query: { size: 100 } })).content.map(d => supportFromApi(d, ''));
}
/** PUT /v1/admin/support-inquiries/{id}/answer — 한 번만 */
export async function answerSupportInquiry(id: string, answer: string): Promise<Inquiry> {
  return supportFromApi(await api.put<SupportInquiryDto>(`/v1/admin/support-inquiries/${enc(id)}/answer`, { answer: answer.trim() }, { service: account }), '');
}
