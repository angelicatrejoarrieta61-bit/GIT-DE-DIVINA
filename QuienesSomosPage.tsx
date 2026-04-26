import React from 'react';
import { Helmet } from 'react-helmet-async';
import './QuienesSomosPage.css';

export const QuienesSomosPage: React.FC = () => {

  const aboutSchema = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: 'Quienes Somos — Divina Store MX',
    description: 'DIVINA nace del amor de una madre. Honramos la esencia de Angelica Trejo con skincare premium que celebra la belleza real, humana y cotidiana.',
    url: 'https://git-de-divina.vercel.app/quienes-somos',
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: 'https://git-de-divina.vercel.app' },
        { '@type': 'ListItem', position: 2, name: 'Quienes Somos', item: 'https://git-de-divina.vercel.app/quienes-somos' }
      ]
    },
    publisher: {
      '@type': 'Organization',
      name: 'Divina Store MX',
      url: 'https://git-de-divina.vercel.app',
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
        <title>Quienes Somos | La Historia de Divina Store MX</title>
        <meta name="description" content="DIVINA nace del amor de una madre. Conoce la historia detras de Divina Store MX, una marca de skincare premium en Mexico que honra la belleza real y el autocuidado." />
        <link rel="canonical" href="https://git-de-divina.vercel.app/quienes-somos" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://git-de-divina.vercel.app/quienes-somos" />
        <meta property="og:title" content="Quienes Somos | La Historia de Divina Store MX" />
        <meta property="og:description" content="DIVINA nace del amor de una madre. Skincare premium en Mexico que honra la belleza real y el autocuidado." />
        <meta property="og:image" content="https://git-de-divina.vercel.app/og-image.jpg" />
        <meta property="og:locale" content="es_MX" />
        <meta property="og:site_name" content="Divina Store MX" />
        <script type="application/ld+json">{JSON.stringify(aboutSchema)}</script>
      </Helmet>

      <div className="about-page" style={{ paddingTop: 'var(--nav-h)' }}>
        <section className="about-hero">
          <div className="page-width about-hero__content">
            <h1 className="about-hero__title">
              Angelica:<br />
              <span className="lime-text">Tenaz, Magica y Camaleoica</span>
            </h1>
            <p className="about-hero__text">
              DIVINA nace del amor mas grande que existe: el de una madre. Es un homenaje a Angelica Trejo —fuerte, elegante, camelonica— cuya forma de vivir la belleza fue siempre un acto de dignidad, ternura y luz. Cada producto honra su esencia: pasion, entrega y un corazon que brillo hasta su ultimo aliento. DIVINA existe para recordarnos que la belleza verdadera nace del alma… y perdura para siempre.
            </p>
          </div>
        </section>

        <section className="about-section page-width section">
          <div className="about-section__grid">
            <div className="about-section__text">
              <h2 className="about-section__title">Nuestro <span className="lime-text">proposito</span> y camino</h2>
              <p className="about-section__desc">
                Nuestro proposito es mantener vivo un legado: honrar la fuerza, elegancia y entrega de Angelica convirtiendo su esencia en una marca que acompane, inspire y eleve.
              </p>
              <ul className="about-list">
                <li>A CREAR nuestra propia linea de productos con la misma entrega y pasion.</li>
                <li>A EXPANDIR una comunidad que celebre la belleza real, humana y cotidiana.</li>
                <li>A DEMOSTRAR que cuidarse no es vanidad: es bienestar, identidad y amor propio.</li>
              </ul>
              <p className="about-quote">
                "Democratizar la belleza, dignificar el autocuidado y llevar luz donde antes hubo dolor."
              </p>
            </div>
            <div className="about-section__media">
              <div className="about-placeholder">🌿</div>
            </div>
          </div>
        </section>

        <section className="about-section about-section--alt">
          <div className="page-width section">
            <div className="about-section__grid about-section__grid--reverse">
              <div className="about-section__text">
                <h2 className="about-section__title">Nuestra <span className="lime-text">Esencia</span></h2>
                <p className="about-section__desc">
                  En DIVINA creemos que la belleza no es un lujo: es un privilegio emocional, un reflejo del alma y un impulso de confianza. Somos un proyecto familiar impulsado por amor...
                </p>
                <div className="about-quote about-quote--large">
                  DIVINA MARCA QUE GUARDA EN EL CORAZON DE 3 PERSONAS UN LENGUAJE DE AMOR ETERNO
                </div>
              </div>
              <div className="about-section__media">
                <div className="about-placeholder about-placeholder--bw">🌸</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
};