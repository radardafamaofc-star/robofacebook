import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';

interface AdminAuthGateProps {
  children: React.ReactNode;
}

export default function AdminAuthGate({ children }: AdminAuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError('Email ou senha incorretos');
    setSubmitting(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="admin-login-page">
        <div className="admin-login-card">
          <p style={{ textAlign: 'center', color: 'var(--muted-foreground)' }}>Carregando...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="admin-login-page">
        <div className="admin-login-card">
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <span style={{ fontSize: '36px' }}>🛡️</span>
            <h2 className="admin-login-title">Admin Login</h2>
            <p style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>Acesso restrito ao administrador</p>
          </div>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '16px' }}>
              <label className="admin-login-label">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="admin-login-input"
                placeholder="admin@email.com"
                required
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label className="admin-login-label">Senha</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="admin-login-input"
                placeholder="••••••••"
                required
              />
            </div>
            {error && <p className="admin-login-error">{error}</p>}
            <button type="submit" className="admin-login-btn" disabled={submitting}>
              {submitting ? '⏳ Entrando...' : '🔐 Entrar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="admin-topbar">
        <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>{session.user.email}</span>
        <button onClick={handleLogout} className="admin-logout-btn">Sair</button>
      </div>
      {children}
    </div>
  );
}
