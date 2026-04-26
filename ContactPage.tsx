import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
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

  const contactSchema = {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name: 'Contacto — Divina Store MX',
    description: 'Contacta a Divina Store MX por WhatsApp o correo electronico. Dudas sobre productos, pedidos y envios a CDMX y toda la republica.',
    url: 'https://git-de-divina.vercel.app/contacto',
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: 'https://git-de-divina.vercel.app' },
        { '@type': 'ListItem', position: 2, name: 'Contacto', item: 'https://git-de-divina.vercel.app/contacto' }
      ]
    },
    mainEntity: {
      '@type': 'Organization',
      name: 'Divina Store MX',
      url: 'https://git-de-divina.vercel.app',
      email: contactEmail,
      telephone: `+${whatsapp}`,
      contactPoint: {
        '@type': 'ContactPoint',
        telephone: `+${whatsapp}`,
        contactType: 'customer service',
        availableLanguage: 'Spanish',
        areaServed: 'MX'
      },
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Benito Juarez',
        addressRegion: 'CDMX',
        postalCode: '03100',
        addressCountry: 'MX'
      }
    }
  };

  return (
    <>
      <Helmet>
        <title>Contacto | Divina Store MX — Skincare Premium en Mexico</title>
        <meta name="description" content="Contacta a Divina Store MX. Dudas sobre productos ISDIN, La Roche-Posay, Vichy o tu pedido. Respondemos por WhatsApp y correo electronico." />
        <link rel="canonical" href="https://git-de-divina.vercel.app/contacto" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://git-de-divina.vercel.app/contacto" />
        <meta property="og:title" content="Contacto | Divina Store MX" />
        <meta property="og:description" content="Dudas sobre productos o tu pedido. Contactanos por WhatsApp o correo electronico." />
        <meta property="og:image" content="https://git-de-divina.vercel.app/og-image.jpg" />
        <meta property="og:locale" content="es_MX" />
        <meta property="og:site_name" content="Divina Store MX" />
        <script type="application/ld+json">{JSON.stringify(contactSchema)}</script>
      </Helmet>

      <div className="contact-page" style={{ paddingTop: 'var(--nav-h)' }}>
        <div className="page-width section">
          <h1 className="contact-page__title">Ponte en <span className="lime-text">Contacto</span></h1>
          <p className="contact-page__desc muted-text">
            Tienes alguna duda sobre nuestros productos o necesitas ayuda con tu pedido? Escribenos.
          </p>

          <div className="contact-page__grid">
            <div className="contact-page__info">
              <div className="contact-card">
                <div className="contact-card__icon">📱</div>
                <h3 className="contact-card__title">WhatsApp</h3>
                <p className="contact-card__text">+{whatsapp}</p>

                href={`https://wa.me/${whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-lime"
                style={{ marginTop: 12 }}
                aria-label="Enviar mensaje por WhatsApp a Divina Store MX"
                >
                Enviar mensaje
              </a>
            </div>

            <div className="contact-card">
              <div className="contact-card__icon">✉️</div>
              <h3 className="contact-card__title">Email</h3>
              <p className="contact-card__text">
                <a href={`mailto:${contactEmail}`} style={{ color: 'inherit' }}>{contactEmail}</a>
              </p>
            </div>
          </div>

          <div className="contact-page__form-wrapper glass">
            <form onSubmit={handleSubmit} className="contact-form" aria-label="Formulario de contacto Divina Store MX">
              <div className="contact-form__field">
                <label htmlFor="name">Nombre</label>
                <input
                  id="name"
                  type="text"
                  className="input-dark"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                  autoComplete="name"
                />
              </div>
              <div className="contact-form__field">
                <label htmlFor="email">Correo electronico</label>
                <input
                  id="email"
                  type="email"
                  className="input-dark"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  required
                  autoComplete="email"
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
              <button
                type="submit"
                className="btn btn-lime"
                style={{ width: '100%', justifyContent: 'center' }}
                aria-label="Enviar formulario por WhatsApp"
              >
                Enviar por WhatsApp
              </button>
            </form>
          </div>
        </div>
      </div>
    </div >
    </>
  );
};