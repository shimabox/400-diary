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

