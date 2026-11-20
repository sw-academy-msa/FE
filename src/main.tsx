import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { initAnalytics, usePageView } from './analytics';
import { Splash } from './components/Splash';
import './styles.css';
import { installMobileViewportGuards } from './mobileViewport';
const releaseViewportGuards = installMobileViewportGuards();
if (import.meta.hot) import.meta.hot.dispose(releaseViewportGuards);
initAnalytics();
function Tracked() { usePageView(); return <App/>; }
createRoot(document.getElementById('root')!).render(<><HashRouter><Tracked/></HashRouter><Splash/></>);
