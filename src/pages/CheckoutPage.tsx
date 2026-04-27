import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { createOrder } from '../lib/queries';
import { getImageUrl } from '../lib/supabase';
import './CheckoutPage.css';

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

const ClipLogo = () => (
  <svg viewBox="0 0 80 28" width="56" height="20" aria-label="Clip">
    <rect width="80" height="28" rx="5" fill="#FC4C02" />
    <text x="10" y="20" fill="white" fontSize="14" fontWeight="bold" fontFamily="Arial, sans-serif" letterSpacing="1">clip</text>
  </svg>
);

declare global {
  interface Window {
    ClipSDK: any;
  }
}

export const CheckoutPage: React.FC = () => {
  const { items, total, clearCart } = useCartStore();
  const cartTotal = total();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Form state
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    reference: 'Casa'
  });

  // Clip SDK States
  const [clipLoaded, setClipLoaded] = useState(false);
  const [clipInstance, setClipInstance] = useState<any>(null);
  const [cardElement, setCardElement] = useState<any>(null);

  React.useEffect(() => {
    const initClip = () => {
      if (window.ClipSDK && !clipInstance) {
        const clip = new window.ClipSDK('3f2d18b8-2ff4-453e-a243-b078daa507e2');
        setClipInstance(clip);
        setClipLoaded(true);
      }
    };

    const timer = setInterval(() => {
      if (window.ClipSDK) {
        initClip();
        clearInterval(timer);
      }
    }, 500);
    
    return () => clearInterval(timer);
  }, [clipInstance]);

  React.useEffect(() => {
    if (clipLoaded && clipInstance && !cardElement) {
      const card = clipInstance.element.create('Card', {
        theme: 'light',
        style: {
          base: {
            color: '#ffffff',
            fontFamily: 'Catamaran, sans-serif',
            fontSize: '16px',
            '::placeholder': { color: '#666666' },
          },
        },
      });
      card.mount('clip-card-container');
      setCardElement(card);
    }
  }, [clipLoaded, clipInstance, cardElement]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handlePagar = async () => {
    if (!form.name || !form.email || !form.address || !form.city) {
      setError('Por favor completa los campos de envío antes de pagar.');
      return;
    }

    if (!clipInstance || !cardElement) {
      setError('El sistema de pagos no ha terminado de cargar. Por favor espera un momento.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. Generar Token de Clip PRIMERO para asegurar que el pago puede proceder
      const result = await cardElement.cardToken();
      
      if (result.error) {
        throw new Error(result.error.message || 'Error al procesar la tarjeta');
      }

      // 2. Realizar el cargo en el backend
      const chargeRes = await fetch('/api/charge-clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: result.token,
          amount: cartTotal,
          description: `Divina Store — Compra de ${form.name}`,
          customer: {
            name: form.name,
            email: form.email,
            phone: form.phone
          }
        }),
      });

      const chargeData = await chargeRes.json();
      
      if (!chargeRes.ok) {
        throw new Error(chargeData.error || 'El pago fue rechazado por el banco.');
      }

      // 3. Crear orden en Supabase CON toda la info y la métrica de Clip
      const order = await createOrder({
        customer_name: form.name,
        customer_email: form.email,
        customer_phone: form.phone,
        customer_address: form.address,
        customer_city: form.city,
        customer_state: form.state,
        customer_zip: form.zip,
        customer_reference: form.reference,
        items,
        total: cartTotal,
        status: 'paid',
        payment_info: chargeData // Guardamos toda la respuesta de Clip
      });

      if (!order) {
        console.error('Error al guardar orden, pero el pago se realizó:', chargeData);
        // Podríamos redirigir igual o mostrar un aviso
      }

      // 4. Éxito
      clearCart();
      navigate(`/pago-exitoso?order=${order?.id || 'new'}`);

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
            <span>Pago 100% seguro</span>
          </div>
        </div>

        <div className="checkout-page__grid">

          {/* IZQUIERDA — Datos y Pago */}
          <div className="checkout-page__left">

            {/* Datos de Envío */}
            <div className="checkout-form-section">
              <h2 className="checkout-form-section__title">
                <span className="checkout-form-section__num">01</span>
                Datos de Envío
              </h2>
              
              <div className="checkout-grid-fields">
                <div className="checkout-field">
                  <label>Nombre Completo *</label>
                  <input type="text" name="name" value={form.name} onChange={handleInputChange} className="input-dark" placeholder="Ej. Ana García" required />
                </div>
                <div className="checkout-field">
                  <label>Correo Electrónico *</label>
                  <input type="email" name="email" value={form.email} onChange={handleInputChange} className="input-dark" placeholder="ana@ejemplo.com" required />
                </div>
                <div className="checkout-field">
                  <label>Teléfono *</label>
                  <input type="tel" name="phone" value={form.phone} onChange={handleInputChange} className="input-dark" placeholder="55 1234 5678" required />
                </div>
                <div className="checkout-field full">
                  <label>Calle y Número *</label>
                  <input type="text" name="address" value={form.address} onChange={handleInputChange} className="input-dark" placeholder="Av. Siempre Viva 123" required />
                </div>
                <div className="checkout-field">
                  <label>Ciudad *</label>
                  <input type="text" name="city" value={form.city} onChange={handleInputChange} className="input-dark" placeholder="Ej. CDMX" required />
                </div>
                <div className="checkout-field">
                  <label>Estado</label>
                  <input type="text" name="state" value={form.state} onChange={handleInputChange} className="input-dark" placeholder="Ej. CDMX" />
                </div>
                <div className="checkout-field">
                  <label>Código Postal</label>
                  <input type="text" name="zip" value={form.zip} onChange={handleInputChange} className="input-dark" placeholder="00000" />
                </div>
                <div className="checkout-field">
                  <label>Referencia (Tipo de lugar)</label>
                  <select name="reference" value={form.reference} onChange={handleInputChange} className="input-dark">
                    <option value="Casa">Casa</option>
                    <option value="Oficina">Oficina</option>
                    <option value="Local Comercial">Local Comercial</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="checkout-form-section">
              <h2 className="checkout-form-section__title">
                <span className="checkout-form-section__num">02</span>
                Información de Pago
              </h2>

              <div className="checkout-clip-badge">
                <IconShield />
                <span>
                  Tus datos están protegidos por el cifrado de seguridad de <strong>Clip México</strong>.
                </span>
              </div>

              {!clipLoaded && (
                <div className="checkout-clip-loading">
                  <div className="checkout-spinner" />
                  Cargando pasarela...
                </div>
              )}

              <div 
                id="clip-card-container" 
                className="checkout-clip-element"
                style={{ display: clipLoaded ? 'block' : 'none' }}
              >
                {/* SDK de Clip */}
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
              className={`checkout-submit-btn-new ${loading ? 'loading' : ''}`}
              disabled={loading}
              style={{ padding: 0, overflow: 'hidden', border: 'none', background: 'transparent' }}
            >
              {loading ? (
                <div className="btn-loading-state">
                  <span className="checkout-spinner" />
                  Procesando...
                </div>
              ) : (
                <div className="clip-btn-wrapper">
                  <img 
                    src="https://prod-ses-email-templates-assets.s3.amazonaws.com/payment/pay-with-clip/button-logos/es/estandar/svg/blanco_neutral_con_sombra.svg" 
                    alt="Paga con Clip"
                    style={{ width: '100%', display: 'block' }}
                  />
                </div>
              )}
            </button>

            <div className="checkout-trust-row">
              <div className="checkout-trust-item">
                <IconShield />
                <span>SSL Encrypted</span>
              </div>
              <div className="checkout-trust-item">
                <img src="https://clip.mx/favicon.ico" width="16" height="16" alt="Clip" />
                <span>Partner Clip</span>
              </div>
            </div>
          </div>

          {/* DERECHA — Resumen */}
          <div className="checkout-page__summary">
            <div className="checkout-summary-card">
              <h2 className="checkout-summary-card__title">Resumen de Compra</h2>

              <div className="checkout-page__items">
                {items.map(item => (
                  <div key={item.product.id} className="checkout-page__item">
                    <div className="checkout-page__item-img">
                      {item.product.image_url
                        ? <img src={getImageUrl(item.product.image_url)} alt={item.product.name} />
                        : <span>🌿</span>}
                      <span className="checkout-page__item-qty-badge">{item.quantity}</span>
                    </div>
                    <div className="checkout-page__item-info">
                      <p className="checkout-page__item-name">{item.product.name}</p>
                    </div>
                    <p className="checkout-page__item-price">
                      ${(item.product.price * item.quantity).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                ))}
              </div>

              <div className="checkout-summary-divider" />

              <div className="checkout-page__total">
                <span>Total a Pagar</span>
                <span className="lime-text">
                  ${cartTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                </span>
              </div>

              <div className="checkout-summary-cards-row">
                <img src="https://clip.mx/static/images/metodos-pago/visa.svg" alt="Visa" height="20" />
                <img src="https://clip.mx/static/images/metodos-pago/mastercard.svg" alt="Mastercard" height="20" />
                <img src="https://clip.mx/static/images/metodos-pago/amex.svg" alt="Amex" height="20" />
                <img src="https://clip.mx/static/images/metodos-pago/carnet.svg" alt="Carnet" height="20" />
              </div>

              <div className="checkout-summary-clip-note">
                <img src="https://clip.mx/static/images/logos/logo-clip.svg" alt="Clip" height="16" />
                <span>Checkout seguro impulsado por Clip México</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
