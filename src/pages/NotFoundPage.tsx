import React from 'react';
import { Link } from 'react-router-dom';
import { Seo } from '../components/Seo';

export const NotFoundPage: React.FC = () => (
  <section className="page-width section" style={{ minHeight: '65vh', paddingTop: 'calc(var(--nav-h) + 80px)', textAlign: 'center' }}>
    <Seo
      title="Página no encontrada — Divina Store MX"
      description="La página solicitada no existe. Explora el catálogo de skincare y grooming de Divina Store MX."
      path={window.location.pathname}
      noindex
    />
    <p className="lime-text" style={{ fontWeight: 700, letterSpacing: '0.15em' }}>ERROR 404</p>
    <h1 style={{ margin: '18px 0' }}>Esta página no existe</h1>
    <p className="muted-text">La dirección pudo cambiar o estar escrita incorrectamente.</p>
    <Link to="/catalogo" className="btn btn-lime" style={{ marginTop: 28 }}>Ver el catálogo</Link>
  </section>
);
