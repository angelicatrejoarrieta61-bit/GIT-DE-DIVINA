import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { createOrder } from '../lib/queries';
import { getImageUrl } from '../lib/supabase';
import './CheckoutPage.css';

/* ── Icons ── */
const IconLock = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const IconShield = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" />
  </svg>
);

const IconUser = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);

const IconCard = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" />
  </svg>
);

const IconCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

/* ── Card Brand SVGs ── */
const IconVisa = () => (
  <svg viewBox="0 0 48 32" width="42" height="28">
    <rect width="48" height="32" rx="4" fill="#1A1F71" />
    <text x="8" y="22" fill="white" fontSize="14" fontWeight="bold" fontFamily="Arial">VISA</text>
  </svg>
);

const IconMastercard = () => (
  <svg viewBox="0 0 48 32" width="42" height="28">
    <rect width="48" height="32" rx="4" fill="#252525" />
    <circle cx="18" cy="16" r="9" fill="#EB001B" />
    <circle cx="30" cy="16" r="9" fill="#F79E1B" />
    <path d="M24 9.5a9 9 0 0 1 0 13A9 9 0 0 1 24 9.5z" fill="#FF5F00" />
  </svg>
);

const IconAmex = () => (
  <svg viewBox="0 0 48 32" width="42" height="28">
    <rect width="48" height="32" rx="4" fill="#2E77BC" />
    <text x="5" y="22" fill="white" fontSize="11" fontWeight="bold" fontFamily="Arial">AMEX</text>
  </svg>
);

/* ── PCI DSS Badge SVG ── */
const PCIBadge = () => (
  <svg viewBox="0 0 64 32" width="64" height="32" aria-label="PCI DSS Compliant">
    <rect width="64" height="32" rx="4" fill="#003087" />
    <text x="4" y="13" fill="white" fontSize="8" fontWeight="bold" fontFamily="Arial">PCI DSS</text>
    <text x="4" y="24" fill="#FFD700" fontSize="7" fontFamily="Arial">COMPLIANT</text>
    <path d="M52 6l3 3-6 6-3-3z" fill="none" stroke="#FFD700" strokeWidth="1.5" />
    <path d="M49 12l-2 8 8-8-6 0z" fill="#FFD700" />
  </svg>
);

/* ── SSL Badge SVG ── */
const SSLBadge = () => (
  <svg viewBox="0 0 64 32" width="64" height="32" aria-label="SSL Secure">
    <rect width="64" height="32" rx="4" fill="#1a7c1a" />
    <text x="4" y="13" fill="white" fontSize="8" fontWeight="bold" fontFamily="Arial">🔒 SSL</text>
    <text x="4" y="24" fill="#90EE90" fontSize="7" fontFamily="Arial">SECURE</text>
  </svg>
);

const ClipLogo = () => (
  <svg viewBox="0 0 80 28" width="56" height="20" aria-label="Clip">
    <rect width="80" height="28" rx="5" fill="#FC4C02" />
    <text x="10" y="20" fill="white" fontSize="14" fontWeight="bold" fontFamily="Arial, sans-serif" letterSpacing="1">clip</text>
  </svg>
);

declare global {
  interface Window { ClipSDK: any; }
}

/* ── Customer Form State ── */
interface CustomerForm {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

const MEXICAN_STATES = [
  'Aguascalientes','Baja California','Baja California Sur','Campeche','Chiapas','Chihuahua',
  'Ciudad de México','Coahuila','Colima','Durango','Estado de México','Guanajuato','Guerrero',
  'Hidalgo','Jalisco','Michoacán','Morelos','Nayarit','Nuevo León','Oaxaca','Puebla','Querétaro',
  'Quintana Roo','San Luis Potosí','Sinaloa','Sonora','Tabasco','Tamaulipas','Tlaxcala',
  'Veracruz','Yucatán','Zacatecas'
];

export const CheckoutPage: React.FC = () => {
  const { items, total, clearCart } = useCartStore();
  const cartTotal = total();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<1 | 2>(1); // 1 = customer info, 2 = payment

  /* Customer form */
  const [form, setForm] = useState<CustomerForm>({
    name: '', email: '', phone: '', address: '', city: '', state: '', zip: '',
  });
  const [formErrors, setFormErrors] = useState<Partial<CustomerForm>>({});

  /* Clip SDK */
  const [clipLoaded, setClipLoaded] = useState(false);
  const [clipInstance, setClipInstance] = useState<any>(null);
  const [cardElement, setCardElement] = useState<any>(null);

  React.useEffect(() => {
    const timer = setInterval(() => {
      if (window.ClipSDK && !clipInstance) {
        const clip = new window.ClipSDK('3f2d18b8-2ff4-453e-a243-b078daa507e2');
        setClipInstance(clip);
        setClipLoaded(true);
        clearInterval(timer);
      }
    }, 500);
    return () => clearInterval(timer);
  }, [clipInstance]);

  React.useEffect(() => {
    if (clipLoaded && clipInstance && !cardElement && step === 2) {
      setTimeout(() => {
        const elements = clipInstance.elements();
        const card = elements.create('Card', {
          style: {
            base: {
              color: '#ffffff',
              fontFamily: 'Catamaran, sans-serif',
              fontSize: '16px',
              '::placeholder': { color: '#666666' },
            },
          },
        });
        card.mount('#clip-card-container');
        setCardElement(card);
      }, 300);
    }
  }, [clipLoaded, clipInstance, cardElement, step]);

  const updateField = (key: keyof CustomerForm, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    if (formErrors[key]) setFormErrors(prev => ({ ...prev, [key]: '' }));
  };

  const validateStep1 = (): boolean => {
    const errors: Partial<CustomerForm> = {};
    if (!form.name.trim()) errors.name = 'El nombre es requerido';
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Email inválido';
    if (!form.phone.trim() || form.phone.replace(/\D/g, '').length < 10) errors.phone = 'Teléfono inválido (10 dígitos)';
    if (!form.address.trim()) errors.address = 'La dirección es requerida';
    if (!form.city.trim()) errors.city = 'La ciudad es requerida';
    if (!form.state) errors.state = 'Selecciona un estado';
    if (!form.zip.trim() || form.zip.length < 5) errors.zip = 'Código postal inválido';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNextStep = () => {
    if (validateStep1()) setStep(2);
  };

  const handlePagar = async () => {
    if (!clipInstance || !cardElement) {
      setError('El sistema de pagos no ha terminado de cargar. Espera un momento.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const order = await createOrder({
        customer_name: form.name,
        customer_email: form.email,
        customer_phone: form.phone,
        customer_address: `${form.address}, ${form.city}, ${form.state}, CP ${form.zip}`,
        items,
        total: cartTotal,
        status: 'pending',
      });
      if (!order) throw new Error('No se pudo generar la orden en el sistema.');

      const result = await clipInstance.createToken(cardElement);
      if (result.error) throw new Error(result.error.message || 'Error al procesar la tarjeta');

      const res = await fetch('/api/charge-clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: result.token,
          amount: cartTotal,
          description: `Divina Store — Orden ${order.id}`,
          orderId: order.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'El pago fue rechazado.');

      clearCart();
      navigate(`/pago-exitoso?order=${order.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar el pago';
      setError(msg);
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="checkout-empty" style={{ paddingTop: 'calc(var(--nav-h) + 80px)' }}>
        <div className="checkout-empty__icon">🛍️</div>
        <h2>Tu carrito está vacío</h2>
        <p className="muted-text">Agrega productos antes de continuar al pago.</p>
        <button onClick={() => navigate('/catalogo')} className="btn btn-lime" style={{ marginTop: 24 }}>
          Ir al catálogo
        </button>
      </div>
    );
  }

  return (
    <div className="checkout-page" style={{ paddingTop: 'var(--nav-h)' }}>
      <div className="page-width section">

        {/* Header */}
        <div className="checkout-page__header">
          <h1 className="checkout-page__title">Finalizar <span className="lime-text">Compra</span></h1>
          <div className="checkout-page__secure-badge">
            <IconLock />
            <span>Pago 100% Seguro</span>
          </div>
        </div>

        {/* Steps indicator */}
        <div className="checkout-steps">
          <div className={`checkout-step ${step >= 1 ? 'checkout-step--active' : ''} ${step > 1 ? 'checkout-step--done' : ''}`}>
            <div className="checkout-step__num">{step > 1 ? '✓' : '1'}</div>
            <span className="checkout-step__label">Datos de Envío</span>
          </div>
          <div className={`checkout-step__line ${step > 1 ? 'checkout-step__line--done' : ''}`} />
          <div className={`checkout-step ${step >= 2 ? 'checkout-step--active' : ''}`}>
            <div className="checkout-step__num">2</div>
            <span className="checkout-step__label">Pago</span>
          </div>
        </div>

        <div className="checkout-page__grid">

          {/* LEFT — Forms */}
          <div className="checkout-page__left">

            {/* STEP 1: Customer Info */}
            {step === 1 && (
              <>
                {/* Security badges row */}
                <div className="checkout-trust-badges">
                  <div className="checkout-trust-badge-item"><PCIBadge /></div>
                  <div className="checkout-trust-badge-item"><SSLBadge /></div>
                  <div className="checkout-trust-badge-item checkout-trust-badge-item--text">
                    <IconShield />
                    <span>Datos protegidos con cifrado de 256-bit</span>
                  </div>
                </div>

                <div className="checkout-form-section">
                  <h2 className="checkout-form-section__title">
                    <span className="checkout-form-section__num">01</span>
                    <IconUser />
                    Información de Contacto y Envío
                  </h2>

                  <div className="checkout-page__form">
                    <div className="checkout-page__field">
                      <label>Nombre completo <span className="required">*</span></label>
                      <input
                        className={`checkout-input ${formErrors.name ? 'checkout-input--error' : ''}`}
                        type="text"
                        placeholder="Ej. María García López"
                        value={form.name}
                        onChange={e => updateField('name', e.target.value)}
                        autoComplete="name"
                      />
                      {formErrors.name && <span className="checkout-field-error">{formErrors.name}</span>}
                    </div>

                    <div className="checkout-page__field-row">
                      <div className="checkout-page__field">
                        <label>Email <span className="required">*</span></label>
                        <input
                          className={`checkout-input ${formErrors.email ? 'checkout-input--error' : ''}`}
                          type="email"
                          placeholder="correo@ejemplo.com"
                          value={form.email}
                          onChange={e => updateField('email', e.target.value)}
                          autoComplete="email"
                        />
                        {formErrors.email && <span className="checkout-field-error">{formErrors.email}</span>}
                      </div>
                      <div className="checkout-page__field">
                        <label>Teléfono <span className="required">*</span></label>
                        <input
                          className={`checkout-input ${formErrors.phone ? 'checkout-input--error' : ''}`}
                          type="tel"
                          placeholder="10 dígitos"
                          value={form.phone}
                          onChange={e => updateField('phone', e.target.value)}
                          autoComplete="tel"
                          maxLength={10}
                        />
                        {formErrors.phone && <span className="checkout-field-error">{formErrors.phone}</span>}
                      </div>
                    </div>

                    <div className="checkout-page__field">
                      <label>Dirección <span className="required">*</span></label>
                      <input
                        className={`checkout-input ${formErrors.address ? 'checkout-input--error' : ''}`}
                        type="text"
                        placeholder="Calle, número, colonia"
                        value={form.address}
                        onChange={e => updateField('address', e.target.value)}
                        autoComplete="street-address"
                      />
                      {formErrors.address && <span className="checkout-field-error">{formErrors.address}</span>}
                    </div>

                    <div className="checkout-page__field-row">
                      <div className="checkout-page__field">
                        <label>Ciudad <span className="required">*</span></label>
                        <input
                          className={`checkout-input ${formErrors.city ? 'checkout-input--error' : ''}`}
                          type="text"
                          placeholder="Ciudad"
                          value={form.city}
                          onChange={e => updateField('city', e.target.value)}
                          autoComplete="address-level2"
                        />
                        {formErrors.city && <span className="checkout-field-error">{formErrors.city}</span>}
                      </div>
                      <div className="checkout-page__field">
                        <label>Código Postal <span className="required">*</span></label>
                        <input
                          className={`checkout-input ${formErrors.zip ? 'checkout-input--error' : ''}`}
                          type="text"
                          placeholder="00000"
                          value={form.zip}
                          onChange={e => updateField('zip', e.target.value.replace(/\D/g, '').slice(0, 5))}
                          autoComplete="postal-code"
                          maxLength={5}
                        />
                        {formErrors.zip && <span className="checkout-field-error">{formErrors.zip}</span>}
                      </div>
                    </div>

                    <div className="checkout-page__field">
                      <label>Estado <span className="required">*</span></label>
                      <select
                        className={`checkout-input checkout-select ${formErrors.state ? 'checkout-input--error' : ''}`}
                        value={form.state}
                        onChange={e => updateField('state', e.target.value)}
                      >
                        <option value="">Selecciona tu estado</option>
                        {MEXICAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      {formErrors.state && <span className="checkout-field-error">{formErrors.state}</span>}
                    </div>
                  </div>
                </div>

                {/* Meses sin intereses info */}
                <div className="checkout-msi-banner">
                  <div className="checkout-msi-banner__icon">💳</div>
                  <div className="checkout-msi-banner__text">
                    <strong>¿Meses sin intereses disponibles?</strong>
                    <p>Disponibilidad según tu banco. Visa, Mastercard y Amex participantes pueden ofrecer hasta 12 MSI. Consúltalo directamente en tu banco emisor.</p>
                  </div>
                </div>

                <button
                  onClick={handleNextStep}
                  className="checkout-submit-btn"
                  id="checkout-step1-btn"
                >
                  <span className="checkout-submit-btn__content">
                    Continuar al Pago
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </span>
                </button>
              </>
            )}

            {/* STEP 2: Payment */}
            {step === 2 && (
              <>
                {/* Summary of step 1 */}
                <div className="checkout-customer-summary">
                  <div className="checkout-customer-summary__info">
                    <IconUser />
                    <div>
                      <strong>{form.name}</strong>
                      <p>{form.email} · {form.phone}</p>
                      <p>{form.address}, {form.city}, {form.state} CP {form.zip}</p>
                    </div>
                  </div>
                  <button className="checkout-edit-btn" onClick={() => setStep(1)}>Editar</button>
                </div>

                {/* Accepted cards */}
                <div className="checkout-accepted-cards">
                  <span className="checkout-accepted-cards__label">Métodos de pago aceptados</span>
                  <div className="checkout-accepted-cards__logos">
                    <IconVisa />
                    <IconMastercard />
                    <IconAmex />
                    <div className="checkout-accepted-cards__clip">
                      <span>Procesado por</span>
                      <ClipLogo />
                    </div>
                  </div>
                </div>

                <div className="checkout-form-section">
                  <h2 className="checkout-form-section__title">
                    <span className="checkout-form-section__num">02</span>
                    <IconCard />
                    Información de Pago
                  </h2>

                  <div className="checkout-clip-badge">
                    <IconShield />
                    <span>
                      Formulario de pago provisto de forma segura por <strong>Clip México</strong>. Nunca almacenamos datos de tu tarjeta.
                    </span>
                  </div>

                  {!clipLoaded && (
                    <div className="checkout-clip-loading">
                      <div className="checkout-spinner" />
                      Cargando pasarela de pagos...
                    </div>
                  )}

                  <div
                    id="clip-card-container"
                    className="checkout-clip-element"
                    style={{ display: clipLoaded ? 'block' : 'none' }}
                  />
                </div>

                {/* Security badges */}
                <div className="checkout-security-row">
                  <div className="checkout-security-item">
                    <PCIBadge />
                    <span>PCI DSS<br />Compliant</span>
                  </div>
                  <div className="checkout-security-item">
                    <SSLBadge />
                    <span>Cifrado<br />SSL 256-bit</span>
                  </div>
                  <div className="checkout-security-item">
                    <IconShield />
                    <span>100%<br />Seguro</span>
                  </div>
                  <div className="checkout-security-item">
                    <IconCheck />
                    <span>Compra<br />Garantizada</span>
                  </div>
                </div>

                {error && (
                  <div className="checkout-page__error">
                    <span>⚠</span>
                    <span>{error}</span>
                  </div>
                )}

                <button
                  onClick={handlePagar}
                  className={`checkout-submit-btn ${loading ? 'loading' : ''}`}
                  disabled={loading}
                  id="checkout-pay-btn"
                >
                  {loading ? (
                    <span className="checkout-submit-btn__loading">
                      <span className="checkout-spinner" />
                      Procesando pago...
                    </span>
                  ) : (
                    <span className="checkout-submit-btn__content">
                      <IconLock />
                      Pagar ${cartTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </span>
                  )}
                </button>

                <div className="checkout-trust-row">
                  <div className="checkout-trust-item">
                    <IconShield />
                    <span>Datos cifrados SSL</span>
                  </div>
                  <div className="checkout-trust-item">
                    <IconCheck />
                    <span>Pago procesado por Clip</span>
                  </div>
                  <div className="checkout-trust-item">
                    <IconLock />
                    <span>Compra garantizada</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* RIGHT — Order Summary */}
          <div className="checkout-page__summary">
            <div className="checkout-summary-card">
              <h2 className="checkout-summary-card__title">Tu pedido</h2>

              <div className="checkout-page__items">
                {items.map(item => (
                  <div key={item.product.id} className="checkout-page__item">
                    <div className="checkout-page__item-img">
                      {item.product.image_url
                        ? <img src={getImageUrl(item.product.image_url)} alt={item.product.name} loading="lazy" />
                        : <span>🌿</span>}
                      <span className="checkout-page__item-qty-badge">{item.quantity}</span>
                    </div>
                    <div className="checkout-page__item-info">
                      {item.product.brand && (
                        <p className="checkout-page__item-brand">{item.product.brand}</p>
                      )}
                      <p className="checkout-page__item-name">{item.product.name}</p>
                    </div>
                    <p className="checkout-page__item-price">
                      ${(item.product.price * item.quantity).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                ))}
              </div>

              <div className="checkout-summary-divider" />

              <div className="checkout-summary-lines">
                <div className="checkout-summary-line">
                  <span>Subtotal</span>
                  <span>${cartTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</span>
                </div>
                <div className="checkout-summary-line">
                  <span>Envío</span>
                  <span className="lime-text">Gratis</span>
                </div>
                <div className="checkout-summary-line">
                  <span>IVA incluido</span>
                  <span className="muted-text" style={{ fontSize: 11 }}>✓</span>
                </div>
              </div>

              <div className="checkout-summary-divider" />

              <div className="checkout-page__total">
                <span>Total</span>
                <span className="lime-text">
                  ${cartTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                </span>
              </div>

              {/* MSI info in summary */}
              <div className="checkout-msi-mini">
                <span>💳</span>
                <span>Hasta 12 MSI según tu banco</span>
              </div>

              <div className="checkout-summary-cards-row">
                <IconVisa />
                <IconMastercard />
                <IconAmex />
              </div>

              <div className="checkout-summary-clip-note">
                <ClipLogo />
                <span>Pagos procesados de forma segura por Clip México</span>
              </div>

              {/* PCI in summary */}
              <div className="checkout-summary-security">
                <PCIBadge />
                <SSLBadge />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
