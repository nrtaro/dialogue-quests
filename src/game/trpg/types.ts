// Common TRPG engine types (docs/trpg-redesign-proposal.md, docs/trpg-presentation-data.md).
// A game is a ScenarioDefinition (data). The engine, dice, clock and ledger are shared.

export const TIERS = ['setback', 'costly', 'success', 'great'] as const;
export type Tier = typeof TIERS[number];
export const TIER_LABEL: Record<Tier, string> = { setback: '前進つき失敗', costly: '代償つき成功', success: '成功', great: '大成功' };
export const EMOTIONS = ['neutral', 'happy', 'excited', 'nervous', 'surprised', 'relieved', 'sad', 'pained', 'thinking', 'determined'] as const;
export type Emotion = typeof EMOTIONS[number];

/** A rectangle on a sprite sheet (pixels). */
export type SpriteRect = { sheet: string; x: number; y: number; w: number; h: number };
export type SpriteSheet = { src: string; width: number; height: number };

export type CastMember = {
  id: string; name: string; role: string;
  /** Portraits per emotion. Missing emotions fall back to `neutral`. */
  portraits?: Partial<Record<Emotion, SpriteRect>>;
  /** The player character (whispers to the hero) is not acted on by the GM. */
  player?: boolean;
};
export type Location = { id: string; label: string; background: string };
/**
 * `at`: the goal can only be met while the hero is at this location (e.g. 村に帰り着く).
 * `place`: where it normally happens — used for the travel forecast, and the hero is moved there when it is met.
 * `blockedBy`: obstacles that must be cleared first (or in the same turn).
 * `gives` / `needs`: the goal's key item. Only the rules hand it over (`gives`) or take it (`needs`);
 * the GM can neither invent nor lose a key item, so a goal can never become impossible.
 */
export type Goal = {
  id: string; label: string; requires?: string[]; at?: string; place?: string; blockedBy?: string[];
  /** Met by the rules as soon as the hero stands at `at` (with requirements done) — no AI report needed. */
  arrive?: boolean;
  gives?: string;
  needs?: string;
};
/** A rule-side change to the odds, in die faces (+ easier, − harder). Shown with the dice. */
export type Modifier = { label: string; value: number; kind: 'item' | 'hook' | 'status' | 'obstacle' };
/** Something in the way. The GM marks it cleared; the screen lists the ones that remain. */
export type Obstacle = { id: string; label: string; at?: string };
/** Ways between locations, and how much of the world clock walking them takes. */
export type Route = { from: string; to: string; cost: number };
export type ClockPhase = { id: string; upTo: number; label: string };
export type Band = { tier: Tier; from: number; to: number; label: string; reason: string };

export type ScenarioDefinition = {
  id: string;
  title: string; scenario: string; summary: string;
  /** One sentence telling what clear means. Shown with the goal list. */
  objective: string;
  playerName: string; heroId: string; playerRole: string;
  stars: number; duration: string;
  opening: { narration: string; heroLine: { text: string; emotion: Emotion } };
  goals: Goal[];
  /** 世界の時計. Omit for games that end on a submission instead. */
  clock?: {
    name: string; phases: ClockPhase[]; deadlineTitle: string; deadlineText: string;
    /** How many in-world hours the whole clock represents (for 「あと約1時間」). */
    hours?: number;
    /** Travel is slower while a status contains one of these words (e.g. 足：悪化). */
    slowdown?: { target: string; key: string; words: string[]; factor: number };
  };
  cast: CastMember[];
  locations: Location[];
  /** Ways between locations (both directions). Travel along them moves the hero reliably on a success. */
  routes?: Route[];
  obstacles?: Obstacle[];
  start: { location: string; items: string[]; statuses: Record<string, Record<string, string>>; facts: string[] };
  /** The core the GM must never change. Everything else may be imagined. */
  fixedFacts: string[];
  /** Kid-safe and tone rules specific to this world (common rules are added by the engine). */
  worldRules: string[];
  sheets: Record<string, SpriteSheet>;
  backgrounds: Record<string, string>;
  /** Limits (common defaults apply when omitted). */
  limits?: { input?: number; narration?: [number, number]; line?: number; safetyCap?: number };
};

export type Ending = { kind: 'clear' | 'partial' | 'timeout' | 'score-now' | 'safety-cap'; title: string; text: string; highlight?: number };

/** One beat of the presentation stream for a turn (trpg-presentation-data §1). */
export type Beat =
  | { type: 'player'; text: string }
  | { type: 'attempt'; actor: string; summary: string; line?: { text: string; emotion: Emotion } }
  | { type: 'dice-bands'; die: 'd20'; action: string; bands: Band[]; chance: { successOrBetter: number }; mods?: Modifier[] }
  /** An action anyone could do with nothing in the way: no die is rolled. */
  | { type: 'no-roll'; action: string; reason: string }
  | { type: 'dice-roll'; die: 'd20'; face: number; tier: Tier; natural: 'one' | 'twenty' | null }
  | { type: 'outcome'; tier: Tier; title: string }
  | { type: 'narration'; text: string }
  | { type: 'line'; speaker: string; name?: string; text: string; emotion: Emotion }
  | { type: 'change'; kind: 'item-add' | 'item-remove' | 'item-damage' | 'location' | 'status' | 'relation' | 'fact'; label: string; name?: string; note?: string; from?: string; to?: string; background?: string; target?: string; key?: string; value?: string }
  | { type: 'clock'; from: number; to: number; phase: string; label: string }
  | { type: 'goal'; id: string; label: string; status: 'open' | 'done' | 'lost' }
  | { type: 'obstacle'; id: string; label: string; status: 'cleared' }
  | { type: 'ending'; kind: Ending['kind']; title: string; text: string; highlight?: number }
  | { type: 'ignored'; text: string }
  /** A rule explaining itself (e.g. why a goal is not met yet). */
  | { type: 'note'; text: string };

export type TrpgState = {
  turn: number;
  clock: number;
  /** `near`: for a place the AI invented, the known location it is next to (for routes and the forecast). */
  location: { id: string; label: string; background: string; near?: string };
  obstacles: Record<string, 'active' | 'cleared'>;
  /** Things in the scene worth noticing (not instructions). Shown as 「いま目につくもの」. */
  hooks: string[];
  items: { name: string; damaged?: string }[];
  statuses: Record<string, Record<string, string>>;
  relations: Record<string, string>;
  /** 台帳: events that happened (newest last). Older ones are summarized. */
  facts: string[];
  goals: Record<string, 'open' | 'done'>;
  /** Recent development types, to avoid repeating the same trick. */
  tropes: string[];
  /** Every turn's beats, kept for the log, scoring and replay. */
  turns: { turn: number; beats: Beat[]; face?: number; tier?: Tier }[];
  ending: Ending | null;
  /** Hero's current expression for the stage. */
  heroEmotion: Emotion;
};

/** What the screen receives in addition to the common view. */
export type SceneView = {
  kind: 'trpg';
  scenarioId: string;
  heroId: string;
  clock: { value: number; phase: string; phaseLabel: string; name: string } | null;
  goals: { id: string; label: string; status: 'open' | 'done' }[];
  location: TrpgState['location'];
  /** 道のり: how far the next goal's place is, against the clock. Null when there is nothing to walk to. */
  forecast: { goal: string; place: string; travel: string; left: string; verdict: 'ok' | 'tight' | 'hard' } | null;
  obstacles: { id: string; label: string }[];
  hooks: string[];
  items: TrpgState['items'];
  statuses: TrpgState['statuses'];
  facts: string[];
  heroEmotion: Emotion;
  lastBeats: Beat[];
  cast: { id: string; name: string; portraits?: Partial<Record<Emotion, SpriteRect>>; player?: boolean }[];
  sheets: Record<string, SpriteSheet>;
  background: string;
  inputMax: number;
};
