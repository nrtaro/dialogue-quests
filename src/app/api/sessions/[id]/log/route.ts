import { failure, owner } from '../../../../../server/http';
import { store } from '../../../../../server/session';
export const runtime = 'nodejs';
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const log = store().export((await ctx.params).id, await owner());
    const isText = new URL(request.url).searchParams.get('format') === 'text';
    const text = [
      `Dialogue Quests / ${log.contentId} / ${log.mode} / ${log.model}`,
      `セッション: ${log.sessionId}\nルール: ${log.rulesVersion}\n開始: ${log.startedAt}`,
      ...log.initialMessages.map(m => `[${m.role}] ${m.text}`),
      ...log.turns.flatMap(t => [`\n# ${t.revision} / ${t.timestamp}`, `プレイヤー: ${t.player}`, `登場人物（行動前）: ${t.speech}`, `確定行動: ${t.action} / 経過: ${t.elapsed}分`, `結果: ${t.result}`, `状態前: ${JSON.stringify(t.before)}`, `状態後: ${JSON.stringify(t.after)}`, `モデル: ${t.model} / 応答: ${t.responseMs}ms / 使用量: ${JSON.stringify(t.usage ?? null)}`]),
      `\n終了理由: ${log.endingReason ?? '進行中'}`,
    ].join('\n');
    return new Response(isText ? text : JSON.stringify(log, null, 2), { headers: { 'Content-Type': isText ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="dialogue-quests-${log.sessionId}.${isText ? 'txt' : 'json'}"`, 'Cache-Control': 'no-store' } });
  } catch (e) { return failure(e); }
}
