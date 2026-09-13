import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { registerServiceWorker } from './lib/install';
import { MarketDataProvider } from './market/MarketDataContext';
import './index.css';

registerServiceWorker();

document.documentElement.classList.toggle('light-theme', localStorage.getItem('ntd.theme') === 'light');
document.documentElement.classList.toggle('privacy-mode', localStorage.getItem('ntd.privacy') === 'on');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <MarketDataProvider>
          <App />
        </MarketDataProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
