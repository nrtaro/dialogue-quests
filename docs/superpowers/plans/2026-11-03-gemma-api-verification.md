# Gemma API Verification Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for this approved, isolated verification spike.

**Goal:** 既存4課題をGemmaのREST APIで試し、完成状態・JSON・基本条件・時間・usageを保存する。

**Architecture:** Node標準APIだけのCLI。API資格情報は環境変数から読み、モデルと送信先を固定する。ゲーム本体と分離し、結果はGit対象外のplay-logsへ保存する。

**Tech Stack:** Node 22+、node:test、fetch。依存追加なし。

**Spec:** docs/ai-zero-cost-feasibility.md。ユーザーはLunaへの条件照会とGemma API品質・実消費の並行検証を指定。試験用コードは製品実装へ組み込まない。

## Global Constraints

- 追加支払い・プラン変更・デプロイを行わない。実行前にアカウントの無料プランを確認。
- モデルは@cf/google/gemma-4-26b-a4b-itだけ。自動再試行・モデル変更なし。
- 基本4課題を各1回から始め、結果に応じた設定比較のみ追加。1実行の最大呼び出し12回、出力上限最大2,048 tokens。
- 資格情報、APIレスポンス内の未選別メタデータ、内部推論の本文を結果に保存しない。
- APIで確認できないneurons実消費は推定と明記し、ダッシュボードの前後差が取れる場合に照合する。

## Tasks

- [x] コアの失敗テスト：非正常finish_reason、壊れたJSON、欠落usage、課題の条件違反、未選別メタデータの非漏出。
- [x] コア実装：安全な選別、JSONと基本条件の確認、neurons換算は推定値として分離。
- [x] CLI：準備確認、回数・パラメーターの固定、45秒タイムアウト、順次送信、都度の結果保存。
- [x] FreeのCurrent planを確認して実送信。前の画面に数値がなかったため、数値の前後差は未確定として記録。
- [x] 推論設定・JSONモード・お題別保護文を比較。予約見積がsystem分を含むよう補正。
- [x] 実結果を報告書へ追記。既存のブラウザー比較と混同しない。
