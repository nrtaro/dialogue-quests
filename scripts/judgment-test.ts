// CLI for the common judgment-test runner. Game data lives with each game.
//   npx tsx scripts/judgment-test.ts --set=appraisal            → plan only
//   npx tsx scripts/judgment-test.ts --set=appraisal --run      → sends requests to the free AI
//   --set=tuning | holdout | appraisal | play     --repeat=3 (default)
// Secrets are read from .env.local and never printed. Results go to play-logs/ (not in Git).
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { cleaningRobot } from '../src/content/cleaning-robot/content';
import { APPRAISAL, HOLDOUT, PLAYS, TUNING } from '../src/content/cleaning-robot/judgment-cases';
import { runCases, runPlay, summarize, type CaseResult } from '../src/server/judgment-runner';
import { DailyBudget } from '../src/server/quota';
import { WorkersAIProvider } from '../src/server/workers-ai';

const GAMES = { 'cleaning-robot': { game: cleaningRobot, sets: { tuning: TUNING, holdout: HOLDOUT, appraisal: APPRAISAL }, plays: PLAYS } } as const;

function arg(name: string, fallback: string) { return process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback; }
function env(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = /^([A-Z_]+)=(.*)$/.exec(line.trim()); if (m) out[m[1]] = m[2]; }
  return out;
}

async function main() {
  const entry = GAMES[arg('game', 'cleaning-robot') as keyof typeof GAMES];
  if (!entry) throw Error('unknown game');
  const setName = arg('set', 'appraisal');
  const repeat = Number(arg('repeat', '3'));
  const cases = setName === 'play' ? [] : entry.sets[setName as keyof typeof entry.sets];
  if (setName !== 'play' && !cases) throw Error('unknown set');
  console.log(`game=${entry.game.info.id} set=${setName} cases=${cases.length} repeat=${repeat}`);
  if (!process.argv.includes('--run')) return;
  const e = env();
  if (!/^[a-f0-9]{32}$/.test(e.CLOUDFLARE_ACCOUNT_ID ?? '') || !/^cfut_\S{20,}$/.test(e.CLOUDFLARE_API_TOKEN ?? '')) throw Error('credentials missing in .env.local');
  const model = e.WORKERS_AI_MODEL || '@cf/google/gemma-4-26b-a4b-it';
  const provider = new WorkersAIProvider(e.CLOUDFLARE_ACCOUNT_ID, e.CLOUDFLARE_API_TOKEN, model, new DailyBudget(10000, 0));
  mkdirSync('play-logs', { recursive: true });

  if (setName === 'play') {
    const report: Record<string, unknown> = { model };
    for (const [name, messages] of Object.entries(entry.plays)) {
      const runs = [];
      for (let i = 0; i < repeat; i++) { const r = await runPlay(entry.game, provider, messages); runs.push({ neurons: r.neurons, calls: r.calls, appraisalCalls: r.appraisalCalls, judgments: r.judgments }); }
      report[name] = runs;
      console.log(name, JSON.stringify(runs));
    }
    writeFileSync(`play-logs/judgment-play-${Date.now()}.json`, JSON.stringify(report, null, 2));
    return;
  }

  const print = (r: CaseResult<unknown>) => {
    const mark = r.runs.map(x => (x.ok ? '○' : '×')).join('');
    const detail = r.runs.map(x => `${x.judgment}${x.appraised ? '+見立て' : ''}${x.fitsTotal ? `(${x.fitsHit}/${x.fitsTotal})` : ''}${x.error ? `[${x.error.slice(0, 40)}]` : ''}`).join(' | ');
    console.log(`${String(r.case.id).padStart(3)} ${mark} ${r.case.text} → ${detail}`);
  };
  const results = await runCases(entry.game, provider, cases as never, repeat, { onCase: print as never });
  const summary = { model, set: setName, ...summarize(results) };
  console.log(JSON.stringify(summary, null, 2));
  writeFileSync(`play-logs/judgment-${setName}-${Date.now()}.json`, JSON.stringify({ summary, results: results.map(r => ({ case: { id: r.case.id, text: r.case.text, group: r.case.group, fits: r.case.expect.fits }, runs: r.runs })) }, null, 2));
}
main().catch(err => { console.error(err instanceof Error ? err.message : 'failed'); process.exitCode = 1; });
