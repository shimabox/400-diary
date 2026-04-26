# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

**400日記** — 400（20×20）文字の世界で綴る日記

## アーキテクチャ

HonoX + Cloudflare Workers / D1 / R2。Islands Architecture で必要な部分だけハイドレーション。
詳細は `docs/architecture/` を参照。

## コマンド

- `pnpm run typecheck` — TypeScript 型チェック
- `pnpm run lint` — Biome による lint チェック
- `pnpm run lint:fix` — Biome による lint 自動修正
- `pnpm run format` — Biome による フォーマット
- `pnpm run build` — 型チェック + ビルド

## ルール

- コミットメッセージはなぜそれを行ったのかwhyを大事にすること
- コミットは大きくなりすぎないこと
- 意味のある塊でコミットしていくこと
- コード修正後は必ず `pnpm run typecheck` と `pnpm run lint` を実行して問題がないことを確認すること

### Effect の使い方

[You Might Not Need an Effect](https://ja.react.dev/learn/you-might-not-need-an-effect) の指針に従う。Effect は **外部システムとの同期** のためにある。それ以外では使わない。

- props / state から導出できる値は **render 中に計算** する（Effect で setState して同期しない）
- 重い計算は `useMemo` で、Effect ではない
- props 変化で state をリセットしたい場合は `key` の付け替え、または render 中に setState する
- イベントに応じた処理は **イベントハンドラ** に書く（Effect ではない）
- DOM の測定・書き込みなど、ペイント前に同期実行したい副作用は `useLayoutEffect`
- それでも Effect が必要なら、依存配列を最小に保ち、リアクティブでない値は ref で参照する
