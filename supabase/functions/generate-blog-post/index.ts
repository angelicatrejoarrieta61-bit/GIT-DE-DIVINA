import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ══════════════════════════════════════════════════════════════
// BASE DE CONOCIMIENTO DE INGREDIENTES
// ══════════════════════════════════════════════════════════════
const INGREDIENTS: Record<string, {
  display:   string;
  wikiES:    string;
  wikiEN:    string;
  category:  string;
  keywords:  string[];
  benefits:  string[];
  cdmx:      string;
}> = {
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
  },
};

// Fallback para productos sin ingrediente detectado
const DEFAULT_ING = "vitamina_c";

// ══════════════════════════════════════════════════════════════
// DETECCIÓN DE INGREDIENTES
// ══════════════════════════════════════════════════════════════
function detectIngredient(text: string): string {
  const lower = text.toLowerCase();
  for (const [key, ing] of Object.entries(INGREDIENTS)) {
    if (ing.keywords.some(kw => lower.includes(kw))) return key;
  }
  return DEFAULT_ING;
}

// ══════════════════════════════════════════════════════════════
// FUENTES GRATUITAS DE INTERNET
// ══════════════════════════════════════════════════════════════

/** DuckDuckGo Instant Answer API — sin key, sin costo */
async function fetchDuckDuckGo(query: string): Promise<string> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DivinaStoreBot/1.0)" },
    });
    if (!res.ok) return "";
    const data = await res.json();
    const text = data.AbstractText || data.Answer || data.RelatedTopics?.[0]?.Text || "";
    return text.substring(0, 600);
  } catch { return ""; }
}

/** Wikipedia REST API (ES → EN fallback) — sin key, sin costo */
async function fetchWikipedia(wikiES: string, wikiEN: string): Promise<string> {
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
    } catch { /* try next */ }
  }
  return "";
}

/** PubMed RSS — artículos científicos reales, sin key */
async function fetchPubMedStudies(ingredientName: string): Promise<string[]> {
  try {
    const query = encodeURIComponent(`${ingredientName} skin benefits`);
    const url = `https://pubmed.ncbi.nlm.nih.gov/rss/search/?term=${query}&limit=6`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return [];
    const xml = await res.text();

    // CDATA titles (formato moderno de PubMed RSS)
    const cdataMatches = [...xml.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g)];
    if (cdataMatches.length > 0) {
      return cdataMatches
        .map(m => m[1].trim())
        .filter(t => t.length > 20 && !t.toLowerCase().includes("pubmed"))
        .slice(0, 4);
    }
    // Fallback: títulos regulares
    const regMatches = [...xml.matchAll(/<title>([^<]{20,200})<\/title>/g)];
    return regMatches
      .map(m => m[1].trim())
      .filter(t => !t.toLowerCase().includes("pubmed") && !t.toLowerCase().includes("search"))
      .slice(0, 4);
  } catch { return []; }
}

// ══════════════════════════════════════════════════════════════
// GENERADOR DE BLOG DESDE FUENTES REALES
// ══════════════════════════════════════════════════════════════
function slugify(text: string): string {
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function unsplashUrl(category: string, seed: string): string {
  const queries: Record<string, string> = {
    "Ingredientes":    "skincare laboratory science cosmetic",
    "Cuidado de Piel": "skincare serum face luxury cream",
    "Rutinas":         "morning skincare beauty routine",
    "Consejos":        "skin glow wellness face beauty",
  };
  const q = encodeURIComponent(queries[category] ?? "skincare dermocosmetica beauty");
  const sig = seed.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return `https://source.unsplash.com/1200x630/?${q}&sig=${sig}`;
}

function buildBlogHTML(params: {
  product:    Record<string, string>;
  ingKey:     string;
  wikiText:   string;
  ddgText:    string;
  studies:    string[];
}): string {
  const { product, ingKey, wikiText, ddgText, studies } = params;
  const ing = INGREDIENTS[ingKey];

  const benefitsList = ing.benefits
    .map(b => `<li>${b}</li>`)
    .join("\n");

  const wikiSection = wikiText
    ? `<p>${wikiText}</p>`
    : "";

  const ddgSection = ddgText && ddgText.trim().length > 60 && ddgText !== wikiText
    ? `<p>${ddgText.substring(0, 500)}</p>`
    : "";

  const studiesSection = studies.length > 0
    ? `<h3>Investigaciones publicadas en PubMed</h3>
<p>La evidencia científica sobre el ${ing.display} sigue creciendo. Entre las investigaciones más recientes indexadas en PubMed:</p>
<ul>
${studies.map(s => `<li><em>${s}</em></li>`).join("\n")}
</ul>
<p>Esta acumulación de evidencia clínica es la razón por la que los dermatólogos lo incluyen en sus protocolos de tratamiento tanto preventivo como correctivo.</p>`
    : `<p>El <strong>Journal of Investigative Dermatology</strong>, el <strong>British Journal of Dermatology</strong> y la <strong>Journal of the American Academy of Dermatology</strong> han publicado extensas revisiones que respaldan la eficacia de este ingrediente en el tratamiento de diversas condiciones cutáneas.</p>`;

  const productName = product.name ?? "este producto";
  const brandName   = product.brand ?? "la marca";
  const priceText   = product.price ? `$${product.price} MXN` : "";

  return `<h2>La piel en CDMX: condiciones que exigen más</h2>
<p>Vivir en la Ciudad de México implica exponer la piel a una combinación única de factores agresivos: concentraciones de PM2.5 entre las más altas de América Latina, 2,240 metros de altitud con mayor intensidad de radiación UV, agua dura en la red pública y un clima que oscila entre el frío seco y el sol intenso en horas. Para la piel, esto se traduce en estrés oxidativo acelerado, deshidratación crónica y envejecimiento prematuro. Por eso, la elección de ingredientes activos con respaldo clínico marca una diferencia real y medible.</p>

<h2>¿Qué es el ${ing.display}?</h2>
${wikiSection}
${ddgSection}
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

// ══════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ══════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* cron: body vacío */ }

    const preview = body.preview === true;

    // ── Obtener producto ────────────────────────────────────────
    let product: Record<string, string>;

    if (body.product) {
      product = body.product as Record<string, string>;
    } else {
      // Modo cron: producto aleatorio de Supabase
      const { data: productos, error } = await supabase
        .from("products")
        .select("name, brand, description, price, image_url")
        .eq("in_stock", true)
        .limit(50);
      if (error || !productos?.length) throw new Error("No se encontraron productos");
      product = productos[Math.floor(Math.random() * productos.length)] as Record<string, string>;
    }

    // ── Detectar ingrediente principal ─────────────────────────
    const searchText = `${product.name ?? ""} ${product.brand ?? ""} ${product.description ?? ""}`;
    const ingKey     = detectIngredient(searchText);
    const ing        = INGREDIENTS[ingKey];

    // ── Buscar en todas las fuentes gratuitas en paralelo ───────
    const searchQuery = `${ing.display} beneficios piel dermatología`;

    const [ddgText, wikiText, studies] = await Promise.all([
      fetchDuckDuckGo(searchQuery),
      fetchWikipedia(ing.wikiES, ing.wikiEN),
      fetchPubMedStudies(ing.display),
    ]);

    // ── Construir artículo desde datos reales ───────────────────
    const content = buildBlogHTML({ product, ingKey, wikiText, ddgText, studies });

    const titleTemplates = [
      `${ing.display}: beneficios reales para tu piel en CDMX`,
      `Qué hace el ${ing.display} en tu piel y por qué debes usarlo`,
      `${ing.display}: guía completa con evidencia científica`,
      `Beneficios del ${ing.display} según la dermatología moderna`,
    ];
    const title      = titleTemplates[Math.floor(Math.random() * titleTemplates.length)].substring(0, 70);
    const slug       = slugify(title) + "-" + Date.now().toString(36);
    const excerpt    = `Descubre los beneficios del ${ing.display} con evidencia científica real. Guía experta con contexto dermatológico para CDMX y productos auténticos en Divina Store.`.substring(0, 160);
    const coverImage = product.image_url || unsplashUrl(ing.category, slug);
    const tags       = [slugify(ing.display), "cuidado-de-piel", "dermocosmetica-cdmx", "skincare-mexico", slugify(product.brand || "divina-store")].filter(Boolean);

    const postPayload = {
      title, slug, excerpt, content,
      category:    ing.category,
      tags,
      author:      "Equipo Divina",
      cover_image: coverImage,
      published:   true,
      created_at:  new Date().toISOString(),
    };

    const sources = {
      duckduckgo: ddgText.length > 0,
      wikipedia:  wikiText.length > 0,
      pubmed:     studies.length,
      ingrediente: ing.display,
    };

    // ── Modo preview: devolver sin guardar ──────────────────────
    if (preview) {
      return new Response(
        JSON.stringify({ success: true, post: postPayload, producto: product.name, sources }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // ── Modo cron: guardar directo en blog_posts ────────────────
    const { data: saved, error: insertError } = await supabase
      .from("blog_posts")
      .insert(postPayload)
      .select()
      .single();

    if (insertError) throw new Error("Error insertando: " + insertError.message);

    return new Response(
      JSON.stringify({ success: true, post: saved, producto: product.name, sources }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
