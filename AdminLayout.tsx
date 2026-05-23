import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import './AdminLayout.css';

export const AdminLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [customSections, setCustomSections] = useState<Array<{ key: string; label: string }>>([]);
  const query = new URLSearchParams(location.search);
  const currentSection = query.get('section') || '';
  const currentPart = query.get('part') || '';

  // Auth check
  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!session) navigate('/admin/login');
      })
      .catch((err) => console.error('Session check error:', err))
      .finally(() => setLoading(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate('/admin/login');
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Fix scroll bloqueado por Tailwind preflight en html/body
  useEffect(() => {
    document.documentElement.style.overflowY = 'auto';
    document.body.style.overflowY = 'auto';
    return () => {
      document.documentElement.style.overflowY = '';
      document.body.style.overflowY = '';
    };
  }, []);

  // Custom sections
  useEffect(() => {
    const loadCustomSections = async () => {
      const { data } = await supabase.from('store_config').select('value').eq('key', 'admin_custom_sections').maybeSingle();
      if (!data?.value) return;
      try {
        const parsed = JSON.parse(data.value);
        if (Array.isArray(parsed)) setCustomSections(parsed.filter((x) => x?.key && x?.label));
      } catch {
        setCustomSections([]);
      }
    };
    void loadCustomSections();
  }, []);

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
    while (existing.has(key)) { key = `${base}-${i}`; i += 1; }
    await persistCustomSections([...customSections, { key, label: clean }]);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/admin/login');
  };

  if (loading) return null;

  return (
    <div className="admin-layout" style={{ display: 'flex', minHeight: '100vh', background: '#060606' }}>

      {/* Sidebar — sin scroll, altura natural */}
      <aside className="admin-sidebar glass" style={{ flexShrink: 0, overflow: 'visible' }}>
        <div className="admin-sidebar__brand">
          <span className="lime-text">DIVINA</span> ADMIN
        </div>

        <nav className="admin-sidebar__nav">
          <NavLink
            to="/admin/config?section=site-general"
            className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}
          >
            Configuración general del sitio
          </NavLink>

          <p className="admin-sidebar__label admin-sidebar__label--tight">Secciones</p>

          <Link
            to="/admin/config?section=home&part=home-hero"
            className={`admin-nav-link ${currentSection === 'home' ? 'active' : ''}`}
          >
            Home / Inicio
          </Link>

          {currentSection === 'home' && (
            <div className="admin-home-submenu">
              <Link
                to="/admin/config?section=home&part=home-hero"
                className={`admin-nav-link admin-nav-link--child ${currentPart === 'home-hero' ? 'active' : ''}`}
              >
                Hero + Ventana cristalina
              </Link>
              <Link
                to="/admin/config?section=home&part=home-best-sellers"
                className={`admin-nav-link admin-nav-link--child ${currentPart === 'home-best-sellers' ? 'active' : ''}`}
              >
                C. Productos más vendidos
              </Link>
              <Link
                to="/admin/config?section=home&part=home-segmentos"
                className={`admin-nav-link admin-nav-link--child ${currentPart === 'home-segmentos' ? 'active' : ''}`}
              >
                Segmentos
              </Link>
            </div>
          )}

          {[
            ['cremas-faciales', 'Cremas Faciales'],
            ['limpiadores', 'Limpiadores'],
            ['fotoprotectores', 'Fotoprotectores'],
            ['grooming', 'Grooming'],
            ['catalogo', 'Catálogo'],
            ['quienes-somos', 'Quiénes Somos'],
            ['contacto', 'Contacto'],
            ...customSections.map((s) => [s.key, s.label] as const),
          ].map(([sectionKey, label]) => (
            <Link
              key={sectionKey}
              to={`/admin/config?section=${sectionKey}`}
              className={`admin-nav-link ${currentSection === sectionKey ? 'active' : ''}`}
            >
              {label}
            </Link>
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

        <button className="admin-sidebar__logout" onClick={handleLogout}>
          Cerrar Sesión
        </button>
      </aside>

      {/* Main — scroll natural de la página completa */}
      <main className="admin-main" style={{ flex: 1, minWidth: 0, overflow: 'visible' }}>
        <Outlet />
      </main>

    </div>
  );
};