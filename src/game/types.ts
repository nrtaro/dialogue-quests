import type { AiDefinition } from './ai-definition';
import type { AppraisalBook, AppraisalNeed } from './appraisal';
import type { ScenarioDefinition, SceneView, TrpgState } from './trpg/types';

export type Ending = { success: boolean; title: string; reason: string };
export type Message = { role: 'narrator' | 'character' | 'player' | 'result'; text: string };
export type VisualAsset = { src: string; alt: string; position?: string };
export type ContentVisuals = Partial<Record<'thumbnail' | 'background' | 'character' | 'player', VisualAsset>>;
export type ContentInfo = {
  id: string; version: string; scenarioVersion: string; rulesVersion: string;
  title: string; scenario: string; summary: string; objective: string;
  playerName: string; characterName: string; playerRole: string; delegateLabel: string;
  duration: string; opening: Message[]; playNotes?: string[];
  visuals?: ContentVisuals;
};
export type PublicState = {
  location: string; stats: { label: string; value: string; tone?: 'warning' }[];
  inventory: string[]; discoveries: string[]; privateInfo: string[]; ending: Ending | null;
  /** TRPG games only: everything the play screen needs (clock, goals, dice beats, sprites). */
  scene?: SceneView;
};
export type ActionOption = { id: string; label: string; cost: string };
export type Applied<S> = { state: S; result: string; elapsed: number };
export interface ContentDefinition<S = unknown> {
  kind?: 'action';
  info: ContentInfo;
  create(): S;
  available(state: S): ActionOption[];
  apply(state: S, action: string): Applied<S>;
  view(state: S): PublicState;
  context(state: S): string;
  mock(state: S, message: string): { action: string; speech: string };
}
/**
 * Result of judging one effect proposal (docs: detailed-definition §2).
 * `needs` means: the rules cannot decide until these 見立て are recorded. Nothing has changed yet.
 */
export type EffectOutcome<S> = { state: S; judgment: string; speech: string; result: string; notes?: Message[]; needs?: AppraisalNeed };
/** Content that accepts free-form effect proposals instead of a fixed action list. */
export interface EffectContentDefinition<S = unknown> {
  kind: 'effect';
  info: ContentInfo;
  /** Common definition items: marks, natural things, delegation, 見立て, confirm templates. */
  ai: AiDefinition;
  create(): S;
  view(state: S): PublicState;
  context(state: S): string;
  /** Instructions and strict JSON schema the AI must follow when interpreting the player's words. */
  interpreter: { instructions: string; schema: Record<string, unknown> };
  /** Rule-based stand-in for the AI. */
  mock(state: S, message: string): unknown;
  /** Pure: validates the proposal, then returns the new state. Never throws for odd AI output. */
  judge(state: S, message: string, proposal: unknown): EffectOutcome<S>;
  /** Where the 見立て are kept in this game's state. */
  book(state: S): AppraisalBook;
  withBook(state: S, book: AppraisalBook): S;
  /** Ask the player back without changing anything else (one turn passes). */
  askBack(state: S, line: string, note: string): EffectOutcome<S>;
}
/** A game on the common TRPG engine: the scenario is data; rules, dice and clock are shared. */
export interface TrpgContentDefinition {
  kind: 'trpg';
  info: ContentInfo;
  scenario: ScenarioDefinition;
  create(): TrpgState;
  view(state: TrpgState): PublicState;
}
export type AnyContent = ContentDefinition | EffectContentDefinition | TrpgContentDefinition;
/** A free-form JSON request to the AI (TRPG game master). `mock` is returned by the mock provider. */
export type CompleteRequest = { purpose: string; system: string; user: string; maxTokens: number; mock: unknown };
export type AppraiseContext = { content: ContentInfo; need: AppraisalNeed; instructions: string; mockVerdicts?: unknown };
export type InterpretContext = {
  content: ContentInfo; situation: string; history: Message[]; message: string;
  interpreter: EffectContentDefinition['interpreter']; mockProposal?: unknown;
};
export type Proposal = { action: string; speech: string };
export type ProviderContext = {
  content: ContentInfo; situation: string; actions: ActionOption[];
  history: Message[]; message: string;
  mockProposal?: Proposal;
};
export type AIResult = { proposal: unknown; model: string; usage?: { input: number; output: number } };
export interface Provider {
  mode: 'mock' | 'openai' | 'workers-ai';
  /** Daily free-tier budget. Absent for providers without one. */
  budget?: { canStart(): boolean; resetAt(): string };
  propose(context: ProviderContext): Promise<AIResult>;
  interpret?(context: InterpretContext): Promise<AIResult>;
  /** 見立て: one call answers every (mark, subject) pair in the need. */
  appraise?(context: AppraiseContext): Promise<AIResult>;
  /** Free-form JSON completion (TRPG game master). */
  complete?(request: CompleteRequest): Promise<AIResult>;
}
export type TurnRecord = {
  requestId: string; revision: number; player: string; speech: string; action: string;
  before: PublicState; after: PublicState; elapsed: number; result: string;
  model: string; usage?: { input: number; output: number }; responseMs: number; timestamp: string;
};
export type SessionView = {
  id: string; revision: number; info: ContentInfo; state: PublicState;
  messages: Message[]; mode: Provider['mode']; model: string; turnsLeft: number;
};
