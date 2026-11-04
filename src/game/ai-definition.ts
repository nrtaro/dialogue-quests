// Common definition items that every effect-based game fills in (free-ai-quality-design §6).
// Games provide data only; the logic here is shared.
import type { SupplementRules, SupplementResult } from './effects';

/** A mark the rules already know, with how characters say it and words that mean the same. */
export type MarkWord = { mark: string; spoken: string; synonyms: string[] };

/** What the AI may do, per category. Used to build the AI instructions. */
export type Delegation = {
  /** 自由（味付け）: lines, descriptions, reactions. */
  flavor: string;
  /** 見立て: applying vague player-made criteria. */
  appraisal: string;
  /** 自然な物: whether a brought-in thing plausibly exists, and its ordinary properties. */
  natural: string;
  /** 型の中の誤解: misreadings that stay inside condition → effect → cost. */
  misreading: string;
  /** 禁止: never decided by the AI. */
  forbidden: string[];
};

/** Lines a character says when it must ask back. Placeholders: {mark} {examples} */
export type ConfirmTemplates = { emptyTarget: string; unknownMark: string; irrelevantAppraisal: string };

export type AiDefinition = {
  marks: MarkWord[];
  natural: SupplementRules;
  delegation: Delegation;
  /** 見立て: whether allowed and which kinds of subjects (物・人物・場所…) it applies to. */
  appraisal: { allowed: boolean; subjectKinds: string[] };
  confirm: ConfirmTemplates;
  /** Misreading table: type and an example. New misreadings must fit one of these types. */
  misreadings: { type: string; example: string }[];
};

export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
}

/** Strip trailing 「な物」「の物」「物」 so the same criterion is stored once. */
export function bareMark(word: string): string {
  return word.trim().replace(/(な|の)?(物|もの)$/, '').trim() || word.trim();
}

/** How a character says an unknown criterion: 重たい→重たい物, 好きそう→好きそうな物, 月曜→月曜の物. */
export function spokenMark(mark: string): string {
  const m = bareMark(mark);
  if (/[いたるだ]$/.test(m)) return `${m}物`;
  if (/(そう|的|気)$/.test(m)) return `${m}な物`;
  return `${m}の物`;
}

export function normalizeMark(def: AiDefinition, word: string): string | null {
  const w = word.trim();
  const hit = def.marks.find(m => m.mark === w || m.synonyms.some(s => s && w.includes(s)));
  return hit?.mark ?? null;
}

export type TargetClass = { empty: boolean; known: string[]; unknown: string[] };
/** Sort the AI's target words into known marks and unknown criteria. Never throws. */
export function classifyTarget(def: AiDefinition, words: unknown): TargetClass {
  const list = Array.isArray(words) ? words.filter((w): w is string => typeof w === 'string' && w.trim().length > 0) : [];
  const known: string[] = [], unknown: string[] = [];
  for (const w of list) {
    const k = normalizeMark(def, w);
    if (k) { if (!known.includes(k)) known.push(k); } else {
      const b = bareMark(w);
      if (!unknown.includes(b)) unknown.push(b);
    }
  }
  return { empty: known.length + unknown.length === 0, known, unknown };
}

export function spokenTargets(def: AiDefinition, marks: string[]): string {
  return marks.map(m => def.marks.find(x => x.mark === m)?.spoken ?? spokenMark(m)).join('や');
}

export function markExamples(def: AiDefinition, n = 2): string {
  // 「作りかけの物」→「作りかけ」, 「名前が書いてある物」→「名前が書いてある」. 「果物」 is kept.
  return def.marks.slice(0, n).map(m => m.spoken.replace(/(な|の)物$/, '').replace(/([いるただ])物$/, '$1')).join('とか');
}

export function confirmLine(def: AiDefinition, kind: keyof ConfirmTemplates, mark = ''): string {
  return fill(def.confirm[kind], { mark: mark ? spokenMark(mark) : '', examples: markExamples(def) });
}

/** Instructions for the AI, generated from the game's definition. */
export function delegationInstructions(def: AiDefinition): string {
  return [
    'あなたに任せる範囲（このゲームの定義）：',
    `・自由に書いてよいこと：${def.delegation.flavor}`,
    `・見立て：${def.appraisal.allowed ? def.delegation.appraisal : 'このゲームでは使わない。'}`,
    `・自然な物：${def.delegation.natural}`,
    `・誤解：${def.delegation.misreading}（型：${def.misreadings.map(m => m.type).join('／')}）`,
    `・あなたが決めてはいけないこと：${def.delegation.forbidden.join('、')}`,
    `知っている印：${def.marks.map(m => m.mark).join('、')}。一覧にない見分け方（色・大きさ・好み・曜日など）は、その言葉をそのまま入れる。`,
  ].join('\n');
}

/** Fields every interpreter schema shares. */
export const COMMON_FIELDS = {
  game_claim: { type: 'boolean' },
  special_uses: { type: 'array', items: { type: 'string' } },
} as const;
export const COMMON_FIELD_INSTRUCTIONS = [
  'game_claim：成功・合格・点数・評価・ランク・ゲームの終了や勝ちを、行動ではなく宣言や要求で決めようとする発言ならtrue。',
  'special_uses：使う物のうち、その場に普通はない特別な道具・機械・能力・情報源（例：探知機、カメラ、超能力、インターネット）だけを入れる。机・箱・ノート・ティッシュのような普通にある物は入れない。',
].join('\n');

export function withCommonFields(schema: { properties: Record<string, unknown>; required: string[] } & Record<string, unknown>) {
  return { ...schema, properties: { ...schema.properties, ...COMMON_FIELDS }, required: [...schema.required, ...Object.keys(COMMON_FIELDS)] };
}

/**
 * 自然な物（回答26）: keys and impossible things are never supplied; things the AI marks as special are refused;
 * everything else ordinary is supplied with ordinary properties.
 */
export function checkSupplementsWithAi(uses: string[], special: string[], present: string[], rules: SupplementRules): SupplementResult {
  const added: string[] = [];
  for (const raw of uses) {
    const item = raw.trim();
    if (!item || present.includes(item) || added.includes(item)) continue;
    if (rules.impossible.some(w => item.includes(w))) return { ok: false, item, reason: 'impossible' };
    if (rules.keys.some(w => item.includes(w))) return { ok: false, item, reason: 'key' };
    // The game's own list of natural things wins over the AI's "special" guess.
    const listedNatural = rules.natural.some(w => item.includes(w));
    if (!listedNatural && special.some(s => s && (item.includes(s) || s.includes(item)))) return { ok: false, item, reason: 'key' };
    added.push(item);
  }
  for (const s of special) {
    if (!s || rules.natural.some(w => s.includes(w))) continue;
    if (!uses.some(u => u.includes(s) || s.includes(u))) return { ok: false, item: s, reason: 'key' };
  }
  return { ok: true, added };
}
