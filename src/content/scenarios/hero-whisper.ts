// 勇者の耳元 (TRPG version) — scenario data only. Rules, dice, clock and ledger are the common engine.
import { defineScenario } from '../../game/trpg/content';
import type { ScenarioDefinition, SpriteRect } from '../../game/trpg/types';

const S = 'heroFairy';
const r = (x: number, y: number, w: number, h: number): SpriteRect => ({ sheet: S, x, y, w, h });
// Portrait cells on the provided sheet (1125×844).
const RIO = { cheer: r(12, 8, 205, 205), shock: r(228, 8, 186, 205), sweat: r(420, 8, 200, 205), chin: r(628, 8, 192, 205), joy: r(836, 8, 215, 205), point: r(12, 222, 210, 200), smile: r(832, 222, 160, 200) };
const FAIRY = { open: r(15, 440, 222, 182), point: r(245, 440, 195, 182), think: r(445, 440, 196, 182), wink: r(645, 440, 200, 182), wow: r(850, 440, 200, 182), calm: r(15, 630, 222, 200) };

export const heroWhisperScenario: ScenarioDefinition = {
  id: 'hero-trpg',
  title: '勇者の耳元', scenario: '日没までの帰り道',
  summary: 'あなたは勇者の耳元のナビ妖精。どんな作戦でも、ささやけば勇者が挑戦する。結果はサイコロしだい。',
  objective: '日没までに月白草を手に入れて村へ帰り、薬師に届けよう。',
  playerName: 'あなた（ナビ妖精）', heroId: 'rio',
  playerRole: '物には触れられないナビ妖精。リオの耳元で、思いついた作戦を何でもささやけます。',
  stars: 2, duration: '約5分',
  opening: {
    narration: '日没までに、村の子どもを治す月白草を持ち帰らなければならない。草は川向こうの祠にある。森の分かれ道で、若い勇者リオが足をかばって立ち止まった。',
    heroLine: { text: '妖精さん、どうしよう？ 何でも言ってみて！', emotion: 'thinking' },
  },
  goals: [
    { id: 'get-herb', label: '月白草を手に入れる', place: 'shrine' },
    { id: 'return-village', label: '村に帰り着く', requires: ['get-herb'], at: 'village', arrive: true },
    { id: 'deliver', label: '薬師に月白草を渡す', requires: ['return-village'], at: 'village' },
  ],
  clock: {
    name: '日没までの時間',
    phases: [
      { id: 'day', upTo: 0.5, label: '日はまだ高い' },
      { id: 'afternoon', upTo: 0.75, label: '日が傾いてきた' },
      { id: 'dusk', upTo: 0.9, label: '夕焼けになってきた' },
      { id: 'sunset', upTo: 1, label: '日が沈みかけている' },
    ],
    deadlineTitle: '帰り道に落ちた夕闇',
    deadlineText: '日が沈んだ。リオは安全な場所で、村の救援を待つことになった。',
    hours: 4,
    slowdown: { target: 'rio', key: '足', words: ['悪化', '痛'], factor: 1.4 },
  },
  cast: [
    { id: 'fairy', name: 'ナビ妖精', role: 'プレイヤー。物に触れられず、リオにだけ声が届く', player: true,
      portraits: { neutral: FAIRY.calm, happy: FAIRY.open, excited: FAIRY.wink, surprised: FAIRY.wow, thinking: FAIRY.think, determined: FAIRY.point } },
    { id: 'rio', name: 'リオ', role: '主人公の若い勇者。人助けが好きで、少し無茶をする',
      portraits: { neutral: RIO.smile, happy: RIO.joy, excited: RIO.cheer, nervous: RIO.sweat, surprised: RIO.shock, relieved: RIO.smile, sad: RIO.sweat, pained: RIO.sweat, thinking: RIO.chin, determined: RIO.point } },
    { id: 'beast', name: '親獣', role: '祠の前で子どもを守る大きな獣。悪者ではない' },
    { id: 'cub', name: '子獣', role: '親獣の子ども。好奇心が強い' },
    { id: 'healer', name: '薬師', role: '村で月白草を待っている' },
    { id: 'villager', name: '村人', role: '森の近くで働く人たち' },
  ],
  locations: [
    { id: 'fork', label: '森の分かれ道', background: 'forest' },
    { id: 'bridge', label: '古い吊り橋', background: 'forest' },
    { id: 'river', label: '川沿いの道', background: 'forest' },
    { id: 'riverbank-far', label: '川の向こう岸', background: 'forest' },
    { id: 'shrine-gate', label: '祠の入口', background: 'forest' },
    { id: 'shrine', label: '月白草の祠', background: 'forest' },
    { id: 'village', label: '村', background: 'village' },
  ],
  // Walking times as a share of the day (4 hours): 0.04 ≈ 10 minutes.
  routes: [
    { from: 'fork', to: 'bridge', cost: 0.03 },
    { from: 'bridge', to: 'riverbank-far', cost: 0.05 },
    { from: 'fork', to: 'river', cost: 0.04 },
    { from: 'river', to: 'riverbank-far', cost: 0.07 },
    { from: 'riverbank-far', to: 'shrine-gate', cost: 0.05 },
    { from: 'shrine-gate', to: 'shrine', cost: 0.02 },
    { from: 'fork', to: 'village', cost: 0.1 },
  ],
  obstacles: [
    { id: 'beasts', label: '祠の前の親子の獣', at: 'shrine-gate' },
    { id: 'barrier', label: '台座を守る灯の結界', at: 'shrine' },
  ],
  start: {
    location: 'fork',
    items: ['剣', '包帯', '干し肉', '上着'],
    statuses: { rio: { 足: '軽いけが（走れない）' } },
    facts: ['左に古い吊り橋、右に流れの速い川（幅20mほど）がある', '川向こうの丘に祠があり、台座に月白草が生えている', '祠の前には、子どもを守る親子の獣がいる'],
  },
  fixedFacts: [
    '月白草は川向こうの祠の台座に生えている',
    '台座の月白草は、そばの灯の光でできた結界に守られている',
    '薬師は村にいる',
    'ナビ妖精（プレイヤー）は物に触れられず、リオにだけ声が届く',
  ],
  worldRules: ['魔法の灯と結界がある、やさしいファンタジーの森', '獣は子を守ろうとしているだけで、悪者ではない'],
  sheets: { [S]: { src: '/assets/sheets/hero-fairy.webp', width: 1125, height: 844 } },
  backgrounds: { forest: '/placeholders/forest.svg', village: '/placeholders/hero-mission.svg' },
};

export const heroWhisperTrpg = defineScenario(heroWhisperScenario, {
  thumbnail: { src: '/placeholders/hero-mission.svg', alt: 'リオと小さな妖精が夕方の帰り道を進む仮イラスト' },
  background: { src: '/placeholders/forest.svg', alt: '' },
  character: { src: '/placeholders/rio.svg', alt: 'リオの仮キャラクター', position: '50% 100%' },
  player: { src: '/placeholders/fairy.svg', alt: 'ナビ妖精の仮アイコン' },
});
