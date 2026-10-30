/**
 * AdminAuto.tsx — Catálogo → Precios automáticos (/admin/automatizacion)
 * 1) Productos vigilados: venta, costo, ganancia, proveedor, vínculo, estado y Automatizar; editar, eliminar, dejar de vigilar.
 *    Cada N horas (pg_cron → /api/sourcing-auto) se revisa la misma oferta elegida y la venta sigue al costo (banda de ganancia).
 * 2) Pedidos por comprar: verificación en vivo del proveedor antes de comprarle (comprar · cambiar · suspender).
 * 3) Reglas: ganancia mínima y máxima, frecuencia.
 * Migración: supabase/migrations/20261029120000_sourcing_auto.sql
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot, RefreshCw, Search, X, ExternalLink, AlertTriangle, ShieldCheck, Save, PackageCheck, Plus, Pencil, Trash2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { bandPrice, computeMargin, round2, timeAgo } from '../../lib/sourcing';
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
interface PrimarySource {
  id: string; product_id: string; shop: string; offer_title: string | null; link: string | null;
  unit_cost_mxn: number; shipping_mxn: number; last_checked_at: string | null; available: boolean | null;
}
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
  ok: { label: 'Al día', tone: 't-ok' },
  sin_proveedor: { label: 'Sin oferta · retirado', tone: 't-bad' },
  sin_datos: { label: 'Google no respondió', tone: 't-warn' },
  error: { label: 'Error al revisar', tone: 't-bad' },
  pendiente: { label: 'Por revisar', tone: 't-info' },
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
            Cada {cfg?.rules.checkHours ?? 5} h se revisa <b>la misma oferta</b> de la que sacaste cada producto. Si el costo sube o baja, tu venta se mueve igual,
            siempre con ganancia de {cfg?.rules.minMarginPct ?? 25}–{cfg?.rules.maxMarginPct ?? 35}%. Si la oferta desaparece se usa otra tienda autorizada
            con el mismo producto; si no hay, se retira de la venta hasta que vuelva.
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
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [prods, srcs, ch] = await Promise.all([
      supabase.from('products')
        .select('id,name,slug,brand,price,cost_price,in_stock,fulfillment,auto_price,auto_hidden,sourcing_status,sourcing_note,sourcing_checked_at,search_query')
        .eq('fulfillment', 'bajo_pedido').order('name').limit(1000),
      supabase.from('product_sources').select('id,product_id,shop,offer_title,link,unit_cost_mxn,shipping_mxn,last_checked_at,available').eq('is_primary', true),
      supabase.from('product_price_changes').select('id', { count: 'exact', head: true }).gte('changed_at', new Date(Date.now() - 86400_000).toISOString()),
    ]);
    if (prods.error) { onSchemaError(isMissingSchema(prods.error.message) ? prods.error.message : ''); if (!isMissingSchema(prods.error.message)) notify({ kind: 'error', text: prods.error.message }); }
    setRows((prods.data ?? []) as WatchedProduct[]);
    setSources(Object.fromEntries(((srcs.data ?? []) as PrimarySource[]).map((x) => [x.product_id, x])));
    setChanges24(ch.count ?? 0);
    setLoading(false);
  }, [notify, onSchemaError]);
  useEffect(() => { void load(); }, [load]);

  const watched = rows.filter((p) => sources[p.id]);
  const unassigned = rows.filter((p) => !sources[p.id]);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { todos: watched.length, ok: 0, sin_proveedor: 0, pendiente: 0, error: 0 };
    watched.forEach((p) => {
      const st = statusOf(p);
      if (st === 'ok') c.ok += 1; else if (st === 'sin_proveedor') c.sin_proveedor += 1; else if (st === 'pendiente') c.pendiente += 1; else c.error += 1;
    });
    return c;
  }, [watched]);

  const shown = watched.filter((p) => {
    const st = statusOf(p);
    if (filter !== 'todos' && (filter === 'error' ? !['error', 'sin_datos'].includes(st) : st !== filter)) return false;
    const q = query.trim().toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || (p.brand ?? '').toLowerCase().includes(q) || (sources[p.id]?.shop ?? '').toLowerCase().includes(q);
  });

  const checkNow = async (p: WatchedProduct) => {
    setBusy(p.id);
    try {
      const r = await callAuto<{ result: { status: string; price?: number; changed?: boolean; shop?: string; cost?: number; switched?: boolean; note?: string } }>('check', { productId: p.id });
      const x = r.result;
      notify({
        kind: x.status === 'ok' ? 'ok' : 'error',
        text: x.status === 'ok'
          ? `${p.name}: ${x.switched ? 'nuevo proveedor ' : ''}${x.shop} a ${moneyMx(x.cost)} · ${x.changed ? `venta ajustada a ${moneyMx(x.price)}` : `venta sin cambio (${moneyMx(x.price)})`}`
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
    // Al encender se revisa en la siguiente vuelta (cada 10 min)
    const patch = p.auto_price ? { auto_price: false } : { auto_price: true, sourcing_checked_at: null };
    const { error } = await supabase.from('products').update(patch).eq('id', p.id);
    setBusy(null);
    if (error) { notify({ kind: 'error', text: error.message }); return; }
    setRows((list) => list.map((x) => (x.id === p.id ? { ...x, ...patch } : x)));
    notify({ kind: 'ok', text: p.auto_price ? `${p.name}: automatización apagada, el precio queda fijo.` : `${p.name}: automatizado, se revisa en los próximos minutos.` });
  };

  const removeProduct = async (p: WatchedProduct) => {
    setBusy(p.id);
    const { error } = await supabase.from('products').delete().eq('id', p.id);
    setBusy(null);
    setConfirm(null);
    if (error) { notify({ kind: 'error', text: `No se pudo eliminar: ${error.message}` }); return; }
    setRows((list) => list.filter((x) => x.id !== p.id));
    notify({ kind: 'ok', text: `"${p.name}" eliminado.` });
  };

  const unwatch = async (p: WatchedProduct) => {
    setBusy(p.id);
    const { error } = await supabase.from('product_sources').delete().eq('product_id', p.id);
    setBusy(null);
    if (error) { notify({ kind: 'error', text: error.message }); return; }
    setOpen(null);
    setSources((m) => { const n = { ...m }; delete n[p.id]; return n; });
    notify({ kind: 'ok', text: `"${p.name}" ya no se vigila. Sigue en Productos.` });
  };

  const due = watched.filter((p) => p.auto_price && (!p.sourcing_checked_at || Date.now() - new Date(p.sourcing_checked_at).getTime() > cfg.rules.checkHours * 3600_000)).length;
  const autoCount = watched.filter((p) => p.auto_price).length;

  return (
    <>
      <div className="aut-kpis">
        <div className="aut-kpi"><span className="aut-kpi__label">Vigilados</span><span className="aut-kpi__value">{watched.length}</span><span className="aut-kpi__hint">{autoCount} automatizados</span></div>
        <div className="aut-kpi"><span className="aut-kpi__label">Al día</span><span className="aut-kpi__value aut-ok">{counts.ok}</span></div>
        <div className="aut-kpi"><span className="aut-kpi__label">Retirados sin oferta</span><span className={`aut-kpi__value ${counts.sin_proveedor ? 'aut-bad' : ''}`}>{counts.sin_proveedor}</span></div>
        <div className="aut-kpi"><span className="aut-kpi__label">Cambios de precio 24 h</span><span className="aut-kpi__value">{changes24}</span></div>
        <div className="aut-kpi"><span className="aut-kpi__label">Por revisar</span><span className="aut-kpi__value">{due}</span><span className="aut-kpi__hint">se procesan cada 10 min</span></div>
      </div>

      {unassigned.length > 0 && (
        <div className="aut-alert aut-alert--warn" role="status">
          <AlertTriangle size={16} aria-hidden="true" />
          <div>
            {unassigned.length} producto{unassigned.length === 1 ? '' : 's'} bajo pedido sin oferta elegida: no se vigila{unassigned.length === 1 ? '' : 'n'}. Búscalo en Abastecimiento y usa <b>+ Mi stock</b> en la oferta:{' '}
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
          {([['todos', 'Todos'], ['ok', 'Al día'], ['sin_proveedor', 'Retirados'], ['pendiente', 'Por revisar'], ['error', 'Con error']] as Array<[Filter, string]>).map(([k, l]) => (
            <button key={k} type="button" className={`aut-chip ${filter === k ? 'is-on' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} <em>{counts[k]}</em></button>
          ))}
        </div>
        <button type="button" className="aut-btn" onClick={() => void load()} disabled={loading}><RefreshCw size={13} className={loading ? 'aut-spin' : ''} aria-hidden="true" /> Actualizar</button>
        <Link className="aut-btn aut-btn--primary" to="/admin/abastecimiento"><Plus size={13} aria-hidden="true" /> Agregar desde Abastecimiento</Link>
      </div>

      {loading ? (
        <div className="aut-table-wrap" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="aut-skel" />)}</div>
      ) : watched.length === 0 ? (
        <div className="aut-empty">
          <PackageCheck size={28} aria-hidden="true" />
          <p>Aún no hay productos vigilados. En <Link className="aut-link" to="/admin/abastecimiento">Abastecimiento</Link> busca (o pega la liga de Amazon / Mercado Libre) y usa <b>+ Mi stock</b> en la oferta: desde ahí se vigila sola.</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="aut-empty"><p>Ningún producto con este filtro.</p><button type="button" className="aut-btn aut-btn--xs" onClick={() => { setFilter('todos'); setQuery(''); }}>Quitar filtros</button></div>
      ) : (
        <div className="aut-table-wrap">
          <table className="aut-table">
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col" className="c-num">Venta</th>
                <th scope="col" className="c-num">Costo</th>
                <th scope="col" className="c-num">Ganancia</th>
                <th scope="col" className="c-hide-sm">Proveedor</th>
                <th scope="col" className="c-hide-sm">Vínculo</th>
                <th scope="col" className="c-hide-sm">Estado</th>
                <th scope="col">Automatizar</th>
                <th scope="col" className="c-act"><span className="aut-vh">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const src = sources[p.id];
                const m = computeMargin(Number(p.price), Number(src.unit_cost_mxn), cfg.margin, Number(src.shipping_mxn) || 0);
                const st = statusOf(p);
                const meta = STATUS_META[st];
                const isOpen = open === p.id;
                const pct = m.marginPct;
                const tone = m.margin === null ? '' : m.margin < 0 || (pct ?? 0) < cfg.rules.minMarginPct - 0.5 ? 'aut-bad' : (pct ?? 0) > cfg.rules.maxMarginPct + 0.5 ? 'aut-warn' : 'aut-ok';
                const nextIn = p.auto_price && p.sourcing_checked_at
                  ? Math.max(0, cfg.rules.checkHours - (Date.now() - new Date(p.sourcing_checked_at).getTime()) / 3600_000)
                  : null;
                return (
                  <React.Fragment key={p.id}>
                    <tr className={`${isOpen ? 'is-open' : ''} ${busy === p.id ? 'is-busy' : ''}`}>
                      <td>
                        <span className="aut-name">
                          <strong title={p.name}>{p.name}</strong>
                          <span>{p.brand ?? '—'}{!p.in_stock && <> · <b className="aut-bad">fuera de venta</b></>}</span>
                          <span className="aut-show-sm"><span className={`aut-tag ${meta.tone}`}>{meta.label}</span> {src.shop}</span>
                        </span>
                      </td>
                      <td className="c-num"><b>{moneyMx(p.price)}</b></td>
                      <td className="c-num">{moneyMx(m.costTotal)}</td>
                      <td className="c-num">
                        <span className={tone} title={`Banda: ${cfg.rules.minMarginPct}–${cfg.rules.maxMarginPct}%`}>{moneyMx(m.margin)}</span>
                        {pct !== null && <span className="aut-cell-sub">{pct}%</span>}
                      </td>
                      <td className="c-hide-sm"><span className="aut-name aut-name--src"><strong>{src.shop}</strong><span title={src.offer_title ?? undefined}>{src.offer_title ?? '—'}</span></span></td>
                      <td className="c-hide-sm c-nowrap">
                        {src.link
                          ? <a className="aut-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} href={src.link} target="_blank" rel="noopener noreferrer" title={src.offer_title ?? undefined}>Ver oferta <ExternalLink size={11} aria-hidden="true" /></a>
                          : <span className="aut-muted">sin enlace</span>}
                      </td>
                      <td className="c-hide-sm c-state">
                        <span className={`aut-tag ${meta.tone}`} title={p.sourcing_note ?? undefined}>{meta.label}</span>
                        <span className="aut-cell-sub" title={p.sourcing_checked_at ? shortDateTime(p.sourcing_checked_at) : undefined}>
                          {p.sourcing_checked_at ? timeAgo(p.sourcing_checked_at) : 'sin revisar'}
                          {nextIn !== null ? ` · próxima ${nextIn < 1 ? 'en minutos' : `en ${Math.round(nextIn)} h`}` : ''}
                        </span>
                        {p.sourcing_note && st !== 'ok' && <span className="aut-cell-sub aut-warn aut-note" title={p.sourcing_note}>{p.sourcing_note}</span>}
                      </td>
                      <td>
                        <button type="button" role="switch" aria-checked={p.auto_price} aria-label={`Automatizar ${p.name}`}
                          title={p.auto_price ? `Se revisa cada ${cfg.rules.checkHours} h y el precio sigue al costo. Clic para dejarlo fijo.` : 'Precio fijo. Clic para automatizar.'}
                          className={`aut-switch ${p.auto_price ? 'is-on' : ''}`} onClick={() => void toggleAuto(p)} disabled={busy === p.id}><span /></button>
                      </td>
                      <td className="c-act">
                        {confirm === p.id ? (
                          <span className="aut-inline">
                            <span className="aut-bad">¿Eliminar producto?</span>
                            <button type="button" className="aut-btn aut-btn--xs aut-btn--danger" onClick={() => void removeProduct(p)} disabled={busy === p.id}>Sí</button>
                            <button type="button" className="aut-btn aut-btn--xs" onClick={() => setConfirm(null)}>No</button>
                          </span>
                        ) : (
                          <span className="aut-inline">
                            <button type="button" className="aut-btn aut-btn--xs" onClick={() => void checkNow(p)} disabled={busy === p.id}>
                              {busy === p.id ? <><RefreshCw size={12} className="aut-spin" aria-hidden="true" /> Revisando…</> : 'Revisar'}
                            </button>
                            <button type="button" className={`aut-btn aut-btn--xs ${isOpen ? 'aut-btn--primary' : ''}`} onClick={() => setOpen(isOpen ? null : p.id)} aria-expanded={isOpen} aria-label={`Editar ${p.name}`} title="Editar precio, búsqueda e historial">
                              <Pencil size={12} aria-hidden="true" />
                            </button>
                            <button type="button" className="aut-btn aut-btn--xs aut-btn--danger" onClick={() => setConfirm(p.id)} aria-label={`Eliminar ${p.name}`} title="Eliminar producto">
                              <Trash2 size={12} aria-hidden="true" />
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="aut-detail"><td colSpan={9}><ProductDetail product={p} source={src} cfg={cfg} notify={notify} onSaved={load} onUnwatch={() => void unwatch(p)} /></td></tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          <p className="aut-foot">{shown.length} de {watched.length} · con <b>Automatizar</b> encendido se revisa la misma oferta cada {cfg.rules.checkHours} h y la venta sigue al costo con ganancia de {cfg.rules.minMarginPct}–{cfg.rules.maxMarginPct}%</p>
        </div>
      )}
    </>
  );
}

function ProductDetail({ product, source, cfg, notify, onSaved, onUnwatch }: {
  product: WatchedProduct; source: PrimarySource; cfg: AutoConfig; notify: (t: Toast) => void; onSaved: () => void; onUnwatch: () => void;
}) {
  const [checks, setChecks] = useState<PriceCheck[] | null>(null);
  const [changes, setChanges] = useState<PriceChange[]>([]);
  const [q, setQ] = useState(product.search_query ?? '');
  const [price, setPrice] = useState(String(product.price ?? ''));
  const [saving, setSaving] = useState(false);
  const cost = round2(Number(source.unit_cost_mxn) + (Number(source.shipping_mxn) || 0));
  const band = bandPrice({ cost, settings: cfg.margin, rules: cfg.rules });
  const priceNum = Number(price);
  const priceErr = price.trim() === '' || !Number.isFinite(priceNum) || priceNum <= 0 ? 'Pon un precio válido' : '';
  const dirty = q.trim() !== (product.search_query ?? '') || (!priceErr && priceNum !== Number(product.price));

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

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (priceErr) return;
    setSaving(true);
    const patch: Record<string, unknown> = { search_query: q.trim() || null };
    if (priceNum !== Number(product.price)) patch.price = priceNum;
    const { error } = await supabase.from('products').update(patch).eq('id', product.id);
    if (!error && patch.price !== undefined) {
      await supabase.from('product_price_changes').insert({
        product_id: product.id, old_price: Number(product.price), new_price: priceNum, unit_cost: cost, reason: 'Cambio manual', source: 'manual',
      }).then(() => undefined, () => undefined);
    }
    setSaving(false);
    if (error) notify({ kind: 'error', text: error.message });
    else { notify({ kind: 'ok', text: 'Guardado.' }); onSaved(); }
  };

  return (
    <div className="aut-detail__grid">
      <form onSubmit={save} noValidate>
        <h4>Editar</h4>
        <div className="aut-field">
          <label htmlFor={`pv-${product.id}`}>Precio de venta</label>
          <input id={`pv-${product.id}`} type="number" inputMode="decimal" min={1} step={1} value={price} onChange={(e) => setPrice(e.target.value)} aria-invalid={!!priceErr} />
          <small className={priceErr ? 'aut-bad' : ''}>
            {priceErr || `Con costo ${moneyMx(cost)}: ${cfg.rules.minMarginPct}% = ${moneyMx(band.lo)} · ${cfg.rules.maxMarginPct}% = ${moneyMx(band.hi)}${product.auto_price ? '. Con Automatizar encendido, la siguiente revisión lo regresa a ese rango.' : ''}`}
          </small>
        </div>
        <div className="aut-field" style={{ marginTop: 8 }}>
          <label htmlFor={`sq-${product.id}`}>Búsqueda con la que se revisa</label>
          <input id={`sq-${product.id}`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={source.offer_title ?? `${product.brand ?? ''} ${product.name}`.trim()} maxLength={160} />
          <small className="aut-muted">La misma con la que lo encontraste. En ella se localiza la oferta de <b>{source.shop}</b>; si desaparece, se usa la tienda autorizada más barata con el mismo producto, y si no hay, se retira de la venta.</small>
        </div>
        <div className="aut-inline" style={{ marginTop: 10, flexWrap: 'wrap' }}>
          <button type="submit" className="aut-btn aut-btn--primary" disabled={saving || !dirty || !!priceErr}><Save size={13} aria-hidden="true" /> {saving ? 'Guardando…' : 'Guardar'}</button>
          <Link className="aut-btn" to={`/admin/abastecimiento?product=${product.id}`}>Cambiar oferta en Abastecimiento <ExternalLink size={11} aria-hidden="true" /></Link>
          <button type="button" className="aut-btn" onClick={onUnwatch}>Dejar de vigilar</button>
        </div>
      </form>
      <div>
        <h4>Últimas revisiones</h4>
        {checks === null ? <div className="aut-skel" /> : checks.length === 0 ? <p className="aut-muted">Sin revisiones todavía.</p> : (
          <ul className="aut-list">
            {checks.map((c) => (
              <li key={c.id}>
                <span>
                  <span className={`aut-tag ${STATUS_META[c.status]?.tone ?? ''}`}>{STATUS_META[c.status]?.label ?? c.status}</span>{' '}
                  {c.best_shop ? <>{c.best_shop} a {moneyMx(c.best_unit_cost)}</> : c.note}
                  {c.best_shop && c.note && <span className="aut-cell-sub">{c.note}</span>}
                </span>
                <span>{shortDateTime(c.checked_at)}{c.price_before !== c.price_after && c.price_after !== null ? <><br />{moneyMx(c.price_before)} → <b>{moneyMx(c.price_after)}</b></> : null}</span>
              </li>
            ))}
          </ul>
        )}
        <h4 style={{ marginTop: 12 }}>Cambios de precio</h4>
        {changes.length === 0 ? <p className="aut-muted">Sin cambios todavía.</p> : (
          <ul className="aut-list">
            {changes.map((c) => (
              <li key={c.id}><span>{moneyMx(c.old_price)} → <b>{moneyMx(c.new_price)}</b><span className="aut-cell-sub">{c.reason}</span></span><span>{shortDateTime(c.changed_at)}</span></li>
            ))}
          </ul>
        )}
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
const RULE_FIELDS: Array<{ key: 'minMarginPct' | 'maxMarginPct' | 'checkHours'; label: string; hint: string; suffix: string; min: number; max: number; step: number }> = [
  { key: 'minMarginPct', label: 'Ganancia mínima (%)', hint: 'Del precio de venta, ya con costo, envíos y comisión de Clip. Nunca se vende por debajo.', suffix: '%', min: 0, max: 80, step: 0.5 },
  { key: 'maxMarginPct', label: 'Ganancia máxima (%)', hint: 'Si el costo baja, tu precio baja hasta quedar en este máximo.', suffix: '%', min: 0, max: 90, step: 0.5 },
  { key: 'checkHours', label: 'Revisar cada (horas)', hint: 'Cada revisión consume 1–2 búsquedas de Bright Data por producto.', suffix: 'h', min: 1, max: 72, step: 1 },
];

function RulesTab({ cfg, onSaved, notify }: { cfg: AutoConfig; onSaved: (c: AutoConfig) => void; notify: (t: Toast) => void }) {
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(RULE_FIELDS.map((f) => [f.key, String(cfg.rules[f.key])])));
  const [enabled, setEnabled] = useState(cfg.enabled);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const errors = Object.fromEntries(RULE_FIELDS.map((f) => {
    const n = Number(v[f.key]);
    return [f.key, v[f.key] === '' || !Number.isFinite(n) || n < f.min || n > f.max ? `Entre ${f.min} y ${f.max}`
      : f.key === 'maxMarginPct' && n < Number(v.minMarginPct) ? 'Debe ser mayor o igual a la mínima' : ''];
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
    onSaved({ ...cfg, enabled, rules: { ...cfg.rules, ...Object.fromEntries(RULE_FIELDS.map((f) => [f.key, Number(v[f.key])])) } });
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
