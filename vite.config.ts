import path from 'node:path'
import pages from '@hono/vite-cloudflare-pages'
import adapter from '@hono/vite-dev-server/cloudflare'
import honox from 'honox/vite'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => {
  const common = {
    resolve: {
      alias: {
        '~': path.resolve(__dirname, 'app'),
      },
    },
  }

  if (mode === 'client') {
    return {
      ...common,
      build: {
        rollupOptions: {
          input: ['/app/client.ts'],
          output: {
            entryFileNames: 'static/client.js',
            chunkFileNames: 'static/assets/[name]-[hash].js',
            assetFileNames: 'static/assets/[name]-[hash].[ext]',
          },
        },
        emptyOutDir: false,
      },
    }
  }
  return {
    ...common,
    plugins: [
      honox({
        devServer: {
          adapter,
        },
      }),
      pages(),
    ],
  }
})
