import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Toaster, toast } from 'sonner';
import {
  KeyRound, Plus, Trash2, Copy, Power, RefreshCw,
  Shield, Activity, Users, Zap, Search, ChevronDown
} from 'lucide-react';

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
  const parts: string[] = [];
  for (let s = 0; s < 4; s++) {
    let seg = '';
    for (let i = 0; i < 5; i++) seg += chars[Math.floor(Math.random() * chars.length)];
    parts.push(seg);
  }
  return parts.join('-');
}

function StatusBadge({ label }: { label: string }) {
  const config: Record<string, { bg: string; text: string; dot: string }> = {
    Ativa: { bg: 'bg-success/10', text: 'text-success', dot: 'bg-success pulse-dot' },
    Inativa: { bg: 'bg-muted', text: 'text-muted-foreground', dot: 'bg-muted-foreground' },
    Expirada: { bg: 'bg-warning/10', text: 'text-warning', dot: 'bg-warning' },
    Esgotada: { bg: 'bg-destructive/10', text: 'text-destructive', dot: 'bg-destructive' },
  };
  const c = config[label] || config.Inativa;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {label}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: number; accent?: boolean }) {
  return (
    <div className="glass-card p-5 flex items-center gap-4 animate-fade-in">
      <div className={`p-3 rounded-xl ${accent ? 'bg-primary/15' : 'bg-secondary'}`}>
        <Icon className={`w-5 h-5 ${accent ? 'text-primary' : 'text-muted-foreground'}`} />
      </div>
      <div>
        <div className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
          {value}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      </div>
    </div>
  );
}

export default function App() {
  const [keys, setKeys] = useState<LicenseKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [maxUses, setMaxUses] = useState(1);
  const [expiresIn, setExpiresIn] = useState(30);
  const [noExpiry, setNoExpiry] = useState(false);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

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
    else { toast.success('Chave gerada!'); fetchKeys(); setShowCreate(false); }
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

  const copyKey = (key: string) => { navigator.clipboard.writeText(key); toast.success('Copiada!'); };

  const activeCount = keys.filter(k => k.is_active).length;
  const totalUses = keys.reduce((sum, k) => sum + k.current_uses, 0);

  const filteredKeys = keys.filter(k =>
    k.key.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen relative z-10">
      <Toaster
        theme="dark"
        position="top-right"
        toastOptions={{
          style: {
            background: 'hsl(225 22% 10%)',
            border: '1px solid hsl(225 15% 18%)',
            color: 'hsl(220 15% 88%)',
            borderRadius: '10px',
          },
        }}
      />

      {/* Sidebar + Main layout */}
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="w-64 border-r border-border bg-surface hidden lg:flex flex-col p-6">
          <div className="flex items-center gap-3 mb-10">
            <div className="p-2 rounded-xl bg-primary/15 neon-border">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-wide" style={{ fontFamily: 'var(--font-display)' }}>
                AUTO POSTER
              </h1>
              <p className="text-[10px] text-muted-foreground">Admin Panel</p>
            </div>
          </div>

          <nav className="flex-1 space-y-1">
            <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/10 text-primary text-sm font-medium">
              <KeyRound className="w-4 h-4" />
              Chaves de Licença
            </a>
            <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition text-sm">
              <Activity className="w-4 h-4" />
              Atividade
            </a>
            <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition text-sm">
              <Users className="w-4 h-4" />
              Usuários
            </a>
          </nav>

          <div className="pt-4 border-t border-border">
            <p className="text-[10px] text-muted-foreground">v1.0 • Acesso Restrito</p>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 md:p-8 lg:p-10 max-w-[1100px]">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-8">
            <div className="lg:hidden flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/15 neon-border">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              <h1 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                ADMIN
              </h1>
            </div>
            <div className="hidden lg:block">
              <h2 className="text-xl font-bold">Chaves de Licença</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Gerencie o acesso dos seus usuários</p>
            </div>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="bg-primary text-primary-foreground font-semibold rounded-lg px-5 py-2.5 text-sm hover:brightness-110 transition flex items-center gap-2 shadow-[0_4px_20px_hsl(350_100%_55%_/_0.3)]"
            >
              <Plus className="w-4 h-4" />
              Nova Chave
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <StatCard icon={KeyRound} label="Total de Chaves" value={keys.length} accent />
            <StatCard icon={Zap} label="Chaves Ativas" value={activeCount} />
            <StatCard icon={Activity} label="Total de Usos" value={totalUses} />
          </div>

          {/* Create Key Panel */}
          {showCreate && (
            <div className="glass-card p-6 mb-6 animate-fade-in">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary" />
                Gerar Nova Chave
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5 font-medium">
                    Máximo de usos
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={maxUses}
                    onChange={(e) => setMaxUses(Math.max(1, +e.target.value))}
                    className="w-full bg-secondary text-foreground rounded-lg px-3.5 py-2.5 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary transition"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5 font-medium">
                    Expira em (dias)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={expiresIn}
                    disabled={noExpiry}
                    onChange={(e) => setExpiresIn(Math.max(1, +e.target.value))}
                    className="w-full bg-secondary text-foreground rounded-lg px-3.5 py-2.5 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary transition disabled:opacity-30"
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none text-secondary-foreground">
                    <input
                      type="checkbox"
                      checked={noExpiry}
                      onChange={(e) => setNoExpiry(e.target.checked)}
                      className="accent-primary w-4 h-4 rounded"
                    />
                    Sem expiração
                  </label>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={createKey}
                  disabled={creating}
                  className="bg-primary text-primary-foreground font-semibold rounded-lg px-5 py-2.5 text-sm hover:brightness-110 transition disabled:opacity-50 flex items-center gap-2"
                >
                  <KeyRound className="w-4 h-4" />
                  {creating ? 'Gerando...' : 'Gerar Chave'}
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  className="bg-secondary text-secondary-foreground rounded-lg px-5 py-2.5 text-sm hover:bg-secondary/80 transition"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Search + Table */}
          <div className="glass-card overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar chave..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-secondary text-foreground rounded-lg pl-9 pr-3 py-2 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary transition"
                />
              </div>
              <button
                onClick={fetchKeys}
                className="text-muted-foreground hover:text-foreground transition p-2 rounded-lg hover:bg-secondary"
                title="Atualizar"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {loading && keys.length === 0 ? (
              <div className="p-16 text-center text-muted-foreground text-sm">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-primary/40" />
                Carregando chaves...
              </div>
            ) : filteredKeys.length === 0 ? (
              <div className="p-16 text-center text-muted-foreground text-sm">
                <KeyRound className="w-8 h-8 mx-auto mb-3 text-muted-foreground/30" />
                {search ? 'Nenhuma chave encontrada' : 'Nenhuma chave criada ainda'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-left text-xs border-b border-border">
                      <th className="px-5 py-3 font-medium">Chave</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">Usos</th>
                      <th className="px-5 py-3 font-medium">Expiração</th>
                      <th className="px-5 py-3 font-medium">Criada em</th>
                      <th className="px-5 py-3 font-medium text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredKeys.map((k, i) => {
                      const expired = k.expires_at && new Date(k.expires_at) < new Date();
                      const usedUp = k.max_uses !== null && k.current_uses >= k.max_uses;
                      const statusLabel = !k.is_active ? 'Inativa' : expired ? 'Expirada' : usedUp ? 'Esgotada' : 'Ativa';

                      return (
                        <tr
                          key={k.id}
                          className="border-b border-border last:border-0 hover:bg-secondary/50 transition group"
                          style={{ animationDelay: `${i * 30}ms` }}
                        >
                          <td className="px-5 py-4">
                            <code className="text-xs tracking-[1.5px] text-foreground bg-secondary px-2.5 py-1 rounded-md" style={{ fontFamily: 'var(--font-mono)' }}>
                              {k.key}
                            </code>
                          </td>
                          <td className="px-5 py-4">
                            <StatusBadge label={statusLabel} />
                          </td>
                          <td className="px-5 py-4 text-muted-foreground">
                            <span className="text-foreground font-medium">{k.current_uses}</span>
                            <span className="text-muted-foreground">/{k.max_uses ?? '∞'}</span>
                          </td>
                          <td className="px-5 py-4 text-muted-foreground text-xs">
                            {k.expires_at ? new Date(k.expires_at).toLocaleDateString('pt-BR') : '—'}
                          </td>
                          <td className="px-5 py-4 text-muted-foreground text-xs">
                            {new Date(k.created_at).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition">
                              <button
                                onClick={() => copyKey(k.key)}
                                className="p-2 rounded-lg hover:bg-secondary transition text-muted-foreground hover:text-foreground"
                                title="Copiar"
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => toggleActive(k.id, k.is_active)}
                                className={`p-2 rounded-lg hover:bg-secondary transition ${
                                  k.is_active ? 'text-success hover:text-warning' : 'text-muted-foreground hover:text-success'
                                }`}
                                title={k.is_active ? 'Desativar' : 'Ativar'}
                              >
                                <Power className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => deleteKey(k.id)}
                                className="p-2 rounded-lg hover:bg-destructive/10 transition text-muted-foreground hover:text-destructive"
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
          </div>
        </main>
      </div>
    </div>
  );
}
