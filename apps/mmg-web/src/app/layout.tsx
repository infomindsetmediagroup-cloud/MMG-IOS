import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mindset Media Group',
  description: 'Mindset Media Group and Kairos operating system.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
