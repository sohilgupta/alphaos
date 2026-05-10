'use client';

import { useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useRouter } from 'next/navigation';
import { Shield } from 'lucide-react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const { login, role } = useAuth();
  const router = useRouter();

  if (role === 'owner') {
    router.push('/dashboard');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(false);
    const success = await login(password);
    if (success) {
      router.push('/dashboard');
    } else {
      setError(true);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <div className="glass-card p-8 max-w-sm w-full space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-xl font-800 text-foreground">AlphaOS Login</h1>
          <p className="text-sm text-muted-foreground mt-1">Authenticate to view private portfolio data.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              placeholder="Admin Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-secondary/50 border border-white/8 rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
            />
            {error && <p className="text-xs text-loss mt-2">Incorrect password.</p>}
          </div>
          <button
            type="submit"
            className="w-full bg-primary text-primary-foreground font-600 rounded-lg px-4 py-2.5 text-sm hover:opacity-90 transition-opacity"
          >
            Unlock Portfolio
          </button>
        </form>
      </div>
    </div>
  );
}
