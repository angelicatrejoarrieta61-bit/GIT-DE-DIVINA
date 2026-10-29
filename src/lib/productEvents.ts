/**
 * productEvents.ts — Visitas y carritos por producto (tabla product_events).
 * Sin datos personales: solo un id de sesión aleatorio de la pestaña. Nunca bloquea la tienda.
 */
import { supabase } from './supabase';

type ProductEvent = 'view' | 'add_to_cart';
const SESSION_KEY = 'divina_sid';
const VIEWED_KEY = 'divina_viewed';

function sessionId(): string | null {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

/** Vista previa del admin (iframe) y bots no cuentan. */
function shouldTrack(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.self !== window.top) return false;
  if (/bot|crawl|spider|headless|lighthouse/i.test(navigator.userAgent)) return false;
  return true;
}

export function trackProductEvent(productId: string | undefined, event: ProductEvent): void {
  if (!productId || !/^[0-9a-f-]{36}$/i.test(productId) || !shouldTrack()) return;
  // Una vista por producto por sesión
  if (event === 'view') {
    try {
      const seen = new Set<string>(JSON.parse(sessionStorage.getItem(VIEWED_KEY) || '[]'));
      if (seen.has(productId)) return;
      seen.add(productId);
      sessionStorage.setItem(VIEWED_KEY, JSON.stringify([...seen].slice(-200)));
    } catch { /* sin sessionStorage: se cuenta igual */ }
  }
  void supabase
    .from('product_events')
    .insert({ product_id: productId, event, session_id: sessionId() })
    .then(({ error }) => { if (error && import.meta.env.DEV) console.warn('[productEvents]', error.message); });
}
