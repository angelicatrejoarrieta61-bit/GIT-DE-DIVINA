import React from 'react';
import { Link } from 'react-router-dom';
import './FrostCardsSection.css';

export interface FrostCardsData {
  title: string;
  subtitle: string;
  promoText: string;
  cards: {
    id: number;
    title: string;
    txt: string;
    badge: string;
    emoji: string;
  }[];
}

const DEFAULT_DATA: FrostCardsData = {
  title: 'Nuestro <span class="lime-text">Catálogo</span> de Productos',
  subtitle: 'Explora artículos seleccionados que harán visibles mejoras en tu rostro y belleza.',
  promoText: '🏷️ AHORRA 25% · DESCUENTO AUTOMÁTICO EN COMPRAS MAYORES DE $2,500 MXN',
  cards: [
    { id: 1, title: 'Línea ISDIN Fusion Magic', txt: 'Color y sin color', badge: 'NUEVO', emoji: '✨' },
    { id: 2, title: 'Ácido Hialurónico', txt: 'Hidratación profunda', badge: 'TOP VENTAS', emoji: '💧' },
    { id: 3, title: 'Fotoprotectores Solares', txt: 'Protección total FPS 50+', badge: 'ESENCIAL', emoji: '☀️' },
    { id: 4, title: 'Grooming Premium', txt: 'Cuidado masculino profesional', badge: 'EXCLUSIVO', emoji: '✂️' },
  ]
};

export const FrostCardsSection: React.FC<{ data?: string }> = ({ data }) => {
  let content: FrostCardsData = DEFAULT_DATA;
  if (data) {
    try {
      const parsed = JSON.parse(data);
      if (parsed && Array.isArray(parsed.cards)) {
        content = { ...DEFAULT_DATA, ...parsed };
      }
    } catch (e) {
      console.error('Failed to parse FrostCards data');
    }
  }

  // Fallback if somehow cards is still not an array
  if (!content.cards || !Array.isArray(content.cards)) {
    content.cards = DEFAULT_DATA.cards;
  }

  return (
    <section className="frost-section section" id="catalogo-destacado">
      <div className="page-width">
        {/* Header */}
        <div className="frost-section__header">
          <div className="divider" style={{ marginBottom: 14 }} />
          <h2 className="frost-section__title" dangerouslySetInnerHTML={{ __html: String(content.title || '') }} />
          <p className="frost-section__subtitle muted-text">
            {String(content.subtitle || '')}
          </p>
        </div>

        {/* Promo Banner */}
        <div className="frost-section__promo-bar">
          {String(content.promoText || '')}
        </div>

        {/* Bento Grid */}
        <div className="frost-grid">
          {/* Large card */}
          {content.cards[0] && (
            <Link to="/catalogo" className="frost-card frost-card--large">
              <div className="frost-card__bg-emoji">{String(content.cards[0].emoji || '')}</div>
              <div className="frost-card__glass" />
              <div className="frost-card__content">
                <span className="badge badge-lime">{String(content.cards[0].badge || '')}</span>
                <h3 className="frost-card__title">{String(content.cards[0].title || '')}</h3>
                <p className="frost-card__txt">{String(content.cards[0].txt || '')}</p>
                <span className="frost-card__arrow">→</span>
              </div>
            </Link>
          )}

          {/* Small cards */}
          <div className="frost-grid__small">
            {content.cards.slice(1).map((item, idx) => (
              <Link key={item.id || idx} to="/catalogo" className="frost-card frost-card--small">
                <div className="frost-card__bg-emoji">{String(item.emoji || '')}</div>
                <div className="frost-card__glass" />
                <div className="frost-card__content">
                  <span className="badge badge-lime">{String(item.badge || '')}</span>
                  <h3 className="frost-card__title">{String(item.title || '')}</h3>
                  <p className="frost-card__txt">{String(item.txt || '')}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="frost-section__cta">
          <Link to="/catalogo" className="btn btn-lime" style={{ padding: '18px 60px', fontSize: 13 }}>
            Ver Catálogo Completo →
          </Link>
        </div>
      </div>
    </section>
  );
};
