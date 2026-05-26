import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getStoreConfig } from '../lib/queries';
import { supabase } from '../lib/supabase';
import '../pages/ContactPage.css'; // Reusa los estilos de la página de contacto

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ContactModal: React.FC<ContactModalProps> = ({ isOpen, onClose }) => {
  const [render, setRender] = useState(isOpen);
  const [whatsapp, setWhatsapp] = useState('525513848670');
  const [contactEmail, setContactEmail] = useState('admin@divinastore.com.mx');
  
  const [form, setForm] = useState({ 
    firstName: '', 
    lastNamePaterno: '', 
    lastNameMaterno: '', 
    email: '', 
    message: '',
    register: false
  });
  const [showCoupon, setShowCoupon] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRender(true);
    }
  }, [isOpen]);

  useEffect(() => {
    getStoreConfig().then(cfg => {
      if (cfg.contact_whatsapp) setWhatsapp(cfg.contact_whatsapp);
      if (cfg.contact_email) setContactEmail(cfg.contact_email);
    });
  }, []);

  const handleAnimationEnd = (e: React.AnimationEvent) => {
    if (e.target === e.currentTarget && !isOpen) {
      setRender(false);
      setShowCoupon(false); // reset al cerrar
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Save message
      const { error: msgError } = await supabase.from('contact_messages').insert([{
        first_name: form.firstName,
        email: form.email,
        message: form.message,
        source: 'contact_modal',
        status: 'pending'
      }]);
      if (msgError && msgError.code !== '42P01') console.error('Msg error:', msgError);

      if (form.register) {
        await supabase.from('subscribers').insert([{
          email: form.email,
          first_name: form.firstName,
          source: 'contact_modal'
        }]);
      }
    } catch (err) {
      console.error("Error silently handled", err);
    }
    setShowCoupon(true);
  };

  if (!render) return null;

  const modalContent = (
    <div 
      className={`legal-modal-overlay ${isOpen ? 'open' : 'closed'}`} 
      onClick={onClose}
      onAnimationEnd={handleAnimationEnd}
      style={{ alignItems: 'flex-end', justifyContent: 'flex-start', paddingLeft: '40px' }}
    >
      <div 
        className={`legal-modal-container ${isOpen ? 'open' : 'closed'}`}
        onClick={e => e.stopPropagation()}
        style={{ transformOrigin: 'bottom left', marginLeft: '10px' }}
      >
        <div className="legal-modal-main" style={{ padding: '24px 8px 24px 24px' }}>
          <h2 className="legal-modal-title">CONTÁCTANOS</h2>
          <p className="legal-modal-date"><em>Te responderemos a la brevedad</em></p>
          
          <div className="legal-modal-text-content" style={{ maxHeight: '60vh' }}>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 12 }}>WHATSAPP DIRECTO</h3>
              <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" style={{ color: '#000', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--c-lime)" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                +{whatsapp}
              </a>
              <p style={{ fontSize: 9, color: '#666', margin: '4px 0 0' }}>Soporte administrativo: admin@divinastore.com.mx</p>
            </div>

            <div style={{ marginBottom: 20 }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 12 }}>CORREO ELECTRÓNICO</h3>
              <p style={{ color: '#000', fontWeight: 600, margin: 0, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--c-lime)" strokeWidth="2"><rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>
                {contactEmail}
              </p>
            </div>

            <hr style={{ borderTop: '1px solid rgba(0,0,0,0.1)', borderBottom: 'none', margin: '16px 0' }} />

            {showCoupon ? (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <div style={{ fontSize: 26, marginBottom: 6 }}>✅</div>
                <h3 style={{ color: '#000', marginBottom: 8, fontSize: 14 }}>¡MENSAJE ENVIADO!</h3>
                {form.register ? (
                  <>
                    <p style={{ color: '#555', fontSize: 11, marginBottom: 10 }}>Gracias por registrarte. ¡Usa este cupón en tu próxima compra!</p>
                    <div style={{ background: 'var(--c-lime)', color: '#000', padding: '10px 8px', borderRadius: '6px', fontWeight: 900, letterSpacing: '2px', fontSize: 15, border: '2px dashed rgba(0,0,0,0.2)' }}>
                      DESCUENTO202610
                    </div>
                    <p style={{ color: '#666', fontSize: 10, marginTop: 4 }}>10% de descuento en tu próxima compra</p>
                  </>
                ) : (
                  <p style={{ color: '#555', fontSize: 11 }}>Te contactaremos lo más pronto posible.</p>
                )}
                <button onClick={() => { setShowCoupon(false); setForm({ firstName: '', lastNamePaterno: '', lastNameMaterno: '', email: '', message: '', register: false }); }} style={{ marginTop: 16, background: '#000', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                  Enviar otro
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <h3 style={{ margin: '0 0 4px', fontSize: 12 }}>O ENVÍANOS UN MENSAJE</h3>
                
                <input type="text" placeholder="Nombre completo" required value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.2)', background: '#fff', color: '#000', fontSize: 12 }} />
                
                <input type="email" placeholder="Correo electrónico" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.2)', background: '#fff', color: '#000', fontSize: 12 }} />
                
                <textarea placeholder="¿En qué podemos ayudarte?" required rows={3} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.2)', background: '#fff', color: '#000', fontSize: 12, resize: 'none' }} />
                
                <div 
                  onClick={() => setForm({ ...form, register: !form.register })}
                  style={{
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'center',
                    fontSize: 11,
                    color: '#000',
                    cursor: 'pointer',
                    userSelect: 'none',
                    padding: '9px 10px',
                    background: 'rgba(196,252,21,0.15)',
                    borderRadius: '7px',
                    border: '1px solid rgba(196,252,21,0.45)',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                >
                  <div 
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '4px',
                      border: '2px solid #5c7a00',
                      background: form.register ? '#5c7a00' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s ease',
                      flexShrink: 0,
                      color: '#fff',
                      fontWeight: 900,
                      fontSize: '11px',
                      lineHeight: '1'
                    }}
                  >
                    {form.register && '✓'}
                  </div>
                  <span>Regístrame para promociones y recibir <strong>10% de descuento</strong>{' '}<span style={{ display: 'inline-block', background: '#000', color: '#c4fc15', padding: '1px 5px', borderRadius: '3px', fontWeight: 900, letterSpacing: '1px', fontSize: 10 }}>DESCUENTO202610</span></span>
                </div>

                <button type="submit" style={{ background: '#000', color: 'var(--c-lime)', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 800, fontSize: 12, letterSpacing: '0.5px', cursor: 'pointer', marginTop: 4 }}>
                  ENVIAR MENSAJE
                </button>
              </form>
            )}
          </div>
        </div>
        
        <div className="legal-modal-arrow">
          <svg preserveAspectRatio="none" viewBox="0 0 100 100">
            <polygon points="0,0 95,50 0,100" fill="#f4f9fa" />
            <polyline points="0,0 95,50 0,100" fill="none" stroke="var(--c-lime)" strokeWidth="12" vectorEffect="non-scaling-stroke" strokeLinejoin="miter" strokeLinecap="square"/>
          </svg>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
