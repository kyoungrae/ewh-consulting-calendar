import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    host: true,
    strictPort: true, // 포트 충돌 시 에러를 내서 알 수 있게 함
    hmr: true, // Force HMR
    proxy: {
      '/api': {
        target: loadEnv(mode, '.', '').API_PROXY_TARGET || 'http://127.0.0.1:3001',
        changeOrigin: false,
      },
    },
  },
}))
