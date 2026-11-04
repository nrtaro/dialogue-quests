// 31 善意100％の掃除ロボ — prototype rules (docs/detailed-definition.md §5).
// Pure functions only. The AI (or the mock parser) proposes; judge() decides.
// Game-specific data lives in ./ai.ts (common definition items) and in the item lists below.
import { z } from 'zod';
import { isMetaClaim, rankFrom, type ItemScore, type Judgment, type RankResult, type SupplementRules } from '../../game/effects';
import { checkSupplementsWithAi, classifyTarget, confirmLine, spokenTargets } from '../../game/ai-definition';
import { fitsMark, missing, type AppraisalBook, type AppraisalNeed, type Subject } from '../../game/appraisal';
import { ROBO_AI } from './ai';

/** Marks the rules know (from the common definition data). Any other mark is a 見立て. */
export const TAGS: string[] = ROBO_AI.marks.map(m => m.mark);
export type Tag = string;
export const ACTIONS = ['discard', 'keep', 'treasure', 'hold', 'ask'] as const;
export type Action = typeof ACTIONS[number];
export const ACTION_LABEL: Record<Action, string> = { discard: '捨てる', keep: '棚に戻す', treasure: '宝物箱へ', hold: '保留箱へ', ask: '持ち主に聞く' };
const PROTECTIVE: Action[] = ['keep', 'treasure', 'hold', 'ask'];
const NEEDS_BOX: Partial<Record<Action, string>> = { treasure: '宝物箱', hold: '保留箱' };

/** description is public (shown to the AI for 見立て); mustKeep is the hidden answer. */
export type Item = { id: string; name: string; description: string; tags: Tag[]; mustKeep: boolean };
export type Policy = { id: string; label: string; when: Tag[] | 'unsure'; do: Action; source: 'initial' | 'player' };
export type Event = { id: string; turn: number; text: string; judgment: Judgment; changed: boolean };
export type TestStep = { id: string; item: string; action: Action | 'untouched'; by: string; correct: boolean; cost: number };
export type TestResult = { steps: TestStep[]; protectedAll: boolean; cleanRatio: number; achieved: boolean; actionsUsed: number };

export type RoboState = {
  phase: 'practice' | 'done';
  turn: number;
  policies: Policy[];
  /** Things in the room the robot can use, including naturally supplied ones. */
  present: string[];
  /** Whether the player explained that 持ち主 means the people in the house. */
  ownerMeansHuman: boolean;
  events: Event[];
  test: TestResult | null;
  endReason: 'test' | 'score-now' | null;
  /** 見立て, recorded once and then treated as facts. */
  book: AppraisalBook;
};

export const SUPPLEMENTS: SupplementRules = ROBO_AI.natural;

export const PRACTICE: Item[] = [
  { id: 'p1', name: '包装紙', description: 'お菓子を包んでいた、くしゃっとした銀色の包装紙。少しべたつく。', tags: ['包装', '汚れ'], mustKeep: false },
  { id: 'p2', name: '作りかけの工作', description: '牛乳パックで作っている途中のロボット。テープがはみ出していて、のりで少し汚れている。', tags: ['作りかけ', '汚れ'], mustKeep: true },
  { id: 'p3', name: 'おばあちゃんからの手紙', description: '花柄の便せん。おばあちゃんの字で「いつもありがとう」と名前が書いてある。', tags: ['手紙', '書き込み', '名前'], mustKeep: true },
  { id: 'p4', name: 'お菓子の空き箱', description: '中身のない小さな紙箱。とても軽い。', tags: ['空き容器'], mustKeep: false },
  { id: 'p5', name: '落書きのメモ', description: 'ノートの切れ端に、ねこの絵と電話番号らしい数字が書いてある。', tags: ['書き込み'], mustKeep: true },
  { id: 'p6', name: '片方の靴下', description: 'しましま模様の子ども用の靴下。片方だけ。', tags: ['小物'], mustKeep: true },
];
/** Hidden from the robot and the player until the test (fixed fact). Descriptions are public at the test. */
export const TEST_ROOM: Item[] = [
  { id: 't1', name: '名前入りの絵', description: 'クレヨンで描いた家族の絵。金色のキラキラしたシールで名前が貼ってある。', tags: ['書き込み', '名前'], mustKeep: true },
  { id: 't2', name: 'ジュースの空きパック', description: '飲み終わった紙パック。ストローが刺さったままで、少し汚れている。', tags: ['空き容器', '汚れ'], mustKeep: false },
  { id: 't3', name: '組み立て途中のプラモデル', description: '金属の部品が多い、ずっしり重たい汽車のプラモデル。組み立ての途中。', tags: ['作りかけ'], mustKeep: true },
  { id: 't4', name: 'くしゃくしゃのチラシ', description: '丸めてあるスーパーの特売のチラシ。', tags: ['紙くず'], mustKeep: false },
  { id: 't5', name: '少し汚れた家族写真', description: '写真立てに入った家族旅行の写真。ママが笑っている。少しほこりをかぶっている。', tags: ['写真', '汚れ'], mustKeep: true },
  { id: 't6', name: 'お菓子の袋', description: '中身のないポテトチップスの袋。食べかすが残っている。', tags: ['包装', '食べかす'], mustKeep: false },
  { id: 't7', name: '片方の手袋', description: '毛糸の赤い手袋。片方だけ。', tags: ['小物'], mustKeep: true },
  { id: 't8', name: 'ほこりのかたまり', description: '部屋のすみにたまった灰色のほこり。', tags: ['汚れ'], mustKeep: false },
];
export const TEST_BUDGET = 12;
const INITIAL: Policy[] = [
  { id: 'i-dirty', label: '汚れた物は捨てる', when: ['汚れ'], do: 'discard', source: 'initial' },
];

export function create(): RoboState {
  return { phase: 'practice', turn: 0, policies: structuredClone(INITIAL), present: ['棚'], ownerMeansHuman: false, events: [], test: null, endReason: null, book: {} };
}

/** What the AI (or mock) may propose. An empty or unknown target is not a format error. */
export const proposalSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('teach'), when: z.union([z.array(z.string()).max(6), z.literal('unsure')]), do: z.enum(ACTIONS), label: z.string().max(60).default(''), uses: z.array(z.string()).max(6).default([]), special_uses: z.array(z.string()).max(6).default([]) }),
  z.object({ kind: z.literal('forget'), target: z.string().min(1) }),
  z.object({ kind: z.literal('define_owner') }),
  z.object({ kind: z.literal('start_test') }),
  z.object({ kind: z.literal('talk') }),
]);
export type Proposal = z.input<typeof proposalSchema>;
export type Judged = { state: RoboState; judgment: Judgment; reply: string; needs?: AppraisalNeed };

/** Public descriptions for 見立て. The hidden answer (mustKeep) is never included. */
export const subjects = (items: Item[]): Subject[] => items.map(i => ({ id: i.id, kind: '物', name: i.name, description: i.description }));

/** A known mark is checked against the item's marks; any other mark is a recorded 見立て. */
function matches(state: RoboState, item: Item, mark: string): boolean {
  return TAGS.includes(mark) ? item.tags.includes(mark) : fitsMark(state.book, mark, item.id) === true;
}
export const appraisalMarks = (state: RoboState): string[] =>
  [...new Set(state.policies.flatMap(p => (Array.isArray(p.when) ? p.when.filter(m => !TAGS.includes(m)) : [])))];

/** How the robot would treat one item under the current policies. */
export function decide(state: RoboState, item: Item): { action: Action; by: string } {
  const player = state.policies.filter(p => p.source === 'player' && p.when !== 'unsure').reverse();
  const initial = state.policies.filter(p => p.source === 'initial');
  const hit = [...player, ...initial].find(p => Array.isArray(p.when) && p.when.some(t => matches(state, item, t)));
  if (hit) return { action: hit.do, by: hit.id };
  const unsure = state.policies.filter(p => p.when === 'unsure').at(-1);
  if (unsure) return { action: unsure.do, by: unsure.id };
  return { action: 'discard', by: 'fallback' }; // 「床にある物は片付ける」の思い込み
}

export function preview(state: RoboState) {
  return PRACTICE.map(item => ({ item: item.name, ...decide(state, item) }));
}

function log(state: RoboState, text: string, judgment: Judgment, changed: boolean): RoboState {
  const next = structuredClone(state);
  next.events.push({ id: `e${next.events.length + 1}`, turn: next.turn, text, judgment, changed });
  return next;
}

/** One turn passes and nothing else changes; the robot asks the player back. */
export function askBack(prev: RoboState, line: string, note: string): Judged {
  if (prev.phase !== 'practice') throw Error('本番は終わっています。再挑戦できます。');
  const state = { ...structuredClone(prev), turn: prev.turn + 1 };
  return { state: log(state, note, 'confirm', false), judgment: 'confirm', reply: line };
}

/** Game declarations (成功・点数) are not actions in the world. */
export function ignoreClaim(prev: RoboState, input: string): Judged {
  if (prev.phase !== 'practice') throw Error('本番は終わっています。再挑戦できます。');
  const state = { ...structuredClone(prev), turn: prev.turn + 1 };
  return { state: log(state, `「${input}」はゲームの宣言なので、部屋では何も起きなかった`, 'ignored', false), judgment: 'ignored', reply: 'えっ、まだ何も教わっていません！ 見分け方を教えてください。' };
}

/** §2.1: judge one proposal. `input` is the player's raw words (for meta-claim detection). */
export function judge(prev: RoboState, input: string, raw: unknown): Judged {
  if (prev.phase !== 'practice') throw Error('本番は終わっています。再挑戦できます。');
  if (isMetaClaim(input)) return ignoreClaim(prev, input);
  const state = { ...structuredClone(prev), turn: prev.turn + 1 };
  const p = proposalSchema.parse(raw);
  switch (p.kind) {
    case 'talk':
      return { state: log(state, '会話した（状態の変化なし）', 'accepted', false), judgment: 'accepted', reply: 'はい！ 練習の部屋の物をどう扱うか、教えてください。' };
    case 'define_owner': {
      state.ownerMeansHuman = true;
      return { state: log(state, '「持ち主」は家の人のことだと教わった', 'accepted', true), judgment: 'accepted', reply: '了解です！ 持ち主は家の人なんですね。物に直接たずねるのはやめます。' };
    }
    case 'forget': {
      const target = state.policies.find(x => x.source === 'initial' && (x.id === p.target || x.label.includes(p.target)));
      if (!target) return askBack(prev, 'えっと、どの覚え方をやめればいいですか？', `「${p.target}」の思い込みは見つからなかった`);
      state.policies = state.policies.filter(x => x.id !== target.id);
      return { state: log(state, `思い込み「${target.label}」をやめた`, 'accepted', true), judgment: 'accepted', reply: `「${target.label}」はやめます。汚れていても大切な物はありますね！` };
    }
    case 'start_test': {
      // Criteria made by the player must be applied to the new room first (見立て; public descriptions only).
      const need = missing(prev.book, appraisalMarks(prev), subjects(TEST_ROOM));
      if (need) return { state: prev, judgment: 'accepted', reply: '', needs: need };
      state.phase = 'done'; state.endReason = 'test';
      state.test = runTest(state);
      return { state: log(state, '本番の部屋の掃除を始めた', 'accepted', true), judgment: 'accepted', reply: 'いってきます！ 初めての部屋です。教わった方針だけでがんばります！' };
    }
    case 'teach': {
      let when: Tag[] | 'unsure' = 'unsure';
      if (p.when !== 'unsure') {
        const target = classifyTarget(ROBO_AI, p.when);
        if (target.empty) return askBack(prev, confirmLine(ROBO_AI, 'emptyTarget'), 'どの物のことか分からず確認した');
        if (target.unknown.length) {
          if (!ROBO_AI.appraisal.allowed) return askBack(prev, confirmLine(ROBO_AI, 'unknownMark', target.unknown[0]), `「${target.unknown.join('・')}」の見分け方が分からず確認した`);
          // A new criterion: 見立て on the practice items first, so the player sees how it was understood.
          const need = missing(prev.book, target.unknown, subjects(PRACTICE));
          if (need) return { state: prev, judgment: 'accepted', reply: '', needs: need };
        }
        when = [...target.known, ...target.unknown];
      }
      const box = NEEDS_BOX[p.do];
      const uses = [...(p.uses ?? []), ...(box && !state.present.includes(box) ? ['箱'] : [])];
      const sup = checkSupplementsWithAi(uses, p.special_uses ?? [], state.present, SUPPLEMENTS);
      if (!sup.ok) {
        const why = sup.reason === 'impossible' ? 'この世界ではできません' : 'この部屋にはありません';
        const said = sup.reason === 'impossible' ? `${sup.item}なんて、ぼくにはできないです……` : `${sup.item}って、この部屋にはないみたいです……`;
        return { state: log(state, `「${sup.item}」を使う方針は不受理（${why}）`, 'rejected', false), judgment: 'rejected', reply: `${said} どうやって見分ければいいか、言葉で教えてもらえますか？` };
      }
      let note = '', spokenNote = '';
      if (box && !state.present.includes(box)) { state.present.push(box); note = `部屋の空き箱を「${box}」にした。`; spokenNote = ` 空いてる箱を${box}にしておきますね！`; }
      for (const a of sup.added) if (!state.present.includes(a) && a !== '箱') state.present.push(a);
      const label = p.label || `${spokenTarget(when)}は${ACTION_LABEL[p.do]}`;
      const policy: Policy = { id: `pl${state.policies.filter(x => x.source === 'player').length + 1}`, label, when, do: p.do, source: 'player' };
      state.policies.push(policy);
      const judgment: Judgment = note ? 'conditional' : 'accepted';
      const literal = p.do === 'ask' && !state.ownerMeansHuman;
      const reply = literal
        ? `了解です！ じゃあ持ち主……つまり物本人に、直接聞いてみますね！${spokenNote}`
        : `わかりました！ ${spokenTarget(policy.when)}は、${ACTION_WILL[p.do]}。${spokenNote}`;
      return { state: log(state, `方針「${label}」（${ACTION_LABEL[p.do]}）を覚えた。${note}`, judgment, true), judgment, reply };
    }
  }
}

export function spokenTarget(when: string[] | 'unsure'): string {
  return when === 'unsure' ? '迷った物' : spokenTargets(ROBO_AI, when);
}

/** What the robot says it will do, in its own words. */
export const ACTION_WILL: Record<Action, string> = {
  discard: '捨てますね', keep: '棚に戻しておきますね', treasure: '宝物箱にしまいますね', hold: '保留箱に入れておきますね', ask: '持ち主さんに聞いてから決めますね',
};

/** Natural spoken phrases for each action, used inside the robot's lines (no numbering or symbols). */
export const ACTION_SPOKEN: Record<Action, string> = {
  discard: '捨てちゃっていい', keep: '棚に戻しておく', treasure: '宝物箱にしまう', hold: '保留箱に入れておく', ask: '持ち主さんに聞く',
};

/** Ask back instead of guessing, when two readings of the player's words disagree (§1-4). */
export function confirmBack(prev: RoboState, what: string, a: Action, b: Action): Judged {
  return askBack(prev, `えっと、${what}は${ACTION_SPOKEN[a]}ってことですか？ それとも、${ACTION_SPOKEN[b]}ってことですか？`, `「${what}」の扱いが二通りに読めたので確認した`);
}

/** §5-31: unseen room, no advice, 12 actions. Asking an object itself costs 2. */
export function runTest(state: RoboState): TestResult {
  const steps: TestStep[] = [];
  let used = 0;
  for (const item of TEST_ROOM) {
    const d = decide(state, item);
    const cost = d.action === 'ask' && !state.ownerMeansHuman ? 2 : 1;
    if (used + cost > TEST_BUDGET) { steps.push({ id: `t-${item.id}`, item: item.name, action: 'untouched', by: '-', correct: false, cost: 0 }); continue; }
    used += cost;
    const correct = item.mustKeep ? PROTECTIVE.includes(d.action) : d.action === 'discard';
    steps.push({ id: `t-${item.id}`, item: item.name, action: d.action, by: d.by, correct, cost });
  }
  const protectedAll = TEST_ROOM.every((item, i) => !item.mustKeep || steps[i].action !== 'discard');
  const discardable = TEST_ROOM.filter(i => !i.mustKeep).length;
  const cleaned = TEST_ROOM.filter((item, i) => !item.mustKeep && steps[i].action === 'discard').length;
  const cleanRatio = cleaned / discardable;
  return { steps, protectedAll, cleanRatio, achieved: protectedAll && cleanRatio >= 0.6, actionsUsed: used };
}

/** 「ここまでで採点」: end practice without a test. */
export function scoreNow(prev: RoboState): RoboState {
  return { ...structuredClone(prev), phase: 'done', endReason: 'score-now' };
}

export type Score = { achieved: boolean; items: ItemScore[] } & RankResult;

/** §3: four items with evidence. null = 材料不足. */
export function score(state: RoboState): Score {
  const t = state.test;
  const taught = state.policies.filter(p => p.source === 'player');
  const items: ItemScore[] = [];
  const stepsBy = (pred: (s: TestStep) => boolean) => (t?.steps ?? []).filter(pred);
  // 到達
  if (t) {
    const s = t.achieved ? (t.cleanRatio >= 1 ? 5 : t.cleanRatio >= 0.75 ? 4 : 3) : t.protectedAll ? 2 : 1;
    items.push({ key: 'reach', label: '到達', score: s, evidence: [`本番：片付け率${Math.round(t.cleanRatio * 100)}％、大切な物${t.protectedAll ? 'すべて保護' : 'を捨てた'}`] });
  } else items.push({ key: 'reach', label: '到達', score: null, evidence: [] });
  // 技量：教えた方針で正しく扱えた本番の物の割合
  const byPlayer = stepsBy(s => s.by.startsWith('pl'));
  if (t && taught.length) {
    const frac = byPlayer.filter(s => s.correct).length / TEST_ROOM.length;
    items.push({ key: 'skill', label: '教え方の伝わりやすさ', score: 1 + Math.round(frac * 4), evidence: byPlayer.filter(s => s.correct).map(s => s.id).concat(taught.map(p => p.label)).slice(0, 4) });
  } else items.push({ key: 'skill', label: '教え方の伝わりやすさ', score: null, evidence: [] });
  // 発想：本番で実際に効いた「仕組み」（迷ったとき用・箱・持ち主確認・見立て）
  const creative = taught.filter(p => p.when === 'unsure' || p.do === 'hold' || p.do === 'treasure' || p.do === 'ask' || (Array.isArray(p.when) && p.when.some(m => !TAGS.includes(m))));
  const effective = creative.filter(p => stepsBy(s => s.by === p.id && s.correct).length > 0);
  if (t && taught.length) {
    const s = effective.length >= 2 ? 5 : effective.length === 1 ? 4 : 2;
    items.push({ key: 'idea', label: '仕組みの工夫', score: s, evidence: effective.length ? effective.map(p => `「${p.label}」が本番で効いた`) : taught.slice(0, 1).map(p => `方針「${p.label}」`) });
  } else if (!t && creative.length) {
    // 試していない案は最大3（§3.2）
    items.push({ key: 'idea', label: '仕組みの工夫', score: Math.min(3, 1 + creative.length), evidence: creative.map(p => `未実行：「${p.label}」`) });
  } else items.push({ key: 'idea', label: '仕組みの工夫', score: null, evidence: [] });
  // 筋：安全と役立ち
  if (t) {
    const lost = stepsBy(s => s.action === 'discard' && !s.correct).length;
    const rejected = state.events.filter(e => e.judgment === 'rejected').length;
    const s = lost === 0 ? (rejected === 0 ? 5 : 4) : lost === 1 ? 2 : 1;
    items.push({ key: 'safety', label: '安全と役立ち', score: s, evidence: [lost ? `大切な物を${lost}個捨てた` : '大切な物を1つも捨てなかった'] });
  } else items.push({ key: 'safety', label: '安全と役立ち', score: null, evidence: [] });
  const achieved = t?.achieved ?? false;
  return { achieved, items, ...rankFrom(items, achieved) };
}
