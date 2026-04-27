import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { createOrder } from '../lib/queries';
import { getImageUrl } from '../lib/supabase';
import './CheckoutPage.css';

// ─── Tipos para el SDK de Clip ────────────────────────────────────────────────
declare global {
  interface Window {
    Clip?: {
      create: (config: ClipSDKConfig) => ClipInstance;
    };
  }
}

interface ClipSDKConfig {
  publicKey: string;
  locale?: string;
}

interface ClipInstance {
  mount: (selector: string) => void;
  on: (event: string, callback: (data: ClipEventData) => void) => void;
  unmount: () => void;
}

interface ClipEventData {
  token?: string;
  error?: string;
  type?: string;
}

// ─── Íconos ───────────────────────────────────────────────────────────────────
const IconLock = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const IconShield = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

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

// Logo oficial de Clip como imagen SVG inline
const ClipLogo = () => (
  <svg viewBox="0 0 80 28" width="64" height="22" aria-label="Clip">
    <rect width="80" height="28" rx="5" fill="#FC4C02" />
    <text x="10" y="20" fill="white" fontSize="14" fontWeight="bold" fontFamily="Arial, sans-serif" letterSpacing="1">clip</text>
    <circle cx="66" cy="14" r="6" fill="white" opacity="0.25" />
    <path d="M63 14 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0" fill="white" opacity="0.6" />
  </svg>
);

// ─── Pasos del checkout ───────────────────────────────────────────────────────
type Step = 1 | 2 | 3;

export const CheckoutPage: React.FC = () => {
  const { items, total, clearCart } = useCartStore();
  const cartTotal = total();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [clipReady, setClipReady] = useState(false);
  const clipInstanceRef = useRef<ClipInstance | null>(null);

  // Cargar SDK de Clip dinámicamente
  useEffect(() => {
    if (step !== 2) return;

    const scriptId = 'clip-sdk-script';
    if (document.getElementById(scriptId)) {
      setClipReady(true);
      return;
    }

    const script = document.createElement('script');
    script.id = scriptId;
    // SDK oficial de Clip Checkout Transparente
    script.src = 'https://sdk.payclip.com/clip.js';
    script.async = true;
    script.onload = () => setClipReady(true);
    script.onerror = () => setError('No se pudo cargar el SDK de pago. Recarga la página.');
    document.head.appendChild(script);
  }, [step]);

  // Montar el formulario de Clip cuando el SDK esté listo
  useEffect(() => {
    if (!clipReady || step !== 2) return;

    const publicKey = import.meta.env.VITE_CLIP_PUBLIC_KEY;

    if (!window.Clip || !publicKey) {
      // Si no hay public key configurada, mostrar aviso
      setError('Configura VITE_CLIP_PUBLIC_KEY en tus variables de entorno de Vercel.');
      return;
    }

    try {
      const instance = window.Clip.create({
        publicKey,
        locale: 'es',
      });

      instance.mount('#clip-card-element');

      instance.on('tokenize', (data: ClipEventData) => {
        if (data.token) {
          handlePayWithToken(data.token);
        }
      });

      instance.on('error', (data: ClipEventData) => {
        setError(data.error || 'Error al tokenizar la tarjeta. Verifica los datos.');
        setLoading(false);
      });

      clipInstanceRef.current = instance;
    } catch (e) {
      setError('Error al inicializar el formulario de pago.');
    }

    return () => {
      clipInstanceRef.current?.unmount();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipReady, step]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  };

  // PASO 1 → Guardar datos del cliente y crear orden en Supabase
  const handleDataSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.phone) {
      setError('Por favor completa todos los campos requeridos.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const order = await createOrder({
        customer_name: form.name,
        customer_email: form.email,
        customer_phone: form.phone,
        customer_address: form.address,
        items,
        total: cartTotal,
        status: 'pending',
      });

      if (!order) throw new Error('No se pudo crear la orden. Intenta de nuevo.');
      setOrderId(order.id);
      setStep(2);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // PASO 2 → Pagar con el Card Token que devuelve el SDK de Clip
  const handlePayWithToken = async (cardTokenId: string) => {
    if (!orderId) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardTokenId,
          amount: cartTotal,
          description: `Divina Store MX — Orden ${orderId}`,
          orderId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al procesar el pago.');

      clearCart();
      setStep(3);
      navigate(`/pago-exitoso?order=${orderId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setError(msg);
      setLoading(false);
    }
  };

  // Carrito vacío
  if (items.length === 0 && step !== 3) {
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

  const subtotal = cartTotal;

  return (
    <div className="checkout-page" style={{ paddingTop: 'var(--nav-h)' }}>
      <div className="page-width section">

        {/* Header */}
        <div className="checkout-page__header">
          <h1 className="checkout-page__title">
            Finalizar <span className="lime-text">Compra</span>
          </h1>
          <div className="checkout-page__secure-badge">
            <IconLock />
            <span>Pago 100% seguro</span>
          </div>
        </div>

        {/* Pasos */}
        <div className="checkout-steps">
          {(['Datos', 'Pago', 'Confirmación'] as const).map((label, i) => (
            <React.Fragment key={label}>
              <div className={`checkout-step ${step === i + 1 ? 'checkout-step--active' : ''} ${step > i + 1 ? 'checkout-step--done' : ''}`}>
                <span className="checkout-step__num">
                  {step > i + 1 ? '✓' : i + 1}
                </span>
                <span className="checkout-step__label">{label}</span>
              </div>
              {i < 2 && <div className={`checkout-step__line ${step > i + 1 ? 'checkout-step__line--done' : ''}`} />}
            </React.Fragment>
          ))}
        </div>

        <div className="checkout-page__grid">

          {/* ── IZQUIERDA ─────────────────────────────────────────────────── */}
          <div className="checkout-page__left">

            {/* Métodos de pago aceptados */}
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

            {/* ── PASO 1: Datos del cliente ──────────────────────────────── */}
            {step === 1 && (
              <form onSubmit={handleDataSubmit} className="checkout-page__form">
                <div className="checkout-form-section">
                  <h2 className="checkout-form-section__title">
                    <span className="checkout-form-section__num">01</span>
                    Información de contacto
                  </h2>

                  <div className="checkout-page__field-row">
                    <div className="checkout-page__field">
                      <label htmlFor="name">Nombre completo <span className="required">*</span></label>
                      <input
                        id="name" name="name" type="text"
                        className="input-dark"
                        value={form.name}
                        onChange={handleChange}
                        placeholder="Angélica Trejo"
                        required
                        autoComplete="name"
                      />
                    </div>
                    <div className="checkout-page__field">
                      <label htmlFor="phone">Teléfono <span className="required">*</span></label>
                      <input
                        id="phone" name="phone" type="tel"
                        className="input-dark"
                        value={form.phone}
                        onChange={handleChange}
                        placeholder="55 1234 5678"
                        required
                        autoComplete="tel"
                      />
                    </div>
                  </div>

                  <div className="checkout-page__field">
                    <label htmlFor="email">Correo electrónico <span className="required">*</span></label>
                    <input
                      id="email" name="email" type="email"
                      className="input-dark"
                      value={form.email}
                      onChange={handleChange}
                      placeholder="tu@email.com"
                      required
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div className="checkout-form-section">
                  <h2 className="checkout-form-section__title">
                    <span className="checkout-form-section__num">02</span>
                    Dirección de envío
                  </h2>
                  <div className="checkout-page__field">
                    <label htmlFor="address">Dirección completa</label>
                    <textarea
                      id="address" name="address"
                      className="input-dark"
                      value={form.address}
                      onChange={handleChange}
                      placeholder="Calle, número, colonia, ciudad, CP"
                      rows={3}
                      style={{ resize: 'vertical' }}
                      autoComplete="street-address"
                    />
                  </div>
                </div>

                {error && (
                  <div className="checkout-page__error">
                    <span>⚠</span>
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className={`checkout-submit-btn ${loading ? 'loading' : ''}`}
                  disabled={loading}
                >
                  {loading ? (
                    <span className="checkout-submit-btn__loading">
                      <span className="checkout-spinner" />
                      Guardando datos...
                    </span>
                  ) : (
                    <span className="checkout-submit-btn__content">
                      <IconLock />
                      Continuar al pago
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
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    <span>Pago procesado por Clip</span>
                  </div>
                  <div className="checkout-trust-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Compra garantizada</span>
                  </div>
                </div>
              </form>
            )}

            {/* ── PASO 2: Formulario de tarjeta (SDK Clip) ──────────────── */}
            {step === 2 && (
              <div className="checkout-page__form">
                <div className="checkout-form-section">
                  <h2 className="checkout-form-section__title">
                    <span className="checkout-form-section__num">03</span>
                    Datos de tu tarjeta
                  </h2>

                  <div className="checkout-clip-badge">
                    <IconShield />
                    <span>Formulario seguro — tus datos van directo a Clip, nunca los vemos nosotros</span>
                  </div>

                  {/* Aquí monta el SDK de Clip el formulario de tarjeta */}
                  <div id="clip-card-element" className="checkout-clip-element">
                    {!clipReady && (
                      <div className="checkout-clip-loading">
                        <span className="checkout-spinner" />
                        <span>Cargando formulario de pago...</span>
                      </div>
                    )}
                  </div>
                </div>

                {error && (
                  <div className="checkout-page__error">
                    <span>⚠</span>
                    <span>{error}</span>
                  </div>
                )}

                <div className="checkout-trust-row">
                  <div className="checkout-trust-item">
                    <IconShield />
                    <span>Cifrado SSL 256-bit</span>
                  </div>
                  <div className="checkout-trust-item">
                    <IconVisa />
                  </div>
                  <div className="checkout-trust-item">
                    <IconMastercard />
                  </div>
                  <div className="checkout-trust-item">
                    <IconAmex />
                  </div>
                </div>

                <button
                  className="checkout-back-btn"
                  onClick={() => { setStep(1); setError(''); }}
                  type="button"
                >
                  ← Volver a mis datos
                </button>
              </div>
            )}
          </div>

          {/* ── DERECHA: Resumen del pedido ───────────────────────────────── */}
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
                  <span>${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</span>
                </div>
                <div className="checkout-summary-line">
                  <span>Envío</span>
                  <span className="lime-text">Gratis</span>
                </div>
              </div>

              <div className="checkout-summary-divider" />

              <div className="checkout-page__total">
                <span>Total</span>
                <span className="lime-text">
                  ${cartTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                </span>
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
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};