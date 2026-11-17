import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { createOrder, getStoreConfig, getProducts } from '../lib/queries';
import { useAdminPreview } from '../hooks/useadminpreview';
import type { CartItem } from '../types';
import { shippingFor, orderTotal, missingForFreeShipping, shippingCouponDiscount, FREE_SHIPPING_FROM } from '../lib/shipping';
import { getImageUrl } from '../lib/supabase';
import './CheckoutPage.css';
import { analyticsItems, trackEvent } from '../lib/analytics';
import { getPromoterCode, normalizePromoterCode, savePromoterCode } from '../lib/promoterTracking';
import { couponLabel, isShippingCoupon } from '../lib/coupons';

const MEXICAN_STATES = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua',
  'CDMX', 'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato', 'Guerrero', 'Hidalgo',
  'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro',
  'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala',
  'Veracruz', 'Yucatán', 'Zacatecas',
];

/** Imágenes y estilo del checkout (editables en Admin → Tu tienda → Checkout). */
export const CHECKOUT_DEFAULTS: Record<string, string> = {
  checkout_hero_img: '/checkout/hero-banner.png',
  checkout_trustbar_img: '/checkout/trust-bar.png',
  checkout_payment_img: '/checkout/payment-methods.png',
  checkout_side_img: '/checkout/trust-badges.png',
  checkout_footer_img: '/checkout/footer-badges.png',
  checkout_show_trustbar: 'true',
  checkout_show_side: 'true',
  checkout_show_footer: 'true',
  checkout_bg: '#f1f2ee',
  checkout_card_bg: '#ffffff',
  checkout_text: '#111111',
  checkout_summary_bg: '#101011',
  checkout_summary_text: '#f4f4f2',
  checkout_accent: '#d4ff2b',
  checkout_font: '',
};
const imgSrc = (v: string) => (!v ? '' : v.startsWith('/') ? v : getImageUrl(v));
const OPEN_FAILED_MSG = 'No se pudo iniciar el pago. Intenta de nuevo en un momento.';
const FAILED_MSG = 'Tu banco no aprobó el pago. No se hizo ningún cargo; revisa los datos o usa otra tarjeta.';

/* ── Stripe.js (se carga solo en el checkout) ── */
type StripeElements = {
  create: (type: 'payment', options?: Record<string, any>) => { mount: (el: string | HTMLElement) => void; unmount: () => void; on: (ev: string, cb: (e: any) => void) => void; destroy: () => void };
  update: (options: Record<string, any>) => void;
  submit: () => Promise<{ error?: { message?: string } }>;
};
type StripeJs = {
  elements: (options: Record<string, any>) => StripeElements;
  confirmPayment: (options: Record<string, any>) => Promise<{ error?: { message?: string; type?: string; code?: string }; paymentIntent?: { id: string; status: string } }>;
};
declare global { interface Window { Stripe?: (key: string, opts?: Record<string, any>) => StripeJs } }

let stripeLoader: Promise<StripeJs | null> | null = null;
function loadStripe(key: string): Promise<StripeJs | null> {
  if (stripeLoader) return stripeLoader;
  stripeLoader = new Promise((resolve) => {
    const done = () => resolve(window.Stripe ? window.Stripe(key, { locale: 'es-419' }) : null);
    if (window.Stripe) return done();
    const existing = document.querySelector<HTMLScriptElement>('script[src^="https://js.stripe.com/v3"]');
    const script = existing ?? document.createElement('script');
    if (!existing) { script.src = 'https://js.stripe.com/v3/'; script.async = true; document.head.appendChild(script); }
    script.addEventListener('load', done, { once: true });
    script.addEventListener('error', () => resolve(null), { once: true });
  });
  return stripeLoader;
}
const isHex = (v?: string) => !!v && /^#[0-9a-f]{6}$/i.test(v);

type FieldKey = 'name' | 'email' | 'phone' | 'zip' | 'city' | 'neighborhood' | 'address';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Reglas del formulario de envío. Devuelve el mensaje de cada campo con problema. */
function validateShipping(f: { name: string; email: string; phone: string; zip: string; city: string; neighborhood: string; address: string }) {
  const e: Partial<Record<FieldKey, string>> = {};
  if (f.name.trim().split(/\s+/).filter(Boolean).length < 2) e.name = 'Escribe nombre y apellido.';
  if (!EMAIL_RE.test(f.email.trim())) e.email = 'Revisa tu correo.';
  if (f.phone.replace(/\D/g, '').length !== 10) e.phone = 'Celular a 10 dígitos.';
  if (!/^\d{5}$/.test(f.zip.trim())) e.zip = 'CP de 5 dígitos.';
  if (!f.city.trim()) e.city = 'Escribe tu ciudad o municipio.';
  if (!f.neighborhood.trim()) e.neighborhood = 'Escribe tu colonia.';
  if (!/\d/.test(f.address) || f.address.trim().length < 5) e.address = 'Calle y número exterior.';
  return e;
}

const norm = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
/** Convierte el estado que da el servicio de CP al nombre de la lista (o null si no lo reconoce). */
function matchState(raw: string): string | null {
  const n = norm(raw);
  if (!n) return null;
  if (['ciudad de mexico', 'distrito federal', 'cdmx', 'df'].includes(n)) return 'CDMX';
  if (n === 'mexico' || n === 'estado de mexico') return 'Estado de México';
  if (n.startsWith('michoacan')) return 'Michoacán';
  if (n.startsWith('coahuila')) return 'Coahuila';
  if (n.startsWith('veracruz')) return 'Veracruz';
  return MEXICAN_STATES.find((s) => norm(s) === n) ?? null;
}

const IconLock = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

export const CheckoutPage: React.FC = () => {
  const {
    items, total, clearCart,
    couponCode, couponType, couponValue, couponMin, applyCoupon, revalidateCoupon, removeCoupon,
    couponBelowMin, discountAmount, totalAfterDiscount, refreshPrices,
  } = useCartStore();
  const [priceNotice, setPriceNotice] = useState('');
  const shipCoupon = isShippingCoupon(couponCode);
  const couponText = couponLabel(couponType, couponValue);

  // Vista previa del admin (iframe): con el carrito vacío se muestran productos de ejemplo
  const isPreview = typeof window !== 'undefined' && window.self !== window.top;
  const [demoItems, setDemoItems] = useState<CartItem[]>([]);
  useEffect(() => {
    if (!isPreview || items.length) return;
    getProducts(2).then((ps) => setDemoItems(ps.map((product) => ({ product, quantity: 1 }))));
  }, [isPreview, items.length]);
  const isDemo = items.length === 0 && demoItems.length > 0;
  const viewItems = isDemo ? demoItems : items;
  const subtotal = isDemo ? viewItems.reduce((s, i) => s + i.product.price * i.quantity, 0) : total();

  // Productos (con cupón) + envío: $120 si no llega a $999, gratis desde $999
  const productsTotal = isDemo ? subtotal : (couponCode ? totalAfterDiscount() : total());
  const shipDiscount = shipCoupon && !couponBelowMin() ? shippingCouponDiscount(couponType, couponValue, productsTotal) : 0;
  const shipping = shippingFor(productsTotal, shipDiscount);
  const finalTotal = orderTotal(productsTotal, shipDiscount);
  const missingFree = missingForFreeShipping(productsTotal);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<Record<string, string>>({});
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);
  const [promoterCode, setPromoterCode] = useState(() => getPromoterCode());

  const [form, setForm] = useState({
    name: '', email: '', phone: '',
    address: '', neighborhood: '', city: '', state: 'CDMX', zip: '',
    reference: '', accepts_marketing: true,
  });

  const [colonias, setColonias] = useState<string[]>([]);
  const [isFetchingZip, setIsFetchingZip] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  // Stripe: formulario de tarjeta dentro del sitio (Payment Element)
  const stripeRef = useRef<StripeJs | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const [payStatus, setPayStatus] = useState<'loading' | 'ready' | 'error' | 'missing_key'>('loading');
  const [payComplete, setPayComplete] = useState(false);

  useEffect(() => { getStoreConfig().then(setConfig); }, []);
  useAdminPreview(setConfig);
  const cfg = (k: string) => (config[k] !== undefined && config[k] !== '' ? config[k] : CHECKOUT_DEFAULTS[k]);
  const shown = (k: string) => cfg(k) !== 'false';

  // Tipografía elegida para el checkout (Google Fonts)
  const font = cfg('checkout_font');
  useEffect(() => {
    if (!font) return;
    const id = 'checkout-font';
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) { link = document.createElement('link'); link.id = id; link.rel = 'stylesheet'; document.head.appendChild(link); }
    link.href = `https://fonts.googleapis.com/css2?family=${font.trim().replace(/ /g, '+')}:wght@400;500;600;700;800&display=swap`;
  }, [font]);

  const themeVars = {
    ...(isHex(cfg('checkout_bg')) && { '--cv2-bg': cfg('checkout_bg') }),
    ...(isHex(cfg('checkout_card_bg')) && { '--cv2-card-bg': cfg('checkout_card_bg'), '--cv2-input-bg': cfg('checkout_card_bg') }),
    ...(isHex(cfg('checkout_text')) && { '--cv2-text': cfg('checkout_text') }),
    ...(isHex(cfg('checkout_summary_bg')) && { '--cv2-dark': cfg('checkout_summary_bg') }),
    ...(isHex(cfg('checkout_summary_text')) && { '--cv2-dark-text': cfg('checkout_summary_text') }),
    ...(isHex(cfg('checkout_accent')) && { '--cv2-lime': cfg('checkout_accent') }),
    ...(font && { fontFamily: `"${font}", var(--f-body), sans-serif` }),
  } as React.CSSProperties;

  // Monta el formulario de tarjeta de Stripe (modo diferido: el cobro se crea en el servidor al pagar)
  const amountCents = Math.round(finalTotal * 100);
  const accent = isHex(cfg('checkout_text')) ? cfg('checkout_text') : '#111111';
  const cardBg = isHex(cfg('checkout_card_bg')) ? cfg('checkout_card_bg') : '#ffffff';
  useEffect(() => {
    const key = (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined)?.trim();
    if (!key) { setPayStatus('missing_key'); return; }
    if (isDemo || !items.length || amountCents < 100) return;
    let alive = true;
    let el: ReturnType<StripeElements['create']> | null = null;
    setPayStatus('loading');
    loadStripe(key).then((stripe) => {
      if (!alive) return;
      if (!stripe) { setPayStatus('error'); return; }
      stripeRef.current = stripe;
      const elements = stripe.elements({
        mode: 'payment',
        amount: amountCents,
        currency: 'mxn',
        paymentMethodTypes: ['card'],
        locale: 'es-419',
        ...(font && { fonts: [{ cssSrc: `https://fonts.googleapis.com/css2?family=${font.trim().replace(/ /g, '+')}:wght@400;500;600;700&display=swap` }] }),
        appearance: {
          theme: 'flat',
          labels: 'floating',
          variables: {
            colorPrimary: accent, colorText: accent, colorBackground: cardBg,
            colorDanger: '#c81e1e', borderRadius: '10px', fontSizeBase: '14px',
            ...(font && { fontFamily: `"${font}", sans-serif` }),
          },
          rules: {
            '.Input': { border: '1px solid #d6d9d2', backgroundColor: cardBg, boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)' },
            '.Tab': { border: '1px solid #d6d9d2', backgroundColor: cardBg },
            '.Tab--selected': { border: `1px solid ${accent}`, boxShadow: `0 0 0 1px ${accent}` },
            '.Input:focus': { border: `1px solid ${accent}`, boxShadow: `0 0 0 3px rgba(212,255,43,0.18), 0 0 0 1px ${accent}` },
            '.Label': { fontSize: '12px', fontWeight: '700', marginBottom: '5px' },
          },
        },
      });
      elementsRef.current = elements;
      el = elements.create('payment', { layout: 'tabs', fields: { billingDetails: { address: 'never', email: 'never', phone: 'never', name: 'auto' } } });
      el.on('ready', () => { if (alive) setPayStatus('ready'); });
      el.on('change', (e: any) => { if (alive) setPayComplete(Boolean(e?.complete)); });
      el.on('loaderror', () => { if (alive) setPayStatus('error'); });
      el.mount('#stripe-payment-element');
    });
    return () => {
      alive = false;
      try { el?.destroy(); } catch { /* ya desmontado */ }
      elementsRef.current = null;
    };
    // Solo se monta una vez por sesión de checkout; el monto se actualiza aparte
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo, items.length > 0, payStatus === 'missing_key', font, accent, cardBg]);

  // Si cambia el total (cupón, precio actualizado), el formulario de Stripe se entera sin volver a montar
  useEffect(() => {
    if (amountCents >= 100) { try { elementsRef.current?.update({ amount: amountCents }); } catch { /* aún no montado */ } }
  }, [amountCents]);

  // ZIP autocomplete
  useEffect(() => {
    if (form.zip.length !== 5) { setColonias([]); return; }
    setIsFetchingZip(true);
    fetch(`https://api.zippopotam.us/mx/${form.zip}`)
      .then(r => r.json())
      .then(data => {
        if (data.places?.length > 0) {
          const unique = Array.from(new Set(data.places.map((p: any) => p['place name']))) as string[];
          setColonias(unique);
          // El servicio da colonias y estado (no municipio): la ciudad la escribe la clienta
          const st = matchState(String(data.places[0]['state'] || ''));
          setForm(prev => ({
            ...prev,
            ...(st && { state: st }),
            neighborhood: unique.includes(prev.neighborhood) ? prev.neighborhood : (unique[0] ?? ''),
          }));
        }
      })
      .catch(e => console.error('[ZIP]', e))
      .finally(() => setIsFetchingZip(false));
  }, [form.zip]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    if (errors[name as FieldKey]) setErrors(prev => ({ ...prev, [name]: undefined }));
  };
  // Un campo marcado se limpia solo en cuanto su valor ya es válido (también si lo llenó la búsqueda por CP)
  useEffect(() => {
    if (!Object.values(errors).some(Boolean)) return;
    const now = validateShipping(form);
    const next: Partial<Record<FieldKey, string>> = {};
    (Object.keys(errors) as FieldKey[]).forEach((k) => { if (errors[k] && now[k]) next[k] = now[k]; });
    if (Object.keys(next).length !== Object.values(errors).filter(Boolean).length) setErrors(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);
  /** Valida un campo al salir de él (solo si ya tiene algo escrito). */
  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    const key = e.target.name as FieldKey;
    if (!e.target.value) return;
    const msg = validateShipping(form)[key];
    setErrors(prev => ({ ...prev, [key]: msg }));
  };
  const fieldProps = (key: FieldKey) => ({
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': errors[key] ? `co-${key}-err` : undefined,
    onBlur: handleBlur,
  });
  useEffect(() => {
    if (error === 'Revisa los datos de envío marcados.' && !Object.values(errors).some(Boolean)) setError('');
  }, [errors, error]);
  const fieldError = (key: FieldKey) =>
    errors[key] ? <p id={`co-${key}-err`} className="cv2__field-msg" role="alert">{errors[key]}</p> : null;

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setCouponError('');
    if (!couponInput.trim() || couponBusy) return;
    setCouponBusy(true);
    const err = await applyCoupon(couponInput);
    setCouponBusy(false);
    if (err) setCouponError(err); else setCouponInput('');
  };

  // Precios y existencia actuales (cambian solos con la revisión automática de proveedores)
  const syncCart = async (): Promise<boolean> => {
    const { changed, removed } = await refreshPrices();
    const parts: string[] = [];
    if (removed.length) parts.push(`Ya no está disponible y se quitó: ${removed.join(', ')}.`);
    if (changed.length) parts.push(`Se actualizó el precio de: ${changed.join(', ')}.`);
    setPriceNotice(parts.join(' '));
    return parts.length > 0;
  };
  useEffect(() => {
    if (isDemo || !items.length) return;
    void syncCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al entrar al checkout se confirma que el cupón guardado siga vigente
  useEffect(() => {
    if (!couponCode || isDemo) return;
    let alive = true;
    revalidateCoupon().then((msg) => { if (alive && msg) setCouponError(msg); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const belowMin = couponBelowMin();

  const handlePagar = async () => {
    if (isDemo) {
      setError('Vista previa del admin: aquí no se puede pagar.');
      return;
    }
    const found = validateShipping(form);
    setErrors(found);
    const firstBad = (Object.keys(found) as FieldKey[])[0];
    if (firstBad) {
      setError('Revisa los datos de envío marcados.');
      document.getElementById(`co-${firstBad}`)?.focus();
      return;
    }
    if (!stripeRef.current || !elementsRef.current || payStatus !== 'ready') {
      setError('El formulario de tarjeta no está listo. Espera un momento o recarga la página.');
      return;
    }
    setLoading(true);
    setError('');
    let orderId: string | null = null;
    try {
      // Stripe valida los datos de la tarjeta antes de registrar nada
      const { error: formErr } = await elementsRef.current.submit();
      if (formErr) throw new Error(formErr.message || 'Revisa los datos de tu tarjeta.');

      // El cupón se vuelve a validar justo antes de cobrar (pudo pausarse, vencer o agotarse)
      if (couponCode) {
        const msg = await revalidateCoupon();
        if (msg) {
          setCouponError(msg);
          throw new Error('Tu código de descuento ya no aplica. Revisa el nuevo total antes de pagar.');
        }
      }
      const appliedCoupon = couponCode && !couponBelowMin() ? couponCode : undefined;
      const appliedDiscount = appliedCoupon ? discountAmount() : 0;

      const order = await createOrder({
        customer_name: form.name, customer_email: form.email, customer_phone: form.phone,
        customer_address: `${form.address}, ${form.neighborhood}`,
        customer_neighborhood: form.neighborhood, customer_city: form.city,
        customer_state: form.state, customer_zip: form.zip, customer_reference: form.reference,
        items, total: finalTotal, status: 'pending',
        accepts_marketing: form.accepts_marketing,
        promoter_code: promoterCode || undefined,
        ...(appliedCoupon && { coupon_code: appliedCoupon, discount_amount: appliedDiscount }),
      });
      if (!order) throw new Error('No se pudo registrar la orden.');

      orderId = order.id;

      // El servidor recalcula el total y crea el cobro en Stripe
      const r = await fetch('/api/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          orderId: order.id,
          amount: finalTotal,
          couponCode: appliedCoupon ?? null,
          customerEmail: form.email,
        }),
      });
      const data = await r.json().catch(() => ({} as Record<string, any>));
      if (r.status === 409 && (data.code === 'price_changed' || data.code === 'unavailable')) {
        await syncCart();
        throw new Error(data.error ?? 'El total cambió. Revisa tu carrito y vuelve a pagar.');
      }
      if (r.status === 409 && data.code === 'already_paid') {
        clearCart();
        navigate(`/pago-exitoso?order=${order.id}`);
        return;
      }
      if (!r.ok || typeof data.client_secret !== 'string') throw new Error(data.error || OPEN_FAILED_MSG);
      trackEvent('add_payment_info', {
        currency: 'MXN', value: finalTotal, coupon: appliedCoupon, payment_type: 'card', items: analyticsItems(items),
      });

      // Cobro con la tarjeta capturada aquí. Si el banco pide 3-D Secure, Stripe lo abre en un modal en esta misma página.
      const { error: payErr, paymentIntent } = await stripeRef.current.confirmPayment({
        elements: elementsRef.current,
        clientSecret: data.client_secret,
        redirect: 'if_required',
        confirmParams: {
          return_url: `${window.location.origin}/pago-exitoso?order=${order.id}`,
          payment_method_data: {
            billing_details: {
              name: form.name, email: form.email,
              phone: form.phone.replace(/\D/g, '').slice(-10) || undefined,
              address: { country: 'MX', postal_code: form.zip || undefined, state: form.state, city: form.city, line1: form.address },
            },
          },
        },
      });
      if (payErr) {
        const soft = payErr.type === 'validation_error';
        if (!soft) {
          void fetch('/api/stripe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', orderId: order.id, reason: payErr.code || payErr.message || 'declined' }), keepalive: true }).catch(() => {});
        }
        throw new Error(soft ? (payErr.message || 'Revisa los datos de tu tarjeta.') : FAILED_MSG);
      }

      // El servidor confirma con Stripe y marca el pedido pagado (el navegador nunca lo marca)
      const st = await fetch('/api/stripe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status', orderId: order.id }),
      }).then((x) => x.json()).catch(() => ({} as Record<string, any>));

      if (['paid', 'shipped', 'delivered'].includes(String(st?.status)) || paymentIntent?.status === 'succeeded' || paymentIntent?.status === 'processing') {
        trackEvent('purchase', { transaction_id: order.id, currency: 'MXN', value: finalTotal, coupon: appliedCoupon, items: analyticsItems(items) });
        clearCart();
        navigate(`/pago-exitoso?order=${order.id}`);
        return;
      }
      throw new Error(FAILED_MSG);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado.';
      console.error('[Checkout]', msg);
      if (orderId && msg !== FAILED_MSG) {
        // No se llegó a cobrar: el pedido no queda "sin pagar" sin explicación
        void fetch('/api/stripe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', orderId, reason: msg.slice(0, 120) }), keepalive: true }).catch(() => {});
      }
      setError(msg);
      setLoading(false);
    }
  };

  if (viewItems.length === 0) {
    return (
      <div className="cv2-empty">
        <h2>Tu carrito está vacío</h2>
        <button onClick={() => navigate('/catalogo')} className="cv2-empty__btn">Ir al catálogo</button>
      </div>
    );
  }

  return (
    <div className="cv2" style={themeVars}>

      {/* HERO — IMAGEN 1 (a todo lo ancho; el menú queda encima de la imagen) */}
      {!cfg('checkout_hero_img') && <div style={{ height: 'var(--nav-h)' }} aria-hidden="true" />}
      {cfg('checkout_hero_img') && (
        <div className="cv2__hero">
          <img src={imgSrc(cfg('checkout_hero_img'))} alt="Finaliza tu compra" />
        </div>
      )}

      {/* TRUST BAR — IMAGEN 2 */}
      {shown('checkout_show_trustbar') && cfg('checkout_trustbar_img') && (
        <div className="cv2__trust-bar">
          <img src={imgSrc(cfg('checkout_trustbar_img'))} alt="Pago seguro" />
        </div>
      )}

      <div className="cv2__wrapper">
        <div className="cv2__grid">

          {/* ── COL IZQUIERDA ── */}
          <div className="cv2__main">

            {/* CARD 01 */}
            <section className="cv2__card" aria-labelledby="cv2-ship-title">
              <header className="cv2__card-head">
                <span className="cv2__card-num">01</span>
                <div className="cv2__card-titles">
                  <h2 id="cv2-ship-title" className="cv2__card-title">Datos de envío</h2>
                  <p className="cv2__card-sub">¿Quién recibe y a dónde lo mandamos?</p>
                </div>
              </header>
              <div className="cv2__card-body">

                <div className="cv2__grid-3">
                  <div className="cv2__field">
                    <label htmlFor="co-name">Nombre completo <span aria-hidden="true">*</span></label>
                    <input id="co-name" type="text" name="name" value={form.name} onChange={handleInputChange} placeholder="Nombre y apellido" autoComplete="name" required {...fieldProps('name')} />
                    {fieldError('name')}
                  </div>
                  <div className="cv2__field">
                    <label htmlFor="co-email">Correo <span aria-hidden="true">*</span></label>
                    <input id="co-email" type="email" name="email" value={form.email} onChange={handleInputChange} placeholder="correo@ejemplo.com" autoComplete="email" inputMode="email" required {...fieldProps('email')} />
                    {fieldError('email')}
                  </div>
                  <div className="cv2__field">
                    <label htmlFor="co-phone">Celular <span aria-hidden="true">*</span></label>
                    <input id="co-phone" type="tel" name="phone" value={form.phone} onChange={handleInputChange} placeholder="55 1234 5678" autoComplete="tel-national" inputMode="tel" maxLength={14} required {...fieldProps('phone')} />
                    {fieldError('phone')}
                  </div>
                </div>

                <div className="cv2__divider"><span>Domicilio en México</span></div>

                <div className="cv2__grid-3">
                  <div className="cv2__field">
                    <label htmlFor="co-zip">Código postal <span aria-hidden="true">*</span>{isFetchingZip && <span className="cv2__field-hint"> · buscando…</span>}</label>
                    <input id="co-zip" type="text" name="zip" value={form.zip} onChange={handleInputChange} placeholder="01000" maxLength={5} inputMode="numeric" autoComplete="postal-code" required {...fieldProps('zip')} />
                    {fieldError('zip')}
                  </div>
                  <div className="cv2__field">
                    <label htmlFor="co-state">Estado</label>
                    <select id="co-state" name="state" value={form.state} onChange={handleInputChange} autoComplete="address-level1">
                      {MEXICAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="cv2__field">
                    <label htmlFor="co-city">Ciudad / municipio <span aria-hidden="true">*</span></label>
                    <input id="co-city" type="text" name="city" value={form.city} onChange={handleInputChange} placeholder="Ciudad de México" autoComplete="address-level2" required {...fieldProps('city')} />
                    {fieldError('city')}
                  </div>
                </div>

                <div className="cv2__grid-2">
                  <div className="cv2__field">
                    <label htmlFor="co-neighborhood">Colonia <span aria-hidden="true">*</span></label>
                    {colonias.length > 0 ? (
                      <select id="co-neighborhood" name="neighborhood" value={form.neighborhood} onChange={handleInputChange} {...fieldProps('neighborhood')}>
                        {colonias.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : (
                      <input id="co-neighborhood" type="text" name="neighborhood" value={form.neighborhood} onChange={handleInputChange} placeholder="Escribe tu colonia" autoComplete="address-level3" required {...fieldProps('neighborhood')} />
                    )}
                    {fieldError('neighborhood')}
                  </div>
                  <div className="cv2__field">
                    <label htmlFor="co-address">Calle y número <span aria-hidden="true">*</span></label>
                    <input id="co-address" type="text" name="address" value={form.address} onChange={handleInputChange} placeholder="Av. Insurgentes Sur 1234, int. 5" autoComplete="street-address" required {...fieldProps('address')} />
                    {fieldError('address')}
                  </div>
                </div>

                <div className="cv2__field">
                  <label htmlFor="co-reference">Referencias para el repartidor <span className="cv2__field-hint">(opcional)</span></label>
                  <input id="co-reference" type="text" name="reference" value={form.reference} onChange={handleInputChange} placeholder="Ej. casa blanca con portón negro, entre calles…" />
                </div>

                <label className="cv2__checkbox">
                  <input
                    type="checkbox"
                    checked={form.accepts_marketing}
                    onChange={e => setForm(prev => ({ ...prev, accepts_marketing: e.target.checked }))}
                  />
                  <span>Quiero recibir ofertas exclusivas, descuentos y novedades de Divina Store MX.</span>
                </label>
              </div>
            </section>

            {/* CARD 02 */}
            <section className="cv2__card" aria-labelledby="cv2-pay-title">
              <header className="cv2__card-head">
                <span className="cv2__card-num">02</span>
                <div className="cv2__card-titles">
                  <h2 id="cv2-pay-title" className="cv2__card-title">Pago</h2>
                  <p className="cv2__card-sub">Pago seguro procesado por Stripe</p>
                </div>
              </header>
              <div className="cv2__card-body">

                {/* Tarjeta: Stripe la captura aquí mismo en un iframe seguro */}
                <div className="cv2__paybox">
                  <div className="cv2__paybox-row">
                    <span className="cv2__paybox-radio" aria-hidden="true" />
                    <div className="cv2__paybox-text">
                      <p className="cv2__paybox-title">Tarjeta de crédito o débito</p>
                      <p className="cv2__paybox-sub">Visa, Mastercard y American Express</p>
                    </div>
                    <ul className="cv2__brands" aria-label="Tarjetas aceptadas">
                      <li className="cv2__brand cv2__brand--visa">VISA</li>
                      <li className="cv2__brand cv2__brand--mc">MC</li>
                      <li className="cv2__brand cv2__brand--amex">AMEX</li>
                    </ul>
                  </div>
                  <div className="cv2__pay-widget">
                    {payStatus === 'loading' && (
                      <div className="cv2__pay-status"><div className="cv2__spinner" />Cargando formulario seguro…</div>
                    )}
                    {payStatus === 'missing_key' && (
                      <div className="cv2__pay-status cv2__pay-status--error">Falta configurar la llave pública de Stripe (VITE_STRIPE_PUBLISHABLE_KEY).</div>
                    )}
                    {payStatus === 'error' && (
                      <div className="cv2__pay-status cv2__pay-status--error">No se pudo cargar el formulario de pago. Recarga la página.</div>
                    )}
                    <div id="stripe-payment-element" className="cv2__stripe-mount" />
                  </div>
                  <p className="cv2__paybox-note"><IconLock /> Pago cifrado por Stripe. Divina Store nunca ve ni guarda los datos de tu tarjeta.</p>
                </div>

                {priceNotice && !error && <div className="cv2__error" role="status"><span>ℹ</span><span>{priceNotice}</span></div>}
                {error && <div className="cv2__error" role="alert"><span>⚠</span><span>{error}</span></div>}

                <button
                  type="button"
                  onClick={handlePagar}
                  className="cv2__pay-btn"
                  disabled={loading || payStatus !== 'ready' || !payComplete}
                  aria-busy={loading}
                >
                  {loading ? (
                    <><span className="cv2__spinner cv2__spinner--dark" />Procesando pago…</>
                  ) : (
                    <>
                      <IconLock />
                      Pagar ${finalTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                    </>
                  )}
                </button>

                <p className="cv2__terms">
                  Al hacer clic en pagar, aceptas nuestros{' '}
                  <a href="/terminos" target="_blank" rel="noreferrer">Términos y Condiciones</a>{' '}
                  y{' '}
                  <a href="/privacidad" target="_blank" rel="noreferrer">Aviso de Privacidad</a>.
                </p>
              </div>
            </section>
          </div>

          {/* ── COL DERECHA ── */}
          <aside className="cv2__aside">
            <div className="cv2__summary">
              <h2 className="cv2__summary-title">Resumen de tu compra</h2>

              <div className="cv2__summary-items">
                {viewItems.map(item => (
                  <div key={item.product.id} className="cv2__summary-item">
                    <div className="cv2__summary-item-img">
                      <img src={getImageUrl(item.product.image_url)} alt={item.product.name} />
                      <span className="cv2__summary-item-qty">{item.quantity}</span>
                    </div>
                    <div className="cv2__summary-item-info">
                      <p className="cv2__summary-item-name">{item.product.name}</p>
                      <p className="cv2__summary-item-qty-label">{item.product.brand || 'Divina'} · {item.quantity} pza{item.quantity !== 1 ? 's' : ''}</p>
                    </div>
                    <p className="cv2__summary-item-price">
                      ${(item.product.price * item.quantity).toLocaleString('es-MX')}
                    </p>
                  </div>
                ))}
              </div>

              <div className="cv2__summary-block">
                <label className="cv2__summary-label" htmlFor="co-coupon">Código de descuento</label>
                {couponCode ? (
                  <div className="cv2__coupon-active">
                    <span>🏷️ {couponCode} (-{couponText})</span>
                    <button type="button" onClick={removeCoupon} aria-label="Quitar cupón">✕</button>
                  </div>
                ) : (
                  <form onSubmit={handleApplyCoupon} className="cv2__coupon-form">
                    <input
                      id="co-coupon"
                      type="text"
                      placeholder="Ingresa tu código"
                      value={couponInput}
                      onChange={e => { setCouponInput(e.target.value); setCouponError(''); }}
                      aria-invalid={!!couponError}
                      autoCapitalize="characters"
                      disabled={couponBusy}
                    />
                    <button type="submit" disabled={couponBusy || !couponInput.trim()} aria-busy={couponBusy}>
                      {couponBusy ? 'VALIDANDO…' : 'APLICAR'}
                    </button>
                  </form>
                )}
                {couponError && <p className="cv2__coupon-error" role="alert">{couponError}</p>}
                {belowMin && (
                  <p className="cv2__coupon-error" role="status">
                    {couponCode} aplica en compras desde ${couponMin.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </p>
                )}
              </div>

              <div className="cv2__summary-block">
                <label className="cv2__summary-label" htmlFor="co-promoter">Código de promotora (opcional)</label>
                <input
                  id="co-promoter"
                  type="text"
                  placeholder="DIVINA-JOSE-4B2F26"
                  value={promoterCode}
                  onChange={e => setPromoterCode(normalizePromoterCode(e.target.value))}
                  onBlur={() => { if (promoterCode) savePromoterCode(promoterCode); }}
                  className="cv2__summary-input"
                />
                <small>Si llegaste con una liga personal, el código aparece automáticamente.</small>
              </div>

              <div className="cv2__summary-total">
                <div className="cv2__summary-row"><span>Subtotal</span><span>${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></div>
                {couponCode && !belowMin && !shipCoupon && (
                  <div className="cv2__summary-row cv2__summary-row--discount">
                    <span>Descuento ({couponText})</span>
                    <span>-${discountAmount().toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className={`cv2__summary-row ${shipping === 0 ? 'cv2__summary-row--discount' : ''}`}>
                  <span>Envío</span>
                  <span>{shipping === 0 ? 'Gratis' : `$${shipping.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}</span>
                </div>
                {missingFree > 0 && (
                  <p className="cv2__ship-hint">
                    Agrega <strong>${missingFree.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong> más y tu envío es gratis.
                    <span className="cv2__ship-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, (productsTotal / FREE_SHIPPING_FROM) * 100)}%` }} /></span>
                  </p>
                )}
                <div className="cv2__summary-row cv2__summary-row--total">
                  <span>Total</span>
                  <span className="cv2__summary-total-price">
                    ${finalTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} <small>MXN · IVA incluido</small>
                  </span>
                </div>
              </div>

              <div className="cv2__msi">💳 Tarjetas de crédito y débito</div>

              <ul className="cv2__benefits">
                <li>🚚 Envío $120 · gratis en compras desde $999 MXN</li>
                <li>🔒 Tu información está protegida</li>
                <li>⚡ Pago procesado por Stripe</li>
              </ul>

              {/* IMAGEN 3 */}
              <div className="cv2__payment-methods">
                <p>Métodos de pago aceptados</p>
                <img src={imgSrc(cfg('checkout_payment_img'))} alt="Métodos de pago aceptados" />
              </div>
            </div>

            {/* IMAGEN 4 */}
            {shown('checkout_show_side') && cfg('checkout_side_img') && (
              <div className="cv2__trust-badges-side">
                <img src={imgSrc(cfg('checkout_side_img'))} alt="Compra segura" />
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* IMAGEN 5 */}
      {shown('checkout_show_footer') && cfg('checkout_footer_img') && (
        <div className="cv2__footer-badges">
          <img src={imgSrc(cfg('checkout_footer_img'))} alt="Compra segura" />
        </div>
      )}
    </div>
  );
};
