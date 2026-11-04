// 31's answers to the common definition items (data only; logic lives in src/game).
import type { AiDefinition } from '../../game/ai-definition';

export const ROBO_AI: AiDefinition = {
  marks: [
    { mark: '名前', spoken: '名前が書いてある物', synonyms: ['名前', 'なまえ'] },
    { mark: '作りかけ', spoken: '作りかけの物', synonyms: ['作りかけ', '途中', '工作', '組み立て', '作ってある'] },
    { mark: '書き込み', spoken: '書き込みのある物', synonyms: ['書き込み', '字が書', '落書き', 'メモ'] },
    { mark: '手紙', spoken: '手紙', synonyms: ['手紙'] },
    { mark: '写真', spoken: '写真', synonyms: ['写真'] },
    { mark: '包装', spoken: '包み紙', synonyms: ['包装', '包み紙', 'お菓子の袋'] },
    { mark: '空き容器', spoken: '空き箱や空きパック', synonyms: ['空き箱', '空き缶', '空きパック', '空き容器'] },
    { mark: '紙くず', spoken: '紙くず', synonyms: ['紙くず', 'チラシ', 'くしゃくしゃ', '紙切れ'] },
    { mark: '汚れ', spoken: '汚れた物', synonyms: ['汚れ', 'ほこり', '髪の毛'] },
    { mark: '食べかす', spoken: '食べかすのついた物', synonyms: ['食べかす', '食べこぼし'] },
    { mark: '小物', spoken: '片方だけの小物', synonyms: ['小物', '片方', '片っぽ', '靴下', '手袋'] },
  ],
  natural: {
    natural: ['箱', 'かご', '袋', '付箋', 'メモ', '棚', 'ラベル', '机', 'ノート', 'ティッシュ', '掃除機'],
    keys: ['スキャナー', '判別装置', 'センサー', '持ち主本人', '説明書'],
    impossible: ['魔法', '透視', '時間を戻', '超能力'],
  },
  delegation: {
    flavor: 'ロボ（ピカリ）の台詞と、片付けの様子の描写',
    appraisal: '「ママが好きそう」「キラキラした」のような、プレイヤーが決めたあいまいな見分け方を、物の公開説明に当てはめる',
    natural: '子ども部屋に普通にある物（箱、机、ノート、ティッシュなど）は使ってよい。普通の性質だけを持つ',
    misreading: 'ロボは言葉を文字どおりに受け取りやすい。誤解は「どの物に・何をするか」の範囲に収める',
    forbidden: ['本番の部屋の中身と正解', '達成したかどうか', '点数とランク'],
  },
  appraisal: { allowed: true, subjectKinds: ['物'] },
  confirm: {
    emptyTarget: 'えっと、どの物のことですか？ {examples}みたいに教えてもらえるとうれしいです！',
    unknownMark: '{mark}って、どこを見れば分かりますか？ {examples}みたいに、見た目で分かることだとうれしいです！',
    irrelevantAppraisal: 'うーん、{mark}かどうか、ぼくにはうまく見分けられませんでした……。{examples}みたいに教えてもらえますか？',
  },
  misreadings: [
    { type: '文字どおり', example: '「持ち主に聞いて」→物本人に面談する' },
    { type: '範囲を広げすぎる', example: '「思い出のある物」→3分前に出会った空き箱も思い出' },
    { type: '覚えたことを当てはめすぎる', example: '「紙は捨てて」→手紙も紙なので捨てようとする' },
  ],
};
