import { expect, it } from 'vitest';
import { resolveVisuals } from '../src/game/presentation';

it('画像未指定のコンテンツにも共通の背景・人物・サムネイルを供給する', () => {
  const v = resolveVisuals(undefined);
  expect(v.thumbnail.src).toBe('/placeholders/mission.svg');
  expect(v.background.src).toBe('/placeholders/studio.svg');
  expect(v.character.src).toBe('/placeholders/guide.svg');
  expect(v.player.src).toBe('/placeholders/player.svg');
});
it('一つの画像だけ差し替えても残りの素材は共通フォールバックを使う', () => {
  const v = resolveVisuals({ character: { src: '/my-assets/partner.webp', alt: '交渉相手', position: '50% 20%' } });
  expect(v.character).toEqual({ src: '/my-assets/partner.webp', alt: '交渉相手', position: '50% 20%' });
  expect(v.background.src).toBe('/placeholders/studio.svg');
});
