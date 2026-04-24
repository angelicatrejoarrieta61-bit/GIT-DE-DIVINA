import React from 'react';
import './QuienesSomosPage.css';

export const QuienesSomosPage: React.FC = () => {
  return (
    <div className="about-page" style={{ paddingTop: 'var(--nav-h)' }}>
      {/* Hero */}
      <section className="about-hero">
        <div className="page-width about-hero__content">
          <h1 className="about-hero__title">
            Angélica:<br />
            <span className="lime-text">Tenaz, Mágica y Camaleónica</span>
          </h1>
          <p className="about-hero__text">
            DIVINA® nace del amor más grande que existe: el de una madre. Es un homenaje a Angélica Trejo —fuerte, elegante, camaleónica— cuya forma de vivir la belleza fue siempre un acto de dignidad, ternura y luz. Cada producto honra su esencia: pasión, entrega y un corazón que brilló hasta su último aliento. DIVINA® existe para recordarnos que la belleza verdadera nace del alma… y perdura para siempre.
          </p>
        </div>
      </section>

      {/* Propósito */}
      <section className="about-section page-width section">
        <div className="about-section__grid">
          <div className="about-section__text">
            <h2 className="about-section__title">Nuestro <span className="lime-text">propósito</span> y camino</h2>
            <p className="about-section__desc">
              Nuestro propósito es mantener vivo un legado: honrar la fuerza, elegancia y entrega de Angélica convirtiendo su esencia en una marca que acompañe, inspire y eleve.
            </p>
            <ul className="about-list">
              <li>A CREAR nuestra propia línea de productos con la misma entrega y pasión.</li>
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

      {/* Esencia */}
      <section className="about-section about-section--alt">
        <div className="page-width section">
          <div className="about-section__grid about-section__grid--reverse">
            <div className="about-section__text">
              <h2 className="about-section__title">Nuestra <span className="lime-text">Esencia</span></h2>
              <p className="about-section__desc">
                En DIVINA® creemos que la belleza no es un lujo: es un privilegio emocional, un reflejo del alma y un impulso de confianza. Somos un proyecto familiar impulsado por amor...
              </p>
              <div className="about-quote about-quote--large">
                DIVINA® MARCA QUE GUARDA EN EL CORAZÓN DE 3 PERSONAS UN LENGUAJE DE AMOR "ETERNO"
              </div>
            </div>
            <div className="about-section__media">
              <div className="about-placeholder about-placeholder--bw">🌸</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
