/**
 * AdminAuto.tsx — Catálogo → Precios automáticos (/admin/automatizacion)
 * 1) Productos vigilados: proveedor, costo, margen, estado y precio; revisión cada N horas (pg_cron → /api/sourcing-auto).
 * 2) Pedidos por comprar: verificación en vivo del proveedor antes de comprarle (comprar · cambiar · suspender).
 * 3) Reglas: ganancia mínima, competencia, tope de cambio, días de entrega, frecuencia.
 * Migración: supabase/migrations/20261029120000_sourcing_auto.sql
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot, RefreshCw, Search, X, ChevronDown, ChevronRight, ExternalLink, AlertTriangle, ShieldCheck, Save, PackageCheck,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { computeMargin, timeAgo } from '../../lib/sourcing';
import {
  callAuto, loadAutoConfig, saveConfig, isMissingSchema, moneyMx, shortDateTime, AUTO_KEYS, type AutoConfig,
} from '../../lib/autoApi';
import './AdminAuto.css';

// ─── Tipos ────────────────────────────────────────────────────
interface WatchedProduct {
  id: string; name: string; slug: string; brand: string | null; price: number; cost_price: number | null;
  in_stock: boolean; fulfillment: string | null; auto_price: boolean; auto_hidden: boolean;
  sourcing_status: 'ok' | 'sin_proveedor' | 'sin_datos' | 'error' | null; sourcing_note: string | null;
  sourcing_checked_at: string | null; search_query: string | null;
}
interface PrimarySource { product_id: string; shop: string; link: string | null; unit_cost_mxn: number; shipping_mxn: number; last_checked_at: string | null }
interface PriceCheck {
  id: string; checked_at: string; status: string; best_shop: string | null; best_unit_cost: number | null; market_low: number | null; market_ref?: number | null;
  floor_price: number | null; price_before: number | null; price_after: number | null; margin_mxn: number | null; margin_pct: number | null;
  offers_exact: number; note: string | null; best_link: string | null;
}
interface PriceChange { id: string; product_id: string; changed_at: string; old_price: number; new_price: number; reason: string }
interface OrderLite { id: string; created_at: string; customer_name: string | null; total: number; status: string; items: Array<{ product: { id: string; name: string; price: number }; quantity: number }> }
interface VerifyItem {
  name: string; qty: number; paid?: number; status: 'comprar' | 'cambiar_proveedor' | 'suspender' | 'stock';
  shop?: string; seller?: string | null; link?: string | null; unit_cost?: number; shipping?: number; margin?: number | null;
  margin_pct?: number | null; previous_shop?: string | null; note?: string;
}
interface VerifyResult { decision: 'comprar' | 'cambiar_proveedor' | 'suspender'; margin: number; detail: VerifyItem[] }
interface StoredCheck { order_id: string; checked_at: string; decision: VerifyResult['decision']; margin_mxn: number | null; detail: VerifyItem[] }

type Tab = 'productos' | 'pedidos' | 'reglas';
type Filter = 'todos' | 'ok' | 'sin_proveedor' | 'pendiente' | 'error';
type Toast = { kind: 'ok' | 'error'; text: string } | null;

const STATUS_META: Record<string, { label: string; tone: string }> = {
  ok: { label: 'Con proveedor', tone: 't-ok' },
  sin_proveedor: { label: 'Sin proveedor · oculto', tone: 't-bad' },
  sin_datos: { label: 'Faltan datos', tone: 't-warn' },
  error: { label: 'Error al revisar', tone: 't-bad' },
  pendiente: { label: 'Pendiente de revisar', tone: 't-info' },
};
const DECISION_META: Record<VerifyResult['decision'], { label: string; tone: string }> = {
  comprar: { label: 'Comprar', tone: 't-ok' },
  cambiar_proveedor: { label: 'Cambiar de proveedor', tone: 't-warn' },
  suspender: { label: 'Suspender', tone: 't-bad' },
};
const ITEM_META: Record<VerifyItem['status'], { label: string; tone: string }> = {
  comprar: { label: 'Comprar', tone: 't-ok' },
  cambiar_proveedor: { label: 'Otro proveedor', tone: 't-warn' },
  suspender: { label: 'Suspender', tone: 't-bad' },
  stock: { label: 'Stock propio', tone: 't-info' },
};

const statusOf = (p: WatchedProduct) => p.sourcing_status ?? 'pendiente';

// ─── Página ───────────────────────────────────────────────────
export const AdminAuto: React.FC = () => {
  const [tab, setTab] = useState<Tab>('productos');
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
          <h1 className="aut-title"><Bot size={20} aria-hidden="true" /> Precios automáticos</h1>
          <p className="aut-sub">
            Cada {cfg?.rules.checkHours ?? 5} h se revisan los productos <b>bajo pedido</b> con proveedor: precio y existencia en tiendas autorizadas
            que entregan al día siguiente. El precio sube si sube el costo y baja para competir, sin bajar de tu ganancia mínima
            ({cfg?.rules.minMarginPct ?? 25}% y al menos {moneyMx(cfg?.rules.minMarginMxn ?? 100)}).
            {cfg && !cfg.enabled && <b className="aut-warn"> La automatización está apagada.</b>}
          </p>
        </div>
      </header>

      {schemaError && (
        <div className="aut-alert aut-alert--warn" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <div>
            <strong>Falta aplicar la actualización de la base.</strong> Se aplica sola al subir a GitHub el archivo
            {' '}<code>supabase/migrations/20261029120000_sourcing_auto.sql</code>. Detalle: {schemaError}
          </div>
        </div>
      )}

      <div className="aut-tabs" role="tablist" aria-label="Secciones">
        {([['productos', 'Productos vigilados'], ['pedidos', 'Pedidos por comprar'], ['reglas', 'Reglas']] as Array<[Tab, string]>).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`aut-tab ${tab === k ? 'is-on' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'productos' && cfg && <ProductsTab cfg={cfg} notify={setToast} onSchemaError={setSchemaError} />}
      {tab === 'pedidos' && <OrdersTab notify={setToast} onSchemaError={setSchemaError} />}
      {tab === 'reglas' && cfg && <RulesTab cfg={cfg} onSaved={(c) => { setCfg(c); setToast({ kind: 'ok', text: 'Reglas guardadas. Se usan desde la próxima revisión.' }); }} notify={setToast} />}
      {!cfg && <div className="aut-table-wrap" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="aut-skel" />)}</div>}

      {toast && <div className={`aut-toast is-${toast.kind}`} role="status">{toast.text}</div>}
    </div>
  );
};

// ─── Productos vigilados ──────────────────────────────────────
function ProductsTab({ cfg, notify, onSchemaError }: { cfg: AutoConfig; notify: (t: Toast) => void; onSchemaError: (m: string) => void }) {
  const [rows, setRows] = useState<WatchedProduct[]>([]);
  const [sources, setSources] = useState<Record<string, PrimarySource>>({});
  const [changes24, setChanges24] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('todos');
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [prods, srcs, ch] = await Promise.all([
      supabase.from('products')
        .select('id,name,slug,brand,price,cost_price,in_stock,fulfillment,auto_price,auto_hidden,sourcing_status,sourcing_note,sourcing_checked_at,search_query')
        .eq('fulfillment', 'bajo_pedido').order('name').limit(1000),
      supabase.from('product_sources').select('product_id,shop,link,unit_cost_mxn,shipping_mxn,last_checked_at').eq('is_primary', true),
      supabase.from('product_price_changes').select('id', { count: 'exact', head: true }).gte('changed_at', new Date(Date.now() - 86400_000).toISOString()),
    ]);
    if (prods.error) { onSchemaError(isMissingSchema(prods.error.message) ? prods.error.message : ''); if (!isMissingSchema(prods.error.message)) notify({ kind: 'error', text: prods.error.message }); }
    setRows((prods.data ?? []) as WatchedProduct[]);
    setSources(Object.fromEntries(((srcs.data ?? []) as PrimarySource[]).map((s) => [s.product_id, s])));
    setChanges24(ch.count ?? 0);
    setLoading(false);
  }, [notify, onSchemaError]);
  useEffect(() => { void load(); }, [load]);

  const watched = rows.filter((p) => sources[p.id]);
  const unassigned = rows.filter((p) => !sources[p.id]);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { todos: watched.length, ok: 0, sin_proveedor: 0, pendiente: 0, error: 0 };
    watched.forEach((p) => {
      const s = statusOf(p);
      if (s === 'ok') c.ok += 1; else if (s === 'sin_proveedor') c.sin_proveedor += 1; else if (s === 'pendiente') c.pendiente += 1; else c.error += 1;
    });
    return c;
  }, [watched]);

  const shown = watched.filter((p) => {
    const s = statusOf(p);
    if (filter !== 'todos' && (filter === 'error' ? !['error', 'sin_datos'].includes(s) : s !== filter)) return false;
    const q = query.trim().toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || (p.brand ?? '').toLowerCase().includes(q) || (sources[p.id]?.shop ?? '').toLowerCase().includes(q);
  });

  const checkNow = async (p: WatchedProduct) => {
    setBusy(p.id);
    try {
      const r = await callAuto<{ result: { status: string; price?: number; changed?: boolean; shop?: string; note?: string } }>('check', { productId: p.id });
      const x = r.result;
      notify({
        kind: x.status === 'ok' ? 'ok' : 'error',
        text: x.status === 'ok'
          ? `${p.name}: ${x.changed ? `precio ajustado a ${moneyMx(x.price)}` : 'precio sin cambio'} · proveedor ${x.shop}`
          : `${p.name}: ${STATUS_META[x.status]?.label ?? x.status}${x.note ? ` — ${x.note}` : ''}`,
      });
      await load();
    } catch (e) {
      notify({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const toggleAuto = async (p: WatchedProduct) => {
    setBusy(p.id);
    const { error } = await supabase.from('products').update({ auto_price: !p.auto_price }).eq('id', p.id);
    setBusy(null);
    if (error) { notify({ kind: 'error', text: error.message }); return; }
    setRows((list) => list.map((x) => (x.id === p.id ? { ...x, auto_price: !p.auto_price } : x)));
  };

  const due = watched.filter((p) => !p.sourcing_checked_at || Date.now() - new Date(p.sourcing_checked_at).getTime() > cfg.rules.checkHours * 3600_000).length;

  return (
    <>
      <div className="aut-kpis">
        <div className="aut-kpi"><span className="aut-kpi__label">Vigilados</span><span className="aut-kpi__value">{watched.length}</span><span className="aut-kpi__hint">bajo pedido con proveedor</span></div>
        <div className="aut-kpi"><span className="aut-kpi__label">Con proveedor</span><span className="aut-kpi__value aut-ok">{counts.ok}</span></div>
        <div className="aut-kpi"><span className="aut-kpi__label">Ocultos sin proveedor</span><span className={`aut-kpi__value ${counts.sin_proveedor ? 'aut-bad' : ''}`}>{counts.sin_proveedor}</span></div>
        <div className="aut-kpi"><span className="aut-kpi__label">Cambios de precio 24 h</span><span className="aut-kpi__value">{changes24}</span></div>
        <div className="aut-kpi"><span className="aut-kpi__label">Por revisar</span><span className="aut-kpi__value">{due}</span><span className="aut-kpi__hint">se procesan cada 10 min</span></div>
      </div>

      {unassigned.length > 0 && (
        <div className="aut-alert aut-alert--warn" role="status">
          <AlertTriangle size={16} aria-hidden="true" />
          <div>
            {unassigned.length} producto{unassigned.length === 1 ? '' : 's'} bajo pedido sin proveedor elegido: no se vigilan. Elígeles proveedor en Abastecimiento:{' '}
            {unassigned.slice(0, 4).map((p, i) => (
              <React.Fragment key={p.id}>{i > 0 && ', '}<Link className="aut-link" to={`/admin/abastecimiento?product=${p.id}`}>{p.name}</Link></React.Fragment>
            ))}{unassigned.length > 4 ? '…' : ''}
          </div>
        </div>
      )}

      <div className="aut-bar">
        <label className="aut-search">
          <Search size={14} aria-hidden="true" />
          <span className="aut-vh">Buscar producto</span>
          <input type="search" placeholder="Producto, marca o tienda" value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && <button type="button" className="aut-rowbtn" onClick={() => setQuery('')} aria-label="Limpiar"><X size={13} /></button>}
        </label>
        <div className="aut-chips" role="group" aria-label="Filtrar por estado">
          {([['todos', 'Todos'], ['ok', 'Con proveedor'], ['sin_proveedor', 'Sin proveedor'], ['pendiente', 'Pendientes'], ['error', 'Con error']] as Array<[Filter, string]>).map(([k, l]) => (
            <button key={k} type="button" className={`aut-chip ${filter === k ? 'is-on' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} <em>{counts[k]}</em></button>
          ))}
        </div>
        <button type="button" className="aut-btn" onClick={() => void load()} disabled={loading}><RefreshCw size={13} className={loading ? 'aut-spin' : ''} aria-hidden="true" /> Actualizar</button>
      </div>

      {loading ? (
        <div className="aut-table-wrap" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="aut-skel" />)}</div>
      ) : watched.length === 0 ? (
        <div className="aut-empty">
          <PackageCheck size={28} aria-hidden="true" />
          <p>Aún no hay productos vigilados. En <Link className="aut-link" to="/admin/abastecimiento">Abastecimiento</Link> busca un producto y usa <b>+ Mi stock</b> con un proveedor: desde ahí se revisa solo.</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="aut-empty"><p>Ningún producto con este filtro.</p><button type="button" className="aut-btn aut-btn--xs" onClick={() => { setFilter('todos'); setQuery(''); }}>Quitar filtros</button></div>
      ) : (
        <div className="aut-table-wrap">
          <table className="aut-table">
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col" className="c-num">Precio</th>
                <th scope="col" className="c-num c-hide-sm">Costo</th>
                <th scope="col" className="c-num">Ganancia</th>
                <th scope="col" className="c-hide-sm">Proveedor</th>
                <th scope="col" className="c-hide-sm">Estado</th>
                <th scope="col" className="c-hide-sm">Auto</th>
                <th scope="col" className="c-act"><span className="aut-vh">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const src = sources[p.id];
                const cost = src ? Number(src.unit_cost_mxn) : null;
                const m = computeMargin(Number(p.price), cost, cfg.margin, src ? Number(src.shipping_mxn) : 0);
                const s = statusOf(p);
                const meta = STATUS_META[s];
                const isOpen = open === p.id;
                const low = m.margin !== null && (m.margin < cfg.rules.minMarginMxn || (m.marginPct ?? 0) < cfg.rules.minMarginPct);
                return (
                  <React.Fragment key={p.id}>
                    <tr className={`${isOpen ? 'is-open' : ''} ${busy === p.id ? 'is-busy' : ''}`}>
                      <td>
                        <button type="button" className="aut-rowbtn" onClick={() => setOpen(isOpen ? null : p.id)} aria-expanded={isOpen}>
                          {isOpen ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
                          <span className="aut-name"><strong title={p.name}>{p.name}</strong><span>{p.brand ?? '—'}</span><span className="aut-show-sm"><span className={`aut-tag ${meta.tone}`}>{meta.label}</span></span></span>
                        </button>
                      </td>
                      <td className="c-num"><b>{moneyMx(p.price)}</b></td>
                      <td className="c-num c-hide-sm">{moneyMx(m.costTotal)}</td>
                      <td className="c-num">
                        <span className={m.margin === null ? '' : m.margin < 0 ? 'aut-bad' : low ? 'aut-warn' : 'aut-ok'}>{moneyMx(m.margin)}</span>
                        {m.marginPct !== null && <span className="aut-cell-sub">{m.marginPct}%</span>}
                      </td>
                      <td className="c-hide-sm">
                        {src ? <span className="aut-name"><strong>{src.shop}</strong>{src.link ? <a className="aut-link" href={src.link} target="_blank" rel="noopener noreferrer">Ver oferta ↗</a> : <span>sin enlace</span>}</span> : '—'}
                      </td>
                      <td className="c-hide-sm">
                        <span className={`aut-tag ${meta.tone}`} title={p.sourcing_note ?? undefined}>{meta.label}</span>
                        <span className="aut-cell-sub">{p.sourcing_checked_at ? timeAgo(p.sourcing_checked_at) : 'nunca'}</span>
                        {p.sourcing_note && s !== 'ok' && <span className="aut-cell-sub aut-warn" style={{ maxWidth: 220, whiteSpace: 'normal' }}>{p.sourcing_note}</span>}
                      </td>
                      <td className="c-hide-sm">
                        <button type="button" role="switch" aria-checked={p.auto_price} aria-label={`Precio automático de ${p.name}`}
                          className={`aut-switch ${p.auto_price ? 'is-on' : ''}`} onClick={() => void toggleAuto(p)} disabled={busy === p.id}><span /></button>
                      </td>
                      <td className="c-act">
                        <button type="button" className="aut-btn aut-btn--xs" onClick={() => void checkNow(p)} disabled={busy === p.id}>
                          {busy === p.id ? <><RefreshCw size={12} className="aut-spin" aria-hidden="true" /> Revisando…</> : <>Revisar<span className="aut-hide-sm"> ahora</span></>}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="aut-detail"><td colSpan={8}><ProductDetail product={p} notify={notify} onSaved={load} /></td></tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          <p className="aut-foot">{shown.length} de {watched.length} · el precio se cambia solo en los que tienen <b>Auto</b> encendido</p>
        </div>
      )}
    </>
  );
}

function ProductDetail({ product, notify, onSaved }: { product: WatchedProduct; notify: (t: Toast) => void; onSaved: () => void }) {
  const [checks, setChecks] = useState<PriceCheck[] | null>(null);
  const [changes, setChanges] = useState<PriceChange[]>([]);
  const [q, setQ] = useState(product.search_query ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const [c, ch] = await Promise.all([
        supabase.from('product_price_checks').select('*').eq('product_id', product.id).order('checked_at', { ascending: false }).limit(8),
        supabase.from('product_price_changes').select('*').eq('product_id', product.id).order('changed_at', { ascending: false }).limit(8),
      ]);
      setChecks((c.data ?? []) as PriceCheck[]);
      setChanges((ch.data ?? []) as PriceChange[]);
    })();
  }, [product.id]);

  const saveQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('products').update({ search_query: q.trim() || null }).eq('id', product.id);
    setSaving(false);
    if (error) notify({ kind: 'error', text: error.message });
    else { notify({ kind: 'ok', text: 'Búsqueda guardada: se usa desde la próxima revisión.' }); onSaved(); }
  };

  return (
    <div className="aut-detail__grid">
      <div>
        <h4>Últimas revisiones</h4>
        {checks === null ? <div className="aut-skel" /> : checks.length === 0 ? <p className="aut-muted">Sin revisiones todavía.</p> : (
          <ul className="aut-list">
            {checks.map((c) => (
              <li key={c.id}>
                <span>
                  <span className={`aut-tag ${STATUS_META[c.status]?.tone ?? ''}`}>{STATUS_META[c.status]?.label ?? c.status}</span>{' '}
                  {c.best_shop ? <>{c.best_shop} a {moneyMx(c.best_unit_cost)}</> : c.note}
                  {c.market_low !== null && <span className="aut-cell-sub">Mercado {c.market_ref ? `típico ${moneyMx(c.market_ref)} · ` : ''}desde {moneyMx(c.market_low)} · piso {moneyMx(c.floor_price)} · {c.offers_exact} exactas</span>}
                </span>
                <span>{shortDateTime(c.checked_at)}{c.price_before !== c.price_after && c.price_after !== null ? <><br />{moneyMx(c.price_before)} → <b>{moneyMx(c.price_after)}</b></> : null}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h4>Cambios de precio</h4>
        {changes.length === 0 ? <p className="aut-muted">Sin cambios todavía.</p> : (
          <ul className="aut-list">
            {changes.map((c) => (
              <li key={c.id}><span>{moneyMx(c.old_price)} → <b>{moneyMx(c.new_price)}</b><span className="aut-cell-sub">{c.reason}</span></span><span>{shortDateTime(c.changed_at)}</span></li>
            ))}
          </ul>
        )}
        <form onSubmit={saveQuery} style={{ marginTop: 14 }}>
          <h4>Búsqueda exacta para revisar</h4>
          <div className="aut-inline">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${product.brand ?? ''} ${product.name}`.trim()} aria-label="Búsqueda exacta" maxLength={160} />
            <button type="submit" className="aut-btn" disabled={saving || q.trim() === (product.search_query ?? '')}><Save size={13} aria-hidden="true" /> {saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
          <small className="aut-muted">Incluye marca, línea, tamaño y SPF (ej. “ISDIN Fusion Water Magic SPF 50 50 ml”). Vacío = marca + nombre.</small>
        </form>
        <p style={{ marginTop: 10 }}>
          <Link className="aut-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} to={`/admin/abastecimiento?product=${product.id}`}>Ver todas las ofertas en Abastecimiento <ExternalLink size={11} aria-hidden="true" /></Link>
        </p>
      </div>
    </div>
  );
}

// ─── Pedidos por comprar ──────────────────────────────────────
function OrdersTab({ notify, onSchemaError }: { notify: (t: Toast) => void; onSchemaError: (m: string) => void }) {
  const [orders, setOrders] = useState<OrderLite[]>([]);
  const [onDemand, setOnDemand] = useState<Set<string>>(new Set());
  const [lastCheck, setLastCheck] = useState<Record<string, StoredCheck>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('orders').select('id,created_at,customer_name,total,status,items').eq('status', 'paid').order('created_at', { ascending: false }).limit(60);
    if (error) notify({ kind: 'error', text: error.message });
    const list = (data ?? []) as OrderLite[];
    const ids = [...new Set(list.flatMap((o) => (o.items ?? []).map((it) => it?.product?.id).filter(Boolean)))] as string[];
    const [prods, checks] = await Promise.all([
      ids.length ? supabase.from('products').select('id,fulfillment').in('id', ids) : Promise.resolve({ data: [] as Array<{ id: string; fulfillment: string }> }),
      list.length ? supabase.from('order_supplier_checks').select('order_id,checked_at,decision,margin_mxn,detail').in('order_id', list.map((o) => o.id)).order('checked_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    ]);
    if ('error' in checks && checks.error && isMissingSchema(checks.error.message)) onSchemaError(checks.error.message);
    const od = new Set(((prods.data ?? []) as Array<{ id: string; fulfillment: string }>).filter((p) => p.fulfillment === 'bajo_pedido').map((p) => p.id));
    const lc: Record<string, StoredCheck> = {};
    ((checks.data ?? []) as StoredCheck[]).forEach((c) => { if (!lc[c.order_id]) lc[c.order_id] = c; });
    setOnDemand(od);
    setOrders(list.filter((o) => (o.items ?? []).some((it) => od.has(it?.product?.id))));
    setLastCheck(lc);
    setLoading(false);
  }, [notify, onSchemaError]);
  useEffect(() => { void load(); }, [load]);

  const verify = async (o: OrderLite) => {
    setBusy(o.id);
    try {
      const r = await callAuto<{ result: VerifyResult }>('verify-order', { orderId: o.id });
      setLastCheck((m) => ({ ...m, [o.id]: { order_id: o.id, checked_at: new Date().toISOString(), decision: r.result.decision, margin_mxn: r.result.margin, detail: r.result.detail } }));
      notify({ kind: r.result.decision === 'suspender' ? 'error' : 'ok', text: `Pedido ${o.id.slice(0, 8)}: ${DECISION_META[r.result.decision].label}` });
    } catch (e) {
      notify({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="aut-table-wrap" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="aut-skel" />)}</div>;
  if (!orders.length) return <div className="aut-empty"><ShieldCheck size={28} aria-hidden="true" /><p>No hay pedidos pagados con productos bajo pedido pendientes de enviar.</p></div>;

  return (
    <>
      <div className="aut-alert" role="note">
        <ShieldCheck size={16} aria-hidden="true" />
        <div>Antes de comprarle al proveedor, verifica: se consulta en vivo precio y existencia. <b>Comprar</b> = mismo proveedor y margen sano · <b>Cambiar</b> = hay otro proveedor válido · <b>Suspender</b> = sin proveedor o comprar deja pérdida (contacta al cliente o reembolsa).</div>
      </div>
      <div className="aut-table-wrap">
        <table className="aut-table">
          <thead>
            <tr>
              <th scope="col">Pedido</th>
              <th scope="col" className="c-hide-sm">Cliente</th>
              <th scope="col">Productos bajo pedido</th>
              <th scope="col" className="c-num">Total</th>
              <th scope="col">Verificación</th>
              <th scope="col" className="c-act"><span className="aut-vh">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const lc = lastCheck[o.id];
              const items = (o.items ?? []).filter((it) => onDemand.has(it?.product?.id));
              return (
                <React.Fragment key={o.id}>
                  <tr className={busy === o.id ? 'is-busy' : ''}>
                    <td><b style={{ fontFamily: 'ui-monospace, monospace' }}>{o.id.slice(0, 8)}</b><span className="aut-cell-sub">{shortDateTime(o.created_at)}</span></td>
                    <td className="c-hide-sm">{o.customer_name ?? '—'}</td>
                    <td>{items.map((it) => <span key={it.product.id} className="aut-cell-sub" style={{ color: 'inherit' }}>{it.quantity}× {it.product.name}</span>)}</td>
                    <td className="c-num">{moneyMx(o.total)}</td>
                    <td>
                      {lc ? <><span className={`aut-tag ${DECISION_META[lc.decision].tone}`}>{DECISION_META[lc.decision].label}</span><span className="aut-cell-sub">{timeAgo(lc.checked_at)} · margen {moneyMx(lc.margin_mxn)}</span></> : <span className="aut-muted">Sin verificar</span>}
                    </td>
                    <td className="c-act">
                      <button type="button" className="aut-btn aut-btn--xs aut-btn--primary" onClick={() => void verify(o)} disabled={busy === o.id}>
                        {busy === o.id ? <><RefreshCw size={12} className="aut-spin" aria-hidden="true" /> Consultando…</> : lc ? 'Verificar de nuevo' : 'Verificar proveedor'}
                      </button>
                    </td>
                  </tr>
                  {lc && (
                    <tr className="aut-detail">
                      <td colSpan={6}>
                        <div style={{ padding: '6px 12px 12px' }}>
                          <table className="aut-table">
                            <tbody>
                              {lc.detail.map((d, i) => (
                                <tr key={i}>
                                  <td><span className={`aut-tag ${ITEM_META[d.status].tone}`}>{ITEM_META[d.status].label}</span></td>
                                  <td><span className="aut-name"><strong>{d.qty}× {d.name}</strong><span>{d.note}</span></span></td>
                                  <td className="c-hide-sm">{d.shop ? <>{d.shop}{d.seller ? ` · ${d.seller}` : ''}{d.previous_shop && d.previous_shop !== d.shop ? <span className="aut-cell-sub">antes: {d.previous_shop}</span> : null}</> : '—'}</td>
                                  <td className="c-num">{d.unit_cost !== undefined ? <>{moneyMx(d.unit_cost)}<span className="aut-cell-sub">+ envío {moneyMx(d.shipping)}</span></> : '—'}</td>
                                  <td className="c-num"><span className={d.margin == null ? '' : d.margin < 0 ? 'aut-bad' : 'aut-ok'}>{moneyMx(d.margin ?? null)}</span></td>
                                  <td className="c-act">{d.link && d.status !== 'suspender' ? <a className="aut-btn aut-btn--xs" href={d.link} target="_blank" rel="noopener noreferrer">Comprar ↗</a> : null}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        <p className="aut-foot">Al terminar la compra, marca el pedido como enviado en <Link className="aut-link" to="/admin/reportes">Pedidos</Link>.</p>
      </div>
    </>
  );
}

// ─── Reglas ───────────────────────────────────────────────────
const RULE_FIELDS: Array<{ key: keyof AutoConfig['rules']; label: string; hint: string; suffix: string; min: number; max: number; step: number }> = [
  { key: 'minMarginPct', label: 'Ganancia mínima (%)', hint: 'Del precio de venta, ya con costo, envíos y comisión de Clip.', suffix: '%', min: 0, max: 80, step: 0.5 },
  { key: 'minMarginMxn', label: 'Ganancia mínima ($ por pieza)', hint: 'Se usa lo mayor entre el % y estos pesos.', suffix: '$', min: 0, max: 5000, step: 1 },
  { key: 'undercutPct', label: 'Competir: por debajo del mercado (%)', hint: 'Cuánto debajo del precio más bajo del mismo producto exacto.', suffix: '%', min: 0, max: 30, step: 0.5 },
  { key: 'maxChangePct', label: 'Tope de cambio por revisión (%)', hint: 'Protege de datos raros. Si el costo obliga a subir más, sube igual.', suffix: '%', min: 0, max: 100, step: 1 },
  { key: 'maxDeliveryDays', label: 'Entrega del proveedor (días máx.)', hint: '1 = al día siguiente.', suffix: 'días', min: 0, max: 15, step: 1 },
  { key: 'checkHours', label: 'Revisar cada (horas)', hint: 'Cada revisión consume una búsqueda de Bright Data por producto.', suffix: 'h', min: 1, max: 72, step: 1 },
];

function RulesTab({ cfg, onSaved, notify }: { cfg: AutoConfig; onSaved: (c: AutoConfig) => void; notify: (t: Toast) => void }) {
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(RULE_FIELDS.map((f) => [f.key, String(cfg.rules[f.key])])));
  const [enabled, setEnabled] = useState(cfg.enabled);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const errors = Object.fromEntries(RULE_FIELDS.map((f) => {
    const n = Number(v[f.key]);
    return [f.key, v[f.key] === '' || !Number.isFinite(n) || n < f.min || n > f.max ? `Entre ${f.min} y ${f.max}` : ''];
  }));
  const hasErrors = Object.values(errors).some(Boolean);
  const dirty = enabled !== cfg.enabled || RULE_FIELDS.some((f) => Number(v[f.key]) !== cfg.rules[f.key]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (hasErrors) return;
    setSaving(true);
    const values: Record<string, string> = { auto_enabled: String(enabled) };
    RULE_FIELDS.forEach((f) => { values[AUTO_KEYS[f.key]] = String(Number(v[f.key])); });
    const err = await saveConfig(values);
    setSaving(false);
    if (err) { notify({ kind: 'error', text: err }); return; }
    onSaved({ ...cfg, enabled, rules: Object.fromEntries(RULE_FIELDS.map((f) => [f.key, Number(v[f.key])])) as unknown as AutoConfig['rules'] });
  };

  return (
    <form className="aut-form" onSubmit={submit} noValidate>
      {RULE_FIELDS.map((f) => (
        <div key={f.key} className="aut-field">
          <label htmlFor={`r-${f.key}`}>{f.label}</label>
          <input id={`r-${f.key}`} type="number" inputMode="decimal" min={f.min} max={f.max} step={f.step}
            value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} aria-invalid={touched && !!errors[f.key]} />
          <small className={touched && errors[f.key] ? 'aut-bad' : ''}>{touched && errors[f.key] ? errors[f.key] : f.hint}</small>
        </div>
      ))}
      <div className="aut-field aut-field--wide">
        <small>
          La comisión de Clip, el envío del proveedor y el envío que absorbes se configuran en{' '}
          <Link className="aut-link" to="/admin/abastecimiento">Abastecimiento → Ajustes de margen</Link>
          {' '}(hoy: Clip {cfg.margin.clipFeePct}%{cfg.margin.ivaOnFee ? ' + IVA' : ''}).
        </small>
      </div>
      <div className="aut-form__foot">
        <label className="aut-toggle">
          <button type="button" role="switch" aria-checked={enabled} className={`aut-switch ${enabled ? 'is-on' : ''}`} onClick={() => setEnabled((x) => !x)}><span /></button>
          {enabled ? 'Automatización encendida' : 'Automatización apagada (no revisa ni cambia precios)'}
        </label>
        <button type="submit" className="aut-btn aut-btn--primary" disabled={saving || !dirty}>{saving ? 'Guardando…' : 'Guardar reglas'}</button>
      </div>
    </form>
  );
}
