import type { ContentVisuals, VisualAsset } from './types';

export const defaultVisuals = {
  thumbnail: { src: '/placeholders/mission.svg', alt: '吹き出しが飛び交うミッションの仮イラスト' },
  background: { src: '/placeholders/studio.svg', alt: '' },
  character: { src: '/placeholders/guide.svg', alt: '対話相手の仮キャラクター' },
  player: { src: '/placeholders/player.svg', alt: 'プレイヤーの仮アイコン' },
} satisfies Record<string, VisualAsset>;

export function resolveVisuals(visuals?: ContentVisuals) {
  return {
    thumbnail: visuals?.thumbnail ?? defaultVisuals.thumbnail,
    background: visuals?.background ?? defaultVisuals.background,
    character: visuals?.character ?? defaultVisuals.character,
    player: visuals?.player ?? defaultVisuals.player,
  };
}
