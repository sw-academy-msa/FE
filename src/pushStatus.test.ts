import { describe, expect, it, vi } from 'vitest';
vi.mock('./push', () => ({ PUSH_CHANGED: 'stockdrop:push-changed', pushState: vi.fn() })); // push.ts는 store(window)를 불러와 판단 함수만 본다
import { backgroundPushOn } from './pushStatus';

describe('홈 알림 아이콘의 백그라운드 알림 표시', () => {
  it('로그인하고 알림 설정 화면 기준(pushState)이 on일 때만 켜짐이다', () => {
    expect(backgroundPushOn(true, 'on')).toBe(true);
    for (const state of ['unsupported', 'denied', 'ask', 'reconnect', undefined] as const) expect(backgroundPushOn(true, state)).toBe(false);
    expect(backgroundPushOn(false, 'on')).toBe(false); // 로그아웃
  });
});
