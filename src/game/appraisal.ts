// 見立て: the AI applies a vague player-made criterion to public descriptions once;
// the result is recorded and then treated as a fact by the rules.

export type Subject = { id: string; kind: string; name: string; description: string };
export type Verdict = { fits: boolean; reason: string };
/** mark → subject id → verdict. Stored in game state. */
export type AppraisalBook = Record<string, Record<string, Verdict>>;
export type AppraisalNeed = { marks: string[]; subjects: Subject[] };
export type RawVerdict = { mark: string; subject: string; fits: boolean; reason: string };

/** Only the pairs not yet decided. Pairs already in the book are never asked again. */
export function missing(book: AppraisalBook, marks: string[], subjects: Subject[]): AppraisalNeed | null {
  const needMarks = marks.filter(m => subjects.some(s => !book[m]?.[s.id]));
  if (!needMarks.length) return null;
  const needSubjects = subjects.filter(s => needMarks.some(m => !book[m]?.[s.id]));
  return { marks: needMarks, subjects: needSubjects };
}

export function fitsMark(book: AppraisalBook, mark: string, subjectId: string): boolean | undefined {
  return book[mark]?.[subjectId]?.fits;
}

const HIRAGANA = /^[\p{Script=Hiragana}ー]+$/u;
/**
 * Short pieces of a subject's public description: 3-character windows that contain a kanji/katakana/digit,
 * and 4-character all-hiragana windows (つやつや). Common grammar like 「している」 is too short to match by accident.
 */
function cues(text: string): string[] {
  const out = new Set<string>();
  for (const part of text.split(/[\s、。，．,.!！?？「」（）()・]+/)) {
    const chars = [...part];
    for (let i = 0; i + 3 <= chars.length; i++) { const w = chars.slice(i, i + 3).join(''); if (!HIRAGANA.test(w)) out.add(w); }
    for (let i = 0; i + 4 <= chars.length; i++) { const w = chars.slice(i, i + 4).join(''); if (HIRAGANA.test(w)) out.add(w); }
  }
  return [...out];
}
/** A reason must point at something in the subject's public description. */
export function relevant(reason: string, subject: Subject): boolean {
  if (typeof reason !== 'string' || reason.trim().length < 4) return false;
  return cues(subject.description).some(c => reason.includes(c));
}

export function parseVerdicts(raw: unknown): RawVerdict[] {
  const list = (raw as { results?: unknown })?.results;
  if (!Array.isArray(list)) return [];
  return list.filter((v): v is RawVerdict => !!v && typeof v === 'object'
    && typeof (v as RawVerdict).mark === 'string' && typeof (v as RawVerdict).subject === 'string'
    && typeof (v as RawVerdict).fits === 'boolean' && typeof (v as RawVerdict).reason === 'string');
}

/**
 * Check the AI's verdicts: every needed pair must be answered with a reason about that subject.
 * A mark with any missing or unrelated answer is not recorded (the caller asks the player instead).
 */
export function acceptVerdicts(book: AppraisalBook, need: AppraisalNeed, raw: unknown): { book: AppraisalBook; rejectedMarks: string[] } {
  const verdicts = parseVerdicts(raw);
  const next: AppraisalBook = structuredClone(book);
  const rejectedMarks: string[] = [];
  for (const mark of need.marks) {
    const entries: [string, Verdict][] = [];
    let ok = true;
    for (const s of need.subjects) {
      if (book[mark]?.[s.id]) continue;
      const v = verdicts.find(x => x.mark === mark && x.subject === s.id);
      if (!v || !relevant(v.reason, s)) { ok = false; break; }
      entries.push([s.id, { fits: v.fits, reason: v.reason.trim().slice(0, 80) }]);
    }
    if (!ok) { rejectedMarks.push(mark); continue; }
    next[mark] = { ...(next[mark] ?? {}), ...Object.fromEntries(entries) };
  }
  return { book: next, rejectedMarks };
}

/** Lines for the result screen: 「〇〇」の見立て：名前→当てはまる（理由） */
export function describeAppraisals(book: AppraisalBook, subjects: Subject[]): string[] {
  return Object.entries(book).flatMap(([mark, bySubject]) => subjects.filter(s => bySubject[s.id])
    .map(s => `「${mark}」の見立て：${s.name}→${bySubject[s.id].fits ? '当てはまる' : '当てはまらない'}（${bySubject[s.id].reason}）`));
}

/** Rule-based stand-in for the AI, used in mock mode: fits when the description contains the criterion. */
export function mockVerdicts(need: AppraisalNeed): { results: RawVerdict[] } {
  return { results: need.marks.flatMap(mark => need.subjects.map(s => {
    const fits = `${s.name}${s.description}`.includes(mark);
    return { mark, subject: s.id, fits, reason: `${s.name}は${fits ? `「${mark}」に当てはまる` : `「${mark}」とは書かれていない`}（${s.description.slice(0, 20)}）` };
  })) };
}
