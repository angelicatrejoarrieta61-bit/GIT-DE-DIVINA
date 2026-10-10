/**
 * AdminLayout.tsx — Armazón del panel de administración (v1.3)
 * Menú por grupos plegables, secciones reales (colección o página),
 * guardado contextual y menú móvil.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, CreditCard, HeartHandshake, Package, Search, Mail, Megaphone, PenLine,
  Settings, Home, LayoutTemplate, FileText, Users, ChevronDown, Plus, ExternalLink, LogOut, Save, Menu, X,
  Trash2, ArrowUp, ArrowDown, Check, Info, Phone, type LucideIcon,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import './AdminLayout.css';

// ─── Tipos y constantes ───────────────────────────────────────
export type SectionType = 'collection' | 'page';
export interface CustomSection { key: string; label: string; type?: SectionType }
interface HeaderLink { label: string; path: string }
type Toast = { kind: 'ok' | 'error'; text: string } | null;

export const ADMIN_PATCH_EVENT = 'divina-admin-config-patch';
export interface AdminPatchDetail {
  configs?: Record<string, string>;
  removeKeys?: string[];
  headerLinks?: HeaderLink[];
  customSections?: CustomSection[];
  reloadCollections?: boolean;
}

const ADMIN_VERSION = 'v1.3';
const NAV_STATE_KEY = 'divina_admin_nav_groups';
const HOME_PARTS = ['home-hero', 'home-best-sellers', 'home-segmentos', 'home-footer'];
const HOME_LABELS: Record<string, string> = {
  'home-hero': 'Hero y tarjeta cristalina',
  'home-best-sellers': 'Productos más vendidos',
  'home-segmentos': 'Segmentos',
  'home-footer': 'Footer',
};
const BUILT_IN_SECTIONS: Array<{ key: string; label: string; icon: LucideIcon }> = [
  { key: 'cremas-faciales', label: 'Cremas Faciales', icon: LayoutTemplate },
  { key: 'limpiadores', label: 'Limpiadores', icon: LayoutTemplate },
  { key: 'fotoprotectores', label: 'Fotoprotectores', icon: LayoutTemplate },
  { key: 'grooming', label: 'Grooming', icon: LayoutTemplate },
  { key: 'catalogo', label: 'Catálogo', icon: LayoutTemplate },
  { key: 'quienes-somos', label: 'Quiénes Somos', icon: Info },
  { key: 'contacto', label: 'Contacto', icon: Phone },
];
const RESERVED_KEYS = new Set([
  'home', 'inicio', 'site-general', 'products-config', 'clip-payments', 'footer', 'checkout', 'blog', 'admin',
  ...BUILT_IN_SECTIONS.map((s) => s.key),
]);

const slugify = (s: string) => s
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const readGroups = (): Record<string, boolean> => {
  try { return JSON.parse(localStorage.getItem(NAV_STATE_KEY) || '{}') as Record<string, boolean>; } catch { return {}; }
};

const emitPatch = (detail: AdminPatchDetail) => window.dispatchEvent(new CustomEvent<AdminPatchDetail>(ADMIN_PATCH_EVENT, { detail }));

// ═══════════════════════════════════════════════════════════════
export const AdminLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [customSections, setCustomSections] = useState<CustomSection[]>([]);
  const [homeOrder, setHomeOrder] = useState<string[]>(HOME_PARTS);
  const [closed, setClosed] = useState<Record<string, boolean>>(readGroups);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [toast, setToast] = useState<Toast>(null);

  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const currentSection = query.get('section') || '';
  const currentPart = query.get('part') || '';
  const onConfig = location.pathname === '/admin/config';

  const notify = useCallback((t: Toast) => {
    setToast(t);
    if (t) window.setTimeout(() => setToast(null), 4200);
  }, []);

  // ── Sesión ─────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => { if (!session) navigate('/admin/login'); })
      .catch((err) => console.error('Session check error:', err))
      .finally(() => setLoading(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate('/admin/login');
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  // La pantalla vieja de productos redirige a la sección única
  useEffect(() => {
    if (onConfig && currentSection === 'products-config') navigate('/admin/productos', { replace: true });
  }, [onConfig, currentSection, navigate]);

  // Cerrar el menú móvil al navegar
  useEffect(() => { setMenuOpen(false); setConfirmRemove(null); }, [location.pathname, location.search]);

  // ── Datos del menú ─────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('store_config').select('key,value').in('key', ['admin_custom_sections', 'home_layout_order']);
      const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value as string]));
      if (map.admin_custom_sections) {
        try {
          const parsed = JSON.parse(map.admin_custom_sections);
          if (Array.isArray(parsed)) setCustomSections(parsed.filter((x) => x?.key && x?.label));
        } catch { setCustomSections([]); }
      }
      if (map.home_layout_order) {
        const legacy: Record<string, string> = { hero: 'home-hero', products: 'home-best-sellers', categories: 'home-segmentos', footer: 'home-footer' };
        const mapped = map.home_layout_order.split(',').filter(Boolean).map((p) => legacy[p] ?? p).filter((p) => HOME_PARTS.includes(p));
        HOME_PARTS.forEach((d) => { if (!mapped.includes(d)) mapped.push(d); });
        setHomeOrder(mapped);
      }
    })();
  }, []);

  // ── Home: orden de bloques ─────────────────────────────────
  const notifyPreviewOrder = (newOrder: string[]) => {
    const iframe = document.querySelector<HTMLIFrameElement>('iframe[title="Vista previa tienda"]');
    iframe?.contentWindow?.postMessage({ type: 'ADMIN_PREVIEW_UPDATE', payload: { home_layout_order: newOrder.join(',') } }, window.location.origin);
  };

  const moveHomeSection = async (index: number, move: number) => {
    if (index + move < 0 || index + move >= homeOrder.length) return;
    const newOrder = [...homeOrder];
    [newOrder[index], newOrder[index + move]] = [newOrder[index + move], newOrder[index]];
    setHomeOrder(newOrder);
    const value = newOrder.join(',');
    await supabase.from('store_config').upsert({ key: 'home_layout_order', value }, { onConflict: 'key' });
    emitPatch({ configs: { home_layout_order: value } });
    notifyPreviewOrder(newOrder);
    window.dispatchEvent(new Event('admin-manual-save'));
  };

  // ── Secciones personalizadas ───────────────────────────────
  const persistSections = async (next: CustomSection[]) => {
    setCustomSections(next);
    const value = JSON.stringify(next);
    const { error } = await supabase.from('store_config').upsert({ key: 'admin_custom_sections', value }, { onConflict: 'key' });
    if (error) throw error;
    return value;
  };

  const readHeaderLinks = async (): Promise<HeaderLink[] | null> => {
    const { data } = await supabase.from('store_config').select('value').eq('key', 'header_links').maybeSingle();
    if (!data?.value) return null;
    try { const parsed = JSON.parse(data.value); return Array.isArray(parsed) ? parsed as HeaderLink[] : null; } catch { return null; }
  };

  const createSection = async (input: { name: string; type: SectionType; inMenu: boolean }): Promise<string | null> => {
    const name = input.name.trim().replace(/\s+/g, ' ');
    if (name.length < 2) return 'Escribe un nombre de al menos 2 letras.';

    const { data: cols, error: colErr } = await supabase.from('collections').select('id,name,slug,sort_order');
    if (colErr) return `No pude leer las colecciones: ${colErr.message}`;
    const taken = new Set<string>([
      ...RESERVED_KEYS,
      ...customSections.map((s) => s.key),
      ...(cols ?? []).flatMap((c) => [String(c.slug ?? ''), slugify(String(c.name ?? ''))]),
    ]);
    const base = slugify(name) || `seccion-${Date.now()}`;
    let key = base;
    for (let i = 2; taken.has(key); i += 1) key = `${base}-${i}`;

    const patch: AdminPatchDetail = { configs: {} };
    const path = input.type === 'collection' ? `/coleccion/${key}` : `/info/${key}`;

    if (input.type === 'collection') {
      const nextOrder = Math.max(-1, ...(cols ?? []).map((c) => Number(c.sort_order ?? 0))) + 1;
      const { error } = await supabase.from('collections').insert({ name, slug: key, description: '', sort_order: nextOrder });
      if (error) return `No se pudo crear la colección: ${error.message}`;
      patch.reloadCollections = true;
    } else {
      const rows = [{ key: `page_${key}_title`, value: name }, { key: `page_${key}_body`, value: '' }];
      const { error } = await supabase.from('store_config').upsert(rows, { onConflict: 'key' });
      if (error) return `No se pudo crear la página: ${error.message}`;
      rows.forEach((r) => { patch.configs![r.key] = r.value; });
    }

    try {
      const next = [...customSections, { key, label: name, type: input.type }];
      patch.configs!.admin_custom_sections = await persistSections(next);
      patch.customSections = next;
    } catch (e) {
      return `Se creó, pero no pude guardarla en el menú: ${(e as { message?: string }).message ?? 'error'}`;
    }

    let menuNote = '';
    if (input.inMenu) {
      const links = await readHeaderLinks();
      if (links && !links.some((l) => l.path === path)) {
        const nextLinks = [...links, { label: name.toUpperCase(), path }];
        const { error } = await supabase.from('store_config').upsert({ key: 'header_links', value: JSON.stringify(nextLinks) }, { onConflict: 'key' });
        if (error) menuNote = ' No pude agregarla al menú de la tienda; hazlo desde General del sitio.';
        else patch.headerLinks = nextLinks;
      } else if (!links) {
        menuNote = ' Agrégala al menú de la tienda desde General del sitio.';
      }
    }

    emitPatch(patch);
    setAddOpen(false);
    notify({ kind: 'ok', text: `${input.type === 'collection' ? 'Colección' : 'Página'} "${name}" creada.${menuNote}` });
    navigate(`/admin/config?section=${key}`);
    return null;
  };

  const removeSection = async (s: CustomSection) => {
    const type: SectionType = s.type ?? 'collection';
    const path = type === 'collection' ? `/coleccion/${s.key}` : `/info/${s.key}`;
    const patch: AdminPatchDetail = { configs: {} };
    let note = '';

    try {
      if (type === 'page') {
        const keys = [`page_${s.key}_title`, `page_${s.key}_body`];
        await supabase.from('store_config').delete().in('key', keys);
        patch.removeKeys = keys;
      } else {
        const { data: col } = await supabase.from('collections').select('id').eq('slug', s.key).maybeSingle();
        if (col?.id) {
          const { count } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('category', col.id);
          if ((count ?? 0) === 0) {
            await supabase.from('collections').delete().eq('id', col.id);
            patch.reloadCollections = true;
          } else {
            note = ` La colección conserva sus ${count} productos; reasígnalos en Productos si quieres borrarla.`;
          }
        }
      }

      const links = await readHeaderLinks();
      if (links?.some((l) => l.path === path)) {
        const nextLinks = links.filter((l) => l.path !== path);
        await supabase.from('store_config').upsert({ key: 'header_links', value: JSON.stringify(nextLinks) }, { onConflict: 'key' });
        patch.headerLinks = nextLinks;
      }

      const next = customSections.filter((x) => x.key !== s.key);
      patch.configs!.admin_custom_sections = await persistSections(next);
      patch.customSections = next;
      emitPatch(patch);
      notify({ kind: 'ok', text: `"${s.label}" eliminada.${note}` });
      if (currentSection === s.key) navigate('/admin/config?section=site-general');
    } catch (e) {
      notify({ kind: 'error', text: `No se pudo eliminar: ${(e as { message?: string }).message ?? 'error'}` });
    } finally {
      setConfirmRemove(null);
    }
  };

  // ── Acciones globales ──────────────────────────────────────
  const handleSave = () => {
    setSaveState('saving');
    window.dispatchEvent(new Event('admin-manual-save'));
    window.setTimeout(() => setSaveState('saved'), 900);
    window.setTimeout(() => setSaveState('idle'), 2600);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/admin/login');
  };

  const toggleGroup = (id: string) => setClosed((prev) => {
    const next = { ...prev, [id]: !prev[id] };
    try { localStorage.setItem(NAV_STATE_KEY, JSON.stringify(next)); } catch { /* sin almacenamiento */ }
    return next;
  });

  // Scroll natural del documento dentro del admin
  useLayoutEffect(() => {
    const apply = () => {
      document.documentElement.style.overflowY = 'auto';
      document.documentElement.style.height = 'auto';
      document.body.style.overflowY = 'auto';
      document.body.style.height = 'auto';
      const root = document.getElementById('root');
      if (root) { root.style.height = 'auto'; root.style.overflow = 'visible'; }
      const main = document.querySelector<HTMLElement>('.admin-main');
      if (main) main.style.cssText = 'flex:1;min-width:0;height:auto;overflow:visible;';
    };
    apply();
    const id = window.setTimeout(apply, 100);
    return () => {
      window.clearTimeout(id);
      document.documentElement.style.overflowY = '';
      document.documentElement.style.height = '';
      document.body.style.overflowY = '';
      document.body.style.height = '';
      const root = document.getElementById('root');
      if (root) { root.style.height = ''; root.style.overflow = ''; }
    };
  }, [location.pathname]);

  if (loading) return null;

  // ── Helpers de render ──────────────────────────────────────
  const isPath = (p: string) => location.pathname === p || location.pathname.startsWith(`${p}/`);
  const isSection = (key: string) => onConfig && currentSection === key;
  const clipOpen = new URLSearchParams(location.search).get('pagos') === 'clip';

  const showSave = onConfig && currentSection !== 'clip-payments';

  return (
    <div className="admin-layout">
      {/* Barra superior (solo móvil) */}
      <header className="adm-topbar">
        <button type="button" className="adm-icon-btn" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-controls="adm-sidebar" aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}>
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <span className="adm-brand"><b>DIVINA</b> ADMIN</span>
        <Link to="/" target="_blank" className="adm-icon-btn" aria-label="Ver sitio"><ExternalLink size={16} /></Link>
      </header>
      {menuOpen && <button type="button" className="adm-scrim" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} />}

      <aside id="adm-sidebar" className={`admin-sidebar ${menuOpen ? 'is-open' : ''}`}>
        <div className="adm-side__head">
          <span className="adm-brand"><b>DIVINA</b> ADMIN <i>{ADMIN_VERSION}</i></span>
          <Link to="/" target="_blank" className="adm-site-link" title="Abrir la tienda en otra pestaña">
            Ver sitio <ExternalLink size={12} aria-hidden="true" />
          </Link>
        </div>

        <nav className="adm-nav" aria-label="Administración">
          <NavItem to="/admin" icon={LayoutDashboard} label="Resumen" active={location.pathname === '/admin'} />

          <NavGroup id="ventas" title="Ventas" closed={!!closed.ventas} onToggle={toggleGroup}>
            <NavItem to="/admin/reportes" icon={ClipboardList} label="Pedidos" active={isPath('/admin/reportes') && !clipOpen} />
            <NavItem to="/admin/reportes?pagos=clip" icon={CreditCard} label="Pagos Clip" active={isPath('/admin/reportes') && clipOpen} />
            <NavItem to="/admin/promotores" icon={HeartHandshake} label="Promotores y comisiones" active={isPath('/admin/promotores')} />
          </NavGroup>

          <NavGroup id="catalogo" title="Catálogo" closed={!!closed.catalogo} onToggle={toggleGroup}>
            <NavItem to="/admin/productos" icon={Package} label="Productos" active={isPath('/admin/productos') || isPath('/admin/import')} />
            <NavItem to="/admin/abastecimiento" icon={Search} label="Abastecimiento" active={isPath('/admin/abastecimiento')} />
          </NavGroup>

          <NavGroup id="clientes" title="Clientes y contenido" closed={!!closed.clientes} onToggle={toggleGroup}>
            <NavItem to="/admin/mensajes" icon={Mail} label="Mensajes de contacto" active={isPath('/admin/mensajes')} />
            <NavItem to="/admin/newsletter" icon={Megaphone} label="Newsletter y campañas" active={isPath('/admin/newsletter')} />
            <NavItem to="/admin/blog" icon={PenLine} label="Blog" active={isPath('/admin/blog')} />
          </NavGroup>

          <NavGroup
            id="tienda"
            title="Tu tienda"
            closed={!!closed.tienda}
            onToggle={toggleGroup}
            action={(
              <button type="button" className="adm-add" onClick={() => setAddOpen(true)} title="Añadir una colección o una página de información">
                <Plus size={12} strokeWidth={3} aria-hidden="true" /> Añadir
              </button>
            )}
          >
            <NavItem to="/admin/config?section=site-general" icon={Settings} label="General del sitio" active={isSection('site-general') || (onConfig && !currentSection)} />
            <NavItem to="/admin/config?section=home&part=home-order" icon={Home} label="Home / Inicio" active={isSection('home')} />

            {isSection('home') && (
              <div className="adm-sub">
                {homeOrder.map((part, idx) => (
                  <div key={part} className={`adm-sub__row ${currentPart === part ? 'is-active' : ''}`}>
                    <span className="adm-sub__arrows">
                      <button type="button" onClick={() => void moveHomeSection(idx, -1)} disabled={idx === 0} aria-label={`Subir ${HOME_LABELS[part]}`}><ArrowUp size={11} /></button>
                      <button type="button" onClick={() => void moveHomeSection(idx, 1)} disabled={idx === homeOrder.length - 1} aria-label={`Bajar ${HOME_LABELS[part]}`}><ArrowDown size={11} /></button>
                    </span>
                    <Link to={`/admin/config?section=home&part=${part}`}>{idx + 1}. {HOME_LABELS[part] ?? part}</Link>
                  </div>
                ))}
              </div>
            )}

            {BUILT_IN_SECTIONS.map((s) => (
              <React.Fragment key={s.key}>
                <NavItem to={`/admin/config?section=${s.key}`} icon={s.icon} label={s.label} active={isSection(s.key)} />
              </React.Fragment>
            ))}

            {customSections.map((s) => (
              <div key={s.key} className="adm-custom">
                {confirmRemove === s.key ? (
                  <div className="adm-confirm">
                    <span>¿Eliminar "{s.label}"?</span>
                    <button type="button" className="adm-confirm__yes" onClick={() => void removeSection(s)}>Sí</button>
                    <button type="button" onClick={() => setConfirmRemove(null)}>No</button>
                  </div>
                ) : (
                  <>
                    <NavItem to={`/admin/config?section=${s.key}`} icon={s.type === 'page' ? FileText : LayoutTemplate} label={s.label} active={isSection(s.key)} />
                    <button type="button" className="adm-custom__del" onClick={() => setConfirmRemove(s.key)} aria-label={`Eliminar ${s.label}`} title="Eliminar sección">
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </NavGroup>

          <NavGroup id="sistema" title="Sistema" closed={!!closed.sistema} onToggle={toggleGroup}>
            <NavItem to="/admin/usuarios" icon={Users} label="Usuarios" active={isPath('/admin/usuarios')} />
          </NavGroup>
        </nav>

        <div className="adm-side__foot">
          {showSave && (
            <button type="button" id="global-save-btn" className={`adm-save is-${saveState}`} onClick={handleSave} disabled={saveState === 'saving'}>
              {saveState === 'saved' ? <Check size={15} aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}
              {saveState === 'saving' ? 'Guardando…' : saveState === 'saved' ? 'Cambios guardados' : 'Guardar cambios'}
            </button>
          )}
          <button type="button" className="adm-logout" onClick={() => void handleLogout()}>
            <LogOut size={14} aria-hidden="true" /> Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <Outlet />
      </main>

      {addOpen && <AddSectionModal onClose={() => setAddOpen(false)} onCreate={createSection} />}
      {toast && <div className={`adm-toast adm-toast--${toast.kind}`} role="status">{toast.text}</div>}
    </div>
  );
};

// ─── Átomos del menú ─────────────────────────────────────────
function NavItem({ to, icon: Icon, label, active }: { to: string; icon?: LucideIcon; label: string; active: boolean }) {
  return (
    <Link to={to} className={`adm-link ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined}>
      {Icon && <Icon size={15} strokeWidth={2} aria-hidden="true" />}
      <span>{label}</span>
    </Link>
  );
}

function NavGroup({ id, title, closed, onToggle, action, children }: {
  id: string; title: string; closed: boolean; onToggle: (id: string) => void; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="adm-group">
      <div className="adm-group__head">
        <button type="button" className="adm-group__toggle" onClick={() => onToggle(id)} aria-expanded={!closed} aria-controls={`adm-g-${id}`}>
          <ChevronDown size={14} strokeWidth={2.5} className={closed ? 'is-closed' : ''} aria-hidden="true" />
          <span>{title}</span>
        </button>
        {action}
      </div>
      {!closed && <div id={`adm-g-${id}`} className="adm-group__body">{children}</div>}
    </section>
  );
}

// ─── Modal: añadir sección ───────────────────────────────────
function AddSectionModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (input: { name: string; type: SectionType; inMenu: boolean }) => Promise<string | null>;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<SectionType>('collection');
  const [inMenu, setInMenu] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const problem = await onCreate({ name, type, inMenu });
    if (problem) { setError(problem); setBusy(false); }
  };

  const slug = slugify(name);
  const options: Array<{ value: SectionType; icon: LucideIcon; title: string; text: string }> = [
    { value: 'collection', icon: LayoutTemplate, title: 'Colección de productos', text: 'Página con portada y sus productos, igual que Fotoprotectores o Grooming.' },
    { value: 'page', icon: FileText, title: 'Página de información', text: 'Página de texto: envíos, devoluciones, preguntas frecuentes, etc.' },
  ];

  return (
    <div className="adm-modal" role="dialog" aria-modal="true" aria-labelledby="adm-add-title" onClick={() => !busy && onClose()}>
      <form className="adm-modal__panel" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="adm-modal__head">
          <h2 id="adm-add-title">Añadir sección</h2>
          <button type="button" className="adm-icon-btn" onClick={onClose} disabled={busy} aria-label="Cerrar"><X size={16} /></button>
        </header>

        <div className="adm-field">
          <label htmlFor="adm-add-name">Nombre</label>
          <input id="adm-add-name" className="adm-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Cuidado Corporal · Envíos y devoluciones" autoFocus required maxLength={60} />
          {slug && <span className="adm-hint">Dirección: divinastore.com.mx{type === 'collection' ? '/coleccion/' : '/info/'}{slug}</span>}
        </div>

        <div className="adm-types" role="radiogroup" aria-label="Tipo de sección">
          {options.map((o) => (
            <button key={o.value} type="button" role="radio" aria-checked={type === o.value} className={`adm-type ${type === o.value ? 'is-on' : ''}`} onClick={() => setType(o.value)}>
              <o.icon size={18} aria-hidden="true" />
              <strong>{o.title}</strong>
              <span>{o.text}</span>
            </button>
          ))}
        </div>

        <label className="adm-check">
          <input type="checkbox" checked={inMenu} onChange={(e) => setInMenu(e.target.checked)} />
          Mostrarla en el menú de la tienda
        </label>

        {type === 'collection' && <p className="adm-hint">Después asigna sus productos en Productos, columna Colección.</p>}
        {error && <div className="adm-error" role="alert">{error}</div>}

        <footer className="adm-modal__foot">
          <button type="button" className="adm-btn adm-btn--ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" className="adm-btn adm-btn--primary" disabled={busy || name.trim().length < 2}>{busy ? 'Creando…' : 'Crear sección'}</button>
        </footer>
      </form>
    </div>
  );
}
