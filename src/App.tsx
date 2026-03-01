import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Toaster, toast } from 'sonner';
import { KeyRound, Plus, Trash2, Copy, Power, RefreshCw } from 'lucide-react';

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
  const [expiresIn, setExpiresIn] = useState(30); // days
  const [noExpiry, setNoExpiry] = useState(false);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('license_keys')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Erro ao carregar chaves');
    } else {
      setKeys(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const createKey = async () => {
    setCreating(true);
    const newKey = generateKey();
    const expiresAt = noExpiry
      ? null
      : new Date(Date.now() + expiresIn * 86400000).toISOString();

    const { error } = await supabase.from('license_keys').insert({
      key: newKey,
      max_uses: maxUses,
      expires_at: expiresAt,
    });

    if (error) {
      toast.error('Erro ao criar chave: ' + error.message);
    } else {
      toast.success('Chave criada com sucesso!');
      fetchKeys();
    }
    setCreating(false);
  };

  const toggleActive = async (id: string, current: boolean) => {
    const { error } = await supabase
      .from('license_keys')
      .update({ is_active: !current })
      .eq('id', id);

    if (error) {
      toast.error('Erro ao atualizar');
    } else {
      setKeys((prev) =>
        prev.map((k) => (k.id === id ? { ...k, is_active: !current } : k))
      );
    }
  };

  const deleteKey = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta chave?')) return;
    const { error } = await supabase
      .from('license_keys')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Erro ao excluir');
    } else {
      setKeys((prev) => prev.filter((k) => k.id !== id));
      toast.success('Chave excluída');
    }
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success('Chave copiada!');
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-5xl mx-auto">
      <Toaster theme="dark" position="top-right" />

      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 rounded-xl bg-primary/15">
            <KeyRound className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Gerenciador de Chaves
          </h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Crie e gerencie chaves de licença para o Auto Poster
        </p>
      </header>

      {/* Create Key Section */}
      <section className="bg-card rounded-2xl border border-border p-5 mb-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-primary" />
          Nova Chave
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1.5">
              Máx. de usos
            </label>
            <input
              type="number"
              min={1}
              value={maxUses}
              onChange={(e) => setMaxUses(Math.max(1, +e.target.value))}
              className="w-full bg-secondary text-foreground rounded-lg px-3 py-2 border border-border focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1.5">
              Expira em (dias)
            </label>
            <input
              type="number"
              min={1}
              value={expiresIn}
              disabled={noExpiry}
              onChange={(e) => setExpiresIn(Math.max(1, +e.target.value))}
              className="w-full bg-secondary text-foreground rounded-lg px-3 py-2 border border-border focus:outline-none focus:ring-2 focus:ring-ring text-sm disabled:opacity-40"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
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
          className="bg-primary text-primary-foreground font-medium rounded-lg px-5 py-2.5 text-sm hover:brightness-110 transition disabled:opacity-50 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {creating ? 'Gerando...' : 'Gerar Chave'}
        </button>
      </section>

      {/* Keys Table */}
      <section className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">
            Chaves ({keys.length})
          </h2>
          <button
            onClick={fetchKeys}
            className="text-muted-foreground hover:text-foreground transition p-1.5"
            title="Atualizar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading && keys.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            Carregando...
          </div>
        ) : keys.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            Nenhuma chave criada ainda
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left border-b border-border">
                  <th className="px-5 py-3 font-medium">Chave</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Usos</th>
                  <th className="px-5 py-3 font-medium">Expira em</th>
                  <th className="px-5 py-3 font-medium">Criada em</th>
                  <th className="px-5 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const expired =
                    k.expires_at && new Date(k.expires_at) < new Date();
                  const usedUp =
                    k.max_uses !== null && k.current_uses >= k.max_uses;
                  const statusLabel = !k.is_active
                    ? 'Inativa'
                    : expired
                    ? 'Expirada'
                    : usedUp
                    ? 'Esgotada'
                    : 'Ativa';
                  const statusColor =
                    statusLabel === 'Ativa'
                      ? 'text-success'
                      : statusLabel === 'Inativa'
                      ? 'text-muted-foreground'
                      : 'text-destructive';

                  return (
                    <tr
                      key={k.id}
                      className="border-b border-border last:border-0 hover:bg-secondary/40 transition"
                    >
                      <td className="px-5 py-3 font-mono text-xs tracking-wider">
                        {k.key}
                      </td>
                      <td className={`px-5 py-3 font-semibold ${statusColor}`}>
                        {statusLabel}
                      </td>
                      <td className="px-5 py-3">
                        {k.current_uses}/{k.max_uses ?? '∞'}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {k.expires_at
                          ? new Date(k.expires_at).toLocaleDateString('pt-BR')
                          : 'Nunca'}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {new Date(k.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => copyKey(k.key)}
                            className="p-1.5 rounded-md hover:bg-secondary transition text-muted-foreground hover:text-foreground"
                            title="Copiar chave"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => toggleActive(k.id, k.is_active)}
                            className={`p-1.5 rounded-md hover:bg-secondary transition ${
                              k.is_active
                                ? 'text-success hover:text-warning'
                                : 'text-muted-foreground hover:text-success'
                            }`}
                            title={
                              k.is_active ? 'Desativar' : 'Ativar'
                            }
                          >
                            <Power className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteKey(k.id)}
                            className="p-1.5 rounded-md hover:bg-secondary transition text-muted-foreground hover:text-destructive"
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
    </div>
  );
}
