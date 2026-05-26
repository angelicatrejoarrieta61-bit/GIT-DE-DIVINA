import React, { useState, useEffect } from 'react';
import { getStoreConfig } from '../lib/queries';
import { supabase, getImageUrl } from '../lib/supabase';
import './ContactPage.css';
import './CollectionPage.css';

export const ContactPage: React.FC = () => {
  const [form, setForm] = useState({ 
    firstName: '', 
    lastNamePaterno: '', 
    lastNameMaterno: '', 
    email: '', 
    message: '',
    register: false
  });
  const [whatsapp, setWhatsapp] = useState('5215647438328');
  const [contactEmail, setContactEmail] = useState('admin@divinastore.com.mx');
  const [showCoupon, setShowCoupon] = useState(false);
  
  const [bgImg, setBgImg] = useState<string | null>(null);
  const [bgX, setBgX] = useState('0');
  const [bgY, setBgY] = useState('0');
  const [cardX, setCardX] = useState('0');
  const [cardY, setCardY] = useState('0');
  const [cardScale, setCardScale] = useState('1');
  const [contactTitle, setContactTitle] = useState('Ponte en <span class="lime-text">Contacto</span>');
  const [contactSub, setContactSub] = useState('¿Tienes alguna duda sobre nuestros productos o necesitas ayuda con tu pedido? Escríbenos.');

  useEffect(() => {
    getStoreConfig().then(cfg => {
      if (cfg.contact_whatsapp) setWhatsapp(cfg.contact_whatsapp);
      if (cfg.contact_email) setContactEmail(cfg.contact_email);
      
      if (cfg.contact_hero_img) setBgImg(cfg.contact_hero_img);
      if (cfg.contact_hero_bg_x) setBgX(cfg.contact_hero_bg_x);
      if (cfg.contact_hero_bg_y) setBgY(cfg.contact_hero_bg_y);
      if (cfg.contact_hero_card_x) setCardX(cfg.contact_hero_card_x);
      if (cfg.contact_hero_card_y) setCardY(cfg.contact_hero_card_y);
      if (cfg.contact_hero_card_scale) setCardScale(String(parseInt(cfg.contact_hero_card_scale) / 100));
      if (cfg.contact_hero_title !== undefined) setContactTitle(cfg.contact_hero_title);
      if (cfg.contact_hero_subtitle !== undefined) setContactSub(cfg.contact_hero_subtitle);
    });

    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'ADMIN_PREVIEW_UPDATE') {
        const payload = e.data.payload;
        if (payload.contact_whatsapp !== undefined) setWhatsapp(payload.contact_whatsapp);
        if (payload.contact_email !== undefined) setContactEmail(payload.contact_email);

        if (payload.contact_hero_img !== undefined) setBgImg(payload.contact_hero_img);
        if (payload.contact_hero_bg_x !== undefined) setBgX(payload.contact_hero_bg_x);
        if (payload.contact_hero_bg_y !== undefined) setBgY(payload.contact_hero_bg_y);
        if (payload.contact_hero_card_x !== undefined) setCardX(payload.contact_hero_card_x);
        if (payload.contact_hero_card_y !== undefined) setCardY(payload.contact_hero_card_y);
        if (payload.contact_hero_card_scale !== undefined) setCardScale(String(parseInt(payload.contact_hero_card_scale) / 100));
        if (payload.contact_hero_title !== undefined) setContactTitle(payload.contact_hero_title);
        if (payload.contact_hero_subtitle !== undefined) setContactSub(payload.contact_hero_subtitle);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.firstName && form.email && form.message) {
      try {
        // 1. Save to database
        const { error: msgError } = await supabase.from('contact_messages').insert([{
          first_name: form.firstName,
          last_name_paterno: form.lastNamePaterno,
          last_name_materno: form.lastNameMaterno,
          email: form.email,
          message: form.message,
          status: 'pending'
        }]);
        if (msgError && msgError.code !== '42P01') console.error('Error saving message:', msgError);

        if (form.register) {
          await supabase.from('subscribers').insert([{ 
            first_name: form.firstName,
            last_name_paterno: form.lastNamePaterno,
            last_name_materno: form.lastNameMaterno,
            email: form.email,
            source: 'contact_form'
          }]);
        }

        // 2. Send real emails via API
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'contact',
            firstName: form.firstName,
            email: form.email,
            message: form.message,
            subscribe: form.register,
          }),
        }).catch(() => {}); // Falla silenciosamente si SMTP no está configurado

      } catch(err) { 
        console.error('Contact form error:', err);
      }
      
      setShowCoupon(true);
    }
  };

  return (
    <div className="contact-page collection-page" style={{ paddingTop: 'var(--nav-h)' }}>
      {/* Banner Hero */}
      <div 
        className="collection-page__banner"
        style={{ height: bgImg ? '60vh' : '40vh' }}
      >
        {bgImg && (
          <img 
            src={getImageUrl(bgImg, { width: 1920, quality: 80 }) || ''} 
            alt="Contact Hero" 
            className="collection-page__bg-img"
            style={{ 
              '--bg-x': `${bgX}px`, 
              '--bg-y': `${bgY}px`
            } as React.CSSProperties} 
          />
        )}
        <div className="collection-page__banner-overlay" style={{ zIndex: 2 }} />
        {(contactTitle || contactSub) && (
          <div 
            className="page-width collection-page__banner-content glass"
            style={{
              '--card-x': `${cardX}px`,
              '--card-y': `${cardY}px`,
              '--card-scale': cardScale
            } as React.CSSProperties}
          >
            <div className="divider" style={{ marginBottom: 16 }} />
            {contactTitle && <h1 className="contact-page__title" style={{ fontSize: '42px', fontFamily: 'var(--f-heading)', marginBottom: '8px', color: 'var(--c-white)' }} dangerouslySetInnerHTML={{ __html: contactTitle }} />}
            {contactSub && <p className="contact-page__desc muted-text" style={{ fontSize: '15px' }} dangerouslySetInnerHTML={{ __html: contactSub }} />}
          </div>
        )}
      </div>

      <div className="page-width section" style={{ paddingTop: 20 }}>
        <div className="contact-page__grid">
          {/* Info - Left Side */}
          <div className="contact-page__info">
            <h2 style={{ fontSize: 22, fontFamily: 'var(--f-heading)', color: 'var(--c-lime)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 4 }}>COMUNÍCATE INMEDIATAMENTE</h2>
            <div className="contact-card">
              <div className="contact-card__icon">
                <svg viewBox="0 0 24 24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                </svg>
              </div>
              <h3 className="contact-card__title">WhatsApp</h3>
              <p className="contact-card__text">+{whatsapp}</p>
              <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className="btn btn-lime" style={{ marginTop: 12, width: '100%', justifyContent: 'center' }}>
                Enviar mensaje directo
              </a>
            </div>
            
            <div className="contact-card">
              <div className="contact-card__icon">
                <svg viewBox="0 0 24 24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="16" x="2" y="4" rx="2"></rect>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
                </svg>
              </div>
              <h3 className="contact-card__title">Email</h3>
              <p className="contact-card__text">{contactEmail}</p>
            </div>
          </div>

          {/* Form - Right Side */}
          <div className="contact-page__form-wrapper glass">
            <h2 style={{ fontSize: 18, fontFamily: 'var(--f-heading)', color: 'var(--c-lime)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 20 }}>CONTÁCTANOS Y NOS COMUNICAREMOS A LA BREVEDAD</h2>
            {showCoupon ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <h3 style={{ fontSize: 28, color: 'var(--c-lime)', fontFamily: 'var(--f-heading)', marginBottom: 12 }}>¡Mensaje Enviado!</h3>
                {form.register ? (
                  <>
                    <p style={{ color: '#aaa', fontSize: 15, marginBottom: 20 }}>Gracias por registrarte. ¡Utiliza este cupón en tu próxima compra!</p>
                    <div className="contact-form__coupon">
                      <p>CUPÓN DE 10% DE DESCUENTO</p>
                      <h4>DESCUENTO202610</h4>
                    </div>
                  </>
                ) : (
                  <p style={{ color: '#aaa', fontSize: 15, marginBottom: 20 }}>Nos pondremos en contacto contigo lo más pronto posible al correo {form.email}.</p>
                )}
                <button onClick={() => { setShowCoupon(false); setForm({ firstName: '', lastNamePaterno: '', lastNameMaterno: '', email: '', message: '', register: false }); }} className="btn btn-outline" style={{ marginTop: 24 }}>
                  Enviar otro mensaje
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="contact-form">
                <div className="contact-form__field">
                  <label htmlFor="firstName">Nombre(s)</label>
                  <input id="firstName" type="text" className="input-dark" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} required />
                </div>
                <div className="contact-form__row">
                  <div className="contact-form__field">
                    <label htmlFor="lastNamePaterno">Apellido Paterno</label>
                    <input id="lastNamePaterno" type="text" className="input-dark" value={form.lastNamePaterno} onChange={e => setForm({ ...form, lastNamePaterno: e.target.value })} required />
                  </div>
                  <div className="contact-form__field">
                    <label htmlFor="lastNameMaterno">Apellido Materno</label>
                    <input id="lastNameMaterno" type="text" className="input-dark" value={form.lastNameMaterno} onChange={e => setForm({ ...form, lastNameMaterno: e.target.value })} />
                  </div>
                </div>
                <div className="contact-form__field">
                  <label htmlFor="email">Correo electrónico</label>
                  <input id="email" type="email" className="input-dark" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
                </div>
                <label className="contact-form__register" htmlFor="contact-register-check">
                  <input
                    id="contact-register-check"
                    type="checkbox"
                    checked={form.register}
                    onChange={e => setForm({ ...form, register: e.target.checked })}
                    style={{ accentColor: '#c4fc15', width: 18, height: 18, flexShrink: 0, cursor: 'pointer' }}
                  />
                  <span>
                    ¿Deseas registrarte para nuestras promociones y un <strong style={{ color: 'var(--c-lime)' }}>descuento del 10%</strong>?{' '}
                    <span style={{ display: 'inline-block', background: 'var(--c-lime)', color: '#000', padding: '1px 6px', borderRadius: '4px', fontWeight: 900, letterSpacing: '1.5px', fontSize: 11 }}>DESCUENTO202610</span>
                  </span>
                </label>
                <div className="contact-form__field">
                  <label htmlFor="message">Continuar con la duda o pregunta</label>
                  <textarea id="message" className="input-dark" rows={4} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} required />
                </div>
                
                <p className="contact-form__legal">
                  Al enviar este formulario, aceptas nuestra Política de Privacidad y el tratamiento de tus datos personales para brindarte atención y enviarte información comercial si así lo autorizaste.
                </p>

                <button type="submit" className="btn btn-lime" style={{ width: '100%', justifyContent: 'center', fontSize: 20, letterSpacing: '2px', padding: '16px 24px', fontWeight: 900 }}>
                  ENVIAR MENSAJE
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
