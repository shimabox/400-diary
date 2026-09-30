import path from 'node:path'
import pages from '@hono/vite-build/cloudflare-pages'
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

// dev サーバーで日記の読み上げを試すための binding。scripts/keychain/dev-with-gemini.sh が
// キーチェーンから読んで子プロセスの環境変数にだけ渡した値を、定義されているときだけ使う。
// .dev.vars や wrangler.toml には書かない（リポジトリやファイルにキーを残さない）。
// @hono/vite-dev-server はこの env を binding に合成した後にアダプタ（.dev.vars 由来）の値を
// 重ねるが、この 2 つは .dev.vars に無いので上書きされない。本番ビルドには影響しない
function geminiDevEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const name of ['GEMINI_API_KEY', 'GEMINI_VOICE_ID']) {
    const value = process.env[name]
    if (value) env[name] = value
  }
  return env
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
            // エントリもハッシュ付きにして /static/assets/ 配下に出す。固定名だと
            // ブラウザ側の HTTP キャッシュ（本番ドメインでは max-age=14400）が
            // 切れるまで旧バンドルが使われ、その中に焼き込まれた旧チャンクの
            // ハッシュ経由で island の修正がデプロイ後も反映されない。
            // HTML 側は honox の <Script> が manifest からファイル名を解決する
            entryFileNames: 'static/assets/[name]-[hash].js',
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
          env: geminiDevEnv,
        },
      }),
      pages(),
      fullReload(['app/**/*.tsx', 'app/**/*.ts', 'app/**/*.css']),
    ],
  }
})
