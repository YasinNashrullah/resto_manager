import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/ai-proxy': {
        target: 'http://localhost:20128',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ai-proxy/, '')
      }
    }
  }
})
