# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

**256日記** — 256（16×16）文字の世界で綴る日記

新規プロジェクトのため、コードベースの発展に伴いビルド・テストコマンドやアーキテクチャ情報をここに追記していく。

## コマンド

- `npm run typecheck` — TypeScript 型チェック
- `npm run lint` — Biome による lint チェック
- `npm run lint:fix` — Biome による lint 自動修正
- `npm run format` — Biome による フォーマット
- `npm run build` — 型チェック + ビルド

## ルール

- コミットメッセージはなぜそれを行ったのかwhyを大事にすること
- コミットは大きくなりすぎないこと
- 意味のある塊でコミットしていくこと
- コード修正後は必ず `npm run typecheck` と `npm run lint` を実行して問題がないことを確認すること

