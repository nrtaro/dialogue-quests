import { body, failure, json, owner } from '../../../../../server/http';
import { store, turnSchema } from '../../../../../server/session';
export const runtime = 'nodejs';
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try { return json(await store().turn((await ctx.params).id, await owner(), turnSchema.parse(await body(request)))); } catch (e) { return failure(e); }
}
