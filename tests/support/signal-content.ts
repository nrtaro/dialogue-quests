import type { ContentDefinition } from '../../src/game/types';
export const signalContent: ContentDefinition<{ confirmed: boolean }> = {
  info: { id: 'signal-test', version: '1', scenarioVersion: '1', rulesVersion: '1', title: '通信確認', scenario: '応答試験', summary: '内部確認専用', objective: '応答を確認する', playerName: '通信士', characterName: '管制官', playerRole: '通信士', delegateLabel: '管制官に任せる', duration: '1分', opening: [{ role: 'character', text: '聞こえますか？' }] },
  create: () => ({ confirmed: false }),
  available: s => s.confirmed ? [] : [{ id: 'answer', label: '応答する', cost: '0' }],
  apply(s, a) { if (s.confirmed || a !== 'answer') throw Error('実行不可'); return { state: { confirmed: true }, result: '応答を確認しました。', elapsed: 0 }; },
  view: s => ({ location: '管制室', stats: [{ label: '通信', value: s.confirmed ? '確認済み' : '未確認' }], inventory: [], discoveries: [], privateInfo: [], ending: s.confirmed ? { success: true, title: '通信成立', reason: '応答を確認した' } : null }),
  context: s => JSON.stringify(s),
  mock: () => ({ action: 'answer', speech: '応答をお願いします。' }),
};
