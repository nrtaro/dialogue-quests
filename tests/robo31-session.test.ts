import { describe, expect, it } from 'vitest';
import { SessionStore } from '../src/server/session';
import { MockProvider } from '../src/server/ai';
import { listContents } from '../src/content/registry';
import { cleaningRobot, normalize } from '../src/content/cleaning-robot/content';
import { create, TEST_ROOM } from '../src/content/cleaning-robot';
import { heroWhisper } from '../src/content/hero-whisper';
import type { AnyContent, Provider } from '../src/game/types';

const defs: AnyContent[] = [heroWhisper as AnyContent, cleaningRobot as AnyContent];
let n = 0;
const turn = (store: SessionStore, id: string, revision: number, message: string) =>
  store.turn(id, 'owner', { requestId: `request-${String(++n).padStart(4, '0')}`, revision, message });

describe('試作コンテンツの表示制御', () => {
  it('ENABLE_PROTOTYPES=1 のときだけ掃除ロボを一覧に出す', () => {
    expect(listContents({}).map(c => c.info.id)).toEqual(['hero-whisper']);
    expect(listContents({ ENABLE_PROTOTYPES: '1' }).map(c => c.info.id)).toEqual(['hero-whisper', 'hero-trpg', 'cleaning-robot']);
  });
});

describe('掃除ロボをセッションで遊ぶ', () => {
  it('教える→本番で結末・評価・3人の講評が出る', async () => {
    const store = new SessionStore(new MockProvider(), defs);
    const s = store.create('cleaning-robot', 'owner');
    let v = await turn(store, s.id, 0, '写真や手紙は宝物箱へ');
    expect(v.state.discoveries.some(d => d.includes('覚えた方針'))).toBe(true);
    expect(v.state.inventory).toContain('宝物箱');
    expect(v.messages.at(-1)?.text).toContain('練習の部屋での扱いが変わった');
    v = await turn(store, s.id, 1, '紙くずや包装や空き容器は捨てて');
    v = await turn(store, s.id, 2, '迷ったら保留箱へ');
    v = await turn(store, s.id, 3, '本番へ行ってらっしゃい');
    expect(v.state.ending?.success).toBe(true);
    expect(v.state.ending?.title).toContain('ランクS');
    expect(v.messages.filter(m => m.text.startsWith('講評｜'))).toHaveLength(3);
    await expect(turn(store, s.id, 4, '手紙は残して')).rejects.toThrow();
    expect(store.export(s.id, 'owner').turns.map(t => t.action)).toEqual(['effect:conditional', 'effect:accepted', 'effect:conditional', 'effect:accepted']);
  });
  it('「ここまでで採点」は本番に行かずに結果を出す', async () => {
    const store = new SessionStore(new MockProvider(), defs);
    const s = store.create('cleaning-robot', 'owner');
    const v = await turn(store, s.id, 0, 'ここまでで採点');
    expect(v.state.ending?.title).toContain('ここまでで採点');
    expect(v.state.ending?.success).toBe(false);
  });
  it('不受理の案は状態を変えない', async () => {
    const store = new SessionStore(new MockProvider(), defs);
    const s = store.create('cleaning-robot', 'owner');
    const v = await turn(store, s.id, 0, 'スキャナーで大切な物を判定して');
    expect(v.state.inventory).toEqual(['棚']);
    expect(v.state.discoveries).toHaveLength(1);
  });
  it('勇者の耳元は従来どおり動く', async () => {
    const store = new SessionStore(new MockProvider(), defs);
    const s = store.create('hero-whisper', 'owner');
    const v = await turn(store, s.id, 0, '調べて');
    expect(v.state.stats[0].value).toBe('43分');
  });
  it('自由入力に未対応のAI接続では、状態を変えずにエラーにする', async () => {
    const legacy: Provider = { mode: 'mock', async propose() { throw Error('unused'); } };
    const store = new SessionStore(legacy, defs);
    const s = store.create('cleaning-robot', 'owner');
    await expect(turn(store, s.id, 0, '手紙は残して')).rejects.toThrow('未対応');
    expect(store.read(s.id, 'owner').revision).toBe(0);
  });
});

describe('AIとの境界', () => {
  it('AIへ渡す状況に、本番の部屋の中身を含めない', () => {
    const ctx = cleaningRobot.context(create());
    for (const item of TEST_ROOM) expect(ctx).not.toContain(item.name);
  });
  it('AIの平らな形式を作用案へ変換する', () => {
    expect(normalize({ kind: 'teach', when: [], unsure: true, do: 'hold', label: '迷ったら保留', uses: ['箱'], target: '' }))
      .toEqual({ kind: 'teach', when: 'unsure', do: 'hold', label: '迷ったら保留', uses: ['箱'], special_uses: [] });
    expect(normalize({ kind: 'teach', when: ['手紙'], unsure: false, do: null, label: '', uses: [], target: '' })).toEqual({ kind: 'talk' });
    expect(normalize({ kind: 'start_test', when: [], unsure: false, do: null, label: '', uses: [], target: '' })).toEqual({ kind: 'start_test' });
  });
});
