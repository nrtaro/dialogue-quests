# リポジトリ・環境設定

2026-11-02〜03確認。ローカルフォルダは空から開始。初期の本人スコープ検索は422だったが、後にブラウザーに開かれていたURLから nrtaro/dialogue-quests を照合。GitHubツールで存在・Public・mainを確認した。既存の公開範囲は変更していない。接続中のGitHubツールはpullのみでpush/admin権限なし。プラン・保護・Actions設定は未確認。GitHub側への設定変更は実施していない。

| 項目 | 推奨設定／理由 | 確認結果／操作場所・手順 |
|---|---|---|
| 名前・説明・公開範囲 | dialogue-quests（仮）／自由な対話で進める短編ミッションゲーム／Private | nrtaro/dialogue-quests はPublicを確認。設定は変更していない。Privateへ変える場合はユーザーがSettingsで別途判断。改名・再作成なし |
| 初期化 | README・Node向け.gitignore | ローカルに作成。GitHub側で空リポジトリを作る場合はREADME等を重複生成しない。既に初期化済みならその履歴へ取り込む |
| ライセンス | 配布方針が未決のため保留 | 選択・追加なし。Privateでも将来の共同作業/配布条件は別途判断 |
| ブランチ | main + feature/mission-game-demo | GitHub既定はmain。ローカル作業はfeature/mission-game-demo。mainへのマージ・pushなし |
| main保護 | force push・削除を禁止、可能ならChecks必須。他者承認は必須にしない | 未適用。SettingsからBranchesの保護設定。PrivateはPro/Team/Enterprise等に依存し、Freeで使えなくてもPRとCIで進める |
| Issues | 有効化しバグ・改善・検証を残す | GitHub設定は未確認。初期はdocs/progress.mdで共通/固有/要検証に分類。Projectsは導入しない |
| Actions | lint/typecheck/test/build、contents:read | .github/workflows/ci.ymlを作成。push後の実行と利用枠は未確認。実APIキー不要 |
| 秘密 | .env.localと配信先の環境変数を分ける | .env.exampleは空キー。GitHub Secretsは通常CIには不要。将来実APIテストをCI化するときのみ別途検討 |
| Codex | ローカル作業フォルダ・Node・依存導入を明示 | Windows / Node v24.16.0 / npm11.19.0。GitHub Secretsは自動でCodexへ渡らない前提。ネットワーク制限によりnpm取得に環境側の許可が必要だった |
| .gitignore | .env*、node_modules、.next、個人ログ | 作成済み。.env.exampleのみ例外。ログはplay-logs/へ保存 |
| AGENTS.md | 開発/検証コマンド、設計不変条件、秘密と記録先 | ルートに作成済み |
| Pages | 静的配信はAPIサーバーの代替にしない | 使用しない。Next.js Nodeサーバーを起動。一般公開は別判断 |

## GitHub接続がまだない場合

ユーザーが既存リポジトリの有無を確認し、未作成ならPrivateで作成。ローカルにGit履歴がない場合は `git init -b main`、`git switch -c feature/mission-game-demo`。既存リモートがある場合は二重に追加しない。認証済みの端末で `git remote add origin <確認したURL>`、変更を確認してコミット、作業ブランチをpushしPRを作成する。既存mainに履歴がある場合はcloneした作業ブランチへ本ソースを取り込む。無関係な履歴をforce pushしない。

## 公式根拠

- [GitHub: protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches): Privateでのプラン制限、force push/削除の保護、ステータスチェック。
- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation): Node20.9以降、Windows対応。本プロジェクトはNode22以降、検証は24。
- [OpenAI GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna): モデルID、構造化出力、料金。アカウントでの利用可否は未検証。
- [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs): Responsesのtext.formatによるJSON schema出力。

料金はモデル資料を参照。使用量はターンごとに入力/出力トークンをログへ残す。価格の固定値をゲーム内に埋め込まず、利用前に最新価格とプロジェクトの上限を確認する。
