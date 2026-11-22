import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyTwemoji } from './scripts/copy-twemoji.mjs'

// 絵文字画像（Twemoji）を public/twemoji に用意する（CDN は使わない）
const twemoji = () => ({ name: 'copy-twemoji', buildStart() { copyTwemoji(); } })

// "https://chat.example.com,http://192.168.1.10:3000" → ['chat.example.com', '192.168.1.10']
const originHosts = (...lists) => lists
  .flatMap(v => String(v || '').split(','))
  .map(v => v.trim())
  .filter(Boolean)
  .map(v => { try { return new URL(v).hostname; } catch { return null; } })
  .filter(Boolean);

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  return {
  plugins: [react(),
    tailwindcss(),
    twemoji(),
  ],
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/react-router') || id.includes('node_modules/socket.io-client/')) {
            return 'vendor';
          }
        },
      },
    },
  },
  server: {
    host: true,
    watch: {
      ignored: ['**/server/**']
    },
    // 開発サーバーに外からアクセスするホスト名。PUBLIC_ORIGIN / EXTRA_ORIGINS（.env）のホストも許可する
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      ...originHosts(env.PUBLIC_ORIGIN, env.EXTRA_ORIGINS),
    ],
    hmr: process.env.VITE_HMR_HOST ? {
      protocol: 'ws',
      host: process.env.VITE_HMR_HOST,
      port: process.env.VITE_HMR_PORT || 3000,
    } : {
      protocol: 'ws',
      host: 'localhost',
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        secure: false,
        // プリフライトリクエストをキャッシュ
        headers: {
          'Access-Control-Max-Age': '86400',
        },
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
        timeout: 0,
        proxyTimeout: 0,
      },
      '/peerjs': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
        timeout: 0,
        proxyTimeout: 0,
      },
      '/server/stumps': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/stumps': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/server/stump': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/stump': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  }
})
