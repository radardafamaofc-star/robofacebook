import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface LicenseKey {
  id: string;
  key: string;
  is_active: boolean;
  max_uses: number | null;
  current_uses: number;
  expires_at: string | null;
  created_at: string;
  owner_name: string | null;
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

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', position: 'relative', zIndex: 10, padding: '32px', maxWidth: '1100px', margin: '0 auto' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' },
  title: { fontSize: '24px', fontWeight: 700, fontFamily: "'Orbitron', sans-serif", letterSpacing: '2px' },
  subtitle: { fontSize: '14px', color: 'var(--muted-foreground)', marginTop: '4px' },
  btnPrimary: { background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', borderRadius: 'var(--radius)', padding: '10px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' },
  btnSecondary: { background: 'var(--secondary)', color: 'var(--secondary-foreground)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '28px' },
  statCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' },
  statValue: { fontSize: '28px', fontWeight: 700, fontFamily: "'Orbitron', sans-serif" },
  statLabel: { fontSize: '12px', color: 'var(--muted-foreground)', marginTop: '2px' },
  card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' },
  input: { width: '100%', background: 'var(--secondary)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 14px', fontSize: '14px', outline: 'none', fontFamily: 'inherit' },
  label: { display: 'block', fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '6px', fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  searchBox: { position: 'relative' as const, maxWidth: '280px', flex: 1 },
  searchInput: { width: '100%', background: 'var(--secondary)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 14px 8px 36px', fontSize: '13px', outline: 'none', fontFamily: 'inherit' },
  table: { width: '100%', fontSize: '13px', borderCollapse: 'collapse' as const },
  th: { padding: '12px 20px', textAlign: 'left' as const, fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', borderBottom: '1px solid var(--border)' },
  td: { padding: '14px 20px', borderBottom: '1px solid var(--border)' },
  badge: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600 },
  actionBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '6px', color: 'var(--muted-foreground)', fontSize: '16px' },
  empty: { padding: '60px 20px', textAlign: 'center' as const, color: 'var(--muted-foreground)', fontSize: '14px' },
  footer: { textAlign: 'center' as const, marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border)', fontSize: '11px', color: 'var(--muted-foreground)', letterSpacing: '2px', textTransform: 'uppercase' as const },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--secondary-foreground)' },
};

function StatusBadge({ label }: { label: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    Ativa: { bg: 'rgba(46,204,113,0.12)', color: 'var(--success)' },
    Inativa: { bg: 'rgba(90,95,114,0.12)', color: 'var(--muted-foreground)' },
    Expirada: { bg: 'rgba(243,156,18,0.12)', color: 'var(--warning)' },
    Esgotada: { bg: 'rgba(231,76,60,0.12)', color: 'var(--destructive)' },
  };
  const c = colors[label] || colors.Inativa;
  return (
    <span style={{ ...styles.badge, background: c.bg, color: c.color }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
      {label}
    </span>
  );
}

const quickDays = [
  { label: '7 dias', value: 7 },
  { label: '15 dias', value: 15 },
  { label: '30 dias', value: 30 },
  { label: '90 dias', value: 90 },
  { label: '1 ano', value: 365 },
];

export default function AdminPanel() {
  const [keys, setKeys] = useState<LicenseKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [maxUses, setMaxUses] = useState(1);
  const [noExpiry, setNoExpiry] = useState(false);
  const [expiryDate, setExpiryDate] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('license_keys').select('*').order('created_at', { ascending: false });
    if (error) toast.error('Erro ao carregar chaves');
    else setKeys((data as LicenseKey[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const setQuickExpiry = (days: number) => {
    const d = new Date(Date.now() + days * 86400000);
    setExpiryDate(d.toISOString().split('T')[0]);
    setNoExpiry(false);
  };

  const createKey = async () => {
    setCreating(true);
    const newKey = generateKey();
    const expiresAt = noExpiry ? null : expiryDate ? new Date(expiryDate + 'T23:59:59').toISOString() : null;
    const { error } = await supabase.from('license_keys').insert({
      key: newKey,
      max_uses: maxUses,
      expires_at: expiresAt,
      owner_name: ownerName.trim() || null,
    });
    if (error) toast.error('Erro: ' + error.message);
    else {
      toast.success('Chave gerada!');
      fetchKeys();
      setShowCreate(false);
      setOwnerName('');
      setExpiryDate('');
      setNoExpiry(false);
      setMaxUses(1);
    }
    setCreating(false);
  };

  const toggleActive = async (id: string, current: boolean) => {
    const { error } = await supabase.from('license_keys').update({ is_active: !current }).eq('id', id);
    if (error) toast.error('Erro');
    else setKeys(prev => prev.map(k => k.id === id ? { ...k, is_active: !current } : k));
  };

  const deleteKey = async (id: string) => {
    if (!confirm('Excluir esta chave?')) return;
    const { error } = await supabase.from('license_keys').delete().eq('id', id);
    if (error) toast.error('Erro');
    else { setKeys(prev => prev.filter(k => k.id !== id)); toast.success('Excluída'); }
  };

  const copyKey = (key: string) => { navigator.clipboard.writeText(key); toast.success('Copiada!'); };

  const activeCount = keys.filter(k => k.is_active).length;
  const totalUses = keys.reduce((sum, k) => sum + k.current_uses, 0);
  const filteredKeys = keys.filter(k =>
    k.key.toLowerCase().includes(search.toLowerCase()) ||
    (k.owner_name && k.owner_name.toLowerCase().includes(search.toLowerCase()))
  );

  const chipStyle = (active: boolean): CSSProperties => ({
    padding: '6px 14px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
    background: active ? 'rgba(59,130,246,0.15)' : 'var(--secondary)',
    color: active ? 'var(--primary)' : 'var(--muted-foreground)',
    transition: 'all 0.15s',
  });

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.title}>🛡️ ADMIN PANEL</div>
          <div style={styles.subtitle}>Gerenciador de Chaves de Licença</div>
        </div>
        <button style={styles.btnPrimary} onClick={() => setShowCreate(!showCreate)}>
          ＋ Nova Chave
        </button>
      </div>

      {/* Stats */}
      <div style={styles.statsGrid}>
        {[
          { label: 'Total de Chaves', value: keys.length, icon: '🔑' },
          { label: 'Chaves Ativas', value: activeCount, icon: '⚡' },
          { label: 'Total de Usos', value: totalUses, icon: '📊' },
        ].map(s => (
          <div key={s.label} style={styles.statCard}>
            <span style={{ fontSize: '28px' }}>{s.icon}</span>
            <div>
              <div style={styles.statValue}>{s.value}</div>
              <div style={styles.statLabel}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Create Key */}
      {showCreate && (
        <div style={{ ...styles.card, marginBottom: '24px' }}>
          <div style={styles.cardHeader}>
            <span style={{ fontWeight: 600, fontSize: '15px' }}>✨ Gerar Nova Chave</span>
            <button style={{ ...styles.actionBtn, fontSize: '18px' }} onClick={() => setShowCreate(false)}>✕</button>
          </div>

          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Owner name */}
            <div>
              <label style={styles.label}>👤 Nome do Usuário</label>
              <input
                type="text"
                value={ownerName}
                onChange={e => setOwnerName(e.target.value)}
                placeholder="Ex: João Silva"
                style={styles.input}
              />
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '4px', display: 'block' }}>
                Facilita identificar a quem pertence a chave
              </span>
            </div>

            {/* Max uses */}
            <div>
              <label style={styles.label}>🔢 Máximo de Dispositivos</label>
              <input
                type="number"
                min={1}
                value={maxUses}
                onChange={e => setMaxUses(Math.max(1, +e.target.value))}
                style={{ ...styles.input, maxWidth: '180px' }}
              />
            </div>

            {/* Expiration */}
            <div>
              <label style={styles.label}>📅 Expiração</label>

              {/* Quick select chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                {quickDays.map(q => {
                  const target = new Date(Date.now() + q.value * 86400000).toISOString().split('T')[0];
                  const isActive = !noExpiry && expiryDate === target;
                  return (
                    <button key={q.value} style={chipStyle(isActive)} onClick={() => setQuickExpiry(q.value)}>
                      {q.label}
                    </button>
                  );
                })}
                <button
                  style={chipStyle(noExpiry)}
                  onClick={() => { setNoExpiry(true); setExpiryDate(''); }}
                >
                  ♾️ Sem expiração
                </button>
              </div>

              {/* Date input */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={e => { setExpiryDate(e.target.value); setNoExpiry(false); }}
                  disabled={noExpiry}
                  min={new Date().toISOString().split('T')[0]}
                  style={{ ...styles.input, maxWidth: '220px', opacity: noExpiry ? 0.3 : 1 }}
                />
                {expiryDate && !noExpiry && (
                  <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>
                    Expira em {new Date(expiryDate).toLocaleDateString('pt-BR')}
                  </span>
                )}
                {noExpiry && (
                  <span style={{ fontSize: '12px', color: 'var(--success)', fontWeight: 500 }}>
                    ✓ Chave vitalícia
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ padding: '0 20px 20px', display: 'flex', gap: '12px' }}>
            <button style={{ ...styles.btnPrimary, padding: '12px 28px' }} onClick={createKey} disabled={creating}>
              🔑 {creating ? 'Gerando...' : 'Gerar Chave'}
            </button>
            <button style={styles.btnSecondary} onClick={() => setShowCreate(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.searchBox}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }}>🔍</span>
            <input type="text" placeholder="Buscar chave ou nome..." value={search} onChange={e => setSearch(e.target.value)} style={styles.searchInput} />
          </div>
          <button style={styles.actionBtn} onClick={fetchKeys} title="Atualizar">🔄</button>
        </div>

        {loading && keys.length === 0 ? (
          <div style={styles.empty}>Carregando...</div>
        ) : filteredKeys.length === 0 ? (
          <div style={styles.empty}>{search ? 'Nenhuma chave encontrada' : 'Nenhuma chave criada ainda'}</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Usuário</th>
                <th style={styles.th}>Chave</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Usos</th>
                <th style={styles.th}>Expiração</th>
                <th style={styles.th}>Criada em</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredKeys.map(k => {
                const expired = k.expires_at && new Date(k.expires_at) < new Date();
                const usedUp = k.max_uses !== null && k.current_uses >= k.max_uses;
                const statusLabel = !k.is_active ? 'Inativa' : expired ? 'Expirada' : usedUp ? 'Esgotada' : 'Ativa';

                return (
                  <tr key={k.id} style={{ transition: 'background 0.15s' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--secondary)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ ...styles.td, fontWeight: 500, fontSize: '13px' }}>
                      {k.owner_name || <span style={{ color: 'var(--muted-foreground)', fontStyle: 'italic' }}>—</span>}
                    </td>
                    <td style={styles.td}>
                      <code style={{ fontFamily: "'Share Tech Mono', monospace", letterSpacing: '1.5px', fontSize: '12px', background: 'var(--secondary)', padding: '4px 8px', borderRadius: '6px' }}>{k.key}</code>
                    </td>
                    <td style={styles.td}><StatusBadge label={statusLabel} /></td>
                    <td style={styles.td}>
                      <span style={{ fontWeight: 500 }}>{k.current_uses}</span>
                      <span style={{ color: 'var(--muted-foreground)' }}>/{k.max_uses ?? '∞'}</span>
                    </td>
                    <td style={{ ...styles.td, color: 'var(--muted-foreground)', fontSize: '12px' }}>
                      {k.expires_at ? new Date(k.expires_at).toLocaleDateString('pt-BR') : <span style={{ color: 'var(--success)' }}>Vitalícia</span>}
                    </td>
                    <td style={{ ...styles.td, color: 'var(--muted-foreground)', fontSize: '12px' }}>
                      {new Date(k.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>
                      <button style={styles.actionBtn} onClick={() => copyKey(k.key)} title="Copiar">📋</button>
                      <button style={{ ...styles.actionBtn, color: k.is_active ? 'var(--success)' : 'var(--muted-foreground)' }} onClick={() => toggleActive(k.id, k.is_active)} title={k.is_active ? 'Desativar' : 'Ativar'}>⚡</button>
                      <button style={styles.actionBtn} onClick={() => deleteKey(k.id)} title="Excluir">🗑️</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={styles.footer}>Admin Panel • Acesso Restrito</div>
    </div>
  );
}
