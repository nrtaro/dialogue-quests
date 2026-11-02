import type { ContentInfo } from '../game/types';
import { defaultVisuals, resolveVisuals } from '../game/presentation';
import { Artwork } from './artwork';

export function MissionLibrary({ contents, onSelect }: { contents: ContentInfo[]; onSelect: (info: ContentInfo) => void }) {
  return <main className="library">
    <section className="library-hero">
      <div className="hero-copy">
        <span className="eyebrow label-sticker">会話が主役のミッションゲーム</span>
        <h1>ひと言で、<br /><span>まさかの展開。</span></h1>
        <p>正解のセリフなんて、ない。<br />聞いて、ひらめいて、あなたの言葉で物語を動かそう。</p>
        <div className="hero-tags"><span>ひとりで気軽に</span><span>自由なことばで</span><span>短いミッション</span></div>
      </div>
      <div className="hero-illustration" aria-hidden="true">
        <div className="burst-sticker">えっ、<br />そう来る!?</div>
        <Artwork asset={defaultVisuals.character} fallback={defaultVisuals.character} contain priority />
        <span className="floating-word word-one">なるほど!</span><span className="floating-word word-two">その手があった。</span>
      </div>
    </section>
    <div className="section-heading"><div><span className="section-number">01</span><h2>どの世界で、話そう？</h2></div><span className="available-count">{String(contents.length).padStart(2, '0')} MISSION</span></div>
    <div className="mission-grid">
      <div className="mission-list">{contents.map((info, i) => {
        const visuals = resolveVisuals(info.visuals);
        return <article key={info.id} className="mission-card">
          <div className="mission-art"><Artwork asset={visuals.thumbnail} fallback={defaultVisuals.thumbnail} priority={i === 0} /><span className="card-number">MISSION {String(i + 1).padStart(2, '0')}</span><span className="playtime">◷ {info.duration}</span></div>
          <div className="card-body"><span className="card-category">ことばで挑む、ショートミッション</span><h3>{info.title}</h3><p className="scenario-title">{info.scenario}</p><p className="card-summary">{info.summary}</p><button className="primary" onClick={() => onSelect(info)}>ミッションを見る <span aria-hidden="true">↗</span></button></div>
        </article>;
      })}</div>
      <aside className="how-to-card"><span className="small-kicker">HOW TO PLAY</span><h3>することは、<br />おしゃべり。</h3><ol><li><b>01</b><div><strong>まずは聞いてみる</strong><p>相手の言葉に、ヒントがあるかも。</p></div></li><li><b>02</b><div><strong>あなたの案を伝える</strong><p>大胆な提案も、ちょっとした質問も。</p></div></li><li><b>03</b><div><strong>その先を見届ける</strong><p>どんな結末になるかは、会話しだい。</p></div></li></ol><span className="note-sticker">うまくいかなくても、もう一回！</span></aside>
    </div>
    <p className="library-caption">ただいま初回プレイテスト中。次のミッションは、みなさんの感想をもとに。</p>
  </main>;
}

export function MissionBriefing({ info, busy, onBack, onStart }: { info: ContentInfo; busy: boolean; onBack: () => void; onStart: () => void }) {
  const visuals = resolveVisuals(info.visuals);
  return <main className="briefing">
    <button className="text-button" disabled={busy} onClick={onBack}>← 一覧へ戻る</button>
    <div className="briefing-board">
      <div className="brief-art"><Artwork asset={visuals.thumbnail} fallback={defaultVisuals.thumbnail} priority /><span className="label-sticker">次の舞台は、ここ！</span></div>
      <div className="brief-main"><p className="small-kicker">MISSION BRIEFING</p><h1>{info.title}</h1><h2>{info.scenario}</h2><p className="brief-summary">{info.summary}</p>
        <section className="brief-objective"><span className="small-kicker">今回の目的</span><p>{info.objective}</p></section>
        <section className="brief-role"><Artwork asset={visuals.player} fallback={defaultVisuals.player} contain /><div><h3>{info.playerName}</h3><p>{info.playerRole}</p></div></section>
        <details className="brief-rules"><summary>遊び方・今回のルール</summary><p>質問したり提案したり、あなたの言葉で話しかけてみましょう。返ってきた言葉と行動結果を見て、次の一手を考えます。</p>{info.playNotes?.map(note => <p key={note}>{note}</p>)}</details>
        <button className="primary start-button" disabled={busy} onClick={onStart}>{busy ? '準備しています…' : 'このミッションを始める'}<span aria-hidden="true">→</span></button>
      </div>
    </div>
  </main>;
}
