'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { ContentInfo, SessionView } from '../game/types';
import { MissionLibrary, MissionBriefing } from './mission-menu';
import { MissionStage } from './mission-stage';
import { QuotaScreen } from './quota-screen';

type Attempt = { requestId: string; revision: number; message: string };
class RequestError extends Error { constructor(message: string, public status: number, public code?: string, public resetAt?: string) { super(message); } }
async function request<T>(url: string, method: string, data?: unknown): Promise<T> {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }), signal: AbortSignal.timeout(50000) });
  const result = await response.json();
  if (!response.ok) throw new RequestError(result.error || '通信できませんでした。再試行できます。', response.status, result.code, result.resetAt);
  return result as T;
}
async function removeSession(id: string) {
  try { await request(`/api/sessions/${id}`, 'DELETE', {}); }
  catch (e) { if (!(e instanceof RequestError) || ![404, 410].includes(e.status)) throw e; }
}

export function Game({ contents, mode }: { contents: ContentInfo[]; mode: 'mock' | 'openai' | 'workers-ai' }) {
  const [selected, setSelected] = useState<ContentInfo | null>(null);
  const [session, setSession] = useState<SessionView | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [quota, setQuota] = useState<string | null>(null);
  const fail = (e: unknown, fallback: string) => {
    if (e instanceof RequestError && e.code === 'ai-quota') { setQuota(e.resetAt ?? ''); setError(''); return; }
    setError(e instanceof Error ? e.message : fallback);
  };
  const lock = useRef(false);
  const shell = useRef<HTMLDivElement>(null);
  const playing = !!session;

  useLayoutEffect(() => {
    if (!playing || !shell.current) return;
    const element = shell.current;
    const viewport = window.visualViewport;
    const update = () => {
      const height = viewport?.height ?? window.innerHeight;
      element.style.setProperty('--play-viewport-height', `${height}px`);
      element.style.setProperty('--play-viewport-top', `${viewport?.offsetTop ?? 0}px`);
      element.dataset.shortViewport = String(height <= 580);
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      element.style.removeProperty('--play-viewport-height');
      element.style.removeProperty('--play-viewport-top');
      delete element.dataset.shortViewport;
    };
  }, [playing]);

  async function start(info: ContentInfo) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (session) { await removeSession(session.id); setSession(null); }
      setSelected(info);
      const next = await request<SessionView>('/api/sessions', 'POST', { contentId: info.id });
      setSession(next); setSelected(info); setDraft(''); setAttempt(null); setQuota(null);
    } catch (e) { fail(e, '開始できませんでした。'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function send(message: string, retry = false) {
    if (lock.current || !session || !message.trim()) return;
    const next = retry && attempt ? attempt : { requestId: crypto.randomUUID(), revision: session.revision, message: message.trim() };
    lock.current = true; setBusy(true); setError(''); setAttempt(next);
    try {
      const result = await request<SessionView>(`/api/sessions/${session.id}/turn`, 'POST', next);
      setSession(result); setDraft(''); setAttempt(null); setQuota(null);
    } catch (e) { fail(e, '通信できませんでした。本文を残しています。'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function refresh() {
    if (!session || lock.current) return;
    setBusy(true); lock.current = true;
    try { setSession(await request<SessionView>(`/api/sessions/${session.id}`, 'GET')); setAttempt(null); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : '最新状態を取得できませんでした。'); }
    finally { setBusy(false); lock.current = false; }
  }
  async function download(format: 'json' | 'text') {
    if (!session) return;
    try {
      const res = await fetch(`/api/sessions/${session.id}/log?format=${format}`);
      if (!res.ok) throw Error('ログを取得できませんでした。セッションの有効期限を確認してください。');
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement('a'); link.href = url; link.download = `dialogue-quests-${session.id}.${format === 'text' ? 'txt' : 'json'}`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : 'ログ出力に失敗しました。'); }
  }
  async function back() {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      if (session) await removeSession(session.id);
      setSession(null); setSelected(null); setDraft(''); setAttempt(null); setError(''); setQuota(null);
    } catch (e) { setError(e instanceof Error ? e.message : '一覧に戻れませんでした。'); }
    finally { lock.current = false; setBusy(false); }
  }

  return <div ref={shell} className={`app-shell ${session ? 'is-playing' : ''}`}>
    <header className="topbar">
      <button className="brand" disabled={busy} onClick={back} aria-label="Dialogue Quests ホーム"><span className="brand-symbol">DQ</span><span>DIALOGUE<br /><b>QUESTS</b></span></button>
      <span className="brand-tagline">そのひと言、予想外。</span><span className="version">PLAYTEST <b>01</b></span>
    </header>
    <div className={`connection ${mode}`}><span className="dot" /><strong>{mode === 'mock' ? 'モック接続' : mode === 'workers-ai' ? '無料AI接続' : 'OpenAI 接続設定'}</strong><span>{mode === 'mock' ? '動作確認モード · 自由入力への応答は限定的です' : mode === 'workers-ai' ? 'Cloudflare Workers AIの無料枠で応答します · 1日に使える量に上限があります' : 'サーバー経由で応答します · API利用料が発生します'}</span></div>
    {quota !== null && <QuotaScreen resetAt={quota} inPlay={!!session} busy={busy} onRetry={() => { if (session && attempt) void send(attempt.message, true); else if (session) setQuota(null); else if (selected) void start(selected); else setQuota(null); }} onBack={back} />}
    {quota === null && !session && !selected && <MissionLibrary contents={contents} onSelect={setSelected} />}
    {quota === null && !session && selected && <MissionBriefing info={selected} busy={busy} onBack={back} onStart={() => void start(selected)} />}
    {quota === null && session && <MissionStage key={session.id} session={session} draft={draft} busy={busy} pending={!!attempt} onDraft={setDraft} onSend={send} onRestart={() => void start(session.info)} onBack={back} onDownload={format => void download(format)} />}
    {error && <div className="error-panel" role="alert"><strong>ちょっと待って！</strong><p>{error}</p><div>{session && attempt && <button disabled={busy} onClick={() => void send(attempt.message, true)}>再試行</button>}{session && <button disabled={busy} onClick={refresh}>最新状態を読み直す</button>}<button disabled={busy} onClick={() => { setAttempt(null); setError(''); }}>閉じて編集する</button></div></div>}
    <footer><span>会話でひらく、ちいさな世界。</span><span>DIALOGUE QUESTS / EARLY PLAYTEST</span></footer>
  </div>;
}
