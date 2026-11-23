/** 로그인 확인(토큰 재발급)이 끝났다는 신호 — App이 알리고, 시작 화면(Splash)이 이 신호를 기다린다 */
let done: () => void = () => {};
export const authReady = new Promise<void>(r => { done = r; });
export const markAuthReady = () => done();
/**
 * 지금 보고 있는 하단 탭을 다시 누르면 보내는 신호. App이 화면을 새로 그려(다시 마운트) 그 화면의 데이터를 다시 받는다.
 * 페이지 전체를 다시 불러오면(location.reload) iPhone 홈 화면 앱에서 하단 메뉴가 위로 밀려 보여서 쓰지 않는다
 */
export const TAB_REFRESH = 'stockdrop:tab-refresh';
