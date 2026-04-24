import React, { useState, useEffect } from 'react';
import { getStoreConfig } from '../lib/queries';
import { supabase, getImageUrl } from '../lib/supabase';
import './QuienesSomosPage.css';

export const QuienesSomosPage: React.FC = () => {
  const [config, setConfig] = useState<Record<string, string>>({});

  useEffect(() => {
    getStoreConfig().then(setConfig);

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'ADMIN_PREVIEW_UPDATE') {
        const payload = event.data.payload;
        setConfig(prev => ({ ...prev, ...payload }));
      }
    };
    window.addEventListener('message', handleMessage);

    const channel = supabase.channel('about_config_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_config' }, () => {
        getStoreConfig().then(setConfig);
      })
      .subscribe();

    return () => {
      window.removeEventListener('message', handleMessage);
      supabase.removeChannel(channel);
    };
  }, []);

  const heroTitle = config.about_hero_title ?? 'Angélica:\n<span class="lime-text">Tenaz, Mágica y Camaleónica</span>';
  const heroDesc = config.about_hero_desc ?? 'DIVINA® nace del amor más grande que existe: el de una madre. Es un homenaje a Angélica Trejo —fuerte, elegante, camaleónica— cuya forma de vivir la belleza fue siempre un acto de dignidad, ternura y luz. Cada producto honra su esencia: pasión, entrega y un corazón que brilló hasta su último aliento. DIVINA® existe para recordarnos que la belleza verdadera nace del alma… y perdura para siempre.';
  const pathTitle = config.about_path_title ?? 'Nuestro <span class="lime-text">propósito</span> y camino';
  const pathDesc = config.about_path_desc ?? 'Nuestro propósito es mantener vivo un legado: honrar la fuerza, elegancia y entrega de Angélica convirtiendo su esencia en una marca que acompañe, inspire y eleve.';
  const pathList1 = config.about_path_list1 ?? 'A CREAR nuestra propia línea de productos con la misma entrega y pasión.';
  const pathList2 = config.about_path_list2 ?? 'A EXPANDIR una comunidad que celebre la belleza real, humana y cotidiana.';
  const pathList3 = config.about_path_list3 ?? 'A DEMOSTRAR que cuidarse no es vanidad: es bienestar, identidad y amor propio.';
  const pathQuote = config.about_path_quote ?? '"Democratizar la belleza, dignificar el autocuidado y llevar luz donde antes hubo dolor."';
  const essenceTitle = config.about_essence_title ?? 'Nuestra <span class="lime-text">Esencia</span>';
  const essenceDesc = config.about_essence_desc ?? 'En DIVINA® creemos que la belleza no es un lujo: es un privilegio emocional, un reflejo del alma y un impulso de confianza. Somos un proyecto familiar impulsado por amor...';
  const essenceQuote = config.about_essence_quote ?? 'DIVINA® MARCA QUE GUARDA EN EL CORAZÓN DE 3 PERSONAS UN LENGUAJE DE AMOR "ETERNO"';

  const renderHTML = (html: string) => ({ __html: html.replace(/\n/g, '<br/>') });

  return (
    <div className="about-page" style={{ paddingTop: 'var(--nav-h)' }}>
      {/* Hero */}
      <section className="about-hero">
        {config.about_hero_img && (
           <div className="about-hero__bg">
              <img 
                src={getImageUrl(config.about_hero_img, { width: 1920, quality: 90 })} 
                alt="Angélica Hero" 
                className="about-hero__img"
              />
              <div className="about-hero__overlay"></div>
           </div>
        )}
        {(heroTitle || heroDesc) && (
          <div className="page-width about-hero__content">
            {heroTitle && <h1 className="about-hero__title" dangerouslySetInnerHTML={renderHTML(heroTitle)} />}
            {heroDesc && <p className="about-hero__text">{heroDesc}</p>}
          </div>
        )}
      </section>

      {/* Propósito */}
      <section className="about-section page-width section">
        <div className="about-section__grid">
          <div className="about-section__text">
            <h2 className="about-section__title" dangerouslySetInnerHTML={renderHTML(pathTitle)} />
            <p className="about-section__desc">{pathDesc}</p>
            <ul className="about-list">
              <li>{pathList1}</li>
              <li>{pathList2}</li>
              <li>{pathList3}</li>
            </ul>
            <p className="about-quote">{pathQuote}</p>
          </div>
          <div className="about-section__media">
            {config.about_path_img ? (
              <img src={getImageUrl(config.about_path_img, { width: 800, quality: 80 })} alt="Propósito" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-lg)' }} />
            ) : (
              <div className="about-placeholder">🌿</div>
            )}
          </div>
        </div>
      </section>

      {/* Esencia */}
      <section className="about-section about-section--alt">
        <div className="page-width section">
          <div className="about-section__grid about-section__grid--reverse">
            <div className="about-section__text">
              <h2 className="about-section__title" dangerouslySetInnerHTML={renderHTML(essenceTitle)} />
              <p className="about-section__desc">{essenceDesc}</p>
              <div className="about-quote about-quote--large">{essenceQuote}</div>
            </div>
            <div className="about-section__media">
              {config.about_essence_img ? (
                <img src={getImageUrl(config.about_essence_img, { width: 800, quality: 80 })} alt="Esencia" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-lg)' }} />
              ) : (
                <div className="about-placeholder about-placeholder--bw">🌸</div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
