// A minimal second game, written only with the common definition items and helpers.
// It proves that 見立て and asking back work for any game that fills in the definition.
import { classifyTarget, confirmLine, type AiDefinition } from '../../src/game/ai-definition';
import { fitsMark, missing, type AppraisalBook, type Subject } from '../../src/game/appraisal';
import type { EffectContentDefinition, EffectOutcome } from '../../src/game/types';

type S = { turn: number; basket: string[]; book: AppraisalBook; log: string[] };

export const FRUITS: Subject[] = [
  { id: 'f1', kind: '果物', name: 'りんご', description: '真っ赤でつやつやした、まるいりんご。' },
  { id: 'f2', kind: '果物', name: 'バナナ', description: '黄色くて細長い、少し茶色い点のあるバナナ。' },
  { id: 'f3', kind: '果物', name: 'ぶどう', description: '紫色の小さな粒がたくさんついたぶどう。' },
];

export function fruitAi(appraisal = true): AiDefinition {
  return {
    marks: [{ mark: '赤い', spoken: '赤い果物', synonyms: ['赤'] }, { mark: '黄色い', spoken: '黄色い果物', synonyms: ['黄色'] }],
    natural: { natural: ['かご'], keys: ['魔法のかご'], impossible: ['魔法'] },
    delegation: { flavor: '八百屋さんの台詞', appraisal: 'お客さんのあいまいな注文を果物に当てはめる', natural: '店にある普通の道具', misreading: 'なし', forbidden: ['値段', '売上'] },
    appraisal: { allowed: appraisal, subjectKinds: ['果物'] },
    confirm: {
      emptyTarget: 'へい、どの果物にしましょう？ {examples}みたいに言ってくだせえ！',
      unknownMark: '{mark}って、どう見分けりゃいいんで？ {examples}みたいに言ってくだせえ！',
      irrelevantAppraisal: 'うーん、{mark}かどうか、あっしには分かりかねます。{examples}みたいに言ってくだせえ！',
    },
    misreadings: [],
  };
}

const say = (state: S, line: string, judgment: string, note: string): EffectOutcome<S> =>
  ({ state: { ...state, turn: state.turn + 1, log: [...state.log, note] }, judgment, speech: line, result: note });

export function fruitStand(ai: AiDefinition = fruitAi()): EffectContentDefinition<S> {
  return {
    kind: 'effect',
    info: { id: 'fruit-stand', version: '1', scenarioVersion: '1', rulesVersion: '1', title: '八百屋のかご詰め', scenario: 'テスト用', summary: 'テスト用', objective: '注文どおりにかごへ入れる', playerName: '客', characterName: '八百屋', playerRole: '客', delegateLabel: '会計', duration: '1分', opening: [] },
    ai,
    create: () => ({ turn: 0, basket: [], book: {}, log: [] }),
    view: s => ({ location: '店先', stats: [], inventory: s.basket, discoveries: [], privateInfo: [], ending: null }),
    context: () => JSON.stringify({ fruits: FRUITS.map(f => f.name) }),
    interpreter: { instructions: '', schema: {} },
    mock: () => ({ when: [] }),
    book: s => s.book,
    withBook: (s, book) => ({ ...s, book }),
    askBack: (s, line, note) => say(s, line, 'confirm', note),
    judge(state, _message, proposal) {
      const t = classifyTarget(ai, (proposal as { when?: unknown })?.when);
      if (t.empty) return say(state, confirmLine(ai, 'emptyTarget'), 'confirm', '対象が分からず確認');
      if (t.unknown.length) {
        if (!ai.appraisal.allowed) return say(state, confirmLine(ai, 'unknownMark', t.unknown[0]), 'confirm', '見分け方を確認');
        const need = missing(state.book, t.unknown, FRUITS);
        if (need) return { state, judgment: 'accepted', speech: '', result: '', needs: need };
      }
      const marks = [...t.known, ...t.unknown];
      const picked = FRUITS.filter(f => marks.some(m => (t.known.includes(m) ? `${f.description}`.includes(m.replace('い', '')) : fitsMark(state.book, m, f.id) === true)));
      return say({ ...state, basket: picked.map(f => f.name) }, 'へい、まいど！', 'accepted', `かご：${picked.map(f => f.name).join('、') || 'なし'}`);
    },
  };
}
