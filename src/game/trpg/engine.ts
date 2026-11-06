// Pure rules of the common TRPG engine. The AI proposes plans and resolutions; these functions
// check them, apply them to the ledger, advance the world clock, check goals and decide endings.
import { chanceSuccessOrBetter } from './dice';
import { EMOTIONS, TIER_LABEL, type Band, type Beat, type Emotion, type Ending, type ScenarioDefinition, type SceneView, type Tier, type TrpgState } from './types';

export const DEFAULT_LIMITS = { input: 120, narration: [80, 140] as [number, number], line: 40, safetyCap: 30 };
export const limitsOf = (s: ScenarioDefinition) => ({ ...DEFAULT_LIMITS, ...(s.limits ?? {}) });
const MAX_FACTS = 24;
const CLOCK_COST = { attempt: [0.03, 0.15] as const, talk: [0, 0.03] as const };

const chars = (t: string) => [...t];
const cut = (v: unknown, n: number) => (typeof v === 'string' ? chars(v.trim()).slice(0, n).join('') : '');
/** Trim to the last sentence end within `max`; never cut in the middle when avoidable. */
export function trimText(text: string, max: number): string {
  const c = chars(text.trim());
  if (c.length <= max) return c.join('');
  const head = c.slice(0, max).join('');
  const end = Math.max(head.lastIndexOf('。'), head.lastIndexOf('！'), head.lastIndexOf('？'), head.lastIndexOf('!'));
  return end >= max * 0.5 ? head.slice(0, end + 1) : `${head.slice(0, max - 1)}…`;
}
const emotion = (v: unknown): Emotion => (EMOTIONS as readonly string[]).includes(v as string) ? (v as Emotion) : 'neutral';

export function createState(s: ScenarioDefinition): TrpgState {
  const loc = s.locations.find(l => l.id === s.start.location) ?? s.locations[0];
  return {
    turn: 0, clock: 0,
    location: { id: loc.id, label: loc.label, background: loc.background },
    items: s.start.items.map(name => ({ name })),
    statuses: structuredClone(s.start.statuses), relations: {},
    facts: [...s.start.facts],
    goals: Object.fromEntries(s.goals.map(g => [g.id, 'open' as const])),
    obstacles: Object.fromEntries((s.obstacles ?? []).map(o => [o.id, 'active' as const])),
    hooks: [],
    tropes: [], turns: [], ending: null,
    heroEmotion: s.opening.heroLine.emotion,
  };
}

export function phaseOf(s: ScenarioDefinition, clock: number) {
  const phases = s.clock?.phases ?? [];
  return phases.find(p => clock <= p.upTo) ?? phases.at(-1) ?? { id: 'none', upTo: 1, label: '' };
}
const doneCount = (st: TrpgState) => Object.values(st.goals).filter(v => v === 'done').length;
/** 苦戦: the clock has run well ahead of the goals. The world (not the hero) then offers an opportunity. */
export function needsAssist(s: ScenarioDefinition, st: TrpgState): boolean {
  if (!s.clock) return false;
  return st.clock - doneCount(st) / s.goals.length > 0.35;
}

/* ---------- Routes, travel and the forecast ---------- */

/** The known location the hero is at (or next to, for an invented place). */
export const hereOf = (st: TrpgState) => (st.location.id === 'new' ? st.location.near ?? '' : st.location.id);

/** Cheapest way between two known locations along the scenario's routes (both directions). */
export function shortestPath(s: ScenarioDefinition, from: string, to: string): { cost: number; path: string[] } | null {
  if (from === to) return { cost: 0, path: [from] };
  const routes = s.routes ?? [];
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const open = new Set([from]);
  while (open.size) {
    const cur = [...open].reduce((a, b) => ((dist.get(a) ?? Infinity) <= (dist.get(b) ?? Infinity) ? a : b));
    open.delete(cur);
    if (cur === to) break;
    for (const r of routes) {
      const next = r.from === cur ? r.to : r.to === cur ? r.from : null;
      if (!next) continue;
      const d = (dist.get(cur) ?? Infinity) + r.cost;
      if (d < (dist.get(next) ?? Infinity)) { dist.set(next, d); prev.set(next, cur); open.add(next); }
    }
  }
  if (!dist.has(to)) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0]) as string);
  return { cost: Math.round((dist.get(to) as number) * 1000) / 1000, path };
}

/** Travel is slower while e.g. the hero's leg is hurt (scenario `clock.slowdown`). */
export function slowFactor(s: ScenarioDefinition, st: TrpgState): number {
  const sd = s.clock?.slowdown;
  if (!sd) return 1;
  const v = st.statuses[sd.target]?.[sd.key] ?? '';
  return sd.words.some(w => v.includes(w)) ? sd.factor : 1;
}

const TRAVEL_PER_TURN = 0.25;
const ACTION_ALLOWANCE = 0.04;

export function hoursText(s: ScenarioDefinition, amount: number): string {
  const minutes = Math.max(0, Math.round((amount * (s.clock?.hours ?? 4) * 60) / 10) * 10);
  if (minutes < 10) return 'すぐ';
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `約${h ? `${h}時間` : ''}${m ? `${m}分` : ''}`;
}

/** Where the next open goal happens, and whether the clock allows walking there. */
export function forecastOf(s: ScenarioDefinition, st: TrpgState): SceneView['forecast'] {
  if (!s.clock) return null;
  const next = s.goals.find(g => st.goals[g.id] !== 'done' && (g.requires ?? []).every(r => st.goals[r] === 'done'));
  const place = next?.at ?? next?.place;
  const here = hereOf(st);
  if (!next || !place || !here) return null;
  const p = shortestPath(s, here, place);
  if (!p) return null;
  const travel = p.cost * slowFactor(s, st);
  const openGoals = s.goals.filter(g => st.goals[g.id] !== 'done').length;
  const need = travel + openGoals * ACTION_ALLOWANCE;
  const left = 1 - st.clock;
  const label = s.locations.find(l => l.id === place)?.label ?? place;
  return { goal: next.label, place: label, travel: hoursText(s, travel), left: hoursText(s, left), verdict: need <= left * 0.7 ? 'ok' : need <= left ? 'tight' : 'hard' };
}

/* ---------- Plan (before the dice) ---------- */

export type Plan =
  | { kind: 'claim' }
  | { kind: 'talk'; reply: string; heroLine: { text: string; emotion: Emotion }; clockCost: number }
  | { kind: 'attempt'; summary: string; heroLine: { text: string; emotion: Emotion }; bands: unknown; clockCost: number; destination: string };

const MOTION = /帰|戻|行っ|行く|向か|進ん|進む|走|歩|渡っ|渡る|目指|まで/;
/** When the AI leaves the destination empty: a place named in the player's words with a motion word ("村まで帰って"). */
export function inferDestination(s: ScenarioDefinition, message: string): string {
  if (!MOTION.test(message)) return '';
  const hit = [...s.locations].sort((a, b) => b.label.length - a.label.length).find(l => message.includes(l.label));
  return hit?.id ?? '';
}

export function parsePlan(s: ScenarioDefinition, raw: unknown, message = ''): Plan {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const L = limitsOf(s);
  if (r.game_claim === true) return { kind: 'claim' };
  const hl = (r.hero_line && typeof r.hero_line === 'object' ? r.hero_line : {}) as Record<string, unknown>;
  const heroLine = { text: cut(hl.text, L.line), emotion: emotion(hl.emotion) };
  const cost = Number(r.clock_cost);
  if (r.kind === 'talk') {
    const reply = trimText(typeof r.reply === 'string' ? r.reply : '', L.narration[1]);
    // Never leave the player with no reaction at all.
    const line = heroLine.text ? heroLine : { text: reply ? '' : 'うーん……今はまだ、それはできないみたい。', emotion: 'thinking' as Emotion };
    return { kind: 'talk', reply, heroLine: line, clockCost: clampCost(cost, 'talk') };
  }
  const dest = typeof r.destination === 'string' ? r.destination.trim() : '';
  const destination = s.locations.find(l => l.id === dest || l.label === dest)?.id ?? (message ? inferDestination(s, message) : '');
  return { kind: 'attempt', summary: cut(r.summary, 20) || '挑戦する', heroLine, bands: r.bands, clockCost: clampCost(cost, 'attempt'), destination };
}
function clampCost(v: number, kind: keyof typeof CLOCK_COST) {
  const [lo, hi] = CLOCK_COST[kind];
  return Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : (lo + hi) / 2));
}

/* ---------- Resolution (after the dice) ---------- */

type RawChange = Record<string, unknown>;
export type Resolution = { title: string; narration: string; lines: { speaker: string; name?: string; text: string; emotion: Emotion }[]; changes: RawChange[]; goalsDone: string[]; trope: string; cleared: string[]; hooks: string[] };

export function parseResolution(s: ScenarioDefinition, raw: unknown): Resolution {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const L = limitsOf(s);
  const playerIds = s.cast.filter(c => c.player).map(c => c.id);
  const lines = (Array.isArray(r.lines) ? r.lines : [])
    // The player's own character never gets lines written by the GM.
    .filter(x => !playerIds.includes(String((x as Record<string, unknown>)?.speaker ?? '')))
    .slice(0, 2).map(x => {
    const l = (x ?? {}) as Record<string, unknown>;
    const speaker = typeof l.speaker === 'string' ? l.speaker : 'extra';
    const known = s.cast.some(c => c.id === speaker && !c.player);
    return { speaker: known ? speaker : 'extra', ...(known ? {} : { name: cut(l.name, 10) || '誰か' }), text: cut(l.text, L.line), emotion: emotion(l.emotion) };
  }).filter(l => l.text);
  // Dedicated fields are easier for a small model than one generic list; both are accepted.
  const list = (v: unknown) => (Array.isArray(v) ? v : []).filter(x => typeof x === 'string' && x.trim()).map(x => (x as string).trim());
  const explicit: RawChange[] = [];
  const moved = typeof r.moved_to === 'string' ? r.moved_to.trim() : '';
  if (moved) {
    const known = s.locations.find(l => l.id === moved || l.label === moved);
    explicit.push(known ? { kind: 'location', to: known.id } : { kind: 'location', to: 'new', label: moved.replace(/^new:/, ''), background: String(r.moved_background ?? s.locations[0]?.background ?? '') });
  }
  for (const name of list(r.gained)) explicit.push({ kind: 'item-add', name });
  for (const name of list(r.lost)) explicit.push({ kind: 'item-remove', name });
  for (const d of Array.isArray(r.damaged) ? r.damaged : []) if (d && typeof d === 'object') explicit.push({ kind: 'item-damage', ...(d as RawChange) });
  if (r.hero_status && typeof r.hero_status === 'object') for (const [key, value] of Object.entries(r.hero_status as Record<string, unknown>)) explicit.push({ kind: 'status', target: s.heroId, key, value: String(value) });
  for (const label of list(r.facts)) explicit.push({ kind: 'fact', label });
  return {
    title: cut(r.title, 12),
    narration: trimText(typeof r.narration === 'string' ? r.narration : '', L.narration[1]),
    lines,
    changes: [...explicit, ...(Array.isArray(r.changes) ? r.changes : []).filter((c): c is RawChange => !!c && typeof c === 'object')].slice(0, 8),
    goalsDone: (Array.isArray(r.goals_done) ? r.goals_done : []).filter((g): g is string => typeof g === 'string'),
    trope: cut(r.trope, 12),
    cleared: list(r.cleared).filter(id => (s.obstacles ?? []).some(o => o.id === id)),
    hooks: list(r.hooks).map(h => cut(h, 14)).slice(0, 4),
  };
}

/** Apply one change if it is consistent with the ledger. Returns the beat, or null if refused. */
function applyChange(s: ScenarioDefinition, st: TrpgState, c: RawChange): Extract<Beat, { type: 'change' }> | null {
  const kind = c.kind;
  const name = cut(c.name, 20);
  const label = cut(c.label, 30);
  switch (kind) {
    case 'item-add':
      if (!name || st.items.some(i => i.name === name)) return null;
      st.items.push({ name });
      return { type: 'change', kind, name, label: label || `${name}を手に入れた` };
    case 'item-remove': {
      const i = st.items.findIndex(x => x.name === name);
      if (i < 0) return null; // cannot lose what you do not have
      st.items.splice(i, 1);
      return { type: 'change', kind, name, label: label || `${name}がなくなった` };
    }
    case 'item-damage': {
      const item = st.items.find(x => x.name === name);
      if (!item) return null;
      item.damaged = cut(c.note, 20) || '傷んだ';
      return { type: 'change', kind, name, note: item.damaged, label: label || `${name}が傷んだ` };
    }
    case 'location': {
      const known = s.locations.find(l => l.id === c.to);
      const loc = known ?? (label && Object.keys(s.backgrounds).includes(String(c.background)) ? { id: 'new', label, background: String(c.background) } : null);
      if (!loc || (known && known.id === st.location.id)) return null;
      const from = st.location.id;
      st.location = { id: loc.id, label: loc.label, background: loc.background, ...(loc.id === 'new' ? { near: hereOf(st) } : {}) };
      return { type: 'change', kind, from, to: loc.id, background: loc.background, label: label || loc.label };
    }
    case 'status': {
      const target = String(c.target ?? '');
      if (!s.cast.some(m => m.id === target) || typeof c.key !== 'string') return null;
      const value = cut(c.value, 12);
      if (st.statuses[target]?.[c.key] === value) return null; // unchanged: not a change
      (st.statuses[target] ??= {})[c.key] = value;
      return { type: 'change', kind, target, key: c.key, value, label: label || `${c.key}：${value}` };
    }
    case 'relation': {
      const target = String(c.target ?? '');
      if (!s.cast.some(m => m.id === target)) return null;
      const value = ['friendly', 'wary', 'hostile'].includes(String(c.value)) ? String(c.value) : 'wary';
      st.relations[target] = value;
      return { type: 'change', kind, target, value, label: label || target };
    }
    case 'fact':
      if (!label) return null;
      return { type: 'change', kind, label };
    default:
      return null;
  }
}

function remember(st: TrpgState, fact: string) {
  st.facts.push(fact);
  // Keep the ledger short for the free AI: merge the oldest events into one summary line.
  if (st.facts.length > MAX_FACTS) {
    const old = st.facts.splice(0, st.facts.length - MAX_FACTS + 1);
    st.facts.unshift(`（これまで）${old.map(f => f.replace(/^（これまで）/, '')).join('／').slice(0, 160)}`);
  }
}

function finish(s: ScenarioDefinition, st: TrpgState, kind: Ending['kind'], narration: string): Ending {
  const goals = s.goals.map(g => `${st.goals[g.id] === 'done' ? '✓' : '・'}${g.label}`).join('　');
  const titles: Record<Ending['kind'], string> = {
    clear: 'ミッション達成！', partial: 'ここまでの冒険', timeout: s.clock?.deadlineTitle ?? '時間切れ',
    'score-now': 'ここまでで採点', 'safety-cap': '冒険のおわり',
  };
  const text = kind === 'timeout' ? `${s.clock?.deadlineText ?? ''}（${goals}）` : kind === 'clear' ? narration : `${narration}（${goals}）`;
  return { kind, title: titles[kind], text: trimText(text, 200) };
}

export type TurnInput = { message: string; plan: Plan; roll?: { face: number; tier: Tier; bands: Band[] }; resolution?: Resolution };

/** Apply one complete turn. Pure: returns a new state and the beats to present. */
export function applyTurn(s: ScenarioDefinition, prev: TrpgState, t: TurnInput): { state: TrpgState; beats: Beat[] } {
  if (prev.ending) throw Error('この冒険は終わっています。もう一度挑戦できます。');
  const st: TrpgState = structuredClone(prev);
  st.turn += 1;
  const beats: Beat[] = [{ type: 'player', text: t.message }];
  const L = limitsOf(s);

  if (t.plan.kind === 'claim') {
    beats.push({ type: 'ignored', text: 'それはゲームへのお願いなので、冒険の中では何も起きなかった。' });
    st.turns.push({ turn: st.turn, beats });
    return { state: st, beats };
  }

  const hero = s.heroId;
  let cost = t.plan.clockCost;
  if (t.plan.kind === 'talk') {
    if (t.plan.heroLine.text) { beats.push({ type: 'line', speaker: hero, text: t.plan.heroLine.text, emotion: t.plan.heroLine.emotion }); st.heroEmotion = t.plan.heroLine.emotion; }
    if (t.plan.reply) beats.push({ type: 'narration', text: t.plan.reply });
  } else {
    const roll = t.roll, res = t.resolution;
    if (!roll || !res) throw Error('サイコロと結果がそろっていません。');
    beats.push({ type: 'attempt', actor: hero, summary: t.plan.summary, ...(t.plan.heroLine.text ? { line: t.plan.heroLine } : {}) });
    beats.push({ type: 'dice-bands', die: 'd20', action: t.plan.summary, bands: roll.bands, chance: { successOrBetter: chanceSuccessOrBetter(roll.bands) } });
    beats.push({ type: 'dice-roll', die: 'd20', face: roll.face, tier: roll.tier, natural: roll.face === 1 ? 'one' : roll.face === 20 ? 'twenty' : null });
    beats.push({ type: 'outcome', tier: roll.tier, title: res.title || TIER_LABEL[roll.tier] });
    if (res.narration) beats.push({ type: 'narration', text: res.narration });
    for (const l of res.lines) beats.push({ type: 'line', ...l });
    st.heroEmotion = res.lines.find(l => l.speaker === hero)?.emotion ?? t.plan.heroLine.emotion;
    const startHere = hereOf(prev);
    for (const c of res.changes) { const b = applyChange(s, st, c); if (b) { beats.push(b); remember(st, b.label); } }
    remember(st, `${t.plan.summary}→${TIER_LABEL[roll.tier]}${res.title ? `（${res.title}）` : ''}`);
    if (res.trope) st.tropes = [...st.tropes, res.trope].slice(-3);
    if (res.hooks.length) st.hooks = res.hooks;

    // Travel is reliable: a successful trip along the routes moves the hero, and costs route time (not the AI's guess).
    const slow = slowFactor(s, st);
    let travelCost: number | null = null;
    // The player asked to go somewhere: the trip itself is what this turn resolves (the AI's own moves are overridden).
    const tripAsked = !!t.plan.destination && roll.tier !== 'setback' && !!startHere && t.plan.destination !== startHere;
    if (!tripAsked && st.location.id !== prev.location.id) {
      const p = startHere && st.location.id !== 'new' ? shortestPath(s, startHere, st.location.id) : null;
      if (p) travelCost = p.cost * slow;
    } else if (tripAsked) {
      const p = shortestPath(s, startHere, t.plan.destination);
      if (p && p.path.length > 1) {
        let covered = 0, reached = startHere;
        for (let i = 1; i < p.path.length; i++) {
          const leg = shortestPath(s, p.path[i - 1], p.path[i])?.cost ?? 0;
          if (i > 1 && covered + leg > TRAVEL_PER_TURN) break; // one turn walks a limited distance
          covered += leg; reached = p.path[i];
        }
        const loc = s.locations.find(l => l.id === reached);
        if (loc && loc.id !== st.location.id) {
          const from = st.location.id;
          st.location = { id: loc.id, label: loc.label, background: loc.background };
          beats.push({ type: 'change', kind: 'location', from, to: loc.id, background: loc.background, label: loc.label });
          remember(st, `${loc.label}に着いた`);
          travelCost = covered * slow * (roll.tier === 'costly' ? 1.3 : 1);
        }
      }
    }
    if (travelCost !== null) cost = Math.max(0.01, travelCost);

    if (roll.tier !== 'setback') {
      // Obstacles the GM says were dealt with.
      for (const id of res.cleared) {
        if (st.obstacles[id] !== 'active') continue;
        st.obstacles[id] = 'cleared';
        const o = s.obstacles?.find(x => x.id === id);
        beats.push({ type: 'obstacle', id, label: o?.label ?? id, status: 'cleared' });
        remember(st, `【解決】${o?.label ?? id}`);
      }
      // Goals: only on a success (including costly), in order, at the right place, with blocking obstacles cleared.
      for (const id of res.goalsDone) {
        const g = s.goals.find(x => x.id === id);
        if (!g || st.goals[id] === 'done') continue;
        if ((g.requires ?? []).some(r => st.goals[r] !== 'done')) continue;
        if (g.at && hereOf(st) !== g.at) continue;
        if ((g.blockedBy ?? []).some(o => st.obstacles[o] === 'active')) continue;
        st.goals[id] = 'done';
        beats.push({ type: 'goal', id, label: g.label, status: 'done' });
        remember(st, `【達成】${g.label}`);
        // Meeting the goal means being where it happens (unless the turn was a trip elsewhere).
        if (g.place && hereOf(st) !== g.place && !tripAsked) {
          const loc = s.locations.find(l => l.id === g.place);
          if (loc) { const from = st.location.id; st.location = { id: loc.id, label: loc.label, background: loc.background }; beats.push({ type: 'change', kind: 'location', from, to: loc.id, background: loc.background, label: loc.label }); }
        }
      }
    }
  }

  // Arrival goals are checked by the rules alone (e.g. 村に帰り着く).
  for (const g of s.goals) {
    if (!g.arrive || !g.at || st.goals[g.id] === 'done' || hereOf(st) !== g.at) continue;
    if ((g.requires ?? []).some(r => st.goals[r] !== 'done')) continue;
    st.goals[g.id] = 'done';
    beats.push({ type: 'goal', id: g.id, label: g.label, status: 'done' });
    remember(st, `【達成】${g.label}`);
  }

  if (s.clock) {
    const from = st.clock;
    st.clock = Math.min(1, Math.round((st.clock + cost) * 1000) / 1000);
    if (st.clock > from) {
      const phase = phaseOf(s, st.clock);
      const changed = phase.id !== phaseOf(s, from).id;
      beats.push({ type: 'clock', from, to: st.clock, phase: phase.id, label: changed ? phase.label : '' });
    }
  } else cost = 0;

  const lastNarration = [...beats].reverse().find(b => b.type === 'narration') as { text: string } | undefined;
  if (s.goals.every(g => st.goals[g.id] === 'done')) st.ending = finish(s, st, 'clear', lastNarration?.text ?? '');
  else if (s.clock && st.clock >= 1) st.ending = finish(s, st, 'timeout', '');
  else if (st.turn >= L.safetyCap) st.ending = finish(s, st, 'safety-cap', '長い冒険の末、この日はここで一区切りとなった。');
  if (st.ending) beats.push({ type: 'ending', ...st.ending });

  st.turns.push({ turn: st.turn, beats, ...(t.roll ? { face: t.roll.face, tier: t.roll.tier } : {}) });
  return { state: st, beats };
}

export function scoreNow(s: ScenarioDefinition, prev: TrpgState): TrpgState {
  const st = structuredClone(prev);
  st.ending = finish(s, st, doneCount(st) ? 'partial' : 'score-now', 'ここで冒険を区切った。');
  return st;
}

export function sceneOf(s: ScenarioDefinition, st: TrpgState): SceneView {
  const phase = phaseOf(s, st.clock);
  return {
    kind: 'trpg', scenarioId: s.id, heroId: s.heroId,
    clock: s.clock ? { value: st.clock, phase: phase.id, phaseLabel: phase.label, name: s.clock.name } : null,
    goals: s.goals.map(g => ({ id: g.id, label: g.label, status: st.goals[g.id] })),
    location: st.location, items: st.items, statuses: st.statuses, facts: st.facts.slice(-10),
    forecast: forecastOf(s, st),
    obstacles: (s.obstacles ?? []).filter(o => st.obstacles[o.id] === 'active').map(o => ({ id: o.id, label: o.label })),
    hooks: st.hooks,
    heroEmotion: st.heroEmotion,
    lastBeats: st.turns.at(-1)?.beats ?? [],
    cast: s.cast.map(c => ({ id: c.id, name: c.name, ...(c.portraits ? { portraits: c.portraits } : {}), ...(c.player ? { player: true } : {}) })),
    sheets: s.sheets,
    background: s.backgrounds[st.location.background] ?? Object.values(s.backgrounds)[0] ?? '',
    inputMax: limitsOf(s).input,
  };
}
