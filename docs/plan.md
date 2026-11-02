# Dialogue Quests Implementation Plan

> **For agentic workers:** superpowers:executing-plans で順次実装。ユーザー指定に従い計画承認で中断せず進める。

**Goal:** 初回依頼1〜8のローカルデモを実装し、検証と未確認事項を記録する。

**Architecture:** 共通契約と固有ルールを分離。サーバー正本にAIの提案を検証して原子的に適用。

**Tech Stack:** Next.js 16 / React 19 / TypeScript / Zod / OpenAI Responses / Vitest / Playwright。

**Spec:** docs/design.md、docs/rules.md、ユーザーの引き継ぎ資料。

## Global Constraints
- 秘密はサーバー限定。mockをAIと偽らない。未実装コンテンツ非表示。ユーザー変更を上書きしない。
- mainへのマージ・公開・課金・ライセンス選択なし。

## Review Focus
- 状態改ざん・未入手アイテム・未発見情報の露出。
- 二重送信・別ID同時送信・古いrevision。
- AI不正JSON・未知行動・拒否・タイムアウト後の再送。
- IME、長文、スマホ入力、エラー復帰。
- 異なる状態形状の定義で同一画面と終了導線が成立。

## Task 1: 純粋なコンテンツルール
Files: src/game/types.ts, src/content/hero-whisper/index.ts, src/content/registry.ts, tests/rules.test.ts。
Interfaces: ContentDefinition が create/apply/available/view/context を提供。apply(state, action) は次の状態と確定結果、view は公開状態を返す。
- [x] 成功/失敗/質問無消費/未所持道具/負傷移動をテストし失敗を確認。
- [x] ルール表どおり実装し `npm test` を通す。

## Task 2: AI境界とサーバーセッション
Files: src/server/ai.ts, src/server/session.ts, src/app/api/**, tests/session.test.ts, tests/ai.test.ts。
Interfaces: SessionStore.create(contentId, owner), turn(id, owner, {requestId, revision, message})。Provider.propose(context) が提案を返す。
- [x] 重複/競合/所有者/失敗原子性/出力検証のテストを先に実行。
- [x] cookieと入力検証、AI1回/ターン、ログ出力を実装し `npm test`。

## Task 3: 共通UIと実ブラウザ確認
Files: src/app/**, src/components/game.tsx, tests/ui/**。
- [x] 選択→概要→開始→会話→結末→再挑戦とログ、モック表示のE2Eを先に用意。
- [x] PC/390px・IME・長文・障害表示と再試行を実装、ブラウザで確認。
- [x] 内部用定義で勇者状態なしの共通UIを確認。

## Task 4: 文書・CI・提出
Files: README.md, .github/workflows/ci.yml, docs/verification.md, docs/repository-setup.md。
- [x] 三方針のプレイを比較し、lint/型/テスト/ビルド/E2E結果を保存。
- [x] 実APIはキーがある場合のみ検証、なければ安全な設定手順を提示。
- [x] 差分を確認し起動してユーザーの実プレイに渡す。
