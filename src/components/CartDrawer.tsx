import React, { useState, useCallback } from 'react';
import { useCartStore } from '../store/cartStore';
import { Link, useNavigate } from 'react-router-dom';
import { getImageUrl } from '../lib/supabase';
import './CartDrawer.css';

type CheckoutState = 'idle' | 'loading' | 'error';

export const CartDrawer: React.FC = () => {
  const {
    items,
    isOpen,
    openCart,
    closeCart,
    removeItem,
    updateQty,
    total
  } = useCartStore();
  const navigate = useNavigate();

  const [checkoutState, setCheckoutState] = useState<CheckoutState>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const cartTotal = total();

  const handleCheckout = useCallback(() => {
    if (!items.length) return;
    closeCart();
    navigate('/checkout');
  }, [items, closeCart, navigate]);

  return (
    <>
      {/* 👇 Overlay */}
      {isOpen && <div className="cart-overlay" onClick={closeCart} />}

      {/* 👇 Drawer */}
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
            ✕
          </button>
        </div>

        {/* Items */}
        <div className="cart-drawer__items">
          {items.length === 0 ? (
            <div className="cart-drawer__empty">
              <p>Tu carrito está vacío</p>

              <Link
                to="/catalogo"
                onClick={closeCart}
                className="btn btn-lime"
              >
                Ver Productos
              </Link>
            </div>
          ) : (
            items.map(item => (
              <div key={`${item.product.id}-${item.variant}`} className="cart-item">

                {/* Imagen */}
                <div className="cart-item__img">
                  {item.product.image_url ? (
                    <img
                      src={getImageUrl(item.product.image_url)}
                      alt={item.product.name}
                    />
                  ) : (
                    <div className="cart-item__placeholder">📦</div>
                  )}
                </div>

                {/* Info */}
                <div className="cart-item__info">
                  <p>{item.product.name}</p>
                  <p>
                    ${(item.product.price * item.quantity).toFixed(2)} MXN
                  </p>
                </div>

                {/* Acciones */}
                <div className="cart-item__actions">
                  <button
                    onClick={() =>
                      updateQty(item.product.id, Math.max(1, item.quantity - 1))
                    }
                  >
                    −
                  </button>

                  <span>{item.quantity}</span>

                  <button
                    onClick={() =>
                      updateQty(item.product.id, item.quantity + 1)
                    }
                  >
                    +
                  </button>

                  <button
                    onClick={() => removeItem(item.product.id)}
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="cart-drawer__footer">
            <p>
              Total: ${cartTotal.toFixed(2)} MXN
            </p>

            {errorMsg && <p style={{ color: 'red' }}>{errorMsg}</p>}

            <button
              onClick={handleCheckout}
              disabled={checkoutState === 'loading'}
              className="btn btn-lime"
            >
              {checkoutState === 'loading'
                ? 'Procesando...'
                : 'Finalizar Compra'}
            </button>

            <button onClick={closeCart}>
              Seguir comprando
            </button>
          </div>
        )}
      </aside>
    </>
  );
};
