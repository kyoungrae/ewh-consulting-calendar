import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// 에러 캡처를 위한 전역 핸들러
window.onerror = function (message, source, lineno, colno, error) {
  console.error('Global Error:', message, error);
  // 하얀 화면만 보일 때 사용자에게 최소한의 정보를 표시
  if (document.getElementById('root').innerHTML === '') {
    document.getElementById('root').innerHTML = `
      <div style="padding: 20px; font-family: sans-serif; color: #721c24; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; margin: 20px;">
        <h2 style="margin-top: 0;">앱 로드 중 오류가 발생했습니다</h2>
        <p>${message}</p>
        <button onclick="location.reload()" style="padding: 8px 16px; cursor: pointer;">새로고침</button>
      </div>
    `;
  }
};

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('Root element not found');

  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
} catch (error) {
  console.error('Root Rendering Error:', error);
}
