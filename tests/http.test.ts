import { expect, it, vi } from 'vitest';
import { body, failure, owner } from '../src/server/http';
import { GameError, turnSchema } from '../src/server/session';

const cookieState = vi.hoisted(() => ({ value: '', expires: 0 }));
vi.mock('next/headers', () => ({ cookies: async () => ({
  get: () => cookieState.value ? { value: cookieState.value } : undefined,
  set: (_name: string, value: string, options: { maxAge: number }) => { cookieState.value = value; cookieState.expires = Date.now() + options.maxAge * 1000; },
}) }));

it('新しいセッションを作ると既存の所有者cookieの期限も2時間延長する', async () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date('2026-11-02T12:00:00Z'));
    const first = await owner(true);
    vi.setSystemTime(new Date('2026-11-02T13:59:00Z'));
    expect(await owner(true)).toBe(first);
    expect(cookieState.expires).toBe(new Date('2026-11-02T15:59:00Z').getTime());
  } finally { vi.useRealTimers(); }
});

it('外部Originと非JSON・壊れたJSON・巨大な入力を拒否する', async () => {
  for (const request of [
    new Request('http://localhost/api/sessions', { method: 'POST', headers: { origin: 'https://outside.example', 'content-type': 'application/json' }, body: '{}' }),
    new Request('http://localhost/api/sessions', { method: 'POST', body: '{}' }),
    new Request('http://localhost/api/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' }),
    new Request('http://localhost/api/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'a'.repeat(12001) }),
  ]) await expect(body(request)).rejects.toThrow();
});
it('Next.jsが内部URLをlocalhostへ正規化しても実際のHostと同じOriginを許可する', async () => {
  const req = new Request('http://localhost:3000/api/sessions', { method: 'POST', headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'content-type': 'application/json' }, body: '{"contentId":"hero-whisper"}' });
  expect(await body(req)).toEqual({ contentId: 'hero-whisper' });
});
it('クライアントの状態上書きと2000文字を超える本文を拒否する', () => {
  const input = { requestId: 'request-0001', revision: 0, message: '助言' };
  expect(() => turnSchema.parse({ ...input, state: { minutes: 999 } })).toThrow();
  expect(() => turnSchema.parse({ ...input, message: '長'.repeat(2001) })).toThrow();
  expect(() => turnSchema.parse({ ...input, message: '  ' })).toThrow();
});
it('上流のエラーに秘密が含まれてもブラウザに返さない', async () => {
  const res = failure(Error('upstream sk-secret-key-value'));
  expect(res.status).toBe(503);
  expect(await res.text()).not.toContain('sk-secret');
});
it('開発時のモジュール再読込後も既存セッションの404を正しく返す', async () => {
  const original = new GameError('セッションが見つかりません。', 404);
  vi.resetModules();
  const { failure: reloadedFailure } = await import('../src/server/http');
  expect(reloadedFailure(original).status).toBe(404);
});
