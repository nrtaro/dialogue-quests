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
};
export type ActionOption = { id: string; label: string; cost: string };
export type Applied<S> = { state: S; result: string; elapsed: number };
export interface ContentDefinition<S = unknown> {
  info: ContentInfo;
  create(): S;
  available(state: S): ActionOption[];
  apply(state: S, action: string): Applied<S>;
  view(state: S): PublicState;
  context(state: S): string;
  mock(state: S, message: string): { action: string; speech: string };
}
export type Proposal = { action: string; speech: string };
export type ProviderContext = {
  content: ContentInfo; situation: string; actions: ActionOption[];
  history: Message[]; message: string;
  mockProposal?: Proposal;
};
export type AIResult = { proposal: unknown; model: string; usage?: { input: number; output: number } };
export interface Provider { mode: 'mock' | 'openai'; propose(context: ProviderContext): Promise<AIResult> }
export type TurnRecord = {
  requestId: string; revision: number; player: string; speech: string; action: string;
  before: PublicState; after: PublicState; elapsed: number; result: string;
  model: string; usage?: { input: number; output: number }; responseMs: number; timestamp: string;
};
export type SessionView = {
  id: string; revision: number; info: ContentInfo; state: PublicState;
  messages: Message[]; mode: Provider['mode']; model: string; turnsLeft: number;
};
