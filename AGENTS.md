# Dialogue Quests

- Node 22+ / npm. `npm ci`, `npm run dev`, `npm run check`, `npm run test:ui`.
- 共通UI・セッション・AI接続は src/game と src/server。固有設定とルールは src/content。
- ゲームの正本はサーバー。AIは提案のみ。AIの提案は「作用案」として受け取り、コンテンツの純粋関数が受理・条件付き・確認・不受理・無視を判定してから状態を更新する（企画文書 detailed-definition.md §2）。
- プレイヤーが作った新しい仕組みは、コンテンツが定義した可変状態への作用として登録できる。固定事実・鍵リスト・勝敗条件は変更できない。
- 状態が変わる行動の描写は確定ルールから生成する。AIに成功を自己申告させない。
- 秘密は .env.local。値を出力・コミットしない。APIキーを公開変数に入れない。
- 個人ログは play-logs/ に保存。変更判断は docs/progress.md、ルールは docs/rules.md を更新。
- 一覧に登録するコンテンツは、ユーザーが承認したものに限る。試作中のコンテンツは ENABLE_PROTOTYPES=1 のときだけ表示する。テスト用定義は登録一覧へ追加しない。
- 一般公開・課金・mainへのマージは別途ユーザー判断。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
