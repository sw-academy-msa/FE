/**
 * 홈 화면 알림 아이콘의 백그라운드 알림 표시. '켜짐' 기준은 알림 설정 화면과 같은 push.ts pushState() 하나다.
 * 켜짐 = 로그인 + pushState()==='on'(홈 화면에 추가한 iOS 앱, 알림 권한 허용, 브라우저 푸시 구독 있음, 마지막 서버 등록이 실패하지 않음).
 * 꺼짐 = 로그아웃, 미지원 브라우저(iOS Safari 탭과 데스크톱 포함: 서버가 iOS 웹 푸시만 받는다), 권한 거부나 미요청, 구독 없음.
 */
import { useEffect, useState } from 'react';
import { USE_MOCK } from './config';
import { PUSH_CHANGED, pushState, type PushState } from './push';

export const backgroundPushOn = (signedIn: boolean, state: PushState | undefined) => !USE_MOCK && signedIn && state === 'on';

/** 설정에서 켜고 끄거나(이 탭), 다른 탭에서 바뀌거나(storage), 권한이 바뀌거나, 앱으로 돌아오면 다시 확인한다 */
export function useBackgroundPush(signedIn: boolean): boolean {
  const [state, setState] = useState<PushState>();
  useEffect(() => {
    if (USE_MOCK || !signedIn) { setState(undefined); return; }
    let latest = 0, alive = true;
    const check = () => { const n = ++latest; pushState().then(v => { if (alive && n === latest) setState(v); }, () => { if (alive && n === latest) setState(undefined); }); };
    const visible = () => { if (document.visibilityState === 'visible') check(); };
    const storage = (e: StorageEvent) => { if (!e.key || e.key.startsWith('stockdrop:push-')) check(); };
    check();
    window.addEventListener(PUSH_CHANGED, check); window.addEventListener('focus', check); window.addEventListener('pageshow', check); window.addEventListener('storage', storage);
    document.addEventListener('visibilitychange', visible);
    let perm: PermissionStatus | undefined;
    navigator.permissions?.query({ name: 'notifications' as PermissionName }).then(p => { if (!alive) return; perm = p; p.addEventListener('change', check); }).catch(() => {});
    return () => {
      alive = false;
      window.removeEventListener(PUSH_CHANGED, check); window.removeEventListener('focus', check); window.removeEventListener('pageshow', check); window.removeEventListener('storage', storage);
      document.removeEventListener('visibilitychange', visible); perm?.removeEventListener('change', check);
    };
  }, [signedIn]);
  return backgroundPushOn(signedIn, state);
}
