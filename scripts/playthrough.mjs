import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:3000';
const runs = [
  { name: 'careful', commands: ['周囲を調べて', '包帯で手当て', '川沿いへ', '干し肉を置こう', '周囲を調べて', '上着で覆おう', '草を採ろう', '帰ろう', '川沿いへ'], success: true, remaining: '5分' },
  { name: 'delegate', commands: Array(8).fill('リオに任せる'), success: true, remaining: '15分' },
  { name: 'unexpected', commands: ['ロープを生成して運んで', '橋へ', '追い払おう', '草を採ろう', '草を採ろう', '帰ろう', '川沿いへ'], success: false, remaining: '1分' },
];
await mkdir('play-logs', { recursive: true });
for (const run of runs) {
  const created = await fetch(`${base}/api/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contentId: 'hero-whisper' }) });
  assert.equal(created.status, 200);
  const cookie = created.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  let session = await created.json();
  assert.equal(session.mode, 'mock', 'この確認はモック専用です。実APIでは実行しません。');
  for (const [i, message] of run.commands.entries()) {
    const response = await fetch(`${base}/api/sessions/${session.id}/turn`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ requestId: `${run.name}-${i}-verify`, revision: session.revision, message }) });
    assert.equal(response.status, 200);
    session = await response.json();
  }
  assert.equal(session.state.ending.success, run.success);
  assert.equal(session.state.stats[0].value, run.remaining);
  for (const [format, extension] of [['json', 'json'], ['text', 'txt']]) {
    const log = await fetch(`${base}/api/sessions/${session.id}/log?format=${format}`, { headers: { cookie } });
    assert.equal(log.status, 200);
    await writeFile(`play-logs/verification-${run.name}.${extension}`, await log.text(), 'utf8');
  }
  console.log(`${run.name}: ${session.state.ending.title}, ${run.remaining}, ${session.revision} turns`);
  await fetch(`${base}/api/sessions/${session.id}`, { method: 'DELETE', headers: { cookie, 'content-type': 'application/json' }, body: '{}' });
}
