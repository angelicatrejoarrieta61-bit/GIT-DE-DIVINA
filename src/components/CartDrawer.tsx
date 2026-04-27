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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2
    }).format(amount);
  };

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
              <span style={{ fontSize: 48 }}>🛍️</span>
              <p style={{ fontWeight: 600, color: '#000' }}>Tu carrito está vacío</p>
              <Link to="/catalogo" onClick={closeCart} className="btn btn-lime" style={{ background: '#000', color: '#fff' }}>
                Ver Productos
              </Link>
            </div>
          ) : (
            items.map(item => (
              <div key={`${item.product.id}-${item.variant}`} className="cart-item">
                <div className="cart-item__img">
                  {item.product.image_url ? (
                    <img src={getImageUrl(item.product.image_url)} alt={item.product.name} />
                  ) : (
                    <div className="cart-item__placeholder">📦</div>
                  )}
                </div>

                <div className="cart-item__info">
                  <span className="cart-item__brand">{item.product.brand || 'DIVINA'}</span>
                  <h3 className="cart-item__name">{item.product.name}</h3>
                  <p className="cart-item__price">{formatCurrency(item.product.price * item.quantity)}</p>
                </div>

                <div className="cart-item__controls">
                  <div className="cart-item__qty-box">
                    <button onClick={() => updateQty(item.product.id, Math.max(1, item.quantity - 1))}>−</button>
                    <span className="cart-item__qty-num">{item.quantity}</span>
                    <button onClick={() => updateQty(item.product.id, item.quantity + 1)}>+</button>
                  </div>
                  <button className="cart-item__delete" onClick={() => removeItem(item.product.id)} title="Eliminar">
                    🗑️
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="cart-drawer__footer">
            <div className="cart-drawer__total-row">
              <span>Total:</span>
              <span>{formatCurrency(cartTotal)}</span>
            </div>
            
            <button 
              onClick={handleCheckout} 
              disabled={checkoutState === 'loading'} 
              className="btn-checkout-main"
            >
              {checkoutState === 'loading' ? 'PROCESANDO...' : 'FINALIZAR COMPRA'}
            </button>
            
            <button onClick={closeCart} className="btn-continue-shopping">
              Seguir comprando
            </button>
          </div>
        )}
      </aside>
    </>
  );
};
