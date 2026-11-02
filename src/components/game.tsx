'use client';

import { useRef, useState } from 'react';
import type { ContentInfo, Message, SessionView } from '../game/types';

type Attempt = { requestId: string; revision: number; message: string };
class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }
async function request<T>(url: string, method: string, data?: unknown): Promise<T> {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }), signal: AbortSignal.timeout(35000) });
  const result = await response.json();
  if (!response.ok) throw new RequestError(result.error || '通信できませんでした。再試行できます。', response.status);
  return result as T;
}
async function removeSession(id: string) {
  try { await request(`/api/sessions/${id}`, 'DELETE', {}); }
  catch (e) { if (!(e instanceof RequestError) || ![404, 410].includes(e.status)) throw e; }
}

export function Game({ contents, mode }: { contents: ContentInfo[]; mode: 'mock' | 'openai' }) {
  const [selected, setSelected] = useState<ContentInfo | null>(null);
  const [session, setSession] = useState<SessionView | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const lock = useRef(false);
  const composing = useRef(false);
  const latest = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  async function start(info: ContentInfo) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (session) { await removeSession(session.id); setSession(null); }
      setSelected(info);
      const next = await request<SessionView>('/api/sessions', 'POST', { contentId: info.id });
      setSession(next); setSelected(info); setDraft(''); setAttempt(null);
    } catch (e) { setError(e instanceof Error ? e.message : '開始できませんでした。'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function send(message: string, retry = false) {
    if (lock.current || !session || !message.trim()) return;
    const next = retry && attempt ? attempt : { requestId: crypto.randomUUID(), revision: session.revision, message: message.trim() };
    lock.current = true; setBusy(true); setError(''); setAttempt(next);
    try {
      const result = await request<SessionView>(`/api/sessions/${session.id}/turn`, 'POST', next);
      setSession(result); setDraft(''); setAttempt(null);
      setTimeout(() => { latest.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); input.current?.focus({ preventScroll: true }); }, 50);
    } catch (e) { setError(e instanceof Error ? e.message : '通信できませんでした。本文を残しています。'); }
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
      setSession(null); setSelected(null); setDraft(''); setAttempt(null); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : '一覧に戻れませんでした。'); }
    finally { lock.current = false; setBusy(false); }
  }

  return <div className="app-shell">
    <header className="topbar"><button className="brand" disabled={busy} onClick={back} aria-label="Dialogue Quests ホーム"><span className="brand-symbol">✳</span> DIALOGUE <span className="brand-light">QUESTS</span></button><span className="version">PLAYTEST <span>01</span></span></header>
    <div className={`connection ${mode}`}><span className="dot" /><strong>{mode === 'mock' ? 'モック接続' : 'OpenAI 接続設定'}</strong><span>{mode === 'mock' ? 'APIキー未使用・入力の対応範囲は限定的です' : 'サーバー経由で応答します・API利用料が発生します'}</span></div>
    {!session && !selected && <main className="library">
      <div className="intro"><p className="eyebrow">A SMALL ADVENTURE, IN YOUR WORDS</p><h1>そのひと言で、<br />物語が動きだす。</h1><p className="intro-copy">尋ねる、伝える、考える。<br />自由な対話で目的を目指す、小さなミッション集。</p><span className="edition">初回プレイテスト版 · 正式タイトル未定</span></div>
      <div className="section-label"><h2>ミッションを選ぶ</h2><span>01 AVAILABLE</span></div>
      <div className="mission-grid">{contents.map((info, i) => <article key={info.id} className="mission-card">
        <div className="mission-art" aria-hidden="true"><span className="art-sun" /><span className="art-hill back" /><span className="art-hill front" /><span className="art-path" /><span className="art-spark">✧</span><span className="art-caption">BEFORE THE SUN GOES DOWN</span><span className="card-number">0{i + 1}</span></div>
        <div className="card-body"><div className="card-meta"><span>対話 × 冒険</span><span>◷ {info.duration}</span></div><h3>{info.title}</h3><p className="scenario-title">{info.scenario}</p><p className="card-summary">{info.summary}</p><button className="primary" onClick={() => setSelected(info)}>ミッションを見る <span aria-hidden="true">↗</span></button></div>
      </article>)}<aside className="library-note"><span className="note-mark">“</span><p>剣を振るう代わりに、<br />ことばを選ぶ。</p><p className="muted">決まった選択肢だけではない冒険。<br />思いついたことを、あなたの言葉で。</p><div className="note-bottom">ひとりで遊ぶ / PC・スマートフォン対応<br />画像・音声の生成はありません</div></aside></div>
    </main>}
    {!session && selected && <main className="briefing">
      <button className="text-button" disabled={busy} onClick={back}>← 一覧へ戻る</button><p className="eyebrow">MISSION BRIEFING / 01</p><h1>{selected.title}</h1><h2>{selected.scenario}</h2><p className="brief-summary">{selected.summary}</p>
      <div className="brief-panels"><section><span className="eyebrow">YOUR OBJECTIVE</span><h3>今回の目的</h3><p>{selected.objective}</p></section><section><span className="eyebrow">YOUR ROLE</span><h3>{selected.playerName}</h3><p>{selected.playerRole}</p></section></div>
      <div className="howto"><h3>遊び方</h3><ol><li>相手に質問し、状況や考えを聞いてみましょう。</li><li>あなたの言葉で助言や提案を伝えましょう。</li><li>返ってきた言葉と行動結果を見て、次の一手を考えましょう。</li></ol>{selected.playNotes?.map(note => <p key={note}>{note}</p>)}</div>
      <button className="primary start-button" disabled={busy} onClick={() => start(selected)}>{busy ? '準備しています…' : 'このミッションを始める'}<span aria-hidden="true">→</span></button>
    </main>}
    {session && <main className="play">
      <div className="play-heading"><div><p className="eyebrow">{session.info.title} / {session.info.scenario}</p><h1>{session.state.location}</h1></div><button className="text-button" disabled={busy} onClick={back}>一覧へ戻る</button></div>
      <div className="play-grid"><aside className="sidebar">
        <section className="objective"><span className="eyebrow">OBJECTIVE</span><h2>今回の目的</h2><p>{session.info.objective}</p></section>
        <section className="status-panel"><h2>いまの状況</h2>{session.state.stats.map(stat => <div className={`stat ${stat.tone || ''}`} key={stat.label}><span>{stat.label}</span><strong>{stat.value}</strong></div>)}{session.state.inventory.length > 0 && <><h3>持ち物</h3><div className="items">{session.state.inventory.map(item => <span key={item}>{item}</span>)}</div></>}</section>
        {session.state.privateInfo.length > 0 && <section className="private-panel"><h2>✧ あなただけの情報</h2>{session.state.privateInfo.map(p => <p key={p}>{p}</p>)}</section>}
        <details className="discoveries"><summary>発見したこと <span>{session.state.discoveries.length}</span></summary>{session.state.discoveries.length ? session.state.discoveries.map(p => <p key={p}>{p}</p>) : <p>気になることを調べると、ここに残ります。</p>}</details>
        <div className="log-controls"><button onClick={() => download('json')}>JSONログ</button><button onClick={() => download('text')}>テキストログ</button></div><button className="text-button reset" disabled={busy} onClick={() => start(session.info)}>リセットして最初から</button>
        <p className="session-note">会話 {session.revision}/100 · 保存期限2時間<br />サーバー再起動で記録は消えます。<br />{session.mode === 'mock' ? 'mock-rules-v1' : session.model}</p>
      </aside><div className="conversation-column">
        <section className="conversation" aria-label="会話履歴" aria-live="polite" aria-busy={busy}>
          <div className="conversation-top"><span>ADVENTURE LOG</span><span>言葉を交わして、道を見つけよう</span></div>
          {session.messages.map((m, i) => <MessageBubble key={`${session.id}-${i}`} message={m} info={session.info} />)}
          {busy && <div className="waiting" role="status"><span className="dot" />相手の応答を待っています…</div>}<div ref={latest} />
        </section>
        {session.state.ending ? <section className={`ending ${session.state.ending.success ? 'success' : ''}`}><p className="eyebrow">{session.state.ending.success ? 'MISSION COMPLETE' : 'JOURNEY ENDED'}</p><h2>{session.state.ending.title}</h2><p>{session.state.ending.reason}</p><div className="reflection"><h3>今回の道のりを振り返る</h3><p>{session.revision}回の対話で、ここまでたどり着きました。どの言葉が判断に影響したか、ログから振り返ってみましょう。</p></div><button className="primary" disabled={busy} onClick={() => start(session.info)}>もう一度挑戦する <span>↻</span></button></section> : <form className="composer" onSubmit={e => { e.preventDefault(); send(draft); }}>
          <label htmlFor="message">{session.info.characterName}に、どう伝える？</label>
          <textarea id="message" ref={input} value={draft} maxLength={2000} disabled={busy || !!attempt} placeholder="気になることを質問したり、思いついた方法を伝えてみよう。" onChange={e => setDraft(e.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !composing.current && e.nativeEvent.keyCode !== 229) { e.preventDefault(); send(draft); } }} aria-label="メッセージ" />
          <div className="composer-actions"><button type="button" className="delegate" disabled={busy || !!attempt || !session.turnsLeft} onClick={() => send(session.info.delegateLabel)}>{session.info.delegateLabel} <span>→</span></button><div><span className="character-count">{draft.length}/2000</span><button className="primary" disabled={busy || !draft.trim() || !!attempt || !session.turnsLeft} type="submit">送信 <span aria-hidden="true">↑</span></button></div></div><p className="input-hint">Enterで送信 · Shift＋Enterで改行</p>
        </form>}
      </div></div>
    </main>}
    {error && <div className="error-panel" role="alert"><p>{error}</p><div>{session && attempt && <button disabled={busy} onClick={() => send(attempt.message, true)}>再試行</button>}{session && <button disabled={busy} onClick={refresh}>最新状態を読み直す</button>}<button disabled={busy} onClick={() => { setAttempt(null); setError(''); }}>閉じて編集する</button></div></div>}
    <footer>ことばで動かす、小さな冒険。<span>DIALOGUE QUESTS — EARLY PLAYTEST</span></footer>
  </div>;
}

function MessageBubble({ message: m, info }: { message: Message; info: ContentInfo }) {
  const name = m.role === 'character' ? info.characterName : m.role === 'player' ? info.playerName : m.role === 'result' ? '行動結果（確定）' : '状況';
  return <article className={`message ${m.role}`}><div className="message-label">{m.role === 'character' && <span className="avatar">{info.characterName.slice(0, 1)}</span>}<span>{name}</span>{m.role === 'character' && <small>行動前のことば</small>}</div><p>{m.text}</p></article>;
}
