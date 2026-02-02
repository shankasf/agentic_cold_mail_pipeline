'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import LoginForm from '@/components/LoginForm';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Check if already authenticated
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated) {
          router.push('/dashboard');
        }
      })
      .finally(() => setCheckingAuth(false));
  }, [router]);

  const handleLogin = async (email: string, password: string) => {
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Redirect to dashboard on success
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <LoginForm
      onSubmit={handleLogin}
      error={error}
      emailPlaceholder="greetings@callsphere.tech"
    />
  );
}
