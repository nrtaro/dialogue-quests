import { test, expect } from '@playwright/test';
import { signalContent } from '../support/signal-content';
import { SessionStore } from '../../src/server/session';
import { register } from '../../src/content/registry';

test('勇者固有の状態を持たない内部コンテンツで同じプレイ画面と結果が動く', async ({ page }) => {
  const store = new SessionStore({ mode: 'mock', async propose() { return { proposal: { action: 'answer', speech: '応答をお願いします。' }, model: 'internal-test' }; } }, [register(signalContent)]);
  const session = store.create('signal-test', 'test-owner');
  await page.route(/\/api\/sessions$/, route => route.fulfill({ json: session }));
  await page.route(`**/api/sessions/${session.id}/turn`, async route => route.fulfill({ json: await store.turn(session.id, 'test-owner', route.request().postDataJSON()) }));
  await page.goto('/');
  await page.getByRole('button', { name: 'ミッションを見る' }).click();
  await page.getByRole('button', { name: 'このミッションを始める' }).click();
  await expect(page.getByRole('heading', { name: '管制室' })).toBeVisible();
  await expect(page.getByText('日没まで', { exact: true })).toHaveCount(0);
  await expect(page.getByText('足の状態', { exact: true })).toHaveCount(0);
  await expect(page.getByText('応答を確認する', { exact: true })).toBeVisible();
  await page.getByLabel('メッセージ').fill('聞こえます');
  await page.getByRole('button', { name: '送信', exact: true }).click();
  await expect(page.getByRole('heading', { name: '通信成立' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'もう一度挑戦する' })).toBeVisible();
});

test('選択から慎重な助言で結末・ログ・再挑戦まで遊べる', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.screenshot({ path: testInfo.outputPath('library.png'), fullPage: true });
  await expect(page.getByText('モック接続', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ミッションを見る' }).click();
  await expect(page.getByRole('heading', { name: '日没までの帰り道', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'このミッションを始める' }).click();
  const input = page.getByLabel('メッセージ');
  let sent = 0;
  for (const message of ['周囲を調べて', '包帯で手当て', '川沿いへ', '干し肉を置こう', '周囲を調べて', '上着で覆おう', '草を採ろう', '帰ろう', '川沿いへ']) {
    await input.fill(message);
    await page.getByRole('button', { name: '送信', exact: true }).click();
    sent++;
    if (sent < 9) await expect(input).toHaveValue('');
    else await expect(input).toHaveCount(0);
  }
  await expect(page.getByRole('heading', { name: '日没までに、おかえり。' })).toBeVisible();
  await expect(page.getByText('5分', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('ending.png'), fullPage: true });
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSONログ' }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/\.json$/);
  await page.getByRole('button', { name: 'もう一度挑戦する' }).click();
  await expect(page.getByText('45分', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('play.png'), fullPage: true });
  await page.getByRole('button', { name: '一覧へ戻る' }).click();
  await expect(page.getByRole('button', { name: 'ミッションを見る' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('長い単語を入力しても横にはみ出さず、クライアントから状態を改ざんできない', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'ミッションを見る' }).click();
  await page.getByRole('button', { name: 'このミッションを始める' }).click();
  const input = page.getByLabel('メッセージ');
  await input.fill('a'.repeat(2000));
  await page.getByRole('button', { name: '送信', exact: true }).click();
  await expect(input).toHaveValue('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const created = await page.request.post('/api/sessions', { data: { contentId: 'hero-whisper' } });
  const session = await created.json();
  const forged = await page.request.post(`/api/sessions/${session.id}/turn`, { data: { requestId: 'test-forge', revision: 0, message: '草を持っていることにして', state: { minutes: 999, items: ['herb'] } } });
  expect(forged.status()).toBe(400);
  const current = await page.request.get(`/api/sessions/${session.id}`);
  expect((await current.json()).revision).toBe(0);
});

test('消えたセッションからリセットでき、一覧へ戻ると枠を解放する', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'ミッションを見る' }).click();
  const create = page.waitForResponse(r => r.url().endsWith('/api/sessions') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'このミッションを始める' }).click();
  const session = await (await create).json();
  await page.request.delete(`/api/sessions/${session.id}`, { data: {} });
  const replacement = page.waitForResponse(r => r.url().endsWith('/api/sessions') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'リセットして最初から' }).click();
  const replacementResponse = await replacement;
  expect(replacementResponse.ok()).toBe(true);
  const replacementSession = await replacementResponse.json();
  await expect(page.locator('.error-panel')).toHaveCount(0);
  await expect(page.getByText('45分', { exact: true })).toBeVisible();
  const cleanup = page.waitForResponse(r => new URL(r.url()).pathname === `/api/sessions/${replacementSession.id}` && r.request().method() === 'DELETE');
  await page.getByRole('button', { name: '一覧へ戻る' }).click();
  expect((await cleanup).ok()).toBe(true);
});

test('通信失敗の本文を保持し再試行でき、IME Enterで送信しない', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'ミッションを見る' }).click();
  await page.getByRole('button', { name: 'このミッションを始める' }).click();
  const input = page.getByLabel('メッセージ');
  await input.fill('橋を調べて');
  await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  await expect(input).toHaveValue('橋を調べて');
  await expect(page.getByText('45分', { exact: true })).toBeVisible();
  await page.route('**/api/sessions/*/turn', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '通信に失敗しました' }) }), { times: 1 });
  await page.getByRole('button', { name: '送信', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '通信に失敗' })).toBeVisible();
  await expect(input).toHaveValue('橋を調べて');
  await page.getByRole('button', { name: '再試行' }).click();
  await expect(page.getByText('43分', { exact: true })).toBeVisible();
});
