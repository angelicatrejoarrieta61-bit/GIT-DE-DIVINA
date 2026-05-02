import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AssetUploader } from '../../components/AssetUploader';
import { ImageUploaderModal } from '../../components/ImageUploaderModal';
import { getStoreConfig, getCollections, getProducts, getOrders, getAdminProducts, updateProduct, createProduct, deleteProduct } from '../../lib/queries';
import { supabase, getImageUrl } from '../../lib/supabase';
import type { Collection, Product, Order } from '../../types';
import type { SectionBlock } from '../../sections/DynamicSections';
import './AdminConfig.css';

const DEFAULT_FROST = {
  title: 'Nuestro <span class="lime-text">Catálogo</span> de Productos',
  subtitle: 'Explora artículos seleccionados que harán visibles mejoras en tu rostro y belleza.',
  promoText: '🏷️ AHORRA 25% · DESCUENTO AUTOMÁTICO EN COMPRAS MAYORES DE $2,500 MXN',
  cards: [
    { id: 1, emoji: '✨', badge: 'NUEVO', title: 'Línea ISDIN Fusion Magic', txt: 'Color y sin color' },
    { id: 2, emoji: '💧', badge: 'TOP VENTAS', title: 'Ácido Hialurónico', txt: 'Hidratación profunda' },
    { id: 3, emoji: '☀️', badge: 'ESENCIAL', title: 'Fotoprotectores Solares', txt: 'Protección total FPS 50+' },
    { id: 4, emoji: '✂️', badge: 'EXCLUSIVO', title: 'Grooming Premium', txt: 'Cuidado masculino profesional' },
  ],
};

const FONTS = [
  'Francois One', 'Barlow Semi Condensed', 'Catamaran', 'Inter', 'Montserrat',
  'Playfair Display', 'Cinzel', 'Roboto', 'Lora', 'Oswald',
  'Poppins', 'Raleway', 'Outfit', 'Space Grotesk', 'Bebas Neue',
  'Nunito', 'Merriweather', 'Work Sans', 'Rubik', 'Noto Sans',
  'DM Sans', 'Syne', 'Manrope', 'Lato', 'Cormorant Garamond'
].sort();

interface HeaderLink {
  label: string;
  path: string;
}

const DEFAULT_HEADER_LINKS: HeaderLink[] = [
  { label: 'INICIO', path: '/' },
  { label: 'CREMAS FACIALES', path: '/coleccion/cremas-faciales' },
  { label: 'LIMPIADORES', path: '/coleccion/limpiadores' },
  { label: 'FOTOPROTECTORES', path: '/coleccion/fotoprotectores' },
  { label: 'GROOMING', path: '/coleccion/grooming' },
  { label: 'CATÁLOGO', path: '/catalogo' },
  { label: 'QUIÉNES SOMOS', path: '/quienes-somos' },
  { label: 'CONTACTO', path: '/contacto' }
];

const DEFAULT_HOME_BLOCKS: SectionBlock[] = [
  {
    id: 'home-block-1',
    type: 'text_center',
    title: 'Belleza con <span class="lime-text">resultados reales</span>',
    content: 'Edita este bloque desde Admin > Editor Visual.',
    buttonText: 'Ver catálogo',
    buttonLink: '/catalogo',
    showButton: true,
    paddingY: 40,
    borderRadius: 0,
  },
];

const SectionProductsConfig = ({ products, collections, onSave }: { products: Product[], collections: Collection[], onSave: (items: Product[]) => void }) => {
  const [items, setItems] = useState<Product[]>([]);
  const [savingItem, setSavingItem] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editingImages, setEditingImages] = useState<Product | null>(null);

  useEffect(() => {
    setItems([...products]);
  }, [products]);

  const updateItem = (id: string, key: keyof Product, val: any) => {
    setItems(prev => prev.map(p => p.id === id ? { ...p, [key]: val } : p));
  };

  const updateItemAndSave = async (id: string, key: keyof Product, val: any) => {
    let finalVal = val;
    let updates: Partial<Product> = {};

    if (key === 'stock') {
      finalVal = Number(val);
      updates = { stock: finalVal, in_stock: finalVal > 0 };
    } else if (key === 'price' || key === 'compare_price') {
      finalVal = val ? Number(val) : null;
      updates = { [key]: finalVal };
    } else if (key === 'category') {
      finalVal = val === '' ? null : val;
      updates = { [key]: finalVal };
    } else {
      updates = { [key]: finalVal };
    }

    setItems(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    setSavingItem(id);
    await updateProduct(id, updates);
    setSavingItem(null);
  };

  const handleAddProduct = async () => {
    const name = window.prompt('Nombre del nuevo producto:');
    if (!name) return;
    const slug = name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');
    const newProd: Partial<Product> = {
      name,
      slug,
      price: 0,
      stock: 2,
      in_stock: true,
      brand: 'DIVINA',
      image_status: 'pending'
    };
    const created = await createProduct(newProd);
    if (created) {
      setItems(prev => [created, ...prev]);
      alert('Producto creado. Ahora puedes editar sus detalles.');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`¿Seguro que deseas eliminar "${name}"? Esta acción no se puede deshacer.`)) return;
    const ok = await deleteProduct(id);
    if (ok) {
      setItems(prev => prev.filter(p => p.id !== id));
      alert('Producto eliminado.');
    }
  };

  const handleSave = async () => {
    setSavingItem('all');
    try {
      for (const item of items) {
        const original = products.find(p => p.id === item.id);
        const currentStock = item.stock ?? (item.in_stock ? 2 : 0);
        const stockNum = Number(currentStock);
        const inStock = stockNum > 0;
        const cat = item.category === '' ? null : item.category;

        const hasChanged = 
          item.name !== original?.name ||
          item.brand !== original?.brand ||
          Number(item.price) !== original?.price ||
          (item.compare_price ? Number(item.compare_price) : null) !== original?.compare_price ||
          item.sku !== original?.sku ||
          inStock !== original?.in_stock ||
          stockNum !== original?.stock ||
          cat !== original?.category ||
          item.description !== original?.description ||
          JSON.stringify(item.tags) !== JSON.stringify(original?.tags);

        if (hasChanged) {
          await updateProduct(item.id, {
            name: item.name,
            brand: item.brand,
            price: Number(item.price),
            compare_price: item.compare_price ? Number(item.compare_price) : null,
            sku: item.sku,
            stock: stockNum,
            in_stock: inStock,
            category: cat,
            description: item.description,
            tags: Array.isArray(item.tags) ? item.tags : (typeof item.tags === 'string' ? (item.tags as string).split(',').map(t => t.trim()).filter(Boolean) : [])
          });
        }
      }
      onSave(items.map(item => {
        const st = Number(item.stock ?? (item.in_stock ? 2 : 0));
        return {...item, stock: st, in_stock: st > 0, category: item.category === '' ? null : item.category};
      }));
      alert('¡Todos los cambios han sido guardados!');
    } catch (err) {
      console.error(err);
      alert('Ocurrió un error al guardar.');
    } finally {
      setSavingItem(null);
    }
  };

  const filtered = items.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    (p.brand || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.sku || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="products-config-table">
      <div style={{ marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
        <input 
          type="text" 
          className="input-dark" 
          placeholder="🔍 Filtrar por SKU, nombre, marca..." 
          value={search} 
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, height: '40px' }}
        />
        <button onClick={handleAddProduct} className="btn btn-outline" style={{ padding: '0 20px', height: '40px', fontSize: '12px' }}>
          + AÑADIR PRODUCTO
        </button>
        <button onClick={handleSave} className="btn btn--primary" disabled={savingItem === 'all'} style={{ padding: '0 32px', height: '40px', fontSize: '12px', fontWeight: 'bold' }}>
          {savingItem === 'all' ? 'GUARDANDO...' : 'FORZAR GUARDADO TOTAL'}
        </button>
      </div>

      <div style={{ overflowX: 'auto', background: 'rgba(255,255,255,0.01)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)', maxHeight: '75vh', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr style={{ background: '#080808', textAlign: 'left' }}>
              <th style={{ padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>IMG</th>
              <th style={{ padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>ID / SKU</th>
              <th style={{ padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>STOCK</th>
              <th style={{ padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>MARCA</th>
              <th style={{ padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>NOMBRE / TÍTULO</th>
              <th style={{ padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>DESCRIPCIÓN</th>
              <th style={{ padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>COLECCIÓN</th>
              <th style={{ padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>⭐</th>
              <th style={{ padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>PRECIO</th>
              <th style={{ padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>OFERTA</th>
              <th style={{ padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: p.in_stock ? 'transparent' : 'rgba(255,0,0,0.03)', opacity: savingItem === p.id ? 0.5 : 1 }}>
                <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                  <button 
                    onClick={() => setEditingImages(p)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, position: 'relative' }}
                    title="Gestionar imágenes"
                  >
                    <div style={{ width: 32, height: 32, borderRadius: 6, overflow: 'hidden', background: '#111', border: '1px solid rgba(255,255,255,0.1)' }}>
                      {p.image_url ? <img src={getImageUrl(p.image_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 14 }}>📷</span>}
                    </div>
                  </button>
                </td>
                <td style={{ padding: '4px 8px', width: '120px' }}>
                  <p style={{ fontSize: 9, color: '#666', margin: 0 }}>ID: {p.id.slice(0,8)}</p>
                  <input type="text" value={p.sku || ''} onChange={e => updateItem(p.id, 'sku', e.target.value)} onBlur={e => updateItemAndSave(p.id, 'sku', e.target.value)} className="td-input" placeholder="SKU" style={{ marginTop: 2 }} />
                </td>
                <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                  <input type="number" min="0" value={p.stock ?? (p.in_stock ? 2 : 0)} 
                    onChange={e => updateItem(p.id, 'stock', e.target.value)} 
                    onBlur={e => updateItemAndSave(p.id, 'stock', e.target.value)} 
                    className="td-input" style={{ width: 44, textAlign: 'center' }} title="Al guardar, si es > 0 se mostrará en la tienda" />
                </td>
                <td style={{ padding: '4px 8px', width: '90px' }}>
                  <input type="text" value={p.brand || ''} onChange={e => updateItem(p.id, 'brand', e.target.value)} onBlur={e => updateItemAndSave(p.id, 'brand', e.target.value)} className="td-input" />
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <input type="text" value={p.name} onChange={e => updateItem(p.id, 'name', e.target.value)} onBlur={e => updateItemAndSave(p.id, 'name', e.target.value)} className="td-input" style={{ fontWeight: '600' }} />
                </td>
                <td style={{ padding: '4px 8px', width: '200px' }}>
                  <textarea value={p.description || ''} onChange={e => updateItem(p.id, 'description', e.target.value)} onBlur={e => updateItemAndSave(p.id, 'description', e.target.value)} className="td-input" style={{ height: '32px', resize: 'vertical', fontSize: '10px' }} placeholder="Descripción..." />
                </td>
                <td style={{ padding: '4px 8px', width: '130px' }}>
                  <select value={p.category || ''} onChange={e => updateItemAndSave(p.id, 'category', e.target.value)} className="td-input" style={{ background: '#111' }}>
                    <option value="">Sin colección</option>
                    {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </td>
                <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                  {['cremas-faciales', 'limpiadores', 'fotoprotectores', 'grooming', 'catalogo', 'home'].includes(section) && (
                    <input 
                      type="checkbox" 
                      title={`Destacar en ${section}`}
                      checked={p.tags?.includes(`REL_${section}`)} 
                      onChange={async () => {
                        const tg = `REL_${section}`;
                        const on = p.tags?.includes(tg);
                        const newTags = on ? (p.tags || []).filter(x => x !== tg) : [...(p.tags || []), tg];
                        setSavingItem(p.id);
                        await updateProduct(p.id, { tags: newTags });
                        setProducts(prev => prev.map(x => x.id === p.id ? { ...x, tags: newTags } : x));
                        setSavingItem(null);
                      }} 
                      style={{ cursor: 'pointer', accentColor: 'var(--c-lime)' }}
                    />
                  )}
                </td>
                <td style={{ padding: '4px 8px', width: '80px' }}>
                  <input type="number" value={p.price} onChange={e => updateItem(p.id, 'price', e.target.value)} onBlur={e => updateItemAndSave(p.id, 'price', e.target.value)} className="td-input" style={{ color: 'var(--c-lime)', fontWeight: 'bold' }} />
                </td>
                <td style={{ padding: '4px 8px', width: '80px' }}>
                  <input type="number" value={p.compare_price || ''} onChange={e => updateItem(p.id, 'compare_price', e.target.value)} onBlur={e => updateItemAndSave(p.id, 'compare_price', e.target.value)} className="td-input" style={{ color: '#888', textDecoration: 'line-through' }} />
                </td>
                <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                  <button onClick={() => handleDelete(p.id, p.name)} style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: 16 }} title="Eliminar producto">🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingImages && (
        <ImageUploaderModal 
          product={editingImages} 
          onClose={() => setEditingImages(null)} 
          onSuccess={async (urls) => {
            const main = urls[0] || null;
            await updateProduct(editingImages.id, { images: urls, image_url: main || undefined });
            setItems(prev => prev.map(p => p.id === editingImages.id ? { ...p, images: urls, image_url: main || p.image_url } : p));
            setEditingImages(null);
            alert('Galería actualizada correctamente.');
          }}
        />
      )}
    </div>
  );
};

const Sl = ({ label, cfg, min, max, step, configs, updateConfig }: any) => (
  <div>
    <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>{label}: {configs[cfg] || 0}</label>
    <input type="range" min={min} max={max} step={step || 1} value={configs[cfg] || 0}
      onChange={e => updateConfig(cfg, e.target.value)} style={{ width: '100%', accentColor: 'var(--c-lime)' }} />
  </div>
);

export const AdminConfig: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [configs, setConfigs] = useState<Record<string, string>>({});
  const [collections, setCollections] = useState<Collection[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [adminProducts, setAdminProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<'global' | 'hero' | 'secciones' | 'editor' | 'cols' | 'pages'>('global');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [frost, setFrost] = useState(DEFAULT_FROST);
  const [homeBlocks, setHomeBlocks] = useState<SectionBlock[]>(DEFAULT_HOME_BLOCKS);
  const [customSections, setCustomSections] = useState<Array<{ key: string; label: string }>>([]);
  const [headerLinks, setHeaderLinks] = useState<HeaderLink[]>(DEFAULT_HEADER_LINKS);
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  const [showPreview, setShowPreview] = useState(false);
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stateRef = useRef({ configs, frost, homeBlocks, headerLinks, collections });

  useEffect(() => { loadData(); }, []);

  const saveConfigBulk = async (cfg: Record<string, string>, frst: any, hBlocks: any, hLinks: any) => {
    const updates = [
      ...Object.entries(cfg)
        .filter(([k, v]) => !['frost_cards_data', 'home_sections', 'header_links'].includes(k) && !String(v).startsWith('data:'))
        .map(([key, value]) => ({ key, value: String(value) })),
      { key: 'frost_cards_data', value: JSON.stringify(frst) },
      { key: 'home_sections', value: JSON.stringify(hBlocks) },
      { key: 'header_links', value: JSON.stringify(hLinks) }
    ];
    const { error } = await supabase.from('store_config').upsert(updates, { onConflict: 'key' });
    if (error) console.error('Save error:', error);
  };

  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    stateRef.current = { configs, frost, homeBlocks, headerLinks, collections };
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: 'ADMIN_PREVIEW_UPDATE',
        payload: {
          ...configs,
          frost_cards_data: JSON.stringify(frost),
          home_sections: JSON.stringify(homeBlocks),
          header_links: JSON.stringify(headerLinks),
          _collections: JSON.stringify(collections)
        }
      }, '*');
    }

    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      saveConfigBulk(configs, frost, homeBlocks, headerLinks);
    }, 1000);
  }, [configs, frost, homeBlocks, headerLinks, collections]);

  useEffect(() => {
    const handleManualSave = async () => {
      const { configs, frost, homeBlocks, headerLinks } = stateRef.current;
      const updates = [
        ...Object.entries(configs)
          .filter(([k]) => !['frost_cards_data', 'home_sections', 'header_links'].includes(k))
          .map(([key, value]) => ({ key, value: String(value) })),
        { key: 'frost_cards_data', value: JSON.stringify(frost) },
        { key: 'home_sections', value: JSON.stringify(homeBlocks) },
        { key: 'header_links', value: JSON.stringify(headerLinks) }
      ];
      const { error } = await supabase.from('store_config').upsert(updates, { onConflict: 'key' });
      if (error) {
        console.error('Error saving config:', error);
        alert('Error saving config: ' + error.message);
      } else {
        console.log('Saved successfully');
      }
      // Reload iframe once saved fully
      setPreviewRefreshKey(k => k + 1);
    };

    window.addEventListener('admin-manual-save', handleManualSave);
    return () => window.removeEventListener('admin-manual-save', handleManualSave);
  }, []);

  useEffect(() => {
    // Tab effect is no longer needed since we use searchParams directly
  }, [searchParams]);

  const loadData = async () => {
    try {
      const [c, col, prods, ords, aProds] = await Promise.all([
        getStoreConfig(), 
        getCollections(), 
        getProducts(300), 
        getOrders(),
        getAdminProducts()
      ]);
      setConfigs(c);
      setCollections(col);
      setProducts(prods);
      setOrders(ords);
      setAdminProducts(aProds);
      if (c.frost_cards_data) {
        try { const p = JSON.parse(c.frost_cards_data); if (p?.cards) setFrost({ ...DEFAULT_FROST, ...p }); } catch { }
      }
      if (c.home_sections) {
        try {
          const parsed = JSON.parse(c.home_sections);
          if (Array.isArray(parsed)) setHomeBlocks(parsed);
        } catch {
          setHomeBlocks(DEFAULT_HOME_BLOCKS);
        }
      } else {
        setHomeBlocks(DEFAULT_HOME_BLOCKS);
      }
      if (c.admin_custom_sections) {
        try {
          const parsed = JSON.parse(c.admin_custom_sections);
          if (Array.isArray(parsed)) setCustomSections(parsed);
        } catch { }
      }
      if (c.header_links) {
        try {
          const hl = JSON.parse(c.header_links);
          if (Array.isArray(hl)) setHeaderLinks(hl);
        } catch {
          setHeaderLinks(DEFAULT_HEADER_LINKS);
        }
      } else {
        setHeaderLinks(DEFAULT_HEADER_LINKS);
      }
      
      if (aProds.length === 0) {
        const { error } = await supabase.from('products').select('*, collection:collections!category(id,name,slug)').limit(1);
        if (error) setLoadError(`Supabase error: ${error.message} - ${error.details || ''}`);
      }

    } catch (err: any) {
      console.error('Error loading admin config data:', err);
      setLoadError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = async (key: string, value: string) => {
    setConfigs(prev => ({ ...prev, [key]: value }));
  };

  const saveFrost = async (data: typeof DEFAULT_FROST) => {
    setFrost(data);
  };

  const toggleTop = async (p: Product) => {
    const has = p.tags?.includes('TOP_HOME');
    const newTags = has ? (p.tags || []).filter(t => t !== 'TOP_HOME') : [...(p.tags || []), 'TOP_HOME'];
    setSaving(p.id);
    await supabase.from('products').update({ tags: newTags }).eq('id', p.id);
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, tags: newTags } : x));
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'ADMIN_PREVIEW_RELOAD_PRODUCTS' }, '*');
    }
    setSaving(null);
  };

  const updateColImg = async (id: string, path: string) => {
    if (path.startsWith('data:')) {
      // Just update local state for preview
      setCollections(prev => prev.map(c => c.id === id ? { ...c, image_url: path } : c));
      return;
    }
    await supabase.from('collections').update({ image_url: path }).eq('id', id);
    await loadData();
  };

  const updateColName = async (id: string, name: string) => {
    await supabase.from('collections').update({ name }).eq('id', id);
    await loadData();
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'ADMIN_PREVIEW_RELOAD_PRODUCTS' }, '*');
    }
  };

  const saveHeaderLinks = async (nextLinks: HeaderLink[]) => {
    setHeaderLinks(nextLinks);
  };

  const saveHomeBlocks = async (nextBlocks: SectionBlock[]) => {
    setHomeBlocks(nextBlocks);
  };

  const updateHomeBlock = (id: string, patch: Partial<SectionBlock>) => {
    const next = homeBlocks.map((b) => (b.id === id ? { ...b, ...patch } : b));
    void saveHomeBlocks(next);
  };

  const addHomeBlock = (type: SectionBlock['type']) => {
    const next: SectionBlock[] = [
      ...homeBlocks,
      {
        id: `home-${Date.now()}`,
        type,
        title: type === 'text_center' ? 'Nuevo bloque' : 'Nuevo bloque con imagen',
        content: 'Edita este texto desde el admin.',
        imagePosition: 'left',
        buttonText: 'Botón',
        buttonLink: '/catalogo',
        showButton: true,
        paddingY: 40,
        borderRadius: 0,
      },
    ];
    void saveHomeBlocks(next);
  };

  const removeHomeBlock = (id: string) => {
    const next = homeBlocks.filter((b) => b.id !== id);
    void saveHomeBlocks(next.length ? next : DEFAULT_HOME_BLOCKS);
  };

  const moveHomeBlock = (id: string, direction: -1 | 1) => {
    const idx = homeBlocks.findIndex((b) => b.id === id);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= homeBlocks.length) return;
    const next = [...homeBlocks];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    void saveHomeBlocks(next);
  };

  const previewViewport = useMemo(() => {
    if (previewDevice === 'mobile') return { w: 390, h: 844 };
    if (previewDevice === 'tablet') return { w: 820, h: 1024 };
    return { w: 1366, h: 900 };
  }, [previewDevice]);

  if (loading) return <p style={{ padding: 48 }}>Cargando...</p>;
  if (loadError) return <div style={{ padding: 48, color: 'red' }}><h2>Error cargando productos:</h2><p>{loadError}</p></div>;

  const sc = configs.hero_card_scale || '1';
  const featured = products.filter(p => p.tags?.includes('TOP_HOME'));
  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.brand || '').toLowerCase().includes(search.toLowerCase())
  );

  const section = searchParams.get('section');
  const part = searchParams.get('part');

  const box = { padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' };
  const lbl = { fontSize: 10, fontWeight: 700 as const, display: 'block' as const, marginBottom: 4 };

  const Sl = ({ label, cfg, min, max }: { label: string; cfg: string; min: number; max: number }) => (
    <div>
      <label style={lbl}>{label}: {configs[cfg] || '0'}px</label>
      <input type="range" min={min} max={max} value={configs[cfg] || '0'} onChange={e => updateConfig(cfg, e.target.value)} style={{ width: '100%', accentColor: 'var(--c-lime)' }} />
    </div>
  );

  const renderLivePreview = (title = 'Vista del Sitio (Live)') => (
    <div className="admin-live-preview" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="admin-live-preview__top" style={{ flexShrink: 0 }}>
        <p className="admin-live-preview__label">{title}</p>
        <div className="admin-live-preview__devices">
          <button className={`admin-mini-btn ${previewDevice === 'mobile' ? 'active' : ''}`} onClick={() => setPreviewDevice('mobile')}>Celular</button>
          <button className={`admin-mini-btn ${previewDevice === 'tablet' ? 'active' : ''}`} onClick={() => setPreviewDevice('tablet')}>Tableta</button>
          <button className={`admin-mini-btn ${previewDevice === 'desktop' ? 'active' : ''}`} onClick={() => setPreviewDevice('desktop')}>Escritorio</button>
          <button className="admin-mini-btn" onClick={() => setPreviewRefreshKey((k) => k + 1)}>Recargar</button>
        </div>
      </div>
      <div className="admin-live-preview__frame" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#050505', padding: 12, overflow: 'hidden', position: 'relative' }}>
        <div
          style={{
            width: previewDevice === 'desktop' ? '100%' : `${previewViewport.w}px`,
            height: '100%',
            transform: 'none',
            transition: 'all 0.3s ease',
            position: 'relative',
            borderRadius: previewDevice === 'desktop' ? 12 : 32,
            border: previewDevice === 'desktop' ? '1px solid rgba(255,255,255,0.1)' : '10px solid #222',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            overflow: 'hidden'
          }}
        >
          <iframe
            ref={iframeRef}
            key={`${previewDevice}-${previewRefreshKey}`}
            title="Vista previa tienda"
            src={(() => {
              const sec = searchParams.get('section');
              if (!sec || sec === 'home' || sec === 'site-general' || sec === 'footer' || sec === 'checkout') return `/?preview=1&r=${previewRefreshKey}`;
              if (sec === 'catalogo') return `/?preview=1&admin_path=/catalogo&r=${previewRefreshKey}`;
              if (sec === 'quienes-somos') return `/?preview=1&admin_path=/quienes-somos&r=${previewRefreshKey}`;
              if (sec === 'contacto') return `/?preview=1&admin_path=/contacto&r=${previewRefreshKey}`;
              return `/?preview=1&admin_path=/coleccion/${sec}&r=${previewRefreshKey}`;
            })()}
            style={{ width: '100%', height: '100%', border: 0, background: '#000' }}
            onLoad={() => {
              if (iframeRef.current?.contentWindow) {
                iframeRef.current.contentWindow.postMessage({
                  type: 'ADMIN_PREVIEW_UPDATE',
                  payload: {
                    ...stateRef.current.configs,
                    frost_cards_data: JSON.stringify(stateRef.current.frost),
                    home_sections: JSON.stringify(stateRef.current.homeBlocks),
                    header_links: JSON.stringify(stateRef.current.headerLinks),
                    _collections: JSON.stringify(stateRef.current.collections)
                  }
                }, '*');
              }
            }}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ 
      height: '100vh', 
      display: 'grid', 
      gridTemplateColumns: (section === 'products-config' || section === 'clip-payments') ? '1fr' : 'minmax(350px, 450px) 1fr', 
      overflow: 'hidden' 
    }}>

      {/* LEFT COLUMN: Controls */}
      <div style={{ 
        height: '100%', 
        overflowY: 'auto', 
        padding: '24px 20px', 
        borderRight: '1px solid rgba(255,255,255,0.05)', 
        background: '#0a0a0a', 
        display: 'flex', 
        flexDirection: 'column',
        minHeight: 0
      }}>

        <div style={{ marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>Gestiona identidad visual y secciones.</p>
        </div>

        <div style={{ flex: 1, minHeight: 0, paddingBottom: 60 }}>

          {/* ── PRODUCTS CONFIG ── */}
          {section === 'products-config' && (
            <section style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
              <h2 style={{ fontSize: 18, marginBottom: 8, color: 'var(--c-lime)' }}>📦 Configuración Maestra de Productos</h2>
              <p className="muted-text" style={{ marginBottom: 24 }}>Edita SKU, Marca, Título y Precios de forma masiva. Los cambios se aplicarán al guardar.</p>
              <SectionProductsConfig 
                products={adminProducts} 
                collections={collections}
                onSave={(next) => {
                  setAdminProducts(next);
                  setProducts(next.filter(p => p.in_stock));
                }} 
              />
            </section>
          )}

          {/* ── GLOBAL ── */}
          {(section === 'site-general' || part === 'global' || part === 'header' || part === 'imagen') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              <section>
                <h2 style={{ fontSize: 18, marginBottom: 20, color: 'var(--c-lime)' }}>🌐 Secciones del Header</h2>
                <p className="muted-text" style={{ marginBottom: 16 }}>Agrega o quita secciones del menú de navegación principal de la tienda.</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {headerLinks.map((link, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 4, alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)' }}>
                      <button style={{ background: 'transparent', border: 'none', color: idx === 0 ? '#333' : '#aaa', cursor: idx === 0 ? 'default' : 'pointer', padding: '0 4px', fontSize: 10 }} disabled={idx === 0} onClick={() => {
                        const next = [...headerLinks];
                        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                        void saveHeaderLinks(next);
                      }}>▲</button>
                      <button style={{ background: 'transparent', border: 'none', color: idx === headerLinks.length - 1 ? '#333' : '#aaa', cursor: idx === headerLinks.length - 1 ? 'default' : 'pointer', padding: '0 4px', fontSize: 10 }} disabled={idx === headerLinks.length - 1} onClick={() => {
                        const next = [...headerLinks];
                        [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                        void saveHeaderLinks(next);
                      }}>▼</button>
                      <input type="text" placeholder="MENÚ" value={link.label} onChange={(e) => {
                        const next = [...headerLinks];
                        next[idx].label = e.target.value.toUpperCase();
                        void saveHeaderLinks(next);
                      }} style={{ flex: 1, minWidth: 80, fontSize: 11, padding: '2px', height: '20px', background: 'transparent', border: 'none', color: '#fff', outline: 'none' }} />
                      <input type="text" placeholder="/ruta" value={link.path} onChange={(e) => {
                        const next = [...headerLinks];
                        next[idx].path = e.target.value;
                        void saveHeaderLinks(next);
                      }} style={{ flex: 1.5, minWidth: 100, fontSize: 11, padding: '2px', height: '20px', background: 'transparent', border: 'none', color: '#aaa', outline: 'none' }} />
                      <button onClick={() => {
                        const next = headerLinks.filter((_, i) => i !== idx);
                        void saveHeaderLinks(next);
                      }} style={{ background: 'transparent', border: 'none', color: '#ffb3b3', cursor: 'pointer', padding: '0 4px', fontSize: 11 }}>✕</button>
                    </div>
                  ))}
                </div>
                <button className="btn btn-outline admin-mini-btn" style={{ marginTop: 8, padding: '4px 10px', fontSize: 11 }} onClick={() => saveHeaderLinks([...headerLinks, { label: 'NUEVA SECCIÓN', path: '/' }])}>+ Agregar</button>
              </section>

              <section>
                <h2 style={{ fontSize: 18, marginBottom: 20, color: 'var(--c-lime)' }}>🖼️ Header y Logo</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <AssetUploader label="Logo del Sitio" configKey="logo_url" currentValue={configs.logo_url} onUpdate={v => updateConfig('logo_url', v)} />
                  <AssetUploader label="Ícono para Menú INICIO (opcional)" configKey="header_home_icon" currentValue={configs.header_home_icon} onUpdate={v => updateConfig('header_home_icon', v)} />
                  <AssetUploader label="Logotipos de Pasarela (Checkout)" configKey="checkout_payment_logos" currentValue={configs.checkout_payment_logos} onUpdate={v => updateConfig('checkout_payment_logos', v)} />
                </div>
                <div style={{ marginTop: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Altura del Logo: {configs.logo_height || '40'}px</label>
                    <input type="range" min="20" max="120" value={configs.logo_height || '40'}
                      onChange={e => updateConfig('logo_height', e.target.value)} style={{ width: '100%', accentColor: 'var(--c-lime)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Tamaño texto menú: {configs.header_menu_size || '12'}px</label>
                    <input type="range" min="10" max="24" value={configs.header_menu_size || '12'}
                      onChange={e => updateConfig('header_menu_size', e.target.value)} style={{ width: '100%', accentColor: 'var(--c-lime)' }} />
                  </div>
                </div>
              </section>
              <section>
                <h2 style={{ fontSize: 18, marginBottom: 20, color: 'var(--c-lime)' }}>🔤 Tipografías</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
                  {([['font_heading', 'Títulos', 'Francois One'], ['font_sub', 'Subtítulos', 'Barlow Semi Condensed'], ['font_body', 'Cuerpo', 'Catamaran']] as const).map(([k, l, d]) => (
                    <div key={k}>
                      <label style={lbl}>{l}</label>
                      <select className="input-dark" value={configs[k] || d} onChange={e => updateConfig(k, e.target.value)} style={{ backgroundColor: '#111', color: '#fff' }}>
                        {FONTS.map(f => <option key={f} value={f} style={{ backgroundColor: '#111', color: '#fff' }}>{f}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* ── HOME ORDER ── */}
          {part === 'home-order' && (
            <section style={{ background: 'rgba(255,255,255,0.02)', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
              <h2 style={{ fontSize: 18, marginBottom: 8, color: 'var(--c-lime)' }}>🔃 Orden de Secciones (Inicio)</h2>
              <p className="muted-text" style={{ marginBottom: 16 }}>
                Las secciones ahora se pueden reordenar usando las flechas de arriba y abajo (<strong style={{ color: 'var(--c-lime)' }}>▲ ▼</strong>) ubicadas directamente en el menú lateral izquierdo.
              </p>
            </section>
          )}

          {/* ── HERO + FROST CARDS ── */}
          {part === 'home-hero' && (
            <section>
              <h2 style={{ fontSize: 18, marginBottom: 20, color: 'var(--c-lime)' }}>🖼️ Hero Principal</h2>
              <div style={{ display: 'grid', gridTemplateColumns: showPreview ? 'minmax(340px, 36%) minmax(680px, 64%)' : '1fr', gap: 24, alignItems: 'start' }}>
                <div className="admin-compact-controls" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <AssetUploader label="Imagen de Fondo del Hero" configKey="hero_image_url" currentValue={configs.hero_image_url} onUpdate={v => updateConfig('hero_image_url', v)} />

                  <div style={box}>
                    <h3 style={{ fontSize: 14, marginBottom: 16 }}>Ajuste de Imagen (fondo hero)</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                      <div>
                        <label style={lbl}>Modo de ajuste</label>
                        <select
                          className="input-dark"
                          value={configs.hero_image_fit || 'cover'}
                          onChange={(e) => updateConfig('hero_image_fit', e.target.value)}
                        >
                          <option value="cover">Cover (llena y puede cortar)</option>
                          <option value="contain">Contain (completa sin cortar)</option>
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Escala: {configs.hero_image_scale || '1'}</label>
                        <input
                          type="range"
                          min={0.6}
                          max={1.6}
                          step={0.05}
                          value={configs.hero_image_scale || '1'}
                          onChange={(e) => updateConfig('hero_image_scale', e.target.value)}
                          style={{ width: '100%', accentColor: 'var(--c-lime)' }}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <Sl label="Imagen X" cfg="hero_image_x" min={-600} max={600} />
                      <Sl label="Imagen Y" cfg="hero_image_y" min={-300} max={300} />
                    </div>
                  </div>

                  <div style={box}>
                    <h3 style={{ fontSize: 14, marginBottom: 16 }}>Texto de la Tarjeta</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div>
                        <label style={lbl}>Título Principal</label>
                        <input className="input-dark" type="text" value={configs.hero_title || 'NOVEDADES DIVINA'} onChange={e => updateConfig('hero_title', e.target.value)} />
                      </div>
                      <div>
                        <label style={lbl}>Subtítulo</label>
                        <textarea className="input-dark" rows={3} value={configs.hero_subtitle || 'Descubre la nueva generación de tratamientos cremas, Sérums, fotoprotectores y vitamínicos.'} onChange={e => updateConfig('hero_subtitle', e.target.value)} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={lbl}>Botón 1</label>
                          <input className="input-dark" type="text" value={configs.hero_btn1 || 'Explorar Catálogo'} onChange={e => updateConfig('hero_btn1', e.target.value)} />
                        </div>
                        <div>
                          <label style={lbl}>Botón 2</label>
                          <input className="input-dark" type="text" value={configs.hero_btn2 || 'Ver Cremas & Sérums'} onChange={e => updateConfig('hero_btn2', e.target.value)} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={box}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <h3 style={{ fontSize: 14, margin: 0 }}>Posición de la Tarjeta</h3>
                      <button 
                        onClick={() => {
                          if (window.confirm('¿Restaurar posición original de la tarjeta?')) {
                            updateConfig('hero_card_x', '-20');
                            updateConfig('hero_card_y', '40');
                            updateConfig('hero_card_scale', '1');
                            updateConfig('hero_card_visible', 'flex');
                          }
                        }}
                        style={{ background: 'none', border: 'none', color: 'var(--c-lime)', cursor: 'pointer', fontSize: 11, fontWeight: 'bold', textDecoration: 'underline' }}
                      >
                        RESTAURAR
                      </button>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 20 }}>
                      <input type="checkbox" checked={configs.hero_card_visible !== 'none'}
                        onChange={e => updateConfig('hero_card_visible', e.target.checked ? 'flex' : 'none')}
                        style={{ width: 18, height: 18, accentColor: 'var(--c-lime)' }} />
                      <span>Mostrar tarjeta flotante</span>
                    </label>
                    {configs.hero_card_visible !== 'none' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <Sl label="Posición X" cfg="hero_card_x" min={-800} max={800} />
                        <Sl label="Posición Y" cfg="hero_card_y" min={-600} max={600} />
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Escala: {sc}</label>
                          <input type="range" min={0.5} max={1.5} step={0.05} value={sc}
                            onChange={e => updateConfig('hero_card_scale', e.target.value)} style={{ width: '100%', accentColor: 'var(--c-lime)' }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ── BEST SELLERS ── */}
          {part === 'home-best-sellers' && (
            <section>
              <h2 style={{ fontSize: 18, marginBottom: 8, color: 'var(--c-lime)' }}>⭐ Productos Destacados en el Inicio</h2>
              <p className="muted-text" style={{ marginBottom: 16 }}>Elige qué productos aparecen en "Más Vendidos". Activos: <strong style={{ color: 'var(--c-lime)' }}>{featured.length}</strong></p>
              <input className="input-dark" type="text" placeholder="🔍 Buscar por nombre o marca..." value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 16, maxWidth: 420 }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 8, overflowY: 'auto', padding: '4px 2px' }}>
                {filtered.map(p => {
                  const on = p.tags?.includes('TOP_HOME');
                  return (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: on ? 'rgba(196,252,21,0.07)' : 'rgba(255,255,255,0.02)', borderRadius: 10, border: `1px solid ${on ? 'rgba(196,252,21,0.25)' : 'rgba(255,255,255,0.05)'}`, cursor: saving === p.id ? 'wait' : 'pointer', transition: 'all 0.2s' }}>
                      <input type="checkbox" checked={!!on} onChange={() => toggleTop(p)} disabled={saving === p.id} style={{ width: 16, height: 16, accentColor: 'var(--c-lime)', flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                        <p style={{ fontSize: 11, color: 'var(--c-text-muted)', margin: 0 }}>{p.brand || '—'} · ${p.price.toFixed(0)}</p>
                      </div>
                      {on && <span style={{ fontSize: 10, color: 'var(--c-lime)', fontWeight: 700 }}>★</span>}
                    </label>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── SEGMENTOS / COLLECTIONS ── */}
          {(part === 'home-segmentos') && (
            <section>
              <h2 style={{ fontSize: 18, marginBottom: 8, color: 'var(--c-lime)' }}>📁 Colecciones y Portadas</h2>
              <p className="muted-text" style={{ marginBottom: 24 }}>Personaliza las imágenes y textos de cada categoría.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 16 }}>
                {collections.map(col => (
                  <div key={col.id} style={{ ...box, padding: '12px' }}>
                    <AssetUploader
                      label={col.name}
                      configKey={`col_img_${col.id}`}
                      currentValue={col.image_url}
                      skipConfig
                      onUpdate={path => updateColImg(col.id, path)}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                      <div>
                        <label style={lbl}>Título</label>
                        <input 
                          className="input-dark" 
                          style={{ fontSize: 11, height: 28 }}
                          value={col.name}
                          onChange={e => {
                            const next = collections.map(c => c.id === col.id ? { ...c, name: e.target.value } : c);
                            setCollections(next);
                          }}
                          onBlur={e => updateColName(col.id, e.target.value)}
                        />
                      </div>
                      <div>
                        <label style={lbl}>Subtítulo</label>
                        <input 
                          className="input-dark" 
                          style={{ fontSize: 11, height: 28 }}
                          value={configs[`cat_subtitle_${col.id}`] || 'COLECCIÓN'}
                          onChange={e => updateConfig(`cat_subtitle_${col.id}`, e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── ESPECIFICO COLECCION (HERO Y RELACIONADOS) ── */}
          {['cremas-faciales', 'limpiadores', 'fotoprotectores', 'grooming', 'catalogo', ...customSections.map(s => s.key)].includes(section) && (() => {
            const col = collections.find(c => c.slug === section);
            const blockId = col?.id || section;
            const blockName = col?.name || section.replace(/-/g, ' ');
            return (
              <section>
                <h2 style={{ fontSize: 18, marginBottom: 20, color: 'var(--c-lime)', textTransform: 'capitalize' }}>✨ {blockName}</h2>
                <div style={{ display: 'grid', gridTemplateColumns: showPreview ? 'minmax(340px, 36%) minmax(680px, 64%)' : '1fr', gap: 24, alignItems: 'start' }}>
                  <div className="admin-compact-controls" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                    <div style={box}>
                      <h3 style={{ fontSize: 14, marginBottom: 16 }}>Hero Image de la Colección</h3>
                      <AssetUploader label="Imagen de Portada" configKey={`col_${blockId}_hero_img`} currentValue={configs[`col_${blockId}_hero_img`]} onUpdate={v => updateConfig(`col_${blockId}_hero_img`, v)} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
                        <Sl label="Posición X Imagen" cfg={`col_${blockId}_hero_img_x`} min={-600} max={600} />
                        <Sl label="Posición Y Imagen" cfg={`col_${blockId}_hero_img_y`} min={-300} max={300} />
                      </div>
                    </div>

                    <div style={box}>
                      <h3 style={{ fontSize: 14, marginBottom: 16 }}>Texto de la Tarjeta</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div>
                          <label style={lbl}>Título</label>
                          <input className="input-dark" type="text" value={configs[`col_${blockId}_hero_title`] || blockName} onChange={e => updateConfig(`col_${blockId}_hero_title`, e.target.value)} />
                        </div>
                        <div>
                          <label style={lbl}>Subtítulo</label>
                          <textarea className="input-dark" rows={2} value={configs[`col_${blockId}_hero_subtitle`] || ''} onChange={e => updateConfig(`col_${blockId}_hero_subtitle`, e.target.value)} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
                          <Sl label="Posición X Tarjeta" cfg={`col_${blockId}_hero_card_x`} min={-600} max={600} />
                          <Sl label="Posición Y Tarjeta" cfg={`col_${blockId}_hero_card_y`} min={-300} max={300} />
                        </div>
                        <div style={{ marginTop: 4 }}>
                          <label style={lbl}>Tamaño Tarjeta (%): {configs[`col_${blockId}_hero_card_scale`] || '100'}%</label>
                          <input type="range" min={50} max={150} step={1} value={configs[`col_${blockId}_hero_card_scale`] || '100'} onChange={e => updateConfig(`col_${blockId}_hero_card_scale`, e.target.value)} style={{ width: '100%', accentColor: 'var(--c-lime)' }} />
                        </div>
                      </div>
                    </div>

                    <div style={box}>
                      <h3 style={{ fontSize: 14, marginBottom: 16 }}>Destacados</h3>
                      <p style={{ fontSize: 11, color: '#aaa', marginBottom: 10 }}>Selecciona qué productos destacar (estos aparecerán en la fila dorada superior de la colección). Los productos generales se asignan en la Configuración Maestra.</p>
                      <input className="input-dark" type="text" placeholder="🔍 Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 16 }} />
                      <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, paddingRight: 4 }}>
                        {filtered.map(p => {
                          const tg = `REL_${blockId}`;
                          const on = p.tags?.includes(tg);
                          return (
                            <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', background: on ? 'rgba(196,252,21,0.07)' : 'rgba(255,255,255,0.02)', borderRadius: 6, border: `1px solid ${on ? 'rgba(196,252,21,0.25)' : 'rgba(255,255,255,0.05)'}`, cursor: saving === p.id ? 'wait' : 'pointer' }}>
                              <input type="checkbox" checked={!!on} onChange={async () => {
                                const newTags = on ? (p.tags || []).filter(x => x !== tg) : [...(p.tags || []), tg];
                                setSaving(p.id);
                                await supabase.from('products').update({ tags: newTags }).eq('id', p.id);
                                setProducts(prev => prev.map(x => x.id === p.id ? { ...x, tags: newTags } : x));
                                setSaving(null);
                              }} disabled={saving === p.id} style={{ width: 14, height: 14, accentColor: 'var(--c-lime)' }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 12, margin: 0, textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>{p.name}</p>
                              </div>
                              {on && <span style={{ color: 'var(--c-lime)' }}>★</span>}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            );
          })()}

          {/* ── QUIÉNES SOMOS ── */}
          {section === 'quienes-somos' && (
            <section>
              <h2 style={{ fontSize: 18, marginBottom: 8, color: 'var(--c-lime)' }}>👩 Nosotras (Quiénes Somos)</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 24 }}>
                <div style={box}>
                  <h3 style={{ fontSize: 15, marginBottom: 16, color: '#fff' }}>1. Cabecera (Hero)</h3>
                  <div style={{ marginBottom: 16 }}>
                    <label style={lbl}>Título (usa \n para saltos, usa &lt;span class="lime-text"&gt; para partes verdes)</label>
                    <textarea className="input-dark" rows={3} value={configs.about_hero_title ?? 'Angélica:\n<span class="lime-text">Tenaz, Mágica y Camaleónica</span>'}
                      onChange={e => updateConfig('about_hero_title', e.target.value)} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={lbl}>Texto Descriptivo</label>
                    <textarea className="input-dark" rows={4} value={configs.about_hero_desc ?? 'DIVINA® nace del amor más grande que existe: el de una madre. Es un homenaje a Angélica Trejo —fuerte, elegante, camaleónica— cuya forma de vivir la belleza fue siempre un acto de dignidad, ternura y luz. Cada producto honra su esencia: pasión, entrega y un corazón que brilló hasta su último aliento. DIVINA® existe para recordarnos que la belleza verdadera nace del alma… y perdura para siempre.'}
                      onChange={e => updateConfig('about_hero_desc', e.target.value)} />
                  </div>
                  <div>
                    <AssetUploader label="Fondo Cabecera" configKey="about_hero_img" currentValue={configs.about_hero_img} onUpdate={(val) => updateConfig('about_hero_img', val)} />
                  </div>
                </div>

                <div style={box}>
                  <h3 style={{ fontSize: 15, marginBottom: 16, color: '#fff' }}>2. Propósito y camino</h3>
                  <div style={{ marginBottom: 16 }}>
                    <label style={lbl}>Título (usa &lt;span class="lime-text"&gt; para resaltar)</label>
                    <input type="text" className="input-dark" value={configs.about_path_title ?? 'Nuestro <span class="lime-text">propósito</span> y camino'}
                      onChange={e => updateConfig('about_path_title', e.target.value)} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={lbl}>Descripción</label>
                    <textarea className="input-dark" rows={3} value={configs.about_path_desc ?? 'Nuestro propósito es mantener vivo un legado: honrar la fuerza, elegancia y entrega de Angélica convirtiendo su esencia en una marca que acompañe, inspire y eleve.'}
                      onChange={e => updateConfig('about_path_desc', e.target.value)} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={lbl}>Lista 1</label>
                    <input type="text" className="input-dark" value={configs.about_path_list1 ?? 'A CREAR nuestra propia línea de productos con la misma entrega y pasión.'}
                      onChange={e => updateConfig('about_path_list1', e.target.value)} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={lbl}>Lista 2</label>
                    <input type="text" className="input-dark" value={configs.about_path_list2 ?? 'A EXPANDIR una comunidad que celebre la belleza real, humana y cotidiana.'}
                      onChange={e => updateConfig('about_path_list2', e.target.value)} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={lbl}>Lista 3</label>
                    <input type="text" className="input-dark" value={configs.about_path_list3 ?? 'A DEMOSTRAR que cuidarse no es vanidad: es bienestar, identidad y amor propio.'}
                      onChange={e => updateConfig('about_path_list3', e.target.value)} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={lbl}>Cita final de la sección</label>
                    <input type="text" className="input-dark" value={configs.about_path_quote ?? '"Democratizar la belleza, dignificar el autocuidado y llevar luz donde antes hubo dolor."'}
                      onChange={e => updateConfig('about_path_quote', e.target.value)} />
                  </div>
                  <div>
                    <AssetUploader label="Imagen de Propósito" configKey="about_path_img" currentValue={configs.about_path_img} onUpdate={(val) => updateConfig('about_path_img', val)} />
                  </div>
                </div>

                <div style={box}>
                  <h3 style={{ fontSize: 15, marginBottom: 16, color: '#fff' }}>3. Nuestra Esencia</h3>
                  <div style={{ marginBottom: 16 }}>
                    <label style={lbl}>Título (usa &lt;span class="lime-text"&gt; para resaltar)</label>
                    <input type="text" className="input-dark" value={configs.about_essence_title ?? 'Nuestra <span class="lime-text">Esencia</span>'}
                      onChange={e => updateConfig('about_essence_title', e.target.value)} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={lbl}>Descripción</label>
                    <textarea className="input-dark" rows={3} value={configs.about_essence_desc ?? 'En DIVINA® creemos que la belleza no es un lujo: es un privilegio emocional, un reflejo del alma y un impulso de confianza. Somos un proyecto familiar impulsado por amor...'}
                      onChange={e => updateConfig('about_essence_desc', e.target.value)} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={lbl}>Frase Resaltada</label>
                    <textarea className="input-dark" rows={2} value={configs.about_essence_quote ?? 'DIVINA® MARCA QUE GUARDA EN EL CORAZÓN DE 3 PERSONAS UN LENGUAJE DE AMOR "ETERNO"'}
                      onChange={e => updateConfig('about_essence_quote', e.target.value)} />
                  </div>
                  <div>
                    <AssetUploader label="Imagen de Esencia" configKey="about_essence_img" currentValue={configs.about_essence_img} onUpdate={(val) => updateConfig('about_essence_img', val)} />
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ── CLIP PAYMENTS ── */}
          {section === 'clip-payments' && (
            <section style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                  <h2 style={{ fontSize: 22, marginBottom: 8, color: 'var(--c-lime)' }}>💳 Transacciones Clip</h2>
                  <p className="muted-text">Historial de pagos y estado de transacciones procesadas.</p>
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#080808', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <th style={{ padding: '14px 16px', color: '#888', fontSize: 11, fontWeight: 700, letterSpacing: '1px' }}>ORDEN</th>
                        <th style={{ padding: '14px 16px', color: '#888', fontSize: 11, fontWeight: 700, letterSpacing: '1px' }}>FECHA</th>
                        <th style={{ padding: '14px 16px', color: '#888', fontSize: 11, fontWeight: 700, letterSpacing: '1px' }}>CLIENTE</th>
                        <th style={{ padding: '14px 16px', color: '#888', fontSize: 11, fontWeight: 700, letterSpacing: '1px' }}>DIRECCIÓN</th>
                        <th style={{ padding: '14px 16px', color: '#888', fontSize: 11, fontWeight: 700, letterSpacing: '1px' }}>TOTAL</th>
                        <th style={{ padding: '14px 16px', color: '#888', fontSize: 11, fontWeight: 700, letterSpacing: '1px' }}>ESTADO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#666' }}>No hay transacciones registradas.</td>
                        </tr>
                      ) : (
                        orders.map((o, i) => (
                          <tr key={o.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                            <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#aaa', fontSize: 12 }}>{o.id.slice(0, 8).toUpperCase()}</td>
                            <td style={{ padding: '12px 16px', color: '#888', fontSize: 12 }}>{new Date(o.created_at || '').toLocaleDateString('es-MX')}</td>
                            <td style={{ padding: '12px 16px' }}>
                              <p style={{ margin: 0, fontWeight: 600 }}>{o.customer_name || '—'}</p>
                              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#888' }}>{o.customer_email || '—'}</p>
                            </td>
                            <td style={{ padding: '12px 16px', color: '#aaa', fontSize: 12 }}>
                              <p style={{ margin: 0 }}>{o.customer_address || '—'}</p>
                              <p style={{ margin: '2px 0 0', fontSize: 11 }}>{o.customer_city || ''} {o.customer_state || ''}</p>
                            </td>
                            <td style={{ padding: '12px 16px', color: 'var(--c-lime)', fontWeight: 700 }}>
                              ${o.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              {o.status === 'paid' ? (
                                <span style={{ background: 'rgba(76,175,80,0.15)', color: '#4CAF50', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, display: 'inline-block' }}>PAGADO</span>
                              ) : (
                                <span style={{ background: 'rgba(255,193,7,0.15)', color: '#FFC107', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, display: 'inline-block' }}>{o.status === 'pending' ? 'PENDIENTE' : o.status?.toUpperCase() || '—'}</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* ── FOOTER / CONTACT INFO ── */}
          {(part === 'home-footer' || section === 'contacto') && (
            <section>
              <h2 style={{ fontSize: 18, marginBottom: 20, color: 'var(--c-lime)' }}>💬 Contacto y WhatsApp (Footer)</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: section === 'contacto' ? 'none' : 420 }}>
                {section === 'contacto' && (
                  <div style={{ display: 'grid', gridTemplateColumns: showPreview ? 'minmax(340px, 36%) minmax(680px, 64%)' : '1fr', gap: 24, alignItems: 'start' }}>
                    <div className="admin-compact-controls" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      
                      <div style={box}>
                        <h3 style={{ fontSize: 14, marginBottom: 16 }}>Hero Image de Contacto</h3>
                        <AssetUploader label="Imagen de Portada" configKey="contact_hero_img" currentValue={configs.contact_hero_img} onUpdate={(val) => updateConfig('contact_hero_img', val)} />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
                          <Sl label="Posición X Imagen" cfg="contact_hero_bg_x" min={-1000} max={1000} />
                          <Sl label="Posición Y Imagen" cfg="contact_hero_bg_y" min={-1000} max={1000} />
                        </div>
                      </div>

                      <div style={box}>
                        <h3 style={{ fontSize: 14, marginBottom: 16 }}>Texto de la Tarjeta</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div>
                            <label style={lbl}>Título</label>
                            <input className="input-dark" type="text" value={configs.contact_hero_title ?? 'Ponte en <span class="lime-text">Contacto</span>'} onChange={e => updateConfig('contact_hero_title', e.target.value)} />
                          </div>
                          <div>
                            <label style={lbl}>Subtítulo</label>
                            <textarea className="input-dark" rows={2} value={configs.contact_hero_subtitle ?? '¿Tienes alguna duda sobre nuestros productos o necesitas ayuda con tu pedido? Escríbenos.'} onChange={e => updateConfig('contact_hero_subtitle', e.target.value)} />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <Sl label="Posición X Tarjeta" cfg="contact_hero_card_x" min={-1000} max={1000} />
                            <Sl label="Posición Y Tarjeta" cfg="contact_hero_card_y" min={-1000} max={1000} />
                          </div>
                          <Sl label="% Tamaño Tarjeta" cfg="contact_hero_card_scale" min={30} max={150} />
                        </div>
                      </div>

                      <div style={box}>
                        <h3 style={{ fontSize: 14, marginBottom: 16 }}>Datos de Contacto (Footer / Formulario)</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div>
                            <label style={lbl}>Teléfono WhatsApp (con código de país, sin +)</label>
                            <input type="text" className="input-dark" value={configs.contact_whatsapp || '5215647438328'} onChange={e => updateConfig('contact_whatsapp', e.target.value)} placeholder="Ej. 5215647438328" />
                            <p className="muted-text" style={{ fontSize: 11, marginTop: 4 }}>Los clientes del formulario serán redirigidos a este número.</p>
                          </div>
                          <div>
                            <label style={lbl}>Email de Contacto</label>
                            <input type="email" className="input-dark" value={configs.contact_email || 'hola@divinastore.com.mx'} onChange={e => updateConfig('contact_email', e.target.value)} />
                          </div>
                          <div>
                            <label style={lbl}>Dirección (Footer)</label>
                            <input type="text" className="input-dark" value={configs.contact_address || 'Ciudad de México, CP 06100'} onChange={e => updateConfig('contact_address', e.target.value)} />
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                )}
                {/* Fallback for footer part logic */}
                {part === 'home-footer' && section !== 'contacto' && (
                  <div style={box}>
                    <h3 style={{ fontSize: 14, marginBottom: 16 }}>Datos de Contacto</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div>
                        <label style={lbl}>Teléfono WhatsApp (con código de país, sin +)</label>
                        <input type="text" className="input-dark" value={configs.contact_whatsapp || '5215647438328'} onChange={e => updateConfig('contact_whatsapp', e.target.value)} placeholder="Ej. 5215647438328" />
                      </div>
                      <div>
                        <label style={lbl}>Email de Contacto</label>
                        <input type="email" className="input-dark" value={configs.contact_email || 'hola@divinastore.com.mx'} onChange={e => updateConfig('contact_email', e.target.value)} />
                      </div>
                      <div>
                        <label style={lbl}>Dirección (Footer)</label>
                        <input type="text" className="input-dark" value={configs.contact_address || 'Ciudad de México, CP 06100'} onChange={e => updateConfig('contact_address', e.target.value)} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <h2 style={{ fontSize: 18, margin: '40px 0 20px', color: 'var(--c-lime)' }}>🏷️ Brand</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 420 }}>
                <div>
                  <label style={lbl}>Tagline</label>
                  <input type="text" className="input-dark" value={configs.footer_tagline || 'La belleza que nace del alma y perdura para siempre.'}
                    onChange={e => updateConfig('footer_tagline', e.target.value)} />
                </div>
              </div>

              <h2 style={{ fontSize: 18, margin: '40px 0 20px', color: 'var(--c-lime)' }}>📧 Newsletter</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 420 }}>
                <div>
                  <label style={lbl}>Título newsletter</label>
                  <input type="text" className="input-dark" value={configs.footer_nl_title || 'Suscríbete ahora'}
                    onChange={e => updateConfig('footer_nl_title', e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Subtítulo newsletter</label>
                  <input type="text" className="input-dark" value={configs.footer_nl_subtitle || 'Recibe ofertas exclusivas, descuentos y mucho más'}
                    onChange={e => updateConfig('footer_nl_subtitle', e.target.value)} />
                </div>
              </div>

              <h2 style={{ fontSize: 18, margin: '40px 0 20px', color: 'var(--c-lime)' }}>📱 Redes sociales</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 420 }}>
                <div>
                  <label style={lbl}>URL de Facebook</label>
                  <input type="url" className="input-dark" value={configs.footer_facebook_url || ''}
                    onChange={e => updateConfig('footer_facebook_url', e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>URL de Twitter</label>
                  <input type="url" className="input-dark" value={configs.footer_twitter_url || ''}
                    onChange={e => updateConfig('footer_twitter_url', e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>URL de X (nuevo Twitter)</label>
                  <input type="url" className="input-dark" value={configs.footer_x_url || ''}
                    onChange={e => updateConfig('footer_x_url', e.target.value)} />
                </div>
              </div>

              <h2 style={{ fontSize: 18, margin: '40px 0 20px', color: 'var(--c-lime)' }}>🔗 Enlaces del Footer</h2>
              <p className="muted-text" style={{ marginBottom: 20 }}>Edita los menús de navegación inferior. Formato: <code>Texto : /enlace</code></p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
                {[1, 2, 3].map(col => (
                  <div key={col} style={box}>
                    <label style={lbl}>Título Columna {col}</label>
                    <input type="text" className="input-dark" style={{ marginBottom: 16 }}
                      value={configs[`footer_col${col}_title`] || (col === 1 ? 'Nuestras Secciones' : col === 2 ? 'Categorías' : 'Otras Secciones')}
                      onChange={e => updateConfig(`footer_col${col}_title`, e.target.value)} />

                    {[1, 2, 3].map(row => (
                      <div key={row} style={{ marginBottom: 12 }}>
                        <label style={{ ...lbl, fontSize: 10 }}>Enlace {row}</label>
                        <input type="text" className="input-dark"
                          value={configs[`footer_col${col}_l${row}`] || ''}
                          placeholder="Ej. Nombre : /enlace"
                          onChange={e => updateConfig(`footer_col${col}_l${row}`, e.target.value)} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>
      </div>

      {/* THE RIGHT PANE: Always-on Live Preview */}
      {section !== 'products-config' && (
        <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#000' }}>
          {renderLivePreview()}
        </div>
      )}
    </div>
  );
};