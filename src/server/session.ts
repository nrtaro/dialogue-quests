import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { contents } from '../content/registry';
import type { AnyContent, ContentDefinition, EffectContentDefinition, Message, PublicState, Provider, SessionView, TurnRecord } from '../game/types';
import { createProvider, parseProposal } from './ai';
import { QuotaExhausted } from './quota';
import { resolveEffectTurn } from './effect-turn';

export const turnSchema = z.object({ requestId: z.string().min(8).max(100), revision: z.number().int().min(0), message: z.string().trim().min(1).max(2000) }).strict();
type TurnInput = z.infer<typeof turnSchema>;
type Pending = { input: string; promise: Promise<SessionView> };
type Session = {
  id: string; owner: string; content: AnyContent; state: unknown; revision: number;
  created: number; messages: Message[]; turns: TurnRecord[]; model: string;
  requests: Map<string, { input: string; view: SessionView }>;
  pending?: { id: string } & Pending;
};
const viewOf = (c: AnyContent, state: unknown): PublicState => c.view(state);

export class GameError extends Error {
  readonly kind = 'dialogue-game-error';
  constructor(message: string, public status = 400, public code?: 'ai-quota', public resetAt?: string) { super(message); }
}
const quotaError = (resetAt: string) =>
  new GameError('今日のAIの利用枠を使い切りました。枠が戻るまでお待ちください。', 429, 'ai-quota', resetAt);
export class SessionStore {
  private sessions = new Map<string, Session>();
  constructor(private provider: Provider, private definitions = contents) {}
  create(contentId: string, owner: string): SessionView {
    const now = Date.now();
    for (const [id, s] of this.sessions) if (now - s.created > 7200000 && !s.pending) this.sessions.delete(id);
    if (this.sessions.size >= 200) throw new GameError('現在セッションが満員です。時間をおいてお試しください。', 503);
    if ([...this.sessions.values()].filter(s => s.owner === owner).length >= 20) throw new GameError('セッション数の上限です。古いセッションをリセットするか2時間後にお試しください。', 429);
    const content = this.definitions.find(c => c.info.id === contentId);
    if (!content) throw new GameError('コンテンツが見つかりません。', 404);
    if (this.provider.budget && !this.provider.budget.canStart()) throw quotaError(this.provider.budget.resetAt());
    const model = this.provider.mode === 'mock' ? 'mock-rules-v1' : this.provider.mode === 'workers-ai' ? process.env.WORKERS_AI_MODEL || '@cf/google/gemma-4-26b-a4b-it' : process.env.OPENAI_MODEL || 'gpt-6-luna';
    const s: Session = { id: randomUUID(), owner, content, state: content.create(), revision: 0, created: now, messages: structuredClone(content.info.opening), turns: [], model, requests: new Map() };
    this.sessions.set(s.id, s);
    return this.view(s);
  }
  private get(id: string, owner: string) {
    const s = this.sessions.get(id);
    if (!s || s.owner !== owner) throw new GameError('セッションが見つかりません。新しく始めてください。', 404);
    if (Date.now() - s.created > 7200000) throw new GameError('セッションの有効期限が切れました。新しく始めてください。', 410);
    return s;
  }
  private view(s: Session): SessionView {
    return structuredClone({ id: s.id, revision: s.revision, info: s.content.info, state: viewOf(s.content, s.state), messages: s.messages, mode: this.provider.mode, model: s.model, turnsLeft: Math.max(0, 100 - s.revision) });
  }
  read(id: string, owner: string) { return this.view(this.get(id, owner)); }
  remove(id: string, owner: string) {
    const s = this.get(id, owner);
    if (s.pending) throw new GameError('応答を処理中です。完了後にリセットしてください。', 409);
    this.sessions.delete(id);
  }
  async turn(id: string, owner: string, raw: TurnInput): Promise<SessionView> {
    const input = turnSchema.parse(raw);
    const s = this.get(id, owner);
    const fingerprint = JSON.stringify(input);
    const existing = s.requests.get(input.requestId);
    if (existing) {
      if (existing.input !== fingerprint) throw new GameError('同じ送信IDの再送で本文を変更できません。', 409);
      return structuredClone(existing.view);
    }
    if (s.pending) {
      if (s.pending.id === input.requestId && s.pending.input === fingerprint) return s.pending.promise;
      throw new GameError('別の応答を処理中です。しばらくお待ちください。', 409);
    }
    if (s.revision !== input.revision) throw new GameError('画面の状態が更新されています。最新状態を読み直してください。', 409);
    if (viewOf(s.content, s.state).ending) throw new GameError('このミッションは終了しています。再挑戦できます。');
    if (s.revision >= 100) throw new GameError('このプレイの会話上限に達しました。ログを保存して再挑戦してください。', 429);
    const promise = this.perform(s, input, fingerprint);
    s.pending = { id: input.requestId, input: fingerprint, promise };
    try { return await promise; } finally { s.pending = undefined; }
  }
  /** Runs the AI and the content rules. Throws before any state is committed. */
  private async resolve(s: Session, message: string) {
    const content = s.content;
    const mock = this.provider.mode === 'mock';
    if (content.kind === 'effect') {
      const c = content as EffectContentDefinition;
      if (!this.provider.interpret) throw new GameError('このAI接続は自由入力のコンテンツに未対応です。', 503);
      const out = await resolveEffectTurn(c, this.provider, s.state, s.messages, message);
      const usage = out.calls.reduce<{ input: number; output: number } | undefined>((sum, r) => r.usage ? { input: (sum?.input ?? 0) + r.usage.input, output: (sum?.output ?? 0) + r.usage.output } : sum, undefined);
      const ai = { proposal: null, model: out.calls[0]?.model ?? 'unknown', ...(usage ? { usage } : {}) };
      return { ai, state: out.state, speech: out.speech, action: `effect:${out.judgment}${out.appraised ? '+appraisal' : ''}`, result: out.result, elapsed: 0, notes: out.notes ?? [] };
    }
    const c = content as ContentDefinition;
    const ai = await this.provider.propose({ content: c.info, situation: c.context(structuredClone(s.state)), actions: c.available(s.state), history: structuredClone(s.messages), message, ...(mock ? { mockProposal: c.mock(structuredClone(s.state), message) } : {}) });
    const proposal = parseProposal(ai.proposal, c.available(s.state));
    const applied = c.apply(structuredClone(s.state), proposal.action);
    return { ai, state: applied.state, speech: proposal.speech, action: proposal.action, result: applied.result, elapsed: applied.elapsed, notes: [] as Message[] };
  }
  private async perform(s: Session, input: TurnInput, fingerprint: string): Promise<SessionView> {
    const started = Date.now();
    const before = structuredClone(viewOf(s.content, s.state));
    let r: Awaited<ReturnType<SessionStore['resolve']>>;
    try { r = await this.resolve(s, input.message); }
    catch (e) { if (e instanceof QuotaExhausted) throw quotaError(e.resetAt); throw e; }
    const after = viewOf(s.content, r.state);
    const record: TurnRecord = { requestId: input.requestId, revision: s.revision + 1, player: input.message, speech: r.speech, action: r.action, before, after: structuredClone(after), elapsed: r.elapsed, result: r.result, model: r.ai.model, ...(r.ai.usage ? { usage: r.ai.usage } : {}), responseMs: Date.now() - started, timestamp: new Date().toISOString() };
    // All fallible external work and validation finish before committing any state.
    s.state = r.state; s.revision++; s.model = r.ai.model;
    s.turns.push(record);
    s.messages.push({ role: 'player', text: input.message }, { role: 'character', text: r.speech }, { role: 'result', text: r.result }, ...r.notes);
    if (after.ending) s.messages.push({ role: 'narrator', text: after.ending.reason });
    const view = this.view(s);
    s.requests.set(input.requestId, { input: fingerprint, view });
    return structuredClone(view);
  }
  export(id: string, owner: string) {
    const s = this.get(id, owner);
    return structuredClone({ systemVersion: '0.2.0', contentId: s.content.info.id, contentVersion: s.content.info.version, scenarioVersion: s.content.info.scenarioVersion, rulesVersion: s.content.info.rulesVersion, sessionId: s.id, mode: this.provider.mode, model: s.model, startedAt: new Date(s.created).toISOString(), initialMessages: s.content.info.opening, initialState: viewOf(s.content, s.content.create()), turns: s.turns, endingReason: viewOf(s.content, s.state).ending?.reason ?? null });
  }
}

const globalStore = globalThis as unknown as { dialogueStore?: SessionStore };
export function store() { return globalStore.dialogueStore ??= new SessionStore(createProvider()); }
