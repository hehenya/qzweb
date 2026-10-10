import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 轻昼后端(与安卓端同一个服务)不返回 CORS 头,浏览器跨-origin 直接调用会被拦,
// 因此开发/部署都走"同源代理":前端只请求同-origin 的 /qz-api/* 和 /socket.io/*。
const QZ_TARGET = 'https://hehenya.dpdns.org:8505';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5500,
    proxy: {
      '/qz-api': {
        target: QZ_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/qz-api/, ''),
      },
      '/socket.io': {
        target: QZ_TARGET,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  // 生产环境同理:把 dist 交给任意静态服务器,并在反代(nginx/caddy)上
  // 配置同样的两条转发。若后端将来加了 CORS,可用 VITE_API_BASE 直连。
  // build 时注入的常量在 src/api/api.js 中读取。
})
