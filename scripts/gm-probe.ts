// Experiment: can the free AI act as a TRPG-style game master?
// The rules roll the dice (outcome tier); the AI decides what happens and writes it into a ledger.
//   npx tsx scripts/gm-probe.ts --run
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const env: Record<string, string> = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = /^([A-Z_]+)=(.*)$/.exec(line.trim()); if (m) env[m[1]] = m[2]; }
const model = env.WORKERS_AI_MODEL || '@cf/google/gemma-4-26b-a4b-it';

const scene = {
  goal: '月白草を手に入れ、日没までに村の薬師へ届ける（残り10ターン、今は3ターン目）',
  ledger: [
    '勇者リオは足に軽いけが。剣・包帯・干し肉1切れ・上着を持っている。',
    '場所は森の分かれ道。左に古い吊り橋、右に川沿いの道。川は流れが速く、幅は20メートルほど。',
    '川向こうの丘に祠があり、台座に月白草がある。祠の前には子どもを守る親子の獣がいる。',
    'プレイヤーは勇者の耳元でささやく妖精。物には触れられない。',
  ],
};
const TIERS: Record<string, string> = {
  great: '大成功：狙い以上にうまくいき、思わぬ得もある',
  success: '成功：狙いどおりになる',
  costly: '成功するが代償がある：狙いは叶うが、別の困りごとや消耗が生まれる',
  setback: '失敗するが前進もある：狙いは外れるが、新しい手がかりや別の道が開ける',
};
const INPUTS: [string, string[]][] = [
  ['川を泳いで渡って', ['success', 'setback']],
  ['剣で吊り橋のロープを結び直して補強してから渡って', ['costly', 'great']],
  ['獣の親子に干し肉を分けてあげて、仲良くなって背中に乗せてもらって', ['great', 'setback']],
  ['大きな声で子守歌を歌って、獣を眠らせて', ['success', 'setback']],
  ['上着を木に結んで旗にして、村の人に助けを呼んで', ['costly', 'success']],
];

const system = [
  'あなたはTRPGのゲームマスターです。子どもから大人まで遊ぶ、短い冒険の進行役です。',
  'プレイヤーの提案は、どんなことでも「挑戦できる」ものとして扱い、その結果をあなたが想像して決めます。',
  '結果の良し悪しはサイコロで決まっています（与えられた結果の段階に必ず従う）。段階に合う、意外で筋の通った展開を書きます。',
  '台帳に書かれた事実は変えません。新しく起きたこと・増えた物・変わった状態は、changesに書きます（これが次からの事実になります）。',
  'ゴールの達成そのものはあなたが宣言しません（goal_reachedは、台帳と今回の出来事からゴールの条件が全部そろった時だけtrue）。',
  'JSONだけを返します：{"difficulty":1〜5,"difficulty_reason":"なぜその難しさか(20字)","narration":"何が起きたか(80〜140字、子どもにも分かる言葉)","rio_line":"勇者リオの一言","changes":["新しい事実を短く",...],"turns_used":1〜3,"goal_reached":false}',
].join('\n');

async function call(input: string, tier: string) {
  const user = `ゴール：${scene.goal}\n台帳（確定した事実）：\n- ${scene.ledger.join('\n- ')}\nプレイヤーの提案：${input}\nサイコロの結果：${TIERS[tier]}`;
  const started = performance.now();
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_completion_tokens: 700, chat_template_kwargs: { enable_thinking: false }, response_format: { type: 'json_object' } }),
    signal: AbortSignal.timeout(60000),
  });
  const body = await res.json() as { result?: { choices?: { message?: { content?: string } }[]; usage?: { neurons?: number } }; errors?: { code: number }[] };
  const text = body.result?.choices?.[0]?.message?.content ?? '';
  let json: unknown = null;
  try { json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { /* recorded below */ }
  return { input, tier, status: res.status, ms: Math.round(performance.now() - started), neurons: body.result?.usage?.neurons ?? null, json, raw: json ? undefined : text.slice(0, 300) };
}

async function main() {
  console.log(`requests=${INPUTS.reduce((a, [, t]) => a + t.length, 0)}`);
  if (!process.argv.includes('--run')) return;
  const out = [];
  for (const [input, tiers] of INPUTS) for (const tier of tiers) {
    const r = await call(input, tier);
    out.push(r);
    console.log(JSON.stringify(r, null, 1));
    await new Promise(res => setTimeout(res, 500));
  }
  mkdirSync('play-logs', { recursive: true });
  writeFileSync(`play-logs/gm-probe-${Date.now()}.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ok: out.filter(r => r.json).length, total: out.length, neurons: Math.round(out.reduce((a, r) => a + (r.neurons ?? 0), 0)), medianMs: out.map(r => r.ms).sort((a, b) => a - b)[Math.floor(out.length / 2)] }));
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'failed'); process.exitCode = 1; });
