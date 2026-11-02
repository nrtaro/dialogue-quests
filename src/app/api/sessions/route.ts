import { z } from 'zod';
import { body, failure, json, owner } from '../../../server/http';
import { store } from '../../../server/session';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const input = z.object({ contentId: z.string().max(100) }).strict().parse(await body(request));
    return json(store().create(input.contentId, await owner(true)));
  } catch (e) { return failure(e); }
}
