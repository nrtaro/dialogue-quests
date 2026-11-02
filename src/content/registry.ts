import type { ContentDefinition } from '../game/types';
import { heroWhisper } from './hero-whisper';

// Type erasure is confined to registration. Each content owns and validates its own state.
export function register<S>(content: ContentDefinition<S>): ContentDefinition {
  return content as ContentDefinition;
}
export const contents: ContentDefinition[] = [register(heroWhisper)];
export const contentList = contents.map(c => c.info);
