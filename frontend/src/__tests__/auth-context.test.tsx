import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/context/AuthContext';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test component that uses the auth context
function TestConsumer() {
  const { user, loading, isAdmin, isAuthenticated } = useAuth();

  if (loading) {
    return <div data-testid="loading">Loading...</div>;
  }

  return (
    <div>
      <div data-testid="authenticated">{String(isAuthenticated)}</div>
      <div data-testid="is-admin">{String(isAdmin)}</div>
      {user && (
        <>
          <div data-testid="user-email">{user.email}</div>
          <div data-testid="user-role">{user.role}</div>
        </>
      )}
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('should set user when authenticated', async () => {
    mockFetch.mockResolvedValue({
      json: () =>
        Promise.resolve({
          authenticated: true,
          user: {
            id: 'user-123',
            email: 'test@example.com',
            name: 'Test User',
            role: 'SALES_REP',
          },
        }),
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('true');
    });

    expect(screen.getByTestId('user-email').textContent).toBe('test@example.com');
    expect(screen.getByTestId('user-role').textContent).toBe('SALES_REP');
    expect(screen.getByTestId('is-admin').textContent).toBe('false');
  });

  it('should identify admin users', async () => {
    mockFetch.mockResolvedValue({
      json: () =>
        Promise.resolve({
          authenticated: true,
          user: {
            id: 'admin-123',
            email: 'admin@example.com',
            name: 'Admin User',
            role: 'ADMIN',
          },
        }),
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-admin').textContent).toBe('true');
    });

    expect(screen.getByTestId('user-role').textContent).toBe('ADMIN');
  });

  it('should handle unauthenticated state', async () => {
    mockFetch.mockResolvedValue({
      json: () =>
        Promise.resolve({
          authenticated: false,
        }),
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('false');
    });

    expect(screen.getByTestId('is-admin').textContent).toBe('false');
    expect(screen.queryByTestId('user-email')).not.toBeInTheDocument();
  });

  it('should handle fetch errors gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('false');
    });

    expect(screen.getByTestId('is-admin').textContent).toBe('false');
  });
});

describe('useAuth hook', () => {
  it('should throw error when used outside AuthProvider', () => {
    // Suppress console error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<TestConsumer />);
    }).toThrow('useAuth must be used within an AuthProvider');

    consoleSpy.mockRestore();
  });
});
