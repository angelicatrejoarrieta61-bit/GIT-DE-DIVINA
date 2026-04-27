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

const IconClip = () => (
  <svg viewBox="0 0 60 24" width="50" height="20">
    <rect width="60" height="24" rx="4" fill="#FC4C02" />
    <text x="8" y="17" fill="white" fontSize="12" fontWeight="bold" fontFamily="Arial">clip</text>
  </svg>
);

export const CheckoutPage: React.FC = () => {
  const { items, total, clearCart } = useCartStore();
  const cartTotal = total();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
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

      const res = await fetch('/api/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: cartTotal,
          description: `Divina Store MX — Orden ${order.id}`,
          orderId: order.id,
          redirect_url: `${window.location.origin}/pago-exitoso?order=${order.id}`,
          error_url: `${window.location.origin}/pago-error?order=${order.id}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear el pago. Intenta de nuevo.');

      clearCart();
      window.location.href = data.payment_url;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
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

  const subtotal = cartTotal;
  const shipping = 0;

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

        {/* Steps */}
        <div className="checkout-steps">
          <div className="checkout-step checkout-step--active">
            <span className="checkout-step__num">1</span>
            <span className="checkout-step__label">Datos</span>
          </div>
          <div className="checkout-step__line" />
          <div className="checkout-step">
            <span className="checkout-step__num">2</span>
            <span className="checkout-step__label">Pago</span>
          </div>
          <div className="checkout-step__line" />
          <div className="checkout-step">
            <span className="checkout-step__num">3</span>
            <span className="checkout-step__label">Confirmacion</span>
          </div>
        </div>

        <div className="checkout-page__grid">

          {/* LEFT — Form */}
          <div className="checkout-page__left">

            {/* Payment methods accepted */}
            <div className="checkout-accepted-cards">
              <span className="checkout-accepted-cards__label">Metodos de pago aceptados</span>
              <div className="checkout-accepted-cards__logos">
                <IconVisa />
                <IconMastercard />
                <IconAmex />
                <div className="checkout-accepted-cards__clip">
                  <span>Procesado por</span>
                  <IconClip />
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="checkout-page__form">
              <div className="checkout-form-section">
                <h2 className="checkout-form-section__title">
                  <span className="checkout-form-section__num">01</span>
                  Informacion de contacto
                </h2>

                <div className="checkout-page__field-row">
                  <div className="checkout-page__field">
                    <label htmlFor="name">Nombre completo <span className="required">*</span></label>
                    <input
                      id="name" name="name" type="text"
                      className="input-dark"
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Angelica Trejo"
                      required
                      autoComplete="name"
                    />
                  </div>
                  <div className="checkout-page__field">
                    <label htmlFor="phone">Telefono <span className="required">*</span></label>
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
                  <label htmlFor="email">Correo electronico <span className="required">*</span></label>
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
                  Direccion de envio
                </h2>
                <div className="checkout-page__field">
                  <label htmlFor="address">Direccion completa</label>
                  <textarea
                    id="address" name="address"
                    className="input-dark"
                    value={form.address}
                    onChange={handleChange}
                    placeholder="Calle, numero, colonia, ciudad, CP"
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
                    Procesando pago...
                  </span>
                ) : (
                  <span className="checkout-submit-btn__content">
                    <IconLock />
                    Ir a pagar con Clip
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
                  <span>${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</span>
                </div>
                <div className="checkout-summary-line">
                  <span>Envio</span>
                  <span className="lime-text">{shipping === 0 ? 'Gratis' : `$${shipping} MXN`}</span>
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
                <IconClip />
                <span>Pagos procesados de forma segura por Clip Mexico</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};