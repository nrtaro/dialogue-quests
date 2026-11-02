import { describe, it, expect } from 'vitest';
import { SessionStore } from '../src/server/session';
import type { Provider } from '../src/game/types';
import { heroWhisper } from '../src/content/hero-whisper';
import { MockProvider } from '../src/server/ai';

const provider = (action = 'observe'): Provider => ({ mode: 'mock', async propose() { return { proposal: { action, speech: 'まず様子を確かめたい。' }, model: 'test' }; } });
const input = (requestId = 'request-0001', revision = 0) => ({ requestId, revision, message: '調べてください' });

describe('サーバー正本と原子的ターン', () => {
  it('同一requestIdを再送しても一回分しか時間を消費しない', async () => {
    const store = new SessionStore(provider());
    const s = store.create('hero-whisper', 'owner');
    const a = await store.turn(s.id, 'owner', input());
    const b = await store.turn(s.id, 'owner', input());
    expect(b).toEqual(a);
    expect(b.revision).toBe(1);
    expect(b.state.stats[0].value).toBe('43分');
    expect(store.export(s.id, 'owner').turns).toHaveLength(1);
  });
  it('別IDの同時送信を拒否し、同一IDの同時再送には同じ結果を返す', async () => {
    let release!: () => void;
    const slow: Provider = { mode: 'mock', async propose() { await new Promise<void>(r => { release = r; }); return { proposal: { action: 'observe', speech: '確かめたい。' }, model: 'test' }; } };
    const store = new SessionStore(slow);
    const s = store.create('hero-whisper', 'owner');
    const first = store.turn(s.id, 'owner', input());
    const duplicate = store.turn(s.id, 'owner', input());
    await expect(store.turn(s.id, 'owner', input('request-0002'))).rejects.toThrow('処理中');
    release();
    expect(await duplicate).toEqual(await first);
  });
  it('通信失敗では履歴も状態も変わらず、同一入力を再試行できる', async () => {
    let fails = true;
    const store = new SessionStore({ mode: 'mock', async propose() { if (fails) throw Error('通信失敗'); return { proposal: { action: 'observe', speech: '見てみたい。' }, model: 'test' }; } });
    const s = store.create('hero-whisper', 'owner');
    await expect(store.turn(s.id, 'owner', input())).rejects.toThrow();
    expect(store.read(s.id, 'owner')).toEqual(s);
    fails = false;
    expect((await store.turn(s.id, 'owner', input())).revision).toBe(1);
  });
  it('所有者違い、古いrevision、同じIDの本文変更を拒否', async () => {
    const store = new SessionStore(provider());
    const s = store.create('hero-whisper', 'owner');
    expect(() => store.read(s.id, 'stranger')).toThrow();
    await store.turn(s.id, 'owner', input());
    await expect(store.turn(s.id, 'owner', input('request-0002'))).rejects.toThrow('更新');
    await expect(store.turn(s.id, 'owner', { ...input(), message: '違う本文' })).rejects.toThrow('再送');
  });
  it.each([{ action: 'invent', speech: '草を得た' }, { action: 'pick', speech: '採りたい' }, { action: 'talk', speech: '' }, { action: 'talk', speech: '話す', state: { minutes: 999 } }])('不正/前提不成立の提案を正本へ反映しない: %j', async proposal => {
    const store = new SessionStore({ mode: 'mock', async propose() { return { proposal, model: 'test' }; } });
    const s = store.create('hero-whisper', 'owner');
    await expect(store.turn(s.id, 'owner', input())).rejects.toThrow();
    expect(store.read(s.id, 'owner')).toEqual(s);
  });
  it('日没や勝敗をAI台詞から判定せず確定行動と前後状態を出力する', async () => {
    const store = new SessionStore({ mode: 'mock', async propose() { return { proposal: { action: 'talk', speech: '帰還できた気がする。' }, model: 'test', usage: { input: 20, output: 10 } }; } });
    const s = store.create('hero-whisper', 'owner');
    const a = await store.turn(s.id, 'owner', input());
    expect(a.state.ending).toBeNull();
    const log = store.export(s.id, 'owner');
    expect(log.contentId).toBe('hero-whisper');
    expect(log.turns[0].before.location).toBe('分かれ道');
    expect(log.turns[0].elapsed).toBe(0);
    expect(log.turns[0].usage).toEqual({ input: 20, output: 10 });
    expect(log).not.toHaveProperty('owner');
  });
  it('勇者の時間・負傷を持たない内部定義へ差し替えて進行・終了できる', async () => {
    const { signalContent } = await import('./support/signal-content');
    const store = new SessionStore(new MockProvider(), [signalContent]);
    const s = store.create('signal-test', 'owner');
    expect(s.info.characterName).toBe('管制官');
    expect(s.state.stats).toEqual([{ label: '通信', value: '未確認' }]);
    const a = await store.turn(s.id, 'owner', input());
    expect(a.state.ending?.success).toBe(true);
    expect(a.state.stats).toEqual([{ label: '通信', value: '確認済み' }]);
  });
  it('任せると慎重な助言で異なる経過を残せる', async () => {
    for (const [name, commands, remaining, success] of [
      ['慎重', ['周囲を調べて', '包帯で手当て', '川沿いへ', '干し肉を置こう', '周囲を調べて', '上着で覆おう', '草を採ろう', '帰ろう', '川沿いへ'], '5分', true],
      ['任せる', Array(8).fill('任せる'), '15分', true],
      ['未想定の提案と強行', ['ロープを生成して運んで', '橋へ', '追い払おう', '草を採ろう', '草を採ろう', '帰ろう', '川沿いへ'], '1分', false],
    ] as const) {
      const store = new SessionStore({ mode: 'mock', async propose(ctx) { return { proposal: heroWhisper.mock(JSON.parse(ctx.situation).state, ctx.message), model: 'mock-v1' }; } });
      let s = store.create('hero-whisper', name);
      for (const [i, message] of commands.entries()) s = await store.turn(s.id, name, { requestId: `request-${i}`, revision: s.revision, message });
      expect(s.state.ending?.success).toBe(success);
      expect(s.state.stats[0].value).toBe(remaining);
    }
  });
});
