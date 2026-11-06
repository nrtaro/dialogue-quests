import type { AnyContent, ContentDefinition, EffectContentDefinition } from '../game/types';
import { cleaningRobot } from './cleaning-robot/content';
import { heroWhisper } from './hero-whisper';
import { heroWhisperTrpg } from './scenarios/hero-whisper';

// Type erasure is confined to registration. Each content owns and validates its own state.
export function register<S>(content: ContentDefinition<S> | EffectContentDefinition<S>): AnyContent {
  return content as AnyContent;
}
/** Approved contents shown to every player. */
const published: AnyContent[] = [register(heroWhisper)];
/** Prototypes, shown only when ENABLE_PROTOTYPES=1 (AGENTS.md). */
const prototypes: AnyContent[] = [heroWhisperTrpg, register(cleaningRobot)];

export function listContents(env: Record<string, string | undefined> = process.env): AnyContent[] {
  return env.ENABLE_PROTOTYPES === '1' ? [...published, ...prototypes] : published;
}
export const contents: AnyContent[] = listContents();
export const contentList = contents.map(c => c.info);
