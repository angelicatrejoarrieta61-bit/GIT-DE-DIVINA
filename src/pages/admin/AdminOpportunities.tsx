/**
 * AdminOpportunities.tsx — Catálogo → Oportunidades y resultados (/admin/oportunidades)
 * 1) Oportunidades: qué conviene vender. Demanda (autocompletado de Google, reseñas y reseñas nuevas),
 *    competencia, proveedor autorizado con entrega al día siguiente, precio de mercado y ganancia.
 *    Candidato = señales sin confirmar · Verificado = proveedor válido + precio competitivo + demanda.
 * 2) Resultados: visitas, carritos, pedidos, ventas y ganancia por producto para impulsar o retirar.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lightbulb, RefreshCw, Plus, Search, X, AlertTriangle, TrendingUp, Star, Trash2, Undo2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { normalizeKey, timeAgo } from '../../lib/sourcing';
import { callAuto, loadAutoConfig, saveConfig, isMissingSchema, moneyMx, type AutoConfig } from '../../lib/autoApi';
import './AdminAuto.css';

type OppStatus = 'candidato' | 'verificado' | 'publicado' | 'descartado';
interface Opportunity {
  id: string; query: string; origin: 'manual' | 'sugerencia'; seed: string | null; status: OppStatus; brand: string | null;
  demand_score: number | null; suggest_rank: number | null; reviews_total: number | null; reviews_delta: number | null;
  rating: number | null; sellers: number | null; authorized_sellers: number | null; best_shop: string | null;
  best_unit_cost: number | null; market_low: number | null; market_ref?: number | null; suggested_price: number | null; margin_mxn: number | null;
  margin_pct: number | null; reasons: string[]; checked_at: string | null; created_at: string;
}
interface Metric { product_id: string; views: number; carts: number; orders: number; units: number; revenue: number; profit: number | null }
interface ProductLite { id: string; name: string; brand: string | null; price: number; in_stock: boolean; tags: string[] | null; slug: string }
type Tab = 'oportunidades' | 'resultados';
type Toast = { kind: 'ok' | 'error'; text: string } | null;

const STATUS_META: Record<OppStatus, { label: string; tone: string }> = {
  verificado: { label: 'Verificado', tone: 't-lime' },
  candidato: { label: 'Candidato', tone: 't-info' },
  publicado: { label: 'Publicado', tone: 't-ok' },
  descartado: { label: 'Descartado', tone: '' },
};
const TOP_TAG = 'TOP_HOME';

export const AdminOpportunities: React.FC = () => {
  const [tab, setTab] = useState<Tab>('oportunidades');
  const [cfg, setCfg] = useState<AutoConfig | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [schemaError, setSchemaError] = useState('');

  useEffect(() => { void loadAutoConfig().then(setCfg); }, []);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(t);
  }, [toast]);

  return (
    <div className="aut">
      <header className="aut-head">
        <div>
          <h1 className="aut-title"><Lightbulb size={20} aria-hidden="true" /> Oportunidades y resultados</h1>
          <p className="aut-sub">
            Qué conviene vender sin comprar inventario: la demanda se mide con lo que Google sugiere, las reseñas y sobre todo las <b>reseñas nuevas</b> entre revisiones
            (aparecer mucho no prueba que se venda). Un <b>verificado</b> además tiene proveedor autorizado con entrega al día siguiente y queda competitivo con tu ganancia mínima.
          </p>
        </div>
      </header>

      {schemaError && (
        <div className="aut-alert aut-alert--warn" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <div><strong>Falta aplicar la actualización de la base.</strong> Se aplica sola al subir <code>supabase/migrations/20261029120000_sourcing_auto.sql</code>. Detalle: {schemaError}</div>
        </div>
      )}

      <div className="aut-tabs" role="tablist" aria-label="Secciones">
        {([['oportunidades', 'Oportunidades'], ['resultados', 'Resultados por producto']] as Array<[Tab, string]>).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`aut-tab ${tab === k ? 'is-on' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'oportunidades' && cfg && <OpportunitiesTab cfg={cfg} setCfg={setCfg} notify={setToast} onSchemaError={setSchemaError} />}
      {tab === 'resultados' && <ResultsTab notify={setToast} onSchemaError={setSchemaError} />}
      {!cfg && tab === 'oportunidades' && <div className="aut-table-wrap" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="aut-skel" />)}</div>}

      {toast && <div className={`aut-toast is-${toast.kind}`} role="status">{toast.text}</div>}
    </div>
  );
};

// ─── Oportunidades ────────────────────────────────────────────
function OpportunitiesTab({ cfg, setCfg, notify, onSchemaError }: {
  cfg: AutoConfig; setCfg: (c: AutoConfig) => void; notify: (t: Toast) => void; onSchemaError: (m: string) => void;
}) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OppStatus>('verificado');
  const [text, setText] = useState('');
  const [newQuery, setNewQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [seeds, setSeeds] = useState(cfg.seeds);
  const [perDay, setPerDay] = useState(String(cfg.opportunitiesPerDay));
  const [savingSeeds, setSavingSeeds] = useState(false);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('sourcing_opportunities').select('*').order('demand_score', { ascending: false, nullsFirst: false }).limit(500);
    if (error) { if (isMissingSchema(error.message)) onSchemaError(error.message); else notify({ kind: 'error', text: error.message }); }
    setRows((data ?? []) as Opportunity[]);
    setLoading(false);
  }, [notify, onSchemaError]);
  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<OppStatus, number> = { verificado: 0, candidato: 0, publicado: 0, descartado: 0 };
    rows.forEach((r) => { c[r.status] += 1; });
    return c;
  }, [rows]);
  useEffect(() => { if (!loading && counts.verificado === 0 && filter === 'verificado' && counts.candidato > 0) setFilter('candidato'); }, [loading, counts, filter]);

  const shown = rows.filter((r) => r.status === filter && (!text.trim() || r.query.toLowerCase().includes(text.trim().toLowerCase())));

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = newQuery.replace(/\s+/g, ' ').trim();
    if (q.length < 4) { notify({ kind: 'error', text: 'Escribe el producto (marca, línea y tamaño).' }); return; }
    setAdding(true);
    const { data, error } = await supabase.from('sourcing_opportunities').insert({ query: q, query_key: normalizeKey(q), origin: 'manual' }).select('*').single();
    setAdding(false);
    if (error) { notify({ kind: 'error', text: error.code === '23505' ? 'Ya está en la lista.' : error.message }); return; }
    setNewQuery('');
    setRows((list) => [data as Opportunity, ...list]);
    setFilter('candidato');
    void evaluate(data as Opportunity);
  };

  const evaluate = async (o: Opportunity) => {
    setBusy(o.id);
    try {
      const r = await callAuto<{ result: Partial<Opportunity> }>('evaluate', { opportunityId: o.id });
      setRows((list) => list.map((x) => (x.id === o.id ? { ...x, ...r.result } as Opportunity : x)));
      notify({ kind: 'ok', text: `${o.query}: ${r.result.status === 'verificado' ? 'verificado ✓' : 'evaluado (candidato)'}` });
    } catch (e) {
      notify({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const setStatus = async (o: Opportunity, status: OppStatus) => {
    setBusy(o.id);
    const { error } = await supabase.from('sourcing_opportunities').update({ status }).eq('id', o.id);
    setBusy(null);
    if (error) { notify({ kind: 'error', text: error.message }); return; }
    setRows((list) => list.map((x) => (x.id === o.id ? { ...x, status } : x)));
  };

  const publish = async (o: Opportunity) => {
    await setStatus(o, 'publicado');
    navigate(`/admin/abastecimiento?q=${encodeURIComponent(o.query)}`);
  };

  const saveSeeds = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(perDay);
    if (!Number.isInteger(n) || n < 0 || n > 30) { notify({ kind: 'error', text: 'Búsquedas por día: de 0 a 30.' }); return; }
    setSavingSeeds(true);
    const err = await saveConfig({ auto_opportunity_seeds: seeds.trim(), auto_opportunities_per_day: String(n) });
    setSavingSeeds(false);
    if (err) { notify({ kind: 'error', text: err }); return; }
    setCfg({ ...cfg, seeds: seeds.trim(), opportunitiesPerDay: n });
    notify({ kind: 'ok', text: 'Guardado. Se usa en la búsqueda diaria (7:20 am).' });
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const r = await callAuto<{ added: number; evaluated: number }>('opportunities');
      notify({ kind: 'ok', text: `${r.added} idea${r.added === 1 ? '' : 's'} nueva${r.added === 1 ? '' : 's'} · ${r.evaluated} evaluada${r.evaluated === 1 ? '' : 's'}` });
      await load();
    } catch (e) {
      notify({ kind: 'error', text: (e as Error).message });
    } finally {
      setRunning(false);
    }
  };

  const seedsDirty = seeds.trim() !== cfg.seeds.trim() || Number(perDay) !== cfg.opportunitiesPerDay;

  return (
    <>
      <form className="aut-form" onSubmit={saveSeeds} style={{ marginBottom: 12 }}>
        <div className="aut-field aut-field--wide">
          <label htmlFor="opp-seeds">Temas a explorar (uno por línea)</label>
          <textarea id="opp-seeds" value={seeds} onChange={(e) => setSeeds(e.target.value)} placeholder={'protector solar facial\nserum vitamina c\ncrema retinol\nagua micelar'} />
          <small>Cada día se buscan ideas nuevas con el autocompletado de Google para estos temas y se evalúan las más pendientes.</small>
        </div>
        <div className="aut-field">
          <label htmlFor="opp-day">Evaluaciones por día</label>
          <input id="opp-day" type="number" min={0} max={30} step={1} value={perDay} onChange={(e) => setPerDay(e.target.value)} />
          <small>Cada evaluación usa una búsqueda de Bright Data.</small>
        </div>
        <div className="aut-form__foot">
          <button type="button" className="aut-btn" onClick={() => void runNow()} disabled={running}>
            {running ? <><RefreshCw size={13} className="aut-spin" aria-hidden="true" /> Buscando…</> : <><TrendingUp size={13} aria-hidden="true" /> Buscar ideas ahora</>}
          </button>
          <button type="submit" className="aut-btn aut-btn--primary" disabled={savingSeeds || !seedsDirty}>{savingSeeds ? 'Guardando…' : 'Guardar temas'}</button>
        </div>
      </form>

      <div className="aut-bar">
        <form className="aut-inline" onSubmit={add} style={{ flex: 1, minWidth: 260, maxWidth: 520 }}>
          <input value={newQuery} onChange={(e) => setNewQuery(e.target.value)} placeholder="Agregar producto a evaluar (ej. CeraVe Crema Hidratante 454 g)" aria-label="Producto a evaluar" maxLength={160} />
          <button type="submit" className="aut-btn" disabled={adding}><Plus size={13} aria-hidden="true" /> {adding ? 'Agregando…' : 'Evaluar'}</button>
        </form>
        <label className="aut-search">
          <Search size={14} aria-hidden="true" />
          <span className="aut-vh">Filtrar</span>
          <input type="search" placeholder="Filtrar lista" value={text} onChange={(e) => setText(e.target.value)} />
          {text && <button type="button" className="aut-rowbtn" onClick={() => setText('')} aria-label="Limpiar"><X size={13} /></button>}
        </label>
      </div>
      <div className="aut-chips" role="group" aria-label="Estado" style={{ marginBottom: 8 }}>
        {(['verificado', 'candidato', 'publicado', 'descartado'] as OppStatus[]).map((k) => (
          <button key={k} type="button" className={`aut-chip ${filter === k ? 'is-on' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{STATUS_META[k].label}s <em>{counts[k]}</em></button>
        ))}
      </div>

      {loading ? (
        <div className="aut-table-wrap" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="aut-skel" />)}</div>
      ) : rows.length === 0 ? (
        <div className="aut-empty"><Lightbulb size={28} aria-hidden="true" /><p>Agrega temas arriba y pulsa <b>Buscar ideas ahora</b>, o evalúa un producto concreto.</p></div>
      ) : shown.length === 0 ? (
        <div className="aut-empty"><p>Nada en “{STATUS_META[filter].label}s”.</p></div>
      ) : (
        <div className="aut-table-wrap">
          <table className="aut-table">
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col">Demanda</th>
                <th scope="col" className="c-hide-sm">Competencia</th>
                <th scope="col" className="c-num c-hide-sm">Costo</th>
                <th scope="col" className="c-num">Precio sugerido</th>
                <th scope="col" className="c-num">Ganancia</th>
                <th scope="col" className="c-act"><span className="aut-vh">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => (
                <tr key={o.id} className={busy === o.id ? 'is-busy' : ''}>
                  <td>
                    <span className="aut-name"><strong title={o.query}>{o.query}</strong>
                      <span>{o.origin === 'sugerencia' ? `Sugerido por Google${o.seed ? ` · ${o.seed}` : ''}` : 'Agregado por ti'} · {o.checked_at ? `evaluado ${timeAgo(o.checked_at)}` : 'sin evaluar'}</span>
                    </span>
                    {o.reasons?.length > 0 && <div className="aut-reasons">{o.reasons.slice(0, 5).map((r) => <span key={r}>{r}</span>)}</div>}
                  </td>
                  <td>
                    {o.demand_score !== null
                      ? <div className="aut-meter" title="0–100: sugerencias de Google, reseñas, reseñas nuevas, calificación y competencia"><div className="aut-meter__bar"><span style={{ width: `${Math.min(100, o.demand_score)}%` }} /></div><b>{Math.round(o.demand_score)}</b></div>
                      : <span className="aut-muted">—</span>}
                    {o.reviews_delta ? <span className="aut-cell-sub aut-ok">+{o.reviews_delta} reseñas</span> : null}
                  </td>
                  <td className="c-hide-sm">
                    {o.sellers !== null ? <>{o.sellers} tienda{o.sellers === 1 ? '' : 's'}<span className="aut-cell-sub">{o.authorized_sellers ?? 0} válidas · mercado {moneyMx(o.market_ref ?? o.market_low)}</span></> : '—'}
                  </td>
                  <td className="c-num c-hide-sm">{moneyMx(o.best_unit_cost)}<span className="aut-cell-sub">{o.best_shop ?? 'sin proveedor'}</span></td>
                  <td className="c-num"><b>{moneyMx(o.suggested_price)}</b></td>
                  <td className="c-num"><span className={o.margin_mxn == null ? '' : o.margin_mxn < 0 ? 'aut-bad' : 'aut-ok'}>{moneyMx(o.margin_mxn)}</span>{o.margin_pct !== null && <span className="aut-cell-sub">{o.margin_pct}%</span>}</td>
                  <td className="c-act">
                    <span className={`aut-tag ${STATUS_META[o.status].tone}`} style={{ marginRight: 6 }}>{STATUS_META[o.status].label}</span>
                    {(o.status === 'candidato' || o.status === 'verificado') && (
                      <button type="button" className="aut-btn aut-btn--xs" onClick={() => void evaluate(o)} disabled={busy === o.id}>
                        {busy === o.id ? <RefreshCw size={12} className="aut-spin" aria-hidden="true" /> : 'Evaluar'}
                      </button>
                    )}{' '}
                    {o.status === 'verificado' && <button type="button" className="aut-btn aut-btn--xs aut-btn--primary" onClick={() => void publish(o)} disabled={busy === o.id}>Publicar</button>}{' '}
                    {o.status !== 'descartado'
                      ? <button type="button" className="aut-btn aut-btn--xs aut-btn--danger" onClick={() => void setStatus(o, 'descartado')} disabled={busy === o.id} aria-label={`Descartar ${o.query}`} title="Descartar"><Trash2 size={12} /></button>
                      : <button type="button" className="aut-btn aut-btn--xs" onClick={() => void setStatus(o, 'candidato')} disabled={busy === o.id} title="Volver a candidatos"><Undo2 size={12} aria-hidden="true" /> Recuperar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="aut-foot"><b>Publicar</b> abre Abastecimiento con la búsqueda lista para dar de alta el producto con su proveedor. Desde ahí se vigila solo.</p>
        </div>
      )}
    </>
  );
}

// ─── Resultados por producto ──────────────────────────────────
function ResultsTab({ notify, onSchemaError }: { notify: (t: Toast) => void; onSchemaError: (m: string) => void }) {
  const [days, setDays] = useState(30);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [products, setProducts] = useState<Record<string, ProductLite>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [sort, setSort] = useState<'profit' | 'views' | 'conv'>('profit');

  const load = useCallback(async () => {
    setLoading(true);
    const [m, p] = await Promise.all([
      supabase.rpc('product_metrics', { p_days: days }),
      supabase.from('products').select('id,name,brand,price,in_stock,tags,slug').limit(2000),
    ]);
    if (m.error) { if (isMissingSchema(m.error.message) || /product_metrics/.test(m.error.message)) onSchemaError(m.error.message); else notify({ kind: 'error', text: m.error.message }); }
    setMetrics(((m.data ?? []) as Metric[]).map((x) => ({ ...x, views: Number(x.views), carts: Number(x.carts), orders: Number(x.orders), units: Number(x.units), revenue: Number(x.revenue), profit: x.profit === null ? null : Number(x.profit) })));
    setProducts(Object.fromEntries(((p.data ?? []) as ProductLite[]).map((x) => [x.id, x])));
    setLoading(false);
  }, [days, notify, onSchemaError]);
  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => metrics
    .filter((m) => products[m.product_id])
    .map((m) => {
      const conv = m.views ? (m.orders / m.views) * 100 : 0;
      const cartRate = m.views ? (m.carts / m.views) * 100 : 0;
      let advice: { label: string; tone: string };
      if (m.orders > 0 && (m.profit ?? 0) > 0 && conv >= 1.5) advice = { label: 'Impulsar', tone: 't-lime' };
      else if (m.views >= 50 && m.carts === 0) advice = { label: 'Revisar precio o retirar', tone: 't-bad' };
      else if (m.carts > 0 && m.orders === 0) advice = { label: 'Se queda en carrito', tone: 't-warn' };
      else if (m.views < 20) advice = { label: 'Pocos datos', tone: '' };
      else advice = { label: 'Observar', tone: 't-info' };
      return { ...m, conv, cartRate, advice, p: products[m.product_id] };
    })
    .sort((a, b) => (sort === 'views' ? b.views - a.views : sort === 'conv' ? b.conv - a.conv : (b.profit ?? -1e9) - (a.profit ?? -1e9))),
  [metrics, products, sort]);

  const totals = rows.reduce((t, r) => ({ views: t.views + r.views, carts: t.carts + r.carts, orders: t.orders + r.orders, revenue: t.revenue + r.revenue, profit: t.profit + (r.profit ?? 0) }), { views: 0, carts: 0, orders: 0, revenue: 0, profit: 0 });

  const toggleTop = async (p: ProductLite) => {
    const tags = p.tags ?? [];
    const next = tags.includes(TOP_TAG) ? tags.filter((t) => t !== TOP_TAG) : [...tags, TOP_TAG];
    setBusy(p.id);
    const { error } = await supabase.from('products').update({ tags: next }).eq('id', p.id);
    setBusy(null);
    if (error) { notify({ kind: 'error', text: error.message }); return; }
    setProducts((m) => ({ ...m, [p.id]: { ...p, tags: next } }));
    notify({ kind: 'ok', text: next.includes(TOP_TAG) ? `${p.name} aparece en “Más vendidos” del Home` : `${p.name} ya no se destaca en el Home` });
  };

  return (
    <>
      <div className="aut-bar">
        <select className="aut-select" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Periodo">
          <option value={7}>Últimos 7 días</option>
          <option value={30}>Últimos 30 días</option>
          <option value={90}>Últimos 90 días</option>
        </select>
        <select className="aut-select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Ordenar">
          <option value="profit">Ordenar por ganancia</option>
          <option value="views">Ordenar por visitas</option>
          <option value="conv">Ordenar por conversión</option>
        </select>
        <button type="button" className="aut-btn" onClick={() => void load()} disabled={loading}><RefreshCw size={13} className={loading ? 'aut-spin' : ''} aria-hidden="true" /> Actualizar</button>
      </div>

      <div className="aut-kpis">
        <div className="aut-kpi"><span className="aut-kpi__label">Visitas</span><span className="aut-kpi__value">{totals.views.toLocaleString('es-MX')}</span></div>
        <div className="aut-kpi"><span className="aut-kpi__label">Agregados al carrito</span><span className="aut-kpi__value">{totals.carts.toLocaleString('es-MX')}</span></div>
        <div className="aut-kpi"><span className="aut-kpi__label">Pedidos pagados</span><span className="aut-kpi__value">{totals.orders}</span></div>
        <div className="aut-kpi"><span className="aut-kpi__label">Ventas</span><span className="aut-kpi__value">{moneyMx(totals.revenue)}</span></div>
        <div className="aut-kpi"><span className="aut-kpi__label">Ganancia estimada</span><span className="aut-kpi__value aut-ok">{moneyMx(totals.profit)}</span><span className="aut-kpi__hint">costo del proveedor al vender</span></div>
      </div>

      {loading ? (
        <div className="aut-table-wrap" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="aut-skel" />)}</div>
      ) : rows.length === 0 ? (
        <div className="aut-empty"><TrendingUp size={28} aria-hidden="true" /><p>Aún no hay datos en este periodo. Las visitas y carritos se registran desde que se publica esta versión.</p></div>
      ) : (
        <div className="aut-table-wrap">
          <table className="aut-table">
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col" className="c-num">Visitas</th>
                <th scope="col" className="c-num c-hide-sm">Carritos</th>
                <th scope="col" className="c-num">Pedidos</th>
                <th scope="col" className="c-num c-hide-sm">Ventas</th>
                <th scope="col" className="c-num">Ganancia</th>
                <th scope="col">Decisión</th>
                <th scope="col" className="c-act">Home</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const top = (r.p.tags ?? []).includes(TOP_TAG);
                return (
                  <tr key={r.product_id} className={busy === r.product_id ? 'is-busy' : ''}>
                    <td><span className="aut-name"><strong><Link className="aut-link" style={{ color: 'inherit' }} to={`/producto/${r.p.slug}`} target="_blank">{r.p.name}</Link></strong><span>{r.p.brand ?? '—'} · {moneyMx(r.p.price)}{r.p.in_stock ? '' : ' · oculto'}</span></span></td>
                    <td className="c-num">{r.views}</td>
                    <td className="c-num c-hide-sm">{r.carts}<span className="aut-cell-sub">{r.cartRate.toFixed(1)}%</span></td>
                    <td className="c-num">{r.orders}<span className="aut-cell-sub">{r.conv.toFixed(1)}% conv.</span></td>
                    <td className="c-num c-hide-sm">{moneyMx(r.revenue)}</td>
                    <td className="c-num"><span className={r.profit === null ? '' : r.profit < 0 ? 'aut-bad' : 'aut-ok'}>{moneyMx(r.profit)}</span></td>
                    <td><span className={`aut-tag ${r.advice.tone}`}>{r.advice.label}</span></td>
                    <td className="c-act">
                      <button type="button" className={`aut-btn aut-btn--xs ${top ? 'aut-btn--primary' : ''}`} onClick={() => void toggleTop(r.p)} disabled={busy === r.product_id}
                        aria-pressed={top} title={top ? 'Quitar de “Más vendidos” del Home' : 'Destacar en “Más vendidos” del Home'}>
                        <Star size={12} aria-hidden="true" /> {top ? 'Destacado' : 'Destacar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="aut-foot">Ganancia = total cobrado − costo del proveedor registrado al momento de la venta (sin comisión de Clip ni envío que absorbas).</p>
        </div>
      )}
    </>
  );
}
