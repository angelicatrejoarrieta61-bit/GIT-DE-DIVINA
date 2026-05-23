/**
 * ProductPage.tsx — Divina Store MX
 * Versión con Nanotecnología de Información:
 *  - Schema.org Product + FAQ + BreadcrumbList + ItemList (ingredientes)
 *  - Meta keywords semánticamente expandidas
 *  - Sección visual de ingredientes activos
 *  - Sección FAQ interactiva
 *  - Breadcrumb navegable
 *  - Canonical correcto (divinastore.com.mx)
 *  - Skin types + concerns visibles
 */

import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { getProductBySlug } from '../lib/queries';
import { getImageUrl, getImageSrcSet } from '../lib/supabase';
import { useCartStore } from '../store/cartStore';
import { buildProductSemantic } from '../lib/useSemantic';
import type { Product } from '../types';
import './ProductPage.css';

// ── Tipos extendidos para los campos nuevos ──────────────────────────────────
interface IngredientInfo {
  name: string;
  pct?: string;
  benefit: string;
  aka?: string;
}

interface FAQItem {
  q: string;
  a: string;
}

interface ExtendedProduct extends Product {
  ingredients?: string[];
  ingredients_info?: IngredientInfo[];
  skin_types?: string[];
  concerns?: string[];
  routine_step?: string;
  how_to_use?: string;
  faq?: FAQItem[];
  benefits?: string[];
  concentration?: string;
  texture?: string;
  fragrance_free?: boolean;
  dermatologist_tested?: boolean;
  related_slugs?: string[];
  meta_keywords?: string[];
}

// ── Labels legibles ──────────────────────────────────────────────────────────
const SKIN_TYPE_LABELS: Record<string, string> = {
  seca: 'Piel seca', grasa: 'Piel grasa', mixta: 'Piel mixta',
  sensible: 'Piel sensible', madura: 'Piel madura', normal: 'Piel normal',
};

const CONCERN_LABELS: Record<string, string> = {
  arrugas: 'Antiarrugas', manchas: 'Antimanchas', acné: 'Antiacné',
  firmeza: 'Firmeza', luminosidad: 'Luminosidad', hidratación: 'Hidratación', poros: 'Poros',
};

const ROUTINE_LABELS: Record<string, string> = {
  'limpieza': 'Paso 1 — Limpieza', 'tónico': 'Paso 2 — Tónico',
  'sérum': 'Paso 3 — Sérum', 'contorno': 'Paso 4 — Contorno de ojos',
  'hidratante': 'Paso 5 — Hidratante', 'protector-solar': 'Paso 6 — Protector solar',
  'tratamiento': 'Tratamiento especial',
};

// ── Componente FAQ Item ──────────────────────────────────────────────────────
function FAQAccordionItem({ item }: { item: FAQItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pp-faq__item" itemScope itemType="https://schema.org/Question">
      <button
        className={`pp-faq__question ${open ? 'pp-faq__question--open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span itemProp="name">{item.q}</span>
       <span className="pp-faq__icon">
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"
    style={{ transform: open ? 'rotate(45deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
    <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
</span>
      </button>
      {open && (
        <div className="pp-faq__answer" itemScope itemType="https://schema.org/Answer">
          <p itemProp="text">{item.a}</p>
        </div>
      )}
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export const ProductPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [product, setProduct] = useState<ExtendedProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [activeImage, setActiveImage] = useState<string>('');

  const addItem = useCartStore(s => s.addItem);

  useEffect(() => {
    if (!slug) return;
    getProductBySlug(slug).then(p => {
      setProduct(p as ExtendedProduct);
      if (p?.image_url) setActiveImage(p.image_url);
      setLoading(false);
    });
  }, [slug]);

  const handleAdd = () => {
    if (!product) return;
    for (let i = 0; i < qty; i++) addItem(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  if (loading) return (
    <div style={{ paddingTop: 'calc(var(--nav-h) + 60px)' }} className="page-width">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48 }}>
        <div className="skeleton" style={{ height: 520, borderRadius: 24 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[80, 200, 60, 100, 48].map((h, i) => (
            <div key={i} className="skeleton" style={{ height: h, borderRadius: 12 }} />
          ))}
        </div>
      </div>
    </div>
  );

  if (!product) return (
    <div style={{ paddingTop: 'calc(var(--nav-h) + 60px)', textAlign: 'center' }} className="page-width section">
      <h2>Producto no encontrado</h2>
    </div>
  );

  const semantic = buildProductSemantic(product as never, slug!);
  const gallery = product.images?.length ? product.images : (product.image_url ? [product.image_url] : []);

  return (
    <>
      <Helmet>
        <title>{semantic.title}</title>
        <meta name="description" content={semantic.description} />
        <meta name="keywords" content={semantic.keywords} />
        <link rel="canonical" href={semantic.canonical} />
        <meta property="og:type" content="product" />
        <meta property="og:url" content={semantic.canonical} />
        <meta property="og:title" content={semantic.title} />
        <meta property="og:description" content={semantic.description} />
        <meta property="og:locale" content="es_MX" />
        <meta property="og:site_name" content="Divina Store MX" />
        {semantic.ogImage && <meta property="og:image" content={getImageUrl(semantic.ogImage, { width: 1200, quality: 80 })} />}
        <meta property="product:price:amount" content={String(product.price)} />
        <meta property="product:price:currency" content="MXN" />
        {semantic.schemas.map((schema, i) => (
          <script key={i} type="application/ld+json">{JSON.stringify(schema)}</script>
        ))}
      </Helmet>

      <div className="product-page" style={{ paddingTop: 'var(--nav-h)' }}>
        <div className="page-width section">

          {/* ── Breadcrumb ── */}
          <nav className="pp-breadcrumb" aria-label="Navegación de ruta">
            <ol itemScope itemType="https://schema.org/BreadcrumbList">
              <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
                <Link to="/" itemProp="item"><span itemProp="name">Inicio</span></Link>
                <meta itemProp="position" content="1" />
              </li>
              <span aria-hidden="true" className="pp-breadcrumb__sep">/</span>
              <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
                <Link to="/catalogo" itemProp="item"><span itemProp="name">Catálogo</span></Link>
                <meta itemProp="position" content="2" />
              </li>
              {product.brand && (
                <>
                  <span aria-hidden="true" className="pp-breadcrumb__sep">/</span>
                  <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
                    <Link to={`/catalogo?brand=${encodeURIComponent(product.brand)}`} itemProp="item">
                      <span itemProp="name">{product.brand}</span>
                    </Link>
                    <meta itemProp="position" content="3" />
                  </li>
                </>
              )}
              <span aria-hidden="true" className="pp-breadcrumb__sep">/</span>
              <li className="pp-breadcrumb__current" aria-current="page">{product.name}</li>
            </ol>
          </nav>

          <div className="product-page__grid">

            {/* ── Galería ── */}
            <div className="product-page__gallery">
              <div className="product-page__media">
                {activeImage ? (
                  <img
                    src={getImageUrl(activeImage, { width: 1200, quality: 80 })}
                    srcSet={getImageSrcSet(activeImage, [600, 1200], { quality: 80 })}
                    sizes="(max-width: 768px) 100vw, 50vw"
                    alt={`${product.name}${product.brand ? ` ${product.brand}` : ''} — Divina Store MX`}
                    crossOrigin="anonymous"
                  />
                ) : (
                  <div className="product-page__placeholder">🌿</div>
                )}
              </div>
              {gallery.length > 1 && (
                <div className="product-page__thumbnails">
                  {gallery.map((img, idx) => (
                    <button
                      key={idx}
                      className={`product-page__thumb ${activeImage === img ? 'active' : ''}`}
                      onClick={() => setActiveImage(img)}
                    >
                      <img
                        src={getImageUrl(img, { width: 120, quality: 65 })}
                        alt={`${product.name} vista ${idx + 1}`}
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Info principal ── */}
            <div className="product-page__info">
              {product.brand && <p className="product-page__brand">{product.brand}</p>}
              <h1 className="product-page__name" itemProp="name">{product.name}</h1>

              {/* Paso de rutina */}
              {product.routine_step && (
                <p className="pp-routine-badge">
                  {ROUTINE_LABELS[product.routine_step] || product.routine_step}
                </p>
              )}

              {/* Precio */}
              <div className="product-page__price-row" itemProp="offers" itemScope itemType="https://schema.org/Offer">
                <span className="product-page__price" itemProp="price" content={String(product.price)}>
                  ${product.price.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                </span>
                <meta itemProp="priceCurrency" content="MXN" />
                <meta itemProp="availability" content={product.in_stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'} />
                {product.compare_price && product.compare_price > product.price && (
                  <span className="product-page__compare">
                    ${product.compare_price.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </span>
                )}
              </div>

              {/* Badges de confianza */}
              <div className="pp-trust-badges">
                {product.fragrance_free && <span className="pp-badge pp-badge--green">Sin fragancia</span>}
                {product.dermatologist_tested && <span className="pp-badge pp-badge--blue">Testado dermatológicamente</span>}
                {product.texture && <span className="pp-badge pp-badge--neutral">Textura: {product.texture}</span>}
                {product.concentration && <span className="pp-badge pp-badge--neutral">{product.concentration}</span>}
              </div>

              {/* Tipos de piel */}
              {product.skin_types && product.skin_types.length > 0 && (
                <div className="pp-skin-types">
                  <p className="pp-section-label">Apto para</p>
                  <div className="pp-chip-row">
                    {product.skin_types.map(s => (
                      <span key={s} className="pp-chip pp-chip--skin">
                        {SKIN_TYPE_LABELS[s] || s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Concerns */}
              {product.concerns && product.concerns.length > 0 && (
                <div className="pp-concerns">
                  <p className="pp-section-label">Trata</p>
                  <div className="pp-chip-row">
                    {product.concerns.map(c => (
                      <span key={c} className="pp-chip pp-chip--concern">
                        {CONCERN_LABELS[c] || c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Descripción */}
              {product.description && (
                <div
                  className="product-page__desc html-content"
                  dangerouslySetInnerHTML={{ __html: product.description }}
                />
              )}

              {/* Cantidad + botón */}
              <div className="product-page__qty-row">
                <label className="product-page__label">Cantidad</label>
                <div className="product-page__qty">
                  <button onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
                  <span>{qty}</span>
                  <button onClick={() => setQty(q => q + 1)}>+</button>
                </div>
              </div>

              <button
                className={`btn product-page__add-btn ${added ? 'added' : ''}`}
                onClick={handleAdd}
                disabled={!product.in_stock}
              >
                {!product.in_stock ? 'Sin inventario' : added ? '✓ Agregado al carrito' : 'Agregar al carrito'}
              </button>

              {/* Tags */}
              {product.tags && product.tags.length > 0 && (
                <div className="product-page__tags">
                  {product.tags.map(t => <span key={t} className="badge badge-dark">{t}</span>)}
                </div>
              )}
            </div>
          </div>

          {/* ── Sección ingredientes activos ── */}
          {product.ingredients_info && product.ingredients_info.length > 0 && (
            <section className="pp-ingredients" aria-label="Ingredientes activos">
              <h2 className="pp-section-title">Ingredientes activos</h2>
              <div className="pp-ingredients__grid">
                {product.ingredients_info.map((ing, i) => (
                  <div key={i} className="pp-ingredient-card" itemScope itemType="https://schema.org/Thing">
                    <div className="pp-ingredient-card__header">
                      <span className="pp-ingredient-card__name" itemProp="name">{ing.name}</span>
                      {ing.pct && <span className="pp-ingredient-card__pct">{ing.pct}</span>}
                    </div>
                    {ing.aka && <p className="pp-ingredient-card__aka">También: {ing.aka}</p>}
                    <p className="pp-ingredient-card__benefit" itemProp="description">{ing.benefit}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Cómo usar ── */}
          {product.how_to_use && (
            <section className="pp-how-to-use" aria-label="Modo de uso">
              <h2 className="pp-section-title">Cómo usar</h2>
              <p className="pp-how-to-use__text">{product.how_to_use}</p>
            </section>
          )}

          {/* ── FAQ ── */}
          {product.faq && product.faq.length > 0 && (
            <section
              className="pp-faq"
              aria-label="Preguntas frecuentes"
              itemScope
              itemType="https://schema.org/FAQPage"
            >
              <h2 className="pp-section-title">Preguntas frecuentes</h2>
              <div className="pp-faq__list">
                {product.faq.map((item, i) => (
                  <FAQAccordionItem key={i} item={item} />
                ))}
              </div>
            </section>
          )}

        </div>
      </div>
    </>
  );
};
