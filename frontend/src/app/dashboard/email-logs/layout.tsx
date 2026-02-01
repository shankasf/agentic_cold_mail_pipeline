import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Activity Log',
};

export default function EmailLogsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
