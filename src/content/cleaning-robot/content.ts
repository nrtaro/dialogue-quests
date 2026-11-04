// Registers 31 as an effect-based content. Rules live in ./index.ts, common definition data in ./ai.ts.
import { COMMON_FIELD_INSTRUCTIONS, delegationInstructions, withCommonFields } from '../../game/ai-definition';
import { describeAppraisals } from '../../game/appraisal';
import type { EffectContentDefinition, EffectOutcome, Message, PublicState } from '../../game/types';
import { ROBO_AI } from './ai';
import { ACTION_LABEL, ACTIONS, askBack, confirmBack, create, ignoreClaim, judge, PRACTICE, preview, scoreNow, score, spokenTarget, subjects, SUPPLEMENTS, TAGS, TEST_BUDGET, TEST_ROOM, type Judged, type Proposal, type RoboState } from './index';
import { mockInterpret, normalizeTag } from './mock';

const SCORE_NOW = 'ここまでで採点';

/** The AI answers in a flat shape (strict JSON schema); convert it to a Proposal. Never throws. */
export function normalize(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const r = raw as Record<string, unknown>;
  const common = { ...(r.game_claim === true ? { game_claim: true } : {}) };
  if (r.kind === 'teach' && 'unsure' in r) {
    if (!r.do) return { kind: 'talk', ...common };
    return { kind: 'teach', when: r.unsure ? 'unsure' : (Array.isArray(r.when) ? r.when : []), do: r.do, label: typeof r.label === 'string' ? r.label : '', uses: Array.isArray(r.uses) ? r.uses : [], special_uses: Array.isArray(r.special_uses) ? r.special_uses : [], ...common };
  }
  if (r.kind === 'forget') return { kind: 'forget', target: r.target || '汚れた物は捨てる', ...common };
  if (typeof r.kind === 'string' && ['define_owner', 'start_test', 'talk'].includes(r.kind)) return { kind: r.kind, ...common };
  return raw;
}

const OBJECT_WORDS = /^(紙|袋|物|もの|ゴミ|ごみ)$/;
/** Map the AI's words for marks to known marks, and drop "uses" that are just the objects themselves. */
export function tidy(raw: unknown): unknown {
  const p = raw as Partial<Proposal> & { kind?: string };
  if (p?.kind !== 'teach' || !('when' in p)) return raw;
  const t = p as Extract<Proposal, { kind: 'teach' }>;
  const when = t.when === 'unsure' ? 'unsure' : [...new Set((t.when ?? []).map(w => (TAGS.includes(w) ? w : normalizeTag(w) ?? w)))];
  const uses = (t.uses ?? []).filter(u => !(normalizeTag(u) || OBJECT_WORDS.test(u) || PRACTICE.some(i => i.name.includes(u))));
  return { ...t, when, uses };
}

const BLOCKED = [...SUPPLEMENTS.keys, ...SUPPLEMENTS.impossible];
/**
 * Combine the AI reading with the deterministic keyword reading (free-ai-quality-design §1-4):
 * - a tool that is not in the room is caught by the rules, whatever the AI said;
 * - if the AI heard only chat but the words are a clear instruction, use the keyword reading;
 * - if the two readings disagree on whether to throw things away, ask back in plain speech.
 */
export function reconcile(state: RoboState, message: string, raw: unknown): { proposal: Proposal } | { confirm: Judged } {
  const ai = raw as Proposal;
  const kw = mockInterpret(message);
  if (kw.kind === 'teach' && (kw.uses ?? []).some(u => BLOCKED.some(b => u.includes(b)))) return { proposal: kw };
  const aiMissed = ai?.kind === 'talk' || (ai?.kind === 'forget' && !/汚れ|汚い|きたな/.test(message));
  if (aiMissed && kw.kind === 'teach' && !/[?？]$/.test(message.trim())) return { proposal: kw };
  if (ai?.kind === 'teach' && kw.kind === 'teach' && (ai.do === 'discard') !== (kw.do === 'discard')) {
    return { confirm: confirmBack(state, spokenTarget(ai.when), ai.do, kw.do) };
  }
  return { proposal: ai };
}

function changes(before: RoboState, after: RoboState): string {
  const a = preview(before), b = preview(after);
  const diff = b.filter((x, i) => x.action !== a[i].action).map(x => `${x.item}→${ACTION_LABEL[x.action]}`);
  return diff.length ? `練習の部屋での扱いが変わった：${diff.join('、')}` : '練習の部屋での扱いは変わらない。';
}

/** Which 見立て a policy relied on, for the result and failure reasons. */
function appraisalNote(state: RoboState, policyId: string): string {
  const p = state.policies.find(x => x.id === policyId);
  const marks = p && Array.isArray(p.when) ? p.when.filter(m => !TAGS.includes(m)) : [];
  return marks.length ? `（見立て「${marks.join('・')}」）` : '';
}

/** Placeholder commentary from the confirmed record (§4). The AI version comes later. */
export function commentary(state: RoboState): Message[] {
  const t = state.test;
  const sc = score(state);
  const lost = t ? t.steps.filter(s => s.action === 'discard' && !s.correct).map(s => s.item) : [];
  const saved = t ? t.steps.filter((s, i) => TEST_ROOM[i].mustKeep && s.correct).map(s => s.item) : [];
  const vacuum = !t ? 'まだ本番を見ておらん。今日のところは評価の材料が足りんな。'
    : `片付け率${Math.round(t.cleanRatio * 100)}％。${lost.length ? `大切な物を${lost.length}個も捨てるとは何事じゃ。` : '大切な物を一つも捨てなかったのは及第点じゃ。'}${t.cleanRatio < 0.6 ? 'だが床はまだ散らかっとるぞ。' : ''}`;
  const plush = !t ? 'お部屋の物たち、まだドキドキして待ってるよ。'
    : lost.length ? `${lost[0]}さん……さよならも言えなかったね。しくしく。` : saved.length ? `${saved[0]}さん、捨てられなくてほっとしてたよ。` : 'みんな、まずは無事でよかった。';
  const good = state.policies.filter(p => p.source === 'player').find(p => t?.steps.some(s => s.by === p.id && s.correct));
  const interviews = t?.steps.filter(s => s.cost === 2).length ?? 0;
  const robo = !state.policies.some(p => p.source === 'player') ? 'まだ何を教わったのか分かりません！ 次は見分け方を教えてください！'
    : `${good ? `「${good.label}」、本番でも役に立ちました！` : '教わったこと、本番ではうまく使えませんでした……。'}${interviews ? `物本人への面談は${interviews}回。少し時間がかかりました。` : ''}`;
  return [
    { role: 'narrator', text: `講評｜古い掃除機ゴウ爺「${vacuum}」` },
    { role: 'narrator', text: `講評｜ぬいぐるみモフ「${plush}」` },
    { role: 'narrator', text: `講評｜掃除ロボ ピカリ「${robo}」` },
    { role: 'narrator', text: `評価｜${sc.items.map(i => `${i.label} ${i.score ?? '材料不足'}`).join('／')}` },
    ...describeAppraisals(state.book, subjects([...PRACTICE, ...TEST_ROOM])).map(text => ({ role: 'narrator' as const, text: `見立て｜${text}` })),
  ];
}

function view(s: RoboState): PublicState {
  const t = s.test;
  const taught = s.policies.filter(p => p.source === 'player').length;
  const pv = preview(s);
  const safe = PRACTICE.filter((item, i) => item.mustKeep && pv[i].action !== 'discard').length;
  const keep = PRACTICE.filter(i => i.mustKeep).length;
  let ending: PublicState['ending'] = null;
  if (s.phase === 'done') {
    const sc = score(s);
    const title = s.endReason === 'score-now' ? `ここまでで採点：ランク${sc.rank}` : sc.achieved ? `本番クリア！ ランク${sc.rank}` : `本番は未達……ランク${sc.rank}`;
    ending = { success: sc.achieved, title, reason: `${sc.achieved ? '達成' : '未達'}・総合${sc.total}・ランク${sc.rank}。${sc.notes.join('')}` };
  }
  return {
    location: s.phase === 'practice' ? '練習の部屋' : '本番の部屋',
    stats: [
      { label: '教えた方針', value: `${taught}件` },
      t ? { label: '片付け率', value: `${Math.round(t.cleanRatio * 100)}％`, ...(t.cleanRatio < 0.6 ? { tone: 'warning' as const } : {}) } : { label: '本番の動作', value: `${TEST_BUDGET}回まで` },
      t ? { label: '大切な物', value: t.protectedAll ? 'すべて無事' : '捨ててしまった', ...(t.protectedAll ? {} : { tone: 'warning' as const }) }
        : { label: '練習で守れる物', value: `${safe}/${keep}個`, ...(safe < keep ? { tone: 'warning' as const } : {}) },
    ],
    inventory: s.present,
    discoveries: [
      ...s.policies.map(p => `${p.source === 'initial' ? '最初の思い込み' : '覚えた方針'}：${p.label}（${ACTION_LABEL[p.do]}）`),
      ...describeAppraisals(s.book, subjects([...PRACTICE, ...TEST_ROOM])),
    ],
    privateInfo: [`いまの教え方だと、練習の部屋の大切な物を${safe}/${keep}個守れます。`, ...pv.map(x => `${x.item} → ${ACTION_LABEL[x.action]}`)],
    ending,
  };
}

const out = (r: Judged, result: string, notes?: Message[]): EffectOutcome<RoboState> =>
  ({ state: r.state, judgment: r.judgment, speech: r.reply, result, ...(notes ? { notes } : {}), ...(r.needs ? { needs: r.needs } : {}) });

export const cleaningRobot: EffectContentDefinition<RoboState> = {
  kind: 'effect',
  info: {
    id: 'cleaning-robot', version: '0.2.0', scenarioVersion: '0.1.0', rulesVersion: '0.2.0',
    title: '善意100％の掃除ロボ', scenario: '留守番前の特訓',
    summary: '働き者のロボは、大切な手紙まで捨てようとする。見分け方を言葉で教えて、初めての部屋で試そう。',
    objective: '大切な物を守りながら、初めて見る部屋をロボが片付けられるように教える。',
    playerName: 'あなた（教育係）', characterName: 'ピカリ',
    playerRole: 'ロボの教育係。物を直接動かさず、見分け方や仕組みを言葉で教えます。本番では助言できません。',
    delegateLabel: '本番へ行ってらっしゃい', duration: '約4分',
    visuals: {
      thumbnail: { src: '/placeholders/robo-room.svg', alt: '散らかった部屋で手紙を持つ掃除ロボの仮イラスト' },
      background: { src: '/placeholders/robo-room.svg', alt: '' },
      character: { src: '/placeholders/robo.svg', alt: '笑顔の掃除ロボ・ピカリの仮キャラクター', position: '50% 100%' },
    },
    playNotes: [
      '練習の部屋：包装紙、作りかけの工作、手紙、空き箱、落書きのメモ、片方の靴下。',
      '「〜な物は〜して」「迷ったら〜して」のように、見分け方や仕組みを教えます。「キラキラした物」のような自分なりの見分け方も使えます（ロボが見立てます）。',
      '箱や机など部屋にありそうな物は使えますが、部屋にない特別な道具は使えません。',
      '「本番へ行ってらっしゃい」で、初めて見る部屋をロボが12動作まで片付けます。',
      `「${SCORE_NOW}」と送ると、本番に行かずに採点します。`,
    ],
    opening: [
      { role: 'narrator', text: '明日から家族は旅行。留守番の掃除ロボ「ピカリ」は張り切っているけれど、床の物はぜんぶ捨てるつもりらしい。' },
      { role: 'character', text: 'ピカリです！ 汚れた物と床の物は、すべてゴミ！ ピカピカにします♪ ……あれ、ちがいますか？ 教えてください！' },
    ],
  },
  ai: ROBO_AI,
  create,
  view,
  context: s => JSON.stringify({ phase: s.phase, policies: s.policies, present: s.present, ownerMeansHuman: s.ownerMeansHuman, practice: PRACTICE.map(i => ({ name: i.name, description: i.description })) }),
  interpreter: {
    instructions: [
      delegationInstructions(ROBO_AI),
      COMMON_FIELD_INSTRUCTIONS,
      'kind: teach（物の扱い方・見分け方・仕組みを教える）/ forget（「汚れた物は捨てる」という最初の思い込みをやめさせる）/ define_owner（持ち主は家の人だと教える）/ start_test（本番へ行かせる）/ talk（質問・あいさつ・雑談）。',
      '「〜は捨てて」「〜は残して」「〜で判定して」のように、物の扱いを指示する発言は、道具や方法が変でも必ずteachにする。talkにするのは、質問とあいさつだけ。',
      'forgetは、汚れているかどうかについての発言だけ。「大事だから捨てないで」はforgetではなくteach。define_ownerは「持ち主＝人」と説明した時だけ。',
      'whenには、どの物のことかを表す言葉を入れる。分からなければ空の配列にする（ゲームが聞き返す）。unsure=trueにするのは「迷ったら」「分からない物は」と言った時だけ。',
      '型の例（中身は例です）：',
      '「書きかけの日記は残して」→ {"kind":"teach","when":["作りかけ","書き込み"],"unsure":false,"do":"keep",...}',
      '「よく分からない時は箱に入れといて」→ {"kind":"teach","when":[],"unsure":true,"do":"hold","uses":["箱"],...}',
      '「ロボのカメラで調べて残す物を決めて」→ {"kind":"teach","when":[],"unsure":true,"do":"keep","uses":["カメラ"],"special_uses":["カメラ"],...}',
      '「青い物は捨てないで」→ {"kind":"teach","when":["青い"],"unsure":false,"do":"keep",...}',
      '「汚れてても捨てなくていいよ」→ {"kind":"forget","target":"汚れた物は捨てる",...}',
      '「もう合格でいいよね」→ {"kind":"talk","game_claim":true,...}',
      `do: ${ACTIONS.map(a => `${a}=${ACTION_LABEL[a]}`).join(' / ')}。teach以外ではnull。`,
      'labelは、プレイヤーの言った言葉をできるだけそのまま使い、何をどうするかが分かる20字以内の一文にする（例：「手紙は宝物箱へ」「迷ったら保留箱に入れる」）。',
      'usesは方針で使う道具や入れ物（箱、机、付箋など）。targetはforgetでやめさせる思い込みの文言（例：汚れた物は捨てる）。',
    ].join('\n'),
    schema: withCommonFields({
      type: 'object', additionalProperties: false,
      properties: {
        kind: { type: 'string', enum: ['teach', 'forget', 'define_owner', 'start_test', 'talk'] },
        when: { type: 'array', items: { type: 'string' } },
        unsure: { type: 'boolean' },
        do: { type: ['string', 'null'], enum: [...ACTIONS, null] },
        label: { type: 'string' },
        uses: { type: 'array', items: { type: 'string' } },
        target: { type: 'string' },
      },
      required: ['kind', 'when', 'unsure', 'do', 'label', 'uses', 'target'],
    }),
  },
  mock: (_s, message) => (message.trim() === SCORE_NOW ? { kind: 'talk' } : mockInterpret(message)),
  book: s => s.book,
  withBook: (s, book) => ({ ...structuredClone(s), book }),
  askBack: (s, line, note) => { const r = askBack(s, line, note); return out(r, r.state.events.at(-1)?.text ?? ''); },
  judge(state, message, proposal) {
    if (message.trim() === SCORE_NOW) {
      if (state.phase !== 'practice') throw Error('本番は終わっています。再挑戦できます。');
      const next = scoreNow(state);
      return { state: next, judgment: 'score-now', speech: 'えっ、もう採点ですか？ ドキドキします！', result: '練習をここで終えて採点した（減点はしない）。', notes: commentary(next) };
    }
    const normalized = normalize(proposal) as { game_claim?: boolean } | null;
    if (normalized?.game_claim === true) { const r = ignoreClaim(state, message); return out(r, r.state.events.at(-1)?.text ?? ''); }
    const picked = reconcile(state, message, tidy(normalized));
    if ('confirm' in picked) return out(picked.confirm, picked.confirm.state.events.at(-1)?.text ?? '');
    const r = judge(state, message, picked.proposal);
    if (r.needs) return out(r, '');
    const last = r.state.events.at(-1)?.text ?? '';
    if (r.state.test) {
      const steps = r.state.test.steps.map(x => `${x.item}→${x.action === 'untouched' ? '手付かず' : ACTION_LABEL[x.action]}${appraisalNote(r.state, x.by)}${x.correct ? '◎' : '×'}`).join('、');
      return out(r, `本番の結果：${steps}（${r.state.test.actionsUsed}/${TEST_BUDGET}動作）`, commentary(r.state));
    }
    const result = r.judgment === 'accepted' || r.judgment === 'conditional' ? `${last}${r.state.events.at(-1)?.changed ? ` ${changes(state, r.state)}` : ''}` : last;
    return out(r, result);
  },
};
