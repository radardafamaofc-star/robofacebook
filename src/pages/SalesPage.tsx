import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const plans = [
  {
    id: 'premium',
    name: 'Premium',
    price: 'R$ 150,00',
    period: 'Vitalício',
    days: 0,
    maxUses: null,
    features: ['Dispositivos ilimitados', 'Suporte VIP 24/7', 'Atualizações vitalícias', 'Recursos exclusivos', 'Acesso antecipado'],
    popular: true,
  },
];

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

export default function SalesPage() {
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const handleBuy = async (planId: string) => {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;

    setPurchasing(planId);

    // Simulate payment processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    const newKey = generateKey();
    const expiresAt = plan.days > 0
      ? new Date(Date.now() + plan.days * 86400000).toISOString()
      : null;

    const { error } = await supabase.from('license_keys').insert({
      key: newKey,
      max_uses: plan.maxUses,
      expires_at: expiresAt,
    });

    setPurchasing(null);

    if (error) {
      toast.error('Erro ao gerar chave. Tente novamente.');
      return;
    }

    setGeneratedKey(newKey);
    setShowModal(true);
    toast.success('Pagamento confirmado! Chave gerada.');
  };

  const copyKey = () => {
    if (generatedKey) {
      navigator.clipboard.writeText(generatedKey);
      toast.success('Chave copiada!');
    }
  };

  return (
    <div className="sales-page">
      {/* Modal de chave gerada */}
      {showModal && generatedKey && (
        <div className="key-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="key-modal" onClick={e => e.stopPropagation()}>
            <div className="key-modal-icon">🎉</div>
            <h3 className="key-modal-title">Pagamento Confirmado!</h3>
            <p className="key-modal-desc">Sua chave de licença foi gerada com sucesso. Copie e use na extensão.</p>
            <div className="key-modal-key">
              <code>{generatedKey}</code>
            </div>
            <div className="key-modal-actions">
              <button className="sales-btn-primary" onClick={copyKey} style={{ width: '100%' }}>
                📋 Copiar Chave
              </button>
              <button className="sales-btn-ghost" onClick={() => setShowModal(false)} style={{ width: '100%', marginTop: '8px', padding: '12px' }}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="sales-nav">
        <div className="sales-nav-inner">
          <span className="sales-logo">🚀 AUTO POSTER</span>
          <div className="sales-nav-links">
            <a href="#features">Recursos</a>
            <a href="#pricing">Preços</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="sales-hero">
        <div className="sales-hero-badge">✨ Automatize suas postagens</div>
        <h1 className="sales-hero-title">
          Publique no <span className="sales-gradient-text">piloto automático</span>
        </h1>
        <p className="sales-hero-desc">
          A extensão definitiva para automatizar suas publicações. Economize horas de trabalho
          e aumente sua produtividade com apenas um clique.
        </p>
        <div className="sales-hero-actions">
          <a href="#pricing" className="sales-btn-primary">Comece Agora →</a>
          <a href="#features" className="sales-btn-ghost">Saiba Mais</a>
        </div>
        <div className="sales-hero-stats">
          <div className="sales-stat">
            <span className="sales-stat-value">500+</span>
            <span className="sales-stat-label">Usuários ativos</span>
          </div>
          <div className="sales-stat-divider" />
          <div className="sales-stat">
            <span className="sales-stat-value">50K+</span>
            <span className="sales-stat-label">Posts automatizados</span>
          </div>
          <div className="sales-stat-divider" />
          <div className="sales-stat">
            <span className="sales-stat-value">99.9%</span>
            <span className="sales-stat-label">Uptime</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="sales-features">
        <h2 className="sales-section-title">Por que escolher o Auto Poster?</h2>
        <div className="sales-features-grid">
          {[
            { icon: '⚡', title: 'Ultra Rápido', desc: 'Publicações automáticas em segundos, sem atrasos.' },
            { icon: '🔒', title: 'Seguro', desc: 'Chaves de licença criptografadas e validação em tempo real.' },
            { icon: '🎯', title: 'Preciso', desc: 'Agendamento inteligente para máximo engajamento.' },
            { icon: '📊', title: 'Analytics', desc: 'Acompanhe o desempenho de cada publicação.' },
            { icon: '🔄', title: 'Atualizações', desc: 'Novas funcionalidades adicionadas constantemente.' },
            { icon: '💬', title: 'Suporte', desc: 'Equipe dedicada pronta para ajudar a qualquer momento.' },
          ].map(f => (
            <div key={f.title} className="sales-feature-card">
              <span className="sales-feature-icon">{f.icon}</span>
              <h3 className="sales-feature-title">{f.title}</h3>
              <p className="sales-feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="sales-pricing">
        <h2 className="sales-section-title">Escolha seu plano</h2>
        <p className="sales-section-desc">Licença entregue instantaneamente após o pagamento</p>
        <div className="sales-pricing-grid">
          {plans.map(plan => (
            <div
              key={plan.id}
              className={`sales-plan-card ${plan.popular ? 'sales-plan-popular' : ''}`}
            >
              {plan.popular && <div className="sales-plan-badge">⭐ Mais Popular</div>}
              <h3 className="sales-plan-name">{plan.name}</h3>
              <div className="sales-plan-price">{plan.price}</div>
              <div className="sales-plan-period">{plan.period}</div>
              <ul className="sales-plan-features">
                {plan.features.map(f => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>
              <button
                className={`sales-plan-btn ${plan.popular ? 'sales-plan-btn-primary' : ''}`}
                onClick={() => handleBuy(plan.id)}
                disabled={purchasing !== null}
              >
                {purchasing === plan.id ? '⏳ Processando...' : 'Comprar Agora'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="sales-faq">
        <h2 className="sales-section-title">Perguntas Frequentes</h2>
        <div className="sales-faq-grid">
          {[
            { q: 'Como recebo minha chave?', a: 'Após o pagamento, sua chave de licença é gerada e entregue automaticamente na tela.' },
            { q: 'Posso usar em quantos dispositivos?', a: 'Depende do plano escolhido. O plano Premium permite dispositivos ilimitados.' },
            { q: 'E se minha chave expirar?', a: 'Você pode renovar a qualquer momento comprando um novo plano.' },
            { q: 'Tem garantia?', a: 'Sim! 7 dias de garantia. Se não gostar, devolvemos seu dinheiro.' },
          ].map(item => (
            <div key={item.q} className="sales-faq-item">
              <h4>{item.q}</h4>
              <p>{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="sales-footer">
        <p>© 2026 Auto Poster — Todos os direitos reservados</p>
      </footer>
    </div>
  );
}
