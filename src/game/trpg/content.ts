// Turns a ScenarioDefinition (data) into a playable content. Adding a game = one scenario file + one line in the registry.
import type { ContentInfo, PublicState, TrpgContentDefinition } from '../types';
import { createState, phaseOf, sceneOf } from './engine';
import type { ScenarioDefinition, TrpgState } from './types';

export function defineScenario(s: ScenarioDefinition, visuals?: ContentInfo['visuals']): TrpgContentDefinition {
  const hero = s.cast.find(c => c.id === s.heroId);
  const info: ContentInfo = {
    id: s.id, version: '0.1.0', scenarioVersion: '0.1.0', rulesVersion: 'trpg-0.1.0',
    title: s.title, scenario: s.scenario, summary: s.summary, objective: s.objective,
    playerName: s.playerName, characterName: hero?.name ?? '主人公', playerRole: s.playerRole,
    delegateLabel: 'まわりをよく見て', duration: s.duration,
    opening: [{ role: 'narrator', text: s.opening.narration }, { role: 'character', text: s.opening.heroLine.text }],
    playNotes: [
      `ゴール：${s.goals.map(g => g.label).join(' → ')}`,
      s.clock ? `${s.clock.name}が尽きる前に、ゴールをそろえよう。行動によって時間の進み方が変わります。` : '',
      '何を提案しても挑戦できます。成否は20面サイコロで決まり、目の割り当ては行動ごとに変わります。',
      '「ここまでで採点」と送ると、そこで冒険を区切ります。',
    ].filter(Boolean),
    ...(visuals ? { visuals } : {}),
  };
  const view = (st: TrpgState): PublicState => ({
    location: st.location.label,
    stats: s.clock ? [{ label: s.clock.name, value: phaseOf(s, st.clock).label, ...(st.clock >= 0.75 ? { tone: 'warning' as const } : {}) }] : [],
    inventory: st.items.map(i => `${i.name}${i.damaged ? `（${i.damaged}）` : ''}`),
    discoveries: st.facts,
    privateInfo: [],
    ending: st.ending ? { success: st.ending.kind === 'clear', title: st.ending.title, reason: st.ending.text } : null,
    scene: sceneOf(s, st),
  });
  return { kind: 'trpg', info, scenario: s, create: () => createState(s), view };
}
