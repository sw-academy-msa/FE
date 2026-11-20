/** 터치 기기에서 브라우저 확대 제스처만 막는다. 한 손가락 스크롤과 클릭은 유지한다. */
export function installMobileViewportGuards(): () => void {
  if (!navigator.maxTouchPoints && !window.matchMedia('(pointer: coarse)').matches) return () => {};
  const prevent = (event: Event) => { if (event.cancelable) event.preventDefault(); };
  const touchMove = (event: TouchEvent) => { if (event.touches.length > 1) prevent(event); };
  const options = { passive: false, capture: true };
  const gestures = ['gesturestart', 'gesturechange', 'gestureend'];
  for (const name of gestures) document.addEventListener(name, prevent, options);
  document.addEventListener('touchmove', touchMove, options);
  return () => {
    for (const name of gestures) document.removeEventListener(name, prevent, options);
    document.removeEventListener('touchmove', touchMove, options);
  };
}
