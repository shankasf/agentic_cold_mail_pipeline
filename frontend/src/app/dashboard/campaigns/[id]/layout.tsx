import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Campaign Details',
};

export default function CampaignDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
