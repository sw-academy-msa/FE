/** 로그인 확인(토큰 재발급)이 끝났다는 신호 — App이 알리고, 시작 화면(Splash)이 이 신호를 기다린다 */
let done: () => void = () => {};
export const authReady = new Promise<void>(r => { done = r; });
export const markAuthReady = () => done();
/** 새로고침으로 다시 열 때는 시작 화면을 건너뛴다 — Splash·index.html이 이 표시를 읽는다(Splash가 지운다) */
export const REFRESH_FLAG = 'stockdrop:ptr';
export function reloadWithoutSplash() {
  try { sessionStorage.setItem(REFRESH_FLAG, '1'); } catch { /* 저장소를 못 쓰면 스플래시가 한 번 나올 뿐 */ }
  window.location.reload();
}
