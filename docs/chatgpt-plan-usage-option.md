# ChatGPT Plusの利用枠を使う方式の調査

2026-11-03。ユーザーはPlusを契約しており、普段の開発・会話で使うものと共用してゲームへ利用できるか質問。追加予算・認証方式の採用決定ではない。個別アカウントでの接続・利用権限・残量は未確認。

後続の本人許可による検証で、専用OAuthの利用権限と実際のモデル一覧取得、gpt-6-lunaの短い構造化応答1回を確認した。応答は2,080msで正常完了。詳細はchatgpt-plan-verification.md。「個別アカウントでの接続・利用権限は未確認」は調査開始時点の記録であり、現在はこの限定的な実証まで更新された。残量・継続利用・ゲーム本体への統合・音声等は依然として未確認。

## 確認した公式情報

- Codexによる開発はChatGPTサブスクリプションで利用できる。通常のAPIキー利用は別の課金方式。https://learn.chatgpt.com/docs/auth
- Sign in with ChatGPTのChatGPT plan usageには、オープンソース・ローカルホストのアプリから、ユーザーの許可を受けて対象のResponses APIリクエストにChatGPTのプランを使う仕組みがある。普段のChatGPT会話や他のアカウント文脈へのアクセスを付与するものではない。有料・リモートホストのアプリは別途案内されている。https://developers.openai.com/siwc/token-sharing-open-source
- この経路は利用可能モデルの確認、OAuth、ストリーミング、store:false等への対応が必要で、現在のAPIキー方式へそのまま契約を差すだけではない。https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- プレビュー制限として音声・動画入力と文字起こしAPIは対象外。採用済みの短い録音をAPIで文字起こしする機能の費用まで、この経路で賄えるとは扱わない。https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
- 利用枠・アプリ側の上限へ達する場合がある。使用状況・設定を案内する設計が必要。https://developers.openai.com/siwc/ui-ux-guidelines
- 通常のAPIクレジット付与特典の対象はPro・Businessで、Plusは対象外。上の利用枠経路とは別制度。https://developers.openai.com/api/docs/guides/chatgpt-api-credits

## 本作への適用候補

本人がローカルで遊ぶ開発・検証版については、ChatGPT plan usageで会話・状況の用意・採点講評を動かす方式を検討できる。ただし対応するモデル・機能、アカウントでの許可、品質・待ち時間は実接続で確かめる。普段の利用と枠を共用する前提なら、制限に達する場合の表示と復帰を設計する。

音声入力は、既定の文字起こしAPI方式を維持する限り別途費用が必要になりうる。サーバー・保存等の費用も別に扱う。5人程度の試遊や将来の公開について、本人の利用枠で他の利用者のプレイまで賄う構成をこの調査だけで承認済み・利用可能とは判断しない。

「共用」が普段の会話履歴やメモリーの共有を意味する場合は別の要件であり、利用枠へのログインだけでは自動で引き継がれない。必要なゲーム設定・記録は本作側で明示的に管理する。

現在は企画ヒアリング中。APIキー方式を置換したり認証を追加したりする実装は行っていない。追加費用をどこまで避けたいかと、本人用ローカル検証・少人数試遊・公開運用の範囲を区別して次の判断をする。
