// Daily free-tier budget for the AI (docs: free-ai-quality-design §5).
// There is no paid fallback: when the budget is gone, play stops until the reset.

export class QuotaExhausted extends Error {
  readonly kind = 'ai-quota';
  constructor(public resetAt: string) { super('今日のAIの利用枠を使い切りました。'); }
}

/** Cloudflare's free allocation resets at 00:00 UTC (09:00 in Japan). */
export function nextResetUtc(now = new Date()): string {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return next.toISOString();
}

/**
 * Our own running count of today's usage. Other use of the same account is not seen here,
 * so the provider also treats the upstream "allocation used up" error as exhaustion.
 */
export class DailyBudget {
  private day = '';
  private used = 0;
  constructor(readonly limit: number, readonly reservePerPlay: number, private now: () => Date = () => new Date()) {}
  private roll() {
    const day = this.now().toISOString().slice(0, 10);
    if (day !== this.day) { this.day = day; this.used = 0; }
  }
  record(amount: number) { this.roll(); if (Number.isFinite(amount) && amount > 0) this.used += amount; }
  exhaust() { this.roll(); this.used = Math.max(this.used, this.limit); }
  remaining() { this.roll(); return Math.max(0, this.limit - this.used); }
  /** A new play needs room for a whole play, with margin, so it is unlikely to stop midway. */
  canStart() { return this.remaining() >= this.reservePerPlay * 1.5; }
  resetAt() { return nextResetUtc(this.now()); }
}
