import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { createOrder } from '../lib/queries';
import { getImageUrl } from '../lib/supabase';
import './CheckoutPage.css';

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
      // 1. Save order in Supabase
      const order = await createOrder({
        customer_name: form.name,
        customer_email: form.email,
        customer_phone: form.phone,
        customer_address: form.address,
        items,
        total: cartTotal,
        status: 'pending',
      });

      if (!order) throw new Error('No se pudo crear la orden');

      // 2. Call Vercel API → Clip
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
      if (!res.ok) throw new Error(data.error || 'Error al crear el pago');

      // 3. Redirect to Clip payment page
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
      <div style={{ paddingTop: 'calc(var(--nav-h) + 60px)', textAlign: 'center' }} className="page-width section">
        <h2>Tu carrito está vacío</h2>
        <button onClick={() => navigate('/catalogo')} className="btn btn-lime" style={{ marginTop: 20 }}>
          Ir al catálogo
        </button>
      </div>
    );
  }

  return (
    <div className="checkout-page" style={{ paddingTop: 'var(--nav-h)' }}>
      <div className="page-width section">
        <h1 className="checkout-page__title">Finalizar <span className="lime-text">Compra</span></h1>

        <div className="checkout-page__grid">
          {/* Form */}
          <form onSubmit={handleSubmit} className="checkout-page__form">
            <h2 className="checkout-page__section-title">Tus datos</h2>

            <div className="checkout-page__field">
              <label htmlFor="name">Nombre completo *</label>
              <input id="name" name="name" type="text" className="input-dark" value={form.name} onChange={handleChange} placeholder="Angélica Trejo" required />
            </div>

            <div className="checkout-page__field">
              <label htmlFor="email">Correo electrónico *</label>
              <input id="email" name="email" type="email" className="input-dark" value={form.email} onChange={handleChange} placeholder="tu@email.com" required />
            </div>

            <div className="checkout-page__field">
              <label htmlFor="phone">Teléfono *</label>
              <input id="phone" name="phone" type="tel" className="input-dark" value={form.phone} onChange={handleChange} placeholder="55 1234 5678" required />
            </div>

            <div className="checkout-page__field">
              <label htmlFor="address">Dirección de envío</label>
              <textarea id="address" name="address" className="input-dark" value={form.address} onChange={handleChange} placeholder="Calle, colonia, ciudad, CP" rows={3} style={{ resize: 'vertical' }} />
            </div>

            {error && <p className="checkout-page__error">{error}</p>}

            <button type="submit" className="btn btn-lime checkout-page__submit-btn" disabled={loading}>
              {loading ? '⏳ Procesando...' : '💳 Pagar con Clip →'}
            </button>

            <p className="checkout-page__note muted-text">
              Serás redirigido al sitio seguro de Clip para completar tu pago con tarjeta de crédito o débito.
            </p>
          </form>

          {/* Order summary */}
          <div className="checkout-page__summary">
            <h2 className="checkout-page__section-title">Tu pedido</h2>
            <div className="checkout-page__items">
              {items.map(item => (
                <div key={item.product.id} className="checkout-page__item">
                  <div className="checkout-page__item-img">
                    {item.product.image_url
                      ? <img src={getImageUrl(item.product.image_url)} alt={item.product.name} />
                      : <span>🌿</span>}
                  </div>
                  <div className="checkout-page__item-info">
                    <p className="checkout-page__item-name">{item.product.name}</p>
                    <p className="checkout-page__item-qty muted-text">× {item.quantity}</p>
                  </div>
                  <p className="checkout-page__item-price">
                    ${(item.product.price * item.quantity).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              ))}
            </div>
            <div className="checkout-page__total">
              <span>Total</span>
              <span className="lime-text">${cartTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
