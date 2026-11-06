import { body, failure, json, owner } from '../../../../../server/http';
import { store, turnSchema } from '../../../../../server/session';
import type { Beat } from '../../../../../game/trpg/types';
export const runtime = 'nodejs';

/**
 * A normal request gets the finished turn as JSON.
 * With `Accept: application/x-ndjson`, the turn is streamed in two stages:
 *   {"type":"preview","beats":[…dice…]}   as soon as the die is rolled (TRPG games)
 *   {"type":"done","view":{…}}            when the story is written and committed
 *   {"type":"error","status":…,"error":…} if anything fails (state unchanged)
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  let id: string, who: string, input: ReturnType<typeof turnSchema.parse>;
  try { id = (await ctx.params).id; who = await owner(); input = turnSchema.parse(await body(request)); }
  catch (e) { return failure(e); }
  if (!request.headers.get('accept')?.includes('application/x-ndjson')) {
    try { return json(await store().turn(id, who, input)); } catch (e) { return failure(e); }
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(data)}\n`));
      try {
        const view = await store().turn(id, who, input, (beats: Beat[]) => send({ type: 'preview', beats }));
        send({ type: 'done', view });
      } catch (e) {
        const res = failure(e);
        send({ type: 'error', status: res.status, ...(await res.json()) });
      } finally { controller.close(); }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}
