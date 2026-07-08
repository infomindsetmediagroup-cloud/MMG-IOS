import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { KairosAssistantBadge } from '@/components/kairos/KairosAssistantBadge';
import './globals.css';
import './admin/command-center.css';

export const metadata: Metadata = {
  title: 'Mindset Media Group',
  description: 'Mindset Media Group and Kairos operating system.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <KairosAssistantBadge />
      </body>
    </html>
  );
}
