import { expect, it } from 'vitest';
import { parseProposal, OpenAIProvider, MockProvider } from '../src/server/ai';
import { heroWhisper } from '../src/content/hero-whisper';
import type { ProviderContext } from '../src/game/types';

const context = (): ProviderContext => ({ content: heroWhisper.info, situation: heroWhisper.context(heroWhisper.create()), actions: heroWhisper.available(heroWhisper.create()), history: heroWhisper.info.opening, message: '橋を調べて' });
it('AI出力の未知キー、長文、未知の行動、空台詞を拒否する', () => {
  for (const value of [{ action: 'magic', speech: '魔法' }, { action: 'talk', speech: '' }, { action: 'talk', speech: 'a'.repeat(801) }, { action: 'talk', speech: '話す', win: true }, null]) expect(() => parseProposal(value, context().actions)).toThrow();
});
it('OpenAI Responsesへ厳密スキーマ・保存無効・履歴とユーザー入力を送る', async () => {
  let payload: Record<string, unknown> = {};
  const ai = new OpenAIProvider('fake-key', 'test-model', async (_url, init) => {
    payload = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ id: 'resp_test', object: 'response', status: 'completed', model: 'test-model', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ action: 'observe', speech: '橋を確かめたい。' }) }] }], usage: { input_tokens: 100, output_tokens: 20 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  const r = await ai.propose(context());
  expect(r.proposal).toEqual({ action: 'observe', speech: '橋を確かめたい。' });
  expect(r.usage).toEqual({ input: 100, output: 20 });
  expect(payload.store).toBe(false);
  expect(payload.model).toBe('test-model');
  expect(payload.text).toMatchObject({ format: { type: 'json_schema', strict: true } });
  expect(JSON.stringify(payload.input)).toContain('橋を調べて');
});
it('APIエラー、拒否、切れたJSONを成功と扱わない', async () => {
  for (const response of [new Response('upstream secret detail', { status: 429 }), new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }), new Response(JSON.stringify({ status: 'incomplete', output: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })]) {
    const ai = new OpenAIProvider('fake-key', 'test-model', async () => response);
    await expect(ai.propose(context())).rejects.toThrow();
  }
});
it('モックは自由生成モデルと区別され、実際に入力から行動を選ぶ', async () => {
  const ai = new MockProvider();
  expect(ai.mode).toBe('mock');
  const r = await ai.propose({ ...context(), mockProposal: heroWhisper.mock(heroWhisper.create(), '橋を調べて') });
  expect(r.model).toBe('mock-rules-v1');
  expect(parseProposal(r.proposal, context().actions).action).toBe('observe');
});
