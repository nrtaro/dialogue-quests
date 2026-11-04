import { describe, expect, it } from 'vitest';
import { resolveEffectTurn } from '../src/server/effect-turn';
import { acceptVerdicts, describeAppraisals, missing, relevant } from '../src/game/appraisal';
import { bareMark, checkSupplementsWithAi, classifyTarget, spokenMark } from '../src/game/ai-definition';
import type { AppraiseContext, Provider } from '../src/game/types';
import { FRUITS, fruitAi, fruitStand } from './support/appraisal-content';

/** A provider that interprets every message as the given target words, and answers 見立て with the given verdicts. */
function fake(when: string[], verdicts: (ctx: AppraiseContext) => unknown) {
  const calls = { interpret: 0, appraise: 0, lastNeed: null as AppraiseContext['need'] | null };
  const provider: Provider = {
    mode: 'workers-ai',
    async propose() { throw Error('unused'); },
    async interpret() { calls.interpret++; return { proposal: { when }, model: 'fake' }; },
    async appraise(ctx) { calls.appraise++; calls.lastNeed = ctx.need; return { proposal: verdicts(ctx), model: 'fake' }; },
  };
  return { provider, calls };
}
const sweet = (ctx: AppraiseContext) => ({ results: ctx.need.subjects.map(s => ({ mark: ctx.need.marks[0], subject: s.id, fits: s.id !== 'f3', reason: `${s.name}は${s.description.slice(0, 8)}だから` })) });

describe('見立て：定義だけで動く共通の仕組み（テスト用の最小ゲーム）', () => {
  it('知らない基準は、全対象を1回の呼び出しで見立て、記録して適用する', async () => {
    const game = fruitStand();
    const { provider, calls } = fake(['甘そうな物'], sweet);
    const r = await resolveEffectTurn(game, provider, game.create(), [], '甘そうなのをちょうだい');
    expect(calls.appraise).toBe(1);
    expect(calls.lastNeed?.marks).toEqual(['甘そう']);
    expect(calls.lastNeed?.subjects.map(s => s.id)).toEqual(['f1', 'f2', 'f3']);
    expect(r.judgment).toBe('accepted');
    expect(r.state.basket).toEqual(['りんご', 'バナナ']);
    expect(r.state.book['甘そう'].f3).toEqual({ fits: false, reason: `ぶどうは${FRUITS[2].description.slice(0, 8)}だから` });
  });
  it('同じ基準と対象の組には二度聞かず、記録した結果を使う', async () => {
    const game = fruitStand();
    const { provider, calls } = fake(['甘そう'], sweet);
    const first = await resolveEffectTurn(game, provider, game.create(), [], '甘そうなの');
    const flipped = fake(['甘そう'], ctx => ({ results: ctx.need.subjects.map(s => ({ mark: '甘そう', subject: s.id, fits: true, reason: `${s.name}は甘い` })) }));
    const second = await resolveEffectTurn(game, flipped.provider, first.state, [], 'もう一回、甘そうなの');
    expect(calls.appraise).toBe(1);
    expect(flipped.calls.appraise).toBe(0);
    expect(second.state.basket).toEqual(first.state.basket);
  });
  it('理由が対象の説明と無関係なら記録せず、定義のひな型で聞き返す', async () => {
    const game = fruitStand();
    const { provider } = fake(['甘そう'], ctx => ({ results: ctx.need.subjects.map(s => ({ mark: '甘そう', subject: s.id, fits: true, reason: 'なんとなくそう思うから' })) }));
    const r = await resolveEffectTurn(game, provider, game.create(), [], '甘そうなの');
    expect(r.judgment).toBe('confirm');
    expect(r.speech).toBe('うーん、甘そうな物かどうか、あっしには分かりかねます。赤い果物とか黄色い果物みたいに言ってくだせえ！');
    expect(r.state.book['甘そう']).toBeUndefined();
    expect(r.state.basket).toEqual([]);
  });
  it('基準が複数なら基準ごとに1回ずつ、対象はまとめて聞く', async () => {
    const game = fruitStand();
    const { provider, calls } = fake(['甘そう', '高そう'], ctx => ({ results: ctx.need.subjects.map(s => ({ mark: ctx.need.marks[0], subject: s.id, fits: true, reason: `${s.description.slice(0, 6)}から` })) }));
    const r = await resolveEffectTurn(game, provider, game.create(), [], '甘そうで高そうなの');
    expect(calls.appraise).toBe(2);
    expect(Object.keys(r.state.book)).toEqual(['甘そう', '高そう']);
  });
  it('答えが欠けた見立ても記録しない', () => {
    const need = missing({}, ['甘そう'], FRUITS)!;
    const { book, rejectedMarks } = acceptVerdicts({}, need, { results: [{ mark: '甘そう', subject: 'f1', fits: true, reason: 'りんごは真っ赤でつやつや' }] });
    expect(rejectedMarks).toEqual(['甘そう']);
    expect(book).toEqual({});
  });
  it('対象が空なら、エラーにせず定義のひな型で聞き返す', async () => {
    const game = fruitStand();
    const { provider, calls } = fake([], sweet);
    const r = await resolveEffectTurn(game, provider, game.create(), [], 'あれください');
    expect(r.judgment).toBe('confirm');
    expect(r.speech).toBe('へい、どの果物にしましょう？ 赤い果物とか黄色い果物みたいに言ってくだせえ！');
    expect(calls.appraise).toBe(0);
  });
  it('見立てを許さないゲームでは、知らない基準を聞き返す', async () => {
    const game = fruitStand(fruitAi(false));
    const { provider, calls } = fake(['甘そう'], sweet);
    const r = await resolveEffectTurn(game, provider, game.create(), [], '甘そうなの');
    expect(r.judgment).toBe('confirm');
    expect(r.speech).toBe('甘そうな物って、どう見分けりゃいいんで？ 赤い果物とか黄色い果物みたいに言ってくだせえ！');
    expect(calls.appraise).toBe(0);
  });
  it('結果画面の「見立て」表示を作る', async () => {
    const game = fruitStand();
    const { provider } = fake(['甘そう'], sweet);
    const r = await resolveEffectTurn(game, provider, game.create(), [], '甘そうなの');
    expect(describeAppraisals(r.state.book, FRUITS)[0]).toBe('「甘そう」の見立て：りんご→当てはまる（りんごは真っ赤でつやつやだから）');
  });
});

describe('共通の小さな部品', () => {
  it('基準の言い方を整える', () => {
    expect(bareMark('ママが好きそうな物')).toBe('ママが好きそう');
    expect(spokenMark('重たい物')).toBe('重たい物');
    expect(spokenMark('ママが好きそう')).toBe('ママが好きそうな物');
    expect(spokenMark('月曜')).toBe('月曜の物');
  });
  it('対象の言葉を、既知の印と見立ての基準に分ける（例外を投げない）', () => {
    expect(classifyTarget(fruitAi(), ['赤いの', 'キラキラした物', ''])).toEqual({ empty: false, known: ['赤い'], unknown: ['キラキラした'] });
    expect(classifyTarget(fruitAi(), undefined)).toEqual({ empty: true, known: [], unknown: [] });
  });
  it('理由が説明の言葉を含むかで関連を判定する', () => {
    expect(relevant('真っ赤でつやつやだから', FRUITS[0])).toBe(true);
    expect(relevant('なんとなく', FRUITS[0])).toBe(false);
  });
  it('自然な物は補完し、AIが特別と判断した物と鍵は断る', () => {
    const rules = { natural: [], keys: ['スキャナー'], impossible: ['魔法'] };
    expect(checkSupplementsWithAi(['机', 'ノート'], [], [], rules)).toEqual({ ok: true, added: ['机', 'ノート'] });
    expect(checkSupplementsWithAi(['金属探知機'], ['金属探知機'], [], rules)).toMatchObject({ ok: false, reason: 'key' });
    expect(checkSupplementsWithAi([], ['インターネット'], [], rules)).toMatchObject({ ok: false, item: 'インターネット' });
    expect(checkSupplementsWithAi(['魔法の杖'], [], [], rules)).toMatchObject({ ok: false, reason: 'impossible' });
    // The game's list of natural things wins over the AI's "special" guess.
    expect(checkSupplementsWithAi(['掃除機'], ['掃除機'], [], { ...rules, natural: ['掃除機'] })).toEqual({ ok: true, added: ['掃除機'] });
  });
});
