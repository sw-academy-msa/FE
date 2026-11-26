/**
 * 멤버십 — 자격은 Account(`/v1/accounts/me/membership`), 금융 상태와 요금은 Payment(`/v1/payments/memberships/*`, 일반 Gateway).
 * 혜택 사용 근거는 Account active=true만 쓴다. 해지 202는 접수일 뿐이라 다시 조회해 확인한다.
 */
import { api } from './client';

const service = 'general' as const;
/** NONE, PENDING, ACTIVE, GRACE(결제 실패 유예), CANCEL_SCHEDULED(해지 예약), EXPIRED */
export interface MembershipDto { state: string; active: boolean; entitlementUntil: string | null; periodEnd: string | null; autoRenew: boolean; amount: number; currency: string; sourceVersion: number; cancelRequested: boolean; /** 해지 취소(철회) 처리 중 */ cancelWithdrawalRequested?: boolean; updatedAt: string | null }
export interface MembershipBillingDto { subscriptionId: string | null; state: string; autoRenew: boolean; periodStart: string | null; periodEnd: string | null; entitlementUntil: string | null; nextChargeAt: string | null; amount: number; currency: string; version: number; billingRegistrationRequired: boolean }
export interface MembershipConfigurationDto { clientKey: string; planVersion: string; amount: number; currency: string; termsVersion: string; successUrl: string; failUrl: string }
export interface MembershipCancellationDto { commandId: string; status: string; refreshRequired: boolean }

/** GET /v1/accounts/me/membership — 본인 자격 */
export const getMembership = (signal?: AbortSignal) => api.get<MembershipDto>('/v1/accounts/me/membership', { service: 'account', signal });
/** POST /v1/accounts/me/membership/cancellation — 해지 요청(202 접수) */
export const requestMembershipCancellation = () => api.post<MembershipCancellationDto>('/v1/accounts/me/membership/cancellation', undefined, { service: 'account' });
/** DELETE /v1/accounts/me/membership/cancellation — 해지 취소(202 접수). 409 MEMBERSHIP_CANCEL_NOT_WITHDRAWABLE */
export const withdrawMembershipCancellation = () => api.delete<MembershipCancellationDto>('/v1/accounts/me/membership/cancellation', { service: 'account' });
export interface MembershipSessionDto { sessionId: string; customerKey: string; clientKey: string; expiresAt: string; successUrl: string; failUrl: string }
export interface MembershipOperationDto { subscriptionId: string; operationStatus: string; refreshRequired: boolean }
/** POST /v1/payments/memberships/auth-sessions — 가입과 유예 중 카드 다시 등록 공통. 같은 Idempotency-Key면 같은 세션 */
export const createMembershipSession = (key: string, b: { planVersion: string; termsVersion: string }) =>
  api.post<MembershipSessionDto>('/v1/payments/memberships/auth-sessions', { planVersion: b.planVersion, termsVersion: b.termsVersion, recurringPaymentAgreed: true }, { service, headers: { 'Idempotency-Key': key } });
/** POST /v1/payments/memberships/auth-sessions/{id}/completion — 재시도 때 같은 Idempotency-Key */
export const completeMembershipSession = (sessionId: string, key: string, b: { authKey: string; customerKey: string }) =>
  api.post<MembershipOperationDto>(`/v1/payments/memberships/auth-sessions/${encodeURIComponent(sessionId)}/completion`, b, { service, headers: { 'Idempotency-Key': key } });
/** 회원제 쓰기 오류 안내 */
export function membershipError(e: unknown, fallback: string): string {
  const code = (e as { code?: string } | null)?.code;
  if (code === 'MEMBERSHIP_CONFLICT') return '결제를 처리하고 있거나 다른 카드 등록이 진행 중이에요. 잠시 뒤 다시 확인해 주세요. 유예 기간이 끝났다면 새로 가입해 주세요.';
  if (code === 'MEMBERSHIP_CONSENT_INVALID') return '약관이나 요금이 바뀌었어요. 화면을 닫고 다시 열어 동의해 주세요.';
  if (code === 'MEMBERSHIP_SESSION_INVALID') return '카드 등록 시간이 지났어요. 처음부터 다시 시도해 주세요.';
  if (code === 'MEMBERSHIP_CANCEL_NOT_WITHDRAWABLE') return '지금은 해지를 취소할 수 없어요. 혜택 종료가 가까웠거나 처리 중인 결제가 있어요.';
  if (code === 'MEMBERSHIP_UNAVAILABLE') return '멤버십 서비스를 잠시 이용할 수 없어요. 잠시 뒤 다시 시도해 주세요.';
  return (e as Error | null)?.message || fallback;
}
/** GET /v1/payments/memberships/me — 금융 처리 상태(가입 확인 중 판단) */
export const getMembershipBilling = (signal?: AbortSignal) => api.get<MembershipBillingDto>('/v1/payments/memberships/me', { service, signal });
/** GET /v1/payments/memberships/configuration — 요금, 요금제와 약관 버전 */
export const getMembershipConfiguration = (signal?: AbortSignal) => api.get<MembershipConfigurationDto>('/v1/payments/memberships/configuration', { service, signal });

export type MembershipView = 'none' | 'active' | 'cancelScheduled' | 'grace' | 'pending';
/** 화면 상태: 자격(active)이 기준, 가입 확인 중은 금융 상태가 PENDING이고 자격이 아직 없을 때 */
export function membershipView(m: MembershipDto, billing?: MembershipBillingDto | null): MembershipView {
  if (m.active) {
    if (m.state === 'GRACE') return 'grace';
    if (m.state === 'CANCEL_SCHEDULED' || m.cancelRequested || !m.autoRenew) return 'cancelScheduled';
    return 'active';
  }
  if (m.state === 'PENDING' || billing?.state === 'PENDING' || (billing && !billing.billingRegistrationRequired && billing.state === 'ACTIVE')) return 'pending';
  return 'none';
}
