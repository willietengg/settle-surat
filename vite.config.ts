import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '家庭信件管家',
        short_name: '信件管家',
        description: '拍照或上传家里的信件,自动整理重点、提醒到期事项',
        theme_color: '#1f6feb',
        background_color: '#f6f7f9',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      },
      // 信件内容是隐私数据:只缓存应用外壳,绝不缓存 Supabase 的 API / 存储请求
      workbox: { navigateFallbackDenylist: [/^\/rest\//, /^\/storage\//, /^\/auth\//] }
    })
  ]
})
