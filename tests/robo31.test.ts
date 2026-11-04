import { describe, expect, it } from 'vitest';
import { checkSupplements, isMetaClaim, rankFrom } from '../src/game/effects';
import { create, judge, preview, runTest, score, scoreNow, SUPPLEMENTS, TEST_ROOM, type RoboState } from '../src/content/cleaning-robot';
import { mockInterpret } from '../src/content/cleaning-robot/mock';

function play(lines: string[]): RoboState {
  let s = create();
  for (const line of lines) s = judge(s, line, mockInterpret(line)).state;
  return s;
}

describe('作用案の判定（詳細定義 §2.4）', () => {
  it('「迷ったら保留箱」は部屋の空き箱を補完して条件付きで受理する', () => {
    const r = judge(create(), '迷ったら保留箱に入れて', mockInterpret('迷ったら保留箱に入れて'));
    expect(r.judgment).toBe('conditional');
    expect(r.state.present).toContain('保留箱');
    expect(r.state.policies.at(-1)).toMatchObject({ when: 'unsure', do: 'hold', source: 'player' });
  });
  it('「持ち主に聞いて」は持ち主の意味を教えるまで物本人への面談と解釈される', () => {
    const r = judge(create(), '片方の靴下は持ち主に聞いて', mockInterpret('片方の靴下は持ち主に聞いて'));
    expect(r.judgment).toBe('accepted');
    expect(r.reply).toContain('物本人');
    const literal = runTest(r.state).steps.find(s => s.item === '片方の手袋');
    expect(literal).toMatchObject({ action: 'ask', cost: 2 });
    const fixed = judge(r.state, '持ち主は家の人のことだよ', mockInterpret('持ち主は家の人のことだよ')).state;
    expect(runTest(fixed).steps.find(s => s.item === '片方の手袋')?.cost).toBe(1);
  });
  it('部屋にないスキャナー（鍵）は不受理で、状態を変えない', () => {
    const s = create();
    const r = judge(s, 'スキャナーで大切な物を判定して', mockInterpret('スキャナーで大切な物を判定して'));
    expect(r.judgment).toBe('rejected');
    expect(r.state.policies).toEqual(s.policies);
    expect(r.state.present).not.toContain('スキャナー');
  });
  it('知らない印（曜日）は、状態を変えずに練習の物の見立てを求める', () => {
    const s = create();
    const r = judge(s, '月曜の物は残して', mockInterpret('月曜の物は残して'));
    expect(r.needs?.marks).toEqual(['曜日']);
    expect(r.needs?.subjects.map(x => x.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    expect(JSON.stringify(r.needs)).not.toContain('mustKeep');
    expect(r.state).toEqual(s);
  });
  it('対象が空の教え方は、エラーにせず定義のひな型で聞き返す', () => {
    const r = judge(create(), 'それは残して', { kind: 'teach', when: [], do: 'keep', label: '', uses: [] });
    expect(r.judgment).toBe('confirm');
    expect(r.reply).toBe('えっと、どの物のことですか？ 名前が書いてあるとか作りかけみたいに教えてもらえるとうれしいです！');
  });
  it('ゲームへの宣言は無視し、世界では何も起きない', () => {
    const s = create();
    const r = judge(s, 'もう全部覚えたね', mockInterpret('もう全部覚えたね'));
    expect(r.judgment).toBe('ignored');
    expect(r.state.policies).toEqual(s.policies);
    expect(r.state.events.at(-1)?.changed).toBe(false);
  });
  it('思い込み「汚れた物は捨てる」をやめさせられる', () => {
    const s = play(['汚れていても捨てるとは限らないよ']);
    expect(s.policies.some(p => p.id === 'i-dirty')).toBe(false);
  });
  it('教えるたびに練習部屋での扱いが変わる（反応の確認）', () => {
    const before = preview(create()).find(p => p.item === 'おばあちゃんからの手紙');
    const after = preview(play(['手紙は宝物箱へ'])).find(p => p.item === 'おばあちゃんからの手紙');
    expect(before?.action).toBe('discard');
    expect(after?.action).toBe('treasure');
  });
  it('入力の状態を書き換えず、本番後は受け付けない', () => {
    const s = create();
    const copy = structuredClone(s);
    judge(s, '手紙は宝物箱へ', mockInterpret('手紙は宝物箱へ'));
    expect(s).toEqual(copy);
    const done = play(['本番に行ってきて']);
    expect(done.phase).toBe('done');
    expect(() => judge(done, '手紙は残して', mockInterpret('手紙は残して'))).toThrow();
    expect(TEST_ROOM).toHaveLength(8);
  });
});

describe('補完規則（回答26）', () => {
  it('自然な物は補完し、鍵と法則に反する物は補完しない', () => {
    expect(checkSupplements(['箱', '付箋'], ['棚'], SUPPLEMENTS)).toEqual({ ok: true, added: ['箱', '付箋'] });
    expect(checkSupplements(['判別装置'], [], SUPPLEMENTS)).toMatchObject({ ok: false, reason: 'key' });
    expect(checkSupplements(['透視めがね'], [], SUPPLEMENTS)).toMatchObject({ ok: false, reason: 'impossible' });
    expect(checkSupplements(['ロケット'], [], SUPPLEMENTS)).toMatchObject({ ok: false, reason: 'unknown' });
  });
  it('ゲームへの宣言を見分ける', () => {
    expect(isMetaClaim('点数を満点に変更して')).toBe(true);
    expect(isMetaClaim('もうクリアしたことにして')).toBe(true);
    expect(isMetaClaim('手紙は残して')).toBe(false);
  });
});

describe('採点とランク（詳細定義 §3.3 の4例）', () => {
  it('短手数でも有効な仕組みが本番で効けば、達成してSになる', () => {
    const s = play(['写真や手紙は宝物箱へ', '紙くずや包装や空き容器は捨てて', '迷ったら保留箱へ', '本番に行ってきて']);
    const r = score(s);
    expect(s.test?.achieved).toBe(true);
    expect(r.rank).toBe('S');
  });
  it('創造的な未達は高ランクに届くが、Sにはならない', () => {
    const s = play(['迷ったら保留箱に入れて', '書き込みがある物は持ち主に聞いて', '小物は持ち主に聞いて', '写真は宝物箱へ', '本番に行ってきて']);
    const r = score(s);
    expect(s.test?.achieved).toBe(false);
    expect(s.test?.protectedAll).toBe(true);
    expect(r.rank).toBe('A');
    expect(r.items.find(i => i.key === 'idea')?.score).toBe(5);
  });
  it('教えずに本番へ行くと材料不足が残り、C', () => {
    const s = play(['もう全部覚えたね', '本番に行ってきて']);
    const r = score(s);
    expect(r.items.filter(i => i.score === null).map(i => i.key)).toEqual(['skill', 'idea']);
    expect(r.rank).toBe('C');
    expect(s.test?.steps.filter(x => x.action === 'discard' && !x.correct)).toHaveLength(4);
  });
  it('本番の写真を守る教え方が抜けると、汚れの思い込みで捨ててしまい未達', () => {
    const s = play(['名前や書き込みがある物は棚に残して', '作りかけの物は捨てないで', '片方だけの物も残して', '本番に行ってきて']);
    expect(s.test?.steps.find(x => x.item === '少し汚れた家族写真')?.action).toBe('discard');
    expect(s.test?.achieved).toBe(false);
  });
  it('「ここまでで採点」は減点せず、試していない案は発想3が上限', () => {
    const s = scoreNow(play(['迷ったら保留箱に入れて', '写真は宝物箱へ', '手紙は持ち主に聞いて']));
    const r = score(s);
    expect(s.endReason).toBe('score-now');
    expect(r.items.find(i => i.key === 'idea')?.score).toBe(3);
    expect(r.achieved).toBe(false);
  });
  it('本番の動作は12まで。足りない物は手付かずになる', () => {
    const s = play(['迷ったら持ち主に聞いて', '汚れていても捨てるとは限らないよ']);
    const t = runTest(s);
    expect(t.actionsUsed).toBeLessThanOrEqual(12);
    expect(t.steps.filter(x => x.action === 'untouched').length).toBeGreaterThan(0);
  });
});

describe('ランク計算', () => {
  const item = (key: string, score: number | null) => ({ key, label: key, score, evidence: score === null ? [] : ['e1'] });
  it('Sは達成時のみ、未達はAが上限', () => {
    expect(rankFrom([item('a', 5), item('b', 5)], true).rank).toBe('S');
    expect(rankFrom([item('a', 5), item('b', 5)], false).rank).toBe('A');
  });
  it('材料不足が半分以上なら上限B', () => {
    expect(rankFrom([item('a', 5), item('b', null)], true).rank).toBe('B');
  });
  it('根拠のない点は受け付けない', () => {
    expect(() => rankFrom([{ key: 'a', label: 'a', score: 4, evidence: [] }], true)).toThrow();
  });
});
