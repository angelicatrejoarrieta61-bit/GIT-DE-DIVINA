/**
 * AdminProducts.tsx — Productos (sección única)
 * Unifica "Catálogo actual" y "Configuración de productos":
 * edición en línea con guardado automático, Home, Badge, fotos y eliminar.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, getImageUrl } from '../../lib/supabase';
import { ImageUploaderModal } from '../../components/ImageUploaderModal';
import { money, slugify } from '../../lib/sourcing';
import type { Product } from '../../types';
import './AdminSourcing.css';
import './AdminProducts.css';

// ─── Tipos ────────────────────────────────────────────────────
interface Row {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  description: string | null;
  price: number | null;
  compare_price: number | null;
  stock: number | null;
  in_stock: boolean;
  category: string | null;
  tags: string[] | null;
  image_url: string | null;
  images: string[] | null;
  image_status: string | null;
  ean: string | null;
  cost_price: number | null;
  fulfillment: string | null;
}
interface CollectionLite { id: string; name: string }
type Filter = 'todos' | 'sin_foto' | 'ocultos' | 'home' | 'bajo_pedido';
type Toast = { kind: 'ok' | 'error'; text: string } | null;
type TextField = 'name' | 'brand' | 'description' | 'ean';
type NumField = 'price' | 'compare_price' | 'stock';

const COLUMNS = 'id,name,slug,brand,description,price,compare_price,stock,in_stock,category,tags,image_url,images,image_status,ean,cost_price,fulfillment';
const BADGES = ['NUEVO', 'TOP VENTAS', 'ESENCIAL', 'EXCLUSIVO'];
const tagsOf = (r: Row) => (Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === 'string') : []);
const badgeOf = (r: Row) => tagsOf(r).find((t) => t.startsWith('BADGE:'))?.replace('BADGE:', '') ?? '';
const photoCount = (r: Row) => (Array.isArray(r.images) && r.images.length ? r.images.length : r.image_url ? 1 : 0);

// ═══════════════════════════════════════════════════════════════
export const AdminProducts: React.FC = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [collections, setCollections] = useState<CollectionLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('todos');
  const [drafts, setDrafts] = useState<Record<string, string>>({});   // `${id}:${campo}` → texto en edición
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<string | null>(null);              // fila con detalles abiertos
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [gallery, setGallery] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', brand: '', price: '' });
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const notify = useCallback((t: Toast) => {
    setToast(t);
    if (t) window.setTimeout(() => setToast(null), 3800);
  }, []);

  const load = useCallback(async () => {
    const [{ data, error }, { data: cols }] = await Promise.all([
      supabase.from('products').select(COLUMNS).order('name').limit(2000),
      supabase.from('collections').select('id,name').order('name'),
    ]);
    if (error) setLoadError(error.message);
    setRows((data ?? []) as Row[]);
    setCollections((cols ?? []) as CollectionLite[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Guardado ───────────────────────────────────────────────
  const patch = useCallback(async (row: Row, changes: Partial<Row>, okText?: string) => {
    const before = row;
    setRows((list) => list.map((r) => (r.id === row.id ? { ...r, ...changes } : r)));
    setSaving((s) => ({ ...s, [row.id]: true }));
    const { error } = await supabase.from('products').update(changes).eq('id', row.id);
    setSaving((s) => ({ ...s, [row.id]: false }));
    if (error) {
      setRows((list) => list.map((r) => (r.id === row.id ? before : r)));
      notify({ kind: 'error', text: `No se guardó "${row.name}": ${error.message}` });
      return false;
    }
    if (okText) notify({ kind: 'ok', text: okText });
    return true;
  }, [notify]);

  const key = (id: string, field: string) => `${id}:${field}`;
  const draft = (row: Row, field: TextField | NumField) => {
    const d = drafts[key(row.id, field)];
    if (d !== undefined) return d;
    const v = row[field];
    return v === null || v === undefined ? '' : String(v);
  };
  const edit = (row: Row, field: string, value: string) => setDrafts((d) => ({ ...d, [key(row.id, field)]: value }));
  const clearDraft = (row: Row, field: string) => setDrafts((d) => { const n = { ...d }; delete n[key(row.id, field)]; return n; });

  const commitText = async (row: Row, field: TextField) => {
    const raw = drafts[key(row.id, field)];
    if (raw === undefined) return;
    const value = raw.trim();
    clearDraft(row, field);
    if (field === 'name' && !value) { notify({ kind: 'error', text: 'El nombre no puede quedar vacío.' }); return; }
    if (field === 'ean' && value && !/^\d{8,14}$/.test(value)) { notify({ kind: 'error', text: 'El código de barras debe tener de 8 a 14 dígitos.' }); return; }
    const next = value || null;
    if ((row[field] ?? null) === next) return;
    await patch(row, { [field]: field === 'name' ? value : next } as Partial<Row>);
  };

  const commitNumber = async (row: Row, field: NumField) => {
    const raw = drafts[key(row.id, field)];
    if (raw === undefined) return;
    clearDraft(row, field);
    const clean = raw.replace(/[^0-9.]/g, '');
    const n = clean === '' ? null : Number(clean);
    if (n !== null && (!Number.isFinite(n) || n < 0)) { notify({ kind: 'error', text: 'Escribe un número válido.' }); return; }

    if (field === 'price') {
      if (n === null) { notify({ kind: 'error', text: 'El precio no puede quedar vacío.' }); return; }
      if (Number(row.price) === n) return;
      await patch(row, { price: n });
    } else if (field === 'compare_price') {
      if ((row.compare_price ?? null) === n) return;
      if (n !== null && n <= Number(row.price)) { notify({ kind: 'error', text: 'El precio "antes" debe ser mayor al precio actual.' }); return; }
      await patch(row, { compare_price: n });
    } else {
      const stock = Math.round(n ?? 0);
      if (Number(row.stock ?? 0) === stock) return;
      // Stock propio: sin piezas se oculta de la tienda. Bajo pedido: la visibilidad no depende del stock.
      const changes: Partial<Row> = row.fulfillment === 'bajo_pedido' ? { stock } : { stock, in_stock: stock > 0 };
      await patch(row, changes);
    }
  };

  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
  };

  const toggleHome = (row: Row) => {
    const tags = tagsOf(row);
    const next = tags.includes('TOP_HOME') ? tags.filter((t) => t !== 'TOP_HOME') : [...tags, 'TOP_HOME'];
    void patch(row, { tags: next });
  };

  const setBadge = (row: Row, value: string) => {
    const clean = tagsOf(row).filter((t) => !t.startsWith('BADGE:'));
    void patch(row, { tags: value ? [...clean, `BADGE:${value}`] : clean });
  };

  const remove = async (row: Row) => {
    setSaving((s) => ({ ...s, [row.id]: true }));
    const { error } = await supabase.from('products').delete().eq('id', row.id);
    setSaving((s) => ({ ...s, [row.id]: false }));
    setConfirmDelete(null);
    if (error) { notify({ kind: 'error', text: `No se pudo eliminar: ${error.message}` }); return; }
    setRows((list) => list.filter((r) => r.id !== row.id));
    notify({ kind: 'ok', text: `"${row.name}" eliminado.` });
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProduct.name.trim();
    const price = Number(newProduct.price.replace(/[^0-9.]/g, ''));
    if (!name) { notify({ kind: 'error', text: 'Escribe el nombre del producto.' }); return; }
    if (!Number.isFinite(price) || price <= 0) { notify({ kind: 'error', text: 'Escribe el precio de venta.' }); return; }
    setCreating(true);
    const base = slugify(name) || `producto-${Date.now()}`;
    const { data: taken } = await supabase.from('products').select('slug').like('slug', `${base}%`);
    const used = new Set((taken ?? []).map((r) => r.slug));
    let slug = base;
    for (let i = 2; used.has(slug); i += 1) slug = `${base}-${i}`;
    const { data, error } = await supabase.from('products')
      .insert({ name, slug, brand: newProduct.brand.trim() || null, price, stock: 1, in_stock: true, image_status: 'pending' })
      .select(COLUMNS).single();
    setCreating(false);
    if (error || !data) { notify({ kind: 'error', text: `No se pudo crear: ${error?.message ?? 'sin respuesta'}` }); return; }
    setRows((list) => [data as Row, ...list]);
    setNewProduct({ name: '', brand: '', price: '' });
    setAdding(false);
    setOpen((data as Row).id);
    notify({ kind: 'ok', text: `"${name}" creado. Agrégale fotos y colección.` });
  };

  // ── Derivados ──────────────────────────────────────────────
  const counts = useMemo(() => ({
    todos: rows.length,
    sin_foto: rows.filter((r) => photoCount(r) === 0).length,
    ocultos: rows.filter((r) => !r.in_stock).length,
    home: rows.filter((r) => tagsOf(r).includes('TOP_HOME')).length,
    bajo_pedido: rows.filter((r) => r.fulfillment === 'bajo_pedido').length,
  }), [rows]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'sin_foto' && photoCount(r) > 0) return false;
      if (filter === 'ocultos' && r.in_stock) return false;
      if (filter === 'home' && !tagsOf(r).includes('TOP_HOME')) return false;
      if (filter === 'bajo_pedido' && r.fulfillment !== 'bajo_pedido') return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || (r.brand ?? '').toLowerCase().includes(q) || (r.ean ?? '').includes(q);
    });
  }, [rows, search, filter]);

  const FILTERS: Array<[Filter, string]> = [
    ['todos', 'Todos'], ['sin_foto', 'Sin foto'], ['ocultos', 'Ocultos'], ['home', 'En Home'], ['bajo_pedido', 'Bajo pedido'],
  ];

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="src cat">
      <header className="src-head">
        <div>
          <h1 className="admin-page-title">Productos</h1>
          <p className="admin-page-subtitle">Edita cualquier campo y se guarda solo al salir de él.</p>
        </div>
        <div className="cat-head__actions">
          <Link to="/admin/import" className="src-btn src-btn--ghost">Importar Excel</Link>
          <button type="button" className="src-btn src-btn--lime" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
            {adding ? 'Cancelar' : '+ Añadir producto'}
          </button>
        </div>
      </header>

      {adding && (
        <form className="src-card cat-new" onSubmit={create}>
          <div className="src-field cat-new__name">
            <label htmlFor="np-name">Nombre</label>
            <input id="np-name" className="src-input" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} autoFocus required />
          </div>
          <div className="src-field">
            <label htmlFor="np-brand">Marca</label>
            <input id="np-brand" className="src-input" value={newProduct.brand} onChange={(e) => setNewProduct({ ...newProduct, brand: e.target.value })} />
          </div>
          <div className="src-field">
            <label htmlFor="np-price">Precio</label>
            <div className="src-money"><span>$</span><input id="np-price" className="src-input" inputMode="decimal" value={newProduct.price} onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })} required /></div>
          </div>
          <button type="submit" className="src-btn src-btn--lime" disabled={creating}>{creating ? 'Creando…' : 'Crear'}</button>
        </form>
      )}

      <section className="src-filters">
        <input className="src-input cat-search" placeholder="Buscar por nombre, marca o código de barras" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar producto" />
        <div className="src-seg" role="radiogroup" aria-label="Filtrar productos">
          {FILTERS.map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={filter === k} className={filter === k ? 'is-on' : ''} onClick={() => setFilter(k)}>
              {label} {counts[k]}
            </button>
          ))}
        </div>
      </section>

      {loadError && <div className="src-alert src-alert--error" role="alert">No pude leer tus productos: {loadError}</div>}

      {loading ? (
        <div className="src-table" aria-busy="true">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="src-row src-skel" />)}</div>
      ) : shown.length === 0 ? (
        <div className="src-empty">
          <strong>{rows.length ? 'Ningún producto con este filtro.' : 'Tu catálogo está vacío.'}</strong>
          <span>{rows.length ? 'Cambia el filtro o la búsqueda.' : 'Añade un producto o búscalo en Abastecimiento.'}</span>
        </div>
      ) : (
        <div className="cat-wrap">
          <div className="cat-table" role="table" aria-label="Productos">
            <div className="cat-row cat-row--head" role="row">
              <span role="columnheader">Foto</span>
              <span role="columnheader">Nombre</span>
              <span role="columnheader">Marca</span>
              <span role="columnheader">Colección</span>
              <span role="columnheader" className="num">Precio</span>
              <span role="columnheader" className="num">Antes</span>
              <span role="columnheader" className="num">Stock</span>
              <span role="columnheader">Tienda</span>
              <span role="columnheader">Home</span>
              <span role="columnheader">Badge</span>
              <span role="columnheader" />
            </div>

            {shown.map((r) => {
              const photos = photoCount(r);
              const isHome = tagsOf(r).includes('TOP_HOME');
              const busy = !!saving[r.id];
              const margin = r.cost_price != null && r.price != null ? Number(r.price) - Number(r.cost_price) : null;
              return (
                <div key={r.id} className={`cat-item ${r.in_stock ? '' : 'is-hidden'} ${busy ? 'is-saving' : ''}`}>
                  <div className="cat-row" role="row">
                    <div className="cat-cell cat-photo" role="cell">
                      <button type="button" className="cat-thumb" onClick={() => setGallery(r)} aria-label={`Fotos de ${r.name}`} title="Ver o cambiar fotos">
                        {r.image_url ? <img src={getImageUrl(r.image_url, { width: 96, quality: 60 })} alt="" loading="lazy" /> : <span aria-hidden="true">＋</span>}
                        <i className={photos ? '' : 'is-zero'}>{photos}</i>
                      </button>
                    </div>

                    <div className="cat-cell cat-name" role="cell">
                      <span className="cat-lbl">Nombre</span>
                      <input className="cat-input cat-input--strong" value={draft(r, 'name')} onChange={(e) => edit(r, 'name', e.target.value)} onBlur={() => void commitText(r, 'name')} onKeyDown={onEnter} aria-label="Nombre" title={r.name} />
                      {r.fulfillment === 'bajo_pedido' && <span className="cat-tag">Bajo pedido{margin !== null ? ` · ganas ${money(margin)} antes de comisión` : ''}</span>}
                    </div>

                    <div className="cat-cell" role="cell">
                      <span className="cat-lbl">Marca</span>
                      <input className="cat-input" value={draft(r, 'brand')} onChange={(e) => edit(r, 'brand', e.target.value)} onBlur={() => void commitText(r, 'brand')} onKeyDown={onEnter} placeholder="Sin marca" aria-label="Marca" />
                    </div>

                    <div className="cat-cell" role="cell">
                      <span className="cat-lbl">Colección</span>
                      <select className="cat-input" value={r.category ?? ''} onChange={(e) => void patch(r, { category: e.target.value || null })} aria-label="Colección">
                        <option value="">Sin colección</option>
                        {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>

                    <div className="cat-cell num" role="cell">
                      <span className="cat-lbl">Precio</span>
                      <input className="cat-input cat-input--price" inputMode="decimal" value={draft(r, 'price')} onChange={(e) => edit(r, 'price', e.target.value)} onBlur={() => void commitNumber(r, 'price')} onKeyDown={onEnter} aria-label="Precio" />
                    </div>

                    <div className="cat-cell num" role="cell">
                      <span className="cat-lbl">Antes</span>
                      <input className="cat-input cat-input--old" inputMode="decimal" value={draft(r, 'compare_price')} onChange={(e) => edit(r, 'compare_price', e.target.value)} onBlur={() => void commitNumber(r, 'compare_price')} onKeyDown={onEnter} placeholder="—" aria-label="Precio antes (tachado)" />
                    </div>

                    <div className="cat-cell num" role="cell">
                      <span className="cat-lbl">Stock</span>
                      <input className="cat-input" inputMode="numeric" value={draft(r, 'stock')} onChange={(e) => edit(r, 'stock', e.target.value)} onBlur={() => void commitNumber(r, 'stock')} onKeyDown={onEnter} placeholder="0" aria-label="Piezas en stock" />
                    </div>

                    <div className="cat-cell cat-center" role="cell">
                      <span className="cat-lbl">Tienda</span>
                      <button type="button" role="switch" aria-checked={r.in_stock} className={`cat-switch ${r.in_stock ? 'is-on' : ''}`} onClick={() => void patch(r, { in_stock: !r.in_stock })}
                        title={r.in_stock ? 'Visible en la tienda. Clic para ocultar.' : 'Oculto de la tienda. Clic para mostrar.'}>
                        <span className="cat-sr">{r.in_stock ? 'Visible' : 'Oculto'}</span>
                      </button>
                    </div>

                    <div className="cat-cell cat-center" role="cell">
                      <span className="cat-lbl">Home</span>
                      <button type="button" role="switch" aria-checked={isHome} className={`cat-switch ${isHome ? 'is-on' : ''}`} onClick={() => toggleHome(r)}
                        title={isHome ? 'Sale en "Más vendidos" del Home. Clic para quitar.' : 'Mostrar en "Más vendidos" del Home.'}>
                        <span className="cat-sr">{isHome ? 'En Home' : 'No en Home'}</span>
                      </button>
                    </div>

                    <div className="cat-cell" role="cell">
                      <span className="cat-lbl">Badge</span>
                      <select className="cat-input" value={badgeOf(r)} onChange={(e) => setBadge(r, e.target.value)} aria-label="Badge">
                        <option value="">Sin badge</option>
                        {BADGES.map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>

                    <div className="cat-cell cat-actions" role="cell">
                      {confirmDelete === r.id ? (
                        <>
                          <span className="cat-confirm">¿Eliminar?</span>
                          <button type="button" className="src-btn src-btn--sm cat-btn-danger" disabled={busy} onClick={() => void remove(r)}>Sí</button>
                          <button type="button" className="src-btn src-btn--sm src-btn--ghost" onClick={() => setConfirmDelete(null)}>No</button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="src-btn src-btn--sm src-btn--lime" onClick={() => setGallery(r)}>Fotos</button>
                          <button type="button" className={`src-icon-btn cat-more ${open === r.id ? 'is-open' : ''}`} onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id} aria-label="Más detalles" title="Descripción, código de barras y costo">⌄</button>
                          <button type="button" className="src-icon-btn src-icon-btn--bad" onClick={() => setConfirmDelete(r.id)} aria-label={`Eliminar ${r.name}`} title="Eliminar producto">🗑</button>
                        </>
                      )}
                    </div>
                  </div>

                  {open === r.id && (
                    <div className="cat-details">
                      <div className="src-field cat-details__desc">
                        <label htmlFor={`d-${r.id}`}>Descripción</label>
                        <textarea id={`d-${r.id}`} className="cat-input cat-textarea" value={draft(r, 'description')} onChange={(e) => edit(r, 'description', e.target.value)} onBlur={() => void commitText(r, 'description')} rows={3} />
                      </div>
                      <div className="src-field">
                        <label htmlFor={`e-${r.id}`}>Código de barras</label>
                        <input id={`e-${r.id}`} className="cat-input" inputMode="numeric" value={draft(r, 'ean')} onChange={(e) => edit(r, 'ean', e.target.value.replace(/\D/g, ''))} onBlur={() => void commitText(r, 'ean')} onKeyDown={onEnter} placeholder="Opcional" />
                      </div>
                      <div className="src-field">
                        <label htmlFor={`f-${r.id}`}>Surtido</label>
                        <select id={`f-${r.id}`} className="cat-input" value={r.fulfillment ?? 'stock_propio'} onChange={(e) => void patch(r, { fulfillment: e.target.value })}>
                          <option value="stock_propio">Stock propio</option>
                          <option value="bajo_pedido">Bajo pedido</option>
                        </select>
                      </div>
                      <div className="cat-details__info">
                        <span>Costo: <b>{r.cost_price != null ? money(Number(r.cost_price)) : 'sin dato'}</b></span>
                        <Link to={`/admin/abastecimiento?product=${r.id}`} className="src-link-btn src-link-btn--flat">Buscar proveedor</Link>
                        <a href={`/producto/${r.slug}`} target="_blank" rel="noopener noreferrer" className="src-link-btn src-link-btn--flat">Ver en la tienda ↗</a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {gallery && (
        <ImageUploaderModal
          product={gallery as unknown as Product}
          onClose={() => setGallery(null)}
          onSuccess={(urls) => {
            const target = gallery;
            setGallery(null);
            void patch(target, { image_url: urls[0] ?? null, images: urls, image_status: urls.length ? 'done' : 'pending' },
              urls.length ? `Fotos de "${target.name}" guardadas.` : `"${target.name}" quedó sin fotos.`);
          }}
        />
      )}

      {toast && <div className={`src-toast src-toast--${toast.kind}`} role="status">{toast.text}</div>}
    </div>
  );
};
