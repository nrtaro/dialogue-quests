import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { contents } from '../content/registry';
import type { ContentDefinition, Message, Provider, SessionView, TurnRecord } from '../game/types';
import { createProvider, parseProposal } from './ai';

export const turnSchema = z.object({ requestId: z.string().min(8).max(100), revision: z.number().int().min(0), message: z.string().trim().min(1).max(2000) }).strict();
type TurnInput = z.infer<typeof turnSchema>;
type Pending = { input: string; promise: Promise<SessionView> };
type Session = {
  id: string; owner: string; content: ContentDefinition; state: unknown; revision: number;
  created: number; messages: Message[]; turns: TurnRecord[]; model: string;
  requests: Map<string, { input: string; view: SessionView }>;
  pending?: { id: string } & Pending;
};
export class GameError extends Error {
  readonly kind = 'dialogue-game-error';
  constructor(message: string, public status = 400) { super(message); }
}
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
    const s: Session = { id: randomUUID(), owner, content, state: content.create(), revision: 0, created: now, messages: structuredClone(content.info.opening), turns: [], model: this.provider.mode === 'mock' ? 'mock-rules-v1' : process.env.OPENAI_MODEL || 'gpt-6-luna', requests: new Map() };
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
    return structuredClone({ id: s.id, revision: s.revision, info: s.content.info, state: s.content.view(s.state), messages: s.messages, mode: this.provider.mode, model: s.model, turnsLeft: Math.max(0, 100 - s.revision) });
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
    if (s.content.view(s.state).ending) throw new GameError('このミッションは終了しています。再挑戦できます。');
    if (s.revision >= 100) throw new GameError('このプレイの会話上限に達しました。ログを保存して再挑戦してください。', 429);
    const promise = this.perform(s, input, fingerprint);
    s.pending = { id: input.requestId, input: fingerprint, promise };
    try { return await promise; } finally { s.pending = undefined; }
  }
  private async perform(s: Session, input: TurnInput, fingerprint: string): Promise<SessionView> {
    const started = Date.now();
    const before = structuredClone(s.content.view(s.state));
    const ai = await this.provider.propose({ content: s.content.info, situation: s.content.context(structuredClone(s.state)), actions: s.content.available(s.state), history: structuredClone(s.messages), message: input.message, ...(this.provider.mode === 'mock' ? { mockProposal: s.content.mock(structuredClone(s.state), input.message) } : {}) });
    const proposal = parseProposal(ai.proposal, s.content.available(s.state));
    const applied = s.content.apply(structuredClone(s.state), proposal.action);
    const after = s.content.view(applied.state);
    const record: TurnRecord = { requestId: input.requestId, revision: s.revision + 1, player: input.message, speech: proposal.speech, action: proposal.action, before, after: structuredClone(after), elapsed: applied.elapsed, result: applied.result, model: ai.model, ...(ai.usage ? { usage: ai.usage } : {}), responseMs: Date.now() - started, timestamp: new Date().toISOString() };
    // All fallible external work and validation finish before committing any state.
    s.state = applied.state; s.revision++; s.model = ai.model;
    s.turns.push(record);
    s.messages.push({ role: 'player', text: input.message }, { role: 'character', text: proposal.speech }, { role: 'result', text: applied.result });
    if (after.ending) s.messages.push({ role: 'narrator', text: after.ending.reason });
    const view = this.view(s);
    s.requests.set(input.requestId, { input: fingerprint, view });
    return structuredClone(view);
  }
  export(id: string, owner: string) {
    const s = this.get(id, owner);
    return structuredClone({ systemVersion: '0.1.0', contentId: s.content.info.id, contentVersion: s.content.info.version, scenarioVersion: s.content.info.scenarioVersion, rulesVersion: s.content.info.rulesVersion, sessionId: s.id, mode: this.provider.mode, model: s.model, startedAt: new Date(s.created).toISOString(), initialMessages: s.content.info.opening, initialState: s.content.view(s.content.create()), turns: s.turns, endingReason: s.content.view(s.state).ending?.reason ?? null });
  }
}

const globalStore = globalThis as unknown as { dialogueStore?: SessionStore };
export function store() { return globalStore.dialogueStore ??= new SessionStore(createProvider()); }
