import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Reseller {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  notes: string | null;
  key_count?: number;
}

const styles: Record<string, CSSProperties> = {
  card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' },
  input: { width: '100%', background: 'var(--secondary)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 14px', fontSize: '14px', outline: 'none', fontFamily: 'inherit' },
  label: { display: 'block', fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '6px', fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  table: { width: '100%', fontSize: '13px', borderCollapse: 'collapse' as const },
  th: { padding: '12px 20px', textAlign: 'left' as const, fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', borderBottom: '1px solid var(--border)' },
  td: { padding: '14px 20px', borderBottom: '1px solid var(--border)' },
  badge: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600 },
  actionBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '6px', color: 'var(--muted-foreground)', fontSize: '16px' },
  btnPrimary: { background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', borderRadius: 'var(--radius)', padding: '10px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' },
  btnSecondary: { background: 'var(--secondary)', color: 'var(--secondary-foreground)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' },
  empty: { padding: '60px 20px', textAlign: 'center' as const, color: 'var(--muted-foreground)', fontSize: '14px' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '28px' },
  statCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' },
  statValue: { fontSize: '28px', fontWeight: 700, fontFamily: "'Orbitron', sans-serif" },
  statLabel: { fontSize: '12px', color: 'var(--muted-foreground)', marginTop: '2px' },
};

export default function ResellersPanel() {
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  const fetchResellers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('resellers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Erro ao carregar revendedores');
      setLoading(false);
      return;
    }

    // Count keys per reseller
    const { data: keysData } = await supabase
      .from('license_keys')
      .select('reseller_id');

    const countMap: Record<string, number> = {};
    (keysData || []).forEach((k: any) => {
      if (k.reseller_id) countMap[k.reseller_id] = (countMap[k.reseller_id] || 0) + 1;
    });

    setResellers(((data || []) as Reseller[]).map(r => ({ ...r, key_count: countMap[r.id] || 0 })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchResellers(); }, [fetchResellers]);

  const createReseller = async () => {
    if (!name.trim()) { toast.error('Nome é obrigatório'); return; }
    setCreating(true);
    const { error } = await supabase.from('resellers').insert({
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      notes: notes.trim() || null,
    });
    if (error) toast.error('Erro: ' + error.message);
    else {
      toast.success('Revendedor criado!');
      fetchResellers();
      setShowCreate(false);
      setName(''); setEmail(''); setPhone(''); setNotes('');
    }
    setCreating(false);
  };

  const toggleActive = async (id: string, current: boolean) => {
    const { error } = await supabase.from('resellers').update({ is_active: !current }).eq('id', id);
    if (error) toast.error('Erro');
    else setResellers(prev => prev.map(r => r.id === id ? { ...r, is_active: !current } : r));
  };

  const deleteReseller = async (id: string) => {
    if (!confirm('Excluir este revendedor? As chaves associadas permanecerão.')) return;
    const { error } = await supabase.from('resellers').delete().eq('id', id);
    if (error) toast.error('Erro');
    else { setResellers(prev => prev.filter(r => r.id !== id)); toast.success('Excluído'); }
  };

  const activeCount = resellers.filter(r => r.is_active).length;
  const totalKeys = resellers.reduce((sum, r) => sum + (r.key_count || 0), 0);

  return (
    <div>
      {/* Stats */}
      <div style={styles.statsGrid}>
        {[
          { label: 'Total Revendedores', value: resellers.length, icon: '🤝' },
          { label: 'Ativos', value: activeCount, icon: '✅' },
          { label: 'Chaves Geradas', value: totalKeys, icon: '🔑' },
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

      {/* Create */}
      {showCreate && (
        <div style={{ ...styles.card, marginBottom: '24px' }}>
          <div style={styles.cardHeader}>
            <span style={{ fontWeight: 600, fontSize: '15px' }}>🤝 Novo Revendedor</span>
            <button style={{ ...styles.actionBtn, fontSize: '18px' }} onClick={() => setShowCreate(false)}>✕</button>
          </div>
          <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={styles.label}>👤 Nome *</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Nome do revendedor" style={styles.input} />
            </div>
            <div>
              <label style={styles.label}>📧 Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" style={styles.input} />
            </div>
            <div>
              <label style={styles.label}>📱 Telefone</label>
              <input type="text" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(11) 99999-9999" style={styles.input} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={styles.label}>📝 Observações</label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anotações opcionais..." style={styles.input} />
            </div>
          </div>
          <div style={{ padding: '0 20px 20px', display: 'flex', gap: '12px' }}>
            <button style={{ ...styles.btnPrimary, padding: '12px 28px' }} onClick={createReseller} disabled={creating}>
              {creating ? '⏳ Criando...' : '✅ Criar Revendedor'}
            </button>
            <button style={styles.btnSecondary} onClick={() => setShowCreate(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <span style={{ fontWeight: 600 }}>Lista de Revendedores</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={styles.actionBtn} onClick={fetchResellers} title="Atualizar">🔄</button>
            <button style={styles.btnPrimary} onClick={() => setShowCreate(!showCreate)}>＋ Novo</button>
          </div>
        </div>

        {loading && resellers.length === 0 ? (
          <div style={styles.empty}>Carregando...</div>
        ) : resellers.length === 0 ? (
          <div style={styles.empty}>Nenhum revendedor cadastrado</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Nome</th>
                <th style={styles.th}>Contato</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Chaves</th>
                <th style={styles.th}>Desde</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {resellers.map(r => (
                <tr key={r.id} style={{ transition: 'background 0.15s' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--secondary)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ ...styles.td, fontWeight: 500 }}>
                    <div>{r.name}</div>
                    {r.notes && <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '2px' }}>{r.notes}</div>}
                  </td>
                  <td style={{ ...styles.td, fontSize: '12px', color: 'var(--muted-foreground)' }}>
                    {r.email && <div>📧 {r.email}</div>}
                    {r.phone && <div>📱 {r.phone}</div>}
                    {!r.email && !r.phone && '—'}
                  </td>
                  <td style={styles.td}>
                    <span style={{
                      ...styles.badge,
                      background: r.is_active ? 'rgba(46,204,113,0.12)' : 'rgba(90,95,114,0.12)',
                      color: r.is_active ? 'var(--success)' : 'var(--muted-foreground)',
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                      {r.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td style={{ ...styles.td, fontWeight: 500 }}>{r.key_count || 0}</td>
                  <td style={{ ...styles.td, color: 'var(--muted-foreground)', fontSize: '12px' }}>
                    {new Date(r.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>
                    <button style={{ ...styles.actionBtn, color: r.is_active ? 'var(--success)' : 'var(--muted-foreground)' }} onClick={() => toggleActive(r.id, r.is_active)} title={r.is_active ? 'Desativar' : 'Ativar'}>⚡</button>
                    <button style={styles.actionBtn} onClick={() => deleteReseller(r.id)} title="Excluir">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}