'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { FolderKanban, X, ChevronDown } from 'lucide-react';

interface Campaign {
  id: string;
  name: string;
  status: string;
  _count: {
    businesses: number;
  };
}

interface CampaignFilterProps {
  className?: string;
}

export default function CampaignFilter({ className = '' }: CampaignFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  const currentCampaignId = searchParams.get('campaignId');

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch('/api/campaigns?limit=100');
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const handleSelect = (campaignId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());

    if (campaignId) {
      params.set('campaignId', campaignId);
    } else {
      params.delete('campaignId');
    }

    // Reset to page 1 when changing filter
    params.delete('page');

    router.push(`${pathname}?${params.toString()}`);
    setIsOpen(false);
  };

  const currentCampaign = campaigns.find(c => c.id === currentCampaignId);

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors ${
          currentCampaignId
            ? 'border-primary-500 bg-primary-50 text-primary-700'
            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
        }`}
      >
        <FolderKanban className="w-4 h-4" />
        <span className="max-w-[150px] truncate">
          {loading ? 'Loading...' : currentCampaign?.name || 'All Campaigns'}
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {currentCampaignId && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleSelect(null);
          }}
          className="absolute -right-2 -top-2 p-1 bg-gray-100 hover:bg-gray-200 rounded-full"
          title="Clear filter"
        >
          <X className="w-3 h-3" />
        </button>
      )}

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute z-20 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
            <button
              onClick={() => handleSelect(null)}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${
                !currentCampaignId ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-700'
              }`}
            >
              All Campaigns
            </button>

            {campaigns.length === 0 && !loading && (
              <div className="px-4 py-3 text-sm text-gray-500">
                No campaigns found.
                <a href="/dashboard/campaigns/create" className="block mt-1 text-primary-600 hover:underline">
                  Create your first campaign
                </a>
              </div>
            )}

            {campaigns.map((campaign) => (
              <button
                key={campaign.id}
                onClick={() => handleSelect(campaign.id)}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 border-t border-gray-100 ${
                  campaign.id === currentCampaignId ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate">{campaign.name}</span>
                  <span className="text-xs text-gray-400 ml-2">
                    {campaign._count.businesses} companies
                  </span>
                </div>
                <span className={`text-xs ${
                  campaign.status === 'ACTIVE' ? 'text-green-600' :
                  campaign.status === 'PAUSED' ? 'text-yellow-600' :
                  campaign.status === 'COMPLETED' ? 'text-blue-600' :
                  'text-gray-400'
                }`}>
                  {campaign.status.charAt(0) + campaign.status.slice(1).toLowerCase()}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
