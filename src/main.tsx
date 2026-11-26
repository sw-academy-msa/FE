import { createRoot } from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import { Theme } from '@astryxdesign/core/theme';
import { stockdropTheme } from './theme/stockdrop';
import { App } from './App';
import { captureAdvertisingReturn } from './api/advertising';
import { initAnalytics, usePageView } from './analytics';
import { Splash } from './components/Splash';
import './styles.css';
import { installMobileViewportGuards } from './mobileViewport';
const releaseViewportGuards = installMobileViewportGuards();
if (import.meta.hot) import.meta.hot.dispose(releaseViewportGuards);
captureAdvertisingReturn();
initAnalytics();
function Tracked() { usePageView(); return <App/>; }
// 데이터 라우터(createHashRouter): 작성 중 나가기 확인(useBlocker)에 필요하다. 화면 경로는 App의 <Routes>가 그대로 정한다
const router = createHashRouter([{ path: '*', element: <Tracked/> }]);
createRoot(document.getElementById('root')!).render(<Theme theme={stockdropTheme} mode="light"><RouterProvider router={router}/><Splash/></Theme>);
