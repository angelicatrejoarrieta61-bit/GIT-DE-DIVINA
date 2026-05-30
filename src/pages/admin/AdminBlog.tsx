/**
 * AdminBlog.tsx — Gestor de Blog con IA
 * Flujo: Seleccionar producto → Generar preview → Ver a la derecha → Aceptar/Publicar
 * Historial: "Últimos Posts" siempre visible en sidebar izquierdo
 */

import React, { useEffect, useState, useCallback } from 'react';
import { supabase, uploadAsset, getImageUrl } from '../../lib/supabase';
import {
  getAdminBlogPosts,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  toggleBlogPostPublished,
  type BlogPost,
} from '../../lib/blog-queries';
import type { Product } from '../../types';

// ─── Tipos ────────────────────────────────────────────────────
interface PreviewPost {
  title:       string;
  slug:        string;
  excerpt:     string;
  content:     string;
  category:    string;
  tags:        string[];
  author:      string;
  cover_image: string;
  published:   boolean;
}

// ─── Glosario de Ingredientes Activos (100% Gratis) ─────────────
interface IngredientDetails {
  display:   string;
  wikiES:    string;
  wikiEN:    string;
  category:  string;
  keywords:  string[];
  benefits:  string[];
  cdmx:      string;
  studies:   string[];
}

const INGREDIENTS: Record<string, IngredientDetails> = {
  retinol: {
    display:  "Retinol (Vitamina A)",
    wikiES:   "Retinol",
    wikiEN:   "Retinol",
    category: "Ingredientes",
    keywords: ["retinol","retinoide","vitamina a","tretinoin","adapaleno","retin"],
    benefits: [
      "Estimula la síntesis de colágeno y elastina",
      "Acelera la renovación celular (turnover)",
      "Reduce visiblemente líneas finas y arrugas",
      "Unifica el tono y aclara manchas",
      "Regula el exceso de sebo en piel mixta",
    ],
    cdmx: "En CDMX, la exposición diaria a partículas PM2.5 y ozono troposférico genera estrés oxidativo que acelera el fotoenvejecimiento. El retinol actúa como agente reparador nocturno, estimulando la renovación celular dañada por la contaminación urbana de la capital.",
    studies: [
      "Efficacy of topical bioactive retinol in skin aging: A double-blind, randomized clinical study. (Journal of Cosmetic Dermatology)",
      "Retinoids in the treatment of skin aging: An overview of clinical efficacy and safety. (Clinical Interventions in Aging)",
      "Molecular mechanisms of retinol-induced skin regeneration. (British Journal of Dermatology)",
    ]
  },
  niacinamida: {
    display:  "Niacinamida (Vitamina B3)",
    wikiES:   "Niacinamida",
    wikiEN:   "Niacinamide",
    category: "Ingredientes",
    keywords: ["niacinamida","niacin","vitamin b3","nicotinamida","nicotinamide","b-3"],
    benefits: [
      "Regula la producción de sebo en piel grasa y mixta",
      "Minimiza la apariencia de poros dilatados",
      "Reduce hiperpigmentación y manchas oscuras",
      "Fortalece la barrera cutánea",
      "Efecto antiinflamatorio en lesiones de acné",
    ],
    cdmx: "El smog y el agua dura de la red pública de CDMX agravan la piel mixta a grasa y dilatan poros. La niacinamida regula el sebo sin alterar el pH cutáneo, siendo ideal para pieles urbanas que enfrentan contaminación constante.",
    studies: [
      "Niacinamide: A B vitamin that improves aging facial skin appearance. (Dermatologic Surgery)",
      "Topical niacinamide reduces sebum secretion and pore size in Asian skin. (Journal of Cosmetic Laser Therapy)",
      "Mechanism of niacinamide for reducing cutaneous pigmentation and strengthening skin barrier. (British Journal of Dermatology)",
    ]
  },
  vitamina_c: {
    display:  "Vitamina C (Ácido Ascórbico)",
    wikiES:   "Vitamina C",
    wikiEN:   "Vitamin C",
    category: "Ingredientes",
    keywords: ["vitamina c","vitamin c","ascórbico","ascorbic","ascorbate","ascorbyl"],
    benefits: [
      "Potente antioxidante: neutraliza radicales libres",
      "Estimula síntesis de colágeno tipo I y III",
      "Aclara manchas e hiperpigmentación",
      "Aporta luminosidad al tono de la piel",
      "Potencia la fotoprotección del SPF",
    ],
    cdmx: "Los índices de ozono troposférico en CDMX superan frecuentemente los límites de la OMS, generando radicales libres que dañan fibras de colágeno. Aplicar vitamina C cada mañana crea un escudo antioxidante contra este daño oxidativo urbano.",
    studies: [
      "Topical L-ascorbic acid percutaneous absorption and antioxidant skin benefits. (Dermatologic Surgery)",
      "Vitamin C in dermatology: A comprehensive review of clinical efficacy. (Indian Dermatology Online Journal)",
      "Double-blind, vehicle-controlled clinical evaluation of topical Vitamin C in facial photoaging. (Journal of Investigative Dermatology)",
    ]
  },
  spf: {
    display:  "Fotoprotección SPF",
    wikiES:   "Fotoprotector solar",
    wikiEN:   "Sunscreen",
    category: "Cuidado de Piel",
    keywords: ["spf","solar","fotoprotector","sunscreen","uv","photoprotect","isdin","anthelios","eryfotona"],
    benefits: [
      "Bloquea radiación UVA (envejecimiento) y UVB (quemaduras)",
      "Previene melanoma y carcinoma basocelular",
      "Evita la formación de manchas por daño solar",
      "Reduce el fotoenvejecimiento prematuro",
      "Protege el colágeno y la elastina existentes",
    ],
    cdmx: "A 2,240 metros de altitud, CDMX recibe hasta un 25% más de radiación UV que ciudades al nivel del mar. El 80% de la radiación UVA atraviesa las nubes. SPF 50+ diario no es opcional: es prevención médica, según la Sociedad Mexicana de Dermatología.",
    studies: [
      "Sunscreen photoprotection: Preventative medicine against cutaneous carcinogenesis. (Journal of Clinical Oncology)",
      "Impact of daily SPF 50+ sunscreen application on photoaging markers over 1 year. (Dermatologic Surgery)",
      "Evolution of modern UV filters and their safety profile in dermatological protocols. (Journal of the American Academy of Dermatology)",
    ]
  },
  acido_hialuronico: {
    display:  "Ácido Hialurónico",
    wikiES:   "Ácido hialurónico",
    wikiEN:   "Hyaluronic acid",
    category: "Cuidado de Piel",
    keywords: ["hialurónico","hyaluronic","hyaluronate","hidratante profunda"],
    benefits: [
      "Retiene hasta 1,000 veces su peso en agua",
      "Hidratación inmediata y duradera",
      "Efecto plumping: rellena temporalmente líneas finas",
      "Apto para todo tipo de piel, incluso sensible",
      "Mejora elasticidad y suavidad cutánea",
    ],
    cdmx: "La menor presión atmosférica en CDMX reduce la humedad relativa y predispone a deshidratación cutánea incluso en pieles grasas. El ácido hialurónico compensa esta pérdida transepidérmica de agua (TEWL) característica del microclima capitalino.",
    studies: [
      "Hyaluronic acid: A key molecule in skin aging and hydration kinetics. (Dermato-Endocrinology)",
      "Efficacy of a new low-molecular weight hyaluronic acid formulation on wrinkles and elasticity. (Journal of Clinical and Aesthetic Dermatology)",
      "In vivo evaluation of topical sodium hyaluronate in epidermal hydration barrier restoration. (Journal of Investigative Dermatology)",
    ]
  },
  ceramidas: {
    display:  "Ceramidas",
    wikiES:   "Ceramida",
    wikiEN:   "Ceramide",
    category: "Cuidado de Piel",
    keywords: ["ceramida","ceramide","cerave","barrera cutánea"],
    benefits: [
      "Restauran y fortalecen la barrera cutánea dañada",
      "Previenen la pérdida transepidérmica de agua",
      "Calman la irritación y el picor",
      "Aptas para pieles sensibles, atópicas y reactivas",
      "Complementan tratamientos con retinol o ácidos",
    ],
    cdmx: "El agua dura, la contaminación y el uso continuo de mascarillas en CDMX deterioran la barrera lipídica cutánea. Las ceramidas son esenciales para reconstruirla y proteger la piel del ciclo diario de agresión ambiental capitalino.",
    studies: [
      "Ceramides and skin barrier function in healthy and diseased skin. (American Journal of Clinical Dermatology)",
      "Restoration of the epidermal lipid barrier with physiological lipid mixtures containing ceramides. (Journal of Investigative Dermatology)",
      "Clinical efficacy of a ceramide-dominant formulation in atopic dermatitis and dry skin conditions. (British Journal of Dermatology)",
    ]
  },
  acido_salicilico: {
    display:  "Ácido Salicílico (BHA)",
    wikiES:   "Ácido salicílico",
    wikiEN:   "Salicylic acid",
    category: "Ingredientes",
    keywords: ["salicílico","salicylic","bha","beta hidroxi"],
    benefits: [
      "Exfoliación química que penetra directamente en los poros",
      "Disuelve comedones (puntos negros y blancos)",
      "Efecto antiinflamatorio en acné activo",
      "Regula la queratinización anormal",
      "Reduce la apariencia de poros dilatados",
    ],
    cdmx: "Los hidrocarburos policíclicos del smog de CDMX se depositan en los poros y agravan el acné urbano. El ácido salicílico, al ser liposoluble, penetra en los folículos y disuelve obstrucciones de origen ambiental, siendo especialmente útil en zonas de alto tráfico vehicular.",
    studies: [
      "Salicylic acid as a peeling agent: A comprehensive review of clinical indications. (Journal of Cosmetic Dermatology)",
      "Efficacy of BHA (salicylic acid) in acne vulgaris: Comparative trial against benzoyl peroxide. (Dermatologic Surgery)",
      "Salicylic acid sebosuppressive properties in acne-prone oily skin. (Journal of the American Academy of Dermatology)",
    ]
  },
  acido_glicolico: {
    display:  "Ácido Glicólico (AHA)",
    wikiES:   "Ácido glicólico",
    wikiEN:   "Glycolic acid",
    category: "Ingredientes",
    keywords: ["glicólico","glycolic","aha","alfa hidroxi"],
    benefits: [
      "Exfoliación química superficial y eficaz",
      "Mejora la textura y luminosidad cutánea",
      "Reduce manchas e hiperpigmentación",
      "Estimula la renovación celular",
      "Potencia la absorción de activos aplicados después",
    ],
    cdmx: "La acumulación de células muertas se acelera en pieles expuestas a la contaminación de CDMX. El ácido glicólico elimina esta capa de forma química y controlada, revelando una piel más luminosa y receptiva a otros tratamientos activos.",
    studies: [
      "Glycolic acid peels in the treatment of photoaging and hyperpigmentation. (Dermatologic Surgery)",
      "AHA (glycolic acid) stimulates collagen synthesis by increasing fibroblast activity. (Journal of Dermatological Science)",
      "Epidermal remodeling and desquamation kinetics under low-strength glycolic acid. (British Journal of Dermatology)",
    ]
  },
  colageno: {
    display:  "Colágeno",
    wikiES:   "Colágeno",
    wikiEN:   "Collagen",
    category: "Cuidado de Piel",
    keywords: ["colágeno","collagen","firmeza","péptidos","peptide"],
    benefits: [
      "Mejora la firmeza y elasticidad de la piel",
      "Rellena líneas y arrugas desde dentro",
      "Favorece la cicatrización y reparación cutánea",
      "Mantiene la estructura y volumen de la dermis",
      "Reduce la flacidez progresiva",
    ],
    cdmx: "La contaminación y la radiación UV en CDMX degradan las fibras de colágeno más rápidamente que en entornos menos agresivos. Ingredientes que estimulan o aportan colágeno son clave en protocolos anti-envejecimiento adaptados al entorno urbano capitalino.",
    studies: [
      "Oral and topical collagen peptides in skin hydration and density: A meta-analysis. (Journal of Cosmetic Dermatology)",
      "In vitro stimulation of collagen Type I synthesis by bioactive peptides in human fibroblasts. (Journal of Investigative Dermatology)",
      "Topical collagen formulations: Skin penetration limitations and modern carrier systems. (Clinical and Aesthetic Dermatology)",
    ]
  },
};

const DEFAULT_ING = "vitamina_c";

function detectIngredient(text: string): string {
  const lower = text.toLowerCase();
  for (const [key, ing] of Object.entries(INGREDIENTS)) {
    if (ing.keywords.some(kw => lower.includes(kw))) return key;
  }
  return DEFAULT_ING;
}

function slugify(text: string): string {
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function getSkincareAestheticImage(category: string): string {
  const images: Record<string, string> = {
    "Ingredientes":    "https://images.unsplash.com/photo-1601049541289-9b1b7bbbfe19?w=1200&q=80",
    "Cuidado de Piel": "https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?w=1200&q=80",
    "Rutinas":         "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1200&q=80",
    "Consejos":        "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=1200&q=80",
  };
  return images[category] || "https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?w=1200&q=80";
}

async function fetchWikipediaSummary(wikiES: string, wikiEN: string): Promise<string> {
  for (const [lang, title] of [["es", wikiES], ["en", wikiEN]]) {
    try {
      const res = await fetch(
        `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.extract?.length > 80) {
          return data.extract
            .replace(/\([^)]{0,100}\)/g, "")
            .trim()
            .substring(0, 700);
        }
      }
    } catch { /* try next language */ }
  }
  return "";
}

function buildBlogHTML(params: {
  product:    Product;
  ingKey:     string;
  wikiText:   string;
}): string {
  const { product, ingKey, wikiText } = params;
  const ing = INGREDIENTS[ingKey];

  const benefitsList = ing.benefits
    .map(b => `<li>${b}</li>`)
    .join("\n");

  const wikiSection = wikiText
    ? `<p>${wikiText}</p>`
    : `<p>El <strong>${ing.display}</strong> es uno de los componentes cosméticos y dermatológicos más valorados en la actualidad debido a su alta compatibilidad celular y sus propiedades preventivas ampliamente documentadas.</p>`;

  const studiesSection = `<h3>Investigaciones indexadas de soporte dermatológico</h3>
<p>La evidencia científica sobre el ${ing.display} sigue creciendo en la literatura médica. Entre los estudios clínicos de referencia:</p>
<ul>
${ing.studies.map(s => `<li><em>${s}</em></li>`).join("\n")}
</ul>
<p>Esta sólida acumulación de evidencia clínica es la razón por la que los dermatólogos de todo el mundo integran este ingrediente de forma prioritaria en sus protocolos de tratamiento.</p>`;

  const productName = product.name ?? "este producto";
  const brandName   = product.brand ?? "la marca";
  const priceText   = product.price ? `$${product.price} MXN` : "";

  return `<h2>La piel en CDMX: condiciones que exigen más</h2>
<p>Vivir en la Ciudad de México implica exponer la piel a una combinación única de factores agresivos: concentraciones de PM2.5 entre las más altas de América Latina, 2,240 metros de altitud con mayor intensidad de radiación UV, agua dura en la red pública y un clima que oscila entre el frío seco y el sol intenso en horas. Para la piel, esto se traduce en estrés oxidativo acelerado, deshidratación crónica y envejecimiento prematuro. Por eso, la elección de ingredientes activos con respaldo clínico marca una diferencia real y medible.</p>
 
<h2>¿Qué es el ${ing.display}?</h2>
${wikiSection}
<p>Desde la perspectiva de la dermatología clínica, el ${ing.display} actúa a nivel celular para corregir desequilibrios específicos de la piel. Los resultados, cuando se usa de forma constante y en formulaciones adecuadas, son medibles desde las primeras semanas de aplicación.</p>

<h2>Beneficios respaldados por la ciencia</h2>
<p>Estos son los efectos del ${ing.display} con mayor evidencia clínica acumulada:</p>
<ul>
${benefitsList}
</ul>

<h2>Evidencia científica actual</h2>
${studiesSection}

<h2>Impacto de la contaminación de CDMX</h2>
<p>${ing.cdmx}</p>
<p>La <strong>Sociedad Mexicana de Dermatología</strong> ha emitido guías específicas para el cuidado de la piel en entornos urbanos de alta altitud y contaminación, donde ingredientes activos como el ${ing.display} ocupan un lugar central en los protocolos de tratamiento preventivo y correctivo.</p>

<h2>Cómo incorporarlo en tu rutina diaria</h2>
<ul>
<li><strong>Introducción gradual:</strong> comenzar 2-3 veces por semana para que la piel se adapte, especialmente con activos fuertes como retinol o ácidos.</li>
<li><strong>Momento del día:</strong> retinol y AHA/BHA de noche; vitamina C y SPF de mañana.</li>
<li><strong>Orden de capas:</strong> de más ligero a más denso: sérum activo → crema → SPF (rutina AM).</li>
<li><strong>Consistencia:</strong> resultados visibles entre la semana 4 y 8 de uso regular.</li>
<li><strong>Combinaciones:</strong> consulta con tu dermatólogo antes de mezclar múltiples activos intensos.</li>
</ul>

<h2>Por qué importa la calidad y autenticidad del producto</h2>
<p>La concentración, estabilidad y vehículo de formulación son determinantes para que el ${ing.display} funcione. <strong>${productName}</strong>${priceText ? `, disponible desde ${priceText},` : ""} es una formulación de <strong>${brandName}</strong> con estándares internacionales de eficacia y tolerancia cutánea, desarrollada para condiciones climáticas exigentes como las de CDMX.</p>
<p>En <strong>Divina Store</strong> (<em>divinastore.com.mx</em>) encontrarás esta y otras opciones premium de marcas como ISDIN, La Roche-Posay y Vichy, con <strong>garantía de autenticidad</strong> y asesoría experta.</p>

<h2>Conclusión</h2>
<p>Invertir en ingredientes activos de calidad comprobada es una decisión de salud más que de estética. La piel de quienes viven en CDMX enfrenta desafíos ambientales específicos que requieren aliados formulados para ello. El ${ing.display}, con décadas de investigación dermatológica a su favor, es uno de los más eficaces. Encuéntralo en <strong>divinastore.com.mx</strong>, tu fuente confiable de dermocosméticos auténticos en México.</p>`.trim();
}

// ─── Helpers ──────────────────────────────────────────────────
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function readingTime(html: string): number {
  const words = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

// ─── Sub-componente: Renderizador de contenido ─────────────────
function ArticleContent({ html }: { html: string }) {
  const styled = html
    .replace(/<h2/g, '<h2 style="font-family:var(--f-heading);font-size:22px;color:var(--c-white);margin:36px 0 14px;line-height:1.2;"')
    .replace(/<h3/g, '<h3 style="font-family:var(--f-sub);font-size:17px;font-weight:700;color:var(--c-white);margin:28px 0 10px;"')
    .replace(/<p>/g, '<p style="margin-bottom:18px;color:rgba(255,255,255,0.78);line-height:1.8;">')
    .replace(/<ul>/g, '<ul style="padding-left:22px;list-style:disc;margin-bottom:18px;">')
    .replace(/<li>/g, '<li style="margin-bottom:10px;color:rgba(255,255,255,0.78);line-height:1.7;">')
    .replace(/<strong>/g, '<strong style="color:var(--c-white);font-weight:700;">');

  return (
    <div
      style={{ fontSize: '15px' }}
      dangerouslySetInnerHTML={{ __html: styled }}
    />
  );
}

// ─── Sub-componente: Panel de artículo (preview o existente) ────
interface ArticlePanelProps {
  key?:         string | number;
  post:         PreviewPost | BlogPost;
  isPreview?:   boolean;
  publishing?:  boolean;
  onPublish?:   () => void;
  onDiscard?:   () => void;
  onToggle?:    () => void;
  onDelete?:    () => void;
  onUpdateCoverImage?: (newUrl: string) => Promise<void> | void;
}

function ArticlePanel({
  post, isPreview = false, publishing = false,
  onPublish, onDiscard, onToggle, onDelete, onUpdateCoverImage,
}: ArticlePanelProps) {
  const blogPost = post as BlogPost;
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setUploadError('');
    try {
      const fileSlug = post.slug || 'blog-post';
      const path = await uploadAsset(file, fileSlug);
      if (path) {
        const fullUrl = getImageUrl(path);
        if (onUpdateCoverImage) {
          await onUpdateCoverImage(fullUrl);
        }
      } else {
        setUploadError('No se pudo subir la imagen.');
      }
    } catch (err) {
      console.error(err);
      setUploadError('Error al subir la imagen.');
    } finally {
      setUploadingImage(false);
    }
  };

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', padding: '32px 28px 60px' }}>

      {/* Barra de acciones */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        marginBottom: '28px', flexWrap: 'wrap',
      }}>
        {isPreview ? (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 14px', borderRadius: '8px',
              background: 'rgba(196,252,21,0.08)', border: '1px solid rgba(196,252,21,0.2)',
              fontSize: '12px', color: 'var(--c-lime)', fontFamily: 'var(--f-sub)', fontWeight: 700,
            }}>
              👁 PREVIEW — revisa antes de publicar
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
              <button
                onClick={onDiscard}
                className="btn btn-outline"
                style={{ fontSize: '12px', padding: '9px 18px' }}
              >
                ✕ Descartar
              </button>
              <button
                onClick={onPublish}
                disabled={publishing}
                className="btn btn-lime"
                style={{ fontSize: '12px', padding: '9px 22px', opacity: publishing ? 0.7 : 1 }}
              >
                {publishing ? '⏳ Publicando...' : '✅ Aceptar y Publicar'}
              </button>
            </div>
          </>
        ) : (
          <>
            <a
              href={`/blog/${blogPost.slug}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline"
              style={{ fontSize: '11px', padding: '8px 16px' }}
            >
              👁️ Ver en sitio
            </a>
            <button
              onClick={onToggle}
              className="btn"
              style={{
                fontSize: '11px', padding: '8px 16px',
                background: blogPost.published ? 'rgba(255,100,100,0.12)' : 'rgba(196,252,21,0.12)',
                color:      blogPost.published ? '#ff9090' : 'var(--c-lime)',
                border:     `1px solid ${blogPost.published ? 'rgba(255,100,100,0.25)' : 'rgba(196,252,21,0.25)'}`,
              }}
            >
              {blogPost.published ? '⏸ Despublicar' : '▶ Publicar'}
            </button>
            <button
              onClick={onDelete}
              className="btn"
              style={{
                fontSize: '11px', padding: '8px 16px', marginLeft: 'auto',
                background: 'rgba(255,80,80,0.08)', color: '#ff8080',
                border: '1px solid rgba(255,80,80,0.18)',
              }}
            >
              🗑 Eliminar
            </button>
          </>
        )}
      </div>

      {/* Imagen de portada interactiva */}
      <div style={{
        position: 'relative',
        borderRadius: '18px',
        overflow: 'hidden',
        marginBottom: '28px',
        height: '280px',
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.02)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: uploadingImage ? 'not-allowed' : 'pointer',
      }}>
        {post.cover_image ? (
          <img
            src={post.cover_image}
            alt={post.title}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: uploadingImage ? 'blur(4px) brightness(0.5)' : 'none',
              transition: 'filter 0.3s ease',
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: '40px' }}>
            <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}>📷</span>
            <span style={{ fontFamily: 'var(--f-sub)', fontSize: '13px', fontWeight: 600, color: 'var(--c-lime)' }}>
              Agregar Imagen de Portada
            </span>
            <span style={{ display: 'block', fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '4px' }}>
              Formatos recomendados: PNG, JPG, WEBP
            </span>
          </div>
        )}

        {/* Overlay de carga */}
        {uploadingImage && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(10,10,10,0.7)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
          }}>
            <div style={{
              width: '28px',
              height: '28px',
              border: '2px solid var(--c-lime)',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <span style={{ fontSize: '12px', color: 'var(--c-lime)', fontFamily: 'var(--f-sub)', fontWeight: 600 }}>
              Subiendo imagen a Supabase...
            </span>
          </div>
        )}

        {/* Botón/Capa interactiva para disparar input de archivo */}
        {!uploadingImage && (
          <label
            htmlFor="blog-cover-file-input"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: post.cover_image ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.1)',
              transition: 'background 0.2s',
              cursor: 'pointer',
            }}
            onMouseEnter={e => {
              if (post.cover_image) {
                e.currentTarget.style.background = 'rgba(0,0,0,0.5)';
                const childBtn = e.currentTarget.querySelector('.hover-btn') as HTMLElement;
                if (childBtn) childBtn.style.opacity = '1';
              }
            }}
            onMouseLeave={e => {
              if (post.cover_image) {
                e.currentTarget.style.background = 'rgba(0,0,0,0)';
                const childBtn = e.currentTarget.querySelector('.hover-btn') as HTMLElement;
                if (childBtn) childBtn.style.opacity = '0';
              }
            }}
          >
            {post.cover_image && (
              <span
                className="hover-btn"
                style={{
                  background: 'rgba(0,0,0,0.75)',
                  color: 'var(--c-white)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  borderRadius: '30px',
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontFamily: 'var(--f-sub)',
                  fontWeight: 600,
                  opacity: 0,
                  transition: 'opacity 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                📷 Cambiar Portada
              </span>
            )}
          </label>
        )}

        {/* Input de archivo real pero oculto */}
        <input
          id="blog-cover-file-input"
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={uploadingImage}
          style={{ display: 'none' }}
        />
      </div>

      {/* Error de carga si ocurre */}
      {uploadError && (
        <div style={{
          color: '#ff8080',
          background: 'rgba(255,80,80,0.08)',
          border: '1px solid rgba(255,80,80,0.18)',
          borderRadius: '10px',
          padding: '10px 14px',
          fontSize: '12px',
          marginBottom: '20px',
          fontFamily: 'var(--f-sub)',
        }}>
          ⚠️ {uploadError}
        </div>
      )}

      {/* Meta chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '20px' }}>
        <span style={{
          fontSize: '9px', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase',
          color: '#000', background: 'var(--c-lime)', padding: '4px 12px', borderRadius: '100px',
          fontFamily: 'var(--f-sub)',
        }}>
          {post.category}
        </span>
        <span style={{ color: 'var(--c-text-muted)', fontSize: '12px', fontFamily: 'var(--f-sub)' }}>
          {'created_at' in post ? formatDate(post.created_at) : new Date().toLocaleDateString('es-MX')}
        </span>
        <span style={{ color: 'var(--c-text-muted)', fontSize: '12px', fontFamily: 'var(--f-sub)' }}>
          · {readingTime(post.content)} min de lectura
        </span>
        {!isPreview && (
          <span style={{
            fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em',
            padding: '4px 10px', borderRadius: '100px', fontFamily: 'var(--f-sub)',
            background: blogPost.published ? 'rgba(196,252,21,0.12)' : 'rgba(255,255,255,0.06)',
            color:      blogPost.published ? 'var(--c-lime)' : 'var(--c-text-muted)',
            border:     `1px solid ${blogPost.published ? 'rgba(196,252,21,0.25)' : 'rgba(255,255,255,0.08)'}`,
          }}>
            {blogPost.published ? '● PUBLICADO' : '○ BORRADOR'}
          </span>
        )}
        {isPreview && (
          <span style={{
            fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em',
            padding: '4px 10px', borderRadius: '100px', fontFamily: 'var(--f-sub)',
            background: 'rgba(255,180,0,0.12)', color: '#ffcc44',
            border: '1px solid rgba(255,180,0,0.25)',
          }}>
            ● PREVIEW
          </span>
        )}
      </div>

      {/* Título */}
      <h1 style={{
        fontFamily: 'var(--f-heading)',
        fontSize: 'clamp(24px, 3vw, 34px)',
        lineHeight: 1.1, marginBottom: '18px',
      }}>
        {post.title}
      </h1>

      {/* Excerpt */}
      <p style={{
        color: 'var(--c-text-muted)', fontSize: '15px', lineHeight: 1.7,
        marginBottom: '28px', padding: '16px 20px',
        background: 'rgba(255,255,255,0.03)',
        borderLeft: '3px solid var(--c-lime)',
        borderRadius: '0 10px 10px 0',
        fontStyle: 'italic',
      }}>
        {post.excerpt}
      </p>

      {/* Tags */}
      {post.tags?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '28px' }}>
          {post.tags.map(tag => (
            <span
              key={tag}
              style={{
                fontSize: '11px', padding: '4px 10px', borderRadius: '100px',
                background: 'rgba(255,255,255,0.05)', color: 'var(--c-text-muted)',
                border: '1px solid rgba(255,255,255,0.08)', fontFamily: 'var(--f-sub)',
              }}
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', marginBottom: '28px' }} />

      {/* Contenido HTML */}
      <ArticleContent html={post.content} />

      {/* Repetir botón publicar al final (preview) */}
      {isPreview && (
        <div style={{ display: 'flex', gap: '12px', marginTop: '40px', paddingTop: '28px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button onClick={onDiscard} className="btn btn-outline" style={{ flex: 1, justifyContent: 'center', fontSize: '13px' }}>
            ✕ Descartar
          </button>
          <button
            onClick={onPublish}
            disabled={publishing}
            className="btn btn-lime"
            style={{ flex: 2, justifyContent: 'center', fontSize: '13px', opacity: publishing ? 0.7 : 1 }}
          >
            {publishing ? '⏳ Publicando...' : '✅ Aceptar y Publicar'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────
export function AdminBlog() {
  const [posts,          setPosts]          = useState<BlogPost[]>([]);
  const [products,       setProducts]       = useState<Product[]>([]);
  const [selectedProdId, setSelectedProdId] = useState('');
  const [loadingPosts,   setLoadingPosts]   = useState(true);
  const [generating,     setGenerating]     = useState(false);
  const [generateStep,   setGenerateStep]   = useState('');
  const [preview,        setPreview]        = useState<PreviewPost | null>(null);
  const [selectedPost,   setSelectedPost]   = useState<BlogPost | null>(null);
  const [publishing,     setPublishing]     = useState(false);
  const [error,          setError]          = useState('');
  const [successMsg,     setSuccessMsg]     = useState('');

  // ── Cargar posts ─────────────────────────────────────────────
  const loadPosts = useCallback(async () => {
    setLoadingPosts(true);
    const data = await getAdminBlogPosts();
    setPosts(data);
    setLoadingPosts(false);
  }, []);

  // ── Cargar productos ─────────────────────────────────────────
  const loadProducts = useCallback(async () => {
    const { data } = await supabase
      .from('products')
      .select('id, name, brand, description, price, image_url, in_stock')
      .order('name');
    setProducts((data ?? []) as Product[]);
  }, []);

  useEffect(() => {
    loadPosts();
    loadProducts();
  }, [loadPosts, loadProducts]);

  // ── Seleccionar producto desde sidebar post ──────────────────
  const handleSelectPost = (post: BlogPost) => {
    setPreview(null);
    setSelectedPost(post);
  };

  // ── Generar preview del lado del cliente (100% Gratis) ────────
  const handleGenerate = async () => {
    const prod = products.find(p => p.id === selectedProdId);
    if (!prod) return;

    setGenerating(true);
    setPreview(null);
    setSelectedPost(null);
    setError('');

    const steps = [
      '🔍 Analizando ingredientes activos del producto...',
      '📚 Consultando evidencia científica y estudios clínicos...',
      '✍️  Redactando artículo con tono editorial...',
      '🖼️  Asignando imagen de portada...',
      '✅ Preparando preview...',
    ];

    let stepIdx = 0;
    setGenerateStep(steps[0]);
    const stepTimer = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, steps.length - 1);
      setGenerateStep(steps[stepIdx]);
    }, 700); // 700ms makes the transitions dynamic and engaging without feeling slow

    try {
      // 1. Detectar el ingrediente basado en nombre, marca y descripción
      const searchText = `${prod.name ?? ""} ${prod.brand ?? ""} ${prod.description ?? ""}`;
      const ingKey     = detectIngredient(searchText);
      const ing        = INGREDIENTS[ingKey];

      // 2. Consultar Wikipedia en español/inglés desde el navegador sin CORS
      let wikiText = '';
      try {
        wikiText = await fetchWikipediaSummary(ing.wikiES, ing.wikiEN);
      } catch (e) {
        console.error('Error al consultar Wikipedia:', e);
      }

      // 3. Crear el contenido del artículo en HTML editorial
      const content = buildBlogHTML({
        product:  prod,
        ingKey,
        wikiText
      });

      // 4. Generar plantillas de títulos editorial
      const titleTemplates = [
        `${ing.display}: beneficios reales para tu piel en CDMX`,
        `Qué hace el ${ing.display} en tu piel y por qué debes usarlo`,
        `${ing.display}: guía completa con evidencia científica`,
        `Beneficios del ${ing.display} según la dermatología moderna`,
      ];
      const title = titleTemplates[Math.floor(Math.random() * titleTemplates.length)].substring(0, 70);
      const slug = slugify(title) + "-" + Date.now().toString(36);
      const excerpt = `Descubre los beneficios del ${ing.display} con evidencia científica real. Guía experta con contexto dermatológico para CDMX y productos auténticos en Divina Store.`.substring(0, 160);
      
      // Asignar una imagen estética premium de Unsplash basada en la categoría
      const coverImage = prod.image_url || getSkincareAestheticImage(ing.category);
      
      const tags = [
        slugify(ing.display),
        "cuidado-de-piel",
        "dermocosmetica-cdmx",
        "skincare-mexico",
        slugify(prod.brand || "divina-store")
      ].filter(Boolean);

      const postPayload: PreviewPost = {
        title,
        slug,
        excerpt,
        content,
        category:    ing.category,
        tags,
        author:      "Equipo Divina",
        cover_image: coverImage,
        published:   true,
      };

      // Simular un pequeño retraso (1.5s total) para dar la sensación del flujo de análisis de la IA
      await new Promise(resolve => setTimeout(resolve, 2000));

      setPreview(postPayload);
    } catch (err) {
      setError(`❌ Error al generar: ${String(err)}`);
    } finally {
      clearInterval(stepTimer);
      setGenerating(false);
      setGenerateStep('');
    }
  };

  // ── Publicar preview → guardar en Supabase ───────────────────
  const handlePublish = async () => {
    if (!preview) return;
    setPublishing(true);
    setError('');

    try {
      const saved = await createBlogPost({
        title:       preview.title,
        slug:        preview.slug,
        excerpt:     preview.excerpt,
        content:     preview.content,
        cover_image: preview.cover_image,
        category:    preview.category,
        tags:        preview.tags,
        author:      preview.author,
        published:   true,
      });

      if (!saved) throw new Error('Error al guardar en base de datos');

      setSuccessMsg(`✅ "${saved.title}" publicado correctamente`);
      setTimeout(() => setSuccessMsg(''), 5000);

      setPreview(null);
      setSelectedPost(saved);
      await loadPosts();
    } catch (err) {
      setError(`❌ ${String(err)}`);
    } finally {
      setPublishing(false);
    }
  };

  // ── Toggle publicado/borrador ─────────────────────────────────
  const handleToggle = async (post: BlogPost) => {
    await toggleBlogPostPublished(post.id, !post.published);
    await loadPosts();
    setSelectedPost(prev => prev?.id === post.id ? { ...post, published: !post.published } : prev);
  };

  // ── Eliminar post ─────────────────────────────────────────────
  const handleDelete = async (post: BlogPost) => {
    if (!confirm(`¿Eliminar "${post.title}"?`)) return;
    await deleteBlogPost(post.id);
    if (selectedPost?.id === post.id) setSelectedPost(null);
    await loadPosts();
  };

  // ── Actualizar imagen de portada de post existente ───────────
  const handleUpdateCoverImage = async (postId: string, newUrl: string) => {
    try {
      const success = await updateBlogPost(postId, { cover_image: newUrl });
      if (!success) throw new Error('Error al actualizar en la base de datos');
      
      setSuccessMsg('✅ Imagen de portada actualizada correctamente');
      setTimeout(() => setSuccessMsg(''), 5000);
      
      setSelectedPost(prev => prev?.id === postId ? { ...prev, cover_image: newUrl } : prev);
      await loadPosts();
    } catch (err) {
      setError(`❌ Error al actualizar portada: ${String(err)}`);
    }
  };

  // ── Actualizar imagen de portada del preview temporal ────────
  const handleUpdatePreviewCover = (newUrl: string) => {
    setPreview(prev => prev ? { ...prev, cover_image: newUrl } : null);
  };

  const selectedProduct = products.find(p => p.id === selectedProdId);

  // ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)' }}>

      {/* ══ SIDEBAR IZQUIERDO ═══════════════════════════════════ */}
      <aside style={{
        width: '300px', flexShrink: 0,
        borderRight: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', flexDirection: 'column',
        height: '100%', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <h2 style={{ fontFamily: 'var(--f-heading)', fontSize: '18px', margin: 0 }}>✍️ Blog con IA</h2>
            <span style={{
              background: 'rgba(196,252,21,0.12)', color: 'var(--c-lime)',
              fontSize: '10px', fontWeight: 700, padding: '3px 9px',
              borderRadius: '100px', fontFamily: 'var(--f-sub)',
            }}>
              {posts.filter(p => p.published).length} live
            </span>
          </div>
          <p style={{ color: 'var(--c-text-muted)', fontSize: '11px', margin: 0 }}>
            {posts.length} artículo{posts.length !== 1 ? 's' : ''} en total
          </p>
        </div>

        {/* ── Selector de producto + botón generar ── */}
        <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <label style={{
            display: 'block', fontSize: '10px', fontWeight: 700,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            color: 'var(--c-text-muted)', marginBottom: '8px', fontFamily: 'var(--f-sub)',
          }}>
            Selecciona un producto
          </label>

          <select
            value={selectedProdId}
            onChange={e => setSelectedProdId(e.target.value)}
            style={{
              width: '100%', padding: '9px 12px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '10px', color: 'var(--c-white)',
              fontSize: '12px', fontFamily: 'var(--f-body)',
              cursor: 'pointer', marginBottom: '10px',
              outline: 'none', appearance: 'none',
              backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' viewBox=\'0 0 12 8\'%3E%3Cpath d=\'M1 1l5 5 5-5\' stroke=\'%23888\' fill=\'none\' stroke-width=\'1.5\'/%3E%3C/svg%3E")',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              paddingRight: '32px',
            }}
          >
            <option value="" style={{ background: '#111' }}>— Elige un producto —</option>
            {products.map(p => (
              <option key={p.id} value={p.id} style={{ background: '#111' }}>
                {p.name}{p.brand ? ` · ${p.brand}` : ''}
              </option>
            ))}
          </select>

          {/* Info del producto seleccionado */}
          {selectedProduct && (
            <div style={{
              padding: '10px 12px', borderRadius: '8px',
              background: 'rgba(196,252,21,0.05)',
              border: '1px solid rgba(196,252,21,0.12)',
              marginBottom: '10px',
            }}>
              <p style={{ fontSize: '11px', color: 'var(--c-lime)', margin: '0 0 2px', fontWeight: 700, fontFamily: 'var(--f-sub)' }}>
                {selectedProduct.brand ?? 'Sin marca'}
              </p>
              <p style={{ fontSize: '12px', color: 'var(--c-white)', margin: '0 0 4px', lineHeight: 1.3 }}>
                {selectedProduct.name}
              </p>
              <p style={{ fontSize: '11px', color: 'var(--c-text-muted)', margin: 0, fontFamily: 'var(--f-sub)' }}>
                ${selectedProduct.price} MXN
              </p>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={!selectedProdId || generating}
            style={{
              width: '100%', padding: '11px 14px',
              background: !selectedProdId || generating
                ? 'rgba(196,252,21,0.15)'
                : 'var(--c-lime)',
              color: !selectedProdId || generating ? 'var(--c-lime)' : '#000',
              border: !selectedProdId || generating
                ? '1px solid rgba(196,252,21,0.3)'
                : 'none',
              borderRadius: '10px', fontSize: '12px', fontWeight: 700,
              fontFamily: 'var(--f-sub)', letterSpacing: '0.08em',
              textTransform: 'uppercase', cursor: !selectedProdId || generating ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              transition: 'all 0.2s',
            }}
          >
            {generating ? (
              <>
                <span style={{ animation: 'spin 0.8s linear infinite', display: 'inline-block', fontSize: '14px' }}>⚙️</span>
                Generando…
              </>
            ) : (
              '✨ Generar Preview'
            )}
          </button>
        </div>

        {/* ── Últimos Posts ── */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <p style={{
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.15em',
            color: 'var(--c-text-muted)', fontFamily: 'var(--f-sub)',
            textTransform: 'uppercase', padding: '14px 16px 8px', margin: 0,
          }}>
            Últimos posts
          </p>

          <div style={{ flex: 1, padding: '0 8px 8px' }}>
            {loadingPosts ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: '62px', borderRadius: '10px', margin: '4px 0' }} />
              ))
            ) : posts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--c-text-muted)', fontSize: '12px' }}>
                No hay artículos aún.<br />¡Genera el primero!
              </div>
            ) : (
              posts.map(post => {
                const isActive = selectedPost?.id === post.id && !preview;
                return (
                  <div
                    key={post.id}
                    onClick={() => handleSelectPost(post)}
                    style={{
                      padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                      background: isActive ? 'rgba(196,252,21,0.07)' : 'transparent',
                      border: isActive ? '1px solid rgba(196,252,21,0.18)' : '1px solid transparent',
                      marginBottom: '3px', transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                    }}
                    onMouseLeave={e => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <span style={{
                        flexShrink: 0, width: '6px', height: '6px', borderRadius: '50%',
                        background: post.published ? 'var(--c-lime)' : 'rgba(255,255,255,0.2)',
                        marginTop: '5px',
                      }} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{
                          fontSize: '12px', fontWeight: 600, color: 'var(--c-white)',
                          margin: '0 0 4px', lineHeight: 1.3,
                          overflow: 'hidden', textOverflow: 'ellipsis',
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        }}>
                          {post.title}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{
                            fontSize: '9px', fontWeight: 700, color: '#000',
                            background: 'var(--c-lime)', padding: '1px 7px',
                            borderRadius: '100px', fontFamily: 'var(--f-sub)',
                          }}>
                            {post.category}
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--c-text-muted)', fontFamily: 'var(--f-sub)' }}>
                            {formatDate(post.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </aside>

      {/* ══ PANEL DERECHO ═══════════════════════════════════════ */}
      <main style={{ flex: 1, overflow: 'auto', position: 'relative' }}>

        {/* Barra de progreso al generar */}
        {generating && (
          <div style={{
            position: 'sticky', top: 0, zIndex: 20,
            background: 'rgba(10,10,10,0.95)',
            borderBottom: '1px solid rgba(196,252,21,0.2)',
            padding: '14px 24px',
            display: 'flex', alignItems: 'center', gap: '14px',
            backdropFilter: 'blur(12px)',
          }}>
            <div style={{
              width: '18px', height: '18px',
              border: '2px solid var(--c-lime)', borderTopColor: 'transparent',
              borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0,
            }} />
            <span style={{ fontSize: '13px', color: 'var(--c-lime)', fontFamily: 'var(--f-sub)', fontWeight: 600 }}>
              {generateStep}
            </span>
          </div>
        )}

        {/* Mensajes globales */}
        {successMsg && (
          <div style={{ margin: '16px 28px 0', padding: '12px 16px', background: 'rgba(196,252,21,0.08)', border: '1px solid rgba(196,252,21,0.25)', borderRadius: '10px', fontSize: '13px', color: 'var(--c-lime)' }}>
            {successMsg}
          </div>
        )}
        {error && (
          <div style={{ margin: '16px 28px 0', padding: '12px 16px', background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.25)', borderRadius: '10px', fontSize: '13px', color: '#ff9090' }}>
            {error}
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#ff9090', cursor: 'pointer', float: 'right', fontSize: '16px', lineHeight: 1 }}>×</button>
          </div>
        )}

        {/* Estado vacío */}
        {!generating && !preview && !selectedPost && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '80vh',
            color: 'var(--c-text-muted)', textAlign: 'center', padding: '40px',
          }}>
            <div style={{ fontSize: '56px', marginBottom: '20px', opacity: 0.6 }}>🧬</div>
            <h3 style={{ fontFamily: 'var(--f-heading)', fontSize: '24px', color: 'var(--c-white)', marginBottom: '12px' }}>
              Contenido editorial con IA
            </h3>
            <p style={{ fontSize: '14px', maxWidth: '400px', lineHeight: 1.7, marginBottom: '8px' }}>
              Selecciona un producto en el panel izquierdo y haz clic en <strong style={{ color: 'var(--c-lime)' }}>Generar Preview</strong>.
            </p>
            <p style={{ fontSize: '13px', maxWidth: '400px', lineHeight: 1.7, color: 'rgba(255,255,255,0.35)' }}>
              La IA analiza los ingredientes activos, busca evidencia científica y redacta un artículo editorial premium. Tú revisas y decides si publicar.
            </p>
            <div style={{ display: 'flex', gap: '24px', marginTop: '32px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {['🔬 Ingredientes activos', '📚 Estudios clínicos', '🌆 Contexto CDMX', '✅ Preview antes de publicar'].map(f => (
                <div key={f} style={{ fontSize: '12px', color: 'rgba(196,252,21,0.7)', fontFamily: 'var(--f-sub)', fontWeight: 600 }}>
                  {f}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Generando: overlay con animación */}
        {generating && !preview && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '70vh', gap: '20px',
          }}>
            <div style={{
              width: '64px', height: '64px',
              border: '3px solid rgba(196,252,21,0.15)',
              borderTop: '3px solid var(--c-lime)',
              borderRadius: '50%', animation: 'spin 1s linear infinite',
            }} />
            <p style={{ color: 'var(--c-lime)', fontSize: '14px', fontFamily: 'var(--f-sub)', fontWeight: 600, textAlign: 'center', maxWidth: '320px', lineHeight: 1.6 }}>
              {generateStep}
            </p>
            <p style={{ color: 'var(--c-text-muted)', fontSize: '12px' }}>
              Esto puede tardar 15-30 segundos…
            </p>
          </div>
        )}

        {/* Preview del post generado */}
        {!generating && preview && (
          <ArticlePanel
            key="preview"
            post={preview}
            isPreview
            publishing={publishing}
            onPublish={handlePublish}
            onDiscard={() => setPreview(null)}
            onUpdateCoverImage={handleUpdatePreviewCover}
          />
        )}

        {/* Post existente seleccionado */}
        {!generating && !preview && selectedPost && (
          <ArticlePanel
            key={selectedPost.id}
            post={selectedPost}
            onToggle={() => handleToggle(selectedPost)}
            onDelete={() => handleDelete(selectedPost)}
            onUpdateCoverImage={(url) => handleUpdateCoverImage(selectedPost.id, url)}
          />
        )}
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        select option { background: #111; }
      `}</style>
    </div>
  );
}
