'use client';

import { useState } from 'react';
import Sidebar, { MobileHeader } from '@/components/Sidebar';
import { AuthProvider } from '@/context/AuthContext';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <AuthProvider>
      <div className="h-screen flex flex-col lg:flex-row overflow-hidden">
        {/* Mobile header - only shows on mobile */}
        <MobileHeader onMenuClick={() => setSidebarOpen(true)} />

        {/* Sidebar */}
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Main content */}
        <main className="flex-1 overflow-auto bg-gray-50">
          <div className="p-4 sm:p-6">{children}</div>
        </main>
      </div>
    </AuthProvider>
  );
}
