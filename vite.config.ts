import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react(), {
    name: 'serve-html-docx-browser-build',
    configureServer(server) {
      server.middlewares.use('/html-docx.js', (_request, response) => {
        response.setHeader('Content-Type', 'application/javascript')
        response.end(readFileSync(resolve(process.cwd(), 'node_modules/html-docx-js/dist/html-docx.js')))
      })
    },
    writeBundle(options) {
      const outputDir = options.dir ?? resolve(process.cwd(), 'dist')
      mkdirSync(outputDir, { recursive: true })
      copyFileSync(resolve(process.cwd(), 'node_modules/html-docx-js/dist/html-docx.js'), resolve(outputDir, 'html-docx.js'))
    },
  }],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  server: {
    proxy: {
      '/api': {
        target: 'https://api.siliconflow.cn/v1',
        changeOrigin: true,
        secure: true,
        rewrite: (requestPath) => requestPath.replace(/^\/api/, ''),
      },
    },
  },
})
