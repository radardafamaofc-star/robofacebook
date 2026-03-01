import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Toaster, toast } from 'sonner';
import { KeyRound, Plus, Trash2, Copy, Power, RefreshCw, Shield } from 'lucide-react';

interface LicenseKey {
  id: string;
  key: string;
  is_active: boolean;
  max_uses: number | null;
  current_uses: number;
  expires_at: string | null;
  created_at: string;
}

function generateKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segments = 4;
  const segLen = 5;
  const parts: string[] = [];
  for (let s = 0; s < segments; s++) {
    let seg = '';
    for (let i = 0; i < segLen; i++) {
      seg += chars[Math.floor(Math.random() * chars.length)];
    }
    parts.push(seg);
  }
  return parts.join('-');
}

export default function App() {
  const [keys, setKeys] = useState<LicenseKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [maxUses, setMaxUses] = useState(1);
  const [expiresIn, setExpiresIn] = useState(30);
  const [noExpiry, setNoExpiry] = useState(false);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('license_keys')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast.error('Erro ao carregar chaves');
    else setKeys(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const createKey = async () => {
    setCreating(true);
    const newKey = generateKey();
    const expiresAt = noExpiry ? null : new Date(Date.now() + expiresIn * 86400000).toISOString();
    const { error } = await supabase.from('license_keys').insert({ key: newKey, max_uses: maxUses, expires_at: expiresAt });
    if (error) toast.error('Erro ao criar chave: ' + error.message);
    else { toast.success('Chave gerada com sucesso!'); fetchKeys(); }
    setCreating(false);
  };

  const toggleActive = async (id: string, current: boolean) => {
    const { error } = await supabase.from('license_keys').update({ is_active: !current }).eq('id', id);
    if (error) toast.error('Erro ao atualizar');
    else setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, is_active: !current } : k)));
  };

  const deleteKey = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta chave?')) return;
    const { error } = await supabase.from('license_keys').delete().eq('id', id);
    if (error) toast.error('Erro ao excluir');
    else { setKeys((prev) => prev.filter((k) => k.id !== id)); toast.success('Chave excluída'); }
  };

  const copyKey = (key: string) => { navigator.clipboard.writeText(key); toast.success('Chave copiada!'); };

  const activeCount = keys.filter(k => k.is_active).length;
  const totalUses = keys.reduce((sum, k) => sum + k.current_uses, 0);

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-5xl mx-auto">
      <Toaster
        theme="dark"
        position="top-right"
        toastOptions={{
          style: {
            background: 'hsl(0 0% 6%)',
            border: '1px solid hsl(350 100% 55% / 0.3)',
            color: 'hsl(350 80% 85%)',
            fontFamily: "'Share Tech Mono', monospace",
          },
        }}
      />

      {/* Header */}
      <header className="text-center mb-8 border-b border-border pb-6">
        <div className="flex items-center justify-center gap-3 mb-2">
          <Shield className="w-8 h-8 text-primary" style={{ filter: 'drop-shadow(0 0 8px hsl(350 100% 55% / 0.6))' }} />
          <h1
            className="text-2xl md:text-3xl font-bold tracking-[4px] uppercase text-primary text-glow"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Painel Admin
          </h1>
        </div>
        <p className="text-xs text-muted-foreground uppercase tracking-[3px]">
          Gerenciador de Chaves de Licença
        </p>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Total', value: keys.length },
          { label: 'Ativas', value: activeCount },
          { label: 'Usos', value: totalUses },
        ].map((s) => (
          <div
            key={s.label}
            className="border border-border bg-muted p-4 text-center"
          >
            <div className="text-2xl font-bold text-primary text-glow" style={{ fontFamily: 'var(--font-display)' }}>
              {s.value}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-[2px] mt-1">
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Create Key */}
      <section className="border border-border bg-card p-5 mb-6">
        <h2
          className="text-sm font-bold uppercase tracking-[2px] text-primary mb-4 flex items-center gap-2"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          <Plus className="w-4 h-4" />
          Nova Chave
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-[11px] text-muted-foreground uppercase tracking-[1px] mb-1.5">
              Máx. de usos
            </label>
            <input
              type="number"
              min={1}
              value={maxUses}
              onChange={(e) => setMaxUses(Math.max(1, +e.target.value))}
              className="w-full bg-muted text-foreground border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-primary focus:shadow-[0_0_8px_hsl(350_100%_55%_/_0.3)]"
            />
          </div>
          <div>
            <label className="block text-[11px] text-muted-foreground uppercase tracking-[1px] mb-1.5">
              Expira em (dias)
            </label>
            <input
              type="number"
              min={1}
              value={expiresIn}
              disabled={noExpiry}
              onChange={(e) => setExpiresIn(Math.max(1, +e.target.value))}
              className="w-full bg-muted text-foreground border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-primary focus:shadow-[0_0_8px_hsl(350_100%_55%_/_0.3)] disabled:opacity-30"
            />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-[11px] uppercase tracking-[1px] cursor-pointer select-none text-secondary-foreground">
              <input
                type="checkbox"
                checked={noExpiry}
                onChange={(e) => setNoExpiry(e.target.checked)}
                className="accent-primary w-4 h-4"
              />
              Sem expiração
            </label>
          </div>
        </div>
        <button
          onClick={createKey}
          disabled={creating}
          className="bg-secondary border border-primary text-primary uppercase tracking-[2px] text-xs px-6 py-3 hover:bg-primary/20 hover:box-glow transition disabled:opacity-50 flex items-center gap-2"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          <KeyRound className="w-4 h-4" />
          {creating ? 'Gerando...' : 'Gerar Chave'}
        </button>
      </section>

      {/* Keys Table */}
      <section className="border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2
            className="text-sm font-bold uppercase tracking-[2px] text-primary"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Chaves ({keys.length})
          </h2>
          <button
            onClick={fetchKeys}
            className="text-muted-foreground hover:text-primary transition p-1.5"
            title="Atualizar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading && keys.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground uppercase tracking-[2px] text-xs">
            Carregando...
          </div>
        ) : keys.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground uppercase tracking-[2px] text-xs">
            Nenhuma chave criada
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground text-left border-b border-border uppercase tracking-[1px]">
                  <th className="px-5 py-3 font-bold">Chave</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 font-bold">Usos</th>
                  <th className="px-5 py-3 font-bold">Expira</th>
                  <th className="px-5 py-3 font-bold">Criada</th>
                  <th className="px-5 py-3 font-bold text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const expired = k.expires_at && new Date(k.expires_at) < new Date();
                  const usedUp = k.max_uses !== null && k.current_uses >= k.max_uses;
                  const statusLabel = !k.is_active ? 'Inativa' : expired ? 'Expirada' : usedUp ? 'Esgotada' : 'Ativa';
                  const statusColor =
                    statusLabel === 'Ativa'
                      ? 'text-success'
                      : statusLabel === 'Inativa'
                      ? 'text-muted-foreground'
                      : 'text-destructive';

                  return (
                    <tr
                      key={k.id}
                      className="border-b border-border last:border-0 hover:bg-primary/5 transition"
                    >
                      <td className="px-5 py-3 font-mono tracking-[2px] text-foreground">
                        {k.key}
                      </td>
                      <td className={`px-5 py-3 font-bold uppercase tracking-[1px] ${statusColor}`}>
                        <span className={statusLabel === 'Ativa' ? 'text-glow' : ''}>
                          {statusLabel === 'Ativa' ? '● ' : '○ '}{statusLabel}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-secondary-foreground">
                        {k.current_uses}/{k.max_uses ?? '∞'}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {k.expires_at ? new Date(k.expires_at).toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {new Date(k.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => copyKey(k.key)}
                            className="p-2 hover:bg-primary/10 transition text-muted-foreground hover:text-primary"
                            title="Copiar chave"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => toggleActive(k.id, k.is_active)}
                            className={`p-2 hover:bg-primary/10 transition ${
                              k.is_active ? 'text-success hover:text-warning' : 'text-muted-foreground hover:text-success'
                            }`}
                            title={k.is_active ? 'Desativar' : 'Ativar'}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteKey(k.id)}
                            className="p-2 hover:bg-primary/10 transition text-muted-foreground hover:text-destructive"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="text-center mt-6 pt-4 border-t border-border">
        <p className="text-[10px] text-muted-foreground uppercase tracking-[3px]">
          Admin Panel • Acesso Restrito
        </p>
      </footer>
    </div>
  );
}
