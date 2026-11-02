import { contentList } from '../content/registry';
import { Game } from '../components/game';
export const dynamic = 'force-dynamic';
export default function Page() {
  return <Game contents={contentList} mode={process.env.AI_PROVIDER === 'openai' ? 'openai' : 'mock'} />;
}
