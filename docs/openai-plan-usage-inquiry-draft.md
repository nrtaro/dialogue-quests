# OpenAIへの提供条件の確認内容（送信済み・回答待ち）

2026-11-03。ユーザー指定の連絡先で公式interest formへ問い合わせを送信し、受付完了表示を確認した。法人ではない個人開発と明記。以下の英文は準備した下書きで、実際には同じ確認事項を日本語でフォームへ送った。運営元の個別回答・提供許可はまだ得ていない。実施記録は[API検証と条件照会](gemma-api-verification.md)を参照。

## 確認先と判断に必要な回答

[公式の導入記事](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt?site_locale=en#usage-policy-and-terms)の「Usage policy and terms」に、リモートで提供するアプリのアクセス申請先がある。[概要](https://developers.openai.com/siwc/token-sharing-open-source)にもinterest formの案内がある。無料・招待制であっても、ローカル用の手順で接続できたことだけを提供許可とは扱わない。

次の構成そのものについて、書面で確認する必要がある。「各利用者が自分のPlusを接続する構成」の回答では、今回の条件は解決しない。

1. 所有者1人のPlus枠で、本人を含む合計約6人にAI機能を提供できるか。他の利用者が独自のPlus契約を持たない場合も含む。
2. 自宅などから任意の時間にアクセスする、非商用・招待制のWebゲームはアクセス申請の対象か。審査・client ID・契約・追加料金の要否。
3. Cloudflare Workersなどの管理サービスに、所有者のOAuth認証を置く方式を認めるか。ローカルまたは自己管理VMに限定されるか。
4. GPT-6 Lunaがその提供形態でも利用できるか。プレビューの変更・廃止への扱い。
5. 所有者の通常のChatGPT/Codex利用との合算範囲、アプリ別の上限、同時リクエスト、429とリセット時刻、使用量の取得方法。
6. 子供も遊べる設計について、プレイヤーの年齢・保護者同意・データ取扱いに追加条件があるか。対象年齢の下限は未確定として相談する。
7. 有料クレジットを一切使用せず、含まれる枠を超えたら停止する構成が可能か。

## 英文下書き

Subject: Eligibility question: one Plus subscriber powering an invite-only game for approximately six remote players

Hello OpenAI team,

I am developing a small, non-commercial Japanese web game, provisionally titled “AIデア放題!”. Players give text instructions to fictional characters and situations. The AI proposes character reactions and commentary; the game server validates state changes and determines goal completion.

I have a ChatGPT Plus subscription. A local proof of concept successfully used Sign in with ChatGPT, the granted plan-usage scopes, and GPT-6 Luna through the Responses API, without a conventional API key. I understand that this local result does not establish eligibility for remote distribution.

The intended deployment is an invite-only hosted application, potentially on Cloudflare Workers. Approximately six people in total, including me, would play from their own homes at times of their choosing. They would use separate game identities. They would not receive my ChatGPT login credentials or OAuth tokens. The proposed server would use my authorized subscription allowance for all six players. Other players would not be required to purchase ChatGPT subscriptions. I would not charge them. The design is intended to be understandable and enjoyable for children as well as adults; the minimum player age has not yet been finalized.

Could you confirm whether this exact arrangement is eligible for ChatGPT plan usage? In particular:

- May one subscriber's allowance cover the other invited players' game requests, or must every player authenticate with an individually eligible ChatGPT plan?
- What approval, registration, deployment restrictions, or additional contractual requirements apply to this hosted application?
- May the authorized credentials and refresh process reside on a managed host such as Cloudflare Workers, rather than a local computer or self-hosted VM?
- Would GPT-6 Luna remain available through the approved integration?
- How would plan/app quotas, concurrency, reset windows, and my separate ChatGPT/Codex activity interact? Is an account-specific usage/remaining-quota mechanism available?
- What age, consent, or data-handling requirements would apply to children using this game?
- Can the application be configured to stop at the included allowance with no paid-credit purchases or additional API charges?

Please distinguish approval for this single-subscriber arrangement from a bring-your-own-subscription integration. If it is not eligible, I would appreciate the applicable requirement or an approved alternative that does not require additional payments.

Thank you.

## 回答後の分岐

- この構成の利用を明示的に認める回答：条件を仕様に反映し、同じゲーム用課題でLunaを測定。その後にホスト認証・更新・6人のアクセス・残量による停止を検証する。
- 各プレイヤーのPlus等が必要：現在の「本人の支払いだけ」という条件を満たさない。
- API課金・上位契約が必要：追加料金0の条件を満たさない。
- 待機リスト登録のみ／回答未着：提供許可は未確定のまま。ローカル検証を6人へ公開しない。

問い合わせにトークン、認証ファイル、他のプレイヤーの個人情報、非公開の会話履歴を添付する必要はない。
