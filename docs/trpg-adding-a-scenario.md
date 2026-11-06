# TRPG型のゲームを追加する手順

共通のTRPGエンジン（サイコロ・世界の時計・台帳・ゴールの検査・演出データ・プレイ画面）は、すべてのゲームで共通。新しいゲームは**シナリオの定義（データ）を1つ書き、登録一覧に1行足す**だけで遊べる。

## 1. ファイル構成

| 場所 | 内容 | ゲームごとに書くか |
|---|---|---|
| `src/game/trpg/types.ts` | シナリオ定義・状態・演出データ（beat）の型 | 書かない |
| `src/game/trpg/dice.ts` | 20面サイコロ、目の割り当ての検査と補正 | 書かない |
| `src/game/trpg/engine.ts` | 台帳、ゴールの検査、世界の時計、結末、画面用データ | 書かない |
| `src/game/trpg/prompts.ts` | AIゲームマスターへの指示（定義から自動で組み立てる）とモックGM | 書かない |
| `src/game/trpg/content.ts` | `defineScenario`：定義を遊べるゲームに変える | 書かない |
| `src/server/trpg-turn.ts` | 1手番の流れ（計画→サイコロ→結果→台帳） | 書かない |
| `src/components/trpg-stage.tsx` | プレイ画面 | 書かない |
| `src/content/scenarios/<ゲーム>.ts` | **シナリオの定義** | **書く** |
| `src/content/registry.ts` | 登録一覧 | **1行足す** |

## 2. シナリオの定義で書く項目（`ScenarioDefinition`）

| 項目 | 内容 | 例（勇者の耳元） |
|---|---|---|
| `id`・`title`・`scenario`・`summary`・`objective` | 名前と、何をすればクリアかの一文 | 日没までに月白草を手に入れて村へ帰り、薬師に届けよう |
| `playerName`・`playerRole`・`heroId` | プレイヤーの立場と主人公 | ナビ妖精／リオ |
| `stars`・`duration` | 難しさの星と時間の目安 | ★2・約5分 |
| `opening` | 最初の語りと、主人公の最初の一言 | |
| `goals` | ゴールの条件。`requires` で順序、`at` で場所を指定できる | 月白草を手に入れる → 村に帰り着く（村で） → 薬師に渡す（村で） |
| `clock` | 世界の時計（名前・時間帯の区分・締切の結末）。ないゲームは省く | 日没までの時間 |
| `cast` | 登場人物（id・名前・役割・表情ごとの絵）。プレイヤーには `player: true` | 妖精・リオ・親獣・子獣・薬師・村人 |
| `locations` | 場所（id・名前・背景） | 分かれ道・吊り橋・向こう岸・祠・村 など |
| `start` | 最初の場所・持ち物・状態・既知の出来事 | 剣・包帯・干し肉・上着 |
| `routes` | 場所どうしのつながりと、歩く時間（時計の割合）。行き先を言った手番が成功すると、ルールがこの道に沿って確実に進める（1手番で最大0.25） | 祠→村は合計0.25（約1時間） |
| `obstacles` | 道をふさぐもの。AIが「乗り越えた」と書くと解決済みになり、画面の「残っている障害」から消える | 祠の前の親子の獣、灯の結界 |
| `goals[].place` / `at` / `arrive` / `blockedBy` | `place`：ふだん達成する場所（見込みの計算と、達成時の移動に使う）。`at`：その場所でしか達成できない。`arrive`：その場所に着いたらルールだけで達成。`blockedBy`：先に解決が必要な障害 | 村に帰り着く：`at: village, arrive: true` |
| `clock.hours` / `clock.slowdown` | 時計全体が何時間か（「あと約1時間」の表示用）。状態に特定の言葉がある間、移動が遅くなる倍率 | 4時間。足に「悪化」「痛」がある間は1.4倍 |
| `fixedFacts` | AIが変えてはいけない核（最小限） | 月白草は祠の台座にあり、灯の結界に守られている |
| `worldRules` | 世界の決まり・雰囲気 | 獣は子を守っているだけで、悪者ではない |
| `sheets`・`backgrounds` | 絵の素材（スプライトシートと背景） | |
| `limits` | 文字数・安全上限（省略時は共通の値：入力120字、語り80〜140字、台詞40字、30手） | |

**絵の素材について：** 表情の絵は、スプライトシート上の四角形（x, y, 幅, 高さ）で指定する。シートを切り出す必要はない。表情は共通の10種類（trpg-presentation-data.md §4-1）。足りない表情は `neutral` で代用される。

## 3. 登録

```ts
// src/content/registry.ts
import { myScenarioGame } from './scenarios/my-scenario';
const prototypes: AnyContent[] = [heroWhisperTrpg, myScenarioGame, ...];
```

試作のうちは `prototypes`（`ENABLE_PROTOTYPES=1` のときだけ表示）に入れる。公開一覧への追加はユーザーの承認後。

## 4. 確かめ方

- **AIなしで流れを確認：** `AI_PROVIDER=mock` で、モックGMが決まった文で答える。
- **単体テスト：** `tests/trpg-engine.test.ts` の「シナリオは定義だけで追加できる」と同じ形で、小さな定義を通す。
- **無料AIで確認：** 実際に数手遊び、ゴールの達成・場所の移動・持ち物の変化が、語りと合っているかを見る。
