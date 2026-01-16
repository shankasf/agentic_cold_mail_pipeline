'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Upload,
  Building2,
  Mail,
  Download,
  BarChart3,
  Settings,
  Home,
  ScrollText,
  FileText,
  Zap,
  Menu,
  X,
  LogOut,
  Loader2,
  Users,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

// AI Pipeline navigation
const aiPipelineNav = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'AI Uploads', href: '/dashboard/uploads', icon: Upload },
  { name: 'Businesses', href: '/dashboard/businesses', icon: Building2 },
];

// Template Pipeline navigation
const templatePipelineNav = [
  { name: 'Templates', href: '/dashboard/templates', icon: FileText },
  { name: 'Template Uploads', href: '/dashboard/template-uploads', icon: Zap },
];

// Shared navigation (available to all users)
const sharedNav = [
  { name: 'All Emails', href: '/dashboard/emails', icon: Mail },
  { name: 'Email Logs', href: '/dashboard/email-logs', icon: ScrollText },
  { name: 'Exports', href: '/dashboard/exports', icon: Download },
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
];

// Admin-only navigation
const adminNav = [
  { name: 'Users', href: '/dashboard/users', icon: Users },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

function NavSection({ title, items, pathname, onNavigate }: {
  title: string;
  items: typeof aiPipelineNav;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="mb-4">
      <p className="px-3 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        {title}
      </p>
      {items.map((item) => {
        const isActive = pathname === item.href ||
          (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'));
        return (
          <Link
            key={item.name}
            href={item.href}
            onClick={onNavigate}
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
    </div>
  );
}

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const { isAdmin, user, loading } = useAuth();

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar - Desktop: always visible, Mobile: slide in/out */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 transform transition-transform duration-300 ease-in-out
          lg:relative lg:transform-none
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-between px-6 shrink-0">
            <span className="text-xl font-bold text-white">Cold Mail Pipeline</span>
            <button
              onClick={onClose}
              className="lg:hidden text-gray-400 hover:text-white"
              aria-label="Close menu"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <NavSection title="AI Pipeline" items={aiPipelineNav} pathname={pathname} onNavigate={onClose} />
            <NavSection title="Template Pipeline" items={templatePipelineNav} pathname={pathname} onNavigate={onClose} />
            <NavSection title="Emails & Reports" items={sharedNav} pathname={pathname} onNavigate={onClose} />
            {!loading && isAdmin && (
              <NavSection title="Admin" items={adminNav} pathname={pathname} onNavigate={onClose} />
            )}
          </nav>
          <div className="border-t border-gray-800 p-4 shrink-0 space-y-3">
            {/* User info */}
            {user && (
              <div className="px-3 py-2">
                <p className="text-sm font-medium text-gray-300 truncate">{user.email}</p>
                <p className="text-xs text-gray-500">
                  {user.role === 'ADMIN' ? 'Administrator' : 'Sales Rep'}
                </p>
              </div>
            )}
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors disabled:opacity-50"
            >
              {loggingOut ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <LogOut className="h-5 w-5" />
              )}
              {loggingOut ? 'Logging out...' : 'Logout'}
            </button>
            <p className="text-xs text-gray-500">Agentic Cold Mail Pipeline v1.0</p>
          </div>
        </div>
      </aside>
    </>
  );
}

// Mobile header component
export function MobileHeader({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="lg:hidden flex items-center justify-between bg-gray-900 px-4 py-3 shrink-0">
      <button
        onClick={onMenuClick}
        className="text-gray-400 hover:text-white"
        aria-label="Open menu"
      >
        <Menu className="h-6 w-6" />
      </button>
      <span className="text-lg font-bold text-white">Cold Mail Pipeline</span>
      <div className="w-6" />
    </header>
  );
}
