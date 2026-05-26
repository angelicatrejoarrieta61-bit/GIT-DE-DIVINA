import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getStoreConfig } from '../lib/queries';
import { supabase } from '../lib/supabase';
import './LegalModal.css';
import './FloatingContactBubble.css';

const COUPON = 'DESCUENTO202610';

export const FloatingContactBubble: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [render, setRender] = useState(false);
  const [whatsapp, setWhatsapp] = useState('5215647438328');
  const [contactEmail, setContactEmail] = useState('admin@divinastore.com.mx');
  const [form, setForm] = useState({
    name: '',
    email: '',
    message: '',
    register: false,
  });
  const [showCoupon, setShowCoupon] = useState(false);

  useEffect(() => {
    getStoreConfig().then(cfg => {
      if (cfg.contact_whatsapp) setWhatsapp(cfg.contact_whatsapp);
      if (cfg.contact_email) setContactEmail(cfg.contact_email);
    });
  }, []);

  useEffect(() => {
    if (isOpen) setRender(true);
  }, [isOpen]);

  const handleAnimationEnd = (e: React.AnimationEvent) => {
    if (e.target === e.currentTarget && !isOpen) {
      setRender(false);
      setShowCoupon(false);
    }
  };

  const handleClose = () => setIsOpen(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await supabase.from('contact_messages').insert([{
        first_name: form.name,
        email: form.email,
        message: form.message,
        source: 'floating_bubble',
        status: 'pending',
      }]);
      if (form.register) {
        await supabase.from('subscribers').insert([{
          first_name: form.name,
          email: form.email,
          source: 'floating_bubble',
        }]);
      }
    } catch (err) {
      console.error('FloatingContactBubble submit error:', err);
    }
    setShowCoupon(true);
  };

  const modalContent = render ? (
    <div
      className={`legal-modal-overlay ${isOpen ? 'open' : 'closed'}`}
      onClick={handleClose}
      onAnimationEnd={handleAnimationEnd}
    >
      <div
        className={`legal-modal-container ${isOpen ? 'open' : 'closed'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Content */}
        <div className="legal-modal-main" style={{ padding: '24px 8px 24px 24px' }}>
          <h2 className="legal-modal-title">CONTÁCTANOS</h2>
          <p className="legal-modal-date"><em>Te responderemos a la brevedad</em></p>

          <div className="legal-modal-text-content" style={{ maxHeight: '65vh' }}>

            {/* WhatsApp */}
            <div style={{ marginBottom: 14 }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 12 }}>WHATSAPP DIRECTO</h3>
              <a
                href={`https://wa.me/${whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#000', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--c-lime)" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                +{whatsapp}
              </a>
            </div>

            {/* Email */}
            <div style={{ marginBottom: 14 }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 12 }}>CORREO ELECTRÓNICO</h3>
              <p style={{ color: '#000', fontWeight: 600, margin: 0, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--c-lime)" strokeWidth="2">
                  <rect width="20" height="16" x="2" y="4" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                {contactEmail}
              </p>
            </div>

            <hr style={{ borderTop: '1px solid rgba(0,0,0,0.12)', borderBottom: 'none', margin: '14px 0' }} />

            {/* Form or Success */}
            {showCoupon ? (
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>✅</div>
                <h3 style={{ color: '#000', marginBottom: 8, fontSize: 14 }}>¡MENSAJE ENVIADO!</h3>
                {form.register ? (
                  <>
                    <p style={{ color: '#444', fontSize: 11, marginBottom: 12 }}>
                      Gracias por registrarte. ¡Usa este cupón en tu próxima compra!
                    </p>
                    {/* Coupon Box */}
                    <div style={{
                      background: 'var(--c-lime, #c4fc15)',
                      color: '#000',
                      padding: '12px 10px',
                      borderRadius: '8px',
                      fontWeight: 900,
                      letterSpacing: '2px',
                      fontSize: 16,
                      border: '2px dashed rgba(0,0,0,0.25)',
                      marginBottom: 6,
                    }}>
                      {COUPON}
                    </div>
                    <p style={{ color: '#666', fontSize: 10, margin: 0 }}>10% de descuento en tu próxima compra</p>
                  </>
                ) : (
                  <p style={{ color: '#555', fontSize: 11 }}>
                    Te contactaremos lo más pronto posible.
                  </p>
                )}
                <button
                  onClick={() => {
                    setShowCoupon(false);
                    setForm({ name: '', email: '', message: '', register: false });
                  }}
                  style={{
                    marginTop: 16, background: '#000', color: '#fff',
                    border: 'none', padding: '7px 16px', borderRadius: '6px',
                    cursor: 'pointer', fontSize: 11, fontWeight: 700,
                  }}
                >
                  Enviar otro mensaje
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <h3 style={{ margin: '0 0 2px', fontSize: 12 }}>O ENVÍANOS UN MENSAJE</h3>

                <input
                  type="text"
                  placeholder="Nombre completo"
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.2)', background: '#fff', color: '#000', fontSize: 12, boxSizing: 'border-box' }}
                />

                <input
                  type="email"
                  placeholder="Correo electrónico"
                  required
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.2)', background: '#fff', color: '#000', fontSize: 12, boxSizing: 'border-box' }}
                />

                <textarea
                  placeholder="¿En qué podemos ayudarte?"
                  required
                  rows={3}
                  value={form.message}
                  onChange={e => setForm({ ...form, message: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.2)', background: '#fff', color: '#000', fontSize: 12, resize: 'none', boxSizing: 'border-box' }}
                />

                {/* Register + Coupon Checkbox */}
                <label style={{
                  display: 'flex', gap: '8px', alignItems: 'flex-start',
                  fontSize: 11, color: '#000', cursor: 'pointer',
                  padding: '9px 10px',
                  background: 'rgba(196,252,21,0.15)',
                  borderRadius: '7px',
                  border: '1px solid rgba(196,252,21,0.45)',
                }}>
                  <input
                    type="checkbox"
                    checked={form.register}
                    onChange={e => setForm({ ...form, register: e.target.checked })}
                    style={{ marginTop: 1, accentColor: '#5c7a00', width: 15, height: 15, flexShrink: 0, cursor: 'pointer' }}
                  />
                  <span>
                    Regístrame para promociones y recibir <strong>10% de descuento</strong>{' '}
                    <span style={{ display: 'inline-block', background: '#000', color: '#c4fc15', padding: '1px 5px', borderRadius: '3px', fontWeight: 900, letterSpacing: '1px', fontSize: 10 }}>
                      {COUPON}
                    </span>
                  </span>
                </label>

                <button
                  type="submit"
                  style={{
                    background: '#000', color: 'var(--c-lime, #c4fc15)',
                    border: 'none', padding: '10px', borderRadius: '6px',
                    fontWeight: 800, fontSize: 12, letterSpacing: '0.5px',
                    cursor: 'pointer', marginTop: 2,
                  }}
                >
                  ENVIAR MENSAJE
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Arrow pointing right (toward the bubble) */}
        <div className="legal-modal-arrow">
          <svg preserveAspectRatio="none" viewBox="0 0 100 100">
            <polygon points="0,0 95,50 0,100" fill="#f4f9fa" />
            <polyline points="0,0 95,50 0,100" fill="none" stroke="var(--c-lime)" strokeWidth="12" vectorEffect="non-scaling-stroke" strokeLinejoin="miter" strokeLinecap="square" />
          </svg>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {/* ── Floating Bubble Button ── */}
      <button
        className="fcb-bubble"
        onClick={() => setIsOpen(prev => !prev)}
        aria-label="Abrir formulario de contacto"
        title="Contáctanos"
        id="floating-contact-bubble"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span className="fcb-bubble__label">Contacto</span>
        <span className="fcb-bubble__ping" aria-hidden="true" />
      </button>

      {createPortal(modalContent, document.body)}
    </>
  );
};
