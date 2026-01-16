import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginForm from '@/components/LoginForm';

describe('LoginForm', () => {
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render with default props', () => {
    render(<LoginForm onSubmit={mockOnSubmit} />);

    expect(screen.getByRole('heading', { name: 'Sign In' })).toBeInTheDocument();
    expect(screen.getByText('Welcome to CallSphere Email Dashboard')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    expect(screen.getByText('Forgot Password?')).toBeInTheDocument();
  });

  it('should render with custom props', () => {
    render(
      <LoginForm
        onSubmit={mockOnSubmit}
        title="Custom Title"
        subtitle="Custom Subtitle"
        emailPlaceholder="custom@email.com"
        passwordPlaceholder="Custom password"
        submitText="Login Now"
      />
    );

    expect(screen.getByText('Custom Title')).toBeInTheDocument();
    expect(screen.getByText('Custom Subtitle')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('custom@email.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Custom password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Login Now' })).toBeInTheDocument();
  });

  it('should display error message when provided', () => {
    render(<LoginForm onSubmit={mockOnSubmit} error="Invalid credentials" />);

    expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
  });

  it('should call onSubmit with email and password', async () => {
    mockOnSubmit.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<LoginForm onSubmit={mockOnSubmit} />);

    await user.type(screen.getByPlaceholderText('Enter your email'), 'test@example.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith('test@example.com', 'password123');
    });
  });

  it('should show loading state while submitting', async () => {
    mockOnSubmit.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));
    const user = userEvent.setup();

    render(<LoginForm onSubmit={mockOnSubmit} loadingText="Logging in..." />);

    await user.type(screen.getByPlaceholderText('Enter your email'), 'test@example.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(screen.getByText('Logging in...')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign In' })).not.toBeDisabled();
    });
  });

  it('should require email field', async () => {
    render(<LoginForm onSubmit={mockOnSubmit} />);

    const emailInput = screen.getByPlaceholderText('Enter your email');
    expect(emailInput).toBeRequired();
  });

  it('should require password field', async () => {
    render(<LoginForm onSubmit={mockOnSubmit} />);

    const passwordInput = screen.getByPlaceholderText('Enter your password');
    expect(passwordInput).toBeRequired();
  });

  it('should have forgot password link pointing to correct URL', () => {
    render(<LoginForm onSubmit={mockOnSubmit} />);

    const forgotPasswordLink = screen.getByText('Forgot Password?');
    expect(forgotPasswordLink).toHaveAttribute('href', '/forgot-password');
  });

  it('should reset loading state after submit completes', async () => {
    mockOnSubmit.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<LoginForm onSubmit={mockOnSubmit} />);

    await user.type(screen.getByPlaceholderText('Enter your email'), 'test@example.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign In' })).not.toBeDisabled();
    });
  });

  it('should reset loading state after submit fails', async () => {
    // Mock that throws but we catch it to prevent unhandled rejection
    mockOnSubmit.mockImplementation(() => Promise.reject(new Error('Login failed')));
    const user = userEvent.setup();

    // Suppress console errors for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<LoginForm onSubmit={mockOnSubmit} />);

    await user.type(screen.getByPlaceholderText('Enter your email'), 'test@example.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'password123');

    // The form submit will reject, but we just want to test the loading state resets
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign In' })).not.toBeDisabled();
    });

    consoleSpy.mockRestore();
  });
});
