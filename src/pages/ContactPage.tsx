import React, { useState, useEffect } from 'react';
import { getStoreConfig } from '../lib/queries';
import { getImageUrl } from '../lib/supabase';
import './ContactPage.css';

export const ContactPage: React.FC = () => {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [whatsapp, setWhatsapp] = useState('5215647438328');
  const [contactEmail, setContactEmail] = useState('hola@divinastore.com.mx');
  
  const [bgImg, setBgImg] = useState<string | null>(null);
  const [bgX, setBgX] = useState('0');
  const [bgY, setBgY] = useState('0');
  const [cardX, setCardX] = useState('0');
  const [cardY, setCardY] = useState('0');
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
      if (cfg.contact_hero_title !== undefined) setContactTitle(cfg.contact_hero_title);
      if (cfg.contact_hero_subtitle !== undefined) setContactSub(cfg.contact_hero_subtitle);
    });

    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'ADMIN_PREVIEW_UPDATE') {
        const payload = e.data.payload;
        if (payload.contact_hero_img !== undefined) setBgImg(payload.contact_hero_img);
        if (payload.contact_whatsapp) setWhatsapp(payload.contact_whatsapp);
        if (payload.contact_email) setContactEmail(payload.contact_email);
        if (payload.contact_hero_bg_x !== undefined) setBgX(payload.contact_hero_bg_x);
        if (payload.contact_hero_bg_y !== undefined) setBgY(payload.contact_hero_bg_y);
        if (payload.contact_hero_card_x !== undefined) setCardX(payload.contact_hero_card_x);
        if (payload.contact_hero_card_y !== undefined) setCardY(payload.contact_hero_card_y);
        if (payload.contact_hero_title !== undefined) setContactTitle(payload.contact_hero_title);
        if (payload.contact_hero_subtitle !== undefined) setContactSub(payload.contact_hero_subtitle);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.name && form.email && form.message) {
      const text = `Hola Divina Store!\n\nSoy ${form.name} (${form.email}).\n\nMensaje:\n${form.message}`;
      const url = `https://wa.me/${whatsapp}?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank');
      setForm({ name: '', email: '', message: '' });
    }
  };

  return (
    <div className="contact-page" style={{ paddingTop: 'var(--nav-h)' }}>
      {/* Banner Hero */}
      <div 
        className="collection-page__banner"
        style={{ height: bgImg ? '60vh' : '40vh', display: 'flex', alignItems: 'center' }}
      >
        {bgImg && (
          <img 
            src={getImageUrl(bgImg, { width: 1920, quality: 80 }) || ''} 
            alt="Contact Hero" 
            style={{ 
              position: 'absolute', inset: 0, width: '100%', height: '100%', 
              objectFit: 'cover', objectPosition: 'center', zIndex: 1,
              transform: `translate(${bgX}px, ${bgY}px)`
            }} 
          />
        )}
        {(contactTitle || contactSub) && (
          <div 
            className="page-width collection-page__banner-content glass"
            style={{
              maxWidth: 500,
              padding: 32,
              margin: 'auto 0',
              position: 'relative',
              zIndex: 3,
              transform: `translate(${cardX}px, ${cardY}px)`
            }}
          >
            <div className="divider" style={{ marginBottom: 16 }} />
            {contactTitle && <h1 className="contact-page__title" style={{ fontSize: '42px', fontFamily: 'var(--f-heading)', marginBottom: '8px', color: 'var(--c-white)' }} dangerouslySetInnerHTML={{ __html: contactTitle }} />}
            {contactSub && <p className="contact-page__desc muted-text" style={{ fontSize: '15px' }} dangerouslySetInnerHTML={{ __html: contactSub }} />}
          </div>
        )}
      </div>

      <div className="page-width section">
        <div className="contact-page__grid">
          {/* Info */}
          <div className="contact-page__info">
            <div className="contact-card">
              <div className="contact-card__icon">📱</div>
              <h3 className="contact-card__title">WhatsApp</h3>
              <p className="contact-card__text">+{whatsapp}</p>
              <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className="btn btn-lime" style={{ marginTop: 12 }}>
                Enviar mensaje
              </a>
            </div>
            
            <div className="contact-card">
              <div className="contact-card__icon">✉️</div>
              <h3 className="contact-card__title">Email</h3>
              <p className="contact-card__text">{contactEmail}</p>
            </div>
          </div>

          {/* Form */}
          <div className="contact-page__form-wrapper glass">
              <form onSubmit={handleSubmit} className="contact-form">
                <div className="contact-form__field">
                  <label htmlFor="name">Nombre</label>
                  <input
                    id="name"
                    type="text"
                    className="input-dark"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>
                <div className="contact-form__field">
                  <label htmlFor="email">Correo electrónico</label>
                  <input
                    id="email"
                    type="email"
                    className="input-dark"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    required
                  />
                </div>
                <div className="contact-form__field">
                  <label htmlFor="message">Mensaje</label>
                  <textarea
                    id="message"
                    className="input-dark"
                    rows={5}
                    value={form.message}
                    onChange={e => setForm({ ...form, message: e.target.value })}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-lime" style={{ width: '100%', justifyContent: 'center' }}>
                  Enviar por WhatsApp
                </button>
              </form>
          </div>
        </div>
      </div>
    </div>
  );
};
