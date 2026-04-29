import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';

export const PaymentSuccessPage: React.FC = () => {
  const [params] = useSearchParams();
  const orderId = params.get('order');

  return (
    <div
      style={{
        paddingTop: 'calc(var(--nav-h) + 60px)',
        paddingBottom: 80,
        minHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      className="page-width"
    >
      {/* Success animation ring */}
      <div style={{ position: 'relative', marginBottom: 32 }}>
        <div style={{
          width: 100, height: 100,
          borderRadius: '50%',
          background: 'rgba(196, 252, 21, 0.1)',
          border: '2px solid rgba(196, 252, 21, 0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 44,
          animation: 'successPop 0.5s ease',
        }}>
          ✅
        </div>
        <div style={{
          position: 'absolute', inset: -8,
          borderRadius: '50%',
          border: '2px solid rgba(196, 252, 21, 0.15)',
          animation: 'successRing 1.5s ease infinite',
        }} />
      </div>

      <h1 style={{
        fontFamily: 'var(--f-heading)',
        fontSize: 36,
        marginBottom: 12,
        textAlign: 'center',
      }}>
        ¡Pago <span className="lime-text">exitoso!</span>
      </h1>

      <p style={{
        color: 'var(--c-text-muted)',
        maxWidth: 520,
        lineHeight: 1.7,
        marginBottom: 12,
        textAlign: 'center',
        fontSize: 16,
      }}>
        Gracias por tu compra en <strong style={{ color: '#fff' }}>Divina Store MX</strong>.
        Recibirás un correo de confirmación con los detalles de tu pedido en breve.
      </p>

      {orderId && (
        <div style={{
          background: 'rgba(196, 252, 21, 0.06)',
          border: '1px solid rgba(196, 252, 21, 0.2)',
          borderRadius: 10,
          padding: '10px 24px',
          marginBottom: 32,
          fontFamily: 'var(--f-sub)',
          fontSize: 13,
        }}>
          <span style={{ color: 'var(--c-text-muted)' }}>Número de pedido: </span>
          <span style={{ color: 'var(--c-lime)', fontWeight: 700 }}>{orderId.slice(0, 8).toUpperCase()}</span>
        </div>
      )}

      {/* Info cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 16,
        maxWidth: 560,
        width: '100%',
        marginBottom: 40,
      }}>
        {[
          { icon: '📧', title: 'Confirmación', desc: 'Revisa tu correo electrónico' },
          { icon: '📦', title: 'Preparación', desc: 'Tu pedido está siendo preparado' },
          { icon: '🚚', title: 'Envío', desc: 'Te notificaremos cuando salga' },
        ].map(item => (
          <div key={item.title} style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 14,
            padding: '20px 16px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{item.icon}</div>
            <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 4px' }}>{item.title}</p>
            <p style={{ fontSize: 12, color: 'var(--c-text-muted)', margin: 0, lineHeight: 1.4 }}>{item.desc}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link to="/" className="btn btn-lime">Volver al inicio</Link>
        <Link to="/catalogo" className="btn btn-outline">Seguir comprando</Link>
      </div>

      <style>{`
        @keyframes successPop {
          0% { transform: scale(0.5); opacity: 0; }
          70% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes successRing {
          0% { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(1.4); opacity: 0; }
        }
      `}</style>
    </div>
  );
};
