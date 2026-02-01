import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reports',
};

export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
