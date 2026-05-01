import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import './AdminLayout.css';

export const AdminLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [customSections, setCustomSections] = useState<Array<{ key: string; label: string }>>([]);
  const [homeOrder, setHomeOrder] = useState<string[]>(['home-hero', 'home-best-sellers', 'home-segmentos', 'home-footer']);
  const query = new URLSearchParams(location.search);
  const currentSection = query.get('section') || '';
  const currentPart = query.get('part') || '';

  // Check auth
  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!session) navigate('/admin/login');
      })
      .catch((err) => {
        console.error('Session check error:', err);
      })
      .finally(() => {
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate('/admin/login');
    });

    if (location.pathname === '/admin') {
      navigate('/admin/config?section=site-general', { replace: true });
    }

    return () => subscription.unsubscribe();
  }, [navigate, location]);

  useEffect(() => {
    const loadCustomSections = async () => {
      const { data } = await supabase.from('store_config').select('value').eq('key', 'admin_custom_sections').maybeSingle();
      if (!data?.value) return;
      try {
        const parsed = JSON.parse(data.value);
        if (Array.isArray(parsed)) {
          setCustomSections(parsed.filter((x) => x?.key && x?.label));
        }
      } catch {
        setCustomSections([]);
      }
    };

    const loadHomeOrder = async () => {
      const { data } = await supabase.from('store_config').select('value').eq('key', 'home_layout_order').maybeSingle();
      if (data?.value) {
        const parts = data.value.split(',').filter(Boolean);
        const mapped = parts.map((p: string) => {
          if (p === 'hero') return 'home-hero';
          if (p === 'products') return 'home-best-sellers';
          if (p === 'categories') return 'home-segmentos';
          if (p === 'footer') return 'home-footer';
          return p;
        }).filter((p: string) => ['home-hero', 'home-best-sellers', 'home-segmentos', 'home-footer'].includes(p));
        const defaults = ['home-hero', 'home-best-sellers', 'home-segmentos', 'home-footer'];
        defaults.forEach(d => { if (!mapped.includes(d)) mapped.push(d); });
        setHomeOrder(mapped);
      }
    };

    void loadCustomSections();
    void loadHomeOrder();
  }, []);

  // Notifica al iframe de preview para que actualice el orden en tiempo real
  const notifyPreviewOrder = (newOrder: string[]) => {
    const iframe = document.querySelector<HTMLIFrameElement>('iframe[title="Vista previa tienda"]');
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage(
      {
        type: 'ADMIN_PREVIEW_UPDATE',
        payload: { home_layout_order: newOrder.join(',') },
      },
      window.location.origin
    );
  };

  const moveHomeSection = async (index: number, move: number) => {
    if (index + move < 0 || index + move >= homeOrder.length) return;
    const newOrder = [...homeOrder];
    const temp = newOrder[index];
    newOrder[index] = newOrder[index + move];
    newOrder[index + move] = temp;
    setHomeOrder(newOrder);

    // Guardar en Supabase
    await supabase.from('store_config').upsert(
      { key: 'home_layout_order', value: newOrder.join(',') },
      { onConflict: 'key' }
    );

    // Notificar al iframe inmediatamente
    notifyPreviewOrder(newOrder);

    window.dispatchEvent(new Event('admin-manual-save'));
  };

  const persistCustomSections = async (next: Array<{ key: string; label: string }>) => {
    setCustomSections(next);
    await supabase.from('store_config').upsert(
      { key: 'admin_custom_sections', value: JSON.stringify(next) },
      { onConflict: 'key' }
    );
  };

  const handleAddSection = async () => {
    const title = window.prompt('Título de la nueva sección');
    if (!title) return;
    const clean = title.trim();
    if (!clean) return;
    const base = clean
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || `seccion-${Date.now()}`;
    let key = base;
    let i = 2;
    const existing = new Set([
      'home', 'inicio', 'cremas-faciales', 'limpiadores',
      'fotoprotectores', 'grooming', 'catalogo', 'quienes-somos', 'contacto',
      ...customSections.map((s) => s.key),
    ]);
    while (existing.has(key)) {
      key = `${base}-${i}`;
      i += 1;
    }
    await persistCustomSections([...customSections, { key, label: clean }]);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/admin/login');
  };

  if (loading) return null;

  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <aside className="admin-sidebar glass">
        <div className="admin-sidebar__brand" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div><span className="lime-text">DIVINA</span> ADMIN</div>
          </div>
          <Link
            to="/"
            target="_blank"
            className="btn btn-outline"
            style={{ width: '100%', justifyContent: 'center', padding: '10px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <span>👀</span> Ver sitio Live
          </Link>
        </div>

        <nav className="admin-sidebar__nav">
          <NavLink
            to="/admin/config?section=site-general"
            className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}
          >
            Configuración general del sitio
          </NavLink>

          <NavLink
            to="/admin/reportes"
            className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}
          >
            📊 Reportes de Pedidos
          </NavLink>



          <NavLink
            to="/admin/config?section=products-config"
            className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}
          >
            Configuración de Productos
          </NavLink>

          <p className="admin-sidebar__label admin-sidebar__label--tight">SECCIONES</p>

          <Link
            to="/admin/config?section=home&part=home-order"
            className={`admin-nav-link ${currentSection === 'home' ? 'active' : ''}`}
          >
            Home / Inicio
          </Link>

          {currentSection === 'home' && (
            <div className="admin-home-submenu">
              {homeOrder.map((sectionId, idx) => {
                const labelMap: Record<string, string> = {
                  'home-hero': 'Hero + V. cristalina',
                  'home-best-sellers': 'C. Productos más vendidos',
                  'home-segmentos': 'Segmentos',
                  'home-footer': 'Footer',
                };
                const label = labelMap[sectionId] ?? sectionId;

                return (
                  <div
                    key={sectionId}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      paddingLeft: 16, paddingRight: 8,
                      background: currentPart === sectionId ? 'rgba(255,255,255,0.05)' : 'transparent',
                      borderRadius: 6, margin: '2px 8px',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, justifyContent: 'center' }}>
                      <button
                        onClick={(e) => { e.preventDefault(); void moveHomeSection(idx, -1); }}
                        disabled={idx === 0}
                        style={{
                          background: 'none', border: 'none',
                          color: idx === 0 ? 'rgba(255,255,255,0.2)' : 'var(--c-lime)',
                          cursor: idx === 0 ? 'default' : 'pointer',
                          fontSize: 10, padding: 0, lineHeight: 1,
                        }}
                      >▲</button>
                      <button
                        onClick={(e) => { e.preventDefault(); void moveHomeSection(idx, 1); }}
                        disabled={idx === homeOrder.length - 1}
                        style={{
                          background: 'none', border: 'none',
                          color: idx === homeOrder.length - 1 ? 'rgba(255,255,255,0.2)' : 'var(--c-lime)',
                          cursor: idx === homeOrder.length - 1 ? 'default' : 'pointer',
                          fontSize: 10, padding: 0, lineHeight: 1,
                        }}
                      >▼</button>
                    </div>
                    <Link
                      to={`/admin/config?section=home&part=${sectionId}`}
                      className="admin-nav-link admin-nav-link--child"
                      style={{ flex: 1, paddingLeft: 0, paddingRight: 0, margin: 0, background: 'transparent' }}
                    >
                      {idx + 1}. {label}
                    </Link>
                  </div>
                );
              })}
            </div>
          )}

          {[
            ['cremas-faciales', 'Cremas Faciales', false],
            ['limpiadores', 'Limpiadores', false],
            ['fotoprotectores', 'Fotoprotectores', false],
            ['grooming', 'Grooming', false],
            ['catalogo', 'Catálogo', false],
            ['quienes-somos', 'Quiénes Somos', false],
            ['contacto', 'Contacto', false],
            ...customSections.map((s) => [s.key, s.label, true] as const),
          ].map(([sectionKey, label, isCustom]) => (
            <div key={sectionKey as string} style={{ display: 'flex', alignItems: 'center' }}>
              <Link
                to={`/admin/config?section=${sectionKey}`}
                className={`admin-nav-link ${currentSection === sectionKey ? 'active' : ''}`}
                style={{ flex: 1 }}
              >
                {label as string}
              </Link>
              {isCustom && (
                <button
                  style={{ background: 'none', border: 'none', color: '#ffb3b3', cursor: 'pointer', padding: '0 8px', fontSize: 16 }}
                  onClick={(e) => {
                    e.preventDefault();
                    if (window.confirm(`¿Eliminar sección ${label}?`)) {
                      void persistCustomSections(customSections.filter(s => s.key !== sectionKey));
                      if (currentSection === sectionKey) navigate('/admin/config?section=site-general');
                    }
                  }}
                  title="Eliminar sección"
                >×</button>
              )}
            </div>
          ))}
        </nav>

        <div className="admin-sidebar__actions">
          <div className="admin-sidebar__actions-head">
            <span className="admin-sidebar__label">Secciones</span>
            <button className="admin-add-section-btn" onClick={handleAddSection}>
              Añadir sección
            </button>
          </div>
        </div>

        <button
          className="btn btn--primary"
          style={{ marginTop: 'auto', marginBottom: '8px', padding: '12px', width: '100%', fontSize: '13px', fontWeight: 'bold' }}
          onClick={() => {
            window.dispatchEvent(new Event('admin-manual-save'));
            const btn = document.getElementById('global-save-btn');
            if (btn) {
              const prev = (btn as HTMLButtonElement).innerText;
              (btn as HTMLButtonElement).innerText = '¡Guardando...!';
              setTimeout(() => ((btn as HTMLButtonElement).innerText = prev), 1500);
            }
          }}
          id="global-save-btn"
        >
          GUARDAR CAMBIOS
        </button>

        <button className="admin-sidebar__logout" onClick={handleLogout}>
          Cerrar Sesión
        </button>
      </aside>

      {/* Main Content */}
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
};