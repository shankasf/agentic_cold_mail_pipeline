'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useCallback, memo, useEffect } from 'react';
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
  Menu,
  X,
  LogOut,
  Loader2,
  Users,
  Inbox,
  ShieldCheck,
  FolderKanban,
  UserCheck,
  Terminal,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface SidebarCounts {
  campaigns: number;
  companies: number;
  emails: number;
  pendingEmails: number;
  inbox: number;
  uploads: number;
  leads: number;
}

// Badge keys for each nav item
type BadgeKey = keyof SidebarCounts | null;

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  badgeKey?: BadgeKey;
  badgeColor?: 'primary' | 'warning' | 'success' | 'danger';
}

// Create section - importing data and generating emails
const createNav: NavItem[] = [
  { name: 'Overview', href: '/dashboard', icon: Home },
  { name: 'Campaigns', href: '/dashboard/campaigns', icon: FolderKanban, badgeKey: 'campaigns', badgeColor: 'primary' },
  { name: 'Import Data', href: '/dashboard/uploads', icon: Upload, badgeKey: 'uploads', badgeColor: 'warning' },
  { name: 'Companies', href: '/dashboard/businesses', icon: Building2, badgeKey: 'companies', badgeColor: 'success' },
  { name: 'Templates', href: '/dashboard/templates', icon: FileText },
];

// Manage section - reviewing and sending emails
const manageNav: NavItem[] = [
  { name: 'Emails', href: '/dashboard/emails', icon: Mail, badgeKey: 'emails', badgeColor: 'danger' },
  { name: 'Leads', href: '/dashboard/leads', icon: UserCheck, badgeKey: 'leads', badgeColor: 'success' },
  { name: 'Inbox', href: '/dashboard/unibox', icon: Inbox, badgeKey: 'inbox', badgeColor: 'danger' },
  { name: 'Activity', href: '/dashboard/email-logs', icon: ScrollText },
  { name: 'Downloads', href: '/dashboard/exports', icon: Download },
  { name: 'Reports', href: '/dashboard/analytics', icon: BarChart3 },
];

// Admin-only navigation
const adminNav: NavItem[] = [
  { name: 'Identities', href: '/dashboard/identities', icon: ShieldCheck },
  { name: 'Users', href: '/dashboard/users', icon: Users },
  { name: 'Logs', href: '/dashboard/logs', icon: Terminal },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

const badgeColors = {
  primary: 'bg-primary-500 text-white',
  warning: 'bg-yellow-500 text-white',
  success: 'bg-green-500 text-white',
  danger: 'bg-red-500 text-white',
};

const NavSection = memo(function NavSection({
  title,
  items,
  pathname,
  counts,
  onNavigate
}: {
  title: string;
  items: NavItem[];
  pathname: string;
  counts: SidebarCounts | null;
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

        const badgeCount = item.badgeKey && counts ? counts[item.badgeKey] : 0;
        const showBadge = badgeCount > 0;

        return (
          <Link
            key={item.name}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-primary-600 text-white'
                : 'text-gray-300 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <item.icon className="h-5 w-5" />
              {item.name}
            </div>
            {showBadge && (
              <span className={`
                min-w-[20px] h-5 px-1.5 flex items-center justify-center
                text-xs font-bold rounded-full
                ${isActive ? 'bg-white/20 text-white' : badgeColors[item.badgeColor || 'primary']}
              `}>
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
});

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

const Sidebar = memo(function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const { isAdmin, user, loading } = useAuth();
  const [counts, setCounts] = useState<SidebarCounts | null>(null);

  // Fetch sidebar counts
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const res = await fetch('/api/sidebar-counts');
        if (res.ok) {
          const data = await res.json();
          setCounts(data);
        }
      } catch (error) {
        console.error('Error fetching sidebar counts:', error);
      }
    };

    // Initial fetch
    fetchCounts();

    // Refresh counts every 30 seconds
    const interval = setInterval(fetchCounts, 30000);

    return () => clearInterval(interval);
  }, []);

  // Refetch counts when pathname changes (user navigates)
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const res = await fetch('/api/sidebar-counts');
        if (res.ok) {
          const data = await res.json();
          setCounts(data);
        }
      } catch (error) {
        // Silent fail
      }
    };

    // Small delay to allow any data changes to be saved
    const timeout = setTimeout(fetchCounts, 500);
    return () => clearTimeout(timeout);
  }, [pathname]);

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setLoggingOut(false);
    }
  }, [router]);

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
            <span className="text-xl font-bold text-white">CallSphere</span>
            <button
              onClick={onClose}
              className="lg:hidden text-gray-400 hover:text-white"
              aria-label="Close menu"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <NavSection title="Create" items={createNav} pathname={pathname} counts={counts} onNavigate={onClose} />
            <NavSection title="Manage" items={manageNav} pathname={pathname} counts={counts} onNavigate={onClose} />
            {!loading && isAdmin && (
              <NavSection title="Admin" items={adminNav} pathname={pathname} counts={counts} onNavigate={onClose} />
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
            <p className="text-xs text-gray-500">Cold Mail Outreach v1.0</p>
          </div>
        </div>
      </aside>
    </>
  );
});

export default Sidebar;

// Mobile header component
export const MobileHeader = memo(function MobileHeader({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="lg:hidden flex items-center justify-between bg-gray-900 px-4 py-3 shrink-0">
      <button
        onClick={onMenuClick}
        className="text-gray-400 hover:text-white"
        aria-label="Open menu"
      >
        <Menu className="h-6 w-6" />
      </button>
      <span className="text-lg font-bold text-white">CallSphere</span>
      <div className="w-6" />
    </header>
  );
});
