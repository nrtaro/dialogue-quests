import { describe, expect, it } from 'vitest';
import { heroWhisper } from '../src/content/hero-whisper';

describe('日没までの帰り道の因果とルール', () => {
  it('質問と未知のアイテム要求は時間・所持品を変えない', () => {
    const s = heroWhisper.create();
    expect(heroWhisper.apply(s, 'talk').state).toEqual(s);
    expect(() => heroWhisper.apply(s, 'invent_rope')).toThrow();
    expect(s.minutes).toBe(45);
    expect(s.items).toEqual(['sword', 'bandage', 'meat', 'coat']);
  });
  it('慎重な助言で40分を使い月白草を村へ持ち帰れる', () => {
    let s = heroWhisper.create();
    for (const a of ['observe', 'treat', 'river', 'feed', 'observe', 'cover', 'pick', 'leave', 'river']) s = heroWhisper.apply(s, a).state;
    expect(s.minutes).toBe(5);
    expect(s.location).toBe('village');
    expect(heroWhisper.view(s).ending?.success).toBe(true);
    expect(s.items).toContain('herb');
    expect(s.items).not.toContain('bandage');
    expect(s.items).not.toContain('meat');
    expect(s.items).not.toContain('coat');
  });
  it('未調査の橋の負傷で帰り道の移動に4分増える', () => {
    let s = heroWhisper.create();
    for (const a of ['bridge', 'wait', 'leave', 'river']) s = heroWhisper.apply(s, a).state;
    expect(s.minutes).toBe(12);
    expect(s.injury).toBe('worse');
    expect(heroWhisper.view(s).ending?.success).toBe(false);
  });
  it('結界への強行は草を取得せず7分を使い失敗後も続行できる', () => {
    let s = heroWhisper.create();
    for (const a of ['river', 'feed']) s = heroWhisper.apply(s, a).state;
    s = heroWhisper.apply(s, 'pick').state;
    expect(s.minutes).toBe(22);
    expect(s.items).not.toContain('herb');
    expect(heroWhisper.view(s).ending).toBeNull();
    for (const a of ['cover', 'pick']) s = heroWhisper.apply(s, a).state;
    expect(s.items).toContain('herb');
  });
  it('手当て・観察・草の二重取得を拒否する', () => {
    let s = heroWhisper.apply(heroWhisper.create(), 'treat').state;
    expect(() => heroWhisper.apply(s, 'treat')).toThrow();
    s = heroWhisper.apply(s, 'observe').state;
    expect(() => heroWhisper.apply(s, 'observe')).toThrow();
  });
  it('終了したセッションへの行動と日没を越える行動を処理する', () => {
    const s = { ...heroWhisper.create(), minutes: 1 };
    const end = heroWhisper.apply(s, 'river').state;
    expect(heroWhisper.view(end).ending?.success).toBe(false);
    expect(end.minutes).toBe(0);
    expect(() => heroWhisper.apply(end, 'talk')).toThrow();
  });
  it('帰着が日没ちょうどなら草がある場合だけ成功', () => {
    const base = { ...heroWhisper.create(), location: 'return' as const, minutes: 8, bridgeKnown: true };
    expect(heroWhisper.view(heroWhisper.apply({ ...base, items: [...base.items, 'herb' as const] }, 'bridge').state).ending?.success).toBe(true);
    expect(heroWhisper.view(heroWhisper.apply(base, 'bridge').state).ending?.success).toBe(false);
  });
  it('未発見の祠の解法は公開状態へ出ない', () => {
    expect(heroWhisper.view(heroWhisper.create()).discoveries).toEqual([]);
    expect(JSON.stringify(heroWhisper.view(heroWhisper.create()))).not.toContain('灯具');
  });
});
