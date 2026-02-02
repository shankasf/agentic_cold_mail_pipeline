import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import CookieConsent from '@/components/CookieConsent';
import ChunkErrorHandler from '@/components/ChunkErrorHandler';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'CallSphere',
    template: '%s | CallSphere',
  },
  description: 'AI-powered cold email outreach platform for sales teams',
  icons: {
    icon: '/icon.svg',
  },
  keywords: ['cold email', 'outreach', 'sales', 'AI', 'email marketing'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ChunkErrorHandler />
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
