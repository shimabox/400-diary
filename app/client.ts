import { activateAsyncStylesheets } from './lib/async-css'
import { hydrateIslands } from './lib/hydrate'
import { initSpaNavigation } from './spa-navigation'

hydrateIslands(document)
// 初回ロード時の CSS 非同期適用。SPA ナビゲーション後は
// spa-navigation.ts の navigate() 側で同等の処理を呼び出している。
activateAsyncStylesheets(document)
initSpaNavigation()
