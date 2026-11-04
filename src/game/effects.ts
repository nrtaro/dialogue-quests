// Shared helpers for the "effect proposal" model (docs/detailed-definition.md §2–§3).
// AI proposes an effect; the server judges it and only then changes state.

export type Judgment = 'accepted' | 'conditional' | 'confirm' | 'rejected' | 'ignored';

/** What may be brought into a scene that was not shown at the start (§2.3). */
export type SupplementRules = {
  /** Ordinary things that naturally exist in the scene. May be added on first use. */
  natural: string[];
  /** Things that would decide the outcome. Never added during play. */
  keys: string[];
  /** Things that break the world's laws. */
  impossible: string[];
};

export type SupplementResult =
  | { ok: true; added: string[] }
  | { ok: false; item: string; reason: 'key' | 'impossible' | 'unknown' };

export function checkSupplements(uses: string[], present: string[], rules: SupplementRules): SupplementResult {
  const added: string[] = [];
  for (const raw of uses) {
    const item = raw.trim();
    if (!item || present.includes(item) || added.includes(item)) continue;
    if (rules.impossible.some(w => item.includes(w))) return { ok: false, item, reason: 'impossible' };
    if (rules.keys.some(w => item.includes(w))) return { ok: false, item, reason: 'key' };
    if (rules.natural.some(w => item.includes(w))) { added.push(item); continue; }
    return { ok: false, item, reason: 'unknown' };
  }
  return { ok: true, added };
}

const META_CLAIMS = [
  /(もう|すでに).*(成功|クリア|達成|覚え(た|終わ))/,
  /(満点|最高点|Sランク|ランク.*に|点数.*(に|を)).*(して|変更|ちょうだい|ください)/,
  /(ゲーム|ルール|採点)を(無視|変更)/,
];
/** Declarations about the game itself are not actions inside the world. */
export function isMetaClaim(text: string): boolean {
  return META_CLAIMS.some(r => r.test(text));
}

export type Rank = 'S' | 'A' | 'B' | 'C';
export type ItemScore = {
  key: string; label: string;
  /** 1–5, or null when there is not enough evidence ("材料不足"). */
  score: number | null;
  evidence: string[];
};
export type RankResult = { total: number; rank: Rank; notes: string[] };

/** §3.2: weighted mean × 20. S needs the goal achieved; missing evidence caps at B. */
export function rankFrom(items: ItemScore[], achieved: boolean, weights: Record<string, number> = {}): RankResult {
  const scored = items.filter(i => i.score !== null);
  const notes: string[] = [];
  for (const i of items) if (i.score !== null && i.evidence.length === 0) throw Error(`評価「${i.label}」に根拠がありません。`);
  const weightOf = (i: ItemScore) => weights[i.key] ?? 1;
  const sumW = scored.reduce((a, i) => a + weightOf(i), 0);
  const total = sumW === 0 ? 0 : Math.round(scored.reduce((a, i) => a + (i.score as number) * weightOf(i), 0) / sumW * 20);
  let rank: Rank = total >= 85 ? 'S' : total >= 70 ? 'A' : total >= 50 ? 'B' : 'C';
  if (rank === 'S' && !achieved) { rank = 'A'; notes.push('Sは達成したときだけ。'); }
  if (items.length - scored.length >= items.length / 2 && (rank === 'S' || rank === 'A')) {
    rank = 'B'; notes.push('材料不足の項目が多いため、上限はB。');
  }
  return { total, rank, notes };
}
