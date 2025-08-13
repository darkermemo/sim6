import { Link } from "react-router-dom";

/**
 * Home page - landing page for the app
 */
export default function Home() {
  const cards = [
    {
      icon: '📊',
      title: 'Security Dashboard',
      description: 'Real-time security metrics and analytics',
      link: '/dashboard',
      color: 'var(--color-primary)'
    },
    {
      icon: '🔍',
      title: 'Search Events',
      description: 'Query security events with powerful search capabilities',
      link: '/search',
      color: 'var(--color-info)'
    },
    {
      icon: '🚨',
      title: 'Alerts',
      description: 'Monitor and manage security alerts in real-time',
      link: '/alerts',
      color: 'var(--color-error)',
      disabled: true
    },
    {
      icon: '📋',
      title: 'Rules',
      description: 'Create and manage detection rules',
      link: '/rules',
      color: 'var(--color-warning)',
      disabled: true
    },
    {
      icon: '💚',
      title: 'System Health',
      description: 'Check system status and health metrics',
      link: '/health',
      color: 'var(--color-success)'
    }
  ];

  return (
    <div data-testid="page-home" className="container">
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-2xl)' }}>
        <h1 style={{ 
          fontSize: '3rem', 
          fontWeight: 700,
          background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-info) 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginBottom: 'var(--space-md)'
        }}>
          Welcome to SIEM v2
        </h1>
        <p className="text-secondary" style={{ fontSize: '1.125rem', maxWidth: '600px', margin: '0 auto' }}>
          Your centralized platform for security information and event management. 
          Monitor, analyze, and respond to security threats in real-time.
        </p>
      </div>

      <div className="grid" style={{ 
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 'var(--space-lg)',
        marginTop: 'var(--space-2xl)'
      }}>
        {cards.map((card) => {
          const CardContent = (
            <>
              <div style={{ 
                fontSize: '3rem', 
                marginBottom: 'var(--space-md)',
                filter: `drop-shadow(0 2px 4px ${card.color}33)`
              }}>
                {card.icon}
              </div>
              <h3 style={{ marginBottom: 'var(--space-sm)' }}>{card.title}</h3>
              <p className="text-secondary" style={{ marginBottom: 0 }}>
                {card.description}
              </p>
              {card.disabled && (
                <div style={{
                  position: 'absolute',
                  top: 'var(--space-sm)',
                  right: 'var(--space-sm)',
                  backgroundColor: 'var(--bg-tertiary)',
                  padding: '0.25rem 0.5rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  fontWeight: 500
                }}>
                  Coming Soon
                </div>
              )}
            </>
          );

          if (card.disabled) {
            return (
              <div
                key={card.title}
                className="card"
                style={{
                  display: 'block',
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: 'all 0.3s',
                  cursor: 'not-allowed',
                  opacity: 0.5,
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {CardContent}
              </div>
            );
          }

          return (
            <Link
              key={card.title}
              to={card.link}
              className="card"
              style={{
                display: 'block',
                textDecoration: 'none',
                color: 'inherit',
                transition: 'all 0.3s',
                cursor: 'pointer',
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
              }}
            >
              {CardContent}
            </Link>
          );
        })}
      </div>

      <div className="card" style={{ 
        marginTop: 'var(--space-2xl)',
        background: 'linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%)',
        textAlign: 'center'
      }}>
        <h3>Quick Stats</h3>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 'var(--space-lg)',
          marginTop: 'var(--space-lg)'
        }}>
          <div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-primary)' }}>--</div>
            <div className="text-sm text-secondary">Events Today</div>
          </div>
          <div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-error)' }}>--</div>
            <div className="text-sm text-secondary">Active Alerts</div>
          </div>
          <div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-warning)' }}>--</div>
            <div className="text-sm text-secondary">Detection Rules</div>
          </div>
          <div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-success)' }}>✓</div>
            <div className="text-sm text-secondary">System Status</div>
          </div>
        </div>
      </div>
    </div>
  );
}
