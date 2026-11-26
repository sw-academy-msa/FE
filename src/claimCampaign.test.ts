import { describe, expect, it } from 'vitest';
import { notificationFromApi, notificationPath } from './api/notifications';
import type { NotificationDto } from './api/types';

describe('받기형 캠페인 알림 이동', () => {
  it('알림 상세의 캠페인 코드를 마이페이지 받기 시트로 넘긴다', () => {
    const dto: NotificationDto = { id: 'n', type: 'CAMPAIGN_CLAIM_AVAILABLE', title: '(광고) 쿠폰이 도착했어요', body: '웰컴 쿠폰을 받아 가세요.', targetType: 'CLAIM_CAMPAIGN', targetId: 'c', campaignCode: 'WELCOME_1000', relatedId: null, deadline: null, occurredAt: '2030-01-01T00:00:00Z', createdAt: '2030-01-01T00:00:00Z', readAt: null };
    expect(notificationPath(notificationFromApi(dto))).toBe('/my?claim=WELCOME_1000');
    expect(notificationPath({ targetType: 'CLAIM_CAMPAIGN', targetId: 'c' })).toBe('/my');
    expect(notificationPath({ targetType: 'COUPON', targetId: 'i' })).toBe('/my?coupons=available');
  });
});
