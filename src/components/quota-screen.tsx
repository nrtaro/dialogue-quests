'use client';

/** Shown when today's free AI allowance is used up. Play is not possible until the reset. */
export function QuotaScreen({ resetAt, inPlay, busy, onRetry, onBack }: { resetAt: string; inPlay: boolean; busy: boolean; onRetry: () => void; onBack: () => void }) {
  const when = new Date(resetAt);
  const label = Number.isNaN(when.getTime()) ? '明日' : when.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return <main className="quota-screen" role="alert" aria-labelledby="quota-title">
    <div className="quota-card">
      <span className="quota-stamp" aria-hidden="true">おやすみ中</span>
      <p className="small-kicker">AI TIME OUT</p>
      <h1 id="quota-title">今日のAIは、もう<br />くたくたです。</h1>
      <p>このゲームは無料のAIで動いていて、1日に使える量が決まっています。今日の分を使い切ったので、いまは遊べません。</p>
      <p className="quota-reset"><span>次に遊べるのは</span><strong>{label}ごろ</strong></p>
      {inPlay && <p className="quota-note">遊んでいた途中の状態は変わっていません。時間になったら「もう一度ためす」を押すと、続きから遊べます（2時間を過ぎると最初からになります）。</p>}
      <div className="quota-actions">
        <button className="primary" disabled={busy} onClick={onRetry}>もう一度ためす <span aria-hidden="true">↻</span></button>
        <button disabled={busy} onClick={onBack}>一覧へ戻る</button>
      </div>
    </div>
  </main>;
}
