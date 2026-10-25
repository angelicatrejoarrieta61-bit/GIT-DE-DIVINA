/**
 * AdminCoupons.tsx — Ventas → Códigos de descuento (/admin/cupones)
 * Crear, generar, editar, pausar y borrar cupones que la clienta usa en el carrito y el checkout.
 * Datos: tabla `coupons` (Supabase) + usos contados desde `orders.coupon_code` (solo pagados).
 * Migración: supabase/migrations/20261025120000_coupons.sql
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  TicketPercent, Plus, Sparkles, Search, X, Pencil, Trash2, Copy, Check, RefreshCw, AlertTriangle,
} from 'lucide-react';
import {
  listCoupons, saveCoupon, deleteCoupon, setCouponActive, getCouponUsage, generateCode,
  couponLabel, couponDiscount, couponState, normalizeCode, CODE_PATTERN,
  type Coupon, type CouponInput, type CouponType, type CouponUsage, type CouponState,
} from '../../lib/coupons';
import { shippingFor } from '../../lib/shipping';
import './AdminCoupons.css';

// ─── Utilidades ───────────────────────────────────────────────
const money = (n: number) => Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const shortDate = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '';
/** ISO → valor de <input type="datetime-local"> en la hora local del navegador. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

const STATE_META: Record<CouponState, { label: string; tone: string }> = {
  active: { label: 'Vigente', tone: 't-ok' },
  scheduled: { label: 'Programado', tone: 't-info' },
  paused: { label: 'Pausado', tone: 't-mute' },
  expired: { label: 'Vencido', tone: 't-bad' },
  exhausted: { label: 'Agotado', tone: 't-warn' },
};
type Filter = 'all' | CouponState;
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'active', label: 'Vigentes' },
  { key: 'scheduled', label: 'Programados' },
  { key: 'paused', label: 'Pausados' },
  { key: 'expired', label: 'Vencidos' },
  { key: 'exhausted', label: 'Agotados' },
];

const EMPTY_USAGE: CouponUsage = { uses: 0, discount: 0, sales: 0 };
type Toast = { kind: 'ok' | 'error'; text: string } | null;

// ─── Página ───────────────────────────────────────────────────
export const AdminCoupons: React.FC = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [usage, setUsage] = useState<Record<string, CouponUsage>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<{ coupon: Coupon | null; seedCode?: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const [list, use] = await Promise.all([listCoupons(), getCouponUsage()]);
    if (list.error) setLoadError(list.error);
    setCoupons(list.data);
    setUsage(use);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const usageOf = (c: Coupon) => usage[c.code] ?? EMPTY_USAGE;

  const rows = useMemo(() => {
    const q = normalizeCode(query);
    const qText = query.trim().toLowerCase();
    return coupons
      .map((c) => ({ c, u: usage[c.code] ?? EMPTY_USAGE, s: couponState(c, (usage[c.code] ?? EMPTY_USAGE).uses) }))
      .filter(({ c, s }) => (filter === 'all' || s === filter)
        && (!qText || c.code.includes(q) || (c.description || '').toLowerCase().includes(qText)));
  }, [coupons, usage, query, filter]);

  const counts = useMemo(() => {
    const out: Record<Filter, number> = { all: coupons.length, active: 0, scheduled: 0, paused: 0, expired: 0, exhausted: 0 };
    coupons.forEach((c) => { out[couponState(c, (usage[c.code] ?? EMPTY_USAGE).uses)] += 1; });
    return out;
  }, [coupons, usage]);

  const totals = useMemo(() => (Object.values(usage) as CouponUsage[]).reduce<CouponUsage>(
    (a, u) => ({ uses: a.uses + u.uses, discount: a.discount + u.discount, sales: a.sales + u.sales }),
    { uses: 0, discount: 0, sales: 0 },
  ), [usage]);

  // "Could not find the table 'public.coupons' in the schema cache" / "relation ... does not exist"
  const missingTable = /schema cache|does not exist/i.test(loadError);

  // ── Acciones ──
  const handleToggle = async (c: Coupon) => {
    setBusyId(c.id);
    const err = await setCouponActive(c.id, !c.active);
    setBusyId(null);
    if (err) { setToast({ kind: 'error', text: `No se pudo cambiar: ${err}` }); return; }
    setCoupons((list) => list.map((x) => (x.id === c.id ? { ...x, active: !c.active } : x)));
    setToast({ kind: 'ok', text: `${c.code} ${c.active ? 'pausado' : 'activado'}` });
  };

  const handleDelete = async (c: Coupon) => {
    setBusyId(c.id);
    const err = await deleteCoupon(c.id);
    setBusyId(null);
    setConfirmDel(null);
    if (err) { setToast({ kind: 'error', text: `No se pudo borrar: ${err}` }); return; }
    setCoupons((list) => list.filter((x) => x.id !== c.id));
    setToast({ kind: 'ok', text: `${c.code} eliminado` });
  };

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      window.setTimeout(() => setCopied((v) => (v === code ? null : v)), 1500);
    } catch {
      setToast({ kind: 'error', text: 'No se pudo copiar' });
    }
  };

  const handleSaved = (saved: Coupon, isNew: boolean) => {
    setCoupons((list) => (isNew ? [saved, ...list] : list.map((x) => (x.id === saved.id ? saved : x))));
    setEditing(null);
    setToast({ kind: 'ok', text: `${saved.code} ${isNew ? 'creado' : 'guardado'}` });
  };

  return (
    <div className="cpn">
      {/* Encabezado */}
      <header className="cpn-head">
        <div>
          <h1 className="cpn-title"><TicketPercent size={20} aria-hidden="true" /> Códigos de descuento</h1>
          <p className="cpn-sub">Se aplican en el carrito y el checkout. Los usos cuentan solo pedidos pagados.</p>
        </div>
        <div className="cpn-head__actions">
          <button type="button" className="cpn-btn" onClick={() => void load()} disabled={loading} aria-label="Actualizar">
            <RefreshCw size={13} className={loading ? 'cpn-spin' : ''} aria-hidden="true" /> Actualizar
          </button>
          <button type="button" className="cpn-btn" onClick={() => setEditing({ coupon: null, seedCode: generateCode() })} disabled={missingTable}>
            <Sparkles size={13} aria-hidden="true" /> Generar código
          </button>
          <button type="button" className="cpn-btn cpn-btn--primary" onClick={() => setEditing({ coupon: null })} disabled={missingTable}>
            <Plus size={14} aria-hidden="true" /> Nuevo cupón
          </button>
        </div>
      </header>

      {/* Fichas */}
      <div className="cpn-kpis">
        <div className="cpn-kpi"><span className="cpn-kpi__label">Vigentes</span><span className="cpn-kpi__value t-ok">{counts.active}</span></div>
        <div className="cpn-kpi"><span className="cpn-kpi__label">Usos pagados</span><span className="cpn-kpi__value">{totals.uses}</span></div>
        <div className="cpn-kpi"><span className="cpn-kpi__label">Descuento otorgado</span><span className="cpn-kpi__value">{money(totals.discount)}</span></div>
        <div className="cpn-kpi"><span className="cpn-kpi__label">Ventas con cupón</span><span className="cpn-kpi__value">{money(totals.sales)}</span></div>
      </div>

      {/* Error de carga */}
      {loadError && (
        <div className="cpn-alert" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <div>
            {missingTable ? (
              <>
                <strong>Falta crear la tabla de cupones.</strong> Ejecuta en Supabase → SQL Editor el archivo
                {' '}<code>supabase/migrations/20261025120000_coupons.sql</code>. Mientras tanto la tienda sigue aceptando DESCUENTO202610.
              </>
            ) : (
              <><strong>No se pudieron leer los cupones.</strong> {loadError}</>
            )}
          </div>
        </div>
      )}

      {/* Buscador + filtros */}
      {!missingTable && (
        <>
          <div className="cpn-bar">
            <label className="cpn-search">
              <Search size={14} aria-hidden="true" />
              <span className="cpn-vh">Buscar cupón</span>
              <input type="search" placeholder="Buscar por código o nota" value={query} onChange={(e) => setQuery(e.target.value)} />
              {query && <button type="button" onClick={() => setQuery('')} aria-label="Limpiar búsqueda"><X size={13} /></button>}
            </label>
            <div className="cpn-chips" role="group" aria-label="Filtrar por estado">
              {FILTERS.map((f) => (
                <button key={f.key} type="button" className={`cpn-chip ${filter === f.key ? 'is-on' : ''}`} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                  {f.label} <em>{counts[f.key]}</em>
                </button>
              ))}
            </div>
          </div>

          {/* Tabla */}
          {loading ? (
            <div className="cpn-table-wrap" aria-busy="true">
              {Array.from({ length: 3 }, (_, i) => <div key={i} className="cpn-skel" />)}
            </div>
          ) : coupons.length === 0 ? (
            <div className="cpn-empty">
              <TicketPercent size={28} aria-hidden="true" />
              <p>Aún no hay cupones.</p>
              <button type="button" className="cpn-btn cpn-btn--primary" onClick={() => setEditing({ coupon: null })}><Plus size={14} /> Crear el primero</button>
            </div>
          ) : rows.length === 0 ? (
            <div className="cpn-empty"><p>Ningún cupón coincide con el filtro.</p>
              <button type="button" className="cpn-link" onClick={() => { setQuery(''); setFilter('all'); }}>Quitar filtros</button>
            </div>
          ) : (
            <div className="cpn-table-wrap">
              <table className="cpn-table">
                <thead>
                  <tr>
                    <th scope="col">Código</th>
                    <th scope="col">Descuento</th>
                    <th scope="col" className="c-hide-sm">Condiciones</th>
                    <th scope="col" className="c-num">Usos</th>
                    <th scope="col" className="c-num c-hide-sm">Ventas</th>
                    <th scope="col">Estado</th>
                    <th scope="col" className="c-act"><span className="cpn-vh">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ c, u, s }) => {
                    const meta = STATE_META[s];
                    const busy = busyId === c.id;
                    return (
                      <tr key={c.id} className={busy ? 'is-busy' : ''}>
                        <td>
                          <div className="cpn-code">
                            <button type="button" className="cpn-code__btn" onClick={() => void handleCopy(c.code)} title="Copiar código" aria-label={`Copiar ${c.code}`}>
                              <span>{c.code}</span>
                              {copied === c.code ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                            </button>
                            {c.description && <span className="cpn-code__note">{c.description}</span>}
                          </div>
                        </td>
                        <td><strong className="cpn-off">−{couponLabel(c.discount_type, c.discount_value)}</strong></td>
                        <td className="c-hide-sm cpn-cond">
                          {c.min_subtotal > 0 && <span>Mín. {money(c.min_subtotal)}</span>}
                          {c.starts_at && <span>Desde {shortDate(c.starts_at)}</span>}
                          {c.ends_at && <span>Hasta {shortDate(c.ends_at)}</span>}
                          {!c.min_subtotal && !c.starts_at && !c.ends_at && <span className="cpn-muted">Sin condiciones</span>}
                        </td>
                        <td className="c-num">
                          {u.uses}{c.max_uses != null && <span className="cpn-muted"> / {c.max_uses}</span>}
                        </td>
                        <td className="c-num c-hide-sm">
                          {money(u.sales)}
                          {u.discount > 0 && <span className="cpn-cell-sub">−{money(u.discount)}</span>}
                        </td>
                        <td>
                          <div className="cpn-state">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={c.active}
                              aria-label={c.active ? `Pausar ${c.code}` : `Activar ${c.code}`}
                              className={`cpn-switch ${c.active ? 'is-on' : ''}`}
                              onClick={() => void handleToggle(c)}
                              disabled={busy}
                            ><span /></button>
                            <span className={`cpn-tag ${meta.tone}`}>{meta.label}</span>
                          </div>
                        </td>
                        <td className="c-act">
                          {confirmDel === c.id ? (
                            <span className="cpn-confirm">
                              {u.uses > 0 ? `¿Borrar? Tiene ${u.uses} uso${u.uses !== 1 ? 's' : ''}` : '¿Borrar?'}
                              <button type="button" className="cpn-btn cpn-btn--danger cpn-btn--xs" onClick={() => void handleDelete(c)} disabled={busy}>Sí</button>
                              <button type="button" className="cpn-btn cpn-btn--xs" onClick={() => setConfirmDel(null)}>No</button>
                            </span>
                          ) : (
                            <>
                              <button type="button" className="cpn-icon" onClick={() => setEditing({ coupon: c })} aria-label={`Editar ${c.code}`} title="Editar"><Pencil size={14} /></button>
                              <button type="button" className="cpn-icon cpn-icon--danger" onClick={() => setConfirmDel(c.id)} aria-label={`Borrar ${c.code}`} title="Borrar"><Trash2 size={14} /></button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="cpn-foot">{rows.length} de {coupons.length} cupón{coupons.length !== 1 ? 'es' : ''}</p>
            </div>
          )}
        </>
      )}

      {editing && (
        <CouponEditor
          coupon={editing.coupon}
          seedCode={editing.seedCode}
          uses={editing.coupon ? usageOf(editing.coupon).uses : 0}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      {toast && <div className={`cpn-toast is-${toast.kind}`} role="status">{toast.text}</div>}
    </div>
  );
};

// ─── Editor (crear / editar) ──────────────────────────────────
interface EditorProps {
  coupon: Coupon | null;
  seedCode?: string;
  uses: number;
  onClose: () => void;
  onSaved: (c: Coupon, isNew: boolean) => void;
}

function CouponEditor({ coupon, seedCode, uses, onClose, onSaved }: EditorProps) {
  const isNew = !coupon;
  const [code, setCode] = useState(coupon?.code ?? seedCode ?? '');
  const [description, setDescription] = useState(coupon?.description ?? '');
  const [type, setType] = useState<CouponType>(coupon?.discount_type ?? 'percent');
  const [value, setValue] = useState(coupon ? String(coupon.discount_value) : '10');
  const [minSubtotal, setMinSubtotal] = useState(coupon && coupon.min_subtotal > 0 ? String(coupon.min_subtotal) : '');
  const [maxUses, setMaxUses] = useState(coupon?.max_uses != null ? String(coupon.max_uses) : '');
  const [startsAt, setStartsAt] = useState(toLocalInput(coupon?.starts_at ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(coupon?.ends_at ?? null));
  const [active, setActive] = useState(coupon?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');
  const [touched, setTouched] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const cleanCode = normalizeCode(code);
  const num = Number(value);
  const min = minSubtotal === '' ? 0 : Number(minSubtotal);
  const max = maxUses === '' ? null : Number(maxUses);

  const errors = {
    code: !CODE_PATTERN.test(cleanCode) ? 'De 3 a 40 caracteres: letras, números, guion o guion bajo.' : '',
    value: !(num > 0) ? 'Escribe un valor mayor a 0.' : type === 'percent' && num > 100 ? 'El porcentaje no puede pasar de 100.' : '',
    min: !(min >= 0) ? 'Monto inválido.' : '',
    max: max !== null && !(Number.isInteger(max) && max > 0) ? 'Número entero mayor a 0, o vacío para ilimitado.' : '',
    dates: startsAt && endsAt && new Date(endsAt) <= new Date(startsAt) ? 'El fin debe ser después del inicio.' : '',
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const show = (k: keyof typeof errors) => (touched ? errors[k] : '');

  // Vista previa con un carrito de ejemplo
  const sample = Math.max(1000, min || 0);
  const off = !errors.value ? couponDiscount(type, num, sample) : 0;
  const after = sample - off;

  const renamedWithUses = !isNew && uses > 0 && cleanCode !== coupon!.code;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setServerError('');
    if (hasErrors || saving) return;
    const input: CouponInput = {
      code: cleanCode,
      description: description.trim() || null,
      discount_type: type,
      discount_value: Math.round(num * 100) / 100,
      min_subtotal: Math.round(min * 100) / 100,
      max_uses: max,
      starts_at: fromLocalInput(startsAt),
      ends_at: fromLocalInput(endsAt),
      active,
    };
    setSaving(true);
    const res = await saveCoupon(input, coupon?.id);
    setSaving(false);
    if (res.error || !res.data) { setServerError(res.error || 'No se pudo guardar.'); return; }
    onSaved(res.data, isNew);
  };

  return (
    <div className="cpn-modal" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <form className="cpn-modal__panel" role="dialog" aria-modal="true" aria-labelledby="cpn-ed-title" onSubmit={submit} noValidate>
        <header>
          <h2 id="cpn-ed-title"><TicketPercent size={16} aria-hidden="true" /> {isNew ? 'Nuevo cupón' : `Editar ${coupon!.code}`}</h2>
          <button type="button" className="cpn-icon" onClick={onClose} disabled={saving} aria-label="Cerrar"><X size={16} /></button>
        </header>

        <div className="cpn-field">
          <label htmlFor="cpn-code">Código</label>
          <div className="cpn-inline">
            <input
              id="cpn-code" ref={firstRef} value={code} maxLength={40} autoComplete="off" spellCheck={false}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              aria-invalid={!!show('code')} aria-describedby="cpn-code-hint"
              className="cpn-mono"
            />
            <button type="button" className="cpn-btn" onClick={() => setCode(generateCode())}><Sparkles size={13} aria-hidden="true" /> Generar</button>
          </div>
          <small id="cpn-code-hint" className={show('code') ? 'is-error' : ''}>
            {show('code') || 'La clienta lo escribe tal cual (mayúsculas o minúsculas da igual).'}
          </small>
          {renamedWithUses && <small className="is-warn">Ya tiene {uses} uso{uses !== 1 ? 's' : ''}: al cambiar el código, el conteo empieza en cero.</small>}
        </div>

        <div className="cpn-field">
          <label htmlFor="cpn-desc">Nota interna (opcional)</label>
          <input id="cpn-desc" value={description} maxLength={120} onChange={(e) => setDescription(e.target.value)} placeholder="Ej. Campaña Buen Fin, influencer @nombre" />
        </div>

        <div className="cpn-grid2">
          <div className="cpn-field">
            <span className="cpn-label" id="cpn-type-l">Tipo</span>
            <div className="cpn-seg" role="radiogroup" aria-labelledby="cpn-type-l">
              <button type="button" role="radio" aria-checked={type === 'percent'} className={type === 'percent' ? 'is-on' : ''} onClick={() => setType('percent')}>Porcentaje</button>
              <button type="button" role="radio" aria-checked={type === 'fixed'} className={type === 'fixed' ? 'is-on' : ''} onClick={() => setType('fixed')}>Monto fijo</button>
            </div>
          </div>
          <div className="cpn-field">
            <label htmlFor="cpn-value">{type === 'percent' ? 'Porcentaje (%)' : 'Monto (MXN)'}</label>
            <input id="cpn-value" type="number" inputMode="decimal" min={0.01} max={type === 'percent' ? 100 : undefined} step="0.01"
              value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={!!show('value')} />
            {show('value') && <small className="is-error">{show('value')}</small>}
          </div>
        </div>

        <div className="cpn-grid2">
          <div className="cpn-field">
            <label htmlFor="cpn-min">Compra mínima (MXN)</label>
            <input id="cpn-min" type="number" inputMode="decimal" min={0} step="0.01" placeholder="Sin mínimo"
              value={minSubtotal} onChange={(e) => setMinSubtotal(e.target.value)} aria-invalid={!!show('min')} />
            {show('min') && <small className="is-error">{show('min')}</small>}
          </div>
          <div className="cpn-field">
            <label htmlFor="cpn-max">Límite de usos</label>
            <input id="cpn-max" type="number" inputMode="numeric" min={1} step="1" placeholder="Ilimitado"
              value={maxUses} onChange={(e) => setMaxUses(e.target.value)} aria-invalid={!!show('max')} />
            {show('max') ? <small className="is-error">{show('max')}</small> : <small>Cuenta pedidos pagados.</small>}
          </div>
        </div>

        <div className="cpn-grid2">
          <div className="cpn-field">
            <label htmlFor="cpn-start">Empieza (opcional)</label>
            <input id="cpn-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div className="cpn-field">
            <label htmlFor="cpn-end">Termina (opcional)</label>
            <input id="cpn-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} aria-invalid={!!show('dates')} />
            {show('dates') && <small className="is-error">{show('dates')}</small>}
          </div>
        </div>

        <label className="cpn-toggle">
          <button type="button" role="switch" aria-checked={active} className={`cpn-switch ${active ? 'is-on' : ''}`} onClick={() => setActive((v) => !v)}><span /></button>
          <span>{active ? 'Activo: se puede usar en la tienda' : 'Pausado: la tienda lo rechaza'}</span>
        </label>

        <div className="cpn-preview" aria-live="polite">
          {errors.value ? 'Completa el valor para ver el ejemplo.' : (
            <>Carrito de <strong>{money(sample)}</strong> → descuento <strong>−{money(off)}</strong> → paga <strong>{money(after)}</strong>
              {' '}+ envío {shippingFor(after) === 0 ? 'gratis' : money(shippingFor(after))}</>
          )}
        </div>

        {serverError && <p className="cpn-error" role="alert">{serverError}</p>}

        <footer>
          <button type="button" className="cpn-btn" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="cpn-btn cpn-btn--primary" disabled={saving || (touched && hasErrors)} aria-busy={saving}>
            {saving ? <><RefreshCw size={13} className="cpn-spin" aria-hidden="true" /> Guardando…</> : isNew ? 'Crear cupón' : 'Guardar cambios'}
          </button>
        </footer>
      </form>
    </div>
  );
}
