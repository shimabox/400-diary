import path from 'node:path'
import pages from '@hono/vite-cloudflare-pages'
import adapter from '@hono/vite-dev-server/cloudflare'
import honox from 'honox/vite'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import fullReload from 'vite-plugin-full-reload'

// resvg-wasm の WASM バイナリを環境に応じて処理する
// - build: wrangler が WebAssembly.Module としてコンパイルできるよう外部化
// - dev: Node.js で WASM を読み込みコンパイルする仮想モジュールを提供
function resvgWasmPlugin(): Plugin {
  let isBuild = false
  return {
    name: 'resvg-wasm-resolve',
    configResolved(config) {
      isBuild = config.command === 'build'
    },
    resolveId(source) {
      if (source === 'resvg-wasm-module') {
        if (isBuild) {
          return { id: './static/resvg_bg.wasm', external: true }
        }
        return '\0resvg-wasm-module'
      }
    },
    load(id) {
      if (id === '\0resvg-wasm-module') {
        return [
          "import { readFileSync } from 'node:fs';",
          "import { resolve } from 'node:path';",
          "const wasmBuffer = readFileSync(resolve(process.cwd(), 'public/static/resvg_bg.wasm'));",
          'export default new WebAssembly.Module(wasmBuffer);',
        ].join('\n')
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
          // global.css は SSR 側で ?inline 取り込みして head にインライン化しているため、
          // クライアントビルドの input には含めない (dist/static/assets/global.css の
          // 不要なオーファン出力を防ぎ、static/assets/ をハッシュ付きアセット専用に
          // することで _headers のキャッシュ規則を単純化できる)。
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
