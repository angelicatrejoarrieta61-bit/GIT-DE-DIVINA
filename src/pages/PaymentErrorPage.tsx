import React from 'react';
import { Link } from 'react-router-dom';

export const PaymentErrorPage: React.FC = () => (
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
    {/* Error icon */}
    <div style={{
      width: 100, height: 100,
      borderRadius: '50%',
      background: 'rgba(255, 107, 107, 0.1)',
      border: '2px solid rgba(255, 107, 107, 0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 44,
      marginBottom: 32,
    }}>
      ❌
    </div>

    <h1 style={{
      fontFamily: 'var(--f-heading)',
      fontSize: 36,
      marginBottom: 12,
      textAlign: 'center',
    }}>
      Pago <span style={{ color: '#ff6b6b' }}>no procesado</span>
    </h1>

    <p style={{
      color: 'var(--c-text-muted)',
      maxWidth: 480,
      lineHeight: 1.7,
      marginBottom: 24,
      textAlign: 'center',
      fontSize: 16,
    }}>
      Hubo un problema al procesar tu pago. No se realizó ningún cargo a tu tarjeta. Por favor intenta de nuevo o contáctanos.
    </p>

    {/* Common reasons */}
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14,
      padding: '20px 28px',
      maxWidth: 420,
      width: '100%',
      marginBottom: 36,
    }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Posibles causas:</p>
      {[
        'Fondos insuficientes en la tarjeta',
        'Datos de la tarjeta incorrectos',
        'Tarjeta bloqueada o vencida',
        'Límite de compra en línea superado',
      ].map(reason => (
        <div key={reason} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ color: '#ff6b6b', fontSize: 14 }}>·</span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>{reason}</span>
        </div>
      ))}
    </div>

    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
      <Link to="/checkout" className="btn btn-lime">Intentar de nuevo</Link>
      <Link to="/contacto" className="btn btn-outline">Contactar soporte</Link>
    </div>
  </div>
);
