import { contentList } from '../content/registry';
import { Game } from '../components/game';
export const dynamic = 'force-dynamic';
export default function Page() {
  const mode = process.env.AI_PROVIDER === 'openai' ? 'openai' : process.env.AI_PROVIDER === 'workers-ai' ? 'workers-ai' : 'mock';
  return <Game contents={contentList} mode={mode} />;
}
