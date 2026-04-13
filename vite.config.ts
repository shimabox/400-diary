import path from 'node:path'
import pages from '@hono/vite-cloudflare-pages'
import adapter from '@hono/vite-dev-server/cloudflare'
import honox from 'honox/vite'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import fullReload from 'vite-plugin-full-reload'

// resvg-wasm の WASM バイナリを wrangler が処理できる形式で外部化する
function resvgWasmPlugin(): Plugin {
  return {
    name: 'resvg-wasm-resolve',
    resolveId(source) {
      if (source === 'resvg-wasm-module') {
        return { id: './static/resvg_bg.wasm', external: true }
      }
    },
  }
}

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
        manifest: true,
        rollupOptions: {
          input: ['/app/client.ts', '/app/styles/global.css'],
          output: {
            entryFileNames: 'static/client.js',
            chunkFileNames: 'static/assets/[name]-[hash].js',
            assetFileNames: (assetInfo) => {
              if (assetInfo.names?.some((n) => n === 'global.css')) {
                return 'static/assets/global.css'
              }
              return 'static/assets/[name]-[hash].[ext]'
            },
          },
        },
        emptyOutDir: false,
      },
    }
  }
  return {
    ...common,
    plugins: [
      resvgWasmPlugin(),
      honox({
        devServer: {
          adapter,
        },
      }),
      pages(),
      fullReload(['app/**/*.tsx', 'app/**/*.ts', 'app/**/*.css']),
    ],
  }
})
