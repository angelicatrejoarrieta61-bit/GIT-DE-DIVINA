import type { CartItem, Product } from '../types';

type EventParams = Record<string, unknown>;
declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const measurementId = ((import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined) || 'G-5DQYSD6SKB').trim();
let initialized = false;

export function initAnalytics() {
  if (!measurementId || initialized || typeof window === 'undefined') return;
  initialized = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = (...args: unknown[]) => window.dataLayer.push(args);
  window.gtag('js', new Date());
  window.gtag('config', measurementId, { send_page_view: false });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);
}

export function trackEvent(name: string, params: EventParams = {}) {
  initAnalytics();
  window.gtag?.('event', name, params);
}

export function trackOnce(key: string, name: string, params: EventParams = {}) {
  if (sessionStorage.getItem(`ga4:${key}`)) return;
  sessionStorage.setItem(`ga4:${key}`, '1');
  trackEvent(name, params);
}

export const analyticsItem = (product: Product, quantity = 1) => ({
  item_id: product.sku || product.id,
  item_name: product.name,
  item_brand: product.brand,
  item_category: product.category || product.collection?.name,
  price: product.price,
  quantity,
});

export const analyticsItems = (items: CartItem[]) => items.map(item => analyticsItem(item.product, item.quantity));

export function trackPageView(path: string) {
  trackEvent('page_view', {
    page_title: document.title,
    page_location: `${window.location.origin}${path}`,
    page_path: path,
  });
}
