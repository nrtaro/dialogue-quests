// Common judgment-test runner (free-ai-quality-design §5). Any effect game supplies its own cases.
// Uses the same turn pipeline as real play (resolveEffectTurn), so 見立て are exercised too.
import type { EffectContentDefinition, Provider } from '../game/types';
import { resolveEffectTurn } from './effect-turn';
import { QuotaExhausted } from './quota';
import { neuronsOf } from './workers-ai';

export type JudgmentCase<S> = {
  id: number; group: string; text: string;
  expect: {
    /** Acceptable judgments (accepted / conditional / confirm / rejected / ignored). */
    judgment: string[];
    /** Game-specific check of the resulting state (e.g. which action was learned). */
    check?: (state: S) => boolean;
    /** Expected 見立て for clear-cut subjects: subject id → fits. Other subjects are not scored. */
    fits?: Record<string, boolean>;
  };
};
export type CaseRun = {
  ok: boolean; judgment: string; ms: number; neurons: number; calls: number;
  appraised: boolean; formatError: boolean; error?: string; speech?: string;
  /** mark → subject → fits, for marks recorded in this run. */
  verdicts?: Record<string, Record<string, boolean>>;
  fitsHit?: number; fitsTotal?: number;
};
export type CaseResult<S> = { case: JudgmentCase<S>; runs: CaseRun[] };

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const isFormatError = (m: string) => /形式|invalid|expected|too_small|Required/i.test(m);

export async function runCases<S>(game: EffectContentDefinition<S>, provider: Provider, cases: JudgmentCase<S>[], repeat: number, opts: { delayMs?: number; onCase?: (r: CaseResult<S>) => void } = {}) {
  const results: CaseResult<S>[] = [];
  for (const c of cases) {
    const runs: CaseRun[] = [];
    let stop = false;
    for (let i = 0; i < repeat; i++) {
      await sleep(opts.delayMs ?? 400);
      const state = game.create();
      const started = performance.now();
      try {
        const out = await resolveEffectTurn(game, provider, state, game.info.opening, c.text);
        const neurons = out.calls.reduce((a, r) => a + (r.usage ? neuronsOf(r.usage) : 0), 0);
        const before = game.book(state), after = game.book(out.state);
        const verdicts: Record<string, Record<string, boolean>> = {};
        for (const [mark, bySubject] of Object.entries(after)) {
          if (before[mark]) continue;
          verdicts[mark] = Object.fromEntries(Object.entries(bySubject).map(([id, v]) => [id, v.fits]));
        }
        let ok = c.expect.judgment.includes(out.judgment) && (!c.expect.check || c.expect.check(out.state));
        let fitsHit: number | undefined, fitsTotal: number | undefined;
        if (c.expect.fits) {
          const got = Object.values(verdicts)[0] ?? {};
          const entries = Object.entries(c.expect.fits);
          fitsTotal = entries.length;
          fitsHit = entries.filter(([id, want]) => got[id] === want).length;
          if (!Object.keys(got).length) ok = false;
        }
        runs.push({ ok, judgment: out.judgment, ms: Math.round(performance.now() - started), neurons, calls: out.calls.length, appraised: out.appraised, formatError: false, speech: out.speech, verdicts, fitsHit, fitsTotal });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'error';
        runs.push({ ok: false, judgment: 'error', ms: Math.round(performance.now() - started), neurons: 0, calls: 0, appraised: false, formatError: isFormatError(message), error: message.slice(0, 120) });
        if (err instanceof QuotaExhausted) { stop = true; break; }
      }
    }
    const result = { case: c, runs };
    results.push(result);
    opts.onCase?.(result);
    if (stop) break;
  }
  return results;
}

export function summarize<S>(results: CaseResult<S>[]) {
  const all = results.flatMap(r => r.runs);
  const ms = all.map(r => r.ms).sort((a, b) => a - b);
  const fitsCases = results.filter(r => r.case.expect.fits);
  const fitsHit = fitsCases.flatMap(r => r.runs).reduce((a, r) => a + (r.fitsHit ?? 0), 0);
  const fitsTotal = fitsCases.flatMap(r => r.runs).reduce((a, r) => a + (r.fitsTotal ?? 0), 0);
  // 揺れ: for 見立て, the share of (case, subject) pairs whose verdict differs between repeats.
  let pairs = 0, unstable = 0;
  for (const r of fitsCases) {
    const vs = r.runs.map(x => Object.values(x.verdicts ?? {})[0]).filter(Boolean) as Record<string, boolean>[];
    if (vs.length < 2) continue;
    for (const id of Object.keys(vs[0])) { pairs++; if (new Set(vs.map(v => v[id])).size > 1) unstable++; }
  }
  const groups = [...new Set(results.map(r => r.case.group))].map(g => {
    const rs = results.filter(r => r.case.group === g).flatMap(r => r.runs);
    return { group: g, ok: rs.filter(r => r.ok).length, total: rs.length };
  });
  return {
    requests: all.reduce((a, r) => a + r.calls, 0), runs: all.length,
    accuracy: all.length ? +(all.filter(r => r.ok).length / all.length).toFixed(3) : 0,
    consistentCases: `${results.filter(r => new Set(r.runs.map(x => x.judgment)).size === 1).length}/${results.length}`,
    formatErrors: all.filter(r => r.formatError).length,
    otherErrors: all.filter(r => r.judgment === 'error' && !r.formatError).length,
    appraisal: fitsTotal ? { validity: +(fitsHit / fitsTotal).toFixed(3), scored: fitsTotal, unstablePairs: `${unstable}/${pairs}` } : null,
    latencyMs: { median: ms[Math.floor(ms.length / 2)] ?? 0, p90: ms[Math.floor(ms.length * 0.9)] ?? 0, max: ms.at(-1) ?? 0 },
    neurons: Math.round(all.reduce((a, r) => a + r.neurons, 0)),
    groups,
  };
}

/** Plays a scripted sequence of messages and returns the AI consumption of the whole play. */
export async function runPlay<S>(game: EffectContentDefinition<S>, provider: Provider, messages: string[], delayMs = 400) {
  let state = game.create();
  const history = structuredClone(game.info.opening);
  let neurons = 0, calls = 0, appraisalCalls = 0;
  const judgments: string[] = [];
  for (const m of messages) {
    await sleep(delayMs);
    const out = await resolveEffectTurn(game, provider, state, history, m);
    neurons += out.calls.reduce((a, r) => a + (r.usage ? neuronsOf(r.usage) : 0), 0);
    calls += out.calls.length;
    if (out.appraised) appraisalCalls++;
    judgments.push(out.judgment);
    state = out.state;
    history.push({ role: 'player', text: m }, { role: 'character', text: out.speech });
  }
  return { neurons: Math.round(neurons * 10) / 10, calls, appraisalCalls, judgments, state };
}
