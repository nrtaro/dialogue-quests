import { body, failure, json, owner } from '../../../../server/http';
import { store } from '../../../../server/session';
type Context = { params: Promise<{ id: string }> };
export const runtime = 'nodejs';
export async function GET(_request: Request, ctx: Context) {
  try { return json(store().read((await ctx.params).id, await owner())); } catch (e) { return failure(e); }
}
export async function DELETE(request: Request, ctx: Context) {
  try { await body(request); store().remove((await ctx.params).id, await owner()); return json({ ok: true }); } catch (e) { return failure(e); }
}
