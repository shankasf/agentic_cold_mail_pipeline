import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Identities',
};

export default function IdentitiesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
