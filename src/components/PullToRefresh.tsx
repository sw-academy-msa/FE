import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { isStandalone } from '../push';

const TRIGGER = 70, MAX = 110;

/** 홈 화면 앱(standalone)에는 브라우저의 당겨서 새로고침이 없어서 직접 넣는다. 브라우저에서는 기본 동작과 겹치므로 끈다. */
export function PullToRefresh() {
  const [pull, setPull] = useState(0), [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (!isStandalone()) return;
    let startY: number | null = null, dist = 0;
    // 바텀시트·내부 스크롤 영역을 올리는 중이면 새로고침하지 않는다
    const blocked = (target: EventTarget | null) => {
      if (document.querySelector('dialog[open]')) return true;
      for (let el = target as HTMLElement | null; el && el !== document.body; el = el.parentElement) if (el.scrollTop > 0) return true;
      return false;
    };
    const start = (e: TouchEvent) => { startY = window.scrollY <= 0 && e.touches.length === 1 && !blocked(e.target) ? e.touches[0].clientY : null; dist = 0; };
    const move = (e: TouchEvent) => {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || window.scrollY > 0) { startY = null; dist = 0; setPull(0); return; }
      dist = Math.min(MAX, dy * 0.5);
      setPull(dist);
    };
    const end = () => {
      if (startY === null) return;
      startY = null;
      if (dist >= TRIGGER) { setRefreshing(true); setPull(TRIGGER); window.location.reload(); } else setPull(0);
    };
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    return () => { window.removeEventListener('touchstart', start); window.removeEventListener('touchmove', move); window.removeEventListener('touchend', end); window.removeEventListener('touchcancel', end); };
  }, []);
  if (!pull) return null;
  return <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-[env(safe-area-inset-top)]" style={{ transform: `translateY(${pull - 40}px)` }}>
    <span className="grid h-9 w-9 place-items-center rounded-full bg-surface text-ink shadow-md" style={{ opacity: Math.min(1, pull / TRIGGER) }}>
      <RefreshCw size={18} className={refreshing ? 'animate-spin' : undefined} style={refreshing ? undefined : { transform: `rotate(${pull * 4}deg)` }}/>
    </span>
  </div>;
}
