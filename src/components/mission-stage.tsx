'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ContentInfo, Message, PublicState, SessionView } from '../game/types';
import { defaultVisuals, resolveVisuals } from '../game/presentation';
import { Artwork } from './artwork';

type StageProps = {
  session: SessionView; draft: string; busy: boolean; pending: boolean;
  onDraft: (text: string) => void; onSend: (message: string) => Promise<void>;
  onRestart: () => void; onBack: () => void; onDownload: (format: 'json' | 'text') => void;
};

export function MissionStage({ session, draft, busy, pending, onDraft, onSend, onRestart, onBack, onDownload }: StageProps) {
  const { info, state } = session;
  const visuals = resolveVisuals(info.visuals);
  const scroll = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const follow = useRef(true);
  const composing = useRef(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useLayoutEffect(() => {
    const element = scroll.current;
    if (element && follow.current) element.scrollTop = element.scrollHeight;
  }, [session.id, session.messages.length, busy]);

  async function send(message: string) {
    follow.current = true;
    await onSend(message);
    requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
  }

  return <main className="play">
    <header className="mission-objective">
      <span className="objective-label">MISSION!</span>
      <div className="objective-copy"><p>{info.objective}</p><span>{info.title} / {info.scenario}</span></div>
      <div className="location"><span>ただいま</span><h1>{state.location}</h1></div>
      <button className="exit-button" disabled={busy} onClick={onBack}>一覧へ戻る <span aria-hidden="true">↗</span></button>
    </header>
    <div className="play-grid">
      <aside className="character-stage" aria-label="登場人物">
        <Artwork asset={visuals.background} fallback={defaultVisuals.background} className="stage-background" />
        <span className="stage-corner" aria-hidden="true">LET’S TALK!</span>
        <div className="partner-name"><span>対話の相手</span><h2>{info.characterName}</h2></div>
        <Artwork asset={visuals.character} fallback={defaultVisuals.character} contain className="character-art" priority />
        <div className="stage-sticker" aria-hidden="true">あなたのひと言、<br /><b>待ってます。</b></div>
        <div className="player-badge"><Artwork asset={visuals.player} fallback={defaultVisuals.player} contain /><div><small>YOU</small><strong>{info.playerName}</strong></div></div>
      </aside>
      <div className="conversation-column">
        <section className="conversation" aria-label="会話履歴" aria-busy={busy}>
          <div className="conversation-heading"><h2><span aria-hidden="true">◌</span> おしゃべりログ</h2><span>{String(session.revision).padStart(2, '0')} TALK</span></div>
          <div className="conversation-scroll" data-testid="conversation-scroll" ref={scroll} tabIndex={0} aria-label="会話履歴をスクロール" onScroll={() => {
            const element = scroll.current;
            if (element) follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 64;
          }}>
            <div className="log-start"><span>ここから、あなたの物語。</span></div>
            <div role="log" aria-live="polite" aria-relevant="additions">
              {session.messages.map((message, i) => <MessageBubble key={`${session.id}-${i}`} message={message} info={info} />)}
            </div>
            {busy && <div className="waiting" role="status"><span className="thinking-dots" aria-hidden="true">● ● ●</span>相手の応答を待っています…</div>}
          </div>
        </section>
        {state.ending ? <section className={`ending ${state.ending.success ? 'success' : ''}`}>
          <span className="ending-stamp">{state.ending.success ? 'CLEAR!' : 'FINISH!'}</span>
          <div><p className="small-kicker">今回の結末</p><h2>{state.ending.title}</h2><p className="ending-reason">{state.ending.reason}</p><p className="reflection">{session.revision}回の対話がつくった、この結末。ログを見返して、次のひと言を考えてみよう。</p></div>
          <button className="primary" disabled={busy} onClick={onRestart}>もう一度挑戦する <span aria-hidden="true">↻</span></button>
        </section> : <form className="composer" onSubmit={event => { event.preventDefault(); void send(draft); }}>
          <div className="composer-label"><label htmlFor="message">{info.characterName}に、どう伝える？</label><span>{draft.length}/2000</span></div>
          <div className="input-row"><textarea id="message" ref={input} value={draft} maxLength={2000} disabled={busy || pending || !session.turnsLeft}
            placeholder="質問でも、思いついた作戦でも！" onChange={event => onDraft(event.target.value)}
            onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
            onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.nativeEvent.keyCode !== 229) { event.preventDefault(); void send(draft); } }} aria-label="メッセージ" />
            <button className="primary send-button" type="submit" disabled={busy || !draft.trim() || pending || !session.turnsLeft}>送信 <span aria-hidden="true">↑</span></button>
          </div>
          <div className="composer-footer"><button className="delegate" type="button" disabled={busy || pending || !session.turnsLeft} onClick={() => void send(info.delegateLabel)}>{info.delegateLabel} <span aria-hidden="true">→</span></button><span>Enterで送信 · Shift＋Enterで改行</span></div>
          {!session.turnsLeft && <p className="turn-limit">会話上限に達しました。ログを保存して再挑戦できます。</p>}
        </form>}
      </div>
      <aside className="sidebar">
        <section className="status-panel"><h2><span aria-hidden="true">✦</span> いまの状況</h2><div className="stats">{state.stats.slice(0, 3).map(stat => <div className={`stat ${stat.tone || ''}`} key={stat.label}><span>{stat.label}</span><strong>{stat.value}</strong></div>)}</div>
          {state.inventory.length > 0 && <div className="inventory-summary"><h3>持ち物</h3><div className="items">{state.inventory.slice(0, 6).map(item => <span key={item}>{item}</span>)}{state.inventory.length > 6 && <span>ほか{state.inventory.length - 6}個</span>}</div></div>}
        </section>
        {state.privateInfo.length > 0 && <section className="private-panel"><h2>あなただけの情報</h2><p>{state.privateInfo[0]}</p><button onClick={() => setDetailsOpen(true)}>詳しく見る →</button></section>}
        <button className="discovery-button" onClick={() => setDetailsOpen(true)}><span>発見したこと</span><b>{state.discoveries.length}</b><span aria-hidden="true">↗</span></button>
        <div className="play-tools"><button className="info-button" onClick={() => setDetailsOpen(true)}>状況・ヒント</button><button onClick={() => onDownload('json')}>JSONログ</button><button onClick={() => onDownload('text')}>テキストログ</button><button aria-label="リセットして最初から" disabled={busy} onClick={onRestart}>やり直す <span aria-hidden="true">↻</span></button></div>
        <p className="session-note">会話 {session.revision}/100 · 記録は2時間まで<br />サーバー再起動で消えるため、必要なログは保存してください。</p>
      </aside>
    </div>
    {detailsOpen && <StatusDialog info={info} state={state} onClose={() => setDetailsOpen(false)} />}
  </main>;
}

function MessageBubble({ message, info }: { message: Message; info: ContentInfo }) {
  const { role, text } = message;
  const visuals = resolveVisuals(info.visuals);
  const name = role === 'character' ? info.characterName : role === 'player' ? info.playerName : role === 'result' ? '行動結果（確定）' : '状況';
  const asset = role === 'character' ? visuals.character : visuals.player;
  return <article className={`message ${role}`}>
    <div className="message-label">{(role === 'character' || role === 'player') && <Artwork asset={asset} fallback={role === 'character' ? defaultVisuals.character : defaultVisuals.player} contain />}<strong>{name}</strong>{role === 'character' && <small>行動前のことば</small>}{role === 'result' && <span aria-hidden="true">✓</span>}</div>
    <p>{text}</p>
  </article>;
}

function StatusDialog({ info, state, onClose }: { info: ContentInfo; state: PublicState; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog className="status-dialog" ref={dialog} aria-labelledby="status-dialog-title" onClose={onClose}>
    <div className="dialog-heading"><div><span className="small-kicker">MISSION NOTE</span><h2 id="status-dialog-title">状況とヒント</h2></div><button aria-label="詳細を閉じる" onClick={() => dialog.current?.close()}>✕</button></div>
    <div className="dialog-body"><section><h3>今回の目的</h3><p>{info.objective}</p></section><section><h3>{state.location}</h3>{state.stats.map(stat => <p key={stat.label}>{stat.label}：{stat.value}</p>)}</section>
      {state.inventory.length > 0 && <section><h3>持ち物</h3><div className="items">{state.inventory.map(item => <span key={item}>{item}</span>)}</div></section>}
      {state.privateInfo.length > 0 && <section><h3>あなただけの情報</h3>{state.privateInfo.map(text => <p key={text}>{text}</p>)}</section>}
      <section><h3>発見したこと</h3>{state.discoveries.length ? state.discoveries.map(text => <p key={text}>{text}</p>) : <p>気になることを調べると、ここに記録されます。</p>}</section>
      {info.playNotes && <section><h3>今回のルール</h3>{info.playNotes.map(text => <p key={text}>{text}</p>)}</section>}
    </div>
  </dialog>;
}
