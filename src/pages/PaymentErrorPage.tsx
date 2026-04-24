import React from 'react';
import { Link } from 'react-router-dom';

export const PaymentErrorPage: React.FC = () => (
  <div style={{ paddingTop: 'calc(var(--nav-h) + 80px)', textAlign: 'center', minHeight: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }} className="page-width">
    <div style={{ fontSize: 72, marginBottom: 24 }}>❌</div>
    <h1 style={{ fontFamily: 'var(--f-heading)', fontSize: 36, marginBottom: 16 }}>Pago no procesado</h1>
    <p style={{ color: 'var(--c-text-muted)', maxWidth: 480, lineHeight: 1.7, margin: '0 auto 32px' }}>
      Hubo un problema al procesar tu pago. Por favor intenta de nuevo o contáctanos por WhatsApp si el problema persiste.
    </p>
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
      <Link to="/checkout" className="btn btn-lime">Intentar de nuevo</Link>
      <Link to="/contacto" className="btn btn-outline">Contactar soporte</Link>
    </div>
  </div>
);
