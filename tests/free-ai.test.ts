import { describe, expect, it } from 'vitest';
import { DailyBudget, nextResetUtc, QuotaExhausted } from '../src/server/quota';
import { extractJson, neuronsOf, WorkersAIProvider } from '../src/server/workers-ai';
import { SessionStore } from '../src/server/session';
import { failure } from '../src/server/http';
import { cleaningRobot } from '../src/content/cleaning-robot/content';
import { create } from '../src/content/cleaning-robot';
import type { AnyContent, InterpretContext, Provider } from '../src/game/types';

const fixed = (iso: string) => () => new Date(iso);
const ctx = (message: string): InterpretContext => ({ content: cleaningRobot.info, situation: '{}', history: [], message, interpreter: cleaningRobot.interpreter });
function reply(status: number, body: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}
const ok = (content: string, usage = { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100 }) =>
  reply(200, { success: true, result: { choices: [{ finish_reason: 'stop', message: { content } }], usage } });

describe('1日の無料枠', () => {
  it('UTCの日付が変わると使用量が戻り、戻る時刻は翌日0時UTC', () => {
    let now = '2026-11-04T23:00:00Z';
    const b = new DailyBudget(10000, 900, () => new Date(now));
    b.record(9000);
    expect(b.remaining()).toBe(1000);
    expect(b.canStart()).toBe(false);
    expect(b.resetAt()).toBe('2026-11-05T00:00:00.000Z');
    now = '2026-11-05T00:00:01Z';
    expect(b.remaining()).toBe(10000);
    expect(b.canStart()).toBe(true);
  });
  it('枠切れの知らせを受けたら、残りを0にする', () => {
    const b = new DailyBudget(10000, 900, fixed('2026-11-04T10:00:00Z'));
    b.exhaust();
    expect(b.remaining()).toBe(0);
    expect(nextResetUtc(new Date('2026-11-04T10:00:00Z'))).toBe('2026-11-05T00:00:00.000Z');
  });
});

describe('Workers AIへの接続', () => {
  it('JSONを受け取り、消費量を記録する', async () => {
    const b = new DailyBudget(10000, 900, fixed('2026-11-04T10:00:00Z'));
    const p = new WorkersAIProvider('a'.repeat(32), 'token', '@cf/google/gemma-4-26b-a4b-it', b, ok('{"kind":"talk"}'));
    const r = await p.interpret(ctx('こんにちは'));
    expect(r.proposal).toEqual({ kind: 'talk' });
    expect(10000 - b.remaining()).toBeCloseTo(neuronsOf({ input: 1000, output: 100 }), 5);
  });
  it('コード枠で包まれたJSONも読み取る', () => {
    expect(extractJson('```json\n{"kind":"talk"}\n```')).toEqual({ kind: 'talk' });
  });
  it('無料枠切れ（4006）は専用の例外にし、以後は送らない', async () => {
    let calls = 0;
    const f = (async () => { calls++; return new Response(JSON.stringify({ success: false, errors: [{ code: 4006 }] }), { status: 400 }); }) as typeof fetch;
    const b = new DailyBudget(10000, 900, fixed('2026-11-04T10:00:00Z'));
    const p = new WorkersAIProvider('a'.repeat(32), 'token', 'm', b, f);
    await expect(p.interpret(ctx('手紙は残して'))).rejects.toBeInstanceOf(QuotaExhausted);
    await expect(p.interpret(ctx('手紙は残して'))).rejects.toBeInstanceOf(QuotaExhausted);
    expect(calls).toBe(1);
  });
  it('4006のない429は一時的な回数制限：やり直し、枠切れにはしない', async () => {
    let calls = 0;
    const f = (async () => { calls++; return calls < 3 ? new Response('{}', { status: 429 }) : new Response(JSON.stringify({ result: { choices: [{ finish_reason: 'stop', message: { content: '{"kind":"talk"}' } }], usage: { prompt_tokens: 10, completion_tokens: 2, neurons: 0.5 } } }), { status: 200 }); }) as typeof fetch;
    const b = new DailyBudget(10000, 900, fixed('2026-11-04T10:00:00Z'));
    const p = new WorkersAIProvider('a'.repeat(32), 'token', 'm', b, f, [0, 0]);
    const r = await p.interpret(ctx('こんにちは'));
    expect(r.proposal).toEqual({ kind: 'talk' });
    expect(calls).toBe(3);
    expect(b.remaining()).toBeCloseTo(9999.5, 5);
  });
  it('やり直しても429なら「混み合っています」で、枠は残したまま', async () => {
    const f = (async () => new Response('{}', { status: 429 })) as typeof fetch;
    const b = new DailyBudget(10000, 900, fixed('2026-11-04T10:00:00Z'));
    const p = new WorkersAIProvider('a'.repeat(32), 'token', 'm', b, f, [0, 0]);
    await expect(p.interpret(ctx('x'))).rejects.toThrow('混み合っています');
    expect(b.remaining()).toBe(10000);
  });
  it('途中で止まった応答（length）は失敗にする', async () => {
    const f = reply(200, { result: { choices: [{ finish_reason: 'length', message: { content: '{"kind":' } }] } });
    const p = new WorkersAIProvider('a'.repeat(32), 'token', 'm', new DailyBudget(10000, 900), f);
    await expect(p.interpret(ctx('x'))).rejects.toThrow('状態は変更していません');
  });
});

describe('枠切れ時はプレイ不可にする', () => {
  const defs: AnyContent[] = [cleaningRobot as AnyContent];
  it('残りが足りなければ、新しいプレイを始めない', () => {
    const budget = new DailyBudget(10000, 900, fixed('2026-11-04T10:00:00Z'));
    budget.record(9000);
    const provider: Provider = { mode: 'workers-ai', budget, async propose() { throw Error('unused'); } };
    const store = new SessionStore(provider, defs);
    expect(() => store.create('cleaning-robot', 'owner')).toThrow(expect.objectContaining({ status: 429, code: 'ai-quota', resetAt: '2026-11-05T00:00:00.000Z' }));
  });
  it('プレイ中に切れたら、状態を変えずに枠切れを返す', async () => {
    const provider: Provider = { mode: 'workers-ai', async propose() { throw Error('unused'); }, async interpret() { throw new QuotaExhausted('2026-11-05T00:00:00.000Z'); } };
    const store = new SessionStore(provider, defs);
    const s = store.create('cleaning-robot', 'owner');
    await expect(store.turn(s.id, 'owner', { requestId: 'request-q001', revision: 0, message: '手紙は宝物箱へ' })).rejects.toMatchObject({ code: 'ai-quota' });
    expect(store.read(s.id, 'owner').revision).toBe(0);
  });
  it('APIの応答に、画面が使う code と resetAt を含める', async () => {
    const provider: Provider = { mode: 'workers-ai', budget: { canStart: () => false, resetAt: () => '2026-11-05T00:00:00.000Z' }, async propose() { throw Error('unused'); } };
    const store = new SessionStore(provider, defs);
    let caught: unknown;
    try { store.create('cleaning-robot', 'owner'); } catch (e) { caught = e; }
    const res = failure(caught);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: 'ai-quota', resetAt: '2026-11-05T00:00:00.000Z' });
  });
});

describe('確認は口語だけで返す', () => {
  it('AIとキーワードの読みが食い違ったら、勝手に決めずに確認する', () => {
    // The AI reads it as 宝物箱; the keyword reading says 捨てて. Throw-away vs keep → the robot asks.
    const ai = { kind: 'teach', when: ['手紙'], unsure: false, do: 'treasure', label: '手紙は宝物箱へ', uses: [], target: '' };
    const r = cleaningRobot.judge(create(), '手紙は捨ててもいいよ', ai);
    expect(r.judgment).toBe('confirm');
    expect(r.speech).toBe('えっと、手紙は宝物箱にしまうってことですか？ それとも、捨てちゃっていいってことですか？');
    expect(r.speech).not.toMatch(/[①②③]|\d\./);
    expect(r.state.policies.filter(p => p.source === 'player')).toHaveLength(0);
  });
  it('どちらも「捨てない」なら聞き返さず、AIの読みを使う', () => {
    const ai = { kind: 'teach', when: ['写真'], unsure: false, do: 'treasure', label: '写真は宝物箱へ', uses: [], target: '' };
    const r = cleaningRobot.judge(create(), '写真は捨てないで', ai);
    expect(r.judgment).toBe('conditional');
    expect(r.state.policies.at(-1)?.do).toBe('treasure');
  });
  it('部屋にない道具は、AIが会話と読んでもルールで不受理にする', () => {
    const r = cleaningRobot.judge(create(), 'スキャナーで大切な物を判定して', { kind: 'talk', when: [], unsure: false, do: null, label: '', uses: [], target: '' });
    expect(r.judgment).toBe('rejected');
    expect(r.speech).toContain('スキャナーって、この部屋にはないみたいです');
  });
  it('AIが言い換えた印（工作・空き箱）は既知の印に直す', () => {
    const ai = { kind: 'teach', when: ['工作'], unsure: false, do: 'keep', label: '工作は棚へ', uses: ['紙'], target: '' };
    const r = cleaningRobot.judge(create(), '作りかけの工作は棚に戻しておいて', ai);
    expect(r.judgment).toBe('accepted');
    expect(r.state.policies.at(-1)?.when).toEqual(['作りかけ']);
  });
  it('AIが思い込みの解除と誤読しても、「〇〇な物は」の基準を見立てに回す', () => {
    const r = cleaningRobot.judge(create(), 'ママが好きそうな物は宝物箱へ', { kind: 'forget', when: [], unsure: false, do: null, label: '', uses: [], target: '床の物はすべてゴミ', game_claim: false, special_uses: [] });
    expect(r.needs?.marks).toEqual(['ママが好きそう']);
  });
  it('見分け方が分からない印への確認も、番号や記号を使わない', () => {
    const ai = { kind: 'teach', when: [], unsure: false, do: 'keep', label: '', uses: [], target: '', game_claim: false, special_uses: [] };
    const r = cleaningRobot.judge(create(), 'ママのは残して', ai);
    expect(r.judgment).toBe('confirm');
    expect(r.speech).not.toMatch(/[①②③「」]/);
  });
});
