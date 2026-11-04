// One turn of an effect-based game, shared by every game, the session and the judgment test runner:
// interpret → judge → (if needed) 見立て once → judge again. Nothing is committed here.
import { confirmLine, delegationInstructions } from '../game/ai-definition';
import { acceptVerdicts } from '../game/appraisal';
import type { AIResult, EffectContentDefinition, EffectOutcome, Message, Provider } from '../game/types';

export type EffectTurn<S> = EffectOutcome<S> & { calls: AIResult[]; appraised: boolean; rejectedMarks: string[] };

export async function resolveEffectTurn<S>(c: EffectContentDefinition<S>, provider: Provider, state: S, history: Message[], message: string): Promise<EffectTurn<S>> {
  if (!provider.interpret) throw Error('このAI接続は自由入力のコンテンツに未対応です。');
  const mock = provider.mode === 'mock';
  const calls: AIResult[] = [];
  const ai = await provider.interpret({ content: c.info, situation: c.context(structuredClone(state)), history: structuredClone(history), message, interpreter: c.interpreter, ...(mock ? { mockProposal: c.mock(structuredClone(state), message) } : {}) });
  calls.push(ai);
  let base = state;
  let out = c.judge(structuredClone(base), message, ai.proposal);
  if (!out.needs) return { ...out, calls, appraised: false, rejectedMarks: [] };

  // 見立て are needed. Ask once for every missing pair, check the answers, record them, judge again.
  const need = out.needs;
  if (!c.ai.appraisal.allowed || !provider.appraise) {
    return { ...c.askBack(base, confirmLine(c.ai, 'unknownMark', need.marks[0]), `「${need.marks.join('・')}」の見分け方を確認した`), calls, appraised: false, rejectedMarks: need.marks };
  }
  // One call per criterion; all of its subjects are asked together in that call.
  const rejectedMarks: string[] = [];
  for (const mark of need.marks) {
    const part = { marks: [mark], subjects: need.subjects.filter(s => !c.book(base)[mark]?.[s.id]) };
    const verdict = await provider.appraise({ content: c.info, need: part, instructions: delegationInstructions(c.ai) });
    calls.push(verdict);
    const accepted = acceptVerdicts(c.book(base), part, verdict.proposal);
    base = c.withBook(base, accepted.book);
    rejectedMarks.push(...accepted.rejectedMarks);
  }
  if (rejectedMarks.length) {
    // An answer that does not point at the descriptions is not used. Ask the player instead.
    return { ...c.askBack(base, confirmLine(c.ai, 'irrelevantAppraisal', rejectedMarks[0]), `「${rejectedMarks.join('・')}」の見立てに根拠がなく、確認した`), calls, appraised: true, rejectedMarks };
  }
  out = c.judge(structuredClone(base), message, ai.proposal);
  if (out.needs) {
    return { ...c.askBack(base, confirmLine(c.ai, 'unknownMark', out.needs.marks[0]), '見立てを確定できず、確認した'), calls, appraised: true, rejectedMarks: out.needs.marks };
  }
  return { ...out, calls, appraised: true, rejectedMarks: [] };
}
