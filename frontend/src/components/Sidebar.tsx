'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Upload,
  Building2,
  Mail,
  Download,
  BarChart3,
  Settings,
  Home,
  ScrollText,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Uploads', href: '/dashboard/uploads', icon: Upload },
  { name: 'Businesses', href: '/dashboard/businesses', icon: Building2 },
  { name: 'Emails', href: '/dashboard/emails', icon: Mail },
  { name: 'Email Logs', href: '/dashboard/email-logs', icon: ScrollText },
  { name: 'Exports', href: '/dashboard/exports', icon: Download },
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-64 flex-col bg-gray-900">
      <div className="flex h-16 items-center px-6">
        <span className="text-xl font-bold text-white">CallSphere</span>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-gray-800 p-4">
        <p className="text-xs text-gray-500">Email Marketing Dashboard v1.0</p>
      </div>
    </div>
  );
}
