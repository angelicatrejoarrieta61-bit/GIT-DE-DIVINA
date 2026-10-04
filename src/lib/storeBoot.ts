/**
 * storeBoot.ts — Arranque sin "brinco".
 *  - Copia local de store_config: el logo, tipografías y fondo se aplican
 *    desde el primer pintado en visitas repetidas.
 *  - Fondo de página configurable (liso o degradado de 2–3 colores).
 *  - Control del loader inicial definido en index.html.
 */

export const STORE_CONFIG_CACHE_KEY = 'divina_store_config_v1';
const LOGO_RATIO_KEY = 'divina_logo_ratio_v1';

/** Lee la última configuración guardada en este navegador (o null). */
export function readCachedStoreConfig(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(STORE_CONFIG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

export function writeCachedStoreConfig(cfg: Record<string, string>): void {
  try {
    if (Object.keys(cfg).length) localStorage.setItem(STORE_CONFIG_CACHE_KEY, JSON.stringify(cfg));
  } catch { /* almacenamiento lleno o bloqueado: no es crítico */ }
}

/** Proporción ancho/alto del logo, para reservar su espacio antes de que cargue. */
export function readLogoRatio(logoUrl: string | null): number | null {
  if (!logoUrl) return null;
  try {
    const saved = JSON.parse(localStorage.getItem(LOGO_RATIO_KEY) || 'null');
    return saved && saved.url === logoUrl && saved.ratio > 0 ? Number(saved.ratio) : null;
  } catch { return null; }
}

export function writeLogoRatio(logoUrl: string, ratio: number): void {
  try {
    if (ratio > 0 && Number.isFinite(ratio)) localStorage.setItem(LOGO_RATIO_KEY, JSON.stringify({ url: logoUrl, ratio }));
  } catch { /* no crítico */ }
}

// ── Fondo de página ──────────────────────────────────────────────
export type PageBgMode = 'default' | 'solid' | 'gradient';
const HEX = /^#[0-9a-f]{6}$/i;
export const isHexColor = (v: unknown): v is string => typeof v === 'string' && HEX.test(v.trim());

export interface PageBackground { css: string; start: string; end: string; }

/** Convierte la configuración en un fondo CSS seguro. Sin configuración → negro original. */
export function buildPageBackground(cfg: Record<string, string | undefined>): PageBackground {
  const fallback: PageBackground = { css: '#000000', start: '#000000', end: '#000000' };
  const mode = (cfg.page_bg_mode || 'default') as PageBgMode;
  const c1 = isHexColor(cfg.page_bg_c1) ? cfg.page_bg_c1.trim() : null;
  if (mode === 'default' || !c1) return fallback;
  if (mode === 'solid') return { css: c1, start: c1, end: c1 };

  const colors = [c1, cfg.page_bg_c2, cfg.page_bg_c3].filter(isHexColor).map((c) => c.trim());
  if (colors.length < 2) return { css: c1, start: c1, end: c1 };
  const angleNum = Number(cfg.page_bg_angle);
  const angle = Number.isFinite(angleNum) ? Math.min(360, Math.max(0, Math.round(angleNum))) : 180;
  return { css: `linear-gradient(${angle}deg, ${colors.join(', ')})`, start: colors[0], end: colors[colors.length - 1] };
}

export function applyPageBackground(cfg: Record<string, string | undefined>): void {
  const bg = buildPageBackground(cfg);
  const root = document.documentElement;
  root.style.setProperty('--page-bg', bg.css);
  root.style.setProperty('--page-bg-start', bg.start);
  root.style.setProperty('--page-bg-end', bg.end);
}

/** Luminancia relativa (0 negro – 1 blanco) para avisar de fondos demasiado claros. */
export function hexLuminance(hex: string): number {
  if (!isHexColor(hex)) return 0;
  const n = parseInt(hex.trim().slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

// ── Loader inicial ───────────────────────────────────────────────
let loaderHidden = false;
export function hideBootLoader(): void {
  if (loaderHidden) return;
  loaderHidden = true;
  const el = document.getElementById('boot-loader');
  if (!el) return;
  el.classList.add('is-done');
  window.setTimeout(() => el.remove(), 350);
}
