import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { initAnalytics, usePageView } from './analytics';
import { Splash } from './components/Splash';
import './styles.css';
import { installMobileViewportGuards } from './mobileViewport';
import { payStartHash } from './externalPay';
// 홈 화면 앱이 시스템 브라우저로 넘긴 결제(?payStart=주문id)는 결제 시작 화면으로 바꿔 연다
const payStart = payStartHash(location.search);
if (payStart) history.replaceState(null, '', `${location.pathname}${payStart}`);
const releaseViewportGuards = installMobileViewportGuards();
if (import.meta.hot) import.meta.hot.dispose(releaseViewportGuards);
initAnalytics();
function Tracked() { usePageView(); return <App/>; }
createRoot(document.getElementById('root')!).render(<><HashRouter><Tracked/></HashRouter><Splash/></>);
