'use client';

// Play screen for every TRPG scenario. It only reads SceneView/beats (docs/trpg-presentation-data.md),
// so new scenarios need no screen code. Animations are kept minimal; dedicated ones come later.
import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { Message, SessionView } from '../game/types';
import type { Band, Beat, Emotion, SceneView, SpriteRect, SpriteSheet } from '../game/trpg/types';

type Props = {
  session: SessionView; draft: string; busy: boolean; pending: boolean;
  /** Beats received before the turn is finished (attempt + dice). Shown at once; the story follows. */
  preview?: Beat[] | null;
  onDraft: (text: string) => void; onSend: (message: string) => Promise<void>;
  onRestart: () => void; onBack: () => void;
};

const TIER_NAME: Record<Band['tier'], string> = { setback: '前進つき失敗', costly: '代償つき成功', success: '成功', great: '大成功' };
const TIER_MARK: Record<Band['tier'], string> = { setback: '△', costly: '◇', success: '○', great: '★' };

export function Sprite({ sheet, rect, className, label }: { sheet?: SpriteSheet; rect?: SpriteRect; className?: string; label: string }) {
  if (!sheet || !rect) return <div className={`${className ?? ''} sprite-missing`} role="img" aria-label={label} />;
  const style: CSSProperties = {
    aspectRatio: `${rect.w} / ${rect.h}`,
    backgroundImage: `url(${sheet.src})`,
    backgroundSize: `${(sheet.width / rect.w) * 100}% ${(sheet.height / rect.h) * 100}%`,
    backgroundPosition: `${(rect.x / (sheet.width - rect.w)) * 100}% ${(rect.y / (sheet.height - rect.h)) * 100}%`,
  };
  return <div className={className} role="img" aria-label={label} style={style} />;
}

function portrait(scene: SceneView, id: string, emotion: Emotion) {
  const c = scene.cast.find(x => x.id === id);
  const rect = c?.portraits?.[emotion] ?? c?.portraits?.neutral;
  return { rect, sheet: rect ? scene.sheets[rect.sheet] : undefined, name: c?.name ?? '' };
}

function Dice({ beats }: { beats: Beat[] }) {
  const bandsBeat = beats.find(b => b.type === 'dice-bands') as Extract<Beat, { type: 'dice-bands' }> | undefined;
  const roll = beats.find(b => b.type === 'dice-roll') as Extract<Beat, { type: 'dice-roll' }> | undefined;
  const outcome = beats.find(b => b.type === 'outcome') as Extract<Beat, { type: 'outcome' }> | undefined;
  if (!bandsBeat || !roll) return null;
  const tierAt = (f: number) => bandsBeat.bands.find(b => f >= b.from && f <= b.to)?.tier ?? 'setback';
  return <section className={`trpg-dice tier-${roll.tier}`} aria-label="サイコロの結果">
    <div className="trpg-dice-head">
      <span className="trpg-d20" data-natural={roll.natural ?? undefined} aria-label={`出た目 ${roll.face}`}>{roll.face}</span>
      <div><small>挑戦：{bandsBeat.action}（成功以上 {Math.round(bandsBeat.chance.successOrBetter * 100)}%）</small>
        <strong>{TIER_MARK[roll.tier]} {outcome?.title ?? TIER_NAME[roll.tier]}</strong></div>
    </div>
    <ol className="trpg-dice-faces" aria-label="目の割り当て">
      {Array.from({ length: 20 }, (_, i) => i + 1).map(f => <li key={f} className={`tier-${tierAt(f)} ${f === roll.face ? 'hit' : ''}`} title={`${f}`}>{f}</li>)}
    </ol>
    <ul className="trpg-dice-bands">
      {bandsBeat.bands.map(b => <li key={b.tier} className={`tier-${b.tier}`}><b>{TIER_MARK[b.tier]} {b.from === b.to ? b.from : `${b.from}〜${b.to}`}</b> {b.label}</li>)}
    </ul>
  </section>;
}

function LogItem({ m, scene }: { m: Message; scene: SceneView }) {
  if (m.role === 'player') return <li className="trpg-log player"><span>あなた</span><p>{m.text}</p></li>;
  if (m.role === 'character') {
    const p = portrait(scene, scene.heroId, 'neutral');
    return <li className="trpg-log hero"><Sprite className="trpg-avatar" sheet={p.sheet} rect={p.rect} label={p.name} /><p>{m.text}</p></li>;
  }
  if (m.role === 'result') return <li className="trpg-log result"><p>{m.text}</p></li>;
  return <li className="trpg-log note"><p>{m.text}</p></li>;
}

export function TrpgStage({ session, preview, draft, busy, pending, onDraft, onSend, onRestart, onBack }: Props) {
  const scene = session.state.scene as SceneView;
  const ending = session.state.ending;
  const scroll = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  // While the story is being written, show the attempt and the dice that have already arrived.
  const beats = preview ?? scene.lastBeats;
  const pendingAttempt = preview?.find(b => b.type === 'attempt') as Extract<Beat, { type: 'attempt' }> | undefined;
  const pendingPlayer = preview?.find(b => b.type === 'player') as Extract<Beat, { type: 'player' }> | undefined;
  const messages: Message[] = [
    ...session.messages,
    ...(pendingPlayer ? [{ role: 'player' as const, text: pendingPlayer.text }] : []),
    ...(pendingAttempt?.line ? [{ role: 'character' as const, text: pendingAttempt.line.text }] : []),
  ];
  useLayoutEffect(() => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [messages.length]);
  const heroEmotion = pendingAttempt?.line?.emotion ?? scene.heroEmotion;
  const hero = portrait(scene, scene.heroId, heroEmotion);
  const fairyId = scene.cast.find(c => c.player)?.id;
  const fairy = fairyId ? portrait(scene, fairyId, busy ? 'thinking' : 'happy') : null;
  const lastHeroLine = [...beats].reverse().map(b => (b.type === 'attempt' ? b.line?.text : b.type === 'line' && b.speaker === scene.heroId ? b.text : undefined)).find(Boolean)
    ?? session.messages.filter(m => m.role === 'character').at(-1)?.text;
  const length = [...draft].length;
  const over = length > scene.inputMax;
  const send = () => { if (!busy && !pending && draft.trim() && !over) void onSend(draft); };

  return <main className="trpg">
    <header className="trpg-top">
      <div className="trpg-title"><span className="small-kicker">{session.info.scenario}</span><h1>{session.info.title}</h1></div>
      <div className="trpg-goals" aria-label="ゴール">
        <p className="trpg-objective">目標 ▶ {session.info.objective}</p>
        <ol>{scene.goals.map(g => <li key={g.id} className={g.status}><span aria-hidden="true">{g.status === 'done' ? '✓' : ''}</span>{g.label}<span className="sr-only">{g.status === 'done' ? '（達成）' : '（まだ）'}</span></li>)}</ol>
      </div>
      {scene.clock && <div className={`trpg-clock phase-${scene.clock.phase}`} aria-label={`${scene.clock.name}：${scene.clock.phaseLabel}`}>
        <small>{scene.clock.name}</small>
        <div className="trpg-sun-track"><span className="trpg-sun" style={{ left: `${Math.min(100, scene.clock.value * 100)}%` }} aria-hidden="true">☀</span></div>
        <strong>{scene.clock.phaseLabel}</strong>
      </div>}
      <button className="exit-button" disabled={busy} onClick={onBack}>一覧へ</button>
    </header>

    <div className="trpg-grid">
      <section className="trpg-scene" style={{ backgroundImage: `url(${scene.background})` }} aria-label={`場面：${scene.location.label}`}>
        <span className="trpg-location">📍 {scene.location.label}</span>
        <Dice beats={beats} />
        {lastHeroLine && <p className="trpg-bubble">{lastHeroLine}</p>}
        <Sprite className="trpg-hero" sheet={hero.sheet} rect={hero.rect} label={`${hero.name}（${heroEmotion}）`} />
        {fairy && <Sprite className="trpg-fairy" sheet={fairy.sheet} rect={fairy.rect} label="あなた（ナビ妖精）" />}
      </section>

      <section className="trpg-side">
        <div className="trpg-status" aria-label="いまの状況">
          {scene.forecast && <p className={`trpg-forecast ${scene.forecast.verdict}`}>
            <span aria-hidden="true">🧭</span> 次は「{scene.forecast.goal}」：{scene.forecast.place}まで{scene.forecast.travel}（{scene.clock?.name ?? '残り'} {scene.forecast.left}）
            <b>{scene.forecast.verdict === 'ok' ? '間に合いそう' : scene.forecast.verdict === 'tight' ? 'ぎりぎり' : 'かなり厳しい'}</b>
          </p>}
          {scene.obstacles.length > 0 && <p className="trpg-chips"><span>⚠ 残っている障害</span>{scene.obstacles.map(o => <em key={o.id}>{o.label}</em>)}</p>}
          {scene.hooks.length > 0 && <p className="trpg-chips"><span>👀 いま目につくもの</span>{scene.hooks.map(h => <em key={h}>{h}</em>)}</p>}
        </div>
        <div className="trpg-log-head"><h2>会話（これまでのやりとり）</h2></div>
        <div className="trpg-log-scroll" ref={scroll} tabIndex={0} aria-label="会話の記録">
          <ol role="log" aria-live="polite">{messages.map((m, i) => <LogItem key={i} m={m} scene={scene} />)}</ol>
        </div>
        <div className="trpg-memo">
          <span>🎒 {scene.items.map(i => `${i.name}${i.damaged ? '（傷）' : ''}`).join('・') || 'なし'}</span>
          <button disabled={busy || !!ending} onClick={() => void onSend('ここまでで採点')}>ここまでで採点</button>
        </div>
      </section>
    </div>

    {ending ? <section className={`trpg-ending ${ending.success ? 'clear' : ''}`}>
      <span className="ending-stamp">{ending.success ? 'CLEAR!' : 'FINISH!'}</span>
      <div><h2>{ending.title}</h2><p>{ending.reason}</p></div>
      <div className="trpg-ending-actions"><button className="primary" disabled={busy} onClick={onRestart}>もう一度 ↻</button><button disabled={busy} onClick={onBack}>ゲーム選択へ</button></div>
    </section> : <form className="trpg-input" onSubmit={e => { e.preventDefault(); send(); }}>
      <label htmlFor="trpg-message" className="sr-only">{session.info.characterName}へのアドバイス</label>
      <textarea id="trpg-message" value={draft} rows={2} disabled={busy || pending} placeholder={`${session.info.characterName}へのアドバイスを入力…（何でもOK）`}
        onChange={e => onDraft(e.target.value)}
        onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !composing.current) { e.preventDefault(); send(); } }} />
      <span className={`trpg-count ${over ? 'over' : ''}`}>{length}/{scene.inputMax}</span>
      <button className="primary" type="submit" disabled={busy || pending || !draft.trim() || over}>送信 ➤</button>
    </form>}
  </main>;
}
