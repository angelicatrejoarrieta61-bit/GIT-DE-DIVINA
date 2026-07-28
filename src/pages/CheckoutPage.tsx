import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { createOrder, updateOrderStatus, getStoreConfig } from '../lib/queries';
import { getImageUrl } from '../lib/supabase';
import './CheckoutPage.css';
import { analyticsItems, trackEvent } from '../lib/analytics';
import { getPromoterCode, normalizePromoterCode, savePromoterCode } from '../lib/promoterTracking';

declare const ClipSDK: new (apiKey: string) => {
  element: {
    create: (type: string, options?: Record<string, any>) => {
      mount: (id: string) => void;
      cardToken: () => Promise<{ id: string }>;
    };
  };
};

const MEXICAN_STATES = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua',
  'CDMX', 'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato', 'Guerrero', 'Hidalgo',
  'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro',
  'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala',
  'Veracruz', 'Yucatán', 'Zacatecas',
];

type PaymentTab = 'card' | 'applepay' | 'googlepay';

const IconLock = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

export const CheckoutPage: React.FC = () => {
  const {
    items, total, clearCart,
    couponCode, discountPercentage, applyCoupon, removeCoupon,
    discountAmount, totalAfterDiscount,
  } = useCartStore();

  const finalTotal = couponCode ? totalAfterDiscount() : total();
  const navigate = useNavigate();
  const sdkCardRef = useRef<any>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [, setConfig] = useState<Record<string, string>>({});
  const [paymentTab, setPaymentTab] = useState<PaymentTab>('card');
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState('');
  const [promoterCode, setPromoterCode] = useState(() => getPromoterCode());

  const [form, setForm] = useState({
    name: '', email: '', phone: '',
    address: '', neighborhood: '', city: '', state: 'CDMX', zip: '',
    reference: 'Casa', accepts_marketing: true,
  });

  const [colonias, setColonias] = useState<string[]>([]);
  const [isFetchingZip, setIsFetchingZip] = useState(false);
  const [clipStatus, setClipStatus] = useState<'loading' | 'ready' | 'error' | 'missing_key'>('loading');

  useEffect(() => { getStoreConfig().then(setConfig); }, []);

  // Init Clip SDK
  useEffect(() => {
    const CLIP_PUBLIC_KEY = import.meta.env.VITE_CLIP_API_KEY as string;
    if (!CLIP_PUBLIC_KEY) { setClipStatus('missing_key'); return; }
    sdkCardRef.current = null;
    setClipStatus('loading');
    let attempts = 0;
    const initClip = () => {
      const SDK = (window as any).ClipSDK ?? (typeof ClipSDK !== 'undefined' ? ClipSDK : null);
      if (!SDK) {
        attempts++;
        if (attempts < 20) { setTimeout(initClip, 250); } else { setClipStatus('error'); }
        return;
      }
      try {
        const clip = new SDK(CLIP_PUBLIC_KEY);
        const card = clip.element.create('Card', { locale: 'es', theme: 'light', amount: finalTotal });
        card.mount('clip-card-container');
        sdkCardRef.current = card;
        setClipStatus('ready');
      } catch (e) {
        console.error('[Clip]', e);
        setClipStatus('error');
      }
    };
    initClip();
  }, [finalTotal]);

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

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    setCouponError('');
    if (!couponInput.trim()) return;
    const success = applyCoupon(couponInput);
    if (success) { setCouponInput(''); } else { setCouponError('Código no válido'); }
  };

  const handlePagar = async () => {
    if (paymentTab !== 'card') {
      setError('Este método está próximamente. Usa Tarjeta por ahora.');
      return;
    }
    if (!form.name || !form.email || !form.address || !form.city) {
      setError('Por favor completa todos los campos de envío obligatorios.');
      return;
    }
    if (!sdkCardRef.current) {
      setError('El formulario de tarjeta no está listo. Recarga la página.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      let cardToken: { id: string };
      try {
        cardToken = await sdkCardRef.current.cardToken();
      } catch (sdkErr: any) {
        console.error('[Clip] cardToken:', sdkErr);
        throw new Error('Datos de tarjeta inválidos. Verifica los campos.');
      }
      const cardTokenId = cardToken?.id;
      if (!cardTokenId) throw new Error('No se obtuvo token de tarjeta.');

      const order = await createOrder({
        customer_name: form.name, customer_email: form.email, customer_phone: form.phone,
        customer_address: `${form.address}, ${form.neighborhood}`,
        customer_neighborhood: form.neighborhood, customer_city: form.city,
        customer_state: form.state, customer_zip: form.zip, customer_reference: form.reference,
        items, total: finalTotal, status: 'pending',
        accepts_marketing: form.accepts_marketing,
        promoter_code: promoterCode || undefined,
      });
      if (!order) throw new Error('No se pudo registrar la orden.');

      const chargeRes = await fetch('/api/charge-clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: finalTotal, orderId: order.id,
          description: `Divina Store — ${form.name} — Orden ${order.id}`,
          cardTokenId, customerEmail: form.email, userAgent: navigator.userAgent,
        }),
      });
      const chargeData = await chargeRes.json();
      if (!chargeRes.ok) {
        throw new Error(chargeData.error ?? chargeData.message ?? 'Error al procesar el cobro.');
      }
      if (chargeData.requires_action && chargeData.redirect_url) {
        window.location.href = chargeData.redirect_url;
        return;
      }
      await updateOrderStatus(order.id, 'paid');
      trackEvent('purchase', {
        transaction_id: order.id, currency: 'MXN', value: finalTotal,
        coupon: couponCode || undefined, items: analyticsItems(items),
      });
      clearCart();
      navigate(`/pago-exitoso?order=${order.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado.';
      console.error('[Checkout]', msg);
      setError(msg);
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="cv2-empty">
        <h2>Tu carrito está vacío</h2>
        <button onClick={() => navigate('/catalogo')} className="cv2-empty__btn">Ir al catálogo</button>
      </div>
    );
  }

  return (
    <div className="cv2" style={{ paddingTop: 'var(--nav-h)' }}>

      {/* HERO — IMAGEN 1 */}
      <div className="cv2__hero">
        <img src="/checkout/hero-banner.png" alt="Finaliza tu compra" />
      </div>

      {/* TRUST BAR — IMAGEN 2 */}
      <div className="cv2__trust-bar">
        <img src="/checkout/trust-bar.png" alt="Pago seguro" />
      </div>

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

                <div className="cv2__grid-2">
                  <div className="cv2__field">
                    <label>Nombre</label>
                    <input type="text" name="name" value={form.name} onChange={handleInputChange} placeholder="Nombre completo" required />
                  </div>
                  <div className="cv2__field">
                    <label>E-mail</label>
                    <input type="email" name="email" value={form.email} onChange={handleInputChange} placeholder="correo@ejemplo.com" required />
                  </div>
                </div>

                <div className="cv2__field">
                  <label>Celular</label>
                  <input type="tel" name="phone" value={form.phone} onChange={handleInputChange} placeholder="(55) 1234 5678" required />
                </div>

                <div className="cv2__divider"><span>Domicilio (México)</span></div>

                <div className="cv2__grid-2">
                  <div className="cv2__field">
                    <label>Código Postal{isFetchingZip && ' …'}</label>
                    <input type="text" name="zip" value={form.zip} onChange={handleInputChange} placeholder="01000" maxLength={5} />
                  </div>
                  <div className="cv2__field">
                    <label>Estado</label>
                    <select name="state" value={form.state} onChange={handleInputChange}>
                      {MEXICAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div className="cv2__grid-2">
                  <div className="cv2__field">
                    <label>Ciudad / Municipio</label>
                    <input type="text" name="city" value={form.city} onChange={handleInputChange} placeholder="Ciudad de México" required />
                  </div>
                  <div className="cv2__field">
                    <label>Colonia</label>
                    {colonias.length > 0 ? (
                      <select name="neighborhood" value={form.neighborhood} onChange={handleInputChange}>
                        {colonias.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : (
                      <input type="text" name="neighborhood" value={form.neighborhood} onChange={handleInputChange} placeholder="Ingresa colonia" />
                    )}
                  </div>
                </div>

                <div className="cv2__field">
                  <label>Calle y número</label>
                  <input type="text" name="address" value={form.address} onChange={handleInputChange} placeholder="Av. Insurgentes Sur 1234" required />
                </div>

                <div className="cv2__field">
                  <label>Referencia (opcional)</label>
                  <input type="text" name="reference" value={form.reference} onChange={handleInputChange} placeholder="Casa color negra con portón" />
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

                {/* Tabs */}
                <div className="cv2__paytabs">
                  <button
                    className={`cv2__paytab ${paymentTab === 'card' ? 'is-active' : ''}`}
                    onClick={() => setPaymentTab('card')} type="button"
                  >
                    <span className="cv2__paytab-icon">💳</span>
                    Tarjeta de crédito / débito
                  </button>
                  <button
                    className={`cv2__paytab ${paymentTab === 'applepay' ? 'is-active' : ''}`}
                    onClick={() => setPaymentTab('applepay')} type="button"
                  >
                    <span className="cv2__paytab-icon"></span>
                    Apple Pay
                  </button>
                  <button
                    className={`cv2__paytab ${paymentTab === 'googlepay' ? 'is-active' : ''}`}
                    onClick={() => setPaymentTab('googlepay')} type="button"
                  >
                    <span className="cv2__paytab-icon">G</span>
                    Google Pay
                  </button>
                </div>

                {/* Widget */}
                <div className="cv2__pay-widget">
                  <div style={{ display: paymentTab === 'card' ? 'block' : 'none', position: 'relative', minHeight: 180 }}>
                    {clipStatus === 'loading' && (
                      <div className="cv2__pay-status">
                        <div className="cv2__spinner" />Conectando con Clip...
                      </div>
                    )}
                    {clipStatus === 'missing_key' && (
                      <div className="cv2__pay-status cv2__pay-status--error">
                        Falta configurar la llave de Clip. Contacta a soporte.
                      </div>
                    )}
                    {clipStatus === 'error' && (
                      <div className="cv2__pay-status cv2__pay-status--error">
                        Error al cargar el formulario. Recarga la página.
                      </div>
                    )}
                    <div id="clip-card-container" className="cv2__clip-mount" />
                  </div>

                  {(paymentTab === 'applepay' || paymentTab === 'googlepay') && (
                    <div className="cv2__coming-soon">
                      <div className="cv2__coming-soon-icon">🚀</div>
                      <p><strong>Próximamente disponible</strong></p>
                      <p className="cv2__coming-soon-sub">
                        Estamos trabajando en habilitar este método. Por ahora usa Tarjeta.
                      </p>
                    </div>
                  )}
                </div>

                {error && <div className="cv2__error"><span>⚠</span><span>{error}</span></div>}

                <button
                  onClick={handlePagar}
                  className="cv2__pay-btn"
                  disabled={loading || (paymentTab === 'card' && clipStatus !== 'ready')}
                >
                  {loading ? (
                    <><span className="cv2__spinner cv2__spinner--dark" />Procesando pago...</>
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
                {items.map(item => (
                  <div key={item.product.id} className="cv2__summary-item">
                    <div className="cv2__summary-item-img">
                      <img src={getImageUrl(item.product.image_url)} alt={item.product.name} />
                      <span className="cv2__summary-item-qty">{item.quantity}</span>
                    </div>
                    <div className="cv2__summary-item-info">
                      <p className="cv2__summary-item-name">{item.product.name}</p>
                      <p className="cv2__summary-item-qty-label">Cantidad: {item.quantity}</p>
                    </div>
                    <p className="cv2__summary-item-price">
                      ${(item.product.price * item.quantity).toLocaleString('es-MX')}
                    </p>
                  </div>
                ))}
              </div>

              <div className="cv2__summary-block">
                <label className="cv2__summary-label">Código de descuento</label>
                {couponCode ? (
                  <div className="cv2__coupon-active">
                    <span>🏷️ {couponCode} (-{discountPercentage}%)</span>
                    <button onClick={removeCoupon}>✕</button>
                  </div>
                ) : (
                  <form onSubmit={handleApplyCoupon} className="cv2__coupon-form">
                    <input
                      type="text"
                      placeholder="Ingresa tu código"
                      value={couponInput}
                      onChange={e => { setCouponInput(e.target.value); setCouponError(''); }}
                    />
                    <button type="submit">APLICAR</button>
                  </form>
                )}
                {couponError && <p className="cv2__coupon-error">{couponError}</p>}
              </div>

              <div className="cv2__summary-block">
                <label className="cv2__summary-label">Código de promotora (opcional)</label>
                <input
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
                {couponCode && (
                  <>
                    <div className="cv2__summary-row"><span>Subtotal</span><span>${total().toLocaleString('es-MX')}</span></div>
                    <div className="cv2__summary-row cv2__summary-row--discount">
                      <span>Descuento ({discountPercentage}%)</span>
                      <span>-${discountAmount().toLocaleString('es-MX')}</span>
                    </div>
                  </>
                )}
                <div className="cv2__summary-row cv2__summary-row--total">
                  <span>Total</span>
                  <span className="cv2__summary-total-price">
                    ${finalTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} <small>MXN</small>
                  </span>
                </div>
              </div>

              <div className="cv2__msi">💳 Hasta 12 MSI según tu banco</div>

              <ul className="cv2__benefits">
                <li>🚚 Envío gratis en compras mayores a $999 MXN</li>
                <li>🔒 Tu información está protegida</li>
                <li>⚡ Proceso rápido y seguro con Clip México</li>
              </ul>

              {/* IMAGEN 3 */}
              <div className="cv2__payment-methods">
                <p>Métodos de pago aceptados</p>
                <img src="/checkout/payment-methods.png" alt="Visa Mastercard Amex Carnet SPEI Apple Pay Google Pay Clip" />
              </div>
            </div>

            {/* IMAGEN 4 */}
            <div className="cv2__trust-badges-side">
              <img src="/checkout/trust-badges.png" alt="Safe & Secure Checkout" />
            </div>
          </aside>
        </div>
      </div>

      {/* IMAGEN 5 */}
      <div className="cv2__footer-badges">
        <img src="/checkout/footer-badges.png" alt="PCI DSS SSL Verified Visa Mastercard Clip Empresa Mexicana" />
      </div>
    </div>
  );
};
