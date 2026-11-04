// Rule-based stand-in for the AI interpreter, so the whole flow runs without an AI.
// It only produces proposals; judge() still decides what happens. Mark words come from the common definition data.
import { normalizeMark } from '../../game/ai-definition';
import { ROBO_AI } from './ai';
import type { Action, Proposal } from './index';

const UNKNOWN_WORDS: [RegExp, string][] = [[/月曜|火曜|曜日/, '曜日'], [/高そう|値段/, '高そう'], [/におい|匂い/, 'におい']];
const USE_WORDS = ['スキャナー', '判別装置', 'センサー', '説明書', '魔法', '透視', '超能力', '時間を戻', 'かご', '付箋', 'ラベル'];

/** Maps a word to a known mark, if any (shared normalization over this game's data). */
export function normalizeTag(word: string): string | null {
  return normalizeMark(ROBO_AI, word);
}

function action(text: string): Action | null {
  if (/宝物/.test(text)) return 'treasure';
  if (/保留/.test(text)) return 'hold';
  if (/聞いて|聞く|確認/.test(text)) return 'ask';
  if (/捨てない|捨てちゃだめ|捨てちゃダメ|残して|残す|しまって|棚に/.test(text)) return 'keep';
  if (/捨てて|捨てる|捨てよう|ゴミ箱/.test(text)) return 'discard';
  return null;
}

export function mockInterpret(text: string): Proposal {
  if (/本番|テスト|やってみて|行ってきて/.test(text)) return { kind: 'start_test' };
  if (/持ち主/.test(text) && /人間|家の人|人のこと|家族/.test(text)) return { kind: 'define_owner' };
  if (/汚れ/.test(text) && /限らない|だけで(は)?捨て/.test(text)) return { kind: 'forget', target: '汚れた物は捨てる' };
  const uses = USE_WORDS.filter(w => text.includes(w));
  // A plan that depends on a tool ("スキャナーで判定して") is still proposed, so judge() can explain why it fails.
  const act = action(text) ?? (uses.length ? 'keep' : null);
  if (!act) return { kind: 'talk' };
  if (/迷ったら|迷う|分からない|わからない|迷った/.test(text) || (uses.length && !action(text))) return { kind: 'teach', when: 'unsure', do: act, label: text.slice(0, 40), uses };
  const tags = [
    ...ROBO_AI.marks.filter(m => m.synonyms.some(s => text.includes(s))).map(m => m.mark),
    ...UNKNOWN_WORDS.filter(([r]) => r.test(text)).map(([, t]) => t),
  ];
  if (!tags.length) {
    // 「〇〇な物は…」「〇〇物は…」: a criterion the rules don't know yet — passed on as a 見立て.
    const vague = /^(.{1,15}?)(?:な|の)?(?:物|もの)は/.exec(text.trim());
    if (vague && !/^(この|その|あの|どの|それ|これ|あれ)/.test(vague[1])) return { kind: 'teach', when: [vague[1]], do: act, label: text.slice(0, 40), uses };
    return { kind: 'talk' };
  }
  return { kind: 'teach', when: [...new Set(tags)].slice(0, 4), do: act, label: text.slice(0, 40), uses };
}
