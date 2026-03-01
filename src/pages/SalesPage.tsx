import { useState } from 'react';
import { Link } from 'react-router-dom';

const plans = [
  {
    id: 'basic',
    name: 'Básico',
    price: 'R$ 19,90',
    period: '30 dias',
    days: 30,
    features: ['1 dispositivo', 'Suporte por email', 'Atualizações incluídas'],
    popular: false,
  },
  {
    id: 'pro',
    name: 'Profissional',
    price: 'R$ 49,90',
    period: '90 dias',
    days: 90,
    features: ['3 dispositivos', 'Suporte prioritário', 'Atualizações incluídas', 'Recursos avançados'],
    popular: true,
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 'R$ 99,90',
    period: 'Vitalício',
    days: 0,
    features: ['Dispositivos ilimitados', 'Suporte VIP 24/7', 'Atualizações vitalícias', 'Recursos exclusivos', 'Acesso antecipado'],
    popular: false,
  },
];

export default function SalesPage() {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const handleBuy = (planId: string) => {
    setSelectedPlan(planId);
    // Payment gateway integration will be added later
    alert('Integração com gateway de pagamento será configurada em breve!');
  };

  return (
    <div className="sales-page">
      {/* Nav */}
      <nav className="sales-nav">
        <div className="sales-nav-inner">
          <span className="sales-logo">🚀 AUTO POSTER</span>
          <div className="sales-nav-links">
            <a href="#features">Recursos</a>
            <a href="#pricing">Preços</a>
            <Link to="/admin" className="sales-nav-admin">Admin</Link>
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
              >
                Comprar Agora
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
