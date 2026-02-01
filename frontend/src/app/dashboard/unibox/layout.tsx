import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Inbox',
};

export default function UniboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
