import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Dialogue Quests | ことばで動かす、小さな冒険', description: '自由な対話で物語に働きかける短編ミッションゲーム。初回コンテンツ「勇者の耳元」。' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ja"><body>{children}</body></html>;
}
