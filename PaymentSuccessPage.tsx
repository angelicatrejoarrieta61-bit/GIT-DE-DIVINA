import React from 'react';
import { Link } from 'react-router-dom';

export const PaymentSuccessPage: React.FC = () => (
  <div style={{ paddingTop: 'calc(var(--nav-h) + 80px)', textAlign: 'center', minHeight: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }} className="page-width">
    <div style={{ fontSize: 72, marginBottom: 24 }}>✅</div>
    <h1 style={{ fontFamily: 'var(--f-heading)', fontSize: 36, marginBottom: 16 }}>¡Pago exitoso!</h1>
    <p style={{ color: 'var(--c-text-muted)', maxWidth: 480, lineHeight: 1.7, marginBottom: 32 }}>
      Gracias por tu compra en Divina Store MX. Recibirás un correo de confirmación con los detalles de tu pedido.
    </p>
    <Link to="/" className="btn btn-lime">Volver al inicio</Link>
  </div>
);

export const PaymentErrorPage: React.FC = () => (
  <div style={{ paddingTop: 'calc(var(--nav-h) + 80px)', textAlign: 'center', minHeight: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }} className="page-width">
    <div style={{ fontSize: 72, marginBottom: 24 }}>❌</div>
    <h1 style={{ fontFamily: 'var(--f-heading)', fontSize: 36, marginBottom: 16 }}>Pago no procesado</h1>
    <p style={{ color: 'var(--c-text-muted)', maxWidth: 480, lineHeight: 1.7, marginBottom: 32 }}>
      Hubo un problema al procesar tu pago. Por favor intenta de nuevo o contáctanos por WhatsApp.
    </p>
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
      <Link to="/checkout" className="btn btn-lime">Intentar de nuevo</Link>
      <Link to="/contacto" className="btn btn-outline">Contactar</Link>
    </div>
  </div>
);
