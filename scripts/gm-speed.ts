// Speed check for the TRPG game master: same plan/resolve prompts, several free Workers AI models.
//   npx tsx scripts/gm-speed.ts --run [--models=a,b]
// Prints time, tokens, neurons and a short sample per call. Secrets are never printed.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { heroWhisperScenario as S } from '../src/content/scenarios/hero-whisper';
import { createState } from '../src/game/trpg/engine';
import { planPrompt, resolvePrompt } from '../src/game/trpg/prompts';

const env: Record<string, string> = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = /^([A-Z_]+)=(.*)$/.exec(line.trim()); if (m) env[m[1]] = m[2]; }
const DEFAULT_MODELS = [
  '@cf/google/gemma-4-26b-a4b-it',
  '@cf/google/gemma-3-12b-it',
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
  '@cf/qwen/qwen3-30b-a3b-fp8',
];
const models = process.argv.find(a => a.startsWith('--models='))?.slice(9).split(',') ?? DEFAULT_MODELS;

async function call(model: string, system: string, user: string, maxTokens: number) {
  const qwen = /qwen3/.test(model);
  const body: Record<string, unknown> = { messages: [{ role: 'system', content: system }, { role: 'user', content: qwen ? `${user} /no_think` : user }], max_completion_tokens: maxTokens, response_format: { type: 'json_object' } };
  if (/gemma-4/.test(model)) body.chat_template_kwargs = { enable_thinking: false };
  const t0 = performance.now();
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
  }).catch(e => ({ ok: false, status: 0, json: async () => ({ errors: [{ message: String(e?.name) }] }) }) as unknown as Response);
  const ms = Math.round(performance.now() - t0);
  const j = await res.json().catch(() => ({})) as { result?: { choices?: { message?: { content?: string | null; reasoning_content?: string } }[]; response?: unknown; usage?: { prompt_tokens?: number; completion_tokens?: number; neurons?: number } }; errors?: { code?: number; message?: string }[] };
  const r = j.result;
  const msg = r?.choices?.[0]?.message;
  const raw = (msg?.content || msg?.reasoning_content) ?? (typeof r?.response === 'string' ? r.response : r?.response ? JSON.stringify(r.response) : '');
  let parsed: unknown = null;
  try { parsed = JSON.parse(String(raw).replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { /* recorded */ }
  return { status: res.status, ms, input: r?.usage?.prompt_tokens, output: r?.usage?.completion_tokens, neurons: r?.usage?.neurons, json: !!parsed, parsed, error: j.errors?.[0]?.message?.slice(0, 80) };
}

async function main() {
  const st = createState(S);
  const plan = planPrompt(S, st, '川を泳いで渡って', '[narrator] 森の分かれ道。');
  const res = resolvePrompt(S, st, '川を泳いで渡る', 'costly', { tier: 'costly', from: 8, to: 14, label: '渡れるが疲れる', reason: '' });
  console.log(`models=${models.length} calls=${models.length * 4}`);
  if (!process.argv.includes('--run')) return;
  const out: Record<string, unknown>[] = [];
  for (const model of models) {
    for (const [purpose, p] of [['plan', plan], ['resolve', res], ['plan', plan], ['resolve', res]] as const) {
      const r = await call(model, p.system, p.user, p.maxTokens);
      const sample = purpose === 'plan' ? JSON.stringify((r.parsed as { bands?: unknown })?.bands ?? '').slice(0, 90) : String((r.parsed as { narration?: string })?.narration ?? '').slice(0, 90);
      out.push({ model, purpose, ...r, parsed: undefined, sample });
      console.log(`${model.split('/').at(-1)}\t${purpose}\t${r.status}\t${r.ms}ms\tin=${r.input}\tout=${r.output}\tn=${r.neurons?.toFixed?.(1)}\tjson=${r.json}\t${r.error ?? sample}`);
      await new Promise(x => setTimeout(x, 400));
    }
  }
  mkdirSync('play-logs', { recursive: true });
  writeFileSync(`play-logs/gm-speed-${Date.now()}.json`, JSON.stringify(out, null, 2));
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'failed'); process.exitCode = 1; });
