# ChatGPTプラン利用の検証

2026-11-03 / ユーザーの「この方向で検討、検証を進めて」に基づく限定的なローカル検証。本番の接続方式の採用や10本の実装とは分ける。

## 方式と範囲

- 現在のAPIキー方式は維持する。通常API方式へPlusの認証情報を流用せず、公式のChatGPT plan usageを別経路として検証する。
- 最初にCodex app-serverのaccount/readとmodel/listで、ログイン方式・プラン・モデル一覧だけを確認する。トークンやメールは出力しない。一覧が返るだけでは実AI成功とは扱わない。
- ゲーム専用のOAuth登録・利用許可を持つローカル検証器を別に用意し、モデル一覧と短い構造化応答を試す。既存Codexから認証トークンを抜き出して使わない。
- 認証でユーザーの操作が必要なら、動くローカルの入口を準備した上で、必要な操作だけを案内する。
- 新規許可の状態・PKCE・nonce・IDトークンの署名・発行元・宛先・期限・利用スコープを確認し、対象権限がなければ推論しない。認証情報は検証プロセス内だけに置き、報告には保存しない。
- 推論は明示的な確認ボタンから1回だけ実行。自動の繰り返し、通常API課金へのフォールバックは行わない。検証用の架空入力のみを使う。
- 成功条件は権限確認、実際のモデル一覧取得、response.completed、構造化応答の検証。速度や実ゲーム品質、複数人利用、音声文字起こしは別途評価する。

## 公式資料

- https://developers.openai.com/siwc/quickstart
- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
- https://learn.chatgpt.com/docs/app-server

実測結果は検証後に追記する。play-logs内には認証情報を含まない確認結果のみを保存する。

## 今回の結果

- Codex 0.166.0-alpha.5.1のaccount/readでChatGPT認証・Plusプランを確認。選択したブラウザーのアカウントも一致。メール・トークンは報告に含めない。
- Codexモデル一覧は8件取得。キャッシュの可能性があり、独立したゲーム用利用許可や実推論の成功ではない。結果はGit除外のplay-logs/chatgpt-account-probe.json。
- OpenAI公開のOpenID設定とJWKSへ実接続成功。RSA署名鍵4件を確認。
- ローカル検証画面をhttp://127.0.0.1:3211/へ用意し、公式の「AIデア放題！をChatGPTに接続」画面まで到達。アカウント選択後の名前入力・続行の画面で本人の操作を待つ。
- 新しい利用枠へのアクセス許可を作るため、この段階はブラウザー操作の確認ルールにより本人の確認が必要。最終許可、OAuth完了、直接のモデル一覧、AI推論はまだ未確認。
- 認証・ストリームの8テスト成功。署名・宛先・nonce・期限・改ざん・スコープ・コールバック一回性・完了前の切断やエラーを確認。正常系が未実装スタブで失敗することを確認してから実装した。
- 起動中の検証器へのHTTP確認5件成功。不正Origin、Originなし、不正CSRF、認証前の推論、無効OAuth stateを拒否。
- npm run lint成功。ゲーム本体src、依存関係、APIキー方式、公開設定、コミット・push・mergeは変更していない。
- 初期は検証画面のReferrer-PolicyによりOriginがnullになり、CSPも認証へのリダイレクトを止めた。ヘッダーを修正して公式画面への到達を確認。同一Originの確認は維持し、ブラウザーの保護は解除していない。

## 起動・確認方法

### 接続後の実測（本人による許可後）

ユーザーが接続できたと回答した後、検証画面でauthorizedとdirectPlanPermission:trueを確認。専用OAuthの許可を用いたモデル一覧8件を取得し、明示的な検証ボタンから推論を1回実行した。

- 結果：inference_completed、completedEvent:true、structuredOutputValid:true。
- 実際のモデル：gpt-6-luna。
- 応答時間：2,080ms。短い接続確認1回の値であり、ゲーム全体や講評の速度を保証する値ではない。
- 使用量：入力124、出力44、合計168トークン。ChatGPTプラン利用経路の使用量であり、通常API料金を当てはめて請求額へ換算しない。
- 応答：actionはtalk、speechは「この手紙は大切なものかもしれませんので、捨てる前に持ち主へ確認します。」。
- 通常APIキーや従量課金への自動フォールバックなし。検証後はメモリー内の認証情報を破棄した。OAuth登録と本人が与えた許可を解除した意味ではない。

これにより本人用ローカルで、Plusアカウントの許可を使った短い構造化テキスト推論は実証できた。ゲーム本体への統合、複数ターンと履歴管理、状況生成、複数人物の採点講評の品質・速度・使用量、認証の更新・再起動後の接続、音声文字起こし、5人程度の試遊・公開での利用方式は別途検証する。今回の成功を10種類の完成や常時利用可能性の確認へ拡張しない。

```powershell
node scripts/chatgpt-plan-probe.mjs --preflight
node --test scripts/chatgpt-plan-probe.test.mjs
node scripts/chatgpt-plan-probe.mjs
```

検証画面からContinue with ChatGPTを選び、OpenAI側で名前と許可を確認する。元の検証画面へ戻り、許可を確認できたら「AI応答を1回検証する」を実行。成功はinference_completed、completedEvent:true、structuredOutputValid:trueを確認する。

通常API課金への自動切替やクレジット購入はしない。トークンはメモリー内のみのため、再起動後は再認証が必要。登録ID・検証済みの主体IDとホストIDは、同じ登録の再利用用にGit除外のplay-logsへ保存。IDトークンはRS256のみを検証する限定的な実装であり、本番認証基盤へそのまま採用しない。
