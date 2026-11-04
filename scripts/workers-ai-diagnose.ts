// Sends one tiny request and prints only the HTTP status and Cloudflare error codes/messages (no secrets).
import { readFileSync } from 'node:fs';

const env: Record<string, string> = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2];
}
const model = env.WORKERS_AI_MODEL || '@cf/google/gemma-4-26b-a4b-it';
const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages: [{ role: 'user', content: 'OKとだけ返して' }], max_completion_tokens: 8, chat_template_kwargs: { enable_thinking: false } }),
});
const body = await res.json().catch(() => ({}));
const errors = Array.isArray(body.errors) ? body.errors.map((e: { code?: number; message?: string }) => ({ code: e.code, message: String(e.message ?? '').slice(0, 200) })) : [];
const retryAfter = res.headers.get('retry-after');
console.log(JSON.stringify({ status: res.status, retryAfter, errors, success: body.success, usage: body.result?.usage ?? null }, null, 2));
