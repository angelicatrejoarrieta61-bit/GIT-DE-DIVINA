/**
 * AdminSourcing.tsx — Abastecimiento bajo pedido
 * Busca un producto (nombre, marca, EAN o escaneo) en tiendas de México vía
 * Google Shopping, clasifica coincidencias exactas, calcula costo y margen,
 * aprende un directorio de tiendas y manda el producto elegido a "mi stock".
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { BarcodeScanner } from '../../components/BarcodeScanner';
import {
  buildSpec, computeMargin, evaluateOffers, isBarcode, money, slugify, timeAgo, detectBrand, round2, norm,
  DEFAULT_MARGIN, MATCH_RANK,
  type EvaluatedOffer, type MarginSettings, type MatchLevel, type SourcingMerchant, type SourcingOffer, type Trust,
} from '../../lib/sourcing';
import './AdminSourcing.css';

// ─── Tipos locales ────────────────────────────────────────────
interface CatalogProduct {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  price: number | null;
  ean: string | null;
  sku: string | null;
  cost_price: number | null;
  fulfillment: string | null;
  in_stock: boolean | null;
}
interface CollectionLite { id: string; name: string }
interface SearchMeta { searchId: string; fetchedAt: string; cached: boolean; nextStart: number | null; query: string }
interface HistoryRow { id: string; query: string; page: number; results: number; duration_ms: number | null; status: string; error: string | null; created_at: string; product_id: string | null }
type Tab = 'buscar' | 'tiendas' | 'historial';
type MatchFilter = 'exactas' | 'probables' | 'todas';
type SortKey = 'margin' | 'cost' | 'trust' | 'relevance';
type Toast = { kind: 'ok' | 'error'; text: string } | null;

const SETTINGS_KEYS: Record<keyof MarginSettings, string> = {
  clipFeePct: 'sourcing_clip_fee_pct',
  clipFeeFixed: 'sourcing_clip_fee_fixed',
  ivaOnFee: 'sourcing_iva_on_fee',
  supplierShipping: 'sourcing_supplier_shipping',
  customerShipping: 'sourcing_customer_shipping',
};

const MATCH_LABEL: Record<MatchLevel, string> = { exacta: 'Exacta', probable: 'Probable', no_confirmada: 'No confirmada' };
const TRUST_LABEL: Record<Trust, string> = { nuevo: 'Nueva', confiable: 'Confiable', descartado: 'Descartada' };

const toNum = (v: string): number | null => {
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && v.trim() !== '' ? n : null;
};

// ═══════════════════════════════════════════════════════════════
export function AdminSourcing() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('buscar');

  // Datos base
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [collections, setCollections] = useState<CollectionLite[]>([]);
  const [settings, setSettings] = useState<MarginSettings>(DEFAULT_MARGIN);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Búsqueda
  const [linked, setLinked] = useState<CatalogProduct | null>(null);
  const [catalogText, setCatalogText] = useState('');
  const [changingLink, setChangingLink] = useState(false);
  const [addMode, setAddMode] = useState<'ask' | 'form' | 'no'>('ask');
  const [addName, setAddName] = useState('');
  const [addBrand, setAddBrand] = useState('');
  const [addEan, setAddEan] = useState('');
  const [adding, setAdding] = useState(false);
  const [specOpen, setSpecOpen] = useState(false);
  const [savingField, setSavingField] = useState<'price' | 'ean' | null>(null);
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [specText, setSpecText] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [offers, setOffers] = useState<SourcingOffer[]>([]);
  const [merchants, setMerchants] = useState<Record<string, SourcingMerchant>>({});
  const [meta, setMeta] = useState<SearchMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  // Filtros
  const [matchFilter, setMatchFilter] = useState<MatchFilter>('probables');
  const [brandFilter, setBrandFilter] = useState<string>('');
  const [shopFilter, setShopFilter] = useState<string>('');
  const [hideDiscarded, setHideDiscarded] = useState(true);
  const [onlyTrusted, setOnlyTrusted] = useState(false);
  const [hideSuspicious, setHideSuspicious] = useState(false);
  const [sort, setSort] = useState<SortKey>('margin');

  // UI
  const [scanOpen, setScanOpen] = useState(false);
  const [stockOffer, setStockOffer] = useState<EvaluatedOffer | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const queryRef = useRef<HTMLInputElement>(null);

  const notify = useCallback((t: Toast) => {
    setToast(t);
    if (t) window.setTimeout(() => setToast(null), 4200);
  }, []);

  // ── Carga inicial ──────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      const [{ data: prods }, { data: cols }, { data: cfg }] = await Promise.all([
        supabase.from('products').select('id,name,slug,brand,price,ean,sku,cost_price,fulfillment,in_stock').order('name').limit(1000),
        supabase.from('collections').select('id,name').order('name'),
        supabase.from('store_config').select('key,value').in('key', Object.values(SETTINGS_KEYS)),
      ]);
      const list = (prods ?? []) as CatalogProduct[];
      setCatalog(list);
      setCollections((cols ?? []) as CollectionLite[]);
      if (cfg?.length) {
        const map = Object.fromEntries(cfg.map((r) => [r.key, r.value]));
        setSettings({
          clipFeePct: Number(map[SETTINGS_KEYS.clipFeePct] ?? DEFAULT_MARGIN.clipFeePct),
          clipFeeFixed: Number(map[SETTINGS_KEYS.clipFeeFixed] ?? DEFAULT_MARGIN.clipFeeFixed),
          ivaOnFee: String(map[SETTINGS_KEYS.ivaOnFee] ?? 'true') === 'true',
          supplierShipping: Number(map[SETTINGS_KEYS.supplierShipping] ?? 0),
          customerShipping: Number(map[SETTINGS_KEYS.customerShipping] ?? 0),
        });
      }
      const pid = params.get('product');
      if (pid) {
        const p = list.find((x) => x.id === pid);
        if (p) linkProduct(p, !params.get('q'));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Producto vinculado de Divina ───────────────────────────
  const fullName = (p: CatalogProduct) =>
    p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? `${p.brand} ${p.name}` : p.name;
  /** Vincula un producto del catálogo. `setSearch` reemplaza la búsqueda por su nombre. */
  const linkProduct = (p: CatalogProduct, setSearch = false) => {
    setLinked(p);
    setChangingLink(false);
    setCatalogText('');
    setSpecText(fullName(p));
    // Respeta el precio que ya escribiste; si no hay, usa el del catálogo.
    if (p.price) setSalePrice((prev) => (toNum(prev) ? prev : String(p.price)));
    if (setSearch) setQuery(fullName(p));
  };

  const unlinkProduct = () => {
    setLinked(null);
    setChangingLink(false);
    setSpecText('');
  };

  /** Coincidencias en mi catálogo: por código de barras exacto o por palabras del nombre/marca. */
  const catalogMatches = useMemo(() => {
    const source = (catalogText.trim() || query.trim());
    if (source.length < 2) return [] as CatalogProduct[];
    const code = source.replace(/\s/g, '');
    if (isBarcode(code)) return catalog.filter((p) => p.ean === code || p.sku === code).slice(0, 5);
    const tokens = norm(source).split(' ').filter((t) => t.length > 1 && !['ml', 'g', 'gr', 'spf', 'de', 'con', 'para'].includes(t));
    if (!tokens.length) return [];
    return catalog
      .map((p) => {
        const hay = ` ${norm(`${p.brand ?? ''} ${p.name} ${p.sku ?? ''}`)} `;
        const hits = tokens.filter((t) => hay.includes(` ${t} `) || (t.length > 3 && hay.includes(t))).length;
        return { p, score: hits / tokens.length, hits };
      })
      .filter((x) => x.hits >= Math.min(2, tokens.length) && x.score >= 0.4)
      .sort((a, b) => b.score - a.score || a.p.name.length - b.p.name.length)
      .slice(0, 5)
      .map((x) => x.p);
  }, [catalog, catalogText, query]);

  /** Guarda un campo del producto vinculado directo en el catálogo. */
  const saveLinkedField = async (field: 'price' | 'ean') => {
    if (!linked) return;
    const value = field === 'price' ? toNum(salePrice) : query.replace(/\s/g, '');
    if (field === 'price' && (!value || (value as number) <= 0)) { notify({ kind: 'error', text: 'Pon un precio válido.' }); return; }
    setSavingField(field);
    const { data, error: err } = await supabase.from('products').update({ [field]: value }).eq('id', linked.id)
      .select('id,name,slug,brand,price,ean,sku,cost_price,fulfillment,in_stock').single();
    setSavingField(null);
    if (err || !data) { notify({ kind: 'error', text: `No se guardó: ${err?.message ?? 'sin respuesta'}` }); return; }
    const updated = data as CatalogProduct;
    setLinked(updated);
    setCatalog((c) => c.map((x) => (x.id === updated.id ? updated : x)));
    notify({ kind: 'ok', text: field === 'price' ? `Precio de "${updated.name}" actualizado a ${money(updated.price)}.` : `Código de barras guardado en "${updated.name}".` });
  };

  // ── Buscar ─────────────────────────────────────────────────
  const runSearch = useCallback(async (q: string, opts: { start?: number; refresh?: boolean; append?: boolean } = {}) => {
    const clean = q.replace(/\s+/g, ' ').trim();
    if (clean.length < 2) { setError('Escribe al menos 2 caracteres.'); return; }
    setError('');
    if (opts.append) setLoadingMore(true); else setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Tu sesión venció. Vuelve a entrar al admin.');
      const r = await fetch('/api/sourcing-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ query: clean, start: opts.start ?? 0, refresh: !!opts.refresh, productId: linked?.id ?? null }),
      });
      const data = await r.json().catch(() => ({ ok: false, error: `El servidor respondió ${r.status}` }));
      if (!r.ok || !data.ok) throw new Error(data.error || `Error ${r.status}`);

      setOffers((prev) => (opts.append ? [...prev, ...data.offers] : data.offers));
      setMerchants((prev) => (opts.append ? { ...prev, ...data.merchants } : data.merchants));
      setMeta({ searchId: data.searchId, fetchedAt: data.fetchedAt, cached: data.cached, nextStart: data.nextStart, query: clean });
      if (!opts.append) {
        setAddMode('ask');
        setChangingLink(false);
        setBrandFilter('');
        setShopFilter('');
        setParams((p) => { const n = new URLSearchParams(p); n.set('q', clean); if (linked) n.set('product', linked.id); else n.delete('product'); return n; }, { replace: true });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [linked, setParams]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (isBarcode(q) && !linked) {
      const p = catalog.find((x) => x.ean === q.replace(/\s/g, ''));
      if (p) linkProduct(p);
    }
    void runSearch(q);
  };

  const onScanned = useCallback((code: string) => {
    setScanOpen(false);
    setQuery(code);
    const p = catalog.find((x) => x.ean === code);
    if (p) linkProduct(p);
    void runSearch(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, runSearch]);

  const closeScanner = useCallback(() => setScanOpen(false), []);

  // ── Evaluación (instantánea al cambiar precio, filtros o ficha) ──
  const effectiveSpec = useMemo(() => {
    const text = specText.trim() || (isBarcode(query) ? '' : query);
    return buildSpec(text, linked?.brand ?? null);
  }, [specText, query, linked]);

  const sale = toNum(salePrice);
  const evaluated = useMemo(
    () => evaluateOffers(offers, effectiveSpec, sale, settings),
    [offers, effectiveSpec, sale, settings],
  );

  const brands = useMemo(() => {
    const c = new Map<string, number>();
    evaluated.forEach((o) => c.set(o.brand, (c.get(o.brand) ?? 0) + 1));
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [evaluated]);

  const shops = useMemo(() => {
    const c = new Map<string, number>();
    evaluated.forEach((o) => c.set(o.shop, (c.get(o.shop) ?? 0) + 1));
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [evaluated]);

  const visible = useMemo(() => {
    const trustOf = (o: EvaluatedOffer): Trust => (o.merchant_id && merchants[o.merchant_id]?.trust) || 'nuevo';
    const list = evaluated.filter((o) => {
      if (matchFilter === 'exactas' && o.match !== 'exacta') return false;
      if (matchFilter === 'probables' && o.match === 'no_confirmada') return false;
      if (brandFilter && o.brand !== brandFilter) return false;
      if (shopFilter && o.shop !== shopFilter) return false;
      if (hideDiscarded && trustOf(o) === 'descartado') return false;
      if (onlyTrusted && trustOf(o) !== 'confiable') return false;
      if (hideSuspicious && o.priceFlag === 'sospechoso') return false;
      return true;
    });
    const trustRank: Record<Trust, number> = { confiable: 0, nuevo: 1, descartado: 2 };
    return list.sort((a, b) => {
      if (sort === 'relevance') return a.position - b.position;
      if (sort === 'trust') return trustRank[trustOf(a)] - trustRank[trustOf(b)] || MATCH_RANK[a.match] - MATCH_RANK[b.match] || (a.costTotal ?? 9e9) - (b.costTotal ?? 9e9);
      const byMatch = MATCH_RANK[a.match] - MATCH_RANK[b.match];
      if (sort === 'cost') return byMatch || (a.costTotal ?? 9e9) - (b.costTotal ?? 9e9);
      return byMatch || (b.margin ?? -9e9) - (a.margin ?? -9e9) || (a.costTotal ?? 9e9) - (b.costTotal ?? 9e9);
    });
  }, [evaluated, merchants, matchFilter, brandFilter, shopFilter, hideDiscarded, onlyTrusted, hideSuspicious, sort]);

  const best = useMemo(() => {
    const trusted = (o: EvaluatedOffer) => !(o.merchant_id && merchants[o.merchant_id]?.trust === 'descartado');
    const pool = evaluated.filter((o) => o.match === 'exacta' && o.costTotal !== null && o.priceFlag !== 'sospechoso' && trusted(o));
    return pool.sort((a, b) => (a.costTotal as number) - (b.costTotal as number))[0] ?? null;
  }, [evaluated, merchants]);

  // ── Agregar a mi configuración de productos ────────────────
  const openAddForm = () => {
    const firstTitle = best?.title ?? evaluated.find((o) => o.match !== 'no_confirmada')?.title ?? evaluated[0]?.title ?? '';
    const typed = specText.trim() || (isBarcode(query) ? '' : query.trim());
    setAddName(typed || firstTitle);
    setAddBrand(effectiveSpec.brand ?? detectBrand(firstTitle) ?? '');
    setAddEan(isBarcode(query) ? query.replace(/\s/g, '') : '');
    setAddMode('form');
  };

  const addToCatalog = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = toNum(salePrice);
    if (!addName.trim()) { notify({ kind: 'error', text: 'Pon el título del producto.' }); return; }
    if (!price || price <= 0) { notify({ kind: 'error', text: 'Pon el precio de venta.' }); return; }
    if (addEan && !/^\d{8,14}$/.test(addEan)) { notify({ kind: 'error', text: 'El código de barras debe tener de 8 a 14 dígitos.' }); return; }
    setAdding(true);
    try {
      const base = slugify(addName) || `producto-${Date.now()}`;
      const { data: taken } = await supabase.from('products').select('slug').like('slug', `${base}%`);
      const used = new Set((taken ?? []).map((r) => r.slug));
      let slug = base;
      for (let i = 2; used.has(slug); i += 1) slug = `${base}-${i}`;

      const { data, error: err } = await supabase.from('products').insert({
        name: addName.trim(),
        slug,
        brand: addBrand.trim() || null,
        price,
        cost_price: best?.costTotal ?? null,
        ean: addEan || null,
        fulfillment: 'bajo_pedido',
        in_stock: true,
        tags: ['bajo-pedido'],
        image_status: 'pending',
      }).select('id,name,slug,brand,price,ean,sku,cost_price,fulfillment,in_stock').single();
      if (err || !data) throw err ?? new Error('Sin respuesta');
      const product = data as CatalogProduct;

      if (best && best.unit_price_mxn !== null) {
        const m = computeMargin(price, best.unit_price_mxn, settings);
        await supabase.from('product_sources').insert({
          product_id: product.id, merchant_id: best.merchant_id, offer_id: best.id, shop: best.shop, offer_title: best.title,
          link: best.link, unit_cost_mxn: best.unit_price_mxn, shipping_mxn: settings.supplierShipping, sale_price_mxn: price,
          margin_mxn: m.margin ?? 0, match_level: best.match, is_primary: true,
        });
      }
      setCatalog((c) => [...c, product]);
      linkProduct(product);
      setAddMode('ask');
      notify({ kind: 'ok', text: `"${product.name}" agregado a tus productos (bajo pedido).` });
    } catch (e2) {
      notify({ kind: 'error', text: `No se pudo agregar: ${(e2 as { message?: string })?.message ?? 'error'}` });
    } finally {
      setAdding(false);
    }
  };

  const counts = useMemo(() => {
    const c: Record<MatchLevel, number> = { exacta: 0, probable: 0, no_confirmada: 0 };
    evaluated.forEach((o) => { c[o.match] += 1; });
    return c;
  }, [evaluated]);

  // ── Confianza de tiendas ───────────────────────────────────
  const setTrust = async (merchantId: string | null, trust: Trust) => {
    if (!merchantId) return;
    const prev = merchants[merchantId];
    setMerchants((m) => ({ ...m, [merchantId]: { ...m[merchantId], trust } }));
    const { error: err } = await supabase.from('sourcing_merchants').update({ trust }).eq('id', merchantId);
    if (err) {
      setMerchants((m) => ({ ...m, [merchantId]: prev }));
      notify({ kind: 'error', text: `No se guardó la tienda: ${err.message}` });
    }
  };

  // ── Abrir búsqueda del historial (sin gastar consultas) ────
  const openHistory = async (row: HistoryRow) => {
    setTab('buscar');
    setLoading(true);
    setError('');
    const { data: list, error: err } = await supabase
      .from('sourcing_offers').select('*').eq('search_id', row.id).order('position');
    if (err) { setError(err.message); setLoading(false); return; }
    const ids = [...new Set((list ?? []).map((o) => o.merchant_id).filter(Boolean))] as string[];
    const { data: ms } = ids.length
      ? await supabase.from('sourcing_merchants').select('*').in('id', ids)
      : { data: [] as SourcingMerchant[] };
    setOffers((list ?? []) as SourcingOffer[]);
    setMerchants(Object.fromEntries((ms ?? []).map((m) => [m.id, m])));
    setMeta({ searchId: row.id, fetchedAt: row.created_at, cached: true, nextStart: null, query: row.query });
    setQuery(row.query);
    const p = row.product_id ? catalog.find((x) => x.id === row.product_id) : null;
    if (p) linkProduct(p);
    setLoading(false);
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="src">
      <header className="src-head">
        <div>
          <h1 className="admin-page-title">Abastecimiento</h1>
          <p className="admin-page-subtitle">Encuentra dónde comprar cada producto en México, compara costo y margen, y súbelo a tu stock.</p>
        </div>
        <button type="button" className="src-btn src-btn--ghost" onClick={() => setSettingsOpen(true)} aria-haspopup="dialog">
          ⚙ Márgenes
        </button>
      </header>

      <nav className="src-tabs" role="tablist" aria-label="Secciones de abastecimiento">
        {(['buscar', 'tiendas', 'historial'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`src-tab ${tab === t ? 'is-active' : ''}`} onClick={() => setTab(t)}>
            {t === 'buscar' ? '🔎 Buscar' : t === 'tiendas' ? '🏪 Tiendas' : '🕘 Historial'}
          </button>
        ))}
      </nav>

      {tab === 'buscar' && (
        <>
          {/* ── Barra de búsqueda ─────────────────────────── */}
          <form className="src-card src-search" onSubmit={onSubmit}>
            {/* Paso 1 — Producto buscado */}
            <div className="src-step">
              <span className="src-step__n" aria-hidden="true">1</span>
              <div className="src-step__body">
              <label className="src-step__label" htmlFor="src-q">Buscar producto, marca o código de barras</label>
              <div className="src-input-group">
                <input
                  id="src-q"
                  ref={queryRef}
                  className="src-input src-input--lg"
                  placeholder="Ej: ISDIN Fusion Water SPF 50 50 ml"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoComplete="off"
                  enterKeyHint="search"
                />
                <button type="button" className="src-btn src-btn--ghost" onClick={() => setScanOpen(true)} aria-label="Escanear código de barras con la cámara">
                  ▥ Escanear
                </button>
                <button type="submit" className="src-btn src-btn--lime" disabled={loading || query.trim().length < 2}>
                  {loading ? <><span className="src-spinner src-spinner--dark" /> Buscando</> : 'Buscar ofertas'}
                </button>
              </div>
              <span className="src-step__hint">Escribe, pega el código o escanéalo. Te muestro las ofertas de tiendas en México y reviso si ya lo tienes en tu catálogo.</span>
              </div>
            </div>

            {/* Paso 2 — Mi precio de venta */}
            <div className="src-step">
              <span className="src-step__n" aria-hidden="true">2</span>
              <div className="src-step__body">
                <label className="src-step__label" htmlFor="src-sale">Mi precio de venta</label>
                <div className="src-price-row">
                  <div className="src-money">
                    <span>$</span>
                    <input id="src-sale" className="src-input" inputMode="decimal" placeholder="0.00" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
                  </div>
                  <span className="src-step__hint">Opcional. Con él calculo cuánto ganas en cada oferta.</span>
                </div>
              </div>
            </div>

            <div className="src-spec-row">
              <SpecChips spec={effectiveSpec} />
              <button type="button" className="src-link-btn src-link-btn--flat" onClick={() => setSpecOpen((v) => !v)} aria-expanded={specOpen}>
                {specOpen ? 'Ocultar' : 'Ajustar comparación'}
              </button>
            </div>
            {specOpen && (
              <div className="src-field">
                <label htmlFor="src-spec">Producto exacto contra el que comparo las ofertas</label>
                <input
                  id="src-spec"
                  className="src-input"
                  placeholder="Marca, línea, tamaño, SPF y variante. Ej: ISDIN Fusion Water SPF 50 50 ml"
                  value={specText}
                  onChange={(e) => setSpecText(e.target.value)}
                />
              </div>
            )}
          </form>

          {error && <div className="src-alert src-alert--error" role="alert">{error}</div>}

          {/* ── Resumen ───────────────────────────────────── */}
          {meta && !loading && (
            <section className="src-summary" aria-live="polite">
              <div className="src-stat">
                <span className="src-stat__k">Ofertas</span>
                <span className="src-stat__v">{evaluated.length}</span>
                <span className="src-stat__s">{shops.length} tiendas</span>
              </div>
              <div className="src-stat">
                <span className="src-stat__k">Coincidencia</span>
                <span className="src-stat__v">{counts.exacta}<small> exactas</small></span>
                <span className="src-stat__s">{counts.probable} probables · {counts.no_confirmada} otras</span>
              </div>
              <div className={`src-stat ${best ? 'src-stat--hl' : ''}`}>
                <span className="src-stat__k">Mejor exacta</span>
                <span className="src-stat__v">{best ? money(best.costTotal) : '—'}</span>
                <span className="src-stat__s">{best ? best.shop : 'Sin coincidencia exacta'}</span>
              </div>
              <div className={`src-stat ${best?.margin !== null && best?.margin !== undefined ? (best.margin >= 0 ? 'src-stat--ok' : 'src-stat--bad') : ''}`}>
                <span className="src-stat__k">Tu margen</span>
                <span className="src-stat__v">{best && best.margin !== null ? money(best.margin) : '—'}</span>
                <span className="src-stat__s">{best && best.marginPct !== null ? `${best.marginPct}% de la venta` : sale ? '' : 'Pon tu precio de venta'}</span>
              </div>
              <div className="src-summary__meta">
                {meta.cached ? 'Guardado ' : 'Consultado '}{timeAgo(meta.fetchedAt)}
                <button type="button" className="src-link-btn" onClick={() => void runSearch(meta.query, { refresh: true })} disabled={loading}>
                  Actualizar precios
                </button>
              </div>
            </section>
          )}

          {/* ── Mi catálogo: ¿ya lo tengo? / ¿lo agrego? ───── */}
          {meta && !loading && offers.length > 0 && (
            <section className="src-cat" aria-label="Mi configuración de productos">
              {linked && !changingLink ? (
                <>
                  <header className="src-cat__head">
                    <span className="src-linked__check" aria-hidden="true">✓</span>
                    <div>
                      <strong>Ya lo tienes en tu catálogo</strong>
                      <span>
                        {linked.name}{linked.brand ? ` · ${linked.brand}` : ''} · Precio actual {money(linked.price)}
                        {linked.cost_price ? ` · Costo ${money(linked.cost_price)}` : ''}
                        {linked.ean ? ` · EAN ${linked.ean}` : ' · Sin código de barras'}
                      </span>
                    </div>
                  </header>
                  <div className="src-cat__actions">
                    <div className="src-field">
                      <label htmlFor="cat-price">Precio de venta</label>
                      <div className="src-money"><span>$</span><input id="cat-price" className="src-input" inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} /></div>
                    </div>
                    <button type="button" className="src-btn src-btn--lime" disabled={savingField === 'price' || !sale || sale === Number(linked.price)} onClick={() => void saveLinkedField('price')}>
                      {savingField === 'price' ? 'Guardando…' : sale && sale !== Number(linked.price) ? 'Guardar precio en catálogo' : 'Precio sin cambios'}
                    </button>
                    {isBarcode(query) && linked.ean !== query.replace(/\s/g, '') && (
                      <button type="button" className="src-btn src-btn--ghost" disabled={savingField === 'ean'} onClick={() => void saveLinkedField('ean')}>
                        {savingField === 'ean' ? 'Guardando…' : 'Guardar este código de barras'}
                      </button>
                    )}
                    <button type="button" className="src-btn src-btn--ghost" onClick={() => { unlinkProduct(); setChangingLink(true); }}>No es este</button>
                  </div>
                  <p className="src-step__hint">Para guardar también el proveedor y el costo, usa <b>+ Mi stock</b> en la oferta que elijas.</p>
                </>
              ) : catalogMatches.length > 0 && addMode !== 'form' ? (
                <>
                  <header className="src-cat__head">
                    <span className="src-cat__q" aria-hidden="true">?</span>
                    <div>
                      <strong>Encontré {catalogMatches.length === 1 ? 'un producto parecido' : `${catalogMatches.length} productos parecidos`} en tu catálogo</strong>
                      <span>¿Es alguno de estos? Así actualizo su precio en lugar de duplicarlo.</span>
                    </div>
                  </header>
                  <ul className="src-matches">
                    {catalogMatches.map((p) => (
                      <li key={p.id}>
                        <div className="src-matches__txt">
                          <strong>{p.name}</strong>
                          <span>{p.brand ? `${p.brand} · ` : ''}{money(p.price)}{p.ean ? ` · EAN ${p.ean}` : ''}</span>
                        </div>
                        <button type="button" className="src-btn src-btn--sm src-btn--lime" onClick={() => linkProduct(p)}>Es este</button>
                      </li>
                    ))}
                  </ul>
                  <div className="src-cat__actions">
                    <button type="button" className="src-btn src-btn--ghost" onClick={openAddForm}>Ninguno, agregar como nuevo</button>
                  </div>
                </>
              ) : addMode === 'form' ? (
                <form onSubmit={addToCatalog} className="src-cat__form">
                  <header className="src-cat__head">
                    <span className="src-cat__q" aria-hidden="true">+</span>
                    <div>
                      <strong>Agregar a tu configuración de productos</strong>
                      <span>{best ? `Proveedor: ${best.shop} · costo ${money(best.costTotal)} (mejor oferta exacta)` : 'Sin oferta exacta todavía: se agrega sin proveedor; elígelo después con + Mi stock.'}</span>
                    </div>
                  </header>
                  <div className="src-grid src-grid--4">
                    <div className="src-field src-field--span2">
                      <label htmlFor="add-name">Título</label>
                      <input id="add-name" className="src-input" value={addName} onChange={(e) => setAddName(e.target.value)} required />
                    </div>
                    <div className="src-field">
                      <label htmlFor="add-price">Precio de venta</label>
                      <div className="src-money"><span>$</span><input id="add-price" className="src-input" inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} required /></div>
                    </div>
                    <div className="src-field">
                      <label htmlFor="add-brand">Marca</label>
                      <input id="add-brand" className="src-input" value={addBrand} onChange={(e) => setAddBrand(e.target.value)} />
                    </div>
                    <div className="src-field">
                      <label htmlFor="add-ean">Código de barras</label>
                      <input id="add-ean" className="src-input" inputMode="numeric" placeholder="Opcional" value={addEan} onChange={(e) => setAddEan(e.target.value.replace(/\D/g, ''))} />
                    </div>
                  </div>
                  <div className="src-cat__actions">
                    <button type="submit" className="src-btn src-btn--lime" disabled={adding}>
                      {adding ? <><span className="src-spinner src-spinner--dark" /> Agregando</> : 'Agregar a mis productos'}
                    </button>
                    <button type="button" className="src-btn src-btn--ghost" disabled={adding} onClick={() => setAddMode('ask')}>Cancelar</button>
                    {best && best.margin !== null && sale ? <span className={`src-step__hint ${best.margin < 0 ? 'is-neg' : ''}`}>Margen con este precio: <b>{money(computeMargin(sale, best.unit_price_mxn, settings).margin)}</b></span> : null}
                  </div>
                </form>
              ) : addMode === 'no' ? (
                <div className="src-cat__row">
                  <span className="src-step__hint">No se agregó a tus productos.</span>
                  <button type="button" className="src-link-btn src-link-btn--flat" onClick={() => setAddMode('ask')}>Cambiar de opinión</button>
                </div>
              ) : (
                <div className="src-cat__row">
                  <header className="src-cat__head">
                    <span className="src-cat__q" aria-hidden="true">?</span>
                    <div>
                      <strong>¿Deseas agregar este producto a tu configuración de productos?</strong>
                      <span>Revisé tu catálogo y no lo tienes.</span>
                    </div>
                  </header>
                  <div className="src-cat__actions">
                    <button type="button" className="src-btn src-btn--lime" onClick={openAddForm}>Sí, agregar</button>
                    <button type="button" className="src-btn src-btn--ghost" onClick={() => setAddMode('no')}>No</button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ── Filtros ───────────────────────────────────── */}
          {offers.length > 0 && !loading && (
            <section className="src-filters" aria-label="Filtros">
              <div className="src-seg" role="radiogroup" aria-label="Coincidencia">
                {([['exactas', `Exactas ${counts.exacta}`], ['probables', `+ Probables ${counts.exacta + counts.probable}`], ['todas', `Todas ${evaluated.length}`]] as [MatchFilter, string][]).map(([k, l]) => (
                  <button key={k} type="button" role="radio" aria-checked={matchFilter === k} className={matchFilter === k ? 'is-on' : ''} onClick={() => setMatchFilter(k)}>{l}</button>
                ))}
              </div>

              <select className="src-select" value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} aria-label="Marca">
                <option value="">Todas las marcas</option>
                {brands.map(([b, n]) => <option key={b} value={b}>{b} ({n})</option>)}
              </select>

              <select className="src-select" value={shopFilter} onChange={(e) => setShopFilter(e.target.value)} aria-label="Tienda">
                <option value="">Todas las tiendas</option>
                {shops.map(([s, n]) => <option key={s} value={s}>{s} ({n})</option>)}
              </select>

              <select className="src-select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Ordenar">
                <option value="margin">Mayor margen</option>
                <option value="cost">Menor costo</option>
                <option value="trust">Tiendas confiables primero</option>
                <option value="relevance">Orden de Google</option>
              </select>

              <label className="src-check"><input type="checkbox" checked={hideDiscarded} onChange={(e) => setHideDiscarded(e.target.checked)} /> Ocultar descartadas</label>
              <label className="src-check"><input type="checkbox" checked={onlyTrusted} onChange={(e) => setOnlyTrusted(e.target.checked)} /> Solo confiables</label>
              <label className="src-check"><input type="checkbox" checked={hideSuspicious} onChange={(e) => setHideSuspicious(e.target.checked)} /> Ocultar precios sospechosos</label>
            </section>
          )}

          {/* ── Resultados ────────────────────────────────── */}
          {loading && <ResultsSkeleton />}

          {!loading && meta && visible.length === 0 && (
            <div className="src-empty">
              <strong>{offers.length ? 'Ningún resultado con estos filtros.' : 'No se encontró una fuente verificable para este producto.'}</strong>
              <span>{offers.length ? 'Prueba con "Todas" o quita filtros.' : 'Prueba con el nombre completo o sin el tamaño.'}</span>
            </div>
          )}

          {!loading && !meta && (
            <div className="src-empty">
              <strong>Busca un producto para ver dónde conseguirlo.</strong>
              <span>Escribe nombre o marca, pega el código de barras o escanéalo con la cámara.</span>
            </div>
          )}

          {!loading && visible.length > 0 && (
            <div className="src-table" role="table" aria-label="Ofertas encontradas">
              <div className="src-row src-row--head" role="row">
                <span role="columnheader">Producto</span>
                <span role="columnheader">Tienda</span>
                <span role="columnheader" className="num">Precio</span>
                <span role="columnheader" className="num">Costo</span>
                <span role="columnheader" className="num">Margen</span>
                <span role="columnheader">Acciones</span>
              </div>
              {visible.map((o) => (
                <React.Fragment key={o.id}>
                  <OfferRow
                    o={o}
                    merchant={o.merchant_id ? merchants[o.merchant_id] : undefined}
                    onTrust={setTrust}
                    onStock={() => setStockOffer(o)}
                  />
                </React.Fragment>
              ))}
            </div>
          )}

          {!loading && meta?.nextStart !== null && meta?.nextStart !== undefined && visible.length > 0 && (
            <div className="src-more">
              <button type="button" className="src-btn src-btn--ghost" disabled={loadingMore} onClick={() => void runSearch(meta.query, { start: meta.nextStart as number, append: true })}>
                {loadingMore ? <><span className="src-spinner" /> Cargando</> : 'Ver más tiendas'}
              </button>
            </div>
          )}
        </>
      )}

      {tab === 'tiendas' && <MerchantsTab notify={notify} />}
      {tab === 'historial' && <HistoryTab onOpen={openHistory} onRepeat={(q) => { setTab('buscar'); setQuery(q); void runSearch(q, { refresh: true }); }} />}

      {scanOpen && <BarcodeScanner onDetected={onScanned} onClose={closeScanner} />}

      {settingsOpen && (
        <SettingsModal
          value={settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={(s) => { setSettings(s); setSettingsOpen(false); notify({ kind: 'ok', text: 'Márgenes guardados.' }); }}
        />
      )}

      {stockOffer && (
        <StockModal
          offer={stockOffer}
          linked={linked}
          spec={specText || query}
          salePrice={sale}
          barcode={isBarcode(query) ? query.replace(/\s/g, '') : linked?.ean ?? ''}
          collections={collections}
          settings={settings}
          onClose={() => setStockOffer(null)}
          onSaved={(product, created) => {
            setStockOffer(null);
            setCatalog((c) => (created ? [...c, product] : c.map((x) => (x.id === product.id ? product : x))));
            setLinked(product);
            notify({ kind: 'ok', text: created ? `"${product.name}" agregado a tu stock bajo pedido.` : `"${product.name}" actualizado con el nuevo proveedor.` });
          }}
        />
      )}

      {toast && (
        <div className={`src-toast src-toast--${toast.kind}`} role="status">
          {toast.text}
          {toast.kind === 'ok' && <Link to="/admin/productos" className="src-toast__link">Ver catálogo</Link>}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Subcomponentes
// ═══════════════════════════════════════════════════════════════

function SpecChips({ spec }: { spec: ReturnType<typeof buildSpec> }) {
  const chips: string[] = [];
  if (spec.brand) chips.push(spec.brand);
  chips.push(...spec.core);
  if (spec.sizeValue) chips.push(`${spec.sizeValue} ${spec.sizeUnit}`);
  if (spec.spf) chips.push(`SPF ${spec.spf}`);
  chips.push(...spec.forms, ...spec.strong, ...spec.soft);
  if (!chips.length) return null;
  return (
    <div className="src-spec" aria-label="Así entiendo tu producto">
      <span className="src-spec__k">Comparo contra:</span>
      {chips.map((c, i) => <span key={`${c}-${i}`} className="src-chip">{c}</span>)}
    </div>
  );
}

function OfferRow({ o, merchant, onTrust, onStock }: {
  o: EvaluatedOffer;
  merchant?: SourcingMerchant;
  onTrust: (id: string | null, t: Trust) => void;
  onStock: () => void;
}) {
  const trust: Trust = merchant?.trust ?? 'nuevo';
  const canStock = o.match !== 'no_confirmada' && o.unit_price_mxn !== null;
  return (
    <div className={`src-row src-row--${o.match} ${trust === 'descartado' ? 'is-discarded' : ''}`} role="row">
      <div className="src-cell src-prod" role="cell">
        {o.thumbnail ? <img src={o.thumbnail} alt="" loading="lazy" width={44} height={44} /> : <span className="src-thumb-ph" aria-hidden="true" />}
        <div className="src-prod__txt">
          <span className="src-prod__title" title={o.title}>{o.title}</span>
          <span className="src-prod__meta">
            <span className={`src-badge src-badge--${o.match}`}>{MATCH_LABEL[o.match]}</span>
            {o.priceFlag === 'sospechoso' && <span className="src-badge src-badge--warn">Precio sospechoso</span>}
            {o.priceFlag === 'caro' && <span className="src-badge src-badge--muted">Muy caro</span>}
            <span className="src-reasons">{o.reasons.join(' · ')}</span>
          </span>
        </div>
      </div>

      <div className="src-cell src-shop" role="cell">
        <span className={`src-dot src-dot--${trust}`} aria-hidden="true" />
        <span className="src-shop__name">{o.shop}</span>
        <span className="src-shop__trust">{TRUST_LABEL[trust]}{o.rating ? ` · ★ ${o.rating}` : ''}</span>
      </div>

      <div className="src-cell num" role="cell">
        <span className="src-price">{money(o.price_mxn)}</span>
        {o.old_price_mxn && o.old_price_mxn > (o.price_mxn ?? 0) && <s className="src-old">{money(o.old_price_mxn)}</s>}
        {o.pack_qty > 1 && <span className="src-sub">{money(o.unit_price_mxn)} c/u · {o.pack_qty} pzs</span>}
        {o.alt_price_text && <span className="src-sub" title="Otro precio que muestra Google; confírmalo en la tienda">⚠ {o.alt_price_text}</span>}
      </div>

      <div className="src-cell num" role="cell">
        <span className="src-price">{money(o.costTotal)}</span>
        <span className="src-sub">+ comisión {money(o.fee)}</span>
      </div>

      <div className="src-cell num" role="cell">
        <span className={`src-margin ${o.margin === null ? '' : o.margin >= 0 ? 'is-pos' : 'is-neg'}`}>{money(o.margin)}</span>
        {o.marginPct !== null && <span className="src-sub">{o.marginPct}%</span>}
      </div>

      <div className="src-cell src-actions" role="cell">
        {o.link
          ? <a className="src-btn src-btn--sm src-btn--ghost" href={o.link} target="_blank" rel="noopener noreferrer">Ver ↗</a>
          : <span className="src-btn src-btn--sm src-btn--ghost is-disabled" aria-disabled="true">Sin link</span>}
        <button type="button" className={`src-icon-btn ${trust === 'confiable' ? 'is-on' : ''}`} disabled={!o.merchant_id}
          onClick={() => onTrust(o.merchant_id, trust === 'confiable' ? 'nuevo' : 'confiable')}
          aria-pressed={trust === 'confiable'} title={trust === 'confiable' ? 'Quitar de confiables' : 'Marcar tienda como confiable'}>★</button>
        <button type="button" className={`src-icon-btn src-icon-btn--bad ${trust === 'descartado' ? 'is-on' : ''}`} disabled={!o.merchant_id}
          onClick={() => onTrust(o.merchant_id, trust === 'descartado' ? 'nuevo' : 'descartado')}
          aria-pressed={trust === 'descartado'} title={trust === 'descartado' ? 'Volver a mostrar tienda' : 'Descartar tienda'}>⊘</button>
        <button type="button" className="src-btn src-btn--sm src-btn--lime" disabled={!canStock} onClick={onStock}
          title={canStock ? 'Usar este proveedor y subir a mi stock' : 'Solo coincidencias exactas o probables'}>
          + Mi stock
        </button>
      </div>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="src-table" aria-busy="true" aria-label="Buscando en tiendas">
      {Array.from({ length: 6 }).map((_, i) => <div key={i} className="src-row src-skel" />)}
    </div>
  );
}

// ─── Modal: subir a mi stock ─────────────────────────────────
function StockModal({ offer, linked, spec, salePrice, barcode, collections, settings, onClose, onSaved }: {
  offer: EvaluatedOffer;
  linked: CatalogProduct | null;
  spec: string;
  salePrice: number | null;
  barcode: string;
  collections: CollectionLite[];
  settings: MarginSettings;
  onClose: () => void;
  onSaved: (p: CatalogProduct, created: boolean) => void;
}) {
  const [mode, setMode] = useState<'update' | 'create'>(linked ? 'update' : 'create');
  const [name, setName] = useState(linked?.name ?? (spec && !isBarcode(spec) ? spec : offer.title));
  const [brand, setBrand] = useState(linked?.brand ?? detectBrand(offer.title) ?? '');
  const [ean, setEan] = useState(linked?.ean ?? barcode);
  const [price, setPrice] = useState(String(salePrice ?? linked?.price ?? ''));
  const [compare, setCompare] = useState('');
  const [collection, setCollection] = useState('');
  const [unitCost, setUnitCost] = useState(String(offer.unit_price_mxn ?? ''));
  const [shipping, setShipping] = useState(String(settings.supplierShipping));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const p = toNum(price);
  const c = toNum(unitCost);
  const s = toNum(shipping) ?? 0;
  const m = computeMargin(p, c, settings, s);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!name.trim()) return setErr('El nombre es obligatorio.');
    if (!p || p <= 0) return setErr('Pon tu precio de venta.');
    if (c === null || c <= 0) return setErr('Pon el costo unitario.');
    if (ean && !/^\d{8,14}$/.test(ean.trim())) return setErr('El código de barras debe tener de 8 a 14 dígitos.');
    setSaving(true);

    try {
      const unitCostTotal = round2(c + s);
      const common = {
        price: p,
        cost_price: unitCostTotal,
        ean: ean.trim() || null,
        fulfillment: 'bajo_pedido',
        in_stock: true,
      };
      let product: CatalogProduct;
      let created = false;

      if (mode === 'update' && linked) {
        const { data, error } = await supabase.from('products').update(common).eq('id', linked.id)
          .select('id,name,slug,brand,price,ean,sku,cost_price,fulfillment,in_stock').single();
        if (error) throw error;
        product = data as CatalogProduct;
      } else {
        // Slug único
        const base = slugify(name) || `producto-${Date.now()}`;
        const { data: taken } = await supabase.from('products').select('slug').like('slug', `${base}%`);
        const used = new Set((taken ?? []).map((r) => r.slug));
        let slug = base;
        for (let i = 2; used.has(slug); i += 1) slug = `${base}-${i}`;

        const cmp = toNum(compare);
        const { data, error } = await supabase.from('products').insert({
          ...common,
          name: name.trim(),
          slug,
          brand: brand.trim() || null,
          compare_price: cmp && cmp > p ? cmp : null,
          category: collection || null,
          tags: ['bajo-pedido'],
          image_status: 'pending',
        }).select('id,name,slug,brand,price,ean,sku,cost_price,fulfillment,in_stock').single();
        if (error) throw error;
        product = data as CatalogProduct;
        created = true;
      }

      await supabase.from('product_sources').update({ is_primary: false }).eq('product_id', product.id);
      const { error: srcErr } = await supabase.from('product_sources').insert({
        product_id: product.id,
        merchant_id: offer.merchant_id,
        offer_id: offer.id,
        shop: offer.shop,
        offer_title: offer.title,
        link: offer.link,
        unit_cost_mxn: c,
        shipping_mxn: s,
        sale_price_mxn: p,
        margin_mxn: m.margin ?? 0,
        match_level: offer.match,
        is_primary: true,
      });
      if (srcErr) throw srcErr;

      onSaved(product, created);
    } catch (e2) {
      setErr((e2 as { message?: string }).message || 'No se pudo guardar.');
      setSaving(false);
    }
  };

  return (
    <div className="src-modal" role="dialog" aria-modal="true" aria-labelledby="stock-title" onClick={() => !saving && onClose()}>
      <form className="src-modal__panel src-stock" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <header className="src-modal__head">
          <h2 id="stock-title">Subir a mi stock</h2>
          <button type="button" className="src-icon-btn" onClick={onClose} disabled={saving} aria-label="Cerrar">✕</button>
        </header>

        <div className="src-stock__source">
          <span className={`src-badge src-badge--${offer.match}`}>{MATCH_LABEL[offer.match]}</span>
          <div>
            <strong>{offer.shop}</strong>
            <span>{offer.title}</span>
          </div>
        </div>

        {linked && (
          <div className="src-seg src-seg--full" role="radiogroup" aria-label="Qué hacer">
            <button type="button" role="radio" aria-checked={mode === 'update'} className={mode === 'update' ? 'is-on' : ''} onClick={() => setMode('update')}>Actualizar “{linked.name}”</button>
            <button type="button" role="radio" aria-checked={mode === 'create'} className={mode === 'create' ? 'is-on' : ''} onClick={() => setMode('create')}>Crear producto nuevo</button>
          </div>
        )}

        <div className="src-grid">
          {mode === 'create' && (
            <>
              <div className="src-field src-field--span2">
                <label htmlFor="st-name">Nombre en tu tienda</label>
                <input id="st-name" className="src-input" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="src-field">
                <label htmlFor="st-brand">Marca</label>
                <input id="st-brand" className="src-input" value={brand} onChange={(e) => setBrand(e.target.value)} />
              </div>
              <div className="src-field">
                <label htmlFor="st-col">Colección</label>
                <select id="st-col" className="src-select src-select--block" value={collection} onChange={(e) => setCollection(e.target.value)}>
                  <option value="">Sin colección</option>
                  {collections.map((col) => <option key={col.id} value={col.id}>{col.name}</option>)}
                </select>
              </div>
            </>
          )}
          <div className="src-field">
            <label htmlFor="st-ean">Código de barras (EAN)</label>
            <input id="st-ean" className="src-input" inputMode="numeric" value={ean} onChange={(e) => setEan(e.target.value.replace(/\D/g, ''))} placeholder="Opcional" />
          </div>
          <div className="src-field">
            <label htmlFor="st-price">Precio de venta</label>
            <div className="src-money"><span>$</span><input id="st-price" className="src-input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required /></div>
          </div>
          {mode === 'create' && (
            <div className="src-field">
              <label htmlFor="st-cmp">Precio antes (tachado)</label>
              <div className="src-money"><span>$</span><input id="st-cmp" className="src-input" inputMode="decimal" value={compare} onChange={(e) => setCompare(e.target.value)} placeholder="Opcional" /></div>
            </div>
          )}
          <div className="src-field">
            <label htmlFor="st-cost">Costo unitario proveedor</label>
            <div className="src-money"><span>$</span><input id="st-cost" className="src-input" inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} required /></div>
          </div>
          <div className="src-field">
            <label htmlFor="st-ship">Envío del proveedor</label>
            <div className="src-money"><span>$</span><input id="st-ship" className="src-input" inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value)} /></div>
          </div>
        </div>

        <dl className="src-calc">
          <div><dt>Costo total</dt><dd>{money(m.costTotal)}</dd></div>
          <div><dt>Comisión Clip</dt><dd>{money(m.fee)}</dd></div>
          <div><dt>Envío al cliente</dt><dd>{money(settings.customerShipping)}</dd></div>
          <div className={m.margin !== null && m.margin < 0 ? 'is-neg' : 'is-pos'}><dt>Margen</dt><dd>{money(m.margin)}{m.marginPct !== null ? ` · ${m.marginPct}%` : ''}</dd></div>
        </dl>

        {m.margin !== null && m.margin < 0 && <div className="src-alert src-alert--warn">Con este precio pierdes dinero en cada venta.</div>}
        {mode === 'create' && <p className="src-note">Se crea como <b>bajo pedido</b> y queda en la fila de “Imágenes de productos” para que le subas foto.</p>}
        {err && <div className="src-alert src-alert--error" role="alert">{err}</div>}

        <footer className="src-modal__foot">
          <button type="button" className="src-btn src-btn--ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="src-btn src-btn--lime" disabled={saving}>
            {saving ? <><span className="src-spinner src-spinner--dark" /> Guardando</> : mode === 'update' ? 'Actualizar producto' : 'Crear en mi stock'}
          </button>
        </footer>
      </form>
    </div>
  );
}

// ─── Modal: márgenes ─────────────────────────────────────────
function SettingsModal({ value, onClose, onSaved }: { value: MarginSettings; onClose: () => void; onSaved: (s: MarginSettings) => void }) {
  const [v, setV] = useState({
    clipFeePct: String(value.clipFeePct),
    clipFeeFixed: String(value.clipFeeFixed),
    ivaOnFee: value.ivaOnFee,
    supplierShipping: String(value.supplierShipping),
    customerShipping: String(value.customerShipping),
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: MarginSettings = {
      clipFeePct: toNum(v.clipFeePct) ?? 0,
      clipFeeFixed: toNum(v.clipFeeFixed) ?? 0,
      ivaOnFee: v.ivaOnFee,
      supplierShipping: toNum(v.supplierShipping) ?? 0,
      customerShipping: toNum(v.customerShipping) ?? 0,
    };
    if (next.clipFeePct > 20) return setErr('La comisión parece muy alta. Revisa el porcentaje.');
    setSaving(true);
    const rows = (Object.keys(SETTINGS_KEYS) as Array<keyof MarginSettings>).map((k) => ({ key: SETTINGS_KEYS[k], value: String(next[k]) }));
    const { error } = await supabase.from('store_config').upsert(rows, { onConflict: 'key' });
    setSaving(false);
    if (error) return setErr(error.message);
    onSaved(next);
  };

  return (
    <div className="src-modal" role="dialog" aria-modal="true" aria-labelledby="set-title" onClick={onClose}>
      <form className="src-modal__panel" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <header className="src-modal__head">
          <h2 id="set-title">Cálculo de margen</h2>
          <button type="button" className="src-icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </header>
        <div className="src-grid">
          <div className="src-field">
            <label htmlFor="cf-pct">Comisión Clip (%)</label>
            <input id="cf-pct" className="src-input" inputMode="decimal" value={v.clipFeePct} onChange={(e) => setV({ ...v, clipFeePct: e.target.value })} />
          </div>
          <div className="src-field">
            <label htmlFor="cf-fix">Comisión fija por cobro</label>
            <div className="src-money"><span>$</span><input id="cf-fix" className="src-input" inputMode="decimal" value={v.clipFeeFixed} onChange={(e) => setV({ ...v, clipFeeFixed: e.target.value })} /></div>
          </div>
          <label className="src-check src-field--span2"><input type="checkbox" checked={v.ivaOnFee} onChange={(e) => setV({ ...v, ivaOnFee: e.target.checked })} /> Cobrar IVA (16%) sobre la comisión</label>
          <div className="src-field">
            <label htmlFor="cf-sup">Envío del proveedor (estimado)</label>
            <div className="src-money"><span>$</span><input id="cf-sup" className="src-input" inputMode="decimal" value={v.supplierShipping} onChange={(e) => setV({ ...v, supplierShipping: e.target.value })} /></div>
          </div>
          <div className="src-field">
            <label htmlFor="cf-cus">Envío al cliente que absorbes</label>
            <div className="src-money"><span>$</span><input id="cf-cus" className="src-input" inputMode="decimal" value={v.customerShipping} onChange={(e) => setV({ ...v, customerShipping: e.target.value })} /></div>
          </div>
        </div>
        <p className="src-note">Verifica tu tasa real en tu cuenta de Clip; cambia según tu plan y tipo de tarjeta.</p>
        {err && <div className="src-alert src-alert--error" role="alert">{err}</div>}
        <footer className="src-modal__foot">
          <button type="button" className="src-btn src-btn--ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="src-btn src-btn--lime" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </footer>
      </form>
    </div>
  );
}

// ─── Pestaña: directorio de tiendas ──────────────────────────
function MerchantsTab({ notify }: { notify: (t: Toast) => void }) {
  const [rows, setRows] = useState<SourcingMerchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'todas' | Trust>('todas');
  const [text, setText] = useState('');
  const [dirty, setDirty] = useState<Record<string, Partial<SourcingMerchant>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error: err } = await supabase.from('sourcing_merchants').select('*').order('times_seen', { ascending: false }).limit(1000);
      if (err) setError(err.message); else setRows((data ?? []) as SourcingMerchant[]);
      setLoading(false);
    })();
  }, []);

  const shown = rows.filter((r) => (filter === 'todas' || r.trust === filter) && r.name.toLowerCase().includes(text.toLowerCase()));
  const edit = (id: string, patch: Partial<SourcingMerchant>) => setDirty((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const save = async (r: SourcingMerchant) => {
    const patch = dirty[r.id];
    if (!patch) return;
    if (patch.website && !/^https?:\/\/[^\s]+\.[^\s]+/.test(patch.website)) {
      notify({ kind: 'error', text: 'El sitio debe empezar con https://' });
      return;
    }
    setSavingId(r.id);
    const { error: err } = await supabase.from('sourcing_merchants').update(patch).eq('id', r.id);
    setSavingId(null);
    if (err) { notify({ kind: 'error', text: err.message }); return; }
    setRows((list) => list.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
    setDirty((d) => { const n = { ...d }; delete n[r.id]; return n; });
  };

  const counts = { todas: rows.length, confiable: 0, nuevo: 0, descartado: 0 } as Record<'todas' | Trust, number>;
  rows.forEach((r) => { counts[r.trust] += 1; });

  if (loading) return <ResultsSkeleton />;
  if (error) return <div className="src-alert src-alert--error">{error}</div>;
  if (!rows.length) return <div className="src-empty"><strong>Aún no hay tiendas.</strong><span>Cada búsqueda agrega aquí las tiendas que encuentra.</span></div>;

  return (
    <section>
      <div className="src-filters">
        <div className="src-seg" role="radiogroup" aria-label="Confianza">
          {(['todas', 'confiable', 'nuevo', 'descartado'] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={filter === k} className={filter === k ? 'is-on' : ''} onClick={() => setFilter(k)}>
              {k === 'todas' ? 'Todas' : TRUST_LABEL[k]} {counts[k]}
            </button>
          ))}
        </div>
        <input className="src-input src-input--sm" placeholder="Buscar tienda" value={text} onChange={(e) => setText(e.target.value)} aria-label="Buscar tienda" />
      </div>

      <div className="src-table src-table--merchants" role="table" aria-label="Directorio de tiendas">
        <div className="src-row src-row--head" role="row">
          <span role="columnheader">Tienda</span>
          <span role="columnheader">Confianza</span>
          <span role="columnheader">Sitio web</span>
          <span role="columnheader">Notas</span>
          <span role="columnheader">Factura</span>
          <span role="columnheader" />
        </div>
        {shown.map((r) => {
          const d = dirty[r.id] ?? {};
          const val = { ...r, ...d };
          return (
            <div key={r.id} className="src-row" role="row">
              <div className="src-cell src-shop" role="cell">
                <span className={`src-dot src-dot--${val.trust}`} aria-hidden="true" />
                <span className="src-shop__name">{r.name}</span>
                <span className="src-shop__trust">Vista {r.times_seen}× · {r.last_seen_at ? timeAgo(r.last_seen_at) : ''}{r.last_price ? ` · último ${money(r.last_price)}` : ''}</span>
              </div>
              <div className="src-cell" role="cell">
                <select className="src-select src-select--block" value={val.trust} onChange={(e) => edit(r.id, { trust: e.target.value as Trust })} aria-label={`Confianza de ${r.name}`}>
                  <option value="nuevo">Nueva</option>
                  <option value="confiable">Confiable</option>
                  <option value="descartado">Descartada</option>
                </select>
              </div>
              <div className="src-cell" role="cell">
                <input className="src-input src-input--sm" placeholder="https://" value={val.website ?? ''} onChange={(e) => edit(r.id, { website: e.target.value || null })} aria-label={`Sitio de ${r.name}`} />
              </div>
              <div className="src-cell" role="cell">
                <input className="src-input src-input--sm" placeholder="Ej: envío 2 días, pide factura" value={val.notes ?? ''} onChange={(e) => edit(r.id, { notes: e.target.value || null })} aria-label={`Notas de ${r.name}`} />
              </div>
              <div className="src-cell" role="cell">
                <label className="src-check"><input type="checkbox" checked={!!val.gives_invoice} onChange={(e) => edit(r.id, { gives_invoice: e.target.checked })} /> Sí</label>
              </div>
              <div className="src-cell src-actions" role="cell">
                {r.website && <a className="src-btn src-btn--sm src-btn--ghost" href={r.website} target="_blank" rel="noopener noreferrer">Abrir ↗</a>}
                <button type="button" className="src-btn src-btn--sm src-btn--lime" disabled={!dirty[r.id] || savingId === r.id} onClick={() => void save(r)}>
                  {savingId === r.id ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Pestaña: historial ──────────────────────────────────────
function HistoryTab({ onOpen, onRepeat }: { onOpen: (r: HistoryRow) => void; onRepeat: (q: string) => void }) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      const { data, error: err } = await supabase.from('sourcing_searches').select('*').order('created_at', { ascending: false }).limit(80);
      if (err) setError(err.message); else setRows((data ?? []) as HistoryRow[]);
      setLoading(false);
    })();
  }, []);

  if (loading) return <ResultsSkeleton />;
  if (error) return <div className="src-alert src-alert--error">{error}</div>;
  if (!rows.length) return <div className="src-empty"><strong>Sin búsquedas todavía.</strong><span>Aquí verás cada consulta con su fecha y resultados.</span></div>;

  const used = rows.filter((r) => new Date(r.created_at).getMonth() === new Date().getMonth()).length;

  return (
    <section>
      <p className="src-note">{used} consultas este mes. Abrir una búsqueda guardada no gasta consultas; "Repetir" sí.</p>
      <div className="src-table src-table--history" role="table" aria-label="Historial de búsquedas">
        <div className="src-row src-row--head" role="row">
          <span role="columnheader">Búsqueda</span>
          <span role="columnheader">Fecha</span>
          <span role="columnheader" className="num">Resultados</span>
          <span role="columnheader" />
        </div>
        {rows.map((r) => (
          <div key={r.id} className="src-row" role="row">
            <div className="src-cell" role="cell">
              <span className="src-prod__title">{r.query}</span>
              {r.status === 'error' && <span className="src-sub is-neg">{r.error}</span>}
            </div>
            <div className="src-cell" role="cell">
              <span>{new Date(r.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</span>
              <span className="src-sub">{r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)} s` : ''}{r.page ? ` · página ${r.page}` : ''}</span>
            </div>
            <div className="src-cell num" role="cell">{r.results}</div>
            <div className="src-cell src-actions" role="cell">
              <button type="button" className="src-btn src-btn--sm src-btn--ghost" disabled={r.status !== 'ok' || !r.results} onClick={() => onOpen(r)}>Abrir</button>
              <button type="button" className="src-btn src-btn--sm src-btn--ghost" onClick={() => onRepeat(r.query)}>Repetir</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
