import { useEffect, useLayoutEffect, useState } from 'react';
import { authReady } from '../splash';
import { BrandLogo } from './BrandLogo';

/** 앱을 새로 열거나 새로고침할 때만 한 번(같은 페이지 안의 화면 이동에서는 다시 안 나온다) */
/** 자동화 브라우저(e2e)에서는 클릭을 가리지 않게 건너뛴다 — 시작 화면 자체를 검사하는 테스트는 navigator.webdriver를 false로 덮어쓴다 */
let played = typeof navigator !== 'undefined' && navigator.webdriver === true || fromPayment();
/** 토스 결제창에서 돌아온 경우(#/payments/toss/success|fail): 앱을 새로 연 게 아니므로 건너뛴다 */
function fromPayment() { return typeof location !== 'undefined' && location.hash.startsWith('#/payments/toss/'); }
const MIN_MS = 1200, MAX_MS = 3000, FADE_MS = 300;
/**
 * 시작 화면(Pencil 시안 스플래시 (앱 시작)): 주색 바탕 가운데 흰 로고(폭 210)와 문구, 사이 14.
 * 아이폰 정지 화면(public/splash/splash-*.png)도 같은 크기와 위치로 그려(scripts/startup-images.mjs), 넘어갈 때 튀지 않는다
 */
const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** index.html의 검은 첫 프레임(#boot)과 html·body 인라인 배경을 넘겨받는다: 스플래시가 같은 검정으로 덮은 뒤에 걷어 깜빡임이 없다 */
const releaseBoot = () => { document.getElementById('boot')?.remove(); };
const releaseBackground = () => { document.documentElement.style.background = ''; document.body.style.background = ''; };

export function Splash() {
  const [phase, setPhase] = useState<'show' | 'out' | 'gone'>(() => (played ? 'gone' : 'show'));
  useLayoutEffect(() => { releaseBoot(); if (phase === 'gone') releaseBackground(); }, []); // 같은 커밋에서 스플래시(또는 앱)가 이미 그려졌다
  useEffect(() => { if (phase === 'gone') releaseBackground(); }, [phase]);
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    if (played) return; played = true;
    let alive = true;
    // 최소 1.2초(움직임 줄이기는 0.6초) + 로그인 확인이 끝날 때까지, 단 3초를 넘기지 않는다
    Promise.race([Promise.all([delay(reduced ? 600 : MIN_MS), authReady]), delay(MAX_MS)]).then(async () => {
      if (!alive) return;
      if (reduced) { setPhase('gone'); return; }
      setPhase('out'); await delay(FADE_MS); if (alive) setPhase('gone');
    });
    return () => { alive = false; };
  }, []);
  if (phase === 'gone') return null;
  return <div role="img" aria-label="STOCKDROP" className="splash" style={{ opacity: phase === 'out' ? 0 : 1, pointerEvents: phase === 'out' ? 'none' : 'auto' }}>
    <BrandLogo width={210} color="var(--sd-color-surface)"/><p className="splash-tagline">EVERY DROP, 3 HOURS ONLY</p>
  </div>;
}
