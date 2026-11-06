// One turn of any TRPG scenario: plan (AI) → dice (rules) → resolution (AI) → ledger (rules).
// Shared by every scenario; nothing scenario-specific lives here.
import { isMetaClaim } from '../game/effects';
import { chanceSuccessOrBetter, normalizeBands, rollD20, shiftBands, tierOf, type Roller } from '../game/trpg/dice';
import { TIER_LABEL, type Tier } from '../game/trpg/types';
import { applyTurn, limitsOf, modifiersOf, NO_ROLL_TITLE, parsePlan, parseResolution, rollsDie, shiftOf, type Plan } from '../game/trpg/engine';
import { mockPlan, mockResolve, planPrompt, resolvePrompt } from '../game/trpg/prompts';
import type { Beat, ScenarioDefinition, TrpgState } from '../game/trpg/types';
import type { AIResult, Message, Provider } from '../game/types';

export class InputTooLong extends Error {}

/**
 * Kept by the session between tries of the same turn, so a retry after an error does not re-roll:
 * `face` stays for the whole turn (even if the message is edited); `planned` is reused for the same request.
 */
export type TurnMemo = { face?: number; planned?: { key: string; result: AIResult } };

/**
 * `onPreview` receives the first beats (the attempt and the dice) as soon as the die is rolled,
 * so the screen can show them while the story is still being written. Nothing is committed by it.
 */
export async function resolveTrpgTurn(s: ScenarioDefinition, provider: Provider, state: TrpgState, history: Message[], message: string, roll: Roller = rollD20, onPreview?: (beats: Beat[]) => void, memo: TurnMemo = {}): Promise<{ state: TrpgState; beats: Beat[]; calls: AIResult[] }> {
  const max = limitsOf(s).input;
  if ([...message].length > max) throw new InputTooLong(`${max}文字以内で送ってください。`);
  if (!provider.complete) throw Error('このAI接続はTRPGのゲームに未対応です。');
  const calls: AIResult[] = [];
  if (isMetaClaim(message)) return { ...applyTurn(s, state, { message, plan: { kind: 'claim' } }), calls };

  let planned = memo.planned?.key === message ? memo.planned.result : undefined;
  if (!planned) {
    const recent = history.slice(-6).map(m => `[${m.role}] ${m.text}`).join('\n');
    const p = planPrompt(s, state, message, recent);
    planned = await provider.complete({ purpose: 'plan', ...p, mock: mockPlan(message) });
    calls.push(planned);
    memo.planned = { key: message, result: planned };
  }
  const plan: Plan = parsePlan(s, planned.proposal, message);
  if (plan.kind !== 'attempt') return { ...applyTurn(s, state, { message, plan }), calls };

  // The rules add their own odds on top of the GM's plan (items, what you noticed, injuries, obstacles).
  const mods = modifiersOf(s, state, plan, message);
  const attemptBeat: Beat = { type: 'attempt', actor: s.heroId, summary: plan.summary, ...(plan.heroLine.text ? { line: plan.heroLine } : {}) };
  let tier: Tier, face = 0, bands = normalizeBands(plan.bands).bands;
  const auto = !rollsDie(plan, mods);
  if (auto) {
    tier = 'success';
    onPreview?.([{ type: 'player', text: message }, attemptBeat, { type: 'no-roll', action: plan.summary, reason: NO_ROLL_TITLE }, { type: 'outcome', tier, title: NO_ROLL_TITLE }]);
  } else {
    bands = shiftBands(bands, shiftOf(mods));
    face = memo.face ??= roll();
    tier = tierOf(bands, face);
    onPreview?.([
      { type: 'player', text: message },
      attemptBeat,
      { type: 'dice-bands', die: 'd20', action: plan.summary, bands, chance: { successOrBetter: chanceSuccessOrBetter(bands) }, ...(mods.length ? { mods } : {}) },
      { type: 'dice-roll', die: 'd20', face, tier, natural: face === 1 ? 'one' : face === 20 ? 'twenty' : null },
      { type: 'outcome', tier, title: TIER_LABEL[tier] },
    ]);
  }
  const r = resolvePrompt(s, state, plan.summary, tier, bands.find(b => b.tier === tier));
  const resolved = await provider.complete({ purpose: 'resolve', ...r, mock: mockResolve(plan.summary, tier) });
  calls.push(resolved);
  const resolution = parseResolution(s, resolved.proposal);
  return { ...applyTurn(s, state, { message, plan, roll: { face, tier, bands: auto ? [] : bands, mods, auto }, resolution }), calls };
}

/** Turn beats into chat-log messages (the log is shown and also sent back to the AI as history). */
export function beatsToMessages(s: ScenarioDefinition, beats: Beat[]): { speech: string; result: string; notes: Message[] } {
  const name = (id: string, fallback?: string) => s.cast.find(c => c.id === id)?.name ?? fallback ?? '誰か';
  let speech = '';
  const resultParts: string[] = [];
  const notes: Message[] = [];
  for (const b of beats) {
    if (b.type === 'attempt' && b.line) speech = b.line.text;
    else if (b.type === 'line' && b.speaker === s.heroId && !speech) speech = b.text;
    else if (b.type === 'line') notes.push({ role: 'narrator', text: `${name(b.speaker, b.name)}「${b.text}」` });
    else if (b.type === 'dice-roll') resultParts.push(`🎲${b.face}`);
    else if (b.type === 'outcome') resultParts.push(b.title);
    else if (b.type === 'narration') resultParts.push(b.text);
    else if (b.type === 'ignored') resultParts.push(b.text);
    else if (b.type === 'note') notes.push({ role: 'narrator', text: `◆ ${b.text}` });
    else if (b.type === 'change' && b.kind !== 'fact') notes.push({ role: 'narrator', text: `◆ ${b.label}` });
    else if (b.type === 'goal') notes.push({ role: 'narrator', text: `✓ ゴール達成：${b.label}` });
  }
  return { speech: speech || '……', result: resultParts.join(' ') || '……', notes };
}
