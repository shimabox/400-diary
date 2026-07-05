import { activateAsyncStylesheets } from './lib/async-css'
import { hydrateIslands } from './lib/hydrate'
import { alignScrollToEnd, initSpaNavigation } from './spa-navigation'

hydrateIslands(document)
// 初回ロード時のスクロール整列 / CSS 非同期適用。SPA ナビゲーション後は
// spa-navigation.ts の navigate() 側で同等の処理を呼び出している。
alignScrollToEnd(document)
activateAsyncStylesheets(document)
initSpaNavigation()
