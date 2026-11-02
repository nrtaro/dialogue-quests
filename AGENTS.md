# Dialogue Quests

- Node 22+ / npm. `npm ci`, `npm run dev`, `npm run check`, `npm run test:ui`.
- 共通UI・セッション・AI接続は src/game と src/server。固有設定とルールは src/content。
- ゲームの正本はサーバー。AIは提案のみ。前提・コスト・勝敗はコンテンツの純粋関数で決定。
- 状態が変わる行動の描写は確定ルールから生成する。AIに成功を自己申告させない。
- 秘密は .env.local。値を出力・コミットしない。APIキーを公開変数に入れない。
- 個人ログは play-logs/ に保存。変更判断は docs/progress.md、ルールは docs/rules.md を更新。
- 初回の公開コンテンツは勇者の耳元のみ。テスト用定義は登録一覧へ追加しない。
- 一般公開・課金・mainへのマージは別途ユーザー判断。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
