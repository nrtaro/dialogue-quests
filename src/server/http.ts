import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { GameError } from './session';

export async function owner(create = false): Promise<string> {
  const jar = await cookies();
  const existing = jar.get('dq-owner')?.value;
  if (existing && !create) return existing;
  if (!existing && !create) throw new GameError('セッションが見つかりません。新しく始めてください。', 404);
  const value = existing || randomUUID();
  jar.set('dq-owner', value, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE === 'true', path: '/', maxAge: 7200 });
  return value;
}
export async function body(request: Request): Promise<unknown> {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host') || new URL(request.url).host;
  if (origin) {
    let source: URL;
    try { source = new URL(origin); } catch { throw new GameError('送信元の形式が不正です。', 403); }
    if (!['http:', 'https:'].includes(source.protocol) || source.host !== host) throw new GameError('この送信元からは操作できません。', 403);
  }
  if (!request.headers.get('content-type')?.includes('application/json')) throw new GameError('JSON形式で送信してください。', 415);
  const text = await request.text();
  if (text.length > 12000) throw new GameError('入力が長すぎます。', 413);
  try { return JSON.parse(text); } catch { throw new GameError('入力形式が不正です。'); }
}
export function json(data: unknown) { return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } }); }
export function failure(error: unknown) {
  // A development reload can leave a live store holding the previous module's class.
  if (error instanceof Error && 'kind' in error && error.kind === 'dialogue-game-error' && 'status' in error && typeof error.status === 'number' && error.status >= 400 && error.status < 600) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError) return NextResponse.json({ error: '入力またはAI応答の形式が不正です。本文は2000文字以内で入力してください。状態は変更していません。' }, { status: 400 });
  // Never return SDK errors, headers, credentials, or raw upstream error bodies.
  return NextResponse.json({ error: '応答を取得できませんでした。状態は変更していません。再試行できます。AI接続の場合はサーバーのAPIキー・利用枠・モデル設定も確認してください。' }, { status: 503 });
}
