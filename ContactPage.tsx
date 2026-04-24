import React, { useState, useEffect } from 'react';
import { getStoreConfig } from '../lib/queries';
import './ContactPage.css';

export const ContactPage: React.FC = () => {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [whatsapp, setWhatsapp] = useState('5215647438328');
  const [contactEmail, setContactEmail] = useState('hola@divinastore.com.mx');
  
  useEffect(() => {
    getStoreConfig().then(cfg => {
      if (cfg.contact_whatsapp) setWhatsapp(cfg.contact_whatsapp);
      if (cfg.contact_email) setContactEmail(cfg.contact_email);
    });
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
      <div className="page-width section">
        <h1 className="contact-page__title">Ponte en <span className="lime-text">Contacto</span></h1>
        <p className="contact-page__desc muted-text">
          ¿Tienes alguna duda sobre nuestros productos o necesitas ayuda con tu pedido? Escríbenos.
        </p>

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
