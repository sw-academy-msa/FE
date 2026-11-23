import { useEffect, useState } from 'react';
import { Loader } from 'lucide-react';
import { isStandalone } from '../push';

/** 손가락 이동의 절반만 따라오고 MAX에서 멈춘다. TRIGGER 이상에서 놓으면 HOLD 높이에 멈춘 채 새로고침 */
const TRIGGER = 70, MAX = 120, HOLD = 56;
/** 당겨서 새로고침으로 다시 열 때는 시작 화면(스플래시)을 건너뛴다 — Splash·index.html이 읽고 지운다 */
export const PTR_FLAG = 'stockdrop:ptr';

/** 홈 화면 앱(standalone)에는 브라우저의 당겨서 새로고침이 없어서 직접 넣는다. 브라우저에서는 기본 동작과 겹치므로 끈다. */
export function PullToRefresh() {
  const [pull, setPull] = useState(0), [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (!isStandalone()) return;
    let startY: number | null = null, dist = 0, busy = false;
    const content = () => document.querySelector('main');
    const place = (y: number, animate: boolean) => {
      const el = content(); if (!el) return;
      el.style.transition = animate ? 'transform 220ms cubic-bezier(.22,1,.36,1)' : 'none';
      el.style.transform = y ? `translateY(${y}px)` : '';
      setPull(y);
    };
    // 바텀시트·내부 스크롤 영역을 올리는 중이면 새로고침하지 않는다
    const blocked = (target: EventTarget | null) => {
      if (document.querySelector('dialog[open]')) return true;
      for (let el = target as HTMLElement | null; el && el !== document.body; el = el.parentElement) if (el.scrollTop > 0) return true;
      return false;
    };
    const start = (e: TouchEvent) => { startY = !busy && window.scrollY <= 0 && e.touches.length === 1 && !blocked(e.target) ? e.touches[0].clientY : null; dist = 0; };
    const move = (e: TouchEvent) => {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || window.scrollY > 0) { if (dist) place(0, false); startY = null; dist = 0; return; }
      dist = Math.min(MAX, dy * 0.5);
      place(dist, false);
    };
    const end = () => {
      if (startY === null) return;
      startY = null;
      if (dist < TRIGGER) { place(0, true); return; }
      busy = true; setRefreshing(true); place(HOLD, true);
      try { sessionStorage.setItem(PTR_FLAG, '1'); } catch { /* 저장소를 못 쓰면 스플래시가 한 번 나올 뿐 */ }
      setTimeout(() => window.location.reload(), 350); // 로딩 표시가 보일 시간
    };
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    return () => { window.removeEventListener('touchstart', start); window.removeEventListener('touchmove', move); window.removeEventListener('touchend', end); window.removeEventListener('touchcancel', end); };
  }, []);
  if (!pull) return null;
  // 내려간 화면 위 빈 공간 가운데에 iOS식 로딩 표시
  return <div aria-hidden className="pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top)] z-50 flex items-center justify-center text-muted" style={{ height: pull }}>
    <Loader size={22} className={refreshing ? 'animate-spin' : undefined} style={refreshing ? undefined : { opacity: Math.min(1, pull / TRIGGER), transform: `rotate(${pull * 3}deg)` }}/>
  </div>;
}
