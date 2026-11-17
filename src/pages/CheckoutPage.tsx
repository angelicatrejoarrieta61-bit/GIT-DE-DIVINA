import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { createOrder, getStoreConfig, getProducts } from '../lib/queries';
import { useAdminPreview } from '../hooks/useadminpreview';
import type { CartItem } from '../types';
import { shippingFor, orderTotal, missingForFreeShipping, FREE_SHIPPING_FROM } from '../lib/shipping';
import { getImageUrl } from '../lib/supabase';
import './CheckoutPage.css';
import { analyticsItems, trackEvent } from '../lib/analytics';
import { getPromoterCode, normalizePromoterCode, savePromoterCode } from '../lib/promoterTracking';
import { couponLabel } from '../lib/coupons';

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
const OPEN_FAILED_MSG = 'No se pudo abrir el pago seguro. Intenta de nuevo en un momento.';
const CANCELLED_MSG = 'No se completó el pago. No se hizo ningún cargo; puedes intentar de nuevo.';
const isHex = (v?: string) => !!v && /^#[0-9a-f]{6}$/i.test(v);

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
  const shipping = shippingFor(productsTotal);
  const finalTotal = orderTotal(productsTotal);
  const missingFree = missingForFreeShipping(productsTotal);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

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
    reference: 'Casa', accepts_marketing: true,
  });

  const [colonias, setColonias] = useState<string[]>([]);
  const [isFetchingZip, setIsFetchingZip] = useState(false);

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

  // Regreso desde Stripe sin pagar: se expira la sesión, se cancela el pedido y el carrito sigue intacto
  useEffect(() => {
    if (searchParams.get('pago') !== 'cancelado') return;
    const orderId = searchParams.get('order');
    setError(CANCELLED_MSG);
    if (orderId) {
      void fetch('/api/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', orderId }),
        keepalive: true,
      })
        .then((r) => r.json())
        .then((j) => {
          // Si en realidad sí se pagó (regresó con Atrás después de pagar), se manda a la confirmación
          if (j && ['paid', 'shipped', 'delivered'].includes(String(j.status))) navigate(`/pago-exitoso?order=${orderId}`, { replace: true });
        })
        .catch(() => {});
    }
    navigate('/checkout', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          setForm(prev => ({
            ...prev,
            city: data.places[0]['place name'],
            state: data.places[0]['state'],
            neighborhood: unique[0] ?? '',
          }));
        }
      })
      .catch(e => console.error('[ZIP]', e))
      .finally(() => setIsFetchingZip(false));
  }, [form.zip]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

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
    if (!form.name || !form.email || !form.address || !form.city) {
      setError('Por favor completa todos los campos de envío obligatorios.');
      return;
    }
    setLoading(true);
    setError('');
    try {
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

      // El servidor recalcula el total y abre la página de pago segura de Stripe
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
      if (!r.ok || typeof data.url !== 'string' || !/^https:\/\//i.test(data.url)) {
        throw new Error(data.error || OPEN_FAILED_MSG);
      }
      trackEvent('add_payment_info', {
        currency: 'MXN', value: finalTotal, coupon: appliedCoupon, payment_type: 'stripe_checkout', items: analyticsItems(items),
      });
      // El carrito se conserva hasta que Stripe confirme el pago (lo vacía /pago-exitoso)
      window.location.assign(data.url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado.';
      console.error('[Checkout]', msg);
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
            <section className="cv2__card">
              <header className="cv2__card-head">
                <span className="cv2__card-num">01</span>
                <span className="cv2__card-title">Datos de Envío</span>
              </header>
              <div className="cv2__card-body">

                <div className="cv2__grid-3">
                  <div className="cv2__field">
                    <label htmlFor="co-name">Nombre</label>
                    <input id="co-name" type="text" name="name" value={form.name} onChange={handleInputChange} placeholder="Nombre completo" autoComplete="name" required />
                  </div>
                  <div className="cv2__field">
                    <label htmlFor="co-email">E-mail</label>
                    <input id="co-email" type="email" name="email" value={form.email} onChange={handleInputChange} placeholder="correo@ejemplo.com" autoComplete="email" required />
                  </div>
                  <div className="cv2__field">
                    <label htmlFor="co-phone">Celular</label>
                    <input id="co-phone" type="tel" name="phone" value={form.phone} onChange={handleInputChange} placeholder="(55) 1234 5678" autoComplete="tel" required />
                  </div>
                </div>

                <div className="cv2__divider"><span>Domicilio (México)</span></div>

                <div className="cv2__grid-3">
                  <div className="cv2__field">
                    <label htmlFor="co-zip">Código Postal{isFetchingZip && ' …'}</label>
                    <input id="co-zip" type="text" name="zip" value={form.zip} onChange={handleInputChange} placeholder="01000" maxLength={5} inputMode="numeric" autoComplete="postal-code" />
                  </div>
                  <div className="cv2__field">
                    <label htmlFor="co-state">Estado</label>
                    <select id="co-state" name="state" value={form.state} onChange={handleInputChange} autoComplete="address-level1">
                      {MEXICAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="cv2__field">
                    <label htmlFor="co-city">Ciudad / Municipio</label>
                    <input id="co-city" type="text" name="city" value={form.city} onChange={handleInputChange} placeholder="Ciudad de México" autoComplete="address-level2" required />
                  </div>
                </div>

                <div className="cv2__grid-2">
                  <div className="cv2__field">
                    <label htmlFor="co-neighborhood">Colonia</label>
                    {colonias.length > 0 ? (
                      <select id="co-neighborhood" name="neighborhood" value={form.neighborhood} onChange={handleInputChange}>
                        {colonias.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : (
                      <input id="co-neighborhood" type="text" name="neighborhood" value={form.neighborhood} onChange={handleInputChange} placeholder="Ingresa colonia" />
                    )}
                  </div>
                  <div className="cv2__field">
                    <label htmlFor="co-address">Calle y número</label>
                    <input id="co-address" type="text" name="address" value={form.address} onChange={handleInputChange} placeholder="Av. Insurgentes Sur 1234" autoComplete="street-address" required />
                  </div>
                </div>

                <div className="cv2__field">
                  <label htmlFor="co-reference">Referencia (opcional)</label>
                  <input id="co-reference" type="text" name="reference" value={form.reference} onChange={handleInputChange} placeholder="Casa color negra con portón" />
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
            <section className="cv2__card">
              <header className="cv2__card-head">
                <span className="cv2__card-num">02</span>
                <span className="cv2__card-title">Datos del pago</span>
              </header>
              <div className="cv2__card-body">

                {/* Pago en la página segura de Stripe */}
                <div className="cv2__pay-widget">
                  <div className="cv2__coming-soon">
                    <div className="cv2__coming-soon-icon" aria-hidden="true">🔒</div>
                    <p><strong>Pago seguro con Stripe</strong></p>
                    <p className="cv2__coming-soon-sub">
                      Al dar clic en pagar te llevamos a la página segura de Stripe para pagar con tarjeta de crédito o débito
                      (o Apple Pay / Google Pay cuando estén disponibles en tu dispositivo). Si tu banco lo pide, ahí mismo autorizas la compra.
                    </p>
                  </div>
                </div>

                {priceNotice && !error && <div className="cv2__error" role="status"><span>ℹ</span><span>{priceNotice}</span></div>}
                {error && <div className="cv2__error" role="alert"><span>⚠</span><span>{error}</span></div>}

                <button
                  type="button"
                  onClick={handlePagar}
                  className="cv2__pay-btn"
                  disabled={loading}
                  aria-busy={loading}
                >
                  {loading ? (
                    <><span className="cv2__spinner cv2__spinner--dark" />Abriendo pago seguro...</>
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
                {couponCode && !belowMin && (
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
