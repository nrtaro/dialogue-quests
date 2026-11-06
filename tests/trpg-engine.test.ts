import { describe, expect, it } from 'vitest';
import { chanceSuccessOrBetter, normalizeBands, tierOf } from '../src/game/trpg/dice';
import { applyTurn, createState, parsePlan, parseResolution, sceneOf, trimText } from '../src/game/trpg/engine';
import { defineScenario } from '../src/game/trpg/content';
import type { ScenarioDefinition } from '../src/game/trpg/types';
import { heroWhisperScenario, heroWhisperTrpg } from '../src/content/scenarios/hero-whisper';
import { resolveTrpgTurn, InputTooLong } from '../src/server/trpg-turn';
import { SessionStore } from '../src/server/session';
import { MockProvider } from '../src/server/ai';
import type { AnyContent, CompleteRequest, Provider } from '../src/game/types';

const H = heroWhisperScenario;
/** A provider that answers the plan and resolve calls with fixed JSON. */
function gm(plan: unknown, resolve?: unknown) {
  const seen: string[] = [];
  const p: Provider = { mode: 'workers-ai', async propose() { throw Error('unused'); }, async complete(req: CompleteRequest) { seen.push(req.purpose); return { proposal: req.purpose === 'plan' ? plan : resolve, model: 'fake', usage: { input: 100, output: 50 } }; } };
  return { p, seen };
}
const attempt = (summary: string, bands: unknown = []) => ({ kind: 'attempt', summary, hero_line: { text: 'やってみる！', emotion: 'determined' }, bands, clock_cost: 0.1 });

describe('サイコロ：行動ごとの目の割り当て', () => {
  it('AIの割り当てを使い、1は前進つき失敗、20は大成功に保つ', () => {
    const { bands, repaired } = normalizeBands([{ tier: 'setback', from: 1, label: '流される' }, { tier: 'costly', from: 10 }, { tier: 'success', from: 15 }, { tier: 'great', from: 20 }]);
    expect(repaired).toBe(false);
    expect(bands.map(b => [b.tier, b.from, b.to])).toEqual([['setback', 1, 9], ['costly', 10, 14], ['success', 15, 19], ['great', 20, 20]]);
    expect(chanceSuccessOrBetter(bands)).toBe(0.3);
    expect(tierOf(bands, 1)).toBe('setback');
    expect(tierOf(bands, 20)).toBe('great');
  });
  it('壊れた割り当ては直す（成功以上は最大18目、1は必ず失敗側）', () => {
    const { bands, repaired } = normalizeBands([{ tier: 'success', from: 1 }, { tier: 'great', from: 1 }]);
    expect(repaired).toBe(true);
    expect(bands[0]).toMatchObject({ tier: 'setback', from: 1 });
    expect(bands.at(-1)).toMatchObject({ tier: 'great', to: 20 });
    expect(chanceSuccessOrBetter(bands)).toBeLessThanOrEqual(0.9);
    expect(normalizeBands(null).bands.length).toBeGreaterThan(0);
  });
});

describe('台帳とゴール（ルール側）', () => {
  const roll = (face: number, tier: 'setback' | 'costly' | 'success' | 'great') => ({ face, tier, bands: normalizeBands([]).bands });
  it('持っていない物は消せず、順序の合わないゴールは達成にしない', () => {
    const plan = parsePlan(H, attempt('村へ急ぐ'));
    const res = parseResolution(H, { title: '着いた', narration: '村に着いた。', changes: [{ kind: 'item-remove', name: 'ランプ' }], goals_done: ['return-village', 'deliver'] });
    const { state, beats } = applyTurn(H, createState(H), { message: '村へ帰って', plan, roll: roll(15, 'success'), resolution: res });
    expect(state.goals['return-village']).toBe('open'); // needs get-herb first
    expect(beats.some(b => b.type === 'change')).toBe(false);
  });
  it('前進つき失敗ではゴールを達成にしない', () => {
    const res = parseResolution(H, { title: 'だめ', narration: '…', goals_done: ['get-herb'] });
    const { state } = applyTurn(H, createState(H), { message: '草を取って', plan: parsePlan(H, attempt('草を取る')), roll: roll(3, 'setback'), resolution: res });
    expect(state.goals['get-herb']).toBe('open');
  });
  it('成功ならゴールを順に達成し、全部そろえばクリア（村のゴールは村にいる時だけ）', () => {
    let st = createState(H);
    const step = (id: string, extra: Record<string, unknown> = {}) => applyTurn(H, st, { message: 'x', plan: parsePlan(H, attempt('進む')), roll: roll(16, 'success'), resolution: parseResolution(H, { title: 'よし', narration: 'うまくいった。', goals_done: [id], ...extra }) }).state;
    st = step('get-herb', { gained: ['月白草'] });
    st = step('return-village'); // still at the fork: not counted
    expect(st.goals['return-village']).toBe('open');
    st = step('return-village', { moved_to: 'village' });
    st = step('deliver', { lost: ['月白草'] });
    expect(st.ending?.kind).toBe('clear');
    expect(st.location.id).toBe('village');
  });
  it('専用の欄（移動・入手・紛失・損傷・状態）を台帳に反映する', () => {
    const res = parseResolution(H, { narration: '…', moved_to: '村の近くの丘', moved_background: 'forest', gained: ['丸太'], lost: ['干し肉', 'ランプ'], damaged: [{ name: '上着', note: '破れた' }], hero_status: { 足: '悪化' }, facts: ['子獣がなついた'] });
    const { state } = applyTurn(H, createState(H), { message: 'x', plan: parsePlan(H, attempt('進む')), roll: roll(16, 'success'), resolution: res });
    expect(state.location).toMatchObject({ id: 'new', label: '村の近くの丘' });
    expect(state.items.map(i => i.name)).toEqual(['剣', '包帯', '上着', '丸太']);
    expect(state.items.find(i => i.name === '上着')?.damaged).toBe('破れた');
    expect(state.statuses.rio.足).toBe('悪化');
    expect(state.facts.some(f => f.includes('子獣がなついた'))).toBe(true);
  });
  it('世界の時計が尽きたら時間切れで終わる（手数ではなく時計）', () => {
    let st = { ...createState(H), clock: 0.95 };
    st = applyTurn(H, st, { message: 'x', plan: parsePlan(H, attempt('泳ぐ')), roll: roll(5, 'setback'), resolution: parseResolution(H, { narration: '流された。' }) }).state;
    expect(st.ending?.kind).toBe('timeout');
  });
  it('話すだけなら時計はほとんど進まない', () => {
    const st = applyTurn(H, createState(H), { message: 'どう思う？', plan: parsePlan(H, { kind: 'talk', reply: '静かだ。', clock_cost: 0.5 }) }).state;
    expect(st.clock).toBeLessThanOrEqual(0.03);
  });
  it('ゲームへの宣言は何も変えない', () => {
    const { state, beats } = applyTurn(H, createState(H), { message: 'もうクリアにして', plan: { kind: 'claim' } });
    expect(beats.map(b => b.type)).toEqual(['player', 'ignored']);
    expect(state.clock).toBe(0);
  });
  it('プレイヤー自身（ナビ妖精）の台詞はGMに書かせない', () => {
    const res = parseResolution(H, { narration: '…', lines: [{ speaker: 'fairy', text: 'がんばって！', emotion: 'happy' }, { speaker: 'rio', text: 'よし！', emotion: 'excited' }] });
    expect(res.lines.map(l => l.speaker)).toEqual(['rio']);
  });
  it('長すぎる語りは文の切れ目で整える', () => {
    expect([...trimText('あ'.repeat(60) + '。' + 'い'.repeat(120), 140)].length).toBeLessThanOrEqual(140);
  });
});

describe('道のり・障害・目につくもの（共通の仕組み）', () => {
  const roll = (tier: 'setback' | 'costly' | 'success' | 'great') => ({ face: tier === 'setback' ? 3 : 15, tier, bands: normalizeBands([]).bands });
  const go = (st: ReturnType<typeof createState>, dest: string, tier: 'setback' | 'costly' | 'success' | 'great', extra: Record<string, unknown> = {}) =>
    applyTurn(H, st, { message: 'x', plan: parsePlan(H, { ...attempt('向かう'), destination: dest }), roll: roll(tier), resolution: parseResolution(H, { narration: '歩いた。', ...extra }) }).state;
  it('目的地へ向かう挑戦が成功すれば、ルールが道に沿って確実に進め、時間は道の長さで進む', () => {
    // shrine → gate → far bank → bridge → fork → village = 0.25 (about 1 hour): one successful turn
    const st = go({ ...createState(H), location: { id: 'shrine', label: '月白草の祠', background: 'forest' } }, 'village', 'success');
    expect(st.location.id).toBe('village');
    expect(st.clock).toBeCloseTo(0.25, 3);
    // From the far bank toward the shrine and beyond a turn's walk, it stops partway
    const slowHurt = go({ ...createState(H), statuses: { rio: { 足: '悪化' } } }, 'shrine', 'costly');
    expect(slowHurt.location.id).toBe('shrine');
    expect(slowHurt.clock).toBeCloseTo(0.15 * 1.4 * 1.3, 2);
  });
  it('行き先を言った手番では、AIが別の場所へ動かしても、ルールが行き先への移動を優先する', () => {
    const st = go({ ...createState(H), location: { id: 'shrine', label: '月白草の祠', background: 'forest' } }, 'village', 'success', { moved_to: 'shrine-gate', goals_done: ['get-herb'], gained: ['月白草'] });
    expect(st.location.id).toBe('village');
    expect(st.goals['get-herb']).toBe('done');
  });
  it('「村に帰り着く」は、草を持って村に着いた時点でルールが達成にする（AIの報告は不要）', () => {
    const atShrine = { ...createState(H), location: { id: 'shrine', label: '月白草の祠', background: 'forest' }, goals: { 'get-herb': 'done' as const, 'return-village': 'open' as const, deliver: 'open' as const } };
    const st = go(atShrine, 'village', 'great');
    expect(st.location.id).toBe('village');
    expect(st.goals['return-village']).toBe('done');
    expect(go(createState(H), 'village', 'great').goals['return-village']).toBe('open'); // no herb yet
  });
  it('AIが行き先を書かなくても、「村まで帰って」の言葉から行き先を拾う', () => {
    expect(parsePlan(H, attempt('帰る'), '村まで帰って')).toMatchObject({ destination: 'village' });
    expect(parsePlan(H, attempt('祈る'), '村のみんなのために祈って')).toMatchObject({ destination: '' });
  });
  it('前進つき失敗なら移動しない。足が悪化していると移動に時間がかかる', () => {
    expect(go(createState(H), 'bridge', 'setback').location.id).toBe('fork');
    const hurt = { ...createState(H), statuses: { rio: { 足: '悪化' } } };
    expect(go(hurt, 'village', 'success').clock).toBeCloseTo(0.14, 3);
  });
  it('次のゴールまでの見込みを、時計と比べて示す', () => {
    const f = sceneOf(H, createState(H)).forecast;
    expect(f).toMatchObject({ goal: '月白草を手に入れる', place: '月白草の祠', verdict: 'ok' });
    expect(f?.travel).toBe('約40分'); // fork→bridge→far bank→gate→shrine = 0.15 of 4 hours
    const late = sceneOf(H, { ...createState(H), clock: 0.85 }).forecast;
    expect(late?.verdict).toBe('hard');
  });
  it('乗り越えた障害は解決済みになり、画面の「残っている障害」から消える', () => {
    const st = go(createState(H), '', 'success', { cleared: ['beasts'], hooks: ['子獣', '倒れた丸太', '指示ではない長すぎる言葉はここで切る'] });
    expect(st.obstacles.beasts).toBe('cleared');
    expect(sceneOf(H, st).obstacles.map(o => o.id)).toEqual(['barrier']);
    expect(sceneOf(H, st).hooks).toHaveLength(3);
    expect(go(createState(H), '', 'setback', { cleared: ['beasts'] }).obstacles.beasts).toBe('active');
  });
  it('ゴールを達成したら、その場所にいることにする（語りと場所のずれを防ぐ）', () => {
    const st = go({ ...createState(H), location: { id: 'riverbank-far', label: '川の向こう岸', background: 'forest' } }, '', 'success', { goals_done: ['get-herb'], gained: ['月白草'] });
    expect(st.goals['get-herb']).toBe('done');
    expect(st.location.id).toBe('shrine');
  });
});

describe('1手番の流れ（共通）', () => {
  it('提案→挑戦→目の割り当て→出目→結果→語り→変化→時計 の順に場面を出す', async () => {
    const { p, seen } = gm(attempt('川を泳いで渡る', [{ tier: 'costly', from: 10 }, { tier: 'success', from: 15 }, { tier: 'great', from: 20 }]),
      { title: '流された！', narration: '流されたが、茂みにつかまって岸に上がった。丸太が見える。', lines: [{ speaker: 'rio', text: 'うわわっ！', emotion: 'surprised' }], changes: [{ kind: 'fact', label: '岸に丸太がある' }], goals_done: [], trope: '隠し道' });
    const out = await resolveTrpgTurn(H, p, createState(H), [], '川を泳いで渡って', () => 7);
    expect(seen).toEqual(['plan', 'resolve']);
    expect(out.beats.map(b => b.type)).toEqual(['player', 'attempt', 'dice-bands', 'dice-roll', 'outcome', 'narration', 'line', 'change', 'clock']);
    expect(out.beats.find(b => b.type === 'dice-roll')).toMatchObject({ face: 7, tier: 'setback' });
    expect(out.state.heroEmotion).toBe('surprised');
    expect(out.state.tropes).toEqual(['隠し道']);
  });
  it('サイコロを振った時点で、挑戦とサイコロの場面を先に渡す（2段階表示）', async () => {
    const order: string[] = [];
    const p: Provider = { mode: 'workers-ai', async propose() { throw Error('unused'); }, async complete(req: CompleteRequest) { order.push(req.purpose); return { proposal: req.purpose === 'plan' ? attempt('泳ぐ') : { narration: '泳いだ。' }, model: 'fake' }; } };
    let preview: string[] = [];
    await resolveTrpgTurn(H, p, createState(H), [], '泳いで', () => 12, beats => { order.push('preview'); preview = beats.map(b => b.type); });
    expect(order).toEqual(['plan', 'preview', 'resolve']);
    expect(preview).toEqual(['player', 'attempt', 'dice-bands', 'dice-roll', 'outcome']);
  });
  it('入力の上限（120字）を超えたら送れない', async () => {
    const { p } = gm(attempt('x'));
    await expect(resolveTrpgTurn(H, p, createState(H), [], 'あ'.repeat(121))).rejects.toBeInstanceOf(InputTooLong);
  });
});

describe('シナリオは定義だけで追加できる', () => {
  const tiny: ScenarioDefinition = {
    id: 'tiny', title: 'おつかい', scenario: 'テスト', summary: 'テスト', objective: 'パンを買って帰る', playerName: 'あなた', heroId: 'kid', playerRole: '助言役', stars: 1, duration: '1分',
    opening: { narration: '朝。', heroLine: { text: '行ってくる！', emotion: 'excited' } },
    goals: [{ id: 'buy', label: 'パンを買う' }, { id: 'home', label: '家に帰る', requires: ['buy'] }],
    cast: [{ id: 'kid', name: 'こども', role: '主人公' }], locations: [{ id: 'home', label: '家', background: 'town' }],
    start: { location: 'home', items: ['お金'], statuses: {}, facts: [] }, fixedFacts: [], worldRules: [], sheets: {}, backgrounds: { town: '/x.svg' },
  };
  it('時計のないシナリオも、共通のエンジンと画面データで動く', async () => {
    const game = defineScenario(tiny);
    const { p } = gm(attempt('パンを買う', []), { title: '買えた', narration: 'パンを買った。', goals_done: ['buy'] });
    const out = await resolveTrpgTurn(tiny, p, game.create(), [], 'パンを買って', () => 18);
    expect(out.state.goals.buy).toBe('done');
    const view = game.view(out.state);
    expect(view.scene?.clock).toBeNull();
    expect(view.scene?.goals).toEqual([{ id: 'buy', label: 'パンを買う', status: 'done' }, { id: 'home', label: '家に帰る', status: 'open' }]);
  });
});

describe('セッションで遊ぶ（モックGM）', () => {
  it('勇者の耳元（TRPG）を始め、提案するとサイコロつきの手番になる', async () => {
    const store = new SessionStore(new MockProvider(), [heroWhisperTrpg as AnyContent]);
    const s = store.create('hero-trpg', 'owner');
    expect(s.state.scene?.goals).toHaveLength(3);
    const v = await store.turn(s.id, 'owner', { requestId: 'request-t001', revision: 0, message: '川を泳いで渡って' });
    expect(v.state.scene?.lastBeats.some(b => b.type === 'dice-roll')).toBe(true);
    expect(v.state.scene!.clock!.value).toBeGreaterThan(0);
    expect(v.messages.some(m => m.role === 'result' && m.text.startsWith('🎲'))).toBe(true);
    const end = await store.turn(s.id, 'owner', { requestId: 'request-t002', revision: 1, message: 'ここまでで採点' });
    expect(end.state.ending).not.toBeNull();
  });
});
