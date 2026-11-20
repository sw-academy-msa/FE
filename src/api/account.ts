/**
 * 회원 설정 도메인 — 명세 docs/api-spec.md 1·2절 중 내 정보·이름·탈퇴·알림 동의/설정. Account service(`account`).
 */
import { api, ApiError } from './client';
import type { AccountDto, SignupOptionsDto, WithdrawalEligibilityDto } from './types';

const service = 'account' as const;
const ME = '/v1/accounts/me';

export interface MySettings { name: string; saleStart: boolean; personalizedRecommendation: boolean; marketing: boolean }

export const mySettingsFromApi = (d: AccountDto): MySettings => ({
  name: d.name ?? '',
  saleStart: d.notificationSettings?.saleStart ?? false, personalizedRecommendation: d.notificationSettings?.personalizedRecommendation ?? false, marketing: d.marketingConsent?.agreed ?? false,
});

/* ── API ── */
/** GET /v1/accounts/me — 이름·알림 설정·광고성 동의 */
export async function fetchMySettings(signal?: AbortSignal): Promise<MySettings> {
  return mySettingsFromApi(await api.get<AccountDto>(ME, { service, signal }));
}
/** PATCH /v1/accounts/me — 이름만 수정 가능 */
export const updateMyName = (name: string) => api.patch<null>(ME, { name }, { service });
/** PUT /v1/accounts/me/marketing-consent */
export const saveMarketingConsent = (marketingConsent: boolean) => api.put<null>(`${ME}/marketing-consent`, { marketingConsent }, { service });
/** PUT /v1/accounts/me/notification-settings — 두 값 모두 필수 */
export const saveNotificationSettings = (saleStart: boolean, personalizedRecommendation: boolean) => api.put<null>(`${ME}/notification-settings`, { saleStart, personalizedRecommendation }, { service });
/** GET /v1/accounts/me/withdrawal-eligibility — verified=false면 탈퇴 가능으로 보지 않는다 */
export const fetchWithdrawalEligibility = (signal?: AbortSignal) => api.get<WithdrawalEligibilityDto>(`${ME}/withdrawal-eligibility`, { service, signal });
/** DELETE /v1/accounts/me — 성공하면 서버가 Refresh 세션을 폐기하므로 호출한 쪽이 로컬 세션도 끝낸다 */
export const withdrawAccount = (currentPassword: string, reason?: string) => api.delete<{ withdrawnAt: string }>(ME, { service, body: { currentPassword, reason: reason || undefined, confirmed: true } });

/* ── 관심사(Account)·개인화 프로필(AI) ── */
/** GET /v1/signup-options — 공개. 관심 카테고리 선택지(code=저장 값, label=표시 이름) */
export const fetchSignupOptions = (signal?: AbortSignal) => api.get<SignupOptionsDto>('/v1/signup-options', { service, auth: false, signal });
/** GET /v1/accounts/me의 interestCategories(저장 코드) */
export async function fetchMyInterests(signal?: AbortSignal): Promise<string[]> {
  return (await api.get<AccountDto>(ME, { service, signal })).interestCategories ?? [];
}
/** PUT /v1/accounts/me/interests — 목록 전체 교체(최대 12개, 빈 배열은 전체 해제) */
export const MAX_INTERESTS = 12;
export const saveInterests = (codes: string[]) => api.put<null>(`${ME}/interests`, { interestCategories: [...new Set(codes)] }, { service });
/** GET /v1/ai/analytics/profile (BUYER) — 분석 참여 전이면 analyticsEnabled=false, 집계 전이면 categoryName=null */
export interface AnalyticsProfileDto { analyticsEnabled: boolean; categoryName: string | null; views: number | null; lastViewedAt: string | null; profileAsOf: string | null }
export async function fetchAnalyticsProfile(signal?: AbortSignal): Promise<AnalyticsProfileDto> {
  try { return await api.get<AnalyticsProfileDto>('/v1/ai/analytics/profile', { service: 'general', signal }); }
  catch (e) { if (e instanceof ApiError && e.status === 404) return { analyticsEnabled: false, categoryName: null, views: null, lastViewedAt: null, profileAsOf: null }; throw e; } // 404 PERSONALIZATION_NOT_FOUND: 미참여
}
