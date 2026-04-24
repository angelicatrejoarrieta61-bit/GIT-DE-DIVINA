import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AssetUploader } from '../../components/AssetUploader';
import { getStoreConfig, getCollections, getProducts } from '../../lib/queries';
import { supabase, getImageUrl } from '../../lib/supabase';
import type { Collection, Product } from '../../types';
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

const FONTS = ['Francois One','Barlow Semi Condensed','Catamaran','Inter','Montserrat','Playfair Display','Cinzel','Roboto','Lora','Oswald','Poppins','Raleway','Outfit','Space Grotesk','Bebas Neue'];

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
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'global' | 'hero' | 'secciones' | 'editor' | 'cols' | 'pages'>('global');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [frost, setFrost] = useState(DEFAULT_FROST);
  const [homeBlocks, setHomeBlocks] = useState<SectionBlock[]>(DEFAULT_HOME_BLOCKS);
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  const [showPreview, setShowPreview] = useState(false);
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const section = searchParams.get('section');
    const part = searchParams.get('part');
    if (section === 'home' && part === 'home-hero') {
      setTab('hero');
      return;
    }
    if (section === 'home' && part === 'home-best-sellers') {
      setTab('secciones');
      return;
    }
    if (section === 'home' && part === 'home-segmentos') {
      setTab('editor');
      return;
    }
    if (section === 'home' && !part) {
      setTab('hero');
      return;
    }
    if (part === 'hero') {
      setTab('hero');
      return;
    }
    if (part === 'secciones') {
      setTab('editor');
      return;
    }
    if (part === 'global' || part === 'header' || part === 'imagen') {
      setTab('global');
      return;
    }
    if (!section) return;
    if (section === 'site-general') {
      setTab('global');
      return;
    }
    if (section === 'home-hero') {
      setTab('hero');
      return;
    }
    if (section === 'home-secciones') {
      setTab('editor');
      return;
    }
    if (section === 'contacto') {
      setTab('pages');
      return;
    }
    if (section === 'catalogo' || section === 'cremas-faciales' || section === 'limpiadores' || section === 'fotoprotectores' || section === 'grooming' || section === 'quienes-somos') {
      setTab('secciones');
    }
  }, [searchParams]);

  const loadData = async () => {
    try {
      const [c, col, prods] = await Promise.all([getStoreConfig(), getCollections(), getProducts(300)]);
      setConfigs(c);
      setCollections(col);
      setProducts(prods);
      if (c.frost_cards_data) {
        try { const p = JSON.parse(c.frost_cards_data); if (p?.cards) setFrost({ ...DEFAULT_FROST, ...p }); } catch {}
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
    } catch (err) {
      console.error('Error loading admin config data:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = async (key: string, value: string) => {
    setConfigs(prev => ({ ...prev, [key]: value }));
    await supabase.from('store_config').upsert({ key, value }, { onConflict: 'key' });
  };

  const saveFrost = async (data: typeof DEFAULT_FROST) => {
    setFrost(data);
    await supabase.from('store_config').upsert({ key: 'frost_cards_data', value: JSON.stringify(data) }, { onConflict: 'key' });
  };

  const toggleTop = async (p: Product) => {
    const has = p.tags?.includes('TOP_HOME');
    const newTags = has ? (p.tags || []).filter(t => t !== 'TOP_HOME') : [...(p.tags || []), 'TOP_HOME'];
    setSaving(p.id);
    await supabase.from('products').update({ tags: newTags }).eq('id', p.id);
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, tags: newTags } : x));
    setSaving(null);
  };

  const updateColImg = async (id: string, path: string) => {
    await supabase.from('collections').update({ image_url: path }).eq('id', id);
    await loadData();
  };

  const saveHomeBlocks = async (nextBlocks: SectionBlock[]) => {
    setHomeBlocks(nextBlocks);
    await supabase
      .from('store_config')
      .upsert({ key: 'home_sections', value: JSON.stringify(nextBlocks) }, { onConflict: 'key' });
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

  if (loading) return <p style={{ padding: 48 }}>Cargando...</p>;

  const sc = configs.hero_card_scale || '1';
  const featured = products.filter(p => p.tags?.includes('TOP_HOME'));
  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.brand || '').toLowerCase().includes(search.toLowerCase())
  );

  const box = { padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' };
  const lbl = { fontSize: 10, fontWeight: 700 as const, display: 'block' as const, marginBottom: 4 };

  const previewViewport = useMemo(() => {
    if (previewDevice === 'mobile') return { w: 390, h: 844 };
    if (previewDevice === 'tablet') return { w: 820, h: 1024 };
    return { w: 1366, h: 900 };
  }, [previewDevice]);

  const renderLivePreview = (title = 'Vista del Sitio (Live)') => (
    <div className="admin-live-preview" style={{ position: 'sticky', top: 72 }}>
      <div className="admin-live-preview__top">
        <p className="admin-live-preview__label">{title}</p>
        <div className="admin-live-preview__devices">
          <button className={`admin-mini-btn ${previewDevice === 'mobile' ? 'active' : ''}`} onClick={() => setPreviewDevice('mobile')}>Celular</button>
          <button className={`admin-mini-btn ${previewDevice === 'tablet' ? 'active' : ''}`} onClick={() => setPreviewDevice('tablet')}>Tableta</button>
          <button className={`admin-mini-btn ${previewDevice === 'desktop' ? 'active' : ''}`} onClick={() => setPreviewDevice('desktop')}>Escritorio</button>
          <button className="admin-mini-btn" onClick={() => setPreviewRefreshKey((k) => k + 1)}>Recargar</button>
        </div>
      </div>
      <div className="admin-live-preview__frame">
        <div style={{ width: '100%', height: '82vh', minHeight: 620, overflow: 'auto', padding: 6, background: '#050505' }}>
          <div
            style={{
              width: previewDevice === 'desktop' ? '100%' : `${previewViewport.w}px`,
              height: previewViewport.h,
              margin: previewDevice === 'desktop' ? '0' : '0 auto',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.08)',
              borderRadius: 8,
              overflow: 'hidden',
              background: '#000',
            }}
          >
            <iframe
              key={`${previewDevice}-${previewRefreshKey}`}
              title="Vista previa tienda"
              src={`/?preview=1&device=${previewDevice}&r=${previewRefreshKey}`}
              style={{
                width: previewDevice === 'desktop' ? '100%' : `${previewViewport.w}px`,
                height: previewViewport.h,
                border: 0,
                background: '#000',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 className="admin-page-title">Configuración del CMS</h1>
          <p className="admin-page-subtitle" style={{ marginBottom: 0 }}>Gestiona identidad visual, secciones, productos y tipografías.</p>
        </div>
        <button 
          className={`btn ${showPreview ? 'btn-lime' : 'btn-outline'}`} 
          onClick={() => setShowPreview(!showPreview)}
          style={{ padding: '8px 20px', fontSize: '11px' }}
        >
          {showPreview ? '👁️ Ocultar Vista Previa' : '👁️ Mostrar Vista Previa'}
        </button>
      </div>

      <div style={{ width: '100%' }}>

        {/* ── GLOBAL ── */}
        {tab === 'global' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            <section>
              <h2 style={{ fontSize: 18, marginBottom: 20, color: 'var(--c-lime)' }}>🖼️ Logo</h2>
              <AssetUploader label="Logo del Sitio" configKey="logo_url" currentValue={configs.logo_url} onUpdate={v => updateConfig('logo_url', v)} />
              <div style={{ marginTop: 16 }}>
                <label style={lbl}>Altura del Logo: {configs.logo_height || '40'}px</label>
                <input type="range" min="20" max="120" value={configs.logo_height || '40'}
                  onChange={e => updateConfig('logo_height', e.target.value)} style={{ width: 300, accentColor: 'var(--c-lime)' }} />
              </div>
            </section>
            <section>
              <h2 style={{ fontSize: 18, marginBottom: 20, color: 'var(--c-lime)' }}>🔤 Tipografías</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
                {([['font_heading','Títulos','Francois One'],['font_sub','Subtítulos','Barlow Semi Condensed'],['font_body','Cuerpo','Catamaran']] as const).map(([k, l, d]) => (
                  <div key={k}>
                    <label style={lbl}>{l}</label>
                    <select className="input-dark" value={configs[k] || d} onChange={e => updateConfig(k, e.target.value)}>
                      {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ── HERO ── */}
        {tab === 'hero' && (
          <section>
            <h2 style={{ fontSize: 18, marginBottom: 20, color: 'var(--c-lime)' }}>🖼️ Hero Principal</h2>
            <div style={{ display: 'grid', gridTemplateColumns: showPreview ? 'minmax(340px, 36%) minmax(680px, 64%)' : '1fr', gap: 24, alignItems: 'start' }}>
              {/* Left: controls */}
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
                    <Sl label="Imagen X" cfg="hero_image_x" min={-600} max={600} configs={configs} updateConfig={updateConfig} />
                    <Sl label="Imagen Y" cfg="hero_image_y" min={-300} max={300} configs={configs} updateConfig={updateConfig} />
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
                  <h3 style={{ fontSize: 14, marginBottom: 16 }}>Posición de la Tarjeta</h3>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 20 }}>
                    <input type="checkbox" checked={configs.hero_card_visible !== 'none'}
                      onChange={e => updateConfig('hero_card_visible', e.target.checked ? 'flex' : 'none')}
                      style={{ width: 18, height: 18, accentColor: 'var(--c-lime)' }} />
                    <span>Mostrar tarjeta flotante</span>
                  </label>
                  {configs.hero_card_visible !== 'none' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <Sl label="Posición X" cfg="hero_card_x" min={-800} max={800} configs={configs} updateConfig={updateConfig} />
                      <Sl label="Posición Y" cfg="hero_card_y" min={-600} max={600} configs={configs} updateConfig={updateConfig} />
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Escala: {sc}</label>
                        <input type="range" min={0.5} max={1.5} step={0.05} value={sc}
                          onChange={e => updateConfig('hero_card_scale', e.target.value)} style={{ width: '100%', accentColor: 'var(--c-lime)' }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {showPreview && renderLivePreview('Vista del Sitio (Live - Home)')}
            </div>
          </section>
        )}

        {/* ── SECCIONES ── */}
        {tab === 'secciones' && (
          <div style={{ display: 'grid', gridTemplateColumns: showPreview ? 'minmax(340px, 36%) minmax(680px, 64%)' : '1fr', gap: 24, alignItems: 'start' }}>
            <div className="admin-compact-controls" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Product picker */}
            <section>
              <h2 style={{ fontSize: 18, marginBottom: 8, color: 'var(--c-lime)' }}>⭐ Productos Destacados en el Inicio</h2>
              <p className="muted-text" style={{ marginBottom: 16 }}>Elige qué productos aparecen en "Más Vendidos". Activos: <strong style={{ color: 'var(--c-lime)' }}>{featured.length}</strong></p>
              <input className="input-dark" type="text" placeholder="🔍 Buscar por nombre o marca..." value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 16, maxWidth: 420 }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 8, maxHeight: 500, overflowY: 'auto', padding: '4px 2px' }}>
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

            {/* Frost Cards editor */}
            <section>
              <h2 style={{ fontSize: 18, marginBottom: 8, color: 'var(--c-lime)' }}>❄️ Tarjetas de Beneficios</h2>
              <p className="muted-text" style={{ marginBottom: 20 }}>Edita el contenido de las 4 tarjetas del homepage.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                {([['title','Título de sección (acepta HTML)'],['subtitle','Subtítulo'],['promoText','Barra de promo']] as const).map(([k, l]) => (
                  <div key={k}>
                    <label style={lbl}>{l}</label>
                    <input className="input-dark" type="text" value={(frost as any)[k]} onChange={e => saveFrost({ ...frost, [k]: e.target.value })} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
                {frost.cards.map((card, i) => (
                  <div key={card.id} style={{ ...box, padding: 16 }}>
                    <p style={{ fontSize: 12, color: 'var(--c-lime)', fontWeight: 700, marginBottom: 12 }}>Tarjeta {i + 1} {i === 0 ? '(Grande)' : ''}</p>
                    {(['emoji','badge','title','txt'] as const).map(f => (
                      <div key={f} style={{ marginBottom: 8 }}>
                        <label style={{ fontSize: 11, color: 'var(--c-text-muted)', display: 'block', marginBottom: 4 }}>{f === 'txt' ? 'Descripción' : f === 'badge' ? 'Badge' : f === 'emoji' ? 'Emoji' : 'Título'}</label>
                        <input className="input-dark" type="text" value={(card as any)[f]} style={{ fontSize: 13 }}
                          onChange={e => saveFrost({ ...frost, cards: frost.cards.map((c, j) => j === i ? { ...c, [f]: e.target.value } : c) })} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>
            </div>
            {showPreview && renderLivePreview('Vista del Sitio (Live - Home)')}
          </div>
        )}

        {tab === 'editor' && (
          <section>
            <h2 style={{ fontSize: 18, marginBottom: 8, color: 'var(--c-lime)' }}>🧩 Editor Visual de Home</h2>
            <p className="muted-text" style={{ marginBottom: 20 }}>
              Administra bloques, textos, colores, redondez, espaciado y botones.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: showPreview ? 'minmax(340px, 36%) minmax(680px, 64%)' : '1fr', gap: 24, alignItems: 'start' }}>
              <div className="admin-compact-controls" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
                  <button className="btn btn-outline admin-mini-btn" onClick={() => addHomeBlock('text_center')}>+ Bloque Texto</button>
                  <button className="btn btn-outline admin-mini-btn" onClick={() => addHomeBlock('image_text')}>+ Bloque Imagen + Texto</button>
                </div>

                {homeBlocks.map((block, index) => (
                  <div key={block.id} style={{ ...box, padding: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <strong style={{ color: 'var(--c-lime)', fontSize: 11 }}>Bloque {index + 1} · {block.type === 'text_center' ? 'Texto Centrado' : 'Imagen + Texto'}</strong>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-outline admin-mini-btn" onClick={() => moveHomeBlock(block.id, -1)}>↑</button>
                        <button className="btn btn-outline admin-mini-btn" onClick={() => moveHomeBlock(block.id, 1)}>↓</button>
                        <button className="btn btn-outline admin-mini-btn" onClick={() => removeHomeBlock(block.id)} style={{ borderColor: 'rgba(255,80,80,.5)', color: '#ffb3b3' }}>Quitar</button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <div>
                        <label style={lbl}>Tipo</label>
                        <select
                          className="input-dark"
                          value={block.type}
                          onChange={(e) => updateHomeBlock(block.id, { type: e.target.value as SectionBlock['type'] })}
                        >
                          <option value="text_center">Texto centrado</option>
                          <option value="image_text">Imagen + texto</option>
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Alineación imagen</label>
                        <select
                          className="input-dark"
                          value={block.imagePosition || 'left'}
                          onChange={(e) => updateHomeBlock(block.id, { imagePosition: e.target.value as 'left' | 'right' })}
                          disabled={block.type !== 'image_text'}
                        >
                          <option value="left">Izquierda</option>
                          <option value="right">Derecha</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ marginBottom: 8 }}>
                      <label style={lbl}>Título (acepta HTML)</label>
                      <input className="input-dark" value={block.title || ''} onChange={(e) => updateHomeBlock(block.id, { title: e.target.value })} />
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <label style={lbl}>Contenido</label>
                      <textarea className="input-dark" rows={3} value={block.content || ''} onChange={(e) => updateHomeBlock(block.id, { content: e.target.value })} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
                      <div>
                        <label style={lbl}>Texto botón</label>
                        <input className="input-dark" value={block.buttonText || ''} onChange={(e) => updateHomeBlock(block.id, { buttonText: e.target.value })} />
                      </div>
                      <div>
                        <label style={lbl}>Link botón</label>
                        <input className="input-dark" value={block.buttonLink || ''} onChange={(e) => updateHomeBlock(block.id, { buttonLink: e.target.value })} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 8 }}>
                      <div>
                        <label style={lbl}>Color fondo</label>
                        <input className="input-dark" placeholder="#111111 o rgba(...)" value={block.backgroundColor || ''} onChange={(e) => updateHomeBlock(block.id, { backgroundColor: e.target.value })} />
                      </div>
                      <div>
                        <label style={lbl}>Color texto</label>
                        <input className="input-dark" placeholder="#ffffff" value={block.textColor || ''} onChange={(e) => updateHomeBlock(block.id, { textColor: e.target.value })} />
                      </div>
                      <div>
                        <label style={lbl}>Redondez (px)</label>
                        <input className="input-dark" type="number" min={0} max={80} value={block.borderRadius ?? 0} onChange={(e) => updateHomeBlock(block.id, { borderRadius: Number(e.target.value || 0) })} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={lbl}>Espaciado Y (px)</label>
                        <input className="input-dark" type="number" min={0} max={200} value={block.paddingY ?? 40} onChange={(e) => updateHomeBlock(block.id, { paddingY: Number(e.target.value || 40) })} />
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 22 }}>
                        <input
                          type="checkbox"
                          checked={block.showButton !== false}
                          onChange={(e) => updateHomeBlock(block.id, { showButton: e.target.checked })}
                          style={{ width: 16, height: 16, accentColor: 'var(--c-lime)' }}
                        />
                        Mostrar botón
                      </label>
                    </div>

                    {block.type === 'image_text' && (
                      <div style={{ marginTop: 12 }}>
                        <AssetUploader
                          label="Imagen del bloque"
                          configKey={`home_block_img_${block.id}`}
                          currentValue={block.imageUrl}
                          skipConfig
                          onUpdate={(path) => updateHomeBlock(block.id, { imageUrl: path })}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {showPreview && renderLivePreview('Vista del Sitio (Live - Home)')}
            </div>
          </section>
        )}

        {/* ── COLECCIONES ── */}
        {tab === 'cols' && (
          <section>
            <h2 style={{ fontSize: 18, marginBottom: 8, color: 'var(--c-lime)' }}>📁 Colecciones y Portadas</h2>
            <p className="muted-text" style={{ marginBottom: 24 }}>Sube la imagen de portada y personaliza el texto de cada colección.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {collections.map(col => {
                const imgSrc = col.image_url ? getImageUrl(col.image_url, { width: 400, quality: 75 }) : null;
                return (
                  <div key={col.id} style={{ ...box, display: 'grid', gridTemplateColumns: '180px 1fr', gap: 24, alignItems: 'start' }}>
                    {/* Large image preview */}
                    <div>
                      <div style={{ width: 180, height: 220, borderRadius: 12, overflow: 'hidden', background: '#111', border: '1px solid rgba(255,255,255,0.1)', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {imgSrc
                          ? <img src={imgSrc} alt={col.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <span style={{ fontSize: 40 }}>📷</span>
                        }
                      </div>
                      <AssetUploader
                        label="Cambiar Imagen"
                        configKey={`col_img_${col.id}`}
                        currentValue={col.image_url}
                        skipConfig
                        onUpdate={path => updateColImg(col.id, path)}
                      />
                    </div>
                    {/* Info controls */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <h3 style={{ margin: 0, fontSize: 16, color: 'var(--c-white)' }}>{col.name}</h3>
                      <div>
                        <label style={lbl}>Texto inferior de la tarjeta (ej: "COLECCIÓN")</label>
                        <input className="input-dark" type="text"
                          value={configs[`cat_subtitle_${col.id}`] || 'COLECCIÓN'}
                          onChange={e => updateConfig(`cat_subtitle_${col.id}`, e.target.value)} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={lbl}>Posición X tarjeta: {configs[`col_x_${col.id}`] || '0'}px</label>
                          <input type="range" min={-400} max={400} value={configs[`col_x_${col.id}`] || '0'}
                            onChange={e => updateConfig(`col_x_${col.id}`, e.target.value)} style={{ width: '100%', accentColor: 'var(--c-lime)' }} />
                        </div>
                        <div>
                          <label style={lbl}>Posición Y tarjeta: {configs[`col_y_${col.id}`] || '0'}px</label>
                          <input type="range" min={-300} max={300} value={configs[`col_y_${col.id}`] || '0'}
                            onChange={e => updateConfig(`col_y_${col.id}`, e.target.value)} style={{ width: '100%', accentColor: 'var(--c-lime)' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── PÁGINAS ── */}
        {tab === 'pages' && (
          <section>
            <h2 style={{ fontSize: 18, marginBottom: 20, color: 'var(--c-lime)' }}>💬 Contacto y WhatsApp</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 420 }}>
              <div>
                <label style={lbl}>Teléfono WhatsApp (con código de país, sin +)</label>
                <input type="text" className="input-dark" value={configs.contact_whatsapp || '5215647438328'}
                  onChange={e => updateConfig('contact_whatsapp', e.target.value)} placeholder="Ej. 5215647438328" />
                <p className="muted-text" style={{ fontSize: 11, marginTop: 4 }}>Los clientes del formulario serán redirigidos a este número.</p>
              </div>
              <div>
                <label style={lbl}>Email de Contacto</label>
                <input type="email" className="input-dark" value={configs.contact_email || 'hola@divinastore.com.mx'}
                  onChange={e => updateConfig('contact_email', e.target.value)} />
              </div>
            </div>
          </section>
        )}

      </div>
    </div>
  );
};
