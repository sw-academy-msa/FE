/**
 * 멤버십 — 자격은 Account(`/v1/accounts/me/membership`), 금융 상태와 요금은 Payment(`/v1/payments/memberships/*`, 일반 Gateway).
 * 혜택 사용 근거는 Account active=true만 쓴다. 해지 202는 접수일 뿐이라 다시 조회해 확인한다.
 */
import { api } from './client';

const service = 'general' as const;
/** NONE, PENDING, ACTIVE, GRACE(결제 실패 유예), CANCEL_SCHEDULED(해지 예약), EXPIRED */
export interface MembershipDto { state: string; active: boolean; entitlementUntil: string | null; periodEnd: string | null; autoRenew: boolean; amount: number; currency: string; sourceVersion: number; cancelRequested: boolean; updatedAt: string | null }
export interface MembershipBillingDto { subscriptionId: string | null; state: string; autoRenew: boolean; periodStart: string | null; periodEnd: string | null; entitlementUntil: string | null; nextChargeAt: string | null; amount: number; currency: string; version: number; billingRegistrationRequired: boolean }
export interface MembershipConfigurationDto { clientKey: string; planVersion: string; amount: number; currency: string; termsVersion: string; successUrl: string; failUrl: string }
export interface MembershipCancellationDto { commandId: string; status: string; refreshRequired: boolean }

/** GET /v1/accounts/me/membership — 본인 자격 */
export const getMembership = (signal?: AbortSignal) => api.get<MembershipDto>('/v1/accounts/me/membership', { service: 'account', signal });
/** POST /v1/accounts/me/membership/cancellation — 해지 요청(202 접수) */
export const requestMembershipCancellation = () => api.post<MembershipCancellationDto>('/v1/accounts/me/membership/cancellation', undefined, { service: 'account' });
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
