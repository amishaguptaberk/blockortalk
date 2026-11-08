import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'Block or Talk', description: 'Every scam has a tell.' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
