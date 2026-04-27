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
  
  // Clip SDK States
  const [clipLoaded, setClipLoaded] = useState(false);
  const [clipInstance, setClipInstance] = useState<any>(null);
  const [cardElement, setCardElement] = useState<any>(null);

  React.useEffect(() => {
    const initClip = () => {
      if (window.ClipSDK && !clipInstance) {
        // Usamos la API KEY de Clip (pública)
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
    }
  }, [clipLoaded, clipInstance, cardElement]);

  const handlePagar = async () => {
    if (!clipInstance || !cardElement) {
      setError('El sistema de pagos no ha terminado de cargar. Por favor espera un momento.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. Crear orden en Supabase
      const order = await createOrder({
        customer_name: 'Cliente Online',
        customer_email: 'pago@pendiente.com',
        customer_phone: '',
        customer_address: 'Entrega por coordinar',
        items,
        total: cartTotal,
        status: 'pending',
      });

      if (!order) throw new Error('No se pudo generar la orden en el sistema.');

      // 2. Generar Token de Clip
      const result = await clipInstance.createToken(cardElement);
      
      if (result.error) {
        throw new Error(result.error.message || 'Error al procesar la tarjeta');
      }

      // 3. Enviar token al backend para realizar el cargo real
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
      
      if (!res.ok) {
        throw new Error(data.error || 'El pago fue rechazado o hubo un error.');
      }

      // 4. Éxito
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
            <span>Pago 100% seguro</span>
          </div>
        </div>

        <div className="checkout-page__grid">

          {/* IZQUIERDA — Info de pago */}
          <div className="checkout-page__left">

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
                <span className="checkout-form-section__num">01</span>
                Información de Pago
              </h2>

              <div className="checkout-clip-badge">
                <IconShield />
                <span>
                  Tus datos están protegidos. El formulario de pago es proporcionado de forma segura por <strong>Clip México</strong>.
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
              >
                {/* Aquí el SDK de Clip montará el formulario */}
              </div>
            </div>

            <div className="checkout-clip-info">
              <div className="checkout-clip-info__item">
                <IconShield />
                <span>Pago procesado con tecnología de cifrado SSL para tu seguridad.</span>
              </div>
              <div className="checkout-clip-info__item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <path d="M2 10h20" />
                </svg>
                <span>Aceptamos todas las tarjetas de crédito y débito Visa, Mastercard y Amex.</span>
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
            >
              {loading ? (
                <span className="checkout-submit-btn__loading">
                  <span className="checkout-spinner" />
                  Preparando pago...
                </span>
              ) : (
                <span className="checkout-submit-btn__content">
                  <IconLock />
                  Pagar con Clip
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
          </div>

          {/* DERECHA — Resumen del pedido */}
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
