import React, { useState, useCallback } from 'react';
import { useCartStore } from '../store/cartStore';
import { Link } from 'react-router-dom';
import { getImageUrl } from '../lib/supabase';
import './CartDrawer.css';

type CheckoutState = 'idle' | 'loading' | 'error';

export const CartDrawer: React.FC = () => {
  const { items, isOpen, closeCart, removeItem, updateQty, total } = useCartStore();
  const [checkoutState, setCheckoutState] = useState<CheckoutState>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const cartTotal = total();

  const handleCheckout = useCallback(async () => {
    if (!items.length || checkoutState === 'loading') return;

    setCheckoutState('loading');
    setErrorMsg('');

    try {
      const res = await fetch('/api/create-clip-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          total: cartTotal,
          // Si tienes contexto de usuario autenticado, inyéctalo aquí
          // customer: { name, email, phone }
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.error ?? 'Error al crear el pago');
      }

      const { payment_request_url } = await res.json();

      if (!payment_request_url) {
        throw new Error('No se recibió URL de pago');
      }

      // Redirige a Clip — fuera del SPA, no usar navigate()
      window.location.href = payment_request_url;
    } catch (err: any) {
      console.error('[Checkout error]', err);
      setCheckoutState('error');
      setErrorMsg(err?.message ?? 'Ocurrió un error. Intenta de nuevo.');
    }
  }, [items, cartTotal, checkoutState]);

  return (
    <>
      {isOpen && <div className="cart-overlay" onClick={closeCart} />}

      <aside
        className={`cart-drawer ${isOpen ? 'cart-drawer--open' : ''}`}
        aria-label="Carrito de compras"
      >
        {/* Header */}
        <div className="cart-drawer__header">
          <div>
            <h2 className="cart-drawer__title">Tu Carrito</h2>
            <p className="cart-drawer__subtitle">
              {items.length} producto{items.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            className="cart-drawer__close"
            onClick={closeCart}
            aria-label="Cerrar carrito"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Items */}
        <div className="cart-drawer__items">
          {items.length === 0 ? (
            <div className="cart-drawer__empty">
              <div className="cart-drawer__empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
              </div>
              <p>Tu carrito está vacío</p>
              <Link to="/catalogo" onClick={closeCart} className="btn btn-lime" style={{ marginTop: 16 }}>
                Ver Productos
              </Link>
            </div>
          ) : (
            items.map(item => (
              <div key={`${item.product.id}-${item.variant}`} className="cart-item">
                <div className="cart-item__img">
                  {item.product.image_url ? (
                    <img
                      src={getImageUrl(item.product.image_url, { width: 160, quality: 75 })}
                      alt={item.product.name}
                      loading="lazy"
                    />
                  ) : (
                    <div className="cart-item__placeholder">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                    </div>
                  )}
                </div>

                <div className="cart-item__info">
                  <p className="cart-item__brand">{item.product.brand}</p>
                  <p className="cart-item__name">{item.product.name}</p>
                  {item.variant && <p className="cart-item__variant">{item.variant}</p>}
                  <p className="cart-item__price">
                    ${(item.product.price * item.quantity).toLocaleString('es-MX', {
                      minimumFractionDigits: 2,
                    })} MXN
                  </p>
                </div>

                <div className="cart-item__actions">
                  <div className="cart-item__qty">
                    <button
                      onClick={() => updateQty(item.product.id, item.quantity - 1)}
                      aria-label="Reducir cantidad"
                    >
                      −
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      onClick={() => updateQty(item.product.id, item.quantity + 1)}
                      aria-label="Aumentar cantidad"
                    >
                      +
                    </button>
                  </div>
                  <button
                    className="cart-item__remove"
                    onClick={() => removeItem(item.product.id)}
                    aria-label="Eliminar producto"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="cart-drawer__footer">
            <div className="cart-drawer__total">
              <span>Total</span>
              <span className="cart-drawer__total-amount">
                ${cartTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
              </span>
            </div>

            <p className="cart-drawer__note">Envío calculado al finalizar</p>

            {errorMsg && (
              <div className="cart-drawer__error" role="alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {errorMsg}
              </div>
            )}

            <button
              onClick={handleCheckout}
              disabled={checkoutState === 'loading'}
              className="btn btn-lime cart-drawer__checkout-btn"
              aria-busy={checkoutState === 'loading'}
            >
              {checkoutState === 'loading' ? (
                <>
                  <span className="cart-drawer__spinner" aria-hidden="true" />
                  Redirigiendo a Clip...
                </>
              ) : (
                'Pagar con Clip →'
              )}
            </button>

            <button onClick={closeCart} className="btn btn-outline cart-drawer__continue-btn">
              Seguir comprando
            </button>
          </div>
        )}
      </aside>
    </>
  );
};
