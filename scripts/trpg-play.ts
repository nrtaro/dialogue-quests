// Plays a scripted TRPG session against the free AI, without a server, and times each call.
//   npx tsx scripts/trpg-play.ts --run
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { heroWhisperScenario as S } from '../src/content/scenarios/hero-whisper';
import { createState, sceneOf } from '../src/game/trpg/engine';
import type { Provider } from '../src/game/types';
import type { Message } from '../src/game/types';
import { DailyBudget } from '../src/server/quota';
import { beatsToMessages, resolveTrpgTurn } from '../src/server/trpg-turn';
import { neuronsOf, WorkersAIProvider } from '../src/server/workers-ai';

const MESSAGES = (process.argv.find(a => a.startsWith('--say='))?.slice(6).split('|')) ?? [
  '川を泳いで渡って', '子獣は無視して、祠の草を取って', '草におまじないを唱えてみて', '村まで帰って', '薬師に月白草を渡して',
];
const env: Record<string, string> = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = /^([A-Z_]+)=(.*)$/.exec(line.trim()); if (m) env[m[1]] = m[2]; }

async function main() {
  if (!process.argv.includes('--run')) { console.log(`turns=${MESSAGES.length}`); return; }
  const inner = new WorkersAIProvider(env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_API_TOKEN, env.WORKERS_AI_MODEL || '@cf/google/gemma-4-26b-a4b-it', new DailyBudget(10000, 0));
  inner.planModel = env.WORKERS_AI_PLAN_MODEL === 'same' ? undefined : env.WORKERS_AI_PLAN_MODEL || '@cf/qwen/qwen3-30b-a3b-fp8';
  const timings: { purpose: string; ms: number; neurons: number }[] = [];
  const provider: Provider = { ...inner, mode: 'workers-ai', propose: inner.propose.bind(inner), complete: async req => {
    const t0 = performance.now(); const r = await inner.complete(req);
    timings.push({ purpose: req.purpose, ms: Math.round(performance.now() - t0), neurons: r.usage ? Math.round(neuronsOf(r.usage) * 10) / 10 : 0 });
    return r;
  } };
  let st = createState(S);
  const history: Message[] = [{ role: 'narrator', text: S.opening.narration }, { role: 'character', text: S.opening.heroLine.text }];
  const log: string[] = [];
  for (const m of MESSAGES) {
    const before = timings.length; const t0 = performance.now();
    const out = await resolveTrpgTurn(S, provider, st, history, m);
    st = out.state;
    const msg = beatsToMessages(S, out.beats);
    history.push({ role: 'player', text: m }, { role: 'character', text: msg.speech }, { role: 'result', text: msg.result });
    const roll = out.beats.find(b => b.type === 'dice-roll');
    const bands = out.beats.find(b => b.type === 'dice-bands');
    const scene = sceneOf(S, st);
    log.push([
      `■${m}｜合計${Math.round(performance.now() - t0)}ms（${timings.slice(before).map(t => `${t.purpose} ${t.ms}ms/${t.neurons}n`).join('、')}）`,
      bands && roll && bands.type === 'dice-bands' && roll.type === 'dice-roll' ? `  🎲${roll.face}→${roll.tier}（成功以上${Math.round(bands.chance.successOrBetter * 100)}%）` : '  （サイコロなし）',
      ...out.beats.filter(b => ['outcome', 'narration', 'line', 'change', 'goal', 'obstacle', 'ending'].includes(b.type)).map(b =>
        b.type === 'line' ? `  ${b.speaker}「${b.text}」` : b.type === 'change' ? `  ◆${b.kind}:${b.label}` : b.type === 'goal' ? `  ✓${b.label}` : b.type === 'obstacle' ? `  ★解決：${b.label}` : b.type === 'ending' ? `  【終】${b.title}` : b.type === 'outcome' ? `  ＜${b.title}＞` : b.type === 'narration' ? `  ${b.text}` : ''),
      `  [場所:${scene.location.label}｜持ち物:${scene.items.map(i => i.name).join(',')}｜時計:${st.clock}]`,
      `  [見込み:${scene.forecast ? `${scene.forecast.goal}→${scene.forecast.place}まで${scene.forecast.travel}／残り${scene.forecast.left}／${scene.forecast.verdict}` : 'なし'}]`,
      `  [障害:${scene.obstacles.map(o => o.label).join(',') || 'なし'}｜目につくもの:${scene.hooks.join(',') || 'なし'}]`,
    ].join('\n'));
    console.log(log.at(-1));
    if (st.ending) break;
  }
  const plan = timings.filter(t => t.purpose === 'plan'), res = timings.filter(t => t.purpose === 'resolve');
  const avg = (a: { ms: number }[]) => Math.round(a.reduce((x, y) => x + y.ms, 0) / Math.max(1, a.length));
  const summary = { turns: st.turn, planAvgMs: avg(plan), resolveAvgMs: avg(res), neurons: Math.round(timings.reduce((a, t) => a + t.neurons, 0)), goals: st.goals };
  console.log(JSON.stringify(summary));
  mkdirSync('play-logs', { recursive: true });
  writeFileSync(`play-logs/trpg-play-${Date.now()}.json`, JSON.stringify({ summary, log, timings }, null, 2));
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'failed'); process.exitCode = 1; });
