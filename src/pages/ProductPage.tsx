/**
 * ProductPage.tsx — Divina Store MX
 * Ficha de producto editorial y compacta:
 *  - Galería con miniaturas verticales, corte diagonal y zoom que sigue al cursor
 *  - Compra en un bloque: precio, cantidad, "Agregar" y "Comprar ahora"
 *  - Beneficios legibles (la descripción "TÍTULO: texto" se convierte en lista)
 *  - Detalles en acordeón: descripción, modo de uso, ingredientes, preguntas
 *  - Barra fija de compra en celular cuando el botón principal sale de vista
 *  - Productos relacionados (misma marca o colección)
 *  - SEO: Schema.org Product + FAQ + BreadcrumbList + ItemList, canonical y Open Graph
 * Las etiquetas internas (bajo-pedido, TOP_HOME, BADGE:*) no se muestran como texto.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Check, Minus, Plus, ShieldCheck, Truck, BadgeCheck, ChevronDown, ShoppingBag } from 'lucide-react';
import { getProductBySlug, getProducts } from '../lib/queries';
import { getImageUrl, getImageSrcSet } from '../lib/supabase';
import { useCartStore } from '../store/cartStore';
import { buildProductSemantic } from '../lib/useSemantic';
import { Seo } from '../components/Seo';
import { ProductCard } from '../components/ProductCard';
import type { Product } from '../types';
import './ProductPage.css';
import { analyticsItem, trackEvent, trackOnce } from '../lib/analytics';
import { FREE_SHIPPING_FROM, SHIPPING_COST } from '../lib/shipping';
import { trackProductEvent } from '../lib/productEvents';

// ── Tipos extendidos ────────────────────────────────────────────────────────
interface IngredientInfo { name: string; pct?: string; benefit: string; aka?: string }
interface FAQItem { q: string; a: string }

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
  collection_id?: string | null;
  category?: string | null;
}

// ── Etiquetas legibles ──────────────────────────────────────────────────────
const SKIN_TYPE_LABELS: Record<string, string> = {
  seca: 'Piel seca', grasa: 'Piel grasa', mixta: 'Piel mixta',
  sensible: 'Piel sensible', madura: 'Piel madura', normal: 'Piel normal',
};
const CONCERN_LABELS: Record<string, string> = {
  arrugas: 'Antiarrugas', manchas: 'Antimanchas', acné: 'Antiacné',
  firmeza: 'Firmeza', luminosidad: 'Luminosidad', hidratación: 'Hidratación', poros: 'Poros',
};
const ROUTINE_LABELS: Record<string, string> = {
  'limpieza': 'Paso 1 · Limpieza', 'tónico': 'Paso 2 · Tónico',
  'sérum': 'Paso 3 · Sérum', 'contorno': 'Paso 4 · Contorno de ojos',
  'hidratante': 'Paso 5 · Hidratante', 'protector-solar': 'Paso 6 · Protector solar',
  'tratamiento': 'Tratamiento especial',
};

const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hasHtml = (s: string) => /<\/?[a-z][\s\S]*>/i.test(s);

/** "REDUCCIÓN DE GRASA: Ayuda a…" → { title: "Reducción de grasa", text: "Ayuda a…" } */
interface Benefit { title: string | null; text: string }
function parseBenefits(desc: string | undefined, explicit?: string[]): Benefit[] {
  if (explicit?.length) return explicit.map((t) => ({ title: null, text: t }));
  if (!desc || hasHtml(desc)) return [];
  return desc
    .split(/\n+|(?:^|\s)•\s+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^([^:]{3,70}):\s*(.+)$/);
      if (!m) return { title: null, text: line };
      const head = m[1].trim();
      const letters = head.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, '');
      const upper = letters && letters === letters.toUpperCase();
      const title = upper ? head.charAt(0) + head.slice(1).toLocaleLowerCase('es-MX') : head;
      return { title, text: m[2].trim() };
    });
}

/** Texto visible de la insignia guardada como "BADGE:NUEVO". */
const badgeOf = (tags?: string[]) => {
  const t = tags?.find((x) => /^BADGE:/i.test(x));
  if (!t) return null;
  const v = t.slice(6).trim();
  return v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : null;
};

// ── Acordeón ────────────────────────────────────────────────────────────────
function Accordion({ title, children, defaultOpen = false, id }: { title: string; children: React.ReactNode; defaultOpen?: boolean; id: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`pdp-acc ${open ? 'is-open' : ''}`} id={id}>
      <button type="button" className="pdp-acc__head" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={`${id}-panel`}>
        <span>{title}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <div className="pdp-acc__panel" id={`${id}-panel`} role="region" hidden={!open}>
        <div className="pdp-acc__inner">{children}</div>
      </div>
    </div>
  );
}

// ── Componente principal ────────────────────────────────────────────────────
export const ProductPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<ExtendedProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [activeImage, setActiveImage] = useState<string>('');
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [showBar, setShowBar] = useState(false);
  const buyRef = useRef<HTMLDivElement>(null);

  const addItem = useCartStore((s) => s.addItem);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setQty(1);
    getProductBySlug(slug).then((p) => {
      setProduct(p as ExtendedProduct);
      setActiveImage(p?.image_url || p?.images?.[0] || '');
      setLoading(false);
    });
  }, [slug]);

  // Relacionados: misma marca, luego misma colección; máximo 4
  useEffect(() => {
    if (!product) return;
    let alive = true;
    getProducts(60).then((list) => {
      if (!alive) return;
      const others = list.filter((x) => x.id !== product.id && x.image_url);
      const sameBrand = others.filter((x) => product.brand && x.brand === product.brand);
      const sameCol = others.filter((x) => !sameBrand.includes(x) && (x as ExtendedProduct).category && (x as ExtendedProduct).category === product.category);
      const rest = others.filter((x) => !sameBrand.includes(x) && !sameCol.includes(x));
      setRelated([...sameBrand, ...sameCol, ...rest].slice(0, 4));
    });
    return () => { alive = false; };
  }, [product]);

  useEffect(() => {
    if (product) trackOnce(`view_item:${product.id}`, 'view_item', { currency: 'MXN', value: product.price, items: [analyticsItem(product)] });
    if (product) trackProductEvent(product.id, 'view');
  }, [product]);

  // Barra fija de compra (celular) cuando el bloque de compra sale de la pantalla
  useEffect(() => {
    const el = buyRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setShowBar(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [product]);

  const benefits = useMemo(() => parseBenefits(product?.description, product?.benefits), [product]);

  const handleAdd = (goCheckout = false) => {
    if (!product) return;
    for (let i = 0; i < qty; i++) addItem(product);
    trackEvent('add_to_cart', { currency: 'MXN', value: product.price * qty, items: [analyticsItem(product, qty)] });
    if (goCheckout) { navigate('/checkout'); return; }
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2000);
  };

  if (loading) return (
    <div className="pdp" style={{ paddingTop: 'var(--nav-h)' }}>
      <div className="pdp__wrap">
        <div className="pdp__grid" aria-busy="true">
          <div className="skeleton pdp-skel-media" />
          <div className="pdp-skel-info">
            {[14, 64, 30, 120, 48].map((h, i) => <div key={i} className="skeleton" style={{ height: h, borderRadius: 10 }} />)}
          </div>
        </div>
      </div>
    </div>
  );

  if (!product) return (
    <>
      <Seo title="Producto no encontrado | Divina Store" description="El producto solicitado no existe o ya no está disponible." path={`/producto/${slug || ''}`} noindex />
      <div style={{ paddingTop: 'calc(var(--nav-h) + 60px)', textAlign: 'center' }} className="page-width section">
        <h1>Producto no encontrado</h1>
        <Link to="/catalogo" className="btn btn-lime">Ver catálogo</Link>
      </div>
    </>
  );

  const semantic = buildProductSemantic(product as never, slug!);
  const gallery = product.images?.length ? product.images : (product.image_url ? [product.image_url] : []);
  const badge = badgeOf(product.tags);
  const pct = product.compare_price && product.compare_price > product.price
    ? Math.round((1 - product.price / product.compare_price) * 100) : 0;
  const discount = pct >= 1 ? pct : null; // nunca mostrar un 0 suelto
  const subtotal = product.price * qty;
  const visibleBenefits = benefits.slice(0, 3);
  const hasMoreDetails = benefits.length > 3 || (product.description && hasHtml(product.description))
    || !!product.how_to_use || !!product.ingredients_info?.length || !!product.ingredients?.length || !!product.faq?.length;
  const chips = [
    ...(product.skin_types ?? []).map((s) => SKIN_TYPE_LABELS[s] || s),
    ...(product.concerns ?? []).map((c) => CONCERN_LABELS[c] || c),
    ...(product.fragrance_free ? ['Sin fragancia'] : []),
    ...(product.dermatologist_tested ? ['Testado dermatológicamente'] : []),
    ...(product.texture ? [`Textura ${product.texture}`] : []),
    ...(product.concentration ? [product.concentration] : []),
  ];

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

      <div className="pdp" style={{ paddingTop: 'var(--nav-h)' }}>
        <div className="pdp__wrap">

          {/* ── Ruta ── */}
          <nav className="pdp-crumbs" aria-label="Navegación de ruta">
            <ol itemScope itemType="https://schema.org/BreadcrumbList">
              <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
                <Link to="/" itemProp="item"><span itemProp="name">Inicio</span></Link>
                <meta itemProp="position" content="1" />
              </li>
              <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
                <Link to="/catalogo" itemProp="item"><span itemProp="name">Catálogo</span></Link>
                <meta itemProp="position" content="2" />
              </li>
              {product.brand && (
                <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
                  <Link to={`/catalogo?brand=${encodeURIComponent(product.brand)}`} itemProp="item"><span itemProp="name">{product.brand}</span></Link>
                  <meta itemProp="position" content="3" />
                </li>
              )}
              <li className="pdp-crumbs__current" aria-current="page">{product.name}</li>
            </ol>
          </nav>

          <div className="pdp__grid">

            {/* ── Galería ── */}
            <div className="pdp-gallery">
              {gallery.length > 1 && (
                <div className="pdp-gallery__thumbs" role="listbox" aria-label="Fotos del producto">
                  {gallery.map((img, idx) => (
                    <button
                      key={img + idx}
                      type="button"
                      role="option"
                      aria-selected={activeImage === img}
                      className={`pdp-thumb ${activeImage === img ? 'is-active' : ''}`}
                      onClick={() => setActiveImage(img)}
                      aria-label={`Ver foto ${idx + 1}`}
                    >
                      <img src={getImageUrl(img, { width: 160, quality: 70 })} alt="" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}

              <div
                className={`pdp-gallery__main ${zoom ? 'is-zoom' : ''}`}
                onMouseMove={(e) => {
                  if (!window.matchMedia('(hover: hover)').matches) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
                }}
                onMouseLeave={() => setZoom(null)}
              >
                {badge && <span className="pdp-badge">{badge}</span>}
                {discount && <span className="pdp-badge pdp-badge--sale">−{discount}%</span>}
                {activeImage ? (
                  <img
                    key={activeImage}
                    src={getImageUrl(activeImage, { width: 1200, quality: 82 })}
                    srcSet={getImageSrcSet(activeImage, [600, 900, 1200], { quality: 82 })}
                    sizes="(max-width: 900px) 100vw, 46vw"
                    alt={`${product.name}${product.brand ? ` ${product.brand}` : ''} — Divina Store MX`}
                    style={zoom ? { transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
                  />
                ) : (
                  <div className="pdp-gallery__ph"><ShoppingBag size={40} aria-hidden="true" /></div>
                )}
              </div>
            </div>

            {/* ── Compra ── */}
            <div className="pdp-info">
              <div className="pdp-info__head">
                {product.brand && (
                  <Link to={`/catalogo?brand=${encodeURIComponent(product.brand)}`} className="pdp-brand">{product.brand}</Link>
                )}
                <h1 className="pdp-title">{product.name}</h1>
                {product.routine_step && <p className="pdp-step">{ROUTINE_LABELS[product.routine_step] || product.routine_step}</p>}
              </div>

              <div className="pdp-price">
                <span className="pdp-price__now">{money(product.price)} <small>MXN</small></span>
                {discount && <span className="pdp-price__was">{money(product.compare_price as number)}</span>}
                {discount && <span className="pdp-price__save">Ahorras {money((product.compare_price as number) - product.price)}</span>}
              </div>

              {visibleBenefits.length > 0 && (
                <ul className="pdp-benefits">
                  {visibleBenefits.map((b, i) => (
                    <li key={i}>
                      <Check size={14} aria-hidden="true" />
                      <span>{b.title ? <><strong>{b.title}.</strong> {b.text}</> : b.text}</span>
                    </li>
                  ))}
                </ul>
              )}
              {hasMoreDetails && (
                <a href="#pdp-detalles" className="pdp-more" onClick={(e) => { e.preventDefault(); document.getElementById('pdp-detalles')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                  Ver todos los detalles
                </a>
              )}

              {chips.length > 0 && (
                <ul className="pdp-chips" aria-label="Características">
                  {chips.map((c) => <li key={c}>{c}</li>)}
                </ul>
              )}

              {/* Bloque de compra */}
              <div className="pdp-buy" ref={buyRef}>
                <div className="pdp-buy__row">
                  <div className="pdp-qty" role="group" aria-label="Cantidad">
                    <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Quitar uno"><Minus size={14} /></button>
                    <span aria-live="polite">{qty}</span>
                    <button type="button" onClick={() => setQty((q) => Math.min(20, q + 1))} disabled={qty >= 20} aria-label="Agregar uno"><Plus size={14} /></button>
                  </div>
                  <button type="button" className={`pdp-btn pdp-btn--primary ${added ? 'is-added' : ''}`} onClick={() => handleAdd(false)} disabled={!product.in_stock}>
                    {!product.in_stock ? 'Sin existencia' : added ? <><Check size={16} aria-hidden="true" /> Agregado</> : <>Agregar · {money(subtotal)}</>}
                  </button>
                </div>
                <button type="button" className="pdp-btn pdp-btn--ghost" onClick={() => handleAdd(true)} disabled={!product.in_stock}>
                  Comprar ahora
                </button>
              </div>

              <ul className="pdp-trust">
                <li><Truck size={15} aria-hidden="true" /><span>{product.price >= FREE_SHIPPING_FROM ? 'Envío gratis' : <>Envío ${SHIPPING_COST} · <strong>gratis desde ${FREE_SHIPPING_FROM}</strong></>}</span></li>
                <li><BadgeCheck size={15} aria-hidden="true" /><span>Producto original</span></li>
                <li><ShieldCheck size={15} aria-hidden="true" /><span>Pago seguro con tarjeta</span></li>
              </ul>
            </div>
          </div>

          {/* ── Detalles ── */}
          {hasMoreDetails && (
            <section className="pdp-details" id="pdp-detalles" aria-label="Detalles del producto">
              <h2 className="pdp-h2">Detalles</h2>
              {(benefits.length > 0 || (product.description && hasHtml(product.description))) && (
                <Accordion id="pdp-desc" title="Descripción y beneficios" defaultOpen={visibleBenefits.length === 0}>
                  {product.description && hasHtml(product.description) ? (
                    <div className="html-content" dangerouslySetInnerHTML={{ __html: product.description }} />
                  ) : (
                    <ul className="pdp-benefits pdp-benefits--full">
                      {benefits.map((b, i) => (
                        <li key={i}><Check size={14} aria-hidden="true" /><span>{b.title ? <><strong>{b.title}.</strong> {b.text}</> : b.text}</span></li>
                      ))}
                    </ul>
                  )}
                </Accordion>
              )}
              {product.how_to_use && (
                <Accordion id="pdp-uso" title="Modo de uso"><p className="pdp-text">{product.how_to_use}</p></Accordion>
              )}
              {(product.ingredients_info?.length || product.ingredients?.length) ? (
                <Accordion id="pdp-ing" title="Ingredientes">
                  {product.ingredients_info?.length ? (
                    <div className="pdp-ings">
                      {product.ingredients_info.map((ing, i) => (
                        <div key={i} className="pdp-ing" itemScope itemType="https://schema.org/Thing">
                          <div className="pdp-ing__top"><strong itemProp="name">{ing.name}</strong>{ing.pct && <span>{ing.pct}</span>}</div>
                          {ing.aka && <p className="pdp-ing__aka">También: {ing.aka}</p>}
                          <p itemProp="description">{ing.benefit}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {product.ingredients?.length ? <p className="pdp-text pdp-text--small">{product.ingredients.join(', ')}</p> : null}
                </Accordion>
              ) : null}
              {product.faq?.length ? (
                <Accordion id="pdp-faq" title="Preguntas frecuentes">
                  <dl className="pdp-faq" itemScope itemType="https://schema.org/FAQPage">
                    {product.faq.map((f, i) => (
                      <div key={i} itemScope itemProp="mainEntity" itemType="https://schema.org/Question">
                        <dt itemProp="name">{f.q}</dt>
                        <dd itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer"><span itemProp="text">{f.a}</span></dd>
                      </div>
                    ))}
                  </dl>
                </Accordion>
              ) : null}
            </section>
          )}

          {/* ── Relacionados ── */}
          {related.length > 0 && (
            <section className="pdp-related" aria-label="También te puede gustar">
              <h2 className="pdp-h2">También te puede gustar</h2>
              <div className="pdp-related__grid">
                {related.map((p) => <ProductCard key={p.id} product={p} />)}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Barra fija de compra (celular) */}
      {product.in_stock && (
        <div className={`pdp-bar ${showBar ? 'is-on' : ''}`} aria-hidden={!showBar}>
          <div className="pdp-bar__info">
            <span className="pdp-bar__name">{product.name}</span>
            <strong>{money(product.price)}</strong>
          </div>
          <button type="button" className="pdp-btn pdp-btn--primary" onClick={() => handleAdd(false)} tabIndex={showBar ? 0 : -1}>
            {added ? <><Check size={15} aria-hidden="true" /> Agregado</> : 'Agregar'}
          </button>
        </div>
      )}
    </>
  );
};
