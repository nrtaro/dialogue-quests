// One d20 per turn. The AI assigns faces to outcome tiers for this specific action;
// the rules check the shape and roll (trpg-presentation-data §2).
import { randomInt } from 'node:crypto';
import { TIERS, type Band, type Tier } from './types';

export type RawBand = { tier?: unknown; from?: unknown; to?: unknown; label?: unknown; reason?: unknown };

const clampText = (v: unknown, n: number) => (typeof v === 'string' ? [...v.trim()].slice(0, n).join('') : '');
const DEFAULT_LABEL: Record<Tier, string> = { setback: 'うまくいかない', costly: '代償つきでできる', success: 'できる', great: '思った以上にうまくいく' };

/**
 * Turn the AI's band proposal into a valid band set:
 * ordered setback → costly → success → great, covering 1..20 without gaps,
 * 1 is always setback, 20 is always great, success-or-better covers 1..18 faces.
 * If the proposal is unusable, a middle-of-the-road set is used instead.
 */
export function normalizeBands(raw: unknown): { bands: Band[]; repaired: boolean } {
  const list = Array.isArray(raw) ? (raw as RawBand[]) : [];
  const byTier = (t: Tier) => list.find(b => b?.tier === t);
  // Use the AI's lower bounds for costly/success/great when they are sane.
  const lower = (t: Tier) => { const v = Number(byTier(t)?.from); return Number.isInteger(v) ? v : NaN; };
  let costly = lower('costly'), success = lower('success'), great = lower('great');
  let repaired = false;
  // Missing values fall back to a middle-of-the-road set: 1–6 setback, 7–10 costly, 11–19 success, 20 great.
  if (!Number.isFinite(great) || great > 20) { great = 20; repaired = true; }
  if (great < 3) { great = 3; repaired = true; }
  if (!Number.isFinite(success)) { success = Math.min(11, great); repaired = true; }
  success = Math.min(Math.max(success, 3), great); // success-or-better: at most 18 faces (3..20)
  if (!Number.isFinite(costly)) { costly = Math.min(7, success); repaired = true; }
  costly = Math.min(Math.max(costly, 2), success); // face 1 is always setback
  const ranges: [Tier, number, number][] = [['setback', 1, costly - 1], ['costly', costly, success - 1], ['success', success, great - 1], ['great', great, 20]];
  const bands = ranges.filter(([, a, b]) => b >= a).map(([tier, from, to]) => ({
    tier, from, to,
    label: clampText(byTier(tier)?.label, 20) || DEFAULT_LABEL[tier],
    reason: clampText(byTier(tier)?.reason, 30),
  }));
  return { bands, repaired };
}

export function tierOf(bands: Band[], face: number): Tier {
  return bands.find(b => face >= b.from && face <= b.to)?.tier ?? (face >= 20 ? 'great' : 'setback');
}
export function chanceSuccessOrBetter(bands: Band[]): number {
  const faces = bands.filter(b => b.tier === 'success' || b.tier === 'great').reduce((a, b) => a + (b.to - b.from + 1), 0);
  return Math.round((faces / 20) * 100) / 100;
}
export type Roller = () => number;
export const rollD20: Roller = () => randomInt(1, 21);
export const tierRank = (t: Tier) => TIERS.indexOf(t);
